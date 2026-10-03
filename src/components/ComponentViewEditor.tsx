import { uiConfirm } from '../ui/dialogs'
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useSimStore } from '../store/useSimStore'
import {
  COMPONENT_VIEW_PRESETS,
  componentTerminalViewKey,
  normalizeComponentOrientation,
  type ComponentViewPreset,
} from '../three/componentOrientation'
import { getComponentModelSpec, hasComponent3DModel } from '../three/modelPaths'

import { TERMINAL_KIND_LABEL, TERMINAL_TYPE_LABEL } from '../schematic/symbols'
import { component3DDimensions, positionOnTerminalFace, terminal3DPositionOf, terminalFaceCreationPosition, type Terminal3DFace } from '../three/terminal3D'
import TerminalFaceEditor from './TerminalFaceEditor'
import { ViewCubeDial, orientationFacingFace, type ViewCubeCorner } from './ViewCube'
import { IconCube, IconDelete, IconEye, IconPlus, IconProbe, IconRotate, IconSave } from '../ui/icons'
import type { Component3DRenderMode, ComponentViewOrientation, ElectricalComponent, TerminalElectricalClass, TerminalKind, TerminalType } from '../types'
import { inferTerminalElectricalClass, terminalDatasheetGuidance, TERMINAL_ELECTRICAL_CLASS_LABEL } from '../electrical/terminalClassification'
import { componentEditorChangeLabels, componentEditorSnapshotEquals, componentEditorSnapshotOf, componentEditorVersionOf, formatComponentUpdateDate } from '../three/componentRevisions'

const PRESETS: Array<{ id: ComponentViewPreset; label: string }> = [
  { id: 'isometric', label: 'Isométrica' },
  { id: 'front', label: 'Frente' },
  { id: 'back', label: 'Trás' },
  { id: 'left', label: 'Esquerda' },
  { id: 'right', label: 'Direita' },
  { id: 'top', label: 'Superior' },
  { id: 'bottom', label: 'Inferior' },
]

const COMPONENT_COLOR_PRESETS = [
  ['#e5e7eb', 'Cinza claro'],
  ['#374151', 'Grafite'],
  ['#0f172a', 'Preto industrial'],
  ['#dc2626', 'Vermelho'],
  ['#f59e0b', 'Âmbar'],
  ['#facc15', 'Amarelo'],
  ['#16a34a', 'Verde'],
  ['#2563eb', 'Azul'],
  ['#0891b2', 'Ciano'],
  ['#7c3aed', 'Violeta'],
] as const

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
      <div className="component-scale-presets" aria-label="Escala uniforme rápida">
        {[75, 100, 125, 150].map((percent) => <button type="button" key={percent} onClick={() => setScale({ x: percent / 100, y: percent / 100, z: percent / 100 })}>{percent}%</button>)}
        <button type="button" className="component-scale-reset" onClick={() => setScale({ x: 1, y: 1, z: 1 })}><IconRotate size={11} />Repor</button>
      </div>
    </section>
    <section>
      <header><span>Cor de destaque</span><small>mistura não destrutiva sobre materiais</small></header>
      <div className="component-body-color"><input type="color" aria-label="Cor de destaque do componente" value={editor.bodyColor3D ?? '#2563eb'} onChange={(event) => setBodyColor(event.target.value)} /><code>{editor.bodyColor3D ?? 'Original do GLB'}</code><button type="button" onClick={() => setBodyColor(undefined)}>Original</button></div>
      <div className="component-color-presets" aria-label="Paleta industrial">
        {COMPONENT_COLOR_PRESETS.map(([color, label]) => <button
          type="button"
          key={color}
          title={label}
          aria-label={`Aplicar ${label}`}
          aria-pressed={editor.bodyColor3D === color}
          className={editor.bodyColor3D === color ? 'active' : ''}
          style={{ backgroundColor: color }}
          onClick={() => setBodyColor(color)}
        />)}
      </div>
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

