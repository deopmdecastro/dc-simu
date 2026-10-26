import type { ComponentType, LadderMathOp, LadderCoilType, LadderCompareOp, LadderContact, LadderContactType, LadderRung } from '../types'

/** Comparadores da paleta: um por operador. */
export type CompareKind = 'CMP_EQ' | 'CMP_NE' | 'CMP_GE' | 'CMP_LE' | 'CMP_GT' | 'CMP_LT'
export const COMPARE_KIND_OP: Record<CompareKind, LadderCompareOp> = {
  CMP_EQ: '==', CMP_NE: '<>', CMP_GE: '>=', CMP_LE: '<=', CMP_GT: '>', CMP_LT: '<',
}

/** Tipos de elemento que podem ser inseridos numa network. */
export type PaletteKind =
  | LadderContactType
  | LadderCoilType
  | 'TON'
  | 'TOF'
  | 'TP'
  | 'TONR'
  | 'CTU'
  | 'CTD'
  | 'CTUD'
  | 'MOVE'
  | 'CALL'
  | 'COMPARE'
  | CompareKind
  | LadderMathOp
  | 'LIMIT'
  | 'SCALE'
  | 'JMP'
  | 'JMPN'
  | 'LBL'
  | 'BRANCH'

/** MIME do arrastar de elementos da paleta Ladder. */
export const LADDER_MIME = 'application/x-dcsimu-ladder'
/** MIME do arrastar de um contato já existente (mover dentro/entre networks). */
export const LADDER_MOVE_MIME = 'application/x-dcsimu-ladder-move'
/** MIME do arrastar de um bloco de programa da árvore para a Main (insere CALL — como o TIA Portal). */
export const CALL_BLOCK_MIME = 'application/x-dcsimu-call-block'

/** Bloco de programa em arraste a partir da árvore do projeto. */
export interface CallBlockPayload { fileId: string; name: string }

/** Componente do esquema → elemento Ladder equivalente (arrastar da biblioteca). */
export const COMPONENT_TO_LADDER: Partial<Record<ComponentType, PaletteKind>> = {
  buttonNO: 'NO', buttonNC: 'NC', selector2: 'NO', selector3: 'NO', keySwitch: 'NO',
  footSwitch: 'NO', emergencyButton: 'NC', emergencyButtonKeyP20ACR: 'NC', dualPushButtonNpb22D11: 'NO', limitSwitch: 'NO', proximitySensor: 'NO',
  photoSensor: 'NO', pressureSwitch: 'NO', floatSwitch: 'NO', thermostat: 'NO',
  motor1ph: 'COIL', motor3ph: 'COIL', contactor: 'COIL',
  auxRelay: 'COIL', timerRelayTON: 'TON', timerRelayTOF: 'TOF', timerRelayStarDelta: 'TON',
  counterRelay: 'CTU', safetyRelay: 'COIL',
}

/**
 * O HTML5 drag não permite ler os dados durante o `dragover` — guardamos
 * aqui o tipo em arraste para o editor mostrar o indicador de largada certo.
 */
let currentDrag: { kind: PaletteKind } | { move: MovePayload } | { block: CallBlockPayload } | null = null
export const setLadderDrag = (v: typeof currentDrag) => {
  currentDrag = v
}
export const getLadderDrag = () => currentDrag

export interface MovePayload {
  rungId: string
  branchId: string
  elementId: string
}

export const isCompareKind = (k: PaletteKind): k is CompareKind => k in COMPARE_KIND_OP
export const isContactKind = (k: PaletteKind): k is LadderContactType => k === 'NO' || k === 'NC' || k === 'RISING' || k === 'FALLING' || k === 'NOT' || k === 'XOR'
export const isJumpKind = (k: PaletteKind): k is 'JMP' | 'JMPN' => k === 'JMP' || k === 'JMPN'
export const isCoilKind = (k: PaletteKind): k is LadderCoilType => k === 'COIL' || k === 'SET' || k === 'RESET' || k === 'SR' || k === 'RS'
export const isTimerKind = (k: PaletteKind): k is 'TON' | 'TOF' | 'TP' | 'TONR' => k === 'TON' || k === 'TOF' || k === 'TP' || k === 'TONR'
export const isMathKind = (k: PaletteKind): k is LadderMathOp => k === 'ADD' || k === 'SUB' || k === 'MUL' || k === 'DIV' || k === 'MOD'
export const isCounterKind = (k: PaletteKind): k is 'CTU' | 'CTD' | 'CTUD' => k === 'CTU' || k === 'CTD' || k === 'CTUD'

const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** Próxima palavra de memória livre (MW0, MW2, …) — palavras de 16 bits ocupam 2 bytes. */
function nextWord(rung: LadderRung) {
  const used = new Set<string>()
  rung.branches.forEach((b) => b.elements.forEach((e) => used.add(e.address.toUpperCase())))
  for (let i = 0; i < 200; i += 2) if (!used.has(`MW${i}`)) return `MW${i}`
  return 'MW0'
}

