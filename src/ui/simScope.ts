/**
 * Âmbito do RUN quando o projeto tem vários simuladores (3D, Ladder, GRAFCET, IEC).
 * 3D/Ladder/GRAFCET partilham o motor PLC; o esquema IEC tem motor próprio.
 */
import type { CommandsDiagram } from '../commands/model'
import type { GrafcetProgram } from '../grafcet/engine'
import type { LadderRung, LadderTag } from '../types'
import type { ElectricalComponent } from '../types'
import type { PlcProgram } from '../ladder/plcPrograms'

export type SimModuleId = 'schematic' | 'ladder' | 'grafcet' | 'commands'

export type SimModule = {
  id: SimModuleId
  title: string
  description: string
}

type Snapshot = {
  components: ElectricalComponent[]
  ladderRungs: LadderRung[]
  plcPrograms?: Record<string, PlcProgram>
  projectFiles?: Record<string, Array<{ rungs?: LadderRung[] }>>
  grafcet: GrafcetProgram
  commands: CommandsDiagram
}

export function hasLadderContent(state: Snapshot): boolean {
  if (state.ladderRungs.length > 0) return true
  if (state.plcPrograms) {
    for (const program of Object.values(state.plcPrograms)) {
      if (program?.rungs?.length) return true
      if (program?.fc1?.length || program?.fc2?.length) return true
    }
  }
  if (state.projectFiles) {
    for (const files of Object.values(state.projectFiles)) {
      if (files?.some((file) => (file.rungs?.length ?? 0) > 0)) return true
    }
  }
  return false
}

export function hasGrafcetContent(grafcet: GrafcetProgram): boolean {
  return (grafcet?.steps?.length ?? 0) > 0
}

export function hasCommandsContent(commands: CommandsDiagram): boolean {
  return (commands?.parts?.length ?? 0) > 0
}

export function hasSchematicContent(components: ElectricalComponent[]): boolean {
  return components.length > 0
}

/** Módulos com conteúdo real no projeto (candidatos ao diálogo de Play). */
export function listSimModules(state: Snapshot): SimModule[] {
  const modules: SimModule[] = []
  if (hasSchematicContent(state.components)) {
    modules.push({
      id: 'schematic',
      title: '3D / Esquema',
      description: 'Painel 3D e continuidade elétrica dos componentes.',
    })
  }
  if (hasLadderContent(state)) {
    modules.push({
      id: 'ladder',
      title: 'Ladder',
      description: 'Programa Ladder (OB1 / FCs) no PLC.',
    })
  }
  if (hasGrafcetContent(state.grafcet)) {
    modules.push({
      id: 'grafcet',
      title: 'GRAFCET',
      description: 'Sequência GRAFCET e etapas ativas.',
    })
  }
  if (hasCommandsContent(state.commands)) {
    modules.push({
      id: 'commands',
      title: 'IEC / Comandos',
      description: 'Esquema de potência e comando (IEC 60617).',
    })
  }
  return modules
}

/** Vista do toolbar → módulo de simulação correspondente. */
export function moduleOfView(mode: string): SimModuleId {
  if (mode === 'commands') return 'commands'
  if (mode === 'ladder') return 'ladder'
  if (mode === 'grafcet') return 'grafcet'
  return 'schematic'
}

/** O motor PLC (3D + Ladder + GRAFCET) deve correr para este âmbito? */
export function scopeNeedsPanel(scope: 'all' | SimModuleId): boolean {
  return scope === 'all' || scope === 'schematic' || scope === 'ladder' || scope === 'grafcet'
}

/** O motor IEC deve correr para este âmbito? */
export function scopeNeedsCommands(scope: 'all' | SimModuleId): boolean {
  return scope === 'all' || scope === 'commands'
}