function ComponentVersionsEditor({
  component,
  note,
  onNoteChange,
  onRestore,
}: {
  component: ElectricalComponent
  note: string
  onNoteChange: (value: string) => void
  onRestore: (version: number) => void
}) {
  const editor = useSimStore((state) => state.viewOrientationEditor)
  const restore = useSimStore((state) => state.restoreViewEditorRevision)
  if (!editor || editor.componentId !== component.id) return null
  const draftComponent: ElectricalComponent = {
    ...component,
    viewOrientation: editor.draft,
    terminalViewPositions: editor.terminalViewPositions,
    terminals: editor.terminals,
    view3DScale: editor.scale3D,
    view3DRenderMode: editor.renderMode3D,
    bodyColor: editor.bodyColor3D,
  }
  const changes = componentEditorChangeLabels(componentEditorSnapshotOf(component), componentEditorSnapshotOf(draftComponent))
  const currentVersion = componentEditorVersionOf(component)
  const history = [...(component.editorHistory ?? [])].sort((a, b) => b.version - a.version)
  const exportDefinition = () => {
    const payload = {
      format: 'dc-simu-component-revision',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      component: { id: component.id, type: component.type, ref: component.ref, label: component.label },
      revision: {
        version: changes.length > 0 ? currentVersion + 1 : currentVersion,
        updatedAt: changes.length > 0 ? new Date().toISOString() : component.editorUpdatedAt,
        note: note.trim() || changes.join(' · ') || component.editorLastChange || 'Versão atual',
        changes,
        ...componentEditorSnapshotOf(draftComponent),
      },
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${component.ref.replace(/[^a-z0-9_-]+/gi, '-')}-v${payload.revision.version}.dcsimu-component.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }
  return <div className="component-versions-editor">
    <section className="component-version-current">
      <header><span>Versão atual da instância</span><strong>v{currentVersion}</strong></header>
      <div className="component-version-date"><span>Última atualização</span><time dateTime={component.editorUpdatedAt}>{formatComponentUpdateDate(component.editorUpdatedAt)}</time></div>
      <p>{component.editorLastChange || 'Componente importado; a primeira alteração criará a versão 2.'}</p>
    </section>
    <section>
      <header><span>Próxima revisão</span><small>{changes.length > 0 ? `será v${currentVersion + 1}` : 'sem alterações pendentes'}</small></header>
      <label className="component-revision-note"><span>Descrição da alteração</span><textarea value={note} maxLength={180} rows={3} placeholder="Ex.: bornes ajustados segundo a ficha técnica" onChange={(event) => onNoteChange(event.target.value)} /><small>{note.length}/180 · opcional; é gerada uma descrição automática</small></label>
      {changes.length > 0 ? <ul className="component-change-list">{changes.map((change) => <li key={change}>{change}</li>)}</ul> : <p className="component-version-empty">Altere a vista, bornes, escala, cor ou renderização para criar uma revisão.</p>}
    </section>
    <section>
      <header><span>Histórico recuperável</span><small>{history.length} versão(ões) anterior(es)</small></header>
      <div className="component-version-timeline">
        <article className="is-current"><div><strong>v{currentVersion}</strong><time>{formatComponentUpdateDate(component.editorUpdatedAt)}</time></div><p>{component.editorLastChange || 'Versão atual'}</p><span>Atual</span></article>
        {history.map((revision) => <article key={`${revision.version}-${revision.updatedAt}`}><div><strong>v{revision.version}</strong><time>{formatComponentUpdateDate(revision.updatedAt)}</time></div><p>{revision.note}</p><button type="button" onClick={() => { restore(revision.version); onRestore(revision.version) }}>Carregar no rascunho</button></article>)}
      </div>
    </section>
    <section className="component-version-sharing">
      <header><span>Entrega e partilha</span><small>incluída no projeto</small></header>
      <p>Ao <strong>Aplicar</strong>, a revisão é guardada no componente. Use <strong>Guardar projeto</strong> para que os utilizadores com acesso recebam os novos dados; a atualização PWA continua automática.</p>
      <button type="button" onClick={exportDefinition}>Exportar definição JSON</button>
    </section>
  </div>
}

/** Botões de entrada (na barra da vista). O editor em si vive no painel dedicado. */
export default function ComponentViewEditor() {
  const components = useSimStore((state) => state.components)
  const selectedIds = useSimStore((state) => state.selectedComponentIds)
  const editor = useSimStore((state) => state.viewOrientationEditor)
  const open = useSimStore((state) => state.openViewOrientationEditor)
  const selected = selectedIds.length === 1 ? components.find((component) => component.id === selectedIds[0]) : undefined
  if (editor || !selected) return null
  return <div className="component-view-command">
    <button type="button" aria-label={`Editar componente 3D ${selected.ref}`} onClick={() => open(selected.id)} title={`Editar componente 3D ${selected.ref}`}><IconCube size={14} /><span className="component-command-long">Editar componente 3D</span><span className="component-command-short">Componente</span></button>
    <button type="button" aria-label={`${selected.terminals.length > 0 ? 'Editar bornes' : 'Adicionar borne'} de ${selected.ref}`} onClick={() => open(selected.id, 'terminals')} title={`Adicionar, classificar e posicionar os bornes de ${selected.ref}`}><IconProbe size={14} /><span className="component-command-long">{selected.terminals.length > 0 ? 'Editar bornes' : 'Adicionar borne'}</span><span className="component-command-short">Bornes</span></button>
  </div>
}

const DOCK_KEY = 'dcsimu:workspace:component-editor-width'
const DOCK_MIN = 340
const DOCK_MAX = 640

/** Painel dedicado (docked) para editar componente e bornes. Ocupa o seu próprio
 * espaço no workspace — o canvas encolhe em vez de ficar tapado — e em ecrãs
 * estreitos torna-se uma folha inferior que mantém o componente visível. */
export function ComponentEditorDock() {
  const components = useSimStore((state) => state.components)
  const editor = useSimStore((state) => state.viewOrientationEditor)
  const setDraft = useSimStore((state) => state.setViewOrientationDraft)
  const cancel = useSimStore((state) => state.cancelViewOrientationEditor)
  const apply = useSimStore((state) => state.applyViewOrientationEditor)
  const setSection = useSimStore((state) => state.setViewEditorSection)
  const [saveAsDefault, setSaveAsDefault] = useState(false)
  const [revisionNote, setRevisionNote] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const [width, setWidth] = useState(() => {
    try { return Math.min(DOCK_MAX, Math.max(DOCK_MIN, Number(localStorage.getItem(DOCK_KEY)) || 400)) } catch { return 400 }
  })
  const component = editor ? components.find((item) => item.id === editor.componentId) : undefined
  const section = editor?.section ?? 'orientation'

  useEffect(() => { setSaveAsDefault(false); setRevisionNote(''); setCollapsed(false) }, [editor?.componentId])
  useEffect(() => { try { localStorage.setItem(DOCK_KEY, String(width)) } catch { /* privado */ } }, [width])

  const dirty = useMemo(() => {
    if (!editor || !component) return false
    const candidate: ElectricalComponent = {
      ...component,
      viewOrientation: editor.draft,
      terminalViewPositions: editor.terminalViewPositions,
      terminals: editor.terminals,
      view3DScale: editor.scale3D,
      view3DRenderMode: editor.renderMode3D,
      bodyColor: editor.bodyColor3D,
    }
    return !componentEditorSnapshotEquals(componentEditorSnapshotOf(component), componentEditorSnapshotOf(candidate))
  }, [editor, component])

  const requestClose = useCallback(async () => {
    if (dirty && !await uiConfirm('Descartar as alterações que ainda não aplicou?')) return
    cancel()
  }, [dirty, cancel])
  const submit = useCallback(() => apply(saveAsDefault, revisionNote), [apply, saveAsDefault, revisionNote])

  useEffect(() => {
    if (!editor) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !(event.target instanceof HTMLSelectElement)) { event.preventDefault(); requestClose() }
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); submit() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editor, requestClose, submit])

  if (!editor || !component) return null

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startX = event.clientX, startWidth = width
    const move = (ev: PointerEvent) => setWidth(Math.min(DOCK_MAX, Math.max(DOCK_MIN, startWidth + (startX - ev.clientX))))
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

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
  const tabs: Array<{ id: typeof section; label: string; badge?: number | string }> = [
    { id: 'orientation', label: 'Vista' },
    { id: 'terminals', label: 'Bornes', badge: editor.terminals.length },
    { id: 'appearance', label: 'Aparência' },
    { id: 'versions', label: 'Versões', badge: `v${componentEditorVersionOf(component)}` },
  ]

  return (
    <aside className="component-editor-dock" data-collapsed={collapsed ? 'true' : 'false'} style={{ ['--dock-w' as string]: `${width}px` }} aria-label={`Painel de edição de ${component.ref}`} onPointerDown={(event) => event.stopPropagation()}>
      <div className="component-editor-resize" onPointerDown={startResize} role="separator" aria-orientation="vertical" aria-label="Redimensionar painel de edição" title="Arraste para redimensionar" />
      <button type="button" className="component-editor-grip" onClick={() => setCollapsed((value) => !value)} aria-expanded={!collapsed} aria-label={collapsed ? 'Expandir painel de edição' : 'Recolher painel de edição'}><span /><b className="component-editor-grip-label">Voltar ao editor</b></button>
      <section className="component-view-editor is-docked">
        <header>
          <div><IconCube size={16} /><span><strong>{component.ref}<b className="component-editor-version">v{componentEditorVersionOf(component)}</b>{dirty && <em className="component-editor-dirty" title="Alterações por aplicar">● por aplicar</em>}</strong><small>{component.label} · Atualizado {formatComponentUpdateDate(component.editorUpdatedAt)}</small></span></div>
          <button type="button" className="component-editor-peek" onClick={() => setCollapsed(true)} aria-label="Ver a vista do componente" title="Ver a vista (o editor fica minimizado)"><IconEye size={14} /><span>Ver vista</span></button>
          <button type="button" onClick={requestClose} aria-label="Fechar painel de edição" title="Fechar (Esc)">×</button>
        </header>

        <nav className="component-view-tabs" role="tablist" aria-label="Secções do painel de edição">
          {tabs.map((tab) => <button type="button" role="tab" key={tab.id} aria-selected={section === tab.id} className={section === tab.id ? 'active' : ''} onClick={() => { setSection(tab.id); setCollapsed(false) }}>{tab.label}{tab.badge !== undefined && <span>{tab.badge}</span>}</button>)}
        </nav>

        <div className="component-editor-body">
          <p className="component-editor-live">Pré-visualização em direto na vista<span className="only-wide"> ao lado</span><span className="only-narrow"> (toque em «Ver vista»)</span>. Nada é gravado até carregar em Aplicar.</p>

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

          {section === 'terminals' && <TerminalFaceEditor component={draftComponent} />}
          {section === 'appearance' && <AppearanceEditor component={draftComponent} />}
          {section === 'versions' && <ComponentVersionsEditor component={component} note={revisionNote} onNoteChange={setRevisionNote} onRestore={(version) => setRevisionNote(`Restauro da versão ${version}`)} />}

          <label className="component-view-default"><input type="checkbox" checked={saveAsDefault} onChange={(event) => setSaveAsDefault(event.target.checked)} /><span>Guardar apresentação como padrão<small>Novas instâncias usarão orientação, escala, renderização e mapas de bornes.</small></span></label>
          {!hasComponent3DModel(component.type) && <p className="component-view-warning">Este tipo não dispõe de GLB e permanece bloqueado para novas inserções.</p>}
          <p className="component-view-note">A edição é individual: posições 2D/3D, referências, dados elétricos e GLB de origem não mudam. Bornes existentes conservam o ID; ao aplicar uma remoção, apenas os cabos ligados ao borne eliminado são limpos em segurança.</p>
        </div>

        <footer>
          <span className="component-editor-status">{dirty ? `Pronta para v${componentEditorVersionOf(component) + 1}` : 'Sem alterações'}<kbd>Ctrl+↵</kbd></span>
          <button type="button" className="dc-btn" onClick={requestClose}>Cancelar</button>
          <button type="button" className="dc-btn-primary dc-btn" disabled={!dirty && !saveAsDefault} onClick={submit}><IconSave size={12} />Aplicar</button>
        </footer>
      </section>
    </aside>
  )
}
