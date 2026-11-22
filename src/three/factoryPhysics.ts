import { PLATE_TOP } from './panelBounds'
import { isFloorMountedMachineType } from './conveyorModel'
import { isFloorGroundedStructureType } from './structuresModel'

export interface Vec3U {
  x: number
  y: number
  z: number
}

export interface FactoryRoomBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
}

export interface SolidObstacle3D {
  id: string
  type: string
  center: Vec3U
  size: Vec3U
}

/**
 * Calcula os limites interiores exatos do pavilhão fabril 3D (espelhando FactoryEnvironment3D.tsx).
 * Todas as medidas estão em unidades de cena (1 u = 100 mm).
 */
export function computeFactoryRoomBounds(
  plateWidth: number,
  wallFrontZ: number,
  floorY: number,
): FactoryRoomBounds {
  // Teto na largura/profundidade: evita que um interruptor de parede ou pivot extremo
  // abra o pavilhão de forma assimétrica (esquerda cresce, direita bloqueia).
  const hallWidth = Math.min(96, Math.max(42, plateWidth + 24))
  const hallDepth = Math.min(56, Math.max(32, hallWidth * 0.72))
  const wallHeight = Math.max(14.5, PLATE_TOP - floorY + 8.5)
  const wallMargin = 0.22 // folga interior face às paredes laterais/frontal/teto
  return {
    minX: -hallWidth / 2 + wallMargin,
    maxX: hallWidth / 2 - wallMargin,
    minY: floorY,
    maxY: floorY + wallHeight - 0.35,
    minZ: wallFrontZ + 0.02,
    maxZ: wallFrontZ + hallDepth - 0.65 - wallMargin,
  }
}

/** Dimensões interiores fixas da nave fabril, em metros (guardadas no projeto). */
export interface FactoryHallSize {
  widthM: number
  depthM: number
  heightM: number
}

/** Limites aceites no editor de dimensões (m). 1 unidade de cena = 100 mm. */
export const FACTORY_HALL_LIMITS_M = {
  widthM: { min: 4, max: 20 },
  depthM: { min: 3, max: 14 },
  heightM: { min: 1.5, max: 4 },
} as const

const M_TO_U = 10

/** Valida/limita um tamanho vindo do ficheiro de projeto ou do formulário; `null` = automático. */
export function normalizeFactoryHallSize(raw: unknown): FactoryHallSize | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const pick = (key: keyof FactoryHallSize) => {
    const n = Number(value[key])
    if (!Number.isFinite(n)) return null
    const { min, max } = FACTORY_HALL_LIMITS_M[key]
    return Math.round(Math.min(max, Math.max(min, n)) * 10) / 10
  }
  const widthM = pick('widthM'), depthM = pick('depthM'), heightM = pick('heightM')
  return widthM === null || depthM === null || heightM === null ? null : { widthM, depthM, heightM }
}

export interface FactoryHallLayoutInput {
  center: [number, number, number]
  wallFrontZ: number
  floorY: number
  mountBounds: { minX: number; maxX: number; minY: number; maxY: number } | null
  sceneSpan?: { minX: number; maxX: number; maxZ: number } | null
  /** Tamanho fixado pelo utilizador: a nave deixa de crescer com os equipamentos. */
  fixedSize?: FactoryHallSize | null
}

export interface FactoryHallLayout {
  leftWallX: number
  rightWallX: number
  cx: number
  hallWidth: number
  hallDepth: number
  wallHeight: number
  fixed: boolean
}

/**
 * Geometria da nave fabril (unidades de cena), partilhada pelo cenário 3D e pelos limites físicos.
 * Automático: envolve quadros, reservatórios e máquinas com folga e teto. Fixo: tamanho escolhido,
 * centrado no quadro elétrico — mover equipamentos não altera a nave.
 */
