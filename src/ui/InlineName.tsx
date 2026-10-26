import { useEffect, useRef, useState, type ReactNode } from 'react'
import { IconEdit } from './icons'

/**
 * INLINE-RENAME-01 — edição de nomes «no sítio», igual ao nome do documento na barra superior.
 * Sem caixas nativas (window.prompt): Enter grava, Escape cancela, perder o foco grava.
 * `editOnClick` → um clique entra em edição; senão o clique chama `onIdleClick` e o duplo clique edita.
 */
export function InlineName({
  value, onCommit, placeholder, label, editOnClick = true, onIdleClick, className = '', title,
  maxLength = 80, allowEmpty = false, role, ariaSelected, after, showIcon = true, dataAttr,
}: {
  value: string
  onCommit: (next: string) => void
  placeholder?: string
  label: string
  editOnClick?: boolean
  onIdleClick?: () => void
  className?: string
  title?: string
  maxLength?: number
  allowEmpty?: boolean
  role?: string
  ariaSelected?: boolean
  after?: ReactNode
  showIcon?: boolean
  dataAttr?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (!editing) setDraft(value) }, [value, editing])
  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])
  const commit = () => {
    const next = draft.trim()
    setEditing(false)
    if (next === value.trim()) return
    if (!next && !allowEmpty) return
    onCommit(next)
  }
  const data = dataAttr ? { [`data-${dataAttr}`]: '' } : {}
  if (editing) {
    return <input
      ref={inputRef}
      className={`dc-inline-name-input ${className}`}
      value={draft}
      maxLength={maxLength}
      placeholder={placeholder}
      aria-label={label}
      autoFocus
      size={Math.max(8, Math.min(40, (draft || placeholder || '').length + 2))}
      data-inline-name-input=""
      {...data}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Enter') { event.preventDefault(); commit() }
        if (event.key === 'Escape') { event.preventDefault(); setDraft(value); setEditing(false) }
      }}
    />
  }
  return <button
    type="button"
    role={role}
    aria-selected={ariaSelected}
    className={`dc-inline-name ${value ? '' : 'is-empty'} ${className}`}
    title={title ?? (editOnClick ? `Clique para mudar: ${label.toLowerCase()}` : `Duplo clique para mudar: ${label.toLowerCase()}`)}
    data-inline-name=""
    {...data}
    onClick={() => (editOnClick ? setEditing(true) : onIdleClick?.())}
    onDoubleClick={() => setEditing(true)}
  >
    <span className="dc-inline-name-text">{value || placeholder}</span>
    {after}
    {showIcon && editOnClick && <IconEdit size={11} />}
  </button>
}

export default InlineName
