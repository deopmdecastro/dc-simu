// Régua PTI6 — geração dinâmica de N pólos (N blocos lado a lado).
// Cada bloco tem 2 bornes (1/2) em ponte interna; N blocos = 2*N terminais.
// Largura física: 8.15mm por bloco; footprint esquema: base 76px por bloco.
import type { TerminalTemplate } from './factory'
import { getComponentPhysicalSizeMm } from '../three/modelPaths'
import { REAL_TERMINALS } from './realInterfaces'

const KIND_COLOR_FALLBACK: Record<string, string> = { io: '#f59e0b', 'power-in': '#ef4444', 'power-out': '#f87171' }

export const PTI6_BASE_WIDTH_MM = 8.15
export const PTI6_BASE_SCHEMATIC_W = 76
export const PTI6_BASE_SCHEMATIC_H = 118
export const PTI6_MIN_POLES = 1
export const PTI6_MAX_POLES = 48

export function clampPoleCount(n: unknown): number {
  const v = Math.floor(Number(n))
  if (!Number.isFinite(v)) return 1
  return Math.max(PTI6_MIN_POLES, Math.min(PTI6_MAX_POLES, v))
}

export function pti6PhysicalWidthMm(poleCount: number): number {
  return PTI6_BASE_WIDTH_MM * clampPoleCount(poleCount)
}
export function pti6SchematicFootprint(poleCount: number): { w: number; h: number } {
  const n = clampPoleCount(poleCount)
  return { w: PTI6_BASE_SCHEMATIC_W * n, h: PTI6_BASE_SCHEMATIC_H }
}

const KIND_TYPE_LOCAL: Record<string, string> = { io: 'spring', 'power-in': 'screw', 'power-out': 'screw' }
function T(label: string, kind: any, x: number, y: number, extra: Partial<TerminalTemplate> = {}): TerminalTemplate {
  return {
    label, kind, x, y,
    terminalType: (extra.terminalType as any) ?? (KIND_TYPE_LOCAL[kind] as any) ?? 'spring',
    color: (extra.color as any) ?? (KIND_COLOR_FALLBACK as any)[kind] ?? '#f59e0b',
    ...extra,
  } as TerminalTemplate
}

/** Gera 2*N bornes para N blocos PTI6. Rótulos 1..2N (1-2 = bloco1, 3-4=bloco2…). */
export function pti6TerminalTemplates(poleCount: number): TerminalTemplate[] {
  const n = clampPoleCount(poleCount)
  const spots = REAL_TERMINALS['terminalPhoenixPti6']
  const topSpot = spots?.find(s => s.label === '1')
  const botSpot = spots?.find(s => s.label === '2')
  const list: TerminalTemplate[] = []
  for (let i = 0; i < n; i++) {
    const cx = (i + 0.5) / n
    const topLabel = String(i * 2 + 1)
    const botLabel = String(i * 2 + 2)
    // posições 3D: cada bloco ocupa fração 1/n da largura; spot.x é intra-bloco (0..1)
    const topX3d = topSpot ? (i + topSpot.x) / n : cx
    const botX3d = botSpot ? (i + botSpot.x) / n : cx
    // socket: realTerminalPosition usa dimensão física do PTI6 simples; para régua recalculamos.
    // Fallback conservador: usar coordenada fracionada dentro da régua.
    const topPos3D = topSpot ? { x: topX3d, y: 1, z: 1 } : { x: cx, y: 1, z: 1 }
    const botPos3D = botSpot ? { x: botX3d, y: 0, z: 1 } : { x: cx, y: 0, z: 1 }
    const baseExtra = { terminalType: 'spring' as const, color: '#f59e0b' }
    list.push(T(topLabel, 'io', cx, 0, { ...baseExtra, position3D: topPos3D, diameter: topSpot?.diameterMm ?? 4.2 }))
    list.push(T(botLabel, 'io', cx, 1, { ...baseExtra, position3D: botPos3D, diameter: botSpot?.diameterMm ?? 4.2 }))
  }
  return list
}

/** Largura/altura física dinâmica para um componente PTI6 (ou conjunto) */
export function getPti6DynamicPhysicalSizeMm(type: string, poleCount?: number) {
  const base = getComponentPhysicalSizeMm(type as any)
  if (!base) return undefined
  if (type === 'terminalPhoenixPti6' && poleCount && poleCount > 1) {
    return { width: PTI6_BASE_WIDTH_MM * clampPoleCount(poleCount), height: base.height, depth: base.depth }
  }
  return base
}

/** Passo do pente no esquema: bornes hierárquicos encostam (como na calha); soltos deixam uma folga para a TAG. */
export const TERMINAL_STRIP_GAP_PX = { hierarchical: 0, loose: 4 } as const

export interface TerminalStripPlan {
  /** TAG do borne de origem depois de gerar a régua (X1 → X1.0 quando hierárquico e livre). */
  baseRef: string
  /** TAGs dos clones, por ordem (count − 1 entradas). */
  refs: string[]
}

/**
 * Planeia as TAGs de uma régua de `count` bornes a partir de `baseRef`.
 * Hierárquico: prefixo.N consecutivo, a continuar a série se o borne já é X1.3 e a saltar índices ocupados
 * (nunca gera «X1.1_1»). Solto: o próximo número livre da família (X1, X2 → X3…).
 */
export function planTerminalStripRefs(otherRefs: Iterable<string>, baseRef: string, count: number, hierarchical: boolean): TerminalStripPlan {
  const used = new Set(otherRefs)
  const total = Math.max(1, Math.floor(count))
  const refs: string[] = []
  if (hierarchical) {
    const m = baseRef.match(/^(.*?)\.(\d+)$/)
    const prefix = m ? m[1] : baseRef
    let idx = m ? Number(m[2]) + 1 : 1
    let outBase = baseRef
    if (!m && !used.has(`${prefix}.0`)) outBase = `${prefix}.0`
    while (refs.length < total - 1) { const r = `${prefix}.${idx++}`; if (!used.has(r) && r !== outBase) refs.push(r) }
    return { baseRef: outBase, refs }
  }
  const tag = baseRef.replace(/\.\d+$/, '').replace(/\d+$/, '') || 'X'
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`^${escaped}(\\d+)$`)
  let max = 0
  for (const r of [...used, baseRef]) { const mm = re.exec(r); if (mm) max = Math.max(max, Number(mm[1])) }
  while (refs.length < total - 1) refs.push(`${tag}${++max}`)
  return { baseRef, refs }
}

/** Pré-visualização das TAGs para o inspetor (primeiras/últimas, com reticências). */
export function describeTerminalStripRefs(plan: TerminalStripPlan, max = 5): string {
  const all = [plan.baseRef, ...plan.refs]
  return all.length <= max ? all.join(', ') : `${all.slice(0, max - 2).join(', ')} … ${all[all.length - 1]}`
}
