import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { nanoid } from 'nanoid'
import type { CanvasNote } from '../types'
import { useSimStore } from '../store/useSimStore'
import { getViewer } from '../auth/viewer'
import { uiConfirm } from './dialogs'
import { IconCheck, IconClose, IconDelete, IconNote, IconPalette, IconSend } from './icons'
import { NOTE_COLORS, initialsOf, noteTheme, shortWhen } from './textStyle'
export function CanvasNoteCard({ note, open, readOnly, onToggle, onDragStart, wasDragged }: {
  note: CanvasNote
  open: boolean
  readOnly: boolean
  /** O clique que fecha um arrasto não abre nem fecha a nota. */
  wasDragged: () => boolean
  onToggle: (open: boolean) => void
  onDragStart: (event: ReactPointerEvent) => void
}) {
  const update = useSimStore((s) => s.updateCanvasNote)
  const remove = useSimStore((s) => s.removeCanvasNote)
  const theme = noteTheme(note.color)
  const messages = note.messages ?? []
  const [title, setTitle] = useState(note.text)
  const [draft, setDraft] = useState('')
  const [palette, setPalette] = useState(false)
  const listRef = useRef<HTMLOListElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const draftRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => setTitle(note.text), [note.text])
  useEffect(() => {
    if (!open) return
    // Nota acabada de criar: começa pelo título; senão, pela resposta.
    window.requestAnimationFrame(() => { (note.text ? draftRef.current : titleRef.current)?.focus() })
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [open])

  const commitTitle = () => { const next = title.trim(); if (next !== note.text) update(note.id, { text: next }) }
  const send = () => {
    const text = draft.trim()
    if (!text) return
    const viewer = getViewer()
    update(note.id, { text: note.text || title.trim() || text.split('\n')[0].slice(0, 60), messages: [...messages, { id: nanoid(8), text, author: viewer.name, authorId: viewer.id, createdAt: new Date().toISOString() }] })
    setDraft('')
    window.requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }))
  }
  const close = () => {
    commitTitle()
    // Nota vazia (sem título nem mensagens) não fica a sujar o canvas.
    if (!title.trim() && !messages.length && !draft.trim()) { remove(note.id); return }
    if (draft.trim()) send()
    onToggle(false)
  }
  const destroy = async () => {
    if (await uiConfirm('Eliminar este comentário e toda a conversa?', { title: 'Eliminar comentário', confirmLabel: 'Eliminar', cancelLabel: 'Cancelar', danger: true })) remove(note.id)
  }
  const style = { '--note-paper': theme.paper, '--note-ink': theme.ink, '--note-edge': theme.edge, '--note-tab': note.color ?? NOTE_COLORS[0].id } as CSSProperties

  return <div className={`cnote${open ? ' is-open' : ''}${note.resolved ? ' is-resolved' : ''}`} style={style}
    onWheel={(event) => open && event.stopPropagation()} onContextMenu={(event) => event.preventDefault()}>
    <button type="button" className="cnote-chip" onPointerDown={readOnly ? undefined : onDragStart} onClick={() => { if (wasDragged()) return; if (open) close(); else onToggle(true) }}
      title={readOnly ? note.text : `${note.text || 'Comentário'} — clique abre a conversa · arraste para mover`} aria-expanded={open}>
      <span className="cnote-pin" aria-hidden="true"><IconNote size={11} /></span>
      <span className="cnote-title">{note.text || 'Novo comentário'}</span>
      {messages.length > 0 && <em className="cnote-count" aria-label={`${messages.length} mensagens`}>{messages.length}</em>}
      {note.resolved && <IconCheck size={10} className="cnote-done" />}
    </button>
    {open && <section className="cnote-card" role="dialog" aria-label={`Comentário: ${note.text || 'novo'}`} onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Escape') close() }}>
      <header className="cnote-head">
        <input ref={titleRef} className="cnote-title-input" value={title} placeholder="Título do comentário" maxLength={80} readOnly={readOnly}
          onChange={(event) => setTitle(event.target.value)} onBlur={commitTitle} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitTitle(); draftRef.current?.focus() } }} aria-label="Título do comentário" />
        {!readOnly && <>
          <button type="button" className="cnote-icon" aria-pressed={palette} onClick={() => setPalette((value) => !value)} title="Cor da nota" aria-label="Cor da nota"><IconPalette size={12} /></button>
          <button type="button" className={`cnote-icon${note.resolved ? ' is-on' : ''}`} aria-pressed={!!note.resolved} onClick={() => update(note.id, { resolved: !note.resolved })} title={note.resolved ? 'Reabrir' : 'Marcar como resolvido'} aria-label={note.resolved ? 'Reabrir' : 'Marcar como resolvido'}><IconCheck size={12} /></button>
          <button type="button" className="cnote-icon is-danger" onClick={() => void destroy()} title="Eliminar comentário" aria-label="Eliminar comentário"><IconDelete size={12} /></button>
        </>}
        <button type="button" className="cnote-icon" onClick={close} title="Fechar (Esc)" aria-label="Fechar"><IconClose size={12} /></button>
      </header>
      {palette && <div className="cnote-colors" role="radiogroup" aria-label="Cor da nota">
        {NOTE_COLORS.map((item) => <button key={item.id} type="button" role="radio" aria-checked={(note.color ?? NOTE_COLORS[0].id) === item.id} title={item.label} aria-label={item.label}
          style={{ background: item.paper, borderColor: item.edge }} onClick={() => { update(note.id, { color: item.id }); setPalette(false) }} />)}
      </div>}
      <ol className="cnote-list" ref={listRef} aria-label="Mensagens">
        {messages.length === 0 && <li className="cnote-empty">Escreva a primeira mensagem — fica guardada no projeto, junto a este ponto do desenho.</li>}
        {messages.map((message) => {
          const mine = !!message.authorId && message.authorId === getViewer().id
          return <li key={message.id} className={`cnote-msg${mine ? ' is-mine' : ''}`}>
            <span className="cnote-avatar" aria-hidden="true">{initialsOf(message.author ?? 'Eu')}</span>
            <div>
              <span className="cnote-meta"><b>{mine ? 'Eu' : message.author ?? 'Eu'}</b><time dateTime={message.createdAt}>{shortWhen(message.createdAt)}</time></span>
              <p>{message.text}</p>
            </div>
            {!readOnly && (mine || !message.authorId) && <button type="button" className="cnote-msg-del" onClick={() => update(note.id, { messages: messages.filter((item) => item.id !== message.id) })} title="Apagar mensagem" aria-label="Apagar mensagem"><IconClose size={9} /></button>}
          </li>
        })}
      </ol>
      {!readOnly && <form className="cnote-compose" onSubmit={(event) => { event.preventDefault(); send() }}>
        <textarea ref={draftRef} value={draft} rows={2} maxLength={1000} placeholder={messages.length ? 'Responder… (Ctrl+Enter)' : 'Mensagem… (Ctrl+Enter)'}
          onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); send() } }} aria-label="Nova mensagem" />
        <button type="submit" className="cnote-send" disabled={!draft.trim()} title="Enviar (Ctrl+Enter)" aria-label="Enviar"><IconSend size={12} /></button>
      </form>}
    </section>}
  </div>
}
