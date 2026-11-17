/**
 * Encaixe do barramento tipo pente (`busbarComb`) e do conector de alimentação (`combBusbarConnector`)
 * nos bornes superiores dos disjuntores.
 *
 * Mesmo padrão do relé térmico sob o contactor (`thermalMount.ts`):
 *  - o pente/conector guarda o disjuntor âncora em `mountedOn`
 *  - a posição esquemática e 3D alinha os pinos com os bornes 1/3/5 (topo)
 *  - ligações internas (`combMountBridges`) fazem a continuidade elétrica sem cabos
 *
 * Um pente pode alimentar vários disjuntores adjacentes na mesma linha (passo DIN 18 mm).
 * O âncora é o disjuntor mais à esquerda cujos bornes de entrada coincidem com pinos do pente;
 * os restantes são descobertos por proximidade e passo modular.
 */
import * as THREE from 'three'
import type { ElectricalComponent, Wire } from '../types'
import { terminalWorld3D } from './terminal3D'
import { componentPanelXY, panelToSchematicX, panelToSchematicY } from './panelLayout'
import { PANEL_UNITS_PER_MM, SCHEMATIC_PX_PER_MM } from './modelPaths'
import { componentHalfExtents } from './panelBounds'
import { combTerminalConductorOf, type CombConductor } from './combBusbarParts'

/** Tipos de disjuntor que aceitam pente nos bornes superiores. */
const BREAKER_TYPES = new Set([
  'breaker1p',
  'breaker2p',
  'breaker3p',
  'breaker4p',
  'breakerSteckSdC25',
  'residualBreakerHagerCfc225p',
  'phoenixEcb3000760',
])

export const isCombBusbar = (c: Pick<ElectricalComponent, 'type'>) => c.type === 'busbarComb'
export const isCombConnector = (c: Pick<ElectricalComponent, 'type'>) => c.type === 'combBusbarConnector'
export const isBreaker = (c: Pick<ElectricalComponent, 'type'>) => BREAKER_TYPES.has(c.type)

/** Alcance (mm) do íman de encaixe pente/conector ↔ disjuntor. */
export const COMB_MOUNT_REACH_MM = 36
/** Passo modular DIN dos dentes / módulos de disjuntor (mm). */
export const COMB_MODULE_PITCH_MM = 18
/** Comprimento de inserção do pino de cobre no borne do disjuntor (mm). */
export const COMB_PIN_INSERT_MM = 10.0
/** Comprimento de inserção do pino do conector no borne do disjuntor (mm). */
export const COMB_CONNECTOR_PIN_INSERT_MM = 10.0

/** Bornes de entrada (topo) por tipo de disjuntor, da esquerda para a direita. */
export function breakerInputLabels(breaker: ElectricalComponent): string[] {
  const poles = Number(breaker.state?.poles) || (
    breaker.type === 'breaker1p' || breaker.type === 'breakerSteckSdC25' || breaker.type === 'phoenixEcb3000760' ? 1
    : breaker.type === 'breaker2p' ? 2
    : breaker.type === 'breaker4p' ? 4
    : 3
  )
  if (poles <= 1) return ['1']
  if (poles === 2) return ['1', '3']
  if (poles === 4) return ['1', '3', '5', '7']
  return ['1', '3', '5']
}

/** Pinos do pente (face bottom, dentes para baixo), ordenados da esquerda para a direita. */
export function combPinTerminals(comb: ElectricalComponent): ElectricalComponent['terminals'] {
  return comb.terminals
    .filter((t) => t.terminalType === 'pin' || /^([LN]|L[123])\.\d+$/i.test(t.label))
    .slice()
    .sort((a, b) => (a.position3D?.x ?? a.x) - (b.position3D?.x ?? b.x))
}

function meanWorld(
  component: ElectricalComponent,
  labels: string[],
  pivot: THREE.Vector3,
): THREE.Vector3 | null {
  const terms = labels.map((l) => component.terminals.find((t) => t.label === l))
  if (terms.some((t) => !t)) return null
  const sum = new THREE.Vector3()
  for (const t of terms) sum.add(terminalWorld3D(component, t!, pivot))
  return sum.multiplyScalar(1 / terms.length)
}

