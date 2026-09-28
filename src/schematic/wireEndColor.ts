import type { Wire } from '../types'

/** A cor da ponteira é independente do condutor: segue a cor do borne até
 * ser personalizada, e usa cinzento neutro quando a ponta está livre. */
export function wireEndColor(wire: Wire, side: 'from' | 'to', terminalColor?: string): string {
  return (side === 'from' ? wire.fromEndColor : wire.toEndColor) || terminalColor || '#64748b'
}
