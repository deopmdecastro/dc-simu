import { nextCatalogState } from './interactions'
import type { BehaviorEvent, ComponentDefinition, ControlAction, ControlDef, VarDef, VarValue, WhenDef } from './types'

/** Valores das variáveis de uma instância (botões, seletores, estados internos do multímetro…). */
export type Vars = Record<string, VarValue>

/* ------------------------------------------------------------------ variáveis */

export type DialMode = 'off' | 'dcv' | 'acv' | 'ohm' | 'ma' | 'a10'
export const DIAL_MODES: Array<[DialMode, string]> = [['off', 'OFF'], ['dcv', 'V ⎓'], ['acv', 'V ~'], ['ohm', 'Ω'], ['ma', 'mA'], ['a10', '10 A']]

/** Variáveis usadas pelo comportamento «multímetro». */
export const MULTIMETER_VARS: VarDef[] = [
  { id: 'dial', name: 'Posição do seletor', type: 'text', initial: 'dcv' },
  { id: 'cont', name: 'Continuidade (Ω)', type: 'bool', initial: false },
  { id: 'hold', name: 'HOLD', type: 'bool', initial: false },
  { id: 'light', name: 'Retroiluminação', type: 'bool', initial: false },
  { id: 'sleep', name: 'Desligado pelo botão OFF (guarda a posição)', type: 'text', initial: '' },
]

export function varDefsOf(def: ComponentDefinition): VarDef[] {
  const list = [...(def.vars ?? [])]
  if (def.behavior?.type === 'multimeter') for (const item of MULTIMETER_VARS) if (!list.some((entry) => entry.id === item.id)) list.push(item)
  return list
}

export function initialVars(def: ComponentDefinition): Vars {
  const vars: Vars = {}
  for (const item of varDefsOf(def)) vars[item.id] = item.initial
  for (const control of def.controls ?? []) {
    if (control.kind === 'selector' && control.bindVar) {
      const first = control.positions[0]
      if (first && vars[control.bindVar] === undefined) vars[control.bindVar] = first.id
    }
  }
  return vars
}

/** Junta valores guardados com os valores iniciais (variáveis novas numa versão nova). */
export const mergeVars = (def: ComponentDefinition, stored: Vars | undefined): Vars => ({ ...initialVars(def), ...(stored ?? {}) })

export function evalWhen(when: WhenDef | undefined, vars: Vars): boolean {
  if (!when || !when.var) return false
  const current = vars[when.var]
  const expected = when.value === undefined ? true : when.value
  const equal = typeof expected === 'boolean' ? Boolean(current) === expected && current !== 'false' : String(current ?? '') === String(expected)
  return when.op === 'ne' ? !equal : equal
}

/* ----------------------------------------------------------- ações dos controlos */

export interface ControlResult { vars: Vars; state: string; delayed: Array<{ state: string; afterMs: number }>; changed: boolean }

export function multimeterEvent(vars: Vars, event: BehaviorEvent): Vars {
  const next = { ...vars }
  const dial = String(vars.dial ?? 'off')
  switch (event) {
    case 'select': if (dial === 'ohm') next.cont = !vars.cont; break
    case 'hold': next.hold = !vars.hold; break
    case 'light': next.light = !vars.light; break
    case 'power': next.sleep = vars.sleep === dial ? '' : dial; break
  }
  return next
}

export function runControlActions(actions: ControlAction[], vars: Vars, state: string): ControlResult {
  let current = { ...vars }
  let nextState = state
  const delayed: ControlResult['delayed'] = []
  for (const action of actions) {
    switch (action.type) {
      case 'setVar': current[action.var] = action.value; break
      case 'toggleVar': current[action.var] = !current[action.var]; break
      case 'cycleVar': {
        if (!action.values.length) break
        const index = action.values.findIndex((value) => String(value) === String(current[action.var]))
        current[action.var] = action.values[(index + 1) % action.values.length]
        break
      }
      case 'behavior': current = multimeterEvent(current, action.event); break
      case 'delayedState': delayed.push({ state: action.state, afterMs: action.afterMs }); break
      default: { const next = nextCatalogState(action, nextState); if (next) nextState = next }
    }
  }
  const changed = nextState !== state || JSON.stringify(current) !== JSON.stringify(vars)
  return { vars: current, state: nextState, delayed, changed }
}

