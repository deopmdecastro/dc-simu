import Select from '../../ui/Select'
import { useLocation, useNavigate } from 'react-router-dom'
import { ROUTES } from '../../routing/routes'
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { bakeGlb, boundsMm, describeChanges, loadGlbAssets, resolveState, runtimeSpec } from '../../catalog/definition'
import { upgradeBuiltinDraft } from './builtinComponents'
import { catalogApi } from '../../catalog/catalogApi'
import { useCatalogStore } from '../../catalog/registry'
import ViewCube, { type ViewCubeFace } from '../../components/ViewCube'
import TerminalLibrary, { DND_PROFILE, DND_TERMINAL } from '../../components/TerminalLibrary'
import { BUILTIN_PROFILES, defaultParams, FACES, specsFromTerminals, type TerminalSpec } from '../../catalog/terminalProfiles'
import { allProfiles, useProfileStore } from '../../catalog/profileStore'
import { COMPAT_LABEL } from '../../catalog/terminalCompat'
import { applyProfile, faceCounts } from './terminalOps'
import Hierarchy from './Hierarchy'
import { BASE_STATE, glbCache, removeParts, useEditorStore, type InspectorTab, type Ribbon } from './editorStore'
import { ComponentTab, InteractionsTab, LightsTab, StatesTab, TerminalsTab } from './tabs2'
import { MaterialsTab, ObjectTab } from './tabs1'
import { ControlsTab, DisplaysTab } from './tabsControls'
import { validateDefinition } from './validate'
import Logo from '../../ui/Brand'
import { IconAlignCenterH, IconArrowLeft, IconBox, IconCheck, IconClose, IconCone, IconCopy, IconCursor, IconCylinder, IconDelete, IconErase, IconFocus, IconGround, IconGroup, IconLayers, IconModel, IconMove, IconHand, IconPlus, IconRedo, IconRotate, IconSphere, IconTorus, IconUndo, IconUngroup, IconWarning, IconWire, IconEye, IconEyeOff, IconChevronDown, IconRuler } from '../../ui/icons'
import FaceChooser, { chooseFace } from './FaceChooser'
import { useEditorShortcuts } from '../../ui/shortcuts'
import ShortcutHelp, { type ShortcutHelpExtra } from '../../ui/ShortcutHelp'
import { addPartAction, centerOnOrigin, deleteSelection, dropToFloor, duplicateSelection, explodeGlbPart, groupSelection, importGlbAction, mergeGlbParts, nudgeSelection, ungroupSelection } from './partActions'
import { captureCover } from './capture'
import WirePanel from './WirePanel'
import { WiresTab } from './WireInspector'
import { setUpdateInterceptor } from '../../utils/appUpdates'
import type { PartDef } from '../../catalog/types'

const Viewport = lazy(() => import('./Viewport'))
const AUTO_UPDATE_KEY = 'dcsimu:editor:auto-update'

const TABS: Array<[InspectorTab, string]> = [['object', 'Objeto'], ['materials', 'Materiais'], ['terminals', 'Bornes'], ['wires', 'Cabos'], ['lights', 'Luzes'], ['states', 'Estados'], ['interactions', 'Interações'], ['controls', 'Botões'], ['displays', 'Ecrãs'], ['component', 'Componente']]
const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)

const EDITOR3D_HELP: ShortcutHelpExtra[] = [
  { title: 'Ferramentas', items: [
    { keys: '1', action: 'Selecionar' }, { keys: '2', action: 'Borne' }, { keys: '3', action: 'Cabo' },
    { keys: '4', action: 'Apagar' }, { keys: '5', action: 'Arrastar malha' }, { keys: '6', action: 'Medir' },
  ] },
  { title: 'Transformação', items: [
    { keys: 'W', action: 'Mover' }, { keys: 'E', action: 'Rodar' }, { keys: 'R', action: 'Escalar' },
    { keys: 'X', action: 'Alternar espaço local/mundo' }, { keys: 'F · Shift+F', action: 'Enquadrar tudo / seleção' },
    { keys: 'H', action: 'Mostrar/ocultar bornes' }, { keys: 'Setas · Shift+setas · Alt+setas', action: 'Mover 1 mm · 10 mm · em altura' },
  ] },
  { title: 'Cabos', items: [
    { keys: 'Enter', action: 'Terminar cabo livre' }, { keys: 'Backspace', action: 'Remover último ponto do cabo' }, { keys: 'Escape', action: 'Cancelar cabo/medição' },
  ] },
]

const RIBBON: Array<{ id: Ribbon; label: string; hint: string; key: string; icon: typeof IconCursor; simulate: boolean }> = [
  { id: 'select', label: 'Selecionar', hint: 'Selecionar e mover peças, bornes e cabos (clique num cabo para o editar)', key: '1', icon: IconCursor, simulate: true },
  { id: 'terminal', label: 'Borne', hint: 'Clicar na superfície do modelo para criar bornes (escolha a face em «Bornes por vista»)', key: '2', icon: IconPlus, simulate: false },
  { id: 'wire', label: 'Cabo', hint: 'Ligar dois bornes e validar a compatibilidade (cor, secção e terminais em «Novo cabo»)', key: '3', icon: IconWire, simulate: true },
  { id: 'delete', label: 'Apagar', hint: 'Apagar a peça, o borne ou o cabo sob o cursor', key: '4', icon: IconErase, simulate: false },
  { id: 'pan', label: 'Arrastar malha', hint: 'Arrastar a malha com a mão sem rodar a vista (o botão direito também desloca)', key: '5', icon: IconHand, simulate: true },
  { id: 'measure', label: 'Medir', hint: 'Dois cliques (superfície ou borne) medem a distância em mm · Esc cancela', key: '6', icon: IconRuler, simulate: true },
]
const RIBBON_KEYS: Ribbon[] = ['select', 'terminal', 'wire', 'delete', 'pan', 'measure']

const OBJECTS: Array<[PartDef['kind'], string, typeof IconBox]> = [['box', 'Caixa', IconBox], ['cylinder', 'Cilindro', IconCylinder], ['sphere', 'Esfera', IconSphere], ['cone', 'Cone', IconCone], ['torus', 'Anel', IconTorus], ['group', 'Grupo', IconGroup]]

