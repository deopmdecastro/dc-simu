import type { LadderCompareOp } from '../types'
import { compareNumbers } from '../ladder/compare'
import { normalizeBitAddress } from '../ladder/addresses'
/** Qualificadores de ação (IEC 60848 simplificado e estendido FluidSIM):
 *  N = contínua (enquanto a etapa está ativa e a condição é verdadeira)
 *  S = memorizada: coloca a saída a 1 e mantém-na até um R
 *  R = repõe a saída memorizada a 0
 *  D = retardada: só liga depois de `timeMs` com a etapa ativa
 *  L = limitada: liga ao ativar a etapa e desliga após `timeMs`
 *  A = ativação: pulso ao ativar a etapa (↑)
 *  DA = desativação: pulso ao desativar a etapa (↓)
 *  EV = evento: disparada por evento (⮥)
 *  C = comando imperativo / forçagem */
export type GrafcetActionKind = 'N' | 'S' | 'R' | 'D' | 'L' | 'A' | 'DA' | 'EV' | 'C'

export type GrafcetActionAllocation = 'continuous' | 'activation' | 'deactivation' | 'event' | 'compulsory'

export type GrafcetStepType =
  | 'simple'             // Etapa normal (□)
  | 'initial'            // Etapa inicial (duplo quadrado)
  | 'macro'              // Macro-etapa (com barra M)
  | 'macro-input'        // Entrada de macro-etapa (com E)
  | 'macro-output'       // Saída de macro-etapa (com S)
  | 'enclosing'          // Etapa encapsulante (cantos diagonais)
  | 'initial-enclosing'  // Etapa encapsulante inicial

export interface GrafcetAction {
  id: string
  address: string
  condition: string
  kind?: GrafcetActionKind
  timeMs?: number
  type?: 'simple' | 'conditional'
  allocation?: GrafcetActionAllocation
  description?: string
  displayDescription?: boolean
  variable?: string
  /** Posição livre no diagrama (só para ações soltas, sem etapa associada) */
  x?: number
  y?: number
  /** Página (chart) a que a ação solta pertence; undefined = primeira página. */
  chart?: string
  /** Tamanho da caixa no diagrama (por omissão 140 × 30). */
  w?: number
  h?: number
  /** Ação anexada: deslocamento livre da caixa em relação ao seu lugar junto à etapa (a ligação acompanha). */
  dx?: number
  dy?: number
  /** Ligação gráfica após outra ação da mesma etapa; acompanha a sua posição e tamanho. */
  afterActionId?: string
}

export interface GrafcetStep {
  id: string
  name: string
  initial: boolean
  stepType?: GrafcetStepType
  action: string // ação legada; mantida para projetos anteriores
  condition: string // transição legada na sequência linear
  actions?: GrafcetAction[]
  comment?: string
  description?: string
  activationLink?: boolean
  /** Disposição das ações no diagrama: 'row' = lado a lado (por omissão), 'column' = empilhadas. */
  actionLayout?: 'row' | 'column'
  /** Posição manual no diagrama: x = eixo central da etapa, y = topo. Só é usada quando `pinned` é true. */
  x?: number
  y?: number
  /** true quando o utilizador arrastou a etapa (ou usou "Organizar"); caso contrário o layout é automático. */
  pinned?: boolean
  chart?: string
  /** Tamanho da caixa da etapa no diagrama (por omissão 64 × 54); cresce a partir do eixo central. */
  w?: number
  h?: number
}

export type GrafcetBranchType =
  | 'none'
  | 'or-divergence'
  | 'or-convergence'
  | 'and-divergence'
  | 'and-convergence'

/** Uma transição pode ter várias origens (convergência AND/OR) e vários destinos (divergência AND/OR). */
export interface GrafcetTransitionComparison {
  grafcet: string
  transition: string
  condition?: string
  note?: string
}

export interface GrafcetTransition {
  id: string
  from: string[]
  to: string[]
  condition: string
  comment?: string
  name?: string
  description?: string
  displayDescription?: boolean
  targetInfo?: string
  /** Referências a transições equivalentes noutros GRAFCETs, sem alterar a execução local. */
  comparisons?: GrafcetTransitionComparison[]
  x?: number
  y?: number
  branchType?: GrafcetBranchType
  /** Ligação por referência (IEC 60848): a linha entre etapas não é desenhada;
   *  cada ponta mostra o número da etapa do outro lado (ex.: X141). */
  wireless?: boolean
  chart?: string
  /** Transição-fonte (IEC 60848): sem etapa de origem, está sempre validada e dispara
   *  quando a receptividade é verdadeira (ex.: emergência → etapa de paragem). */
  source?: boolean
  /** Condição de estado da origem (ex.: `G3 <> X149`): estado de etapas deste ou de outro GRAFCET
   *  que a transição exige além da receptividade. É desenhada por cima da transição — numa
   *  transição-fonte evita, por exemplo, re-disparar enquanto a etapa de destino está ativa. */
  guard?: string
}

/** Receptividade completa avaliada pelo motor: condição E condição de estado da origem. */
export function receptivityOf(transition: Pick<GrafcetTransition, 'condition' | 'guard'>): string {
  const condition = (transition.condition ?? '').trim()
  const guard = (transition.guard ?? '').trim()
  if (!guard) return condition
  if (!condition || condition === '1') return guard
  const wrap = (text: string) => (/\+|\bOR\b/i.test(text) ? `(${text})` : text)
  return `${wrap(condition)} * ${wrap(guard)}`
}

/** Texto livre do GRAFCET (legendas, títulos, notas de projeto). */
export interface GrafcetComment {
  id: string
  text: string
  /** Ponto de ancoragem: esquerda/centro/direita conforme `align`, topo da 1.ª linha. */
  x: number
  y: number
  fontSize?: number
  fontWeight?: string
  font?: 'sans' | 'serif' | 'mono' | 'rounded' | 'hand'
  color?: string
  italic?: boolean
  underline?: boolean
  align?: 'left' | 'center' | 'right'
  background?: string
  chart?: string
}

export interface GrafcetChart {
  id: string
  name: string
  title: string
}

export interface GrafcetProgram {
  /** Desenho importado para revisão: editável, sem execução nem conversão automática. */
  importReview?: { source: 'fluidsim4'; warnings: string[] }
  /** Nome do GRAFCET (aparece no editor e nas networks geradas). */
  name?: string
  steps: GrafcetStep[]
  transitions?: GrafcetTransition[]
  /** Ações soltas: criadas sem etapa; ligam-se depois por arrasto ou por linha */
  freeActions?: GrafcetAction[]
  comments?: GrafcetComment[]
  /** Pontos de quebra das ligações (duplo clique na linha), por id de transição ligada 1→1. */
  linkBends?: Record<string, Array<{ x: number; y: number }>>
  /** Posição livre da barra de cada transição ligada (arrastada pelo utilizador); só vale enquanto estiver sobre o percurso. */
  linkBars?: Record<string, { x: number; y: number }>
  charts?: GrafcetChart[]
  activeChart?: string
}

export interface GrafcetRuntime {
  active: string[]
  owned: string[]
  /** tempo (ms) que cada etapa ativa leva ativa */
  elapsed?: Record<string, number>
  /** valores das entradas no scan anterior (para flancos ^I1 e \I1) */
  prev?: Record<string, boolean>
  /** saídas memorizadas por ações S/R */
  stored?: Record<string, boolean>
  /** tempo simulado acumulado (ms): relógio das condições em Hz */
  simTimeMs?: number
  /** nº de transições disparadas desde o início */
  fired?: number
  /** última transição disparada (id) e quando (nº do scan) */
  lastFired?: string[]
  /** Histórico dos últimos disparos (mais recente no fim), limitado a GRAFCET_HISTORY_LIMIT. */
  history?: GrafcetFiring[]
  /** Conflitos de ações detetados na última varredura (S e R à mesma saída no mesmo instante). */
  conflicts?: GrafcetActionConflict[]
}

export interface GrafcetFiring {
  transitionId: string
  from: string[]
  to: string[]
  /** tempo simulado (ms) do disparo */
  atMs: number
  /** true quando foi disparada à mão (forçagem), sem avaliar a receptividade */
  forced?: boolean
}

export interface GrafcetActionConflict {
  address: string
  /** etapas que pediram SET (memorizar a 1) */
  setBy: string[]
  /** etapas que pediram RESET (memorizar a 0) */
  resetBy: string[]
}

