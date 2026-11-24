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
import type { ComponentType, ElectricalComponent, Wire } from '../types'
import { component3DDimensions, terminalWorld3D } from './terminal3D'
import { REAL_TERMINALS } from '../electrical/realInterfaces'
import { componentPanelXY, panelToSchematicX, panelToSchematicY } from './panelLayout'
import { PANEL_UNITS_PER_MM, SCHEMATIC_PX_PER_MM } from './modelPaths'
import { componentHalfExtents } from './panelBounds'
import { COMB_CONNECTOR, combBusbarDimsOf, combConnectorBladeTipMm, combConnectorTerminalSpecs, combTerminalConductorOf, type CombConductor } from './combBusbarParts'

/** Tipos de disjuntor / diferencial / proteção que aceitam pente nos bornes superiores.
 * Inclui genéricos, Schneider Acti9, Hager, Steck, motor e residuais.
 * Qualquer tipo que tenha bornes de entrada topo compatíveis (1/3/5… ou N1) pode ser adicionado aqui.
 */
const BREAKER_TYPES = new Set([
  'breaker1p',
  'breaker2p',
  'breaker3p',
  'breaker4p',
  'breakerSteckSdC25',
  'breakerSchneiderIc60h1p',
  'residualBreaker',
  'residualBreakerHagerCfc225p',
  'residualBreakerSchneiderIid4p',
  'residualBreakerSchneiderIdpnVigi',
  'motorBreaker',
  'motorBreakerPkzmC10',
  'motorBreakerSchneiderGv2me',
  'phoenixEcb3000760',
  'surgeProtectorWegSpw02',
  'surgeProtectorWegSpw12',
  'surgeProtectorSchneiderIprd',
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
  // Rótulos têm de existir nos bornes reais do componente (N1, não "N"), na
  // ordem física esquerda→direita medida no CAD — o pente alinha os pinos por
  // esta ordem e o conector usa o primeiro como borne preferido.
  if (breaker.type === 'residualBreakerHagerCfc225p') return ['1', 'N1']
  if (breaker.type === 'residualBreakerSchneiderIdpnVigi') return ['N1', '1']
  if (breaker.type === 'residualBreakerSchneiderIid4p') return ['N1', '1', '3', '5']
  if (breaker.type === 'residualBreaker') return ['1', '3', '5', 'N1']
  if (breaker.type === 'phoenixEcb3000760') return ['Line+']
  if (breaker.type === 'breakerSchneiderIc60h1p') return ['1']
  if (breaker.type === 'surgeProtectorWegSpw02' || breaker.type === 'surgeProtectorSchneiderIprd') return ['L']
  if (breaker.type === 'surgeProtectorWegSpw12') return ['+', '-']
  if (breaker.type === 'motorBreakerPkzmC10' || breaker.type === 'motorBreakerSchneiderGv2me' || breaker.type === 'motorBreaker') {
    return ['1', '3', '5']
  }
  const poles = Number(breaker.state?.poles) || (
    breaker.type === 'breaker1p' || breaker.type === 'breakerSteckSdC25' ? 1
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

/** Actual end of the rendered blade/tooth, transformed with the component.
 * User terminal edits retain their electrical identity but cannot move metal.
 */
export function combPhysicalTipWorld3D(component: ElectricalComponent, label: string, pivot: THREE.Vector3): THREE.Vector3 | null {
  let point: [number, number, number]
  if (isCombConnector(component)) point = combConnectorBladeTipMm(component.state)
  else {
    const dims = combBusbarDimsOf(component.state), tooth = dims.teeth.find(t => t.label === label)
    if (!tooth) return null
    point = [tooth.xMm, dims.pinTipYMm, dims.pinPlaneZMm]
  }
  const size = component3DDimensions(component)
  const position3D = { x: .5 + point[0] * PANEL_UNITS_PER_MM / size.x,
    y: .5 + point[1] * PANEL_UNITS_PER_MM / size.y, z: .5 + point[2] * PANEL_UNITS_PER_MM / size.z }
  const terminal = component.terminals.find(t => t.label === label)
  return terminal ? terminalWorld3D(component, { ...terminal, position3D }, pivot) : null
}

function meanPhysicalTips(component: ElectricalComponent, labels: string[], pivot: THREE.Vector3): THREE.Vector3 | null {
  const points = labels.map(label => combPhysicalTipWorld3D(component, label, pivot))
  if (!points.length || points.some(p => !p)) return null
  return points.reduce<THREE.Vector3>((sum, p) => sum.add(p!), new THREE.Vector3()).multiplyScalar(1 / points.length)
}

/** Local clamp lanes verified against the rendered CAD, sampling the entire
 * blade width/thickness, not just its centre. Offsets are from each calibrated
 * mouth. Hager / Phoenix have a shallow rear seat; a universal 10 mm insertion
 * there pierced the stepped clamp. This is visual fit, not an accessory rating.
 */
const TOP_CLAMP_LANES: Partial<Record<ComponentType, { combZ: number; feedZ: number; combInsert: number; feedInsert: number }>> = {
  breaker1p: { combZ: -2.3, feedZ: 2.7, combInsert: 10, feedInsert: 10 },
  breaker2p: { combZ: -2.3, feedZ: 2.7, combInsert: 10, feedInsert: 10 },
  breaker3p: { combZ: -2.3, feedZ: 2.7, combInsert: 10, feedInsert: 10 },
  // Genéricos 4P/DR/QM e DPS WEG partilham a boca de borne Easy9 (REAL_TERMINALS
  // acima): mesmas pistas de pente/alimentador, mesma inserção de 10 mm.
  breaker4p: { combZ: -2.3, feedZ: 2.7, combInsert: 10, feedInsert: 10 },
  residualBreaker: { combZ: -2.3, feedZ: 2.7, combInsert: 10, feedInsert: 10 },
  motorBreaker: { combZ: -2.3, feedZ: 2.7, combInsert: 6, feedInsert: 6 },
  breakerSteckSdC25: { combZ: -4.5, feedZ: -1.5, combInsert: 10, feedInsert: 10 },
  residualBreakerHagerCfc225p: { combZ: -1, feedZ: 2, combInsert: 4, feedInsert: 10 },
  phoenixEcb3000760: { combZ: -1.5, feedZ: 1, combInsert: 4, feedInsert: 10 },
  // Acti9 iC60/iID/iDPN: bocas de borne da mesma família Easy9 (poço de ~9 mm),
  // oficialmente compatíveis com pentes A9XPH. Pistas calibradas por raycast no
  // GLB medido (gaiola ~5 mm, boca do borne no centro; v. probe de encaixe).
  breakerSchneiderIc60h1p: { combZ: -2.3, feedZ: 2.7, combInsert: 10, feedInsert: 10 },
  residualBreakerSchneiderIid4p: { combZ: -1.3, feedZ: 1.3, combInsert: 10, feedInsert: 10 },
  residualBreakerSchneiderIdpnVigi: { combZ: -1, feedZ: 1, combInsert: 10, feedInsert: 10 },
  // DPS WEG SPW: bornes L/PE e +/-/PE na face posterior do topo; o raycast mede
  // a gaiola entre +2,8 e +8 mm — o conector de fase usa o borne L/+.
  surgeProtectorWegSpw02: { combZ: 4.5, feedZ: 5.5, combInsert: 10, feedInsert: 10 },
  surgeProtectorSchneiderIprd: { combZ: 4.5, feedZ: 5.5, combInsert: 10, feedInsert: 10 },
  surgeProtectorWegSpw12: { combZ: 4.5, feedZ: 5.5, combInsert: 10, feedInsert: 10 },
  // Disjuntores-motor (Eaton PKZM / TeSys GV2 com barramentos B3.0/GV2G): a
  // lâmina entra pela cavidade posterior (z<0); poço de borne de 6,5 mm —
  // inserção curta de 6 mm, nunca os 10 mm dos Easy9.
  motorBreakerPkzmC10: { combZ: -2.3, feedZ: -0.8, combInsert: 6, feedInsert: 6 },
  motorBreakerSchneiderGv2me: { combZ: -3.5, feedZ: -3.4, combInsert: 6, feedInsert: 6 },
}

export function breakerMountInsertionMm(breaker: ElectricalComponent, role: 'comb' | 'feed'): number {
  const lanes = TOP_CLAMP_LANES[breaker.type]
  return (role === 'comb' ? lanes?.combInsert : lanes?.feedInsert)
    ?? (role === 'comb' ? COMB_PIN_INSERT_MM : COMB_CONNECTOR_PIN_INSERT_MM)
}

/** Two insertion lanes of the SAME electrical clamp. The comb uses its rear
 * portion; the feeder blade enters the conductor lane in front. These are not
 * extra electrical terminals, nor the circular front screwdriver access.
 * Lane centres stay inside the measured upper mouth (Easy9: ~9 mm deep).
 */
export function breakerMountMouthWorld3D(
  breaker: ElectricalComponent,
  label: string,
  role: 'comb' | 'feed',
  pivot: THREE.Vector3,
): THREE.Vector3 | null {
  const terminal = breaker.terminals.find(t => t.label === label)
  if (!terminal) return null
  const spot = REAL_TERMINALS[breaker.type]?.find(t => t.label === label && t.face === 'top')
  if (!spot) return terminalWorld3D(breaker, terminal, pivot)
  const depthMm = component3DDimensions(breaker).z / PANEL_UNITS_PER_MM
  const lanes = TOP_CLAMP_LANES[breaker.type]
  const laneMm = (role === 'comb' ? lanes?.combZ : lanes?.feedZ) ?? 0
  const mouth = { x: spot.x, y: 1 - spot.y, z: spot.z + laneMm / depthMm }
  return terminalWorld3D(breaker, { ...terminal, position3D: mouth }, pivot)
}

function meanMountMouth(breaker: ElectricalComponent, labels: string[], role: 'comb' | 'feed', pivot: THREE.Vector3): THREE.Vector3 | null {
  const points = labels.map(label => breakerMountMouthWorld3D(breaker, label, role, pivot))
  if (!points.length || points.some(p => !p)) return null
  return points.reduce<THREE.Vector3>((sum, p) => sum.add(p!), new THREE.Vector3()).multiplyScalar(1 / points.length)
}

/** A mounted top feeder must point down. Rebuild its physical defaults while
 * retaining terminal IDs, wire references and user-pinned endpoints. This also
 * repairs old saved mounts with an upward pin / a clamped, off-mesh Z position.
 */
export function prepareCombConnectorForTopMount(component: ElectricalComponent): ElectricalComponent {
  const state = { ...component.state, pinDirection: 'down' }
  const specs = combConnectorTerminalSpecs(state)
  const known = (['down', 'up'] as const).flatMap(pinDirection => (['cranked', 'straight'] as const).flatMap(pinStyle => {
    const defaults = combConnectorTerminalSpecs({ ...component.state, pinDirection, pinStyle })
    const legacy = defaults.map(spec => {
      const position3D = { ...spec.position3D }
      if (spec.label === 'PINO') position3D.z = Math.max(.05, position3D.z - 2.5 / COMB_CONNECTOR.depthMm)
      else position3D.y += (pinDirection === 'down' ? 1 : -1) * .55 / COMB_CONNECTOR.heightMm
      return { ...spec, position3D, socket3D: { ...spec.socket3D, position: { ...position3D } } }
    })
    return [...defaults, ...legacy]
  }))
  const same = (a: unknown, b: unknown): boolean => {
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 2e-5
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      const aa = a as Record<string, unknown>, bb = b as Record<string, unknown>
      return Object.keys(bb).every(key => same(aa[key], bb[key]))
    }
    return a === b
  }
  let changed = component.state.pinDirection !== 'down'
  const terminals = component.terminals.map(terminal => {
    const spec = specs.find(s => s.label === terminal.label)
    if (!spec || terminal.pinned || !known.some(old => old.label === terminal.label
      && same(terminal.position3D, old.position3D)
      && (!terminal.socket3D || same(terminal.socket3D, old.socket3D))
      && (!terminal.face || terminal.face === old.face))) return terminal
    if (same(terminal.position3D, spec.position3D) && same(terminal.socket3D, spec.socket3D) && terminal.face === spec.face) return terminal
    changed = true
    return { ...terminal, position3D: { ...spec.position3D }, socket3D: { ...spec.socket3D,
      normal: [...spec.socket3D.normal] as [number, number, number], position: { ...spec.socket3D.position } }, face: spec.face }
  })
  return changed ? { ...component, state, terminals } : component
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
  const socket = meanMountMouth(breaker, inputs, 'comb', new THREE.Vector3(x, y, 0))
  // Usar os primeiros N pinos alinhados com o âncora (da esquerda)
  const pinLabels = pins.slice(0, inputs.length).map((t) => t.label)
  const pinCenter = meanPhysicalTips(comb, pinLabels, new THREE.Vector3(0, 0, 0))
  if (!socket || !pinCenter) return null

  // Pinos inseridos nos bornes de topo do disjuntor
  const targetCx = socket.x - pinCenter.x
  const targetCy = socket.y - pinCenter.y - breakerMountInsertionMm(breaker, 'comb') * PANEL_UNITS_PER_MM
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
  connector = prepareCombConnectorForTopMount(connector)
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

  const socket = breakerMountMouthWorld3D(breaker, targetLabel, 'feed', new THREE.Vector3(x, y, 0))
  if (!socket) return null
  const pinoCenter = combPhysicalTipWorld3D(connector, 'PINO', new THREE.Vector3(0, 0, 0))
  if (!pinoCenter) return null

  const targetCx = socket.x - pinoCenter.x
  const targetCy = socket.y - pinoCenter.y - breakerMountInsertionMm(breaker, 'feed') * PANEL_UNITS_PER_MM
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
    const socket = meanMountMouth(
      breaker,
      inputs,
      'comb',
      new THREE.Vector3(0, 0, componentHalfExtents(breaker).z),
    )
    const pin = meanPhysicalTips(
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
    const socket = breakerMountMouthWorld3D(breaker, socketLabel, 'feed', new THREE.Vector3(0, 0, componentHalfExtents(breaker).z))
    const pino = combPhysicalTipWorld3D(component, 'PINO', new THREE.Vector3(0, 0, componentHalfExtents(component).z))
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
    if (isCombConnector(component)) {
      const prepared = prepareCombConnectorForTopMount(component)
      if (prepared !== component) { changed = true; component = prepared }
    }
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
