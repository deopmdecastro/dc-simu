export type ConveyorComponentType = 'rollerConveyor' | 'opticalReflector'

export function isConveyorComponentType(type: string): type is ConveyorComponentType {
  return type === 'rollerConveyor' || type === 'opticalReflector'
}

export function isFloorMountedMachineType(type: string): boolean {
  return (
    type === 'motor3ph' ||
    type === 'motor1ph' ||
    type === 'waterPump' ||
    type === 'waterTank' ||
    type === 'rollerConveyor'
  )
}

export interface ConveyorLineSensor {
  id: string
  label: string
  kind: 'optical' | 'inductive'
  /** Posição longitudinal ao longo da linha (5..95%). */
  positionPct: number
  /** Lado da longarina onde o sensor é fixo. */
  side: 'front' | 'back'
  /** Ângulo de orientação em graus (-180..+180). */
  angleDeg: number
  /** Altura do suporte acima do plano dos rolos (mm, 20..180). */
  heightOffsetMm: number
  /** Espelho refletor montado no lado oposto (para sensores óticos). */
  withReflector: boolean
  /** Estado em tempo real (detetando caixa/peça). */
  triggered?: boolean
}

export interface ConveyorDimensionsMm {
  lengthMm: number
  widthMm: number
  heightMm: number
  rollerCount: number
  rollerDiameterMm: number
  frameHeightMm: number
  motorized: boolean
  motorSide: 'front' | 'back'
  totalWidthMm: number
  totalHeightMm: number
  totalDepthMm: number
}

export function conveyorDimensionsOf(state?: Record<string, any>): ConveyorDimensionsMm {
  const rawL = Number(state?.lengthMm)
  const rawW = Number(state?.widthMm)
  const rawH = Number(state?.heightMm)
  const lengthMm = Number.isFinite(rawL) ? Math.max(800, Math.min(4000, Math.round(rawL))) : 1600
  const widthMm = Number.isFinite(rawW) ? Math.max(400, Math.min(1200, Math.round(rawW))) : 680
  const heightMm = Number.isFinite(rawH) ? Math.max(500, Math.min(1100, Math.round(rawH))) : 750
  const rollerDiameterMm = 50
  const frameHeightMm = 115
  const rollerCount = Math.max(7, Math.round((lengthMm - 90) / 96))
  const motorized = state?.motorized !== false
  const motorSide: 'front' | 'back' = state?.motorSide === 'back' ? 'back' : 'front'
  const motorExtraDepth = motorized ? 210 : 0
  return {
    lengthMm,
    widthMm,
    heightMm,
    rollerCount,
    rollerDiameterMm,
    frameHeightMm,
    motorized,
    motorSide,
    totalWidthMm: lengthMm,
    totalHeightMm: heightMm + 90, // inclui altura livre acima dos rolos para sensores/caixa
    totalDepthMm: widthMm + motorExtraDepth,
  }
}

export function defaultConveyorLineSensors(): ConveyorLineSensor[] {
  return [
    {
      id: 's-in',
      label: 'S1 Entrada',
      kind: 'optical',
      positionPct: 18,
      side: 'front',
      angleDeg: 0,
      heightOffsetMm: 65,
      withReflector: true,
      triggered: false,
    },
    {
      id: 's-out',
      label: 'S2 Saída',
      kind: 'optical',
      positionPct: 82,
      side: 'front',
      angleDeg: 0,
      heightOffsetMm: 65,
      withReflector: true,
      triggered: false,
    },
  ]
}

export function conveyorLineSensorsOf(state?: Record<string, any>): ConveyorLineSensor[] {
  if (!Array.isArray(state?.lineSensors)) return []
  return state.lineSensors.map((raw: any, i: number) => ({
    id: typeof raw?.id === 'string' && raw.id ? raw.id : `s-${i + 1}`,
    label: typeof raw?.label === 'string' && raw.label ? raw.label : `S${i + 1}`,
    kind: raw?.kind === 'inductive' ? 'inductive' : 'optical',
    positionPct: Math.max(4, Math.min(96, Number(raw?.positionPct ?? 50) || 50)),
    side: raw?.side === 'back' ? 'back' : 'front',
    angleDeg: Math.max(-180, Math.min(180, Number(raw?.angleDeg ?? 0) || 0)),
    heightOffsetMm: Math.max(20, Math.min(180, Number(raw?.heightOffsetMm ?? 65) || 65)),
    withReflector: raw?.withReflector !== false,
    triggered: !!raw?.triggered,
  }))
}

export function opticalReflectorSizeMm(state?: Record<string, any>): { width: number; height: number; depth: number } {
  const face = Number(state?.faceSizeMm) === 80 ? 80 : 50
  return {
    width: face + 14,
    height: face + 34,
    depth: 38,
  }
}

export function conveyorComponentSizeMm(
  type: string,
  state?: Record<string, any>,
): { width: number; height: number; depth: number } | null {
  if (type === 'rollerConveyor') {
    const d = conveyorDimensionsOf(state)
    return { width: d.totalWidthMm, height: d.totalHeightMm, depth: d.totalDepthMm }
  }
  if (type === 'opticalReflector') {
    return opticalReflectorSizeMm(state)
  }
  return null
}

export interface ConveyorDatasheetInfo {
  path: string
  name: string
  manufacturer: string
  model: string
  summary: string
}

export const CONVEYOR_DATASHEETS: Record<ConveyorComponentType, ConveyorDatasheetInfo> = {
  rollerConveyor: {
    path: '/datasheets/automation/roller-conveyor-ferplast-3d.pdf',
    name: 'FERPLAST · Tapete Rolante Industrial 3D (Ficha Técnica).pdf',
    manufacturer: 'FERPLAST / DC-Simu',
    model: 'Série RLM · Transportador de Rolos',
    summary: 'Comprimento 800–4000 mm · Motorizado SEW 3~ 400V ou livre · Caixa de bornes tapável · Sensores editáveis',
  },
  opticalReflector: {
    path: '/datasheets/automation/optical-reflector-xuzc50.pdf',
    name: 'SCHNEIDER XUZC50 · Espelho Refletor Ótico (Ficha Técnica).pdf',
    manufacturer: 'Schneider / DC-Simu',
    model: 'XUZC50 · Retrorrefletor Prismático IP67',
    summary: 'Espelho prismático 50×50 / 80×80 mm · Suporte orientável em L · Para sensores fotoelétricos reflex',
  },
}
