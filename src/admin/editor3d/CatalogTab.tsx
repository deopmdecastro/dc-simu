import Select from '../../ui/Select'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '../../routing/routes'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { catalogApi } from '../../catalog/catalogApi'
import { newId } from '../../catalog/definition'
import { useCatalogStore } from '../../catalog/registry'
import type { CatalogEntry } from '../../catalog/types'
import { IconCube } from '../../ui/icons'
import { ComponentThumb } from '../../three/componentThumbnails'
import type { ComponentType } from '../../types'
import { generateCover } from './coverGen'
import { createComponentCatalogBackup, downloadComponentCatalogBackup, parseComponentCatalogBackup, restoreComponentCatalogBackup } from '../../catalog/catalogBackup'
import { buildBuiltinDraft, builtinComponents, builtinTypeOf, upgradeBuiltinDraft, type BuiltinInfo } from './builtinComponents'
import ComponentEditor3D from './ComponentEditor3D'

/** Separador "Biblioteca 3D": lista os componentes oficiais e abre o editor 3D. */
export default function CatalogTab({ onNotice, onError, onCreate, openId, onOpened, account }: { account?: ReactNode; onNotice: (message: string) => void; onError: (message: string) => void; onCreate: () => void; openId?: string | null; onOpened?: () => void }) {
  const navigate = useNavigate()
  const [entries, setEntries] = useState<CatalogEntry[] | null>(null)
  const [editing, setEditing] = useState<string | null>(openId ?? null)
  // A rota leva o nome do dispositivo, para se perceber o que está a ser editado.
  const openEditor = useCallback((id: string, name?: string) => { setEditing(id); navigate(ROUTES.adminEditor(id, name)) }, [navigate])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'draft' | 'published' | 'archived' | 'builtin'>('all')
  const [importing, setImporting] = useState<string | null>(null)
  const builtins = useMemo(() => builtinComponents(), [])
  const [covers, setCovers] = useState<Record<string, string>>({})
  const [backupBusy, setBackupBusy] = useState(false)
  const backupInput = useRef<HTMLInputElement>(null)

  const reload = useCallback(async () => {
    try { setEntries(await catalogApi.adminList()) } catch (value) { onError(value instanceof Error ? value.message : 'Falha ao carregar a biblioteca 3D'); setEntries([]) }
  }, [onError])
  useEffect(() => { void reload() }, [reload])
  // capas sempre atuais: gera-as a partir do rascunho (salvo capa manual), uma de cada vez
  useEffect(() => {
    if (!entries) return
    let cancelled = false
    void (async () => {
      for (const entry of entries) {
        if (cancelled) return
        if (entry.meta.coverLocked && entry.meta.thumbnail) continue
        const url = await generateCover(entry)
        if (url && !cancelled) setCovers((current) => (current[entry.id] === url ? current : { ...current, [entry.id]: url }))
      }
    })()
    return () => { cancelled = true }
  }, [entries])
  useEffect(() => { if (openId) { setEditing(openId); onOpened?.() } }, [openId, onOpened])

  const imported = useMemo(() => new Map((entries ?? []).flatMap((entry) => { const type = builtinTypeOf(entry); return type ? [[type, entry.id] as const] : [] })), [entries])
  const matches = (text: string) => text.toLowerCase().includes(query.trim().toLowerCase())
  /** Componentes integrados na plataforma que ainda não têm cópia editável na biblioteca 3D. */
  const builtinVisible = useMemo(() => (filter === 'all' || filter === 'builtin' ? builtins : []).filter((item) => !imported.has(item.type) && matches(`${item.name} ${item.group} ${item.tag} ${item.type}`)), [builtins, imported, filter, query])
  const visible = useMemo(() => (entries ?? []).filter((entry) => {
    if (filter === 'builtin') return imported.has(builtinTypeOf(entry) ?? '') && matches(`${entry.meta.name} ${entry.meta.group}`)
    if (filter === 'archived' ? !entry.archived : filter === 'draft' ? entry.latestVersion > 0 || entry.archived : filter === 'published' ? entry.latestVersion === 0 || entry.archived : false) return false
    return `${entry.meta.name} ${entry.meta.group} ${entry.meta.reference} ${entry.meta.tags.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase())
  }), [entries, filter, query])

  async function duplicate(entry: CatalogEntry) {
    try {
      const source = await catalogApi.adminGet(entry.id)
      const id = newId('c')
      await catalogApi.save(id, { ...source.meta, name: `${source.meta.name} (cópia)` }, source.draft ?? source.versions[source.versions.length - 1].definition)
      onNotice('Cópia criada como novo componente independente (rascunho).')
      await reload()
    } catch (value) { onError(value instanceof Error ? value.message : 'Falha ao duplicar') }
  }
  /** Abre um componente integrado no editor 3D: cria (uma vez) uma cópia editável com o modelo e os bornes do original. */
  async function openBuiltin(item: BuiltinInfo) {
    const existing = imported.get(item.type)
    if (existing) {
      const name = (entries ?? []).find((entry) => entry.id === existing)?.meta.name ?? item.name
      // Rascunhos importados antes podem não ter os elementos que a importação
      // passou a gerar (botões, LCD, placa de bornes): são acrescentados aqui.
      try {
        const source = await catalogApi.adminGet(existing)
        const current = source.draft ?? source.versions[source.versions.length - 1].definition
        const upgraded = await upgradeBuiltinDraft(item.type, current)
        if (upgraded) { await catalogApi.save(existing, source.meta, upgraded); onNotice('Rascunho atualizado com os elementos em falta (botões, ecrãs e ligações).'); await reload() }
      } catch { /* abre na mesma o que existe */ }
      openEditor(existing, name)
      return
    }
    setImporting(item.type)
    try {
      const { meta, def, usedModel } = await buildBuiltinDraft(item.type)
      const id = newId('c')
      await catalogApi.save(id, meta, def)
      onNotice(usedModel ? `«${item.name}» importado com o modelo 3D e os bornes: edite à vontade (o componente integrado do simulador não é alterado).` : `«${item.name}» importado como volume com as dimensões físicas e os bornes (sem modelo CAD).`)
      await reload()
      openEditor(id, meta.name)
    } catch (value) { onError(value instanceof Error ? value.message : 'Falha ao importar o componente integrado') }
    finally { setImporting(null) }
  }
  async function archive(entry: CatalogEntry) {
    try { await catalogApi.archive(entry.id, !entry.archived); await useCatalogStore.getState().load(); onNotice(entry.archived ? 'Componente reposto na biblioteca.' : 'Componente arquivado: deixa de aparecer na biblioteca; os projetos existentes não são afetados.'); await reload() }
    catch (value) { onError(value instanceof Error ? value.message : 'Falha ao arquivar') }
  }
  async function remove(entry: CatalogEntry) {
    if (!window.confirm(`Eliminar o rascunho «${entry.meta.name}»?`)) return
    try { await catalogApi.remove(entry.id); await reload() } catch (value) { onError(value instanceof Error ? value.message : 'Falha ao eliminar') }
  }

  async function exportBackup() {
    setBackupBusy(true)
    try {
      const backup = await createComponentCatalogBackup()
      downloadComponentCatalogBackup(backup)
      onNotice(`Backup guardado: ${backup.entries.length} componente(s).`)
    } catch (value) { onError(value instanceof Error ? value.message : 'Falha ao criar o backup dos componentes.') }
    finally { setBackupBusy(false) }
  }
  async function importBackup(file: File) {
    setBackupBusy(true)
    try {
      const backup = parseComponentCatalogBackup(await file.text())
      const result = await restoreComponentCatalogBackup(backup, (entry) => window.confirm(`O componente «${entry.meta.name}» já existe. Substituir o rascunho atual pelo backup? As versões publicadas existentes serão preservadas.`))
      await useCatalogStore.getState().load()
      await reload()
      onNotice(`Backup recuperado: ${result.restored} componente(s); ${result.skipped} ignorado(s).`)
    } catch (value) { onError(value instanceof Error ? value.message : 'Falha ao recuperar o backup dos componentes.') }
    finally { setBackupBusy(false); if (backupInput.current) backupInput.current.value = '' }
  }

  if (editing) return createPortal(<div className="ce-overlay dx"><ComponentEditor3D account={account} id={editing} onClose={(message) => { setEditing(null); navigate(ROUTES.adminEditor()); if (message) onNotice(message); void reload() }} /></div>, document.body)

  return <>
    <div className="dx-admin-section"><h2>Biblioteca de componentes 3D</h2><span>{entries ? `${visible.length + builtinVisible.length}/${entries.length + builtins.length - imported.size}` : '…'}</span></div>
    <p className="cb-note">Crie componentes oficiais no editor 3D, publique versões e deixe os utilizadores atualizarem quando quiserem. Os projetos existentes nunca são alterados sem confirmação. Os componentes que já vêm com a plataforma aparecem no fim da lista: «Editar no 3D» cria uma cópia editável (modelo + bornes) sem alterar o original.</p>
    <div className="ce-list-tools">
      <input className="dx-input cb-search" type="search" placeholder="Pesquisar por nome, grupo ou referência…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Pesquisar componentes 3D" />
      <Select className="dx-input" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} aria-label="Filtrar por estado">
        <option value="all">Todos</option><option value="draft">Só rascunhos</option><option value="published">Publicados</option><option value="archived">Arquivados</option><option value="builtin">Integrados</option>
      </Select>
      <button className="dx-btn dx-btn-secondary" disabled={backupBusy} onClick={() => void exportBackup()}>{backupBusy ? 'A processar…' : 'Guardar backup'}</button>
      <button className="dx-btn dx-btn-secondary" disabled={backupBusy} onClick={() => backupInput.current?.click()}>Recuperar backup</button>
      <input ref={backupInput} type="file" accept=".json,.dcs-components.json,application/json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importBackup(file) }} />
      <button className="dx-btn dx-btn-primary" onClick={onCreate}>+ Novo componente 3D</button>
    </div>
    {entries === null && <div className="dx-admin-empty">A carregar…</div>}
    {entries && visible.length === 0 && builtinVisible.length === 0 && <div className="dx-admin-empty">{entries.length === 0 ? 'Ainda não há componentes 3D. Clique em «+ Novo componente 3D» para criar o primeiro.' : 'Nenhum componente corresponde ao filtro.'}</div>}
    <div className="ce-cards">
      {visible.map((entry) => {
        const origin = builtinTypeOf(entry)
        const cover = covers[entry.id] ?? entry.meta.thumbnail
        const state = entry.archived ? 'Arquivado' : entry.latestVersion ? `v${entry.latestVersion}` : 'Rascunho'
        return <article key={entry.id} className={`ce-card${entry.archived ? ' is-archived' : ''}`}>
          <div className="ce-card-cover">
            {cover ? <img src={cover} alt={`Capa de ${entry.meta.name}`} loading="lazy" draggable={false} />
              : origin ? <LazyThumb type={origin as ComponentType} size={150} /> : <div className="ce-card-nocover"><IconCube size={30} /><span>A gerar capa…</span></div>}
            <span className="ce-card-badges">
              {origin && <span className="ce-pill is-builtin" title="Importado de um componente integrado da plataforma">Integrado</span>}
              <span className={`ce-pill${entry.archived ? ' is-archived' : entry.latestVersion ? ' is-pub' : ' is-draft'}`}>{state}</span>
            </span>
          </div>
          <div className="ce-card-body">
            <h3 className="ce-card-title" title={entry.meta.name}>{entry.meta.name}</h3>
            <div className="ce-card-meta"><span className="ce-chip">{entry.meta.group || 'Sem grupo'}</span><span>{new Date(entry.updatedAt ?? Date.now()).toLocaleDateString('pt-PT')}{entry.updatedBy ? ` · ${entry.updatedBy}` : ''}</span></div>
            <p className="ce-card-desc">{entry.meta.description || 'Sem descrição.'}</p>
          </div>
          <div className="ce-card-actions">
            <button className="dx-btn dx-btn-primary dx-btn-sm" onClick={() => openEditor(entry.id, entry.meta.name)}>Editar</button>
            <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => void duplicate(entry)} title="Cria um componente novo e independente">Duplicar</button>
            {entry.latestVersion > 0
              ? <button className="dx-btn dx-btn-ghost dx-btn-sm" onClick={() => void archive(entry)}>{entry.archived ? 'Repor' : 'Arquivar'}</button>
              : <button className="dx-btn dx-btn-ghost dx-btn-sm ce-danger" onClick={() => void remove(entry)}>Eliminar</button>}
          </div>
        </article>
      })}
    </div>
    {entries && builtinVisible.length > 0 && <>
      <div className="dx-admin-section ce-builtin-head"><h2>Componentes integrados da plataforma</h2><span>{builtinVisible.length}</span></div>
      <p className="cb-note">Estão na Biblioteca do simulador desde o início. Abra no editor 3D para ver/alterar o modelo e os bornes: é criada uma cópia independente, em rascunho.</p>
      <div className="ce-cards">
        {builtinVisible.map((item) => <article key={item.type} className="ce-card ce-card-builtin">
          <div className="ce-card-cover">
            <LazyThumb type={item.type} size={150} />
            <span className="ce-card-badges"><span className="ce-pill is-builtin">Integrado</span></span>
          </div>
          <div className="ce-card-body">
            <h3 className="ce-card-title" title={item.name}>{item.name}</h3>
            <div className="ce-card-meta"><span className="ce-chip">{item.group}</span><span>{item.tag} · {item.terminals} borne{item.terminals === 1 ? '' : 's'}</span></div>
            <p className="ce-card-desc">{item.hasModel ? 'Modelo 3D CAD da plataforma.' : 'Sem modelo CAD: abre como volume com as dimensões físicas.'}</p>
          </div>
          <div className="ce-card-actions">
            <button className="dx-btn dx-btn-primary dx-btn-sm" disabled={importing !== null} onClick={() => void openBuiltin(item)}>{importing === item.type ? 'A importar…' : 'Editar no 3D'}</button>
          </div>
        </article>)}
      </div>
    </>}
  </>
}

/** Miniatura 3D só quando o cartão fica visível (evita criar dezenas de contextos WebGL de uma vez). */
function LazyThumb({ type, size = 120 }: { type: ComponentType; size?: number }) {
  const [node, setNode] = useState<HTMLDivElement | null>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    if (!node || seen) return
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return }
    const observer = new IntersectionObserver((items) => { if (items.some((item) => item.isIntersecting)) { setSeen(true); observer.disconnect() } }, { rootMargin: '120px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [node, seen])
  return <div ref={setNode} className="ce-thumb-lazy">{seen ? <ComponentThumb type={type} size={size} /> : <IconCube size={28} />}</div>
}
