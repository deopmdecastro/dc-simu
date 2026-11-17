import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Terminal, TerminalKind } from '../types'

type TerminalSocket3D = NonNullable<Terminal['socket3D']>

export interface CombTerminalSpec {
  label: string
  displayName: string
  kind: TerminalKind
  color: string
  terminalType: 'screw' | 'pin'
  face: 'front' | 'top' | 'bottom'
  x: number
  y: number
  diameter: number
  position3D: { x: number; y: number; z: number }
  socket3D: TerminalSocket3D
}

/**
 * Modos de polos do barramento tipo pente (`busbarComb`):
 *  - `1P`   → Barramento único (monopolar · L)
 *  - `1P+N` → Fase + Neutro (bipolar · L1 + N)
 *  - `3P`   → Trifásico (tripolar · L1 + L2 + L3)
 *  - `3P+N` → Trifásico + Neutro (tetrapolar · L1 + L2 + L3 + N)
 */
export type CombBusbarMode = '1P' | '1P+N' | '3P' | '3P+N'
export type CombConductor = 'L' | 'L1' | 'L2' | 'L3' | 'N'
export type CombNeutralSide = 'right' | 'left'
export type CombTeethDirection = 'down' | 'up'
export type CombBrandStyle = 'lexman' | 'sibratec' | 'schneider' | 'legrand'
export type CombRatedA = 63 | 80 | 100
export type CombFeedConnectors = 'none' | 'left' | 'right'
export type CombConnectorPinStyle = 'cranked' | 'straight'
export type CombConnectorGauge = '4-16' | '6-25' | '10-35'

export const COMB_BUSBAR_MODES: readonly { id: CombBusbarMode; short: string; label: string; desc: string; bars: number }[] = [
  { id: '1P', short: 'Único (1P)', label: 'Barramento único (1P)', desc: '1 barra contínua de cobre — todos os dentes interligados', bars: 1 },
  { id: '1P+N', short: 'Fase + N', label: 'Fase + Neutro (1P+N)', desc: '2 barras isoladas alternadas (L · N · L · N…)', bars: 2 },
  { id: '3P', short: 'Trifásico (3P)', label: 'Trifásico (3P)', desc: '3 barras isoladas escalonadas (L1 · L2 · L3…)', bars: 3 },
  { id: '3P+N', short: '3 Fases + N', label: '3 Fases + Neutro (3P+N)', desc: '4 barras isoladas escalonadas (L1 · L2 · L3 · N…)', bars: 4 },
] as const

export const COMB_BRAND_STYLES: readonly { id: CombBrandStyle; label: string; origin: string }[] = [
  { id: 'lexman', label: 'Lexman', origin: 'Made in France' },
  { id: 'sibratec', label: 'Sibratec', origin: 'NBR IEC 60947-7-1' },
  { id: 'schneider', label: 'Schneider', origin: 'Acti9 · IEC 60947-7-1' },
  { id: 'legrand', label: 'Legrand', origin: 'HX³ · IEC 60947-7-1' },
] as const

export const COMB_RATED_OPTIONS: readonly { ratedA: CombRatedA; sectionMm2: number; label: string }[] = [
  { ratedA: 63, sectionMm2: 10, label: '63 A · 10 mm²' },
  { ratedA: 80, sectionMm2: 16, label: '80 A · 16 mm²' },
  { ratedA: 100, sectionMm2: 25, label: '100 A · 25 mm²' },
] as const

/** Paleta de cores PA66 para o conector de alimentação do barramento pente. */
export const COMB_CONNECTOR_COLORS: readonly { name: string; value: string }[] = [
  { name: 'Branco (RAL 9010)', value: '#f2f2ee' },
  { name: 'Cinzento (RAL 7035)', value: '#cfd4da' },
  { name: 'Azul (Neutro N)', value: '#1d63c2' },
  { name: 'Castanho (Fase L1)', value: '#7c3f16' },
  { name: 'Preto (Fase L2)', value: '#252930' },
  { name: 'Cinzento escuro (Fase L3)', value: '#5c6674' },
  { name: 'Vermelho', value: '#c81d25' },
  { name: 'Amarelo', value: '#d89b08' },
  { name: 'Verde (PE)', value: '#0c8f58' },
  { name: 'Laranja', value: '#e05a0c' },
] as const

export const COMB_CONNECTOR_GAUGES: readonly { id: CombConnectorGauge; label: string; stamp: string; ratedA: number }[] = [
  { id: '4-16', label: '4–16 mm² · 63 A', stamp: '4-16□', ratedA: 63 },
  { id: '6-25', label: '6–25 mm² · 80 A', stamp: '6-25□', ratedA: 80 },
  { id: '10-35', label: '10–35 mm² · 100 A', stamp: '10-35□', ratedA: 100 },
] as const

export const COMB_CONDUCTOR_HEX: Record<CombConductor, string> = {
  L: '#7c3f16',
  L1: '#7c3f16',
  L2: '#252930',
  L3: '#5c6674',
  N: '#1d63c2',
}

/** Cotas reais de engenharia (mm) do barramento tipo pente modular DIN (passo 18 mm, IEC 60947-7-1). */
export const COMB_BUSBAR = {
  minPoles: 2,
  maxPoles: 24,
  defaultPoles: 12,
  presets: [4, 6, 8, 9, 12, 16, 18, 24] as readonly number[],
  defaultMode: '1P' as CombBusbarMode,
  defaultBrand: 'lexman' as CombBrandStyle,
  defaultRatedA: 63 as CombRatedA,
  defaultTeethDirection: 'down' as CombTeethDirection,
  defaultNeutralSide: 'right' as CombNeutralSide,
  defaultFeedConnectors: 'none' as CombFeedConnectors,
  defaultConnectorColor: '#f2f2ee',
  /** Passo modular DIN normalizado (1 módulo = 18,0 mm). */
  pitchMm: 18.0,
  /** Topo isolante de proteção lateral em cada extremidade. */
  endCapMm: 1.6,
  /** Altura do perfil isolante PVC (espinha dorsal com serigrafia). */
  spineHeightMm: 15.6,
  /** Comprimento livre do pino de cobre eletrolítico Cu-ETP fora da calha. */
  pinLengthMm: 12.4,
  /** Largura e espessura nominal de cada dente/pino de cobre. */
  pinWidthMm: 4.6,
  pinThickMm: 1.65,
  /** Ombro de saída do dente junto ao perfil isolante. */
  pinShoulderWidthMm: 6.4,
  pinShoulderHeightMm: 2.1,
  /** Passo em profundidade entre barras de cobre laminadas paralelas. */
  layerPitchZMm: 3.6,
  /** Projeção adicional quando há conectores de alimentação acoplados nos dentes. */
  attachedConnectorDropMm: 12.6,
  attachedConnectorFrontMm: 14.5,
} as const

/** Cotas reais de engenharia (mm) do conector genérico de alimentação tipo pino (6–25 mm² · 80 A). */
export const COMB_CONNECTOR = {
  widthMm: 15.8,
  bodyHeightMm: 19.4,
  pinLengthMm: 16.0,
  /** Altura total = corpo PA66 (19,4) + pino estanhado estriado (16,2) = 35,6 mm. */
  heightMm: 35.6,
  blockDepthMm: 13.6,
  collarProtrusionMm: 4.2,
  /** Profundidade total (bocal frontal + bloco PA66 + offset da lâmina curva estanhada) = 20,6 mm. */
  depthMm: 20.6,
  collarOuterRadiusMm: 5.5,
  collarInnerRadiusMm: 3.15,
  pinWidthMm: 4.7,
  pinThickMm: 1.75,
  shoulderWidthMm: 8.6,
  crankOffsetZMm: 2.6,
  defaultColor: '#f2f2ee',
  defaultPinDirection: 'down' as CombTeethDirection,
  defaultPinStyle: 'cranked' as CombConnectorPinStyle,
  defaultGauge: '6-25' as CombConnectorGauge,
} as const

