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
import { component3DDimensions, positionOnTerminalFace, terminal3DPositionOf, terminalFaceCreationPosition, type Terminal3DFace } from '../three/terminal3D'
import { ViewCubeDial, orientationFacingFace, type ViewCubeCorner } from './ViewCube'
import { IconCube, IconDelete, IconPlus, IconProbe, IconRotate, IconSave } from '../ui/icons'
import type { Component3DRenderMode, ComponentViewOrientation, ElectricalComponent, TerminalElectricalClass, TerminalKind, TerminalType } from '../types'
import { inferTerminalElectricalClass, terminalDatasheetGuidance, TERMINAL_ELECTRICAL_CLASS_LABEL } from '../electrical/terminalClassification'

const PRESETS: Array<{ id: ComponentViewPreset; label: string }> = [
  { id: 'isometric', label: 'Isométrica' },
  { id: 'front', label: 'Frente' },
  { id: 'back', label: 'Trás' },
  { id: 'left', label: 'Esquerda' },
  { id: 'right', label: 'Direita' },
  { id: 'top', label: 'Superior' },
  { id: 'bottom', label: 'Inferior' },
]

const TERMINAL_FACES: Array<{ id: Terminal3DFace; label: string }> = [
  { id: 'front', label: 'Frente do componente' },
  { id: 'back', label: 'Trás do componente' },
  { id: 'left', label: 'Lateral esquerda' },
  { id: 'right', label: 'Lateral direita' },
  { id: 'top', label: 'Face superior' },
  { id: 'bottom', label: 'Face inferior' },
]

const VIEW_CUBE_CORNERS: Record<ViewCubeCorner, ComponentViewOrientation> = {
  nw: { x: -35.264, y: -45, z: 0 },
  ne: COMPONENT_VIEW_PRESETS.isometric,
  sw: { x: 35.264, y: -45, z: 0 },
  se: { x: 35.264, y: 45, z: 0 },
}

function OrientationCube({ value, onChange }: { value: ComponentViewOrientation; onChange: (value: ComponentViewOrientation) => void }) {
  // Arrasto incremental: lê sempre o valor mais recente (evita dessincronizar com o rascunho).
  const valueRef = useRef(value)
  valueRef.current = value
  const preset = (id: ComponentViewPreset) => onChange({ ...COMPONENT_VIEW_PRESETS[id] })
  return <ViewCubeDial
    variant="panel"
    ariaLabel="Cubo de orientação do componente"
    transform={`rotateX(${-value.x}deg) rotateY(${value.y}deg) rotateZ(${value.z}deg)`}
    activeFace={orientationFacingFace(value.x, value.y, value.z)}
    onFace={(face) => preset(face)}
    onCorner={(corner) => onChange({ ...VIEW_CUBE_CORNERS[corner] })}
    onIso={() => preset('isometric')}
    onHome={() => preset('front')}
    onDrag={(dx, dy, shift) => {
      const current = valueRef.current
      onChange(normalizeComponentOrientation(shift
        ? { ...current, z: current.z + dx * 0.65 }
        : { ...current, x: current.x - dy * 0.65, y: current.y + dx * 0.65 }))
    }}
    arrowStep={23}
    dragTitle="Arraste para rodar livremente · Shift+arraste roda o eixo Z"
    caption="Arraste o cubo · Shift = eixo Z"
    readout={`X ${Math.round(value.x)}° · Y ${Math.round(value.y)}° · Z ${Math.round(value.z)}°`}
  />
}

function AngleField({ axis, value, onChange }: { axis: 'X' | 'Y' | 'Z'; value: number; onChange: (value: number) => void }) {
  return <label className="component-view-angle"><span>{axis}</span><input type="number" min={-180} max={180} step={1} value={Math.round(value * 10) / 10} onChange={(event) => onChange(Number(event.target.value) || 0)} /><small>°</small></label>
}

const MAP_MIN = -0.18
const MAP_SPAN = 1.36
const toMapPercent = (value: number) => ((value - MAP_MIN) / MAP_SPAN) * 100
const fromMapFraction = (value: number) => MAP_MIN + value * MAP_SPAN

function isOnTerminalFace(position: ReturnType<typeof terminal3DPositionOf>, face: Terminal3DFace) {
  if (face === 'front') return position.z > 0.999
  if (face === 'back') return position.z < 0.001
  if (face === 'left') return position.x < 0.001
  if (face === 'right') return position.x > 0.999
  if (face === 'top') return position.y > 0.999
  return position.y < 0.001
}

function nextTerminalFacePosition(component: ElectricalComponent, face: Terminal3DFace) {
  const occupied = component.terminals.filter((terminal) => isOnTerminalFace(terminal3DPositionOf(terminal), face)).length
  return terminalFaceCreationPosition(face, occupied)
}

