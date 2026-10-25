import type { LadderProgram } from '../types'
import { COMPARE_OPERAND_RE } from './compare'

export type LadderIssueLevel = 'error' | 'warning' | 'info'
export interface LadderIssue { id: string; level: LadderIssueLevel; message: string; rungId?: string }

const VALID = /^[IQMTC]\d{1,2}$/

/** Verificações estáticas ao programa Ladder. Não executa nada: só analisa a estrutura. */
export function lintLadder(program: LadderProgram, options: { physicalInputs?: boolean } = {}): LadderIssue[] {
  const issues: LadderIssue[] = []
  const rungs = program.rungs
  const writers = new Map<string, Array<{ rungId: string; rung: string; type: string }>>()
  const written = new Set<string>()
  const read = new Set<string>()
  const addWrite = (address: string, rungId: string, rung: string, type: string) => {
    const key = address.toUpperCase()
    written.add(key)
    writers.set(key, [...(writers.get(key) ?? []), { rungId, rung, type }])
  }
  rungs.forEach((rung, index) => {
    const name = rung.name || `Network ${index + 1}`
    const hasOutput = rung.coils.length > 0 || !!rung.timer || !!rung.counter || !!rung.move || !!rung.math || !!rung.call
    for (const branch of rung.branches) for (const el of branch.elements) {
      if (el.contactType === 'CMP') {
        if (!COMPARE_OPERAND_RE.test(el.address) || !COMPARE_OPERAND_RE.test(el.compareValue ?? '0')) issues.push({ id: `${el.id}:cmp`, level: 'error', message: `${name}: operando inválido num comparador (${el.address} ${el.compareOp ?? '=='} ${el.compareValue ?? '0'}).`, rungId: rung.id })
        continue
      }
      read.add(el.address.toUpperCase())
      if (!VALID.test(el.address.toUpperCase()) && !/^DB/i.test(el.address)) issues.push({ id: `${el.id}:addr`, level: 'error', message: `${name}: endereço inválido «${el.address}» num contacto.`, rungId: rung.id })
    }
    for (const branch of rung.branches) {
      const modes = new Map<string, Set<string>>()
      for (const el of branch.elements) {
        if (el.contactType !== 'NO' && el.contactType !== 'NC') continue
        const key = el.address.toUpperCase()
        modes.set(key, (modes.get(key) ?? new Set()).add(el.contactType))
      }
      const clash = [...modes].filter(([, kinds]) => kinds.size > 1).map(([address]) => address)
      if (clash.length) issues.push({ id: `${branch.id}:contradiction`, level: 'warning', message: `${name}: ${clash.join(', ')} aparece como NO e NC em série no mesmo ramo — esse ramo nunca conduz.`, rungId: rung.id })
    }
    if (rung.counter?.resetAddress) read.add(rung.counter.resetAddress.toUpperCase())
    if (rung.move) read.add(rung.move.source.toUpperCase())
    if (rung.math) {
      read.add(rung.math.in1.toUpperCase()); read.add(rung.math.in2.toUpperCase())
      if (!COMPARE_OPERAND_RE.test(rung.math.in1) || !COMPARE_OPERAND_RE.test(rung.math.in2)) issues.push({ id: `${rung.id}:math-in`, level: 'error', message: `${name}: operando inválido no bloco ${rung.math.op}.`, rungId: rung.id })
      if ((rung.math.op === 'DIV' || rung.math.op === 'MOD') && /^[+-]?0+(\.0+)?$/.test(rung.math.in2.trim())) issues.push({ id: `${rung.id}:math-div0`, level: 'error', message: `${name}: ${rung.math.op} por zero nunca é executado.`, rungId: rung.id })
    }
    if (!hasOutput && rung.enabled) issues.push({ id: `${rung.id}:no-output`, level: 'warning', message: `${name}: não tem nenhuma saída (bobina, temporizador, contador ou MOVE).`, rungId: rung.id })
    if (hasOutput && rung.enabled && rung.branches.every((b) => b.elements.length > 0) === false && rung.branches.length > 1) issues.push({ id: `${rung.id}:empty-branch`, level: 'info', message: `${name}: existe um ramo vazio — a network fica sempre ativa.`, rungId: rung.id })
    if (!rung.enabled) issues.push({ id: `${rung.id}:disabled`, level: 'info', message: `${name}: está desativada e não é executada.`, rungId: rung.id })
    for (const coil of rung.coils) {
      const address = coil.address.toUpperCase()
      if (!VALID.test(address)) issues.push({ id: `${coil.id}:addr`, level: 'error', message: `${name}: endereço inválido «${coil.address}» numa bobina.`, rungId: rung.id })
      else if (address.startsWith('I')) issues.push({ id: `${coil.id}:input`, level: 'error', message: `${name}: a bobina escreve na entrada ${address}; as entradas só se leem.`, rungId: rung.id })
      addWrite(address, rung.id, name, coil.coilType)
    }
    if (rung.timer) {
      addWrite(rung.timer.address, rung.id, name, 'timer')
      if (!(rung.timer.presetMs > 0)) issues.push({ id: `${rung.id}:timer-preset`, level: 'warning', message: `${name}: o temporizador ${rung.timer.address} tem preset 0 — dispara no mesmo scan e perde o sentido.`, rungId: rung.id })
    }
    if (rung.counter) {
      if (!(rung.counter.preset > 0)) issues.push({ id: `${rung.id}:counter-preset`, level: 'warning', message: `${name}: o contador ${rung.counter.address} tem preset 0 — fica logo concluído.`, rungId: rung.id })
      addWrite(rung.counter.address, rung.id, name, 'counter')
      if (rung.counter.counterType === 'CTU' && !rung.counter.resetAddress) issues.push({ id: `${rung.id}:no-reset`, level: 'warning', message: `${name}: o contador ${rung.counter.address} não tem endereço de reset.`, rungId: rung.id })
    }
    if (rung.move) addWrite(rung.move.target, rung.id, name, 'move')
    if (rung.math) addWrite(rung.math.out, rung.id, name, 'math')
  })
  // Máquinas de estados em %MW: cada valor escrito por um MOVE deve ser testado por um comparador (==)
  // e cada comparação (== k) deve ter quem a escreva — senão há um estado inalcançável (saída que nunca liga).
  const mwWrites = new Map<string, Map<number, { rungId: string; rung: string }>>()
  const mwTests = new Map<string, Map<number, { rungId: string; rung: string }>>()
  const mwKey = (raw: string) => raw.trim().toUpperCase().replace(/^%/, '')
  rungs.forEach((rung, index) => {
    const name = rung.name || `Network ${index + 1}`
    if (rung.move && /^MW\d+$/.test(mwKey(rung.move.target)) && /^[+-]?\d+$/.test(rung.move.source.trim())) {
      const m = mwWrites.get(mwKey(rung.move.target)) ?? new Map(); m.set(Number(rung.move.source), { rungId: rung.id, rung: name }); mwWrites.set(mwKey(rung.move.target), m)
    }
    for (const branch of rung.branches) for (const el of branch.elements) {
      if (el.contactType !== 'CMP' || (el.compareOp ?? '==') !== '==' || !/^MW\d+$/.test(mwKey(el.address)) || !/^[+-]?\d+$/.test((el.compareValue ?? '').trim())) continue
      const m = mwTests.get(mwKey(el.address)) ?? new Map(); m.set(Number(el.compareValue), { rungId: rung.id, rung: name }); mwTests.set(mwKey(el.address), m)
    }
  })
  for (const [word, tests] of mwTests) {
    const writes = mwWrites.get(word)
    if (!writes) continue
    for (const [value, where] of tests) if (value !== 0 && !writes.has(value)) issues.push({ id: `mw-test:${word}:${value}`, level: 'warning', message: `${where.rung}: testa %${word} == ${value}, mas nenhum MOVE escreve ${value} em %${word} — esta condição nunca fica verdadeira.`, rungId: where.rungId })
    for (const [value, where] of writes) if (!tests.has(value)) issues.push({ id: `mw-write:${word}:${value}`, level: 'info', message: `${where.rung}: %${word} passa a ${value}, mas nenhum comparador testa %${word} == ${value} — verifique se este estado é usado (pode estar noutro bloco).`, rungId: where.rungId })
  }
  for (const [address, list] of writers) {
    const plain = list.filter((w) => w.type === 'COIL')
    if (plain.length > 1) issues.push({ id: `dup:${address}`, level: 'error', message: `${address} tem ${plain.length} bobinas simples (${plain.map((w) => w.rung).join(', ')}): a última network vence — use SET/RESET ou junte os ramos.`, rungId: plain[1].rungId })
    if (list.some((w) => w.type === 'COIL') && list.some((w) => w.type === 'SET' || w.type === 'RESET')) issues.push({ id: `mix:${address}`, level: 'warning', message: `${address} mistura bobina simples com SET/RESET — o resultado depende da ordem das networks.`, rungId: list[0].rungId })
    const sets = list.filter((w) => w.type === 'SET').length
    const resets = list.filter((w) => w.type === 'RESET').length
    if (sets && !resets) issues.push({ id: `set:${address}`, level: 'warning', message: `${address} tem SET mas nenhum RESET: nunca volta a 0.`, rungId: list.find((w) => w.type === 'SET')!.rungId })
    if (!sets && resets) issues.push({ id: `reset:${address}`, level: 'warning', message: `${address} tem RESET mas nenhum SET.`, rungId: list.find((w) => w.type === 'RESET')!.rungId })
    const timers = list.filter((w) => w.type === 'timer')
    if (timers.length > 1) issues.push({ id: `timer:${address}`, level: 'error', message: `O temporizador/contador ${address} é usado em ${timers.length} networks.`, rungId: timers[1].rungId })
  }
  for (const address of read) {
    if (/^[QMTC]/.test(address) && !written.has(address) && VALID.test(address)) issues.push({ id: `unwritten:${address}`, level: 'warning', message: `${address} é lido mas nenhuma network o escreve — fica sempre a 0.` })
  }
  if (!options.physicalInputs) for (const address of written) if (/^[QM]/.test(address) && !read.has(address) && address.startsWith('M')) issues.push({ id: `unread:${address}`, level: 'info', message: `A memória ${address} é escrita mas nunca lida.` })
  const order = { error: 0, warning: 1, info: 2 }
  return issues.sort((a, b) => order[a.level] - order[b.level])
}
