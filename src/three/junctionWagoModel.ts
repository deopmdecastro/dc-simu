import type { ElectricalComponent, SpatialPoint3D } from '../types'
import { waterTankDimensionsOf } from './hydraulicsModel'
import { PANEL_UNITS_PER_MM } from './modelPaths'
import { structureComponentSizeMm } from './structuresModel'

export type JunctionBoxType =
  | 'junctionBoxOboT60'
  | 'junctionBoxOboA6'
  | 'junctionBoxOboT25'

export type WagoConnectorType =
  | 'wago221_2'
  | 'wago221_5'
  | 'wago221_inline'
  | 'wago221_double'

export type JunctionOrWagoType = JunctionBoxType | WagoConnectorType

export function isJunctionBoxType(type: string): type is JunctionBoxType {
  return (
    type === 'junctionBoxOboT60' ||
    type === 'junctionBoxOboA6' ||
    type === 'junctionBoxOboT25'
  )
}

export function isWagoConnectorType(type: string): type is WagoConnectorType {
  return (
    type === 'wago221_2' ||
    type === 'wago221_5' ||
    type === 'wago221_inline' ||
    type === 'wago221_double'
  )
}

export function isJunctionOrWagoType(type: string): type is JunctionOrWagoType {
  return isJunctionBoxType(type) || isWagoConnectorType(type)
}

export type JunctionLidSticker =
  | 'none'
  | 'warning-bolt'
  | '230v'
  | '400v'
  | '24v'
  | 'command'
  | 'hydraulics'

/** Dimensões reais (ligeiramente ampliadas nos WAGOs para conforto visual e ligação de bornes 3D) */
export const JUNCTION_WAGO_SIZE_MM: Record<JunctionOrWagoType, { x: number; y: number; z: number }> = {
  junctionBoxOboT60: { x: 136, y: 136, z: 68 },
  junctionBoxOboA6: { x: 112, y: 66, z: 48 },
  junctionBoxOboT25: { x: 102, y: 102, z: 54 },
  wago221_2: { x: 34, y: 24, z: 36 },
  wago221_5: { x: 64, y: 24, z: 36 },
  wago221_inline: { x: 66, y: 20, z: 22 },
  wago221_double: { x: 66, y: 38, z: 40 },
}

export function junctionWagoSizeMm(type: string): { x: number; y: number; z: number } | null {
  if (isJunctionOrWagoType(type)) return { ...JUNCTION_WAGO_SIZE_MM[type] }
  return null
}

export interface JunctionWagoDatasheetInfo {
  path: string
  name: string
  manufacturer: string
  model: string
  summary: string
}

export const JUNCTION_WAGO_DATASHEETS: Record<JunctionOrWagoType, JunctionWagoDatasheetInfo> = {
  junctionBoxOboT60: {
    path: '/datasheets/junction-wago/obo-t60-ip66.pdf',
    name: 'OBO Bettermann T60 · Caixa de Derivação IP66 500V (Ficha Técnica).pdf',
    manufacturer: 'OBO Bettermann',
    model: 'T60 · 114×114×57 mm · IP66',
    summary: 'Caixa de derivação estanque IP66 · 7 membranas + bucins M20/PG · Tampa removível 1/4 de volta + etiquetas',
  },
  junctionBoxOboA6: {
    path: '/datasheets/junction-wago/obo-a6-ip55.pdf',
    name: 'OBO Bettermann A6 · Caixa de Derivação Compacta IP55 400V (Ficha Técnica).pdf',
    manufacturer: 'OBO Bettermann',
    model: 'A6 · 80×43×34 mm · IP55',
    summary: 'Caixa retangular compacta 400V · 2,5 mm² · Patilha lateral + membranas/bucins + tampa removível',
  },
  junctionBoxOboT25: {
    path: '/datasheets/junction-wago/obo-t25-round-ip55.pdf',
    name: 'OBO Bettermann T25 · Caixa de Derivação Redonda IP55 (Ficha Técnica).pdf',
    manufacturer: 'OBO Bettermann',
    model: 'T25 · Ø80×44 mm · IP55',
    summary: 'Caixa redonda de derivação IP55 · 4 entradas radiais + bucins PG · Tampa redonda removível + adesivos',
  },
  wago221_2: {
    path: '/datasheets/junction-wago/wago-221-412.pdf',
    name: 'WAGO 221-412 · Conector de Alavanca 2 Condutores 32A (Ficha Técnica).pdf',
    manufacturer: 'WAGO',
    model: '221-412 · 2× 0,2–4 mm² · 450V 32A',
    summary: 'Conector transparente de alavanca laranja · 2 vias comuns · CAGE CLAMP · Alojável em caixa OBO ou quadro',
  },
  wago221_5: {
    path: '/datasheets/junction-wago/wago-221-415.pdf',
    name: 'WAGO 221-415 · Conector de Alavanca 5 Condutores 32A (Ficha Técnica).pdf',
    manufacturer: 'WAGO',
    model: '221-415 · 5× 0,2–4 mm² · 450V 32A',
    summary: 'Conector transparente de 5 alavancas laranja · 5 vias comuns · CAGE CLAMP · Alojável em caixa OBO ou quadro',
  },
  wago221_inline: {
    path: '/datasheets/junction-wago/wago-221-2411-inline.pdf',
    name: 'WAGO 221-2411 · Conector Inline 2 Condutores 32A (Ficha Técnica).pdf',
    manufacturer: 'WAGO',
    model: '221-2411 · Inline 0,2–4 mm² · 450V 32A',
    summary: 'Emenda linear transparente compacta com 2 alavancas opostas · Ideal para caixas A6 / T25 / T60',
  },
  wago221_double: {
    path: '/datasheets/junction-wago/wago-221-double-5x2.pdf',
    name: 'WAGO 221-415 Duplo · Bloco de Alavanca 2×5 Condutores 32A (Ficha Técnica).pdf',
    manufacturer: 'WAGO',
    model: '221-415 2×5 · 10 vias · 450V 32A',
    summary: 'Bloco transparente duplo de alavancas laranja (5 pares independentes ou barramento comum) · 32A 450V',
  },
}

