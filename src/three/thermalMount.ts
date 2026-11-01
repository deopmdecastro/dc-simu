/**
 * Relé térmico encaixado por baixo do contactor (montagem direta, como o 3RU sob o 3RT).
 *
 * Os pinos 1L1/3L2/5L3 do relé entram nos bornes de saída 2T1/4T2/6T3 do contactor: a posição
 * do relé calcula-se a partir dos bornes reais em 3D (a mesma geometria dos cabos) e o relé
 * guarda o contactor em `mountedOn`. Eletricamente, cada pino fica ligado ao borne onde
 * encaixa — sem cabos — através de ligações internas (`mountBridges`).
 */
import * as THREE from 'three'
import type { ElectricalComponent, Wire } from '../types'
import { terminalWorld3D } from './terminal3D'
import { componentPanelXY, panelToSchematicX, panelToSchematicY } from './panelLayout'
import { SCHEMATIC_PX_PER_MM } from './modelPaths'
import { MOUNT_PAIRS, MOUNT_PASS_THROUGH } from '../electrical/mounts'

export const isThermalRelay = (component: Pick<ElectricalComponent, 'type'>) => component.type.startsWith('thermalRelay')
export const isContactor = (component: Pick<ElectricalComponent, 'type'>) => component.type.startsWith('contactor')

export { MOUNT_PAIRS, MOUNT_PASS_THROUGH }
/** Distância (mm) do centro de encaixe em que o íman prende o relé ao contactor. */
export const MOUNT_REACH_MM = 28

function meanTerminal(component: ElectricalComponent, labels: string[], pivot: THREE.Vector3): THREE.Vector3 | null {
  const terminals = labels.map((label) => component.terminals.find((t) => t.label === label))
  if (terminals.some((t) => !t)) return null
  const sum = new THREE.Vector3()
  for (const t of terminals) sum.add(terminalWorld3D(component, t!, pivot))
  return sum.multiplyScalar(1 / terminals.length)
}

/** Posição no Esquema do relé encaixado no contactor (pinos sobre os bornes 2T1/4T2/6T3). */
export function mountPosition(relay: ElectricalComponent, contactor: ElectricalComponent): { schematicX: number; schematicY: number } | null {
  const { x, y } = componentPanelXY(contactor)
  const out = meanTerminal(contactor, MOUNT_PAIRS.map(([, o]) => o), new THREE.Vector3(x, y, 0))
  const pins = meanTerminal(relay, MOUNT_PAIRS.map(([i]) => i), new THREE.Vector3(0, 0, 0))
  if (!out || !pins) return null
  return {
    schematicX: Math.round(panelToSchematicX(out.x - pins.x) - relay.w / 2),
    schematicY: Math.round(panelToSchematicY(out.y - pins.y) - relay.h / 2),
  }
}

/** Contactor livre mais próximo em que o relé (na posição atual) encaixa, ou null. */
export function findMountTarget(relay: ElectricalComponent, components: ElectricalComponent[]): { contactor: ElectricalComponent; schematicX: number; schematicY: number } | null {
  if (!isThermalRelay(relay)) return null
  const reach = MOUNT_REACH_MM * SCHEMATIC_PX_PER_MM
  let best: { contactor: ElectricalComponent; schematicX: number; schematicY: number; d: number } | null = null
  for (const contactor of components) {
    if (!isContactor(contactor)) continue
    if (components.some((c) => c.id !== relay.id && c.mountedOn === contactor.id)) continue
    const at = mountPosition(relay, contactor)
    if (!at) continue
    const d = Math.hypot(at.schematicX - relay.schematicX, at.schematicY - relay.schematicY)
    if (d <= reach && (!best || d < best.d)) best = { contactor, ...at, d }
  }
  return best && { contactor: best.contactor, schematicX: best.schematicX, schematicY: best.schematicY }
}

/** Repõe os relés encaixados na posição do seu contactor (e solta os que perderam o contactor). */
export function syncMounted(components: ElectricalComponent[]): ElectricalComponent[] {
  let changed = false
  const next = components.map((component) => {
    if (!component.mountedOn) return component
    const contactor = components.find((c) => c.id === component.mountedOn)
    if (!contactor || !isThermalRelay(component)) { changed = true; return { ...component, mountedOn: undefined } }
    const at = mountPosition(component, contactor)
    if (!at || (at.schematicX === component.schematicX && at.schematicY === component.schematicY && !component.railId)) return component
    changed = true
    return { ...component, ...at, railId: undefined, railOffsetMm: undefined, panel3DPosition: undefined }
  })
  return changed ? next : components
}

/** Ligações internas do encaixe (pino do relé ↔ borne do contactor), para a simulação elétrica. */
export function mountBridges(components: ElectricalComponent[]): Wire[] {
  const bridges: Wire[] = []
  for (const relay of components) {
    if (!relay.mountedOn) continue
    const contactor = components.find((c) => c.id === relay.mountedOn)
    if (!contactor) continue
    for (const [pin, socket] of [...MOUNT_PAIRS, ...MOUNT_PASS_THROUGH]) {
      const a = relay.terminals.find((t) => t.label === pin)
      const b = contactor.terminals.find((t) => t.label === socket)
      if (!a || !b) continue
      bridges.push({ id: `mount-${relay.id}-${pin}`, fromTerminalId: b.id, toTerminalId: a.id, color: 'black', number: '' } as Wire)
    }
  }
  return bridges
}