/** Efetiva: «colocar borne» pode ser ligado por outros botões sem passar pela barra. */
function useActiveRibbon(): Ribbon {
  const ribbon = useEditorStore((s) => s.ribbon)
  const placing = useEditorStore((s) => s.placing)
  return placing ? 'terminal' : ribbon === 'terminal' ? 'select' : ribbon
}

/** Menu «Formas»: reúne as primitivas e o GLB numa só entrada (poupa espaço na barra). */
function ShapeMenu({ onImport }: { onImport: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false) }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('pointerdown', close); window.addEventListener('keydown', key)
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', key) }
  }, [open])
  return <div className="ce-menu" ref={ref}>
    <button className={`dc-tool-btn${open ? ' dc-tool-active' : ''}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} title="Adicionar uma forma ou modelo GLB">
      <IconBox size={14} /><span>Formas</span><IconChevronDown size={11} />
    </button>
    {open && <div className="ce-menu-pop" role="menu">
      {OBJECTS.map(([kind, label, Icon]) => <button key={kind} role="menuitem" className="ce-menu-item" onClick={() => { addPartAction(kind); setOpen(false) }}><Icon size={14} />{label}</button>)}
      <span className="ce-menu-sep" />
      <button role="menuitem" className="ce-menu-item" onClick={() => { onImport(); setOpen(false) }}><IconModel size={14} />Importar GLB…</button>
    </div>}
  </div>
}

/** Barra de ferramentas principal — mesma linguagem visual da barra do simulador, agora por grupos. */
function ToolRibbon() {
  const mode = useEditorStore((s) => s.mode)
  const tool = useEditorStore((s) => s.tool)
  const set = useEditorStore((s) => s.set)
  const setRibbon = useEditorStore((s) => s.setRibbon)
  const canUndo = useEditorStore((s) => s.past.length > 0)
  const canRedo = useEditorStore((s) => s.future.length > 0)
  const libraryOpen = useEditorStore((s) => s.libraryOpen)
  const gizmoSpace = useEditorStore((s) => s.gizmoSpace)
  const measurements = useEditorStore((s) => s.measurements.length)
  const terminalCount = useEditorStore((s) => s.def.terminals.length)
  const hiddenCount = useEditorStore((s) => s.hiddenTerminals.length)
  const wireCount = useEditorStore((s) => s.testWires.length)
  const active = useActiveRibbon()
  const editing = mode === 'edit'
  const fileRef = useRef<HTMLInputElement>(null)
  const hasSelection = useEditorStore((s) => !!s.selection)
  const hasPart = useEditorStore((s) => s.selection?.kind === 'part')
  const selectedPartDef = useEditorStore((s) => (s.selection?.kind === 'part' ? s.def.parts.find((part) => part.id === s.selection!.id) : undefined))
  const hasGroup = useEditorStore((s) => s.selectedParts().some((id) => s.def.parts.find((part) => part.id === id)?.kind === 'group'))
  const hasGlb = selectedPartDef?.kind === 'glb'
  const hasPieces = useEditorStore((s) => !!selectedPartDef?.asset && s.def.parts.some((part) => part.parentId === selectedPartDef?.id && !!part.glbNode))
  const hasFocus = useEditorStore((s) => !!s.selection || !!s.selectedWire)
  const allHidden = terminalCount > 0 && hiddenCount >= terminalCount
  return <div className="ce-ribbon" role="toolbar" aria-label="Ferramentas">
    <div className="dc-seg" role="group" aria-label="Histórico">
      <button className="dc-tool-btn !px-2" onClick={() => useEditorStore.getState().undo()} disabled={!canUndo} title="Desfazer [Ctrl+Z]" aria-label="Desfazer"><IconUndo size={13} /></button>
      <button className="dc-tool-btn !px-2" onClick={() => useEditorStore.getState().redo()} disabled={!canRedo} title="Refazer [Ctrl+Y]" aria-label="Refazer"><IconRedo size={13} /></button>
    </div>
    <span className="ce-ribbon-sep" />
    <div className="dc-seg" role="group" aria-label="Ferramenta">
      {RIBBON.map((item) => {
        const Icon = item.icon
        const disabled = !editing && !item.simulate
        return <button key={item.id} className={`dc-tool-btn ${active === item.id ? 'dc-tool-active' : ''}`} disabled={disabled} aria-pressed={active === item.id} onClick={() => setRibbon(item.id)} title={`${item.hint} [${item.key}]`}>
          <Icon size={13} /><span className="hidden lg:inline">{item.label}</span><kbd className="ce-kbd">{item.key}</kbd>
        </button>
      })}
    </div>
    {editing && <>
      <span className="ce-ribbon-sep" />
      <div className="dc-seg" role="group" aria-label="Manipulador" style={active === 'select' ? undefined : { opacity: 0.45 }}>
        {([['translate', 'Mover', 'W', IconMove], ['rotate', 'Rodar', 'E', IconRotate], ['scale', 'Escala', 'R', IconPlus]] as const).map(([id, label, key, Icon]) =>
          <button key={id} className={`dc-tool-btn ${tool === id ? 'dc-tool-active' : ''}`} disabled={active !== 'select'} aria-pressed={tool === id} onClick={() => set({ tool: id })} title={`${label} [${key}]`}><Icon size={13} /><span className="hidden xl:inline">{label}</span><kbd className="ce-kbd">{key}</kbd></button>)}
        <button className="dc-tool-btn" disabled={active !== 'select'} aria-pressed={gizmoSpace === 'world'} onClick={() => set({ gizmoSpace: gizmoSpace === 'local' ? 'world' : 'local' })} title="Eixos do manipulador: locais (da peça) ou globais (do mundo) [X]">{gizmoSpace === 'local' ? 'Local' : 'Global'}</button>
      </div>
    </>}
    {editing && <>
      <span className="ce-ribbon-sep" />
      <ShapeMenu onImport={() => fileRef.current?.click()} />
      <input ref={fileRef} type="file" accept=".glb,model/gltf-binary" hidden onChange={(event) => { void importGlbAction(event.target.files?.[0]).then((error) => error && window.dispatchEvent(new CustomEvent('ce-flash', { detail: error }))); event.target.value = '' }} />
      <div className="dc-seg" role="group" aria-label="Edição">
        <button className="dc-tool-btn !px-2" disabled={!hasPart} onClick={duplicateSelection} title="Duplicar a seleção [Ctrl+D]" aria-label="Duplicar"><IconCopy size={14} /></button>
        <button className="dc-tool-btn !px-2" disabled={!hasPart} onClick={groupSelection} title="Agrupar as peças selecionadas [Ctrl+G]" aria-label="Agrupar"><IconGroup size={14} /></button>
        <button className="dc-tool-btn !px-2" disabled={!hasGroup} onClick={ungroupSelection} title="Desagrupar: devolve as peças ao nível de cima [Ctrl+Shift+G]" aria-label="Desagrupar"><IconUngroup size={14} /></button>
        <button className="dc-tool-btn" disabled={!hasGlb} onClick={(event) => explodeGlbPart(event.shiftKey ? 'meshes' : 'smart')} title="Separar partes: o modelo passa a peças editáveis (manípulo, tampa, botões…), agrupando o que está encostado. Shift+clique separa malha a malha."><IconModel size={13} /><span className="hidden xl:inline">Separar partes</span></button>
        {hasPieces && <button className="dc-tool-btn" onClick={mergeGlbParts} title="Juntar partes: volta a reunir o modelo separado"><IconGroup size={13} /><span className="hidden xl:inline">Juntar partes</span></button>}
        <button className="dc-tool-btn !px-2" disabled={!hasSelection} onClick={deleteSelection} title="Eliminar a seleção [Del]" aria-label="Eliminar"><IconDelete size={14} /></button>
      </div>
      <div className="dc-seg" role="group" aria-label="Posição">
        <button className="dc-tool-btn !px-2" onClick={dropToFloor} title="Pousar o modelo no chão (base a Y = 0; os bornes acompanham)" aria-label="Pousar no chão"><IconGround size={14} /></button>
        <button className="dc-tool-btn !px-2" onClick={centerOnOrigin} title="Centrar o modelo na origem (X/Z)" aria-label="Centrar na origem"><IconAlignCenterH size={14} /></button>
      </div>
    </>}
    <span className="ce-ribbon-sep" />
    <div className="dc-seg" role="group" aria-label="Vista">
      <button className="dc-tool-btn !px-2" onClick={() => useEditorStore.getState().cameraTo('fit')} title="Enquadrar o modelo [F]" aria-label="Enquadrar o modelo"><IconFocus size={14} /></button>
      <button className="dc-tool-btn" disabled={!hasFocus} onClick={() => useEditorStore.getState().cameraTo('fitSel')} title="Enquadrar a seleção (peça, borne ou cabo) [Shift+F]"><span className="hidden xl:inline">Seleção</span><span className="xl:hidden">Sel.</span></button>
    </div>
    {editing && <>
      <span className="ce-ribbon-sep" />
      <div className="dc-seg" role="group" aria-label="Bornes">
        <button className={`dc-tool-btn ${libraryOpen ? 'dc-tool-active' : ''}`} onClick={() => set({ libraryOpen: !libraryOpen })} title="Biblioteca de bornes e perfis de ligação"><IconLayers size={13} /><span className="hidden xl:inline">Biblioteca de bornes</span><span className="xl:hidden">Bornes</span></button>
        <button className="dc-tool-btn !px-2" disabled={terminalCount === 0} aria-pressed={allHidden} onClick={() => useEditorStore.getState().setTerminalsHidden(useEditorStore.getState().def.terminals.map((item) => item.id), !allHidden)}
          title={allHidden ? 'Mostrar todos os bornes' : hiddenCount ? `Ocultar todos os bornes (${hiddenCount} já oculto${hiddenCount > 1 ? 's' : ''}) [H]` : 'Ocultar todos os bornes [H]'} aria-label={allHidden ? 'Mostrar todos os bornes' : 'Ocultar todos os bornes'}>
          {allHidden ? <IconEyeOff size={14} /> : <IconEye size={14} />}{hiddenCount > 0 && !allHidden && <b className="ce-badge">{hiddenCount}</b>}
        </button>
      </div>
    </>}
    {(measurements > 0 || wireCount > 0) && <>
      <span className="ce-ribbon-sep" />
      <div className="dc-seg" role="group" aria-label="Limpar">
        {measurements > 0 && <button className="dc-tool-btn" onClick={() => set({ measurements: [], measureFrom: null })} title="Apagar todas as medições"><IconRuler size={13} /><span className="hidden xl:inline">Limpar medições</span><b className="ce-badge">{measurements}</b></button>}
        {wireCount > 0 && <button className={`dc-tool-btn ${useEditorStore.getState().tab === 'wires' ? 'dc-tool-active' : ''}`} onClick={() => set({ tab: 'wires' })} title="Editar cabos de teste: cor, secção e terminais"><IconWire size={13} /><span className="hidden xl:inline">Cabos</span><b className="ce-badge">{wireCount}</b></button>}
      </div>
    </>}
    <span className="ce-ribbon-hint" aria-live="polite">{RIBBON.find((item) => item.id === active)?.hint}</span>
  </div>
}

/** Barra de estado, igual à do simulador. */
function StatusBar() {
  const def = useEditorStore((s) => s.def)
  const meta = useEditorStore((s) => s.meta)
  const dirty = useEditorStore((s) => s.dirty)
  const mode = useEditorStore((s) => s.mode)
  const snap = useEditorStore((s) => s.snap)
  const selection = useEditorStore((s) => s.selection)
  const wires = useEditorStore((s) => s.testWires)
  const issues = useMemo(() => validateDefinition(def, meta), [def, meta])
  const errors = issues.filter((issue) => issue.level === 'error').length
  const warnings = issues.length - errors
  const selected = selection?.kind === 'terminal' ? `borne ${def.terminals.find((item) => item.id === selection.id)?.label ?? ''}` : selection?.kind === 'part' ? def.parts.find((item) => item.id === selection.id)?.name : selection?.kind === 'light' ? 'luz' : ''
  return <footer className="ce-statusbar">
    <span className="ce-status-brand">DC·SIMU <span>editor de componentes</span></span>
    <span className="ce-status-sep" />
    <span className="ce-status-truncate"><span className="ce-status-dim">Componente:</span> <b>{meta.name || 'Sem nome'}</b>{dirty && <span className="ce-status-dirty" title="Alterações por guardar"> •</span>}</span>
    <span className="ce-status-sep" />
    <span className={`ce-status-mode${mode === 'simulate' ? ' is-sim' : ''}`}><i />{mode === 'simulate' ? 'SIMULAR' : 'EDITAR'}</span>
    <span className="ce-status-counts">{def.parts.length} peça(s) · {def.terminals.length} borne(s) · {def.lights.length} luz(es){wires.length ? ` · ${wires.length} cabo(s) de teste` : ''}</span>
    <span className={errors ? 'ce-status-err' : 'ce-status-dim'}>{errors} erro(s)</span><span className="ce-status-dim">·</span><span className={warnings ? 'ce-status-warn' : 'ce-status-dim'}>{warnings} aviso(s)</span>
    <span className="ce-status-spacer" />
    {selected && <span className="ce-status-dim">Seleção: <b>{selected}</b></span>}
    <span className="ce-status-mono">snap {snap.on ? `${snap.mm} mm · ${snap.deg}°` : 'desligado'}</span>
  </footer>
}

function ViewToolbar() {
  const view = useEditorStore((s) => s.view)
  const setView = useEditorStore((s) => s.setView)
  const cameraTo = useEditorStore((s) => s.cameraTo)
  const snap = useEditorStore((s) => s.snap)
  const set = useEditorStore((s) => s.set)
  const mode = useEditorStore((s) => s.mode)
  return <div className="ce-viewbar" role="toolbar" aria-label="Vista 3D">
    <div className="ce-group" aria-label="Câmara">
      {([['fit', 'Enquadrar'], ['iso', 'ISO']] as const).map(([kind, label]) => <button key={kind} className="ce-tool" onClick={() => cameraTo(kind)} title={kind === 'fit' ? 'Enquadrar o modelo (F)' : 'Vista isométrica'}>{label}</button>)}
    </div>
    <div className="ce-group" aria-label="Cena">
      <button className={`ce-tool${view.grid ? ' is-on' : ''}`} onClick={() => setView({ grid: !view.grid })} title="Grelha de pontos do fundo (como no simulador)">Grelha</button>
      <button className={`ce-tool${view.floor ? ' is-on' : ''}`} onClick={() => setView({ floor: !view.floor })} title="Chão com escala de 10 mm">Chão</button>
      <button className={`ce-tool${view.axes ? ' is-on' : ''}`} onClick={() => setView({ axes: !view.axes })}>Eixos</button>
      <button className={`ce-tool${view.terminals ? ' is-on' : ''}`} onClick={() => setView({ terminals: !view.terminals })}>Rótulos</button>
      <button className={`ce-tool${view.bounds ? ' is-on' : ''}`} onClick={() => setView({ bounds: !view.bounds })}>Caixa</button>
      <button className={`ce-tool${view.dark ? ' is-on' : ''}`} onClick={() => setView({ dark: !view.dark })}>Fundo escuro</button>
    </div>
    {mode === 'edit' && <div className="ce-group" aria-label="Ajuste">
      <button className={`ce-tool${snap.on ? ' is-on' : ''}`} onClick={() => set({ snap: { ...snap, on: !snap.on } })} title="Ajuste a incrementos">Snap</button>
      <Select className="ce-mini" value={snap.mm} onChange={(event) => set({ snap: { ...snap, mm: Number(event.target.value) } })} aria-label="Passo em mm">{[0.5, 1, 2, 5, 10].map((value) => <option key={value} value={value}>{value} mm</option>)}</Select>
      <Select className="ce-mini" value={snap.deg} onChange={(event) => set({ snap: { ...snap, deg: Number(event.target.value) } })} aria-label="Passo angular">{[1, 5, 15, 45, 90].map((value) => <option key={value} value={value}>{value}°</option>)}</Select>
    </div>}
  </div>
}


/** Cubo de vista igual ao do simulador: arrastar orbita, clicar numa face enquadra-a. */
function CubeOverlay() {
  const angles = useEditorStore((s) => s.camAngles)
  const set = useEditorStore((s) => s.set)
  const cameraTo = useEditorStore((s) => s.cameraTo)
  return <ViewCube yaw={angles.yaw} pitch={angles.pitch} placement="top"
    onPick={(view: ViewCubeFace) => cameraTo(view === 'isometric' ? 'iso' : view)}
    onAngles={(yaw, pitch) => set({ viewCommand: { kind: 'angles', n: Date.now(), yaw, pitch } })}
    onOrbit={(dx, dy) => set({ viewCommand: { kind: 'orbit', n: Date.now(), dx, dy } })} />
}

/** Barra compacta «Bornes por vista» sobre o viewport (a versão com miniaturas está no separador Bornes). */
function FaceBar() {
  const terminals = useEditorStore((s) => s.def.terminals)
  const faceLock = useEditorStore((s) => s.faceLock)
  const placing = useEditorStore((s) => s.placing)
  const placingSpec = useEditorStore((s) => s.placingSpec)
  const set = useEditorStore((s) => s.set)
  const counts = faceCounts(terminals)
  return <div className="ce-facebar" role="toolbar" aria-label="Bornes por vista">
    <span className="ce-facebar-title">Bornes por vista</span>
    {FACES.map(([face, label]) => <button key={face} className={`ce-face${faceLock === face ? ' is-on' : ''}`} onClick={() => chooseFace(face)}
      title={`Ver ${label.toLowerCase()} e fixar a saída dos novos bornes nessa face`}>{label}<b>{counts[face]}</b></button>)}
    <span className="ce-facebar-sep" />
    <button className={`ce-face ce-face-add${placing ? ' is-on' : ''}`} onClick={() => useEditorStore.getState().setRibbon(placing ? 'select' : 'terminal')} title="Clique no modelo para colocar bornes (Esc termina)"><IconPlus size={12} />{placing ? (placingSpec ? `A colocar ${placingSpec.label}` : 'A adicionar…') : 'Adicionar'}</button>
    {faceLock && <button className="ce-face" onClick={() => set({ faceLock: null })} title="Voltar à normal da superfície clicada">Face livre</button>}
  </div>
}

function LibraryPanel() {
  const def = useEditorStore((s) => s.def)
  const meta = useEditorStore((s) => s.meta)
  const placingSpec = useEditorStore((s) => s.placingSpec)
  const set = useEditorStore((s) => s.set)
  const flash = (text: string) => window.dispatchEvent(new CustomEvent('ce-flash', { detail: text }))
  return <aside className="ce-lib-panel" aria-label="Biblioteca de bornes">
    <div className="ce-lib-head"><span>Biblioteca de bornes</span><button className="ce-icon" onClick={() => set({ libraryOpen: false })} title="Fechar" aria-label="Fechar"><IconClose size={13} /></button></div>
    <TerminalLibrary mode="insert" canEdit suggestFor={meta.category} armedLabel={placingSpec?.label ?? null}
      onInsert={(profile, params, replace) => { const n = applyProfile(profile, params, replace); flash(`${profile.name}: ${n} bornes adicionados — editáveis na lista à esquerda.`) }}
      onArmChip={(spec: TerminalSpec) => set({ placing: true, placingSpec: spec, selection: null })}
      currentSpecs={() => specsFromTerminals(def.terminals)} />
  </aside>
}

/** Atualiza a capa do componente (vista isométrica do modelo) antes de guardar/publicar, salvo se for uma capa manual. */
export function applyCover(): void {
  const state = useEditorStore.getState()
  if (state.meta.coverLocked) return
  const url = captureCover('iso')
  if (url && url !== state.meta.thumbnail) useEditorStore.setState({ meta: { ...state.meta, thumbnail: url } })
}

function PublishDialog({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) {
  const def = useEditorStore((s) => s.def)
  const meta = useEditorStore((s) => s.meta)
  const baseline = useEditorStore((s) => s.baseline)
  const entry = useEditorStore((s) => s.entry)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const issues = useMemo(() => validateDefinition(def, meta), [def, meta])
  const changes = useMemo(() => describeChanges(baseline, def), [baseline, def])
  const blocked = issues.some((issue) => issue.level === 'error')
  const next = (entry?.latestVersion ?? 0) + 1

  async function publish() {
    if (!entry) return
    setBusy(true); setError('')
    try {
      await loadGlbAssets(def, glbCache)
      const runtime = runtimeSpec(def, boundsMm(def, glbCache))
      const glb = await bakeGlb(def, glbCache)
      if (glb.length > 6_000_000) throw new Error('O modelo 3D resultante é demasiado grande (máx. ≈ 4,5 MB). Simplifique os modelos GLB importados.')
      applyCover()
      await catalogApi.save(entry.id, useEditorStore.getState().meta, def)
      const published = await catalogApi.publish(entry.id, { note, changes, runtime, glb })
      useEditorStore.getState().markSaved(published)
      await useCatalogStore.getState().load()
      onDone(`«${meta.name}» publicado como v${published.latestVersion}.`)
    } catch (value) { setError(value instanceof Error ? value.message : 'Falha ao publicar'); setBusy(false) }
  }

  return <div className="ce-modal" role="dialog" aria-modal="true" aria-label="Publicar nova versão">
    <div className="ce-modal-card">
      <h2>Publicar v{next}</h2>
      <p className="ce-hint">{next === 1 ? 'Torna o componente disponível na biblioteca de todos os utilizadores.' : 'Projetos existentes continuam na versão atual. Cada utilizador recebe um aviso e escolhe quando atualizar; cópias independentes nunca são alteradas.'}</p>
      <h3>Alterações</h3>
      <ul className="ce-changes">{changes.map((change) => <li key={change}>{change}</li>)}</ul>
      {issues.length > 0 && <ul className="ce-issues">{issues.map((issue, index) => <li key={index} className={`is-${issue.level}`}>{issue.text}</li>)}</ul>}
      <label className="ce-field is-wide"><span>Nota da versão (opcional)</span><textarea className="dx-input" rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="O que mudou nesta versão?" /></label>
      {error && <p className="ce-error" role="alert">{error}</p>}
      <div className="ce-modal-actions">
        <button className="dx-btn dx-btn-secondary" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="dx-btn dx-btn-primary" disabled={blocked || busy} onClick={() => void publish()}>{busy ? 'A publicar…' : `Publicar v${next}`}</button>
      </div>
    </div>
  </div>
}

/** Nova versão da aplicação: o utilizador escolhe quando atualizar; o rascunho é guardado antes de recarregar. */
function UpdateDialog({ dirty, onAnswer }: { dirty: boolean; onAnswer: (accept: boolean, always?: boolean) => void }) {
  const [always, setAlways] = useState(false)
  return <div className="ce-modal" role="dialog" aria-modal="true" aria-label="Atualização disponível">
    <div className="ce-modal-card">
      <h2>Nova versão do DC-SIMU</h2>
      <p className="ce-hint">{dirty ? 'O rascunho do componente será guardado automaticamente e o editor recarrega na nova versão.' : 'O editor recarrega na nova versão. Não há alterações por guardar.'}</p>
      <label className="ce-check"><input type="checkbox" checked={always} onChange={(event) => setAlways(event.target.checked)} />Atualizar sempre de forma automática (guardando o rascunho)</label>
      <div className="ce-modal-actions">
        <button className="dx-btn dx-btn-secondary" onClick={() => onAnswer(false)}>Mais tarde</button>
        <button className="dx-btn dx-btn-primary" autoFocus onClick={() => onAnswer(true, always)}>Atualizar agora</button>
      </div>
    </div>
  </div>
}

export default function ComponentEditor3D({ id, onClose, account }: { id: string; onClose: (message?: string) => void; /** Avatar e notificações (mesmos do simulador). */ account?: ReactNode }) {
  const entry = useEditorStore((s) => s.entry)
  const meta = useEditorStore((s) => s.meta)
  const def = useEditorStore((s) => s.def)
  const dirty = useEditorStore((s) => s.dirty)
  const mode = useEditorStore((s) => s.mode)
  const tab = useEditorStore((s) => s.tab)
  const editState = useEditorStore((s) => s.editState)
  const previewState = useEditorStore((s) => s.previewState)
  const placing = useEditorStore((s) => s.placing)
  const glbRevision = useEditorStore((s) => s.glbRevision)
  const set = useEditorStore((s) => s.set)
  const navigate = useNavigate()
  const location = useLocation()
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [dropping, setDropping] = useState(false)
  const [mobilePane, setMobilePane] = useState<'canvas' | 'objects' | 'inspector'>('canvas')
  useEffect(() => {
    const openInspector = () => setMobilePane('inspector')
    window.addEventListener('ce-open-inspector', openInspector)
    return () => window.removeEventListener('ce-open-inspector', openInspector)
  }, [])
  const faceLock = useEditorStore((s) => s.faceLock)
  const faceLockLabel = FACES.find(([id]) => id === faceLock)?.[1]
  const view = useEditorStore((s) => s.view)
  const libraryOpen = useEditorStore((s) => s.libraryOpen)
  const activeRibbon = useActiveRibbon()
  useEffect(() => { const handler = (event: Event) => setMessage(String((event as CustomEvent).detail)); window.addEventListener('ce-flash', handler); return () => window.removeEventListener('ce-flash', handler) }, [])

  useEffect(() => {
    let cancelled = false
    catalogApi.adminGet(id).then(async (loaded) => {
      if (cancelled) return
      const origin = loaded.meta.properties?.find((item) => item.key === 'Origem')?.value ?? ''
      const breakerOrigin = /(breaker|phoenixEcb|motorBreaker|residualBreaker)/.test(origin)
      if (breakerOrigin && loaded.draft && !(loaded.draft.controls?.length)) {
        const partId = loaded.draft.parts[0]?.id
        if (partId) loaded = { ...loaded, draft: { ...loaded.draft,
          vars: [...(loaded.draft.vars ?? []), { id: 'closed', name: 'Disjuntor fechado', type: 'bool', initial: true }, { id: 'tripped', name: 'Disparado', type: 'bool', initial: false }],
          controls: [{ id: 'builtin-breaker-toggle', name: 'Liga / desliga', kind: 'toggle', partId, axis: [0, 1, 0], travelMm: 0, bindVar: 'closed', positions: [], actions: [{ type: 'toggleVar', var: 'closed' }] }],
        } }
      }
      // Multímetro e motor importados antes: acrescenta botões, LCD e a placa
      // de bornes aos rascunhos que ainda não os têm.
      if (loaded.draft && /multimeterDm20|motor3ph/.test(origin)) {
        const type = /multimeterDm20/.test(origin) ? 'multimeterDm20' : 'motor3ph'
        const upgraded = await upgradeBuiltinDraft(type, loaded.draft)
        if (cancelled) return
        if (upgraded) loaded = { ...loaded, draft: upgraded }
      }
      // Remove o antigo botão artificial e liga o controlo diretamente ao
      // manípulo azul, agora isolado como nó WEG_Handle dentro do próprio GLB.
      if (/breakerWegMdwC10/.test(origin) && loaded.draft) {
        const artificial = new Set(loaded.draft.parts.filter((part) => part.name === 'Alavanca liga / desliga' && part.kind !== 'glb').map((part) => part.id))
        const glbPart = loaded.draft.parts.find((part) => part.kind === 'glb')
        if (glbPart) loaded = { ...loaded, draft: { ...loaded.draft,
          parts: loaded.draft.parts.filter((part) => !artificial.has(part.id)),
          // só liga o controlo antigo (ainda sem objetos nem movimento próprio); nunca repõe o que o utilizador já ajustou
          controls: (loaded.draft.controls ?? []).map((control) => control.name === 'Liga / desliga' && !control.nodes?.length && !control.motion ? { ...control, partId: glbPart.id, nodes: ['WEG_Handle'], axis: [1, 0, 0] as [number, number, number], travelMm: 8 } : control.name === 'Liga / desliga' ? { ...control, partId: glbPart.id } : control),
        } }
      }
      useEditorStore.getState().open(loaded)
      if (await loadGlbAssets(useEditorStore.getState().def, glbCache)) useEditorStore.getState().bumpGlb()
    }).catch((value) => !cancelled && setLoadError(value instanceof Error ? value.message : 'Não foi possível abrir o componente'))
    return () => { cancelled = true }
  }, [id])

  const [autosave, setAutosave] = useState<{ state: 'idle' | 'saving' | 'error'; at: number | null }>({ state: 'idle', at: null })
  const savingRef = useRef(false)
  /** Grava o rascunho. `silent` (auto-guardar) não mostra mensagem; a capa é sempre atualizada (salvo capa manual). Nunca perde alterações feitas durante o pedido. */
  const persist = useCallback(async (silent: boolean): Promise<boolean> => {
    const initial = useEditorStore.getState()
    if (!initial.entry || savingRef.current) return false
    savingRef.current = true
    setSaving(true)
    setAutosave((current) => ({ ...current, state: 'saving' }))
    try {
      applyCover()
      const { def: sentDef, meta: sentMeta, entry: current } = useEditorStore.getState()
      const saved = await catalogApi.save(current!.id, sentMeta, sentDef)
      useEditorStore.getState().markSaved(saved)
      const after = useEditorStore.getState()
      if (after.def !== sentDef || after.meta !== sentMeta) useEditorStore.setState({ dirty: true })
      setAutosave({ state: 'idle', at: Date.now() })
      if (!silent) setMessage('Rascunho guardado.')
      return true
    } catch (value) {
      setAutosave((current) => ({ ...current, state: 'error' }))
      setMessage(value instanceof Error ? value.message : 'Falha ao guardar')
      return false
    } finally { savingRef.current = false; setSaving(false) }
  }, [])
  const save = useCallback(() => persist(false), [persist])

  // auto-guardar: 5 s depois da última alteração (só rascunho; publicar continua manual)
  useEffect(() => {
    if (!dirty || !entry || entry.id !== id) return
    const timer = window.setTimeout(() => { void persist(true) }, 5000)
    return () => window.clearTimeout(timer)
  }, [dirty, def, meta, entry?.id, id, persist])

  // atualização da aplicação: pergunta (ou atualiza sozinho) e guarda o rascunho antes de recarregar
  const [updateAsk, setUpdateAsk] = useState<((accept: boolean, always?: boolean) => void) | null>(null)
  useEffect(() => setUpdateInterceptor(async () => {
    const flush = async () => { if (!useEditorStore.getState().dirty) return true; savingRef.current = false; return persist(true) }
    let auto = false
    try { auto = localStorage.getItem(AUTO_UPDATE_KEY) === '1' } catch { /* sem localStorage: pergunta sempre */ }
    if (auto) return flush()
    const accepted = await new Promise<boolean>((resolve) => {
      setUpdateAsk(() => (accept: boolean, always?: boolean) => {
        if (accept && always) { try { localStorage.setItem(AUTO_UPDATE_KEY, '1') } catch { /* ignorar */ } }
        setUpdateAsk(null)
        resolve(accept)
      })
    })
    return accepted ? flush() : false
  }), [persist])

  const leave = useCallback((text?: string) => {
    if (!text && useEditorStore.getState().dirty && !window.confirm('Há alterações por guardar. Sair mesmo assim?')) return
    useEditorStore.setState({ entry: null })
    onClose(text)
  }, [onClose])

  useEffect(() => { if (!message) return; const timer = window.setTimeout(() => setMessage(''), 3500); return () => window.clearTimeout(timer) }, [message])
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (useEditorStore.getState().dirty) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const state = useEditorStore.getState()
      const mod = event.ctrlKey || event.metaKey
      if (mod && event.key.toLowerCase() === 's') { event.preventDefault(); void save(); return }
      if (isTyping(event.target) || publishing || helpOpen) return
      if (mod && event.key.toLowerCase() === 'd' && state.mode === 'edit') { event.preventDefault(); duplicateSelection(); return }
      if (mod && event.key.toLowerCase() === 'g' && state.mode === 'edit') { event.preventDefault(); event.shiftKey ? ungroupSelection() : groupSelection(); return }
      const key = event.key.toLowerCase()
      if (!mod && !event.altKey && ['1', '2', '3', '4', '5', '6'].includes(key)) {
        const pick = RIBBON_KEYS[Number(key) - 1]
        if (state.mode === 'edit' || pick === 'select' || pick === 'wire' || pick === 'pan' || pick === 'measure') { event.preventDefault(); state.setRibbon(pick) }
        return
      }
      const drafting = !!(state.wireFrom || state.wireStart)
      if (state.measureFrom && key === 'escape') { state.set({ measureFrom: null }); return }
      if (state.selectedWire && !state.selection && !drafting && ['delete', 'backspace'].includes(key) && state.ribbon !== 'measure') { event.preventDefault(); state.removeWire(state.selectedWire); return }
      if (drafting && key === 'escape') { state.cancelWire(); return }
      if (drafting && key === 'enter') { event.preventDefault(); const problem = state.finishWireFree(); if (problem) setMessage(problem); return }
      if (drafting && (key === 'backspace' || key === 'delete')) { event.preventDefault(); state.undoWirePoint(); return }
      if (state.mode !== 'edit') return
      if (key === 'w') state.set({ tool: 'translate' })
      else if (key === 'e') state.set({ tool: 'rotate' })
      else if (key === 'r') state.set({ tool: 'scale' })
      else if (key === 'f') state.cameraTo(event.shiftKey ? 'fitSel' : 'fit')
      else if (key === 'x') state.set({ gizmoSpace: state.gizmoSpace === 'local' ? 'world' : 'local' })
      else if (key === 'h') { const ids = state.def.terminals.map((item) => item.id); state.setTerminalsHidden(ids, state.hiddenTerminals.length < ids.length) }
      else if (key === 'escape') { if (state.placing) state.set({ placing: false, placingSpec: null, ribbon: 'select' }); else if (state.ribbon !== 'select') state.setRibbon('select'); else if (state.faceLock) state.set({ faceLock: null }); else state.select(null) }
      else if ((key === 'delete' || key === 'backspace') && state.selection) { event.preventDefault(); deleteSelection() }
      else if (state.selection && event.key.startsWith('Arrow')) {
        // Setas afinam a posição: 1 mm, 10 mm com Shift; Alt move em altura.
        event.preventDefault()
        const step = event.shiftKey ? 10 : 1
        const sign = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -step : step
        const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight'
        if (horizontal) nudgeSelection(sign, 0, 0)
        else if (event.altKey) nudgeSelection(0, 0, sign)
        else nudgeSelection(0, -sign, 0)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save, publishing, helpOpen])

  // Atalhos universais, iguais aos do esquema 2D, do ladder e do GRAFCET.
  useEditorShortcuts({
    undo: () => useEditorStore.getState().undo(),
    redo: () => useEditorStore.getState().redo(),
    fitView: () => useEditorStore.getState().cameraTo('fit'),
    help: () => setHelpOpen((open) => !open),
  }, { enabled: !publishing && !helpOpen })

  // A rota e o título mostram sempre o dispositivo em edição:
  // /admin/editor/<id>/<nome-do-dispositivo>
  useEffect(() => {
    if (!meta.name) return
    const target = ROUTES.adminEditor(id, meta.name)
    if (location.pathname !== target) navigate(target, { replace: true })
    const previous = document.title
    document.title = `${meta.name} · Editor de componentes · DC-SIMU`
    return () => { document.title = previous }
  }, [id, meta.name, location.pathname, navigate])

  const dims = useMemo(() => {
    const box = boundsMm(def, glbCache)
    const size = box.getSize(box.min.clone())
    return `${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} mm`
  }, [def.parts, def.assets, glbRevision])

  if (loadError) return <div className="ce-root"><div className="ce-loading"><p className="ce-error">{loadError}</p><button className="dx-btn dx-btn-secondary" onClick={() => onClose()}>Voltar</button></div></div>
  if (!entry || entry.id !== id) return <div className="ce-root"><div className="ce-loading">A abrir o editor…</div></div>
  const status = entry.latestVersion === 0 ? 'Rascunho' : dirty ? `v${entry.latestVersion} · alterações por publicar` : `Publicado v${entry.latestVersion}`
  const stateName = editState === BASE_STATE ? 'Pose base' : def.states.find((state) => state.id === editState)?.name

  return <div className="ce-root" role="application" aria-label="Editor 3D de componentes">
    <header className="ce-top account-bar">
      <Logo size={22} tagline={false} />
      <span className="dx-bar-sep">/</span>
      <div className="ce-title"><strong>{meta.name || 'Sem nome'}</strong><span className={`ce-status${entry.latestVersion ? ' is-pub' : ''}${dirty ? ' is-dirty' : ''}`}>{status}</span>
        <span className={`ce-autosave is-${autosave.state}${dirty ? ' is-pending' : ''}`} title="O rascunho é guardado automaticamente 5 s depois da última alteração">
          {autosave.state === 'saving' ? 'A guardar…' : autosave.state === 'error' ? 'Falha ao guardar — nova tentativa na próxima alteração' : dirty ? 'Por guardar…' : autosave.at ? `Guardado ${new Date(autosave.at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}` : ''}
        </span></div>
      <div className="ce-modes" role="tablist" aria-label="Modo">
        <button role="tab" aria-selected={mode === 'edit'} className={mode === 'edit' ? 'is-on' : ''} onClick={() => set({ mode: 'edit', placing: false })}>Editar</button>
        <button role="tab" aria-selected={mode === 'simulate'} className={mode === 'simulate' ? 'is-on' : ''} onClick={() => set({ mode: 'simulate', previewState: previewState || def.initialState, placing: false, ribbon: useEditorStore.getState().ribbon === 'terminal' || useEditorStore.getState().ribbon === 'delete' ? 'select' : useEditorStore.getState().ribbon })}>Simular</button>
      </div>
      <div className="ce-spacer" />
      {message && <span className="ce-flash" role="status">{message}</span>}
      <button className="account-project-action" onClick={() => setHelpOpen(true)} title="Atalhos de teclado (F1)" aria-label="Atalhos de teclado">?</button>
      <button className="account-project-action" onClick={() => leave()}><IconArrowLeft size={13} />Biblioteca</button>
      <button className="account-project-action" onClick={() => void save()} disabled={saving || !dirty} title="Guardar rascunho (Ctrl+S)">{saving ? 'A guardar…' : 'Guardar rascunho'}</button>
      <button className="account-project-action dx-bar-primary" onClick={() => setPublishing(true)}>Publicar…</button>
      {account}
    </header>
    <ToolRibbon />
    <nav className="ce-mobile-panes" aria-label="Área do editor">
      <button className={mobilePane === 'canvas' ? 'is-on' : ''} onClick={() => setMobilePane('canvas')}>Canvas 3D</button>
      <button className={mobilePane === 'objects' ? 'is-on' : ''} onClick={() => setMobilePane('objects')}>Objetos</button>
      <button className={mobilePane === 'inspector' ? 'is-on' : ''} onClick={() => setMobilePane('inspector')}>Propriedades</button>
    </nav>
    <div className={`ce-body ce-mobile-${mobilePane}`}>
      <Hierarchy />
      <main className={`ce-stage is-tool-${activeRibbon}${view.grid ? '' : ' no-grid'}${view.dark ? ' is-dark' : ''}${dropping ? ' is-dropping' : ''}${libraryOpen && mode === 'edit' ? ' lib-open' : ''}`}
        onDragOver={(event) => { if (mode === 'edit' && (event.dataTransfer.types.includes(DND_PROFILE) || event.dataTransfer.types.includes(DND_TERMINAL))) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; if (!dropping) setDropping(true) } }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropping(false) }}
        onDrop={(event) => {
          setDropping(false)
          const profileData = event.dataTransfer.getData(DND_PROFILE), terminalData = event.dataTransfer.getData(DND_TERMINAL)
          if (!profileData && !terminalData) return
          event.preventDefault()
          if (terminalData) { set({ dropRequest: { spec: JSON.parse(terminalData) as TerminalSpec, x: event.clientX, y: event.clientY, n: Date.now() } }); return }
          const { id, params } = JSON.parse(profileData) as { id: string; params: Record<string, boolean | number | string> }
          const profile = allProfiles(useProfileStore.getState().custom).find((item) => item.id === id) ?? BUILTIN_PROFILES.find((item) => item.id === id)
          if (profile) { const n = applyProfile(profile, { ...defaultParams(profile), ...params }, false); setMessage(`${profile.name}: ${n} bornes adicionados.`) }
        }}>
        <ViewToolbar />
        <CubeOverlay />
        {mode === 'edit' && tab !== 'terminals' && (placing || faceLock) && <FaceBar />}
        {(mode === 'simulate' || activeRibbon === 'wire') && <WirePanel />}
        {libraryOpen && mode === 'edit' && <LibraryPanel />}
        <div className="ce-canvas"><Suspense fallback={<div className="ce-loading">A carregar o motor 3D…</div>}><Viewport /></Suspense></div>
        <div className="ce-stage-info">
          <span>{dims}</span>
          {mode === 'edit' && <span className="ce-pill">{editState === BASE_STATE ? 'A editar: pose base' : `A editar estado: ${stateName}`}</span>}
          {mode === 'simulate' && <span className="ce-pill is-sim">Simulação · clique nas peças</span>}
          {placing && <span className="ce-pill is-place">{faceLockLabel ? `Face ${faceLockLabel}: clique no modelo para colocar bornes` : 'Clique numa face para colocar o borne'} · Esc termina</span>}
        </div>
        {mode === 'simulate' && <div className="ce-simbar"><span>Estado:</span>
          {def.states.map((state) => <button key={state.id} className={`ce-chip${previewState === state.id ? ' is-on' : ''}`} onClick={() => set({ previewState: state.id })}>{state.name}</button>)}
          <small>{resolveState(def, previewState).name}</small>
        </div>}
        {mode === 'edit' && editState !== BASE_STATE && <div className="ce-simbar"><span>Estados:</span>
          <button className="ce-chip" onClick={() => set({ editState: BASE_STATE })}>Voltar à pose base</button></div>}
      </main>
      <aside className="ce-right" aria-label="Inspetor">
        <div className="ce-tabs" role="tablist">{TABS.map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'is-on' : ''} onClick={() => set({ tab: key })}>{label}</button>)}</div>
        <div className="ce-inspector">
          {tab === 'object' && <ObjectTab />}{tab === 'materials' && <MaterialsTab />}{tab === 'terminals' && <TerminalsTab />}
          {tab === 'wires' && <WiresTab />}{tab === 'lights' && <LightsTab />}{tab === 'states' && <StatesTab />}{tab === 'interactions' && <InteractionsTab />}{tab === 'controls' && <ControlsTab />}{tab === 'displays' && <DisplaysTab />}{tab === 'component' && <ComponentTab />}
        </div>
      </aside>
    </div>
    <StatusBar />
    <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} editor="Editor 3D de componentes" extra={EDITOR3D_HELP} />
    {updateAsk && <UpdateDialog dirty={dirty} onAnswer={updateAsk} />}
    {publishing && <PublishDialog onClose={() => setPublishing(false)} onDone={(text) => { setPublishing(false); leave(text) }} />}
  </div>
}
