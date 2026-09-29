import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useSimStore } from '../store/useSimStore'
import {
  COMPONENT_VIEW_PRESETS,
  componentTerminalViewKey,
  normalizeComponentOrientation,
  type ComponentViewPreset,
} from '../three/componentOrientation'
import { hasComponent3DModel } from '../three/modelPaths'
import { componentTerminalLocal } from '../schematic/componentTerminalViews'
import { IconCube, IconRotate, IconSave } from '../ui/icons'
import type { ComponentViewOrientation, ElectricalComponent } from '../types'

const PRESETS: Array<{ id: ComponentViewPreset; label: string }> = [
  { id: 'isometric', label: 'Isométrica' },
  { id: 'front', label: 'Frente' },
  { id: 'back', label: 'Trás' },
  { id: 'left', label: 'Esquerda' },
  { id: 'right', label: 'Direita' },
  { id: 'top', label: 'Superior' },
  { id: 'bottom', label: 'Inferior' },
]

const VIEW_CUBE_CORNERS: Array<{ position: string; label: string; orientation: ComponentViewOrientation }> = [
  { position: 'nw', label: 'Canto isométrico superior esquerdo', orientation: { x: -35.264, y: -45, z: 0 } },
  { position: 'ne', label: 'Canto isométrico superior direito', orientation: COMPONENT_VIEW_PRESETS.isometric },
  { position: 'sw', label: 'Canto isométrico inferior esquerdo', orientation: { x: 35.264, y: -45, z: 0 } },
  { position: 'se', label: 'Canto isométrico inferior direito', orientation: { x: 35.264, y: 45, z: 0 } },
]

function OrientationCube({ value, onChange }: { value: ComponentViewOrientation; onChange: (value: ComponentViewOrientation) => void }) {
  const drag = useRef<{ pointerId: number; x: number; y: number; orientation: ComponentViewOrientation } | null>(null)
  const finish = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    drag.current = null
  }
  const preset = (id: ComponentViewPreset) => onChange({ ...COMPONENT_VIEW_PRESETS[id] })
  return (
    <div className="component-view-cube-wrap">
      <div
        className="component-view-cube-stage"
        title="Arraste para rodar livremente · Shift+arraste roda o eixo Z"
        onPointerDown={(event) => {
          drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, orientation: { ...value } }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          const current = drag.current
          if (!current || current.pointerId !== event.pointerId) return
          const dx = event.clientX - current.x
          const dy = event.clientY - current.y
          onChange(normalizeComponentOrientation(event.shiftKey
            ? { ...current.orientation, z: current.orientation.z + dx * 0.65 }
            : { ...current.orientation, x: current.orientation.x - dy * 0.65, y: current.orientation.y + dx * 0.65 }))
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
      >
        <div className="component-view-cube" style={{ transform: `rotateX(${-value.x}deg) rotateY(${value.y}deg) rotateZ(${value.z}deg)` }}>
          <button className="face front" onClick={(event) => { event.stopPropagation(); preset('front') }} title="Frente">F</button>
          <button className="face back" onClick={(event) => { event.stopPropagation(); preset('back') }} title="Trás">T</button>
          <button className="face right" onClick={(event) => { event.stopPropagation(); preset('right') }} title="Direita">D</button>
          <button className="face left" onClick={(event) => { event.stopPropagation(); preset('left') }} title="Esquerda">E</button>
          <button className="face top" onClick={(event) => { event.stopPropagation(); preset('top') }} title="Superior">S</button>
          <button className="face bottom" onClick={(event) => { event.stopPropagation(); preset('bottom') }} title="Inferior">I</button>
        </div>
        {VIEW_CUBE_CORNERS.map((corner) => <button
          type="button"
          key={corner.position}
          className={`component-view-cube-corner ${corner.position}`}
          aria-label={corner.label}
          title={corner.label}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => { event.stopPropagation(); onChange({ ...corner.orientation }) }}
        />)}
      </div>
      <button className="component-view-iso" onClick={() => preset('isometric')} title="Vista isométrica">ISO</button>
      <span>Arraste o cubo · Shift = eixo Z</span>
    </div>
  )
}

function AngleField({ axis, value, onChange }: { axis: 'X' | 'Y' | 'Z'; value: number; onChange: (value: number) => void }) {
  return <label className="component-view-angle"><span>{axis}</span><input type="number" min={-180} max={180} step={1} value={Math.round(value * 10) / 10} onChange={(event) => onChange(Number(event.target.value) || 0)} /><small>°</small></label>
}

const MAP_MIN = -0.18
const MAP_SPAN = 1.36
const toMapPercent = (value: number) => ((value - MAP_MIN) / MAP_SPAN) * 100
const fromMapFraction = (value: number) => MAP_MIN + value * MAP_SPAN

