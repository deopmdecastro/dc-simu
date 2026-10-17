import { nanoid } from 'nanoid'
import type { LadderBranch, LadderCoilEl, LadderContact, LadderContactType, LadderRung, LadderTimer } from '../types'
import { actionsOfStep, parseDuration, parseIecTimer, transitionsOf, type GrafcetProgram, type GrafcetStep } from './engine'

/** Árvore booleana de uma condição GRAFCET. */
type Node =
  | { t: 'lit'; address: string; edge?: 'R' | 'F' }
  | { t: 'const'; value: boolean }
  | { t: 'and' | 'or'; a: Node; b: Node }
  | { t: 'not'; a: Node }
  | { t: 'timer'; ms: number; key?: string }
  | { t: 'step'; index: number }

const TOKEN_REGEX = /T\(\d+(?:\.\d+)?(?:MS|S)?\)|(?:\d+(?:\.\d+)?(?:MS|S)?\/X[A-Za-z0-9_]*)|X\d{1,3}|[IQM]\d{1,2}|[!&|()01^\\]|\*|\+|NOT|AND|OR|\/|_|↑|↓|[A-Za-z][A-Za-z0-9_]*/gi

function parse(expression: string): Node | null {
  const src = expression.trim()
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
interface Literal { address: string; neg: boolean; edge?: 'R' | 'F' }
const MAX_CONJUNCTIONS = 16

/** Converte em forma normal disjuntiva (lista de conjunções de literais). `null` = demasiado grande. */
function toDnf(node: Node, neg: boolean, resolve: (n: Node) => string | null): Literal[][] | null {
  switch (node.t) {
    case 'const': return node.value !== neg ? [[]] : []
    case 'not': return toDnf(node.a, !neg, resolve)
    case 'lit': return [[{ address: node.address, neg, edge: node.edge }]]
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

export interface LadderFromGrafcet { rungs: LadderRung[]; stepBits: Record<string, string>; warnings: string[] }

/** Gera o equivalente em Ladder de um GRAFCET (método bit-de-etapa com SET/RESET).
 *  Ordem: inicialização → temporizações → receptividades (E_k) → desativar → ativar → ações.
 *  As receptividades são calculadas todas antes de alterar os bits das etapas, por isso há
 *  no máximo uma evolução por scan e a prioridade das transições (ordem da lista) é respeitada. */
export function grafcetToLadder(program: GrafcetProgram, reserved: Iterable<string> = []): LadderFromGrafcet {
  const warnings: string[] = []
  const steps = program.steps
  const transitions = transitionsOf(program)
  const used = new Set<string>([...reserved].map((a) => a.toUpperCase()))
  for (const step of steps) for (const a of actionsOfStep(step)) {
    const addr = (a.address || a.variable || '').trim().toUpperCase()
    if (addr) used.add(addr)
  }
  for (const t of transitions) for (const m of t.condition.toUpperCase().match(/[IQM]\d{1,2}/g) ?? []) used.add(m)
  const alloc = (prefix: 'M' | 'T') => {
    for (let n = 1; n <= 99; n++) { const a = `${prefix}${n}`; if (!used.has(a)) { used.add(a); return a } }
    warnings.push(`Sem endereços ${prefix} livres (limite 99).`)
    return `${prefix}99`
  }
  const stepBits: Record<string, string> = {}
  steps.forEach((step) => { stepBits[step.id] = alloc('M') })
  const enableBits = transitions.map(() => alloc('M'))
  const bitOfIndex = (n: number) => (steps[n] ? stepBits[steps[n].id] : null)

  const contact = (address: string, contactType: LadderContactType = 'NO'): LadderContact => ({ kind: 'contact', id: nanoid(6), address, contactType })
  const coil = (address: string, coilType: LadderCoilEl['coilType']): LadderCoilEl => ({ kind: 'coil', id: nanoid(6), address, coilType })
  const branchOf = (elements: LadderContact[]): LadderBranch => ({ id: nanoid(6), elements })
  const rungs: LadderRung[] = []
  const push = (name: string, branches: LadderContact[][], coils: LadderCoilEl[], extra: Partial<LadderRung> = {}) =>
    rungs.push({ id: nanoid(6), name, branches: branches.length ? branches.map(branchOf) : [branchOf([])], coils, enabled: true, ...extra })
  const toContacts = (lits: Literal[]) => lits.map((l) => contact(l.address, l.edge === 'R' ? (l.neg ? 'FALLING' : 'RISING') : l.edge === 'F' ? (l.neg ? 'RISING' : 'FALLING') : l.neg ? 'NC' : 'NO'))
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
  if (initial.length) push('GRAFCET · Inicialização', [steps.map((s) => contact(stepBits[s.id], 'NC'))], initial.map((s) => coil(stepBits[s.id], 'SET')), { comment: 'Sem etapas ativas → ativa as etapas iniciais' })

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
      let stepContactAddress = 'M99'
      if (parsed.step) {
        const found = steps.find((s, idx) => s.name.trim().toUpperCase() === parsed.step?.toUpperCase() || String(idx) === parsed.step || s.id === parsed.step)
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
    const address = (a.address || a.variable || '').trim().toUpperCase()
    if (!address) return
    byAddress.set(address, [...(byAddress.get(address) ?? []), { stepId: s.id, condition: a.condition || '1', kind: a.kind ?? 'N', timeMs: a.timeMs ?? 0, index }])
  }))
  // 2b) Temporizadores das ações D/L: correm antes da evolução das etapas (mesma temporização do simulador).
  for (const [address, list] of byAddress) for (const a of list) if (a.kind === 'D' || a.kind === 'L') {
    a.timerAddress = alloc('T')
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
    push(`GRAFCET · T${k + 1}: ${t.from.map((id) => steps.findIndex((s) => s.id === id)).join('+')} → ${t.to.map((id) => steps.findIndex((s) => s.id === id)).join('+')}`, branches ?? [[contact('M99', 'NO')]], [coil(enableBits[k], 'COIL')], { comment: `Receptividade: ${t.condition}`, enabled: !!branches })
  })

  // 4) Desativar e 5) ativar etapas.
  steps.forEach((s, index) => {
    const ks = transitions.map((t, k) => (t.from.includes(s.id) ? k : -1)).filter((k) => k >= 0)
    if (ks.length) push(`GRAFCET · Desativa etapa ${index}`, ks.map((k) => [contact(enableBits[k])]), [coil(stepBits[s.id], 'RESET')])
  })
  steps.forEach((s, index) => {
    const ks = transitions.map((t, k) => (t.to.includes(s.id) ? k : -1)).filter((k) => k >= 0)
    if (ks.length) push(`GRAFCET · Ativa etapa ${index}`, ks.map((k) => [contact(enableBits[k])]), [coil(stepBits[s.id], 'SET')])
  })

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
      const branches = branchesFor(a.condition, prefix, resolve, `Ação ${address} (etapa ${a.index})`)
      if (!branches) continue
      if (a.kind === 'S') sets.push(...branches)
      else if (a.kind === 'R') resets.push(...branches)
      else continuous.push(...branches)
    }
    const stored = sets.length || resets.length
    // Saída mista (N + S/R): memória própria para o valor memorizado e outra para o contínuo; a saída é o OU das duas.
    const mixed = stored && continuous.length
    const target = mixed ? alloc('M') : address
    if (sets.length) push(`GRAFCET · Memoriza ${address}`, sets, [coil(target, 'SET')])
    if (resets.length) push(`GRAFCET · Repõe ${address}`, resets, [coil(target, 'RESET')])
    if (mixed) {
      const cont = alloc('M')
      push(`GRAFCET · Contínua ${address}`, continuous, [coil(cont, 'COIL')])
      push(`GRAFCET · Saída ${address}`, [[contact(target)], [contact(cont)]], [coil(address, 'COIL')])
    } else if (!stored) push(`GRAFCET · Saída ${address}`, continuous, [coil(address, 'COIL')], { enabled: continuous.length > 0 })
  }
  return { rungs, stepBits, warnings }
}
