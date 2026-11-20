import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { ComponentType, Terminal, TerminalKind } from '../types'
import { cachedDangerStickerTexture } from './protectionMarkings'
import {
  COMB_CONNECTOR,
  combBusbarDimsOf,
  combBusbarTerminalSpecs,
  combConnectorTerminalSpecs,
  isCombBusbarType,
  isCombConnectorType,
} from './combBusbarParts'
export { isCombBusbarType, isCombConnectorType, combTerminalConductorOf } from './combBusbarParts'
type TerminalSocket3D = NonNullable<Terminal['socket3D']>

/**
 * Geradores paramétricos em mm (sem DOM) dos barramentos reais do DC-Simu:
 *
 *  1. Barramentos unipolares isolados com tampa acrílica translúcida (cota real: 12 bornes = 128 × 36,5 × 13 mm,
 *     corpo central 98 mm, entre-eixos M4 de 115 mm, tampa de 9,6 mm):
 *     - `earthBar`           → Barramento de terra (PE) — acrílico verde esmeralda fixo
 *     - `busbarNeutral`      → Barramento de neutro (N) — acrílico azul safira fixo
 *     - `busbarPhaseAcrylic` → Barramento de fase (L) — acrílico com cor selecionável no Inspetor
 *     Orelhas M4 na face de montagem (back / −Z), eixo do parafuso ao longo de Z
 *     (rebaixo da cabeça acessível pelo lado da frente). Frente = furos de cabo + acrílico no topo.
 *
 *  2. Barramento repartidor de fases em escada (`busbarPhaseStepped`, tipo modular DIN 125 A):
 *     - 2, 3 ou 4 barras maciças de latão escalonadas (por omissão 4P: L1, L2, L3, N) com N bornes por barra
 *     - Tampa articulada em policarbonato transparente que pode ABRIR/FECHAR (`coverOpen`)
 *       e OCULTAR/MOSTRAR (`coverVisible`) no Inspetor e na vista 3D.
 *
 * O pivô de todos os modelos é o centro exato do volume `[-W/2..+W/2, -H/2..+H/2, -D/2..+D/2]`,
 * alinhado com `terminal3D.ts`, `OrientedInstance` e `GLTFExporter`.
 */

export type AcrylicBusbarType = 'earthBar' | 'busbarNeutral' | 'busbarPhaseAcrylic'
export type RealBusbarType = AcrylicBusbarType | 'busbarPhaseStepped' | 'busbarComb' | 'combBusbarConnector'

export const ACRYLIC_BUSBAR_TYPES: readonly AcrylicBusbarType[] = [
  'earthBar',
  'busbarNeutral',
  'busbarPhaseAcrylic',
] as const

export const REAL_BUSBAR_TYPES: readonly RealBusbarType[] = [
  'earthBar',
  'busbarNeutral',
  'busbarPhaseAcrylic',
  'busbarPhaseStepped',
  'busbarComb',
  'combBusbarConnector',
] as const

export function isAcrylicBusbarType(type: string): type is AcrylicBusbarType {
  return type === 'earthBar' || type === 'busbarNeutral' || type === 'busbarPhaseAcrylic'
}

export function isSteppedBusbarType(type: string): type is 'busbarPhaseStepped' {
  return type === 'busbarPhaseStepped'
}

export function isRealBusbarType(type: string): type is RealBusbarType {
  return isAcrylicBusbarType(type) || isSteppedBusbarType(type) || isCombBusbarType(type) || isCombConnectorType(type)
}

/** Cotas de engenharia do barramento unipolar com acrílico (calibradas na ficha 12P = 128 × 36,5 × 13 mm). */
export const ACRYLIC_BUSBAR = {
  minPoles: 4,
  maxPoles: 24,
  defaultPoles: 10,
  presets: [4, 6, 8, 10, 12, 16] as readonly number[],
  /** Passo entre bornes: 12 × 8,0 + 2,0 = 98,0 mm de corpo central. */
  pitchMm: 8.0,
  endWallMm: 1.0,
  /** Orelhas laterais M4: 98 + 2 × 15 = 128,0 mm totais; entre-eixos M4 = 98 + 17 = 115,0 mm. */
  earWidthMm: 15.0,
  earHeightMm: 7.4,
  mountOffsetFromBodyMm: 8.5,
  heightMm: 36.5,
  depthMm: 13.0,
  /** Tampa acrílica superior: 9,6 mm de altura total com abas de encaixe. */
  coverHeightMm: 9.6,
  /** Centro vertical dos furos frontais de entrada dos condutores (mm desde a base). */
  holeCenterYMm: 19.0,
  holeRadiusMm: 2.65,
  /** Cor fixa do acrílico de terra (PE) — verde esmeralda translúcido. */
  earthAcrylicColor: '#049e64',
  /** Cor fixa do acrílico de neutro (N) — azul safira translúcido. */
  neutralAcrylicColor: '#1b63c4',
  /** Cor de série do acrílico de fase (L) — vermelho rubi translúcido. */
  defaultPhaseAcrylicColor: '#c81d25',
} as const

/** Paleta de cores de acrílico disponíveis para o barramento de fase (editável no Inspetor). */
export const PHASE_BUSBAR_ACRYLIC_COLORS = [
  { name: 'Vermelho', value: '#c81d25' },
  { name: 'Amarelo', value: '#d49a0a' },
  { name: 'Verde', value: '#049e64' },
  { name: 'Azul', value: '#1b63c4' },
  { name: 'Castanho (L1)', value: '#854318' },
  { name: 'Preto fumado (L2)', value: '#262b33' },
  { name: 'Cinzento (L3)', value: '#64748b' },
  { name: 'Laranja (comando)', value: '#e05a0c' },
  { name: 'Transparente', value: '#cfe2f2' },
] as const

export type SteppedBarConductors = '4P' | '3P' | '2P'

export const STEPPED_BUSBAR = {
  minHoles: 4,
  maxHoles: 16,
  defaultHoles: 7,
  presets: [5, 7, 11, 15] as readonly number[],
  defaultBars: '4P' as SteppedBarConductors,
  pitchMm: 8.8,
  barEndPadMm: 2.4,
  sideFrameMm: 11.2,
  barHeightMm: 10.4,
  barDepthMm: 9.2,
  /** Desnível vertical e recuo em profundidade por degrau (escada frontal real). */
  stepRiseMm: 15.2,
  stepSetbackMm: 8.4,
  baseBarCenterYMm: 20.5,
  frontMarginMm: 3.4,
  /** Ângulo de abertura da tampa articulada (graus). */
  openDeg: 92,
} as const

export function steppedBarListOf(mode: unknown): readonly ('L1' | 'L2' | 'L3' | 'N')[] {
  if (mode === '2P' || mode === 2) return ['L1', 'N'] as const
  if (mode === '3P' || mode === 3) return ['L1', 'L2', 'L3'] as const
  return ['L1', 'L2', 'L3', 'N'] as const
}