export function computeFactoryHallLayout({ center, wallFrontZ, floorY, mountBounds, sceneSpan, fixedSize }: FactoryHallLayoutInput): FactoryHallLayout {
  const panelX = fixedSize ? 0 : center[0]
  const panelMinX = mountBounds ? mountBounds.minX : panelX - 4.0
  const panelMaxX = mountBounds ? mountBounds.maxX : panelX + 4.0
  const panelTop = mountBounds ? mountBounds.maxY : center[1] + 5.5
  const minWallHeight = Math.max(panelTop - floorY + 1.6, 0)

  if (fixedSize) {
    // Âncora estável: o quadro na parede (não depende dos equipamentos móveis).
    const anchorX = mountBounds ? (mountBounds.minX + mountBounds.maxX) / 2 : 0
    const hallWidth = Math.max(fixedSize.widthM * M_TO_U, panelMaxX - panelMinX + 4)
    return {
      leftWallX: anchorX - hallWidth / 2,
      rightWallX: anchorX + hallWidth / 2,
      cx: anchorX,
      hallWidth,
      hallDepth: fixedSize.depthM * M_TO_U,
      wallHeight: Math.max(fixedSize.heightM * M_TO_U, minWallHeight),
      fixed: true,
    }
  }

  const panelW = Math.max(2.6, panelMaxX - panelMinX)
  // Contribuição do sceneSpan limitada: no máximo ~22 u para além do quadro em cada lado.
  const SPAN_EXTRA = 22
  const spanMinX = sceneSpan && Number.isFinite(sceneSpan.minX) ? Math.max(sceneSpan.minX, panelMinX - SPAN_EXTRA) : panelMinX
  const spanMaxX = sceneSpan && Number.isFinite(sceneSpan.maxX) ? Math.min(sceneSpan.maxX, panelMaxX + SPAN_EXTRA) : panelMaxX
  const contentMinX = Math.min(panelMinX - panelW * 0.65, spanMinX)
  const contentMaxX = Math.max(panelMaxX + panelW * 0.15, spanMaxX)
  // Base mínima simétrica ±21 u em torno do centro; expandir só o necessário e com teto.
  const HALL_HALF_MIN = 21
  const HALL_HALF_MAX = 48
  let leftWallX = Math.min(center[0] - HALL_HALF_MIN, contentMinX - 8.5)
  let rightWallX = Math.max(center[0] + HALL_HALF_MIN, contentMaxX + 8.5)
  leftWallX = Math.max(leftWallX, center[0] - HALL_HALF_MAX)
  rightWallX = Math.min(rightWallX, center[0] + HALL_HALF_MAX)
  // Garantir largura mínima e simetria razoável (evita «só um lado cresce»).
  if (rightWallX - leftWallX < HALL_HALF_MIN * 2) {
    const mid = (leftWallX + rightWallX) / 2
    leftWallX = mid - HALL_HALF_MIN
    rightWallX = mid + HALL_HALF_MIN
  }
  const rawDepth = sceneSpan && Number.isFinite(sceneSpan.maxZ) ? sceneSpan.maxZ - wallFrontZ : 16
  return {
    leftWallX,
    rightWallX,
    cx: (leftWallX + rightWallX) / 2,
    hallWidth: Math.max(42, rightWallX - leftWallX),
    hallDepth: Math.max(32, Math.min(56, rawDepth + 14)),
    wallHeight: Math.max(14.5, panelTop - floorY + 5.2),
    fixed: false,
  }
}

/** Limites interiores exatos de uma nave com tamanho fixo (mesma geometria do cenário 3D). */
export function factoryRoomBoundsFromLayout(layout: FactoryHallLayout, wallFrontZ: number, floorY: number): FactoryRoomBounds {
  const wallMargin = 0.22
  return {
    minX: layout.leftWallX + wallMargin,
    maxX: layout.rightWallX - wallMargin,
    minY: floorY,
    maxY: floorY + layout.wallHeight - 0.35,
    minZ: wallFrontZ + 0.02,
    maxZ: wallFrontZ + layout.hallDepth - 0.65 - wallMargin,
  }
}

/** Converte a geometria atual (u) em metros para pré-preencher o editor ao fixar o tamanho. */
export function factoryHallSizeFromLayout(layout: FactoryHallLayout): FactoryHallSize {
  return normalizeFactoryHallSize({ widthM: layout.hallWidth / M_TO_U, depthM: layout.hallDepth / M_TO_U, heightM: layout.wallHeight / M_TO_U })!
}

/**
 * Componentes sólidos 3D que não podem atravessar-se uns aos outros no chão/paredes do pavilhão.
 * Exclui propositadamente bóias (que entram no reservatório), conectores WAGO (que entram em caixas OBO),
 * e tubos/esteiras/abraçadeiras/paredes (que se encaixam entre si).
 */
export function isSolidCollisionComponentType(type: string): boolean {
  return (
    type === 'waterTank' ||
    type === 'waterPump' ||
    type === 'waterSupplyBox' ||
    type === 'hydraulicValve' ||
    type === 'hydraulicTee' ||
    type === 'hydraulicFlowMeter' ||
    type === 'pneumaticFrl' ||
    type === 'pneumaticValve52' ||
    type === 'pneumaticCylinder' ||
    type === 'electricCylinderEpcs' ||
    type === 'pneumaticGuidedCylinder' ||
    type === 'pneumaticManifold' ||
    type === 'airCompressor' ||
    type === 'rollerConveyor' ||
    type === 'motor3ph' ||
    type === 'motor1ph' ||
    type === 'junctionBoxOboT60' ||
    type === 'junctionBoxOboA6' ||
    type === 'junctionBoxOboT25' ||
    type === 'triProofLedBatten' ||
    type === 'industrialPillar'
  )
}

