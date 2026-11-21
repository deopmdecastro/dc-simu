import type { ElectricalComponent } from '../types'
import { isDinRail, isRailMountable } from '../three/railMount'
import { isPlugInRelay, isRelaySocket } from '../three/relaySocketMount'
import { ENCLOSURE } from '../three/enclosureParts'
import { SCHEMATIC_PX_PER_MM } from '../three/modelPaths'

/** Folga visual mínima entre equipamentos no Esquema (px do canvas). */
export const COMPONENT_COLLISION_GAP = 4

function isFlushTerminalType(type: string): boolean {
  return type === 'terminalPhoenixPti6' || type === 'terminalBlock' || type === 'terminalPE'
}
function effectiveGap(a: ElectricalComponent, b: ElectricalComponent, gap: number): number {
  if (gap !== COMPONENT_COLLISION_GAP) return gap
  return isFlushTerminalType(a.type) && isFlushTerminalType(b.type) ? 0 : gap
}

export interface ComponentBounds2D {
  left: number
  right: number
  top: number
  bottom: number
}

/** Caixa ocupada pelo componente depois da rotação de 0/90/180/270 graus. */
export function componentBounds2D(component: ElectricalComponent, x = component.schematicX, y = component.schematicY): ComponentBounds2D {
  const quarterTurn = Math.round((((component.rotation ?? 0) % 180) + 180) % 180 / 90) % 2 === 1
  const halfWidth = (quarterTurn ? component.h : component.w) / 2
  const halfHeight = (quarterTurn ? component.w : component.h) / 2
  const centerX = x + component.w / 2
  const centerY = y + component.h / 2
  return { left: centerX - halfWidth, right: centerX + halfWidth, top: centerY - halfHeight, bottom: centerY + halfHeight }
}

function isIntentionalMountingOverlap(a: ElectricalComponent, b: ElectricalComponent): boolean {
  // Quadro no Esquema 2D: a moldura desenha o armário; o interior é a chapa de
  // montagem — aparelhos, calhas e acessórios podem sobrepor o footprint do quadro
  // quando estão associados (`enclosureId`) ou são suporte mecânico. O volume 3D
  // das paredes continua sólido (obstáculos em wireGeometry3D).
  if (a.type === 'panelEnclosure' || b.type === 'panelEnclosure') {
    const enclosure = a.type === 'panelEnclosure' ? a : b
    const other = a.type === 'panelEnclosure' ? b : a
    if (other.type === 'panelEnclosure') return true
    if (other.enclosureId === enclosure.id) return true
    // Quadro é sólido: só permite sobreposição quando o outro está totalmente
    // dentro do interior útil (dentro das paredes). Caso contrário bloqueia para
    // não deixar calhas/aparelhos atravessarem a chapa como se não fosse sólido.
    const encBounds = componentBounds2D(enclosure)
    const otherBounds = componentBounds2D(other)
    const inset = (ENCLOSURE.flange + ENCLOSURE.sheet) * SCHEMATIC_PX_PER_MM
    const inside = otherBounds.left >= encBounds.left + inset - COMPONENT_COLLISION_GAP
      && otherBounds.right <= encBounds.right - inset + COMPONENT_COLLISION_GAP
      && otherBounds.top >= encBounds.top + inset - COMPONENT_COLLISION_GAP
      && otherBounds.bottom <= encBounds.bottom - inset + COMPONENT_COLLISION_GAP
    if (inside) return true
    // Fora mas sem sobrepor? Não há colisão. A atravessar a parede? Bloqueia.
    const overlaps = boundsOverlap(encBounds, otherBounds, 0)
    if (overlaps) return false
    // Compatibilidade: projetos antigos sem enclosureId mas desenhados dentro
    // do quadro — se não há sobreposição, não bloqueia.
    return true
  }
  // Calhas técnicas: encontros em T/cruz nos cantos; o corpo da calha é sólido
  // face a aparelhos (não atravessam o PVC).
  if (a.type === 'cableDuct' && b.type === 'cableDuct') return true
  // Relé plug-in ↔ base undecal: o relé entra na frente da base (direção Z no 3D),
  // por isso no Esquema 2D as duas caixas sobrepõem-se quando encaixados.
  if ((isPlugInRelay(a) && isRelaySocket(b)) || (isRelaySocket(a) && isPlugInRelay(b))) return true
  // Só equipamentos próprios para calha DIN podem sobrepor o seu suporte; duas
  // calhas e componentes de montagem em chapa continuam a ser objetos físicos.
  if (isDinRail(a) !== isDinRail(b)) {
    const device = isDinRail(a) ? b : a
    return isRailMountable(device) || a.railId === b.id || b.railId === a.id
  }
  return a.railId === b.id || b.railId === a.id
}

