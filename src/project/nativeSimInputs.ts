import type { ElectricalComponent } from '../types'
import { NATIVE_PARTIDA_ID } from './nativeMotorMeter'

/** Marca da atualização: EMERG e STOP simulados como NC (contacto em série com o cabo). */
export const NATIVE_NC_SIM_FEATURE = 'nc-sim-inputs-v1'
const NATIVE_PLC_ID = 'native-plc'
/** B0 (cogumelo) e STOP são NF: os botões de simulação repousam a 1 e premidos cortam o sinal. */
export const NATIVE_NC_INPUTS = ['I0.0', 'I0.2'] as const

/** Aplica o tipo NC às entradas indicadas sem mexer em tipos já escolhidos pelo utilizador. */
export function withNativeNcSimInputs<T extends ElectricalComponent>(plc: T): T {
  const modes = { ...(plc.state.simInputModes as Record<string, string> | undefined) }
  const inputs = { ...(plc.state.simInputs as Record<string, boolean> | undefined) }
  for (const address of NATIVE_NC_INPUTS) {
    if (modes[address]) continue
    modes[address] = 'nc'
    inputs[address] = true
  }
  return { ...plc, state: { ...plc.state, simInputModes: modes, simInputs: inputs } }
}

/** Atualização aditiva do nativo já guardado (corre uma vez; a marca respeita alterações posteriores). */
export function upgradeNativeNcSimInputs<T extends Record<string, any>>(content: T): T {
  if (content.nativeId !== NATIVE_PARTIDA_ID || !Array.isArray(content.components)) return content
  const features: string[] = Array.isArray(content.nativeFeatures) ? content.nativeFeatures.filter((v: unknown) => typeof v === 'string') : []
  if (features.includes(NATIVE_NC_SIM_FEATURE)) return content
  return {
    ...content,
    components: content.components.map((c: ElectricalComponent) => (c.id === NATIVE_PLC_ID ? withNativeNcSimInputs(c) : c)),
    nativeFeatures: [...features, NATIVE_NC_SIM_FEATURE],
  }
}