export const GRAFCET_HISTORY_LIMIT = 30

const pushHistory = (history: GrafcetFiring[] | undefined, entries: GrafcetFiring[]): GrafcetFiring[] =>
  [...(history ?? []), ...entries].slice(-GRAFCET_HISTORY_LIMIT)

export const emptyGrafcet = (): GrafcetProgram => ({ steps: [], transitions: [], comments: [] })
export const emptyGrafcetRuntime = (): GrafcetRuntime => ({ active: [], owned: [], elapsed: {}, prev: {}, stored: {}, simTimeMs: 0, fired: 0, lastFired: [], history: [], conflicts: [] })

export const validBit = (address: string) => !!normalizeBitAddress(address)

const DISALLOWED_VARS = new Set([
  'MOVE', 'ADD', 'SUB', 'MUL', 'DIV', 'CALL', 'RET', 'JMP', 'NOP', 'TON', 'TOF', 'TP', 'CTU', 'CTD',
])

export const validGrafcetVariable = (v: string): boolean => {
  const s = v.trim()
  if (!s || DISALLOWED_VARS.has(s.toUpperCase())) return false
  if (/^[IQM]\d{1,2}$/i.test(s)) return true
  if (/^%?[IQM][XBWDL]?\d+(?:\.\d+)?$/i.test(s)) return true
  // Aceita identificadores industriais com «+»/«-» (pneumática) em qualquer posição
  // após o primeiro carácter, além do sufixo final clássico (Y0_A+, Y7_E+_Vacuo_On).
  if (/^[A-Za-z_][A-Za-z0-9_+-]*$/i.test(s)) return true
  return false
}

/** Sanitiza um nome de ação/variável para o formato aceite pelo motor e pelo parser de condições.
 *  Preserva um único «+» ou «-» final (notação pneumática) e substitui os restantes caracteres
 *  especiais (incluindo «+»/«-» no meio) por «_». */
export function sanitizeActionVariable(value: string): string {
  const text = value.trim().replace(/^%/, '')
  if (!text) return text
  const suffix = /[+-]$/.test(text) ? text.slice(-1) : ''
  let name = suffix ? text.slice(0, -1) : text
  name = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
  if (!name) name = 'V'
  if (!/^[A-Za-z]/.test(name)) name = `V${name}`
  return name + suffix
}

export const ACTION_KINDS: Array<{ id: GrafcetActionKind; label: string; hint: string; timed: boolean }> = [
  { id: 'N', label: 'N · Contínua', hint: 'Ativa enquanto a etapa estiver ativa.', timed: false },
  { id: 'S', label: 'S · Memorizada (set)', hint: 'Coloca a saída a 1 e mantém-na até uma ação R.', timed: false },
  { id: 'R', label: 'R · Reposição (reset)', hint: 'Repõe a saída memorizada a 0.', timed: false },
  { id: 'D', label: 'D · Retardada', hint: 'Liga só depois do tempo indicado com a etapa ativa.', timed: true },
  { id: 'L', label: 'L · Limitada', hint: 'Liga ao ativar a etapa e desliga após o tempo indicado.', timed: true },
  { id: 'A', label: '↑ · Ao ativar', hint: 'Pulso de ativação ao entrar na etapa.', timed: false },
  { id: 'DA', label: '↓ · Ao desativar', hint: 'Pulso na varredura em que a etapa é desativada.', timed: false },
  { id: 'EV', label: '⮥ · No evento', hint: 'Disparada por evento sob condição (apenas notação; não é executada pelo simulador).', timed: false },
  { id: 'C', label: 'C · Forçagem', hint: 'Comando imperativo: a saída é forçada enquanto a etapa está ativa.', timed: false },
]

/** Contexto de avaliação de uma condição. */
export interface ConditionContext {
  table: Record<string, boolean>
  prev?: Record<string, boolean>
  /** etapas ativas por número (índice na lista de etapas) */
  activeIndexes?: Set<number>
  /** nomes ou IDs das etapas ativas */
  activeStepNames?: Set<string>
  activeStepIds?: Set<string>
  /** tempo (ms) em que as origens da transição estão ativas */
  elapsedMs?: number
  /** tempo (ms) ativo de cada etapa indexado por id, nome ou índice */
  stepElapsed?: Record<string, number>
  stepElapsedByName?: Record<string, number>
  /** números de etapa (o que o utilizador escreve em X<n>) existentes / ativos e respetivo tempo ativo */
  knownStepNumbers?: Set<string>
  activeStepNumbers?: Set<string>
  stepElapsedByNumber?: Record<string, number>
  /** O mesmo, mas por página/GRAFCET: chave «0» (G0), «1» (G1)… Permite que
   *  `G1 <=> X11` leia a etapa 11 da página G1 em vez da numeração global. */
  knownStepNumbersByGraph?: Record<string, Set<string>>
  activeStepNumbersByGraph?: Record<string, Set<string>>
  simTimeMs?: number
}

/** Número de uma etapa tal como aparece no diagrama: «Etapa 9», «E9», «9 - Espera» ou «9» → «9».
 *  Mantém as mesmas regras de `getStepDisplayInfo` (editor), para X<n> referir sempre a etapa desenhada. */
/** Comparações numéricas nas condições: MW1>=5, C1==3, T1>2000, MW1<>MW2 (operadores como no Ladder). */
export const COMPARE_TOKEN = String.raw`(?:MW\d{1,4}|[TC]\d{1,3})\s*(?:==|<>|>=|<=|>|<)\s*(?:[+-]?\d+(?:\.\d+)?|MW\d{1,4}|[TC]\d{1,3})`
let numericReader: ((operand: string) => number | undefined) | null = null
/** O simulador regista aqui a leitura de MWn / Cn / Tn (valores em tempo de execução). */
export const setGrafcetNumericReader = (reader: ((operand: string) => number | undefined) | null) => { numericReader = reader }
const readNumber = (raw: string): number => {
  const text = raw.trim().toUpperCase()
  if (/^[+-]?\d+(?:\.\d+)?$/.test(text)) return Number(text)
  return numericReader?.(text) ?? 0
}
export function parseCompareToken(token: string): { left: string; op: LadderCompareOp; right: string } | null {
  const m = token.replace(/\s+/g, '').toUpperCase().match(/^((?:MW\d{1,4}|[TC]\d{1,3}))(==|<>|>=|<=|>|<)((?:[+-]?\d+(?:\.\d+)?|MW\d{1,4}|[TC]\d{1,3}))$/)
  return m ? { left: m[1], op: m[2] as LadderCompareOp, right: m[3] } : null
}

export function stepNumberOf(step: { name?: string }, fallbackIndex: number): string {
  const raw = (step.name || '').trim()
  if (!raw) return String(fallbackIndex)
  const prefixed = raw.match(/^(?:Etapa|Step|E)\s*(\d+[a-zA-Z]?)(?:\s*[-:]\s*(.*))?$/i)
  if (prefixed) return prefixed[1]
  const withComment = raw.match(/^(\d+[a-zA-Z]?)(?:\s*[-:]\s*(.*))$/)
  if (withComment) return withComment[1]
  if (/^\d+[a-zA-Z]?$/.test(raw)) return raw
  if (raw.length <= 5 && !raw.includes(' ')) return raw
  return String(fallbackIndex)
}

/** Grafcets parciais: G0X9, G3X12, G1 <=> X5, 5s/G2X4 → o prefixo G… é ignorado porque o
 *  programa só tem um grafcet; G0X9 funciona exactamente como X9. */
export function stripGrafcetPrefix(expression: string): string {
  return expression.replace(/(?<![A-Za-z0-9_])G\d+\s*(?:<=>|=>|<=|=|:|\.|-)?\s*(?=X\d)/gi, '')
}

/** Um GRAFCET do projeto: a 1.ª página é **G0** (o grafo principal) e as seguintes
 *  são G1, G2… — a mesma numeração que as receptividades usam em `G1 <=> X11`.
 *  As páginas partilham o motor e a numeração global das etapas, por isso uma
 *  transição de uma página pode depender do estado de uma etapa de outra. */
export interface GrafcetGraph {
  /** Número usado nas referências: 0, 1, 2… */
  number: number
  /** «G0», «G1»… */
  key: string
  chartId?: string
  /** Nome legível: a página («Página 2», «Manual Cilindro A») ou o nome do programa. */
  label: string
  steps: GrafcetStep[]
}

