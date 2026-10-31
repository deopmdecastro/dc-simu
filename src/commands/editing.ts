// Operações de edição do esquema de comandos (partilhadas pelo canvas, inspetor e barra).
import { nanoid } from 'nanoid'
import { useSimStore } from '../store/useSimStore'
import { CMD_PARTS, emptyCommands, nextTag, snap, terminalLabel, type CmdKind, type CmdPart, type CmdRotation, type CommandsDiagram, type Pt } from './model'
import { useCommandsUi } from './commandsUi'

export const getDiagram = (): CommandsDiagram => useSimStore.getState().commands ?? emptyCommands()
export const commitDiagram = (next: CommandsDiagram) => useSimStore.getState().setCommands(next, 'force')

/** Marcação dos contactos auxiliares pela norma: o 1.º algarismo é o nº de ordem, o 2.º a função. */
export function auxLabels(diagram: CommandsDiagram, kind: CmdKind, tag: string): string[] | undefined {
  const fn = kind === 'contactNO' ? ['3', '4'] : kind === 'contactNC' ? ['1', '2'] : kind === 'timedNO' ? ['7', '8'] : kind === 'timedNC' ? ['5', '6'] : null
  if (!fn) return undefined
  const used = new Set(diagram.parts.filter((p) => p.tag === tag).map((p) => terminalLabel(p, 0)).filter((l) => /^\d\d$/.test(l)).map((l) => l[0]))
  for (let n = 1; n <= 9; n++) if (!used.has(String(n))) return [`${n}${fn[0]}`, `${n}${fn[1]}`]
  return undefined
}

/** Referência proposta: contactos reutilizam o último aparelho que os comanda. */
export function defaultTag(diagram: CommandsDiagram, kind: CmdKind): string {
  if (!CMD_PARTS[kind].prefix) return ''
  const last = (kinds: CmdKind[], fallback: string) => [...diagram.parts].reverse().find((p) => kinds.includes(p.kind))?.tag || fallback
  if (kind === 'contact3' || kind === 'contactNO' || kind === 'contactNC') return last(['coil', 'timerCoil'], 'K1')
  if (kind === 'timedNO' || kind === 'timedNC') return last(['timerCoil'], 'K1')
  if (kind === 'thermalNC' || kind === 'thermalNO') return last(['thermal3'], 'F1')
  return nextTag(diagram, kind)
}

export function addPart(kind: CmdKind, at: Pt): CmdPart {
  const diagram = getDiagram()
  const tag = defaultTag(diagram, kind)
  const part: CmdPart = {
    id: nanoid(8), kind, x: snap(at.x), y: snap(at.y), rot: 0, tag,
    ...(kind === 'supply' ? { lines: ['L1', 'L2', 'L3'] } : {}),
    ...(kind === 'timerCoil' ? { delayMs: 3000 } : {}),
    ...(kind === 'lamp' ? { color: 'green' as const } : {}),
  }
  const labels = auxLabels(diagram, kind, tag)
  if (labels) part.labels = labels
  commitDiagram({ ...diagram, parts: [...diagram.parts, part] })
  useCommandsUi.getState().select({ type: 'part', id: part.id }, 'library')
  return part
}

export function patchPart(id: string, patch: Partial<CmdPart>) {
  const diagram = getDiagram()
  commitDiagram({ ...diagram, parts: diagram.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)) })
}

export function removeSelected() {
  const { selection, select } = useCommandsUi.getState()
  if (!selection) return
  removeItem(selection)
  select(null)
}

export function removeItem(item: { type: 'part' | 'wire'; id: string }) {
  const diagram = getDiagram()
  if (item.type === 'part') commitDiagram({ ...diagram, parts: diagram.parts.filter((p) => p.id !== item.id), wires: diagram.wires.filter((w) => w.a.part !== item.id && w.b.part !== item.id) })
  else commitDiagram({ ...diagram, wires: diagram.wires.filter((w) => w.id !== item.id) })
}

export function rotateSelected() {
  const selection = useCommandsUi.getState().selection
  if (selection?.type !== 'part') return
  const diagram = getDiagram()
  commitDiagram({ ...diagram, parts: diagram.parts.map((p) => (p.id === selection.id ? { ...p, rot: ((p.rot + 90) % 360) as CmdRotation } : p)) })
}
