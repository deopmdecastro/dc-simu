import type { ComponentType, ElectricalComponent, Wire } from '../types'
export type SocketDeviceType = 'socketFamatelCombo' | 'socketFamatelSwitch' | 'socketEfapelIp65' | 'ceePlug16A'
export const isSocketDevice = (type: string): type is SocketDeviceType =>
  type === 'socketFamatelCombo' || type === 'socketFamatelSwitch' || type === 'socketEfapelIp65' || type === 'ceePlug16A'

/** Cotas nominais em mm (largura/altura do corpo, sem orelhas ou bucim).
 * Caixas industriais estimadas pela fotografia; flange FAMATEL 75×85 e
 * EFAPEL 64×74×51,7 segundo fichas indicadas.
 * Ficha CEE 16A 2P+T: corpo ~52×52, comprimento com bucim ~85 mm. */
export const SOCKET_DEVICES = {
  socketFamatelCombo: { width: 200, height: 150, depth: 128, caseDepth: 90, brand: 'FAMATEL', reference: '23331 (base CEE)', ip: 'IP44', source: 'https://famatel.com/wp-content/uploads/23230.pdf', estimatedEnvelope: true },
  socketFamatelSwitch: { width: 185, height: 115, depth: 112, caseDepth: 75, brand: 'RoadEu', reference: '70929', ip: 'IP44', source: 'https://roadeu.com/sklep/en/produkt/switched-16amp-socket-3p-230v-monophase-cee-socket-with-padlockable-power-isolator-ip44/', estimatedEnvelope: true },
  socketEfapelIp65: { width: 64, height: 74, depth: 51.7, caseDepth: 41.7, brand: 'EFAPEL', reference: '48132 C', ip: 'IP65', source: 'https://www.efapel.com/media/Aparelhagem-Estanque-624d711457614.pdf', estimatedEnvelope: false },
  ceePlug16A: { width: 52, height: 52, depth: 85, caseDepth: 70, brand: 'CEE', reference: 'Plug 16A 2P+T 230V IP44', ip: 'IP44', source: '', estimatedEnvelope: true },
} as const

/** Bornes de cablagem sob a tampa de serviço, distintos dos alvéolos da ficha. */
export function socketWiringPoint(type: SocketDeviceType, label: string): [number, number, number] {
  const d = SOCKET_DEVICES[type]
  if (type === 'ceePlug16A') {
    // Bornes no interior do corpo, lado do bucim (traseira da ficha)
    const idx = label === 'L' ? -1 : label === 'N' ? 1 : 0
    return [idx * 10, label === 'PE' ? -8 : 6, -d.depth / 2 + 18]
  }
  const labels = type === 'socketFamatelCombo' ? ['L1', 'L2', 'L3', 'N', 'PE'] : ['L', 'N', 'PE']
  const index = Math.max(0, labels.indexOf(label))
  return [(index - (labels.length - 1) / 2) * (type === 'socketEfapelIp65' ? 12 : 15), type === 'socketEfapelIp65' ? -22 : 0, -d.depth / 2 + 20]
}
export function socketWiringFraction(type: SocketDeviceType, label: string) {
  const p = socketWiringPoint(type, label), d = SOCKET_DEVICES[type]
  return { x: .5 + p[0] / d.width, y: .5 + p[1] / d.height, z: .5 + p[2] / d.depth }
}
export const socketOutletLabels = (type: ComponentType) =>
  type === 'socketFamatelCombo' ? ['S.L', 'S.N', 'S.PE', 'CEE.L1', 'CEE.L2', 'CEE.L3', 'CEE.N', 'CEE.PE'] : ['OUT.L', 'OUT.N', 'OUT.PE']

export function socketOutletPoint(type: SocketDeviceType, label: string): [number, number, number] {
  const d = SOCKET_DEVICES[type], front = -d.depth / 2 + d.caseDepth
  if (type === 'ceePlug16A') {
    // Pinos macho na face frontal da ficha. A ficha encaixa rodada 180° (a face frontal vira-se
    // para a tomada), por isso o padrão é o espelho do da tomada — cada pino cai no alvéolo certo.
    if (label === 'OUT.L' || label === 'L') return [9, 6, front + 8]
    if (label === 'OUT.N' || label === 'N') return [-9, 6, front + 8]
    return [0, -11, front + 8]
  }
  if (type === 'socketEfapelIp65') return [label.endsWith('.L') ? -9.5 : label.endsWith('.N') ? 9.5 : 0, label.endsWith('.PE') ? 16 : -2, d.depth / 2 - (label.endsWith('.PE') ? 15 : 23)]
  if (label.startsWith('S.')) return [-49 + (label === 'S.L' ? -9.5 : label === 'S.N' ? 9.5 : 0), label === 'S.PE' ? 24 : 6, front + (label === 'S.PE' ? 19 : 11)]
  if (type === 'socketFamatelSwitch') return [-47 + (label === 'OUT.L' ? -9 : label === 'OUT.N' ? 9 : 0), -3 + (label === 'OUT.PE' ? -11 : 6), front + 17]
  const xy: Record<string, [number,number]> = {'CEE.L1':[-11,8],'CEE.L2':[11,8],'CEE.L3':[-11,-8],'CEE.N':[11,-8],'CEE.PE':[0,-17]}
  const [x,y] = xy[label] ?? [0,0], a = Math.PI/18
  return [43+x,-10+y*Math.cos(a)-9*Math.sin(a),front+8+y*Math.sin(a)+9*Math.cos(a)]
}
export function socketOutletFraction(type: SocketDeviceType, label: string) {
  const p=socketOutletPoint(type,label),d=SOCKET_DEVICES[type]
  return {x:.5+p[0]/d.width,y:.5+p[1]/d.height,z:.5+p[2]/d.depth}
}

/** Curso de desencaixe da ficha CEE (pinos de 14 mm + folga): a ficha fica à frente da tomada. */
export const CEE_PLUG_PULL_MM = 90

/** Ficha encaixada? (por omissão sim — só `plugged: false` a desliga). */
export const isPlugInserted = (c: Pick<ElectricalComponent, 'type' | 'state'>) => c.type !== 'ceePlug16A' || c.state?.plugged !== false

/**
 * Contactos ficha ↔ tomada abertos: um condutor entre um borne de uma ficha CEE DESENCAIXADA e um
 * borne de uma tomada não conduz (os pinos estão fora dos alvéolos). Usado pelo motor elétrico,
 * pelas fases e pelo 3D (que deixa de desenhar esses contactos).
 */
export function openPlugContacts(components: ElectricalComponent[]): (w: Pick<Wire, 'fromTerminalId' | 'toTerminalId'>) => boolean {
  const unplugged = new Set<string>()
  const socketTerms = new Set<string>()
  for (const c of components) {
    if (c.type === 'ceePlug16A' && c.state?.plugged === false) for (const t of c.terminals) unplugged.add(t.id)
    else if (isSocketDevice(c.type) && c.type !== 'ceePlug16A') for (const t of c.terminals) socketTerms.add(t.id)
  }
  if (!unplugged.size) return () => false
  return (w) => (unplugged.has(w.fromTerminalId) && socketTerms.has(w.toTerminalId)) || (unplugged.has(w.toTerminalId) && socketTerms.has(w.fromTerminalId))
}
