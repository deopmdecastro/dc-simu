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
  const hallWidth = Math.max(42, plateWidth + 24)
  const hallDepth = Math.max(32, hallWidth * 0.72)
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
