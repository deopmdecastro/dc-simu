// ============================================================================
// Simulador de comandos elétricos — canvas do esquema IEC (vista central).
// A biblioteca/inspetor (esquerda), as Entradas/Saídas e os Objetos (direita) e a
// barra de ferramentas partilham o estado em `useCommandsUi`; o esquema vive na store.
// ============================================================================
import { useCallback, useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { nanoid } from 'nanoid'
import { useSimStore } from '../store/useSimStore'
import { useNonPassiveListener } from '../ui/useNonPassiveListener'
import { useNarrowMenu } from '../ui/toolbarKit'
import { PHONE_TOUCH_QUERY } from '../ui/device'
import CommandsSimDock from './CommandsSimDock'
import { pinchPan, usePinchZoom } from '../ui/usePinchZoom'
import { isModalOpen, isTypingTarget } from '../ui/editorKeys'
import { uiConfirm, uiPrompt } from '../ui/dialogs'
import { editorGridBackground, editorGridPitch } from '../ui/editorTheme'
import CanvasPanScrollbars from '../ui/CanvasPanScrollbars'
import { IconCommands, IconExample, IconImport, IconPlus, IconTemplates } from '../ui/icons'
import { InlineName } from '../ui/InlineName'
import {
  CMD_GRID, CMD_PARTS, emptyCommands, partBox, partTerminals, snap, terminalAt, terminalLabel, wirePoints,
  type CmdEnd, type CmdKind, type CmdPart, type CmdText, type CmdWire, type CommandsDiagram, type Pt,
} from './model'
import { addPage, normalizeCommandsPages, pageRefPeers, pagesOf, partsOnPage, removePage, renamePage, textsOnPage, wiresOnPage, DEFAULT_PAGE_ID, pageIdOf } from './pages'
import PageLinkDialog from './PageLinkDialog'
import TagTextDialog from './TagTextDialog'
import { emptyCmdRuntime, isClosed } from './engine'
import { CmdSymbol, cmdTagPosition, cmdTagBounds, PHASE_COLORS, type CmdSymbolState } from './symbols'
import { COMMANDS_EXAMPLES, type CommandsExampleInfo } from './examples'
import CommandsExamplesDialog from './CommandsExamplesDialog'
import CommandsImportDialog from './CommandsImportDialog'
import type { CircuitImportResult } from './fluidSimCircuit'
import { MOMENTARY, TOGGLES, useCommandsUi } from './commandsUi'
import { addPart, commitDiagram, defaultTag, removeItem, removeSelected, rotateSelected, removeSelectedGroup } from './editing'
import { CommandsNotesLayer, CommandsTextsLayer, CommandsTextToolbar, DEFAULT_TEXT_STYLE_COMMANDS } from './CommandsAnnotations'
import { useCanvasAction, useSimUi } from '../ui/simUi'
import { NOTE_COLORS } from '../ui/textStyle'
import '../styles/commands.css'

type View = { x: number; y: number; scale: number }
const TICK_MS = 50
/** Limites do zoom do esquema IEC: botões, roda do rato e pinça usam os mesmos. */
export const CMD_ZOOM_MIN = 0.3
export const CMD_ZOOM_MAX = 5

/** Caixa aproximada de um texto livre (unidades do canvas). */
const freeTextBox = (t: { x: number; y: number; text: string; size: number; width?: number }) => {
  const lines = String(t.text || ' ').split('\n')
  const w = t.width ?? Math.max(...lines.map((l) => l.length)) * t.size * 0.62
  return { x: t.x, y: t.y, w: Math.max(t.size, w), h: lines.length * t.size * 1.3 }
}
/** Caixa aproximada de um título do esquema (texto SVG a 13 px, y = linha de base). */
const labelBox = (t: { x: number; y: number; text: string }) => ({ x: t.x, y: t.y - 13, w: Math.max(13, t.text.length * 7.6), h: 17 })

const distToSegment = (p: Pt, a: Pt, b: Pt) => {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0
  return { d: Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)), q: { x: a.x + dx * t, y: a.y + dy * t } }
}