export function steppedBarsModeOf(state: Record<string, unknown> | undefined): SteppedBarConductors {
  const raw = state?.barsMode
  if (raw === '2P' || raw === '3P' || raw === '4P') return raw
  return STEPPED_BUSBAR.defaultBars
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

export function clampAcrylicBusbarPoles(value: unknown): number {
  return clampInt(value, ACRYLIC_BUSBAR.minPoles, ACRYLIC_BUSBAR.maxPoles, ACRYLIC_BUSBAR.defaultPoles)
}

export function clampSteppedBusbarHoles(value: unknown): number {
  return clampInt(value, STEPPED_BUSBAR.minHoles, STEPPED_BUSBAR.maxHoles, STEPPED_BUSBAR.defaultHoles)
}

/** Cor efetiva do acrílico: fixa em Terra (verde) e Neutro (azul), personalizável em Fase. */
export function acrylicBusbarColorOf(type: AcrylicBusbarType, state?: Record<string, unknown>): string {
  if (type === 'earthBar') return ACRYLIC_BUSBAR.earthAcrylicColor
  if (type === 'busbarNeutral') return ACRYLIC_BUSBAR.neutralAcrylicColor
  const raw = typeof state?.acrylicColor === 'string' ? state.acrylicColor.trim() : ''
  if (/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(raw)) {
    return raw.length === 4
      ? `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toLowerCase()
      : raw.toLowerCase()
  }
  return ACRYLIC_BUSBAR.defaultPhaseAcrylicColor
}

export function steppedCoverVisibleOf(state?: Record<string, unknown>): boolean {
  return state?.coverVisible !== false
}

export function steppedCoverOpenOf(state?: Record<string, unknown>): boolean {
  return state?.coverOpen === true
}

export function acrylicCoverVisibleOf(state?: Record<string, unknown>): boolean {
  return state?.coverVisible !== false
}

/** Direção de entrada dos condutores nos barramentos unipolares: 'bottom' (por baixo) ou 'top' (por cima). */
export function acrylicBusbarWireEntryOf(type: string, state?: Record<string, unknown>): 'bottom' | 'top' {
  if (state?.wireEntryDirection === 'top' || state?.wireEntryDirection === 'bottom') {
    return state.wireEntryDirection
  }
  return type === 'busbarNeutral' ? 'top' : 'bottom'
}

export interface AcrylicBusbarDims {
  poles: number
  bodyWidthMm: number
  mountSpanMm: number
  widthMm: number
  heightMm: number
  depthMm: number
}

export function acrylicBusbarDimsOf(polesOrState?: number | Record<string, unknown>): AcrylicBusbarDims {
  const poles = typeof polesOrState === 'number'
    ? clampAcrylicBusbarPoles(polesOrState)
    : clampAcrylicBusbarPoles(polesOrState?.poleCount)
  const bodyWidthMm = poles * ACRYLIC_BUSBAR.pitchMm + ACRYLIC_BUSBAR.endWallMm * 2
  const widthMm = bodyWidthMm + ACRYLIC_BUSBAR.earWidthMm * 2
  const mountSpanMm = bodyWidthMm + ACRYLIC_BUSBAR.mountOffsetFromBodyMm * 2
  return {
    poles,
    bodyWidthMm,
    mountSpanMm,
    widthMm,
    heightMm: ACRYLIC_BUSBAR.heightMm,
    depthMm: ACRYLIC_BUSBAR.depthMm,
  }
}

export interface SteppedBusbarDims {
  holesPerBar: number
  barsMode: SteppedBarConductors
  conductors: readonly ('L1' | 'L2' | 'L3' | 'N')[]
  barWidthMm: number
  widthMm: number
  heightMm: number
  depthMm: number
}

export function steppedBusbarDimsOf(state?: Record<string, unknown>): SteppedBusbarDims {
  const holesPerBar = clampSteppedBusbarHoles(state?.poleCount)
  const barsMode = steppedBarsModeOf(state)
  const conductors = steppedBarListOf(barsMode)
  const nBars = conductors.length
  const barWidthMm = holesPerBar * STEPPED_BUSBAR.pitchMm + STEPPED_BUSBAR.barEndPadMm * 2
  const widthMm = Number((barWidthMm + STEPPED_BUSBAR.sideFrameMm * 2).toFixed(2))
  // 4P: 88 mm × 50 mm; 3P: 73 mm × 42 mm; 2P: 58 mm × 34 mm
  const heightMm = Number((STEPPED_BUSBAR.baseBarCenterYMm + (nBars - 1) * STEPPED_BUSBAR.stepRiseMm + 21.9).toFixed(2))
  const depthMm = Number((16.4 + (nBars - 1) * STEPPED_BUSBAR.stepSetbackMm + 8.4).toFixed(2))
  return { holesPerBar, barsMode, conductors, barWidthMm, widthMm, heightMm, depthMm }
}

/** Tamanho real (mm) ocupado por qualquer barramento 3D: X = largura, Y = altura, Z = profundidade. */
export function busbarSizeMm(type: string, state?: Record<string, unknown>): { x: number; y: number; z: number } | null {
  if (isAcrylicBusbarType(type)) {
    const d = acrylicBusbarDimsOf(state)
    return { x: d.widthMm, y: d.heightMm, z: d.depthMm }
  }
  if (isSteppedBusbarType(type)) {
    const d = steppedBusbarDimsOf(state)
    return { x: d.widthMm, y: d.heightMm, z: d.depthMm }
  }
  if (isCombBusbarType(type)) {
    const d = combBusbarDimsOf(state)
    return { x: d.widthMm, y: d.heightMm, z: d.depthMm }
  }
  if (isCombConnectorType(type)) {
    return { x: COMB_CONNECTOR.widthMm, y: COMB_CONNECTOR.heightMm, z: COMB_CONNECTOR.depthMm }
  }
  return null
}

/** Coordenada geométrica exata (em mm, origem na base-traseira-centro) de cada degrau do barramento em escada. */
export function steppedBarCenterMm(dims: SteppedBusbarDims, barIndex: number): { yMm: number; zMm: number; frontZMm: number } {
  const yMm = STEPPED_BUSBAR.baseBarCenterYMm + barIndex * STEPPED_BUSBAR.stepRiseMm
  const frontZMm = dims.depthMm - STEPPED_BUSBAR.frontMarginMm - barIndex * STEPPED_BUSBAR.stepSetbackMm
  const zMm = frontZMm - STEPPED_BUSBAR.barDepthMm / 2
  return { yMm, zMm, frontZMm }
}

export interface BusbarTerminalSpec {
  label: string
  displayName?: string
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

const CONDUCTOR_COLOR: Record<'L1' | 'L2' | 'L3' | 'N', string> = {
  L1: '#854318',
  L2: '#1f2937',
  L3: '#64748b',
  N: '#2563eb',
}

/** Gera a lista exata de bornes (2D + encaixe 3D real no furo de latão) para qualquer barramento. */
export function busbarTerminalSpecs(type: RealBusbarType, state?: Record<string, unknown>): BusbarTerminalSpec[] {
  if (isCombBusbarType(type)) return combBusbarTerminalSpecs(state)
  if (isCombConnectorType(type)) return combConnectorTerminalSpecs(state)
  if (isAcrylicBusbarType(type)) {
    const d = acrylicBusbarDimsOf(state)
    const prefix = type === 'earthBar' ? 'PE' : type === 'busbarNeutral' ? 'N' : 'L'
    const kind: TerminalKind = type === 'earthBar' ? 'earth' : type === 'busbarNeutral' ? 'neutral' : 'power-in'
    const color = type === 'earthBar'
      ? '#16a34a'
      : type === 'busbarNeutral'
        ? '#2563eb'
        : acrylicBusbarColorOf(type, state)
    const entryDir = acrylicBusbarWireEntryOf(type, state)
    const isTop = entryDir === 'top'
    const holeYMm = isTop ? d.heightMm / 2 + 6.0 : d.heightMm / 2 - 6.0
    const posY = Number((holeYMm / d.heightMm).toFixed(5))
    const posZ = Number(((d.depthMm / 2 + 1.2) / d.depthMm).toFixed(5))
    const y2d = isTop ? 0.08 : 0.92

    return Array.from({ length: d.poles }, (_, i) => {
      const xMm = -d.bodyWidthMm / 2 + ACRYLIC_BUSBAR.endWallMm + (i + 0.5) * ACRYLIC_BUSBAR.pitchMm
      const nx = Number((xMm / d.widthMm + 0.5).toFixed(5))
      const label = type === 'busbarPhaseAcrylic' ? `L.${i + 1}` : `${prefix}${i + 1}`
      const position = { x: nx, y: posY, z: posZ }
      return {
        label,
        displayName: type === 'earthBar' ? `Terra PE${i + 1}` : type === 'busbarNeutral' ? `Neutro N${i + 1}` : `Fase ${i + 1}`,
        kind,
        color,
        terminalType: 'screw',
        face: isTop ? 'top' : 'bottom',
        x: nx,
        y: y2d,
        diameter: 8,
        position3D: position,
        socket3D: {
          position: { ...position },
          normal: [0, isTop ? 1 : -1, 0],
          diameterMm: 5.0,
          depthMm: 8.2,
          insetMm: 1.8,
        },
      }
    })
  }

  // Barramento repartidor de fases em escada (barras de baixo/frente para cima/trás: N, L3, L2, L1 ou L1..N).
  // Ordem padrão da base para o topo: N (frente inferior), L3, L2, L1 (topo) — ou L1, L2, L3, N:
  // Colocamos L1 no degrau 0 (inferior/frente), L2 no 1, L3 no 2 e N no 3 (superior/traseiro), todos com rótulo claro.
  const d = steppedBusbarDimsOf(state)
  const insetMm = 1.6
  const out: BusbarTerminalSpec[] = []
  d.conductors.forEach((cond, barIdx) => {
    const { yMm, zMm } = steppedBarCenterMm(d, barIdx)
    const botYMm = yMm - STEPPED_BUSBAR.barHeightMm / 2
    const ny = Number((botYMm / d.heightMm).toFixed(5))
    const nz = Number((zMm / d.depthMm).toFixed(5))
    const y2d = Number((1 - (yMm / d.heightMm)).toFixed(5))
    const kind: TerminalKind = cond === 'N' ? 'neutral' : 'power-in'
    const color = CONDUCTOR_COLOR[cond]
    for (let k = 0; k < d.holesPerBar; k++) {
      const xMm = -d.barWidthMm / 2 + STEPPED_BUSBAR.barEndPadMm + (k + 0.5) * STEPPED_BUSBAR.pitchMm
      const nx = Number((xMm / d.widthMm + 0.5).toFixed(5))
      const isMain = k === 0
      const position = { x: nx, y: ny, z: nz }
      out.push({
        label: `${cond}.${k + 1}`,
        displayName: isMain ? `${cond} · Entrada ${k + 1} (25 mm²)` : `${cond} · Saída ${k + 1}`,
        kind,
        color,
        terminalType: 'screw',
        face: 'bottom',
        x: nx,
        y: y2d,
        diameter: isMain ? 9 : 7.5,
        position3D: position,
        socket3D: {
          position: { ...position },
          normal: [0, -1, 0],
          diameterMm: isMain ? 6.4 : 5.0,
          depthMm: 8.0,
          insetMm,
        },
      })
    }
  })
  return out
}

/** Prefixo da barra a que pertence um borne do repartidor em escada (`L1.3` → `L1`). */
export function steppedTerminalBarOf(label: string): 'L1' | 'L2' | 'L3' | 'N' | null {
  const m = /^(L1|L2|L3|N)\.\d+$/i.exec(label.trim())
  return m ? (m[1].toUpperCase() as 'L1' | 'L2' | 'L3' | 'N') : null
}

/** Footprint 2D em px à escala real do painel (1 mm = 1,5 px). */
export function busbarFootprintPx(type: ComponentType, state?: Record<string, unknown>, pxPerMm = 1.5): { w: number; h: number } | null {
  const mm = busbarSizeMm(type, state)
  if (!mm) return null
  return {
    w: Math.max(36, Math.round(mm.x * pxPerMm)),
    h: Math.max(28, Math.round(mm.y * pxPerMm)),
  }
}

// ============================================================================
// Utilitários de geometria CAD com UV planares à escala física (1 UV = tileMm)
// ============================================================================

function normalizeGeoForMerge(raw: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = raw.index ? raw.toNonIndexed() : raw.clone()
  if (!g.getAttribute('normal')) g.computeVertexNormals()
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal') g.deleteAttribute(name)
  }
  g.morphAttributes = {}
  return g
}

function applyBoxUvMm(geometry: THREE.BufferGeometry, unit: number, tileMm: number): THREE.BufferGeometry {
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
    if (nx >= ny && nx >= nz) {
      uv[i * 2] = z
      uv[i * 2 + 1] = y
    } else if (ny >= nz) {
      uv[i * 2] = x
      uv[i * 2 + 1] = z
    } else {
      uv[i * 2] = x
      uv[i * 2 + 1] = y
    }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return geometry
}

function buildMergedMesh(
  parts: THREE.BufferGeometry[],
  material: THREE.Material,
  unit: number,
  name: string,
  tileMm: number,
  castShadow = true,
  receiveShadow = true,
): THREE.Mesh {
  const normalized = parts.map(normalizeGeoForMerge)
  parts.forEach((p) => p.dispose())
  const merged = mergeGeometries(normalized, false)
  normalized.forEach((p) => p.dispose())
  if (!merged) throw new Error(`busbarParts: falha ao unir malha ${name}`)
  applyBoxUvMm(merged, unit, tileMm)
  merged.normalizeNormals()
  const indexed = mergeVertices(merged, 1e-6)
  merged.dispose()
  const mesh = new THREE.Mesh(indexed, material)
  mesh.name = name
  mesh.castShadow = castShadow
  mesh.receiveShadow = receiveShadow
  return mesh
}

function boxMm(unit: number, sx: number, sy: number, sz: number, cx: number, cy: number, cz: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(Math.max(0.05, sx) * unit, Math.max(0.05, sy) * unit, Math.max(0.05, sz) * unit)
  g.translate(cx * unit, cy * unit, cz * unit)
  return g
}

function cylMm(
  unit: number,
  rTop: number,
  rBot: number,
  len: number,
  cx: number,
  cy: number,
  cz: number,
  axis: 'x' | 'y' | 'z',
  seg = 14,
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(Math.max(0.02, rTop) * unit, Math.max(0.02, rBot) * unit, Math.max(0.02, len) * unit, seg)
  if (axis === 'z') g.rotateX(Math.PI / 2)
  else if (axis === 'x') g.rotateZ(Math.PI / 2)
  g.translate(cx * unit, cy * unit, cz * unit)
  return g
}

/** Anel chanfrado (cone oco) para bisel real de furos maquinados em latão e poliamida. */
function ringCollarMm(
  unit: number,
  innerR: number,
  outerR: number,
  depth: number,
  cx: number,
  cy: number,
  cz: number,
  axis: 'y' | 'z' = 'z',
  seg = 16,
): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outerR * unit, 0, Math.PI * 2, false)
  const hole = new THREE.Path()
  hole.absarc(0, 0, innerR * unit, 0, Math.PI * 2, true)
  shape.holes.push(hole)
  const g = new THREE.ExtrudeGeometry(shape, { depth: depth * unit, bevelEnabled: false, curveSegments: seg })
  if (axis === 'y') {
    g.rotateX(-Math.PI / 2)
    g.translate(cx * unit, (cy - depth / 2) * unit, cz * unit)
  } else {
    g.translate(cx * unit, cy * unit, (cz - depth / 2) * unit)
  }
  return g
}

/** Placa retangular extrudida com furos circulares reais (sem falsa pintura). */
function perforatedPlateXY(
  unit: number,
  w: number,
  h: number,
  thickness: number,
  cx: number,
  cy: number,
  cz: number,
  holes: Array<{ x: number; y: number; r: number }>,
  seg = 22,
): THREE.BufferGeometry {
  const hw = (w / 2) * unit
  const hh = (h / 2) * unit
  const shape = new THREE.Shape()
  shape.moveTo(-hw, -hh)
  shape.lineTo(hw, -hh)
  shape.lineTo(hw, hh)
  shape.lineTo(-hw, hh)
  shape.closePath()
  for (const hole of holes) {
    const p = new THREE.Path()
    p.absarc((hole.x - cx) * unit, (hole.y - cy) * unit, hole.r * unit, 0, Math.PI * 2, true)
    shape.holes.push(p)
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness * unit, bevelEnabled: false, curveSegments: seg })
  g.translate(cx * unit, cy * unit, (cz - thickness / 2) * unit)
  return g
}

/** Placa horizontal XZ com furos circulares ou oblongos (orelha M4, chaminés de parafusos). */
function perforatedPlateXZ(
  unit: number,
  w: number,
  d: number,
  thickness: number,
  cx: number,
  cy: number,
  cz: number,
  roundHoles: Array<{ x: number; z: number; r: number }> = [],
  slotHoles: Array<{ x: number; z: number; lenX: number; r: number }> = [],
  rectHoles: Array<{ x: number; z: number; sx: number; sz: number }> = [],
  seg = 20,
): THREE.BufferGeometry {
  const hw = (w / 2) * unit
  const hd = (d / 2) * unit
  const shape = new THREE.Shape()
  shape.moveTo(-hw, -hd)
  shape.lineTo(hw, -hd)
  shape.lineTo(hw, hd)
  shape.lineTo(-hw, hd)
  shape.closePath()
  for (const h of roundHoles) {
    const p = new THREE.Path()
    p.absarc((h.x - cx) * unit, -(h.z - cz) * unit, h.r * unit, 0, Math.PI * 2, true)
    shape.holes.push(p)
  }
  for (const s of slotHoles) {
    const lx = Math.max(0, (s.lenX / 2 - s.r) * unit)
    const rr = s.r * unit
    const sx = (s.x - cx) * unit
    const sy = -(s.z - cz) * unit
    const p = new THREE.Path()
    p.absarc(sx + lx, sy, rr, -Math.PI / 2, Math.PI / 2, false)
    p.absarc(sx - lx, sy, rr, Math.PI / 2, Math.PI * 1.5, false)
    p.closePath()
    // Inverter sentido para furo válido
    const rev = p.getPoints(seg).reverse()
    const holePath = new THREE.Path(rev)
    holePath.closePath()
    shape.holes.push(holePath)
  }
  for (const rc of rectHoles) {
    const rx = (rc.x - cx) * unit
    const ry = -(rc.z - cz) * unit
    const rhw = (rc.sx / 2) * unit
    const rhd = (rc.sz / 2) * unit
    const p = new THREE.Path()
    p.moveTo(rx - rhw, ry - rhd)
    p.lineTo(rx - rhw, ry + rhd)
    p.lineTo(rx + rhw, ry + rhd)
    p.lineTo(rx + rhw, ry - rhd)
    p.closePath()
    shape.holes.push(p)
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness * unit, bevelEnabled: false, curveSegments: seg })
  g.rotateX(-Math.PI / 2)
  g.translate(cx * unit, (cy - thickness / 2) * unit, cz * unit)
  return g
}

/** Adiciona um parafuso de aperto realista (cabeça abaulada/cilíndrica + fenda combinada + espiga roscada visível no furo). */
function pushClampingScrew(
  unit: number,
  screwParts: THREE.BufferGeometry[],
  slotParts: THREE.BufferGeometry[],
  threadParts: THREE.BufferGeometry[],
  x: number,
  y: number,
  z: number,
  headR: number,
  headH: number,
  shankLen: number,
  axis: 'y' | 'z' = 'y',
) {
  if (axis === 'z') {
    // Cabeça voltada para +Z (vista frontal do painel): eletricista aperta o parafuso pela frente do quadro
    const headBaseZ = z
    screwParts.push(cylMm(unit, headR * 1.07, headR * 1.07, headH * 0.24, x, y, headBaseZ + headH * 0.12, 'z', 20))
    screwParts.push(cylMm(unit, headR * 0.94, headR, headH * 0.76, x, y, headBaseZ + headH * 0.62, 'z', 20))
    const slotZ = headBaseZ + headH - 0.12
    slotParts.push(boxMm(unit, headR * 1.72, headR * 0.32, 0.34, x, y, slotZ))
    slotParts.push(boxMm(unit, headR * 0.32, headR * 1.48, 0.34, x, y, slotZ))
    if (shankLen > 0.5) {
      const shankR = headR * 0.68
      threadParts.push(cylMm(unit, shankR, shankR * 0.92, shankLen, x, y, headBaseZ - shankLen / 2, 'z', 16))
      const rings = Math.max(2, Math.floor(shankLen / 0.85))
      for (let r = 0; r < rings; r++) {
        const rz = headBaseZ - 0.55 - r * 0.82
        if (rz > headBaseZ - shankLen + 0.25) {
          threadParts.push(cylMm(unit, shankR * 1.16, shankR * 1.02, 0.36, x, y, rz, 'z', 16))
        }
      }
    }
    return
  }

  // Eixo original 'y':
  const headBaseY = y
  // Anilha de aperto na base da cabeça
  screwParts.push(cylMm(unit, headR * 1.07, headR * 1.07, headH * 0.24, x, headBaseY + headH * 0.12, z, 'y', 20))
  // Corpo cilíndrico chanfrado da cabeça
  screwParts.push(cylMm(unit, headR * 0.94, headR, headH * 0.76, x, headBaseY + headH * 0.62, z, 'y', 20))
  // Fenda combinada (Philips + fenda reta) ligeiramente saliente no topo para contraste nítido
  const slotY = headBaseY + headH - 0.12
  slotParts.push(boxMm(unit, headR * 1.72, 0.34, headR * 0.3, x, slotY, z))
  slotParts.push(boxMm(unit, headR * 0.3, 0.34, headR * 1.28, x, slotY, z))
  // Espiga roscada com filetes helicoidais simulados que desce para o interior do furo de latão
  if (shankLen > 0.5) {
    const shankR = headR * 0.68
    threadParts.push(cylMm(unit, shankR, shankR * 0.92, shankLen, x, headBaseY - shankLen / 2, z, 'y', 16))
    const rings = Math.max(2, Math.floor(shankLen / 0.85))
    for (let r = 0; r < rings; r++) {
      const ry = headBaseY - 0.55 - r * 0.82
      if (ry > headBaseY - shankLen + 0.25) {
        threadParts.push(cylMm(unit, shankR * 1.16, shankR * 1.02, 0.36, x, ry, z, 'y', 16))
      }
    }
  }
}

// ============================================================================
// 1. BARRAMENTO UNIPOLAR ISOLADO COM TAMPA ACRÍLICA TRANSLÚCIDA
//    (Terra = verde, Neutro = azul, Fase = cor selecionável)
// ============================================================================

export interface AcrylicBusbarMaterials {
  /** Corpo isolante em poliamida PA66 marfim/cinzento-quente autoextinguível. */
  body: THREE.Material
  /** Barra condutora maciça e roscas em latão maquinado CuZn39Pb3. */
  brass: THREE.Material
  /** Cabeças de parafuso de aperto (latão cromatizado / aço zincado). */
  screw: THREE.Material
  /** Fenda dos parafusos e fundo sombreado dos furos de entrada. */
  bore: THREE.Material
  /** Tampa superior de proteção em acrílico/policarbonato translúcido colorido. */
  cover: THREE.Material
}

export interface BuiltAcrylicBusbar {
  root: THREE.Group
  body: THREE.Group
  cover: THREE.Group
  dims: AcrylicBusbarDims
}

export interface AcrylicBusbarBuildOptions {
  wireEntryDirection?: 'bottom' | 'top'
}

export function buildAcrylicBusbar(
  polesCount: number,
  unit: number,
  materials: AcrylicBusbarMaterials,
  options?: AcrylicBusbarBuildOptions,
): BuiltAcrylicBusbar {
  const isTop = options?.wireEntryDirection === 'top'
  const wireEntrySign = isTop ? 1 : -1
  const dims = acrylicBusbarDimsOf(polesCount)
  const { poles, bodyWidthMm: bodyW, widthMm: W, heightMm: H, depthMm: D } = dims
  const z0 = -D / 2 // -6.5 mm (face traseira assentada na chapa do quadro)
  const zFront = D / 2 // +6.5 mm (face frontal extrema)

  const bodyParts: THREE.BufferGeometry[] = []
  const brassParts: THREE.BufferGeometry[] = []
  const screwParts: THREE.BufferGeometry[] = []
  const boreParts: THREE.BufferGeometry[] = []
  const coverParts: THREE.BufferGeometry[] = []

  const poleXs = Array.from(
    { length: poles },
    (_, i) => -bodyW / 2 + ACRYLIC_BUSBAR.endWallMm + (i + 0.5) * ACRYLIC_BUSBAR.pitchMm,
  )

  // --- 1. Orelhas de fixação M4 (esquerda e direita) na FACE DE MONTAGEM (traseira / −Z) ---
  for (const sign of [-1, 1] as const) {
    const earOuter = sign * (W / 2)
    const earInner = sign * (bodyW / 2)
    const earCx = (earOuter + earInner) / 2
    const holeX = sign * (bodyW / 2 + ACRYLIC_BUSBAR.mountOffsetFromBodyMm)
    const earH = 14.0
    const earCy = 0
    const earThickness = 3.4
    // Placa da orelha no plano XY, extrudida em Z, face traseira em z0
    bodyParts.push(
      perforatedPlateXY(
        unit,
        ACRYLIC_BUSBAR.earWidthMm,
        earH,
        earThickness,
        earCx,
        earCy,
        z0 + earThickness / 2,
        [{ x: holeX, y: earCy, r: 2.15 }],
        20,
      ),
    )
    // Rebaixo anelar no lado +Z da orelha para a cabeça do parafuso M4
    bodyParts.push(
      boxMm(unit, ACRYLIC_BUSBAR.earWidthMm * 0.72, earH * 0.55, 1.1, earCx, earCy, z0 + earThickness + 0.55),
    )
    // Degrau de transição orelha → corpo do suporte
    bodyParts.push(boxMm(unit, 3.6, earH, D * 0.55, sign * (bodyW / 2 + 1.8), earCy, z0 + D * 0.275))
    // Braço lateral do suporte (pilar) que sustenta a barra de latão
    bodyParts.push(boxMm(unit, 3.2, H, D * 0.85, sign * (bodyW / 2 - 1.6), 0, z0 + (D * 0.85) / 2))
  }

  // --- 2. Berço e isolamento PA66 posterior e flanges extremas (respeitam altura exata H = 36.5 mm) ---
  const spanInner = bodyW - 6.4
  // Placa posterior dielétrica entre a barra de latão e a chapa de montagem (isolamento 1000 V)
  bodyParts.push(boxMm(unit, spanInner, H, 3.0, 0, 0, z0 + 1.5))
  // Flanges superior e inferior que delimitam o invólucro dielétrico a ±H/2
  bodyParts.push(boxMm(unit, spanInner, 2.2, D * 0.65, 0, H / 2 - 1.1, z0 + (D * 0.65) / 2))
  bodyParts.push(boxMm(unit, spanInner, 2.2, D * 0.65, 0, -H / 2 + 1.1, z0 + (D * 0.65) / 2))

  // Tabiques dielétricos verticais entre bornes vizinhos
  for (let i = 0; i < poles - 1; i++) {
    const ribX = (poleXs[i] + poleXs[i + 1]) / 2
    bodyParts.push(boxMm(unit, 1.0, 18.0, D - 4.2, ribX, 0, -0.6))
  }

  // Furos chanfrados de entrada de cabos no corpo PA66 (na face inferior se bottom, ou superior se top)
  const cableEntryY = wireEntrySign * 10.5
  for (const px of poleXs) {
    bodyParts.push(ringCollarMm(unit, 2.3, 2.9, 1.8, px, cableEntryY, 1.4, 'y', 20))
  }

  // --- 3. Barra condutora maciça de latão maquinado CuZn39Pb3 ---
  const brassW = bodyW - 3.6
  const brassH = 12.0
  const brassD = 6.8
  const brassCz = 1.2
  // Corpo da barra de latão
  brassParts.push(boxMm(unit, brassW, brassH, brassD, 0, 0, brassCz))

  // Face frontal de latão com sedes cilíndricas para as cabeças dos parafusos
  // Furos roscados + Parafusos M4 voltados para a VISTA FRONTAL (+Z)!
  const screwFaceZ = brassCz + brassD / 2 // +4.6 mm
  for (const px of poleXs) {
    // Parafuso M4 com cabeça virada para a frente (+Z)
    pushClampingScrew(
      unit,
      screwParts,
      boreParts,
      brassParts,
      px,
      0,
      screwFaceZ,
      2.4,
      2.0,
      4.6,
      'z',
    )
    // Furos de entrada do condutor (na face inferior se bottom, ou superior se top)
    const holeMouthY = wireEntrySign * (brassH / 2)
    // Casquilho de latão à entrada do furo
    brassParts.push(ringCollarMm(unit, 2.05, 2.55, 1.2, px, holeMouthY, brassCz, 'y', 24))
    // Fundo sombreado do túnel condutor
    boreParts.push(cylMm(unit, 1.95, 1.95, 5.0, px, holeMouthY - wireEntrySign * 2.5, brassCz, 'y', 18))
  }

  // --- 4. Tampa de proteção em acrílico translúcido colorido na FACE FRONTAL (+Z) ---
  const covW = bodyW - 0.6
  const covH = 22.0
  const covThickness = 2.4
  const covFrontZ = zFront - 0.05 // +6.45 mm
  const covCz = covFrontZ - covThickness / 2 // +5.25 mm

  // Placa frontal de acrílico com N furos circulares para chave de fendas
  coverParts.push(
    perforatedPlateXY(
      unit,
      covW,
      covH,
      covThickness,
      0,
      0,
      covCz,
      poleXs.map((px) => ({ x: px, y: 0, r: 2.75 })),
      24,
    ),
  )
  // Anéis guia de chave de fendas em cada abertura circular da tampa
  for (const px of poleXs) {
    coverParts.push(ringCollarMm(unit, 2.75, 3.35, 0.8, px, 0, covFrontZ - 0.4, 'z', 20))
  }
  // Saias protetoras superior e inferior da tampa acrílica
  coverParts.push(boxMm(unit, covW, 1.4, 2.8, 0, covH / 2 - 0.7, covCz - 0.4))
  coverParts.push(boxMm(unit, covW, 1.4, 2.8, 0, -covH / 2 + 0.7, covCz - 0.4))
  // Patilhas de encaixe nas extremidades (snap clips)
  const clipCount = poles <= 6 ? 2 : 3
  const clipW = Math.min(8.0, Math.max(5.4, covW * 0.11))
  for (let c = 0; c < clipCount; c++) {
    const frac = clipCount === 2 ? (c === 0 ? 0.24 : 0.76) : (c === 0 ? 0.18 : c === 1 ? 0.5 : 0.82)
    const cx = -covW / 2 + frac * covW
    coverParts.push(boxMm(unit, clipW, 3.2, 1.2, cx, covH / 2 + 1.2, covCz))
    coverParts.push(boxMm(unit, clipW, 3.2, 1.2, cx, -covH / 2 - 1.2, covCz))
  }

  const body = new THREE.Group()
  body.name = 'busbar-body'
  body.add(
    buildMergedMesh(
      bodyParts,
      materials.body,
      unit,
      'busbar-pa66-insulator',
      55,
    ),
    buildMergedMesh(brassParts, materials.brass, unit, 'busbar-brass-bar', 45),
    buildMergedMesh(screwParts, materials.screw, unit, 'busbar-clamping-screws', 35),
    buildMergedMesh(boreParts, materials.bore, unit, 'busbar-bores-slots', 40, false, true),
  )

  const cover = new THREE.Group()
  cover.name = 'busbar-acrylic-cover'
  cover.add(buildMergedMesh(coverParts, materials.cover, unit, 'busbar-acrylic-shell', 60, false, false))

  const root = new THREE.Group()
  root.name = 'acrylic-busbar'
  root.add(body, cover)
  return { root, body, cover, dims }
}

// ============================================================================
// 2. BARRAMENTO REPARTIDOR DE FASES EM ESCADA (4P / 3P / 2P) COM TAMPA ARTICULADA
// ============================================================================

export interface SteppedBusbarMaterials {
  /** Suportes laterais e degraus isolantes em poliamida RAL 7035 autoextinguível. */
  body: THREE.Material
  /** Detalhes escuros / encaixe de calha DIN. */
  dark: THREE.Material
  /** Barras maciças escalonadas e roscas em latão maquinado CuZn39Pb3. */
  brass: THREE.Material
  /** Parafusos e golas de aperto em aço zincado/niquelado. */
  screw: THREE.Material
  /** Interior sombreado dos furos de condutores e fendas dos parafusos. */
  bore: THREE.Material
  /** Tampa articulada em policarbonato transparente cristal. */
  cover: THREE.Material
  /** Rebordo chanfrado ótico da tampa de policarbonato (efeito de espessura de vidro/acrílico). */
  coverEdge: THREE.Material
}

export interface BuiltSteppedBusbar {
  root: THREE.Group
  body: THREE.Group
  /** Grupo da tampa articulada já centrado no eixo traseiro da dobradiça (`rotation.x = -rad(angle)` abre para cima). */
  cover: THREE.Group
  hingeLocal: THREE.Vector3
  dims: SteppedBusbarDims
}

export function buildSteppedBusbar(
  stateOrOpts: Record<string, unknown> | undefined,
  unit: number,
  materials: SteppedBusbarMaterials,
): BuiltSteppedBusbar {
  const dims = steppedBusbarDimsOf(stateOrOpts)
  const { holesPerBar: K, conductors, barWidthMm: barW, widthMm: W, heightMm: H, depthMm: D } = dims
  const nBars = conductors.length
  const y0 = -H / 2
  const z0 = -D / 2
  const sideW = STEPPED_BUSBAR.sideFrameMm
  const barH = STEPPED_BUSBAR.barHeightMm
  const barD = STEPPED_BUSBAR.barDepthMm

  const bodyParts: THREE.BufferGeometry[] = []
  const darkParts: THREE.BufferGeometry[] = []
  const brassParts: THREE.BufferGeometry[] = []
  const screwParts: THREE.BufferGeometry[] = []
  const boreParts: THREE.BufferGeometry[] = []

  const holeXs = Array.from(
    { length: K },
    (_, k) => -barW / 2 + STEPPED_BUSBAR.barEndPadMm + (k + 0.5) * STEPPED_BUSBAR.pitchMm,
  )

  // --- Suportes laterais escalonados (esquerdo e direito) com pés de calha DIN (foto 3) ---
  for (const sign of [-1, 1] as const) {
    const cx = sign * (W / 2 - sideW / 2)
    // Base maciça da lateral até ao 1.º degrau. Antes havia aqui dois «pés» de cavalete (frente e
    // trás) a sair por baixo, como se o aparelho assentasse numa mesa: no quadro a calha TS35 passa
    // ATRÁS do aparelho, a meia altura, e os pés liam-se como orelhas no sítio errado.
    const footW = sideW - 1.2
    bodyParts.push(boxMm(unit, sideW, 18.0, D - 2.0, cx, y0 + 9.0, 0))
    // Ganchos DIN na face traseira, centrados na calha (eixo do aparelho): gancho fixo em cima,
    // trinco de mola em baixo — o rasgo de 35 mm entre eles abraça a calha.
    darkParts.push(boxMm(unit, footW, 3.0, 4.2, cx, 17.5 + 1.5, z0 + 2.1))
    darkParts.push(boxMm(unit, footW * 0.8, 4.4, 4.2, cx, -17.5 - 2.2, z0 + 2.1))

    // Degraus laterais moldados em escada que abraçam cada barra e sustentam a tampa
    for (let b = 0; b < nBars; b++) {
      const { yMm, frontZMm } = steppedBarCenterMm(dims, b)
      const stepTop = yMm + barH / 2 + 9.2
      const stepBot = 18.0
      const stepFront = Math.min(D - 0.8, frontZMm + 2.2)
      const stepBack = 1.0
      const stepD = Math.max(6, stepFront - stepBack)
      bodyParts.push(
        boxMm(unit, sideW - 0.6, stepTop - stepBot, stepD, cx, y0 + (stepTop + stepBot) / 2, z0 + stepBack + stepD / 2),
      )
      // Nervuras exteriores em relevo (encaixe modular visível na lateral direita da foto 3)
      bodyParts.push(
        boxMm(
          unit,
          0.9,
          (stepTop - stepBot) * 0.72,
          stepD * 0.55,
          sign * (W / 2 - 0.45),
          y0 + stepBot + (stepTop - stepBot) * 0.44,
          z0 + stepBack + stepD * 0.55,
        ),
      )
    }

    // Pilares traseiros de dobradiça da tampa + trinco frontal de encaixe da tampa
    bodyParts.push(boxMm(unit, sideW, H - 18.5, 9.5, cx, y0 + 18.5 + (H - 18.5) / 2, z0 + 5.4))
    bodyParts.push(cylMm(unit, 2.4, 2.4, sideW * 0.7, cx, y0 + H - 3.6, z0 + 5.2, 'x', 18))
    // Orelha frontal de fecho da tampa (acima da 1.ª barra)
    const firstBar = steppedBarCenterMm(dims, 0)
    bodyParts.push(boxMm(unit, sideW * 0.78, 8.5, 4.6, cx, y0 + firstBar.yMm + barH / 2 + 5.5, z0 + D - 2.6))
  }

  // --- Berço isolante central em escada + barreiras dielétricas entre fases + parede traseira ---
  const cradleW = barW + 1.2
  bodyParts.push(boxMm(unit, cradleW, H - 15.0, 3.2, 0, y0 + 15.0 + (H - 15.0) / 2, z0 + 2.2))
  for (let b = 0; b < nBars; b++) {
    const { yMm, zMm, frontZMm } = steppedBarCenterMm(dims, b)
    const shelfTop = yMm - barH / 2
    // Prateleira isolante sob a barra b
    const shelfD = frontZMm - 3.2
    bodyParts.push(boxMm(unit, cradleW, 3.6, shelfD, 0, y0 + shelfTop - 1.8, z0 + 3.2 + shelfD / 2))
    // Barreira dielétrica anti-arco imediatamente atrás da barra b (separa L1 / L2 / L3 / N)
    if (b < nBars - 1) {
      const barrierZ = zMm - barD / 2 - 1.1
      bodyParts.push(boxMm(unit, cradleW, barH + 5.8, 1.8, 0, y0 + yMm + 2.4, z0 + barrierZ))
    }
    // Berços de apoio nas duas extremidades de cada barra de latão (isoladores brancos da foto 3)
    for (const s of [-1, 1] as const) {
      bodyParts.push(boxMm(unit, 3.2, barH + 3.4, barD + 2.4, s * (barW / 2 + 0.8), y0 + yMm + 1.2, z0 + zMm))
    }

    // --- Barra maciça de latão maquinado CuZn39Pb3 do degrau `b` ---
    // Corpo maciço de latão da barra
    brassParts.push(boxMm(unit, barW, barH, barD, 0, y0 + yMm, z0 + zMm))

    // Furos de entrada dos cabos por BAIXO (face inferior) e parafusos de aperto na vista FRONTAL (Z)
    holeXs.forEach((hx, idx) => {
      const isMain = idx === 0
      const rIn = isMain ? 2.85 : 2.25
      const rOut = isMain ? 3.45 : 2.85
      const screwR = isMain ? 2.85 : 2.35

      // 1) Parafusos zincados de aperto na vista frontal (eixo Z): cabeça cilíndrica + fenda combinada
      pushClampingScrew(
        unit,
        screwParts,
        boreParts,
        brassParts,
        hx,
        y0 + yMm,
        z0 + frontZMm - 0.6,
        screwR,
        1.3,
        3.5,
        'z',
      )
      // Gola de latão em relevo na face frontal em torno de cada parafuso
      brassParts.push(ringCollarMm(unit, screwR * 1.05, screwR * 1.35, 0.7, hx, y0 + yMm, z0 + frontZMm - 0.05, 'z', 24))

      // 2) Furos de entrada dos condutores por BAIXO (face inferior em -Y): cavidade condutora e anel
      const botY = y0 + yMm - barH / 2
      boreParts.push(cylMm(unit, rIn * 0.95, rIn * 0.95, 5.0, hx, botY + 2.5, z0 + zMm, 'y', 20))
      brassParts.push(ringCollarMm(unit, rIn, rOut, 0.8, hx, botY + 0.4, z0 + zMm, 'y', 24))
    })
  }

  const body = new THREE.Group()
  body.name = 'stepped-busbar-body'
  body.add(
    buildMergedMesh(bodyParts, materials.body, unit, 'stepped-pa66-frame', 65),
    buildMergedMesh(darkParts, materials.dark, unit, 'stepped-din-clips', 50),
    buildMergedMesh(brassParts, materials.brass, unit, 'stepped-brass-bars', 45),
    buildMergedMesh(screwParts, materials.screw, unit, 'stepped-clamping-screws', 35),
    buildMergedMesh(boreParts, materials.bore, unit, 'stepped-bores-slots', 40, false, true),
  )

  // --- Tampa articulada em policarbonato transparente cristal (`parts.cover`) ---
  // Pivô no eixo da dobradiça traseira superior: rodar `cover.rotation.x = -rad(angle)` levanta a tampa.
  const hingeY = y0 + H - 2.2
  const hingeZ = z0 + 5.2
  const hingeLocal = new THREE.Vector3(0, hingeY * unit, hingeZ * unit)

  const coverClearParts: THREE.BufferGeometry[] = []
  const coverEdgeParts: THREE.BufferGeometry[] = []

  // Coordenadas relativas à dobradiça (hy = y - hingeY, hz = z - hingeZ)
  const covW = W - 2.4
  const paneT = 1.75
  const frontZRel = z0 + D - 0.9 - hingeZ
  const topSlopeDrop = Math.min(18, (nBars - 1) * 5.2 + 2.5) // inclinação suave acompanhando a escada (foto 3)
  const frontTopYRel = -topSlopeDrop
  const firstBar = steppedBarCenterMm(dims, 0)
  // A saia frontal transparente desce até logo acima da 1.ª barra de latão, deixando os furos inferiores à vista (foto 3!)
  const frontBotYRel = y0 + firstBar.yMm + barH / 2 + 1.2 - hingeY

  // Painel superior inclinado em policarbonato cristal
  const runZ = frontZRel
  const topLen = Math.hypot(runZ, topSlopeDrop)
  const tilt = Math.atan2(topSlopeDrop, runZ)
  {
    const topPane = new THREE.BoxGeometry(covW * unit, paneT * unit, topLen * unit)
    topPane.rotateX(tilt)
    topPane.translate(0, (frontTopYRel / 2) * unit, (runZ / 2) * unit)
    coverClearParts.push(topPane)

    // Frisos óticos biselados nas 4 arestas do topo (o rebordo escuro/vítreo nítido do policarbonato na foto 3!)
    for (const s of [-1, 1] as const) {
      const sideRim = new THREE.BoxGeometry(1.15 * unit, (paneT + 0.35) * unit, topLen * unit)
      sideRim.rotateX(tilt)
      sideRim.translate(s * (covW / 2 - 0.45) * unit, (frontTopYRel / 2) * unit, (runZ / 2) * unit)
      coverEdgeParts.push(sideRim)
    }
    coverEdgeParts.push(boxMm(unit, covW, 1.35, 1.35, 0, frontTopYRel, frontZRel))
    coverEdgeParts.push(boxMm(unit, covW, 1.2, 1.2, 0, 0, 0.4))
  }

  // Saia frontal vertical transparente + rebordo inferior + 2 patilhas de abertura com os dedos
  const apronH = Math.max(8, frontTopYRel - frontBotYRel)
  const apronCy = (frontTopYRel + frontBotYRel) / 2
  coverClearParts.push(boxMm(unit, covW, apronH, paneT, 0, apronCy, frontZRel - paneT / 2))
  coverEdgeParts.push(boxMm(unit, covW, 1.0, paneT + 0.3, 0, frontBotYRel + 0.5, frontZRel - paneT / 2))
  for (const s of [-1, 1] as const) {
    // Verticais frontais + abas de trinco/pega para abrir a tampa
    coverEdgeParts.push(boxMm(unit, 1.1, apronH, paneT + 0.25, s * (covW / 2 - 0.45), apronCy, frontZRel - paneT / 2))
    const tabX = s * (covW / 2 - 9.0)
    coverClearParts.push(boxMm(unit, 8.2, 3.4, 2.0, tabX, frontBotYRel + 1.2, frontZRel - 0.1))
    coverEdgeParts.push(boxMm(unit, 8.4, 0.9, 1.0, tabX, frontBotYRel - 0.1, frontZRel + 0.4))
  }

  // Abas laterais transparentes (fecham lateralmente a câmara superior sobre as barras em escada)
  for (const s of [-1, 1] as const) {
    const sx = s * (covW / 2 - paneT / 2)
    const shape = new THREE.Shape()
    shape.moveTo(0, 0)
    shape.lineTo(runZ * unit, frontTopYRel * unit)
    shape.lineTo(runZ * unit, frontBotYRel * unit)
    shape.lineTo(0, (frontTopYRel * 0.55) * unit)
    shape.closePath()
    const cheek = new THREE.ExtrudeGeometry(shape, { depth: paneT * unit, bevelEnabled: false })
    cheek.rotateY(-Math.PI / 2)
    cheek.translate((sx + paneT / 2) * unit, 0, 0)
    coverClearParts.push(cheek)
    // Olhal da dobradiça traseira
    coverClearParts.push(cylMm(unit, 2.2, 2.2, 4.2, s * (covW / 2 - 4.0), 0, 0, 'x', 16))
  }

  const cover = new THREE.Group()
  cover.name = 'busbar-stepped-cover'
  cover.position.copy(hingeLocal)
  cover.add(
    buildMergedMesh(coverClearParts, materials.cover, unit, 'stepped-cover-polycarbonate', 80, false, false),
    buildMergedMesh(coverEdgeParts, materials.coverEdge, unit, 'stepped-cover-rim', 60, false, false),
  )

  // Adesivo de triângulo e raio perigo (ISO 7010-W012) na tampa acrílica
  const dangerTex = cachedDangerStickerTexture()
  if (dangerTex) {
    const decalSizeMm = Math.min(22, covW * 0.32)
    const decalGeo = new THREE.PlaneGeometry(decalSizeMm * unit, decalSizeMm * unit)
    const decalMat = new THREE.MeshBasicMaterial({
      map: dangerTex,
      transparent: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const decalMesh = new THREE.Mesh(decalGeo, decalMat)
    decalMesh.name = 'stepped-cover-danger-decal'
    decalMesh.position.set(0, apronCy * unit, (frontZRel + 0.15) * unit)
    cover.add(decalMesh)
  }

  const root = new THREE.Group()
  root.name = 'stepped-busbar'
  root.add(body, cover)
  return { root, body, cover, dims, hingeLocal }
}