export const graphKey = (number: number): string => `G${number}`

/** Título de GRAFCET desenhado como texto: «G3 - Manual - Cilindro A», «G0: Controlo», «G1 · Ciclo». */
const GRAPH_TITLE = /^\s*G(\d+)\s*[-–—:·]\s*(\S.*)$/

interface GraphTitle { number: number; label: string; x: number; y: number; chart: string }

/** Títulos `G<n> - …` por página: vários GRAFCETs podem partilhar a mesma página. */
function graphTitles(program: GrafcetProgram): GraphTitle[] {
  const firstChart = program.charts?.[0]?.id ?? ''
  return (program.comments ?? []).flatMap((comment) => {
    const match = (comment.text ?? '').split('\n')[0].match(GRAPH_TITLE)
    return match ? [{ number: Number(match[1]), label: match[2].trim(), x: comment.x, y: comment.y, chart: comment.chart ?? firstChart }] : []
  })
}

/** Título que «governa» um ponto: o mais próximo acima e à esquerda (com folga), na mesma página. */
function titleAt(titles: GraphTitle[], x: number, y: number): GraphTitle | undefined {
  let best: GraphTitle | undefined
  let score = Infinity
  for (const title of titles) {
    if (title.y > y + 8 || title.x > x + 80) continue
    const distance = (x - title.x) + (y - title.y)
    if (distance < score) { best = title; score = distance }
  }
  // Etapa acima/à esquerda de todos os títulos: fica no título mais próximo.
  if (!best) for (const title of titles) {
    const distance = Math.hypot(x - title.x, y - title.y)
    if (distance < score) { best = title; score = distance }
  }
  return best
}

/** Número do GRAFCET de cada etapa: pelo título `G<n> - …` da sua página ou, sem títulos, pela página. */
export function stepGraphNumbers(program: GrafcetProgram): Map<string, number> {
  const charts = program.charts ?? []
  const firstChart = charts[0]?.id ?? ''
  const titles = graphTitles(program)
  const result = new Map<string, number>()
  for (const step of program.steps) {
    const chart = step.chart ?? firstChart
    const onPage = titles.filter((title) => title.chart === chart)
    const title = onPage.length ? titleAt(onPage, step.x ?? 0, step.y ?? 0) : undefined
    result.set(step.id, title ? title.number : Math.max(0, charts.findIndex((item) => item.id === chart)))
  }
  return result
}

/** GRAFCETs do programa: os títulos `G<n> - …` (mesmo vários na mesma página) e, sem títulos, as
 *  páginas (G0 a primeira, G1 a segunda…). Sem páginas nem títulos, o programa inteiro é G0. */
export function grafcetGraphs(program: GrafcetProgram): GrafcetGraph[] {
  const charts = program.charts ?? []
  const titles = graphTitles(program)
  if (titles.length) {
    const numbers = stepGraphNumbers(program)
    const byNumber = new Map<number, GrafcetGraph>()
    for (const title of titles) {
      if (!byNumber.has(title.number)) byNumber.set(title.number, { number: title.number, key: graphKey(title.number), chartId: title.chart || undefined, label: title.label, steps: [] })
    }
    for (const step of program.steps) {
      const number = numbers.get(step.id) ?? 0
      if (!byNumber.has(number)) {
        const chart = charts[number]
        byNumber.set(number, { number, key: graphKey(number), chartId: chart?.id, label: (chart?.title || chart?.name || `GRAFCET ${number}`).trim(), steps: [] })
      }
      byNumber.get(number)!.steps.push(step)
    }
    return [...byNumber.values()].sort((left, right) => left.number - right.number)
  }
  if (!charts.length) {
    return [{ number: 0, key: 'G0', label: (program.name ?? '').trim() || 'GRAFCET', steps: program.steps }]
  }
  const first = charts[0].id
  return charts.map((chart, index) => ({
    number: index,
    key: graphKey(index),
    chartId: chart.id,
    label: (chart.title || chart.name || `Página ${index + 1}`).trim(),
    steps: program.steps.filter((step) => (step.chart ?? first) === chart.id),
  }))
}

/** GRAFCET de uma transição: o das suas etapas ou, se ainda não tem nenhuma, o do título mais próximo. */
export function graphNumberOfTransition(program: GrafcetProgram, transition: GrafcetTransition): number {
  const numbers = stepGraphNumbers(program)
  for (const id of [...transition.from, ...transition.to]) {
    const number = numbers.get(id)
    if (number !== undefined) return number
  }
  const charts = program.charts ?? []
  const chart = transition.chart ?? charts[0]?.id ?? ''
  const onPage = graphTitles(program).filter((title) => title.chart === chart)
  const title = onPage.length ? titleAt(onPage, transition.x ?? 0, transition.y ?? 0) : undefined
  return title ? title.number : Math.max(0, charts.findIndex((item) => item.id === chart))
}

/** Índice global de cada etapa (a base do número mostrado em X<n>). */
const globalStepIndex = (program: GrafcetProgram): Map<string, number> =>
  new Map(program.steps.map((step, index) => [step.id, index]))

/** Número do grafo a que uma etapa pertence (título `G<n> - …` ou página; 0 sem nenhum). */
export function graphNumberOfStep(program: GrafcetProgram, step: GrafcetStep): number {
  return stepGraphNumbers(program).get(step.id) ?? 0
}

/** Números de etapa existentes e ativos, por grafo («0», «1»…). */
export function graphStepNumbers(program: GrafcetProgram, active?: ReadonlySet<string>): { known: Record<string, Set<string>>; active: Record<string, Set<string>> } {
  const index = globalStepIndex(program)
  const known: Record<string, Set<string>> = {}
  const activeNumbers: Record<string, Set<string>> = {}
  for (const graph of grafcetGraphs(program)) {
    const key = String(graph.number)
    known[key] = new Set<string>()
    activeNumbers[key] = new Set<string>()
    for (const step of graph.steps) {
      const number = stepNumberOf(step, index.get(step.id) ?? 0)
      known[key].add(number)
      if (active?.has(step.id)) activeNumbers[key].add(number)
    }
  }
  return { known, active: activeNumbers }
}

/** Prefixos aceites antes de X<n>: G1X11, G1 <=> X11, G1:X11, G1.X11, G1=X11, G1=>X11.
 *  As formas com separador são normalizadas para `G<n>X<m>` antes da análise. */
const normalizeGraphReferences = (expression: string): string =>
  expression
    .replace(/\bG(\d+)\s*(?:=>|<=|:|\s*\.)\s*(?=X\d)/gi, 'G$1')
    .replace(/(?<![A-Za-z0-9_])G(\d+)\s*-\s*(?=X\d)/gi, 'G$1')
    // 5s/G2X4: o temporizador por etapa lê a etapa pelo número (não distingue páginas).
    .replace(/(\d+(?:\.\d+)?(?:MS|S)?)\s*\/\s*G\d+\s*(?:<=>|==|=|<>)?\s*(?=X\d)/gi, '$1/')

function stepNumberContext(steps: readonly GrafcetStep[], active: ReadonlySet<string>, elapsed: Record<string, number>, graphs?: { known: Record<string, Set<string>>; active: Record<string, Set<string>> }) {
  const knownStepNumbers = new Set<string>()
  const activeStepNumbers = new Set<string>()
  const stepElapsedByNumber: Record<string, number> = {}
  steps.forEach((step, index) => {
    const number = stepNumberOf(step, index)
    knownStepNumbers.add(number)
    if (active.has(step.id)) { activeStepNumbers.add(number); stepElapsedByNumber[number] = elapsed[step.id] ?? 0 }
  })
  return {
    knownStepNumbers,
    activeStepNumbers,
    stepElapsedByNumber,
    ...(graphs ? { knownStepNumbersByGraph: graphs.known, activeStepNumbersByGraph: graphs.active } : {}),
  }
}

/** X<n> ativo: pelo número desenhado; se nenhuma etapa tiver esse número, pelo índice ou nome (projetos antigos). */
function stepIsActive(num: string, ctx: ConditionContext): boolean {
  if (ctx.knownStepNumbers?.has(num)) return !!ctx.activeStepNumbers?.has(num)
  return !!(ctx.activeIndexes?.has(Number(num)) || ctx.activeStepNames?.has(num))
}

/** G<n>X<m> ativo: lê a etapa m **na página n**. Se a página existir mas não tiver
 *  essa etapa (diagramas importados, numeração global), cai para a leitura global —
 *  é o comportamento dos projetos anteriores e mantém as importações FluidSIM válidas. */
