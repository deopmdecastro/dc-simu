import { createComponent, terminalByLabel } from '../electrical/factory'
import type { ElectricalComponent, Wire } from '../types'
import { componentPanelXY, panelToSchematicX, panelToSchematicY } from '../three/panelLayout'

export const NATIVE_PARTIDA_ID = 'native-partida-direta-v5'
export const NATIVE_MOTOR_METER_FEATURE = 'motor-voltage-meter-v1'
export const NATIVE_MOTOR_DOUBLE_FERRULE_FEATURE = 'motor-meter-double-ferrule-v1'

/** Só os cabos de alimentação que partilham o borne com as sondas recebem colar duplo. */
export function withMotorMeterFerrules(wires: Wire[], leads: Wire[]): Wire[] {
  const terminals = new Set(leads.map(wire => wire.toTerminalId))
  return wires.map(wire => {
    if (leads.some(lead => lead.id === wire.id)) return wire
    const from = terminals.has(wire.fromTerminalId) && !wire.fromPoint
    const to = terminals.has(wire.toTerminalId) && !wire.toPoint
    return from || to ? { ...wire, ...(from ? { fromEndType: 'ferruleDouble' as const } : {}), ...(to ? { toEndType: 'ferruleDouble' as const } : {}) } : wire
  })
}

export function buildNativeMotorMeter(motor: ElectricalComponent): { meter: ElectricalComponent; leads: Wire[] } {
  const center = componentPanelXY(motor)
  const meter = createComponent('multimeterDm20', 'MM1', 'Tensão na entrada do motor · U1–V1')
  meter.id = 'native-mm1'
  meter.schematicX = Math.round(panelToSchematicX(center.x + 2.4) - meter.w / 2)
  meter.schematicY = Math.round(panelToSchematicY(center.y + 0.35) - meter.h / 2)
  meter.terminals = meter.terminals.map(t => ({ ...t, componentId: meter.id, id: `${meter.id}-${t.label}` }))
  meter.state = { ...meter.state, catalogVars: { dial: 'acv', hold: false, cont: false, light: true, sleep: '' } }
  const leads = ([['red', 'VΩ', 'U1', '#dc2626'], ['black', 'COM', 'V1', '#111827']] as const).map(([color, jack, motorTerminal, ink]): Wire => ({
    id: `native-meter-${color}`, number: color === 'red' ? 'MM+' : 'MM−',
    fromTerminalId: terminalByLabel(meter, jack)!.id, toTerminalId: terminalByLabel(motor, motorTerminal)!.id,
    color, gauge: '0.75mm²', flexibility: 'flexible', kind: 'signal',
    endType: 'probe', fromEndType: 'banana', toEndType: 'probe', fromEndColor: ink, toEndColor: ink,
    fromEndLayer: 'front', toEndLayer: 'front', route: 'orthogonal', bend: 0.5, curveOffset: 0, energized: false,
  }))
  return { meter, leads }
}

/** Atualização aditiva do nativo já guardado; preserva todas as edições existentes.
 * A marca impede repor o aparelho se o utilizador o eliminar mais tarde. */
export function upgradeNativeMotorMeter<T extends Record<string, any>>(content: T): T {
  if (content.nativeId !== NATIVE_PARTIDA_ID || !Array.isArray(content.components) || !Array.isArray(content.wires)) return content
  const features: string[] = Array.isArray(content.nativeFeatures) ? content.nativeFeatures.filter((v: unknown) => typeof v === 'string') : []
  if (features.includes(NATIVE_MOTOR_METER_FEATURE)) {
    if (features.includes(NATIVE_MOTOR_DOUBLE_FERRULE_FEATURE)) return content
    const leads = content.wires.filter((w: Wire) => ['native-meter-red', 'native-meter-black'].includes(w.id) && w.toEndType === 'probe' && !w.toPoint)
    return { ...content, wires: withMotorMeterFerrules(content.wires, leads), nativeFeatures: [...features, NATIVE_MOTOR_DOUBLE_FERRULE_FEATURE] }
  }
  const motor = content.components.find((c: ElectricalComponent) => c.id === 'native-m1' && c.type === 'motor3ph')
  if (!motor || !terminalByLabel(motor, 'U1') || !terminalByLabel(motor, 'V1')) return content
  if (content.components.some((c: ElectricalComponent) => c.id === 'native-mm1')) return upgradeNativeMotorMeter({ ...content, nativeFeatures: [...features, NATIVE_MOTOR_METER_FEATURE] })
  const { meter, leads } = buildNativeMotorMeter(motor)
  const refs = new Set(content.components.map((c: ElectricalComponent) => c.ref.toUpperCase()))
  let index = 1
  while (refs.has(`MM${index}`)) index++
  meter.ref = `MM${index}`
  return { ...content, components: [...content.components, meter], wires: [...withMotorMeterFerrules(content.wires, leads), ...leads], nativeFeatures: [...features, NATIVE_MOTOR_METER_FEATURE, NATIVE_MOTOR_DOUBLE_FERRULE_FEATURE] }
}
