import { useEffect, useState } from 'react'

type Answer = 'save' | 'later'
let open: ((resolve: (answer: Answer) => void) => void) | null = null

/** Pergunta se a nova versão pode ser aplicada agora (há trabalho por guardar). Sem painel montado, adia. */
export function askUpdateWithPendingChanges(): Promise<Answer> {
  return new Promise((resolve) => { if (open) open(resolve); else resolve('later') })
}

/** Painel global: montado uma vez, fora das páginas, para o utilizador não perder o sítio onde está. */
export default function UpdatePrompt() {
  const [resolver, setResolver] = useState<((answer: Answer) => void) | null>(null)
  useEffect(() => {
    open = (resolve) => setResolver(() => resolve)
    return () => { open = null }
  }, [])
  if (!resolver) return null
  const answer = (value: Answer) => { resolver(value); setResolver(null) }
  return (
    <div className="dx ce-modal ce-modal-fixed" role="dialog" aria-modal="true" aria-label="Atualização disponível">
      <div className="ce-modal-card">
        <h2>Nova versão do DC-SIMU</h2>
        <p className="ce-hint">Tem alterações por guardar. Se atualizar agora, o trabalho é guardado e a página recarrega, voltando ao mesmo editor. Pode também continuar e atualizar mais tarde.</p>
        <div className="ce-modal-actions">
          <button className="dx-btn dx-btn-secondary" onClick={() => answer('later')}>Mais tarde</button>
          <button className="dx-btn dx-btn-primary" autoFocus onClick={() => answer('save')}>Guardar e atualizar</button>
        </div>
      </div>
    </div>
  )
}
