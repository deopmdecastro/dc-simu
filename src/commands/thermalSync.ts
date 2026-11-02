import type { ElectricalComponent } from '../types'
import type { CommandsDiagram } from './model'
import { importedComponentInfo } from '../electrical/importedComponents'

/** O F1 do quadro nativo e os símbolos IEC com a mesma referência são o mesmo aparelho. */
export function linkedThermalComponent(components: ElectricalComponent[], diagram: CommandsDiagram, nativeId: string | null, tag: string): ElectricalComponent | undefined {
  if (!nativeId || !diagram.parts.some((p) => p.tag === tag && (p.kind === 'thermal3' || p.kind === 'thermalNC' || p.kind === 'thermalNO'))) return undefined
  const matches = components.filter((c) => c.ref === tag && importedComponentInfo(c.type)?.behavior === 'thermal')
  return matches.length === 1 ? matches[0] : undefined
}

/** Projeção sem cópia persistida: TEST/disparo/RESET no 3D chegam ao motor IEC no próximo ciclo. */
export function linkedThermalTrips(components: ElectricalComponent[], diagram: CommandsDiagram, nativeId: string | null): Record<string, boolean> {
  const tags = new Set(diagram.parts.filter((p) => p.kind === 'thermal3' || p.kind === 'thermalNC' || p.kind === 'thermalNO').map((p) => p.tag))
  return Object.fromEntries([...tags].flatMap((tag) => {
    const component = linkedThermalComponent(components, diagram, nativeId, tag)
    return component ? [[tag, !!component.state.tripped]] : []
  }))
}
