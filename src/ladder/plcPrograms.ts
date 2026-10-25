import type { ElectricalComponent, LadderRung } from '../types'

/** Programa de um PLC programável: a Main vem sempre; FC1/FC2 só contam quando
 *  foram adicionadas manualmente (`fcAdded`) ou já têm conteúdo guardado. */
export type PlcProgram = {
  rungs: LadderRung[]
  fc1: LadderRung[]
  fc2: LadderRung[]
  fcAdded?: { fc1?: boolean; fc2?: boolean }
}

export const isProgrammablePlc = (c: ElectricalComponent) =>
  c.type === 'plcLogo' || c.type === 'plcCompact' || c.type === 'plcSiemensLogo1224RC' || c.type === 'plcLsXbmDn32s'

export const blankPlcProgram = (): PlcProgram => ({ rungs: [], fc1: [], fc2: [] })

/** Presença das funções fixas: explícita em `fcAdded`, ou implícita pelo conteúdo
 *  (projetos antigos sem o campo mantêm FC1/FC2 se tiverem networks ou nome). */
export const fcPresentOf = (
  added: { fc1?: boolean; fc2?: boolean } | undefined,
  program: Pick<PlcProgram, 'fc1' | 'fc2'>,
  names?: Partial<Record<'fc1' | 'fc2', string>>,
): Record<'fc1' | 'fc2', boolean> => ({
  fc1: added?.fc1 ?? (program.fc1.length > 0 || !!names?.fc1?.trim()),
  fc2: added?.fc2 ?? (program.fc2.length > 0 || !!names?.fc2?.trim()),
})

export function programsForSave(programs: Record<string, PlcProgram>, activeId: string | null,
  rungs: LadderRung[], fc: { fc1: LadderRung[]; fc2: LadderRung[] }, fcAdded?: Record<'fc1' | 'fc2', boolean>) {
  return activeId ? { ...programs, [activeId]: { rungs, fc1: fc.fc1, fc2: fc.fc2, ...(fcAdded ? { fcAdded } : {}) } } : programs
}
