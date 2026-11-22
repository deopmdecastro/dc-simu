import type { ComponentType } from '../types'
export type SocketDeviceType = 'socketFamatelCombo' | 'socketFamatelSwitch' | 'socketEfapelIp65'
export const isSocketDevice = (type: string): type is SocketDeviceType =>
  type === 'socketFamatelCombo' || type === 'socketFamatelSwitch' || type === 'socketEfapelIp65'

/** Cotas nominais em mm (largura/altura do corpo, sem orelhas ou bucim).
 * Caixas industriais estimadas pela fotografia; flange FAMATEL 75×85 e
 * EFAPEL 64×74×51,7 segundo fichas indicadas. */
export const SOCKET_DEVICES = {
  socketFamatelCombo: { width: 200, height: 150, depth: 128, caseDepth: 90, brand: 'FAMATEL', reference: '23331 (base CEE)', ip: 'IP44', source: 'https://famatel.com/wp-content/uploads/23230.pdf', estimatedEnvelope: true },
  socketFamatelSwitch: { width: 185, height: 115, depth: 112, caseDepth: 75, brand: 'RoadEu', reference: '70929', ip: 'IP44', source: 'https://roadeu.com/sklep/en/produkt/switched-16amp-socket-3p-230v-monophase-cee-socket-with-padlockable-power-isolator-ip44/', estimatedEnvelope: true },
  socketEfapelIp65: { width: 64, height: 74, depth: 51.7, caseDepth: 41.7, brand: 'EFAPEL', reference: '48132 C', ip: 'IP65', source: 'https://www.efapel.com/media/Aparelhagem-Estanque-624d711457614.pdf', estimatedEnvelope: false },
} as const

/** Bornes de cablagem sob a tampa de serviço, distintos dos alvéolos da ficha. */
export function socketWiringPoint(type: SocketDeviceType, label: string): [number, number, number] {
  const d = SOCKET_DEVICES[type]
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
