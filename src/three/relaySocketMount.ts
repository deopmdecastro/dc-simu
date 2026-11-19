/**
 * Encaixe plug-in do relé de nível AVEL 411RNPD0023 na base undecal Finder 90.23.
 *
 * O relé tem onze pinos na face traseira (círculo undecal) e entra de frente nos
 * alvéolos P1…P11 da base aparafusada à calha DIN. O íman alinha o centro do
 * círculo de pinos ao centro do círculo dos alvéolos; em profundidade os pinos
 * ficam totalmente inseridos — a face traseira do relé encosta ao plano dos
 * alvéolos. Eletricamente cada pino i liga ao alvéolo Pi, que a base já ponteia
 * internamente ao borne de parafuso i (`industrialBridges`), sem cabos.
 *
 * A chave de polarização do relé impõe uma única orientação de encaixe: ao
 * encaixar, a rotação/espelho da instância são repostos (0° / sem espelho).
 */
import * as THREE from 'three'
import type { ElectricalComponent, Wire } from '../types'
import { terminalWorld3D } from './terminal3D'
import { componentPanelXY, panelToSchematicX, panelToSchematicY } from './panelLayout'
import { PANEL_UNITS_PER_MM, SCHEMATIC_PX_PER_MM, isMountingRail } from './modelPaths'
import { componentHalfExtents } from './panelBounds'
import { DIN_RAIL_15X55, dinRailProfileOf } from './dinRailGeometry'
import { industrialDeviceTypeOf } from '../electrical/industrialDevices'

/** Relé plug-in de 11 pinos na face traseira — hoje só o AVEL 411RNPD0023. */
export const isPlugInRelay = (c: Pick<ElectricalComponent, 'type' | 'state'>): boolean =>
  industrialDeviceTypeOf(c) === 'levelRelayAvel411'
/** Base undecal de 11 alvéolos — hoje só a Finder 90.23. */
export const isRelaySocket = (c: Pick<ElectricalComponent, 'type' | 'state'>): boolean =>
  industrialDeviceTypeOf(c) === 'relaySocketFinder9023'

/** Distância (mm) do centro de encaixe em que o íman prende o relé à base. */
export const SOCKET_MOUNT_REACH_MM = 30
/** Pinos 1…11 (relé) e alvéolos P1…P11 (base), na mesma numeração undecal. */
const PIN_LABELS = Array.from({ length: 11 }, (_, i) => String(i + 1))
const ALVEOLO_LABELS = PIN_LABELS.map((label) => `P${label}`)
/** Comprimento dos pinos no GLB (16 mm): inserção total, face traseira do relé no plano dos alvéolos. */
const PIN_LENGTH_MM = 16

function meanTerminal(component: ElectricalComponent, labels: string[], pivot: THREE.Vector3): THREE.Vector3 | null {
  const terminals = labels.map((label) => component.terminals.find((t) => t.label === label))
  if (terminals.some((t) => !t)) return null
  const sum = new THREE.Vector3()
  for (const t of terminals) sum.add(terminalWorld3D(component, t!, pivot))
  return sum.multiplyScalar(1 / terminals.length)
}

/** Posição no Esquema do relé encaixado na base (círculo de pinos sobre o dos alvéolos). */
export function relaySocketMountPosition(relay: ElectricalComponent, socket: ElectricalComponent): { schematicX: number; schematicY: number } | null {
  const { x, y } = componentPanelXY(socket)
  const out = meanTerminal(socket, ALVEOLO_LABELS, new THREE.Vector3(x, y, 0))
  const pins = meanTerminal(relay, PIN_LABELS, new THREE.Vector3(0, 0, 0))
  if (!out || !pins) return null
  return {
    schematicX: Math.round(panelToSchematicX(out.x - pins.x) - relay.w / 2),
    schematicY: Math.round(panelToSchematicY(out.y - pins.y) - relay.h / 2),
  }
}

/**
 * Correção de profundidade do relé encaixado, no mesmo espírito do `mountDepthOffset`
 * do relé térmico: o Painel 3D calcula o aparelho sobre a calha padrão (5,5 mm);
 * aqui converte-se para a calha real da base e afunda os pinos até a face traseira
 * do relé encostar ao plano dos alvéolos (inserção de 16 mm; a cavidade visível tem
 * 7 mm e o restante do pino fica no interior da base, junto às molas de contacto).
 */
