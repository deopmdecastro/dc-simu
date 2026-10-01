import { useEffect, useMemo, useRef, useState } from 'react'
import { useSimStore } from '../store/useSimStore'
import { meterBridgeFor, meterInputFor } from '../electrical/meterModel'
import type { ElectricalComponent } from '../types'
import { EMPTY_METER_INPUT, mergeVars, multimeterReading, runControlActions, selectorStep, setSelector, type MeterReading, type Vars } from './behavior'
import type { ComponentDefinition, ControlDef } from './types'

export type ControlGesture = 'press' | 'long' | { select: string } | { step: 1 | -1 }

const timers = new Map<string, number[]>()

/** Aplica o gesto de um botão/seletor a um componente do simulador (variáveis, estado, ponte de corrente). */
export function triggerControl(def: ComponentDefinition, componentId: string, control: ControlDef, gesture: ControlGesture) {
  const store = useSimStore.getState()
  const live = store.components.find((item) => item.id === componentId)
  if (!live) return
  let vars: Vars = mergeVars(def, live.state?.catalogVars as Vars | undefined)
  let state = String(live.state?.catalogState ?? def.initialState)
  const delayed: Array<{ state: string; afterMs: number }> = []
  if (control.kind === 'selector') {
    const target = typeof gesture === 'object' && 'select' in gesture ? gesture.select : selectorStep(control, vars, typeof gesture === 'object' && 'step' in gesture ? gesture.step : 1)
    if (!target) return
    vars = setSelector(control, vars, target)
  } else {
    const actions = gesture === 'long' && control.longActions?.length ? control.longActions : control.actions
    const result = runControlActions(actions, vars, state)
    vars = result.vars; state = result.state; delayed.push(...result.delayed)
  }
  const bridge = meterBridgeFor(def, live, vars)
  store.setComponentState(componentId, { catalogVars: vars, catalogState: state, meterBridge: bridge })
  const list = timers.get(componentId) ?? []
  for (const action of delayed) list.push(window.setTimeout(() => useSimStore.getState().setComponentState(componentId, { catalogState: action.state }), Math.max(0, action.afterMs)))
  timers.set(componentId, list)
}

/** Variáveis e leitura do multímetro de uma instância (atualiza ~4×/s; HOLD congela a leitura). */
export function useCatalogMeter(component: ElectricalComponent | undefined, def: ComponentDefinition | undefined): { vars: Vars; reading: MeterReading | null } {
  const components = useSimStore((s) => s.components)
  const wires = useSimStore((s) => s.wires)
  const energized = useSimStore((s) => s.runtime.energizedTerminals)
  const stored = component?.state?.catalogVars as Vars | undefined
  const vars = useMemo(() => (def ? mergeVars(def, stored) : {}), [def, stored])
  const isMeter = def?.behavior?.type === 'multimeter'
  const [noise, setNoise] = useState(0)
  useEffect(() => {
    if (!isMeter) return
    const id = window.setInterval(() => setNoise(Math.random() * 2 - 1), 250)
    return () => window.clearInterval(id)
  }, [isMeter])
  const frozen = useRef<MeterReading | null>(null)
  const reading = useMemo(() => {
    if (!def || !component || !isMeter) return null
    const input = meterInputFor(def, component, components, wires, energized, vars)
    const live = multimeterReading(vars, input, noise)
    if (vars.hold && live.on) { frozen.current = frozen.current ?? live; return { ...frozen.current, hold: true, backlight: live.backlight, beep: false } }
    frozen.current = null
    return live
  }, [def, component, components, wires, energized, vars, noise, isMeter])
  return { vars, reading }
}
export { EMPTY_METER_INPUT }
