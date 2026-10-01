import { Suspense, lazy, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { bakeGlb, boundsMm, describeChanges, loadGlbAssets, resolveState, runtimeSpec } from '../../catalog/definition'
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
import { validateDefinition } from './validate'
import Logo from '../../ui/Brand'
import { IconCursor, IconErase, IconLayers, IconMove, IconPan, IconPlus, IconRedo, IconRotate, IconUndo, IconWire } from '../../ui/icons'

const Viewport = lazy(() => import('./Viewport'))

const TABS: Array<[InspectorTab, string]> = [['object', 'Objeto'], ['materials', 'Materiais'], ['terminals', 'Bornes'], ['lights', 'Luzes'], ['states', 'Estados'], ['interactions', 'Interações'], ['component', 'Componente']]
const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)


const RIBBON: Array<{ id: Ribbon; label: string; hint: string; key: string; icon: typeof IconCursor; simulate: boolean }> = [
  { id: 'select', label: 'Selecionar', hint: 'Selecionar e mover peças e bornes', key: '1', icon: IconCursor, simulate: true },
  { id: 'terminal', label: 'Borne', hint: 'Clicar na superfície do modelo para criar bornes (escolha a face em «Bornes por vista»)', key: '2', icon: IconPlus, simulate: false },
  { id: 'wire', label: 'Cabo', hint: 'Ligar dois bornes e validar a compatibilidade', key: '3', icon: IconWire, simulate: true },
  { id: 'delete', label: 'Apagar', hint: 'Apagar a peça ou o borne sob o cursor', key: '4', icon: IconErase, simulate: false },
  { id: 'pan', label: 'Mover vista', hint: 'Arrastar para mover a vista (ou botão direito)', key: '5', icon: IconPan, simulate: true },
]

/** Efetiva: «colocar borne» pode ser ligado por outros botões sem passar pela barra. */
function useActiveRibbon(): Ribbon {
  const ribbon = useEditorStore((s) => s.ribbon)
  const placing = useEditorStore((s) => s.placing)
  return placing ? 'terminal' : ribbon === 'terminal' ? 'select' : ribbon
}

/** Barra de ferramentas principal — mesma linguagem visual da barra do simulador. */
function ToolRibbon() {
  const mode = useEditorStore((s) => s.mode)
  const tool = useEditorStore((s) => s.tool)
  const set = useEditorStore((s) => s.set)
  const setRibbon = useEditorStore((s) => s.setRibbon)
  const canUndo = useEditorStore((s) => s.past.length > 0)
  const canRedo = useEditorStore((s) => s.future.length > 0)
  const libraryOpen = useEditorStore((s) => s.libraryOpen)
  const active = useActiveRibbon()
  const editing = mode === 'edit'
  return <div className="ce-ribbon" role="toolbar" aria-label="Ferramentas">
    <div className="dc-seg" role="group" aria-label="Histórico">
      <button className="dc-tool-btn !px-2" onClick={() => useEditorStore.getState().undo()} disabled={!canUndo} title="Desfazer [Ctrl+Z]"><IconUndo size={13} /></button>
      <button className="dc-tool-btn !px-2" onClick={() => useEditorStore.getState().redo()} disabled={!canRedo} title="Refazer [Ctrl+Y]"><IconRedo size={13} /></button>
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
    {editing && active === 'select' && <>
      <span className="ce-ribbon-sep" />
      <div className="dc-seg" role="group" aria-label="Manipulador">
        {([['translate', 'Mover', 'W', IconMove], ['rotate', 'Rodar', 'E', IconRotate], ['scale', 'Escala', 'R', IconPlus]] as const).map(([id, label, key, Icon]) =>
          <button key={id} className={`dc-tool-btn ${tool === id ? 'dc-tool-active' : ''}`} aria-pressed={tool === id} onClick={() => set({ tool: id })} title={`${label} [${key}]`}><Icon size={13} /><span className="hidden xl:inline">{label}</span><kbd className="ce-kbd">{key}</kbd></button>)}
      </div>
    </>}
    {editing && <>
      <span className="ce-ribbon-sep" />
      <button className={`dc-tool-btn ${libraryOpen ? 'dc-tool-active' : ''}`} onClick={() => set({ libraryOpen: !libraryOpen })} title="Biblioteca de bornes e perfis de ligação"><IconLayers size={13} /><span>Biblioteca de bornes</span></button>
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
      <select className="ce-mini" value={snap.mm} onChange={(event) => set({ snap: { ...snap, mm: Number(event.target.value) } })} aria-label="Passo em mm">{[0.5, 1, 2, 5, 10].map((value) => <option key={value} value={value}>{value} mm</option>)}</select>
      <select className="ce-mini" value={snap.deg} onChange={(event) => set({ snap: { ...snap, deg: Number(event.target.value) } })} aria-label="Passo angular">{[1, 5, 15, 45, 90].map((value) => <option key={value} value={value}>{value}°</option>)}</select>
    </div>}
  </div>
}