/** Seletor: escolhe a posição `positionId` (ou a seguinte/anterior). */
export function selectorStep(control: ControlDef, vars: Vars, delta: 1 | -1): string | null {
  if (!control.positions.length) return null
  const current = control.bindVar ? String(vars[control.bindVar] ?? control.positions[0].id) : control.positions[0].id
  const index = Math.max(0, control.positions.findIndex((item) => item.id === current))
  const next = (index + delta + control.positions.length) % control.positions.length
  return control.positions[next].id
}

export function setSelector(control: ControlDef, vars: Vars, positionId: string): Vars {
  if (!control.bindVar) return vars
  const next = { ...vars, [control.bindVar]: positionId }
  // acordar o multímetro ao rodar o seletor
  if (next.sleep !== undefined && next.sleep !== '') next.sleep = ''
  return next
}

/** Posição atual de um seletor (id), a partir das variáveis. */
export function selectorValue(control: ControlDef, vars: Vars): string {
  return control.bindVar ? String(vars[control.bindVar] ?? control.positions[0]?.id ?? '') : control.positions[0]?.id ?? ''
}

/** Estado visual de um botão/interruptor: premido ou ligado (variável do primeiro toggleVar/setVar). */
export function toggleIsOn(control: ControlDef, vars: Vars): boolean {
  for (const action of control.actions) {
    if (action.type === 'toggleVar') return Boolean(vars[action.var])
    if (action.type === 'behavior') return action.event === 'hold' ? Boolean(vars.hold) : action.event === 'light' ? Boolean(vars.light) : action.event === 'power' ? vars.sleep === vars.dial && vars.sleep !== '' : false
  }
  return false
}

/* ------------------------------------------------------------------- multímetro */

/** O que o circuito entrega ao multímetro (ou os valores de teste no editor). */
export interface MeterInput {
  /** Tensão CC entre COM e V (assinada) e CA eficaz. */
  vdc: number
  vac: number
  /** Resistência entre COM e V (Ω); null = circuito aberto. */
  ohm: number | null
  /** Corrente em série (mA e A). */
  ma: number
  amp: number
  /** Fichas com ponta ligada. */
  leads: { com: boolean; volt: boolean; ma: boolean; amp: boolean }
  /** Há tensão entre as pontas (aviso ao medir Ω). */
  live?: boolean
}

export const EMPTY_METER_INPUT: MeterInput = { vdc: 0, vac: 0, ohm: null, ma: 0, amp: 0, leads: { com: true, volt: true, ma: false, amp: false } }

export interface MeterReading {
  on: boolean
  /** Texto dos dígitos («12.34», «OL»). */
  text: string
  negative: boolean
  /** Unidade impressa (V, mV, Ω, kΩ, MΩ, mA, A). */
  unit: string
  dc: boolean
  ac: boolean
  auto: boolean
  hold: boolean
  continuity: boolean
  beep: boolean
  backlight: boolean
  battery: boolean
  warning?: string
  /** Quantidade em medição (para a interface). */
  quantity: string
}

/** Formato do exemplo: ≥100 → 1 casa, ≥10 → 2 casas, senão 3. */
export function formatDigits(value: number): string {
  const abs = Math.abs(value)
  return abs >= 100 ? abs.toFixed(1) : abs >= 10 ? abs.toFixed(2) : abs.toFixed(3)
}

