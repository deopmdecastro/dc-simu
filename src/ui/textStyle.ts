import type { CSSProperties } from 'react'
import type { CanvasTextFont, CanvasTextStyle } from '../types'

/** Fontes dos textos livres: só pilhas já disponíveis (Inter/JetBrains carregadas pela app, resto do sistema). */
export const TEXT_FONTS: Array<{ id: CanvasTextFont; label: string; stack: string }> = [
  { id: 'sans', label: 'Inter', stack: "'Inter', system-ui, sans-serif" },
  { id: 'serif', label: 'Serifa', stack: "Georgia, 'Times New Roman', serif" },
  { id: 'mono', label: 'Técnica', stack: "'JetBrains Mono', ui-monospace, monospace" },
  { id: 'rounded', label: 'Arredondada', stack: "ui-rounded, 'SF Pro Rounded', 'Arial Rounded MT Bold', 'Nunito', system-ui, sans-serif" },
  { id: 'hand', label: 'Manuscrita', stack: "'Segoe Print', 'Bradley Hand', 'Comic Sans MS', 'Chalkboard SE', cursive" },
]

export const fontStack = (font: CanvasTextFont | undefined) => TEXT_FONTS.find((item) => item.id === font)?.stack ?? TEXT_FONTS[0].stack

/** Cores do texto: tinta técnica, cores de cabo e de sinalização. */
export const TEXT_COLORS = ['#0f172a', '#475569', '#ffffff', '#1d4ed8', '#15803d', '#b91c1c', '#c2410c', '#a16207', '#7c3aed']

/** Cores das notas (papel autocolante) e respetiva tinta. */
export const NOTE_COLORS: Array<{ id: string; label: string; paper: string; ink: string; edge: string }> = [
  { id: '#fde68a', label: 'Amarelo', paper: '#fef3c7', ink: '#78350f', edge: '#f59e0b' },
  { id: '#fdba74', label: 'Laranja', paper: '#ffedd5', ink: '#7c2d12', edge: '#f97316' },
  { id: '#f9a8d4', label: 'Rosa', paper: '#fce7f3', ink: '#831843', edge: '#ec4899' },
  { id: '#86efac', label: 'Verde', paper: '#dcfce7', ink: '#14532d', edge: '#22c55e' },
  { id: '#93c5fd', label: 'Azul', paper: '#dbeafe', ink: '#1e3a8a', edge: '#3b82f6' },
  { id: '#c4b5fd', label: 'Lilás', paper: '#ede9fe', ink: '#4c1d95', edge: '#8b5cf6' },
]

export const noteTheme = (color: string | undefined) => NOTE_COLORS.find((item) => item.id === color) ?? NOTE_COLORS[0]

export const DEFAULT_TEXT_STYLE_3D: CanvasTextStyle = { font: 'sans', size: 24, color: '#0f172a', bold: true, align: 'left' }
export const DEFAULT_TEXT_STYLE_GRAFCET: CanvasTextStyle = { font: 'sans', size: 14, color: '#334155', bold: true, align: 'left' }
export const DEFAULT_TEXT_STYLE_COMMANDS: CanvasTextStyle = { font: 'sans', size: 14, color: '#1e293b', bold: false, align: 'left' }

/** Estilo CSS de um texto livre (o tamanho é dado pelo chamador, em px). */
export function textCss(style: Partial<CanvasTextStyle>, sizePx: number): CSSProperties {
  return {
    fontFamily: fontStack(style.font),
    fontSize: sizePx,
    lineHeight: 1.18,
    color: style.color ?? '#0f172a',
    fontWeight: style.bold ? 700 : 450,
    fontStyle: style.italic ? 'italic' : 'normal',
    textDecoration: style.underline ? 'underline' : 'none',
    textAlign: style.align ?? 'left',
    background: style.background || 'transparent',
    whiteSpace: 'pre',
  }
}

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?'
export { initialsOf }

export const shortWhen = (iso: string) => {
  try { return new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) } catch { return '' }
}