/**
 * Fixação rápida de caixa de derivação OBO numa superfície próxima:
 * parede industrial modular, esteira de cabos, lateral do reservatório de água ou parede do pavilhão.
 */
export function computeJunctionBoxSurfaceSnap(
  box: ElectricalComponent,
  allComponents: ElectricalComponent[],
  currentPos: SpatialPoint3D,
  factoryWallFrontZ: number,
): { position: SpatialPoint3D; surfaceLabel: string } {
  const U = PANEL_UNITS_PER_MM
  const sz = JUNCTION_WAGO_SIZE_MM[box.type as JunctionBoxType] ?? JUNCTION_WAGO_SIZE_MM.junctionBoxOboT60
  const halfX = (sz.x * U) / 2
  const halfZ = (sz.z * U) / 2

  let bestPos: SpatialPoint3D = { x: currentPos.x, y: currentPos.y, z: factoryWallFrontZ + halfZ + 0.03 }
  let bestDist = Math.abs(currentPos.z - bestPos.z) + 1.2
  let bestLabel = 'Parede do pavilhão'

  for (const other of allComponents) {
    if (other.id === box.id) continue
    const op = other.panel3DPosition
    if (!op) continue

    if (other.type === 'waterTank') {
      const dims = waterTankDimensionsOf(other.state)
      const r = (dims.diameterMm / 2) * U
      const h = dims.totalHeightMm * U
      // Fixar na lateral direita/frontal do reservatório a 78% da altura (ideal para receber fios da bóia!)
      const target: SpatialPoint3D = {
        x: op.x + r + halfX + 0.14,
        y: op.y + h * 0.28,
        z: op.z + r * 0.28,
      }
      const d = Math.hypot(currentPos.x - op.x, currentPos.z - op.z)
      if (d < r + 5.5 && d < bestDist) {
        bestDist = d
        bestPos = target
        bestLabel = `Reservatório ${other.ref}`
      }
    } else if (other.type === 'industrialWall') {
      const wd = structureComponentSizeMm('industrialWall', other.state) ?? { x: 2000, y: 2400, z: 180 }
      const tHalf = (wd.z * U) / 2
      const target: SpatialPoint3D = {
        x: Math.max(op.x - (wd.x * U) / 2 + halfX, Math.min(op.x + (wd.x * U) / 2 - halfX, currentPos.x)),
        y: Math.max(op.y - (wd.y * U) / 2 + 0.5, Math.min(op.y + (wd.y * U) / 2 - 0.5, currentPos.y)),
        z: op.z + tHalf + halfZ + 0.03,
      }
      const d = Math.hypot(currentPos.x - target.x, currentPos.z - target.z)
      if (d < bestDist) {
        bestDist = d
        bestPos = target
        bestLabel = `Parede ${other.ref}`
      }
    } else if (other.type === 'cableTrayStraight' || other.type === 'cableTrayElbow90') {
      const td = structureComponentSizeMm(other.type, other.state) ?? { x: 1000, y: 60, z: 200 }
      const trayFrontZ = op.z + (td.z * U) / 2
      const target: SpatialPoint3D = {
        x: currentPos.x,
        y: op.y,
        z: trayFrontZ + halfZ + 0.04,
      }
      const d = Math.hypot(currentPos.x - op.x, currentPos.y - op.y, currentPos.z - op.z)
      if (d < bestDist) {
        bestDist = d
        bestPos = target
        bestLabel = `Esteira ${other.ref}`
      }
    }
  }

  return {
    position: {
      x: Math.round(bestPos.x * 20) / 20,
      y: Math.round(bestPos.y * 20) / 20,
      z: Math.round(bestPos.z * 20) / 20,
    },
    surfaceLabel: bestLabel,
  }
}
