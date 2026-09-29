import type { ElectricalComponent, LadderRung } from '../types'

export type PlcProgram = { rungs: LadderRung[]; fc1: LadderRung[]; fc2: LadderRung[] }
export const isProgrammablePlc = (c: ElectricalComponent) =>
  c.type === 'plcLogo' || c.type === 'plcCompact' || c.type === 'plcSiemensLogo1224RC' || c.type === 'plcLsXbmDn32s'

export const blankPlcProgram = (): PlcProgram => ({ rungs: [], fc1: [], fc2: [] })

export function programsForSave(programs: Record<string, PlcProgram>, activeId: string | null,
  rungs: LadderRung[], fc: { fc1: LadderRung[]; fc2: LadderRung[] }) {
  return activeId ? { ...programs, [activeId]: { rungs, fc1: fc.fc1, fc2: fc.fc2 } } : programs
}
