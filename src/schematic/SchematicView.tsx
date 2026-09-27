import { useEffect, useMemo, useRef, useState } from 'react'
import { useSimStore } from '../store/useSimStore'
import { SymbolGlyph, WIRE_COLORS, terminalPos } from './symbols'
import { IconProbe, IconHelp } from '../ui/icons'
import { SCENARIOS } from '../simulation/scenarios'
import type { ElectricalComponent, ComponentType } from '../types'

const CANVAS_W = 2000
const CANVAS_H = 1400

type Pt = { x: number; y: number }

/** Polilinha com cantos retos (condutor rígido — fio sólido). */
function sharpPath(pts: Pt[]) {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ')
}

/**
 * Polilinha com cantos arredondados / curva suave (condutor flexível —
 * multifilar). Os pontos intermédios funcionam como pontos de controle e a
 * curva passa suavemente perto deles.
 */
function smoothPath(pts: Pt[], radius = 16) {
  if (pts.length <= 2) return sharpPath(pts)
  let d = `M ${pts[0].x},${pts[0].y}`
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]
    const prev = pts[i - 1]
    const next = pts[i + 1]
    const d1 = Math.hypot(p.x - prev.x, p.y - prev.y) || 1
    const d2 = Math.hypot(next.x - p.x, next.y - p.y) || 1
    const r1 = Math.min(radius, d1 / 2)
    const r2 = Math.min(radius, d2 / 2)
    const inX = p.x - ((p.x - prev.x) / d1) * r1
    const inY = p.y - ((p.y - prev.y) / d1) * r1
    const outX = p.x + ((next.x - p.x) / d2) * r2
    const outY = p.y + ((next.y - p.y) / d2) * r2
    d += ` L ${inX},${inY} Q ${p.x},${p.y} ${outX},${outY}`
  }
  const last = pts[pts.length - 1]
  d += ` L ${last.x},${last.y}`
  return d
}

/**
 * Calcula o caminho SVG de um cabo conforme seu roteamento e devolve também a
 * posição do "manípulo" arrastável (ponto de dobra para ortogonal/manhattan,
 * ponto de controle da curva de Bézier para o roteamento curvo).
 *
 * Se o cabo tiver pontos de curva (waypoints, adicionados com duplo clique),
 * eles têm prioridade: o cabo passa por todos — em segmentos retos quando o
 * condutor é rígido, em curvas suaves quando é flexível.
 */
function wireGeometry(a: Pt, b: Pt, route: string, bend: number, curveOffset: number, waypoints: Pt[] | undefined, flexible: boolean) {
  const noHandle = null as (Pt & { mode: 'bend' | 'curve' }) | null
  if (waypoints && waypoints.length > 0) {
    const pts = [a, ...waypoints, b]
    return { d: flexible ? smoothPath(pts, 22) : sharpPath(pts), handle: noHandle }
  }
  if (route === 'direct') {
    return { d: `M ${a.x},${a.y} L ${b.x},${b.y}`, handle: noHandle }
  }
  if (route === 'arc') {
    const mx = a.x + (b.x - a.x) * bend
    const my = a.y + (b.y - a.y) * bend
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    const cx = mx + nx * curveOffset
    const cy = my + ny * curveOffset
    return { d: `M ${a.x},${a.y} Q ${cx},${cy} ${b.x},${b.y}`, handle: { x: cx, y: cy, mode: 'curve' as const } }
  }
  const mx = a.x + (b.x - a.x) * bend
  const my = a.y + (b.y - a.y) * bend
  const pts: Pt[] =
    route === 'orthogonal'
      ? [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b]
      : [a, { x: a.x, y: my }, { x: b.x, y: my }, b]
  const handle =
    route === 'orthogonal'
      ? { x: mx, y: (a.y + b.y) / 2, mode: 'bend' as const }
      : { x: (a.x + b.x) / 2, y: my, mode: 'bend' as const }
  // flexível: cantos suavemente arredondados · rígido: dobras vivas a 90°
  return { d: flexible ? smoothPath(pts) : sharpPath(pts), handle }
}

/** Insere um ponto na posição correta da sequência (segmento mais próximo). */
function insertWaypoint(a: Pt, b: Pt, waypoints: Pt[], p: Pt): Pt[] {
  const pts = [a, ...waypoints, b]
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < pts.length - 1; i++) {
    const s = pts[i]
    const e = pts[i + 1]
    const dx = e.x - s.x
    const dy = e.y - s.y
    const lenSq = dx * dx + dy * dy || 1
    const t = Math.max(0, Math.min(1, ((p.x - s.x) * dx + (p.y - s.y) * dy) / lenSq))
    const qx = s.x + dx * t
    const qy = s.y + dy * t
    const dist = Math.hypot(p.x - qx, p.y - qy)
    if (dist < bestDist) {
      bestDist = dist
      best = i
    }
  }
  const next = [...waypoints]
  next.splice(best, 0, p)
  return next
}

