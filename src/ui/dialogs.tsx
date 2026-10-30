import { useEffect, useRef, useState } from 'react'

/**
 * Caixas de diálogo da plataforma (substituem `window.alert/confirm/prompt`).
 *
 * As nativas abrem com o visual do sistema operativo — a preta do iOS, por
 * exemplo — e ignoram completamente as cores e a tipografia do DC-SIMU. Estas
 * usam o mesmo cartão, cores e botões do resto da aplicação, e devolvem uma
 * promessa para o código continuar a ler como antes (`if (await uiConfirm(…))`).
 */

/** Opção de `uiChoose`: cartão selecionável; indisponível mostra o motivo e não se escolhe. */
export type ChoiceOption = {
  id: string
  title: string
  description: string
  /** detalhe curto por baixo (ex.: o que vai ser gerado) */
  detail?: string
  badge?: string
  disabled?: boolean
  /** porque não está disponível */
  reason?: string
}

type Request = {
  kind: 'alert' | 'confirm' | 'prompt' | 'choose'
  options?: ChoiceOption[]
  message: string
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  defaultValue?: string
  resolve: (value: boolean | string | null) => void
}

let push: ((request: Request) => void) | null = null

function ask(request: Omit<Request, 'resolve'>): Promise<boolean | string | null> {
  return new Promise((resolve) => {
    if (!push) { // sem host montado: não bloqueia o utilizador
      resolve(request.kind === 'confirm' ? true : request.kind === 'prompt' ? (request.defaultValue ?? null) : true)
      return
    }
    push({ ...request, resolve })
  })
}

export type ConfirmOptions = { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }

/** Aviso simples com um só botão. */
export async function uiAlert(message: string, options: { title?: string; confirmLabel?: string } = {}): Promise<void> {
  await ask({ kind: 'alert', message, title: options.title ?? 'Aviso', confirmLabel: options.confirmLabel ?? 'OK' })
}

/** Pergunta de sim/não. Devolve `true` quando o utilizador confirma. */
export async function uiConfirm(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  const answer = await ask({
    kind: 'confirm', message,
    title: options.title ?? 'Confirmar',
    confirmLabel: options.confirmLabel ?? 'Continuar',
    cancelLabel: options.cancelLabel ?? 'Cancelar',
    danger: options.danger,
  })
  return answer === true
}

/** Pede um texto. Devolve `null` se o utilizador cancelar. */
export async function uiPrompt(message: string, defaultValue = '', options: { title?: string; confirmLabel?: string } = {}): Promise<string | null> {
  const answer = await ask({
    kind: 'prompt', message, defaultValue,
    title: options.title ?? 'Indique um nome',
    confirmLabel: options.confirmLabel ?? 'Confirmar',
    cancelLabel: 'Cancelar',
  })
  return typeof answer === 'string' ? answer : null
}

/** Escolha entre opções (cartões). Devolve o `id` escolhido, ou `null` se o utilizador cancelar. */
export async function uiChoose(message: string, options: ChoiceOption[], settings: { title?: string; confirmLabel?: string; defaultId?: string } = {}): Promise<string | null> {
  const available = options.filter((option) => !option.disabled)
  if (!available.length) return null
  const fallback = settings.defaultId && available.some((option) => option.id === settings.defaultId) ? settings.defaultId : available[0].id
  const answer = await ask({ kind: 'choose', message, options, defaultValue: fallback, title: settings.title ?? 'Escolher', confirmLabel: settings.confirmLabel ?? 'Continuar', cancelLabel: 'Cancelar' })
  return typeof answer === 'string' ? answer : null
}

/** Host global: montado uma vez na raiz da aplicação. */
export default function DialogHost() {
  const [queue, setQueue] = useState<Request[]>([])
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const current = queue[0]

  useEffect(() => {
    push = (request) => setQueue((items) => [...items, request])
    return () => { push = null }
  }, [])

  // Teclado do diálogo em captura: Enter confirma e Esc cancela antes de qualquer atalho do editor.
  const keysRef = useRef<{ accept: () => void; cancel: () => void } | null>(null)
  useEffect(() => {
    if (!current) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== 'Escape') return
      const target = event.target as HTMLElement | null
      if (event.key === 'Enter' && target?.closest('.dcx-dialog-actions button')) return // o botão focado decide (Cancelar ou Confirmar)
      event.preventDefault(); event.stopImmediatePropagation()
      if (event.key === 'Enter') keysRef.current?.accept()
      else if (current.kind !== 'alert') keysRef.current?.cancel()
      else keysRef.current?.accept()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [current])

  useEffect(() => {
    if (!current) return
    setText(current.defaultValue ?? '')
    const timer = window.setTimeout(() => inputRef.current?.select(), 30)
    return () => window.clearTimeout(timer)
  }, [current])

  if (!current) return null

  const close = (value: boolean | string | null) => {
    current.resolve(value)
    setQueue((items) => items.slice(1))
  }
  const accept = () => close(current.kind === 'prompt' || current.kind === 'choose' ? text : true)
  const cancel = () => close(current.kind === 'prompt' || current.kind === 'choose' ? null : false)
  keysRef.current = { accept, cancel }

  return (
    <div className="dcx-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && current.kind !== 'alert') cancel() }}>
      <div className={`dcx-dialog${current.kind === 'choose' ? ' is-choice' : ''}`} role="alertdialog" aria-modal="true" aria-label={current.title}>
        <h2>{current.title}</h2>
        <p>{current.message}</p>
        {current.kind === 'prompt' && <input
          ref={inputRef}
          className="dcx-dialog-input"
          value={text}
          autoFocus
          onChange={(event) => setText(event.target.value)}
        />}
        {current.kind === 'choose' && <div className="dcx-choice-list" role="radiogroup" aria-label={current.title}>
          {(current.options ?? []).map((option) => <button key={option.id} type="button" role="radio" aria-checked={text === option.id} disabled={option.disabled}
            className={`dcx-choice${text === option.id ? ' is-selected' : ''}${option.disabled ? ' is-disabled' : ''}`} data-choice={option.id}
            onClick={() => setText(option.id)} onDoubleClick={() => { setText(option.id); close(option.id) }}>
            <span className="dcx-choice-radio" aria-hidden="true" />
            <span className="dcx-choice-body">
              <strong>{option.title}{option.badge && <em>{option.badge}</em>}</strong>
              <span>{option.description}</span>
              {option.detail && !option.disabled && <small>{option.detail}</small>}
              {option.disabled && option.reason && <small className="is-reason">Indisponível: {option.reason}</small>}
            </span>
          </button>)}
        </div>}
        <div className="dcx-dialog-actions">
          {current.kind !== 'alert' && <button type="button" className="dcx-dialog-btn" onClick={cancel}>{current.cancelLabel ?? 'Cancelar'}</button>}
          <button type="button" className={`dcx-dialog-btn is-primary${current.danger ? ' is-danger' : ''}`} autoFocus={current.kind !== 'prompt'} onClick={accept}>{current.confirmLabel ?? 'OK'}</button>
        </div>
      </div>
    </div>
  )
}
