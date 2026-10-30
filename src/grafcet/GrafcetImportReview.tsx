import { IconCheckCircle, IconFile, IconWarning } from '../ui/icons'

type Props = {
  fileName: string
  source: 'fluidsim4' | 'json'
  steps: number
  transitions: number
  actions: number
  texts: number
  warnings: string[]
  needsReview: boolean
}

const groups: { id: string; title: string; match: RegExp }[] = [
  { id: 'actions', title: 'Ações e qualificadores', match: /^(?:a\s+)?a[cç][ãa]o\b|qualificador|memorizada|for[cç]agem/i },
  { id: 'links', title: 'Ligações e destinos', match: /transi[cç][ãa]o|liga[cç][ãa]o|destino por refer[eê]ncia/i },
  { id: 'conditions', title: 'Condições e variáveis', match: /condi[cç][ãa]o|vari[aá]vel/i },
  { id: 'structure', title: 'Estrutura das etapas', match: /etapa inicial|identificador de etapa|etapas iniciais/i },
  { id: 'references', title: 'Referências externas', match: /refer[eê]ncias a outros GRAFCETs/i },
] as const

function groupWarnings(warnings: string[]) {
  const buckets = new Map<string, Map<string, number>>()
  for (const warning of warnings) {
    const group = groups.find((candidate) => candidate.match.test(warning))?.id ?? 'other'
    const items = buckets.get(group) ?? new Map<string, number>()
    items.set(warning, (items.get(warning) ?? 0) + 1)
    buckets.set(group, items)
  }
  return groups.concat({ id: 'other', title: 'Outros avisos', match: /.*/ }).flatMap((group) => {
    const items = buckets.get(group.id)
    if (!items?.size) return []
    return [{ id: group.id, title: group.title, items: [...items].map(([text, count]) => ({ text, count })) }]
  })
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="grafcet-import-review-metric"><strong>{value}</strong><span>{label}</span></div>
}

export default function GrafcetImportReview({ fileName, source, steps, transitions, actions, texts, warnings, needsReview }: Props) {
  const sections = groupWarnings(warnings)
  return (
    <div className="grafcet-import-review" data-testid="grafcet-import-review">
      <div className="grafcet-import-review-file">
        <span className="grafcet-import-review-file-icon" aria-hidden="true"><IconFile size={15} /></span>
        <span className="grafcet-import-review-file-copy"><strong title={fileName}>{fileName}</strong><small>{source === 'fluidsim4' ? 'FluidSIM 4' : 'Projeto GRAFCET'}</small></span>
      </div>

      <div className="grafcet-import-review-metrics" aria-label="Conteúdo importado">
        <Metric label="Etapas" value={steps} />
        <Metric label="Transições" value={transitions} />
        <Metric label="Ações" value={actions} />
        <Metric label="Textos" value={texts} />
      </div>

      <section className={`grafcet-import-review-status${needsReview ? ' is-review' : ' is-ready'}`} aria-live="polite">
        <span className="grafcet-import-review-status-icon" aria-hidden="true">{needsReview ? <IconWarning size={15} /> : <IconCheckCircle size={15} />}</span>
        <span><strong>{needsReview ? 'Desenho importado para revisão' : 'Ficheiro pronto a importar'}</strong>
          <small>{needsReview ? 'Complete a revisão das ligações, condições e ações antes de simular ou gerar Ladder.' : 'Não foram encontrados avisos na leitura do ficheiro.'}</small>
        </span>
      </section>

      {sections.length > 0 && <section className="grafcet-import-review-warnings" aria-label={`Avisos da importação: ${warnings.length}`}>
        <div className="grafcet-import-review-warnings-heading"><strong>Avisos para conferir</strong><span>{warnings.length}</span></div>
        <div className="grafcet-import-review-groups" role="region" aria-label={`Avisos da importação (${warnings.length})`} tabIndex={0}>
          {sections.map((section) => <section key={section.id} className="grafcet-import-review-group" aria-labelledby={`grafcet-import-review-${section.id}`}>
            <h3 id={`grafcet-import-review-${section.id}`}><span>{section.title}</span><span>{section.items.reduce((total, item) => total + item.count, 0)}</span></h3>
            <ul>{section.items.map((item, index) => <li key={`${section.id}-${index}`}>
              <span>{item.text}</span>{item.count > 1 && <small className="grafcet-import-review-repeat">×{item.count}</small>}
            </li>)}</ul>
            {section.id === 'links' && <p className="grafcet-import-review-tip">Transições sem etapa de origem (ex.: emergência) podem ser marcadas como <b>Transição-fonte</b> nas propriedades da transição; <code>G0 &lt;&gt; Xn</code> limita-as ao estado de outra etapa.</p>}
          </section>)}
        </div>
      </section>}

      <p className="grafcet-import-review-replace">A importação substitui todas as páginas GRAFCET do projeto atual. Pode desfazer depois.</p>
    </div>
  )
}
