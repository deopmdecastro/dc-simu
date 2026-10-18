import { useEffect, useState } from 'react'

type Answer = 'save' | 'later'
let open: ((resolve: (answer: Answer) => void) => void) | null = null

/** Pergunta se a nova versão pode ser aplicada agora (há trabalho por guardar). Sem painel montado, adia. */
export function askUpdateWithPendingChanges(): Promise<Answer> {
  return new Promise((resolve) => { if (open) open(resolve); else resolve('later') })
}

/** Painel global com o visual oficial da plataforma DC-SIMU (na cara do site). */
export default function UpdatePrompt() {
  const [resolver, setResolver] = useState<((answer: Answer) => void) | null>(null)
  useEffect(() => {
    open = (resolve) => setResolver(() => resolve)
    return () => { open = null }
  }, [])
  if (!resolver) return null
  const answer = (value: Answer) => { resolver(value); setResolver(null) }
  return (
    <div className="dcx-dialog-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) answer('later') }}>
      <div className="dcx-dialog" role="alertdialog" aria-modal="true" aria-label="Quer atualizar o site?">
        <h2>Quer atualizar o site?</h2>
        <p>É possível que as alterações não tenham sido efetuadas. Se recarregar agora, o rascunho do seu projeto é guardado automaticamente e a aplicação atualiza para a versão mais recente.</p>
        <div className="dcx-dialog-actions">
          <button type="button" className="dcx-dialog-btn" onClick={() => answer('later')}>Cancelar</button>
          <button type="button" className="dcx-dialog-btn is-primary" autoFocus onClick={() => answer('save')}>Recarregar</button>
        </div>
      </div>
    </div>
  )
}