export default function CommandsEditor({ demo = false, onOpenGrafcet }: { demo?: boolean; onOpenGrafcet?: () => void }) {
  const stored = useSimStore((s) => s.commands) ?? emptyCommands()
  const gridStyle = useSimStore((s) => s.grid.style)
  // Pré-visualização durante um gesto (mover/arrastar troço): só vai para o histórico ao largar.
  const [preview, setPreview] = useState<CommandsDiagram | null>(null)
  const [openNoteId, setOpenNoteId] = useState<string | null>(null)
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null)
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const [placingText, setPlacingText] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [examplesOpen, setExamplesOpen] = useState(false)
  /** Utilizador escolheu começar com canvas vazio — esconde o overlay de boas-vindas. */
  const [emptyDismissed, setEmptyDismissed] = useState(false)
  const canvasNotes = useSimStore((s) => s.canvasNotes)
  const canvasTexts = useSimStore((s) => s.canvasTexts)
  useEffect(() => {
    useSimUi.setState({ textPlacement: placingText })
    return () => { useSimUi.setState({ textPlacement: false }) }
  }, [placingText])
  const diagram = useMemo(() => normalizeCommandsPages(preview ?? stored), [preview, stored])
  const activePageId = useCommandsUi((s) => s.activePageId)
  const setActivePageId = useCommandsUi((s) => s.setActivePageId)
  const pages = pagesOf(diagram)
  const pageId = pages.some((p) => p.id === activePageId) ? activePageId : pages[0].id
  const pageParts = useMemo(() => partsOnPage(diagram, pageId), [diagram, pageId])
  const pageWires = useMemo(() => wiresOnPage(diagram, pageId), [diagram, pageId])
  const pageTexts = useMemo(() => textsOnPage(diagram, pageId), [diagram, pageId])
  const pageNotes = useMemo(
    () => canvasNotes.filter((n) => n.view === 'commands' && (!n.page || n.page === pageId)),
    [canvasNotes, pageId],
  )
  const freeTexts = useMemo(
    () => canvasTexts.filter((t) => t.view === 'commands' && (!t.page || t.page === pageId)),
    [canvasTexts, pageId],
  )
  const selectedFreeText = freeTexts.find((t) => t.id === selectedTextId) ?? null

  const partById = useMemo(() => new Map(diagram.parts.map((p) => [p.id, p])), [diagram])
  // Sincronizar página ativa se a atual deixou de existir.
  useEffect(() => {
    if (!pages.some((p) => p.id === activePageId)) setActivePageId(pages[0].id)
  }, [pages, activePageId, setActivePageId])

  const tool = useCommandsUi((s) => s.tool)
  const gridOn = useCommandsUi((s) => s.gridOn)
  const selection = useCommandsUi((s) => s.selection)
  const select = useCommandsUi((s) => s.select)
  const placing = useCommandsUi((s) => s.placing)
  const setPlacing = useCommandsUi((s) => s.setPlacing)
  const rt = useCommandsUi((s) => s.rt)
  const paused = useCommandsUi((s) => s.paused)
  const event = useCommandsUi((s) => s.event)

  const [view, setView] = useState<View>({ x: 60, y: 60, scale: 1 })
  const [size, setSize] = useState({ width: 800, height: 600 })
  const [cursor, setCursor] = useState<Pt | null>(null)
  const [draft, setDraft] = useState<{ from: CmdEnd; to: Pt; click?: boolean } | null>(null)
  const [hoverTerm, setHoverTerm] = useState<CmdEnd | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  // Telemóvel: Entradas/Saídas no fundo, como no GRAFCET; no tablet/PC continuam no painel lateral.
  const phone = useNarrowMenu(PHONE_TOUCH_QUERY)
  const canvasId = useId()
  const gesture = useRef<{ kind: 'pan' | 'move' | 'tag' | 'mid' | 'wire' | 'press' | 'marquee' | 'label'; labelId?: string; startX: number; startY: number; view?: View; partId?: string; partIds?: string[]; origin?: Pt; offset?: Pt; wireId?: string; moved?: boolean; tag?: string; x0?: number; y0?: number; x1?: number; y1?: number; labelIds?: string[]; textOrigins?: Record<string, Pt> } | null>(null)
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [pageLinkModal, setPageLinkModal] = useState<{ partId: string } | null>(null)
  const [tagModal, setTagModal] = useState<{ partId: string } | null>(null)
  const selectedPartIds = useCommandsUi((s) => s.selectedPartIds)
  const selectParts = useCommandsUi((s) => s.selectParts)
  const selectedTextIds = useCommandsUi((s) => s.selectedTextIds)
  const selectedLabelIds = useCommandsUi((s) => s.selectedLabelIds)
  const running = rt.running
  const editable = !running && !demo

  const notify = useCallback((text: string) => { setNotice(text); window.setTimeout(() => setNotice((v) => (v === text ? null : v)), 2600) }, [])
  const commit = (next: CommandsDiagram) => { setPreview(null); commitDiagram(next) }

  // ---------------------------------------------------------------- simulação
  useEffect(() => {
    if (!running || paused) return
    const timer = window.setInterval(() => useCommandsUi.getState().tick(TICK_MS), TICK_MS)
    return () => window.clearInterval(timer)
  }, [running, paused])
  useEffect(() => { if (rt.fault) notify(rt.fault) }, [rt.fault, notify])
  // Sair da vista não deixa a simulação a correr às escondidas.
  useEffect(() => () => useCommandsUi.getState().stop(), [])

  const stateOf = (part: CmdPart): CmdSymbolState => {
    if (!running) return { closed: isClosed(part, emptyCmdRuntime()), idle: true }
    const since = rt.coilSince[part.tag]
    const delay = rt.delays[part.tag] ?? part.delayMs ?? 3000
    const progress = since !== undefined ? Math.min(1, (rt.time - since) / delay) : undefined
    return {
      closed: isClosed(part, rt),
      energized: (part.kind === 'pageRef' || part.kind === 'pageRefIn') ? !!rt.live[`${part.id}:0`] : !!rt.coils[part.tag],
      lit: !!rt.lamps[part.id],
      load: !!(rt.loads && rt.loads[part.id]),
      motor: rt.motors[part.id],
      actuator: rt.actuators?.[part.id],
      progress: part.kind === 'timerCoil' || part.kind === 'timedNO' || part.kind === 'timedNC' ? progress : undefined,
      tripped: !!rt.tripped[part.tag],
    }
  }

  // ---------------------------------------------------------------- vista
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  useEffect(() => { useCommandsUi.getState().setZoom(view.scale) }, [view.scale])
  const toWorld = (clientX: number, clientY: number): Pt => {
    const rect = viewportRef.current?.getBoundingClientRect()
    return { x: (clientX - (rect?.left ?? 0) - view.x) / view.scale, y: (clientY - (rect?.top ?? 0) - view.y) / view.scale }
  }
  const zoomAt = useCallback((factor: number, px?: number, py?: number) => {
    setView((v) => {
      const cx = px ?? size.width / 2, cy = py ?? size.height / 2
      const scale = Math.max(CMD_ZOOM_MIN, Math.min(CMD_ZOOM_MAX, v.scale * factor))
      return { scale, x: cx - ((cx - v.x) / v.scale) * scale, y: cy - ((cy - v.y) / v.scale) * scale }
    })
  }, [size])
  const wheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    if (e.shiftKey) setView((v) => ({ ...v, x: v.x - e.deltaY }))
    else zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - rect.left, e.clientY - rect.top)
  }, [zoomAt])
  useNonPassiveListener(viewportRef, 'wheel', wheel)

  // Pinça (telemóvel/tablet): o ponto sob os dedos acompanha-os e mover os dois dedos desloca a vista —
  // o mesmo gesto do GRAFCET (`usePinchZoom`). O gesto de um dedo já iniciado (mover símbolo, cabo,
  // arrastar a vista) é cancelado quando o segundo dedo toca.
  const pinchStart = useRef<View | null>(null)
  usePinchZoom(viewportRef, {
    swallowPointers: true,
    ignoreSelector: '[role="scrollbar"]',
    onStart: () => { pinchStart.current = view; gesture.current = null; setPreview(null); setMarquee(null) },
    onChange: ({ ratio, center, startCenter }) => {
      const start = pinchStart.current
      if (!start) return
      const scale = Math.max(CMD_ZOOM_MIN, Math.min(CMD_ZOOM_MAX, start.scale * ratio))
      const pos = pinchPan({ x: start.x, y: start.y }, start.scale, scale, startCenter, center)
      setView({ scale, x: pos.x, y: pos.y })
    },
    onEnd: () => { pinchStart.current = null },
  })

  const bounds = useMemo(() => {
    const boxes = pageParts.flatMap(p => [partBox(p), cmdTagBounds(p)].filter((b): b is NonNullable<typeof b> => !!b))
    if (!boxes.length) return { minX: 0, minY: 0, maxX: 800, maxY: 600 }
    return {
      minX: Math.min(...boxes.map((b) => b.x)) - 60, minY: Math.min(...boxes.map((b) => b.y)) - 60,
      maxX: Math.max(...boxes.map((b) => b.x + b.w)) + 60, maxY: Math.max(...boxes.map((b) => b.y + b.h)) + 60,
    }
  }, [diagram])
  const fit = useCallback((d: CommandsDiagram = useSimStore.getState().commands) => {
    const el = viewportRef.current
    if (!el || !d.parts.length) { setView({ x: 60, y: 60, scale: 1 }); return }
    const boxes = d.parts.flatMap(p => [partBox(p), cmdTagBounds(p)].filter((b): b is NonNullable<typeof b> => !!b))
    const minX = Math.min(...boxes.map((b) => b.x)) - 40, minY = Math.min(...boxes.map((b) => b.y)) - 50
    const maxX = Math.max(...boxes.map((b) => b.x + b.w)) + 40, maxY = Math.max(...boxes.map((b) => b.y + b.h)) + 40
    const scale = Math.max(0.3, Math.min(1.6, Math.min(el.clientWidth / (maxX - minX), el.clientHeight / (maxY - minY))))
    setView({ scale, x: (el.clientWidth - (maxX - minX) * scale) / 2 - minX * scale, y: (el.clientHeight - (maxY - minY) * scale) / 2 - minY * scale })
  }, [])
  useEffect(() => { const id = window.setTimeout(() => fit(), 60); return () => window.clearTimeout(id) }, [fit])

  // ---------------------------------------------------------------- pedidos da barra
  const applyExample = (idOrExample: string | CommandsExampleInfo) => {
    const example = typeof idOrExample === 'string'
      ? COMMANDS_EXAMPLES.find((e) => e.id === idOrExample)
      : idOrExample
    if (!example) return
    useCommandsUi.getState().stop()
    const next = example.build()
    commit(next)
    select(null)
    const firstPage = next.pages?.[0]?.id
    if (firstPage) setActivePageId(firstPage)
    window.setTimeout(() => fit(next), 30)
  }
  const loadExample = () => setExamplesOpen(true)
  const clearAll = async () => {
    if (!useSimStore.getState().commands.parts.length) return
    if (!(await uiConfirm('Apagar todos os símbolos e cabos? Pode desfazer com Ctrl+Z.', { title: 'Limpar esquema', confirmLabel: 'Limpar', danger: true }))) return
    useCommandsUi.getState().stop(); commit(emptyCommands()); select(null); setEmptyDismissed(false)
  }
  const focusSelection = () => {
    const sel = useCommandsUi.getState().selection
    const part = sel?.type === 'part' ? useSimStore.getState().commands.parts.find((p) => p.id === sel.id) : undefined
    if (!part) return
    const box = partBox(part)
    setView((v) => ({ ...v, x: size.width / 2 - (box.x + box.w / 2) * v.scale, y: size.height / 2 - (box.y + box.h / 2) * v.scale }))
  }
  useEffect(() => {
    if (!event) return
    const name = event.name
    if (name === 'fit') fit()
    else if (name === 'zoomIn') zoomAt(1.15)
    else if (name === 'zoomOut') zoomAt(1 / 1.15)
    else if (name === 'zoomReset') setView((v) => ({ ...v, scale: 1 }))
    else if (name === 'examples') void loadExample()
    else if (name === 'import') setImportOpen(true)
    else if (name === 'clear') void clearAll()
    else if (name === 'rotate' && editable) rotateSelected()
    else if (name === 'delete' && editable) removeSelected()
    else if (name === 'focusSelection') focusSelection()
    else if (name === 'pageLink') {
      // Inspetor → «Configurar ligação…»: abre a janela da ligação selecionada.
      const sel = useCommandsUi.getState().selection
      const part = sel?.type === 'part' ? useSimStore.getState().commands.parts.find((p) => p.id === sel.id) : undefined
      if (part && (part.kind === 'pageRef' || part.kind === 'pageRefIn')) setPageLinkModal({ partId: part.id })
    }
  }, [event?.n])

  // Duplo clique na Biblioteca: insere no centro da vista, no primeiro sítio livre.
  const quickAdd = useCommandsUi((s) => s.quickAdd)
  useEffect(() => {
    if (!quickAdd || !editable) return
    const parts = useSimStore.getState().commands.parts
    const centre = { x: snap((size.width / 2 - view.x) / view.scale), y: snap((size.height / 2 - view.y) / view.scale) }
    const overlaps = (at: Pt) => {
      const box = partBox({ id: 'probe', kind: quickAdd.kind, x: at.x, y: at.y, rot: 0, tag: '' })
      return parts.some((p) => { const b = partBox(p); return box.x < b.x + b.w && box.x + box.w > b.x && box.y < b.y + b.h && box.y + box.h > b.y })
    }
    let at = centre
    for (let i = 1; i < 40 && overlaps(at); i++) at = { x: centre.x + (i % 8) * CMD_GRID * 4, y: centre.y + Math.floor(i / 8) * CMD_GRID * 5 }
    const part = addPart(quickAdd.kind, at)
    notify(`${CMD_PARTS[part.kind].label}${part.tag ? ` ${part.tag}` : ''} inserido no centro da vista`)
  }, [quickAdd?.n])

  // ---------------------------------------------------------------- acertos
  const terminalNear = (p: Pt, exclude?: CmdEnd): CmdEnd | null => {
    let best: CmdEnd | null = null, bestD = 10 / Math.min(1, view.scale)
    for (const part of pageParts) partTerminals(part).forEach((_, i) => {
      if (exclude && exclude.part === part.id && exclude.term === i) return
      const at = terminalAt(part, i)
      const d = Math.hypot(at.x - p.x, at.y - p.y)
      if (d < bestD) { bestD = d; best = { part: part.id, term: i } }
    })
    return best
  }
  const pointsOf = (w: CmdWire): Pt[] => {
    const pa = partById.get(w.a.part), pb = partById.get(w.b.part)
    if (!pa || !pb) return []
    return wirePoints(terminalAt(pa, w.a.term), terminalAt(pb, w.b.term), w.mid)
  }
  const wireNear = (p: Pt): { wire: CmdWire; at: Pt } | null => {
    let best: { wire: CmdWire; at: Pt } | null = null, bestD = 7 / Math.min(1, view.scale)
    for (const w of pageWires) {
      const pts = pointsOf(w)
      for (let i = 1; i < pts.length; i++) {
        const { d, q } = distToSegment(p, pts[i - 1], pts[i])
        if (d < bestD) { bestD = d; best = { wire: w, at: { x: snap(q.x), y: snap(q.y) } } }
      }
    }
    return best
  }

  const connect = (a: CmdEnd, target: Pt): boolean => {
    const end = terminalNear(target, a)
    if (end) {
      if (diagram.wires.some((w) => (w.a.part === a.part && w.a.term === a.term && w.b.part === end.part && w.b.term === end.term) || (w.b.part === a.part && w.b.term === a.term && w.a.part === end.part && w.a.term === end.term))) { notify('Esses bornes já estão ligados'); return true }
      commit({ ...diagram, wires: [...diagram.wires, { id: nanoid(8), a, b: end, page: pageId }] })
      return true
    }
    // Largar sobre um cabo: cria um nó nesse ponto e divide o cabo em dois.
    const hit = wireNear(target)
    if (hit) {
      const node: CmdPart = { id: nanoid(8), kind: 'node', x: hit.at.x, y: hit.at.y, rot: 0, tag: '' }
      const rest = diagram.wires.filter((w) => w.id !== hit.wire.id)
      commit({
        ...diagram,
        parts: [...diagram.parts, { ...node, page: pageId }],
        wires: [...rest, { id: nanoid(8), a: hit.wire.a, b: { part: node.id, term: 0 } }, { id: nanoid(8), a: { part: node.id, term: 0 }, b: hit.wire.b }, { id: nanoid(8), a, b: { part: node.id, term: 0 } }],
      })
      notify('Nó criado na ligação')
      return true
    }
    return false
  }

  // ---------------------------------------------------------------- gestos
  const startPan = (event: ReactPointerEvent) => {
    gesture.current = { kind: 'pan', startX: event.clientX, startY: event.clientY, view }
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
  }
  const onCanvasDown = (event: ReactPointerEvent) => {
    if (event.button === 1 || (event.button === 0 && tool === 'pan')) { startPan(event); return }
    if (event.button !== 0) return
    const p = toWorld(event.clientX, event.clientY)
    if (placingText && editable) {
      const id = useSimStore.getState().addCanvasText({
        ...DEFAULT_TEXT_STYLE_COMMANDS, view: 'commands', page: pageId, text: 'Texto', x: snap(p.x), y: snap(p.y),
      })
      setPlacingText(false)
      setSelectedTextId(id)
      setEditingTextId(id)
      useCommandsUi.getState().select({ type: 'text', id })
      notify('Texto colocado — duplo clique para editar')
      return
    }
    if (placing && editable) {
      const part = addPart(placing, p)
      notify(`${CMD_PARTS[part.kind].label}${part.tag ? ` ${part.tag}` : ''} colocado`)
      if (!event.shiftKey) setPlacing(null)
      return
    }
    if (draft?.click) {
      // Fio armado por clique: o 2.º clique liga a um borne ou a um cabo; no vazio cancela.
      if (!connect(draft.from, p)) notify('Ligação cancelada — clique num borne ou num cabo')
      setDraft(null); setHoverTerm(null)
      return
    }
    if (editable) {
      const hit = wireNear(p)
      if (hit) {
        if (tool === 'erase') { removeItem({ type: 'wire', id: hit.wire.id }); return }
        select({ type: 'wire', id: hit.wire.id })
        if (pointsOf(hit.wire).length === 4 && tool === 'select') {
          gesture.current = { kind: 'mid', startX: event.clientX, startY: event.clientY, wireId: hit.wire.id }
          ;(event.target as Element).setPointerCapture?.(event.pointerId)
        }
        return
      }
    }
    // Toque no fundo vazio: um dedo move a vista (também em simulação e na demonstração, onde não há
    // seleção). Com o dedo não há retângulo de seleção — esse fica para o rato e a caneta.
    if (event.pointerType === 'touch') {
      select(null)
      startPan(event)
      return
    }
    // Seleção por retângulo (marquee) na ferramenta Selecionar.
    if (tool === 'select' && editable) {
      const additive = event.shiftKey || event.ctrlKey || event.metaKey
      if (!additive) select(null)
      gesture.current = { kind: 'marquee', startX: event.clientX, startY: event.clientY, x0: p.x, y0: p.y, x1: p.x, y1: p.y }
      setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
      ;(event.currentTarget as Element).setPointerCapture?.(event.pointerId)
      return
    }
    select(null)
    // Em «Selecionar» o fundo só desseleciona; mover a vista é com a ferramenta Mão/Pan,
    // botão do meio ou (abaixo) Espaço+arrastar — senão mão e seleção parecem iguais.
    if (tool === 'pan') startPan(event)
  }
  // Títulos do esquema (ex.: «Circuito de potência»): tocar/clicar seleciona, arrastar move, duplo toque edita.
  const lastLabelTap = useRef<{ id: string; t: number }>({ id: '', t: 0 })
  const editLabel = async (label: CmdText) => {
    const next = await uiPrompt('Texto do título no esquema', label.text, { title: 'Editar texto', confirmLabel: 'Guardar' })
    if (next == null) return
    const text = next.trim()
    if (!text || text === label.text) return
    commit({ ...stored, texts: (stored.texts ?? []).map((q) => (q.id === label.id ? { ...q, text } : q)) })
  }
  const onLabelDown = (label: CmdText, event: ReactPointerEvent) => {
    // Mão, colocar símbolo/texto ou cabo armado: o gesto é do fundo (mover a vista, colocar, ligar).
    if (event.button !== 0 || tool === 'pan' || placing || placingText || draft) return
    event.stopPropagation()
    const ui = useCommandsUi.getState()
    if (tool === 'erase' && editable) { ui.selectGroup([], [], [label.id]); removeSelectedGroup(); return }
    const additive = event.shiftKey || event.ctrlKey || event.metaKey
    if (additive || !ui.selectedLabelIds.includes(label.id) || ui.selectedLabelIds.length > 1) ui.selectGroup([], [], [label.id], additive)
    const now = Date.now()
    const again = lastLabelTap.current.id === label.id && now - lastLabelTap.current.t < 350
    lastLabelTap.current = again ? { id: '', t: 0 } : { id: label.id, t: now }
    if (!editable) return
    if (again) { void editLabel(label); return }
    if (tool !== 'select' || additive) return
    const p = toWorld(event.clientX, event.clientY)
    gesture.current = { kind: 'label', startX: event.clientX, startY: event.clientY, labelId: label.id, origin: { x: label.x, y: label.y }, offset: { x: p.x - label.x, y: p.y - label.y } }
    ;(event.currentTarget as Element).setPointerCapture?.(event.pointerId)
  }
  const onPartDown = (part: CmdPart, event: ReactPointerEvent) => {
    if (event.button !== 0 || tool === 'pan') return
    event.stopPropagation()
    if (running) {
      if (MOMENTARY.includes(part.kind)) { useCommandsUi.getState().press(part.tag, true); gesture.current = { kind: 'press', startX: 0, startY: 0, tag: part.tag } }
      else if (TOGGLES.includes(part.kind)) useCommandsUi.getState().toggle(part.tag)
      else if (part.kind === 'thermal3' || part.kind === 'thermalNC' || part.kind === 'thermalNO') useCommandsUi.getState().trip(part.tag, !rt.tripped[part.tag])
      else select({ type: 'part', id: part.id })
      return
    }
    if (demo) return
    if (tool === 'erase') { removeItem({ type: 'part', id: part.id }); select(null); return }
    if (placing) return
    const additive = event.shiftKey || event.ctrlKey || event.metaKey
    const already = selectedPartIds.includes(part.id)
    let ids = selectedPartIds
    if (additive) {
      selectParts([part.id], true)
      ids = useCommandsUi.getState().selectedPartIds
    } else if (!already) {
      select({ type: 'part', id: part.id })
      ids = [part.id]
    } else {
      // Clique num elemento já selecionado: mantém o grupo (símbolos e textos) para arrastar em conjunto.
      ids = selectedPartIds.length ? selectedPartIds : [part.id]
    }
    const groupTexts = already && !additive ? useCommandsUi.getState().selectedTextIds : []
    const groupLabels = already && !additive ? useCommandsUi.getState().selectedLabelIds : []
    const textOrigins = Object.fromEntries(freeTexts.filter((t) => groupTexts.includes(t.id)).map((t) => [t.id, { x: t.x, y: t.y }]))
    const p = toWorld(event.clientX, event.clientY)
    gesture.current = {
      kind: 'move',
      startX: event.clientX,
      startY: event.clientY,
      partId: part.id,
      partIds: ids,
      labelIds: groupLabels,
      textOrigins,
      origin: { x: part.x, y: part.y },
      offset: { x: p.x - part.x, y: p.y - part.y },
    }
    ;(event.currentTarget as Element).setPointerCapture?.(event.pointerId)
  }
  const onTagDown = (part: CmdPart, event: ReactPointerEvent<SVGTextElement>) => {
    // Noutras ferramentas e durante a simulação mantém-se o comportamento do símbolo.
    if (!editable || tool !== 'select' || placing || draft || event.button !== 0) return
    event.stopPropagation()
    select({ type: 'part', id: part.id })
    const p = toWorld(event.clientX, event.clientY)
    const tag = cmdTagPosition(part)
    gesture.current = { kind: 'tag', startX: event.clientX, startY: event.clientY, partId: part.id,
      offset: { x: p.x - (part.x + tag.x), y: p.y - (part.y + tag.y) } }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const onTermDown = (end: CmdEnd, event: ReactPointerEvent) => {
    if (!editable || event.button !== 0 || tool === 'pan' || tool === 'erase') return
    event.stopPropagation()
    const part = partById.get(end.part)
    if (!part) return
    if (draft?.click) {
      connect(draft.from, terminalAt(part, end.term))
      setDraft(null); setHoverTerm(null)
      return
    }
    setDraft({ from: end, to: terminalAt(part, end.term) })
    gesture.current = { kind: 'wire', startX: event.clientX, startY: event.clientY }
    ;(event.currentTarget as Element).setPointerCapture?.(event.pointerId)
  }

  const onMove = (event: ReactPointerEvent) => {
    const p = toWorld(event.clientX, event.clientY)
    if (placing) setCursor({ x: snap(p.x), y: snap(p.y) })
    if (draft?.click) { setDraft({ ...draft, to: p }); setHoverTerm(terminalNear(p, draft.from)) }
    const g = gesture.current
    if (!g) return
    if (g.kind === 'pan' && g.view) setView({ ...g.view, x: g.view.x + event.clientX - g.startX, y: g.view.y + event.clientY - g.startY })
    if (g.kind === 'marquee' && g.x0 !== undefined && g.y0 !== undefined) {
      g.x1 = p.x; g.y1 = p.y
      setMarquee({ x0: g.x0, y0: g.y0, x1: p.x, y1: p.y })
    }
    if (g.kind === 'move' && g.partId && g.offset && g.origin) {
      const x = snap(p.x - g.offset.x), y = snap(p.y - g.offset.y)
      const dx = x - g.origin.x, dy = y - g.origin.y
      const ids = new Set(g.partIds?.length ? g.partIds : [g.partId])
      const labels = new Set(g.labelIds ?? [])
      for (const [id, o] of Object.entries(g.textOrigins ?? {})) useSimStore.getState().updateCanvasText(id, { x: o.x + dx, y: o.y + dy })
      if (dx !== 0 || dy !== 0) {
        g.moved = true
        setPreview({
          ...stored,
          parts: stored.parts.map((q) => (ids.has(q.id) ? { ...q, x: snap(q.x + dx), y: snap(q.y + dy) } : q)),
          texts: labels.size ? (stored.texts ?? []).map((t) => (labels.has(t.id) ? { ...t, x: t.x + dx, y: t.y + dy } : t)) : stored.texts,
        })
      } else setPreview(null)
    }
    if (g.kind === 'tag' && g.partId && g.offset) {
      const part = stored.parts.find((q) => q.id === g.partId)
      if (part) {
        const x = Math.round(p.x - g.offset.x - part.x), y = Math.round(p.y - g.offset.y - part.y)
        const initial = cmdTagPosition(part)
        g.moved = x !== initial.x || y !== initial.y
        setPreview(g.moved ? { ...stored, parts: stored.parts.map((q) => q.id === part.id ? { ...q, tagStyle: { ...q.tagStyle, x, y } } : q) } : null)
      }
    }
    if (g.kind === 'label' && g.labelId && g.offset && g.origin) {
      const x = Math.round(p.x - g.offset.x), y = Math.round(p.y - g.offset.y)
      g.moved = x !== g.origin.x || y !== g.origin.y
      setPreview(g.moved ? { ...stored, texts: (stored.texts ?? []).map((q) => (q.id === g.labelId ? { ...q, x, y } : q)) } : null)
    }
    if (g.kind === 'mid' && g.wireId) { g.moved = true; setPreview({ ...stored, wires: stored.wires.map((q) => (q.id === g.wireId ? { ...q, mid: snap(p.y) } : q)) }) }
    if (g.kind === 'wire' && draft) { setDraft({ ...draft, to: p }); setHoverTerm(terminalNear(p, draft.from)) }
  }
  const onUp = (event: ReactPointerEvent) => {
    const g = gesture.current
    gesture.current = null
    if (!g) return
    if (g.kind === 'press' && g.tag) { useCommandsUi.getState().press(g.tag, false); return }
    if (g.kind === 'marquee') {
      const x0 = Math.min(g.x0 ?? 0, g.x1 ?? 0), x1 = Math.max(g.x0 ?? 0, g.x1 ?? 0)
      const y0 = Math.min(g.y0 ?? 0, g.y1 ?? 0), y1 = Math.max(g.y0 ?? 0, g.y1 ?? 0)
      setMarquee(null)
      const hits = pageParts.filter((part) => {
        const b = partBox(part)
        return b.x + b.w >= x0 && b.x <= x1 && b.y + b.h >= y0 && b.y <= y1
      }).map((part) => part.id)
      const additive = event.shiftKey || event.ctrlKey || event.metaKey
      const inside = (b: { x: number; y: number; w: number; h: number }) => b.x + b.w >= x0 && b.x <= x1 && b.y + b.h >= y0 && b.y <= y1
      const textHits = freeTexts.filter((t) => inside(freeTextBox(t))).map((t) => t.id)
      const labelHits = pageTexts.filter((t) => inside(labelBox(t))).map((t) => t.id)
      if (hits.length || textHits.length || labelHits.length) useCommandsUi.getState().selectGroup(hits, textHits, labelHits, additive)
      else if (!additive) select(null)
      return
    }
    if ((g.kind === 'move' || g.kind === 'tag' || g.kind === 'mid' || g.kind === 'label') && preview && g.moved) {
      // Os textos livres do grupo moveram-se ao vivo: repõe-nos na origem para o passo de Desfazer
      // guardar a posição inicial e aplica de novo a posição final no mesmo passo.
      const st = useSimStore.getState()
      const moved = Object.entries(g.textOrigins ?? {}).map(([id, o]) => ({ id, o, now: st.canvasTexts.find((t) => t.id === id) }))
      for (const { id, o } of moved) st.updateCanvasText(id, { x: o.x, y: o.y })
      commit(preview)
      for (const { id, now } of moved) if (now) st.updateCanvasText(id, { x: now.x, y: now.y })
    } else setPreview(null)
    if (g.kind === 'wire' && draft) {
      const p = toWorld(event.clientX, event.clientY)
      if (Math.hypot(event.clientX - g.startX, event.clientY - g.startY) > 4) {
        if (!connect(draft.from, p)) notify('Largue o cabo sobre um borne ou sobre outro cabo')
        setDraft(null); setHoverTerm(null)
      } else {
        // Clique simples num borne: o cabo fica armado até ao 2.º clique (fluxo clique-clique).
        setDraft({ ...draft, click: true })
        notify('Clique no borne (ou cabo) de destino · Esc cancela')
      }
    }
  }

  // ---------------------------------------------------------------- teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || isModalOpen()) return
      const mod = e.ctrlKey || e.metaKey
      const ui = useCommandsUi.getState()
      if (mod && e.key === '0') { e.preventDefault(); fit(); return }
      const undoKey = e.key.toLowerCase()
      if (mod && (undoKey === 'z' || undoKey === 'y') && !demo) {
        e.preventDefault()
        ui.stop()
        if (undoKey === 'y' || e.shiftKey) useSimStore.getState().redo(); else useSimStore.getState().undo()
        return
      }
      if (e.key === 'Escape') { setPlacing(null); setDraft(null); setHoverTerm(null); setPlacingText(false); setSelectedTextId(null); setEditingTextId(null); setMarquee(null); select(null); return }
      // Texto livre selecionado: os mesmos atalhos do GRAFCET (Enter/F2 edita, Ctrl+B/I/U formata).
      if (selectedFreeText && editable) {
        if (!mod && (e.key === 'Enter' || e.key === 'F2')) { e.preventDefault(); setEditingTextId(selectedFreeText.id); return }
        const styleKey = e.key.toLowerCase() === 'b' ? 'bold' : e.key.toLowerCase() === 'i' ? 'italic' : e.key.toLowerCase() === 'u' ? 'underline' : null
        if (mod && styleKey) { e.preventDefault(); useSimStore.getState().updateCanvasText(selectedFreeText.id, { [styleKey]: !selectedFreeText[styleKey] }); return }
      }
      // Ctrl+A: todos os símbolos, textos livres e títulos da página.
      if (mod && e.key.toLowerCase() === 'a' && editable) {
        e.preventDefault()
        ui.selectGroup(pageParts.map((p) => p.id), freeTexts.map((t) => t.id), pageTexts.map((t) => t.id))
        return
      }
      if (mod || !editable) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && (ui.selectedTextIds.length || ui.selectedLabelIds.length)) { e.preventDefault(); removeSelectedGroup(); setSelectedTextId(null); setEditingTextId(null); return }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedTextId) { e.preventDefault(); useSimStore.getState().removeCanvasText(selectedTextId); setSelectedTextId(null); setEditingTextId(null); return }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); return }
      const key = e.key.toLowerCase()
      if (key === 'r') rotateSelected()
      else if (key === '1' || key === 'v') ui.setTool('select')
      else if (key === '2' || key === 'l') ui.setTool('wire')
      else if (key === '4' || key === 'e') ui.setTool('erase')
      else if (key === '5' || key === 'h') ui.setTool('pan')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useCanvasAction((action) => {
    if (!editable) return
    if (action === 'addNote') {
      const centre = { x: snap((size.width / 2 - view.x) / view.scale), y: snap((size.height / 2 - view.y) / view.scale) }
      const before = new Set(useSimStore.getState().canvasNotes.map((n) => n.id))
      useSimStore.getState().addCanvasNote({
        text: '', view: 'commands', page: pageId, x: centre.x, y: centre.y,
        color: NOTE_COLORS[0].id, messages: [],
      })
      const created = useSimStore.getState().canvasNotes.find((n) => !before.has(n.id))
      setPlacingText(false)
      setSelectedTextId(null)
      if (created) setOpenNoteId(created.id)
      notify('Comentário criado — escreva a conversa na nota')
      return
    }
    if (action === 'addText') {
      setPlacingText((v) => {
        const next = !v
        notify(next ? 'Clique no esquema para colocar texto · Esc cancela' : 'Colocação de texto cancelada')
        return next
      })
      setSelectedTextId(null)
      setOpenNoteId(null)
    }
  })

  // ---------------------------------------------------------------- desenho
  const grid = CMD_GRID * view.scale
  const wireColor = (w: CmdWire) => (running && rt.liveWires[w.id] ? PHASE_COLORS[rt.liveWires[w.id]] ?? '#dc2626' : '#475569')
  const showPorts = editable && (tool === 'wire' || !!draft)
  // Mesmo fundo de grelha dos outros editores (pontos ou linhas, como escolhido no projeto).
  const background = editorGridBackground({ enabled: gridOn, style: gridStyle === 'lines' ? 'lines' : 'dots', spacing: editorGridPitch(view.scale, CMD_GRID), x: view.x - 1, y: view.y - 1 })

  const onAddPage = () => {
    if (!editable) return
    const next = addPage(diagram)
    const pages = pagesOf(next)
    const created = pages[pages.length - 1]
    commit(next)
    if (created) setActivePageId(created.id)
    notify(created ? `Página «${created.name}» criada` : 'Página criada')
  }
  // Renomear no sítio (como no GRAFCET): Enter grava, Esc cancela, perder o foco grava.
  const onRenamePage = (id: string, next: string) => {
    if (!editable) return
    const name = next.trim()
    const current = pagesOf(diagram).find((p) => p.id === id)?.name
    if (!name || name === current) return
    commit(renamePage(diagram, id, name))
  }
  const onRenameDiagram = (next: string) => {
    if (!editable || next === (diagram.name ?? '')) return
    commit({ ...diagram, name: next || undefined })
  }
  const onRemovePage = (id: string) => {
    if (!editable) return
    const result = removePage(diagram, id)
    if (result.error) { notify(result.error); return }
    commit(result.diagram)
    const remain = pagesOf(result.diagram)
    setActivePageId(remain.some((p) => p.id === pageId) ? pageId : remain[0].id)
    notify('Página eliminada')
  }

  return (
    <div className={`dc-cmd ${running ? 'is-running' : ''}`}>
      <div className="dc-cmd-main">
      <div className="dc-cmd-pages" role="tablist" aria-label="Páginas do esquema IEC">
        <span className="grafcet-title-edit dc-cmd-title-edit">
          {editable ? (
            <InlineName
              value={diagram.name ?? ''}
              placeholder="Esquema sem nome"
              label="Nome do esquema de comandos"
              allowEmpty
              maxLength={60}
              dataAttr="cmd-diagram-name"
              title="Clique para mudar o nome do esquema de comandos"
              onCommit={onRenameDiagram}
            />
          ) : <span className={`dc-inline-name ${diagram.name ? '' : 'is-empty'}`}><span className="dc-inline-name-text">{diagram.name || 'Esquema sem nome'}</span></span>}
        </span>
        <span className="dc-cmd-pages-label">Páginas</span>
        {pages.map((sh) => {
          const active = sh.id === pageId
          const count = partsOnPage(diagram, sh.id).length
          return (
            <span key={sh.id} className={`dc-cmd-page-chip ${active ? 'is-active' : ''}`}>
              {editable ? (
                <InlineName
                  role="tab"
                  ariaSelected={active}
                  value={sh.name}
                  label="Nome da página"
                  className="dc-cmd-page-name"
                  editOnClick={active}
                  onIdleClick={() => setActivePageId(sh.id)}
                  showIcon={false}
                  maxLength={40}
                  dataAttr="cmd-page-name"
                  title={`${sh.name} — ${count} símbolo(s). ${active ? 'Clique no nome para o mudar.' : 'Clique para abrir; duplo clique para mudar o nome.'}`}
                  after={<em>{count}</em>}
                  onCommit={(next) => onRenamePage(sh.id, next)}
                />
              ) : (
                <button type="button" role="tab" aria-selected={active} className="dc-cmd-page-name" title={`${sh.name} — ${count} símbolo(s)`} onClick={() => setActivePageId(sh.id)}>
                  {sh.name}
                  <em>{count}</em>
                </button>
              )}
              {pages.length > 1 && editable && (
                <button type="button" className="dc-cmd-page-del" aria-label={`Eliminar ${sh.name}`} title="Eliminar página (só se estiver vazia)" onClick={() => onRemovePage(sh.id)}>×</button>
              )}
            </span>
          )
        })}
        {editable && (
          <button type="button" className="dc-cmd-page-add" aria-label="Nova página" onClick={onAddPage} title="Nova página do esquema. Ligue a corrente entre páginas com o símbolo «Ligação entre páginas».">
            <IconPlus size={12} /><span className="dc-cmd-page-add-label">Nova página</span>
          </button>
        )}
      </div>
        <div
          id={canvasId}
          ref={viewportRef}
          className={`dc-cmd-canvas is-tool-${tool} ${placing ? 'is-placing' : ''} ${placingText ? 'is-placing-text' : ''}`}
          style={background}
          onPointerDown={onCanvasDown} onPointerMove={onMove} onPointerUp={onUp}
          onPointerCancel={() => { gesture.current = null; setPreview(null); setDraft(null) }}
          onPointerLeave={() => setCursor(null)}
          onDoubleClick={(e) => { if ((e.target as Element).tagName === 'svg') fit() }}
          onDragOver={(e) => { if (e.dataTransfer.types.includes('text/dc-cmd-kind')) e.preventDefault() }}
          onDrop={(e) => {
            const kind = e.dataTransfer.getData('text/dc-cmd-kind') as CmdKind
            if (kind && CMD_PARTS[kind] && editable) { e.preventDefault(); const part = addPart(kind, toWorld(e.clientX, e.clientY)); notify(`${CMD_PARTS[part.kind].label}${part.tag ? ` ${part.tag}` : ''} colocado`) }
          }}
          role="application" aria-label="Esquema de comandos elétricos"
        >
          <svg className="dc-cmd-svg" width="100%" height="100%">
            <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
              {pageTexts.map((t) => {
                const b = labelBox(t)
                return <g key={t.id} className="dc-cmd-label" onPointerDown={(e) => onLabelDown(t, e)}>
                  <rect x={b.x - 6} y={b.y - 6} width={b.w + 12} height={b.h + 12} fill="transparent" />
                  <text className={`dc-cmd-text${selectedLabelIds.includes(t.id) ? ' is-selected' : ''}`} data-cmd-label={t.id} x={t.x} y={t.y}>{t.text}</text>
                </g>
              })}
              {pageWires.map((w) => {
                const pts = pointsOf(w)
                if (pts.length < 2) return null
                const d = pts.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ')
                const selected = selection?.type === 'wire' && selection.id === w.id
                return <g key={w.id} data-cmd-wire={w.id}>
                  {selected && <path d={d} className="dc-cmd-wire-halo" />}
                  <path d={d} className="dc-cmd-wire" stroke={wireColor(w)} strokeWidth={running && rt.liveWires[w.id] ? 2.4 : 1.6} />
                </g>
              })}
              {pageParts.map((part) => (
                <g
                  key={part.id}
                  onPointerDown={(e) => onPartDown(part, e)}
                  onDoubleClick={(e) => {
                    // Duplo clique no nome do elemento: modal de edição do texto (conteúdo, tamanho, rotação, cor…).
                    if (editable && tool === 'select' && !placing && part.kind !== 'pageRef' && part.kind !== 'pageRefIn' && part.tag && part.kind !== 'node' && part.kind !== 'supply' && (e.target as Element).closest?.('[data-cmd-tag]')) {
                      e.stopPropagation()
                      select({ type: 'part', id: part.id })
                      setTagModal({ partId: part.id })
                      return
                    }
                    if (part.kind !== 'pageRef' && part.kind !== 'pageRefIn') return
                    e.stopPropagation()
                    select({ type: 'part', id: part.id })
                    setPageLinkModal({ partId: part.id })
                  }}
                  className={running && (MOMENTARY.includes(part.kind) || TOGGLES.includes(part.kind) || part.kind.startsWith('thermal')) ? 'dc-cmd-actuator' : undefined}
                >
                  <CmdSymbol part={part} state={stateOf(part)} selected={selectedPartIds.includes(part.id) || (selection?.type === 'part' && selection.id === part.id)} onTagPointerDown={(e) => onTagDown(part, e)} />
                </g>
              ))}
              {editable && tool !== 'pan' && tool !== 'erase' && <g className={`dc-cmd-ports ${showPorts ? 'is-wiring' : ''}`}>{pageParts.flatMap((part) => partTerminals(part).map((_, i) => {
                const at = terminalAt(part, i)
                const hot = hoverTerm?.part === part.id && hoverTerm.term === i
                return <circle
                  key={`${part.id}:${i}`}
                  className={`dc-cmd-port ${hot ? 'is-hot' : ''}`}
                  data-cmd-port={`${part.id}:${i}`}
                  cx={at.x}
                  cy={at.y}
                  r={hot ? 6 : 4.5}
                  aria-label={`${part.tag || CMD_PARTS[part.kind].label} · borne ${terminalLabel(part, i) || i + 1} — arraste ou clique para ligar`}
                  onPointerDown={(e) => onTermDown({ part: part.id, term: i }, e)}
                />
              }))}</g>}
              {draft && (() => {
                const from = partById.get(draft.from.part)
                if (!from) return null
                const a = terminalAt(from, draft.from.term)
                const over = hoverTerm ? partById.get(hoverTerm.part) : undefined
                const target = over && hoverTerm ? terminalAt(over, hoverTerm.term) : { x: snap(draft.to.x), y: snap(draft.to.y) }
                return <path className="dc-cmd-wire-draft" d={wirePoints(a, target).map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ')} />
              })()}
              {marquee && (
                <rect
                  className="dc-cmd-marquee"
                  x={Math.min(marquee.x0, marquee.x1)}
                  y={Math.min(marquee.y0, marquee.y1)}
                  width={Math.abs(marquee.x1 - marquee.x0)}
                  height={Math.abs(marquee.y1 - marquee.y0)}
                  fill="rgba(37, 99, 235, 0.12)"
                  stroke="#2563eb"
                  strokeWidth={1.5 / Math.max(view.scale, 0.01)}
                  strokeDasharray={`${4 / Math.max(view.scale, 0.01)} ${3 / Math.max(view.scale, 0.01)}`}
                  pointerEvents="none"
                />
              )}
              {placing && cursor && <g className="dc-cmd-ghost" pointerEvents="none"><CmdSymbol part={{ id: 'ghost', kind: placing, x: cursor.x, y: cursor.y, rot: 0, tag: defaultTag(diagram, placing), lines: placing === 'supply' ? ['L1', 'L2', 'L3'] : undefined }} showTerminals={false} /></g>}
            </g>
          </svg>
          {!pageParts.length && !emptyDismissed && (
            <div className="dc-cmd-empty" onPointerDown={(e) => e.stopPropagation()}>
              <span className="dc-cmd-empty-icon" aria-hidden="true"><IconCommands size={26} /></span>
              <strong>{pages.length > 1 ? 'Ainda não há símbolos nesta página' : 'Ainda não há símbolos'}</strong>
              <p>{pages.length > 1
                ? 'Coloque símbolos nesta página ou use «Ligação entre páginas» para trazer corrente de outra folha.'
                : 'Escolha símbolos na Biblioteca ou parta de um exemplo, de um modelo ou de um ficheiro.'}</p>
              <div className="dc-cmd-empty-actions">
                <button
                  type="button"
                  className="dc-btn dc-btn-primary dc-cmd-empty-main"
                  onClick={() => {
                    // Canvas vazio pronto a usar: remove o overlay e deixa o diagrama utilizável.
                    setEmptyDismissed(true)
                    try { window.dispatchEvent(new CustomEvent('dc-cmd-open-library')) } catch { /* ignore */ }
                    try { window.dispatchEvent(new CustomEvent('dcsimu:open-library')) } catch { /* ignore */ }
                  }}
                >
                  <IconPlus size={14} />Criar esquema IEC
                </button>
                {!demo && (
                  <button type="button" className="dc-btn" onClick={() => loadExample()}>
                    <IconTemplates size={14} />Modelos industriais
                  </button>
                )}
                {!demo && (
                  <button type="button" className="dc-btn" onClick={() => setImportOpen(true)}>
                    <IconImport size={14} />Importar esquema
                  </button>
                )}
                {!demo && (
                  <button
                    type="button"
                    className="dc-btn dc-cmd-empty-wide"
                    title="Arranque direto com retenção, paragem e relé térmico"
                    onClick={() => applyExample('direct')}
                  >
                    <IconExample size={14} />Exemplo de arranque direto
                  </button>
                )}
              </div>
            </div>
          )}
          {rt.fault && <div className="dc-cmd-fault" role="alert"><strong>Simulação parada</strong><span>{rt.fault}</span></div>}
          {notice && !rt.fault && <div className="dc-cmd-toast" role="status">{notice}</div>}
          {placingText && <div className="dc-cmd-hint">Clique para colocar texto · Esc cancela</div>}
          <CommandsNotesLayer
            notes={pageNotes}
            viewX={view.x}
            viewY={view.y}
            scale={view.scale}
            openId={openNoteId}
            setOpenId={setOpenNoteId}
            toWorld={toWorld}
            readOnly={!editable}
          />
          <CommandsTextsLayer
            texts={freeTexts}
            viewX={view.x}
            viewY={view.y}
            scale={view.scale}
            selectedId={selectedTextId}
            groupIds={selectedTextIds}
            editingId={editingTextId}
            setSelectedId={setSelectedTextId}
            setEditingId={setEditingTextId}
            toWorld={toWorld}
            readOnly={!editable}
          />
          {selectedFreeText && editable && (
            <CommandsTextToolbar
              text={selectedFreeText}
              onDone={() => { setSelectedTextId(null); setEditingTextId(null) }}
              onEdit={() => setEditingTextId(selectedFreeText.id)}
            />
          )}
          {running && <div className="dc-cmd-hint" role="status">{paused ? 'Simulação em pausa' : (<><span className="dc-cmd-hint-long">Simulação: prima os botões no esquema · clique no térmico para o disparar</span><span className="dc-cmd-hint-short">Toque nos botões · toque no térmico para disparar</span></>)}</div>}
          <CanvasPanScrollbars label="Esquema de comandos" controlsId={canvasId}
            view={{ x: -view.x / view.scale, y: -view.y / view.scale, width: size.width / view.scale, height: size.height / view.scale }}
            bounds={bounds}
            onChange={({ x, y }) => setView((v) => ({ ...v, x: -x * v.scale, y: -y * v.scale }))} />
        </div>
        {phone && !demo && <CommandsSimDock onOpenGrafcet={onOpenGrafcet} />}
      </div>
      <CommandsImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={(result: CircuitImportResult, source: string) => {
          useCommandsUi.getState().stop()
          commit(result.diagram)
          select(null)
          const first = result.diagram.pages?.[0]?.id
          if (first) setActivePageId(first)
          const ign = result.ignored.length ? ` · ${result.ignored.length} tipos ignorados` : ''
          notify(`Importado «${source}»: ${result.stats.symbols} símbolos, ${result.stats.wires} cabos${ign}`)
          window.setTimeout(() => fit(result.diagram), 30)
        }}
      />
      
      {tagModal && <TagTextDialog partId={tagModal.partId} onClose={() => setTagModal(null)} />}
      {pageLinkModal && (
        <PageLinkDialog
          partId={pageLinkModal.partId}
          onClose={() => setPageLinkModal(null)}
          onGoPage={(pageId, focusPartId) => {
            setActivePageId(pageId)
            setPageLinkModal(null)
            // Abre a página do par já com o conector selecionado e centrado.
            if (focusPartId) {
              select({ type: 'part', id: focusPartId })
              window.setTimeout(() => useCommandsUi.getState().emit('focusSelection'), 60)
            }
          }}
        />
      )}
<CommandsExamplesDialog
        open={examplesOpen}
        onClose={() => setExamplesOpen(false)}
        onLoad={(example) => applyExample(example)}
      />
    </div>
  )
}