function graphStepIsActive(graph: string, num: string, ctx: ConditionContext): boolean {
  const known = ctx.knownStepNumbersByGraph?.[graph]
  if (known?.size && known.has(num)) return !!ctx.activeStepNumbersByGraph?.[graph]?.has(num)
  return stepIsActive(num, ctx)
}

/** Análise de duração: T(5s), T(500ms), 10s, 500ms, 2.5s */
export function parseDuration(token: string): number | null {
  const match = /^T\((\d+(?:\.\d+)?)(MS|S)?\)$/i.exec(token)
  if (match) {
    const value = Number(match[1])
    return match[2]?.toUpperCase() === 'MS' ? value : value * 1000
  }
  const match2 = /^(\d+(?:\.\d+)?)(MS|S)?$/i.exec(token)
  if (match2) {
    const value = Number(match2[1])
    return match2[2]?.toUpperCase() === 'MS' ? value : value * 1000
  }
  return null
}

export interface IecTimerInfo {
  d1: number
  step: string | null
  d2: number | null
}

export function parseIecTimer(str: string): IecTimerInfo | null {
  const m = str.match(/^(\d+(?:\.\d+)?(?:MS|S)?)\/X([A-Za-z0-9_]*)(?:\/(\d+(?:\.\d+)?(?:MS|S)?))?$/i)
  if (!m) return null
  const d1 = parseDuration(m[1])
  if (d1 === null) return null
  const step = m[2] ? m[2] : null
  const d2 = m[3] ? parseDuration(m[3]) : null
  return { d1, step, d2 }
}

/** Sintaxe das condições compatível com FluidSim, grafcet.io e IEC 60848:
 *  - I1, Q1, M1, %I0.0
 *  - B_Start, B_Stop_NF, fc_a0, fc_b0, In_Man, b0, b1, S_Rolamento
 *  - Timers: 10s/X85, 5s/X90, 1s/X45, 20s/X15, T(5s), T(500ms)
 *  - Frequências: 1HZ, 0.5 HZ, 2 HZ
 *  - Etapas ativas: X85, X1, G0X3, G0X5, G1X75, G0X1, G2X135, G0 <=> X5, G0 <> X9
 *  - Operadores: AND (*, ., &, AND), OR (+, |, OR), NOT (!, NOT, leading /, leading _)
 *  - Flancos: ^I1, \I1, ↑I1, ↓I1
 *  - Constantes: 1, 0, TRUE, FALSE */
export function validCondition(expression: string): boolean {
  return parseCondition(expression, { table: {} }) !== null
}

export function evalCondition(expression: string, table: Record<string, boolean>, context?: Partial<ConditionContext>): boolean {
  return parseCondition(expression, { table, ...context }) ?? false
}

/** Lista as etapas (números) referidas por X<n> ou G...X<n> numa condição. */
export function referencedSteps(expression: string): number[] {
  const matches = expression.toUpperCase().match(/(?:G\d+)?X(\d+)/g) ?? []
  return matches.map((t) => {
    const m = t.match(/X(\d+)/)
    return m ? Number(m[1]) : NaN
  }).filter((n) => !isNaN(n))
}

/** Uma referência ao estado de uma etapa dentro de uma receptividade:
 *  `G0 <=> X9`, `G1X11`, `G1 <> X5`, `X9`, `/X9`, `NOT G0X9`, `G1:X11`.
 *  A mesma leitura serve a avaliação (`parseCondition`), a validação do programa e
 *  a modal de transição — não há duas interpretações da mesma expressão. */
export interface StepStateReference {
  /** texto exato na expressão (com espaços, como foi escrito) */
  text: string
  /** posição do início na expressão */
  at: number
  /** página/GRAFCET referido («0», «1»…); null quando a expressão não traz prefixo G */
  graph: string | null
  step: string
  /** true = a etapa tem de estar ativa; false = tem de estar inativa */
  active: boolean
  /** true quando o prefixo não tem operador explícito (G0X9, G1:X11) */
  implicit: boolean
}

