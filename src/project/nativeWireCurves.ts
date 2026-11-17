/**
 * Refresh das curvas e chicotes (`bundleId` / filaças) dos projetos nativos
 * («Partida direta» e «Estrela-Triângulo com KS1»).
 *
 * Para os cabos de origem que mantêm as duas pontas da semente (e não estão bloqueados),
 * repõe o traçado 2D (recalculando com `routeNativeWires` se o utilizador tiver movido
 * aparelhos), limpa dobras 3D antigas (`waypoints3D`) para o motor 3D calcular os
 * corredores/calhas atuais e aplica o `bundleId` do chicote correspondente.
 * Cabos alterados, bloqueados ou criados pelo utilizador não são tocados. Corre uma só vez.
 * Retira a capa guardada (`cover`) para ser recapturada com os cabos e filaças novos.
 */
import type { ElectricalComponent, Wire } from '../types'
import { NATIVE_PARTIDA_ID, NATIVE_WIRE_CURVES_FEATURE } from './nativeMotorMeter'
import { NATIVE_ESTRELA_KS1_ID, nativeEstrelaKs1Content } from './nativeEstrelaKs1'
import { buildNativePartidaDireta } from './nativeProjects'
import { bakeNativeRouting } from './nativeRouting'

const ROUTE_KEYS = ['waypoints3D', 'route', 'bend', 'curveOffset', 'waypoints', 'bundleId'] as const

/** Ligações equivalentes de gerações anteriores da semente (ex.: neutro de A2 direto em KM1 antes do borne A2 de F1). */
const LEGACY_ENDPOINT_ALIASES: Record<string, string> = {
  'native-km1-A2~native-q0-4': 'native-f1-A2~native-q0-4',
  'native-q0-4~native-km1-A2': 'native-f1-A2~native-q0-4',
}

function seedProjectFor(nativeId: unknown): { components: ElectricalComponent[]; wires: Wire[] } | null {
  if (nativeId === NATIVE_PARTIDA_ID) {
    const built = buildNativePartidaDireta()
    return { components: built.components, wires: built.wires }
  }
  if (nativeId === NATIVE_ESTRELA_KS1_ID) {
    const built = nativeEstrelaKs1Content()
    return Array.isArray(built.components) && Array.isArray(built.wires)
      ? { components: built.components as ElectricalComponent[], wires: built.wires as Wire[] }
      : null
  }
  return null
}

function pairKey(a: string, b: string): string {
  return `${a}~${b}`
}

export function refreshNativeWireCurves<T extends Record<string, any>>(content: T): T {
  if (!Array.isArray(content.wires)) return content
  const seedProj = seedProjectFor(content.nativeId)
  if (!seedProj) return content
  const features: string[] = Array.isArray(content.nativeFeatures) ? content.nativeFeatures.filter((v: unknown) => typeof v === 'string') : []
  if (features.includes(NATIVE_WIRE_CURVES_FEATURE)) return content

  const originWires = seedProj.wires
  const seed = new Map(originWires.map((w) => [w.id, w]))
  const seedByEnds = new Map<string, Wire>()
  for (const w of originWires) {
    seedByEnds.set(pairKey(w.fromTerminalId, w.toTerminalId), w)
    seedByEnds.set(pairKey(w.toTerminalId, w.fromTerminalId), w)
  }

  const refreshedIds = new Set<string>()
  let wires: Wire[] = content.wires.map((wire: Wire) => {
    if (wire.locked) return wire
    let origin = seed.get(wire.id)
    if (origin && (origin.fromTerminalId !== wire.fromTerminalId || origin.toTerminalId !== wire.toTerminalId)) {
      origin = undefined
    }
    if (!origin && (wire.id.startsWith('native-') || wire.id.startsWith('et-'))) {
      const directKey = pairKey(wire.fromTerminalId, wire.toTerminalId)
      const aliasKey = LEGACY_ENDPOINT_ALIASES[directKey]
      origin = seedByEnds.get(directKey) ?? (aliasKey ? seedByEnds.get(aliasKey) : undefined)
    }
    if (!origin) return wire
    refreshedIds.add(wire.id)
    const next: Record<string, unknown> = { ...wire }
    for (const key of ROUTE_KEYS) {
      const value = (origin as unknown as Record<string, unknown>)[key]
      if (value === undefined) delete next[key]
      else if (
        key === 'bundleId'
        && typeof wire.bundleId === 'string'
        && wire.bundleId.length > 0
        && !wire.bundleId.startsWith('chicote')
        && !wire.bundleId.startsWith('bundle-')
      ) {
        // Preserva chicote personalizado criado pelo utilizador.
      } else next[key] = structuredClone(value)
    }
    delete next.waypoints3D
    return next as unknown as Wire
  })

  // Se algum componente do projeto tiver sido reposicionado relativamente à semente
  // (ex.: motor ou calha movidos), recalcula os waypoints 2D apenas para os cabos de origem atualizados.
  if (Array.isArray(content.components) && refreshedIds.size > 0) {
    const seedCompById = new Map(seedProj.components.map((c) => [c.id, c]))
    const layoutMoved = (content.components as ElectricalComponent[]).some((c) => {
      const sc = seedCompById.get(c.id)
      return sc && (Math.abs(c.schematicX - sc.schematicX) > 1 || Math.abs(c.schematicY - sc.schematicY) > 1)
    })
    if (layoutMoved) {
      const rerouted = new Map(
        bakeNativeRouting(content.components as ElectricalComponent[], wires).map((w) => [w.id, w]),
      )
      wires = wires.map((w) => {
        if (!refreshedIds.has(w.id)) return w
        const rw = rerouted.get(w.id)
        return rw ? { ...w, route: rw.route, bend: rw.bend, waypoints: rw.waypoints } : w
      })
    }
  }

  const { cover: _staleCover, ...rest } = content
  const cleanFeatures = features.filter((f) => !f.startsWith('wire-curves-v'))
  return { ...rest, wires, nativeFeatures: [...cleanFeatures, NATIVE_WIRE_CURVES_FEATURE] } as unknown as T
}
