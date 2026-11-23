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

/** Copia só campos usados no traçado 3D — reduz o custo do structured clone para o worker. */
function slimWireForRouting(w: Wire): Wire {
  return {
    id: w.id,
    fromTerminalId: w.fromTerminalId,
    toTerminalId: w.toTerminalId,
    color: w.color,
    gauge: w.gauge,
    kind: w.kind,
    flexibility: w.flexibility,
    route: w.route,
    bend: w.bend,
    curveOffset: w.curveOffset,
    endType: w.endType,
    fromEndType: w.fromEndType,
    toEndType: w.toEndType,
    fromPoint: w.fromPoint,
    toPoint: w.toPoint,
    fromPoint3D: w.fromPoint3D,
    toPoint3D: w.toPoint3D,
    waypoints3D: w.waypoints3D,
    bundleId: w.bundleId,
    sheathed: w.sheathed,
    sheathColor: w.sheathColor,
    conductorCount: w.conductorCount,
    energized: w.energized,
  }
}

export function createWireRoutingJob(wires: Wire[], components: ElectricalComponent[], pivots: Record<string, Vector3>): WireRoutingJob {
  return {
    wires: wires.map(slimWireForRouting),
    // Defaults pessoais e modelos de catálogo só existem na thread principal.
    components: components.map(component => ({
      id: component.id,
      type: component.type,
      ref: component.ref,
      w: component.w,
      h: component.h,
      rotation: component.rotation,
      mirrored: component.mirrored,
      schematicX: component.schematicX,
      schematicY: component.schematicY,
      state: component.state,
      terminals: component.terminals,
      panelMount: component.panelMount,
      enclosureId: component.enclosureId,
      panel3DPosition: component.panel3DPosition,
      view3DScale: component.view3DScale,
      viewOrientation: componentOrientationOf(component),
    } as ElectricalComponent)),
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
