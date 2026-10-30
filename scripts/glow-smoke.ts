import assert from 'node:assert/strict'
import * as THREE from 'three'
import { glowSettings, lightColors, resolveLightLook } from '../src/catalog/lightLook'
import type { LightZoneDef } from '../src/catalog/types'
import { GLOW_HALO_FLAG, GLOW_SPECS, blinkFactor, boundsWithoutGlow, glowFrame, stepGlow } from '../src/three/glow'

let checks = 0
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); checks += 1 }

// subida e descida suaves, sem saltos nem ultrapassar 0–1
let level = 0
const rising: number[] = []
for (let i = 0; i < 60; i += 1) { level = stepGlow(level, true, 1 / 60, 0.09, 0.28); rising.push(level) }
ok(rising.every((v, i) => i === 0 || v >= rising[i - 1]), 'subida monótona')
ok(rising[0] > 0 && rising[0] < 0.6, 'não liga instantaneamente')
ok(level === 1, 'acaba exatamente em 1')
for (let i = 0; i < 90; i += 1) level = stepGlow(level, false, 1 / 60, 0.09, 0.28)
ok(level === 0, 'acaba exatamente em 0')
const slowFall = stepGlow(1, false, 1 / 60, 0.09, 0.28)
const fastFall = stepGlow(1, false, 1 / 60, 0.09, 0.05)
ok(slowFall > fastFall, 'lâmpada demora mais a apagar do que um LED')
ok(stepGlow(0.5, true, Number.NaN) <= 1, 'dt inválido não rebenta')

// pisca
ok(blinkFactor(0.1, false) === 1, 'sem pisca = 1')
const samples = Array.from({ length: 200 }, (_, i) => blinkFactor(i * 0.01, true))
ok(samples.includes(1) && samples.includes(0.08), 'pisca alterna entre aceso e quase apagado')

// quadro de brilho
const lamp = GLOW_SPECS.lamp
const off = glowFrame(lamp, 0, 1, false)
ok(off.haloOpacity === 0 && off.emissive === 0 && off.light === 0, 'apagado não brilha nem ilumina')
const on = glowFrame(lamp, 1, 1, false)
ok(on.haloOpacity > 0.8 && on.emissive >= 2 && on.light > 0, 'aceso: halo, emissão e luz')
ok(glowFrame(GLOW_SPECS.led, 1, 1, false).light === 0, 'LED pequeno não projeta luz dinâmica')
ok(glowFrame(lamp, 1, 0.1, true).haloOpacity > glowFrame(lamp, 1, 0.6, true).haloOpacity * 5, 'pisca altera o halo')
ok(glowFrame(lamp, 0.5, 1, false).emissive < on.emissive, 'meio brilho < brilho total')
// o halo não entra na caixa envolvente e é reposto no sítio
const root = new THREE.Group()
root.add(new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10)))
const halo = new THREE.Sprite(new THREE.SpriteMaterial())
halo.userData[GLOW_HALO_FLAG] = true
halo.scale.set(80, 80, 1)
root.add(halo)
root.updateMatrixWorld(true)
ok(new THREE.Box3().setFromObject(root, true).getSize(new THREE.Vector3()).x > 50, 'sem filtro o halo inflaciona a caixa')
ok(boundsWithoutGlow(root, true).getSize(new THREE.Vector3()).x <= 10.001, 'com filtro a caixa é só a do modelo')
ok(halo.parent === root, 'halo reposto após o cálculo')
// --- uma luz, várias cores
const lamp1: LightZoneDef = {
  id: 'l1', name: 'Estado', partId: 'p', color: '#ffffff', intensity: 2, kind: 'lamp',
  colorRules: [
    { id: 'r1', when: { var: 'error', op: 'eq', value: true }, color: '#ef4444', blink: true },
    { id: 'r2', when: { var: 'run', op: 'eq', value: true }, color: '#22c55e' },
    { id: 'r3', when: { var: 'mode', op: 'eq', value: 'stop' }, color: '#f59e0b' },
  ],
}
ok(!resolveLightLook(lamp1, undefined, {}).on, 'sem regra verdadeira fica apagada')
const green = resolveLightLook(lamp1, undefined, { run: true })
ok(green.on && green.color === '#22c55e' && !green.blink, 'regra RUN: verde fixo')
const red = resolveLightLook(lamp1, undefined, { run: true, error: true })
ok(red.color === '#ef4444' && red.blink && red.rule === 'r1', 'a 1.ª regra verdadeira ganha e pode piscar')
ok(resolveLightLook(lamp1, undefined, { mode: 'stop' }).color === '#f59e0b', 'regra com valor de texto')
const byState = resolveLightLook(lamp1, { on: true, color: '#3b82f6', intensity: 4 }, { run: true })
ok(byState.color === '#3b82f6' && byState.intensity === 4, 'a cor do estado tem prioridade sobre as regras')
ok(resolveLightLook(lamp1, { on: true, color: 'azul' }, {}).color === '#ffffff', 'cor de estado inválida usa a cor base')
ok(resolveLightLook({ ...lamp1, colorRules: [{ id: 'x', when: { var: 'run' }, color: 'nope' }] }, undefined, { run: true }).color === '#ffffff', 'regra com cor inválida usa a cor base')
const simple: LightZoneDef = { id: 'l2', name: 'S', partId: 'p', color: '#22c55e', intensity: 2, when: { var: 'hold', op: 'eq', value: true }, blink: true }
ok(resolveLightLook(simple, undefined, { hold: true }).blink, 'condição simples mantém o pisca')
const pal: LightZoneDef = { ...simple, userPalette: ['#ef4444', '#3b82f6'] }
ok(resolveLightLook(pal, undefined, { hold: true, 'color.l2': '#3b82f6' }).color === '#3b82f6', 'cor escolhida pelo utilizador')
ok(resolveLightLook(pal, undefined, { hold: true, 'color.l2': '#000001' }).color === '#22c55e', 'cor fora da paleta é ignorada')
ok(lightColors(lamp1).length === 4, 'lista as 4 cores distintas da luz')

