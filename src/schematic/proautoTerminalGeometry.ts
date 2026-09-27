import type { ElectricalComponent, Terminal } from '../types'

// Posição física na vista frontal 560×720 gerada do GLB. A vista do fabricante
// (ficha p. 3) mostra os pinos 6→1 da esquerda para a direita em cima.
const positions: Record<string, [number, number]> = {
  '-V2': [0.355, 0.105], '-V1': [0.413, 0.105],
  '+V2': [0.471, 0.105], '+V1': [0.529, 0.105],
  RDY2: [0.587, 0.105], RDY1: [0.645, 0.105],
  PE: [0.405, 0.895], L: [0.5, 0.895], N: [0.595, 0.895],
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
  const width = Math.min(c.w, c.h * 560 / 720)
  const height = Math.min(c.h, c.w * 720 / 560)
  return { x: (c.w - width) / 2 + point[0] * width, y: (c.h - height) / 2 + point[1] * height }
}
