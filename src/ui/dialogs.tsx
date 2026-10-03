import {  } from './dialogs'
import { useEffect, useRef, useState } from 'react'

/**
 * Caixas de diálogo da plataforma (substituem `window.alert/confirm/prompt`).
 *
 * As nativas abrem com o visual do sistema operativo — a preta do iOS, por
 * exemplo — e ignoram completamente as cores e a tipografia do DC-SIMU. Estas
 * usam o mesmo cartão, cores e botões do resto da aplicação, e devolvem uma
 * promessa para o código continuar a ler como antes (`if (await uiConfirm(…))`).
 */

type Request = {
  kind: 'alert' | 'confirm' | 'prompt'
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
  const accept = () => close(current.kind === 'prompt' ? text : true)
  const cancel = () => close(current.kind === 'prompt' ? null : false)

  return (
    <div className="dcx-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && current.kind !== 'alert') cancel() }}>
      <div className="dcx-dialog" role="alertdialog" aria-modal="true" aria-label={current.title}>
        <h2>{current.title}</h2>
        <p>{current.message}</p>
        {current.kind === 'prompt' && <input
          ref={inputRef}
          className="dcx-dialog-input"
          value={text}
          autoFocus
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') accept(); if (event.key === 'Escape') cancel() }}
        />}
        <div className="dcx-dialog-actions">
          {current.kind !== 'alert' && <button type="button" className="dcx-dialog-btn" onClick={cancel}>{current.cancelLabel ?? 'Cancelar'}</button>}
          <button type="button" className={`dcx-dialog-btn is-primary${current.danger ? ' is-danger' : ''}`} autoFocus={current.kind !== 'prompt'} onClick={accept}>{current.confirmLabel ?? 'OK'}</button>
        </div>
      </div>
    </div>
  )
}
