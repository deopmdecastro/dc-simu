import type { ElectricalComponent } from '../types'
import { isDinRail, isRailMountable } from '../three/railMount'

/** Folga visual mínima entre equipamentos no Esquema (px do canvas). */
export const COMPONENT_COLLISION_GAP = 4

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
  // Um componente trazido para a frente fica por cima: a sobreposição com o
  // que está por baixo passa a ser intencional.
  if (a.allowOverlap || b.allowOverlap) return true
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
  return boundsOverlap(componentBounds2D(a), componentBounds2D(b), gap)
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
  return obstaclesFor(component, all, ignoreIds).every((other) => !boundsOverlap(candidate, componentBounds2D(other), gap))
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
    const obstacle = componentBounds2D(other)
    // Projetos antigos podem já conter sobreposições: nunca os aprisionar;
    // permite-se sair, mas não criar uma nova interseção.
    if (boundsOverlap(start, obstacle, gap)) continue
    const orthogonal = axis === 'x'
      ? orthogonalOverlap(start.top, start.bottom, obstacle.top, obstacle.bottom, gap)
      : orthogonalOverlap(start.left, start.right, obstacle.left, obstacle.right, gap)
    if (!orthogonal) continue
    if (axis === 'x' && delta > 0 && start.right <= obstacle.left) allowed = Math.min(allowed, obstacle.left - gap - start.right)
    if (axis === 'x' && delta < 0 && start.left >= obstacle.right) allowed = Math.max(allowed, obstacle.right + gap - start.left)
    if (axis === 'y' && delta > 0 && start.bottom <= obstacle.top) allowed = Math.min(allowed, obstacle.top - gap - start.bottom)
    if (axis === 'y' && delta < 0 && start.top >= obstacle.bottom) allowed = Math.max(allowed, obstacle.bottom + gap - start.top)
  }
  return axis === 'x' ? { x: x + allowed, y } : { x, y: y + allowed }
}

/**
 * Resolve o movimento por varrimento de caixas, impedindo atravessar outro
 * equipamento mesmo quando o cursor salta vários píxeis entre eventos.
 * Testa X→Y e Y→X para permitir deslizar naturalmente junto aos bordos.
 */
export function resolveComponentMove(
  component: ElectricalComponent,
  targetX: number,
  targetY: number,
  all: ElectricalComponent[],
  ignoreIds: ReadonlySet<string> = new Set(),
  gap = COMPONENT_COLLISION_GAP,
): { x: number; y: number; blocked: boolean } {
  const obstacles = obstaclesFor(component, all, ignoreIds)
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
  // Segurança final para cantos/caixas inicialmente inválidas.
  if (!componentPositionIsFree(component, best.x, best.y, all, ignoreIds, gap)
    && componentPositionIsFree(component, component.schematicX, component.schematicY, all, ignoreIds, gap)) {
    best = { x: component.schematicX, y: component.schematicY }
  }
  return { ...best, blocked: Math.abs(best.x - targetX) > 0.01 || Math.abs(best.y - targetY) > 0.01 }
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
