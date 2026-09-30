import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useSimStore } from '../store/useSimStore'
import {
  COMPONENT_VIEW_PRESETS,
  componentTerminalViewKey,
  normalizeComponentOrientation,
  type ComponentViewPreset,
} from '../three/componentOrientation'
import { getComponentModelSpec, hasComponent3DModel } from '../three/modelPaths'
import { componentTerminalLocal } from '../schematic/componentTerminalViews'
import { TERMINAL_KIND_LABEL, TERMINAL_TYPE_LABEL } from '../schematic/symbols'
import { component3DDimensions, positionOnTerminalFace, terminal3DPositionOf, type Terminal3DFace } from '../three/terminal3D'
import { IconCube, IconProbe, IconRotate, IconSave } from '../ui/icons'
import type { Component3DRenderMode, ComponentViewOrientation, ElectricalComponent, TerminalKind, TerminalType } from '../types'

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
        <span className="component-view-compass north">N</span><span className="component-view-compass east">L</span><span className="component-view-compass south">S</span><span className="component-view-compass west">O</span>
        <span className="component-view-axis x">X</span><span className="component-view-axis y">Y</span><span className="component-view-axis z">Z</span>
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
  const setDefinition = useSimStore((state) => state.setViewTerminalDefinition)
  const setActiveTerminal = useSimStore((state) => state.setViewActiveTerminal)
  const setTracking = useSimStore((state) => state.setViewTracking)
  const setDiameter = useSimStore((state) => state.setViewTerminalDiameter)
  const nudge = useSimStore((state) => state.nudgeViewTerminal)
  const mapRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; terminalId: string } | null>(null)
  const selectedTerminalId = editor.activeTerminalId ?? component.terminals[0]?.id ?? ''
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
  const selectedPosition3D = selectedTerminal ? terminal3DPositionOf(selectedTerminal) : undefined
  const dotSize = Math.max(6, Math.min(22, Math.round(editor.trackingDiameter * 0.75)))
  const manualCount = Object.keys(editor.terminalViewPositions[viewKey] ?? {}).length

  useEffect(() => {
    if (!component.terminals.some((terminal) => terminal.id === selectedTerminalId)) setActiveTerminal(component.terminals[0]?.id ?? null)
  }, [component.id, component.terminals, selectedTerminalId, setActiveTerminal])

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
      tabIndex={0}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 5 : 1
        const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
        const move = delta[event.key]
        if (!move || !selectedTerminal) return
        event.preventDefault()
        nudge(selectedTerminal.id, move[0], move[1])
      }}
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
          style={{ left: `${toMapPercent(position.x)}%`, top: `${toMapPercent(position.y)}%`, backgroundColor: terminal.color, width: dotSize, height: dotSize }}
          title={`${terminal.label} · arraste para posicionar`}
          onPointerDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setActiveTerminal(terminal.id)
            dragRef.current = { pointerId: event.pointerId, terminalId: terminal.id }
            mapRef.current?.setPointerCapture(event.pointerId)
            moveFromPointer(event, terminal.id)
          }}
        ><span>{terminal.label}</span></button>
      })}
    </div>
    <div className="component-terminal-tracking">
      <label><span>Diâmetro do rastreamento · {editor.trackingDiameter} px</span>
        <input type="range" min={4} max={40} step={0.5} value={editor.trackingDiameter} onChange={(event) => setTracking({ trackingDiameter: Number(event.target.value) })} />
      </label>
      <label><span>Etiquetas</span>
        <select value={editor.trackingLabels} onChange={(event) => setTracking({ trackingLabels: event.target.value as 'all' | 'active' | 'off' })}>
          <option value="active">Só o borne ativo</option><option value="all">Todos</option><option value="off">Nenhum</option>
        </select>
      </label>
    </div>
    <div className="component-terminal-controls">
      <label><span>Borne</span><select value={selectedTerminal?.id ?? ''} onChange={(event) => setActiveTerminal(event.target.value)}>{component.terminals.map((terminal) => <option key={terminal.id} value={terminal.id}>{terminal.label}</option>)}</select></label>
      {(['x', 'y'] as const).map((axis) => <label key={axis}><span>{axis.toUpperCase()} %</span><input
        type="number"
        min={-50}
        max={150}
        step={1}
        value={selectedPosition ? Math.round(selectedPosition[axis] * 1000) / 10 : 0}
        onChange={(event) => selectedTerminal && setPosition(selectedTerminal.id, { ...selectedPosition!, [axis]: Number(event.target.value) / 100 })}
      /></label>)}
    </div>
    {selectedTerminal && selectedPosition3D && <div className="component-terminal-definition">
      <div className="component-terminal-definition-title"><strong>Definição do borne</strong><span>{selectedTerminal.energized ? '● Energizado' : '○ Sem tensão'}</span></div>
      <div className="component-terminal-definition-grid">
        <label><span>Identificação</span><input value={selectedTerminal.label} onChange={(event) => setDefinition(selectedTerminal.id, { label: event.target.value })} /></label>
        <label><span>Nome visível</span><input value={selectedTerminal.displayName ?? ''} placeholder={selectedTerminal.label} onChange={(event) => setDefinition(selectedTerminal.id, { displayName: event.target.value || undefined })} /></label>
        <label><span>Função elétrica</span><select value={selectedTerminal.kind} onChange={(event) => setDefinition(selectedTerminal.id, { kind: event.target.value as TerminalKind })}>{Object.entries(TERMINAL_KIND_LABEL).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select></label>
        <label><span>Tipo físico</span><select value={selectedTerminal.terminalType} onChange={(event) => setDefinition(selectedTerminal.id, { terminalType: event.target.value as TerminalType })}>{Object.entries(TERMINAL_TYPE_LABEL).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></label>
        <label className="component-terminal-color"><span>Cor</span><input type="color" value={selectedTerminal.color} onChange={(event) => setDefinition(selectedTerminal.id, { color: event.target.value })} /></label>
      </div>
      <div className="component-terminal-diameter">
        <label><span>Diâmetro do borne · {selectedTerminal.diameter ? `${selectedTerminal.diameter} px` : 'padrão'}</span>
          <input type="range" min={3} max={24} step={0.5} value={selectedTerminal.diameter ?? 9} onChange={(event) => setDiameter(Number(event.target.value), selectedTerminal.id)} />
        </label>
        <div>
          <button type="button" onClick={() => setDiameter(selectedTerminal.diameter ?? 9)} title="Aplicar este diâmetro a todos os bornes do componente" >Aplicar a todos</button>
          <button type="button" onClick={() => setDiameter(undefined, selectedTerminal.id)} title="Voltar ao tamanho padrão">Padrão</button>
        </div>
      </div>
      <div className="component-terminal-3d-head"><span>Posição física 3D</span><small>X esquerda/direita · Y baixo/cima · Z trás/frente</small></div>
      <div className="component-terminal-3d-fields">
        {(['x', 'y', 'z'] as const).map((axis) => <label key={`terminal-3d-${axis}`}><span>{axis.toUpperCase()} %</span><input type="number" min={0} max={100} step={1}
          value={Math.round(selectedPosition3D[axis] * 1000) / 10}
          onChange={(event) => setDefinition(selectedTerminal.id, { position3D: { ...selectedPosition3D, [axis]: Math.max(0, Math.min(1, Number(event.target.value) / 100)) } })} /></label>)}
      </div>
      <div className="component-terminal-face-buttons" aria-label="Fixar borne numa face do volume 3D">
        {([['front', 'Frente'], ['back', 'Trás'], ['left', 'Esq.'], ['right', 'Dir.'], ['top', 'Topo'], ['bottom', 'Base']] as Array<[Terminal3DFace, string]>).map(([face, label]) => <button type="button" key={face} onClick={() => setDefinition(selectedTerminal.id, { position3D: positionOnTerminalFace(selectedPosition3D, face) })}>{label}</button>)}
      </div>
    </div>}
    <p>{manualCount ? `${manualCount} borne(s) ajustado(s) manualmente nesta vista.` : 'Sugestão automática ativa. Arraste os bornes diretamente no Esquema 2D ou na Visualização 3D — os dois acompanham-se.'} Setas = ajuste fino (Shift = 5 px) · Alt ao arrastar desliga as guias de alinhamento.</p>
  </div>
}

function AppearanceEditor({ component }: { component: ElectricalComponent }) {
  const editor = useSimStore((state) => state.viewOrientationEditor)!
  const setScale = useSimStore((state) => state.setView3DScale)
  const setRenderMode = useSimStore((state) => state.setView3DRenderMode)
  const setBodyColor = useSimStore((state) => state.setView3DBodyColor)
  const dimensions = getComponentModelSpec(component.type)?.physicalSizeMm
  const sceneSize = component3DDimensions(component)
  const updateScale = (axis: 'x' | 'y' | 'z', percent: number) => setScale({ ...editor.scale3D, [axis]: Math.max(25, Math.min(400, percent)) / 100 })
  return <div className="component-appearance-editor">
    <section>
      <header><span>Dimensões físicas do CAD</span><small>GLB preservado</small></header>
      <div className="component-cad-dimensions">
        {(['x', 'y', 'z'] as const).map((axis) => <div key={`cad-${axis}`}><span>{axis.toUpperCase()}</span><strong>{dimensions ? Math.round((axis === 'x' ? dimensions.width : axis === 'y' ? dimensions.height : dimensions.depth) * 10) / 10 : Math.round(sceneSize[axis] * 1000) / 10}</strong><small>mm</small></div>)}
      </div>
    </section>
    <section>
      <header><span>Escala visual por eixo</span><small>não altera o ficheiro de origem</small></header>
      <div className="component-scale-fields">
        {(['x', 'y', 'z'] as const).map((axis) => <label key={`scale-${axis}`}><span>{axis.toUpperCase()}</span><input type="number" min={25} max={400} step={5} value={Math.round(editor.scale3D[axis] * 100)} onChange={(event) => updateScale(axis, Number(event.target.value))} /><small>%</small></label>)}
      </div>
      <button type="button" className="component-scale-reset" onClick={() => setScale({ x: 1, y: 1, z: 1 })}><IconRotate size={11} />Restaurar 100%</button>
    </section>
    <section>
      <header><span>Cor de destaque</span><small>mistura não destrutiva sobre materiais</small></header>
      <div className="component-body-color"><input type="color" aria-label="Cor de destaque do componente" value={editor.bodyColor3D ?? '#2563eb'} onChange={(event) => setBodyColor(event.target.value)} /><code>{editor.bodyColor3D ?? 'Original do GLB'}</code><button type="button" onClick={() => setBodyColor(undefined)}>Original</button></div>
    </section>
    <section>
      <header><span>Modo de renderização</span><small>pré-visualização na Visualização 3D</small></header>
      <div className="component-render-modes">
        {([['solid', 'Sólido'], ['wireframe', 'Arame'], ['xray', 'Raio-X']] as Array<[Component3DRenderMode, string]>).map(([mode, label]) => <button type="button" key={mode} aria-pressed={editor.renderMode3D === mode} className={editor.renderMode3D === mode ? 'active' : ''} onClick={() => setRenderMode(mode)}>{label}</button>)}
      </div>
    </section>
    <p>As dimensões elétricas, o footprint, a posição no painel e o GLB original não são modificados.</p>
  </div>
}

/** Comando + editor partilhado pelas vistas Esquema e Visualização 3D. */
export default function ComponentViewEditor() {
  const components = useSimStore((state) => state.components)
  const selectedIds = useSimStore((state) => state.selectedComponentIds)
  const editor = useSimStore((state) => state.viewOrientationEditor)
  const open = useSimStore((state) => state.openViewOrientationEditor)
  const setDraft = useSimStore((state) => state.setViewOrientationDraft)
  const cancel = useSimStore((state) => state.cancelViewOrientationEditor)
  const apply = useSimStore((state) => state.applyViewOrientationEditor)
  const [saveAsDefault, setSaveAsDefault] = useState(false)
  const section = editor?.section ?? 'orientation'
  const setSection = useSimStore((state) => state.setViewEditorSection)
  const selected = selectedIds.length === 1 ? components.find((component) => component.id === selectedIds[0]) : undefined
  const component = editor ? components.find((item) => item.id === editor.componentId) : undefined

  useEffect(() => {
    setSaveAsDefault(false)
  }, [editor?.componentId])

  if (!editor) {
    if (!selected) return null
    return <div className="component-view-command">
      <button type="button" onClick={() => open(selected.id)} title={`Editar componente 3D ${selected.ref}`}><IconCube size={14} />Editar componente 3D</button>
      {selected.terminals.length > 0 && <button type="button" onClick={() => open(selected.id, 'terminals')} title={`Mover, redimensionar e renomear os bornes de ${selected.ref} diretamente no desenho`}><IconProbe size={14} />Editar bornes</button>}
    </div>
  }
  if (!component) return null

  const draft = editor.draft
  const draftComponent: ElectricalComponent = {
    ...component,
    viewOrientation: draft,
    terminalViewPositions: editor.terminalViewPositions,
    terminals: editor.terminals,
    view3DScale: editor.scale3D,
    view3DRenderMode: editor.renderMode3D,
    bodyColor: editor.bodyColor3D,
  }
  const updateAxis = (axis: 'x' | 'y' | 'z', value: number) => setDraft(normalizeComponentOrientation({ ...draft, [axis]: value }))
  return (
    <section className="component-view-editor" aria-label={`Editar componente 3D ${component.ref}`} onPointerDown={(event) => event.stopPropagation()}>
      <header>
        <div><IconCube size={16} /><span><strong>Editar componente 3D</strong><small>{component.ref} · {component.label}</small></span></div>
        <button type="button" onClick={cancel} aria-label="Fechar e cancelar">×</button>
      </header>

      <nav className="component-view-tabs" role="tablist" aria-label="Secções do editor de componente 3D">
        <button type="button" role="tab" aria-selected={section === 'orientation'} className={section === 'orientation' ? 'active' : ''} onClick={() => setSection('orientation')}>Vista</button>
        <button type="button" role="tab" aria-selected={section === 'terminals'} className={section === 'terminals' ? 'active' : ''} onClick={() => setSection('terminals')}>Bornes <span>{editor.terminals.length}</span></button>
        <button type="button" role="tab" aria-selected={section === 'appearance'} className={section === 'appearance' ? 'active' : ''} onClick={() => setSection('appearance')}>Aparência</button>
      </nav>

      {section === 'orientation' && <div className="component-view-section">
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
      </div>}

      {section === 'terminals' && <TerminalPlacementEditor component={draftComponent} draft={draft} />}
      {section === 'appearance' && <AppearanceEditor component={draftComponent} />}

      <label className="component-view-default"><input type="checkbox" checked={saveAsDefault} onChange={(event) => setSaveAsDefault(event.target.checked)} /><span>Guardar apresentação como padrão<small>Novas instâncias usarão orientação, escala, renderização e mapas de bornes.</small></span></label>
      {!hasComponent3DModel(component.type) && <p className="component-view-warning">Este tipo não dispõe de GLB e permanece bloqueado para novas inserções.</p>}
      <p className="component-view-note">IDs dos bornes, fios, posição elétrica do componente, referências e GLB de origem permanecem intactos. Só os campos de borne explicitamente editados são alterados.</p>

      <footer>
        <button type="button" className="dc-btn" onClick={cancel}>Cancelar</button>
        <button type="button" className="dc-btn-primary dc-btn" onClick={() => apply(saveAsDefault)}><IconSave size={12} />Aplicar</button>
      </footer>
    </section>
  )
}
