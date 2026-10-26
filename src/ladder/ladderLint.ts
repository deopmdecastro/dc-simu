import type { LadderProgram, LadderTag } from '../types'
import { COMPARE_OPERAND_RE } from './compare'
import { normalizeBitAddress } from './addresses'

export type LadderIssueLevel = 'error' | 'warning' | 'info'
export interface LadderIssue { id: string; level: LadderIssueLevel; message: string; rungId?: string }

/** Forma canónica para comparar endereços: I1 (antigo) ≡ I0.0; %Q0.1 ≡ Q0.1; T1, C1 e MW2 em maiúsculas. */
export function canonicalAddress(raw: string): string {
  return normalizeBitAddress(raw) ?? raw.trim().replace(/^%/, '').toUpperCase()
}

/** Endereço aceite pelo motor: bit I/Q/M (I0.0 ou o alias antigo I1), temporizador Tn ou contador Cn. */
export function isLadderBitAddress(raw: string): boolean {
  return normalizeBitAddress(raw) !== undefined || /^[TC]\d{1,3}$/.test(raw.trim().replace(/^%/, '').toUpperCase())
}

const isValid = (address: string) => isLadderBitAddress(address)
/** Nome de etiqueta LBL aceite (estilo TIA Portal). */
export const LABEL_RE = /^[A-Za-z_][A-Za-z0-9_]{0,15}$/