/**
 * Restringe um centro 3D de modo a que todo o volume do componente permaneça dentro do pavilhão fabril.
 * Quando `allowOutside === true`, o utilizador autorizou explicitamente sair dos limites.
 */
export function clampPositionToFactoryRoom(
  pos: Vec3U,
  size: Vec3U,
  bounds: FactoryRoomBounds,
  allowOutside = false,
): Vec3U {
  if (allowOutside) return { ...pos }
  const hx = Math.max(0.1, size.x * 0.5)
  const hy = Math.max(0.1, size.y * 0.5)
  const hz = Math.max(0.1, size.z * 0.5)

  const minX = bounds.minX + hx
  const maxX = Math.max(minX, bounds.maxX - hx)
  const minY = bounds.minY + hy
  const maxY = Math.max(minY, bounds.maxY - hy)
  const minZ = bounds.minZ + hz
  const maxZ = Math.max(minZ, bounds.maxZ - hz)

  return {
    x: Math.max(minX, Math.min(maxX, pos.x)),
    y: Math.max(minY, Math.min(maxY, pos.y)),
    z: Math.max(minZ, Math.min(maxZ, pos.z)),
  }
}

/**
 * Resolve colisões AABB entre um componente sólido em movimento e todos os outros componentes sólidos,
 * empurrando pelo vetor mínimo de separação (preferencialmente no plano XZ para equipamentos de chão)
 * e garantindo que o resultado final respeita os limites do pavilhão.
 */
export function resolveFactoryPlacement3D(params: {
  movingId: string
  movingType: string
  candidate: Vec3U
  movingSize: Vec3U
  obstacles: SolidObstacle3D[]
  bounds: FactoryRoomBounds
  allowOutside?: boolean
  floorLocked?: boolean
  clearanceU?: number
}): Vec3U {
  const {
    movingId,
    movingType,
    candidate,
    movingSize,
    obstacles,
    bounds,
    allowOutside = false,
    floorLocked = false,
    clearanceU = 0.06,
  } = params

  let cur = clampPositionToFactoryRoom(candidate, movingSize, bounds, allowOutside)
  if (!isSolidCollisionComponentType(movingType)) return cur

  const mHx = Math.max(0.12, movingSize.x * 0.5)
  const mHy = Math.max(0.12, movingSize.y * 0.5)
  const mHz = Math.max(0.12, movingSize.z * 0.5)

  const solidObstacles = obstacles.filter(
    (o) => o.id !== movingId && isSolidCollisionComponentType(o.type),
  )

  for (let iter = 0; iter < 6; iter += 1) {
    let pushed = false
    for (const obs of solidObstacles) {
      const oHx = Math.max(0.12, obs.size.x * 0.5)
      const oHy = Math.max(0.12, obs.size.y * 0.5)
      const oHz = Math.max(0.12, obs.size.z * 0.5)

      const dx = cur.x - obs.center.x
      const dy = cur.y - obs.center.y
      const dz = cur.z - obs.center.z

      const overlapX = mHx + oHx + clearanceU - Math.abs(dx)
      const overlapY = mHy + oHy + clearanceU - Math.abs(dy)
      const overlapZ = mHz + oHz + clearanceU - Math.abs(dz)

      if (overlapX > 0 && overlapY > 0 && overlapZ > 0) {
        pushed = true
        // Para equipamentos apoiados no chão (ex.: reservatórios), separar no plano horizontal XZ
        const canUseY = !floorLocked && overlapY < overlapX && overlapY < overlapZ
        if (canUseY) {
          cur.y += (dy >= 0 ? 1 : -1) * overlapY
        } else if (overlapX <= overlapZ) {
          const signX = dx === 0 ? 1 : Math.sign(dx)
          cur.x += signX * overlapX
        } else {
          const signZ = dz === 0 ? 1 : Math.sign(dz)
          cur.z += signZ * overlapZ
        }
        cur = clampPositionToFactoryRoom(cur, movingSize, bounds, allowOutside)
      }
    }
    if (!pushed) break
  }

  return cur
}

/**
 * Assenta no pavimento do pavilhão (Y bloqueado no chão, arrasto livre em XZ): máquinas de chão,
 * paredes/pilares e o armário do contador de água, exceto quando o utilizador o marca como fixo
 * na parede (`mounting: 'wall'`, altura ajustável com Shift + arrastar).
 */
export function isFloorStandingComponent(component: { type: string; state?: Record<string, unknown> }): boolean {
  return isFloorMountedMachineType(component.type)
    || isFloorGroundedStructureType(component.type)
    || (component.type === 'waterSupplyBox' && component.state?.mounting !== 'wall')
}
