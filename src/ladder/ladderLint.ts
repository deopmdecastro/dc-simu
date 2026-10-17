import type { LadderProgram } from '../types'

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
    const hasOutput = rung.coils.length > 0 || !!rung.timer || !!rung.counter || !!rung.move || !!rung.call
    for (const branch of rung.branches) for (const el of branch.elements) {
      read.add(el.address.toUpperCase())
      if (!VALID.test(el.address.toUpperCase()) && !/^DB/i.test(el.address)) issues.push({ id: `${el.id}:addr`, level: 'error', message: `${name}: endereço inválido «${el.address}» num contacto.`, rungId: rung.id })
    }
    if (rung.counter?.resetAddress) read.add(rung.counter.resetAddress.toUpperCase())
    if (rung.move) read.add(rung.move.source.toUpperCase())
    if (!hasOutput && rung.enabled) issues.push({ id: `${rung.id}:no-output`, level: 'warning', message: `${name}: não tem nenhuma saída (bobina, temporizador, contador ou MOVE).`, rungId: rung.id })
    if (hasOutput && rung.enabled && rung.branches.every((b) => b.elements.length > 0) === false && rung.branches.length > 1) issues.push({ id: `${rung.id}:empty-branch`, level: 'info', message: `${name}: existe um ramo vazio — a network fica sempre ativa.`, rungId: rung.id })
    if (!rung.enabled) issues.push({ id: `${rung.id}:disabled`, level: 'info', message: `${name}: está desativada e não é executada.`, rungId: rung.id })
    for (const coil of rung.coils) {
      const address = coil.address.toUpperCase()
      if (!VALID.test(address)) issues.push({ id: `${coil.id}:addr`, level: 'error', message: `${name}: endereço inválido «${coil.address}» numa bobina.`, rungId: rung.id })
      else if (address.startsWith('I')) issues.push({ id: `${coil.id}:input`, level: 'error', message: `${name}: a bobina escreve na entrada ${address}; as entradas só se leem.`, rungId: rung.id })
      addWrite(address, rung.id, name, coil.coilType)
    }
    if (rung.timer) addWrite(rung.timer.address, rung.id, name, 'timer')
    if (rung.counter) {
      addWrite(rung.counter.address, rung.id, name, 'counter')
      if (rung.counter.counterType === 'CTU' && !rung.counter.resetAddress) issues.push({ id: `${rung.id}:no-reset`, level: 'warning', message: `${name}: o contador ${rung.counter.address} não tem endereço de reset.`, rungId: rung.id })
    }
    if (rung.move) addWrite(rung.move.target, rung.id, name, 'move')
  })
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