const REQUIRED_JACK: Record<DialMode, 'volt' | 'ma' | 'amp' | null> = { off: null, dcv: 'volt', acv: 'volt', ohm: 'volt', ma: 'ma', a10: 'amp' }
const JACK_NAME = { volt: 'V/Ω', ma: 'mA', amp: '10 A', com: 'COM' }
const BLANK: MeterReading = { on: false, text: '', negative: false, unit: '', dc: false, ac: false, auto: false, hold: false, continuity: false, beep: false, backlight: false, battery: false, quantity: 'Desligado' }

/**
 * Leitura do multímetro. `noise` ∈ [−1, 1] dá o tremor das últimas casas (como num instrumento real).
 * Em HOLD o chamador deve reutilizar a leitura congelada (ver `ComponentRig`).
 */
export function multimeterReading(vars: Vars, input: MeterInput, noise = 0): MeterReading {
  const dial = (String(vars.dial ?? 'off') in REQUIRED_JACK ? String(vars.dial) : 'off') as DialMode
  const asleep = vars.sleep !== undefined && vars.sleep !== '' && vars.sleep === dial
  const backlight = Boolean(vars.light)
  if (dial === 'off' || asleep) return { ...BLANK, backlight: false }
  const base: MeterReading = { ...BLANK, on: true, auto: dial === 'dcv' || dial === 'acv' || dial === 'ohm', hold: Boolean(vars.hold), backlight, quantity: '' }
  const jitter = (value: number, floor: number) => (Math.abs(value) < 1e-9 ? noise * floor : value * (1 + noise * 0.0006))

  const required = REQUIRED_JACK[dial]
  const wrongJack = (['volt', 'ma', 'amp'] as const).filter((jack) => jack !== required && input.leads[jack])
  let warning: string | undefined
  if (wrongJack.length && required) warning = `Ponta na ficha ${JACK_NAME[wrongJack[0]]}, mas o seletor pede a ficha ${JACK_NAME[required]}.`
  else if (required && !input.leads[required]) warning = `Ligue a ponta à ficha ${JACK_NAME[required]}.`
  if (!input.leads.com && !warning) warning = 'Falta a ponta preta na ficha COM.'

  if (dial === 'dcv') {
    const value = warning ? 0 : jitter(input.vdc, 0.002)
    return { ...base, dc: true, text: formatDigits(value), negative: value < -0.0005, unit: 'V', quantity: 'Tensão contínua', warning }
  }
  if (dial === 'acv') {
    const value = warning ? 0 : Math.max(0, jitter(input.vac, 0.003))
    return { ...base, ac: true, text: formatDigits(value), unit: 'V', quantity: 'Tensão alternada', warning }
  }
  if (dial === 'ma' || dial === 'a10') {
    const amps = dial === 'ma' ? input.ma : input.amp
    const value = warning ? 0 : jitter(amps, dial === 'ma' ? 0.003 : 0.002)
    return { ...base, dc: true, text: formatDigits(value), negative: value < -0.0005, unit: dial === 'ma' ? 'mA' : 'A', quantity: dial === 'ma' ? 'Corrente (mA)' : 'Corrente (até 10 A)', warning }
  }
  // Ω / continuidade
  const live = input.live && !warning
  if (live) warning = 'Circuito sob tensão: meça resistência com o circuito desligado.'
  const continuity = Boolean(vars.cont)
  const ohm = warning ? null : input.ohm
  let text = 'OL'
  let unit = continuity ? 'Ω' : 'Ω'
  let beep = false
  if (ohm !== null && ohm < 6e7) {
    const shown = ohm >= 1e6 ? ohm / 1e6 : ohm >= 1e3 ? ohm / 1e3 : ohm
    unit = ohm >= 1e6 ? 'MΩ' : ohm >= 1e3 ? 'kΩ' : 'Ω'
    if (continuity) { if (ohm < 50) { text = formatDigits(jitter(ohm, 0.02)); unit = 'Ω'; beep = true } }
    else text = formatDigits(jitter(shown, 0.002))
  }
  return { ...base, text, unit, continuity, beep, quantity: continuity ? 'Continuidade' : 'Resistência', warning }
}
