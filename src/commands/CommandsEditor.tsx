// ============================================================================
// Simulador de comandos elétricos — editor + simulação do esquema IEC
// Mesmo ambiente dos outros editores (grelha, painéis, Desfazer/Refazer da store).
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { nanoid } from 'nanoid'
import { useSimStore } from '../store/useSimStore'
import { useNonPassiveListener } from '../ui/useNonPassiveListener'
import { isTypingTarget } from '../ui/editorKeys'
import { uiChoose, uiConfirm } from '../ui/dialogs'
import { EDITOR_THEME } from '../ui/editorTheme'
import SidePanelHeader from '../components/SidePanelHeader'
import { IconCommands, IconLayers } from '../ui/icons'
import {
  CMD_GRID, CMD_PALETTE, CMD_PARTS, emptyCommands, nextTag, partBox, partTerminals, snap, terminalAt, terminalLabel, wirePoints,
  type CmdEnd, type CmdKind, type CmdPart, type CmdRotation, type CmdWire, type CommandsDiagram, type Pt,
} from './model'
import { devicesOf, emptyCmdRuntime, isClosed, stepCommands, type CmdRuntime } from './engine'
import { CmdSymbol, PHASE_COLORS, symbolBody, type CmdSymbolState } from './symbols'
import { COMMANDS_EXAMPLES } from './examples'
import '../styles/commands.css'

type Selection = { type: 'part' | 'wire'; id: string } | null
type View = { x: number; y: number; scale: number }

const SUPPLY_PRESETS = [['L1', 'L2', 'L3'], ['L1', 'L2', 'L3', 'N'], ['L1', 'L2', 'L3', 'N', 'PE'], ['L1', 'N'], ['L1'], ['L2'], ['L3'], ['N'], ['PE'], ['L+'], ['M']]
const TICK_MS = 50
const MOMENTARY: CmdKind[] = ['pushNO', 'pushNC', 'limitNO']
const TOGGLES: CmdKind[] = ['emergency', 'selector', 'breaker3', 'disconnector3']

/** Marcação dos contactos auxiliares pela norma: o 1.º algarismo é o nº de ordem, o 2.º a função. */
function auxLabels(diagram: CommandsDiagram, kind: CmdKind, tag: string): string[] | undefined {
  const fn = kind === 'contactNO' ? ['3', '4'] : kind === 'contactNC' ? ['1', '2'] : kind === 'timedNO' ? ['7', '8'] : kind === 'timedNC' ? ['5', '6'] : null
  if (!fn) return undefined
  const used = new Set(diagram.parts.filter((p) => p.tag === tag && p.id).map((p) => terminalLabel(p, 0)).filter((l) => /^\d\d$/.test(l)).map((l) => l[0]))
  for (let n = 1; n <= 9; n++) if (!used.has(String(n))) return [`${n}${fn[0]}`, `${n}${fn[1]}`]
  return undefined
}

/** Referência proposta: contactos reutilizam o último aparelho que os comanda. */
function defaultTag(diagram: CommandsDiagram, kind: CmdKind): string {
  const last = (kinds: CmdKind[], fallback: string) => [...diagram.parts].reverse().find((p) => kinds.includes(p.kind))?.tag || fallback
  if (kind === 'contact3' || kind === 'contactNO' || kind === 'contactNC') return last(['coil', 'timerCoil'], 'K1')
  if (kind === 'timedNO' || kind === 'timedNC') return last(['timerCoil'], 'K1')
  if (kind === 'thermalNC' || kind === 'thermalNO') return last(['thermal3'], 'F1')
  return nextTag(diagram, kind)
}

const distToSegment = (p: Pt, a: Pt, b: Pt) => {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0
  return { d: Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)), q: { x: a.x + dx * t, y: a.y + dy * t } }
}

