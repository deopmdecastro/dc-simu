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
console.log(`${checks} verificações de brilho passaram.`)
