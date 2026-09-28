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

  const top = ['L+', 'M', 'I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8', 'X1']
  const topIndex = top.indexOf(t.label)
  const bottomIndex = ['Q1', 'Q2', 'Q3', 'Q4'].indexOf(t.label.replace(/\.2$/, ''))
  const secondScrew = t.label.endsWith('.2')
  const isTopDefault = topIndex >= 0 && Math.abs(t.x - (topIndex === 10 ? 0.98 : 0.06 + topIndex * 0.88 / 9)) < 0.002 && Math.abs(t.y) < 0.002
  const isBottomDefault = bottomIndex >= 0 && Math.abs(t.x - ((secondScrew ? 0.21 : 0.16) + bottomIndex * 0.24)) < 0.002 && Math.abs(t.y - 1) < 0.002
  if (!isTopDefault && !isBottomDefault) return ordinary

  // Dimensões da imagem GLB transparente (560 × 720), como no SchematicView.
  const imageW = Math.min(c.w, c.h * 560 / 720)
  const imageH = Math.min(c.h, c.w * 720 / 560)
  const left = (c.w - imageW) / 2
  const topY = (c.h - imageH) / 2
  // Centros medidos no PNG 560×720: os alvos devem coincidir com a cabeça
  // dos parafusos, não com a etiqueta impressa nem com a borda do aparelho.
  // A primeira/última saída não têm a mesma margem que os bornes centrais.
  return isTopDefault
    ? { x: left + imageW * (0.154 + topIndex * 0.584 / 9), y: topY + imageH * 0.101 }
    : { x: left + imageW * (0.178 + bottomIndex * 0.189 + (secondScrew ? 0.065 : 0)), y: topY + imageH * 0.873 }
}
