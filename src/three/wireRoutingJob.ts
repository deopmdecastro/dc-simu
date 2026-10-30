import { Vector3 } from 'three'
import type { ElectricalComponent, Wire } from '../types'
import { buildAllWirePaths3D, componentObstacles, type V3, type WirePath3D } from './wireGeometry3D'
import { componentOrientationOf } from './componentOrientation'
import { getComponentModelSpec, registerCatalogModel, type ComponentModelSpec } from './modelPaths'
import type { ComponentType } from '../types'

/** Apenas dados: classes Three são reconstruídas no worker. */
export type WireRoutingJob = {
  wires: Wire[]
  components: ElectricalComponent[]
  pivots: Record<string, V3>
  models: Array<[ComponentType, Pick<ComponentModelSpec, 'physicalSizeMm' | 'placement'>]>
}
export type WireRoutingReply = { paths: Array<[string, WirePath3D]> } | { error: string }

export function createWireRoutingJob(wires: Wire[], components: ElectricalComponent[], pivots: Record<string, Vector3>): WireRoutingJob {
  return {
    wires,
    // Defaults pessoais e modelos de catálogo só existem na thread principal.
    components: components.map(component => ({ ...component, viewOrientation: componentOrientationOf(component) })),
    pivots: Object.fromEntries(Object.entries(pivots).map(([id, point]) => [id, point.toArray() as V3])),
    models: [...new Set(components.map(component => component.type))].flatMap(type => {
      const spec = getComponentModelSpec(type)
      return type.startsWith('cat:') && spec ? [[type, { physicalSizeMm: spec.physicalSizeMm, placement: spec.placement }] as WireRoutingJob['models'][number]] : []
    }),
  }
}

export function calculateWireRouting(job: WireRoutingJob): Array<[string, WirePath3D]> {
  for (const [type, model] of job.models) registerCatalogModel(type, '', model.physicalSizeMm, model.placement)
  const pivots = Object.fromEntries(Object.entries(job.pivots).map(([id, point]) => [id, new Vector3(...point)]))
  return [...buildAllWirePaths3D(job.wires, job.components, pivots, componentObstacles(job.components, pivots))]
}
