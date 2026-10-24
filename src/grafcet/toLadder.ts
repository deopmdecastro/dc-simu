import { nanoid } from 'nanoid'
import type { LadderBranch, LadderCoilEl, LadderContact, LadderContactType, LadderRung, LadderTimer } from '../types'
import { COMPARE_TOKEN, actionsOfStep, normalizeActionVariable, parseCompareToken, parseDuration, parseIecTimer, stepNumberOf, stripGrafcetPrefix, transitionsOf, type GrafcetProgram, type GrafcetStep } from './engine'
import type { LadderCompareOp } from '../types'

/** Árvore booleana de uma condição GRAFCET. */
type Node =
  | { t: 'lit'; address: string; edge?: 'R' | 'F' }
  | { t: 'const'; value: boolean }
  | { t: 'and' | 'or'; a: Node; b: Node }
  | { t: 'not'; a: Node }
  | { t: 'timer'; ms: number; key?: string }
  | { t: 'step'; index: number }
  | { t: 'cmp'; left: string; op: LadderCompareOp; right: string }

const TOKEN_REGEX = new RegExp(COMPARE_TOKEN + '|' + String.raw`T\(\d+(?:\.\d+)?(?:MS|S)?\)|(?:\d+(?:\.\d+)?(?:MS|S)?\/X[A-Za-z0-9_]*)|X\d{1,3}|[IQM]\d{1,2}|[!&|()01^\\]|\*|\+|NOT|AND|OR|\/|_|↑|↓|[A-Za-z][A-Za-z0-9_]*`, 'gi')

function parse(expression: string): Node | null {
  const src = stripGrafcetPrefix(expression).trim()
  if (!src) return null
  const rawTokens = src.match(TOKEN_REGEX)
  if (!rawTokens || rawTokens.join('').replace(/\s+/g, '') !== src.replace(/\s+/g, '')) return null

  const tokens: string[] = []
  for (const t of rawTokens) {
    const up = t.toUpperCase()
    if (up === '*' || up === 'AND') tokens.push('&')
    else if (up === '+' || up === 'OR') tokens.push('|')
    else if (up === 'NOT' || t === '/' || t === '_') tokens.push('!')
    else if (t === '↑') tokens.push('^')
    else if (t === '↓') tokens.push('\\')
    else tokens.push(up)
  }

  let i = 0
  const atom = (): Node | null => {
    const token = tokens[i++]
    if (!token) return null
    if (token === '!') { const a = atom(); return a && { t: 'not', a } }
    if (token === '(') { const a = or(); return tokens[i++] === ')' ? a : null }
    if (token === '1' || token === 'TRUE') return { t: 'const', value: true }
    if (token === '0' || token === 'FALSE') return { t: 'const', value: false }
    if (token === '^' || token === '\\') {
      const bit = tokens[i++]
      return bit ? { t: 'lit', address: bit, edge: token === '^' ? 'R' : 'F' } : null
    }
    const cmp = parseCompareToken(token)
    if (cmp) return { t: 'cmp', ...cmp }
    if (token.startsWith('T(')) {
      const ms = parseDuration(token)
      return ms === null ? null : { t: 'timer', ms }
    }
    const iec = parseIecTimer(token)
    if (iec) {
      return { t: 'timer', ms: iec.d1, key: token }
    }
    if (token.startsWith('X') && /^\d+$/.test(token.slice(1))) {
      return { t: 'step', index: Number(token.slice(1)) }
    }
    if (/^[IQM]\d{1,2}$/.test(token) || /^[A-Z][A-Z0-9_]*$/.test(token)) {
      return { t: 'lit', address: token }
    }
    return null
  }

  const and = (): Node | null => {
    let v = atom()
    while (v && tokens[i] === '&') {
      i++
      const r = atom()
      v = r && { t: 'and', a: v, b: r }
    }
    return v
  }

  const or = (): Node | null => {
    let v = and()
    while (v && tokens[i] === '|') {
      i++
      const r = and()
      v = r && { t: 'or', a: v, b: r }
    }
    return v
  }

  const value = or()
  return i === tokens.length ? value : null
}

