/**
 * Encaixe plug-in relé de nível AVEL 411RNPD0023 ↔ base undecal Finder 90.23:
 * posição pelos alvéolos reais, íman, um relé por base, o relé acompanha a base,
 * inserção de 16 mm em profundidade e continuidade elétrica pino i → borne i.
 */
import './node-env'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createComponent, terminalByLabel } from '../src/electrical/factory'
import { computeContinuity, internalBridges, sourceTerminalIds } from '../src/electrical/engine'
import { computePhaseLabels } from '../src/electrical/phases'
import { updateIndustrialDevice, type IndustrialElectricalContext } from '../src/electrical/industrialDevices'
import {
  findSocketMountTarget,
  relaySocketMountBridges,
  relaySocketMountDepthOffset,
  relaySocketMountPosition,
  syncSocketMounted,
} from '../src/three/relaySocketMount'
import { componentHalfExtents } from '../src/three/panelBounds'
import { componentPanelXY } from '../src/three/panelLayout'
import { terminalWorld3D } from '../src/three/terminal3D'
import { PANEL_UNITS_PER_MM } from '../src/three/modelPaths'
import { DIN_RAIL_15X55 } from '../src/three/dinRailGeometry'
import { useSimStore } from '../src/store/useSimStore'
import type { ElectricalComponent, Wire } from '../src/types'

let checks = 0
const check = (ok: unknown, message: string) => { assert.ok(ok, message); console.log(`PASS — ${message}`); checks++ }
const tid = (c: ElectricalComponent, label: string) => { const t = terminalByLabel(c, label); assert.ok(t, `${c.type}.${label}`); return t.id }

const socket = createComponent('relaySocketFinder9023', 'X1', 'Base undecal Finder 90.23')
Object.assign(socket, { schematicX: 800, schematicY: 600 })
const relay = createComponent('levelRelayAvel411', 'KN1', 'Relé de nível AVEL')

// Posição de encaixe: o centro do círculo de pinos fica sobre o centro do círculo de alvéolos.
const at = relaySocketMountPosition(relay, socket)!
check(!!at, 'a posição de encaixe é calculada a partir dos alvéolos reais')
{
  const socketCenter = componentPanelXY(socket)
  const relayCenter = componentPanelXY({ ...relay, ...at })
  const alveolos = socket.terminals.filter((t) => t.label.startsWith('P'))
  const pins = relay.terminals.filter((t) => !t.label.startsWith('P'))
  const mean = (c: ElectricalComponent, ts: typeof socket.terminals, pivot: THREE.Vector3) =>
    ts.reduce((acc, t) => acc.add(terminalWorld3D(c, t, pivot)), new THREE.Vector3()).multiplyScalar(1 / ts.length)
  const a = mean(socket, alveolos, new THREE.Vector3(socketCenter.x, socketCenter.y, 0))
  const p = mean({ ...relay, ...at }, pins, new THREE.Vector3(relayCenter.x, relayCenter.y, 0))
  check(Math.hypot(a.x - p.x, a.y - p.y) < 0.02, `círculo de pinos centrado no círculo de alvéolos (desvio ${(Math.hypot(a.x - p.x, a.y - p.y) / PANEL_UNITS_PER_MM).toFixed(2)} mm)`)
}

// Profundidade: com os dois aparelhos na calha padrão, a ponta dos pinos fica 16 mm abaixo da boca dos alvéolos.
{
  const mounted = { ...relay, ...at, mountedOn: socket.id }
  const base = DIN_RAIL_15X55.height * PANEL_UNITS_PER_MM
  const offset = relaySocketMountDepthOffset(mounted, [socket, mounted])
  check(offset !== 0, 'há correção de profundidade para o encaixe')
  const socketPivot = new THREE.Vector3(0, 0, base + componentHalfExtents(socket).z)
  const relayPivot = new THREE.Vector3(0, 0, base + componentHalfExtents(mounted).z + offset)
  const mouths = ['P1', 'P6', 'P11'].map((l) => terminalWorld3D(socket, socket.terminals.find((t) => t.label === l)!, socketPivot).z)
  const tips = ['1', '6', '11'].map((l) => terminalWorld3D(mounted, mounted.terminals.find((t) => t.label === l)!, relayPivot).z)
  const insertion = mouths.map((z, i) => (z - tips[i]) / PANEL_UNITS_PER_MM)
  check(insertion.every((d) => Math.abs(d - 16) < 0.05), `pinos totalmente inseridos (inserção ${insertion.map((v) => v.toFixed(1)).join('/')} mm)`)
  // A caixa do relé inclui os pinos: a face plástica de encosto fica 16 mm (comprimento do pino)
  // à frente das pontas — com inserção total, essa face fica exatamente no plano dos alvéolos.
  const socketMouthZ = mouths[0]
  const relayPlasticBaseZ = relayPivot.z - componentHalfExtents(mounted).z + 16 * PANEL_UNITS_PER_MM
  check(Math.abs(socketMouthZ - relayPlasticBaseZ) < 0.02, 'a face de encosto do relé assenta no plano dos alvéolos (sem folga visível)')
}

// Íman: perto encaixa; longe não; uma base só aceita um relé.
{
  const near = { ...relay, schematicX: socket.schematicX + 20, schematicY: socket.schematicY + 18 }
  const hit = findSocketMountTarget(near, [socket, near])
  check(hit?.socket.id === socket.id && hit.schematicX === at.schematicX && hit.schematicY === at.schematicY, 'largado perto da base, o relé encaixa')
  const far = { ...relay, schematicX: socket.schematicX + 400, schematicY: socket.schematicY }
  check(!findSocketMountTarget(far, [socket, far]), 'longe da base não encaixa')
  const other = { ...createComponent('levelRelayAvel411', 'KN2'), id: 'kn2', mountedOn: socket.id }
  check(!findSocketMountTarget(near, [socket, near, other]), 'uma base ocupada não aceita outro relé')
}

