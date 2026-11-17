/**
 * Refresh das curvas e chicotes (`bundleId` / filaças) dos projetos nativos
 * («Partida direta» e «Estrela-Triângulo com KS1»).
 *
 * Para os cabos de origem que mantêm as duas pontas da semente (e não estão bloqueados),
 * repõe o traçado 2D, limpa dobras 3D antigas (`waypoints3D`) para o motor 3D calcular
 * os corredores/calhas atuais e aplica o `bundleId` do chicote correspondente.
 * Cabos alterados, bloqueados ou criados pelo utilizador não são tocados. Corre uma só vez.
 * Retira a capa guardada (`cover`) para ser recapturada com os cabos e filaças novos.
 */
import type { Wire } from '../types'
import { NATIVE_PARTIDA_ID, NATIVE_WIRE_CURVES_FEATURE } from './nativeMotorMeter'
import { NATIVE_ESTRELA_KS1_ID, nativeEstrelaKs1Content } from './nativeEstrelaKs1'
import { buildNativePartidaDireta } from './nativeProjects'

const ROUTE_KEYS = ['waypoints3D', 'route', 'bend', 'curveOffset', 'waypoints', 'bundleId'] as const

function seedWiresFor(nativeId: unknown): Wire[] | null {
  if (nativeId === NATIVE_PARTIDA_ID) return buildNativePartidaDireta().wires
  if (nativeId === NATIVE_ESTRELA_KS1_ID) {
    const built = nativeEstrelaKs1Content()
    return Array.isArray(built.wires) ? (built.wires as Wire[]) : null
  }
  return null
}

export function refreshNativeWireCurves<T extends Record<string, any>>(content: T): T {
  if (!Array.isArray(content.wires)) return content
  const originWires = seedWiresFor(content.nativeId)
  if (!originWires) return content
  const features: string[] = Array.isArray(content.nativeFeatures) ? content.nativeFeatures.filter((v: unknown) => typeof v === 'string') : []
  if (features.includes(NATIVE_WIRE_CURVES_FEATURE)) return content
  const seed = new Map(originWires.map((w) => [w.id, w]))
  const seedByNum = new Map(originWires.filter((w) => w.number).map((w) => [w.number!, w]))
  const seedByEnds = new Map(originWires.map((w) => [`${w.fromTerminalId}~${w.toTerminalId}`, w]))
  const isEstrela = content.nativeId === NATIVE_ESTRELA_KS1_ID
  const wires = content.wires.map((wire: Wire) => {
    if (wire.locked) return wire
    let origin = seed.get(wire.id)
    if (origin && (origin.fromTerminalId !== wire.fromTerminalId || origin.toTerminalId !== wire.toTerminalId)) origin = undefined
    if (!origin && isEstrela) {
      const byEnds = seedByEnds.get(`${wire.fromTerminalId}~${wire.toTerminalId}`)
      const byNum = wire.number ? seedByNum.get(wire.number) : undefined
      origin = byEnds ?? (byNum && byNum.fromTerminalId === wire.fromTerminalId && byNum.toTerminalId === wire.toTerminalId ? byNum : undefined)
    }
    if (!origin) return wire
    const next: Record<string, unknown> = { ...wire }
    for (const key of ROUTE_KEYS) {
      const value = (origin as unknown as Record<string, unknown>)[key]
      if (value === undefined) delete next[key]
      else if (key === 'bundleId' && typeof wire.bundleId === 'string' && wire.bundleId.length > 0 && !wire.bundleId.startsWith('chicote') && !wire.bundleId.startsWith('bundle-')) {
        // Preserva chicote personalizado criado pelo utilizador.
      } else next[key] = structuredClone(value)
    }
    delete next.waypoints3D
    return next as unknown as Wire
  })
  const { cover: _staleCover, ...rest } = content
  const cleanFeatures = features.filter((f) => !f.startsWith('wire-curves-v'))
  return { ...rest, wires, nativeFeatures: [...cleanFeatures, NATIVE_WIRE_CURVES_FEATURE] } as unknown as T
}
