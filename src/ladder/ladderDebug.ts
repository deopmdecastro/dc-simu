// ============================================================================
// Depuração Ladder (LADDER-SIM-02): pontos de paragem por network e passo a passo.
//
// Os pontos de paragem são estado da sessão de depuração (não fazem parte do
// programa, não vão para o projeto guardado nem para o undo). São avaliados no
// FIM de cada scan em RUN: o scan corre sempre inteiro — como num PLC, as saídas
// nunca ficam a meio — e a simulação passa a PAUSA na network que disparou.
// O rasto do scan (RungTraceEntry[]) permite depois percorrer, network a network,
// o que cada uma fez nesse ciclo (RLO, salto, valores escritos).
// ============================================================================

import type { RungTraceEntry } from './ladderEngine'

/** 'rising' — pára quando a network passa a conduzir (RLO 0→1);
 *  'on' — pára sempre que a network conduz (RLO = 1);
 *  'scan' — pára em todos os ciclos depois de a network correr (mesmo com RLO = 0). */
export type LadderBreakMode = 'rising' | 'on' | 'scan'

export const BREAK_MODE_LABEL: Record<LadderBreakMode, string> = {
  rising: 'ao ligar (RLO 0→1)',
  on: 'enquanto conduz (RLO = 1)',
  scan: 'em cada ciclo',
}

export interface LadderBreakHit {
  rungId: string
  /** posição da network no programa executado (0 = primeira) */
  index: number
  mode: LadderBreakMode
  scan: number
}

/**
 * Procura o primeiro ponto de paragem que dispara neste scan, pela ordem de execução.
 * Networks saltadas por JMP não disparam (não correram).
 */
export function findBreakpointHit(
  breakpoints: Record<string, LadderBreakMode>,
  prevPowered: Record<string, boolean>,
  trace: RungTraceEntry[],
  scan: number,
): LadderBreakHit | null {
  for (const entry of trace) {
    const mode = breakpoints[entry.rungId]
    if (!mode || entry.skipped) continue
    const fired = mode === 'scan'
      || (mode === 'on' && entry.powered)
      || (mode === 'rising' && entry.powered && !prevPowered[entry.rungId])
    if (fired) return { rungId: entry.rungId, index: entry.index, mode, scan }
  }
  return null
}

/** Texto do evento/aviso quando um ponto de paragem pára a simulação. */
export function describeBreakHit(hit: LadderBreakHit, networkNo: number): string {
  const why = hit.mode === 'rising' ? 'passou a conduzir' : hit.mode === 'on' ? 'está a conduzir' : 'foi executada'
  return `Ponto de paragem: Network ${networkNo} ${why} (ciclo ${hit.scan.toLocaleString('pt-PT')}). Simulação em pausa.`
}

/** Valor de rasto para mostrar ao utilizador (1/0 para bits, número para palavras). */
export function formatTraceValue(v: boolean | number): string {
  return typeof v === 'boolean' ? (v ? '1' : '0') : String(v)
}
