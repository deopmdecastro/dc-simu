/**
 * Relé térmico F1 (Siemens 3RU1116) no projeto nativo «Partida direta».
 *
 * A semente passou a ter KM1 → F1 → M1 e o 95-96 do F1 em série com a bobina do KM1. Os projetos
 * nativos já guardados recebem-no uma vez, mas só se a cablagem original estiver intacta
 * (KM1 → U1/V1/W1 do motor e Q0.0·2 → KM1:A1): os cabos mantêm os ids, mudam de destino para o
 * F1 e os cabos novos (F1 → motor, F1:96 → KM1:A1) são acrescentados. Se o utilizador alterou
 * esses cabos, nada é tocado.
 */
import type { ElectricalComponent, Wire } from '../types'
import { NATIVE_PARTIDA_ID, NATIVE_THERMAL_FEATURE } from './nativeMotorMeter'
import { buildNativePartidaDireta, NATIVE_F1_ID } from './nativeProjects'

export { NATIVE_THERMAL_FEATURE }

/** Destino original de cada cabo que agora termina no F1. */
const ORIGINAL_TARGET: Record<string, string> = {
  '1L1': 'native-m1-U1', '3L2': 'native-m1-V1', '5L3': 'native-m1-W1', '95': 'native-km1-A1',
}

export function addNativeThermalRelay<T extends Record<string, any>>(content: T): T {
  if (content.nativeId !== NATIVE_PARTIDA_ID || !Array.isArray(content.components) || !Array.isArray(content.wires)) return content
  const features: string[] = Array.isArray(content.nativeFeatures) ? content.nativeFeatures.filter((v: unknown) => typeof v === 'string') : []
  if (features.includes(NATIVE_THERMAL_FEATURE)) return content
  const done = (next: T): T => ({ ...next, nativeFeatures: [...features, NATIVE_THERMAL_FEATURE] })
  const components = content.components as ElectricalComponent[]
  const wires = content.wires as Wire[]
  if (components.some((c) => c.id === NATIVE_F1_ID)) return done(content)

  const seed = buildNativePartidaDireta()
  const f1 = seed.components.find((c) => c.id === NATIVE_F1_ID)
  if (!f1) return done(content)
  const prefix = `${NATIVE_F1_ID}-`
  const retargeted = seed.wires.filter((w) => w.toTerminalId.startsWith(prefix) && wires.some((x) => x.id === w.id))
  const intact = retargeted.length === Object.keys(ORIGINAL_TARGET).length && retargeted.every((w) => {
    const current = wires.find((x) => x.id === w.id)!
    return current.fromTerminalId === w.fromTerminalId && current.toTerminalId === ORIGINAL_TARGET[w.toTerminalId.slice(prefix.length)]
  })
  if (!intact) return done(content)

  const seedById = new Map(seed.wires.map((w) => [w.id, w]))
  const added = seed.wires.filter((w) => w.fromTerminalId.startsWith(prefix) && !wires.some((x) => x.id === w.id))
  const nextWires = [
    ...wires.map((w) => (retargeted.some((r) => r.id === w.id) ? structuredClone(seedById.get(w.id)!) : w)),
    ...added.map((w) => structuredClone(w)),
  ]
  // F1 entra a seguir ao KM1 na lista (ordem visual da calha).
  const kmIndex = components.findIndex((c) => c.id === 'native-km1')
  const nextComponents = [...components]
  nextComponents.splice(kmIndex >= 0 ? kmIndex + 1 : nextComponents.length, 0, structuredClone(f1))
  return done({ ...content, components: nextComponents, wires: nextWires })
}
