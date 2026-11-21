import type { ConduitMedium, WireKind } from '../types'

export type HydraulicComponentType =
  | 'floatSwitch'
  | 'waterTank'
  | 'waterPump'
  | 'hydraulicValve'
  | 'hydraulicTee'
  | 'hydraulicFlowMeter'

export function isHydraulicComponentType(type: string): type is HydraulicComponentType {
  return (
    type === 'floatSwitch' ||
    type === 'waterTank' ||
    type === 'waterPump' ||
    type === 'hydraulicValve' ||
    type === 'hydraulicTee' ||
    type === 'hydraulicFlowMeter'
  )
}

export type FlowMeterPipeDN = 'DN25' | 'DN32' | 'DN40' | 'DN50' | 'DN65' | 'DN80'

export const FLOW_METER_PIPE_SPECS: Record<
  FlowMeterPipeDN,
  { innerMm: number; outerMm: number; nominalFlowLpm: number; lengthMm: number; heightMm: number; depthMm: number }
> = {
  DN25: { innerMm: 25, outerMm: 32, nominalFlowLpm: 38, lengthMm: 205, heightMm: 122, depthMm: 86 },
  DN32: { innerMm: 32, outerMm: 40, nominalFlowLpm: 60, lengthMm: 222, heightMm: 132, depthMm: 94 },
  DN40: { innerMm: 40, outerMm: 50, nominalFlowLpm: 95, lengthMm: 242, heightMm: 144, depthMm: 104 },
  DN50: { innerMm: 50, outerMm: 63, nominalFlowLpm: 150, lengthMm: 266, heightMm: 158, depthMm: 118 },
  DN65: { innerMm: 65, outerMm: 75, nominalFlowLpm: 240, lengthMm: 292, heightMm: 172, depthMm: 132 },
  DN80: { innerMm: 80, outerMm: 90, nominalFlowLpm: 360, lengthMm: 318, heightMm: 188, depthMm: 146 },
}

export function flowMeterSpecOf(state?: Record<string, any>) {
  const dn = (typeof state?.pipeDN === 'string' && state.pipeDN in FLOW_METER_PIPE_SPECS
    ? state.pipeDN
    : 'DN32') as FlowMeterPipeDN
  return { dn, ...FLOW_METER_PIPE_SPECS[dn] }
}

export function isFluidWireKind(kind: WireKind | undefined): boolean {
  return kind === 'hydraulic' || kind === 'pneumatic'
}

export function conduitMediumOfKind(kind: WireKind | undefined): ConduitMedium {
  if (kind === 'hydraulic') return 'hydraulic'
  if (kind === 'pneumatic') return 'pneumatic'
  return 'electrical'
}

export const HYDRAULIC_GAUGES = [
  'DN15 (Ø20mm)',
  'DN20 (Ø25mm)',
  'DN25 (Ø32mm)',
  'DN32 (Ø40mm)',
  'DN40 (Ø50mm)',
] as const

export const PNEUMATIC_GAUGES = [
  'PU Ø4mm',
  'PU Ø6mm',
  'PU Ø8mm',
  'PU Ø10mm',
  'PU Ø12mm',
] as const

/** Extrai o diâmetro exterior em mm de bitolas tubulares (hidráulicas/pneumáticas), ex. "DN20 (Ø25mm)" → 25. */
export function parseTubularDiameterMm(gauge?: string | null): number | null {
  if (!gauge) return null
  const match = gauge.match(/Ø\s*([0-9]+(?:[.,][0-9]+)?)\s*mm/i)
  if (!match) return null
  const val = Number.parseFloat(match[1].replace(',', '.'))
  return Number.isFinite(val) && val > 0 ? val : null
}

export interface WaterTankDimensionsMm {
  diameterMm: number
  heightMm: number
  standHeightMm: number
  domeHeightMm: number
  totalWidthMm: number
  totalHeightMm: number
  totalDepthMm: number
  volumeLiters: number
}

export function waterTankDimensionsOf(state?: Record<string, any>): WaterTankDimensionsMm {
  const rawD = Number(state?.diameterMm)
  const rawH = Number(state?.heightMm)
  const diameterMm = Number.isFinite(rawD) ? Math.max(200, Math.min(2000, Math.round(rawD))) : 360
  const heightMm = Number.isFinite(rawH) ? Math.max(250, Math.min(2500, Math.round(rawH))) : 480
  const standHeightMm = Math.round(Math.max(55, Math.min(220, heightMm * 0.14)))
  const domeHeightMm = Math.round(Math.max(32, Math.min(180, diameterMm * 0.13)))
  const pipeMarginMm = Math.round(Math.max(70, Math.min(260, diameterMm * 0.24)))
  const totalWidthMm = diameterMm + pipeMarginMm * 2
  const totalHeightMm = standHeightMm + heightMm + domeHeightMm
  const totalDepthMm = diameterMm
  const radiusM = (diameterMm / 2) / 1000
  const heightM = heightMm / 1000
  const volumeLiters = Math.round(Math.PI * radiusM * radiusM * heightM * 1000)
  return {
    diameterMm,
    heightMm,
    standHeightMm,
    domeHeightMm,
    totalWidthMm,
    totalHeightMm,
    totalDepthMm,
    volumeLiters,
  }
}