const STEP_STATE_TERM = /(?<![A-Za-z0-9_)/])(\/\s*|NOT\s+)?(?:G(\d+)\s*(<=>|==|=|<>|=>|<=|:|\.)?\s*X(\d+)|X(\d+))(?![A-Za-z0-9_(])/gi

export function stepStateReferences(expression: string): StepStateReference[] {
  return [...expression.matchAll(STEP_STATE_TERM)].map((match) => {
    const negated = !!match[1]
    const graph = match[2] ?? null
    const operator = (match[3] ?? '').toLowerCase()
    const step = match[4] ?? match[5] ?? ''
    const positive = operator === '<>' ? false : true
    const explicitState = operator === '<=>' || operator === '==' || operator === '=' || operator === '<>'
    return { text: match[0], at: match.index ?? 0, graph, step, active: negated ? !positive : positive, implicit: !explicitState }
  })
}

/** Grafo a que uma referência pertence (0 quando não tem prefixo). */
export const referenceGraphNumber = (reference: StepStateReference): number => reference.graph === null ? 0 : Number(reference.graph)

/** Texto canónico de uma referência: `G1 <=> X11` (ativa) ou `G1 <> X11` (inativa). */
export const stepReferenceText = (graph: string | number | null, step: string, active: boolean): string =>
  `G${graph ?? 0} ${active ? '<=>' : '<>'} X${step}`

function parseCondition(expression: string, ctx: ConditionContext): boolean | null {
  // Leitura canónica da tabela: aceita bits antigos (I3) e novos (I0.2).
  // Projetos já migrados usam a chave canónica; fixtures, integrações e sessões
  // ainda em memória podem expor apenas o alias legado, por isso ele é o fallback.
  const bitOf = (t: string) => normalizeBitAddress(t) ?? t
  const read = (table: Record<string, boolean> | undefined, token: string) => {
    const raw = token.trim().replace(/^%/, '')
    const canonical = bitOf(raw)
    const direct = table?.[canonical] ?? table?.[canonical.toUpperCase()] ?? table?.[canonical.toLowerCase()]
      ?? table?.[raw] ?? table?.[raw.toUpperCase()] ?? table?.[raw.toLowerCase()]
    if (direct !== undefined || !table) return !!direct
    // Nomes com maiúsculas e minúsculas (bp_Avanca_A+): o token chega em maiúsculas.
    const upper = raw.toUpperCase()
    const key = Object.keys(table).find((name) => name.toUpperCase() === upper)
    return key ? !!table[key] : false
  }
  const readBit = (t: string) => read(ctx.table, t)
  const readPrev = (t: string) => read(ctx.prev, t)
  // O prefixo G<n> fica na expressão: é a página (GRAFCET) onde a etapa é lida.
  const src = normalizeGraphReferences(expression).trim()
  if (!src) return null
  if (DISALLOWED_VARS.has(src.toUpperCase())) return null

  // Rejeita sintaxes incorretas explícitas de operadores duplos ou inválidos. «bp_A+ + c» é válido:
  // o primeiro + pertence ao nome (sufixo) e o segundo, separado por espaço, é o OU.
  if (/&&|\|\||\^\s*&|\^\s*\||\\\s*&|\\\s*\||\*\s*\*|(?<![A-Za-z0-9_])\+\s*\+|[A-Za-z0-9_]\+\+/.test(src)) return null

  const regex = new RegExp(COMPARE_TOKEN + '|' + String.raw`T\(\d+(?:\.\d+)?(?:MS|S)?\)|(?:(?:\d+(?:\.\d+)?(?:MS|S)?)\/X[A-Za-z0-9_]*(?:\/(?:\d+(?:\.\d+)?(?:MS|S)?))?)|(?:\d+(?:\.\d+)?\s*HZ)|(?:G\d+\s*(?:<=>|==|=|<>)\s*X\d+)|(?:G\d+X\d+)|X\d{1,3}|[IQM]\d{1,4}\.[0-7]|[IQM]\d{1,2}|[!&|()01^\\]|\*|\+|NOT|AND|OR|\/|_|[A-Za-z][A-Za-z0-9_+-]*`, 'gi')

  const rawTokens = src.match(regex)
  if (!rawTokens) return null
  if (rawTokens.join('').replace(/\s+/g, '') !== src.replace(/\s+/g, '')) return null

  const tokens: string[] = []
  for (let idx = 0; idx < rawTokens.length; idx++) {
    const t = rawTokens[idx]
    const up = t.toUpperCase()
    if (up === '*' || up === 'AND') tokens.push('&')
    else if (up === '+' || up === 'OR') tokens.push('|')
    else if (up === 'NOT') tokens.push('!')
    else if (t === '/' || t === '_') tokens.push('!')
    else tokens.push(up)
  }

  let i = 0
  const atom = (): boolean | null => {
    const token = tokens[i++]
    if (!token) return null
    if (token === '!') {
      const v = atom()
      return v === null ? null : !v
    }
    if (token === '(') {
      const v = or()
      if (tokens[i++] !== ')') return null
      return v
    }
    if (token === '1' || token === 'TRUE') return true
    if (token === '0' || token === 'FALSE') return false
    if (token === '^' || token === '\\') {
      const bit = tokens[i++]
      if (!bit || (!validBit(bit) && !validGrafcetVariable(bit))) return null
      const now = readBit(bit)
      const before = readPrev(bit)
      return token === '^' ? now && !before : !now && before
    }
    const cmp = parseCompareToken(token)
    if (cmp) return compareNumbers(cmp.op, readNumber(cmp.left), readNumber(cmp.right))
    // No simulador atual há um único GRAFCET em execução. O prefixo G<n>
    // mantém a compatibilidade gráfica de importação e consulta o estado X<n>
    // local; <> é a negação explícita dessa etapa (não uma leitura de outro PLC).
    const grafcetCompare = token.match(/^G(\d+)\s*(<=>|==|=|<>)\s*X(\d+)$/i)
    if (grafcetCompare) {
      const active = graphStepIsActive(grafcetCompare[1], grafcetCompare[3], ctx)
      return grafcetCompare[2] === '<>' ? !active : active
    }
    if (token.startsWith('T(')) {
      const ms = parseDuration(token)
      return ms === null ? null : (ctx.elapsedMs ?? 0) >= ms
    }
    const iecTimer = parseIecTimer(token)
    if (iecTimer) {
      const { d1, step, d2 } = iecTimer
      if (!step) {
        const el = ctx.elapsedMs ?? 0
        return el >= d1 && (d2 === null || el <= d1 + d2)
      }
      const stepElapsed = ctx.stepElapsedByNumber?.[step] ?? ctx.stepElapsed?.[step] ?? ctx.stepElapsedByName?.[step] ?? (!ctx.knownStepNumbers?.has(step) && ctx.activeIndexes?.has(Number(step)) ? (ctx.elapsedMs ?? 0) : null)
      if (stepElapsed === null || stepElapsed === undefined) return false
      return stepElapsed >= d1 && (d2 === null || stepElapsed <= d1 + d2)
    }
    if (/^\d+(\.\d+)?\s*HZ$/.test(token)) {
      const hz = parseFloat(token)
      const t = ctx.simTimeMs ?? Date.now()
      const period = 1000 / hz
      return (Math.floor(t / (period / 2)) % 2) === 0
    }
    if (token.startsWith('X') && /^\d+$/.test(token.slice(1))) {
      const num = Number(token.slice(1))
      return stepIsActive(String(num), ctx) || !!ctx.activeStepIds?.has(token)
    }
    const gStep = token.match(/^G(\d+)\s*(<=>)?\s*X(\d+)$/i)
    if (gStep) return graphStepIsActive(gStep[1], gStep[3], ctx)
    if (validBit(token) || validGrafcetVariable(token)) {
      return readBit(token)
    }
    return null
  }

  const and = (): boolean | null => {
    let v = atom()
    while (tokens[i] === '&') {
      i++
      const r = atom()
      v = v === null || r === null ? null : v && r
    }
    return v
  }

  const or = (): boolean | null => {
    let v = and()
    while (tokens[i] === '|') {
      i++
      const r = and()
      v = v === null || r === null ? null : v || r
    }
    return v
  }

  const val = or()
  return i === tokens.length ? val : null
}

/** Converte projetos lineares antigos para a estrutura explícita sem alterar dados guardados. */
export function transitionsOf(program: GrafcetProgram): GrafcetTransition[] {
  if (program.transitions) return program.transitions
  return program.steps.map((step, index) => ({
    id: `legacy-${step.id}`,
    from: [step.id],
    to: [program.steps[(index + 1) % program.steps.length].id],
    condition: step.condition,
  }))
}

/** Todas as ações de uma etapa (inclui a ação legada). */
export function actionsOfStep(step: GrafcetStep): GrafcetAction[] {
  return [
    ...(step.action ? [{ id: `legacy-${step.id}`, address: step.action, condition: '1', kind: 'N' as const }] : []),
    ...(step.actions ?? []),
  ]
}

/** Aceita só o número da ação: «1» passa a «Q1». O resto fica como escrito. */
export const normalizeActionVariable = (value: string): string => {
  const text = value.trim()
  return /^\d+$/.test(text) ? `Q${Number(text)}` : text
}

const normAddress = (address: string) => normalizeActionVariable(address).toUpperCase()

/** Próximo número de etapa livre: o maior número em uso + 1 (sem etapas começa em 0). */
export function nextFreeStepNumber(steps: readonly { name?: string }[]): number {
  let max = -1
  steps.forEach((step, index) => {
    const number = parseInt(stepNumberOf(step, index), 10)
    if (Number.isFinite(number) && number > max) max = number
  })
  return max + 1
}

/** Etapa (que não `selfId`) que já mostra o identificador que `name` viria a ter.
 *  Dois «X10» no diagrama tornariam ambíguas as referências X<n> e o «Ligar nº». */
export function stepIdentifierTakenBy(name: string, steps: readonly GrafcetStep[], selfId: string, selfIndex: number): GrafcetStep | null {
  const candidate = stepNumberOf({ name }, selfIndex).toLowerCase()
  return steps.find((step, index) => step.id !== selfId && stepNumberOf(step, index).toLowerCase() === candidate) ?? null
}

/** True quando duas ações comandam a mesma saída («1» = «Q1», sem distinção de maiúsculas). */
export const sameActionAddress = (a: string, b: string) => normAddress(a) === normAddress(b)

/** Ações do programa inteiro (etapas + ações livres) sobre o mesmo endereço —
 *  suporta o aviso «saída já comandada» no diálogo da ação. */
export function actionsOnAddress(program: GrafcetProgram, address: string, excludeId?: string): Array<{ action: GrafcetAction; stepIndex: number | null }> {
  const matches: Array<{ action: GrafcetAction; stepIndex: number | null }> = []
  if (!address) return matches
  program.steps.forEach((step, stepIndex) => actionsOfStep(step).forEach((action) => {
    if (action.id !== excludeId && sameActionAddress(action.address, address)) matches.push({ action, stepIndex })
  }))
  ;(program.freeActions ?? []).forEach((action) => {
    if (action.id !== excludeId && sameActionAddress(action.address, address)) matches.push({ action, stepIndex: null })
  })
  return matches
}

/** Tempo (ms) em que TODAS as origens da transição estão ativas. */
function sourceElapsed(transition: GrafcetTransition, elapsed: Record<string, number>): number {
  return Math.min(...transition.from.map((id) => elapsed[id] ?? 0))
}

/** As transições são avaliadas sobre o mesmo snapshot; um passo só participa
 * numa transição por scan (prioridade à ordem da lista). Divergência AND é
 * uma transição com múltiplos destinos; convergência AND requer TODAS as origens.
 * `dtMs` é o tempo simulado desde o scan anterior (para T(…) e ações D/L).
 */
export function scanGrafcet(program: GrafcetProgram, runtime: GrafcetRuntime, table: Record<string, boolean>, dtMs = 100): GrafcetRuntime {
  if (program.importReview) {
    for (const address of runtime.owned) table[address] = false
    return emptyGrafcetRuntime()
  }
  const steps = program.steps
  const ids = new Set(steps.map((step) => step.id))
  const indexOf = new Map(steps.map((step, index) => [step.id, index]))
  const stepById = new Map(steps.map((step) => [step.id, step]))

  const kept = runtime.active.filter((id) => ids.has(id))
  const starting = !kept.length
  const current = new Set(kept.length ? kept : steps.filter((step) => step.initial || step.stepType === 'initial' || step.stepType === 'initial-enclosing').map((step) => step.id))
  const elapsed: Record<string, number> = {}
  for (const id of current) elapsed[id] = starting ? 0 : (runtime.elapsed?.[id] ?? 0) + dtMs
  const snapshot = { ...table }
  const prev = runtime.prev ?? {}
  const activeIndexes = new Set([...current].map((id) => indexOf.get(id)!).filter((n) => n !== undefined))
  const activeStepNames = new Set([...current].map((id) => stepById.get(id)?.name.trim()).filter((n): n is string => !!n))
  const stepElapsedByName: Record<string, number> = {}
  for (const id of current) {
    const s = stepById.get(id)
    if (s?.name) stepElapsedByName[s.name.trim()] = elapsed[id] ?? 0
  }

  const next = new Set(current)
  const consumed = new Set<string>()
  const firedNow: string[] = []
  const firings: GrafcetFiring[] = []
  const entered = new Set<string>()

  const simTimeMs = (runtime.simTimeMs ?? 0) + dtMs

  for (const transition of transitionsOf(program)) {
    const sourceTransition = !!transition.source && !transition.from.length
    if ((!transition.from.length && !sourceTransition) || !transition.to.length ||
        !transition.from.every((id) => current.has(id) && !consumed.has(id)) ||
        !transition.to.every((id) => ids.has(id))) continue

    const condContext: ConditionContext = {
      table: snapshot,
      prev,
      activeIndexes,
      activeStepNames,
      activeStepIds: current,
      elapsedMs: sourceElapsed(transition, elapsed),
      stepElapsed: elapsed,
      stepElapsedByName,
      ...stepNumberContext(steps, current, elapsed, graphStepNumbers(program, current)),
      simTimeMs,
    }

    if (!evalCondition(receptivityOf(transition), snapshot, condContext)) continue

    transition.from.forEach((id) => { next.delete(id); consumed.add(id) })
    transition.to.forEach((id) => { next.add(id); elapsed[id] = 0; entered.add(id) })
    firedNow.push(transition.id)
    firings.push({ transitionId: transition.id, from: [...transition.from], to: [...transition.to], atMs: simTimeMs })
  }

  const stored = { ...(runtime.stored ?? {}) }
  type Flat = GrafcetAction & { stepId: string }
  const actions: Flat[] = steps.flatMap((step) => actionsOfStep(step).map((a) => ({ ...a, stepId: step.id })))
  const owned = [...new Set(actions.map((a) => normAddress(a.address || a.variable || '')).filter((a) => a && (validBit(a) || validGrafcetVariable(a))))]
  for (const address of runtime.owned) if (!owned.includes(address)) { table[address] = false; delete stored[address] }
  const justActivated = entered
  const nextIndexes = new Set([...next].map((id) => indexOf.get(id)!))
  const nextStepNames = new Set([...next].map((id) => stepById.get(id)?.name.trim()).filter((n): n is string => !!n))

  const conflicts: GrafcetActionConflict[] = []
  for (const address of owned) {
    const mine = actions.filter((a) => normAddress(a.address || a.variable || '') === address)
    const kindOf = (a: Flat) => a.kind ?? 'N'
    let continuous = false
    const setBy: string[] = []
    const resetBy: string[] = []
    for (const a of mine) {
      const kind = kindOf(a)
      if (kind === 'DA') {
        // Pulso ao desativar: a etapa saiu da situação ativa nesta varredura.
        if (consumed.has(a.stepId) && !next.has(a.stepId)) {
          const exitContext: ConditionContext = { table: snapshot, prev, activeIndexes: nextIndexes, activeStepNames: nextStepNames, activeStepIds: next, elapsedMs: elapsed[a.stepId] ?? 0, stepElapsed: elapsed, stepElapsedByName, ...stepNumberContext(steps, next, elapsed, graphStepNumbers(program, next)), simTimeMs }
          if (evalCondition(a.condition || '1', snapshot, exitContext)) continuous = true
        }
        continue
      }
      if (!next.has(a.stepId)) continue
      const actionContext: ConditionContext = {
        table: snapshot,
        prev,
        activeIndexes: nextIndexes,
        activeStepNames: nextStepNames,
        activeStepIds: next,
        elapsedMs: elapsed[a.stepId] ?? 0,
        stepElapsed: elapsed,
        stepElapsedByName,
        ...stepNumberContext(steps, next, elapsed, graphStepNumbers(program, next)),
        simTimeMs,
      }
      const holds = evalCondition(a.condition || '1', snapshot, actionContext)
      const time = a.timeMs ?? 0
      if ((kind === 'N' || kind === 'C') && holds) continuous = true
      else if (kind === 'D' && holds && (elapsed[a.stepId] ?? 0) >= time) continuous = true
      else if (kind === 'L' && holds && (elapsed[a.stepId] ?? 0) < Math.max(time, 1)) continuous = true
      else if (kind === 'A' && holds && (justActivated.has(a.stepId) || starting)) continuous = true
      else if (kind === 'S' && holds && (justActivated.has(a.stepId) || starting)) setBy.push(a.stepId)
      else if (kind === 'R' && holds && (justActivated.has(a.stepId) || starting)) resetBy.push(a.stepId)
    }
    // S e R no mesmo instante: a IEC 60848 deixa o resultado indeterminado. O simulador
    // dá prioridade ao RESET (determinístico, independente da ordem das etapas) e regista o conflito.
    if (resetBy.length) stored[address] = false
    else if (setBy.length) stored[address] = true
    if (setBy.length && resetBy.length) conflicts.push({ address, setBy: [...new Set(setBy)], resetBy: [...new Set(resetBy)] })
    table[address] = continuous || !!stored[address]
  }

  const trackedPrev: Record<string, boolean> = {}
  for (const [key, value] of Object.entries(snapshot)) {
    if (validBit(key) || validGrafcetVariable(key)) trackedPrev[key] = !!value
  }

  return {
    active: [...next],
    owned,
    elapsed: Object.fromEntries([...next].map((id) => [id, elapsed[id] ?? 0])),
    prev: trackedPrev,
    stored,
    simTimeMs,
    fired: (runtime.fired ?? 0) + firedNow.length,
    lastFired: firedNow,
    history: firings.length ? pushHistory(runtime.history, firings) : (runtime.history ?? []),
    conflicts,
  }
}

/** Receptividade de uma transição avaliada com o MESMO contexto do `scanGrafcet`
 * (flancos ↑/↓, X<n>, T(…), temporizações por etapa). A UI deve usar esta função
 * em vez de `evalCondition(cond, table)` para nunca contradizer a simulação. */
export function transitionReceptivity(program: GrafcetProgram, runtime: GrafcetRuntime, table: Record<string, boolean>, transition: GrafcetTransition): boolean {
  if (program.importReview) return false
  if (!validCondition(receptivityOf(transition))) return false
  const steps = program.steps
  const active = new Set(runtime.active.filter((id) => steps.some((step) => step.id === id)))
  const elapsed = runtime.elapsed ?? {}
  const stepElapsedByName: Record<string, number> = {}
  const activeStepNames = new Set<string>()
  steps.forEach((step) => {
    if (!active.has(step.id) || !step.name?.trim()) return
    activeStepNames.add(step.name.trim())
    stepElapsedByName[step.name.trim()] = elapsed[step.id] ?? 0
  })
  const activeIndexes = new Set(steps.map((step, index) => (active.has(step.id) ? index : -1)).filter((n) => n >= 0))
  return evalCondition(receptivityOf(transition), table, {
    table,
    prev: runtime.prev,
    activeIndexes,
    activeStepNames,
    activeStepIds: active,
    elapsedMs: transition.from.length ? sourceElapsed(transition, elapsed) : 0,
    stepElapsed: elapsed,
    stepElapsedByName,
    ...stepNumberContext(steps, active, elapsed, graphStepNumbers(program, active)),
    simTimeMs: runtime.simTimeMs ?? 0,
  })
}

/** Força as etapas ativas (forçagem GRAFCET): útil para testar uma secção da sequência. */
export function forceSteps(program: GrafcetProgram, runtime: GrafcetRuntime, stepIds: string[]): GrafcetRuntime {
  if (program.importReview) return emptyGrafcetRuntime()
  const valid = stepIds.filter((id) => program.steps.some((step) => step.id === id))
  return { ...runtime, active: valid, elapsed: Object.fromEntries(valid.map((id) => [id, 0])), lastFired: [] }
}

/** Dispara manualmente uma transição (ignora a receptividade) se todas as origens estiverem ativas. */
export function fireTransition(program: GrafcetProgram, runtime: GrafcetRuntime, transitionId: string): GrafcetRuntime | null {
  if (program.importReview) return null
  const transition = transitionsOf(program).find((t) => t.id === transitionId)
  if (!transition || !transition.from.every((id) => runtime.active.includes(id))) return null
  const active = new Set(runtime.active)
  transition.from.forEach((id) => active.delete(id))
  transition.to.forEach((id) => active.add(id))
  const elapsed = { ...(runtime.elapsed ?? {}) }
  transition.from.forEach((id) => delete elapsed[id])
  transition.to.forEach((id) => { elapsed[id] = 0 })
  const firing: GrafcetFiring = { transitionId: transition.id, from: [...transition.from], to: [...transition.to], atMs: runtime.simTimeMs ?? 0, forced: true }
  return { ...runtime, active: [...active], elapsed, fired: (runtime.fired ?? 0) + 1, lastFired: [transition.id], history: pushHistory(runtime.history, [firing]) }
}

export type GrafcetIssueLevel = 'error' | 'warning'
export interface GrafcetIssue { id: string; message: string; level: GrafcetIssueLevel; entityId?: string; tab: 'steps' | 'transitions' }

/** Validação estrutural do programa: erros impedem a execução correta; avisos apontam más práticas. */
export function validateGrafcet(program: GrafcetProgram): GrafcetIssue[] {
  const steps = program.steps
  const transitions = transitionsOf(program)
  const issues: GrafcetIssue[] = []
  if (program.importReview) issues.push({ id: 'import-review', level: 'error', message: 'Desenho importado para revisão. Conclua a revisão antes de simular ou gerar Ladder.', tab: 'steps' })
  if (!steps.length) return issues
  const stepIds = new Set(steps.map((step) => step.id))
  const label = (stepId: string) => { const i = steps.findIndex((s) => s.id === stepId); return i < 0 ? '? «?»' : `${stepNumberOf(steps[i], i)} «${steps[i].name}»` }

  const hasInitial = steps.some((step) => step.initial || step.stepType === 'initial' || step.stepType === 'initial-enclosing')
  if (!hasInitial) {
    issues.push({ id: 'initial', level: 'error', message: 'Defina pelo menos uma etapa inicial.', tab: 'steps' })
  }

  transitions.forEach((transition, index) => {
    const name = transition.name || `T${index + 1}`
    const emptyPorts = !transition.from.length && !transition.to.length
    // Transição vazia (ex.: and-divergence colocada sem portos) — aviso, não bloqueia a revisão.
    if (emptyPorts && !transition.source) {
      issues.push({ id: `${transition.id}:empty`, level: 'warning', message: `${name} não tem origem nem destino — pode eliminá-la se for um residual da importação.`, entityId: transition.id, tab: 'transitions' })
      return
    }
    if (transition.source && emptyPorts) {
      issues.push({ id: `${transition.id}:links`, level: 'error', message: `${name} é uma transição-fonte sem destino.`, entityId: transition.id, tab: 'transitions' })
    } else if ((!transition.from.length && !transition.source) || !transition.to.length) {
      issues.push({ id: `${transition.id}:links`, level: 'error', message: `${name} precisa de origem e destino.`, entityId: transition.id, tab: 'transitions' })
    } else if ([...transition.from, ...transition.to].some((stepId) => !stepIds.has(stepId))) {
      issues.push({ id: `${transition.id}:missing`, level: 'error', message: `${name} referencia uma etapa inexistente.`, entityId: transition.id, tab: 'transitions' })
    }
    const selfLoop = transition.from.filter((stepId) => transition.to.includes(stepId) && stepIds.has(stepId))
    if (selfLoop.length) {
      issues.push({ id: `${transition.id}:selfloop`, level: 'warning', message: `Ciclo direto em ${name}: ${selfLoop.map((stepId) => label(stepId)).join(', ')} é origem e destino ao mesmo tempo — dispara continuamente enquanto a receptividade for verdadeira.`, entityId: transition.id, tab: 'transitions' })
    }
    if (!validCondition(transition.condition)) {
      issues.push({ id: `${transition.id}:condition`, level: 'error', message: `Condição inválida em ${name}: «${transition.condition || 'vazia'}».`, entityId: transition.id, tab: 'transitions' })
    } else if (transition.guard?.trim() && !validCondition(transition.guard)) {
      issues.push({ id: `${transition.id}:guard`, level: 'error', message: `Condição de estado inválida em ${name}: «${transition.guard}».`, entityId: transition.id, tab: 'transitions' })
    } else {
      const knownByGraph = graphStepNumbers(program).known
      const existsHere = (num: string) => steps.some((s, i) => stepNumberOf(s, i) === num || s.name.trim() === num)
      // G<n>X<m> é lido na página n; sem página correspondente vale a numeração global.
      const missing = stepStateReferences(receptivityOf(transition)).filter((reference) => {
        const scoped = reference.graph !== null ? knownByGraph[reference.graph] : undefined
        if (scoped?.size) return !scoped.has(reference.step) && !existsHere(reference.step)
        return !existsHere(reference.step) && Number(reference.step) >= steps.length
      })
      if (missing.length) {
        const first = missing[0]
        const where = first.graph !== null && knownByGraph[first.graph]?.size ? ` na página G${first.graph}` : ''
        issues.push({ id: `${transition.id}:x`, level: 'error', message: `${name} usa X${first.step}${where}, mas essa etapa não existe.`, entityId: transition.id, tab: 'transitions' })
      }
      if (/^\s*1\s*$/.test(transition.condition)) {
        issues.push({ id: `${transition.id}:always`, level: 'warning', message: `${name} tem receptividade «1»: dispara logo que as origens ficam ativas.`, entityId: transition.id, tab: 'transitions' })
      }
    }
  })

  const seenTransitions = new Map<string, GrafcetTransition>()
  transitions.forEach((t) => {
    if (!t.from.length || !t.to.length) return
    const key = `${[...t.from].sort().join('+')}>${[...t.to].sort().join('+')}|${t.condition.replace(/\s+/g, '').toUpperCase()}`
    const first = seenTransitions.get(key)
    if (first) issues.push({ id: `${t.id}:duplicate`, level: 'warning', message: `${t.name || 'Uma transição'} duplica ${first.name || 'outra'} (mesma origem, destino e receptividade).`, entityId: t.id, tab: 'transitions' })
    else seenTransitions.set(key, t)
  })

  // Divergência OR ambígua: duas saídas da mesma etapa com a mesma receptividade disparam
  // em simultâneo na teoria; aqui só a primeira da lista dispara (prioridade implícita).
  const bySource = new Map<string, GrafcetTransition[]>()
  transitions.forEach((t) => { if (t.from.length === 1) bySource.set(t.from[0], [...(bySource.get(t.from[0]) ?? []), t]) })
  for (const [sourceId, list] of bySource) {
    if (list.length < 2) continue
    const seen = new Map<string, GrafcetTransition>()
    for (const t of list) {
      const key = t.condition.replace(/\s+/g, '').toUpperCase()
      const first = seen.get(key)
      if (first && validCondition(t.condition)) {
        issues.push({ id: `${t.id}:or-conflict`, level: 'warning', message: `Divergência OR na etapa ${label(sourceId)}: ${t.name || 'uma transição'} tem a mesma receptividade «${t.condition}» de ${first.name || 'outra'} — torne-as exclusivas (ex.: ${first.condition}·!X).`, entityId: t.id, tab: 'transitions' })
      } else if (!first) seen.set(key, t)
    }
  }

  // Ações soltas são permitidas: basta o número/variável; só atuam na simulação depois de ligadas a uma etapa.

  const incoming = new Set(transitions.flatMap((t) => t.to))
  const outgoing = new Set(transitions.flatMap((t) => t.from))
  const names = new Map<string, number>()
  steps.forEach((step) => names.set(step.name.trim().toLowerCase(), (names.get(step.name.trim().toLowerCase()) ?? 0) + 1))

  // Identificadores mostrados no diagrama (X<n>): «5» e «Etapa 5» têm nomes diferentes
  // distintas mas o mesmo número visível — as referências por número ficam ambíguas.
  const shownNumbers = new Map<string, Array<{ step: GrafcetStep; index: number }>>()
  steps.forEach((step, index) => {
    const key = stepNumberOf(step, index).toLowerCase()
    shownNumbers.set(key, [...(shownNumbers.get(key) ?? []), { step, index }])
  })
  for (const [, group] of shownNumbers) {
    if (group.length < 2) continue
    const leader = group[0]
    group.slice(1).forEach(({ step }) => {
      issues.push({ id: `${step.id}:dupnum`, level: 'warning', message: `${label(leader.step.id)} e ${label(step.id)} mostram o mesmo identificador no diagrama — as referências por número (X e «Ligar nº») ficam ambíguas.`, entityId: step.id, tab: 'steps' })
    })
  }

  const initialSteps = steps.filter((step) => step.initial || step.stepType === 'initial' || step.stepType === 'initial-enclosing')
  // Várias etapas iniciais são normais quando pertencem a GRAFCET parciais independentes (produção + segurança,
  // por exemplo). Só se avisa quando duas iniciais estão no MESMO grafo ligado por transições.
  const root = new Map(steps.map((step) => [step.id, step.id]))
  const find = (id: string): string => { let r = id; while (root.get(r) !== r) r = root.get(r)!; root.set(id, r); return r }
  for (const t of transitions) {
    const ids = [...t.from, ...t.to].filter((id) => root.has(id))
    for (let i = 1; i < ids.length; i += 1) root.set(find(ids[i]), find(ids[0]))
  }
  const byGraph = new Map<string, GrafcetStep[]>()
  for (const step of initialSteps) { const key = find(step.id); byGraph.set(key, [...(byGraph.get(key) ?? []), step]) }
  const crowded = [...byGraph.values()].find((group) => group.length > 1)
  if (crowded) {
    issues.push({ id: 'initial:several', level: 'warning', message: `Existem ${crowded.length} etapas iniciais no mesmo GRAFCET (${crowded.map((step) => label(step.id)).join(', ')}); no arranque ficam todas ativas em simultâneo.`, entityId: crowded[1].id, tab: 'steps' })
  }

  steps.forEach((step, index) => {
    const stepIndex = stepNumberOf(step, index)
    const isInit = step.initial || step.stepType === 'initial' || step.stepType === 'initial-enclosing'
    if (!isInit && !incoming.has(step.id)) {
      issues.push({ id: `${step.id}:orphan`, level: 'error', message: `A etapa ${label(step.id)} não tem transição de entrada.`, entityId: step.id, tab: 'steps' })
    }
    if (!outgoing.has(step.id)) {
      issues.push({ id: `${step.id}:dead`, level: 'warning', message: `A etapa ${label(step.id)} não tem transição de saída: a sequência fica bloqueada nela.`, entityId: step.id, tab: 'steps' })
    }
    if ((names.get(step.name.trim().toLowerCase()) ?? 0) > 1) {
      issues.push({ id: `${step.id}:dup`, level: 'warning', message: `Nome de etapa repetido: «${step.name}».`, entityId: step.id, tab: 'steps' })
    }
    actionsOfStep(step).forEach((action, actionIndex) => {
      const addr = normAddress(action.address || action.variable || '')
      if (!addr && !action.description) {
        issues.push({ id: `${step.id}:action:${actionIndex}`, level: 'error', message: `Ação ${actionIndex + 1} da etapa ${stepIndex}: indique um endereço ou descrição.`, entityId: step.id, tab: 'steps' })
      } else if (addr && !validBit(addr) && !validGrafcetVariable(addr) && !action.description) {
        issues.push({ id: `${step.id}:action:${actionIndex}`, level: 'error', message: `Ação ${actionIndex + 1} da etapa ${stepIndex}: use uma variável válida ou endereço Q/M.`, entityId: step.id, tab: 'steps' })
      }
      if (!validCondition(action.condition || '1')) {
        issues.push({ id: `${step.id}:action-condition:${actionIndex}`, level: 'error', message: `Condição inválida na ação ${actionIndex + 1} da etapa ${stepIndex}.`, entityId: step.id, tab: 'steps' })
      }
      if ((action.kind === 'D' || action.kind === 'L') && !(action.timeMs && action.timeMs > 0)) {
        issues.push({ id: `${step.id}:time:${actionIndex}`, level: 'warning', message: `A ação ${actionIndex + 1} da etapa ${stepIndex} (${action.kind}) precisa de um tempo maior que zero.`, entityId: step.id, tab: 'steps' })
      }
    })
  })

  // Dois comandos à mesma saída brigam entre si. A única combinação idiomática é
  // set/reset (S num sítio e R noutro); qualquer N/C/D/L/A/DA repetido é suspeito.
  const addressRefs = new Map<string, Array<{ action: GrafcetAction; where: string; entityId?: string }>>()
  const collectAddress = (action: GrafcetAction, where: string, entityId?: string) => {
    const address = normAddress(action.address || action.variable || '')
    if (!address) return
    addressRefs.set(address, [...(addressRefs.get(address) ?? []), { action, where, entityId }])
  }
  steps.forEach((step, index) => actionsOfStep(step).forEach((action, actionIndex) => collectAddress(action, `etapa ${stepNumberOf(step, index)} · ação ${actionIndex + 1}`, step.id)))
  ;(program.freeActions ?? []).forEach((action) => collectAddress(action, 'ação livre', action.id))
  for (const [address, refs] of addressRefs) {
    if (refs.length < 2) continue
    const kinds = [...new Set(refs.map((ref) => ref.action.kind ?? 'N'))]
    if (kinds.every((kind) => kind === 'S' || kind === 'R')) continue // set/reset é o idioma normal
    issues.push({ id: `addr:${address}`, level: 'warning', message: `A saída ${address} é comandada em ${refs.map((ref) => ref.where).join(', ')} (${kinds.join('/')}) — dois comandos à mesma saída brigam entre si.`, entityId: refs[1].entityId, tab: 'steps' })
  }

  // Alcançabilidade a partir das etapas iniciais.
  const reach = new Set(steps.filter((s) => s.initial || s.stepType === 'initial' || s.stepType === 'initial-enclosing').map((s) => s.id))
  let grew = true
  while (grew) {
    grew = false
    for (const t of transitions) {
      if (t.from.some((id) => reach.has(id))) {
        for (const id of t.to) {
          if (stepIds.has(id) && !reach.has(id)) {
            reach.add(id)
            grew = true
          }
        }
      }
    }
  }
  steps.forEach((step) => {
    if (!reach.has(step.id) && incoming.has(step.id)) {
      issues.push({ id: `${step.id}:unreachable`, level: 'warning', message: `A etapa ${label(step.id)} nunca é alcançada a partir da etapa inicial.`, entityId: step.id, tab: 'steps' })
    }
  })

  // Armadilhas: etapas alcançáveis presas num ciclo fechado que nunca chega a uma etapa inicial nem a uma
  // etapa final (ex.: 2→3→2 sem retorno). Sequências lineares com final já são avisadas por «dead».
  if (hasInitial) {
    // «Saídas» legítimas: etapas iniciais e etapas finais (sem transição de saída, já avisadas à parte).
    const back = new Set(steps.filter((s) => s.initial || s.stepType === 'initial' || s.stepType === 'initial-enclosing' || !outgoing.has(s.id)).map((s) => s.id))
    let growing = true
    while (growing) {
      growing = false
      for (const t of transitions) {
        if (t.to.some((id) => back.has(id))) {
          for (const id of t.from) if (stepIds.has(id) && !back.has(id)) { back.add(id); growing = true }
        }
      }
    }
    steps.forEach((step) => {
      if (reach.has(step.id) && !back.has(step.id) && outgoing.has(step.id)) {
        issues.push({ id: `${step.id}:trap`, level: 'warning', message: `A etapa ${label(step.id)} está num ciclo fechado sem saída para a etapa inicial: depois de lá chegar, a sequência nunca recomeça.`, entityId: step.id, tab: 'steps' })
      }
    })
  }

  // Saída comandada por várias etapas sem qualificador S/R.
  const drivers = new Map<string, string[]>()
  steps.forEach((step) => actionsOfStep(step).forEach((a) => {
    const addr = normAddress(a.address || a.variable || '')
    if (addr && (a.kind ?? 'N') === 'N') {
      drivers.set(addr, [...(drivers.get(addr) ?? []), step.id])
    }
  }))
  for (const [address, list] of drivers) {
    if (new Set(list).size > 1) {
      issues.push({ id: `drive:${address}`, level: 'warning', message: `${address} é comandada por ${new Set(list).size} etapas — confirme que não estão ativas em simultâneo.`, entityId: list[0], tab: 'steps' })
    }
  }
  return issues
}
