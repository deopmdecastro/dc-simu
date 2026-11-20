import { builtinRuntimeType } from '../electrical/builtinRuntime'
import { micoProfile, micoChannelVars, micoStateFromVars } from '../electrical/industrialDevices'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSimStore } from '../store/useSimStore'
import { isManobraAllowed } from '../store/manobra'
import { meterBridgeFor, meterInputFor } from '../electrical/meterModel'
import type { ElectricalComponent } from '../types'
import { EMPTY_METER_INPUT, initialVars, industrialRotaryActions, isSpringReturn, mergeVars, multimeterReading, runControlActions, selectorStep, setSelector, springHold, type MeterReading, type Vars } from './behavior'
import type { ComponentDefinition, ControlDef } from './types'

/** `down`/`up`: premir e largar um botão com mola (`returnMode: 'spring'`). */
export type ControlGesture = 'press' | 'long' | 'down' | 'up' | { select: string } | { step: 1 | -1 }

/** Duração do impulso quando um botão com mola é acionado por clique simples (inspetor, teclado). */
export const SPRING_PULSE_MS = 250

const timers = new Map<string, number[]>()

/** Aplica o gesto de um botão/seletor a um componente do simulador (variáveis, estado, ponte de corrente). */
export function triggerControl(
  def: ComponentDefinition,
  componentId: string,
  control: ControlDef,
  gesture: ControlGesture,
) {
  const store = useSimStore.getState()
  if (!isManobraAllowed(store)) return
  const live = store.components.find((item) => item.id === componentId)
  if (!live) return
  const industrial=builtinRuntimeType(live)
  let vars: Vars = {...mergeVars(def, live.state?.catalogVars as Vars | undefined),...(industrial?Object.fromEntries(Object.entries(live.state).filter(([k,v])=>!k.startsWith('$')&&['boolean','string','number'].includes(typeof v))):{})}
  if(industrial)vars={...vars,...micoChannelVars(industrial,live.state)}
  let state = String(live.state?.catalogState ?? def.initialState)
  const delayed: Array<{ state: string; afterMs: number }> = []
  const rotary=typeof gesture==='object'&&'step' in gesture?industrialRotaryActions(control,gesture.step):null
  if(rotary){const result=runControlActions(rotary,vars,state);vars=result.vars;state=result.state}
  else if (control.kind === 'selector') {
    const target = typeof gesture === 'object' && 'select' in gesture ? gesture.select : selectorStep(control, vars, typeof gesture === 'object' && 'step' in gesture ? gesture.step : 1)
    if (!target) return
    vars = setSelector(control, vars, target)
  } else if (isSpringReturn(control)) {
    // Mola: ativo só enquanto premido. Um clique simples gera um impulso curto.
    if (gesture === 'press' || gesture === 'long') {
      triggerControl(def, componentId, control, 'down')
      window.setTimeout(() => triggerControl(def, componentId, control, 'up'), SPRING_PULSE_MS)
      return
    }
    if (gesture !== 'down' && gesture !== 'up') return
    const result = springHold(control, vars, state, gesture === 'down', initialVars(def))
    vars = result.vars; state = result.state; delayed.push(...result.delayed)
  } else {
    if (gesture === 'down' || gesture === 'up') return
    const actions = gesture === 'long' && control.longActions?.length ? control.longActions : control.actions
    const result = runControlActions(actions, vars, state)
    vars = result.vars; state = result.state; delayed.push(...result.delayed)
  }
  const bridge = meterBridgeFor(def, live, vars)
  const dm20Sync = live.type === 'multimeterDm20'
    ? { selector: String(vars.dial ?? 'off'), hold: Boolean(vars.hold), backlight: Boolean(vars.light) }
    : {}
  const industrialSync=industrial?{...Object.fromEntries(Object.entries(vars).filter(([k])=>!k.startsWith('$')&&k!=='industrialOrigin'&&k!=='builtinOrigin')),...(micoProfile(industrial)?micoStateFromVars(industrial,vars):{})}:{}
  store.operateComponent(componentId, { ...industrialSync, ...dm20Sync, catalogVars: vars, catalogState: state, meterBridge: bridge })
  const list = timers.get(componentId) ?? []
  for (const action of delayed) list.push(window.setTimeout(() => useSimStore.getState().operateComponent(componentId, { catalogState: action.state }), Math.max(0, action.afterMs)))
  timers.set(componentId, list)
}

/** Variáveis e leitura do multímetro de uma instância (atualiza ~4×/s; HOLD congela a leitura). */
export function useCatalogMeter(component: ElectricalComponent | undefined, def: ComponentDefinition | undefined): { vars: Vars; reading: MeterReading | null } {
  const components = useSimStore((s) => s.components)
  const wires = useSimStore((s) => s.wires)
  const energized = useSimStore((s) => s.runtime.energizedTerminals)
  const runState = useSimStore((s) => s.sim.runState)
  const stored = component?.state?.catalogVars as Vars | undefined
  const physicalSignature=component&&builtinRuntimeType(component)?JSON.stringify({...Object.fromEntries(Object.entries(component.state).filter(([,v])=>['boolean','string','number'].includes(typeof v))),...micoChannelVars(builtinRuntimeType(component)!,component.state)}):''
  const legacyDial = typeof component?.state?.selector === 'string' && component.state.selector !== 'off' ? component.state.selector : undefined
  const legacyHold = component?.state?.hold === true ? true : undefined
  const legacyLight = component?.state?.backlight === true ? true : undefined
  const vars = useMemo(() => {
    if (!def) return {}
    const merged = mergeVars(def, stored)
    if (!stored && (legacyDial || legacyHold || legacyLight)) {
      return {
        ...merged,
        ...(legacyDial ? { dial: legacyDial } : {}),
        ...(legacyHold ? { hold: true } : {}),
        ...(legacyLight ? { light: true } : {}),
      }
    }
    return component&&builtinRuntimeType(component)?{...merged,...Object.fromEntries(Object.entries(component.state).filter(([,v])=>['boolean','string','number'].includes(typeof v))),...micoChannelVars(builtinRuntimeType(component)!,component.state)}:merged
  }, [def, stored, legacyDial, legacyHold, legacyLight, physicalSignature])
  const isMeter = def?.behavior?.type === 'multimeter'
  const [noise, setNoise] = useState(0)
  useEffect(() => {
    if (!isMeter || runState === 'stopped') return
    const id = window.setInterval(() => setNoise(Math.random() * 2 - 1), 250)
    return () => window.clearInterval(id)
  }, [isMeter, runState])
  const frozen = useRef<MeterReading | null>(null)
  const reading = useMemo(() => {
    if (!def || !component || !isMeter) return null
    const input = meterInputFor(def, component, components, wires, energized, vars)
    const live = multimeterReading(vars, input, noise)
    if (runState === 'stopped') {
      frozen.current = null
      return { ...live, on: false, backlight: false, beep: false }
    }
    if (vars.hold && live.on) { frozen.current = frozen.current ?? live; return { ...frozen.current, hold: true, backlight: live.backlight, beep: false } }
    frozen.current = null
    return live
  }, [def, component, components, wires, energized, vars, noise, isMeter, runState])
  return { vars, reading }
}
export { EMPTY_METER_INPUT }