/** Cubo de vista igual ao do simulador: arrastar orbita, clicar numa face enquadra-a. */
function CubeOverlay() {
  const angles = useEditorStore((s) => s.camAngles)
  const set = useEditorStore((s) => s.set)
  const cameraTo = useEditorStore((s) => s.cameraTo)
  return <ViewCube yaw={angles.yaw} pitch={angles.pitch} placement="below-command"
    onPick={(view: ViewCubeFace) => cameraTo(view === 'isometric' ? 'iso' : view)}
    onAngles={(yaw, pitch) => set({ viewCommand: { kind: 'angles', n: Date.now(), yaw, pitch } })}
    onOrbit={(dx, dy) => set({ viewCommand: { kind: 'orbit', n: Date.now(), dx, dy } })} />
}

/** «Bornes por vista»: escolhe a face (câmara + normal fixa) e adiciona bornes nela, como no simulador. */
function FaceBar() {
  const terminals = useEditorStore((s) => s.def.terminals)
  const faceLock = useEditorStore((s) => s.faceLock)
  const placing = useEditorStore((s) => s.placing)
  const placingSpec = useEditorStore((s) => s.placingSpec)
  const set = useEditorStore((s) => s.set)
  const cameraTo = useEditorStore((s) => s.cameraTo)
  const counts = faceCounts(terminals)
  return <div className="ce-facebar" role="toolbar" aria-label="Bornes por vista">
    <span className="ce-facebar-title">Bornes por vista</span>
    {FACES.map(([face, label]) => <button key={face} className={`ce-face${faceLock === face ? ' is-on' : ''}`} onClick={() => { if (faceLock === face) set({ faceLock: null }); else { set({ faceLock: face }); cameraTo(face) } }}
      title={`Ver ${label.toLowerCase()} e fixar a saída dos novos bornes nessa face`}>{label}<b>{counts[face]}</b></button>)}
    <span className="ce-facebar-sep" />
    <button className={`ce-face ce-face-add${placing ? ' is-on' : ''}`} onClick={() => useEditorStore.getState().setRibbon(placing ? 'select' : 'terminal')} title="Clique no modelo para colocar bornes (Esc termina)">{placing ? (placingSpec ? `A colocar ${placingSpec.label}` : 'A adicionar…') : '+ Adicionar'}</button>
    {faceLock && <button className="ce-face" onClick={() => set({ faceLock: null })} title="Voltar à normal da superfície clicada">Face livre</button>}
  </div>
}

/** Cabos de teste (modo Simular): lista e veredicto de compatibilidade. */
function WirePanel() {
  const wires = useEditorStore((s) => s.testWires)
  const terminals = useEditorStore((s) => s.def.terminals)
  const wireFrom = useEditorStore((s) => s.wireFrom)
  const set = useEditorStore((s) => s.set)
  const name = (id: string) => terminals.find((item) => item.id === id)?.label ?? '?'
  return <div className="ce-wirepanel" role="status">
    <strong>Cabos de teste</strong>
    <small>{wireFrom ? `Origem ${name(wireFrom)} · clique no borne de destino` : 'Clique num borne e depois noutro para ligar e validar.'}</small>
    {wires.length === 0 && <small className="ce-wirepanel-empty">Sem cabos de teste.</small>}
    {wires.map((wire) => <div key={wire.id} className={`ce-wire is-${wire.level}`}>
      <b>{name(wire.a)} ↔ {name(wire.b)}</b><span>{wire.level === 'ok' ? '✓ ' : '⚠ '}{COMPAT_LABEL[wire.level]}{wire.messages.length ? ` — ${wire.messages.join(' · ')}` : ''}</span>
    </div>)}
    {wires.length > 0 && <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => set({ testWires: [], wireFrom: null })}>Limpar cabos</button>}
  </div>
}