// --- brilho configurável
const defaults = glowSettings({ kind: 'led' })
ok(defaults.enabled && defaults.size === 1 && defaults.riseMs < glowSettings({ kind: 'lamp' }).riseMs, 'predefinições: LED mais rápido que lâmpada')
const custom = glowSettings({ kind: 'lamp', glow: { enabled: false, size: 99, riseMs: -5, fallMs: Number.NaN } })
ok(!custom.enabled && custom.size === 3 && custom.riseMs === 0 && custom.fallMs === 280, 'valores fora de limites são corrigidos')

// --- posicionamento do halo colado à lente de vidro (mesmo com pai deslocado na cena)
import { StateAnimator } from '../src/catalog/stateAnimator'
import { defaultDefinition } from '../src/catalog/definition'
if (typeof globalThis.document === 'undefined') {
  ;(globalThis as unknown as { document: unknown }).document = {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({
        createRadialGradient: () => ({ addColorStop: () => {} }),
        fillStyle: '',
        fillRect: () => {},
      }),
    }),
  }
}
const lampRoot = new THREE.Group()
lampRoot.position.set(1.2, 1.7, 0.25) // simula pivô no painel antes do 1.º frame
const lensGeom = new THREE.CylinderGeometry(11, 11, 6, 16)
lensGeom.rotateX(Math.PI / 2)
const lensMesh = new THREE.Mesh(lensGeom, new THREE.MeshStandardMaterial({ color: '#22c55e', transparent: true, opacity: 0.7 }))
lensMesh.name = 'lens'
lensMesh.position.set(0, 0, 22) // lente frontal a z = +22 mm no espaço local do sinalizador
lampRoot.add(lensMesh)
const lampDef = defaultDefinition()
lampDef.parts = [{ id: 'lens', name: 'Lente', kind: 'box', size: [22, 22, 6], parentId: null, position: [0, 0, 22], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true, materialId: null }]
lampDef.lights = [{ id: 'main', name: 'Lente', partId: 'lens', color: '#22c55e', intensity: 2.5, kind: 'lamp', when: { var: 'lit', op: 'eq', value: true } }]
lampDef.variables = [{ id: 'lit', name: 'Aceso', type: 'bool', initial: true }]
const anim = new StateAnimator(lampDef, lampRoot)
anim.setVars({ lit: true })
anim.update(0.25)
const mountedHalo = lampRoot.children.find((ch) => ch.userData[GLOW_HALO_FLAG])
ok(Boolean(mountedHalo), 'halo montado na raiz do sinalizador sem inflacionar a malha da lente')
ok(Math.abs(mountedHalo!.position.x) < 1e-4 && Math.abs(mountedHalo!.position.y) < 1e-4, 'halo centrado exatamente no eixo da lente (imune ao pivô do painel)')
ok(mountedHalo!.position.z >= 25.0 && mountedHalo!.position.z <= 25.8, 'halo encostado à face frontal do vidro da lente (z = 22 + 3 + ~0.33 mm)')


