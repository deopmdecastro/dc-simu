import type { ElectricalComponent, Terminal } from '../types'

/**
 * Projeta os bornes padrão do LOGO! sobre os parafusos reais da captura
 * frontal ortográfica gerada a partir do GLB. Os pontos de cada relé não são
 * uniformes, por isso usam centros medidos em vez do SVG simbólico antigo.
 * Bornes deslocados manualmente no inspetor continuam na posição do utilizador.
 */
export function logoTerminalLocal(c: ElectricalComponent, t: Terminal): { x: number; y: number } {
  const ordinary = { x: t.x * c.w, y: t.y * c.h }
  if (c.type !== 'plcSiemensLogo1224RC') return ordinary

  const top = ['L+', 'M', 'I0.0', 'I0.1', 'I0.2', 'I0.3', 'I0.4', 'I0.5', 'I0.6', 'I0.7', 'X1']
  const topIndex = top.indexOf(t.label)
  const bottomIndex = ['Q0.0', 'Q0.1', 'Q0.2', 'Q0.3'].indexOf(t.label.replace(/·2$/, ''))
  const secondScrew = t.label.endsWith('·2')
  const isTopDefault = topIndex >= 0 && Math.abs(t.x - (topIndex === 10 ? 0.98 : 0.06 + topIndex * 0.88 / 9)) < 0.002 && Math.abs(t.y) < 0.002
  const isBottomDefault = bottomIndex >= 0 && Math.abs(t.x - ((secondScrew ? 0.21 : 0.16) + bottomIndex * 0.24)) < 0.002 && Math.abs(t.y - 1) < 0.002
  if (!isTopDefault && !isBottomDefault) return ordinary

  // A captura ortográfica adaptativa já tem o mesmo aspect ratio do footprint;
  // estes centros normalizados coincidem diretamente com os parafusos.
  return isTopDefault
    ? { x: c.w * (0.154 + topIndex * 0.584 / 9), y: c.h * 0.101 }
    : { x: c.w * (0.178 + bottomIndex * 0.189 + (secondScrew ? 0.065 : 0)), y: c.h * 0.873 }
}