function TerminalPlacementEditor({ component, draft }: { component: ElectricalComponent; draft: ComponentViewOrientation }) {
  const editor = useSimStore((state) => state.viewOrientationEditor)!
  const setPosition = useSimStore((state) => state.setViewTerminalPosition)
  const autoPlace = useSimStore((state) => state.autoPlaceViewTerminals)
  const mapRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; terminalId: string } | null>(null)
  const [selectedTerminalId, setSelectedTerminalId] = useState(component.terminals[0]?.id ?? '')
  const viewKey = componentTerminalViewKey(draft)
  const viewLabel = PRESETS.find((preset) => preset.id === viewKey)?.label ?? 'Personalizada'
  const preview = useMemo(() => ({
    ...component,
    viewOrientation: draft,
    terminalViewPositions: editor.terminalViewPositions,
  }), [component, draft, editor.terminalViewPositions])
  const positions = useMemo(() => Object.fromEntries(preview.terminals.map((terminal) => {
    const point = componentTerminalLocal(preview, terminal)
    return [terminal.id, { x: point.x / preview.w, y: point.y / preview.h }]
  })), [preview])
  const selectedTerminal = component.terminals.find((terminal) => terminal.id === selectedTerminalId) ?? component.terminals[0]
  const selectedPosition = selectedTerminal ? positions[selectedTerminal.id] : undefined
  const manualCount = Object.keys(editor.terminalViewPositions[viewKey] ?? {}).length

  useEffect(() => {
    if (!component.terminals.some((terminal) => terminal.id === selectedTerminalId)) setSelectedTerminalId(component.terminals[0]?.id ?? '')
  }, [component.id, component.terminals, selectedTerminalId])

  const moveFromPointer = (event: ReactPointerEvent<HTMLElement>, terminalId: string) => {
    const rect = mapRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = fromMapFraction(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)))
    const y = fromMapFraction(Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)))
    setPosition(terminalId, { x, y })
  }

  return <div className="component-terminal-editor">
    <div className="component-terminal-editor-title">
      <span><strong>Posicionar bornes</strong><small>Vista: {viewLabel}</small></span>
      <button type="button" onClick={autoPlace} title="Projetar automaticamente os bornes nesta vista"><IconRotate size={11} />Rastrear automaticamente</button>
    </div>
    <div className="component-terminal-view-buttons" aria-label="Escolher vista para posicionar bornes">
      {PRESETS.map((preset) => <button
        type="button"
        key={`terminal-${preset.id}`}
        className={componentTerminalViewKey(draft) === componentTerminalViewKey(COMPONENT_VIEW_PRESETS[preset.id]) ? 'active' : ''}
        onClick={() => useSimStore.getState().setViewOrientationDraft({ ...COMPONENT_VIEW_PRESETS[preset.id] })}
      >{preset.label}</button>)}
    </div>
    <div
      ref={mapRef}
      className="component-terminal-map"
      aria-label="Mapa de bornes arrastáveis"
      onPointerMove={(event) => {
        const drag = dragRef.current
        if (drag?.pointerId === event.pointerId) moveFromPointer(event, drag.terminalId)
      }}
      onPointerUp={(event) => {
        if (dragRef.current?.pointerId !== event.pointerId) return
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        dragRef.current = null
      }}
      onPointerCancel={() => { dragRef.current = null }}
    >
      <div className="component-terminal-map-body"><span>modelo 3D · {component.ref}</span></div>
      {component.terminals.map((terminal) => {
        const position = positions[terminal.id]
        if (!position) return null
        const selected = terminal.id === selectedTerminal?.id
        const viewPositions = editor.terminalViewPositions[viewKey]
        const terminalIndex = component.terminals.findIndex((item) => item.id === terminal.id)
        const manual = !!(viewPositions?.[terminal.id] ?? viewPositions?.[`index:${terminalIndex}`] ?? viewPositions?.[`label:${terminal.label}`])
        return <button
          type="button"
          key={terminal.id}
          className={`component-terminal-dot${selected ? ' selected' : ''}${manual ? ' manual' : ''}`}
          style={{ left: `${toMapPercent(position.x)}%`, top: `${toMapPercent(position.y)}%`, backgroundColor: terminal.color }}
          title={`${terminal.label} · arraste para posicionar`}
          onPointerDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setSelectedTerminalId(terminal.id)
            dragRef.current = { pointerId: event.pointerId, terminalId: terminal.id }
            mapRef.current?.setPointerCapture(event.pointerId)
            moveFromPointer(event, terminal.id)
          }}
        ><span>{terminal.label}</span></button>
      })}
    </div>
    <div className="component-terminal-controls">
      <label><span>Borne</span><select value={selectedTerminal?.id ?? ''} onChange={(event) => setSelectedTerminalId(event.target.value)}>{component.terminals.map((terminal) => <option key={terminal.id} value={terminal.id}>{terminal.label}</option>)}</select></label>
      {(['x', 'y'] as const).map((axis) => <label key={axis}><span>{axis.toUpperCase()} %</span><input
        type="number"
        min={-50}
        max={150}
        step={1}
        value={selectedPosition ? Math.round(selectedPosition[axis] * 1000) / 10 : 0}
        onChange={(event) => selectedTerminal && setPosition(selectedTerminal.id, { ...selectedPosition!, [axis]: Number(event.target.value) / 100 })}
      /></label>)}
    </div>
    <p>{manualCount ? `${manualCount} borne(s) ajustado(s) manualmente nesta vista.` : 'Sugestão automática ativa. Arraste um borne no mapa ou diretamente sobre o componente no Esquema.'}</p>
  </div>
}

