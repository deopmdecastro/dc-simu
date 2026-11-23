/**
 * Condutas físicas da maquete de estampagem (mm, coordenadas do layout).
 *
 * Uma única fonte de verdade para «por onde podem passar cabos». Serve dois fins:
 *  1. o encaminhamento (`stampingBenchWiring`) escolhe os pontos de passagem dentro destes volumes;
 *  2. a auditoria geométrica verifica que nenhum troço sai deles nem atravessa estrutura.
 *
 * Todas as condutas são segmentos com uma secção retangular: eixo (um dos eixos X/Y/Z), meia-largura
 * transversal e meia-abertura da boca. Um ponto «está na calha» se cair dentro (ou a `TOL` mm) do
 * volume de qualquer segmento.
 */
import type { BenchPlacement } from './stampingBench'

export type ConduitAxis = 'x' | 'y' | 'z'

export interface Conduit {
  /** Identificador legível (peça que a materializa). */
  key: string
  /** Eixo ao longo do qual a calha corre. */
  axis: ConduitAxis
  /** Coordenada do eixo nas outras duas direções. */
  at: Record<string, number>
  /** Extremos ao longo do eixo. */
  from: number
  to: number
  /** Meia-largura (na 2.ª direção transversal) e meia-abertura (na 3.ª). */
  halfA: number
  halfB: number
}

/** Folga aceite entre o eixo do cabo e o bordo da calha (mm). */
export const CONDUIT_TOL_MM = 30

const sec = (p: BenchPlacement) => {
  const s = (p.state ?? {}) as Record<string, unknown>
  return {
    len: Number(s.lengthMm ?? 600),
    w: Number(s.widthMm ?? 40),
    h: Number(s.heightMm ?? s.sideHeightMm ?? 60),
    d: Number(s.depthMm ?? 0),
  }
}

const deg = (v: unknown) => Math.abs(Number(v ?? 0))

/**
 * Deriva as condutas a partir das peças da maquete. Só entram peças que são fisicamente calhas,
 * esteiras ou descidas — e a orientação de cada uma diz em que eixo corre.
 */
export function benchConduits(parts: BenchPlacement[]): Conduit[] {
  const out: Conduit[] = []
  for (const p of parts) {
    const s = sec(p)
    const o = (p.orientation ?? {}) as { x?: number; y?: number; z?: number }
    const half = s.len / 2
    if (p.type === 'mecBenchDuct') {
      // Calha ranhurada: 34 mm de largura × 42 mm de altura. O `state.axis` diz em que direção corre
      // (as perimetrais ao longo de X ou Z, a descida na perna é uma calha vertical: z = 90).
      const axisState = String((p.state as any)?.axis ?? '')
      const vertical = deg(o.z) === 90
      if (vertical) {
        out.push({ key: p.key, axis: 'y', at: { x: p.x, z: p.z }, from: p.y - half, to: p.y + half, halfA: s.w / 2, halfB: 22 })
      } else if (axisState === 'z') {
        out.push({ key: p.key, axis: 'z', at: { x: p.x, y: p.y }, from: p.z - half, to: p.z + half, halfA: s.h / 2, halfB: s.w / 2 })
      } else {
        out.push({ key: p.key, axis: 'x', at: { y: p.y, z: p.z }, from: p.x - half, to: p.x + half, halfA: s.h / 2, halfB: s.w / 2 })
      }
    } else if (p.type === 'cableDuct') {
      // Calha técnica do QE1: corre em X ao longo da placa.
      out.push({ key: p.key, axis: 'x', at: { y: p.y, z: p.z }, from: p.x - half, to: p.x + half, halfA: s.h / 2, halfB: s.d / 2 || 21 })
    } else if (p.type === 'cableTrayStraight') {
      // Esteira perfurada: horizontal em X (parede/ramais), em Z (pescoço/ramal) ou vertical (subidas).
      const vertical = deg(o.z) === 90
      const alongZ = deg(o.y) === 90
      if (vertical) {
        out.push({ key: p.key, axis: 'y', at: { x: p.x, z: p.z }, from: p.y - half, to: p.y + half, halfA: s.w / 2, halfB: 35 })
      } else if (alongZ) {
        out.push({ key: p.key, axis: 'z', at: { x: p.x, y: p.y }, from: p.z - half, to: p.z + half, halfA: s.w / 2, halfB: 35 })
      } else {
        out.push({ key: p.key, axis: 'x', at: { y: p.y, z: p.z }, from: p.x - half, to: p.x + half, halfA: s.w / 2, halfB: 35 })
      }
    }
  }
  return out
}

/** Distância de um ponto ao volume de uma conduta (0 = dentro). */
export function distanceToConduit(q: { x: number; y: number; z: number }, c: Conduit): number {
  const axes: ConduitAxis[] = ['x', 'y', 'z']
  const along = axes.find((a) => a === c.axis)!
  const cross = axes.filter((a) => a !== c.axis)
  const over = Math.max(0, c.from - q[along], q[along] - c.to)
  const dA = Math.max(0, Math.abs(q[cross[0]] - c.at[cross[0]]) - c.halfA)
  const dB = Math.max(0, Math.abs(q[cross[1]] - c.at[cross[1]]) - c.halfB)
  return Math.hypot(over, dA, dB)
}

/** Conduta mais próxima de um ponto, com a respetiva distância. */
export function nearestConduit(q: { x: number; y: number; z: number }, conduits: Conduit[]) {
  let best: { conduit: Conduit; distance: number } | null = null
  for (const c of conduits) {
    const d = distanceToConduit(q, c)
    if (!best || d < best.distance) best = { conduit: c, distance: d }
  }
  return best
}

/** `true` se o ponto está dentro da calha (com folga `tol`). */
export function insideConduit(q: { x: number; y: number; z: number }, conduits: Conduit[], tol = CONDUIT_TOL_MM): boolean {
  return conduits.some((c) => distanceToConduit(q, c) <= tol)
}
