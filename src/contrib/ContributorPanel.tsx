import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { User } from '../dashboard/Dashboard'
import type { ComponentType } from '../types'
import { contribApi } from './contribApi'
import { COMPONENT_OPTIONS, ContributionRow, GlbPreview, formatBytes } from './ContribParts'
import type { GlbDimensions } from './GlbPreview'
import { KIND_LABEL, MAX_GLB_BYTES, MAX_PDF_BYTES, type Contribution, type ContributionKind } from './types'
import { readValidationHead, validateFile, validateInput } from './validate'

type Tab = 'send' | 'mine' | 'library'
const NEW_COMPONENT = '__new__'

interface Draft {
  kind: ContributionKind
  title: string
  component: string
  customName: string
  description: string
}
const EMPTY: Draft = { kind: 'datasheet', title: '', component: '', customName: '', description: '' }

/**
 * Painel do contribuidor. Qualquer conta com sessão pode contribuir com datasheets (PDF)
 * e modelos 3D (GLB); o administrador reve e aprova antes de ficarem visíveis a todos.
 */
export default function ContributorPanel({ user, onBack, initialTab = 'send' }: { user: User; onBack: () => void; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [mine, setMine] = useState<Contribution[]>([])
  const [library, setLibrary] = useState<Contribution[]>([])
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [editing, setEditing] = useState<Contribution | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState('')
  const [fileInfo, setFileInfo] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [dims, setDims] = useState<GlbDimensions | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [libraryKind, setLibraryKind] = useState<'all' | ContributionKind>('all')
  const [libraryQuery, setLibraryQuery] = useState('')
  const input = useRef<HTMLInputElement>(null)

  const reload = useCallback(async () => {
    try {
      const [own, approved] = await Promise.all([contribApi.list({ mine: true }), contribApi.list({ status: 'approved' })])
      setMine(own)
      setLibrary(approved)
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Não foi possível carregar as contribuições.', error: true })
    }
  }, [])
  useEffect(() => { void reload() }, [reload])
  useEffect(() => { if (!message) return; const timer = window.setTimeout(() => setMessage(null), 6000); return () => window.clearTimeout(timer) }, [message])
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const accept = draft.kind === 'datasheet' ? 'application/pdf,.pdf' : '.glb,model/gltf-binary'
  const limit = draft.kind === 'datasheet' ? MAX_PDF_BYTES : MAX_GLB_BYTES

  const clearFile = () => {
    setFile(null); setFileError(''); setFileInfo(''); setDims(null); setPreviewUrl(null)
    if (input.current) input.current.value = ''
  }
  const chooseKind = (kind: ContributionKind) => { if (editing) return; set('kind', kind); clearFile() }

  async function pickFile(picked?: File) {
    clearFile()
    if (!picked) return
    const head = await readValidationHead(picked)
    const result = validateFile(draft.kind, head, picked.size)
    if (!result.ok) { setFileError(result.error); return }
    setFile(picked)
    setFileInfo(`${picked.name} · ${formatBytes(picked.size)}${result.info ? ` · ${result.info.meshes} malha(s), ${result.info.materials} material(is)` : ''}`)
    if (draft.kind === 'model3d') setPreviewUrl(URL.createObjectURL(picked))
  }

  const input2 = useMemo(() => ({
    kind: draft.kind,
    title: draft.title,
    componentType: draft.component && draft.component !== NEW_COMPONENT ? draft.component as ComponentType : null,
    customName: draft.component === NEW_COMPONENT ? draft.customName : undefined,
    description: draft.description,
  }), [draft])
  const inputCheck = validateInput(input2)
  const canSubmit = inputCheck.ok && (!!file || !!editing) && !busy && !!draft.component

  function startEdit(item: Contribution) {
    setEditing(item)
    setDraft({ kind: item.kind, title: item.title, component: item.componentType ?? NEW_COMPONENT, customName: item.customName ?? '', description: item.description })
    clearFile()
    setTab('send')
  }
  function cancelEdit() { setEditing(null); setDraft(EMPTY); clearFile() }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    try {
      if (editing) {
        await contribApi.update(editing.id, input2, file ?? undefined)
        setMessage({ text: 'Contribuição atualizada e enviada de novo para revisão.' })
      } else if (file) {
        await contribApi.submit(input2, file)
        setMessage({ text: 'Contribuição enviada! O administrador vai revê-la antes de a publicar.' })
      }
      setEditing(null); setDraft(EMPTY); clearFile()
      await reload()
      setTab('mine')
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Falha ao enviar', error: true })
    } finally { setBusy(false) }
  }

  async function remove(item: Contribution) {
    if (!confirm(`Eliminar «${item.title}»?`)) return
    try { await contribApi.remove(item.id); await reload() }
    catch (error) { setMessage({ text: error instanceof Error ? error.message : 'Falha ao eliminar', error: true }) }
  }

  const shownLibrary = library.filter((item) => (libraryKind === 'all' || item.kind === libraryKind)
    && `${item.title} ${item.fileName} ${item.authorName} ${item.customName ?? ''} ${item.componentType ?? ''}`.toLowerCase().includes(libraryQuery.trim().toLowerCase()))
  const pending = mine.filter((item) => item.status === 'pending').length

  return <section className="dx dx-admin cb-panel">
    <div className="dx-admin-head">
      <div>
        <span className="dx-over"><i />Painel do contribuidor</span>
        <h1>Contribuir.</h1>
        <p>Envie fichas técnicas (PDF) e modelos 3D (GLB) de componentes. Olá, {user.name}: as suas contribuições são revistas pelo administrador antes de ficarem disponíveis para todos.</p>
      </div>
      <button className="dx-btn dx-btn-secondary" onClick={onBack}>← Projetos</button>
    </div>

    <div className="cb-tabs" role="tablist" aria-label="Painel do contribuidor">
      <button role="tab" aria-selected={tab === 'send'} className={tab === 'send' ? 'is-active' : ''} onClick={() => setTab('send')}>{editing ? 'Editar contribuição' : 'Enviar'}</button>
      <button role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'is-active' : ''} onClick={() => setTab('mine')}>As minhas<span>{mine.length}</span>{pending > 0 && <em title="Em revisão">{pending}</em>}</button>
      <button role="tab" aria-selected={tab === 'library'} className={tab === 'library' ? 'is-active' : ''} onClick={() => setTab('library')}>Biblioteca da comunidade<span>{library.length}</span></button>
    </div>
    {message && <div className={`cb-toast ${message.error ? 'is-error' : ''}`} role={message.error ? 'alert' : 'status'}>{message.text}<button onClick={() => setMessage(null)} aria-label="Fechar">×</button></div>}

    {tab === 'send' && <form className="cb-form" onSubmit={submit} noValidate>
      <div className="cb-kinds" role="radiogroup" aria-label="Tipo de contribuição">
        {(['datasheet', 'model3d'] as const).map((kind) => <button type="button" key={kind} role="radio" aria-checked={draft.kind === kind} disabled={!!editing && draft.kind !== kind} className={draft.kind === kind ? 'is-active' : ''} onClick={() => chooseKind(kind)}>
          <strong>{KIND_LABEL[kind]}</strong>
          <small>{kind === 'datasheet' ? 'Ficha técnica ou manual do fabricante · até 25 MB' : 'Modelo para a Visualização 3D · glTF binário com tudo embebido · até 40 MB'}</small>
        </button>)}
      </div>

      <label className="dx-field"><span className="dx-label">Componente</span>
        <select className="dx-input" value={draft.component} onChange={(event) => set('component', event.target.value)} required>
          <option value="">Escolha o componente…</option>
          {Array.from(new Set(COMPONENT_OPTIONS.map((option) => option.group))).map((group) => <optgroup key={group} label={group}>
            {COMPONENT_OPTIONS.filter((option) => option.group === group).map((option) => <option key={option.type} value={option.type}>{option.label}</option>)}
          </optgroup>)}
          <option value={NEW_COMPONENT}>➕ Componente novo (ainda não existe)</option>
        </select>
      </label>
      {draft.component === NEW_COMPONENT && <label className="dx-field"><span className="dx-label">Nome do componente novo</span>
        <input className="dx-input" value={draft.customName} maxLength={80} placeholder="Ex.: Relé de segurança Pilz PNOZ s3" onChange={(event) => set('customName', event.target.value)} />
      </label>}
      <label className="dx-field"><span className="dx-label">Título</span>
        <input className="dx-input" value={draft.title} maxLength={120} placeholder={draft.kind === 'datasheet' ? 'Ex.: Ficha técnica PTI 6 (PT)' : 'Ex.: PTI 6 com parafusos detalhados'} onChange={(event) => set('title', event.target.value)} required />
      </label>
      <label className="dx-field"><span className="dx-label">Descrição / origem <small>(opcional)</small></span>
        <textarea className="dx-input" rows={3} maxLength={2000} value={draft.description} placeholder="Fabricante, referência, versão, licença ou autoria do ficheiro…" onChange={(event) => set('description', event.target.value)} />
      </label>

      <div className="dx-field">
        <span className="dx-label">Ficheiro {editing && <small>(deixe vazio para manter o atual: {editing.fileName})</small>}</span>
        <label className={`cb-drop ${file ? 'has-file' : ''} ${fileError ? 'has-error' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void pickFile(event.dataTransfer.files[0]) }}>
          <input ref={input} type="file" accept={accept} className="sr-only" onChange={(event) => { void pickFile(event.target.files?.[0]) }} />
          <strong>{file ? file.name : `Arraste o ${draft.kind === 'datasheet' ? 'PDF' : 'GLB'} para aqui ou clique para escolher`}</strong>
          <small>{file ? fileInfo : `Máximo ${formatBytes(limit)} · o ficheiro é validado antes do envio`}</small>
        </label>
        {fileError && <p className="cb-note is-error" role="alert">{fileError}</p>}
      </div>

      {draft.kind === 'model3d' && previewUrl && <div className="cb-preview-wrap">
        <Suspense fallback={<p className="cb-note">A preparar a pré-visualização…</p>}><GlbPreview url={previewUrl} onDimensions={setDims} /></Suspense>
        {dims && <p className="cb-note"><strong>Dimensões detetadas:</strong> ≈ {dims.mm.map((value) => value.toFixed(1)).join(' × ')} mm (largura × altura × profundidade; ficheiro em {dims.unit === 'm' ? 'metros' : 'milímetros'}). Confirme que coincidem com a ficha do componente e que a frente aponta para +Z, com o topo em +Y.</p>}
      </div>}

      {!inputCheck.ok && (draft.title || draft.customName) && <p className="cb-note is-error">{inputCheck.error}</p>}
      <div className="cb-actions">
        <button className="dx-btn dx-btn-primary" disabled={!canSubmit}>{busy ? 'A enviar…' : editing ? 'Guardar e reenviar para revisão' : 'Enviar contribuição'}</button>
        {editing && <button type="button" className="dx-btn dx-btn-secondary" onClick={cancelEdit}>Cancelar edição</button>}
      </div>
    </form>}

    {tab === 'mine' && <div className="cb-list">
      {mine.length === 0 && <div className="dx-admin-empty">Ainda não enviou nenhuma contribuição.<br /><button className="dx-btn dx-btn-primary dx-btn-sm" style={{ marginTop: 12 }} onClick={() => setTab('send')}>Enviar a primeira</button></div>}
      {mine.map((item) => <ContributionRow key={item.id} item={item} expanded={openId === item.id} onToggle={() => setOpenId(openId === item.id ? null : item.id)} actions={item.status !== 'approved' ? <>
        <button type="button" className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => startEdit(item)}>{item.status === 'rejected' ? 'Corrigir e reenviar' : 'Editar'}</button>
        <button type="button" className="dx-btn dx-btn-danger dx-btn-sm" onClick={() => void remove(item)}>Eliminar</button>
      </> : undefined} />)}
    </div>}

    {tab === 'library' && <div className="cb-list">
      <div className="cb-filters">
        <input className="dx-input" type="search" placeholder="Pesquisar título, componente ou autor…" value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} aria-label="Pesquisar na biblioteca" />
        <select className="dx-input" value={libraryKind} onChange={(event) => setLibraryKind(event.target.value as 'all' | ContributionKind)} aria-label="Filtrar por tipo">
          <option value="all">Todos os tipos</option><option value="datasheet">Datasheets</option><option value="model3d">Modelos 3D</option>
        </select>
      </div>
      {shownLibrary.length === 0 && <div className="dx-admin-empty">{library.length ? 'Nenhum resultado para este filtro.' : 'Ainda não há contribuições aprovadas.'}</div>}
      {shownLibrary.map((item) => <ContributionRow key={item.id} item={item} showAuthor expanded={openId === item.id} onToggle={() => setOpenId(openId === item.id ? null : item.id)} />)}
    </div>}
  </section>
}
