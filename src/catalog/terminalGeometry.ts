import type { TerminalDef } from './types'

/** Esfera física do editor, independente da área invisível de seleção. */
export function editorTerminalRadiusMm(terminal: Pick<TerminalDef, 'diameterMm' | 'socketDepthMm' | 'socketInsetMm'>): number {
  const radius = Math.max(.15, (terminal.diameterMm ?? 6) * .3)
  const inset = terminal.socketInsetMm
  const depth = terminal.socketDepthMm
  if (typeof inset !== 'number' || typeof depth !== 'number') return Math.min(radius, 2)
  return Math.max(.1, Math.min(radius, inset * .65, (depth - inset) * .65))
}
