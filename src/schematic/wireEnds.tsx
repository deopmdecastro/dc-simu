import type { WireEndType } from '../types'

/** Terminações disponíveis para as pontas do cabo (uma opção única para as duas pontas). */
export const WIRE_END_OPTIONS: Array<{ id: WireEndType; label: string; hint: string }> = [
  { id: 'ferrule', label: 'Ponteira', hint: 'Ponteira tubular isolada (cabo flexível em borne de parafuso/mola)' },
  { id: 'ferruleDouble', label: 'Ponteira dupla', hint: 'Dois condutores numa só ponteira' },
  { id: 'ring', label: 'Olhal', hint: 'Terminal de olhal (anel) para parafuso' },
  { id: 'fork', label: 'Forquilha', hint: 'Terminal em U / garfo' },
  { id: 'pin', label: 'Pino', hint: 'Terminal tipo pino' },
  { id: 'faston', label: 'Faston', hint: 'Terminal de encaixe rápido (faston)' },
  { id: 'tinned', label: 'Estanhado', hint: 'Ponta estanhada, sem terminal' },
  { id: 'none', label: 'Nu', hint: 'Ponta nua (sem terminação)' },
]

/** Pré-visualização pequena do terminal (usada no inspetor e na toolbar). */
export function WireEndIcon({ type, color = '#ef4444', size = 34 }: { type: WireEndType; color?: string; size?: number }) {
  const metal = '#c3ccd8'
  const edge = '#6b7a90'
  const wire = <line x1={22} y1={8} x2={40} y2={8} stroke={color} strokeWidth={3} strokeLinecap="round" />
  let end: JSX.Element | null = null
  switch (type) {
    case 'ferrule':
      end = (<><rect x={4} y={5.5} width={11} height={5} rx={1} fill={metal} stroke={edge} strokeWidth={0.7} /><rect x={15} y={4} width={7} height={8} rx={1.5} fill={color} stroke={edge} strokeWidth={0.6} /></>)
      break
    case 'ferruleDouble':
      end = (<><rect x={4} y={4.5} width={11} height={7} rx={1} fill={metal} stroke={edge} strokeWidth={0.7} /><line x1={4} y1={8} x2={15} y2={8} stroke={edge} strokeWidth={0.6} /><rect x={15} y={2.5} width={7} height={11} rx={1.8} fill={color} stroke={edge} strokeWidth={0.6} /></>)
      break
    case 'ring':
      end = (<><circle cx={7} cy={8} r={4.6} fill="none" stroke={metal} strokeWidth={2.6} /><circle cx={7} cy={8} r={4.6} fill="none" stroke={edge} strokeWidth={0.6} /><rect x={11} y={6} width={6} height={4} fill={metal} stroke={edge} strokeWidth={0.5} /><rect x={17} y={4.5} width={5} height={7} rx={1.2} fill={color} stroke={edge} strokeWidth={0.6} /></>)
      break
    case 'fork':
      end = (<><path d="M3 3.5H10V6.6H6.5V9.4H10V12.5H3Z" fill={metal} stroke={edge} strokeWidth={0.6} /><rect x={10} y={6} width={7} height={4} fill={metal} stroke={edge} strokeWidth={0.5} /><rect x={17} y={4.5} width={5} height={7} rx={1.2} fill={color} stroke={edge} strokeWidth={0.6} /></>)
      break
    case 'pin':
      end = (<><line x1={4} y1={8} x2={16} y2={8} stroke={edge} strokeWidth={2.6} strokeLinecap="round" /><line x1={4} y1={8} x2={16} y2={8} stroke={metal} strokeWidth={1.5} strokeLinecap="round" /><rect x={16} y={4.5} width={6} height={7} rx={1.4} fill={color} stroke={edge} strokeWidth={0.6} /></>)
      break
    case 'faston':
      end = (<><rect x={3} y={4.5} width={12} height={7} rx={0.8} fill={metal} stroke={edge} strokeWidth={0.7} /><line x1={5} y1={6.6} x2={13} y2={6.6} stroke={edge} strokeWidth={0.5} /><rect x={15} y={4} width={7} height={8} rx={1.6} fill={color} stroke={edge} strokeWidth={0.6} /></>)
      break
    case 'tinned':
      end = <line x1={10} y1={8} x2={22} y2={8} stroke="#aeb8c6" strokeWidth={3} strokeLinecap="round" />
      break
    default:
      end = <line x1={14} y1={8} x2={22} y2={8} stroke="#b87333" strokeWidth={2} strokeLinecap="round" />
  }
  return (
    <svg width={size} height={Math.round((size * 16) / 42)} viewBox="0 0 42 16" aria-hidden>
      {wire}
      {end}
    </svg>
  )
}

/** Pré-visualização de condutor flexível vs rígido. */
export function ConductorIcon({ flexible, color = '#ef4444', size = 44 }: { flexible: boolean; color?: string; size?: number }) {
  const d = flexible ? 'M3 13 C 12 13, 12 3, 22 3 S 32 13, 41 13' : 'M3 13 H 16 V 3 H 41'
  return (
    <svg width={size} height={Math.round((size * 16) / 44)} viewBox="0 0 44 16" aria-hidden>
      <path d={d} fill="none" stroke="#1e293b" strokeOpacity={0.35} strokeWidth={4.4} strokeLinecap={flexible ? 'round' : 'square'} strokeLinejoin={flexible ? 'round' : 'miter'} />
      <path d={d} fill="none" stroke={color} strokeWidth={3} strokeLinecap={flexible ? 'round' : 'square'} strokeLinejoin={flexible ? 'round' : 'miter'} />
      {flexible ? (
        <path d={d} fill="none" stroke="#fff" strokeOpacity={0.6} strokeWidth={1.1} strokeDasharray="1.2 2.4" strokeLinecap="round" />
      ) : (
        <path d={d} fill="none" stroke="#fff" strokeOpacity={0.6} strokeWidth={0.8} strokeLinejoin="miter" />
      )}
    </svg>
  )
}