function TerminalPlacementEditor({ component, draft }: { component: ElectricalComponent; draft: ComponentViewOrientation }) {
  const editor = useSimStore((state) => state.viewOrientationEditor)!
  const setPosition = useSimStore((state) => state.setViewTerminalPosition)
  const autoPlace = useSimStore((state) => state.autoPlaceViewTerminals)
  const setDefinition = useSimStore((state) => state.setViewTerminalDefinition)
  const addTerminal = useSimStore((state) => state.addViewTerminal)
  const deleteTerminal = useSimStore((state) => state.deleteViewTerminal)
  const setActiveTerminal = useSimStore((state) => state.setViewActiveTerminal)
  const setTracking = useSimStore((state) => state.setViewTracking)
  const setDiameter = useSimStore((state) => state.setViewTerminalDiameter)
  const nudge = useSimStore((state) => state.nudgeViewTerminal)
  const wires = useSimStore((state) => state.wires)
  const mapRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; terminalId: string } | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState<TerminalKind>('io')
  const [newType, setNewType] = useState<TerminalType>('screw')
  const [newClass, setNewClass] = useState<TerminalElectricalClass>('other')
  const [newCustomClass, setNewCustomClass] = useState('')
  const [newFace, setNewFace] = useState<Terminal3DFace>('front')
  const [classOverridden, setClassOverridden] = useState(false)
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
  const suggestedClass = inferTerminalElectricalClass(component, {
    id: 'new-terminal', componentId: component.id, label: newLabel.trim() || 'X', kind: newKind,
    terminalType: newType, color: '#64748b', x: 0.5, y: 0.5, energized: false,
  })
  const duplicateNewLabel = !!newLabel.trim() && component.terminals.some((terminal) => terminal.label.toLocaleUpperCase() === newLabel.trim().toLocaleUpperCase())

  useEffect(() => {
    if (!component.terminals.some((terminal) => terminal.id === selectedTerminalId)) setActiveTerminal(component.terminals[0]?.id ?? null)
  }, [component.id, component.terminals, selectedTerminalId, setActiveTerminal])
  useEffect(() => {
    if (!classOverridden) setNewClass(suggestedClass)
  }, [classOverridden, suggestedClass])
  useEffect(() => {
    setNewLabel('')
    setNewName('')
    setNewCustomClass('')
    setNewFace('front')
    setClassOverridden(false)
  }, [component.id])

  const createTerminal = () => {
    const label = newLabel.trim()
    if (!label || duplicateNewLabel) return
    const position3D = nextTerminalFacePosition(component, newFace)
    addTerminal({ label, displayName: newName.trim() || undefined, kind: newKind, terminalType: newType, electricalClass: newClass, electricalClassCustom: newClass === 'other' ? newCustomClass.trim() || undefined : undefined, color: '#64748b', position3D })
    useSimStore.getState().setViewOrientationDraft({ ...COMPONENT_VIEW_PRESETS[newFace] })
    setNewLabel('')
    setNewName('')
    setNewCustomClass('')
    setClassOverridden(false)
  }
  const removeSelectedTerminal = () => {
    if (!selectedTerminal) return
    const connected = wires.filter((wire) => wire.fromTerminalId === selectedTerminal.id || wire.toTerminalId === selectedTerminal.id).length
    if (connected > 0 && !window.confirm(`O borne ${selectedTerminal.label} tem ${connected} cabo(s). Ao Aplicar, esses cabos serão removidos. Continuar?`)) return
    deleteTerminal(selectedTerminal.id)
  }

  const moveFromPointer = (event: ReactPointerEvent<HTMLElement>, terminalId: string) => {
    const rect = mapRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = fromMapFraction(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)))
    const y = fromMapFraction(Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)))
    setPosition(terminalId, { x, y })
  }

  return <div className="component-terminal-editor">
    <div className="component-terminal-editor-title">
      <span><strong>Definir e posicionar bornes</strong><small>Vista: {viewLabel}</small></span>
      <button type="button" onClick={autoPlace} disabled={component.terminals.length === 0} title="Projetar automaticamente os bornes nesta vista"><IconRotate size={11} />Rastrear automaticamente</button>
    </div>
    <form className="component-terminal-create" onSubmit={(event) => { event.preventDefault(); createTerminal() }}>
      <div className="component-terminal-create-head"><span><IconPlus size={12} /><strong>Adicionar borne</strong></span><small>{terminalDatasheetGuidance(component)}</small></div>
      <div className="component-terminal-create-grid">
        <label><span>Identificação *</span><input value={newLabel} placeholder="Ex.: A1, L+, ETH" onChange={(event) => setNewLabel(event.target.value)} aria-invalid={duplicateNewLabel} /></label>
        <label><span>Nome visível</span><input value={newName} placeholder="Opcional" onChange={(event) => setNewName(event.target.value)} /></label>
        <label><span>Função elétrica</span><select value={newKind} onChange={(event) => setNewKind(event.target.value as TerminalKind)}>{Object.entries(TERMINAL_KIND_LABEL).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select></label>
        <label><span>Categoria elétrica</span><select value={newClass} onChange={(event) => { setNewClass(event.target.value as TerminalElectricalClass); setClassOverridden(true) }}>{Object.entries(TERMINAL_ELECTRICAL_CLASS_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        {newClass === 'other' && <label><span>Designação personalizada</span><input value={newCustomClass} placeholder="Ex.: PE, contacto seco" onChange={(event) => setNewCustomClass(event.target.value)} /></label>}
        <label><span>Tipo físico</span><select value={newType} onChange={(event) => setNewType(event.target.value as TerminalType)}>{Object.entries(TERMINAL_TYPE_LABEL).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></label>
        <label className="component-terminal-face-field"><span>Vista / face de criação *</span><select value={newFace} onChange={(event) => setNewFace(event.target.value as Terminal3DFace)}>{TERMINAL_FACES.map((face) => <option key={face.id} value={face.id}>{face.label}</option>)}</select><small>O borne nasce nesta face; depois pode arrastá-lo com precisão.</small></label>
        <button type="submit" className="dc-btn-primary dc-btn" disabled={!newLabel.trim() || duplicateNewLabel}><IconPlus size={12} />Criar borne na face</button>
      </div>
      {duplicateNewLabel && <small className="component-terminal-create-error">Já existe um borne com esta identificação.</small>}
      <small className="component-terminal-create-suggestion">Sugestão atual: <strong>{TERMINAL_ELECTRICAL_CLASS_LABEL[suggestedClass]}</strong>. A ficha técnica orienta a sugestão; confirme antes de aplicar.</small>
    </form>
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
      {component.terminals.length === 0 && <div className="component-terminal-empty"><IconProbe size={18} /><strong>Sem bornes definidos</strong><span>Crie o primeiro borne acima e posicione-o nesta vista ou diretamente no 3D.</span></div>}
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
      <div className="component-terminal-definition-title"><strong>Definição do borne</strong><span>{selectedTerminal.energized ? '● Energizado' : '○ Sem tensão'}</span><button type="button" className="component-terminal-delete" onClick={removeSelectedTerminal} title={`Remover borne ${selectedTerminal.label}`}><IconDelete size={12} />Remover</button></div>
      <div className="component-terminal-definition-grid">
        <label><span>Identificação</span><input value={selectedTerminal.label} onChange={(event) => setDefinition(selectedTerminal.id, { label: event.target.value })} /></label>
        <label><span>Nome visível</span><input value={selectedTerminal.displayName ?? ''} placeholder={selectedTerminal.label} onChange={(event) => setDefinition(selectedTerminal.id, { displayName: event.target.value || undefined })} /></label>
        <label><span>Função elétrica</span><select value={selectedTerminal.kind} onChange={(event) => setDefinition(selectedTerminal.id, { kind: event.target.value as TerminalKind })}>{Object.entries(TERMINAL_KIND_LABEL).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select></label>
        <label><span>Categoria elétrica</span><select value={selectedTerminal.electricalClass ?? inferTerminalElectricalClass(component, selectedTerminal)} onChange={(event) => setDefinition(selectedTerminal.id, { electricalClass: event.target.value as TerminalElectricalClass, electricalClassCustom: event.target.value === 'other' ? selectedTerminal.electricalClassCustom : undefined })}>{Object.entries(TERMINAL_ELECTRICAL_CLASS_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><small>{selectedTerminal.electricalClass ? 'Definida manualmente' : 'Sugerida pela ficha técnica'}</small></label>
        {(selectedTerminal.electricalClass ?? inferTerminalElectricalClass(component, selectedTerminal)) === 'other' && <label><span>Designação personalizada</span><input value={selectedTerminal.electricalClassCustom ?? ''} placeholder="Ex.: PE, contacto seco" onChange={(event) => setDefinition(selectedTerminal.id, { electricalClassCustom: event.target.value || undefined })} /></label>}
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
      <button type="button" onClick={() => open(selected.id, 'terminals')} title={`Adicionar, classificar e posicionar os bornes de ${selected.ref}`}><IconProbe size={14} />{selected.terminals.length > 0 ? 'Editar bornes' : 'Adicionar borne'}</button>
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
      <p className="component-view-note">A edição é individual: posições 2D/3D, referências, dados elétricos e GLB de origem não mudam. Bornes existentes conservam o ID; ao aplicar uma remoção, apenas os cabos ligados ao borne eliminado são limpos em segurança.</p>

      <footer>
        <button type="button" className="dc-btn" onClick={cancel}>Cancelar</button>
        <button type="button" className="dc-btn-primary dc-btn" onClick={() => apply(saveAsDefault)}><IconSave size={12} />Aplicar</button>
      </footer>
    </section>
  )
}
