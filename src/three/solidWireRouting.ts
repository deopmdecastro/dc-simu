import * as THREE from 'three'

type Point = [number, number, number]
export type EnclosureWallKind = 'back' | 'left' | 'right' | 'top' | 'bottom' | 'door'
export type SolidWireBox = THREE.Box3 & {
  componentId?: string
  rail?: boolean
  hard?: boolean
  /** Calha técnica ranhurada (`cableDuct`): o interior é canal de passagem dos cabos. */
  duct?: boolean
  ductAxis?: 'x' | 'y'
  /** Parede de armário (`panelEnclosure`). */
  enclosureWall?: EnclosureWallKind
}
export type SocketExit = {
  componentId?: string
  axis: Point
  glandBypass?: boolean
  /** ID do quadro cuja chapa inferior de bucins permite saída física dos cabos de motor/campo. */
  enclosureGlandId?: string
  /** ID do quadro cuja porta permite passagem do borne montado em `doorOuter` para a face interior. */
  enclosureDoorId?: string
}
const vec = (p: Point) => new THREE.Vector3(...p)
const tuple = (p: THREE.Vector3): Point => [p.x, p.y, p.z]

/** Volume orientado: a caixa mundial serve a pesquisa; as colisões usam o referencial físico. */
export class OrientedWireBox extends THREE.Box3 {
  componentId?: string
  rail?: boolean
  hard?: boolean
  duct?: boolean
  ductAxis?: 'x' | 'y'
  enclosureWall?: EnclosureWallKind
  readonly localBounds: THREE.Box3
  readonly worldToLocal: THREE.Matrix4
  readonly localToWorld: THREE.Matrix4

  constructor(bounds: THREE.Box3, localToWorld: THREE.Matrix4) {
    super()
    this.localBounds = bounds.clone()
    this.localToWorld = localToWorld.clone()
    this.worldToLocal = localToWorld.clone().invert()
    super.copy(bounds.clone().applyMatrix4(localToWorld))
  }

  override containsPoint(point: THREE.Vector3): boolean {
    return this.localBounds.containsPoint(point.clone().applyMatrix4(this.worldToLocal))
  }

  override clone(): this {
    const box = new OrientedWireBox(this.localBounds, this.localToWorld)
    box.componentId = this.componentId; box.rail = this.rail; box.hard = this.hard
    ;(box as SolidWireBox).enclosureWall = (this as SolidWireBox).enclosureWall
    ;(box as SolidWireBox).duct = (this as SolidWireBox).duct
    return box as this
  }

  override expandByScalar(pad: number): this {
    const e = this.worldToLocal.elements
    this.localBounds.expandByVector(new THREE.Vector3(Math.hypot(e[0], e[4], e[8]), Math.hypot(e[1], e[5], e[9]), Math.hypot(e[2], e[6], e[10])).multiplyScalar(pad))
    super.copy(this.localBounds.clone().applyMatrix4(this.localToWorld))
    return this
  }
}