// Sincronização: o relé acompanha a base; sem base, fica solto.
{
  const mounted = { ...relay, ...at, mountedOn: socket.id }
  const movedSocket = { ...socket, schematicX: socket.schematicX + 60, schematicY: socket.schematicY - 30 }
  const synced = syncSocketMounted([movedSocket, mounted])
  const after = synced.find((c) => c.id === relay.id)!
  check(after.schematicX === at.schematicX + 60 && after.schematicY === at.schematicY - 30, 'mover a base leva o relé encaixado')
  const stable = [socket, mounted]
  check(syncSocketMounted(stable) === stable, 'sem mudanças, a sincronização não cria componentes novos')
  const dropped = syncSocketMounted([mounted])
  check(!dropped.find((c) => c.id === relay.id)!.mountedOn, 'apagada a base, o relé fica solto')
}

// Pontes internas: pino i ↔ alvéolo Pi; a base ponteia Pi ↔ i.
{
  const mounted = { ...relay, ...at, mountedOn: socket.id }
  const bridges = relaySocketMountBridges([socket, mounted])
  check(bridges.length === 11, 'onze ligações internas pino↔alvéolo')
  const pairs = bridges.map((w) => `${w.fromTerminalId}>${w.toTerminalId}`).sort()
  const expected = Array.from({ length: 11 }, (_, i) => `${tid(socket, 'P' + (i + 1))}>${tid(relay, String(i + 1))}`).sort()
  check(JSON.stringify(pairs) === JSON.stringify(expected), 'pino 1→P1 … pino 11→P11')
  const internal = internalBridges(mounted)
  check(expected.every((pair) => { const [b, a] = pair.split('>'); return internal.some(([x, y]) => x === a && y === b) }), 'o motor elétrico inclui as pontes do encaixe')
  check(relaySocketMountBridges([socket, { ...relay, mountedOn: undefined } as ElectricalComponent]).length === 0, 'relé solto não tem pontes de encaixe')
}

// Continuidade de ponta a ponta: alimentar os bornes 2/10 da base alimenta a bobina 2–10 do relé encaixado.
{
  const ac = createComponent('powerSource1ph', 'F0', 'Rede 230 V')
  ac.state.nominalV = 230
  const mounted = { ...relay, ...at, mountedOn: socket.id }
  const wires: Wire[] = [
    { id: 'w1', fromTerminalId: tid(ac, 'L'), toTerminalId: tid(socket, '2'), color: '#1f2937', gauge: '1.5mm²', kind: 'power', flexibility: 'flexible', route: 'straight', bend: .5, energized: false } as Wire,
    { id: 'w2', fromTerminalId: tid(ac, 'N'), toTerminalId: tid(socket, '10'), color: '#1f2937', gauge: '1.5mm²', kind: 'power', flexibility: 'flexible', route: 'straight', bend: .5, energized: false } as Wire,
  ]
  const comps = [ac, socket, mounted]
  const graph = computeContinuity(comps, wires, sourceTerminalIds(comps, undefined, wires))
  const ctx: IndustrialElectricalContext = { components: comps, adjacency: graph.reachable, live: graph.energizedTerminals, phases: computePhaseLabels(comps, wires) }
  const scanned = { ...mounted, state: { ...mounted.state, probeMode: 'virtual', wellMinWet: true, wellMaxWet: true } }
  updateIndustrialDevice(scanned, ctx, 100)
  check(scanned.state.powered === true && scanned.state.energized === true, '230 V nos bornes 2/10 da base alimenta a bobina 2–10 do relé encaixado (encher depósito)')
  const loose = { ...relay, state: { ...relay.state, probeMode: 'virtual' } }
  updateIndustrialDevice(loose, { components: [loose], adjacency: new Map(), live: new Set(), phases: new Map() } as unknown as IndustrialElectricalContext, 100)
  check(loose.state.powered === false, 'relé solto (sem base nem cabos) não inventa alimentação')
}

// Integração na store: ação de encaixar posiciona, marca mountedOn e fixa a orientação;
// desencaixar liberta e afasta o relé da base.
{
  const store = useSimStore.getState()
  store.loadJSON(JSON.stringify({ app: 'dc-simu', version: 6, components: [socket, relay], wires: [] }))
  const rid = relay.id
  useSimStore.getState().mountRelayOnSocket(rid, socket.id)
  let live = useSimStore.getState().components.find((c) => c.id === rid)!
  check(live.mountedOn === socket.id && live.schematicX === at.schematicX && live.schematicY === at.schematicY, 'store: «Encaixar agora» posiciona o relé na base')
  // Um relé rodado/espelhado volta à orientação de encaixe (chave de polarização).
  useSimStore.setState((s) => ({ components: s.components.map((c) => (c.id === rid ? { ...c, rotation: 90, mirrored: true, mountedOn: undefined } : c)) }))
  useSimStore.getState().mountRelayOnSocket(rid, socket.id)
  live = useSimStore.getState().components.find((c) => c.id === rid)!
  check(live.rotation === 0 && !live.mirrored && live.mountedOn === socket.id, 'a chave de polarização repõe a orientação ao encaixar')
  useSimStore.getState().unmountRelayFromSocket(rid)
  live = useSimStore.getState().components.find((c) => c.id === rid)!
  check(!live.mountedOn && (live.schematicX !== at.schematicX || live.schematicY !== at.schematicY), 'store: «Desencaixar» liberta o relé e afasta-o da base')
  useSimStore.getState().stop()
}

console.log(`\n${checks} verificações do encaixe relé plug-in ↔ base undecal passaram`)