/** Literal de um contacto: endereço, negado ou não, com flanco opcional. */
interface Literal { address: string; neg: boolean; edge?: 'R' | 'F'; cmp?: { op: LadderCompareOp; right: string } }
const NEGATED_OP: Record<LadderCompareOp, LadderCompareOp> = { '==': '<>', '<>': '==', '>=': '<', '<': '>=', '>': '<=', '<=': '>' }
const MAX_CONJUNCTIONS = 16

/** Converte em forma normal disjuntiva (lista de conjunções de literais). `null` = demasiado grande. */
function toDnf(node: Node, neg: boolean, resolve: (n: Node) => string | null): Literal[][] | null {
  switch (node.t) {
    case 'const': return node.value !== neg ? [[]] : []
    case 'not': return toDnf(node.a, !neg, resolve)
    case 'lit': return [[{ address: node.address, neg, edge: node.edge }]]
    case 'cmp': return [[{ address: node.left, neg: false, cmp: { op: neg ? NEGATED_OP[node.op] : node.op, right: node.right } }]]
    case 'timer': case 'step': { const address = resolve(node); return address ? [[{ address, neg }]] : null }
    case 'and': case 'or': {
      const isAnd = (node.t === 'and') !== neg // De Morgan
      const left = toDnf(node.a, neg, resolve)
      const right = toDnf(node.b, neg, resolve)
      if (!left || !right) return null
      if (!isAnd) return [...left, ...right].slice(0, MAX_CONJUNCTIONS * 2).length > MAX_CONJUNCTIONS ? null : [...left, ...right]
      const out: Literal[][] = []
      for (const l of left) for (const r of right) out.push([...l, ...r])
      return out.length > MAX_CONJUNCTIONS ? null : out
    }
  }
}

/** Linha da tabela de variáveis (entradas, saídas e memórias) gerada com o Ladder. */
export interface GeneratedTag { address: string; name: string; comment: string }

export interface LadderFromGrafcet {
  /** Networks do Main [OB1]: temporizações, receptividades, evolução das etapas e saídas. */
  rungs: LadderRung[]
  /** Networks do Complete restart [OB100] (só com `startupBlock`); vazio no modo «inline». */
  startupRungs: LadderRung[]
  stepBits: Record<string, string>
  tags: GeneratedTag[]
  warnings: string[]
}

export interface GrafcetToLadderOptions {
  /** true: a inicialização vai para `startupRungs` (OB100). false: network inicial dentro de `rungs`. */
  startupBlock?: boolean
  /** Tags já declaradas: um bit (M/T) com o mesmo nome simbólico mantém o endereço, para a atualização não deslocar os bits. */
  existingTags?: Array<{ address: string; name: string }>
  /** Nome do GRAFCET: vai para os comentários das networks geradas. */
  name?: string
}

/** Nome simbólico válido para a tabela de variáveis. */
const symbolName = (text: string): string => {
  const clean = text.trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9_À-ÿ]/g, '')
  return /^[0-9]/.test(clean) ? `_${clean}` : clean
}

/** Gera o equivalente em Ladder de um GRAFCET (método bit-de-etapa com SET/RESET).
 *  Ordem: inicialização → temporizações → receptividades (E_k) → desativar → ativar → ações.
 *  As receptividades são calculadas todas antes de alterar os bits das etapas, por isso há
 *  no máximo uma evolução por scan e a prioridade das transições (ordem da lista) é respeitada. */
