/** Mede, por raios, a borda e o fundo de cada encaixe dos CAD importados (mm, referencial do GLB).
 *  npx tsx scripts/measure-imported-sockets.ts [tipo,...] — imprime superfície (lip), fundo e profundidade. */
import * as THREE from 'three'
import { loadModelMm } from './detect-interfaces'
import { REAL_TERMINALS } from '../src/electrical/realInterfaces'
import models from '../src/data/imported-component-models.json'
import type { ComponentType } from '../src/types'
import '../src/catalog/holeDetect'

const only = process.argv[2]?.split(',')
const out: Record<string, unknown[]> = {}
for (const model of models) {
  if (only && !only.includes(model.type)) continue
  const type = model.type as ComponentType
  const loaded = await loadModelMm(type)
  if (!loaded) continue
  const { root, box } = loaded
  const size = box.getSize(new THREE.Vector3())
  root.traverse((node) => { const g = (node as THREE.Mesh).geometry as THREE.BufferGeometry & { computeBoundsTree?: () => void; boundsTree?: unknown }; if (g && !g.boundsTree) g.computeBoundsTree?.() })
  const ray = new THREE.Raycaster() as THREE.Raycaster & { firstHitOnly?: boolean }
  ray.firstHitOnly = true
  const rows: unknown[] = []
  for (const spot of REAL_TERMINALS[type] ?? []) {
    if (spot.contact && spot.contact !== 'socket') continue
    const axis = ({ front: 2, back: 2, left: 0, right: 0, top: 1, bottom: 1 } as const)[spot.face]
    const sign = ['front', 'right', 'top'].includes(spot.face) ? 1 : -1
    const p = new THREE.Vector3((spot.x - .5) * size.x, (.5 - spot.y) * size.y, (spot.z - .5) * size.z)
    const u = (axis + 1) % 3, v = (axis + 2) % 3
    const start = sign > 0 ? box.max.getComponent(axis) + 1 : box.min.getComponent(axis) - 1
    const sample = (a: number, b: number) => {
      const origin = p.clone().setComponent(axis, start)
      origin.setComponent(u, origin.getComponent(u) + a).setComponent(v, origin.getComponent(v) + b)
      ray.set(origin, new THREE.Vector3().setComponent(axis, -sign))
      return ray.intersectObject(root, true)[0]?.distance ?? Infinity
    }
    const floor = sample(0, 0)
    const ring = Array.from({ length: 12 }, (_, i) => sample(Math.cos(i * Math.PI / 6) * (spot.diameterMm ?? 4) * .65, Math.sin(i * Math.PI / 6) * (spot.diameterMm ?? 4) * .65)).filter(Number.isFinite).sort((a, b) => a - b)
    const lip = ring[Math.floor(ring.length * .25)]
    // Coordenada (no eixo da face) da borda e do fundo, no referencial centrado do modelo.
    rows.push({ label: spot.label, face: spot.face, lipMm: +(start - sign * lip).toFixed(2), floorMm: +(start - sign * floor).toFixed(2), depthMm: +(floor - lip).toFixed(2) })
  }
  out[type] = rows
}
console.log(JSON.stringify(out, null, 1))
