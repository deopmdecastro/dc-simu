import type { ComponentType, LadderCoilType, LadderContact, LadderContactType, LadderRung } from '../types'

/** Tipos de elemento que podem ser inseridos numa network. */
export type PaletteKind =
  | LadderContactType
  | LadderCoilType
  | 'TON'
  | 'TOF'
  | 'TP'
  | 'CTU'
  | 'CTD'
  | 'MOVE'
  | 'COMPARE'
  | 'ADD'
  | 'SUB'
  | 'BRANCH'

/** MIME do arrastar de elementos da paleta Ladder. */
export const LADDER_MIME = 'application/x-dcsimu-ladder'
/** MIME do arrastar de um contato já existente (mover dentro/entre networks). */
export const LADDER_MOVE_MIME = 'application/x-dcsimu-ladder-move'

/** Componente do esquema → elemento Ladder equivalente (arrastar da biblioteca). */
export const COMPONENT_TO_LADDER: Partial<Record<ComponentType, PaletteKind>> = {
  buttonNO: 'NO', buttonNC: 'NC', selector2: 'NO', selector3: 'NO', keySwitch: 'NO',
  footSwitch: 'NO', emergencyButton: 'NC', limitSwitch: 'NO', proximitySensor: 'NO',
  photoSensor: 'NO', pressureSwitch: 'NO', floatSwitch: 'NO', thermostat: 'NO',
  motor1ph: 'COIL', motor3ph: 'COIL', contactor: 'COIL',
  auxRelay: 'COIL', timerRelayTON: 'TON', timerRelayTOF: 'TOF', timerRelayStarDelta: 'TON',
  counterRelay: 'CTU', safetyRelay: 'COIL',
}

/**
 * O HTML5 drag não permite ler os dados durante o `dragover` — guardamos
 * aqui o tipo em arraste para o editor mostrar o indicador de largada certo.
 */
let currentDrag: { kind: PaletteKind } | { move: MovePayload } | null = null
export const setLadderDrag = (v: typeof currentDrag) => {
  currentDrag = v
}
export const getLadderDrag = () => currentDrag

export interface MovePayload {
  rungId: string
  branchId: string
  elementId: string
}

export const isContactKind = (k: PaletteKind): k is LadderContactType => k === 'NO' || k === 'NC' || k === 'RISING' || k === 'FALLING'
export const isCoilKind = (k: PaletteKind): k is LadderCoilType => k === 'COIL' || k === 'SET' || k === 'RESET'
export const isTimerKind = (k: PaletteKind): k is 'TON' | 'TOF' | 'TP' => k === 'TON' || k === 'TOF' || k === 'TP'
export const isCounterKind = (k: PaletteKind): k is 'CTU' | 'CTD' => k === 'CTU' || k === 'CTD'

const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** Próximo endereço livre de um prefixo dentro da network (I1, I2…). */
function nextAddr(rung: LadderRung, prefix: string) {
  const used = new Set<string>()
  rung.branches.forEach((b) => b.elements.forEach((e) => used.add(e.address)))
  rung.coils.forEach((c) => used.add(c.address))
  for (let i = 1; i < 99; i++) if (!used.has(`${prefix}${i}`)) return `${prefix}${i}`
  return `${prefix}1`
}

export type DropTarget =
  | { kind: 'branch'; branchIndex: number; index: number }
  | { kind: 'newBranch' }
  | { kind: 'output' }

/**
 * Aplica um elemento da paleta numa network, na posição indicada.
 * Devolve a network atualizada e o id do elemento criado (para selecionar).
 */
export function applyKind(rung: LadderRung, kind: PaletteKind, target: DropTarget = { kind: 'output' }): { rung: LadderRung; created?: { type: 'contact'; branchId: string; elementId: string } | { type: 'coil'; coilId: string } | { type: 'timer' } | { type: 'counter' } } {
  if (kind === 'BRANCH') {
    return { rung: { ...rung, branches: [...rung.branches, { id: uid(`${rung.id}-b`), elements: [] }] } }
  }
  if (isContactKind(kind)) {
    const el: LadderContact = { kind: 'contact', id: uid(`${rung.id}-c`), address: nextAddr(rung, 'I'), contactType: kind }
    let branches = rung.branches.length ? [...rung.branches] : [{ id: `${rung.id}-b0`, elements: [] }]
    let bi = 0
    let idx = branches[0].elements.length
    if (target.kind === 'newBranch') {
      branches = [...branches, { id: uid(`${rung.id}-b`), elements: [] }]
      bi = branches.length - 1
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
    return { rung: { ...rung, coils: [...rung.coils, { kind: 'coil', id: coilId, address: nextAddr(rung, 'Q'), coilType: kind }] }, created: { type: 'coil', coilId } }
  }
  if (isTimerKind(kind)) {
    return {
      rung: { ...rung, timer: { kind: 'timer', id: rung.timer?.id ?? `${rung.id}-t`, address: rung.timer?.address ?? 'T1', timerType: kind, presetMs: rung.timer?.presetMs ?? 3000, preset2Ms: rung.timer?.preset2Ms ?? 50 } },
      created: { type: 'timer' },
    }
  }
  if (isCounterKind(kind)) {
    return {
      rung: { ...rung, counter: { kind: 'counter', id: rung.counter?.id ?? `${rung.id}-n`, address: rung.counter?.address ?? 'C1', counterType: kind, preset: rung.counter?.preset ?? 5, resetAddress: rung.counter?.resetAddress ?? 'M9' } },
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
    branches = [...branches, { id: uid(`${rung.id}-b`), elements: [] }]
    bi = branches.length - 1
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
