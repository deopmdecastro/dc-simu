import { useEffect, useMemo, useRef, useState } from 'react'
import { useSimStore } from '../store/useSimStore'
import { SymbolGlyph, WIRE_COLORS, terminalPos } from './symbols'
import type { ElectricalComponent } from '../types'

const CANVAS_W = 2000
const CANVAS_H = 1400

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
  } = useSimStore()

  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<{ ids: string[]; startX: number; startY: number; orig: Record<string, { x: number; y: number }> } | null>(null)
  const [wireFrom, setWireFrom] = useState<string | null>(null)
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [panning, setPanning] = useState<{ sx: number; sy: number; px: number; py: number } | null>(null)
  const [hoverTerminal, setHoverTerminal] = useState<string | null>(null)

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
        selectComponents([])
        clearProbe()
      } else if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        useSimStore.getState().undo()
      } else if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        useSimStore.getState().redo()
      } else if (e.key === '1') useSimStore.getState().setTool('select')
      else if (e.key === '2') useSimStore.getState().setTool('wire')
      else if (e.key === '3') useSimStore.getState().setTool('probe')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedIds, deleteSelection, rotateComponent, duplicateComponents, selectComponents, clearProbe])

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

  return (
    <div className="w-full h-full relative overflow-hidden bg-neutral-950">
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
      >
        <defs>
          <pattern id="dc-grid-dots" width={grid.size} height={grid.size} patternUnits="userSpaceOnUse">
            <circle cx={1} cy={1} r={1} fill="#243044" />
          </pattern>
          <pattern id="dc-grid-lines" width={grid.size} height={grid.size} patternUnits="userSpaceOnUse">
            <path d={`M ${grid.size} 0 L 0 0 0 ${grid.size}`} fill="none" stroke="#1b2432" strokeWidth={1} />
          </pattern>
        </defs>

        <rect width="100%" height="100%" fill={grid.background} />
        <g transform={`translate(${panX},${panY}) scale(${zoom})`}>
          {grid.enabled && <rect x={-CANVAS_W} y={-CANVAS_H} width={CANVAS_W * 3} height={CANVAS_H * 3} fill={grid.style === 'dots' ? 'url(#dc-grid-dots)' : 'url(#dc-grid-lines)'} />}

          {/* -------------------------------------------------- cabos */}
          {wires.map((w) => {
            const a = terminalIndex.get(w.fromTerminalId)
            const b = terminalIndex.get(w.toTerminalId)
            if (!a || !b) return null
            const base = WIRE_COLORS[w.color] ?? '#94a3b8'
            const col = w.energized ? '#facc15' : base
            const selected = selectedWireId === w.id
            const t = w.bend
            let pts: string
            if (w.route === 'direct') pts = `${a.x},${a.y} ${b.x},${b.y}`
            else if (w.route === 'arc') {
              const mx = (a.x + b.x) / 2
              const my = (a.y + b.y) / 2 - Math.abs(b.x - a.x) * 0.2
              pts = `${a.x},${a.y} ${mx},${my} ${b.x},${b.y}`
            } else {
              const mx = a.x + (b.x - a.x) * t
              const my = a.y + (b.y - a.y) * t
              if (w.route === 'orthogonal') pts = `${a.x},${a.y} ${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`
              else pts = `${a.x},${a.y} ${a.x},${my} ${b.x},${my} ${b.x},${b.y}`
            }
            const width = w.gauge.startsWith('0.') ? 1.2 : w.gauge.startsWith('1') ? 1.6 : w.gauge.startsWith('2.5') ? 2.2 : 2.8
            return (
              <g key={w.id}>
                {selected && <polyline points={pts} fill="none" stroke="#22d3ee" strokeWidth={width + 5} opacity={0.35} strokeLinecap="round" />}
                <polyline
                  points={pts}
                  fill="none"
                  stroke={col}
                  strokeWidth={w.energized ? width + 1 : width}
                  strokeDasharray={w.flexibility === 'flexible' ? undefined : '6 3'}
                  opacity={w.energized ? 1 : 0.72}
                  strokeLinecap="round"
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    selectWire(w.id)
                  }}
                  style={{ cursor: 'pointer' }}
                />
                <circle cx={a.x} cy={a.y} r={2.5} fill={col} />
                <circle cx={b.x} cy={b.y} r={2.5} fill={col} />
              </g>
            )
          })}

          {/* cabo em construção */}
          {pendingFrom && hoverTerminal && terminalIndex.get(hoverTerminal) && (
            <line
              x1={pendingFrom.x}
              y1={pendingFrom.y}
              x2={terminalIndex.get(hoverTerminal)!.x}
              y2={terminalIndex.get(hoverTerminal)!.y}
              stroke="#22d3ee"
              strokeWidth={2}
              strokeDasharray="4 3"
            />
          )}

          {/* -------------------------------------------------- componentes */}
          {components.map((c) => {
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
                {selected && <rect x={-6} y={-6} width={c.w + 12} height={c.h + 12} rx={6} fill="none" stroke="#22d3ee" strokeWidth={1.5} strokeDasharray="5 3" />}
                <SymbolGlyph c={c} selected={selected} />
                {c.locked && <text x={c.w - 12} y={12} fontSize={10} fill="#facc15">🔒</text>}
              </g>
            )
          })}

          {/* alvos clicáveis dos bornes (acima de tudo) */}
          {components.map((c) =>
            c.terminals.map((t) => {
              const p = terminalPos(c, t)
              const isFrom = wireFrom === t.id
              const isSel = selectedTerminalId === t.id
              return (
                <circle
                  key={`${t.id}-hit`}
                  cx={p.x}
                  cy={p.y}
                  r={7}
                  fill="transparent"
                  stroke={isFrom ? '#22d3ee' : isSel ? '#f472b6' : 'transparent'}
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
              fill="#22d3ee"
              opacity={0.12}
              stroke="#22d3ee"
            />
          )}
        </g>
      </svg>

      {/* legenda / estado */}
      <div className="absolute left-2 top-2 flex flex-col gap-1 text-[11px] text-neutral-400 pointer-events-none">
        <div className="px-2 py-1 rounded bg-neutral-900/80 border border-neutral-800">
          Ferramenta: <span className="text-cyan-300">{tool === 'select' ? 'Selecionar/Arrastar' : tool === 'wire' ? 'Desenhar cabo' : tool === 'probe' ? 'Sonda (continuidade)' : tool === 'erase' ? 'Apagar' : 'Panorâmica'}</span>
        </div>
        <div className="px-2 py-1 rounded bg-neutral-900/80 border border-neutral-800">
          Malha {grid.enabled ? `${grid.size}px ${grid.snap ? '(imã)' : ''}` : 'desligada'} · Zoom {(zoom * 100).toFixed(0)}%
        </div>
        <div className="px-2 py-1 rounded bg-neutral-900/80 border border-neutral-800">
          {components.length} componentes · {wires.length} cabos
        </div>
      </div>

      {probeResult && (
        <div className="absolute right-3 bottom-3 w-72 text-[11px] rounded-lg border border-cyan-700 bg-neutral-900/95 p-3 text-neutral-200">
          <div className="font-semibold text-cyan-300 mb-1">Medição da sonda</div>
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
          <button onClick={clearProbe} className="mt-2 px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700">limpar</button>
        </div>
      )}

      <div className="absolute right-3 top-2 text-[10px] text-neutral-500 text-right leading-relaxed">
        <div>arraste = mover · shift+clique = multi-seleção</div>
        <div>clique no cabo = editar · duplo no borne = alternar</div>
        <div>R gira · D duplica · Del apaga · Ctrl+Z desfaz</div>
      </div>
    </div>
  )
}
