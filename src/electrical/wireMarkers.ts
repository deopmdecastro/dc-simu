import type { Wire } from '../types'

export type WireMarkerStyle = 'iec' | 'yellow' | 'white' | 'custom'

export type WireMarkerEntry = NonNullable<Wire['markers']>[number]

export interface WireMarkerRing {
  char: string
  bg: string
  fg: string
  border: string
  colorName: string
}

/**
 * Código internacional de cores para anilhas de identificação de cabos (IEC 60062 / DIN 47100),
 * igual às réguas de anilhas encaixáveis tipo WIC / CAB3 / PA usadas em quadros industriais.
 */
export const IEC_DIGIT_MARKER_PALETTE: ReadonlyArray<{
  char: string
  bg: string
  fg: string
  border: string
  name: string
}> = [
  { char: '0', bg: '#18181b', fg: '#ffffff', border: '#3f3f46', name: 'Preto (0)' },
  { char: '1', bg: '#7c3f16', fg: '#ffffff', border: '#5c2d0e', name: 'Castanho (1)' },
  { char: '2', bg: '#dc2626', fg: '#ffffff', border: '#991b1b', name: 'Vermelho (2)' },
  { char: '3', bg: '#f97316', fg: '#111827', border: '#c2410c', name: 'Laranja (3)' },
  { char: '4', bg: '#facc15', fg: '#111827', border: '#ca8a04', name: 'Amarelo (4)' },
  { char: '5', bg: '#16a34a', fg: '#ffffff', border: '#15803d', name: 'Verde (5)' },
  { char: '6', bg: '#2563eb', fg: '#ffffff', border: '#1d4ed8', name: 'Azul (6)' },
  { char: '7', bg: '#7c3aed', fg: '#ffffff', border: '#5b21b6', name: 'Violeta (7)' },
  { char: '8', bg: '#9ca3af', fg: '#111827', border: '#6b7280', name: 'Cinzento (8)' },
  { char: '9', bg: '#f8fafc', fg: '#111827', border: '#cbd5e1', name: 'Branco (9)' },
]

const IEC_BY_CHAR = new Map(IEC_DIGIT_MARKER_PALETTE.map((entry) => [entry.char, entry]))

const SYMBOL_PALETTE: Record<string, { bg: string; fg: string; border: string; name: string }> = {
  '+': { bg: '#dc2626', fg: '#ffffff', border: '#991b1b', name: 'Positivo (+)' },
  '-': { bg: '#2563eb', fg: '#ffffff', border: '#1d4ed8', name: 'Negativo (-)' },
  '−': { bg: '#2563eb', fg: '#ffffff', border: '#1d4ed8', name: 'Negativo (−)' },
  '⏚': { bg: '#16a34a', fg: '#fde047', border: '#15803d', name: 'Terra (⏚)' },
  '~': { bg: '#f8fafc', fg: '#111827', border: '#cbd5e1', name: 'Alternada (~)' },
  '=': { bg: '#f8fafc', fg: '#111827', border: '#cbd5e1', name: 'Contínua (=)' },
  '.': { bg: '#facc15', fg: '#111827', border: '#ca8a04', name: 'Separador (.)' },
  '/': { bg: '#facc15', fg: '#111827', border: '#ca8a04', name: 'Separador (/)' },
  ':': { bg: '#facc15', fg: '#111827', border: '#ca8a04', name: 'Separador (:)' },
}

export const WIRE_MARKER_STYLE_LABEL: Record<WireMarkerStyle, string> = {
  iec: 'Cores IEC (0–9)',
  yellow: 'Amarelo CAB3',
  white: 'Branco WIC',
  custom: 'Personalizado',
}

export const QUICK_LETTER_TOKENS = ['L', 'N', 'U', 'V', 'W', 'R', 'S', 'T', 'X', 'K', 'Q', 'F', '+', '-', '.'] as const

const DEFAULT_LEGACY_BG = new Set(['', '#fbbf24', '#facc15'])
const DEFAULT_LEGACY_FG = new Set(['', '#0f172a', '#111827', '#000000'])

/** Determina o estilo efetivo da anilha, respeitando cores personalizadas já gravadas. */
export function resolveWireMarkerStyle(marker: Pick<WireMarkerEntry, 'style' | 'bg' | 'color'>): WireMarkerStyle {
  if (marker.style === 'iec' || marker.style === 'yellow' || marker.style === 'white' || marker.style === 'custom') {
    return marker.style
  }
  const bg = (marker.bg ?? '').trim().toLowerCase()
  const fg = (marker.color ?? '').trim().toLowerCase()
  if (bg === '#ffffff' || bg === '#f8fafc') return 'white'
  if (!DEFAULT_LEGACY_BG.has(bg) || !DEFAULT_LEGACY_FG.has(fg)) return 'custom'
  return 'iec'
}

/** Contraste legível automático para cores personalizadas. */
function readableBorder(hex: string): string {
  const clean = hex.trim().toLowerCase()
  if (clean === '#ffffff' || clean === '#f8fafc' || clean === '#f1f5f9') return '#94a3b8'
  if (clean === '#facc15' || clean === '#fbbf24' || clean === '#fde047') return '#ca8a04'
  if (clean === '#000000' || clean === '#0f172a' || clean === '#18181b') return '#3f3f46'
  return '#334155'
}

/** Cor de uma anilha individual segundo o estilo escolhido. */
export function wireMarkerRingForChar(
  rawChar: string,
  style: WireMarkerStyle,
  customBg = '#facc15',
  customFg = '#111827',
): WireMarkerRing {
  const char = rawChar.toUpperCase()
  if (style === 'yellow') {
    return { char, bg: '#facc15', fg: '#111827', border: '#ca8a04', colorName: `Amarelo (${char})` }
  }
  if (style === 'white') {
    return { char, bg: '#f8fafc', fg: '#111827', border: '#cbd5e1', colorName: `Branco (${char})` }
  }
  if (style === 'custom') {
    const bg = customBg || '#facc15'
    const fg = customFg || '#111827'
    return { char, bg, fg, border: readableBorder(bg), colorName: char }
  }
  const digit = IEC_BY_CHAR.get(char)
  if (digit) return { char, bg: digit.bg, fg: digit.fg, border: digit.border, colorName: digit.name }
  const sym = SYMBOL_PALETTE[char]
  if (sym) return { char, bg: sym.bg, fg: sym.fg, border: sym.border, colorName: sym.name }
  // Letras A–Z: anilha amarela industrial CAB3/WIC com carácter preto de alto contraste.
  return { char, bg: '#facc15', fg: '#111827', border: '#ca8a04', colorName: `Letra ${char} (amarelo)` }
}

/**
 * Converte um marcador de cabo numa sequência de anilhas individuais encaixáveis (máx. 16 anéis
 * por grupo para manter legibilidade em cabos curtos). Espaços são ignorados.
 */
export function expandWireMarkerRings(marker: Pick<WireMarkerEntry, 'text' | 'style' | 'bg' | 'color'>, maxRings = 16): WireMarkerRing[] {
  const cleaned = Array.from((marker.text ?? '').trim()).filter((ch) => ch.trim().length > 0).slice(0, maxRings)
  if (!cleaned.length) return []
  const style = resolveWireMarkerStyle(marker)
  return cleaned.map((ch) => wireMarkerRingForChar(ch, style, marker.bg, marker.color))
}
