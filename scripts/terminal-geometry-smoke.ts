import assert from 'node:assert/strict'
import * as THREE from 'three'
import { loadModelMm } from './detect-interfaces'
import { REAL_TERMINALS } from '../src/electrical/realInterfaces'
import { createComponent, terminalByLabel } from '../src/electrical/factory'
import { terminalMarkerRadius, terminalNormalWorld3D } from '../src/three/terminal3D'
import type { ComponentType } from '../src/types'
import '../src/catalog/holeDetect'

// Mede o CAD realmente renderizado; não compara o resultado com a própria tabela.
let count = 0
for (const type of Object.keys(REAL_TERMINALS) as ComponentType[]) {
  const model = await loadModelMm(type)
  assert.ok(model, `${type}: GLB em falta`)
  const { root, box, phys } = model
  const size = box.getSize(new THREE.Vector3())
  for (const [actual, expected] of [[size.x, phys.width], [size.y, phys.height], [size.z, phys.depth]]) {
    assert.ok(Math.abs(actual - expected) < .001, `${type}: modelo e bornes usam volumes diferentes`)
  }
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    const geometry = mesh.geometry as THREE.BufferGeometry & { boundsTree?: unknown; computeBoundsTree?: () => void }
    if (!geometry.boundsTree) geometry.computeBoundsTree?.()
  })
  const component = createComponent(type)
  const ray = new THREE.Raycaster() as THREE.Raycaster & { firstHitOnly?: boolean }
  ray.firstHitOnly = true
  for (const spot of REAL_TERMINALS[type]!) {
    const terminal = terminalByLabel(component, spot.label)!
    assert.ok(terminal, `${type}.${spot.label}: ligação em falta`)
    const at = terminal.position3D!
    const p = new THREE.Vector3((at.x - .5) * size.x, (at.y - .5) * size.y, (at.z - .5) * size.z)
    const axis = ({ front: 2, back: 2, left: 0, right: 0, top: 1, bottom: 1 } as const)[spot.face]
    const sign = ['front', 'right', 'top'].includes(spot.face) ? 1 : -1
    const u = (axis + 1) % 3, v = (axis + 2) % 3
    const start = sign > 0 ? box.max.getComponent(axis) + 1 : box.min.getComponent(axis) - 1
    const sample = (a: number, b: number) => {
      const origin = p.clone().setComponent(axis, start)
      origin.setComponent(u, origin.getComponent(u) + a).setComponent(v, origin.getComponent(v) + b)
      ray.set(origin, new THREE.Vector3().setComponent(axis, -sign))
      return ray.intersectObject(root, true)[0]?.distance ?? Infinity
    }
    const floor = sample(0, 0), ring: number[] = []
    const radius = (spot.diameterMm ?? 4) * .65
    for (let i = 0; i < 12; i++) ring.push(sample(Math.cos(i * Math.PI / 6) * radius, Math.sin(i * Math.PI / 6) * radius))
    const finite = ring.filter(Number.isFinite).sort((a, b) => a - b)
    const lip = finite[Math.floor(finite.length * .25)]
    const target = (start - p.getComponent(axis)) * sign
    const prefix = `${type}.${spot.label}`
    const normal = terminalNormalWorld3D({ ...component, viewOrientation: { x: 0, y: 0, z: 0 } }, terminal)
    assert.ok(normal.distanceTo(new THREE.Vector3().setComponent(axis, sign)) < 1e-6, `${prefix}: cabo sai pela face errada`)
    assert.ok(finite.length >= 6 && Number.isFinite(floor) && floor - lip > .7, `${prefix}: não está centrado numa cavidade`)
    assert.ok(target > lip + .1 && target < floor - .1, `${prefix}: centro fora do furo ou dentro do material`)
    const marker = terminalMarkerRadius(component, terminal) * 100 * 1.1 * 1.2
    assert.ok(marker < Math.min(target - lip, floor - target, (spot.diameterMm ?? 4) / 2), `${prefix}: marcador maior do que o encaixe`)
    count++
  }
  console.log(`PASS — ${type}: ${component.terminals.length} ligações no interior dos encaixes`)
}
assert.equal(count, 162, 'Cobertura incompleta dos modelos integrados (142 anteriores + 20 novos encaixes)')
console.log(`PASS — 25 modelos, ${count} ligações: cavidades, profundidade, marcadores e escala física`)
