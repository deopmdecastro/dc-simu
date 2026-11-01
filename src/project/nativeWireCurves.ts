/**
 * Refresh das curvas dos cabos do projeto nativo «Partida direta».
 *
 * O traçado 3D é recalculado sempre; o que prende curvas antigas são as dobras 3D guardadas
 * (`waypoints3D`) e o tipo de curva do próprio cabo. Para os cabos de origem que mantêm as duas
 * pontas da semente, repõe o traçado de origem (sem dobras 3D) — passam a usar as curvas novas.
 * Cabos alterados (outra ponta) ou criados pelo utilizador não são tocados. Corre uma só vez.
 */
import type { Wire } from '../types'
import { NATIVE_PARTIDA_ID, NATIVE_WIRE_CURVES_FEATURE } from './nativeMotorMeter'
import { buildNativePartidaDireta } from './nativeProjects'

const ROUTE_KEYS = ['waypoints3D', 'route', 'bend', 'curveOffset', 'waypoints'] as const

export function refreshNativeWireCurves<T extends Record<string, any>>(content: T): T {
  if (content.nativeId !== NATIVE_PARTIDA_ID || !Array.isArray(content.wires)) return content
  const features: string[] = Array.isArray(content.nativeFeatures) ? content.nativeFeatures.filter((v: unknown) => typeof v === 'string') : []
  if (features.includes(NATIVE_WIRE_CURVES_FEATURE)) return content
  const seed = new Map(buildNativePartidaDireta().wires.map((w) => [w.id, w]))
  const wires = content.wires.map((wire: Wire) => {
    const origin = seed.get(wire.id)
    if (!origin || origin.fromTerminalId !== wire.fromTerminalId || origin.toTerminalId !== wire.toTerminalId) return wire
    const next: Record<string, unknown> = { ...wire }
    for (const key of ROUTE_KEYS) {
      const value = (origin as unknown as Record<string, unknown>)[key]
      if (value === undefined) delete next[key]
      else next[key] = structuredClone(value)
    }
    return next as unknown as Wire
  })
  return { ...content, wires, nativeFeatures: [...features, NATIVE_WIRE_CURVES_FEATURE] }
}