/** Editor de esquema completo: malha, arraste, seleção, cabos, bornes, sonda. */
export default function SchematicView() {
  const components = useSimStore((s) => s.components)
  const wires = useSimStore((s) => s.wires)
  const selectedIds = useSimStore((s) => s.selectedComponentIds)
  const selectedWireId = useSimStore((s) => s.selectedWireId)
  const selectedTerminalId = useSimStore((s) => s.selectedTerminalId)
  const tool = useSimStore((s) => s.tool)
  const grid = useSimStore((s) => s.grid)
  const zoom = useSimStore((s) => s.zoom)
  const panX = useSimStore((s) => s.panX)
  const panY = useSimStore((s) => s.panY)
  const probeResult = useSimStore((s) => s.probeResult)
  const placingType = useSimStore((s) => s.placingType)
  const setPlacingType = useSimStore((s) => s.setPlacingType)

  const {
    selectComponents,
    selectWire,
    selectTerminal,
    moveComponent,
    commitHistory,
    addWire,
    pressButton,
    toggleTerminal,
    deleteSelection,
    rotateComponent,
    duplicateComponents,
    setZoom,
    setPan,
    runProbe,
    clearProbe,
    connectChain,
    organizeWires,
    updateWire,
    bringSelectionToFront,
    sendSelectionToBack,
    bringSelectionForward,
    sendSelectionBackward,
  } = useSimStore()

  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<{ ids: string[]; startX: number; startY: number; orig: Record<string, { x: number; y: number }> } | null>(null)
  const [wireFrom, setWireFrom] = useState<string | null>(null)
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [panning, setPanning] = useState<{ sx: number; sy: number; px: number; py: number } | null>(null)
  const [hoverTerminal, setHoverTerminal] = useState<string | null>(null)
  /** cadeia de bornes selecionados com shift+clique (ligação inteligente) */
  const [chain, setChain] = useState<string[]>([])
  /** arraste do ponto de dobra/curva/waypoint de um cabo diretamente no esquema */
  const [wireDrag, setWireDrag] = useState<{ wireId: string; mode: 'bend' | 'curve' | 'waypoint'; index?: number } | null>(null)
  const [dropPos, setDropPos] = useState<{ x: number; y: number } | null>(null)
  const [cursorPos, setCursorPos] = useState<Pt | null>(null)
  const [showHints, setShowHints] = useState(() => {
    try {
      const saved = localStorage.getItem('dc-simu:showHints')
      return saved === null ? true : saved === '1'
    } catch {
      return true
    }
  })

  const toggleHints = () => {
    setShowHints((v) => {
      const next = !v
      try {
        localStorage.setItem('dc-simu:showHints', next ? '1' : '0')
      } catch {
        /* localStorage indisponível (modo privado, etc.) — ignora */
      }
      return next
    })
  }

  const terminalIndex = useMemo(() => {
    const map = new Map<string, { c: ElectricalComponent; x: number; y: number; label: string; color: string; energized: boolean }>()
    for (const c of components) {
      for (const t of c.terminals) {
        const p = terminalPos(c, t)
        map.set(t.id, { c, x: p.x, y: p.y, label: `${c.ref}.${t.label}`, color: t.color, energized: t.energized })
      }
    }
    return map
  }, [components])

  useEffect(() => {
    if (tool !== 'wire') setChain([])
  }, [tool])

  const snap = (v: number) => (grid.snap ? Math.round(v / grid.size) * grid.size : v)

  const toCanvas = (clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    return {
      x: (clientX - rect.left) / zoom - panX,
      y: (clientY - rect.top) / zoom - panY,
    }
  }

  // ---------------------------------------------------------------- teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        deleteSelection()
      } else if (e.key.toLowerCase() === 'r' && selectedIds.length === 1) {
        rotateComponent(selectedIds[0])
      } else if (e.key.toLowerCase() === 'd' && selectedIds.length) {
        duplicateComponents(selectedIds)
      } else if (e.key === 'Escape') {
        setWireFrom(null)
        setChain([])
        selectComponents([])
        clearProbe()
        useSimStore.getState().setPlacingType(null)
      } else if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        useSimStore.getState().undo()
      } else if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        useSimStore.getState().redo()
      } else if (e.ctrlKey && e.key === ']') {
        e.preventDefault()
        if (e.shiftKey) bringSelectionToFront()
        else bringSelectionForward()
      } else if (e.ctrlKey && e.key === '[') {
        e.preventDefault()
        if (e.shiftKey) sendSelectionToBack()
        else sendSelectionBackward()
      } else if (e.key === '1') useSimStore.getState().setTool('select')
      else if (e.key === '2') useSimStore.getState().setTool('wire')
      else if (e.key === '3') useSimStore.getState().setTool('probe')
      else if (e.ctrlKey && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        selectComponents(components.map((c) => c.id))
      } else if (e.ctrlKey && e.key.toLowerCase() === 'c') {
        useSimStore.getState().copySelection()
      } else if (e.ctrlKey && e.key.toLowerCase() === 'v') {
        e.preventDefault()
        useSimStore.getState().pasteClipboard()
      } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') && selectedIds.length) {
        // move o(s) componente(s) selecionado(s): 1px, ou o passo da malha com Shift
        e.preventDefault()
        const step = e.shiftKey ? grid.size : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        const ids = new Set(selectedIds)
        commitHistory()
        useSimStore.setState((s) => ({
          components: s.components.map((c) => (ids.has(c.id) ? { ...c, schematicX: c.schematicX + dx, schematicY: c.schematicY + dy } : c)),
          dirty: true,
        }))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    selectedIds,
    deleteSelection,
    rotateComponent,
    duplicateComponents,
    selectComponents,
    clearProbe,
    bringSelectionToFront,
    sendSelectionToBack,
    bringSelectionForward,
    sendSelectionBackward,
    components,
    grid,
    commitHistory,
  ])

  // --------------------------------------------------------------- mouse
  const onBackgroundDown = (e: React.MouseEvent) => {
    // modo "posicionar componente": clique esquerdo posiciona (Shift = vários),
    // clique direito ou Esc cancela
    if (placingType) {
      if (e.button === 2) {
        e.preventDefault()
        setPlacingType(null)
        return
      }
      if (e.button === 0) {
        const p = toCanvas(e.clientX, e.clientY)
        useSimStore.getState().addComponent(placingType, snap(p.x - 40), snap(p.y - 40))
        if (!e.shiftKey) setPlacingType(null)
        return
      }
    }
    if (e.button === 1 || tool === 'pan' || e.altKey) {
      setPanning({ sx: e.clientX, sy: e.clientY, px: panX, py: panY })
      return
    }
    if (e.button === 2 && tool === 'wire' && wireFrom) {
      // botão direito durante o desenho de cabo: cancela o cabo pendente
      // (o mesmo que Escape), sem fechar o menu de contexto do browser.
      e.preventDefault()
      setWireFrom(null)
      setChain([])
      return
    }
    if (tool === 'select') {
      const p = toCanvas(e.clientX, e.clientY)
      setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
      if (!e.shiftKey) selectComponents([])
    }
    if (tool === 'wire' && e.button !== 2) setWireFrom(null)
    if (tool === 'probe') clearProbe()
  }

  const onMouseMove = (e: React.MouseEvent) => {
    if (panning) {
      setPan(panning.px + (e.clientX - panning.sx) / zoom, panning.py + (e.clientY - panning.sy) / zoom)
      return
    }
    const p = toCanvas(e.clientX, e.clientY)
    if (wireDrag) {
      const w = wires.find((x) => x.id === wireDrag.wireId)
      const a = w && terminalIndex.get(w.fromTerminalId)
      const b = w && terminalIndex.get(w.toTerminalId)
      if (w && wireDrag.mode === 'waypoint' && wireDrag.index !== undefined) {
        const next = [...(w.waypoints ?? [])]
        next[wireDrag.index] = { x: snap(p.x), y: snap(p.y) }
        updateWire(w.id, { waypoints: next })
        return
      }
      if (w && a && b) {
        const dx = b.x - a.x
        const dy = b.y - a.y
        const lenSq = dx * dx + dy * dy || 1
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
        if (wireDrag.mode === 'bend') {
          updateWire(w.id, { bend: t })
        } else {
          const len = Math.sqrt(lenSq)
          const nx = -dy / len
          const ny = dx / len
          const px = a.x + dx * t
          const py = a.y + dy * t
          const offset = (p.x - px) * nx + (p.y - py) * ny
          updateWire(w.id, { bend: t, curveOffset: offset })
        }
      }
      return
    }
    if (drag) {
      const dx = p.x - drag.startX
      const dy = p.y - drag.startY
      for (const id of drag.ids) {
        const o = drag.orig[id]
        if (o) moveComponent(id, snap(o.x + dx), snap(o.y + dy))
      }
    }
    if (marquee) setMarquee({ ...marquee, x1: p.x, y1: p.y })
    if ((tool === 'wire' && wireFrom) || placingType) setCursorPos(p)
  }

  const onMouseUp = () => {
    if (wireDrag) commitHistory()
    setWireDrag(null)
    if (drag) commitHistory()
    if (marquee) {
      const x0 = Math.min(marquee.x0, marquee.x1)
      const x1 = Math.max(marquee.x0, marquee.x1)
      const y0 = Math.min(marquee.y0, marquee.y1)
      const y1 = Math.max(marquee.y0, marquee.y1)
      const hit = components.filter((c) => c.schematicX < x1 && c.schematicX + c.w > x0 && c.schematicY < y1 && c.schematicY + c.h > y0)
      if (hit.length) selectComponents(hit.map((c) => c.id))
    }
    setDrag(null)
    setMarquee(null)
    setPanning(null)
  }

  const onCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDropPos(null)
    const compType = e.dataTransfer.getData('text/plain') as ComponentType
    if (!compType) return
    const p = toCanvas(e.clientX, e.clientY)
    selectWire(null)
    selectTerminal(null)
    selectComponents([])
    useSimStore.getState().addComponent(compType, snap(p.x), snap(p.y))
  }

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    if (e.ctrlKey) setZoom(zoom * factor)
    else setPan(panX - e.deltaX / zoom, panY - e.deltaY / zoom)
  }

  const startDrag = (e: React.MouseEvent, c: ElectricalComponent) => {
    if (tool !== 'select') return
    e.stopPropagation()
    const p = toCanvas(e.clientX, e.clientY)
    const ids = selectedIds.includes(c.id) ? selectedIds : [c.id]
    if (!selectedIds.includes(c.id)) selectComponents(ids, e.shiftKey)
    const orig: Record<string, { x: number; y: number }> = {}
    for (const id of ids) {
      const comp = components.find((x) => x.id === id)
      if (comp && !comp.locked) orig[id] = { x: comp.schematicX, y: comp.schematicY }
    }
    if (Object.keys(orig).length) setDrag({ ids: Object.keys(orig), startX: p.x, startY: p.y, orig })
  }

  const isPressable = (c: ElectricalComponent) =>
    ['buttonNO', 'buttonNC', 'emergencyButton', 'selector2', 'selector3', 'keySwitch', 'footSwitch', 'limitSwitch', 'proximitySensor', 'photoSensor', 'pressureSwitch', 'thermostat'].includes(c.type)

  const toggleField = (c: ElectricalComponent, down: boolean) => {
    if (!isPressable(c)) return
    if (c.type === 'proximitySensor' || c.type === 'photoSensor' || c.type === 'pressureSwitch' || c.type === 'thermostat') {
      useSimStore.getState().setComponentState(c.id, { triggered: down })
    } else if (c.state.maintain) {
      useSimStore.getState().setComponentState(c.id, { pressed: !c.state.pressed })
    } else {
      pressButton(c.id, down)
    }
  }

  const onTerminalDown = (e: React.MouseEvent, terminalId: string) => {
    e.stopPropagation()
    if (tool === 'wire') {
      if (e.button === 2) {
        // botão direito num borne: cancela o cabo em curso (equivalente ao Escape)
        e.preventDefault()
        setWireFrom(null)
        setChain([])
        return
      }
      // Shift+clique acumula bornes numa cadeia para ligação inteligente:
      // ao confirmar, todos são interligados em sequência e o roteamento já
      // sai organizado (sem sobreposição).
      if (e.shiftKey) {
        setChain((c) => (c.includes(terminalId) ? c.filter((id) => id !== terminalId) : [...c, terminalId]))
        return
      }
      if (!wireFrom) {
        setWireFrom(terminalId)
      } else if (wireFrom !== terminalId) {
        addWire(wireFrom, terminalId)
        setWireFrom(terminalId)
      }
      return
    }
    if (tool === 'probe') {
      selectTerminal(terminalId)
      runProbe()
      return
    }
    if (tool === 'erase') {
      selectTerminal(terminalId)
      deleteSelection()
      return
    }
    // seleção simples: duplo clique alterna estado de proteção
    selectTerminal(terminalId)
  }

  const pendingFrom = wireFrom ? terminalIndex.get(wireFrom) : null

  // ---------------------------------------------------------- ordem (camadas)
  // Cabos e componentes compartilham o mesmo espaço de empilhamento (campo `z`,
  // padrão 0); em caso de empate mantém a ordem original (cabos, depois
  // componentes) para reproduzir o comportamento clássico quando ninguém
  // nunca mexeu na ordem.
  type DrawEntry = { kind: 'wire'; wire: (typeof wires)[number] } | { kind: 'component'; comp: ElectricalComponent }
  const drawOrder = useMemo(() => {
    const entries: (DrawEntry & { z: number; idx: number })[] = []
    wires.forEach((w, i) => entries.push({ kind: 'wire', wire: w, z: w.z ?? 0, idx: i }))
    components.forEach((c, i) => entries.push({ kind: 'component', comp: c, z: c.z ?? 0, idx: i + wires.length }))
    entries.sort((a, b) => a.z - b.z || a.idx - b.idx)
    return entries
  }, [wires, components])

  const renderWireEl = (w: (typeof wires)[number]) => {
    const a = terminalIndex.get(w.fromTerminalId)
    const b = terminalIndex.get(w.toTerminalId)
    if (!a || !b) return null
    const col = WIRE_COLORS[w.color] ?? '#94a3b8'
    const flexible = w.flexibility === 'flexible'
    const selected = selectedWireId === w.id
    const { d, handle } = wireGeometry(a, b, w.route, w.bend, w.curveOffset ?? 0, w.waypoints, flexible)
    const width = w.gauge.startsWith('0.') ? 1.4 : w.gauge.startsWith('1') ? 1.8 : w.gauge.startsWith('2.5') ? 2.4 : 3
    return (
      <g key={w.id}>
        {selected && <path d={d} fill="none" stroke="#2655e5" strokeWidth={width + 6} opacity={0.2} strokeLinecap="round" />}
        {/* condutor rígido: traço duplo (alma sólida) · flexível: traço único arredondado */}
        {!flexible && (
          <path d={d} fill="none" stroke={col} strokeWidth={width + 2.4} opacity={0.32} strokeLinecap="butt" strokeLinejoin="miter" pointerEvents="none" />
        )}
        <path
          d={d}
          fill="none"
          stroke={col}
          strokeWidth={w.energized ? width + 1 : width}
          opacity={w.energized ? 1 : 0.88}
          strokeLinecap={flexible ? 'round' : 'square'}
          strokeLinejoin={flexible ? 'round' : 'miter'}
          onMouseDown={(e) => {
            e.stopPropagation()
            selectWire(w.id)
          }}
          onDoubleClick={(e) => {
            // duplo clique no cabo = adiciona um ponto de curva arrastável
            e.stopPropagation()
            const point = toCanvas(e.clientX, e.clientY)
            const p = { x: snap(point.x), y: snap(point.y) }
            commitHistory()
            updateWire(w.id, { waypoints: insertWaypoint(a, b, w.waypoints ?? [], p) })
            selectWire(w.id)
          }}
          style={{ cursor: 'pointer' }}
        >
          <title>{`Cabo ${w.number ?? ''} ${w.gauge} · ${flexible ? 'flexível' : 'rígido'} · duplo clique adiciona ponto de curva`}</title>
        </path>
        {w.energized && (
          <path
            d={d}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={width + 4}
            opacity={0.18}
            strokeLinecap="round"
            pointerEvents="none"
          />
        )}
        <circle cx={a.x} cy={a.y} r={2.5} fill={col} />
        <circle cx={b.x} cy={b.y} r={2.5} fill={col} />
        {/* pontos de curva do cabo — visíveis quando selecionado */}
        {selected &&
          (w.waypoints ?? []).map((wp, i) => (
            <circle
              key={`${w.id}-wp-${i}`}
              cx={wp.x}
              cy={wp.y}
              r={5.5}
              fill="#ffffff"
              stroke={col}
              strokeWidth={2.5}
              style={{ cursor: 'grab' }}
              onMouseDown={(e) => {
                e.stopPropagation()
                setWireDrag({ wireId: w.id, mode: 'waypoint', index: i })
              }}
              onDoubleClick={(e) => {
                // duplo clique no ponto = remove
                e.stopPropagation()
                commitHistory()
                const next = (w.waypoints ?? []).filter((_, j) => j !== i)
                updateWire(w.id, { waypoints: next.length ? next : undefined })
              }}
            >
              <title>Arraste para mover · duplo clique remove o ponto</title>
            </circle>
          ))}
        {selected && handle && (
          <circle
            cx={handle.x}
            cy={handle.y}
            r={6}
            fill="#ffffff"
            stroke="#2655e5"
            strokeWidth={2}
            style={{ cursor: handle.mode === 'curve' ? 'grab' : 'ew-resize' }}
            onMouseDown={(e) => {
              e.stopPropagation()
              setWireDrag({ wireId: w.id, mode: handle.mode })
            }}
          >
            <title>Arraste para {handle.mode === 'curve' ? 'curvar' : 'dobrar'} o cabo</title>
          </circle>
        )}
      </g>
    )
  }

  const renderComponentEl = (c: ElectricalComponent) => {
    const selected = selectedIds.includes(c.id)
    return (
      <g
        key={c.id}
        transform={`translate(${c.schematicX},${c.schematicY}) rotate(${c.rotation},${c.w / 2},${c.h / 2}) ${c.mirrored ? `translate(${c.w},0) scale(-1,1)` : ''}`}
        onMouseDown={(e) => startDrag(e, c)}
        onDoubleClick={(e) => {
          e.stopPropagation()
          toggleField(c, true)
        }}
        style={{ cursor: c.locked ? 'not-allowed' : tool === 'select' ? 'move' : 'inherit', opacity: c.locked ? 0.85 : 1 }}
      >
        {selected && <rect x={-6} y={-6} width={c.w + 12} height={c.h + 12} rx={6} fill="none" stroke="#2655e5" strokeWidth={1.5} strokeDasharray="5 3" />}
        <SymbolGlyph c={c} selected={selected} />
        {c.locked && <text x={c.w - 12} y={12} fontSize={10} fill="#b45309">🔒</text>}
      </g>
    )
  }

  return (
    <div className="w-full h-full relative overflow-hidden bg-[#f8fafd]">
      <svg
        ref={svgRef}
        className="w-full h-full"
        style={{ cursor: tool === 'select' ? 'default' : tool === 'wire' ? 'crosshair' : tool === 'pan' ? 'grab' : 'pointer' }}
         onMouseDown={onBackgroundDown}
         onMouseMove={onMouseMove}
         onMouseUp={onMouseUp}
         onMouseLeave={onMouseUp}
         onWheel={onWheel}
         onContextMenu={(e) => e.preventDefault()}
         onDragOver={(e) => {
           e.preventDefault()
           e.dataTransfer.dropEffect = 'copy'
           const p = toCanvas(e.clientX, e.clientY)
           setDropPos({ x: snap(p.x), y: snap(p.y) })
         }}
         onDragLeave={() => setDropPos(null)}
         onDrop={onCanvasDrop}
       >
        <defs>
          <pattern id="dc-grid-dots" width={grid.size} height={grid.size} patternUnits="userSpaceOnUse">
            <circle cx={1} cy={1} r={1} fill="#ccd5e3" />
          </pattern>
          <pattern id="dc-grid-lines" width={grid.size} height={grid.size} patternUnits="userSpaceOnUse">
            <path d={`M ${grid.size} 0 L 0 0 0 ${grid.size}`} fill="none" stroke="#e4eaf2" strokeWidth={1} />
          </pattern>
        </defs>

        <rect width="100%" height="100%" fill={grid.background} />
        <g transform={`translate(${panX},${panY}) scale(${zoom})`}>
          {grid.enabled && <rect x={-CANVAS_W} y={-CANVAS_H} width={CANVAS_W * 3} height={CANVAS_H * 3} fill={grid.style === 'dots' ? 'url(#dc-grid-dots)' : 'url(#dc-grid-lines)'} />}

          {/* -------------------------------------------------- cabos + componentes, na ordem de empilhamento (z) */}
          {drawOrder.map((entry) => (entry.kind === 'wire' ? renderWireEl(entry.wire) : renderComponentEl(entry.comp)))}

          {/* cabo em construção */}
          {pendingFrom && hoverTerminal && terminalIndex.get(hoverTerminal) && (
            <line
              x1={pendingFrom.x}
              y1={pendingFrom.y}
              x2={terminalIndex.get(hoverTerminal)!.x}
              y2={terminalIndex.get(hoverTerminal)!.y}
              stroke={hoverTerminal !== wireFrom ? '#16a34a' : '#2655e5'}
              strokeWidth={2}
              strokeDasharray="4 3"
            />
          )}
          {pendingFrom && !hoverTerminal && cursorPos && (
            <line
              x1={pendingFrom.x}
              y1={pendingFrom.y}
              x2={cursorPos.x}
              y2={cursorPos.y}
              stroke="#94a8c9"
              strokeWidth={1.5}
              strokeDasharray="3 3"
              style={{ pointerEvents: 'none' }}
            />
          )}

          {/* alvos clicáveis dos bornes (acima de tudo) */}
          {components.map((c) =>
            c.terminals.map((t) => {
              const p = terminalPos(c, t)
              const isFrom = wireFrom === t.id
              const isSel = selectedTerminalId === t.id
              const chainIdx = chain.indexOf(t.id)
              const isDrawTarget = tool === 'wire' && !!wireFrom && wireFrom !== t.id && hoverTerminal === t.id
              return (
                <g key={`${t.id}-hit`}>
                  {isDrawTarget && <circle cx={p.x} cy={p.y} r={9} fill="#dcfce7" stroke="#16a34a" strokeWidth={1.5} style={{ pointerEvents: 'none' }} />}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={7}
                    fill="transparent"
                    stroke={chainIdx >= 0 ? '#65a30d' : isFrom ? '#2655e5' : isDrawTarget ? '#16a34a' : isSel ? '#db2777' : 'transparent'}
                    strokeWidth={2}
                    style={{ cursor: tool === 'select' ? 'pointer' : 'crosshair' }}
                    onMouseDown={(e) => onTerminalDown(e, t.id)}
                    onContextMenu={(e) => e.preventDefault()}
                    onMouseEnter={() => setHoverTerminal(t.id)}
                    onMouseLeave={() => setHoverTerminal(null)}
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      toggleTerminal(t.id)
                    }}
                  >
                    <title>{`${c.ref}.${t.label} — ${t.energized ? 'ENERGIZADO' : 'sem tensão'}`}</title>
                  </circle>
                  {chainIdx >= 0 && (
                    <text x={p.x + 9} y={p.y - 9} fontSize={10} fontWeight="bold" fill="#65a30d" style={{ pointerEvents: 'none' }}>
                      {chainIdx + 1}
                    </text>
                  )}
                </g>
              )
            }),
          )}

          {/* marquee */}
          {marquee && (
            <rect
              x={Math.min(marquee.x0, marquee.x1)}
              y={Math.min(marquee.y0, marquee.y1)}
              width={Math.abs(marquee.x1 - marquee.x0)}
              height={Math.abs(marquee.y1 - marquee.y0)}
              fill="#2655e5"
              opacity={0.08}
           stroke="#2655e5"
               strokeWidth={1.5}
             />
           )}

           {/* indicador de largagem (arrastado da paleta) */}
           {dropPos && (
             <g>
               <rect x={dropPos.x - 12} y={dropPos.y - 12} width={24} height={24} fill="#2655e5" opacity={0.1} stroke="#2655e5" strokeWidth={1} strokeDasharray="4 2" rx={3} />
               <circle cx={dropPos.x} cy={dropPos.y} r={3} fill="#2655e5" />
             </g>
           )}

           {/* fantasma do componente em modo de posicionamento */}
           {placingType && cursorPos && (
             <g style={{ pointerEvents: 'none' }} opacity={0.75}>
               <rect
                 x={snap(cursorPos.x - 40)}
                 y={snap(cursorPos.y - 40)}
                 width={80}
                 height={80}
                 rx={6}
                 fill="#2655e5"
                 opacity={0.08}
                 stroke="#2655e5"
                 strokeWidth={1.5}
                 strokeDasharray="6 3"
               />
               <line x1={snap(cursorPos.x) - 10} y1={snap(cursorPos.y)} x2={snap(cursorPos.x) + 10} y2={snap(cursorPos.y)} stroke="#2655e5" strokeWidth={1} />
               <line x1={snap(cursorPos.x)} y1={snap(cursorPos.y) - 10} x2={snap(cursorPos.x)} y2={snap(cursorPos.y) + 10} stroke="#2655e5" strokeWidth={1} />
               <text x={snap(cursorPos.x - 40)} y={snap(cursorPos.y - 40) - 6} fontSize={11} fontWeight={600} fill="#2655e5">
                 {placingType}
               </text>
             </g>
           )}
         </g>
      </svg>

      {/* banner do modo de posicionamento */}
      {placingType && (
        <div className="absolute left-1/2 -translate-x-1/2 top-2 flex items-center gap-2 text-[11px] rounded-md border border-brand-300 bg-white px-3 py-1.5 text-ink-900 shadow-md z-10">
          <span className="text-brand-700 font-semibold">Posicionar componente:</span>
          <span className="font-mono">{placingType}</span>
          <span className="text-ink-400">clique para largar · Shift+clique = vários · Esc cancela</span>
          <button className="px-2 py-0.5 rounded bg-white border border-line text-ink-700 hover:bg-slate-50" onClick={() => setPlacingType(null)}>
            Cancelar
          </button>
        </div>
      )}

      {components.length === 0 && wires.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[520px] max-w-[calc(100%-32px)] rounded-md border border-line bg-white/95 p-4 text-center shadow-md backdrop-blur-sm pointer-events-auto">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-md border border-brand-200 bg-brand-50 text-brand-700">
              DC
            </div>
            <h2 className="text-sm font-bold text-ink-900">Comece por um circuito real</h2>
            <p className="mx-auto mt-1 max-w-[390px] text-xs leading-relaxed text-ink-500">
              Carregue um cenário industrial pronto ou solte os primeiros dispositivos no esquema.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-1.5 text-left">
              {SCENARIOS.map((scenario) => (
                <button
                  key={scenario.id}
                  className="dc-btn !h-auto !justify-start !px-2 !py-2 text-left"
                  onClick={() => useSimStore.getState().loadScenario(scenario.id)}
                >
                  <span className="truncate">{scenario.name}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {(
                [
                  ['plcLogo', 'CLP'],
                  ['buttonNO', 'Botão NA'],
                  ['contactor', 'Contator'],
                  ['motor3ph', 'Motor 3~'],
                ] as Array<[ComponentType, string]>
              ).map(([type, text], index) => (
                <button
                  key={type}
                  className="dc-btn-primary dc-btn"
                  onClick={() => useSimStore.getState().addComponent(type, 220 + index * 150, 220)}
                >
                  + {text}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* legenda / estado */}
      <div className="absolute left-2 top-2 flex flex-col gap-1 text-[11px] text-ink-500 pointer-events-none">
        <div className="px-2 py-1 rounded-md bg-white/92 border border-line shadow-xs backdrop-blur-sm">
          Ferramenta: <span className="text-brand-600 font-semibold">{tool === 'select' ? 'Selecionar/Arrastar' : tool === 'wire' ? 'Desenhar cabo' : tool === 'probe' ? 'Sonda (continuidade)' : tool === 'erase' ? 'Apagar' : 'Panorâmica'}</span>
        </div>
        <div className="px-2 py-1 rounded-md bg-white/92 border border-line shadow-xs">
          Malha {grid.enabled ? `${grid.size}px ${grid.snap ? '(ímã)' : ''}` : 'desligada'} · Zoom {(zoom * 100).toFixed(0)}%
        </div>
        <div className="px-2 py-1 rounded-md bg-white/92 border border-line shadow-xs">
          {components.length} componentes · {wires.length} cabos
        </div>
      </div>

      {/* ligação inteligente: cadeia de bornes acumulada por shift+clique */}
      {tool === 'wire' && chain.length > 0 && (
        <div className="absolute left-1/2 -translate-x-1/2 top-2 flex items-center gap-2 text-[11px] rounded-md border border-lime-500 bg-white px-3 py-1.5 text-ink-900 shadow-md">
          <span className="text-lime-700 font-semibold">Ligação inteligente:</span>
          <span>{chain.length} borne(s) selecionado(s)</span>
          <button
            className="px-2 py-0.5 rounded bg-lime-600 hover:bg-lime-700 text-white disabled:opacity-40"
            disabled={chain.length < 2}
            onClick={() => {
              connectChain(chain)
              setChain([])
            }}
          >
            Conectar em cadeia
          </button>
          <button className="px-2 py-0.5 rounded bg-white border border-line text-ink-700 hover:bg-slate-50" onClick={() => setChain([])}>
            Limpar
          </button>
        </div>
      )}

      {probeResult && (
        <div className="absolute right-3 bottom-3 w-72 text-[11px] rounded-md border border-brand-300 bg-white shadow-md p-3 text-ink-900">
          <div className="font-semibold text-brand-700 mb-1 flex items-center gap-1.5"><IconProbe size={12} /> Medição da sonda</div>
          {probeResult.b ? (
            <>
              <div className="font-mono">{terminalIndex.get(probeResult.a!)?.label ?? probeResult.a} ↔ {terminalIndex.get(probeResult.b!)?.label ?? probeResult.b}</div>
              <div>{probeResult.connected ? 'CONTINUIDADE: sim' : 'CONTINUIDADE: não (circuito aberto)'}</div>
              <div>{probeResult.resistanceOhm !== null ? `R ≈ ${probeResult.resistanceOhm} Ω` : 'R = ∞'}</div>
              <div>{probeResult.voltage}</div>
              <div className="text-neutral-400 mt-1">{probeResult.note}</div>
            </>
          ) : (
            <div className="text-neutral-400">{probeResult.note}</div>
          )}
          <button onClick={clearProbe} className="mt-2 px-2 py-0.5 rounded border border-line bg-white hover:bg-slate-50 text-ink-700">limpar</button>
        </div>
      )}

      <div className="absolute left-2 bottom-2 flex flex-col items-start gap-1.5 z-10">
        {showHints && (
          <div className="text-[10px] text-ink-400 text-left leading-relaxed rounded-md bg-white/95 border border-line shadow-xs px-2 py-1.5 max-w-[260px]">
            <div>arraste = mover · shift+clique = multi-seleção</div>
            <div>biblioteca: clique = posicionar com o mouse · arrastar = largar direto</div>
            <div>clique no cabo = editar · duplo clique no cabo = adicionar ponto de curva</div>
            <div>duplo clique num ponto de curva = remover · duplo no borne = alternar</div>
            <div>ferramenta Cabo: shift+clique nos bornes = ligação inteligente em cadeia</div>
            <div>ferramenta Cabo: botão direito ou Esc = cancelar cabo em curso</div>
            <div>cabo selecionado: arraste o ponto ciano = dobrar/curvar</div>
            <div>Ctrl+] avança · Ctrl+[ recua · Ctrl+Shift+]/[ frente/trás</div>
            <div>R gira · D duplica · Del apaga · Ctrl+Z desfaz</div>
          </div>
        )}
        <button
          onClick={toggleHints}
          className="w-6 h-6 flex items-center justify-center rounded-full border border-line bg-white/95 shadow-xs text-ink-500 hover:text-brand-600 hover:border-brand-300 transition-colors"
          title={showHints ? 'Esconder dicas' : 'Mostrar dicas'}
        >
          <IconHelp size={13} />
        </button>
      </div>
    </div>
  )
}
