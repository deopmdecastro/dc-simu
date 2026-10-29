import * as THREE from 'three'

type Point = [number, number, number]
export type SolidWireBox = THREE.Box3 & { componentId?: string; rail?: boolean }
export type SocketExit = { componentId?: string; axis: Point }
const vec = (p: Point) => new THREE.Vector3(...p)
const tuple = (p: THREE.Vector3): Point => [p.x, p.y, p.z]

/** Interseção exata segmento/volume, sem saltar corpos finos entre amostras. */
export function segmentEntersBox(a: Point, b: Point, box: THREE.Box3): boolean {
  let lo = 0, hi = 1
  for (let axis = 0; axis < 3; axis++) {
    const min = box.min.getComponent(axis) + 1e-7, max = box.max.getComponent(axis) - 1e-7
    const delta = b[axis] - a[axis]
    if (Math.abs(delta) < 1e-10) { if (a[axis] <= min || a[axis] >= max) return false; continue }
    let enter = (min - a[axis]) / delta, leave = (max - a[axis]) / delta
    if (enter > leave) [enter, leave] = [leave, enter]
    lo = Math.max(lo, enter); hi = Math.min(hi, leave)
    if (lo >= hi) return false
  }
  return hi > 0 && lo < 1
}

export const pathEntersBoxes = (points: Point[], boxes: THREE.Box3[]) =>
  points.some((p, i) => i > 0 && boxes.some(box => segmentEntersBox(points[i - 1], p, box)))

/** A exceção pertence apenas ao túnel axial do encaixe, nunca a uma esfera à volta dele. */
function clearWithSockets(points: Point[], boxes: SolidWireBox[], exits: [SocketExit, SocketExit], pad: number): boolean {
  const tunnel = (p: Point, q: Point, end: Point, exit: SocketExit, reverse: boolean) => {
    const axis = vec(exit.axis).normalize(), a = vec(p).sub(vec(end)), b = vec(q).sub(vec(end))
    return a.clone().cross(axis).length() < 1e-5 && b.clone().cross(axis).length() < 1e-5
      && a.dot(axis) >= -1e-6 && b.dot(axis) >= -1e-6
      && (reverse ? a.dot(axis) >= b.dot(axis) - 1e-6 : b.dot(axis) >= a.dot(axis) - 1e-6)
  }
  for (const box of boxes) {
    const grown = box.clone().expandByScalar(pad)
    for (let i = 1; i < points.length; i++) {
      const a = points[i-1], b = points[i]
      if (!segmentEntersBox(a,b,grown)) continue
      if (box.componentId && box.componentId === exits[0].componentId && tunnel(a,b,points[0],exits[0],false)) continue
      if (box.componentId && box.componentId === exits[1].componentId && tunnel(a,b,points[points.length-1],exits[1],true)) continue
      return false
    }
  }
  return true
}

/** Apenas a saída axial do encaixe pode começar dentro da caixa do seu aparelho.
 * Depois de sair, o próprio aparelho volta a ser um obstáculo integral. */
function socketEscape(point: Point, exit: SocketExit, boxes: SolidWireBox[], pad: number): Point {
  const own = boxes.find(box => box.componentId === exit.componentId)
  if (!own) return point
  const box = own.clone().expandByScalar(pad)
  const p = vec(point), direction = vec(exit.axis).normalize()
  if (!box.containsPoint(p)) return tuple(p.addScaledVector(direction, 0.1))
  let distance = Infinity
  for (let axis = 0; axis < 3; axis++) {
    const d = direction.getComponent(axis)
    if (Math.abs(d) < 1e-9) continue
    const face = (d > 0 ? box.max : box.min).getComponent(axis)
    distance = Math.min(distance, (face - p.getComponent(axis)) / d)
  }
  return Number.isFinite(distance) ? tuple(p.addScaledVector(direction, Math.max(0, distance) + 0.1)) : point
}