export function boundsOverlap(a: ComponentBounds2D, b: ComponentBounds2D, gap = COMPONENT_COLLISION_GAP): boolean {
  return a.left < b.right + gap && a.right + gap > b.left && a.top < b.bottom + gap && a.bottom + gap > b.top
}

export function componentsOverlap2D(a: ElectricalComponent, b: ElectricalComponent, gap = COMPONENT_COLLISION_GAP): boolean {
  if (a.id === b.id || isIntentionalMountingOverlap(a, b)) return false
  return boundsOverlap(componentBounds2D(a), componentBounds2D(b), effectiveGap(a, b, gap))
}

function obstaclesFor(component: ElectricalComponent, all: ElectricalComponent[], ignoreIds: ReadonlySet<string>) {
  return all.filter((other) => other.id !== component.id && !ignoreIds.has(other.id) && !isIntentionalMountingOverlap(component, other))
}

export function componentPositionIsFree(
  component: ElectricalComponent,
  x: number,
  y: number,
  all: ElectricalComponent[],
  ignoreIds: ReadonlySet<string> = new Set(),
  gap = COMPONENT_COLLISION_GAP,
): boolean {
  const candidate = componentBounds2D(component, x, y)
  return obstaclesFor(component, all, ignoreIds).every((other) => !boundsOverlap(candidate, componentBounds2D(other), effectiveGap(component, other, gap)))
}

function orthogonalOverlap(a0: number, a1: number, b0: number, b1: number, gap: number) {
  return a0 < b1 + gap && a1 + gap > b0
}

function sweepAxis(
  component: ElectricalComponent,
  x: number,
  y: number,
  delta: number,
  axis: 'x' | 'y',
  obstacles: ElectricalComponent[],
  gap: number,
): { x: number; y: number } {
  if (Math.abs(delta) < 1e-9) return { x, y }
  const start = componentBounds2D(component, x, y)
  let allowed = delta
  for (const other of obstacles) {
    const g = effectiveGap(component, other, gap)
    const obstacle = componentBounds2D(other)
    // Projetos antigos podem já conter sobreposições: nunca os aprisionar;
    // permite-se sair, mas não criar uma nova interseção.
    if (boundsOverlap(start, obstacle, g)) continue
    const orthogonal = axis === 'x'
      ? orthogonalOverlap(start.top, start.bottom, obstacle.top, obstacle.bottom, g)
      : orthogonalOverlap(start.left, start.right, obstacle.left, obstacle.right, g)
    if (!orthogonal) continue
    if (axis === 'x' && delta > 0 && start.right <= obstacle.left) allowed = Math.min(allowed, obstacle.left - g - start.right)
    if (axis === 'x' && delta < 0 && start.left >= obstacle.right) allowed = Math.max(allowed, obstacle.right + g - start.left)
    if (axis === 'y' && delta > 0 && start.bottom <= obstacle.top) allowed = Math.min(allowed, obstacle.top - g - start.bottom)
    if (axis === 'y' && delta < 0 && start.top >= obstacle.bottom) allowed = Math.max(allowed, obstacle.bottom + g - start.top)
  }
  return axis === 'x' ? { x: x + allowed, y } : { x, y: y + allowed }
}

/**
 * Posição final face às paredes dos quadros: totalmente dentro do interior útil ou totalmente
 * fora. Se a caixa ficaria a atravessar uma parede, encaixa dentro quando o centro já está no
 * interior (soltar dentro do quadro) e, caso contrário, encosta por fora pelo lado mais próximo.
 */
