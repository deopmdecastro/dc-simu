import './node-env'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createComponent, upgradeRealInterfacePositions } from '../src/electrical/factory'
import { INDUSTRIAL_GEOMETRY } from '../src/electrical/industrialDevices'
import { GEYA_PREVIOUS_STEP_TERMINALS } from '../src/electrical/legacyRealInterfaces'
import { realTerminalPosition, terminalInsetMm } from '../src/electrical/realInterfaces'
import { buildBuiltinDraft, upgradeBuiltinDraft } from '../src/admin/editor3d/builtinComponents'

let count = 0
const check = (ok: unknown, label: string) => { assert.ok(ok, label); count++; console.log('PASS — ' + label) }
const close = (a: number, b: number, tolerance = .015) => Math.abs(a - b) < tolerance
const originalFetch = globalThis.fetch
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  return url.startsWith('/models/') || url.startsWith('/datasheets/') ? new Response(await fs.readFile('public' + url)) : originalFetch(input, init)
}) as typeof fetch

// Expected topology from the manufacturer product photographs: supply and first
// changeover on the rear steps; M2 second changeover on the next lower step.
for (const type of ['timerGeyaGrt8M1', 'timerGeyaGrt8M2', 'timerGeyaGrt8B1'] as const) {
  const g = INDUSTRIAL_GEOMETRY[type], bytes = await fs.readFile('public' + g.path)
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
  scene.updateMatrixWorld(true)
  const body = scene.getObjectByName('industrial_geya_body')!
  const labels = ['A1', 'S', 'A2', '15', '16', '18', ...(type.endsWith('M2') ? ['25', '26', '28'] : [])]
  let screws = 0; scene.traverse(n => { if (n.name.startsWith('terminal_screw_head_geya_')) screws++ })
  check(screws === labels.length && g.terminals.length === labels.length, type + ': one screw for each of ' + labels.length + ' unique terminals')
  check(JSON.stringify(g.physicalSizeMm) === JSON.stringify({ width: 18.08, height: 95, depth: 65.35 }), type + ': original mounting envelope retained')
  for (const label of labels) {
    const supply = ['A1', 'S', 'A2'].includes(label), second = ['25', '26', '28'].includes(label)
    const deck = second ? 38 : 24, screwY = supply ? 85.8 : second ? 20 : 9.2
    const screw = scene.getObjectByName('terminal_screw_geya_' + label)!, point = screw.getWorldPosition(new THREE.Vector3()).multiplyScalar(1000)
    // Sample the actual housing beside the holes, rather than trusting metadata.
    const wallHit = new THREE.Raycaster(new THREE.Vector3(.008, screwY / 1000, .2), new THREE.Vector3(0, 0, -1)).intersectObject(body)[0]
    check(!!wallHit && close(wallHit.point.z * 1000, deck) && close(deck - point.z, 1.25) && close(point.y, screwY), type + ' ' + label + ': screw recessed in the correct physical step Z' + deck)
    const origin = screw.localToWorld(new THREE.Vector3(.0008, .0008, .012)), target = screw.localToWorld(new THREE.Vector3(.0008, .0008, 0))
    check(new THREE.Raycaster(origin, target.sub(origin).normalize()).intersectObject(scene, true)[0]?.object.name === 'terminal_screw_head_geya_' + label, type + ' ' + label + ': screwdriver reaches the head without floating hardware or plastic in front')
    const marking = scene.getObjectByName('industrial_geya_label_' + label)!.getWorldPosition(new THREE.Vector3())
    check(close(marking.z * 1000, deck + .06) && close(marking.x * 1000, point.x), type + ' ' + label + ': number printed on the same step as its screw')
    check(new THREE.Raycaster(marking.clone().add(new THREE.Vector3(0, 0, .2)), new THREE.Vector3(0, 0, -1)).intersectObject(scene, true)[0]?.object.name === 'industrial_geya_label_' + label, type + ' ' + label + ': terminal number exposed, without DIN latch or plastic in front')
    const mouth = scene.getObjectByName('industrial_connection_' + label)!.getWorldPosition(new THREE.Vector3())
    const expectedY = supply ? 92.5 : second ? 13.5 : 2.5, expectedZ = second ? 30 : 14
    const normal = new THREE.Vector3(0, supply ? 1 : -1, 0)
    const roof = new THREE.Raycaster(new THREE.Vector3(.008, supply ? .2 : -.2, expectedZ / 1000), normal.clone().negate()).intersectObject(body)[0]
    check(!!roof && close(roof.point.y * 1000, expectedY) && close(mouth.y * 1000, expectedY) && close(mouth.z * 1000, expectedZ) && close(mouth.x * 1000, point.x), type + ' ' + label + ': conductor mouth sits on the underside/roof of its own step')
  }
}

