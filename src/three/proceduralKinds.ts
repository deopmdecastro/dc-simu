/**
 * Tipos com captura procedural (geometria própria, sem GLB).
 * Predicado leve, sem dependências — partilhado pelo turntable, pelo gerador
 * de capas (cad3DImage) e por proceduralCaptureObject.
 */
import { isConduitStructureType, isWireMeshTrayType } from './structuresModel'
import { isMechatronicsType } from './mechatronicsModel'

export function hasProceduralCapture(type: string): boolean {
  return isConduitStructureType(type) || isWireMeshTrayType(type) || type === 'hydraulicFlowMeter' || type === 'waterSupplyBox'
    || type === 'airCompressor' || type === 'pneumaticManifold'
    || type === 'pneumaticTee' || type === 'pneumaticUnion' || type === 'pneumaticElbow' || type === 'pneumaticY'
    || type === 'wago221_2' || type === 'wago221_3' || type === 'wago221_5' || type === 'wago221_inline' || type === 'wago221_double'
    || type === 'sensorMountBalluff'
    || isMechatronicsType(type)
}