function settleAgainstEnclosureWalls(
  component: ElectricalComponent,
  point: { x: number; y: number },
  enclosures: ElectricalComponent[],
): { x: number; y: number } {
  let { x, y } = point
  const inset = (ENCLOSURE.flange + ENCLOSURE.sheet) * SCHEMATIC_PX_PER_MM
  for (const enclosure of enclosures) {
    const outer = componentBounds2D(enclosure)
    const box = componentBounds2D(component, x, y)
    if (!boundsOverlap(outer, box, 0)) continue
    const inner = { left: outer.left + inset, right: outer.right - inset, top: outer.top + inset, bottom: outer.bottom - inset }
    const fitsInside = box.right - box.left <= inner.right - inner.left && box.bottom - box.top <= inner.bottom - inner.top
    const centerX = (box.left + box.right) / 2, centerY = (box.top + box.bottom) / 2
    const centerInside = centerX > inner.left && centerX < inner.right && centerY > inner.top && centerY < inner.bottom
    if (fitsInside && centerInside) {
      if (box.left < inner.left) x += inner.left - box.left
      if (box.right > inner.right) x -= box.right - inner.right
      if (box.top < inner.top) y += inner.top - box.top
      if (box.bottom > inner.bottom) y -= box.bottom - inner.bottom
      continue
    }
    if (box.left >= inner.left && box.right <= inner.right && box.top >= inner.top && box.bottom <= inner.bottom) continue
    // Fora: empurra pelo lado de menor deslocação, com a folga habitual.
    const g = COMPONENT_COLLISION_GAP
    const pushes = [
      { dx: outer.left - g - box.right, dy: 0 },
      { dx: outer.right + g - box.left, dy: 0 },
      { dx: 0, dy: outer.top - g - box.bottom },
      { dx: 0, dy: outer.bottom + g - box.top },
    ].sort((a, b) => Math.abs(a.dx) + Math.abs(a.dy) - Math.abs(b.dx) - Math.abs(b.dy))
    x += pushes[0].dx
    y += pushes[0].dy
  }
  return { x, y }
}

/** Calhas técnicas, calhas DIN e espirais são transponíveis durante o arrasto. */
function isPassableTrack(component: Pick<ElectricalComponent, 'type'>): boolean {
  return component.type === 'cableDuct' || component.type === 'spiralWrap' || isDinRail(component)
}

/**
 * Resolve o movimento por varrimento de caixas, impedindo atravessar outro
 * equipamento mesmo quando o cursor salta vários píxeis entre eventos.
 * Testa X→Y e Y→X para permitir deslizar naturalmente junto aos bordos.
 * Durante o arrasto, permite passar livremente por cima de calhas (técnicas e DIN)
 * e paredes de quadros para levar elementos para dentro ou para fora.
 */
export function resolveComponentMove(
  component: ElectricalComponent,
  targetX: number,
  targetY: number,
  all: ElectricalComponent[],
  ignoreIds: ReadonlySet<string> = new Set(),
  gap = COMPONENT_COLLISION_GAP,
): { x: number; y: number; blocked: boolean } {
  // Paredes de quadros: o aparelho é levantado por cima delas durante o arrasto (não desliza
  // contra a parede exterior, o que impedia levar algo de fora para dentro/fora do quadro). Só a
  // posição final é ajustada para nunca ficar a atravessar a parede.
  const enclosureWalls = component.type === 'panelEnclosure' ? [] : all.filter((other) =>
    other.type === 'panelEnclosure' && other.id !== component.id && !ignoreIds.has(other.id) && component.enclosureId !== other.id)
  const wallIds = new Set(enclosureWalls.map((enclosure) => enclosure.id))
  // Calhas técnicas e calhas DIN: o aparelho pode passar por cima delas ao arrastar
  // (sem ficar bloqueado numa calha horizontal entre duas filas do quadro).
  const passableTrackIds = new Set(
    all.filter((other) => other.id !== component.id && !ignoreIds.has(other.id) && isPassableTrack(other)).map((other) => other.id),
  )
  const dragIgnoreIds = passableTrackIds.size ? new Set([...ignoreIds, ...passableTrackIds]) : ignoreIds
  const obstacles = obstaclesFor(component, all, dragIgnoreIds).filter((other) => !wallIds.has(other.id))
  const dx = targetX - component.schematicX
  const dy = targetY - component.schematicY
  const solve = (first: 'x' | 'y') => {
    let point = { x: component.schematicX, y: component.schematicY }
    point = sweepAxis(component, point.x, point.y, first === 'x' ? dx : dy, first, obstacles, gap)
    const second = first === 'x' ? 'y' : 'x'
    point = sweepAxis(component, point.x, point.y, second === 'x' ? dx : dy, second, obstacles, gap)
    return point
  }
  const xy = solve('x')
  const yx = solve('y')
  const score = (point: { x: number; y: number }) => (point.x - targetX) ** 2 + (point.y - targetY) ** 2
  let best = score(xy) <= score(yx) ? xy : yx
  if (enclosureWalls.length) best = settleAgainstEnclosureWalls(component, best, enclosureWalls)
  // Segurança final para cantos/caixas inicialmente inválidas (avaliada na posição candidata:
  // a regra do quadro depende de o aparelho ficar dentro ou fora do interior útil).
  const isFreeAt = (point: { x: number; y: number }) => {
    const moved = { ...component, schematicX: point.x, schematicY: point.y }
    return componentPositionIsFree(moved, point.x, point.y, all, dragIgnoreIds, gap)
  }
  if (!isFreeAt(best) && isFreeAt({ x: component.schematicX, y: component.schematicY })) {
    best = { x: component.schematicX, y: component.schematicY }
  }
  return { ...best, blocked: Math.abs(best.x - targetX) > 0.01 || Math.abs(best.y - targetY) > 0.01 }
}

