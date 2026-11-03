import { guardErrors, scanTextGuards } from './textGuards'
import { receptivityOf, type GrafcetProgram } from './engine'
import PropertyDialog from '../ui/PropertyDialog'
import { IconCheckCircle, IconWarning } from '../ui/icons'
import '../styles/grafcet-dialog-ux.css'

interface Props {
  open: boolean
  program: GrafcetProgram
  /** Fase 1: acrescenta as condições às transições (os textos ficam). */
  onApply: () => void
  /** Fase 2: remove os textos já cobertos por uma condição. */
  onRemove: (commentIds: string[]) => void
  onClose: () => void
}

/**
 * Textos de comparação (`G4 <> X159`) → condição «Só se» da transição que ativa a etapa.
 * Duas fases com conferência pelo meio: aplicar as condições, rever o resultado e só depois remover os textos.
 */
export default function TextGuardsDialog({ open, program, onApply, onRemove, onClose }: Props) {
  const { matches, unmatched } = scanTextGuards(program)
  const pending = matches.filter((match) => !match.applied)
  const covered = matches.filter((match) => match.applied)
  const phase: 'none' | 'apply' | 'remove' = !matches.length ? 'none' : pending.length ? 'apply' : 'remove'
  const invalid = phase === 'remove' ? guardErrors(program) : 0
  const transitions = program.transitions ?? []
  return (
    <PropertyDialog
      open={open}
      id="text-guards-dialog"
      className="grafcet-compact-dialog grafcet-text-guards"
      title="Textos de comparação → condições"
      subtitle="«G4 <> X159» por cima de uma transição passa a ser a condição de estado dessa transição."
      saveLabel={phase === 'apply' ? `Aplicar ${pending.length} condiç${pending.length === 1 ? 'ão' : 'ões'}` : `Remover ${covered.length} texto${covered.length === 1 ? '' : 's'}`}
      closeLabel={phase === 'none' ? 'Fechar' : 'Cancelar'}
      hideSave={phase === 'none'}
      saveDisabled={phase === 'remove' && invalid > 0}
      footerHint="Esc para fechar"
      onSave={() => { if (phase === 'apply') onApply(); else if (phase === 'remove') onRemove(covered.map((match) => match.commentId)) }}
      onClose={onClose}
    >
      <div className="grafcet-text-guards-body">
        {phase === 'none' && <p className="grafcet-text-guards-note"><IconCheckCircle size={14} /> Não há textos de comparação por converter neste projeto.</p>}
        {phase === 'apply' && <p className="grafcet-text-guards-note">1.º passo: as condições são acrescentadas às transições e os textos <b>ficam no desenho</b> para os poder conferir. Pode desfazer (Ctrl+Z).</p>}
        {phase === 'remove' && <p className="grafcet-text-guards-note"><IconCheckCircle size={14} /> Condições aplicadas. Confira a receptividade de cada transição; 2.º passo: remover os textos livres, que ficam duplicados.</p>}
        {invalid > 0 && <p className="grafcet-text-guards-note is-warning"><IconWarning size={14} /> {invalid} condição(ões) de estado inválida(s): corrija antes de remover os textos.</p>}
        {matches.length > 0 && (
          <ul className="grafcet-text-guards-list" aria-label="Textos encontrados">
            {matches.map((match) => {
              const transition = transitions.find((t) => t.id === match.transitionId)
              return (
                <li key={match.commentId} className={match.applied ? 'is-applied' : ''}>
                  <span className="grafcet-text-guards-text"><small>Texto</small><code>{match.text}</code></span>
                  <span className="grafcet-text-guards-arrow" aria-hidden="true">→</span>
                  <span className="grafcet-text-guards-target">
                    <b>{match.transitionName}</b>{' '}<small>ativa a etapa {match.step} do G{match.graph}{match.source ? ' · transição-fonte' : ''}</small>
                    <code>{transition ? receptivityOf({ condition: match.condition, guard: match.applied ? transition.guard : match.guard }) : match.guard}</code>
                  </span>
                  <span className="grafcet-text-guards-state">{match.applied ? 'Aplicada' : 'Por aplicar'}</span>
                </li>
              )
            })}
          </ul>
        )}
        {unmatched.length > 0 && (
          <p className="grafcet-text-guards-note is-warning"><IconWarning size={14} /> {unmatched.length} texto(s) parecem comparações mas nenhuma transição ativa essa etapa — ficam como estão: {unmatched.map((item) => `«${item.text.trim()}»`).join(', ')}.</p>
        )}
      </div>
    </PropertyDialog>
  )
}