const type = 'timerGeyaGrt8M2' as const
const fresh = createComponent(type), old = structuredClone(fresh)
for (const t of old.terminals) {
  const spot = GEYA_PREVIOUS_STEP_TERMINALS.find(s => s.label === t.label)
  if (!spot) continue
  t.position3D = realTerminalPosition(type, spot)
  t.socket3D = { position: { x: spot.x, y: 1 - spot.y, z: spot.z }, normal: [0, -1, 0], diameterMm: 4, depthMm: 8.6, insetMm: 0 }
}
const upgraded = upgradeRealInterfacePositions(old)
check(upgraded.terminals.every(t => t.id === old.terminals.find(s => s.label === t.label)!.id && (['x', 'y', 'z'] as const).every(k => Math.abs(t.position3D![k] - fresh.terminals.find(s => s.label === t.label)!.position3D![k]) < 1e-9)), 'M2: previous automatic step endpoints migrate, preserving all electrical IDs')
check(upgradeRealInterfacePositions(upgraded) === upgraded, 'M2: current revision migration is idempotent')
for (const mode of ['pinned', 'moved', 'normal', 'authored'] as const) {
  const c = structuredClone(old), t = c.terminals.find(t => t.label === '25')!
  if (mode === 'pinned') t.pinned = true
  if (mode === 'moved') t.position3D!.x += .01
  if (mode === 'normal') t.socket3D!.normal = [1, 0, 0]
  if (mode === 'authored') c.editorVersion = 2
  check(upgradeRealInterfacePositions(c).terminals.find(s => s.label === '25') === t, 'M2: preserves ' + mode + ' native terminal geometry')
}
const { def } = await buildBuiltinDraft(type), previousDef = structuredClone(def), physical = INDUSTRIAL_GEOMETRY[type].physicalSizeMm
for (const t of previousDef.terminals) {
  const spot = GEYA_PREVIOUS_STEP_TERMINALS.find(s => s.label === t.label)
  if (!spot) continue
  const p = realTerminalPosition(type, spot)
  t.name = 'AUTOR ' + t.label
  t.position = [(p.x - .5) * physical.width, p.y * physical.height, (p.z - .5) * physical.depth]
  t.socketDepthMm = spot.holeDepthMm; t.socketInsetMm = terminalInsetMm(spot)
}
const admin = await upgradeBuiltinDraft(type, previousDef)
check(!!admin && admin.terminals.every(t => t.position.every((v, i) => close(v, def.terminals.find(s => s.label === t.label)!.position[i]))), 'M2: Admin migrates the published intermediate-step revision')
check(admin!.terminals.filter(t => GEYA_PREVIOUS_STEP_TERMINALS.some(s => s.label === t.label)).every(t => t.name === 'AUTOR ' + t.label && t.id === previousDef.terminals.find(s => s.label === t.label)!.id), 'M2: Admin preserves terminal IDs and authored names')
const manual = structuredClone(previousDef), manualTerminal = manual.terminals.find(t => t.label === '25')!
manualTerminal.position[0] += .5
const result = await upgradeBuiltinDraft(type, manual)
check(JSON.stringify((result ?? manual).terminals.find(t => t.label === '25')) === JSON.stringify(manualTerminal), 'M2: Admin preserves manually positioned intermediate terminal')
globalThis.fetch = originalFetch
console.log('\nPASS — ' + count + ' GEYA step geometry and migration checks')
