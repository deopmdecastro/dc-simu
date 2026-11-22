import type { ComponentType } from '../types'
import { isMechatronicsType } from './mechatronicsModel'
import { hasComponent3DModel } from './modelPaths'
import { isHydraulicComponentType } from './hydraulicsModel'
import { isPneumaticComponentType } from './pneumaticsModel'
import { isStructureComponentType } from './structuresModel'
import { isJunctionOrWagoType } from './junctionWagoModel'
import { isSocketDevice } from '../electrical/socketDevices'

/** Peças procedurais que ainda só tinham cores planas. Os GLB conservam o seu acabamento próprio. */
export function usesProceduralSurface(type: ComponentType): boolean {
  // Estes acessórios usam a geometria paramétrica no painel, mesmo tendo uma capa GLB.
  if (type === 'panelEnclosure' || type === 'cableDuct' || type === 'spiralWrap') return true
  return !hasComponent3DModel(type) && (isSocketDevice(type) || isHydraulicComponentType(type) || isPneumaticComponentType(type) || isStructureComponentType(type) || isJunctionOrWagoType(type) || isMechatronicsType(type))
}
