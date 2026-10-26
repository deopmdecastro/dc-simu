import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { accountApi } from '../auth/accountApi'
import type { ProjectComment } from '../admin/adminTypes'
import { uiConfirm } from '../ui/dialogs'
import Select from '../ui/Select'
import { COMMENT_ANCHORS, COMMENT_MAX, commentPermissions, type CommentAnchor } from '../saas/platformCore.mjs'

export const ANCHOR_LABEL: Record<CommentAnchor, string> = { geral: 'Geral', esquema: 'Esquema', '3d': '3D', ladder: 'Ladder', grafcet: 'GRAFCET' }

type Viewer = { id: string; role: 'admin' | 'user' }
type ListResponse = { comments: ProjectComment[]; canWrite: boolean; reason: string | null }

const when = (iso: string) => new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?'

/**
 * PROJ-COMMENTS-01: conversa de um projeto. Proprietário e editores convidados trocam
 * comentários (com âncora na vista: esquema, 3D, Ladder, GRAFCET). O autor edita o seu;
 * autor, proprietário e administrador eliminam ou marcam como resolvido.
 * Atualiza a cada 20 s enquanto está aberto.
 */
export default function ProjectComments({ projectId, projectName, projectRole, viewer, defaultAnchor = 'geral', onClose, onCount }: {
  projectId: string
  projectName: string
  projectRole: 'owner' | 'editor'
  viewer: Viewer
  defaultAnchor?: CommentAnchor
  onClose: () => void
  onCount?: (open: number) => void
}) {
  const [data, setData] = useState<ListResponse | null>(null)
  const [error, setError] = useState('')
  const [body, setBody] = useState('')
  const [anchor, setAnchor] = useState<CommentAnchor>(defaultAnchor)
  const [filter, setFilter] = useState<'open' | 'all' | CommentAnchor>('open')
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const base = `/projects/${encodeURIComponent(projectId)}/comments`

  const load = useCallback(async () => {
    try {
      const next = await accountApi<ListResponse>(base)
      setData(next); setError('')
      onCount?.(next.comments.filter((comment) => !comment.resolved).length)
    } catch (value) { setError(value instanceof Error ? value.message : 'Não foi possível carregar os comentários.') }
  }, [base, onCount])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, 20000)
    return () => window.clearInterval(timer)
  }, [load])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !editing) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, onClose])

  const shown = useMemo(() => (data?.comments ?? []).filter((comment) => filter === 'all' ? true : filter === 'open' ? !comment.resolved : comment.anchor === filter), [data, filter])
  const openCount = (data?.comments ?? []).filter((comment) => !comment.resolved).length

  async function act(task: () => Promise<unknown>) {
    setBusy(true)
    try { await task(); await load() } catch (value) { setError(value instanceof Error ? value.message : 'Operação falhou.') } finally { setBusy(false) }
  }

  async function send(event: React.FormEvent) {
    event.preventDefault()
    const text = body.trim()
    if (!text || busy) return
    await act(async () => {
      await accountApi(base, 'POST', { body: text, anchor })
      setBody('')
      window.requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }))
    })
  }

  return <aside className="dx-comments" role="dialog" aria-modal="false" aria-label={`Comentários do projeto ${projectName}`}>
    <header>
      <div>
        <strong>Comentários</strong>
        <span>{projectName} · {openCount} por resolver</span>
      </div>
      <button type="button" className="dx-btn dx-btn-ghost dx-btn-sm" onClick={onClose} aria-label="Fechar comentários">Fechar</button>
    </header>
    <div className="dx-comments-filter" role="group" aria-label="Filtrar comentários">
      <Select className="dx-input dx-input-sm" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} aria-label="Filtrar comentários">
        <option value="open">Por resolver</option>
        <option value="all">Todos</option>
        {COMMENT_ANCHORS.map((key) => <option key={key} value={key}>Vista: {ANCHOR_LABEL[key]}</option>)}
      </Select>
      <button type="button" className="dx-btn dx-btn-ghost dx-btn-sm" onClick={() => void load()} disabled={busy}>Atualizar</button>
    </div>
    {error && <p className="dx-comments-error" role="alert">{error}</p>}
    <div className="dx-comments-list" ref={listRef}>
      {!data && !error && <p className="dx-comments-empty">A carregar…</p>}
      {data && shown.length === 0 && <p className="dx-comments-empty">{data.comments.length ? 'Nenhum comentário com este filtro.' : 'Ainda não há comentários. Comece a conversa com quem partilha o projeto.'}</p>}
      {shown.map((comment) => {
        const perms = commentPermissions(comment, viewer, projectRole)
        const mine = comment.authorId === viewer.id
        return <article key={comment.id} className={`dx-comment ${comment.resolved ? 'is-resolved' : ''} ${mine ? 'is-mine' : ''}`} data-comment={comment.id}>
          <span className="dx-comment-avatar" aria-hidden>{initials(comment.authorName)}</span>
          <div className="dx-comment-body">
            <div className="dx-comment-meta">
              <strong>{mine ? 'Eu' : comment.authorName}</strong>
              <span className="dx-comment-anchor">{ANCHOR_LABEL[comment.anchor] ?? comment.anchor}</span>
              <time dateTime={comment.createdAt}>{when(comment.createdAt)}</time>
              {comment.editedAt && <em title={`Editado ${when(comment.editedAt)}`}>editado</em>}
              {comment.resolved && <span className="dx-comment-done">Resolvido</span>}
            </div>
            {editing?.id === comment.id
              ? <div className="dx-comment-edit">
                <textarea className="dx-input" rows={3} maxLength={COMMENT_MAX} value={editing.body} onChange={(event) => setEditing({ ...editing, body: event.target.value })} aria-label="Editar comentário" autoFocus />
                <div>
                  <button type="button" className="dx-btn dx-btn-primary dx-btn-sm" disabled={busy || !editing.body.trim()} onClick={() => void act(async () => { await accountApi(`${base}/${comment.id}`, 'PATCH', { body: editing.body }); setEditing(null) })}>Guardar</button>
                  <button type="button" className="dx-btn dx-btn-ghost dx-btn-sm" onClick={() => setEditing(null)}>Cancelar</button>
                </div>
              </div>
              : <p>{comment.body}</p>}
            {editing?.id !== comment.id && <div className="dx-comment-actions">
              {perms.resolve && <button type="button" disabled={busy} onClick={() => void act(() => accountApi(`${base}/${comment.id}`, 'PATCH', { resolved: !comment.resolved }))}>{comment.resolved ? 'Reabrir' : 'Marcar resolvido'}</button>}
              {perms.edit && data?.canWrite && <button type="button" disabled={busy} onClick={() => setEditing({ id: comment.id, body: comment.body })}>Editar</button>}
              {perms.remove && <button type="button" disabled={busy} onClick={() => void (async () => {
                if (await uiConfirm('Eliminar este comentário? Não é possível desfazer.', { title: 'Eliminar comentário', confirmLabel: 'Eliminar', cancelLabel: 'Cancelar', danger: true })) await act(() => accountApi(`${base}/${comment.id}`, 'DELETE'))
              })()}>Eliminar</button>}
            </div>}
          </div>
        </article>
      })}
    </div>
    {data && !data.canWrite
      ? <p className="dx-comments-locked">{data.reason ?? 'Não pode comentar neste projeto.'}</p>
      : <form className="dx-comments-form" onSubmit={(event) => void send(event)}>
        <textarea className="dx-input" rows={3} maxLength={COMMENT_MAX} placeholder="Escreva um comentário… (Ctrl+Enter para enviar)" value={body} onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) void send(event) }} aria-label="Novo comentário" />
        <div>
          <Select className="dx-input dx-input-sm" value={anchor} onChange={(event) => setAnchor(event.target.value as CommentAnchor)} aria-label="Vista do comentário">
            {COMMENT_ANCHORS.map((key) => <option key={key} value={key}>{ANCHOR_LABEL[key]}</option>)}
          </Select>
          <small>{body.length}/{COMMENT_MAX}</small>
          <button type="submit" className="dx-btn dx-btn-primary dx-btn-sm" disabled={busy || !body.trim() || !data}>Comentar</button>
        </div>
      </form>}
  </aside>
}
