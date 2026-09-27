import type { ElectricalComponent, Terminal } from '../types'

/**
 * Projeta os bornes padrão do LOGO! sobre os parafusos reais da fotografia
 * frontal gerada a partir do GLB. A imagem é centrada com `meet` em w × h;
 * portanto não basta usar t.x*w e t.y*h (que eram coordenadas do SVG largo).
 * Bornes deslocados manualmente no inspetor continuam na posição do utilizador.
 */
export function logoTerminalLocal(c: ElectricalComponent, t: Terminal): { x: number; y: number } {
  const ordinary = { x: t.x * c.w, y: t.y * c.h }
  if (c.type !== 'plcSiemensLogo1224RC') return ordinary

  const top = ['L+', 'M', 'I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8']
  const topIndex = top.indexOf(t.label)
  const bottomIndex = ['Q1', 'Q2', 'Q3', 'Q4'].indexOf(t.label)
  const isTopDefault = topIndex >= 0 && Math.abs(t.x - (0.06 + topIndex * 0.88 / 9)) < 0.002 && Math.abs(t.y) < 0.002
  const isBottomDefault = bottomIndex >= 0 && Math.abs(t.x - (0.16 + bottomIndex * 0.24)) < 0.002 && Math.abs(t.y - 1) < 0.002
  if (!isTopDefault && !isBottomDefault) return ordinary

  // Dimensões da imagem GLB transparente (560 × 720), como no SchematicView.
  const imageW = Math.min(c.w, c.h * 560 / 720)
  const imageH = Math.min(c.h, c.w * 720 / 560)
  const left = (c.w - imageW) / 2
  const topY = (c.h - imageH) / 2
  // Parafusos visíveis: L+/M/I1..I8 na tira superior; Q1..Q4 no centro
  // dos quatro pares de contactos inferiores. Coordenadas relativas ao PNG.
  return isTopDefault
    ? { x: left + imageW * (0.174 + topIndex * 0.612 / 9), y: topY + imageH * 0.132 }
    : { x: left + imageW * (0.229 + bottomIndex * 0.177), y: topY + imageH * 0.851 }
}
