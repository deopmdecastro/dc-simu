import type { Wire } from '../types'

/** A cor da ponteira é independente do condutor: segue a cor do borne até
 * ser personalizada, e usa cinzento neutro quando a ponta está livre. */
export function wireEndColor(wire: Wire, side: 'from' | 'to', terminalColor?: string): string {
  return (side === 'from' ? wire.fromEndColor : wire.toEndColor) || terminalColor || '#64748b'
}

/** Código de cores das ponteiras isoladas DIN 46228-4 (secção nominal em mm² → cor). */
const DIN_46228_4: Array<[number, string, string]> = [
  [0.5, '#f8fafc', 'branco'], [0.75, '#9ca3af', 'cinzento'], [1, '#dc2626', 'vermelho'], [1.5, '#111827', 'preto'],
  [2.5, '#2563eb', 'azul'], [4, '#9ca3af', 'cinzento'], [6, '#facc15', 'amarelo'], [10, '#dc2626', 'vermelho'],
  [16, '#2563eb', 'azul'], [25, '#facc15', 'amarelo'], [35, '#dc2626', 'vermelho'], [50, '#2563eb', 'azul'],
]

/** Cor normalizada da ponteira para uma secção («1.5mm²», «2,5 mm²», 1.5…); `null` se a secção não está na tabela. */
export function dinFerruleColor(gauge: string | number | undefined): { hex: string; name: string } | null {
  const value = typeof gauge === 'number' ? gauge : parseFloat(String(gauge ?? '').replace(',', '.'))
  const hit = DIN_46228_4.find(([mm]) => Math.abs(mm - value) < 1e-6)
  return hit ? { hex: hit[1], name: hit[2] } : null
}

/** Cores rápidas para ponteiras (as do código DIN 46228-4, sem repetidos). */
export const FERRULE_SWATCHES: Array<{ hex: string; name: string }> = [...new Map(DIN_46228_4.map(([, hex, name]) => [hex, { hex, name }])).values()]
  .concat([{ hex: '#16a34a', name: 'verde' }, { hex: '#ea580c', name: 'laranja' }, { hex: '#92400e', name: 'castanho' }])
