import { guardErrors, scanTextGuards } from './textGuards'
import { receptivityOf, type GrafcetProgram } from './engine'
import PropertyDialog from '../ui/PropertyDialog'
import { IconArrowRight, IconCheckCircle, IconFocus, IconWarning } from '../ui/icons'
import '../styles/grafcet-dialog-ux.css'

interface Props {
  open: boolean
  program: GrafcetProgram
  /** Fase 1: acrescenta as condições às transições (os textos ficam). */
  onApply: () => void
  /** Fase 2: remove os textos já cobertos por uma condição. */
  onRemove: (commentIds: string[]) => void
  /** Seleciona a transição no desenho (fecha a modal). */
  onLocate?: (transitionId: string) => void
  onClose: () => void
}

/**
 * Textos de comparação (`G4 <> X159`) → condição «Só se» da transição que ativa a etapa.
 * Duas fases com conferência pelo meio: aplicar as condições, rever o resultado e só depois remover os textos.
 */
export default function TextGuardsDialog({ open, program, onApply, onRemove, onLocate, onClose }: Props) {
  const { matches, unmatched } = scanTextGuards(program)
  const pending = matches.filter((match) => !match.applied)
  const covered = matches.filter((match) => match.applied)
  const phase: 'none' | 'apply' | 'remove' = !matches.length ? 'none' : pending.length ? 'apply' : 'remove'
  const invalid = phase === 'remove' ? guardErrors(program) : 0
  const transitions = program.transitions ?? []
  const withGuard = transitions.filter((transition) => transition.guard?.trim()).length
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  const subtitle = phase === 'none'
    ? 'Converte textos como «G4 <> X159» desenhados por cima de uma transição na sua condição «Só se».'
    : phase === 'apply'
      ? 'Passo 1 de 2 — acrescentar as condições às transições. Os textos ficam no desenho para conferir.'
      : 'Passo 2 de 2 — condições aplicadas. Confira e remova os textos, que agora estão duplicados.'
  return (
    <PropertyDialog
      open={open}
      id="text-guards-dialog"
      className="grafcet-compact-dialog grafcet-text-guards"
      title="Textos de comparação → condições"
      subtitle={subtitle}
      saveLabel={phase === 'apply' ? `Aplicar ${plural(pending.length, 'condição', 'condições')}` : `Remover ${plural(covered.length, 'texto', 'textos')}`}
      closeLabel={phase === 'none' ? 'Fechar' : 'Cancelar'}
      hideSave={phase === 'none'}
      saveDisabled={phase === 'remove' && invalid > 0}
      footerHint={phase === 'none' ? 'Esc para fechar' : 'Pode desfazer com Ctrl+Z'}
      saveShortcutLabel={phase === 'apply' ? 'aplicar' : 'remover'}
      onSave={() => { if (phase === 'apply') onApply(); else if (phase === 'remove') onRemove(covered.map((match) => match.commentId)) }}
      onClose={onClose}
    >
      <div className="grafcet-text-guards-body">
        {phase === 'none' ? (
          <div className="grafcet-text-guards-empty" role="status">
            <span className="grafcet-text-guards-empty-icon" aria-hidden="true"><IconCheckCircle size={18} /></span>
            <div>
              <strong>Nada para converter</strong>
              <p>Não há textos de comparação por cima de transições neste projeto.{withGuard > 0 && <> {plural(withGuard, 'transição já tem', 'transições já têm')} condição «Só se».</>}</p>
              <dl className="grafcet-text-guards-help">
                <dt>Reconhece</dt><dd><code>G4 &lt;&gt; X159</code> (etapa inativa), <code>G1 &lt;=&gt; X11</code> (ativa) e vários ligados por <code>*</code>.</dd>
                <dt>Onde</dt><dd>Texto livre logo acima da transição que ativa essa etapa.</dd>
                <dt>À mão</dt><dd>Propriedades da transição → Origens → <b>Só se</b>.</dd>
              </dl>
            </div>
          </div>
        ) : (
          <>
            <ol className="grafcet-text-guards-steps" aria-label="Passos da conversão">
              <li className={phase === 'apply' ? 'is-current' : 'is-done'}><span>1</span>Aplicar condições</li>
              <li className={phase === 'remove' ? 'is-current' : ''}><span>2</span>Remover textos</li>
            </ol>
            <div className="grafcet-text-guards-counts">
              {pending.length > 0 && <span className="is-pending">{plural(pending.length, 'por aplicar', 'por aplicar')}</span>}
              {covered.length > 0 && <span className="is-done">{plural(covered.length, 'aplicada', 'aplicadas')}</span>}
              {unmatched.length > 0 && <span className="is-warning">{plural(unmatched.length, 'sem transição', 'sem transição')}</span>}
            </div>
            {invalid > 0 && <p className="grafcet-text-guards-note is-warning"><IconWarning size={14} /> {plural(invalid, 'condição de estado inválida', 'condições de estado inválidas')}: corrija antes de remover os textos.</p>}
            <ul className="grafcet-text-guards-list" aria-label="Textos encontrados">
              {matches.map((match) => {
                const transition = transitions.find((t) => t.id === match.transitionId)
                const full = transition ? receptivityOf({ condition: match.condition, guard: match.applied ? transition.guard : match.guard }) : match.guard
                return (
                  <li key={match.commentId} className={match.applied ? 'is-applied' : ''}>
                    <code className="grafcet-text-guards-text" title="Texto no desenho">{match.text.trim()}</code>
                    <IconArrowRight size={12} className="grafcet-text-guards-arrow" aria-hidden="true" />
                    <span className="grafcet-text-guards-target">
                      <b>{match.transitionName}</b>
                      <small>ativa X{match.step} · G{match.graph}{match.source ? ' · transição-fonte' : ''}</small>
                      <code title="Receptividade completa">{full}</code>
                    </span>
                    <span className={`grafcet-text-guards-state${match.applied ? ' is-done' : ''}`}>{match.applied ? 'Aplicada' : 'Por aplicar'}</span>
                    {onLocate && (
                      <button type="button" className="grafcet-text-guards-locate" onClick={() => onLocate(match.transitionId)} title={`Selecionar ${match.transitionName} no desenho`} aria-label={`Mostrar ${match.transitionName} no desenho`}>
                        <IconFocus size={12} />
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
            {unmatched.length > 0 && (
              <div className="grafcet-text-guards-unmatched">
                <p className="grafcet-text-guards-note is-warning"><IconWarning size={14} /> Parecem comparações, mas nenhuma transição ativa essa etapa por perto — ficam como estão:</p>
                <div>{unmatched.map((item) => <code key={item.commentId}>{item.text.trim()}</code>)}</div>
              </div>
            )}
          </>
        )}
      </div>
    </PropertyDialog>
  )
}
