// ============================================================================
// Simulador de comandos elétricos — canvas do esquema IEC (vista central).
// A biblioteca/inspetor (esquerda), as Entradas/Saídas e os Objetos (direita) e a
// barra de ferramentas partilham o estado em `useCommandsUi`; o esquema vive na store.
// ============================================================================
import { useCallback, useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { nanoid } from 'nanoid'
import { useSimStore } from '../store/useSimStore'
import { useNonPassiveListener } from '../ui/useNonPassiveListener'
import { isModalOpen, isTypingTarget } from '../ui/editorKeys'
import { uiChoose, uiConfirm } from '../ui/dialogs'
import { editorGridBackground } from '../ui/editorTheme'
import CanvasPanScrollbars from '../ui/CanvasPanScrollbars'
import { IconCommands } from '../ui/icons'
import {
  CMD_GRID, CMD_PARTS, emptyCommands, partBox, partTerminals, snap, terminalAt, terminalLabel, wirePoints,
  type CmdEnd, type CmdKind, type CmdPart, type CmdWire, type CommandsDiagram, type Pt,
} from './model'
import { emptyCmdRuntime, isClosed } from './engine'
import { CmdSymbol, PHASE_COLORS, type CmdSymbolState } from './symbols'
import { COMMANDS_EXAMPLES } from './examples'
import { MOMENTARY, TOGGLES, useCommandsUi } from './commandsUi'
import { addPart, commitDiagram, defaultTag, removeItem, removeSelected, rotateSelected } from './editing'
import '../styles/commands.css'

type View = { x: number; y: number; scale: number }
const TICK_MS = 50

const distToSegment = (p: Pt, a: Pt, b: Pt) => {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0
  return { d: Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)), q: { x: a.x + dx * t, y: a.y + dy * t } }
}

