// ============================================================================
// Motor Ladder (DC-Simu v2) — executa um ciclo de varredura (scan) real:
// lê a tabela de endereços (I*/Q*/M*/T*/C*), avalia rungs de cima para baixo e
// da esquerda para a direita, e escreve bobinas / temporizadores / contadores.
//
// Blocos suportados:
//   contatos  NO, NC, RISING (P), FALLING (N)
//   bobinas   COIL, SET, RESET
//   timers    TON, TOF, TP, STAR_DELTA (estrela→triângulo com tempo de transição)
//   contadores CTU (crescente), CTD (decrescente) com preset e reset
// ============================================================================

import type { LadderProgram, LadderRung, LadderBranch, LadderContact } from '../types'

export type AddressTable = Record<string, boolean>
export interface TimerValue { elapsedMs: number; presetMs: number; done: boolean; running: boolean; transitionMs?: number; starDone?: boolean; deltaDone?: boolean }
export type TimerTable = Record<string, TimerValue>
export interface CounterValue { count: number; preset: number; done: boolean; prevPulse: boolean }
export type CounterTable = Record<string, CounterValue>

function evalContact(el: LadderContact, table: AddressTable): boolean {
  const v = !!table[el.address]
  switch (el.contactType) {
    case 'NO':
      return v
    case 'NC':
      return !v
    case 'RISING': {
      const prev = !!el.prevValue
      el.prevValue = v
      return v && !prev
    }
    case 'FALLING': {
      const prev = !!el.prevValue
      el.prevValue = v
      return !v && prev
    }
  }
}

function evalBranch(branch: LadderBranch, table: AddressTable): boolean {
  return branch.elements.every((el) => evalContact(el, table))
}

function evalRung(rung: LadderRung, table: AddressTable): boolean {
  // um rung sem contatos (branches vazias) é considerado "sempre verdadeiro"
  // apenas quando explicitamente montado assim pelo usuário com 1 branch vazia
  if (!rung.enabled) return false
  if (rung.branches.length === 0) return false
  const anyEmpty = rung.branches.some((b) => b.elements.length === 0)
  if (anyEmpty) return true
  return rung.branches.some((b) => evalBranch(b, table))
}

export interface ScanResult {
  table: AddressTable
  rungPowered: Record<string, boolean>
  timers: TimerTable
  counters: CounterTable
}

/** Executa um ciclo de varredura completo do programa. dtMs = tempo simulado desde o último scan. */
export function runScan(
  program: LadderProgram,
  table: AddressTable,
  timers: TimerTable,
  counters: CounterTable,
  dtMs: number,
): ScanResult {
  const rungPowered: Record<string, boolean> = {}

  for (const rung of program.rungs) {
    const powered = evalRung(rung, table)
    rungPowered[rung.id] = powered

    // ---------------- temporizador do rung ----------------
    if (rung.timer) {
      const addr = rung.timer.address
      if (!timers[addr]) timers[addr] = { elapsedMs: 0, presetMs: rung.timer.presetMs, done: false, running: false }
      const tv = timers[addr]
      tv.presetMs = rung.timer.presetMs
      switch (rung.timer.timerType) {
        case 'TON': {
          if (powered) {
            tv.running = true
            tv.elapsedMs = Math.min(tv.presetMs, tv.elapsedMs + dtMs)
            tv.done = tv.elapsedMs >= tv.presetMs
          } else {
            tv.running = false
            tv.elapsedMs = 0
            tv.done = false
          }
          break
        }
        case 'TOF': {
          if (powered) {
            tv.done = true
            tv.elapsedMs = 0
            tv.running = false
          } else if (tv.done) {
            tv.running = true
            tv.elapsedMs = Math.min(tv.presetMs, tv.elapsedMs + dtMs)
            if (tv.elapsedMs >= tv.presetMs) {
              tv.done = false
              tv.running = false
            }
          }
          break
        }
        case 'TP': {
          if (powered && !tv.running && !tv.done && tv.elapsedMs === 0) {
            tv.running = true
          }
          if (tv.running) {
            tv.elapsedMs = Math.min(tv.presetMs, tv.elapsedMs + dtMs)
            tv.done = tv.elapsedMs > 0
            if (tv.elapsedMs >= tv.presetMs) {
              tv.running = false
              tv.done = false
              tv.elapsedMs = 0
            }
          }
          break
        }
        case 'STAR_DELTA': {
          const trans = rung.timer.preset2Ms ?? 50
          if (powered) {
            tv.elapsedMs = Math.min(tv.presetMs, tv.elapsedMs + dtMs)
            tv.starDone = tv.elapsedMs >= tv.presetMs
            tv.deltaDone = tv.starDone && tv.elapsedMs >= tv.presetMs + trans
            tv.done = tv.starDone
            tv.running = !tv.deltaDone
          } else {
            tv.elapsedMs = 0
            tv.starDone = false
            tv.deltaDone = false
            tv.done = false
            tv.running = false
          }
          break
        }
      }
      table[addr] = !!tv.done
    }

    // ---------------- contador do rung ----------------
    if (rung.counter) {
      const addr = rung.counter.address
      if (!counters[addr]) counters[addr] = { count: 0, preset: rung.counter.preset, done: false, prevPulse: false }
      const cv = counters[addr]
      cv.preset = rung.counter.preset
      const pulse = powered && !cv.prevPulse
      cv.prevPulse = powered
      if (pulse) {
        if (rung.counter.counterType === 'CTU') cv.count = Math.min(cv.preset, cv.count + 1)
        else cv.count = Math.max(0, cv.count - 1)
      }
      const resetAddr = rung.counter.resetAddress
      if (resetAddr && table[resetAddr]) {
        cv.count = rung.counter.counterType === 'CTD' ? cv.preset : 0
      }
      cv.done = rung.counter.counterType === 'CTU' ? cv.count >= cv.preset : cv.count <= 0
      table[addr] = cv.done
    }

    // ---------------- bobinas ----------------
    for (const coil of rung.coils) {
      switch (coil.coilType) {
        case 'COIL':
          table[coil.address] = powered
          break
        case 'SET':
          if (powered) table[coil.address] = true
          break
        case 'RESET':
          if (powered) table[coil.address] = false
          break
      }
    }
  }

  return { table, rungPowered, timers, counters }
}

/** Cria a tabela inicial de endereços a partir dos blocos de I/O declarados. */
export function emptyTable(inputs: number, outputs: number, memories = 16, timers = 8, counters = 4): AddressTable {
  const table: AddressTable = {}
  for (let i = 1; i <= inputs; i++) table[`I${i}`] = false
  for (let q = 1; q <= outputs; q++) table[`Q${q}`] = false
  for (let m = 1; m <= memories; m++) table[`M${m}`] = false
  for (let tt = 1; tt <= timers; tt++) table[`T${tt}`] = false
  for (let cc = 1; cc <= counters; cc++) table[`C${cc}`] = false
  return table
}

/** Verifica se um endereço é válido para a sintaxe aceita (I/Q/M/T/C + número). */
export function isValidAddress(addr: string): boolean {
  return /^[IQMTC]\d{1,2}$/.test(addr.trim().toUpperCase())
}

/** Sugere o próximo endereço livre de uma família (I, Q, M, T, C). */
export function nextAddress(prefix: 'I' | 'Q' | 'M' | 'T' | 'C', table: AddressTable): string {
  const nums = Object.keys(table)
    .filter((k) => k.startsWith(prefix))
    .map((k) => Number(k.slice(1)))
    .filter((n) => !Number.isNaN(n))
  return `${prefix}${(nums.length ? Math.max(...nums) : 0) + 1}`
}