/** Grafo de visibilidade nos cantos dos volumes: escolhe um desvio livre em 3D.
 * Só é calculado quando o traçado sugerido/manual atravessa algum aparelho. */
function routeOutside(a: Point, b: Point, boxes: THREE.Box3[], minZ: number, track: number): Point[] {
  const clear = (p: Point, q: Point) => !boxes.some(box => segmentEntersBox(p, q, box))
  if (clear(a, b)) return [a, b]
  const gap = 0.04 + (track % 13) * 0.04
  const front = Math.max(minZ, ...boxes.map(box => box.max.z)) + gap
  const candidates: Point[] = [[a[0], a[1], front], [b[0], b[1], front]]
  for (const box of boxes) {
    for (const x of [box.min.x - gap, box.max.x + gap])
      for (const y of [box.min.y - gap, box.max.y + gap])
        for (const z of [Math.max(minZ, box.min.z - gap), box.max.z + gap]) candidates.push([x, y, z])
  }
  const nodes = [a, b, ...candidates.filter(p => !boxes.some(box => box.containsPoint(vec(p))))]
  const costs = nodes.map(() => Infinity), previous = nodes.map(() => -1), visited = new Set<number>()
  costs[0] = 0
  for (;;) {
    let current = -1
    for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && (current < 0 || costs[i] < costs[current])) current = i
    if (current < 0 || !Number.isFinite(costs[current])) return []
    if (current === 1) break
    visited.add(current)
    for (let i = 0; i < nodes.length; i++) {
      if (visited.has(i)) continue
      const cost = costs[current] + vec(nodes[current]).distanceTo(vec(nodes[i]))
      if (cost < costs[i] && clear(nodes[current], nodes[i])) { costs[i] = cost; previous[i] = current }
    }
  }
  const result: Point[] = []
  for (let i = 1; i >= 0; i = previous[i]) result.unshift(nodes[i])
  return result
}

export function keepWireOutsideSolids(points: Point[], outerMm: number, obstacles: SolidWireBox[], exits: [SocketExit, SocketExit], minZ: number, track = 0): Point[] {
  if (points.length < 2) return points
  const solids = obstacles
  const pad = outerMm * 0.005 + 0.025
  if (clearWithSockets(points,solids,exits,pad)) return points
  const boxes = solids.map(box => box.clone().expandByScalar(pad))
  const a = socketEscape(points[0], exits[0], solids, pad)
  const b = socketEscape(points[points.length - 1], exits[1], solids, pad)
  // A primeira/última saída é axial; as curvas nunca herdam uma zona de exclusão
  // esférica que permita regressar ao interior do próprio aparelho.
  const ownA = solids.find(box => box.componentId === exits[0].componentId)?.clone().expandByScalar(pad)
  const ownB = solids.find(box => box.componentId === exits[1].componentId)?.clone().expandByScalar(pad)
  let first = 1, last = points.length - 2
  while (first <= last && ownA?.containsPoint(vec(points[first]))) first++
  while (last >= first && ownB?.containsPoint(vec(points[last]))) last--
  const middle = [a, ...points.slice(first, last + 1), b]
  const finish = (path: Point[]) => {
    const departure = Array.from({length:10},(_,i)=>tuple(vec(points[0]).lerp(vec(a),i/10)))
    const arrival = Array.from({length:10},(_,i)=>tuple(vec(b).lerp(vec(points[points.length-1]),i/10)))
    const result = [...departure,...path,...arrival,points[points.length-1]].filter((p,i,all)=>i===0||vec(p).distanceToSquared(vec(all[i-1]))>1e-10)
    return clearWithSockets(result,solids,exits,pad) ? result : []
  }
  if (pathEntersBoxes(middle, boxes)) {
    const detour = routeOutside(a, b, boxes, minZ, track)
    // Pontos livres dentro de um sólido/volumes sobrepostos não têm um desvio
    // fisicamente válido. Não desenhar um cabo através do corpo como alternativa.
    if (!detour.length) return []
    return finish(detour)
  }
  return finish(middle)
}