export function grafcetToLadder(program: GrafcetProgram, reserved: Iterable<string> = [], options: GrafcetToLadderOptions = {}): LadderFromGrafcet {
  const warnings: string[] = []
  const label = (options.name ?? program.name ?? '').trim()
  const withName = (text: string) => (label ? `${label}: ${text}` : text)
  const steps = program.steps
  const transitions = transitionsOf(program)
  const used = new Set<string>([...reserved].map((a) => a.toUpperCase()))
  for (const step of steps) for (const a of actionsOfStep(step)) {
    const addr = normalizeActionVariable(a.address || a.variable || '').toUpperCase()
    if (addr) used.add(addr)
  }
  for (const t of transitions) for (const m of t.condition.toUpperCase().match(/[IQM]\d{1,2}/g) ?? []) used.add(m)
  // Operandos T/C/MW das comparações: os T/C não podem ser realocados; as MW são iniciadas no Complete restart.
  const compareWords = new Set<string>()
  const scanCompare = (text: string) => {
    for (const token of stripGrafcetPrefix(text).toUpperCase().match(new RegExp(COMPARE_TOKEN, 'g')) ?? []) {
      const c = parseCompareToken(token)
      if (!c) continue
      for (const operand of [c.left, c.right]) { if (/^[TC]\d+$/.test(operand)) used.add(operand); else if (/^MW\d+$/.test(operand)) compareWords.add(operand) }
    }
  }
  for (const t of transitions) scanCompare(t.condition)
  for (const step of steps) for (const a of actionsOfStep(step)) scanCompare(a.condition || '')
  const alloc = (prefix: 'M' | 'T') => {
    for (let n = 1; n <= 99; n++) { const a = `${prefix}${n}`; if (!used.has(a)) { used.add(a); return a } }
    warnings.push(`Sem endereços ${prefix} livres (limite 99).`)
    return `${prefix}99`
  }
  // Reutiliza o endereço da tag com o mesmo nome (atualização estável); caso contrário, o primeiro livre.
  const preferredByName = new Map<string, string>()
  for (const t of options.existingTags ?? []) { const a = t.address.trim().toUpperCase(); if (t.name && /^[MT]\d{1,2}$/.test(a) && !preferredByName.has(t.name)) preferredByName.set(t.name, a) }
  const allocNamed = (prefix: 'M' | 'T', name: string) => {
    const wanted = preferredByName.get(name)
    if (wanted && wanted[0] === prefix && !used.has(wanted)) { used.add(wanted); return wanted }
    return alloc(prefix)
  }
  const stepBits: Record<string, string> = {}
  steps.forEach((step, i) => { stepBits[step.id] = allocNamed('M', `Etapa_${symbolName(stepNumberOf(step, i))}`) })
  const enableBits = transitions.map((_, k) => allocNamed('M', `Rec_T${k + 1}`))
  // X<n> (também G0X<n>) = etapa desenhada com o número n; sem essa etapa, usa o índice (projetos antigos).
  const stepByNumber = (n: number) => steps.find((s, i) => stepNumberOf(s, i) === String(n)) ?? steps[n]
  const bitOfIndex = (n: number) => { const s = stepByNumber(n); return s ? stepBits[s.id] : null }
  const numberOfStep = (id: string) => { const i = steps.findIndex((s) => s.id === id); return i < 0 ? '?' : stepNumberOf(steps[i], i) }
  const tags: GeneratedTag[] = []
  const tag = (address: string, name: string, comment: string) => { if (address && !tags.some((t) => t.address === address)) tags.push({ address, name, comment }) }
  steps.forEach((s, i) => tag(stepBits[s.id], `Etapa_${symbolName(stepNumberOf(s, i))}`, `Bit da etapa ${stepNumberOf(s, i)}${s.description || s.comment ? ` — ${s.description || s.comment}` : ''}`))
  transitions.forEach((t, k) => tag(enableBits[k], `Rec_T${k + 1}`, `Receptividade T${k + 1}: ${numberOfStep(t.from[0])} → ${numberOfStep(t.to[0])} (${t.condition})`))

  const contact = (address: string, contactType: LadderContactType = 'NO'): LadderContact => ({ kind: 'contact', id: nanoid(6), address, contactType })
  const coil = (address: string, coilType: LadderCoilEl['coilType']): LadderCoilEl => ({ kind: 'coil', id: nanoid(6), address, coilType })
  const branchOf = (elements: LadderContact[]): LadderBranch => ({ id: nanoid(6), elements })
  const rungs: LadderRung[] = []
  const startupRungs: LadderRung[] = []
  const pushTo = (list: LadderRung[], name: string, branches: LadderContact[][], coils: LadderCoilEl[], extra: Partial<LadderRung> = {}) =>
    list.push({ id: nanoid(6), name, branches: branches.length ? branches.map(branchOf) : [branchOf([])], coils, enabled: true, ...extra })
  const push = (name: string, branches: LadderContact[][], coils: LadderCoilEl[], extra: Partial<LadderRung> = {}) => pushTo(rungs, name, branches, coils, extra)
  const toContacts = (lits: Literal[]) => lits.map((l): LadderContact => l.cmp ? { ...contact(l.address, 'CMP'), compareOp: l.cmp.op, compareType: /\./.test(l.address + l.cmp.right) ? 'Real' : 'Int', compareValue: l.cmp.right } : contact(l.address, l.edge === 'R' ? (l.neg ? 'FALLING' : 'RISING') : l.edge === 'F' ? (l.neg ? 'RISING' : 'FALLING') : l.neg ? 'NC' : 'NO'))
  const timer = (address: string, presetMs: number): LadderTimer => ({ kind: 'timer', id: nanoid(6), address, timerType: 'TON', presetMs })

  // Uma condição → ramos paralelos de contactos em série (cada ramo começa por `prefix`).
  const branchesFor = (condition: string, prefix: LadderContact[], resolve: (n: Node) => string | null, label: string): LadderContact[][] | null => {
    const tree = parse(condition || '1')
    const dnf = tree && toDnf(tree, false, resolve)
    if (!dnf) { warnings.push(`${label}: condição «${condition}» não convertida (inválida ou demasiado complexa).`); return null }
    return dnf.map((lits) => [...prefix.map((c) => contact(c.address, c.contactType)), ...toContacts(lits)])
  }

  // 1) Inicialização: sem nenhuma etapa ativa → ativa as etapas iniciais.
  const isInitial = (s: GrafcetStep) => s.initial || s.stepType === 'initial' || s.stepType === 'initial-enclosing'
  const initial = steps.filter(isInitial)
  if (steps.length && !initial.length) warnings.push('Não há etapa inicial: o Ladder não arranca.')
  const startupBlock = !!options.startupBlock
  if (startupBlock) {
    // Complete restart [OB100]: corre uma vez ao entrar em RUN → repõe o GRAFCET e ativa as etapas iniciais.
    const chunk = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size))
    const groups = chunk(steps, 8)
    groups.forEach((group, i) => pushTo(startupRungs, `Complete restart · Repor etapas${groups.length > 1 ? ` (${i + 1}/${groups.length})` : ''}`, [[]], group.map((s) => coil(stepBits[s.id], 'RESET')), { comment: withName('Desativa todas as etapas do GRAFCET antes de arrancar') }))
    // Palavras de memória usadas nas comparações começam a 0 (MOVE), como o resto do GRAFCET.
    for (const word of [...compareWords].sort()) pushTo(startupRungs, `Complete restart · Iniciar ${word}`, [[]], [], { move: { source: '0', target: word }, comment: withName(`Inicia ${word} a 0 para as comparações do GRAFCET`) })
    if (initial.length) pushTo(startupRungs, 'Complete restart · Etapas iniciais', [[]], initial.map((s) => coil(stepBits[s.id], 'SET')), { comment: withName('Ativa as etapas iniciais do GRAFCET') })
  } else if (initial.length) push('GRAFCET · Inicialização', [steps.map((s) => contact(stepBits[s.id], 'NC'))], initial.map((s) => coil(stepBits[s.id], 'SET')), { comment: withName('Sem etapas ativas → ativa as etapas iniciais') })

  // 2) Temporizações das transições e das ações D/L.
  const transitionTimers = new Map<string, string>() // `${id}|${ms}` ou `${id}|${key}` → T
  transitions.forEach((t, k) => {
    // Temporizadores legados T(...)
    for (const token of t.condition.toUpperCase().match(/T\(\d+(?:\.\d+)?(?:MS|S)?\)/g) ?? []) {
      const ms = parseDuration(token)!
      const key = `${t.id}|${ms}`
      if (transitionTimers.has(key)) continue
      const address = alloc('T')
      transitionTimers.set(key, address)
      tag(address, `Temp_T${k + 1}`, `Temporização ${ms / 1000} s da transição T${k + 1}`)
      push(`GRAFCET · Temporização T${k + 1} (${ms / 1000} s)`, [t.from.map((id) => contact(stepBits[id] ?? 'M99'))], [], { timer: timer(address, ms) })
    }
    // Temporizadores normalizados IEC (ex.: 10s/X85 ou 5s/X1)
    const iecTokens = t.condition.match(/\d+(?:\.\d+)?(?:MS|S)?\/X[A-Za-z0-9_]*/gi) ?? []
    for (const token of iecTokens) {
      const parsed = parseIecTimer(token)
      if (!parsed) continue
      const ms = parsed.d1
      const key = `${t.id}|${token.toUpperCase()}`
      if (transitionTimers.has(key)) continue
      const address = alloc('T')
      transitionTimers.set(key, address)
      tag(address, `Temp_T${k + 1}_${tags.length}`, `Temporização ${token} da transição T${k + 1}`)
      let stepContactAddress = 'M99'
      if (parsed.step) {
        const found = steps.find((s, idx) => stepNumberOf(s, idx) === parsed.step || s.name.trim().toUpperCase() === parsed.step?.toUpperCase() || s.id === parsed.step) ?? steps[Number(parsed.step)]
        if (found && stepBits[found.id]) stepContactAddress = stepBits[found.id]
        else if (t.from.length && stepBits[t.from[0]]) stepContactAddress = stepBits[t.from[0]]
      } else if (t.from.length && stepBits[t.from[0]]) {
        stepContactAddress = stepBits[t.from[0]]
      }
      push(`GRAFCET · Temporização IEC T${k + 1} (${token})`, [[contact(stepContactAddress)]], [], { timer: timer(address, ms) })
    }
  })

  const byAddress = new Map<string, Array<{ stepId: string; condition: string; kind: string; timeMs: number; index: number; timerAddress?: string }>>()
  steps.forEach((s, index) => actionsOfStep(s).forEach((a) => {
    const address = normalizeActionVariable(a.address || a.variable || '').toUpperCase()
    if (!address) return
    byAddress.set(address, [...(byAddress.get(address) ?? []), { stepId: s.id, condition: a.condition || '1', kind: a.kind ?? 'N', timeMs: a.timeMs ?? 0, index }])
  }))
  // 2b) Temporizadores das ações D/L: correm antes da evolução das etapas (mesma temporização do simulador).
  for (const [address, list] of byAddress) for (const a of list) if (a.kind === 'D' || a.kind === 'L') {
    a.timerAddress = alloc('T')
    tag(a.timerAddress, `Tempo_${a.kind}_${symbolName(address)}`, `Tempo ${a.kind} de ${address} (${a.timeMs / 1000} s)`)
    push(`GRAFCET · Tempo ${a.kind} de ${address} (${a.timeMs / 1000} s)`, [[contact(stepBits[a.stepId])]], [], { timer: timer(a.timerAddress, Math.max(a.timeMs, 1)) })
  }

  // 3) Receptividades: E_k = origens ativas & condição & nenhuma transição anterior em conflito.
  transitions.forEach((t, k) => {
    const sources = t.from.filter((id) => stepBits[id])
    const prefix = sources.map((id) => contact(stepBits[id]))
    const earlier = transitions.slice(0, k).map((other, j) => ({ other, j })).filter(({ other }) => other.from.some((id) => t.from.includes(id)))
    const guards = earlier.map(({ j }) => contact(enableBits[j], 'NC'))
    const resolve = (n: Node) => {
      if (n.t === 'timer') {
        if (n.key) return transitionTimers.get(`${t.id}|${n.key.toUpperCase()}`) ?? null
        return transitionTimers.get(`${t.id}|${n.ms}`) ?? null
      }
      if (n.t === 'step') return bitOfIndex(n.index)
      return null
    }
    const branches = branchesFor(t.condition, [...prefix, ...guards], resolve, `T${k + 1}`)
    push(`GRAFCET · T${k + 1}: ${t.from.map(numberOfStep).join('+')} → ${t.to.map(numberOfStep).join('+')}`, branches ?? [[contact('M99', 'NO')]], [coil(enableBits[k], 'COIL')], { comment: withName(`Receptividade: ${t.condition}`), enabled: !!branches })
  })

  // 4) Desativar e 5) ativar etapas.
  steps.forEach((s, index) => {
    const ks = transitions.map((t, k) => (t.from.includes(s.id) ? k : -1)).filter((k) => k >= 0)
    if (ks.length) push(`GRAFCET · Desativa etapa ${stepNumberOf(s, index)}`, ks.map((k) => [contact(enableBits[k])]), [coil(stepBits[s.id], 'RESET')])
  })
  steps.forEach((s, index) => {
    const ks = transitions.map((t, k) => (t.to.includes(s.id) ? k : -1)).filter((k) => k >= 0)
    if (ks.length) push(`GRAFCET · Ativa etapa ${stepNumberOf(s, index)}`, ks.map((k) => [contact(enableBits[k])]), [coil(stepBits[s.id], 'SET')])
  })

  const storedTargets: string[] = []
  // 6) Ações por saída (várias ações na mesma saída → ramos em paralelo).
  for (const [address, list] of byAddress) {
    const continuous: LadderContact[][] = []
    const sets: LadderContact[][] = []
    const resets: LadderContact[][] = []
    for (const a of list) {
      const stepContact = contact(stepBits[a.stepId])
      let prefix = [stepContact]
      let resolve = (n: Node) => (n.t === 'step' ? bitOfIndex(n.index) : null)
      if (a.timerAddress) {
        const tAddress = a.timerAddress
        prefix = [stepContact, contact(tAddress, a.kind === 'D' ? 'NO' : 'NC')]
        resolve = (n: Node) => (n.t === 'step' ? bitOfIndex(n.index) : n.t === 'timer' ? tAddress : null)
      }
      const branches = branchesFor(a.condition, prefix, resolve, `Ação ${address} (etapa ${stepNumberOf(steps[a.index], a.index)})`)
      if (!branches) continue
      if (a.kind === 'S') sets.push(...branches)
      else if (a.kind === 'R') resets.push(...branches)
      else continuous.push(...branches)
    }
    const stored = sets.length || resets.length
    // Saída mista (N + S/R): memória própria para o valor memorizado e outra para o contínuo; a saída é o OU das duas.
    const mixed = stored && continuous.length
    const target = mixed ? alloc('M') : address
    if (stored) storedTargets.push(target)
    if (mixed) tag(target, `Mem_${symbolName(address)}`, `Valor memorizado (S/R) de ${address}`)
    if (sets.length) push(`GRAFCET · Memoriza ${address}`, sets, [coil(target, 'SET')])
    if (resets.length) push(`GRAFCET · Repõe ${address}`, resets, [coil(target, 'RESET')])
    if (mixed) {
      const cont = alloc('M')
      tag(cont, `Cont_${symbolName(address)}`, `Valor contínuo (N) de ${address}`)
      push(`GRAFCET · Contínua ${address}`, continuous, [coil(cont, 'COIL')])
      push(`GRAFCET · Saída ${address}`, [[contact(target)], [contact(cont)]], [coil(address, 'COIL')])
    } else if (!stored) push(`GRAFCET · Saída ${address}`, continuous, [coil(address, 'COIL')], { enabled: continuous.length > 0 })
  }
  // Complete restart: também repõe as saídas memorizadas (S/R), como o simulador ao reiniciar.
  if (startupBlock && storedTargets.length) pushTo(startupRungs, 'Complete restart · Repor memórias de saída', [[]], storedTargets.map((a) => coil(a, 'RESET')), { comment: 'Repõe as saídas memorizadas (S/R)' })

  // Tabela de variáveis: entradas (receptividades/condições) e saídas (ações) com comentário de uso.
  const bitRegex = /(?<![A-Za-z0-9_%.])([IQM]\d{1,2})(?![A-Za-z0-9_.])/gi
  const inputUse = new Map<string, Set<string>>()
  const note = (text: string, where: string) => { for (const m of text.matchAll(bitRegex)) { const a = m[1].toUpperCase(); if (a[0] === 'I') inputUse.set(a, new Set([...(inputUse.get(a) ?? []), where])) } }
  transitions.forEach((t, k) => note(stripGrafcetPrefix(t.condition), `T${k + 1}`))
  steps.forEach((s, i) => actionsOfStep(s).forEach((a) => note(stripGrafcetPrefix(a.condition || ''), `ação da etapa ${stepNumberOf(s, i)}`)))
  for (const [address, where] of [...inputUse].sort((a, b) => Number(a[0].slice(1)) - Number(b[0].slice(1)))) tag(address, address, `Entrada usada em ${[...where].join(', ')}`)
  for (const [address, list] of byAddress) {
    if (!/^[QM]\d{1,2}$/.test(address)) continue
    const label = steps.flatMap((s, i) => actionsOfStep(s).filter((a) => normalizeActionVariable(a.address || a.variable || '').toUpperCase() === address).map((a) => a.description?.trim() || '')).find(Boolean)
    tag(address, label ? symbolName(label) : address, `Saída do GRAFCET — etapa${list.length > 1 ? 's' : ''} ${[...new Set(list.map((a) => numberOfStep(a.stepId)))].join(', ')}`)
  }
  return { rungs, startupRungs, stepBits, tags, warnings }
}