function LibraryPanel() {
  const def = useEditorStore((s) => s.def)
  const meta = useEditorStore((s) => s.meta)
  const placingSpec = useEditorStore((s) => s.placingSpec)
  const set = useEditorStore((s) => s.set)
  const flash = (text: string) => window.dispatchEvent(new CustomEvent('ce-flash', { detail: text }))
  return <aside className="ce-lib-panel" aria-label="Biblioteca de bornes">
    <div className="ce-lib-head"><span>Biblioteca de bornes</span><button className="ce-icon" onClick={() => set({ libraryOpen: false })} title="Fechar">✕</button></div>
    <TerminalLibrary mode="insert" canEdit suggestFor={meta.category} armedLabel={placingSpec?.label ?? null}
      onInsert={(profile, params, replace) => { const n = applyProfile(profile, params, replace); flash(`${profile.name}: ${n} bornes adicionados — editáveis na lista à esquerda.`) }}
      onArmChip={(spec: TerminalSpec) => set({ placing: true, placingSpec: spec, selection: null })}
      currentSpecs={() => specsFromTerminals(def.terminals)} />
  </aside>
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
      await catalogApi.save(entry.id, meta, def)
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
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [dropping, setDropping] = useState(false)
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
      useEditorStore.getState().open(loaded)
      if (await loadGlbAssets(useEditorStore.getState().def, glbCache)) useEditorStore.getState().bumpGlb()
    }).catch((value) => !cancelled && setLoadError(value instanceof Error ? value.message : 'Não foi possível abrir o componente'))
    return () => { cancelled = true }
  }, [id])

  const save = useCallback(async () => {
    const state = useEditorStore.getState()
    if (!state.entry || saving) return
    setSaving(true)
    try {
      const saved = await catalogApi.save(state.entry.id, state.meta, state.def)
      useEditorStore.getState().markSaved(saved)
      setMessage('Rascunho guardado.')
    } catch (value) { setMessage(value instanceof Error ? value.message : 'Falha ao guardar') }
    finally { setSaving(false) }
  }, [saving])

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
      if (isTyping(event.target) || publishing) return
      if (mod && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) state.redo(); else state.undo(); return }
      if (mod && event.key.toLowerCase() === 'y') { event.preventDefault(); state.redo(); return }
      const key = event.key.toLowerCase()
      if (!mod && !event.altKey && ['1', '2', '3', '4', '5'].includes(key)) {
        const pick = (['select', 'terminal', 'wire', 'delete', 'pan'] as const)[Number(key) - 1]
        if (state.mode === 'edit' || pick === 'select' || pick === 'wire' || pick === 'pan') { event.preventDefault(); state.setRibbon(pick) }
        return
      }
      if (state.mode !== 'edit') return
      if (key === 'w') state.set({ tool: 'translate' })
      else if (key === 'e') state.set({ tool: 'rotate' })
      else if (key === 'r') state.set({ tool: 'scale' })
      else if (key === 'f') state.cameraTo('fit')
      else if (key === 'escape') { if (state.placing) state.set({ placing: false, placingSpec: null, ribbon: 'select' }); else if (state.ribbon !== 'select') state.setRibbon('select'); else if (state.faceLock) state.set({ faceLock: null }); else state.select(null) }
      else if ((key === 'delete' || key === 'backspace') && state.selection) {
        event.preventDefault()
        const selection = state.selection
        if (selection.kind === 'part') state.edit((current) => removeParts(current, [selection.id]))
        else if (selection.kind === 'terminal') state.edit((current) => ({ ...current, terminals: current.terminals.filter((item) => item.id !== selection.id) }))
        else state.edit((current) => ({ ...current, lights: current.lights.filter((item) => item.id !== selection.id) }))
        state.select(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save, publishing])

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
      <div className="ce-title"><strong>{meta.name || 'Sem nome'}</strong><span className={`ce-status${entry.latestVersion ? ' is-pub' : ''}${dirty ? ' is-dirty' : ''}`}>{status}</span></div>
      <div className="ce-modes" role="tablist" aria-label="Modo">
        <button role="tab" aria-selected={mode === 'edit'} className={mode === 'edit' ? 'is-on' : ''} onClick={() => set({ mode: 'edit', placing: false })}>Editar</button>
        <button role="tab" aria-selected={mode === 'simulate'} className={mode === 'simulate' ? 'is-on' : ''} onClick={() => set({ mode: 'simulate', previewState: previewState || def.initialState, placing: false, ribbon: useEditorStore.getState().ribbon === 'terminal' || useEditorStore.getState().ribbon === 'delete' ? 'select' : useEditorStore.getState().ribbon })}>Simular</button>
      </div>
      <div className="ce-spacer" />
      {message && <span className="ce-flash" role="status">{message}</span>}
      <button className="account-project-action" onClick={() => leave()}>← Biblioteca</button>
      <button className="account-project-action" onClick={() => void save()} disabled={saving || !dirty} title="Guardar rascunho (Ctrl+S)">{saving ? 'A guardar…' : 'Guardar rascunho'}</button>
      <button className="account-project-action dx-bar-primary" onClick={() => setPublishing(true)}>Publicar…</button>
      {account}
    </header>
    <ToolRibbon />
    <div className="ce-body">
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
        {mode === 'edit' && tab === 'terminals' && <FaceBar />}
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
          {tab === 'lights' && <LightsTab />}{tab === 'states' && <StatesTab />}{tab === 'interactions' && <InteractionsTab />}{tab === 'component' && <ComponentTab />}
        </div>
      </aside>
    </div>
    <StatusBar />
    {publishing && <PublishDialog onClose={() => setPublishing(false)} onDone={(text) => { setPublishing(false); leave(text) }} />}
  </div>
}
