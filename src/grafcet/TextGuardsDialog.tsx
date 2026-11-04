import { useEffect, useMemo, useState } from 'react'
import { guardErrors, scanTextGuards, type TextGuardMatch } from './textGuards'
import { receptivityOf, type GrafcetProgram } from './engine'
import PropertyDialog from '../ui/PropertyDialog'
import { IconArrowRight, IconCheckCircle, IconFocus, IconWarning } from '../ui/icons'
import '../styles/grafcet-dialog-ux.css'

interface Props {
  open: boolean
  program: GrafcetProgram
  /** Converte os textos escolhidos: acrescenta as condições em falta e, se `keepTexts` for falso,
   *  remove os textos do desenho — tudo numa só operação (um Ctrl+Z desfaz). */
  onConvert: (commentIds: string[], keepTexts: boolean) => void
  /** Seleciona a transição no desenho (fecha a modal). */
  onLocate?: (transitionId: string) => void
  onClose: () => void
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * Textos de comparação (`G4 <> X159`) por cima de uma transição → condição «Só se» dessa transição.
 * Uma lista agrupada por GRAFCET, com escolha por linha e uma única ação «Converter».
 */
export default function TextGuardsDialog({ open, program, onConvert, onLocate, onClose }: Props) {
  const { matches, unmatched } = useMemo(() => scanTextGuards(program), [program])
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [keepTexts, setKeepTexts] = useState(false)
  // Ao abrir (ou quando a lista muda), tudo escolhido.
  const signature = matches.map((match) => `${match.commentId}:${match.applied ? 1 : 0}`).join('|')
  useEffect(() => { if (open) setChosen(new Set(matches.map((match) => match.commentId))) }, [open, signature]) // eslint-disable-line react-hooks/exhaustive-deps

  const transitions = program.transitions ?? []
  const withGuard = transitions.filter((transition) => transition.guard?.trim()).length
  const selected = matches.filter((match) => chosen.has(match.commentId))
  const toApply = selected.filter((match) => !match.applied).length
  const toRemove = keepTexts ? 0 : selected.length
  const invalid = guardErrors(program)
  const allChosen = matches.length > 0 && selected.length === matches.length
  const groups = useMemo(() => {
    const byGraph = new Map<number, TextGuardMatch[]>()
    for (const match of matches) byGraph.set(match.graph, [...(byGraph.get(match.graph) ?? []), match])
    return [...byGraph].sort(([a], [b]) => a - b)
  }, [matches])
  const toggle = (id: string) => setChosen((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const toggleAll = () => setChosen(allChosen ? new Set() : new Set(matches.map((match) => match.commentId)))

  const nothing = !matches.length
  const actionLabel = !selected.length
    ? 'Escolha textos'
    : keepTexts
      ? (toApply ? `Aplicar ${plural(toApply, 'condição', 'condições')}` : 'Nada a aplicar')
      : `Converter ${selected.length}`
  const summary = !selected.length
    ? 'Nenhum texto escolhido'
    : [toApply && plural(toApply, 'condição a aplicar', 'condições a aplicar'), toRemove && plural(toRemove, 'texto a remover', 'textos a remover')].filter(Boolean).join(' · ') || 'Nada a fazer'

  return (
    <PropertyDialog
      open={open}
      id="text-guards-dialog"
      className="grafcet-compact-dialog grafcet-text-guards"
      title="Textos de comparação → condições"
      subtitle="Textos como «G4 <> X159» por cima de uma transição passam a ser a condição «Só se» dessa transição."
      saveLabel={actionLabel}
      closeLabel={nothing ? 'Fechar' : 'Cancelar'}
      hideSave={nothing}
      saveDisabled={!selected.length || (keepTexts && !toApply) || (!keepTexts && invalid > 0)}
      footerHint={nothing ? 'Esc para fechar' : `${summary} · Ctrl+Z desfaz`}
      saveShortcutLabel="converter"
      onSave={() => onConvert(selected.map((match) => match.commentId), keepTexts)}
      onClose={onClose}
    >
      <div className="grafcet-text-guards-body">
        {nothing ? (
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
            <div className="grafcet-text-guards-bar">
              <label className="grafcet-text-guards-all">
                <input type="checkbox" checked={allChosen} ref={(el) => { if (el) el.indeterminate = selected.length > 0 && !allChosen }} onChange={toggleAll} />
                <span>{allChosen ? 'Todos escolhidos' : `${selected.length} de ${matches.length} escolhidos`}</span>
              </label>
              <span className="grafcet-text-guards-counts">
                {matches.some((match) => !match.applied) && <span className="is-pending">{plural(matches.filter((match) => !match.applied).length, 'por aplicar', 'por aplicar')}</span>}
                {matches.some((match) => match.applied) && <span className="is-done">{plural(matches.filter((match) => match.applied).length, 'já aplicada', 'já aplicadas')}</span>}
              </span>
            </div>
            {invalid > 0 && <p className="grafcet-text-guards-note is-warning"><IconWarning size={14} /> {plural(invalid, 'condição de estado inválida', 'condições de estado inválidas')} no projeto: corrija antes de remover textos.</p>}
            <div className="grafcet-text-guards-groups">
              {groups.map(([graph, items]) => (
                <section key={graph} className="grafcet-text-guards-group" aria-label={`GRAFCET G${graph}`}>
                  <h4>G{graph} <small>{plural(items.length, 'texto', 'textos')}</small></h4>
                  <ul className="grafcet-text-guards-list">
                    {items.map((match) => {
                      const transition = transitions.find((t) => t.id === match.transitionId)
                      const full = transition ? receptivityOf({ condition: match.condition, guard: match.applied ? transition.guard : match.guard }) : match.guard
                      const on = chosen.has(match.commentId)
                      return (
                        <li key={match.commentId} className={`${match.applied ? 'is-applied' : ''}${on ? '' : ' is-off'}`}>
                          <input type="checkbox" checked={on} onChange={() => toggle(match.commentId)} aria-label={`Converter «${match.text.trim()}» em ${match.transitionName}`} />
                          <code className="grafcet-text-guards-text" title="Texto no desenho">{match.text.trim()}</code>
                          <IconArrowRight size={12} className="grafcet-text-guards-arrow" aria-hidden="true" />
                          <span className="grafcet-text-guards-target">
                            <span><b>{match.transitionName}</b> <small>· só se <code>{match.guard}</code></small></span>
                            <small>ativa X{match.step}{match.source ? ' · transição-fonte' : ''} · receptividade <code>{full}</code></small>
                          </span>
                          <span className={`grafcet-text-guards-state${match.applied ? ' is-done' : ''}`}>{match.applied ? 'Já aplicada' : 'Nova'}</span>
                          {onLocate && (
                            <button type="button" className="grafcet-text-guards-locate" onClick={() => onLocate(match.transitionId)} title={`Selecionar ${match.transitionName} no desenho`} aria-label={`Mostrar ${match.transitionName} no desenho`}>
                              <IconFocus size={12} />
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))}
            </div>
            {unmatched.length > 0 && (
              <div className="grafcet-text-guards-unmatched">
                <p className="grafcet-text-guards-note is-warning"><IconWarning size={14} /> Parecem comparações, mas nenhuma transição ativa essa etapa por perto — ficam como estão:</p>
                <div>{unmatched.map((item) => <code key={item.commentId}>{item.text.trim()}</code>)}</div>
              </div>
            )}
            <label className="grafcet-text-guards-keep">
              <input type="checkbox" checked={keepTexts} onChange={(event) => setKeepTexts(event.target.checked)} />
              <span><b>Manter os textos no desenho para conferir</b><small>Só aplica as condições; pode voltar aqui para remover os textos depois.</small></span>
            </label>
          </>
        )}
      </div>
    </PropertyDialog>
  )
}