/** Próximo endereço livre de um prefixo na network, formato Siemens byte.bit (I0.0, I0.1… / Q0.0… / M0.0…). */
function nextAddr(rung: LadderRung, prefix: 'I' | 'Q' | 'M') {
  const used = new Set<string>()
  rung.branches.forEach((b) => b.elements.forEach((e) => used.add(e.address)))
  rung.coils.forEach((c) => used.add(c.address))
  for (let i = 0; i < 8 * 12; i++) {
    const addr = `${prefix}${Math.floor(i / 8)}.${i % 8}`
    if (!used.has(addr)) return addr
  }
  return `${prefix}0.0`
}

/** 2.º endereço livre (para o XOR nascer com dois operandos distintos). */
function nextAddrAfter(rung: LadderRung, prefix: 'I' | 'Q' | 'M') {
  const first = nextAddr(rung, prefix)
  const probe: LadderRung = { ...rung, branches: [...rung.branches, { id: '_probe', elements: [{ kind: 'contact', id: '_p', address: first, contactType: 'NO' }] }] }
  return nextAddr(probe, prefix)
}

export type DropTarget =
  | { kind: 'branch'; branchIndex: number; index: number }
  | { kind: 'newBranch'; beforeIndex?: number }
  | { kind: 'output' }

/**
 * Aplica um elemento da paleta numa network, na posição indicada.
 * Devolve a network atualizada e o id do elemento criado (para selecionar).
 */
export function applyKind(rung: LadderRung, kind: PaletteKind, target: DropTarget = { kind: 'output' }): { rung: LadderRung; created?: { type: 'contact'; branchId: string; elementId: string } | { type: 'coil'; coilId: string } | { type: 'timer' } | { type: 'counter' } | { type: 'math' } | { type: 'limit' } | { type: 'scale' } | { type: 'jump' } | { type: 'label' } } {
  if (kind === 'CALL') return { rung: { ...rung, call: rung.call ?? { targetId: 'fc1' } } }
  if (kind === 'MOVE') return { rung: { ...rung, move: rung.move ?? { source: 'I1', target: 'M1' } } }
  if (kind === 'LIMIT') return { rung: { ...rung, limit: rung.limit ?? { mn: '0', in: 'MW0', mx: '100', out: 'MW2' } }, created: { type: 'limit' } }
  if (kind === 'SCALE') return { rung: { ...rung, scale: rung.scale ?? { in: 'MW0', inMin: '0', inMax: '27648', outMin: '0', outMax: '100', out: 'MW4' } }, created: { type: 'scale' } }
  if (isJumpKind(kind)) return { rung: { ...rung, jump: { label: rung.jump?.label ?? 'M001', mode: kind } }, created: { type: 'jump' } }
  if (kind === 'LBL') return { rung: { ...rung, label: rung.label || 'M001' }, created: { type: 'label' } }
  if (isMathKind(kind)) return { rung: { ...rung, math: { in1: 'MW0', in2: '1', out: 'MW2', ...rung.math, op: kind } }, created: { type: 'math' } }
  if (kind === 'BRANCH') {
    // Linha paralela (estilo TIA Portal «abrir ramo»): nasce com um contacto NA pronto a editar,
    // na posição indicada (beforeIndex) — um ramo vazio faria a network ficar sempre ligada.
    const el: LadderContact = { kind: 'contact', id: uid(`${rung.id}-c`), address: nextAddr(rung, 'I'), contactType: 'NO' }
    const branch = { id: uid(`${rung.id}-b`), elements: [el] }
    const branches = [...rung.branches]
    const at = target.kind === 'newBranch' && target.beforeIndex !== undefined
      ? Math.max(0, Math.min(target.beforeIndex, branches.length))
      : branches.length
    branches.splice(at, 0, branch)
    return { rung: { ...rung, branches }, created: { type: 'contact', branchId: branch.id, elementId: el.id } }
  }
  if (isContactKind(kind) || isCompareKind(kind)) {
    const el: LadderContact = isCompareKind(kind)
      ? { kind: 'contact', id: uid(`${rung.id}-c`), address: nextWord(rung), contactType: 'CMP', compareOp: COMPARE_KIND_OP[kind], compareType: 'Int', compareValue: '0' }
      : kind === 'XOR'
        ? { kind: 'contact', id: uid(`${rung.id}-c`), address: nextAddr(rung, 'I'), contactType: 'XOR', xorAddress: nextAddrAfter(rung, 'I') }
        : { kind: 'contact', id: uid(`${rung.id}-c`), address: kind === 'NOT' ? '' : nextAddr(rung, 'I'), contactType: kind as LadderContactType }
    let branches = rung.branches.length ? [...rung.branches] : [{ id: `${rung.id}-b0`, elements: [] }]
    let bi = 0
    let idx = branches[0].elements.length
    if (target.kind === 'newBranch') {
      const branch = { id: uid(`${rung.id}-b`), elements: [] as LadderContact[] }
      const at = target.beforeIndex !== undefined ? Math.max(0, Math.min(target.beforeIndex, branches.length)) : branches.length
      branches.splice(at, 0, branch)
      bi = at
      idx = 0
    } else if (target.kind === 'branch') {
      bi = Math.max(0, Math.min(target.branchIndex, branches.length - 1))
      idx = Math.max(0, Math.min(target.index, branches[bi].elements.length))
    }
    const elements = [...branches[bi].elements]
    elements.splice(idx, 0, el)
    branches[bi] = { ...branches[bi], elements }
    return { rung: { ...rung, branches }, created: { type: 'contact', branchId: branches[bi].id, elementId: el.id } }
  }
  if (isCoilKind(kind)) {
    const coilId = uid(`${rung.id}-k`)
    const bistable = kind === 'SR' || kind === 'RS'
    return { rung: { ...rung, coils: [...rung.coils, { kind: 'coil', id: coilId, address: nextAddr(rung, 'Q'), coilType: kind, ...(bistable ? { resetAddress: nextAddr(rung, 'I') } : {}) }] }, created: { type: 'coil', coilId } }
  }
  if (isTimerKind(kind)) {
    return {
      rung: { ...rung, timer: { kind: 'timer', id: rung.timer?.id ?? `${rung.id}-t`, address: rung.timer?.address ?? 'T1', timerType: kind, presetMs: rung.timer?.presetMs ?? 3000, preset2Ms: rung.timer?.preset2Ms ?? 50, resetAddress: kind === 'TONR' ? (rung.timer?.resetAddress ?? nextAddr(rung, 'M')) : undefined } },
      created: { type: 'timer' },
    }
  }
  if (isCounterKind(kind)) {
    return {
      rung: { ...rung, counter: { kind: 'counter', id: rung.counter?.id ?? `${rung.id}-n`, address: rung.counter?.address ?? 'C1', counterType: kind, preset: rung.counter?.preset ?? 5, resetAddress: rung.counter?.resetAddress ?? 'M9', ...(kind === 'CTUD' ? { downAddress: rung.counter?.downAddress ?? nextAddr(rung, 'I') } : {}) } },
      created: { type: 'counter' },
    }
  }
  return { rung: { ...rung, comment: rung.comment || `${kind}: bloco ainda não suportado pelo motor de simulação` } }
}

