import { useMemo } from 'react'
import { useSimStore } from '../store/useSimStore'
import { useCommandsUi } from '../commands/commandsUi'
import { CMD_PARTS, partTerminals, terminalLabel, type CommandsDiagram } from '../commands/model'
import type { CmdRuntime } from '../commands/engine'
import { callableFunctions, executedRungs, lintLadder } from '../ladder/ladderLint'
import { isProgrammablePlc } from '../ladder/plcPrograms'
import { validateGrafcet } from '../grafcet/engine'
import { detectDiagnostics } from '../utils/errorDetection'
import type { ElectricalComponent, FaultState, SimulationDiagnostic, Wire } from '../types'

/**
 * Diagnóstico de cada simulador (3D Realista, Esquema IEC, Ladder, GRAFCET) no mesmo formato:
 * a etiqueta de estado (✓ tudo OK · ! avisos · ✖ erros) e o painel «Diagnóstico» leem daqui.
 */
export type DiagLevel = 'error' | 'warning' | 'info'
export interface DiagItem { id: string; level: DiagLevel; message: string; /** Entidade a selecionar ao clicar. */ target?: string }
export interface DiagSummary { items: DiagItem[]; errors: number; warnings: number; status: 'ok' | 'warning' | 'error' }
export type DiagView = 'schematic' | 'commands' | 'ladder' | 'grafcet'

export function summarize(items: DiagItem[]): DiagSummary {
  const errors = items.filter((item) => item.level === 'error').length
  const warnings = items.filter((item) => item.level === 'warning').length
  return { items, errors, warnings, status: errors ? 'error' : warnings ? 'warning' : 'ok' }
}

/** Mensagens antigas trazem «ERRO:»/«AVISO:» no início — o nível já diz isso. */
const clean = (message: string) => message.replace(/^(ERRO|AVISO|INFO)\s*:\s*/i, '')

/**
 * 3D Realista: com a simulação a correr, os diagnósticos do motor elétrico; parada, a mesma verificação
 * sobre a montagem (cabos sem destino, bobinas sem alimentação, motor sem térmico…).
 */