export const FLOAT_SWITCH_SIZE_MM = { width: 240, height: 185, depth: 64 } as const
export const WATER_PUMP_SIZE_MM = { width: 340, height: 225, depth: 175 } as const
export const HYDRAULIC_VALVE_SIZE_MM = { width: 135, height: 108, depth: 66 } as const
export const HYDRAULIC_TEE_SIZE_MM = { width: 112, height: 86, depth: 56 } as const

export function hydraulicComponentSizeMm(
  type: string,
  state?: Record<string, any>,
): { x: number; y: number; z: number } | null {
  if (type === 'floatSwitch') {
    return { x: FLOAT_SWITCH_SIZE_MM.width, y: FLOAT_SWITCH_SIZE_MM.height, z: FLOAT_SWITCH_SIZE_MM.depth }
  }
  if (type === 'waterPump') {
    return { x: WATER_PUMP_SIZE_MM.width, y: WATER_PUMP_SIZE_MM.height, z: WATER_PUMP_SIZE_MM.depth }
  }
  if (type === 'waterTank') {
    const d = waterTankDimensionsOf(state)
    return { x: d.totalWidthMm, y: d.totalHeightMm, z: d.totalDepthMm }
  }
  if (type === 'hydraulicValve') {
    return { x: HYDRAULIC_VALVE_SIZE_MM.width, y: HYDRAULIC_VALVE_SIZE_MM.height, z: HYDRAULIC_VALVE_SIZE_MM.depth }
  }
  if (type === 'hydraulicTee') {
    return { x: HYDRAULIC_TEE_SIZE_MM.width, y: HYDRAULIC_TEE_SIZE_MM.height, z: HYDRAULIC_TEE_SIZE_MM.depth }
  }
  if (type === 'hydraulicFlowMeter') {
    const spec = flowMeterSpecOf(state)
    return { x: spec.lengthMm, y: spec.heightMm, z: spec.depthMm }
  }
  return null
}

export interface HydraulicDatasheetInfo {
  path: string
  name: string
  manufacturer: string
  model: string
  summary: string
}

export const HYDRAULIC_DATASHEETS: Record<HydraulicComponentType, HydraulicDatasheetInfo> = {
  floatSwitch: {
    path: '/datasheets/hydraulics/float-switch-felix-energy.pdf',
    name: 'FELIX ENERGY · Interruptor de Boia IP68 (Ficha Técnica).pdf',
    manufacturer: 'FELIX ENERGY',
    model: 'Interruptor de Boia 16(8)A · IP68',
    summary: '250V~ · 16(8)A · SPDT (C Preto / NA Castanho / NF Azul) · Cabo H07RN-F 3×1.0 mm² + Contrapeso',
  },
  waterTank: {
    path: '/datasheets/hydraulics/water-tank-transparent-3d.pdf',
    name: 'Reservatório de Água Transparente 3D (Ficha Técnica).pdf',
    manufacturer: 'DC-Simu Hidráulica',
    model: 'Tanque Transparente Paramétrico',
    summary: 'Corpo acrílico transparente · Dimensões configuráveis · Entrada IN com boia · Saída OUT com válvula',
  },
  waterPump: {
    path: '/datasheets/hydraulics/water-pump-calpeda-ct61.pdf',
    name: 'CALPEDA CT 61 · Eletrobomba Periférica 0,37 kW (Ficha Técnica).pdf',
    manufacturer: 'CALPEDA',
    model: 'CT 61 · 0,37 kW (0,5 HP)',
    summary: '230V~ 50Hz · 2,4 A · 2900 rpm · Q 5–40 L/min · H 40–5 m · G 1" (IN/OUT) · IP54',
  },
  hydraulicValve: {
    path: '/datasheets/hydraulics/hydraulic-valve-tee-3d.pdf',
    name: 'Válvula de Esfera Hidráulica G 1" · PN16 (Ficha Técnica).pdf',
    manufacturer: 'DC-Simu Hidráulica',
    model: 'Válvula Esfera Latão G 1"',
    summary: 'Latão forjado CW617N · PN16 · Abertura 1/4 de volta · Portas IN/OUT G 1"',
  },
  hydraulicTee: {
    path: '/datasheets/hydraulics/hydraulic-valve-tee-3d.pdf',
    name: 'União em T Hidráulica Latão G 1" (Ficha Técnica).pdf',
    manufacturer: 'DC-Simu Hidráulica',
    model: 'Tê Latão 3 Vias G 1"',
    summary: 'Derivação hidráulica em T 3 vias (A / B / C) · Latão forjado · PN16',
  },
  hydraulicFlowMeter: {
    path: '/datasheets/hydraulics/water-flow-meter-zjlcd-bt01.pdf',
    name: 'ZJLCD-BT01 · Contador de Água Eletrónico de Turbina PVC DN25–DN80 (Ficha Técnica).pdf',
    manufacturer: 'ZJLCD / SEA',
    model: 'ZJLCD-BT01 · PVC DN25–DN80 · Open-Drain',
    summary: 'Display LCD caudal instantâneo (L/min) & totalizador (L) · Botões SET/CLEAR · Saída impulsos Open-Drain +24V/PULSE/GND',
  },
}
