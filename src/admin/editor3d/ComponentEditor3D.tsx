import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { bakeGlb, boundsMm, describeChanges, loadGlbAssets, resolveState, runtimeSpec } from '../../catalog/definition'
import { catalogApi } from '../../catalog/catalogApi'
import { useCatalogStore } from '../../catalog/registry'
import Hierarchy from './Hierarchy'
import { BASE_STATE, glbCache, removeParts, useEditorStore, type InspectorTab } from './editorStore'
import { ComponentTab, InteractionsTab, LightsTab, StatesTab, TerminalsTab } from './tabs2'
import { MaterialsTab, ObjectTab } from './tabs1'
import { validateDefinition } from './validate'

const Viewport = lazy(() => import('./Viewport'))

const TABS: Array<[InspectorTab, string]> = [['object', 'Objeto'], ['materials', 'Materiais'], ['terminals', 'Bornes'], ['lights', 'Luzes'], ['states', 'Estados'], ['interactions', 'Interações'], ['component', 'Componente']]
const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)

function ViewToolbar() {
  const view = useEditorStore((s) => s.view)
  const setView = useEditorStore((s) => s.setView)
  const cameraTo = useEditorStore((s) => s.cameraTo)
  const snap = useEditorStore((s) => s.snap)
  const set = useEditorStore((s) => s.set)
  const mode = useEditorStore((s) => s.mode)
  return <div className="ce-viewbar" role="toolbar" aria-label="Vista 3D">
    <div className="ce-group" aria-label="Câmara">
      {([['fit', 'Enquadrar'], ['iso', 'ISO'], ['front', 'Frente'], ['back', 'Trás'], ['left', 'Esq.'], ['right', 'Dir.'], ['top', 'Topo']] as const).map(([kind, label]) => <button key={kind} className="ce-tool" onClick={() => cameraTo(kind)}>{label}</button>)}
    </div>
    <div className="ce-group" aria-label="Cena">
      <button className={`ce-tool${view.grid ? ' is-on' : ''}`} onClick={() => setView({ grid: !view.grid })}>Grelha</button>
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

export default function ComponentEditor3D({ id, onClose }: { id: string; onClose: (message?: string) => void }) {
  const entry = useEditorStore((s) => s.entry)
  const meta = useEditorStore((s) => s.meta)
  const def = useEditorStore((s) => s.def)
  const dirty = useEditorStore((s) => s.dirty)
  const mode = useEditorStore((s) => s.mode)
  const tab = useEditorStore((s) => s.tab)
  const editState = useEditorStore((s) => s.editState)
  const previewState = useEditorStore((s) => s.previewState)
  const placing = useEditorStore((s) => s.placing)
  const canUndo = useEditorStore((s) => s.past.length > 0)
  const canRedo = useEditorStore((s) => s.future.length > 0)
  const glbRevision = useEditorStore((s) => s.glbRevision)
  const set = useEditorStore((s) => s.set)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [publishing, setPublishing] = useState(false)

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
      if (state.mode !== 'edit') return
      const key = event.key.toLowerCase()
      if (key === 'w') state.set({ tool: 'translate' })
      else if (key === 'e') state.set({ tool: 'rotate' })
      else if (key === 'r') state.set({ tool: 'scale' })
      else if (key === 'f') state.cameraTo('fit')
      else if (key === 'escape') { if (state.placing) state.set({ placing: false }); else state.select(null) }
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
    <header className="ce-top">
      <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => leave()}>← Biblioteca</button>
      <div className="ce-title"><strong>{meta.name || 'Sem nome'}</strong><span className={`ce-status${entry.latestVersion ? ' is-pub' : ''}${dirty ? ' is-dirty' : ''}`}>{status}</span></div>
      <div className="ce-modes" role="tablist" aria-label="Modo">
        <button role="tab" aria-selected={mode === 'edit'} className={mode === 'edit' ? 'is-on' : ''} onClick={() => set({ mode: 'edit', placing: false })}>Editar</button>
        <button role="tab" aria-selected={mode === 'simulate'} className={mode === 'simulate' ? 'is-on' : ''} onClick={() => set({ mode: 'simulate', previewState: previewState || def.initialState, placing: false })}>Simular</button>
      </div>
      <div className="ce-spacer" />
      {message && <span className="ce-flash" role="status">{message}</span>}
      <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => useEditorStore.getState().undo()} disabled={!canUndo} title="Anular (Ctrl+Z)">↶</button>
      <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => useEditorStore.getState().redo()} disabled={!canRedo} title="Refazer (Ctrl+Y)">↷</button>
      <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => void save()} disabled={saving || !dirty} title="Guardar rascunho (Ctrl+S)">{saving ? 'A guardar…' : 'Guardar rascunho'}</button>
      <button className="dx-btn dx-btn-primary dx-btn-sm" onClick={() => setPublishing(true)}>Publicar…</button>
    </header>
    <div className="ce-body">
      <Hierarchy />
      <main className="ce-stage">
        <ViewToolbar />
        <Suspense fallback={<div className="ce-loading">A carregar o motor 3D…</div>}><Viewport /></Suspense>
        <div className="ce-stage-info">
          <span>{dims}</span>
          {mode === 'edit' && <span className="ce-pill">{editState === BASE_STATE ? 'A editar: pose base' : `A editar estado: ${stateName}`}</span>}
          {mode === 'simulate' && <span className="ce-pill is-sim">Simulação · clique nas peças</span>}
          {placing && <span className="ce-pill is-place">Clique numa face para colocar o borne · Esc cancela</span>}
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
    {publishing && <PublishDialog onClose={() => setPublishing(false)} onDone={(text) => { setPublishing(false); leave(text) }} />}
  </div>
}