export function schematicDiagnostics(components: ElectricalComponent[], wires: Wire[], live: SimulationDiagnostic[], running: boolean, faults?: FaultState): DiagItem[] {
  const source = running ? live : detectDiagnostics(components, wires, new Set(), faults)
  const seen = new Set<string>()
  return source.filter((item) => {
    const key = `${item.level}|${item.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).map((item, index) => ({ id: `sch-${index}-${item.componentId ?? ''}`, level: item.level, message: clean(item.message), target: item.componentId }))
}

/** Esquema IEC (comandos): verificação estática do desenho + falha da simulação, se houver. */
export function commandsDiagnostics(diagram: CommandsDiagram, rt?: Pick<CmdRuntime, 'fault'>): DiagItem[] {
  const items: DiagItem[] = []
  const add = (level: DiagLevel, message: string, target?: string) => items.push({ id: `cmd-${items.length}`, level, message, target })
  if (rt?.fault) add('error', `Simulação: ${rt.fault}`)
  const parts = diagram.parts ?? []
  const wires = diagram.wires ?? []
  if (!parts.length) return items
  const byId = new Map(parts.map((part) => [part.id, part]))
  const links = new Map<string, number>()
  for (const wire of wires) {
    for (const end of [wire.a, wire.b]) {
      const part = byId.get(end.part)
      if (!part || end.term < 0 || end.term >= partTerminals(part).length) {
        add('error', `Cabo sem destino válido (símbolo ou borne apagado).`)
        continue
      }
      links.set(`${end.part}:${end.term}`, (links.get(`${end.part}:${end.term}`) ?? 0) + 1)
    }
  }
  const name = (part: CommandsDiagram['parts'][number]) => `${part.tag || CMD_PARTS[part.kind].label}`
  const termLabel = (part: CommandsDiagram['parts'][number], index: number) => terminalLabel(part, index) || String(index + 1)
  if (!parts.some((part) => part.kind === 'supply')) add('error', 'Não há alimentação: junte um símbolo «Alimentação» (L1/L2/L3, N, PE ou L+/M).')

  const coils = new Map<string, number>()
  for (const part of parts) if ((part.kind === 'coil' || part.kind === 'timerCoil') && part.tag) coils.set(part.tag, (coils.get(part.tag) ?? 0) + 1)
  for (const [tag, count] of coils) if (count > 1) add('error', `A bobina ${tag} aparece ${count} vezes — cada contactor/relé tem uma só bobina.`)
  const thermals = new Set(parts.filter((part) => part.kind === 'thermal3').map((part) => part.tag))

  for (const part of parts) {
    const def = CMD_PARTS[part.kind]
    if (def.prefix && !part.tag.trim()) add('warning', `${def.label} sem referência (ex.: ${def.prefix}1).`, part.id)
    const terms = partTerminals(part)
    const loose = terms.map((_, index) => index).filter((index) => !links.get(`${part.id}:${index}`))
    if (part.kind === 'node') {
      if (loose.length) add('warning', 'Nó sem cabos ligados.', part.id)
      continue
    }
    if (part.kind === 'supply') {
      // Linhas da alimentação podem ficar por usar (N, PE…); só avisa quando nenhuma está ligada.
      if (loose.length === terms.length) add('warning', `Alimentação ${(part.lines ?? []).join('/')} sem cabos ligados.`.replace('  ', ' '), part.id)
      continue
    }
    if (def.family === 'coil' || def.family === 'load') {
      if (loose.length) add('error', `${name(part)}: ${loose.map((index) => termLabel(part, index)).join(', ')} sem ligação — não recebe corrente.`, part.id)
    } else if (loose.length === terms.length) {
      add('warning', `${name(part)} (${def.label}) não está ligado a nada.`, part.id)
    } else if (loose.length) {
      add('warning', `${name(part)}: borne ${loose.map((index) => termLabel(part, index)).join(', ')} sem ligação.`, part.id)
    }
    if (def.family === 'contact' && part.tag) {
      const thermalContact = part.kind === 'thermalNC' || part.kind === 'thermalNO'
      if (thermalContact ? !thermals.has(part.tag) && !coils.has(part.tag) : !coils.has(part.tag)) {
        add('warning', thermalContact
          ? `Contacto ${part.tag} ${termLabel(part, 0)}-${termLabel(part, 1)}: não existe o relé térmico ${part.tag} no esquema.`
          : `Contacto ${part.tag} ${termLabel(part, 0)}-${termLabel(part, 1)}: não existe a bobina ${part.tag} — nunca muda de estado.`, part.id)
      }
    }
    if (part.kind === 'timerCoil' && !(part.delayMs && part.delayMs > 0)) add('warning', `Temporizador ${name(part)} sem atraso definido.`, part.id)
  }
  const motors = parts.filter((part) => part.kind === 'motor3' || part.kind === 'motor6')
  if (motors.length && !parts.some((part) => part.kind === 'thermal3' || part.kind === 'breaker3')) {
    add('warning', `Motor ${motors.map(name).join(', ')} sem proteção contra sobrecarga (relé térmico ou disjuntor-motor).`, motors[0].id)
  }
  return items
}

/** 3D Realista: diagnóstico da montagem / simulação elétrica. */
export function useSchematicDiagnostics(): DiagSummary {
  const components = useSimStore((s) => s.components)
  const wires = useSimStore((s) => s.wires)
  const live = useSimStore((s) => s.sim.diagnostics)
  const running = useSimStore((s) => s.sim.runState !== 'stopped')
  const faults = useSimStore((s) => s.sim.faults)
  // Parada: recalcula só quando a montagem muda; a correr: os diagnósticos do motor elétrico.
  return useMemo(() => summarize(schematicDiagnostics(components, wires, live, running, faults)), running ? [running, live, components, wires, faults] : [running, components, wires, faults, null])
}

/** Esquema IEC (comandos). */
export function useCommandsDiagnostics(): DiagSummary {
  const commands = useSimStore((s) => s.commands)
  const fault = useCommandsUi((s) => s.rt.fault)
  return useMemo(() => summarize(commandsDiagnostics(commands, { fault })), [commands, fault])
}

/** Ladder: a mesma verificação do separador «Verificação» do editor. */
export function useLadderDiagnostics(): DiagSummary {
  const rungs = useSimStore((s) => s.ladder.rungs)
  const fcBlocks = useSimStore((s) => s.fcBlocks)
  const files = useSimStore((s) => s.projectFiles[s.activePlcId ?? '_general'])
  const tags = useSimStore((s) => s.tags)
  const physicalInputs = useSimStore((s) => s.components.some(isProgrammablePlc))
  return useMemo(() => summarize(lintLadder({ rungs: executedRungs(rungs, callableFunctions(fcBlocks, files)) }, { physicalInputs, tags })
    .map((issue): DiagItem => ({ id: `lad-${issue.id}`, level: issue.level, message: issue.message, target: issue.rungId }))), [rungs, fcBlocks, files, tags, physicalInputs])
}

/** GRAFCET: a mesma validação do separador «Diagnóstico» do editor. */
export function useGrafcetDiagnostics(): DiagSummary {
  const grafcet = useSimStore((s) => s.grafcet)
  return useMemo(() => summarize(validateGrafcet(grafcet)
    .map((issue): DiagItem => ({ id: `gr-${issue.id}`, level: issue.level, message: issue.message, target: issue.entityId }))), [grafcet])
}
