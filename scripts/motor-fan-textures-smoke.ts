/**
 * Motor SEW DRN80: caixa de bornes real (placa, pernos M4, PE, bucim), pá de
 * três pás com rotação e biblioteca de texturas reais do editor de elementos.
 * Corre sem rede: os GLB e as texturas vêm de `public/`.
 */
import './node-env'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import * as THREE from 'three'
import { boundsMm, boxProjectUv, buildDefinitionObject, defaultDefinition, defaultMaterial, defaultPart, loadGlbAssets } from '../src/catalog/definition'
import { buildBuiltinDraft, upgradeBuiltinDraft } from '../src/admin/editor3d/builtinComponents'
import { applyLibraryTexture } from '../src/admin/editor3d/tabs1'
import { ComponentRig, spinRate } from '../src/catalog/componentRig'
import { REAL_TERMINALS } from '../src/electrical/realInterfaces'
import { MOTOR_BOARD, MOTOR_BOARD_TOP, MOTOR_BOX, MOTOR_NUT_TOP, MOTOR_TERMINALS_MM, motorBridges, motorCadToCentered, motorTerminalFraction, MOTOR_CAD, MOTOR_FAN } from '../src/three/motorTerminalLayout'
import { buildMotorTerminalBox } from '../src/three/motorTerminalBox'
import { TEXTURE_LIBRARY } from '../src/three/textureLibrary'
import type { ComponentDefinition } from '../src/catalog/types'

