// Operações de edição do esquema de comandos (partilhadas pelo canvas, inspetor e barra).
import { nanoid } from 'nanoid'
import { useSimStore } from '../store/useSimStore'
import { CMD_PARTS, emptyCommands, nextTag, snap, terminalLabel, type CmdKind, type CmdPart, type CmdRotation, type CmdWire, type CommandsDiagram, type Pt } from './model'
import { useCommandsUi } from './commandsUi'
import { DEFAULT_PAGE_ID, normalizeCommandsPages, pagesOf } from './pages'

export const getDiagram = (): CommandsDiagram => useSimStore.getState().commands ?? emptyCommands()
export const commitDiagram = (next: CommandsDiagram) => useSimStore.getState().setCommands(next, 'force')
/** Substitui o esquema inteiro (importar, exemplo, limpar): os textos livres do IEC do esquema anterior
 *  saem no mesmo passo de Desfazer (as legendas do esquema novo passam a textos livres ao abrir). */
export const replaceDiagram = (next: CommandsDiagram) => {
  commitDiagram(next)
  useSimStore.setState((state) => ({ canvasTexts: (state.canvasTexts ?? []).filter((t) => t.view !== 'commands') }))
}

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
  if (kind === 'timedOffNO' || kind === 'timedOffNC') return last(['timerOffCoil'], 'K1')
  if (kind === 'thermalNC' || kind === 'thermalNO') return last(['thermal3'], 'F1')
  return nextTag(diagram, kind)
}

export function addPart(kind: CmdKind, at: Pt, pageId?: string): CmdPart {
  const diagram = normalizeCommandsPages(getDiagram())
  const pages = pagesOf(diagram)
  const page = pageId && pages.some((p) => p.id === pageId) ? pageId : (useCommandsUi.getState().activePageId || pages[0]?.id || DEFAULT_PAGE_ID)
  const tag = defaultTag(diagram, kind)
  const part: CmdPart = {
    id: nanoid(8), kind, x: snap(at.x), y: snap(at.y), rot: 0, tag, page,
    ...(kind === 'supply' ? { lines: ['L1', 'L2', 'L3'] } : {}),
    ...(kind === 'timerCoil' || kind === 'timerOffCoil' ? { delayMs: 3000 } : {}),
    ...(kind === 'lamp' ? { color: 'green' as const } : {}),
  }
  const labels = auxLabels(diagram, kind, tag)
  if (labels) part.labels = labels
  commitDiagram({ ...diagram, parts: [...diagram.parts, part] })
  useCommandsUi.getState().select({ type: 'part', id: part.id }, 'library')
  // Só entra em «Recentes» o que foi mesmo colocado (escolher e cancelar não conta).
  useCommandsUi.getState().markRecent(kind)
  return part
}

export function patchWire(id: string, patch: Partial<CmdWire>) {
  const diagram = getDiagram()
  commitDiagram({ ...diagram, wires: diagram.wires.map((w) => (w.id === id ? { ...w, ...patch } : w)) })
}

export function patchPart(id: string, patch: Partial<CmdPart>) {
  const diagram = getDiagram()
  commitDiagram({ ...diagram, parts: diagram.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)) })
}

/** Apaga a seleção de grupo: símbolos, títulos do esquema (um só passo de Desfazer) e textos livres. */
export function removeSelectedGroup() {
  const { selection, selectedPartIds, selectedTextIds, selectedLabelIds, select } = useCommandsUi.getState()
  const parts = new Set(selectedPartIds.length ? selectedPartIds : selection?.type === 'part' ? [selection.id] : [])
  const labels = new Set(selectedLabelIds)
  if (parts.size || labels.size) {
    const diagram = getDiagram()
    commitDiagram({
      ...diagram,
      parts: diagram.parts.filter((p) => !parts.has(p.id)),
      wires: diagram.wires.filter((w) => !parts.has(w.a.part) && !parts.has(w.b.part)),
      texts: (diagram.texts ?? []).filter((t) => !labels.has(t.id)),
    })
  }
  // Um só passo de Desfazer: o primeiro texto só regista histórico se o esquema não o fez já.
  selectedTextIds.forEach((id, i) => useSimStore.getState().removeCanvasText(id, i === 0 && !parts.size && !labels.size))
  select(null)
}

export function removeSelected() {
  const { selection, selectedPartIds, select } = useCommandsUi.getState()
  if (selectedPartIds.length > 1) {
    const diagram = getDiagram()
    const drop = new Set(selectedPartIds)
    commitDiagram({
      ...diagram,
      parts: diagram.parts.filter((p) => !drop.has(p.id)),
      wires: diagram.wires.filter((w) => !drop.has(w.a.part) && !drop.has(w.b.part)),
    })
    select(null)
    return
  }
  if (!selection) return
  removeItem(selection)
  select(null)
}

export function removeItem(item: { type: 'part' | 'wire' | 'text'; id: string }) {
  if (item.type === 'text') {
    useSimStore.getState().removeCanvasText(item.id)
    return
  }
  const diagram = getDiagram()
  if (item.type === 'part') commitDiagram({ ...diagram, parts: diagram.parts.filter((p) => p.id !== item.id), wires: diagram.wires.filter((w) => w.a.part !== item.id && w.b.part !== item.id) })
  else commitDiagram({ ...diagram, wires: diagram.wires.filter((w) => w.id !== item.id) })
}

export function rotateSelected() {
  const { selection, selectedPartIds } = useCommandsUi.getState()
  const ids = selectedPartIds.length ? selectedPartIds : (selection?.type === 'part' ? [selection.id] : [])
  if (!ids.length) return
  const diagram = getDiagram()
  const setIds = new Set(ids)
  commitDiagram({
    ...diagram,
    parts: diagram.parts.map((p) => (setIds.has(p.id) ? { ...p, rot: ((p.rot + 90) % 360) as CmdRotation } : p)),
  })
}