export function relaySocketMountDepthOffset(relay: ElectricalComponent, components: ElectricalComponent[]): number {
  if (!relay.mountedOn || !isPlugInRelay(relay)) return 0
  const socket = components.find((c) => c.id === relay.mountedOn && isRelaySocket(c))
  if (!socket) return 0
  const rail = socket.railId ? components.find((c) => c.id === socket.railId && isMountingRail(c.type)) : undefined
  const socketBaseZ = (rail ? dinRailProfileOf(rail.state).height : DIN_RAIL_15X55.height) * PANEL_UNITS_PER_MM + componentHalfExtents(socket).z
  const relayBaseZ = DIN_RAIL_15X55.height * PANEL_UNITS_PER_MM + componentHalfExtents(relay).z
  const out = meanTerminal(socket, ALVEOLO_LABELS, new THREE.Vector3(0, 0, socketBaseZ))
  const pins = meanTerminal(relay, PIN_LABELS, new THREE.Vector3(0, 0, relayBaseZ))
  if (!out || !pins) return 0
  return out.z - pins.z - PIN_LENGTH_MM * PANEL_UNITS_PER_MM
}

/** Base livre mais próxima em que o relé (na posição atual) encaixa, ou null. */
export function findSocketMountTarget(relay: ElectricalComponent, components: ElectricalComponent[]): { socket: ElectricalComponent; schematicX: number; schematicY: number } | null {
  if (!isPlugInRelay(relay)) return null
  const reach = SOCKET_MOUNT_REACH_MM * SCHEMATIC_PX_PER_MM
  let best: { socket: ElectricalComponent; schematicX: number; schematicY: number; d: number } | null = null
  for (const socket of components) {
    if (!isRelaySocket(socket)) continue
    // Uma base só aceita um relé (o próprio relé encaixado não conta como ocupante).
    if (components.some((c) => c.id !== relay.id && c.mountedOn === socket.id)) continue
    const at = relaySocketMountPosition(relay, socket)
    if (!at) continue
    const d = Math.hypot(at.schematicX - relay.schematicX, at.schematicY - relay.schematicY)
    if (d <= reach && (!best || d < best.d)) best = { socket, ...at, d }
  }
  return best && { socket: best.socket, schematicX: best.schematicX, schematicY: best.schematicY }
}

/** Repõe os relés plug-in na posição da sua base (e solta os que perderam a base). */
export function syncSocketMounted(components: ElectricalComponent[]): ElectricalComponent[] {
  let changed = false
  const next = components.map((component) => {
    // Cada sistema de encaixe trata só dos seus aparelhos (térmico: syncMounted; pente: syncCombMounted).
    if (!component.mountedOn || !isPlugInRelay(component)) return component
    const socket = components.find((c) => c.id === component.mountedOn && isRelaySocket(c))
    if (!socket) { changed = true; return { ...component, mountedOn: undefined } }
    const at = relaySocketMountPosition(component, socket)
    if (!at || (at.schematicX === component.schematicX && at.schematicY === component.schematicY && !component.railId)) return component
    changed = true
    return { ...component, ...at, railId: undefined, railOffsetMm: undefined, panel3DPosition: undefined }
  })
  return changed ? next : components
}

/** Ligações internas do encaixe (pino i do relé ↔ alvéolo Pi da base), para a simulação/diagnósticos. */
export function relaySocketMountBridges(components: ElectricalComponent[]): Wire[] {
  const bridges: Wire[] = []
  for (const relay of components) {
    if (!relay.mountedOn || !isPlugInRelay(relay)) continue
    const socket = components.find((c) => c.id === relay.mountedOn && isRelaySocket(c))
    if (!socket) continue
    for (const label of PIN_LABELS) {
      const pin = relay.terminals.find((t) => t.label === label)
      const alveolo = socket.terminals.find((t) => t.label === `P${label}`)
      if (!pin || !alveolo) continue
      bridges.push({ id: `mount-socket-${relay.id}-${label}`, fromTerminalId: alveolo.id, toTerminalId: pin.id, color: 'black', number: '' } as Wire)
    }
  }
  return bridges
}