/**
 * Posição esquemática do pente encaixado no disjuntor âncora:
 * os pinos ficam centrados sobre os bornes de entrada do disjuntor.
 */
export function combMountPosition(
  comb: ElectricalComponent,
  breaker: ElectricalComponent,
): { schematicX: number; schematicY: number } | null {
  const inputs = breakerInputLabels(breaker)
  const pins = combPinTerminals(comb)
  if (!inputs.length || pins.length < inputs.length) return null

  const { x, y } = componentPanelXY(breaker)
  const socket = meanWorld(breaker, inputs, new THREE.Vector3(x, y, 0))
  // Usar os primeiros N pinos alinhados com o âncora (da esquerda)
  const pinLabels = pins.slice(0, inputs.length).map((t) => t.label)
  const pinCenter = meanWorld(comb, pinLabels, new THREE.Vector3(0, 0, 0))
  if (!socket || !pinCenter) return null

  // Pinos inseridos nos bornes de topo do disjuntor
  const targetCx = socket.x - pinCenter.x
  const targetCy = socket.y - pinCenter.y - COMB_PIN_INSERT_MM * PANEL_UNITS_PER_MM
  return {
    schematicX: Math.round(panelToSchematicX(targetCx) - comb.w / 2),
    schematicY: Math.round(panelToSchematicY(targetCy) - comb.h / 2),
  }
}

/**
 * Posição esquemática do conector tipo pino (`combBusbarConnector`) encaixado num borne do disjuntor.
 */
export function combConnectorMountPosition(
  connector: ElectricalComponent,
  breaker: ElectricalComponent,
  preferredTerminal?: string,
): { schematicX: number; schematicY: number; socketLabel: string } | null {
  const inputs = breakerInputLabels(breaker)
  if (!inputs.length) return null

  const { x, y } = componentPanelXY(breaker)
  const { x: connX } = componentPanelXY(connector)

  // Escolhe o borne de entrada mais próximo ou o preferido
  let targetLabel = preferredTerminal && inputs.includes(preferredTerminal) ? preferredTerminal : inputs[0]
  if (!preferredTerminal && inputs.length > 1) {
    let minDist = Infinity
    for (const l of inputs) {
      const t = breaker.terminals.find((term) => term.label === l)
      if (!t) continue
      const wPos = terminalWorld3D(breaker, t, new THREE.Vector3(x, y, 0))
      const dist = Math.abs(wPos.x - connX)
      if (dist < minDist) {
        minDist = dist
        targetLabel = l
      }
    }
  }

  const targetTerm = breaker.terminals.find((t) => t.label === targetLabel)
  const pinoTerm = connector.terminals.find((t) => t.label === 'PINO')
  if (!targetTerm || !pinoTerm) return null

  const socket = terminalWorld3D(breaker, targetTerm, new THREE.Vector3(x, y, 0))
  const pinoCenter = terminalWorld3D(connector, pinoTerm, new THREE.Vector3(0, 0, 0))

  const targetCx = socket.x - pinoCenter.x
  const targetCy = socket.y - pinoCenter.y - COMB_CONNECTOR_PIN_INSERT_MM * PANEL_UNITS_PER_MM
  return {
    schematicX: Math.round(panelToSchematicX(targetCx) - connector.w / 2),
    schematicY: Math.round(panelToSchematicY(targetCy) - connector.h / 2),
    socketLabel: targetLabel,
  }
}

/** Recuo em profundidade para alinhar a ponta dos pinos com a boca dos bornes. */
export function combMountDepthOffset(
  component: ElectricalComponent,
  components: ElectricalComponent[],
): number {
  if (!component.mountedOn) return 0
  const breaker = components.find((c) => c.id === component.mountedOn)
  if (!breaker) return 0
  if (isCombBusbar(component)) {
    const inputs = breakerInputLabels(breaker)
    const pins = combPinTerminals(component).slice(0, inputs.length)
    if (!inputs.length || !pins.length) return 0
    const socket = meanWorld(
      breaker,
      inputs,
      new THREE.Vector3(0, 0, componentHalfExtents(breaker).z),
    )
    const pin = meanWorld(
      component,
      pins.map((t) => t.label),
      new THREE.Vector3(0, 0, componentHalfExtents(component).z),
    )
    return socket && pin ? socket.z - pin.z : 0
  }
  if (isCombConnector(component)) {
    const socketLabel = (component.state?.mountedTerminal as string) || breakerInputLabels(breaker)[0] || '1'
    const socketTerm = breaker.terminals.find((t) => t.label === socketLabel)
    const pinoTerm = component.terminals.find((t) => t.label === 'PINO')
    if (!socketTerm || !pinoTerm) return 0
    const socket = terminalWorld3D(breaker, socketTerm, new THREE.Vector3(0, 0, componentHalfExtents(breaker).z))
    const pino = terminalWorld3D(component, pinoTerm, new THREE.Vector3(0, 0, componentHalfExtents(component).z))
    return socket && pino ? socket.z - pino.z : 0
  }
  return 0
}