/** Verificações estáticas ao programa Ladder. Não executa nada: só analisa a estrutura. */
export function lintLadder(program: LadderProgram, options: { physicalInputs?: boolean; /** Tabela de Tags do projeto (LADDER-LINT-02). */ tags?: LadderTag[] } = {}): LadderIssue[] {
  // Como o endereço aparece no diagrama (ex.: alias antigo «M9»), para as mensagens não confundirem.
  const shown = new Map<string, string>()
  const canon = (raw: string): string => {
    const key = canonicalAddress(raw)
    const typed = raw.trim().replace(/^%/, '').toUpperCase()
    if (!shown.has(key) && typed) shown.set(key, typed)
    return key
  }
  const show = (key: string) => { const typed = shown.get(key); return typed && typed !== key ? `${typed} (≡ ${key})` : key }
  const issues: LadderIssue[] = []
  const rungs = program.rungs
  const writers = new Map<string, Array<{ rungId: string; rung: string; type: string }>>()
  const written = new Set<string>()
  const read = new Set<string>()
  const addWrite = (address: string, rungId: string, rung: string, type: string) => {
    const key = canon(address)
    written.add(key)
    writers.set(key, [...(writers.get(key) ?? []), { rungId, rung, type }])
  }
  rungs.forEach((rung, index) => {
    const name = rung.name || `Network ${index + 1}`
    const hasOutput = rung.coils.length > 0 || !!rung.timer || !!rung.counter || !!rung.move || !!rung.math || !!rung.call || !!rung.limit || !!rung.scale || !!rung.jump
    for (const branch of rung.branches) for (const el of branch.elements) {
      if (el.contactType === 'NOT') continue
      if (el.contactType === 'XOR') {
        const second = el.xorAddress ?? ''
        if (second.trim()) read.add(canon(second))
        if (!second.trim()) issues.push({ id: `${el.id}:xor-b`, level: 'error', message: `${name}: o contacto XOR ${el.address} não tem o 2.º operando.`, rungId: rung.id })
        else if (!isValid(second) && !/^DB/i.test(second)) issues.push({ id: `${el.id}:xor-addr`, level: 'error', message: `${name}: endereço inválido «${second}» no XOR.`, rungId: rung.id })
        else if (canonicalAddress(second) === canonicalAddress(el.address)) issues.push({ id: `${el.id}:xor-same`, level: 'warning', message: `${name}: XOR de ${show(canon(el.address))} com ele próprio nunca conduz.`, rungId: rung.id })
      }
      if (el.contactType === 'CMP') {
        if (!COMPARE_OPERAND_RE.test(el.address) || !COMPARE_OPERAND_RE.test(el.compareValue ?? '0')) issues.push({ id: `${el.id}:cmp`, level: 'error', message: `${name}: operando inválido num comparador (${el.address} ${el.compareOp ?? '=='} ${el.compareValue ?? '0'}).`, rungId: rung.id })
        continue
      }
      read.add(canon(el.address))
      if (!isValid(el.address) && !/^DB/i.test(el.address)) issues.push({ id: `${el.id}:addr`, level: 'error', message: `${name}: endereço inválido «${el.address}» num contacto.`, rungId: rung.id })
    }
    for (const branch of rung.branches) {
      const modes = new Map<string, Set<string>>()
      for (const el of branch.elements) {
        if (el.contactType !== 'NO' && el.contactType !== 'NC') continue
        const key = canon(el.address)
        modes.set(key, (modes.get(key) ?? new Set()).add(el.contactType))
      }
      const clash = [...modes].filter(([, kinds]) => kinds.size > 1).map(([address]) => address)
      if (clash.length) issues.push({ id: `${branch.id}:contradiction`, level: 'warning', message: `${name}: ${clash.map(show).join(', ')} aparece como NO e NC em série no mesmo ramo — esse ramo nunca conduz.`, rungId: rung.id })
    }
    if (rung.counter?.resetAddress) read.add(canon(rung.counter.resetAddress))
    if (rung.counter?.counterType === 'CTUD') {
      if (rung.counter.downAddress) read.add(canon(rung.counter.downAddress))
      else issues.push({ id: `${rung.id}:ctud-down`, level: 'warning', message: `${name}: o contador CTUD ${rung.counter.address} não tem entrada CD — só conta para cima.`, rungId: rung.id })
    }
    for (const branch of rung.branches) {
      const first = branch.elements[0]
      if (first?.contactType === 'NOT' && branch.elements.length === 1) issues.push({ id: `${branch.id}:not-only`, level: 'warning', message: `${name}: um ramo só com NOT fica sempre a 0 — o NOT inverte o resultado dos contactos à sua esquerda.`, rungId: rung.id })
    }
    if (rung.timer?.resetAddress) read.add(canon(rung.timer.resetAddress))
    if (rung.move) read.add(canon(rung.move.source))
    if (rung.math) {
      read.add(canon(rung.math.in1)); read.add(canon(rung.math.in2))
      if (!COMPARE_OPERAND_RE.test(rung.math.in1) || !COMPARE_OPERAND_RE.test(rung.math.in2)) issues.push({ id: `${rung.id}:math-in`, level: 'error', message: `${name}: operando inválido no bloco ${rung.math.op}.`, rungId: rung.id })
      if ((rung.math.op === 'DIV' || rung.math.op === 'MOD') && /^[+-]?0+(\.0+)?$/.test(rung.math.in2.trim())) issues.push({ id: `${rung.id}:math-div0`, level: 'error', message: `${name}: ${rung.math.op} por zero nunca é executado.`, rungId: rung.id })
    }
    const numConst = (raw: string) => (/^[+-]?\d+(?:\.\d+)?$/.test(raw.trim()) ? Number(raw) : undefined)
    if (rung.limit) {
      const { mn, mx } = rung.limit
      for (const op of [mn, rung.limit.in, mx]) read.add(canon(op))
      if (![mn, rung.limit.in, mx].every((op) => COMPARE_OPERAND_RE.test(op))) issues.push({ id: `${rung.id}:limit-in`, level: 'error', message: `${name}: operando inválido no bloco LIMIT.`, rungId: rung.id })
      const a = numConst(mn), b = numConst(mx)
      if (a !== undefined && b !== undefined && a > b) issues.push({ id: `${rung.id}:limit-range`, level: 'error', message: `${name}: LIMIT com MN (${a}) maior do que MX (${b}) — o bloco não limita e o ENO fica a 0.`, rungId: rung.id })
    }
    if (rung.scale) {
      const sc = rung.scale
      for (const op of [sc.in, sc.inMin, sc.inMax, sc.outMin, sc.outMax]) read.add(canon(op))
      if (![sc.in, sc.inMin, sc.inMax, sc.outMin, sc.outMax].every((op) => COMPARE_OPERAND_RE.test(op))) issues.push({ id: `${rung.id}:scale-in`, level: 'error', message: `${name}: operando inválido no bloco SCALE.`, rungId: rung.id })
      const a = numConst(sc.inMin), b = numConst(sc.inMax)
      if (a !== undefined && b !== undefined && a === b) issues.push({ id: `${rung.id}:scale-range`, level: 'error', message: `${name}: SCALE com IN_MIN = IN_MAX (${a}) — divisão por zero, o bloco nunca escreve.`, rungId: rung.id })
    }
    if (!hasOutput && rung.enabled) issues.push({ id: `${rung.id}:no-output`, level: 'warning', message: `${name}: não tem nenhuma saída (bobina, temporizador, contador ou MOVE).`, rungId: rung.id })
    if (hasOutput && rung.enabled && rung.branches.every((b) => b.elements.length > 0) === false && rung.branches.length > 1) issues.push({ id: `${rung.id}:empty-branch`, level: 'info', message: `${name}: existe um ramo vazio — a network fica sempre ativa.`, rungId: rung.id })
    if (!rung.enabled) issues.push({ id: `${rung.id}:disabled`, level: 'info', message: `${name}: está desativada e não é executada.`, rungId: rung.id })
    for (const coil of rung.coils) {
      const address = canon(coil.address)
      if (normalizeBitAddress(coil.address) === undefined) issues.push({ id: `${coil.id}:addr`, level: 'error', message: `${name}: endereço inválido «${coil.address}» numa bobina.`, rungId: rung.id })
      else if (address.startsWith('I')) issues.push({ id: `${coil.id}:input`, level: 'error', message: `${name}: a bobina escreve na entrada ${show(address)}; as entradas só se leem.`, rungId: rung.id })
      addWrite(address, rung.id, name, coil.coilType)
      if (coil.coilType === 'SR' || coil.coilType === 'RS') {
        if (coil.resetAddress) read.add(canon(coil.resetAddress))
        else issues.push({ id: `${coil.id}:no-reset`, level: 'warning', message: `${name}: a bobina ${coil.coilType} ${show(address)} não tem entrada de reset — nunca volta a 0.`, rungId: rung.id })
      }
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
    if (rung.limit) addWrite(rung.limit.out, rung.id, name, 'limit')
    if (rung.scale) addWrite(rung.scale.out, rung.id, name, 'scale')
  })
  // Saltos (JMP/JMPN → LBL): etiqueta válida e única, destino existente e sempre para a frente.
  const labels = new Map<string, number[]>()
  rungs.forEach((rung, index) => {
    const l = rung.label?.trim()
    if (!l) return
    const name = rung.name || `Network ${index + 1}`
    if (!LABEL_RE.test(l)) issues.push({ id: `${rung.id}:lbl-name`, level: 'error', message: `${name}: etiqueta «${l}» inválida — use letras, dígitos ou _, a começar por letra (máx. 16).`, rungId: rung.id })
    labels.set(l.toUpperCase(), [...(labels.get(l.toUpperCase()) ?? []), index])
  })
  for (const [l, at] of labels) if (at.length > 1) issues.push({ id: `lbl-dup:${l}`, level: 'error', message: `A etiqueta ${l} aparece em ${at.length} networks (${at.map((i) => i + 1).join(', ')}) — cada LBL tem de ser única.`, rungId: rungs[at[1]].id })
  rungs.forEach((rung, index) => {
    if (!rung.jump) return
    const name = rung.name || `Network ${index + 1}`
    const l = rung.jump.label.trim()
    const target = labels.get(l.toUpperCase())?.[0]
    if (!l) issues.push({ id: `${rung.id}:jmp-empty`, level: 'error', message: `${name}: ${rung.jump.mode} sem etiqueta de destino.`, rungId: rung.id })
    else if (target === undefined) issues.push({ id: `${rung.id}:jmp-missing`, level: 'error', message: `${name}: ${rung.jump.mode} para ${l}, mas nenhuma network tem a etiqueta ${l} — o salto é ignorado.`, rungId: rung.id })
    else if (target <= index) issues.push({ id: `${rung.id}:jmp-back`, level: 'error', message: `${name}: ${rung.jump.mode} para ${l} (Network ${target + 1}) salta para trás — só são permitidos saltos para a frente; o salto é ignorado.`, rungId: rung.id })
    else if (target === index + 1) issues.push({ id: `${rung.id}:jmp-next`, level: 'info', message: `${name}: ${rung.jump.mode} para ${l} salta para a network seguinte — não salta nada.`, rungId: rung.id })
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
    if (plain.length > 1) issues.push({ id: `dup:${address}`, level: 'error', message: `${show(address)} tem ${plain.length} bobinas simples (${plain.map((w) => w.rung).join(', ')}): a última network vence — use SET/RESET ou junte os ramos.`, rungId: plain[1].rungId })
    if (list.some((w) => w.type === 'COIL') && list.some((w) => w.type === 'SET' || w.type === 'RESET' || w.type === 'SR' || w.type === 'RS')) issues.push({ id: `mix:${address}`, level: 'warning', message: `${show(address)} mistura bobina simples com SET/RESET — o resultado depende da ordem das networks.`, rungId: list[0].rungId })
    const sets = list.filter((w) => w.type === 'SET').length
    const resets = list.filter((w) => w.type === 'RESET').length
    if (sets && !resets) issues.push({ id: `set:${address}`, level: 'warning', message: `${show(address)} tem SET mas nenhum RESET: nunca volta a 0.`, rungId: list.find((w) => w.type === 'SET')!.rungId })
    if (!sets && resets) issues.push({ id: `reset:${address}`, level: 'warning', message: `${show(address)} tem RESET mas nenhum SET.`, rungId: list.find((w) => w.type === 'RESET')!.rungId })
    const timers = list.filter((w) => w.type === 'timer')
    if (timers.length > 1) issues.push({ id: `timer:${address}`, level: 'error', message: `O temporizador/contador ${show(address)} é usado em ${timers.length} networks.`, rungId: timers[1].rungId })
  }
  for (const address of read) {
    if (/^[QMTC]/.test(address) && !written.has(address) && isValid(address)) issues.push({ id: `unwritten:${address}`, level: 'warning', message: `${show(address)} é lido mas nenhuma network o escreve — fica sempre a 0.` })
  }
  if (!options.physicalInputs) for (const address of written) if (/^[QM]/.test(address) && !read.has(address) && address.startsWith('M')) issues.push({ id: `unread:${address}`, level: 'info', message: `A memória ${show(address)} é escrita mas nunca lida.` })
  // LADDER-LINT-02 — coerência com a Tabela de Tags.
  const tags = options.tags ?? []
  if (tags.length) {
    const declared = new Map<string, LadderTag>()
    for (const tag of tags) if (tag.address.trim()) declared.set(canonicalAddress(tag.address), tag)
    const used = new Set<string>([...read, ...written].filter((address) => isValid(address) || /^MW\d+$/.test(address)))
    const undeclared = [...used].filter((address) => !declared.has(address)).sort()
    for (const address of undeclared) issues.push({ id: `undeclared:${address}`, level: 'info', message: `${show(address)} é usado no programa mas não está declarado na Tabela de Tags — dê-lhe um nome simbólico.` })
    for (const [address, tag] of declared) {
      if (!address.startsWith('Q') || normalizeBitAddress(address) === undefined || written.has(address)) continue
      issues.push({ id: `untraced:${address}`, level: 'warning', message: `A saída ${show(address)}${tag.name ? ` («${tag.name}»)` : ''} está declarada mas nenhuma network a escreve — nunca liga.` })
    }
  }
  const order = { error: 0, warning: 1, info: 2 }
  return issues.sort((a, b) => order[a.level] - order[b.level])
}
