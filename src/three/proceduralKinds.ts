/**
 * Tipos com captura procedural (geometria própria, sem GLB).
 * Predicado leve, sem dependências — partilhado pelo turntable, pelo gerador
 * de capas (cad3DImage) e por proceduralCaptureObject.
 */
import { isConduitStructureType, isWireMeshTrayType } from './structuresModel'

export function hasProceduralCapture(type: string): boolean {
  return isConduitStructureType(type) || isWireMeshTrayType(type) || type === 'hydraulicFlowMeter' || type === 'waterSupplyBox'
    || type === 'airCompressor' || type === 'pneumaticManifold'
    || type === 'pneumaticTee' || type === 'pneumaticUnion' || type === 'pneumaticElbow' || type === 'pneumaticY'
}