/**
 * Disjuntores adjacentes (mesma linha, passo DIN) que recebem pinos do pente
 * a partir do âncora `mountedOn`.
 */
export function combMountedBreakers(
  comb: ElectricalComponent,
  components: ElectricalComponent[],
): ElectricalComponent[] {
  if (!comb.mountedOn) return []
  const anchor = components.find((c) => c.id === comb.mountedOn)
  if (!anchor || !isBreaker(anchor)) return []

  const pins = combPinTerminals(comb)
  if (!pins.length) return [anchor]

  const pitchPx = COMB_MODULE_PITCH_MM * SCHEMATIC_PX_PER_MM
  const rowY = anchor.schematicY
  const toleranceY = Math.max(14, pitchPx * 0.35)
  const leftX = anchor.schematicX
  const rightLimit = leftX + comb.w + pitchPx

  const row = components
    .filter((c) => isBreaker(c) && Math.abs(c.schematicY - rowY) <= toleranceY)
    .filter((c) => c.schematicX >= leftX - pitchPx * 0.4 && c.schematicX <= rightLimit)
    .sort((a, b) => a.schematicX - b.schematicX)

  // Garantir que o âncora está incluído e a sequência é contínua
  if (!row.some((c) => c.id === anchor.id)) return [anchor]
  return row
}

/**
 * Pares (pino do pente → borne de entrada do disjuntor) para todos os
 * disjuntores encaixados sob o pente, respeitando o modo de fases do pente.
 */
export function combMountPairs(
  comb: ElectricalComponent,
  components: ElectricalComponent[],
): Array<{ pinLabel: string; breakerId: string; socketLabel: string }> {
  const breakers = combMountedBreakers(comb, components)
  if (!breakers.length) return []
  const pins = combPinTerminals(comb)
  if (!pins.length) return []

  const pairs: Array<{ pinLabel: string; breakerId: string; socketLabel: string }> = []
  let pinIdx = 0
  for (const br of breakers) {
    const sockets = breakerInputLabels(br)
    for (const socket of sockets) {
      if (pinIdx >= pins.length) break
      pairs.push({
        pinLabel: pins[pinIdx].label,
        breakerId: br.id,
        socketLabel: socket,
      })
      pinIdx++
    }
  }
  return pairs
}

/** Contínuidade elétrica do encaixe (sem cabos). */
export function combMountBridges(components: ElectricalComponent[]): Wire[] {
  const bridges: Wire[] = []
  for (const comp of components) {
    if (isCombBusbar(comp) && comp.mountedOn) {
      for (const { pinLabel, breakerId, socketLabel } of combMountPairs(comp, components)) {
        const pin = comp.terminals.find((t) => t.label === pinLabel)
        const br = components.find((c) => c.id === breakerId)
        const sock = br?.terminals.find((t) => t.label === socketLabel)
        if (!pin || !sock) continue
        bridges.push({
          id: `comb-mount-${comp.id}-${pinLabel}-${breakerId}-${socketLabel}`,
          fromTerminalId: pin.id,
          toTerminalId: sock.id,
          color: 'black',
          number: '',
        } as Wire)
      }
    } else if (isCombConnector(comp) && comp.mountedOn) {
      const br = components.find((c) => c.id === comp.mountedOn)
      if (!br) continue
      const socketLabel = (comp.state?.mountedTerminal as string) || breakerInputLabels(br)[0] || '1'
      const pino = comp.terminals.find((t) => t.label === 'PINO')
      const sock = br.terminals.find((t) => t.label === socketLabel)
      if (pino && sock) {
        bridges.push({
          id: `comb-conn-mount-${comp.id}-${br.id}-${socketLabel}`,
          fromTerminalId: pino.id,
          toTerminalId: sock.id,
          color: 'black',
          number: '',
        } as Wire)
      }
    }
  }
  return bridges
}