/**
 * Pousa o componente EM CIMA do que está por baixo: procura o topo mais alto
 * entre os componentes que a caixa atual intersecta e devolve a posição onde
 * o componente fica assente nesse topo (os corpos são sólidos, nunca entram
 * uns nos outros). Devolve null quando não há nada por baixo.
 */
export function stackOnTopPosition(
  component: ElectricalComponent,
  all: ElectricalComponent[],
  gap = COMPONENT_COLLISION_GAP,
): { x: number; y: number } | null {
  const own = componentBounds2D(component)
  const below = obstaclesFor(component, all, new Set()).filter((other) => boundsOverlap(own, componentBounds2D(other), gap))
  if (!below.length) return null
  const top = Math.min(...below.map((other) => componentBounds2D(other).top))
  const height = own.bottom - own.top
  // `schematicX/Y` é o canto do footprint; a caixa rodada pode ser maior.
  const offsetY = own.top - component.schematicY
  return { x: component.schematicX, y: top - gap - height - offsetY }
}

/** Procura a posição livre mais próxima para inserções e duplicações. */
export function nearestFreeComponentPosition(
  component: ElectricalComponent,
  desiredX: number,
  desiredY: number,
  all: ElectricalComponent[],
  gap = COMPONENT_COLLISION_GAP,
): { x: number; y: number; displaced: boolean } {
  if (componentPositionIsFree(component, desiredX, desiredY, all, new Set(), gap)) return { x: desiredX, y: desiredY, displaced: false }
  const step = Math.max(12, Math.min(40, Math.round(Math.min(component.w, component.h) / 3)))
  for (let ring = 1; ring <= 80; ring += 1) {
    const candidates: Array<{ x: number; y: number }> = []
    for (let index = -ring; index <= ring; index += 1) {
      candidates.push(
        { x: desiredX + index * step, y: desiredY - ring * step },
        { x: desiredX + ring * step, y: desiredY + index * step },
        { x: desiredX + index * step, y: desiredY + ring * step },
        { x: desiredX - ring * step, y: desiredY + index * step },
      )
    }
    for (const candidate of candidates) {
      if (candidate.x < 0 || candidate.y < 0) continue
      if (componentPositionIsFree(component, candidate.x, candidate.y, all, new Set(), gap)) return { ...candidate, displaced: true }
    }
  }
  const halfWidth = (componentBounds2D(component, 0, 0).right - componentBounds2D(component, 0, 0).left) / 2
  const furthestRight = all.reduce((right, other) => Math.max(right, componentBounds2D(other).right), 0)
  return { x: furthestRight + gap + halfWidth - component.w / 2, y: Math.max(0, desiredY), displaced: true }
}
