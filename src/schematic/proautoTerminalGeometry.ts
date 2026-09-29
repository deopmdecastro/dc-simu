import type { ElectricalComponent, Terminal } from '../types'

// Centros físicos na captura frontal adaptativa. A ficha mostra os pinos 6→1
// da esquerda para a direita na fila superior.
const positions: Record<string, [number, number]> = {
  '-V2': [0.18, 0.105], '-V1': [0.31, 0.105],
  '+V2': [0.44, 0.105], '+V1': [0.57, 0.105],
  RDY2: [0.70, 0.105], RDY1: [0.83, 0.105],
  PE: [0.30, 0.895], L: [0.50, 0.895], N: [0.70, 0.895],
}
const template: Record<string, [number, number]> = {
  '-V2': [0.18, 0], '-V1': [0.31, 0], '+V2': [0.44, 0], '+V1': [0.57, 0],
  RDY2: [0.70, 0], RDY1: [0.83, 0], PE: [0.30, 1], L: [0.50, 1], N: [0.70, 1],
}

export function proautoTerminalLocal(c: ElectricalComponent, t: Terminal) {
  const ordinary = { x: t.x * c.w, y: t.y * c.h }
  if (c.type !== 'powerSupplyProauto24A') return ordinary
  const expected = template[t.label]
  const point = positions[t.label]
  if (!expected || !point || Math.abs(t.x - expected[0]) > 0.002 || Math.abs(t.y - expected[1]) > 0.002) return ordinary
  return { x: point[0] * c.w, y: point[1] * c.h }
}