export function isCombBusbarType(type: string): type is 'busbarComb' {
  return type === 'busbarComb'
}

export function isCombConnectorType(type: string): type is 'combBusbarConnector' {
  return type === 'combBusbarConnector'
}

export function normalizeHexColor(raw: unknown, fallback: string): string {
  const s = typeof raw === 'string' ? raw.trim() : ''
  if (/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(s)) {
    return s.length === 4
      ? `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase()
      : s.toLowerCase()
  }
  return fallback
}

export function clampCombBusbarPoles(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return COMB_BUSBAR.defaultPoles
  return Math.max(COMB_BUSBAR.minPoles, Math.min(COMB_BUSBAR.maxPoles, Math.round(n)))
}

export function combModeOf(state?: Record<string, unknown>): CombBusbarMode {
  const m = state?.combMode
  if (m === '1P' || m === '1P+N' || m === '3P' || m === '3P+N') return m
  return COMB_BUSBAR.defaultMode
}

export function combNeutralSideOf(state?: Record<string, unknown>): CombNeutralSide {
  return state?.neutralSide === 'left' ? 'left' : 'right'
}

export function combTeethDirectionOf(state?: Record<string, unknown>): CombTeethDirection {
  return state?.teethDirection === 'up' ? 'up' : 'down'
}

export function combBrandOf(state?: Record<string, unknown>): CombBrandStyle {
  const b = state?.brandStyle
  if (b === 'lexman' || b === 'sibratec' || b === 'schneider' || b === 'legrand') return b
  return COMB_BUSBAR.defaultBrand
}

export function combRatedAOf(state?: Record<string, unknown>): CombRatedA {
  const n = Number(state?.ratedA)
  if (n === 80 || n === 100) return n
  return 63
}

export function combSectionMm2Of(ratedA: CombRatedA): number {
  return ratedA === 100 ? 25 : ratedA === 80 ? 16 : 10
}

export function combEndCapsOf(state?: Record<string, unknown>): boolean {
  return state?.endCaps !== false
}

export function combFeedConnectorsOf(state?: Record<string, unknown>): CombFeedConnectors {
  const v = state?.feedConnectors
  if (v === 'left' || v === 'right') return v
  return 'none'
}

export function combConnectorColorOf(state?: Record<string, unknown>): string {
  return normalizeHexColor(state?.connectorColor, COMB_CONNECTOR.defaultColor)
}

export function combConnectorPhaseColorsOf(state?: Record<string, unknown>): boolean {
  return state?.connectorPhaseColors === true
}

export function combConnectorPinDirectionOf(state?: Record<string, unknown>): CombTeethDirection {
  return state?.pinDirection === 'up' ? 'up' : 'down'
}

export function combConnectorPinStyleOf(state?: Record<string, unknown>): CombConnectorPinStyle {
  return state?.pinStyle === 'straight' ? 'straight' : 'cranked'
}

export function combConnectorGaugeOf(state?: Record<string, unknown>): CombConnectorGauge {
  const g = state?.gaugeRange
  if (g === '4-16' || g === '6-25' || g === '10-35') return g
  return COMB_CONNECTOR.defaultGauge
}

/** Sequência cíclica de condutores do barramento tipo pente conforme modo e lado do neutro. */
export function combSequenceOf(mode: CombBusbarMode, neutralSide: CombNeutralSide = 'right'): readonly CombConductor[] {
  switch (mode) {
    case '1P':
      return ['L'] as const
    case '1P+N':
      return neutralSide === 'left' ? (['N', 'L1'] as const) : (['L1', 'N'] as const)
    case '3P':
      return ['L1', 'L2', 'L3'] as const
    case '3P+N':
      return neutralSide === 'left'
        ? (['N', 'L1', 'L2', 'L3'] as const)
        : (['L1', 'L2', 'L3', 'N'] as const)
  }
}

/** Código de artigo realista por marca, modo e n.º de polos (para serigrafia e BOM). */
export function combCatalogCodeOf(brand: CombBrandStyle, mode: CombBusbarMode, poles: number, ratedA: CombRatedA): string {
  const p = String(poles).padStart(2, '0')
  if (brand === 'lexman') {
    if (mode === '1P') return ratedA > 63 ? '88918368' : '88918361'
    if (mode === '1P+N') return '88918364'
    if (mode === '3P') return '88918372'
    return '88918379'
  }
  if (brand === 'sibratec') {
    const k = mode === '1P' ? '1' : mode === '1P+N' ? '2' : mode === '3P' ? '3' : '4'
    return `BPP-${k}P${p}-${ratedA}`
  }
  if (brand === 'schneider') {
    const k = mode === '1P' ? '1' : mode === '1P+N' ? '2' : mode === '3P' ? '3' : '4'
    return `A9XPH${k}${p}`
  }
  if (mode === '1P') return `4049 ${p}`
  if (mode === '1P+N') return `4050 ${p}`
  if (mode === '3P') return `4051 ${p}`
  return `4052 ${p}`
}

export interface CombToothInfo {
  /** Índice global do dente `0..poles-1`. */
  index: number
  /** Condutor a que este dente pertence (`L`, `L1`, `L2`, `L3` ou `N`). */
  conductor: CombConductor
  /** Índice da barra interna de cobre `0..bars-1` (0 = barra frontal, bars-1 = barra traseira). */
  barIndex: number
  /** Ocorrência `1..K` deste condutor ao longo do pente (`L1.1`, `L1.2`…). */
  occurrence: number
  /** Rótulo elétrico do borne (ex.: `L.1`, `L1.2`, `N.2`). */
  label: string
  /** Coordenada X local em mm medida a partir do centro do barramento. */
  xMm: number
}

export interface CombBusbarDims {
  poles: number
  mode: CombBusbarMode
  neutralSide: CombNeutralSide
  teethDirection: CombTeethDirection
  feedConnectors: CombFeedConnectors
  endCaps: boolean
  sequence: readonly CombConductor[]
  bars: number
  bodyLengthMm: number
  widthMm: number
  spineHeightMm: number
  pinLengthMm: number
  /** Altura base (espinha + pinos) sem contar com conectores acoplados. */
  coreHeightMm: number
  /** Altura total do envelope (inclui conectores acoplados quando ativos). */
  heightMm: number
  /** Profundidade do perfil PVC isolante. */
  spineDepthMm: number
  /** Profundidade total do envelope (inclui bocal frontal dos conectores quando ativos). */
  depthMm: number
  /** Plano Z (mm desde o centro `-depthMm/2..+depthMm/2`) da linha frontal de pinos de cobre. */
  pinPlaneZMm: number
  /** Centro Z do perfil isolante PVC. */
  spineCenterZMm: number
  /** Centro Y do perfil isolante PVC. */
  spineCenterYMm: number
  /** Extremidade livre (ponta) Y dos pinos de cobre. */
  pinTipYMm: number
  /** Índices dos dentes que recebem conector de alimentação acoplado. */
  connectorToothIndices: number[]
  teeth: CombToothInfo[]
}

export function combBusbarDimsOf(state?: Record<string, unknown>): CombBusbarDims {
  const poles = clampCombBusbarPoles(state?.poleCount)
  const mode = combModeOf(state)
  const neutralSide = combNeutralSideOf(state)
  const teethDirection = combTeethDirectionOf(state)
  const feedConnectors = combFeedConnectorsOf(state)
  const endCaps = combEndCapsOf(state)
  const sequence = combSequenceOf(mode, neutralSide)
  const bars = sequence.length

  // Comprimento modular real: cada dente ocupa 1 passo de 18 mm, com folga simétrica nas pontas
  const bodyLengthMm = Number(((poles - 1) * COMB_BUSBAR.pitchMm + 12.8).toFixed(2))
  const widthMm = Number((bodyLengthMm + (endCaps ? COMB_BUSBAR.endCapMm * 2 : 0)).toFixed(2))
  const spineHeightMm = Number((COMB_BUSBAR.spineHeightMm + (bars - 1) * 0.55).toFixed(2))
  const pinLengthMm = COMB_BUSBAR.pinLengthMm
  const coreHeightMm = Number((spineHeightMm + pinLengthMm).toFixed(2))

  const hasConnectors = feedConnectors !== 'none'
  const heightMm = Number((coreHeightMm + (hasConnectors ? COMB_BUSBAR.attachedConnectorDropMm : 0)).toFixed(2))
  const spineDepthMm = Number((9.8 + (bars - 1) * COMB_BUSBAR.layerPitchZMm).toFixed(2))
  const depthMm = Number((spineDepthMm + (hasConnectors ? COMB_BUSBAR.attachedConnectorFrontMm : 0)).toFixed(2))

  // Espinha encostada à metade traseira quando há conectores frontais; centrada quando não há
  const spineBackZ = -depthMm / 2
  const spineCenterZMm = Number((spineBackZ + spineDepthMm / 2).toFixed(3))
  const spineFrontZ = spineBackZ + spineDepthMm
  // Linha única de pinos de cobre junto à face frontal do perfil PVC (todos os polos alinhados no mesmo plano Z)
  const pinPlaneZMm = Number((spineFrontZ - 2.35).toFixed(3))

  // Em `down`: espinha no topo (+Y), pinos descem para -Y (e conectores abaixo).
  // Em `up`: espinha na base (-Y), pinos sobem para +Y (e conectores acima).
  const dirSign = teethDirection === 'down' ? -1 : 1
  const spineCenterYMm = teethDirection === 'down'
    ? Number((heightMm / 2 - spineHeightMm / 2).toFixed(3))
    : Number((-heightMm / 2 + spineHeightMm / 2).toFixed(3))
  const spinePinEdgeY = spineCenterYMm + dirSign * (spineHeightMm / 2)
  const pinTipYMm = Number((spinePinEdgeY + dirSign * pinLengthMm).toFixed(3))

  const counts: Record<string, number> = {}
  const teeth: CombToothInfo[] = []
  for (let i = 0; i < poles; i++) {
    const barIndex = i % bars
    const conductor = sequence[barIndex]
    const occ = (counts[conductor] ?? 0) + 1
    counts[conductor] = occ
    const xMm = Number((((i - (poles - 1) / 2) * COMB_BUSBAR.pitchMm)).toFixed(3))
    teeth.push({
      index: i,
      conductor,
      barIndex,
      occurrence: occ,
      label: `${conductor}.${occ}`,
      xMm,
    })
  }

  const connectorCount = hasConnectors ? Math.min(bars, poles) : 0
  const connectorToothIndices: number[] = []
  if (feedConnectors === 'left') {
    for (let k = 0; k < connectorCount; k++) connectorToothIndices.push(k)
  } else if (feedConnectors === 'right') {
    for (let k = poles - connectorCount; k < poles; k++) connectorToothIndices.push(k)
  }

  return {
    poles,
    mode,
    neutralSide,
    teethDirection,
    feedConnectors,
    endCaps,
    sequence,
    bars,
    bodyLengthMm,
    widthMm,
    spineHeightMm,
    pinLengthMm,
    coreHeightMm,
    heightMm,
    spineDepthMm,
    depthMm,
    pinPlaneZMm,
    spineCenterZMm,
    spineCenterYMm,
    pinTipYMm,
    connectorToothIndices,
    teeth,
  }
}

/**
 * Condutor da barra interna a que pertence um borne de `busbarComb`
 * (ex.: `L.4` → `L`, `L2.3` → `L2`, `N.1` → `N`, `IN.L1` → `L1`, `IN.N` → `N`).
 */
export function combTerminalConductorOf(label: string): CombConductor | null {
  const clean = label.trim().toUpperCase()
  const feed = /^IN\.(L1|L2|L3|L|N)$/.exec(clean)
  if (feed) return feed[1] as CombConductor
  const tooth = /^(L1|L2|L3|L|N)\.\d+$/.exec(clean)
  if (tooth) return tooth[1] as CombConductor
  return null
}

/** Bornes 2D + 3D reais do barramento tipo pente (cada pino de cobre + bocais dos conectores acoplados). */
export function combBusbarTerminalSpecs(state?: Record<string, unknown>): CombTerminalSpec[] {
  const d = combBusbarDimsOf(state)
  const out: CombTerminalSpec[] = []
  const isDown = d.teethDirection === 'down'
  const dirSign = isDown ? -1 : 1
  // Ponto de ligação do dente perto da ponta chanfrada de cobre
  const toothContactY = d.pinTipYMm - dirSign * 1.6
  const nyTooth = Number(Math.max(0.01, Math.min(0.99, toothContactY / d.heightMm + 0.5)).toFixed(5))
  const nzTooth = Number(Math.max(0.05, Math.min(0.98, d.pinPlaneZMm / d.depthMm + 0.5)).toFixed(5))
  const y2dTooth = Number((1 - nyTooth).toFixed(5))

  for (const t of d.teeth) {
    const nx = Number(Math.max(0.01, Math.min(0.99, t.xMm / d.widthMm + 0.5)).toFixed(5))
    const kind: TerminalKind = t.conductor === 'N' ? 'neutral' : 'power-in'
    const color = COMB_CONDUCTOR_HEX[t.conductor]
    const pos = { x: nx, y: nyTooth, z: nzTooth }
    const namePrefix = t.conductor === 'N' ? 'Neutro' : t.conductor === 'L' ? 'Fase' : `Fase ${t.conductor}`
    out.push({
      label: t.label,
      displayName: `${namePrefix} · Pino ${t.index + 1} (${t.label})`,
      kind,
      color,
      terminalType: 'pin',
      face: isDown ? 'bottom' : 'top',
      x: nx,
      y: y2dTooth,
      diameter: 7.5,
      position3D: pos,
      socket3D: {
        position: { ...pos },
        normal: [0, isDown ? -1 : 1, 0],
        diameterMm: 4.5,
        depthMm: 9.0,
        insetMm: 1.2,
      },
    })
  }

  // Bornes de entrada por parafuso (6–25 mm²) quando os conectores de alimentação estão acoplados
  if (d.connectorToothIndices.length > 0) {
    const spineEdgeY = d.spineCenterYMm + dirSign * (d.spineHeightMm / 2)
    const blockCenterY = spineEdgeY + dirSign * (COMB_BUSBAR.pinLengthMm * 0.72 + COMB_CONNECTOR.bodyHeightMm * 0.36)
    const collarFrontZ = d.pinPlaneZMm + COMB_CONNECTOR.blockDepthMm * 0.55 + COMB_CONNECTOR.collarProtrusionMm - 1.4
    const nyIn = Number(Math.max(0.02, Math.min(0.98, blockCenterY / d.heightMm + 0.5)).toFixed(5))
    const nzIn = Number(Math.max(0.1, Math.min(0.99, collarFrontZ / d.depthMm + 0.5)).toFixed(5))
    const y2dIn = Number((1 - nyIn).toFixed(5))

    for (const idx of d.connectorToothIndices) {
      const t = d.teeth[idx]
      if (!t) continue
      const nx = Number(Math.max(0.02, Math.min(0.98, t.xMm / d.widthMm + 0.5)).toFixed(5))
      const kind: TerminalKind = t.conductor === 'N' ? 'neutral' : 'power-in'
      const pos = { x: nx, y: nyIn, z: nzIn }
      out.push({
        label: `IN.${t.conductor}`,
        displayName: `Conector de alimentação ${t.conductor} (6–25 mm²)`,
        kind,
        color: COMB_CONDUCTOR_HEX[t.conductor],
        terminalType: 'screw',
        face: 'front',
        x: nx,
        y: y2dIn,
        diameter: 9,
        position3D: pos,
        socket3D: {
          position: { ...pos },
          normal: [0, 0, 1],
          diameterMm: 6.2,
          depthMm: 9.5,
          insetMm: 1.5,
        },
      })
    }
  }

  return out
}

/** Bornes 2D + 3D reais do conector avulso de alimentação para barramento pente (`combBusbarConnector`). */
export function combConnectorTerminalSpecs(state?: Record<string, unknown>): CombTerminalSpec[] {
  const dir = combConnectorPinDirectionOf(state)
  const style = combConnectorPinStyleOf(state)
  const color = combConnectorColorOf(state)
  const wireAccent = color === '#1d63c2' ? '#2563eb' : color === '#0c8f58' ? '#16a34a' : '#7c3f16'
  const W = COMB_CONNECTOR.widthMm
  const H = COMB_CONNECTOR.heightMm
  const D = COMB_CONNECTOR.depthMm
  const isDown = dir === 'down'
  const s = isDown ? -1 : 1

  // Centro do bocal tubular frontal (entrada do cabo 6–25 mm²)
  const blockCenterY = isDown
    ? H / 2 - COMB_CONNECTOR.bodyHeightMm / 2
    : -H / 2 + COMB_CONNECTOR.bodyHeightMm / 2
  const collarY = blockCenterY + s * 1.1
  const collarZ = D / 2 - 1.5
  const nyIn = Number((collarY / H + 0.5).toFixed(5))
  const nzIn = Number((collarZ / D + 0.5).toFixed(5))

  // Ponta do pino chato estanhado estriado
  const pinTipY = isDown ? -H / 2 + 1.5 : H / 2 - 1.5
  const rearZ = -D / 2 + 1.8
  const pinTipZ = style === 'cranked' ? rearZ - COMB_CONNECTOR.crankOffsetZMm * 0.35 + 1.2 : rearZ + 0.8
  const nyPin = Number(Math.max(0.02, Math.min(0.98, pinTipY / H + 0.5)).toFixed(5))
  const nzPin = Number(Math.max(0.05, Math.min(0.95, pinTipZ / D + 0.5)).toFixed(5))
  void W

  return [
    {
      label: 'IN',
      displayName: 'Entrada de cabo (borne tubular 6–25 mm²)',
      kind: 'power-in',
      color: wireAccent,
      terminalType: 'screw',
      face: 'front',
      x: 0.5,
      y: Number((1 - nyIn).toFixed(5)),
      diameter: 9,
      position3D: { x: 0.5, y: nyIn, z: nzIn },
      socket3D: {
        position: { x: 0.5, y: nyIn, z: nzIn },
        normal: [0, 0, 1],
        diameterMm: 6.2,
        depthMm: 9.5,
        insetMm: 1.5,
      },
    },
    {
      label: 'PINO',
      displayName: 'Pino chato estanhado (encaixe no pente / disjuntor)',
      kind: 'power-in',
      color: '#94a3b8',
      terminalType: 'pin',
      face: isDown ? 'bottom' : 'top',
      x: 0.5,
      y: Number((1 - nyPin).toFixed(5)),
      diameter: 8,
      position3D: { x: 0.5, y: nyPin, z: nzPin },
      socket3D: {
        position: { x: 0.5, y: nyPin, z: nzPin },
        normal: [0, isDown ? -1 : 1, 0],
        diameterMm: 4.6,
        depthMm: 10.0,
        insetMm: 1.2,
      },
    },
  ]
}

// ============================================================================
// Utilitários de geometria CAD 3D (UV planares à escala real em mm)
// ============================================================================

function prepGeo(raw: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = raw.index ? raw.toNonIndexed() : raw.clone()
  if (!g.getAttribute('normal')) g.computeVertexNormals()
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal') g.deleteAttribute(name)
  }
  g.morphAttributes = {}
  return g
}

function applyPlanarUvMm(geometry: THREE.BufferGeometry, unit: number, tileMm: number): THREE.BufferGeometry {
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
  const pos = geometry.getAttribute('position')
  const norm = geometry.getAttribute('normal')
  const uv = new Float32Array(pos.count * 2)
  const k = 1 / (unit * tileMm)
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(norm.getX(i))
    const ny = Math.abs(norm.getY(i))
    const nz = Math.abs(norm.getZ(i))
    const x = pos.getX(i) * k
    const y = pos.getY(i) * k
    const z = pos.getZ(i) * k
    if (nz >= nx && nz >= ny) {
      uv[i * 2] = x
      uv[i * 2 + 1] = y
    } else if (nx >= ny) {
      uv[i * 2] = z
      uv[i * 2 + 1] = y
    } else {
      uv[i * 2] = x
      uv[i * 2 + 1] = z
    }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return geometry
}

function mergeMesh(
  parts: THREE.BufferGeometry[],
  material: THREE.Material,
  unit: number,
  name: string,
  tileMm = 50,
  castShadow = true,
): THREE.Mesh {
  const normalized = parts.map(prepGeo)
  const merged = mergeGeometries(normalized, false)
  normalized.forEach((g) => g.dispose())
  parts.forEach((g) => g.dispose())
  if (!merged) throw new Error(`combBusbarParts: falha ao fundir ${name}`)
  const welded = mergeVertices(merged, 1e-6)
  merged.dispose()
  applyPlanarUvMm(welded, unit, tileMm)
  const mesh = new THREE.Mesh(welded, material)
  mesh.name = name
  mesh.castShadow = castShadow
  mesh.receiveShadow = true
  return mesh
}

function box(unit: number, w: number, h: number, d: number, cx = 0, cy = 0, cz = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w * unit, h * unit, d * unit)
  if (cx || cy || cz) g.translate(cx * unit, cy * unit, cz * unit)
  return g
}

function cyl(
  unit: number,
  rTop: number,
  rBot: number,
  len: number,
  cx: number,
  cy: number,
  cz: number,
  axis: 'x' | 'y' | 'z' = 'y',
  seg = 24,
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop * unit, rBot * unit, len * unit, seg)
  if (axis === 'x') g.rotateZ(-Math.PI / 2)
  else if (axis === 'z') g.rotateX(Math.PI / 2)
  g.translate(cx * unit, cy * unit, cz * unit)
  return g
}

function hollowCollarZ(
  unit: number,
  rIn: number,
  rOut: number,
  depth: number,
  cx: number,
  cy: number,
  cz: number,
  seg = 32,
): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, rOut * unit, 0, Math.PI * 2, false)
  const hole = new THREE.Path()
  hole.absarc(0, 0, rIn * unit, 0, Math.PI * 2, true)
  shape.holes.push(hole)
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: depth * unit,
    bevelEnabled: true,
    bevelThickness: 0.42 * unit,
    bevelSize: 0.36 * unit,
    bevelSegments: 2,
    curveSegments: seg,
  })
  g.translate(cx * unit, cy * unit, (cz - depth / 2) * unit)
  return g
}

/**
 * Pino de cobre eletrolítico real com ombro de saída, ponta trapezoidal chanfrada em bisel
 * (tal como nas fotos Lexman / Sibratec) e dobra escalonada em Z desde a barra interna `barZMm`
 * até ao plano frontal único `pinPlaneZMm` (tal como na foto do pente trifásico).
 */
function pushCopperCombTooth(
  out: THREE.BufferGeometry[],
  unit: number,
  xMm: number,
  spineEdgeYMm: number,
  dirSign: -1 | 1,
  barZMm: number,
  pinPlaneZMm: number,
  pinLenMm: number,
): void {
  const t = COMB_BUSBAR.pinThickMm
  const pw = COMB_BUSBAR.pinWidthMm
  const sw = COMB_BUSBAR.pinShoulderWidthMm
  const sh = COMB_BUSBAR.pinShoulderHeightMm
  const dz = pinPlaneZMm - barZMm

  // 1) Raiz vertical que sai da barra laminada interna até à boca do canal PVC
  out.push(box(unit, sw * 0.88, 3.6, t, xMm, spineEdgeYMm - dirSign * 1.5, barZMm))

  // 2) Pescoço dobrado em Z (stepped crank) quando o dente vem de uma barra intermédia/traseira
  let pinStartRel = 0
  if (Math.abs(dz) > 0.35) {
    const stepDrop = Math.min(3.1, 1.45 + Math.abs(dz) * 0.14)
    const runLen = Math.hypot(dz, stepDrop)
    const angleX = Math.atan2(dirSign * stepDrop, dz)
    const bridge = new THREE.BoxGeometry(pw * 1.08 * unit, t * unit, (runLen + 0.5) * unit)
    bridge.rotateX(-angleX)
    bridge.translate(
      xMm * unit,
      (spineEdgeYMm + dirSign * (stepDrop * 0.48)) * unit,
      ((barZMm + pinPlaneZMm) / 2) * unit,
    )
    out.push(bridge)
    // Cotovelo de dobra arredondado junto ao canal
    out.push(cyl(unit, t * 0.55, t * 0.55, pw * 1.08, xMm, spineEdgeYMm + dirSign * 0.25, barZMm, 'x', 10))
    out.push(cyl(unit, t * 0.55, t * 0.55, pw * 1.08, xMm, spineEdgeYMm + dirSign * stepDrop, pinPlaneZMm, 'x', 10))
    pinStartRel = stepDrop
  } else {
    // Ombro largo retangular na saída da calha (visível em 1P e na barra frontal de 2P/3P/4P)
    out.push(box(unit, sw, sh, t, xMm, spineEdgeYMm + dirSign * (sh * 0.45), pinPlaneZMm))
    pinStartRel = sh * 0.82
  }

  // 3) Lâmina frontal de cobre com ponta trapezoidal chanfrada em bisel (facilita inserção no borne)
  const remLen = Math.max(4.5, pinLenMm - pinStartRel)
  const chamferH = Math.min(2.7, remLen * 0.28)
  const tipHalfW = (pw * 0.56) / 2
  const halfW = pw / 2
  const y0 = spineEdgeYMm + dirSign * pinStartRel
  const yChamfer = y0 + dirSign * (remLen - chamferH)
  const yTip = y0 + dirSign * remLen

  const shape = new THREE.Shape()
  if (dirSign === -1) {
    shape.moveTo(-halfW * unit, y0 * unit)
    shape.lineTo(halfW * unit, y0 * unit)
    shape.lineTo(halfW * unit, yChamfer * unit)
    shape.lineTo(tipHalfW * unit, yTip * unit)
    shape.lineTo(-tipHalfW * unit, yTip * unit)
    shape.lineTo(-halfW * unit, yChamfer * unit)
  } else {
    shape.moveTo(-halfW * unit, y0 * unit)
    shape.lineTo(-halfW * unit, yChamfer * unit)
    shape.lineTo(-tipHalfW * unit, yTip * unit)
    shape.lineTo(tipHalfW * unit, yTip * unit)
    shape.lineTo(halfW * unit, yChamfer * unit)
    shape.lineTo(halfW * unit, y0 * unit)
  }
  shape.closePath()
  const blade = new THREE.ExtrudeGeometry(shape, {
    depth: (t - 0.24) * unit,
    bevelEnabled: true,
    bevelThickness: 0.12 * unit,
    bevelSize: 0.1 * unit,
    bevelSegments: 1,
  })
  blade.translate(xMm * unit, 0, (pinPlaneZMm - (t - 0.24) / 2) * unit)
  out.push(blade)
}

/**
 * Constrói os sub-volumes de um conector genérico de alimentação tipo pino (6–25 mm² · 80 A):
 * corpo quadrado PA66 com topo arqueado, 4 rebaixos frontais de canto, ranhuras laterais,
 * bocal tubular cilíndrico saliente, gaiola de aperto, parafuso Pozidriv M6 cromado e pino
 * chato estanhado com estrias horizontais de aderência em relevo real.
 */
function buildConnectorSubParts(
  unit: number,
  cx: number,
  blockCenterY: number,
  blockCenterZ: number,
  dirSign: -1 | 1,
  pinStyle: CombConnectorPinStyle,
  pinLenMm: number,
): {
  housing: THREE.BufferGeometry[]
  tinned: THREE.BufferGeometry[]
  cage: THREE.BufferGeometry[]
  dark: THREE.BufferGeometry[]
  stampFace: { cx: number; cy: number; cz: number; w: number; h: number }
} {
  const housing: THREE.BufferGeometry[] = []
  const tinned: THREE.BufferGeometry[] = []
  const cage: THREE.BufferGeometry[] = []
  const dark: THREE.BufferGeometry[] = []

  const W = COMB_CONNECTOR.widthMm
  const bH = COMB_CONNECTOR.bodyHeightMm
  const bD = COMB_CONNECTOR.blockDepthMm
  const hoodH = 3.3
  const mainH = bH - hoodH
  // O topo arqueado fica no lado oposto ao pino (`-dirSign`); o pino sai no lado `+dirSign`
  const mainCy = blockCenterY + dirSign * (hoodH / 2)
  const hoodCy = mainCy - dirSign * (mainH / 2 + hoodH / 2 - 0.2)
  const frontZ = blockCenterZ + bD / 2
  const backZ = blockCenterZ - bD / 2

  // 1) Corpo principal PA66 moldado com paredes reais à volta dos 4 rebaixos frontais e ranhuras laterais
  const coreD = bD - 1.1
  housing.push(box(unit, W, mainH - 1.6, coreD, cx, mainCy - dirSign * 0.5, blockCenterZ - 0.55))
  // Saia inferior/superior junto à saída do pino (com rasgo central para o pino — foto IMG_5789!)
  const slotW = 2.2
  const sideCheekW = (W - slotW) / 2
  const pinEdgeY = mainCy + dirSign * (mainH / 2)
  for (const sx of [-1, 1] as const) {
    housing.push(box(unit, sideCheekW, 2.4, bD - 0.6, cx + sx * (slotW / 2 + sideCheekW / 2), pinEdgeY - dirSign * 1.1, blockCenterZ - 0.1))
    // Ranhura lateral fina de moldação (duas abas separadas por fenda de 0,7 mm — foto lateral IMG_5789!)
    dark.push(box(unit, 0.45, 0.75, bD * 0.68, cx + sx * (W / 2 - 0.12), pinEdgeY - dirSign * 2.5, blockCenterZ + 0.4))
  }

  // Moldura frontal com os 4 pequenos bolsos quadrados nos cantos (foto frontal IMG_5789 e IMG_5791!)
  const facePlateZ = frontZ - 0.55
  const pocketMargin = 1.45
  const pocketSize = 2.05
  // Faixas superior, inferior, esquerda, direita e cruz central da face frontal (deixando 4 bolsos reais)
  housing.push(box(unit, W, pocketMargin, 1.1, cx, mainCy - dirSign * (mainH / 2 - pocketMargin / 2), facePlateZ))
  housing.push(box(unit, sideCheekW, pocketMargin, 1.1, cx - (slotW / 2 + sideCheekW / 2), mainCy + dirSign * (mainH / 2 - pocketMargin / 2), facePlateZ))
  housing.push(box(unit, sideCheekW, pocketMargin, 1.1, cx + (slotW / 2 + sideCheekW / 2), mainCy + dirSign * (mainH / 2 - pocketMargin / 2), facePlateZ))
  for (const sx of [-1, 1] as const) {
    housing.push(box(unit, pocketMargin, mainH - pocketMargin * 2, 1.1, cx + sx * (W / 2 - pocketMargin / 2), mainCy, facePlateZ))
  }
  const innerSpanW = W - (pocketMargin + pocketSize) * 2
  const innerSpanH = mainH - (pocketMargin + pocketSize) * 2
  housing.push(box(unit, innerSpanW, mainH - pocketMargin * 2 - 1.4, 1.1, cx, mainCy - dirSign * 0.4, facePlateZ))
  housing.push(box(unit, W - pocketMargin * 2, innerSpanH, 1.1, cx, mainCy, facePlateZ))
  // Pino metálico subtil no fundo dos 4 bolsos reais de canto (sem mancha preta dura — fiel à foto IMG_5789!)
  for (const sx of [-1, 1] as const) {
    for (const sy of [-1, 1] as const) {
      const px = cx + sx * (W / 2 - pocketMargin - pocketSize / 2)
      const py = mainCy + sy * (mainH / 2 - pocketMargin - pocketSize / 2)
      tinned.push(cyl(unit, pocketSize * 0.34, pocketSize * 0.34, 0.35, px, py, frontZ - 0.92, 'z', 12))
    }
  }
  // Rasgo frontal estreito de saída da haste do pino
  dark.push(box(unit, 1.35, 3.1, 0.9, cx, pinEdgeY - dirSign * 1.5, facePlateZ - 0.1))

  // 2) Capuz superior escalonado/arredondado (`6-25□`, acesso isolado ao parafuso de aperto)
  const hoodW = W - 2.6
  const hoodD = bD - 2.4
  const hoodZ = blockCenterZ - 0.4
  housing.push(box(unit, hoodW, hoodH, hoodD, cx, hoodCy, hoodZ))
  housing.push(cyl(unit, 1.5, 1.5, hoodD, cx - hoodW / 2 + 1.2, hoodCy - dirSign * (hoodH * 0.15), hoodZ, 'z', 14))
  housing.push(cyl(unit, 1.5, 1.5, hoodD, cx + hoodW / 2 - 1.2, hoodCy - dirSign * (hoodH * 0.15), hoodZ, 'z', 14))
  // Furo redondo no topo do capuz para chave de fendas/Pozidriv de aperto
  dark.push(cyl(unit, 2.7, 2.7, 1.6, cx, hoodCy - dirSign * (hoodH / 2 - 0.5), hoodZ, 'y', 20))

  // 3) Bocal cilíndrico frontal saliente (proteção IP20 do cabo 6–25 mm²)
  const rOut = COMB_CONNECTOR.collarOuterRadiusMm
  const rIn = COMB_CONNECTOR.collarInnerRadiusMm
  const colD = COMB_CONNECTOR.collarProtrusionMm
  const collarY = mainCy
  housing.push(hollowCollarZ(unit, rIn, rOut, colD, cx, collarY, frontZ + colD / 2 - 0.3, 32))

  // Cavidade interna recuada + gaiola de latão niquelado + cabeça brilhante do parafuso Pozidriv M6 à vista!
  dark.push(cyl(unit, rIn * 0.97, rIn * 0.97, 2.4, cx, collarY, frontZ - 1.1, 'z', 24))
  // Anel de entrada da gaiola metálica visível no interior do bocal (foto IMG_5789 direita!)
  cage.push(hollowCollarZ(unit, rIn * 0.76, rIn * 0.97, 2.2, cx, collarY, frontZ + 1.15, 24))
  // Cabeça cromada do parafuso M6 Pozidriv claramente visível através do bocal (foto IMG_5789 e IMG_5791!)
  const screwZ = frontZ + 0.55
  tinned.push(cyl(unit, 2.55, 2.55, 2.1, cx, collarY - dirSign * 0.18, screwZ, 'z', 24))
  // Fenda cruzada Pozidriv PZ2 nítida na face frontal do parafuso
  const slotZ = screwZ + 0.96
  dark.push(box(unit, 3.9, 0.64, 0.42, cx, collarY - dirSign * 0.18, slotZ))
  dark.push(box(unit, 0.64, 3.9, 0.42, cx, collarY - dirSign * 0.18, slotZ))
  for (const ang of [Math.PI / 4, -Math.PI / 4]) {
    const tick = new THREE.BoxGeometry(2.7 * unit, 0.3 * unit, 0.36 * unit)
    tick.rotateZ(ang)
    tick.translate(cx * unit, (collarY - dirSign * 0.18) * unit, slotZ * unit)
    dark.push(tick)
  }

  // 4) Placa condutora traseira estanhada encaixada na face posterior (visível na vista lateral IMG_5789!)
  const plateZ = backZ + 0.95
  tinned.push(box(unit, COMB_CONNECTOR.shoulderWidthMm, mainH * 0.66, 1.65, cx, mainCy + dirSign * 0.8, plateZ))
  // Ombro em T na saída inferior/superior do bloco PA66 (foto IMG_5789 direita e IMG_5791!)
  const shoulderY = pinEdgeY + dirSign * 0.75
  tinned.push(box(unit, COMB_CONNECTOR.shoulderWidthMm, 1.55, COMB_CONNECTOR.pinThickMm, cx, shoulderY, plateZ))

  // 5) Pino chato de cobre estanhado (`Cu-ETP Sn`) com desvio curvo opcional e estrias horizontais reais!
  const pw = COMB_CONNECTOR.pinWidthMm
  const pt = COMB_CONNECTOR.pinThickMm
  const crankDz = pinStyle === 'cranked' ? -COMB_CONNECTOR.crankOffsetZMm : 0
  const kneeLen = pinStyle === 'cranked' ? 3.8 : 0.01
  const bladeZ = plateZ + crankDz

  if (pinStyle === 'cranked') {
    const segLen = Math.hypot(kneeLen, crankDz)
    const tiltX = Math.atan2(dirSign * kneeLen, crankDz)
    const neck = new THREE.BoxGeometry(pw * unit, pt * unit, (segLen + 0.5) * unit)
    neck.rotateX(-tiltX)
    neck.translate(
      cx * unit,
      (shoulderY + dirSign * (kneeLen * 0.5 + 0.4)) * unit,
      (plateZ + crankDz / 2) * unit,
    )
    tinned.push(neck)
    tinned.push(cyl(unit, pt * 0.52, pt * 0.52, pw, cx, shoulderY + dirSign * 0.55, plateZ, 'x', 10))
    tinned.push(cyl(unit, pt * 0.52, pt * 0.52, pw, cx, shoulderY + dirSign * (kneeLen + 0.35), bladeZ, 'x', 10))
  }

  const straightStart = shoulderY + dirSign * (pinStyle === 'cranked' ? kneeLen + 0.35 : 0.7)
  const straightLen = Math.max(5.5, pinLenMm - (pinStyle === 'cranked' ? kneeLen + 1.1 : 1.45))
  const bladeCy = straightStart + dirSign * (straightLen / 2)
  tinned.push(box(unit, pw, straightLen - 1.1, pt, cx, bladeCy - dirSign * 0.55, bladeZ))
  // Ponta chanfrada arredondada do pino estanhado
  tinned.push(box(unit, pw * 0.82, 1.25, pt * 0.78, cx, straightStart + dirSign * (straightLen - 0.55), bladeZ))

  // Estrias horizontais estampadas em relevo real ao longo das duas faces da lâmina (foto IMG_5789!)
  const ribPitch = 1.05
  const ribCount = Math.max(3, Math.floor((straightLen - 2.0) / ribPitch))
  for (let r = 0; r < ribCount; r++) {
    const ry = straightStart + dirSign * (1.1 + r * ribPitch)
    tinned.push(box(unit, pw * 0.94, 0.42, pt + 0.32, cx, ry, bladeZ))
  }

  return {
    housing,
    tinned,
    cage,
    dark,
    stampFace: {
      cx,
      cy: hoodCy,
      cz: hoodZ + hoodD / 2 + 0.08,
      w: hoodW - 1.4,
      h: hoodH - 0.5,
    },
  }
}

// ============================================================================
// Construtores públicos 3D: `buildCombBusbar` e `buildCombConnector`
// ============================================================================

export interface CombBusbarMaterials {
  /** Perfil isolante exterior PVC claro (RAL 7035 / branco acetinado). */
  pvcOuter: THREE.Material
  /** Barreiras dielétricas internas cinzento-médio + topos laterais. */
  pvcBarrier: THREE.Material
  /** Cobre eletrolítico escovado Cu-ETP (pinos e barras internas). */
  copper: THREE.Material
  /** Serigrafia frontal de alta resolução (Lexman / Sibratec / Schneider / Legrand + L1/L2/L3/N). */
  silkscreen: THREE.Material
  /** Cobre estanhado estriado + parafuso Pozidriv dos conectores acoplados. */
  tinned: THREE.Material
  /** Gaiola interna de latão niquelado dos conectores acoplados. */
  cage: THREE.Material
  /** Cavidades internas sombreadas. */
  dark: THREE.Material
  /** Material PA66 de cada conector acoplado (por condutor ou cor única). */
  connectorBodyFor?: (conductor: CombConductor, index: number) => THREE.Material
}

export interface BuiltCombBusbar {
  root: THREE.Group
  silkscreenMesh: THREE.Mesh
  dims: CombBusbarDims
}

export function buildCombBusbar(
  state: Record<string, unknown> | undefined,
  unit: number,
  materials: CombBusbarMaterials,
): BuiltCombBusbar {
  const dims = combBusbarDimsOf(state)
  const { widthMm: W, bodyLengthMm: bodyL, spineHeightMm: sH, spineDepthMm: sD, spineCenterYMm: sY, spineCenterZMm: sZ, bars } = dims
  const dirSign: -1 | 1 = dims.teethDirection === 'down' ? -1 : 1
  const spineFrontZ = sZ + sD / 2
  const spineBackZ = sZ - sD / 2
  const spineTopY = sY - dirSign * (sH / 2) // dorso fechado do perfil PVC
  const spineOpenY = sY + dirSign * (sH / 2) // boca de onde saem os dentes de cobre

  const pvcOuterParts: THREE.BufferGeometry[] = []
  const pvcBarrierParts: THREE.BufferGeometry[] = []
  const copperParts: THREE.BufferGeometry[] = []
  const tinnedParts: THREE.BufferGeometry[] = []
  const cageParts: THREE.BufferGeometry[] = []
  const darkParts: THREE.BufferGeometry[] = []

  // 1) Perfil isolante exterior em U de PVC rígido (dorso arredondado + parede frontal lisa + parede traseira)
  const wallT = 1.55
  const roofT = 2.2
  // Dorso fechado + friso arredondado superior (como nas fotos Lexman e Sibratec!)
  pvcOuterParts.push(box(unit, bodyL, roofT, sD, 0, spineTopY + dirSign * (roofT / 2), sZ))
  pvcOuterParts.push(box(unit, bodyL, 1.1, sD - 1.4, 0, spineTopY + dirSign * 0.25, sZ))
  // Lábio chanfrado superior na face frontal (a característica faixa cinzento-pérola da foto Lexman IMG_5788!)
  pvcBarrierParts.push(box(unit, bodyL, 1.35, 0.55, 0, spineTopY + dirSign * 0.9, spineFrontZ - 0.12))

  // Parede frontal isolante (suporte da serigrafia) e parede traseira
  const sideWallH = sH - roofT
  const sideWallCy = spineTopY + dirSign * (roofT + sideWallH / 2)
  pvcOuterParts.push(box(unit, bodyL, sideWallH, wallT, 0, sideWallCy, spineFrontZ - wallT / 2))
  pvcOuterParts.push(box(unit, bodyL, sideWallH, wallT, 0, sideWallCy, spineBackZ + wallT / 2))

  // 2) Câmaras internas com barreiras dielétricas cinzentas + 1/2/3/4 barras chatas de cobre Cu-ETP!
  const innerZSpan = sD - wallT * 2
  const barZOf = (b: number): number => {
    if (bars === 1) return dims.pinPlaneZMm
    const frontSlot = spineFrontZ - wallT - 1.35
    const backSlot = spineBackZ + wallT + 1.35
    return frontSlot - (b / (bars - 1)) * (frontSlot - backSlot)
  }

  // Fundo escuro do canal ranhurado entre paredes
  darkParts.push(box(unit, bodyL - 1.0, 2.2, Math.max(2.0, innerZSpan - 0.4), 0, spineOpenY - dirSign * 2.4, sZ))

  // Nervuras dielétricas anti-arco entre cada par de barras de cobre (visíveis na foto IMG_5791!)
  for (let b = 0; b < bars - 1; b++) {
    const midZ = (barZOf(b) + barZOf(b + 1)) / 2
    pvcBarrierParts.push(box(unit, bodyL - 0.4, sideWallH + 0.55, 1.15, 0, sideWallCy + dirSign * 0.25, midZ))
  }

  // Barras chatas contínuas de cobre eletrolítico laminado (uma por polo isolado)
  const copperBarL = bodyL - 2.6
  const copperBarH = Math.max(7.2, sideWallH - 3.0)
  const copperBarCy = spineTopY + dirSign * (roofT + 0.9 + copperBarH / 2)
  for (let b = 0; b < bars; b++) {
    copperParts.push(box(unit, copperBarL, copperBarH, COMB_BUSBAR.pinThickMm, 0, copperBarCy, barZOf(b)))
  }

  // 3) Topos isolantes laterais encaixados (end caps IP20 nas pontas esquerda e direita)
  if (dims.endCaps) {
    const capW = COMB_BUSBAR.endCapMm
    for (const sx of [-1, 1] as const) {
      const capX = sx * (W / 2 - capW / 2)
      pvcBarrierParts.push(box(unit, capW, sH + 0.3, sD + 0.35, capX, sY, sZ))
      // Aba fina de encaixe sobre o bordo do perfil
      pvcOuterParts.push(box(unit, capW * 0.65, sH - 1.2, sD - 0.6, capX - sx * 0.25, sY, sZ))
    }
  }

  // 4) Todos os dentes/pinos de cobre a passo exato de 18,0 mm (com dobra escalonada em Z!)
  for (const t of dims.teeth) {
    pushCopperCombTooth(
      copperParts,
      unit,
      t.xMm,
      spineOpenY,
      dirSign,
      barZOf(t.barIndex),
      dims.pinPlaneZMm,
      dims.pinLengthMm,
    )
  }

  const root = new THREE.Group()
  root.name = 'comb-busbar'
  root.add(
    mergeMesh(pvcOuterParts, materials.pvcOuter, unit, 'comb-pvc-spine', 65),
    mergeMesh(pvcBarrierParts, materials.pvcBarrier, unit, 'comb-pvc-barriers', 55),
    mergeMesh(copperParts, materials.copper, unit, 'comb-copper-bars-pins', 48),
  )

  // 5) Faixa frontal de serigrafia real (UV 0..1 limpo em toda a largura da espinha PVC)
  const silkW = bodyL - 0.6
  const silkH = sH - 2.1
  const silkGeo = new THREE.PlaneGeometry(silkW * unit, silkH * unit)
  silkGeo.translate(0, (sY + dirSign * 0.65) * unit, (spineFrontZ + 0.09) * unit)
  const silkscreenMesh = new THREE.Mesh(silkGeo, materials.silkscreen)
  silkscreenMesh.name = 'comb-silkscreen-front'
  silkscreenMesh.receiveShadow = true
  silkscreenMesh.userData.isCombSilkscreen = true
  silkscreenMesh.userData.keepColor = true
  root.add(silkscreenMesh)

  // 6) Conectores genéricos de alimentação 6–25 mm² acoplados diretamente aos dentes (foto IMG_5790!)
  if (dims.connectorToothIndices.length > 0) {
    const housingByMat = new Map<THREE.Material, { parts: THREE.BufferGeometry[]; tag: string }>()
    const blockCenterY = spineOpenY + dirSign * (dims.pinLengthMm * 0.72 + COMB_CONNECTOR.bodyHeightMm * 0.36)
    const blockCenterZ = dims.pinPlaneZMm + COMB_CONNECTOR.blockDepthMm / 2 + 0.35

    dims.connectorToothIndices.forEach((toothIdx, order) => {
      const tooth = dims.teeth[toothIdx]
      if (!tooth) return
      // O pino estanhado do conector entra paralelo ao pino de cobre até à boca do perfil PVC (foto IMG_5790!)
      const sub = buildConnectorSubParts(
        unit,
        tooth.xMm,
        blockCenterY,
        blockCenterZ,
        (-dirSign) as -1 | 1,
        'cranked',
        dims.pinLengthMm * 0.85,
      )
      const mat = materials.connectorBodyFor
        ? materials.connectorBodyFor(tooth.conductor, order)
        : materials.pvcOuter
      const bucket = housingByMat.get(mat)
      if (bucket) bucket.parts.push(...sub.housing)
      else housingByMat.set(mat, { parts: [...sub.housing], tag: `${tooth.conductor.toLowerCase()}-${order}` })
      tinnedParts.push(...sub.tinned)
      cageParts.push(...sub.cage)
      darkParts.push(...sub.dark)
    })

    for (const [mat, bucket] of housingByMat.entries()) {
      const mesh = mergeMesh(bucket.parts, mat, unit, `comb-feed-connector-${bucket.tag}`, 42)
      mesh.userData.keepColor = true
      root.add(mesh)
    }
    if (tinnedParts.length) root.add(mergeMesh(tinnedParts, materials.tinned, unit, 'comb-feed-tinned-pins', 32))
    if (cageParts.length) root.add(mergeMesh(cageParts, materials.cage, unit, 'comb-feed-cages', 32))
  }

  if (darkParts.length) {
    root.add(mergeMesh(darkParts, materials.dark, unit, 'comb-dark-cavities', 40, false))
  }

  return { root, silkscreenMesh, dims }
}

export interface CombConnectorMaterials {
  /** Corpo isolante PA66 na cor escolhida no Inspetor. */
  housing: THREE.Material
  /** Pino chato estanhado estriado + cabeça do parafuso Pozidriv M6. */
  tinned: THREE.Material
  /** Gaiola de aperto interna em latão niquelado. */
  cage: THREE.Material
  /** Cavidades internas sombreadas. */
  dark: THREE.Material
  /** Gravação/serigrafia técnica no capuz (`6-25□ · 80A`). */
  stamp?: THREE.Material
}

export interface BuiltCombConnector {
  root: THREE.Group
  stampMesh: THREE.Mesh | null
}

export function buildCombConnector(
  state: Record<string, unknown> | undefined,
  unit: number,
  materials: CombConnectorMaterials,
): BuiltCombConnector {
  const dir = combConnectorPinDirectionOf(state)
  const style = combConnectorPinStyleOf(state)
  const isDown = dir === 'down'
  const dirSign: -1 | 1 = isDown ? -1 : 1
  const H = COMB_CONNECTOR.heightMm
  const D = COMB_CONNECTOR.depthMm
  const bH = COMB_CONNECTOR.bodyHeightMm
  const bD = COMB_CONNECTOR.blockDepthMm

  const blockCenterY = isDown ? H / 2 - bH / 2 : -H / 2 + bH / 2
  const blockCenterZ = -D / 2 + bD / 2 + 0.3

  const sub = buildConnectorSubParts(
    unit,
    0,
    blockCenterY,
    blockCenterZ,
    dirSign,
    style,
    COMB_CONNECTOR.pinLengthMm,
  )

  const root = new THREE.Group()
  root.name = 'comb-busbar-connector'

  const housingMesh = mergeMesh(sub.housing, materials.housing, unit, 'comb-connector-pa66', 42)
  housingMesh.userData.keepColor = true
  const tinnedMesh = mergeMesh(sub.tinned, materials.tinned, unit, 'comb-connector-tinned-pin', 28)
  const cageMesh = mergeMesh(sub.cage, materials.cage, unit, 'comb-connector-cage', 30)
  const darkMesh = mergeMesh(sub.dark, materials.dark, unit, 'comb-connector-bore', 30, false)
  root.add(housingMesh, tinnedMesh, cageMesh, darkMesh)

  let stampMesh: THREE.Mesh | null = null
  if (materials.stamp) {
    const sg = new THREE.PlaneGeometry(sub.stampFace.w * unit, sub.stampFace.h * unit)
    sg.translate(sub.stampFace.cx * unit, sub.stampFace.cy * unit, sub.stampFace.cz * unit)
    stampMesh = new THREE.Mesh(sg, materials.stamp)
    stampMesh.name = 'comb-connector-stamp'
    stampMesh.userData.keepColor = true
    stampMesh.userData.keepTransparent = true
    root.add(stampMesh)
  }

  return { root, stampMesh }
}
