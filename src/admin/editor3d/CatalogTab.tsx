import { createPortal } from 'react-dom'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { catalogApi } from '../../catalog/catalogApi'
import { newId } from '../../catalog/definition'
import { useCatalogStore } from '../../catalog/registry'
import type { CatalogEntry } from '../../catalog/types'
import { IconCube } from '../../ui/icons'
import ComponentEditor3D from './ComponentEditor3D'

/** Separador "Biblioteca 3D": lista os componentes oficiais e abre o editor 3D. */
export default function CatalogTab({ onNotice, onError, onCreate, openId, onOpened, account }: { account?: ReactNode; onNotice: (message: string) => void; onError: (message: string) => void; onCreate: () => void; openId?: string | null; onOpened?: () => void }) {
  const [entries, setEntries] = useState<CatalogEntry[] | null>(null)
  const [editing, setEditing] = useState<string | null>(openId ?? null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'draft' | 'published' | 'archived'>('all')

  const reload = useCallback(async () => {
    try { setEntries(await catalogApi.adminList()) } catch (value) { onError(value instanceof Error ? value.message : 'Falha ao carregar a biblioteca 3D'); setEntries([]) }
  }, [onError])
  useEffect(() => { void reload() }, [reload])
  useEffect(() => { if (openId) { setEditing(openId); onOpened?.() } }, [openId, onOpened])

  const visible = useMemo(() => (entries ?? []).filter((entry) => {
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
  async function archive(entry: CatalogEntry) {
    try { await catalogApi.archive(entry.id, !entry.archived); await useCatalogStore.getState().load(); onNotice(entry.archived ? 'Componente reposto na biblioteca.' : 'Componente arquivado: deixa de aparecer na biblioteca; os projetos existentes não são afetados.'); await reload() }
    catch (value) { onError(value instanceof Error ? value.message : 'Falha ao arquivar') }
  }
  async function remove(entry: CatalogEntry) {
    if (!window.confirm(`Eliminar o rascunho «${entry.meta.name}»?`)) return
    try { await catalogApi.remove(entry.id); await reload() } catch (value) { onError(value instanceof Error ? value.message : 'Falha ao eliminar') }
  }

  if (editing) return createPortal(<div className="ce-overlay dx"><ComponentEditor3D account={account} id={editing} onClose={(message) => { setEditing(null); if (message) onNotice(message); void reload() }} /></div>, document.body)

  return <>
    <div className="dx-admin-section"><h2>Biblioteca de componentes 3D</h2><span>{entries ? `${visible.length}/${entries.length}` : '…'}</span></div>
    <p className="cb-note">Crie componentes oficiais no editor 3D, publique versões e deixe os utilizadores atualizarem quando quiserem. Os projetos existentes nunca são alterados sem confirmação.</p>
    <div className="ce-list-tools">
      <input className="dx-input cb-search" type="search" placeholder="Pesquisar por nome, grupo ou referência…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Pesquisar componentes 3D" />
      <select className="dx-input" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} aria-label="Filtrar por estado">
        <option value="all">Todos</option><option value="draft">Só rascunhos</option><option value="published">Publicados</option><option value="archived">Arquivados</option>
      </select>
      <button className="dx-btn dx-btn-primary" onClick={onCreate}>+ Novo componente 3D</button>
    </div>
    {entries === null && <div className="dx-admin-empty">A carregar…</div>}
    {entries && visible.length === 0 && <div className="dx-admin-empty">{entries.length === 0 ? 'Ainda não há componentes 3D. Clique em «+ Novo componente 3D» para criar o primeiro.' : 'Nenhum componente corresponde ao filtro.'}</div>}
    <div className="ce-cards">
      {visible.map((entry) => <article key={entry.id} className={`ce-card${entry.archived ? ' is-archived' : ''}`}>
        <div className="ce-card-cover" aria-hidden>{entry.meta.thumbnail ? <img src={entry.meta.thumbnail} alt="" loading="lazy" draggable={false} /> : <IconCube size={28} />}</div>
        <div className="ce-card-head">
          <strong>{entry.meta.name}</strong>
          <span className={`ce-status${entry.latestVersion ? ' is-pub' : ''}`}>{entry.archived ? 'Arquivado' : entry.latestVersion ? `v${entry.latestVersion}` : 'Rascunho'}</span>
        </div>
        <p>{entry.meta.description || 'Sem descrição.'}</p>
        <small>{entry.meta.group || 'Sem grupo'} · atualizado {new Date(entry.updatedAt ?? Date.now()).toLocaleDateString('pt-PT')}{entry.updatedBy ? ` · ${entry.updatedBy}` : ''}</small>
        <div className="ce-card-actions">
          <button className="dx-btn dx-btn-primary dx-btn-sm" onClick={() => setEditing(entry.id)}>Editar</button>
          <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => void duplicate(entry)} title="Cria um componente novo e independente">Duplicar</button>
          {entry.latestVersion > 0
            ? <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => void archive(entry)}>{entry.archived ? 'Repor' : 'Arquivar'}</button>
            : <button className="dx-btn dx-btn-danger dx-btn-sm" onClick={() => void remove(entry)}>Eliminar</button>}
        </div>
      </article>)}
    </div>
  </>
}