/** Interseção exata segmento/volume, sem saltar corpos finos entre amostras. */
export function segmentEntersBox(a: Point, b: Point, box: THREE.Box3): boolean {
  if (box instanceof OrientedWireBox) return segmentEntersBox(tuple(vec(a).applyMatrix4(box.worldToLocal)), tuple(vec(b).applyMatrix4(box.worldToLocal)), box.localBounds)
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

function isBypassedSolid(box: SolidWireBox, exits: [SocketExit, SocketExit]): boolean {
  if (box.duct) return true
  if (box.enclosureWall === 'bottom' && box.componentId && (exits[0].enclosureGlandId === box.componentId || exits[1].enclosureGlandId === box.componentId)) {
    return true
  }
  if (box.enclosureWall === 'door' && box.componentId && (exits[0].enclosureDoorId === box.componentId || exits[1].enclosureDoorId === box.componentId)) {
    return true
  }
  return Boolean(box.componentId && ((box.componentId === exits[0].componentId && exits[0].glandBypass) || (box.componentId === exits[1].componentId && exits[1].glandBypass)))
}

/** A exceção pertence apenas ao túnel axial do encaixe, nunca a uma esfera à volta dele. */
/** Troço dentro do túnel axial de saída do encaixe (a única passagem permitida dentro do próprio aparelho). */
function socketTunnel(p: Point, q: Point, end: Point, exit: SocketExit, reverse: boolean) {
  const axis = vec(exit.axis).normalize(), a = vec(p).sub(vec(end)), b = vec(q).sub(vec(end))
  return a.clone().cross(axis).length() < 1e-5 && b.clone().cross(axis).length() < 1e-5
    && a.dot(axis) >= -1e-6 && b.dot(axis) >= -1e-6
    && (reverse ? a.dot(axis) >= b.dot(axis) - 1e-6 : b.dot(axis) >= a.dot(axis) - 1e-6)
}

/**
 * Mesmo critério que `isWireOutsideSolids`, avaliado segmento a segmento com cache, para quem testa
 * muitas variantes locais do mesmo cabo (remoção de bicos): só os segmentos novos são verificados.
 * As pontas do cabo têm de ser as indicadas — se mudarem, recorre ao teste completo.
 */
export function createWireClearance(outerMm: number, obstacles: SolidWireBox[], exits: [SocketExit, SocketExit], first: Point, last: Point) {
  const pad = outerMm * 0.005 + 0.025
  const active = obstacles.filter((box) => !isBypassedSolid(box, exits)).map((box) => ({ box, grown: box.clone().expandByScalar(pad) }))
  const cache = new Map<string, boolean>()
  const same = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
  const segmentClear = (a: Point, b: Point) => {
    const key = `${a[0]},${a[1]},${a[2]}|${b[0]},${b[1]},${b[2]}`
    const known = cache.get(key)
    if (known !== undefined) return known
    let ok = true
    for (const { box, grown } of active) {
      if (!segmentEntersBox(a, b, grown)) continue
      if (box.componentId && box.componentId === exits[0].componentId && socketTunnel(a, b, first, exits[0], false)) continue
      if (box.componentId && box.componentId === exits[1].componentId && socketTunnel(a, b, last, exits[1], true)) continue
      ok = false
      break
    }
    cache.set(key, ok)
    return ok
  }
  return (points: Point[]): boolean => {
    if (points.length < 2) return true
    if (!same(points[0], first) || !same(points[points.length - 1], last)) return isWireOutsideSolids(points, outerMm, obstacles, exits)
    for (let i = 1; i < points.length; i++) if (!segmentClear(points[i - 1], points[i])) return false
    return true
  }
}

function clearWithSockets(points: Point[], boxes: SolidWireBox[], exits: [SocketExit, SocketExit], pad: number): boolean {
  const tunnel = socketTunnel
  for (const box of boxes) {
    if (isBypassedSolid(box, exits)) continue
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

/** Grafo de visibilidade nos cantos dos volumes: escolhe um desvio livre e ortogonal em 3D.
 * Usa apenas os volumes realmente próximos do troço em conflito (nunca projeta fios interiores
 * para a frente da abertura de um armário nem para a frente do motor). */
function routeOutside(a: Point, b: Point, boxes: SolidWireBox[], minZ: number, track: number): Point[] {
  const clear = (p: Point, q: Point) => !boxes.some(box => segmentEntersBox(p, q, box))
  if (clear(a, b)) return [a, b]
  const gap = 0.024 + (track % 7) * 0.014
  const blocking = boxes.filter(box => !box.enclosureWall && segmentEntersBox(a, b, box))
  const localPool = blocking.length > 0 ? blocking : boxes.filter(box => segmentEntersBox(a, b, box))
  const localFront = Math.max(minZ, a[2], b[2], ...localPool.map(box => box.max.z)) + gap
  const candidates: Point[] = [
    [a[0], a[1], localFront],
    [b[0], b[1], localFront],
    [a[0], b[1], localFront],
    [b[0], a[1], localFront],
    [a[0], b[1], Math.max(a[2], b[2])],
    [b[0], a[1], Math.max(a[2], b[2])],
  ]
  const cornerSources = (localPool.length > 0 ? localPool : boxes).slice(0, 6)
  for (const box of cornerSources) {
    const xs = box.enclosureWall ? [a[0]] : [box.min.x - gap, box.max.x + gap]
    const ys = box.enclosureWall ? [a[1]] : [box.min.y - gap, box.max.y + gap]
    const zs = [Math.max(minZ, box.min.z - gap), box.max.z + gap]
    for (const y of ys) {
      candidates.push([a[0], y, localFront], [b[0], y, localFront])
    }
    for (const x of xs) for (const y of ys) for (const z of zs) candidates.push([x, y, z])
  }
  // Se ambos os pontos estão dentro de um armário (`enclosureWall`), nunca gera candidatos fora das paredes dele!
  const leftW = boxes.find(w => w.enclosureWall === 'left' && a[0] > w.max.x && b[0] > w.max.x && a[1] > w.min.y && a[1] < w.max.y)
  const rightW = leftW ? boxes.find(w => w.componentId === leftW.componentId && w.enclosureWall === 'right' && a[0] < w.min.x && b[0] < w.min.x) : undefined
  const botW = rightW ? boxes.find(w => w.componentId === leftW!.componentId && w.enclosureWall === 'bottom' && a[1] > w.max.y && b[1] > w.max.y) : undefined
  const topW = rightW ? boxes.find(w => w.componentId === leftW!.componentId && w.enclosureWall === 'top' && a[1] < w.min.y && b[1] < w.min.y) : undefined
  const inBounds = (p: Point): boolean => {
    if (leftW && rightW) {
      if (p[0] <= leftW.max.x + 1e-4 || p[0] >= rightW.min.x - 1e-4) return false
      if (botW && p[1] <= botW.max.y + 1e-4) return false
      if (topW && p[1] >= topW.min.y - 1e-4) return false
    }
    return true
  }
  const dedupPool = (pool: Point[]): Point[] => {
    const out: Point[] = []
    const seen = new Set<string>()
    for (const p of pool) {
      if (!inBounds(p)) continue
      const k = `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)},${Math.round(p[2] * 100)}`
      if (seen.has(k)) continue
      seen.add(k)
      if (!boxes.some(box => box.containsPoint(vec(p)))) out.push(p)
    }
    return out
  }
  const search = (pool: Point[]): Point[] => {
    const nodes = [a, b, ...dedupPool(pool)]
    const costs = nodes.map(() => Infinity), previous = nodes.map(() => -1), visited = new Uint8Array(nodes.length)
    costs[0] = 0
    for (;;) {
      let current = -1
      for (let i = 0; i < nodes.length; i++) if (!visited[i] && (current < 0 || costs[i] < costs[current])) current = i
      if (current < 0 || !Number.isFinite(costs[current])) return []
      if (current === 1) break
      visited[current] = 1
      const cp = nodes[current]
      for (let i = 0; i < nodes.length; i++) {
        if (visited[i]) continue
        const np = nodes[i]
        const dx = Math.abs(np[0] - cp[0]), dy = Math.abs(np[1] - cp[1]), dz = Math.abs(np[2] - cp[2])
        const dist = Math.hypot(dx, dy, dz)
        const diagPenalty = Math.min(dx, dy) * 0.22 + dz * 0.08
        const cost = costs[current] + dist + diagPenalty
        if (cost < costs[i] && clear(cp, np)) { costs[i] = cost; previous[i] = current }
      }
    }
    const result: Point[] = []
    for (let i = 1; i >= 0; i = previous[i]) result.unshift(nodes[i])
    return result
  }
  const fast = search(candidates)
  if (fast.length) return fast
  // 2.º nível: vizinhança alargada (sem paredes de armário alheias) — rápido e sem atravessar o quadro todo.
  const nbMinX = Math.min(a[0], b[0]) - 0.65, nbMaxX = Math.max(a[0], b[0]) + 0.65
  const nbMinY = Math.min(a[1], b[1]) - 0.65, nbMaxY = Math.max(a[1], b[1]) + 0.65
  const nearBoxes = boxes.filter(b => !b.enclosureWall && b.max.x >= nbMinX && b.min.x <= nbMaxX && b.max.y >= nbMinY && b.min.y <= nbMaxY)
  if (nearBoxes.length > 0) {
    const midFront = Math.max(localFront, ...nearBoxes.map(box => box.max.z)) + gap
    const mid: Point[] = [...candidates, [a[0], a[1], midFront], [b[0], b[1], midFront], [a[0], b[1], midFront], [b[0], a[1], midFront]]
    for (const box of nearBoxes.slice(0, 10)) {
      for (const x of [box.min.x - gap, box.max.x + gap])
        for (const y of [box.min.y - gap, box.max.y + gap]) mid.push([x, y, midFront], [x, y, box.max.z + gap])
    }
    const med = search(mid)
    if (med.length) return med
  }
  // 3.º nível: fallback global garantido.
  const nonWall = boxes.filter(b => !b.enclosureWall)
  const fallbackFront = Math.max(localFront, ...(nonWall.length ? nonWall : boxes).map(box => box.max.z)) + gap
  const full: Point[] = [[a[0], a[1], fallbackFront], [b[0], b[1], fallbackFront], [a[0], b[1], fallbackFront], [b[0], a[1], fallbackFront]]
  for (const box of (nonWall.length ? nonWall : boxes).slice(0, 14)) {
    for (const x of [box.min.x - gap, box.max.x + gap])
      for (const y of [box.min.y - gap, box.max.y + gap]) full.push([x, y, box.max.z + gap])
  }
  return search(full)
}

export function isWireOutsideSolids(points: Point[], outerMm: number, obstacles: SolidWireBox[], exits: [SocketExit, SocketExit]): boolean {
  if (points.length < 2) return true
  return clearWithSockets(points, obstacles, exits, outerMm * 0.005 + 0.025)
}

export function keepWireOutsideSolids(points: Point[], outerMm: number, obstacles: SolidWireBox[], exits: [SocketExit, SocketExit], minZ: number, track = 0): Point[] {
  if (points.length < 2) return points
  const solids = obstacles
  const pad = outerMm * 0.005 + 0.025
  if (clearWithSockets(points,solids,exits,pad)) return points
  const activeSolids = solids.filter(box => !isBypassedSolid(box, exits))
  const boxes = activeSolids.map(box => {
    const c = box.clone().expandByScalar(pad) as SolidWireBox
    c.enclosureWall = box.enclosureWall
    c.duct = box.duct
    return c
  })
  const ownA = !exits[0].glandBypass ? solids.find(box => box.componentId === exits[0].componentId && !box.enclosureWall && !box.duct)?.clone().expandByScalar(pad) : undefined
  const ownB = !exits[1].glandBypass ? solids.find(box => box.componentId === exits[1].componentId && !box.enclosureWall && !box.duct)?.clone().expandByScalar(pad) : undefined
  const a = exits[0].glandBypass ? points[0] : socketEscape(points[0], exits[0], solids, pad)
  const b = exits[1].glandBypass ? points[points.length - 1] : socketEscape(points[points.length - 1], exits[1], solids, pad)
  // A primeira/última saída é axial; as curvas nunca herdam uma zona de exclusão
  // esférica que permita regressar ao interior do próprio aparelho.
  let first = 1, last = points.length - 2
  while (first <= last && ownA?.containsPoint(vec(points[first]))) first++
  while (last >= first && ownB?.containsPoint(vec(points[last]))) last--
  const middle = [a, ...points.slice(first, last + 1), b]
  const finish = (path: Point[]) => {
    const departure = exits[0].glandBypass ? [] : Array.from({length:10},(_,i)=>tuple(vec(points[0]).lerp(vec(a),i/10)))
    const arrival = exits[1].glandBypass ? [] : Array.from({length:10},(_,i)=>tuple(vec(b).lerp(vec(points[points.length-1]),i/10)))
    const result = [...departure,...path,...arrival,points[points.length-1]].filter((p,i,all)=>i===0||vec(p).distanceToSquared(vec(all[i-1]))>1e-10)
    return clearWithSockets(result,solids,exits,pad) ? result : []
  }
  if (pathEntersBoxes(middle, boxes)) {
    // Uma curva junto a um borne pode tocar num único volume. Reparar apenas
    // esse intervalo conserva o corredor planeado e os pontos do utilizador;
    // substituir o percurso inteiro criava diagonais longas por cima do painel.
    const repaired: Point[] = [middle[0]]
    let possible = true
    for (let i = 1; i < middle.length; i++) {
      const start = repaired[repaired.length - 1]
      if (!boxes.some(box => segmentEntersBox(start, middle[i], box))) {
        repaired.push(middle[i])
        continue
      }
      while (i < middle.length - 1 && boxes.some(box => box.containsPoint(vec(middle[i])))) i++
      const local = routeOutside(start, middle[i], boxes, minZ, track)
      if (!local.length) { possible = false; break }
      repaired.push(...local.slice(1))
    }
    if (possible) {
      const result = finish(repaired)
      if (result.length) return result
    }
    const detour = routeOutside(a, b, boxes, minZ, track)
    if (!detour.length) return []
    return finish(detour)
  }
  return finish(middle)
}
