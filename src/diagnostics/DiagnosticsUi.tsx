import { useSimStore } from '../store/useSimStore'
import { useCommandsUi } from '../commands/commandsUi'
import { IconCheck, IconCheckCircle, IconWarning, IconXCircle } from '../ui/icons'
import { useCommandsDiagnostics, useGrafcetDiagnostics, useLadderDiagnostics, useSchematicDiagnostics, type DiagItem, type DiagSummary, type DiagView } from './viewDiagnostics'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Texto curto do estado: «Tudo OK», «2 avisos», «1 erro · 3 avisos». */
export function diagText(summary: DiagSummary): string {
  if (summary.status === 'ok') return 'Tudo OK'
  const parts = [summary.errors ? plural(summary.errors, 'erro', 'erros') : '', summary.warnings ? plural(summary.warnings, 'aviso', 'avisos') : ''].filter(Boolean)
  return parts.join(' · ')
}

/**
 * Etiqueta de estado (como a do separador Diagnóstico do GRAFCET): ✓ verde quando está tudo OK,
 * ! âmbar com o n.º de avisos, ✖ vermelho com o n.º de erros. `compact` mostra só o ícone e o número.
 */
export function DiagnosticsTag({ summary, compact = false, badge = false, onClick, label }: { summary: DiagSummary; compact?: boolean; /** Selo no canto do ícone (não ocupa largura). */ badge?: boolean; onClick?: () => void; label?: string }) {
  const Icon = summary.status === 'error' ? IconXCircle : summary.status === 'warning' ? IconWarning : IconCheckCircle
  const count = summary.status === 'error' ? summary.errors : summary.status === 'warning' ? summary.warnings : 0
  const text = diagText(summary)
  const title = `${label ? `${label}: ` : ''}${text}${onClick ? ' — abrir diagnóstico' : ''}`
  const body = <>
    {badge ? (summary.status === 'ok' ? <IconCheck size={7} /> : <b>{count > 99 ? '99+' : count}</b>) : <Icon size={compact ? 10 : 11} />}
    {badge ? null : compact ? (summary.status !== 'ok' && <b>{count}</b>) : <span>{text}</span>}
  </>
  const className = `dc-diag-tag is-${summary.status}${compact || badge ? ' is-compact' : ''}${badge ? ' is-badge' : ''}`
  return onClick
    ? <button type="button" className={className} onClick={(event) => { event.stopPropagation(); onClick() }} title={title} aria-label={title} data-diag-status={summary.status}>{body}</button>
    : <span className={className} title={title} role="status" aria-label={title} data-diag-status={summary.status}>{body}</span>
}

function SchematicTag(props: TagProps) { return <DiagnosticsTag summary={useSchematicDiagnostics()} {...props} /> }
function CommandsTag(props: TagProps) { return <DiagnosticsTag summary={useCommandsDiagnostics()} {...props} /> }
function LadderTag(props: TagProps) { return <DiagnosticsTag summary={useLadderDiagnostics()} {...props} /> }
function GrafcetTag(props: TagProps) { return <DiagnosticsTag summary={useGrafcetDiagnostics()} {...props} /> }
type TagProps = { compact?: boolean; badge?: boolean; onClick?: () => void; label?: string }

/** Etiqueta de uma vista (cada uma só subscreve os dados de que precisa). */
export function ViewDiagnosticsTag({ view, ...props }: TagProps & { view: DiagView }) {
  if (view === 'schematic') return <SchematicTag {...props} />
  if (view === 'commands') return <CommandsTag {...props} />
  if (view === 'ladder') return <LadderTag {...props} />
  return <GrafcetTag {...props} />
}

/** Painel «Diagnóstico»: resumo + lista de problemas (clicar seleciona a entidade, quando existe). */
export function DiagnosticsPanel({ summary, onSelect, okChecks, context }: { summary: DiagSummary; onSelect?: (item: DiagItem) => void; okChecks: string[]; context?: string }) {
  const valid = summary.status === 'ok'
  return <div className="grafcet-diagnostics dc-diag-panel" data-diag-panel>
    <div className={`grafcet-diagnostic-summary ${valid ? 'is-valid' : 'has-issues'}`} role="status" aria-live="polite">
      <strong>{valid ? 'Tudo OK' : diagText(summary)}</strong>
      <span>{valid ? 'Nenhum problema encontrado.' : onSelect ? 'Selecione um problema para abrir o elemento correspondente.' : 'Reveja os pontos abaixo.'}{context ? ` ${context}` : ''}</span>
    </div>
    {summary.items.map((item) => {
      const clickable = !!onSelect && !!item.target
      return <button key={item.id} type="button" className={`grafcet-issue is-${item.level}`} disabled={!clickable} onClick={() => clickable && onSelect!(item)}>
        <b>{item.level === 'error' ? '✖' : item.level === 'warning' ? '!' : 'i'}</b>
        <span>{item.message}</span>
        {clickable ? <em>abrir</em> : <em />}
      </button>
    })}
    {valid && <div className="grafcet-validation-checks">{okChecks.map((check) => <span key={check}><IconCheck size={10} className="ui-ck" />{check}</span>)}</div>}
  </div>
}

const SCHEMATIC_OK = ['Cabos ligados a bornes existentes', 'Bobinas com alimentação e retorno', 'Motores com proteção térmica', 'Sem falhas nem intertravamentos violados']
const COMMANDS_OK = ['Alimentação presente', 'Bobinas, sinalizadores e motores ligados', 'Contactos com a respetiva bobina', 'Referências IEC preenchidas', 'Sem curto-circuitos na simulação']

/** Painel lateral «Diagnóstico» do 3D Realista: clicar seleciona o componente no esquema/3D. */
export function SchematicDiagnosticsPanel() {
  const summary = useSchematicDiagnostics()
  const running = useSimStore((s) => s.sim.runState !== 'stopped')
  return <DiagnosticsPanel summary={summary} okChecks={SCHEMATIC_OK}
    context={running ? 'Diagnóstico da simulação em curso.' : 'Verificação da montagem (prima Run para o diagnóstico em funcionamento).'}
    onSelect={(item) => { if (item.target) useSimStore.getState().selectComponents([item.target]) }} />
}

/** Painel lateral «Diagnóstico» do Esquema IEC: clicar seleciona e enquadra o símbolo. */
export function CommandsDiagnosticsPanel() {
  const summary = useCommandsDiagnostics()
  const empty = useSimStore((s) => !(s.commands?.parts?.length))
  return <DiagnosticsPanel summary={summary} okChecks={empty ? [] : COMMANDS_OK} context={empty ? 'O esquema está vazio — coloque símbolos da Biblioteca ou abra um exemplo.' : undefined}
    onSelect={(item) => {
      if (!item.target) return
      const ui = useCommandsUi.getState()
      ui.select({ type: 'part', id: item.target }, 'canvas')
      ui.emit('focusSelection')
    }} />
}