// --- cores de luzes: vidro (lente) + brilho (luz emitida), paleta do utilizador e biblioteca
import { chosenGlass, glassFor } from '../src/catalog/lightLook'
import { BUILTIN_LIGHT_SWATCHES, swatchName } from '../src/catalog/lightColorLibrary'
{
  const hex = (c: THREE.Color) => '#' + c.getHexString()
  const root = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: '#383838' })
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 4), mat)
  mesh.name = 'lens2'
  root.add(mesh)
  const def = defaultDefinition()
  def.parts = [{ id: 'lens2', name: 'Lente', kind: 'box', size: [10, 10, 4], parentId: null, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true, materialId: null }]
  const zone: LightZoneDef = { id: 'z', name: 'Sinaleiro', partId: 'lens2', color: '#ff2a1a', glassColor: '#c72424', intensity: 2, kind: 'lamp', when: { var: 'lit', op: 'eq', value: true },
    userPalette: ['#ff2a1a', '#2bff6a', '#4d8dff'], glassColors: { '#2bff6a': '#1c9a46' }, tintMaterial: true }
  def.lights = [zone]
  def.variables = [{ id: 'lit', name: 'Aceso', type: 'bool', initial: false }]
  ok(chosenGlass(zone, {}) === '#c72424', 'vidro da cor base')
  ok(chosenGlass(zone, { 'color.z': '#2bff6a' }) === '#1c9a46', 'vidro da cor escolhida na paleta')
  ok(chosenGlass(zone, { 'color.z': '#4d8dff' }) === '#4d8dff', 'paleta antiga sem vidro: o vidro usa a cor do brilho')
  ok(chosenGlass(zone, { 'color.z': '#123456' }) === '#c72424', 'cor fora da paleta é ignorada')
  ok(chosenGlass({ ...zone, tintMaterial: false }, {}) === undefined, '«não pintar» mantém o material do modelo')
  ok(chosenGlass({ id: 'x', name: 'x', partId: 'p', color: '#22c55e', intensity: 1 }, {}) === undefined, 'zona sem vidro nem paleta não pinta')
  ok(glassFor(zone, '#2BFF6A') === '#1c9a46', 'vidro da paleta não depende de maiúsculas')
  const anim2 = new StateAnimator(def, root)
  anim2.setVars({ lit: false, 'color.z': '#2bff6a' })
  anim2.update(0.016)
  ok(hex(mat.color) === '#1c9a46' && hex(mat.emissive) === '#000000', 'apagada: lente com a cor do vidro, sem emissão')
  anim2.setVars({ lit: true, 'color.z': '#2bff6a' })
  anim2.update(0.3)
  const halo = root.children.find((ch) => ch.userData[GLOW_HALO_FLAG]) as THREE.Sprite | undefined
  ok(hex(mat.emissive) === '#2bff6a' && mat.emissiveIntensity >= 1.6, 'acesa: emite a cor do brilho')
  ok(!!halo && hex((halo.material as THREE.SpriteMaterial).color) === '#2bff6a' && halo.visible, 'halo com a cor do brilho')
  anim2.setVars({ lit: true, 'color.z': '#ff2a1a' })
  anim2.update(0.3)
  ok(hex(mat.color) === '#c72424' && hex(mat.emissive) === '#ff2a1a', 'trocar a cor no inspetor muda vidro e brilho')
  anim2.setVars({ lit: false, $test_dummy: 1, ['$test.z']: true })
  anim2.update(0.3)
  ok(hex(mat.emissive) === '#ff2a1a', '«Ver acesa» do editor acende a zona sem variáveis')
  anim2.dispose()
  ok(hex(mat.color) === '#383838' && !root.children.some((ch) => ch.userData[GLOW_HALO_FLAG]), 'dispose devolve a cor original e retira o halo')
  ok(BUILTIN_LIGHT_SWATCHES.every((item) => /^#[0-9a-f]{6}$/.test(item.glass) && /^#[0-9a-f]{6}$/.test(item.glow) && item.glass !== item.glow), 'biblioteca: pares vidro/brilho válidos e distintos')
  ok(swatchName('#2BFF6A') === 'Verde' && swatchName('#1c9a46') === undefined, 'biblioteca: nome pela cor do brilho')
}

console.log(`${checks} verificações de brilho passaram.`)
