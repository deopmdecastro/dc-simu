/**
 * Relé térmico F1 (Siemens 3RU1116) encaixado por baixo do KM1 no projeto nativo «Partida direta».
 *
 * A semente tem o F1 encaixado no KM1 (pinos 1L1/3L2/5L3 nos bornes 2T1/4T2/6T3, sem cabos),
 * F1 → M1 e o 95-96 em série com a bobina do KM1. Os projetos nativos já guardados recebem-no uma
 * vez, sem nunca mexer em cablagem alterada pelo utilizador:
 *  · sem F1 e com a cablagem original (KM1 → U1/V1/W1, Q0.0·2 → KM1:A1): entra o F1 encaixado;
 *  · com o F1 na calha (versão anterior) e os cabos KM1 → F1 intactos: o F1 passa a encaixado e
 *    esses três cabos saem;
 *  · em qualquer outro caso nada é tocado.
 */
import type { ElectricalComponent, Wire } from '../types'
import { NATIVE_PARTIDA_ID, NATIVE_THERMAL_FEATURE, NATIVE_THERMAL_MOUNT_FEATURE } from './nativeMotorMeter'
import { buildNativePartidaDireta, NATIVE_F1_ID, NATIVE_F1_MOUNT_WIRES } from './nativeProjects'

export { NATIVE_THERMAL_FEATURE, NATIVE_THERMAL_MOUNT_FEATURE }

const POLES: Array<[km: string, f1: string, motor: string]> = [['2T1', '1L1', 'U1'], ['4T2', '3L2', 'V1'], ['6T3', '5L3', 'W1']]

export function addNativeThermalRelay<T extends Record<string, any>>(content: T): T {
  if (content.nativeId !== NATIVE_PARTIDA_ID || !Array.isArray(content.components) || !Array.isArray(content.wires)) return content
  const features: string[] = Array.isArray(content.nativeFeatures) ? content.nativeFeatures.filter((v: unknown) => typeof v === 'string') : []
  if (features.includes(NATIVE_THERMAL_MOUNT_FEATURE)) return content
  const marks = [...features, ...(features.includes(NATIVE_THERMAL_FEATURE) ? [] : [NATIVE_THERMAL_FEATURE]), NATIVE_THERMAL_MOUNT_FEATURE]
  const done = (next: T): T => ({ ...next, nativeFeatures: marks })
  const components = content.components as ElectricalComponent[]
  const wires = content.wires as Wire[]
  const seed = buildNativePartidaDireta()
  const seedF1 = seed.components.find((c) => c.id === NATIVE_F1_ID)
  if (!seedF1) return done(content)
  const byId = (id: string) => wires.find((w) => w.id === id)
  const is = (id: string, from: string, to: string) => { const w = byId(id); return !!w && w.fromTerminalId === from && w.toTerminalId === to }
  const coil = seed.wires.find((w) => w.toTerminalId === `${NATIVE_F1_ID}-95`)!
  const current = components.find((c) => c.id === NATIVE_F1_ID)
  // Retorno da bobina: do A2 do KM1 (tapado pelo encaixe) para a passagem A2 do F1.
  const coilReturn = seed.wires.find((w) => w.fromTerminalId === `${NATIVE_F1_ID}-A2`)!
  const withReturn = (list: Wire[]) => list.map((w) => (w.id === coilReturn.id && w.fromTerminalId === 'native-km1-A2' && w.toTerminalId === coilReturn.toTerminalId ? structuredClone(coilReturn) : w))

  // Caso 2: F1 na calha (versão anterior), cabos KM1 → F1 intactos → encaixar e tirar os cabos.
  if (current) {
    const bridged = NATIVE_F1_MOUNT_WIRES.every((id, i) => is(id, `native-km1-${POLES[i][0]}`, `${NATIVE_F1_ID}-${POLES[i][1]}`))
    if (current.mountedOn || !bridged) return done(content)
    return done({
      ...content,
      components: components.map((c) => (c.id === NATIVE_F1_ID ? { ...c, schematicX: seedF1.schematicX, schematicY: seedF1.schematicY, mountedOn: seedF1.mountedOn, railId: undefined, railOffsetMm: undefined, panel3DPosition: undefined } : c)),
      wires: withReturn(wires.filter((w) => !NATIVE_F1_MOUNT_WIRES.includes(w.id))),
    })
  }

  // Caso 1: projeto anterior ao F1 com a cablagem original → entra o F1 encaixado.
  const original = NATIVE_F1_MOUNT_WIRES.every((id, i) => is(id, `native-km1-${POLES[i][0]}`, `native-m1-${POLES[i][2]}`))
    && is(coil.id, coil.fromTerminalId, 'native-km1-A1')
  if (!original) return done(content)
  const seedById = new Map(seed.wires.map((w) => [w.id, w]))
  const added = seed.wires.filter((w) => w.fromTerminalId.startsWith(`${NATIVE_F1_ID}-`) && !wires.some((x) => x.id === w.id))
  const nextWires = [
    ...withReturn(wires.filter((w) => !NATIVE_F1_MOUNT_WIRES.includes(w.id))).map((w) => (w.id === coil.id ? structuredClone(seedById.get(w.id)!) : w)),
    ...added.map((w) => structuredClone(w)),
  ]
  const kmIndex = components.findIndex((c) => c.id === 'native-km1')
  const nextComponents = [...components]
  nextComponents.splice(kmIndex >= 0 ? kmIndex + 1 : nextComponents.length, 0, structuredClone(seedF1))
  return done({ ...content, components: nextComponents, wires: nextWires })
}