let checks = 0
const check = async (message: string, test: () => void | Promise<void>) => { await test(); checks++; console.log('PASS — ' + message) }
const near = (a: number, b: number, tol = .01) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`)

const originalFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (url.startsWith('/models/') || url.startsWith('/textures/')) return new Response(await fs.readFile(path.join('public', decodeURIComponent(url))))
  if (url.startsWith('blob:') || url.startsWith('data:')) return originalFetch(input, init)
  throw new Error('Rede externa proibida neste teste: ' + url)
}

try {
  await check('Bornes U1…W2 e PE dentro da caixa real do CAD (não no centro do motor)', () => {
    for (const [label, [x, y, z]] of Object.entries(MOTOR_TERMINALS_MM)) {
      assert.ok(x > MOTOR_BOX.x0 + MOTOR_BOX.wall && x < MOTOR_BOX.x1 - MOTOR_BOX.wall, label + ' x')
      assert.ok(z > MOTOR_BOX.z0 + MOTOR_BOX.wall && z < MOTOR_BOX.z1 - MOTOR_BOX.wall, label + ' z')
      assert.ok(y > MOTOR_BOARD_TOP && y < MOTOR_BOX.top, label + ' y')
    }
    near(MOTOR_TERMINALS_MM.V1[0], MOTOR_BOARD.cx)
    assert.ok(Math.abs(MOTOR_TERMINALS_MM.V1[0] - (MOTOR_CAD.maxX / 2)) > 25, 'deixou de estar no centro do motor')
    // placa IEC: fila de trás W2 U2 V2, fila da frente U1 V1 W1, alinhados em pares (U1↔W2 …)
    assert.ok(MOTOR_TERMINALS_MM.W2[2] < MOTOR_TERMINALS_MM.U1[2])
    near(MOTOR_TERMINALS_MM.U1[0], MOTOR_TERMINALS_MM.W2[0]); near(MOTOR_TERMINALS_MM.W1[0], MOTOR_TERMINALS_MM.V2[0])
  })
  await check('Frações do borne coincidem com as coordenadas CAD e com REAL_TERMINALS', () => {
    const spots = REAL_TERMINALS.motor3ph!
    assert.equal(spots.length, 7)
    for (const spot of spots) {
      const f = motorTerminalFraction(spot.label as keyof typeof MOTOR_TERMINALS_MM), mm = MOTOR_TERMINALS_MM[spot.label as keyof typeof MOTOR_TERMINALS_MM]
      near(MOTOR_CAD.minX + f.x * 264, mm[0], .05); near(MOTOR_CAD.minZ + f.z * 156, mm[2], .05)
      near(spot.x, f.x, 1e-9)
    }
  })
  await check('Pontes Y ligam W2-U2-V2; Δ liga U1-W2, V1-U2, W1-V2; sem ligação = nada', () => {
    assert.equal(motorBridges('star').length, 2)
    assert.equal(motorBridges('delta').length, 3)
    assert.equal(motorBridges('none').length, 0)
    for (const bridge of motorBridges('delta')) assert.equal(bridge.along, 'z')
    for (const bridge of motorBridges('star')) near(bridge.center[2], MOTOR_TERMINALS_MM.W2[2])
  })
  await check('Caixa gerada: paredes, fundo, placa, 6 pernos com porca, PE e bucim; topo das porcas abaixo da tampa', () => {
    const group = buildMotorTerminalBox(new THREE.Vector3(), 1, new THREE.MeshStandardMaterial())
    const names = new Set<string>()
    group.traverse((node) => { if (node.name) names.add(node.name) })
    for (const name of ['caixa-paredes', 'caixa-fundo', 'borne-U1-porca', 'borne-V2-porca', 'borne-PE-anilha']) assert.ok([...names].some((n) => n.startsWith(name)), name + ' em falta: ' + [...names].join(', '))
    assert.ok([...names].some((n) => n.includes('bucim')), 'bucim')
    assert.ok(MOTOR_NUT_TOP < MOTOR_BOX.top - 4)
  })
  await check('spinRate: $rpm 0…1 com sentido, inverter, variáveis booleanas e numéricas', () => {
    assert.equal(spinRate({ axis: 'x', turnsPerSecond: 2, source: '$rpm' }, { $rpm: .5, $dir: 'cw' }), 1)
    assert.equal(spinRate({ axis: 'x', turnsPerSecond: 2, source: '$rpm' }, { $rpm: .5, $dir: 'ccw' }), -1)
    assert.equal(spinRate({ axis: 'x', turnsPerSecond: 2, source: '$rpm', reverse: true }, { $rpm: 1 }), -2)
    assert.equal(spinRate({ axis: 'x', turnsPerSecond: 2, source: '$rpm' }, {}), 0)
    assert.equal(spinRate({ axis: 'y', turnsPerSecond: 3, source: 'on' }, { on: true }), 3)
    assert.equal(spinRate({ axis: 'y', turnsPerSecond: 3, source: 'on' }, { on: false }), 0)
    assert.equal(spinRate({ axis: 'z', turnsPerSecond: 3, source: 'k' }, { k: -5 }), -3)
  })

  const { def: draft, usedModel } = await buildBuiltinDraft('motor3ph')
  assert.ok(usedModel)
  const fanGroup = draft.parts.find((part) => part.name === 'Pá do veio (3 pás)')!
  await check('Rascunho do motor: pá opcional com 3 pás e rotação $rpm no eixo do veio', () => {
    assert.ok(fanGroup && fanGroup.optional && fanGroup.spin?.axis === 'x' && fanGroup.spin.source === '$rpm')
    assert.equal(draft.parts.filter((part) => part.parentId === fanGroup.id && /^Pá \d/.test(part.name)).length, 3)
    const hub = motorCadToCentered([MOTOR_FAN.hubX, 0, 0]); for (let i = 0; i < 3; i++) near(fanGroup.position[i], hub[i])
    const board = draft.parts.find((part) => part.name === 'Placa de bornes')!
    assert.ok(board.editorOnly, 'pontes de pré-visualização só no editor')
  })
  await check('Bornes do rascunho no sítio dos pernos (frame centrado do editor)', () => {
    for (const terminal of draft.terminals) {
      const mm = MOTOR_TERMINALS_MM[terminal.label as keyof typeof MOTOR_TERMINALS_MM]
      if (!mm) continue
      const c = motorCadToCentered(mm)
      near(terminal.position[0], c[0], .6); near(terminal.position[2], c[2], .6)
    }
  })
  await check('A pá roda no modo simular conforme $rpm e pára (volta à pose) no modo editar; o olho oculta-a', async () => {
    const cache = new Map<string, THREE.Object3D>()
    await loadGlbAssets(draft, cache)
    const root = buildDefinitionObject(draft, cache)
    const rig = new ComponentRig(draft, root)
    assert.ok(rig.hasSpinners)
    const node = root.getObjectByName(fanGroup.id)!
    const q0 = node.quaternion.clone()
    rig.setLive({ $rpm: 1, $dir: 'cw' })
    assert.equal(rig.update(.1), true)
    assert.ok(!node.quaternion.equals(q0))
    rig.setSpinEnabled(false)
    assert.ok(node.quaternion.angleTo(q0) < 1e-6)
    rig.setHiddenParts([fanGroup.id]); assert.equal(node.visible, false)
    rig.setHiddenParts([]); assert.equal(node.visible, true)
  })
  await check('Assar para publicar: ignora peças «só no editor» e mantém as opcionais', async () => {
    const cache = new Map<string, THREE.Object3D>()
    await loadGlbAssets(draft, cache)
    const baked = buildDefinitionObject(draft, cache, { forBake: true })
    const board = draft.parts.find((part) => part.name === 'Placa de bornes')!
    assert.equal(baked.getObjectByName(board.id), undefined)
    for (const part of draft.parts.filter((item) => item.parentId === board.id)) assert.equal(baked.getObjectByName(part.id), undefined)
    assert.ok(baked.getObjectByName(fanGroup.id))
  })
  await check('Rascunho antigo (bornes no centro, pontes a x ±9) é migrado; segunda passagem não muda nada', async () => {
    const old: ComponentDefinition = JSON.parse(JSON.stringify(draft))
    old.parts = old.parts.filter((part) => part.name !== 'Pá do veio (3 pás)' && part.parentId !== fanGroup.id && part.name !== 'Placa de bornes' && !/^Ponte/.test(part.name))
    old.materials = old.materials.filter((item) => !/^Pá |Cubo da pá|Marca de sentido/.test(item.name))
    const board = { ...defaultPart('group', null, 'Placa de bornes'), position: [0, 208, 0] as [number, number, number] }
    old.parts.push(board, { ...defaultPart('box', null, 'Ponte estrela W2-U2'), parentId: board.id, position: [-9, .8, 9] }, { ...defaultPart('box', null, 'Ponte estrela U2-V2'), parentId: board.id, position: [9, .8, 9] })
    old.terminals = old.terminals.map((terminal) => ({ ...terminal, position: [terminal.label === 'PE' ? 26.4 : 0, 205, 0] }))
    const next = await upgradeBuiltinDraft('motor3ph', old)
    assert.ok(next)
    assert.ok(next!.parts.some((part) => part.name === 'Pá do veio (3 pás)'))
    const boards = next!.parts.filter((part) => part.name === 'Placa de bornes')
    assert.equal(boards.length, 1)
    near(boards[0].position[0], motorCadToCentered([MOTOR_BOARD.cx, 0, 0])[0])
    assert.ok(boards[0].editorOnly)
    const u1 = next!.terminals.find((terminal) => terminal.label === 'U1')!
    near(u1.position[0], motorCadToCentered(MOTOR_TERMINALS_MM.U1)[0], .6)
    assert.equal(await upgradeBuiltinDraft('motor3ph', next!), null)
    // A pá eliminada pelo utilizador não volta a aparecer.
    const removed = { ...next!, parts: next!.parts.filter((part) => part.name !== 'Pá do veio (3 pás)' && part.parentId !== next!.parts.find((p) => p.name === 'Pá do veio (3 pás)')!.id) }
    assert.equal(await upgradeBuiltinDraft('motor3ph', removed), null)
  })
  await check(`Biblioteca: ${TEXTURE_LIBRARY.length} texturas CC0, todos os ficheiros existem em public/`, async () => {
    assert.ok(TEXTURE_LIBRARY.length >= 15)
    for (const entry of TEXTURE_LIBRARY) {
      assert.ok(entry.source.includes('CC0'))
      for (const url of [entry.thumb, ...Object.values(entry.maps)]) await fs.access(path.join('public', url!))
      assert.ok(entry.maps.color && entry.maps.normal && entry.maps.roughness)
    }
  })
  await check('Aplicar textura cria assets partilhados por URL e copia padrão/rugosidade; tingível conserva a cor', () => {
    const material = defaultMaterial('Carcaça', '#1e3a8a')
    let def: ComponentDefinition = { ...defaultDefinition(), materials: [material], parts: [{ ...defaultPart('box', material.id, 'Corpo') }] }
    const paint = TEXTURE_LIBRARY.find((entry) => entry.id === 'pintura-industrial')!
    def = applyLibraryTexture(def, material.id, paint)
    const m = def.materials[0]
    assert.equal(m.library, 'pintura-industrial'); assert.equal(m.tileMm, paint.tileMm)
    assert.equal(def.assets[m.map!].data, paint.maps.color)
    assert.ok(m.normalMap && m.roughnessMap)
    const def2 = applyLibraryTexture({ ...def, materials: [{ ...m, color: '#0f766e' }] }, material.id, TEXTURE_LIBRARY.find((entry) => entry.id === 'pintura-texturada')!)
    assert.equal(def2.materials[0].color, '#0f766e')
    const brass = applyLibraryTexture(def, material.id, TEXTURE_LIBRARY.find((entry) => entry.id === 'latao')!)
    assert.ok(brass.materials[0].metalnessMap)
  })
  await check('UV por projeção em caixa: escala física (padrão em mm), sem NaN', () => {
    const geometry = boxProjectUv(new THREE.BoxGeometry(200, 100, 50), 100)
    const uv = geometry.getAttribute('uv')
    let max = 0
    for (let i = 0; i < uv.count; i++) { assert.ok(Number.isFinite(uv.getX(i)) && Number.isFinite(uv.getY(i))); max = Math.max(max, Math.abs(uv.getX(i)), Math.abs(uv.getY(i))) }
    near(max, 1, .02) // 200 mm / 2 a partir do centro → 1 repetição de 100 mm
  })
  console.log(`PASS — ${checks} verificações do motor (caixa de bornes, pá, texturas)`)
} finally { globalThis.fetch = originalFetch }