/** Comando + editor partilhado pelas vistas Esquema e Painel 3D. */
export default function ComponentViewEditor() {
  const components = useSimStore((state) => state.components)
  const selectedIds = useSimStore((state) => state.selectedComponentIds)
  const editor = useSimStore((state) => state.viewOrientationEditor)
  const open = useSimStore((state) => state.openViewOrientationEditor)
  const setDraft = useSimStore((state) => state.setViewOrientationDraft)
  const cancel = useSimStore((state) => state.cancelViewOrientationEditor)
  const apply = useSimStore((state) => state.applyViewOrientationEditor)
  const [saveAsDefault, setSaveAsDefault] = useState(false)
  const selected = selectedIds.length === 1 ? components.find((component) => component.id === selectedIds[0]) : undefined
  const component = editor ? components.find((item) => item.id === editor.componentId) : undefined

  useEffect(() => setSaveAsDefault(false), [editor?.componentId])

  if (!editor) {
    if (!selected) return null
    return <div className="component-view-command">
      <button type="button" onClick={() => open(selected.id)} title={`Editar componente 3D ${selected.ref}`}><IconCube size={14} />Editar componente 3D</button>
    </div>
  }
  if (!component) return null

  const draft = editor.draft
  const updateAxis = (axis: 'x' | 'y' | 'z', value: number) => setDraft(normalizeComponentOrientation({ ...draft, [axis]: value }))
  return (
    <section className="component-view-editor" aria-label={`Editar componente 3D ${component.ref}`} onPointerDown={(event) => event.stopPropagation()}>
      <header>
        <div><IconCube size={16} /><span><strong>Editar componente 3D</strong><small>{component.ref} · {component.label}</small></span></div>
        <button type="button" onClick={cancel} aria-label="Fechar e cancelar">×</button>
      </header>

      <OrientationCube value={draft} onChange={setDraft} />

      <div className="component-view-presets" aria-label="Vistas predefinidas">
        {PRESETS.map((preset) => <button type="button" key={preset.id} onClick={() => setDraft({ ...COMPONENT_VIEW_PRESETS[preset.id] })}>{preset.label}</button>)}
      </div>

      <div className="component-view-angles">
        <AngleField axis="X" value={draft.x} onChange={(value) => updateAxis('x', value)} />
        <AngleField axis="Y" value={draft.y} onChange={(value) => updateAxis('y', value)} />
        <AngleField axis="Z" value={draft.z} onChange={(value) => updateAxis('z', value)} />
      </div>
      <div className="component-view-rotate-z">
        <button type="button" onClick={() => updateAxis('z', draft.z - 15)}>Z −15°</button>
        <button type="button" onClick={() => updateAxis('z', draft.z + 15)}>Z +15°</button>
        <button type="button" onClick={() => setDraft({ ...COMPONENT_VIEW_PRESETS.original })}><IconRotate size={11} />Original</button>
      </div>

      <TerminalPlacementEditor component={component} draft={draft} />

      <label className="component-view-default"><input type="checkbox" checked={saveAsDefault} onChange={(event) => setSaveAsDefault(event.target.checked)} /><span>Guardar como padrão do componente<small>Novas instâncias usarão esta orientação e mapas de bornes.</small></span></label>
      {!hasComponent3DModel(component.type) && <p className="component-view-warning">Este tipo não dispõe de GLB e permanece bloqueado para novas inserções.</p>}
      <p className="component-view-note">Apenas a apresentação muda. IDs, fios, posição elétrica, referências, propriedades e o GLB de origem permanecem intactos.</p>

      <footer>
        <button type="button" className="dc-btn" onClick={cancel}>Cancelar</button>
        <button type="button" className="dc-btn-primary dc-btn" onClick={() => apply(saveAsDefault)}><IconSave size={12} />Aplicar</button>
      </footer>
    </section>
  )
}
