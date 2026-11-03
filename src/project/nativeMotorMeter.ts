import { createComponent, terminalByLabel } from '../electrical/factory'
import type { ElectricalComponent, Wire } from '../types'
import { isSharedFerruleCandidate, wireSideEndType } from '../electrical/sharedFerrules'
import { componentPanelXY, panelToSchematicX, panelToSchematicY } from '../three/panelLayout'

export const NATIVE_PARTIDA_ID = 'native-partida-direta-v5'
export const NATIVE_MOTOR_METER_FEATURE = 'motor-voltage-meter-v1'
export const NATIVE_MOTOR_DOUBLE_FERRULE_FEATURE = 'motor-meter-double-ferrule-v1'
/** Curvas dos cabos 3D refeitas (arcos sem cantos vivos): repõe o traçado de origem dos cabos nativos. */
export const NATIVE_WIRE_CURVES_FEATURE = 'wire-curves-v7'
/** Relé térmico F1 acrescentado ao nativo (ver `nativeThermalRelay.ts`). */
export const NATIVE_THERMAL_FEATURE = 'thermal-relay-v1'
/** F1 encaixado por baixo do KM1 (sem os cabos KM1 → F1). */
export const NATIVE_THERMAL_MOUNT_FEATURE = 'thermal-relay-mounted-v1'
/** Bobina AC do KM1 comutada pela fase do comando (corrige a cablagem anterior a c3df70f). */
export const NATIVE_COIL_AC_FEATURE = 'coil-ac-v1'
/** Sinal do relé térmico F1 no LOGO! (I0.3), H3 EMERGÊNCIA (Q0.3) e H2 PARADO laranja (v2: cabo a cabo e programa efetivo do PLC). */
export const NATIVE_SIGNALS_FEATURE = 'signals-v2'

/** Só os cabos de alimentação que partilham o borne com as sondas recebem colar duplo. */
export function withMotorMeterFerrules(wires: Wire[], leads: Wire[]): Wire[] {
  const terminals = new Set(leads.map(wire => wire.toTerminalId))
  return wires.map(wire => {
    if (leads.some(lead => lead.id === wire.id)) return wire
    const from = terminals.has(wire.fromTerminalId) && isSharedFerruleCandidate(wire.fromTerminalId, Boolean(wire.fromPoint), wireSideEndType(wire, 'from'))
    const to = terminals.has(wire.toTerminalId) && isSharedFerruleCandidate(wire.toTerminalId, Boolean(wire.toPoint), wireSideEndType(wire, 'to'))
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

/** Corrige apenas a regressão conhecida nos dois alimentadores originais: não
 * recria cabos apagados nem altera ligações personalizadas ou outros projetos. */
export const NATIVE_MOTOR_RING_FEATURE = 'motor-ring-lugs-v1'
export function upgradeNativeMotorRings<T extends Record<string, any>>(content: T): T {
  if (content.nativeId !== NATIVE_PARTIDA_ID || !Array.isArray(content.wires)) return content
  const features: string[] = Array.isArray(content.nativeFeatures) ? content.nativeFeatures.filter((v: unknown) => typeof v === 'string') : []
  if (features.includes(NATIVE_MOTOR_RING_FEATURE)) return content
  // Alimentadores do motor em U1/V1, identificados pelo borne de destino (os ids mudaram quando o
  // relé térmico F1 passou a alimentar o motor); as pontas do multímetro não são alimentadores.
  const motorFeeds = new Set(['native-m1-U1', 'native-m1-V1'])
  const wires = content.wires.map((wire: Wire) =>
    motorFeeds.has(wire.toTerminalId) && !wire.id.startsWith('native-meter-') && !wire.toPoint && wire.toEndType === 'ferruleDouble'
      ? { ...wire, toEndType: 'ring' as const } : wire)
  return { ...content, wires, nativeFeatures: [...features, NATIVE_MOTOR_RING_FEATURE] }
}
