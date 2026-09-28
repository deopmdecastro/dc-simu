import type { ElectricalComponent, Terminal } from '../types'

// Posição física na vista frontal 560 × 720 gerada do GLB do contator WEG.
// As cinco colunas de parafusos foram medidas na projeção frontal do modelo
// (1L1/2T1, 3L2/4T2, 5L3/6T3, 13-14 e 21-22 — a mesma ordem impressa no
// aparelho); a bobina A1/A2 fica no flanco frontal esquerdo.
const positions: Record<string, [number, number]> = {
  '1L1': [0.2545, 0.195], '3L2': [0.4176, 0.195], '5L3': [0.5720, 0.195],
  '13': [0.7353, 0.195], '14': [0.8083, 0.195],
  '2T1': [0.2545, 0.700], '4T2': [0.4176, 0.700], '6T3': [0.5720, 0.700],
  '21': [0.7353, 0.700], '22': [0.8083, 0.700],
  A1: [0.175, 0.320], A2: [0.175, 0.870],
}

/** Posições do template (malha do esquema), usadas só para detetar o padrão por omissão. */
const template: Record<string, [number, number]> = {
  '1L1': [0.20, 0], '3L2': [0.36, 0], '5L3': [0.52, 0], '13': [0.68, 0], '14': [0.84, 0],
  '2T1': [0.20, 1], '4T2': [0.36, 1], '6T3': [0.52, 1], '21': [0.68, 1], '22': [0.84, 1],
  A1: [0.06, 0.18], A2: [0.06, 0.82],
}

export function wegTerminalLocal(c: ElectricalComponent, t: Terminal) {
  const ordinary = { x: t.x * c.w, y: t.y * c.h }
  if (c.type !== 'contactorWegCWC09') return ordinary
  const expected = template[t.label]
  const point = positions[t.label]
  if (!expected || !point || Math.abs(t.x - expected[0]) > 0.002 || Math.abs(t.y - expected[1]) > 0.002) return ordinary
  const width = Math.min(c.w, (c.h * 560) / 720)
  const height = Math.min(c.h, (c.w * 720) / 560)
  return { x: (c.w - width) / 2 + point[0] * width, y: (c.h - height) / 2 + point[1] * height }
}
