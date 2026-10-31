import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createComponent, upgradeRealInterfacePositions } from '../src/electrical/factory'
import { REAL_TERMINALS, leadRootPosition, realTerminalPosition } from '../src/electrical/realInterfaces'
import { leadPigtailLayout } from '../src/three/leadPigtailLayout'
import { terminalLocal3D, terminalWorld3D } from '../src/three/terminal3D'
import { fitComponentModel } from '../src/three/modelFit'
import { getComponentModelSpec } from '../src/three/modelPaths'
import { orientationRadians, componentOrientationOf } from '../src/three/componentOrientation'

const type = 'photoSensorXukt1ksml2'
const sensor = createComponent(type)
const layout = leadPigtailLayout(sensor)!
assert.ok(layout.sheath && layout.cores.length === 3, 'sensor com bainha comum e três fios')
const spec = getComponentModelSpec(type)!
const bytes = readFileSync('public' + spec.path)
const gltf = await new Promise<any>((resolve, reject) => new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '', resolve, reject))
const model = fitComponentModel(gltf.scene, spec)
model.updateMatrixWorld(true)
let cable: THREE.Mesh | undefined
model.traverse(n => { if (n.name === 'cad_16_') cable = n as THREE.Mesh })
assert.ok(cable, 'bainha original existe no CAD')
const vertices = cable.geometry.getAttribute('position')
const points: THREE.Vector3[] = []
for (let i = 0; i < vertices.count; i++) points.push(new THREE.Vector3().fromBufferAttribute(vertices, i).applyMatrix4(cable.matrixWorld))
const minX = Math.min(...points.map(p => p.x))
const cap = points.filter(p => p.x < minX + 0.001)
const capBox = new THREE.Box3().setFromPoints(cap)
const capCenter = capBox.getCenter(new THREE.Vector3())
const path = layout.sheath!.geometry.parameters.path
const start = path.getPoint(0)
const end = layout.sheath!.end
assert.ok(Math.abs(start.x - capCenter.x) < .021 && Math.abs(start.y-capCenter.y) < .002 && Math.abs(start.z-capCenter.z) < .002, 'bainha gerada entra na extremidade real da bainha CAD')
assert.ok(Math.abs(layout.sheath!.radius * 2 - capBox.getSize(new THREE.Vector3()).y) < .002, 'diâmetros das bainhas coincidem')
for (const core of layout.cores) {
  assert.ok(core.points[0].distanceTo(end) + core.radius < layout.sheath!.radius, 'condutor começa dentro da bainha')
  assert.ok(core.tip.distanceTo(terminalLocal3D(sensor, core.terminal)) < 1e-10, 'cobre e borne partilham a ponta')
}
for (let i = 0; i < layout.cores.length; i++) for (let j = i + 1; j < layout.cores.length; j++)
  assert.ok(layout.cores[i].tip.distanceTo(layout.cores[j].tip) > .05, 'pontas de cobre separadas')
const tower = createComponent('towerLightSb23011')
const towerLayout = leadPigtailLayout(tower)!
assert.equal(towerLayout.sheath, null)
assert.equal(towerLayout.cores.length, 4)
for (const core of towerLayout.cores) assert.ok(core.tip.distanceTo(terminalLocal3D(tower, core.terminal)) < 1e-10)

const oldY: Record<string, number> = { COM: .95, NA: .905, NF: .995 }
const oldZ: Record<string, number> = { COM: .19, NA: .24, NF: .14 }
const old = structuredClone(sensor)
old.terminals = old.terminals.map(t => {
  const spot = REAL_TERMINALS[type]!.find(s => s.label === t.label)!
  const legacy = { ...spot, y: oldY[t.label], z: oldZ[t.label] }
  return { ...t, position3D: realTerminalPosition(type, legacy, true), socket3D: { ...t.socket3D!, position: leadRootPosition(type, legacy) } }
})
const upgraded = upgradeRealInterfacePositions(old)
for (const t of upgraded.terminals) {
  const fresh = sensor.terminals.find(x => x.id === t.id)!
  assert.deepEqual(t.position3D, fresh.position3D)
  assert.deepEqual(t.socket3D?.position, fresh.socket3D?.position)
  assert.equal(t.id, fresh.id, 'preserva identidade elétrica')
}
assert.equal(upgradeRealInterfacePositions(upgraded), upgraded, 'migração idempotente')
const custom = structuredClone(old)
custom.terminals[0].pinned = true
custom.terminals[1].position3D!.z += .03
const preserved = upgradeRealInterfacePositions(custom)
assert.deepEqual(preserved.terminals[0], custom.terminals[0])
assert.deepEqual(preserved.terminals[1], custom.terminals[1])
assert.notDeepEqual(preserved.terminals[2].position3D, custom.terminals[2].position3D)

// A mesma matriz de instância aplicada aos fios tem de coincidir com a usada
// nos alvos elétricos, inclusive com rotação, espelho e escala não uniforme.
sensor.viewOrientation = { x: 22, y: -40, z: 17 }
sensor.view3DScale = { x: 1.2, y: .8, z: 1.1 }
sensor.mirrored = true
sensor.rotation = 90
const pivot = new THREE.Vector3(2, 1, .7)
for (const core of layout.cores) {
  const expected = core.tip.clone().multiply(new THREE.Vector3(1.2,.8,1.1))
    .applyEuler(new THREE.Euler(...orientationRadians(componentOrientationOf(sensor)), 'XYZ'))
  expected.x *= -1
  expected.applyEuler(new THREE.Euler(0,0,-Math.PI/2)).add(pivot)
  assert.ok(expected.distanceTo(terminalWorld3D(sensor, core.terminal, pivot)) < 1e-9, 'ponta visual e alvo elétrico permanecem alinhados após transformar')
}
layout.sheath!.geometry.dispose()
console.log('PASS — bainha CAD contínua, fios e bornes coincidentes, torre, migração e transformações')
