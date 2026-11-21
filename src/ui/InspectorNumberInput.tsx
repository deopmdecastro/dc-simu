import { useEffect, useId, useRef, useState, type ChangeEvent, type InputHTMLAttributes } from 'react'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value'> & {
  value: string | number
  allowEmpty?: boolean
  integer?: boolean
  onDraftChange?: (value: string) => void
  resetKey?: string
}

/** Preserve a digitação intermédia; apenas números finitos e dentro dos limites chegam ao modelo. */
export default function InspectorNumberInput({ value, onChange, onBlur, onKeyDown, allowEmpty = false, integer = false, onDraftChange, resetKey, min, max, ...props }: Props) {
  const [draft, setDraft] = useState(String(value))
  const [error, setError] = useState('')
  const errorId = useId()
  const editing = useRef(false)
  const cancelled = useRef(false)
  useEffect(() => { setDraft(String(value)); setError(''); editing.current = false }, [value, resetKey])
  const validate = (raw: string) => {
    if (!raw.trim()) return allowEmpty ? '' : 'Introduza um número; Escape repõe o valor.'
    const number = Number(raw.replace(',', '.'))
    if (!Number.isFinite(number)) return 'Introduza um número finito.'
    if (integer && !Number.isInteger(number)) return 'Introduza um número inteiro.'
    if (min !== undefined && number < Number(min)) return `Mínimo: ${min}.`
    if (max !== undefined && number > Number(max)) return `Máximo: ${max}.`
    return ''
  }
  return <span className="dc-inspector-number">
    <input {...props} type="number" min={min} max={max} value={draft} aria-invalid={!!error || undefined}
      aria-describedby={[props['aria-describedby'], error ? errorId : undefined].filter(Boolean).join(' ') || undefined}
      onChange={(event) => { editing.current = true; setDraft(event.target.value); onDraftChange?.(event.target.value); if (error) setError(validate(event.target.value)) }}
      onBlur={(event) => {
        if (cancelled.current) { cancelled.current = false; return }
        if (editing.current) {
          const nextError = validate(draft)
          setError(nextError)
          if (nextError) return
          editing.current = false
          const next = draft.trim() ? String(Number(draft.replace(',', '.'))) : ''
          // A ação pode rejeitar colisões/limites físicos. O valor confirmado vem sempre do modelo.
          setDraft(String(value))
          if (next !== String(value)) onChange?.({ ...event, target: { ...event.target, value: next }, currentTarget: { ...event.currentTarget, value: next } } as ChangeEvent<HTMLInputElement>)
        }
        onBlur?.(event)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setDraft(String(value)); onDraftChange?.(String(value)); setError(''); editing.current = false; cancelled.current = true; event.currentTarget.blur(); return }
        if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); return }
        onKeyDown?.(event)
      }} />
    {error && <small id={errorId} className="dc-inspector-number-error" role="status">{error}</small>}
  </span>
}