/** Disjuntor âncora mais próximo em que o pente encaixa, ou null. */
export function findCombMountTarget(
  comb: ElectricalComponent,
  components: ElectricalComponent[],
): { breaker: ElectricalComponent; schematicX: number; schematicY: number } | null {
  if (!isCombBusbar(comb)) return null
  const reach = COMB_MOUNT_REACH_MM * SCHEMATIC_PX_PER_MM
  let best: { breaker: ElectricalComponent; schematicX: number; schematicY: number; d: number } | null = null
  for (const br of components) {
    if (!isBreaker(br)) continue
    if (components.some((c) => c.id !== comb.id && isCombBusbar(c) && c.mountedOn === br.id)) continue
    const at = combMountPosition(comb, br)
    if (!at) continue
    const d = Math.hypot(at.schematicX - comb.schematicX, at.schematicY - comb.schematicY)
    if (d <= reach && (!best || d < best.d)) best = { breaker: br, ...at, d }
  }
  return best && { breaker: best.breaker, schematicX: best.schematicX, schematicY: best.schematicY }
}

/** Disjuntor ou borne mais próximo em que o conector tipo pino encaixa, ou null. */
export function findCombConnectorMountTarget(
  connector: ElectricalComponent,
  components: ElectricalComponent[],
): { breaker: ElectricalComponent; schematicX: number; schematicY: number; socketLabel: string } | null {
  if (!isCombConnector(connector)) return null
  const reach = COMB_MOUNT_REACH_MM * SCHEMATIC_PX_PER_MM
  let best: { breaker: ElectricalComponent; schematicX: number; schematicY: number; socketLabel: string; d: number } | null = null
  for (const br of components) {
    if (!isBreaker(br)) continue
    const at = combConnectorMountPosition(connector, br)
    if (!at) continue
    const d = Math.hypot(at.schematicX - connector.schematicX, at.schematicY - connector.schematicY)
    if (d <= reach && (!best || d < best.d)) best = { breaker: br, ...at, d }
  }
  return best && { breaker: best.breaker, schematicX: best.schematicX, schematicY: best.schematicY, socketLabel: best.socketLabel }
}

/** Repõe os pentes e conectores encaixados na posição do âncora (e solta os que perderam o disjuntor). */
export function syncCombMounted(components: ElectricalComponent[]): ElectricalComponent[] {
  let changed = false
  const next = components.map((component) => {
    if (!component.mountedOn) return component
    if (isCombBusbar(component)) {
      const breaker = components.find((c) => c.id === component.mountedOn)
      if (!breaker || !isBreaker(breaker)) {
        changed = true
        return { ...component, mountedOn: undefined }
      }
      const at = combMountPosition(component, breaker)
      if (!at || (at.schematicX === component.schematicX && at.schematicY === component.schematicY && !component.railId)) {
        return component
      }
      changed = true
      return {
        ...component,
        ...at,
        railId: undefined,
        railOffsetMm: undefined,
        panel3DPosition: undefined,
      }
    }
    if (isCombConnector(component)) {
      const breaker = components.find((c) => c.id === component.mountedOn)
      if (!breaker || !isBreaker(breaker)) {
        changed = true
        return { ...component, mountedOn: undefined, state: { ...component.state, mountedTerminal: undefined } }
      }
      const at = combConnectorMountPosition(component, breaker, component.state?.mountedTerminal as string)
      if (!at || (at.schematicX === component.schematicX && at.schematicY === component.schematicY && !component.railId)) {
        return component
      }
      changed = true
      return {
        ...component,
        schematicX: at.schematicX,
        schematicY: at.schematicY,
        state: { ...component.state, mountedTerminal: at.socketLabel },
        railId: undefined,
        railOffsetMm: undefined,
        panel3DPosition: undefined,
      }
    }
    return component
  })
  return changed ? next : components
}

/** Condutor elétrico do pino (para coloração / diagnóstico). */
export function combPinConductor(label: string): CombConductor | null {
  return combTerminalConductorOf(label)
}