export default function CommandsEditor({ demo = false }: { demo?: boolean }) {
  const stored = useSimStore((s) => s.commands) ?? emptyCommands()
  const gridStyle = useSimStore((s) => s.grid.style)
  // Pré-visualização durante um gesto (mover/arrastar troço): só vai para o histórico ao largar.
  const [preview, setPreview] = useState<CommandsDiagram | null>(null)
  const diagram = preview ?? stored
  const partById = useMemo(() => new Map(diagram.parts.map((p) => [p.id, p])), [diagram])

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
  const canvasId = useId()
  const gesture = useRef<{ kind: 'pan' | 'move' | 'mid' | 'wire' | 'press'; startX: number; startY: number; view?: View; partId?: string; offset?: Pt; wireId?: string; moved?: boolean; tag?: string } | null>(null)
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
      closed: isClosed(part, rt), energized: !!rt.coils[part.tag], lit: !!rt.lamps[part.id], motor: rt.motors[part.id],
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
      const scale = Math.max(0.3, Math.min(3, v.scale * factor))
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

  const bounds = useMemo(() => {
    const boxes = diagram.parts.map(partBox)
    if (!boxes.length) return { minX: 0, minY: 0, maxX: 800, maxY: 600 }
    return {
      minX: Math.min(...boxes.map((b) => b.x)) - 60, minY: Math.min(...boxes.map((b) => b.y)) - 60,
      maxX: Math.max(...boxes.map((b) => b.x + b.w)) + 60, maxY: Math.max(...boxes.map((b) => b.y + b.h)) + 60,
    }
  }, [diagram])
  const fit = useCallback((d: CommandsDiagram = useSimStore.getState().commands) => {
    const el = viewportRef.current
    if (!el || !d.parts.length) { setView({ x: 60, y: 60, scale: 1 }); return }
    const boxes = d.parts.map(partBox)
    const minX = Math.min(...boxes.map((b) => b.x)) - 40, minY = Math.min(...boxes.map((b) => b.y)) - 50
    const maxX = Math.max(...boxes.map((b) => b.x + b.w)) + 40, maxY = Math.max(...boxes.map((b) => b.y + b.h)) + 40
    const scale = Math.max(0.3, Math.min(1.6, Math.min(el.clientWidth / (maxX - minX), el.clientHeight / (maxY - minY))))
    setView({ scale, x: (el.clientWidth - (maxX - minX) * scale) / 2 - minX * scale, y: (el.clientHeight - (maxY - minY) * scale) / 2 - minY * scale })
  }, [])
  useEffect(() => { const id = window.setTimeout(() => fit(), 60); return () => window.clearTimeout(id) }, [fit])

  // ---------------------------------------------------------------- pedidos da barra
  const loadExample = async () => {
    const id = await uiChoose('Escolha um esquema de exemplo. Substitui o esquema atual (pode desfazer).', COMMANDS_EXAMPLES.map((e) => ({ id: e.id, title: e.title, description: e.detail })), { title: 'Exemplos de comandos', confirmLabel: 'Abrir exemplo' })
    const example = COMMANDS_EXAMPLES.find((e) => e.id === id)
    if (!example) return
    useCommandsUi.getState().stop()
    const next = example.build()
    commit(next)
    select(null)
    window.setTimeout(() => fit(next), 30)
  }
  const clearAll = async () => {
    if (!useSimStore.getState().commands.parts.length) return
    if (!(await uiConfirm('Apagar todos os símbolos e cabos? Pode desfazer com Ctrl+Z.', { title: 'Limpar esquema', confirmLabel: 'Limpar', danger: true }))) return
    useCommandsUi.getState().stop(); commit(emptyCommands()); select(null)
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
    else if (name === 'clear') void clearAll()
    else if (name === 'rotate' && editable) rotateSelected()
    else if (name === 'delete' && editable) removeSelected()
    else if (name === 'focusSelection') focusSelection()
  }, [event?.n])

  // ---------------------------------------------------------------- acertos
  const terminalNear = (p: Pt, exclude?: CmdEnd): CmdEnd | null => {
    let best: CmdEnd | null = null, bestD = 10 / Math.min(1, view.scale)
    for (const part of diagram.parts) partTerminals(part).forEach((_, i) => {
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
    for (const w of diagram.wires) {
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
      commit({ ...diagram, wires: [...diagram.wires, { id: nanoid(8), a, b: end }] })
      return true
    }
    // Largar sobre um cabo: cria um nó nesse ponto e divide o cabo em dois.
    const hit = wireNear(target)
    if (hit) {
      const node: CmdPart = { id: nanoid(8), kind: 'node', x: hit.at.x, y: hit.at.y, rot: 0, tag: '' }
      const rest = diagram.wires.filter((w) => w.id !== hit.wire.id)
      commit({
        ...diagram,
        parts: [...diagram.parts, node],
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
    select(null)
    startPan(event)
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
    select({ type: 'part', id: part.id })
    const p = toWorld(event.clientX, event.clientY)
    gesture.current = { kind: 'move', startX: event.clientX, startY: event.clientY, partId: part.id, offset: { x: p.x - part.x, y: p.y - part.y } }
    ;(event.currentTarget as Element).setPointerCapture?.(event.pointerId)
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
    if (g.kind === 'move' && g.partId && g.offset) {
      const x = snap(p.x - g.offset.x), y = snap(p.y - g.offset.y)
      const part = stored.parts.find((q) => q.id === g.partId)
      if (part && (part.x !== x || part.y !== y)) { g.moved = true; setPreview({ ...stored, parts: stored.parts.map((q) => (q.id === g.partId ? { ...q, x, y } : q)) }) }
      else if (part) setPreview(null)
    }
    if (g.kind === 'mid' && g.wireId) { g.moved = true; setPreview({ ...stored, wires: stored.wires.map((q) => (q.id === g.wireId ? { ...q, mid: snap(p.y) } : q)) }) }
    if (g.kind === 'wire' && draft) { setDraft({ ...draft, to: p }); setHoverTerm(terminalNear(p, draft.from)) }
  }
  const onUp = (event: ReactPointerEvent) => {
    const g = gesture.current
    gesture.current = null
    if (!g) return
    if (g.kind === 'press' && g.tag) { useCommandsUi.getState().press(g.tag, false); return }
    if ((g.kind === 'move' || g.kind === 'mid') && preview && g.moved) commit(preview)
    else setPreview(null)
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
      if (e.key === 'Escape') { setPlacing(null); setDraft(null); setHoverTerm(null); select(null); return }
      if (mod || !editable) return
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

  // ---------------------------------------------------------------- desenho
  const grid = CMD_GRID * view.scale
  const wireColor = (w: CmdWire) => (running && rt.liveWires[w.id] ? PHASE_COLORS[rt.liveWires[w.id]] ?? '#dc2626' : '#475569')
  const showPorts = editable && (tool === 'wire' || !!draft)
  // Mesmo fundo de grelha dos outros editores (pontos ou linhas, como escolhido no projeto).
  const background = editorGridBackground({ enabled: gridOn, style: gridStyle === 'lines' ? 'lines' : 'dots', spacing: grid, x: view.x - 1, y: view.y - 1 })

  return (
    <div className={`dc-cmd ${running ? 'is-running' : ''}`}>
      <div className="dc-cmd-main">
        <div
          id={canvasId}
          ref={viewportRef}
          className={`dc-cmd-canvas is-tool-${tool} ${placing ? 'is-placing' : ''}`}
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
              {diagram.texts?.map((t) => <text key={t.id} className="dc-cmd-text" x={t.x} y={t.y}>{t.text}</text>)}
              {diagram.wires.map((w) => {
                const pts = pointsOf(w)
                if (pts.length < 2) return null
                const d = pts.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ')
                const selected = selection?.type === 'wire' && selection.id === w.id
                return <g key={w.id} data-cmd-wire={w.id}>
                  {selected && <path d={d} className="dc-cmd-wire-halo" />}
                  <path d={d} className="dc-cmd-wire" stroke={wireColor(w)} strokeWidth={running && rt.liveWires[w.id] ? 2.4 : 1.6} />
                </g>
              })}
              {diagram.parts.map((part) => (
                <g key={part.id} onPointerDown={(e) => onPartDown(part, e)} className={running && (MOMENTARY.includes(part.kind) || TOGGLES.includes(part.kind) || part.kind.startsWith('thermal')) ? 'dc-cmd-actuator' : undefined}>
                  <CmdSymbol part={part} state={stateOf(part)} selected={selection?.type === 'part' && selection.id === part.id} />
                </g>
              ))}
              {editable && tool !== 'pan' && tool !== 'erase' && <g className={`dc-cmd-ports ${showPorts ? 'is-wiring' : ''}`}>{diagram.parts.flatMap((part) => partTerminals(part).map((_, i) => {
                const at = terminalAt(part, i)
                const hot = hoverTerm?.part === part.id && hoverTerm.term === i
                return <circle key={`${part.id}:${i}`} className={`dc-cmd-port ${hot ? 'is-hot' : ''}`} data-cmd-port={`${part.id}:${i}`} cx={at.x} cy={at.y} r={hot ? 6 : 4.5}
                  onPointerDown={(e) => onTermDown({ part: part.id, term: i }, e)}><title>{`${part.tag || CMD_PARTS[part.kind].label} · borne ${terminalLabel(part, i) || i + 1} — arraste ou clique para ligar`}</title></circle>
              }))}</g>}
              {draft && (() => {
                const from = partById.get(draft.from.part)
                if (!from) return null
                const a = terminalAt(from, draft.from.term)
                const over = hoverTerm ? partById.get(hoverTerm.part) : undefined
                const target = over && hoverTerm ? terminalAt(over, hoverTerm.term) : { x: snap(draft.to.x), y: snap(draft.to.y) }
                return <path className="dc-cmd-wire-draft" d={wirePoints(a, target).map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ')} />
              })()}
              {placing && cursor && <g className="dc-cmd-ghost" pointerEvents="none"><CmdSymbol part={{ id: 'ghost', kind: placing, x: cursor.x, y: cursor.y, rot: 0, tag: defaultTag(diagram, placing), lines: placing === 'supply' ? ['L1', 'L2', 'L3'] : undefined }} showTerminals={false} /></g>}
            </g>
          </svg>
          {!diagram.parts.length && (
            <div className="dc-cmd-empty">
              <IconCommands size={22} />
              <strong>Esquema de comandos vazio</strong>
              <span>Escolha símbolos na Biblioteca ou abra um exemplo (arranque direto, estrela-triângulo).</span>
              {!demo && <button type="button" className="dc-btn dc-btn-primary" onPointerDown={(e) => e.stopPropagation()} onClick={() => void loadExample()}>Abrir um exemplo</button>}
            </div>
          )}
          {rt.fault && <div className="dc-cmd-fault" role="alert"><strong>Simulação parada</strong><span>{rt.fault}</span></div>}
          {notice && !rt.fault && <div className="dc-cmd-toast" role="status">{notice}</div>}
          {running && <div className="dc-cmd-hint">{paused ? 'Simulação em pausa' : 'Simulação: prima os botões no esquema · clique no térmico para o disparar'}</div>}
          <CanvasPanScrollbars label="Esquema de comandos" controlsId={canvasId}
            view={{ x: -view.x / view.scale, y: -view.y / view.scale, width: size.width / view.scale, height: size.height / view.scale }}
            bounds={bounds}
            onChange={({ x, y }) => setView((v) => ({ ...v, x: -x * v.scale, y: -y * v.scale }))} />
        </div>
      </div>
    </div>
  )
}
