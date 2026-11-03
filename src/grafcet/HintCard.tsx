/** Cartão de ajuda dos painéis GRAFCET: uma frase de estado sempre visível e dicas em lista curta,
 *  que se podem ocultar/mostrar. A preferência é única (todas as dicas do editor) e fica guardada
 *  neste navegador. */
import { useSyncExternalStore, type ReactNode } from 'react'
import { IconChevronDown, IconHelp } from '../ui/icons'
import '../styles/grafcet-hints.css'

const KEY = 'dcsimu:grafcet:hints-hidden:v1'
const EVENT = 'dcsimu:grafcet-hints'

const readHidden = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }
const subscribe = (notify: () => void) => {
  const onStorage = (event: StorageEvent) => { if (event.key === KEY) notify() }
  window.addEventListener(EVENT, notify)
  window.addEventListener('storage', onStorage)
  return () => { window.removeEventListener(EVENT, notify); window.removeEventListener('storage', onStorage) }
}
export const setHintsHidden = (hidden: boolean) => {
  try { if (hidden) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY) } catch { /* armazenamento indisponível */ }
  window.dispatchEvent(new Event(EVENT))
}
export const useHintsHidden = () => useSyncExternalStore(subscribe, readHidden, () => false)

/** Tecla ou combinação: <Keys>Ctrl+C</Keys>. */
export const Keys = ({ children }: { children: string }) => (
  <span className="grafcet-hint-keys">{children.split('+').map((key, index) => <kbd key={index}>{key}</kbd>)}</span>
)

interface HintCardProps {
  /** Frase de estado — mostrada mesmo com as dicas ocultas. */
  lead?: ReactNode
  tips: ReactNode[]
  className?: string
}

export default function HintCard({ lead, tips, className = '' }: HintCardProps) {
  const hidden = useHintsHidden()
  return (
    <div className={`grafcet-hint-card${hidden ? ' is-collapsed' : ''} ${className}`.trim()}>
      {lead && <p className="grafcet-hint-lead">{lead}</p>}
      {!hidden && tips.length > 0 && (
        <ul className="grafcet-hint-tips" aria-label="Dicas">
          {tips.map((tip, index) => <li key={index}>{tip}</li>)}
        </ul>
      )}
      {tips.length > 0 && (
        <button type="button" className="grafcet-hint-toggle" aria-expanded={!hidden} onClick={() => setHintsHidden(!hidden)}
          title={hidden ? 'Mostrar as dicas em todos os painéis GRAFCET' : 'Ocultar as dicas em todos os painéis GRAFCET'}>
          <IconHelp size={11} />{hidden ? 'Mostrar dicas' : 'Ocultar dicas'}<IconChevronDown size={9} className={hidden ? '' : 'is-open'} />
        </button>
      )}
    </div>
  )
}