/** Remove um contato de uma network e devolve-o (para mover). */
export function takeContact(rung: LadderRung, branchId: string, elementId: string): { rung: LadderRung; el: LadderContact | null } {
  let el: LadderContact | null = null
  const branches = rung.branches.map((b) => {
    if (b.id !== branchId) return b
    const found = b.elements.find((e) => e.id === elementId)
    if (found) el = found
    return { ...b, elements: b.elements.filter((e) => e.id !== elementId) }
  })
  return { rung: { ...rung, branches }, el }
}

/** Insere um contato existente na posição indicada. */
export function putContact(rung: LadderRung, el: LadderContact, target: DropTarget): { rung: LadderRung; branchId: string } {
  let branches = rung.branches.length ? [...rung.branches] : [{ id: `${rung.id}-b0`, elements: [] }]
  let bi = 0
  let idx = branches[0].elements.length
  if (target.kind === 'newBranch') {
    const branch = { id: uid(`${rung.id}-b`), elements: [] as LadderContact[] }
    const at = target.beforeIndex !== undefined ? Math.max(0, Math.min(target.beforeIndex, branches.length)) : branches.length
    branches.splice(at, 0, branch)
    bi = at
    idx = 0
  } else if (target.kind === 'branch') {
    bi = Math.max(0, Math.min(target.branchIndex, branches.length - 1))
    idx = Math.max(0, Math.min(target.index, branches[bi].elements.length))
  }
  const elements = [...branches[bi].elements]
  elements.splice(idx, 0, el)
  branches[bi] = { ...branches[bi], elements }
  return { rung: { ...rung, branches }, branchId: branches[bi].id }
}

/** Navegação «CALL → abrir o bloco chamado» (comunicação entre pastas, como no
 *  TIA Portal): o diálogo do bloco emite e o editor completo muda de vista. */
type OpenBlockListener = (targetId: string) => void
const openBlockListeners = new Set<OpenBlockListener>()
export function onOpenLadderBlock(fn: OpenBlockListener): () => void {
  openBlockListeners.add(fn)
  return () => { openBlockListeners.delete(fn) }
}
export function emitOpenLadderBlock(targetId: string) {
  for (const fn of openBlockListeners) fn(targetId)
}
