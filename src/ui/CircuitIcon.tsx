import type { ReactNode } from 'react'
import { IconCommands, IconDanger, type IconProps } from './icons'

/** Pictogramas técnicos vetoriais das etiquetas DIN (não dependem de fontes/emoji). */
export const CIRCUIT_ICON_NAMES = [
  'socket', 'light', 'gardenlight', 'ac', 'oven', 'cooktop', 'hood', 'waterheater',
  'fridge', 'washer', 'gate', 'garage', 'fan', 'wifi', 'floorheat', 'cctv',
  'pump', 'shield', 'alarm', 'intercom', 'power', 'bolt', 'danger',
] as const

export function isCircuitIcon(name?: string): boolean {
  return CIRCUIT_ICON_NAMES.includes(name as typeof CIRCUIT_ICON_NAMES[number])
}

export default function CircuitIcon({ icon, size = 24, className, title, accent = 'currentColor' }: IconProps & { icon: string; accent?: string }) {
  if (icon === 'bolt') return <IconCommands size={size} className={className} title={title} />
  if (icon === 'danger') return <IconDanger size={size} className={className} title={title} />

  let shape: ReactNode
  switch (icon) {
    case 'socket':
      shape = <><rect x={3} y={3} width={18} height={18} rx={4} /><circle cx={12} cy={12} r={6} /><circle cx={9.5} cy={12} r={0.8} fill="currentColor" /><circle cx={14.5} cy={12} r={0.8} fill="currentColor" /><path d="M12 6v2m0 8v2" /></>
      break
    case 'light':
      shape = <><path d="M8.5 16c0-3-3-3.5-3-7a6.5 6.5 0 0 1 13 0c0 3.5-3 4-3 7Z" fill={accent} fillOpacity={0.15} /><path d="M9 19h6m-5 3h4M10 12l2 4 2-4M9 16h6" /></>
      break
    case 'gardenlight':
      shape = <><path d="M12 14v7m-4 0h8M5 7l7-5 7 5Z" fill={accent} fillOpacity={0.15} /><path d="M7 7v7h10V7m-5 0v7M5 14h14" /></>
      break
    case 'ac':
      shape = <><rect x={2} y={3} width={20} height={10} rx={2} /><path d="M5 10h14M6 16v2m6-2v5m6-5v2M18 6h1" stroke={accent} /></>
      break
    case 'oven':
      shape = <><rect x={3} y={2} width={18} height={20} rx={2} /><rect x={6} y={10} width={12} height={9} rx={1} /><path d="M6 7h12M7 5h.01M12 5h.01M17 5h.01" /></>
      break
    case 'cooktop':
      shape = <><rect x={3} y={2} width={18} height={20} rx={2} /><g stroke={accent}><circle cx={8} cy={7} r={2} /><circle cx={16} cy={7} r={2} /><circle cx={8} cy={15} r={2.5} /><circle cx={16} cy={15} r={2.5} /></g><path d="M9 20h6" /></>
      break
    case 'hood':
      shape = <><path d="M9 2h6v9l6 6v3H3v-3l6-6Zm-6 15h18M7 20v2m5-2v2m5-2v2" /></>
      break
    case 'waterheater':
      shape = <><rect x={6} y={2} width={12} height={18} rx={4} /><circle cx={12} cy={8} r={2} stroke={accent} /><path d="M9 20v2m6-2v2M9 15h6" /></>
      break
    case 'fridge':
      shape = <><rect x={5} y={2} width={14} height={20} rx={2} /><path d="M5 10h14M8 5v2m0 6v4" /></>
      break
    case 'washer':
      shape = <><rect x={3} y={2} width={18} height={20} rx={2} /><path d="M3 7h18M6 4.5h.01m3 0h.01M8 14q4 3 8 0" /><circle cx={12} cy={14} r={5} stroke={accent} /></>
      break
    case 'gate':
      shape = <><path d="M2 3v19m20-19v19M2 6h9v14H2m20-14h-9v14h9M2 6l9 14M22 6l-9 14M11 12h2" /></>
      break
    case 'garage':
      shape = <><path d="M2 9l10-7 10 7v13M2 9v13M5 22V10h14v12M5 14h14M5 18h14" /></>
      break
    case 'fan':
      shape = <><circle cx={12} cy={12} r={10} /><circle cx={12} cy={12} r={2} fill={accent} /><path d="M12 10c-6-2-5-7-1-6 3 0 4 3 1 6Zm2 2c2-6 7-5 6-1 0 3-3 4-6 1Zm-2 2c6 2 5 7 1 6-3 0-4-3-1-6Zm-2-2c-2 6-7 5-6 1 0-3 3-4 6-1Z" /></>
      break
    case 'wifi':
      shape = <><rect x={3} y={16} width={18} height={5} rx={1} /><path d="M6 16v-4m12 4v-4M5 6a11 11 0 0 1 14 0M8 9a6 6 0 0 1 8 0m-5 3h2" stroke={accent} /></>
      break
    case 'floorheat':
      shape = <><path d="M2 15h20v6H2ZM6 12C2 8 9 7 6 3m6 9c-4-4 3-5 0-9m6 9c-4-4 3-5 0-9" stroke={accent} /></>
      break
    case 'cctv':
      shape = <><path d="m3 4 14 3v7L3 11Zm14 4 4-1v7l-4-1M9 13l3 6h7m0-3v6" /></>
      break
    case 'pump':
      shape = <><circle cx={9} cy={13} r={6} /><path d="M15 9h5v8h-5M3 19v3h16v-3M6 7V3h5v4M9 10l3 3-3 3-3-3Z" stroke={accent} /></>
      break
    case 'shield':
      shape = <><path d="m12 2 9 4-2 10-7 6-7-6L3 6Z" /><path d="m13 6-5 7h4l-1 5 6-8h-4Z" fill={accent} strokeWidth={1} /></>
      break
    case 'alarm':
      shape = <><path d="M6 18v-5a6 6 0 0 1 12 0v5M4 18h16v4H4ZM12 1v3M3 5l2 2m16-2-2 2M1 13h2m18 0h2" stroke={accent} /></>
      break
    case 'intercom':
      shape = <><rect x={5} y={2} width={14} height={20} rx={2} /><circle cx={12} cy={7} r={2} stroke={accent} /><path d="M9 12h6m-6 3h6" /><circle cx={12} cy={19} r={1} fill={accent} /></>
      break
    case 'power':
      shape = <><path d="M12 2v10m-6-7a9 9 0 1 0 12 0" stroke={accent} strokeWidth={2.4} /></>
      break
    default:
      shape = <rect x={3} y={3} width={18} height={18} rx={3} />
  }

  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={className} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false" style={{ flexShrink: 0 }}>
    {title && <title>{title}</title>}
    {shape}
  </svg>
}
