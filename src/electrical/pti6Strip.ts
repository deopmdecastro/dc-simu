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