export default function CommandsEditor({ demo = false }: { demo?: boolean }) {
  const stored = useSimStore((s) => s.commands) ?? emptyCommands()
  const setCommands = useSimStore((s) => s.setCommands)
  // Pré-visualização durante um gesto (mover/arrastar troço): só vai para o histórico ao largar.
  const [preview, setPreview] = useState<CommandsDiagram | null>(null)
  const diagram = preview ?? stored
  const partById = useMemo(() => new Map(diagram.parts.map((p) => [p.id, p])), [diagram])

  const [view, setView] = useState<View>({ x: 60, y: 60, scale: 1 })
  const [selection, setSelection] = useState<Selection>(null)
  const [placing, setPlacing] = useState<CmdKind | null>(null)
  const [cursor, setCursor] = useState<Pt | null>(null)
  const [draft, setDraft] = useState<{ from: CmdEnd; to: Pt } | null>(null)
  const [hoverTerm, setHoverTerm] = useState<CmdEnd | null>(null)
  const [rt, setRt] = useState<CmdRuntime>(emptyCmdRuntime)
  const [notice, setNotice] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(true)
  const [panelOpen, setPanelOpen] = useState(true)
  const viewportRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<{ kind: 'pan' | 'move' | 'mid' | 'wire'; startX: number; startY: number; view?: View; partId?: string; offset?: Pt; wireId?: string; moved?: boolean } | null>(null)
  const rtRef = useRef(rt)
  rtRef.current = rt
  const diagramRef = useRef(diagram)
  diagramRef.current = diagram
  const running = rt.running
  const editable = !running && !demo

  const notify = useCallback((text: string) => { setNotice(text); window.setTimeout(() => setNotice((v) => (v === text ? null : v)), 2600) }, [])
  const commit = (next: CommandsDiagram) => { setPreview(null); setCommands(next, 'force') }

  // ---------------------------------------------------------------- simulação
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setRt((prev) => stepCommands(diagramRef.current, prev, TICK_MS)), TICK_MS)
    return () => window.clearInterval(timer)
  }, [running])
  const updateRt = (patch: Partial<CmdRuntime>) => setRt((prev) => stepCommands(diagramRef.current, { ...prev, ...patch }, 0))
  const startSim = () => {
    setSelection(null); setPlacing(null); setDraft(null)
    const next = stepCommands(diagramRef.current, { ...emptyCmdRuntime(), running: true }, 0)
    setRt(next)
    if (next.fault) notify(next.fault)
  }
  const stopSim = () => setRt(emptyCmdRuntime())
  useEffect(() => { if (rt.fault) notify(rt.fault) }, [rt.fault, notify])

  const press = (tag: string, down: boolean) => updateRt({ pressed: { ...rtRef.current.pressed, [tag]: down } })
  const toggle = (tag: string) => updateRt({ toggled: { ...rtRef.current.toggled, [tag]: !rtRef.current.toggled[tag] } })
  const trip = (tag: string, value: boolean) => updateRt({ tripped: { ...rtRef.current.tripped, [tag]: value } })

  const stateOf = (part: CmdPart): CmdSymbolState => {
    if (!running) {
      // Fora da simulação os contactos mostram a posição de repouso (como no papel).
      return { closed: isClosed(part, emptyCmdRuntime()), idle: true }
    }
    const since = rt.coilSince[part.tag]
    const delay = rt.delays[part.tag] ?? part.delayMs ?? 3000
    const progress = since !== undefined ? Math.min(1, (rt.time - since) / delay) : undefined
    return {
      closed: isClosed(part, rt), energized: !!rt.coils[part.tag], lit: !!rt.lamps[part.id], motor: rt.motors[part.id],
      progress: part.kind === 'timerCoil' || part.kind === 'timedNO' || part.kind === 'timedNC' ? progress : undefined,
      tripped: !!rt.tripped[part.tag],
    }
  }

  // ---------------------------------------------------------------- coordenadas
  const toWorld = (clientX: number, clientY: number): Pt => {
    const rect = viewportRef.current?.getBoundingClientRect()
    return { x: (clientX - (rect?.left ?? 0) - view.x) / view.scale, y: (clientY - (rect?.top ?? 0) - view.y) / view.scale }
  }
  const wheel = useCallback((event: WheelEvent) => {
    event.preventDefault()
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    setView((v) => {
      const scale = Math.max(0.3, Math.min(3, v.scale * (event.deltaY < 0 ? 1.12 : 1 / 1.12)))
      const px = event.clientX - rect.left, py = event.clientY - rect.top
      return { scale, x: px - ((px - v.x) / v.scale) * scale, y: py - ((py - v.y) / v.scale) * scale }
    })
  }, [])
  useNonPassiveListener(viewportRef, 'wheel', wheel)

  const fit = useCallback((d: CommandsDiagram = diagramRef.current) => {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect || !d.parts.length) { setView({ x: 60, y: 60, scale: 1 }); return }
    const boxes = d.parts.map(partBox)
    const minX = Math.min(...boxes.map((b) => b.x)) - 40, minY = Math.min(...boxes.map((b) => b.y)) - 50
    const maxX = Math.max(...boxes.map((b) => b.x + b.w)) + 40, maxY = Math.max(...boxes.map((b) => b.y + b.h)) + 40
    const scale = Math.max(0.3, Math.min(1.6, Math.min(rect.width / (maxX - minX), rect.height / (maxY - minY))))
    setView({ scale, x: (rect.width - (maxX - minX) * scale) / 2 - minX * scale, y: (rect.height - (maxY - minY) * scale) / 2 - minY * scale })
  }, [])
  useEffect(() => { const id = window.setTimeout(() => fit(), 60); return () => window.clearTimeout(id) }, [fit])

  // ---------------------------------------------------------------- edição
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
  const pointsOf = (w: CmdWire, d: CommandsDiagram = diagram): Pt[] => {
    const pa = d.parts.find((p) => p.id === w.a.part), pb = d.parts.find((p) => p.id === w.b.part)
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

  const addPart = (kind: CmdKind, at: Pt) => {
    const tag = CMD_PARTS[kind].prefix ? defaultTag(diagram, kind) : ''
    const part: CmdPart = {
      id: nanoid(8), kind, x: snap(at.x), y: snap(at.y), rot: 0, tag,
      ...(kind === 'supply' ? { lines: ['L1', 'L2', 'L3'] } : {}),
      ...(kind === 'timerCoil' ? { delayMs: 3000 } : {}),
      ...(kind === 'lamp' ? { color: 'green' as const } : {}),
    }
    const labels = auxLabels(diagram, kind, tag)
    if (labels) part.labels = labels
    commit({ ...diagram, parts: [...diagram.parts, part] })
    setSelection({ type: 'part', id: part.id })
    notify(`${CMD_PARTS[kind].label}${tag ? ` ${tag}` : ''} colocado${kind === 'contactNO' || kind === 'contactNC' || kind === 'contact3' ? ` — comandado pela bobina ${tag}` : ''}`)
  }

  const connect = (a: CmdEnd, target: Pt) => {
    const end = terminalNear(target, a)
    if (end) {
      if (diagram.wires.some((w) => (w.a.part === a.part && w.a.term === a.term && w.b.part === end.part && w.b.term === end.term) || (w.b.part === a.part && w.b.term === a.term && w.a.part === end.part && w.a.term === end.term))) return notify('Esses bornes já estão ligados')
      commit({ ...diagram, wires: [...diagram.wires, { id: nanoid(8), a, b: end }] })
      return
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
      return
    }
    notify('Largue o cabo sobre um borne ou sobre outro cabo')
  }

  const removeSelection = () => {
    if (!selection) return
    if (selection.type === 'part') commit({ ...diagram, parts: diagram.parts.filter((p) => p.id !== selection.id), wires: diagram.wires.filter((w) => w.a.part !== selection.id && w.b.part !== selection.id) })
    else commit({ ...diagram, wires: diagram.wires.filter((w) => w.id !== selection.id) })
    setSelection(null)
  }
  const rotateSelection = () => {
    if (selection?.type !== 'part') return
    commit({ ...diagram, parts: diagram.parts.map((p) => (p.id === selection.id ? { ...p, rot: ((p.rot + 90) % 360) as CmdRotation } : p)) })
  }
  const patchPart = (id: string, patch: Partial<CmdPart>) => commit({ ...diagram, parts: diagram.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)) })

  const loadExample = async () => {
    const id = await uiChoose('Escolha um esquema de exemplo. Substitui o esquema atual (pode desfazer).', COMMANDS_EXAMPLES.map((e) => ({ id: e.id, title: e.title, description: e.detail })), { title: 'Exemplos de comandos', confirmLabel: 'Abrir exemplo' })
    const example = COMMANDS_EXAMPLES.find((e) => e.id === id)
    if (!example) return
    stopSim()
    const next = example.build()
    commit(next)
    setSelection(null)
    window.setTimeout(() => fit(next), 30)
  }
  const clearAll = async () => {
    if (!diagram.parts.length) return
    if (!(await uiConfirm('Apagar todos os símbolos e cabos? Pode desfazer com Ctrl+Z.', { title: 'Limpar esquema', confirmLabel: 'Limpar', danger: true }))) return
    stopSim(); commit(emptyCommands()); setSelection(null)
  }

  // ---------------------------------------------------------------- gestos
  const onCanvasDown = (event: ReactPointerEvent) => {
    if (event.button !== 0 && event.button !== 1) return
    const p = toWorld(event.clientX, event.clientY)
    if (placing && event.button === 0) { addPart(placing, p); if (!event.shiftKey) setPlacing(null); return }
    if (editable && event.button === 0) {
      const hit = wireNear(p)
      if (hit) {
        setSelection({ type: 'wire', id: hit.wire.id })
        const pts = pointsOf(hit.wire)
        if (pts.length === 4) {
          gesture.current = { kind: 'mid', startX: event.clientX, startY: event.clientY, wireId: hit.wire.id }
          ;(event.target as Element).setPointerCapture?.(event.pointerId)
        }
        return
      }
    }
    setSelection(null)
    gesture.current = { kind: 'pan', startX: event.clientX, startY: event.clientY, view }
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
  }
  const onPartDown = (part: CmdPart, event: ReactPointerEvent) => {
    if (event.button !== 0) return
    event.stopPropagation()
    if (running) {
      if (MOMENTARY.includes(part.kind)) { press(part.tag, true); gesture.current = { kind: 'pan', startX: 0, startY: 0, partId: part.id } }
      else if (TOGGLES.includes(part.kind)) toggle(part.tag)
      else if (part.kind === 'thermal3' || part.kind === 'thermalNC' || part.kind === 'thermalNO') trip(part.tag, !rt.tripped[part.tag])
      return
    }
    if (placing || demo) return
    setSelection({ type: 'part', id: part.id })
    const p = toWorld(event.clientX, event.clientY)
    gesture.current = { kind: 'move', startX: event.clientX, startY: event.clientY, partId: part.id, offset: { x: p.x - part.x, y: p.y - part.y } }
    ;(event.currentTarget as Element).setPointerCapture?.(event.pointerId)
  }
  const onTermDown = (end: CmdEnd, event: ReactPointerEvent) => {
    if (!editable || event.button !== 0) return
    event.stopPropagation()
    const part = partById.get(end.part)
    if (!part) return
    setDraft({ from: end, to: terminalAt(part, end.term) })
    gesture.current = { kind: 'wire', startX: event.clientX, startY: event.clientY }
    ;(event.currentTarget as Element).setPointerCapture?.(event.pointerId)
  }

  const onMove = (event: ReactPointerEvent) => {
    const p = toWorld(event.clientX, event.clientY)
    if (placing) setCursor({ x: snap(p.x), y: snap(p.y) })
    const g = gesture.current
    if (!g) return
    if (g.kind === 'pan' && g.view) setView({ ...g.view, x: g.view.x + event.clientX - g.startX, y: g.view.y + event.clientY - g.startY })
    if (g.kind === 'move' && g.partId && g.offset) {
      const x = snap(p.x - g.offset.x), y = snap(p.y - g.offset.y)
      const part = stored.parts.find((q) => q.id === g.partId)
      if (part && (part.x !== x || part.y !== y)) { g.moved = true; setPreview({ ...stored, parts: stored.parts.map((q) => (q.id === g.partId ? { ...q, x, y } : q)) }) }
      else if (part) setPreview(null)
    }
    if (g.kind === 'mid' && g.wireId) {
      const w = stored.wires.find((q) => q.id === g.wireId)
      if (w) { g.moved = true; setPreview({ ...stored, wires: stored.wires.map((q) => (q.id === g.wireId ? { ...q, mid: snap(p.y) } : q)) }) }
    }
    if (g.kind === 'wire' && draft) {
      setDraft({ ...draft, to: p })
      setHoverTerm(terminalNear(p, draft.from))
    }
  }
  const onUp = (event: ReactPointerEvent) => {
    const g = gesture.current
    gesture.current = null
    if (!g) return
    if (g.partId && running) { const part = partById.get(g.partId); if (part) press(part.tag, false); return }
    if ((g.kind === 'move' || g.kind === 'mid') && preview && g.moved) commit(preview)
    else setPreview(null)
    if (g.kind === 'wire' && draft) {
      const p = toWorld(event.clientX, event.clientY)
      if (Math.hypot(event.clientX - g.startX, event.clientY - g.startY) > 4) connect(draft.from, p)
      setDraft(null); setHoverTerm(null)
    }
  }

  // ---------------------------------------------------------------- teclado
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return
      const mod = event.ctrlKey || event.metaKey
      if (mod && event.key.toLowerCase() === 'z') { event.preventDefault(); stopSim(); if (event.shiftKey) useSimStore.getState().redo(); else useSimStore.getState().undo(); return }
      if (mod && event.key.toLowerCase() === 'y') { event.preventDefault(); stopSim(); useSimStore.getState().redo(); return }
      if (event.key === 'Escape') { setPlacing(null); setDraft(null); setSelection(null) }
      if (!editable) return
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removeSelection() }
      if (event.key.toLowerCase() === 'r' && !mod) rotateSelection()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ---------------------------------------------------------------- desenho
  const selectedPart = selection?.type === 'part' ? partById.get(selection.id) : undefined
  const devices = useMemo(() => devicesOf(diagram), [diagram])
  const grid = CMD_GRID * view.scale
  const wireColor = (w: CmdWire) => (running && rt.liveWires[w.id] ? PHASE_COLORS[rt.liveWires[w.id]] ?? '#dc2626' : '#475569')

  return (
    <div className={`dc-cmd ${running ? 'is-running' : ''}`}>
      {!demo && (paletteOpen ? (
        <aside className="dc-cmd-palette" aria-label="Símbolos">
          <SidePanelHeader eyebrow="COMANDOS" title="Símbolos IEC" icon={<IconCommands size={15} />} onToggle={() => setPaletteOpen(false)} toggleLabel="Recolher símbolos" />
          <div className="dc-cmd-palette-body">
            {CMD_PALETTE.map((group) => (
              <section key={group.title}>
                <h3>{group.title}</h3>
                <div className="dc-cmd-palette-grid">
                  {group.kinds.map((kind) => {
                    const def = CMD_PARTS[kind]
                    const box = partBox({ id: 'pv', kind, x: 0, y: 0, rot: 0, tag: '', lines: kind === 'supply' ? ['L1', 'L2', 'L3'] : undefined })
                    const pad = 14
                    return (
                      <button key={kind} type="button" className={`dc-cmd-palette-item ${placing === kind ? 'is-on' : ''}`} disabled={running}
                        draggable onDragStart={(e) => { e.dataTransfer.setData('text/dc-cmd-kind', kind); e.dataTransfer.effectAllowed = 'copy' }}
                        onClick={() => setPlacing(placing === kind ? null : kind)} title={`${def.label} — ${def.hint}`} aria-label={`Colocar ${def.label}`} aria-pressed={placing === kind}>
                        <svg viewBox={`${box.x - pad} ${box.y - pad - (kind === 'supply' ? 6 : 0)} ${box.w + pad * 2} ${box.h + pad * 2 + (kind === 'supply' ? 6 : 0)}`} aria-hidden="true">
                          <g fill="none" stroke="#1e293b" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">{symbolBody({ kind, lines: kind === 'supply' ? ['L1', 'L2', 'L3'] : undefined, color: 'green' }, { idle: true, closed: kind === 'contactNC' || kind === 'timedNC' || kind === 'thermalNC' || kind === 'pushNC' || kind === 'emergency' })}</g>
                        </svg>
                        <span>{def.label}</span>
                      </button>
                    )
                  })}
                </div>
              </section>
            ))}
            <p className="dc-cmd-tip">Clique num símbolo e depois no esquema (Shift mantém). Puxe um cabo de um borne até outro borne — ou até um cabo, para criar um nó.</p>
          </div>
        </aside>
      ) : <button type="button" className="dc-cmd-rail" onClick={() => setPaletteOpen(true)} aria-label="Mostrar símbolos"><IconLayers size={15} /><span>Símbolos</span></button>)}

      <div className="dc-cmd-main">
        <div className="dc-cmd-bar" role="toolbar" aria-label="Comandos elétricos">
          <strong className="dc-cmd-title">{diagram.name || 'Esquema de comando'}</strong>
          {!demo && <button type="button" className="dc-btn" onClick={loadExample} disabled={running}>Exemplos</button>}
          {!demo && <button type="button" className="dc-btn" onClick={rotateSelection} disabled={!selectedPart || running} title="Rodar 90° [R]">Rodar</button>}
          {!demo && <button type="button" className="dc-btn" onClick={removeSelection} disabled={!selection || running} title="Apagar [Del]">Apagar</button>}
          {!demo && <button type="button" className="dc-btn" onClick={clearAll} disabled={!diagram.parts.length || running}>Limpar</button>}
          <button type="button" className="dc-btn" onClick={() => fit()}>Ajustar</button>
          <span className="dc-cmd-zoom">{Math.round(view.scale * 100)}%</span>
          <span className="dc-cmd-spacer" />
          {running
            ? <button type="button" className="dc-btn dc-cmd-stop" onClick={stopSim}>■ Parar simulação</button>
            : <button type="button" className="dc-btn dc-cmd-run" onClick={startSim} disabled={!diagram.parts.length}>▶ Simular</button>}
        </div>
        <div
          ref={viewportRef}
          className={`dc-cmd-canvas ${placing ? 'is-placing' : ''}`}
          style={{ backgroundColor: EDITOR_THEME.background, backgroundImage: `radial-gradient(${EDITOR_THEME.dot} 1px, transparent 1.2px)`, backgroundSize: `${grid}px ${grid}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
          onPointerDown={onCanvasDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { gesture.current = null; setPreview(null); setDraft(null) }}
          onPointerLeave={() => setCursor(null)}
          onDragOver={(e) => { if (e.dataTransfer.types.includes('text/dc-cmd-kind')) e.preventDefault() }}
          onDrop={(e) => { const kind = e.dataTransfer.getData('text/dc-cmd-kind') as CmdKind; if (kind && CMD_PARTS[kind] && editable) { e.preventDefault(); addPart(kind, toWorld(e.clientX, e.clientY)) } }}
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
              {editable && <g className={`dc-cmd-ports ${draft ? 'is-wiring' : ''}`}>{diagram.parts.flatMap((part) => partTerminals(part).map((_, i) => {
                const at = terminalAt(part, i)
                const hot = hoverTerm?.part === part.id && hoverTerm.term === i
                return <circle key={`${part.id}:${i}`} className={`dc-cmd-port ${hot ? 'is-hot' : ''}`} data-cmd-port={`${part.id}:${i}`} cx={at.x} cy={at.y} r={hot ? 6 : 4.5}
                  onPointerDown={(e) => onTermDown({ part: part.id, term: i }, e)}><title>{`${part.tag || CMD_PARTS[part.kind].label} · borne ${terminalLabel(part, i) || i + 1} — arraste para ligar`}</title></circle>
              }))}</g>}
              {draft && (() => {
                const from = partById.get(draft.from.part)
                if (!from) return null
                const a = terminalAt(from, draft.from.term)
                const target = hoverTerm ? terminalAt(partById.get(hoverTerm.part)!, hoverTerm.term) : { x: snap(draft.to.x), y: snap(draft.to.y) }
                return <path className="dc-cmd-wire-draft" d={wirePoints(a, target).map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ')} />
              })()}
              {placing && cursor && <g className="dc-cmd-ghost" pointerEvents="none"><CmdSymbol part={{ id: 'ghost', kind: placing, x: cursor.x, y: cursor.y, rot: 0, tag: CMD_PARTS[placing].prefix ? defaultTag(diagram, placing) : '', lines: placing === 'supply' ? ['L1', 'L2', 'L3'] : undefined }} showTerminals={false} /></g>}
            </g>
          </svg>
          {!diagram.parts.length && (
            <div className="dc-cmd-empty">
              <IconCommands size={22} />
              <strong>Esquema de comandos vazio</strong>
              <span>Escolha símbolos na paleta ou abra um exemplo (arranque direto, estrela-triângulo).</span>
              {!demo && <button type="button" className="dc-btn dc-btn-primary" onClick={loadExample}>Abrir um exemplo</button>}
            </div>
          )}
          {rt.fault && <div className="dc-cmd-fault" role="alert"><strong>Simulação parada</strong><span>{rt.fault}</span></div>}
          {notice && !rt.fault && <div className="dc-cmd-toast" role="status">{notice}</div>}
          {running && <div className="dc-cmd-hint">Simulação: prima os botões no esquema · clique no térmico para o disparar · Esc não para a simulação</div>}
        </div>
      </div>

      {panelOpen ? (
        <aside className="dc-cmd-panel" aria-label={running ? 'Estado da simulação' : 'Propriedades'}>
          <SidePanelHeader eyebrow={running ? 'SIMULAÇÃO' : 'PROPRIEDADES'} title={running ? 'Estado dos aparelhos' : selectedPart ? `${CMD_PARTS[selectedPart.kind].label}${selectedPart.tag ? ` ${selectedPart.tag}` : ''}` : 'Esquema'} side="right" onToggle={() => setPanelOpen(false)} toggleLabel="Recolher painel" />
          <div className="dc-cmd-panel-body">
            {running ? (
              <>
                <p className="dc-cmd-time">Tempo simulado: <b>{(rt.time / 1000).toFixed(1)} s</b></p>
                <ul className="dc-cmd-devices">
                  {devices.filter(({ kinds }) => !kinds.every((k) => k === 'fuse' || k === 'fuse3')).map(({ tag, kinds }) => {
                    const coil = kinds.includes('coil') || kinds.includes('timerCoil')
                    const timer = kinds.includes('timerCoil')
                    const momentary = kinds.some((k) => MOMENTARY.includes(k as CmdKind))
                    const toggleKind = kinds.find((k) => TOGGLES.includes(k as CmdKind))
                    const thermal = kinds.some((k) => k.startsWith('thermal'))
                    const motor = diagram.parts.find((p) => p.tag === tag && (p.kind === 'motor3' || p.kind === 'motor6'))
                    const lamp = diagram.parts.find((p) => p.tag === tag && p.kind === 'lamp')
                    const since = rt.coilSince[tag]
                    const delay = rt.delays[tag] ?? 3000
                    return <li key={tag} className="dc-cmd-device">
                      <b>{tag}</b>
                      {coil && <span className={`dc-cmd-chip ${rt.coils[tag] ? 'is-on' : ''}`}>{rt.coils[tag] ? 'bobina ligada' : 'bobina desligada'}</span>}
                      {timer && rt.coils[tag] && since !== undefined && <span className="dc-cmd-chip is-timer">{Math.min(delay, rt.time - since) / 1000 >= delay / 1000 ? 'tempo cumprido' : `${((rt.time - since) / 1000).toFixed(1)} / ${(delay / 1000).toFixed(1)} s`}</span>}
                      {momentary && <button type="button" className="dc-btn dc-cmd-press" onPointerDown={() => press(tag, true)} onPointerUp={() => press(tag, false)} onPointerLeave={() => rt.pressed[tag] && press(tag, false)}>{rt.pressed[tag] ? 'premido' : 'premir'}</button>}
                      {toggleKind && <button type="button" className={`dc-btn ${rt.toggled[tag] ? 'is-on' : ''}`} onClick={() => toggle(tag)}>{toggleKind === 'emergency' ? (rt.toggled[tag] ? 'desencravar' : 'encravar') : toggleKind === 'selector' ? (rt.toggled[tag] ? 'desligar' : 'ligar') : rt.toggled[tag] ? 'fechar' : 'abrir'}</button>}
                      {thermal && <button type="button" className={`dc-btn ${rt.tripped[tag] ? 'is-danger' : ''}`} onClick={() => trip(tag, !rt.tripped[tag])}>{rt.tripped[tag] ? 'rearmar' : 'disparar'}</button>}
                      {motor && <span className={`dc-cmd-chip ${rt.motors[motor.id]?.mode !== 'stop' ? 'is-on' : ''}`}>{(() => { const m = rt.motors[motor.id]; if (!m || m.mode === 'stop') return m?.phaseLoss ? 'falta de fase' : 'parado'; return `${m.mode === 'star' ? 'estrela (Y)' : m.mode === 'delta' ? 'triângulo (Δ)' : 'a rodar'} · ${m.dir === 1 ? 'sentido horário' : 'sentido anti-horário'}` })()}</span>}
                      {lamp && <span className={`dc-cmd-chip ${rt.lamps[lamp.id] ? 'is-on' : ''}`}>{rt.lamps[lamp.id] ? 'acesa' : 'apagada'}</span>}
                    </li>
                  })}
                </ul>
              </>
            ) : selectedPart ? (
              <PartProperties part={selectedPart} onChange={(patch) => patchPart(selectedPart.id, patch)} onRotate={rotateSelection} onDelete={removeSelection} />
            ) : selection?.type === 'wire' ? (
              <div className="dc-cmd-props"><p>Cabo selecionado. Arraste o troço do meio para o deslocar.</p><button type="button" className="dc-btn is-danger" onClick={removeSelection}>Apagar cabo</button></div>
            ) : (
              <div className="dc-cmd-props">
                <p><b>{diagram.parts.filter((p) => p.kind !== 'node').length}</b> símbolos · <b>{diagram.wires.length}</b> cabos · <b>{devices.length}</b> aparelhos</p>
                <p className="dc-cmd-muted">Os contactos com a mesma referência da bobina (K1, K2…) mudam quando ela recebe tensão. Os botões S, os térmicos F e os disjuntores Q operam-se durante a simulação.</p>
                <p className="dc-cmd-muted">Atalhos: R roda · Del apaga · Ctrl+Z desfaz · roda do rato faz zoom · arrastar o fundo move a vista.</p>
              </div>
            )}
          </div>
        </aside>
      ) : <button type="button" className="dc-cmd-rail is-right" onClick={() => setPanelOpen(true)} aria-label="Mostrar painel"><IconLayers size={15} /><span>{running ? 'Estado' : 'Propriedades'}</span></button>}
    </div>
  )
}

function PartProperties({ part, onChange, onRotate, onDelete }: { part: CmdPart; onChange: (patch: Partial<CmdPart>) => void; onRotate: () => void; onDelete: () => void }) {
  const def = CMD_PARTS[part.kind]
  const terms = partTerminals(part)
  return (
    <div className="dc-cmd-props">
      <p className="dc-cmd-muted">{def.hint}</p>
      {def.prefix && <label className="dc-cmd-field"><span>Referência</span>
        <input className="dc-input" value={part.tag} onChange={(e) => onChange({ tag: e.target.value.toUpperCase().replace(/\s+/g, '') })} aria-label="Referência do aparelho" />
      </label>}
      {(def.family === 'contact') && <p className="dc-cmd-muted">Comandado pelo aparelho <b>{part.tag || '—'}</b> (bobina, temporizador ou relé térmico com a mesma referência).</p>}
      {part.kind === 'supply' && <label className="dc-cmd-field"><span>Fases</span>
        <select className="dc-input" value={(part.lines ?? ['L1']).join(' ')} onChange={(e) => onChange({ lines: e.target.value.split(' ') })} aria-label="Fases da alimentação">
          {SUPPLY_PRESETS.map((p) => <option key={p.join(' ')} value={p.join(' ')}>{p.join(' · ')}</option>)}
        </select>
      </label>}
      {part.kind === 'timerCoil' && <label className="dc-cmd-field"><span>Atraso à operação (s)</span>
        <input className="dc-input" type="number" min={0.1} step={0.5} value={(part.delayMs ?? 3000) / 1000} onChange={(e) => onChange({ delayMs: Math.max(100, Math.round(Number(e.target.value) * 1000) || 100) })} aria-label="Atraso do temporizador em segundos" />
      </label>}
      {part.kind === 'lamp' && <label className="dc-cmd-field"><span>Cor</span>
        <select className="dc-input" value={part.color ?? 'green'} onChange={(e) => onChange({ color: e.target.value as CmdPart['color'] })} aria-label="Cor do sinalizador">
          <option value="green">Verde (marcha)</option><option value="red">Vermelho (paragem/defeito)</option><option value="yellow">Amarelo (alerta)</option><option value="white">Branco</option><option value="blue">Azul</option>
        </select>
      </label>}
      {part.kind !== 'supply' && part.kind !== 'node' && <div className="dc-cmd-field"><span>Marcação dos bornes</span>
        <div className="dc-cmd-terms">{terms.map((t, i) => <input key={i} className="dc-input" value={part.labels?.[i] ?? t.label} onChange={(e) => { const labels = terms.map((x, j) => part.labels?.[j] ?? x.label); labels[i] = e.target.value; onChange({ labels }) }} aria-label={`Borne ${i + 1}`} />)}</div>
      </div>}
      <div className="dc-cmd-actions">
        <button type="button" className="dc-btn" onClick={onRotate}>Rodar 90°</button>
        <button type="button" className="dc-btn is-danger" onClick={onDelete}>Apagar</button>
      </div>
    </div>
  )
}
