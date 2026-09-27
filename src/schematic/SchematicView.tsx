import { useEffect, useMemo, useRef, useState } from 'react'
import { useSimStore } from '../store/useSimStore'
import { SymbolGlyph, WIRE_COLORS, terminalPos } from './symbols'
import { IconProbe } from '../ui/icons'
import { SCENARIOS } from '../simulation/scenarios'
import type { ElectricalComponent, ComponentType } from '../types'

const CANVAS_W = 2000
const CANVAS_H = 1400

type Pt = { x: number; y: number }

/**
 * Calcula o caminho SVG de um cabo conforme seu roteamento e devolve também a
 * posição do "manípulo" arrastável (ponto de dobra para ortogonal/manhattan,
 * ponto de controle da curva de Bézier para o roteamento curvo).
 */
function wireGeometry(a: Pt, b: Pt, route: string, bend: number, curveOffset: number) {
  if (route === 'direct') {
    return { d: `M ${a.x},${a.y} L ${b.x},${b.y}`, handle: null as (Pt & { mode: 'bend' | 'curve' }) | null }
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
  if (route === 'orthogonal') {
    return { d: `M ${a.x},${a.y} L ${mx},${a.y} L ${mx},${b.y} L ${b.x},${b.y}`, handle: { x: mx, y: (a.y + b.y) / 2, mode: 'bend' as const } }
  }
  // manhattan
  return { d: `M ${a.x},${a.y} L ${a.x},${my} L ${b.x},${my} L ${b.x},${b.y}`, handle: { x: (a.x + b.x) / 2, y: my, mode: 'bend' as const } }
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
  /** arraste do ponto de dobra/curva de um cabo diretamente no esquema */
  const [wireDrag, setWireDrag] = useState<{ wireId: string; mode: 'bend' | 'curve' } | null>(null)
  const [dropPos, setDropPos] = useState<{ x: number; y: number } | null>(null)

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
    if (e.button === 1 || tool === 'pan' || e.altKey) {
      setPanning({ sx: e.clientX, sy: e.clientY, px: panX, py: panY })
      return
    }
    if (tool === 'select') {
      const p = toCanvas(e.clientX, e.clientY)
      setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
      if (!e.shiftKey) selectComponents([])
    }
    if (tool === 'wire') setWireFrom(null)
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
    const base = WIRE_COLORS[w.color] ?? '#94a3b8'
    const col = base
    const selected = selectedWireId === w.id
    const { d, handle } = wireGeometry(a, b, w.route, w.bend, w.curveOffset ?? 0)
    const width = w.gauge.startsWith('0.') ? 1.2 : w.gauge.startsWith('1') ? 1.6 : w.gauge.startsWith('2.5') ? 2.2 : 2.8
    return (
      <g key={w.id}>
        {selected && <path d={d} fill="none" stroke="#2655e5" strokeWidth={width + 5} opacity={0.22} strokeLinecap="round" />}
        <path
          d={d}
          fill="none"
          stroke={col}
          strokeWidth={w.energized ? width + 1 : width}
          strokeDasharray={w.flexibility === 'flexible' ? undefined : '6 3'}
          opacity={w.energized ? 1 : 0.82}
          strokeLinecap="round"
          onMouseDown={(e) => {
            e.stopPropagation()
            selectWire(w.id)
          }}
          onDoubleClick={(e) => {
            e.stopPropagation()
            const point = toCanvas(e.clientX, e.clientY)
            const dx = b.x - a.x
            const dy = b.y - a.y
            const lenSq = dx * dx + dy * dy || 1
            const t = Math.max(0.08, Math.min(0.92, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq))
            const len = Math.sqrt(lenSq)
            const nx = -dy / len
            const ny = dx / len
            const px = a.x + dx * t
            const py = a.y + dy * t
            const offset = (point.x - px) * nx + (point.y - py) * ny
            commitHistory()
            updateWire(w.id, { route: 'arc', bend: t, curveOffset: Math.round(offset) })
            selectWire(w.id)
          }}
          style={{ cursor: 'pointer' }}
        />
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
              stroke="#2655e5"
              strokeWidth={2}
              strokeDasharray="4 3"
            />
          )}

          {/* alvos clicáveis dos bornes (acima de tudo) */}
          {components.map((c) =>
            c.terminals.map((t) => {
              const p = terminalPos(c, t)
              const isFrom = wireFrom === t.id
              const isSel = selectedTerminalId === t.id
              const chainIdx = chain.indexOf(t.id)
              return (
                <g key={`${t.id}-hit`}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={7}
                    fill="transparent"
                    stroke={chainIdx >= 0 ? '#65a30d' : isFrom ? '#2655e5' : isSel ? '#db2777' : 'transparent'}
                    strokeWidth={2}
                    style={{ cursor: tool === 'select' ? 'pointer' : 'crosshair' }}
                    onMouseDown={(e) => onTerminalDown(e, t.id)}
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
         </g>
      </svg>

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

      <div className="absolute right-3 top-2 text-[10px] text-ink-400 text-right leading-relaxed rounded-md bg-white/92 border border-line shadow-xs px-2 py-1.5">
        <div>arraste = mover · shift+clique = multi-seleção</div>
        <div>clique no cabo = editar · duplo no borne = alternar</div>
        <div>ferramenta Cabo: shift+clique nos bornes = ligação inteligente em cadeia</div>
        <div>cabo selecionado: arraste o ponto ciano = dobrar/curvar</div>
        <div>Ctrl+] avança · Ctrl+[ recua · Ctrl+Shift+]/[ frente/trás</div>
        <div>R gira · D duplica · Del apaga · Ctrl+Z desfaz</div>
      </div>
    </div>
  )
}
