/**
 * DC-SIMU — Sistema de ícones
 * ---------------------------
 * Ícones desenhados em traço consistente (24×24, stroke 1.8, round cap/join),
 * estilo técnico/single-line — coerentes entre toolbar, biblioteca e painéis.
 */
import type { ReactNode } from 'react'

type IconProps = { size?: number; className?: string }

function Svg({ children, size = 14, className, filled = false }: IconProps & { children: ReactNode; filled?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  )
}

/* ------------------------------------------------------------ arquivo */
export const IconFile = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 2.5h8l5 5v14H6z" />
    <path d="M14 2.5v5h5" />
  </Svg>
)
export const IconSave = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 4h13l3 3v13H4z" />
    <path d="M8 4v5h7V4M8 20v-6h8v6" />
  </Svg>
)
export const IconOpen = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
  </Svg>
)
export const IconProjects = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
    <path d="M3 11h18" />
  </Svg>
)

/* -------------------------------------------------------------- edição */
export const IconCursor = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 3l14 7.5-6.3 1.7L11 19z" />
  </Svg>
)
export const IconWire = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="5" cy="18" r="2.2" />
    <circle cx="19" cy="6" r="2.2" />
    <path d="M7 16.2C9.5 13 14.5 11 17 7.8" />
  </Svg>
)
export const IconProbe = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3v6a6 6 0 0 0 12 0V3" />
    <path d="M12 15v6M9 21h6" />
  </Svg>
)
export const IconErase = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 4l6 6-9.5 9.5a2 2 0 0 1-2.8 0L4 15a2 2 0 0 1 0-2.8z" />
    <path d="M9 20h11" />
  </Svg>
)
export const IconPan = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 2v20M2 12h20" />
    <path d="M12 2 9.5 4.5M12 2l2.5 2.5M12 22l-2.5-2.5M12 22l2.5-2.5M2 12l2.5-2.5M2 12l2.5 2.5M22 12l-2.5-2.5M22 12l-2.5 2.5" />
  </Svg>
)
export const IconUndo = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 5 3 10l5 5" />
    <path d="M3 10h11a6 6 0 0 1 0 12h-3" />
  </Svg>
)
export const IconRedo = (p: IconProps) => (
  <Svg {...p}>
    <path d="M16 5l5 5-5 5" />
    <path d="M21 10H10a6 6 0 0 0 0 12h3" />
  </Svg>
)

/* ------------------------------------------------------- alinhamento */
export const IconAlignLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 3v18" />
    <rect x="7" y="6" width="13" height="4" rx="0.5" />
    <rect x="7" y="14" width="8" height="4" rx="0.5" />
  </Svg>
)
export const IconAlignCenterH = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v18" />
    <rect x="5" y="6" width="14" height="4" rx="0.5" />
    <rect x="8" y="14" width="8" height="4" rx="0.5" />
  </Svg>
)
export const IconAlignRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 3v18" />
    <rect x="4" y="6" width="13" height="4" rx="0.5" />
    <rect x="9" y="14" width="8" height="4" rx="0.5" />
  </Svg>
)
export const IconAlignTop = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 4h18" />
    <rect x="6" y="7" width="4" height="13" rx="0.5" />
    <rect x="14" y="7" width="4" height="8" rx="0.5" />
  </Svg>
)
export const IconAlignCenterV = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 12h18" />
    <rect x="6" y="5" width="4" height="14" rx="0.5" />
    <rect x="14" y="8" width="4" height="8" rx="0.5" />
  </Svg>
)
export const IconAlignBottom = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 20h18" />
    <rect x="6" y="4" width="4" height="13" rx="0.5" />
    <rect x="14" y="9" width="4" height="8" rx="0.5" />
  </Svg>
)
export const IconDistH = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2" y="8" width="5" height="8" rx="0.5" />
    <rect x="9.5" y="8" width="5" height="8" rx="0.5" />
    <rect x="17" y="8" width="5" height="8" rx="0.5" />
  </Svg>
)
export const IconDistV = (p: IconProps) => (
  <Svg {...p}>
    <rect x="8" y="2" width="8" height="5" rx="0.5" />
    <rect x="8" y="9.5" width="8" height="5" rx="0.5" />
    <rect x="8" y="17" width="8" height="5" rx="0.5" />
  </Svg>
)

/* ---------------------------------------------------------- simulação */
export const IconPlay = (p: IconProps) => (
  <Svg {...p} filled>
    <path d="M7 4.5v15l12-7.5z" />
  </Svg>
)
export const IconPause = (p: IconProps) => (
  <Svg {...p} filled>
    <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
  </Svg>
)
export const IconStop = (p: IconProps) => (
  <Svg {...p} filled>
    <rect x="5" y="5" width="14" height="14" rx="1.5" />
  </Svg>
)
export const IconStep = (p: IconProps) => (
  <Svg {...p} filled>
    <path d="M5 4.5v15l9-7.5z" />
    <rect x="16" y="4.5" width="3.4" height="15" />
  </Svg>
)
export const IconReset = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 8a9 9 0 1 1-.5 6" />
    <path d="M3 3v6h6" />
  </Svg>
)

/* -------------------------------------------------------------- malha */
export const IconGrid = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="18" height="18" rx="1" />
    <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
  </Svg>
)
export const IconMagnet = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3v8a6 6 0 0 0 12 0V3h-4v8a2 2 0 0 1-4 0V3z" />
    <path d="M6 6h4M14 6h4" />
  </Svg>
)
export const IconZoomIn = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10.5" cy="10.5" r="7" />
    <path d="M20.5 20.5 15.7 15.7M10.5 7.5v6M7.5 10.5h6" />
  </Svg>
)
export const IconZoomOut = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10.5" cy="10.5" r="7" />
    <path d="M20.5 20.5 15.7 15.7M7.5 10.5h6" />
  </Svg>
)

/* ------------------------------------------------------------- vistas */
export const IconSchematic = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="9" width="5" height="6" rx="0.8" />
    <rect x="16" y="9" width="5" height="6" rx="0.8" />
    <path d="M8 12h3M11 12a2.5 2.5 0 1 1 5 0M14 12h2" />
  </Svg>
)
export const IconCube = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 2.5 21 7v10l-9 4.5L3 17V7z" />
    <path d="M3 7l9 4.5L21 7M12 11.5V21.5" />
  </Svg>
)
export const IconMonitor = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="4" width="19" height="13" rx="1.5" />
    <path d="M8 21h8M12 17.5V21" />
  </Svg>
)

/* ------------------------------------------------------------- vários */
export const IconTools = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 6.5a4.5 4.5 0 0 1 6-4.24L16.5 6l1.5 1.5 3.74-3.5a4.5 4.5 0 0 1-5.99 5.99L7 15.5V20l-2 2-2.5-2.5L4 17.5h4.5z" />
  </Svg>
)
export const IconLayers = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3 3 8l9 5 9-5z" />
    <path d="M3 12.5 12 17.5l9-5M3 17 12 22l9-5" />
  </Svg>
)
export const IconOrganize = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6h16M4 12h10M4 18h6" />
  </Svg>
)
export const IconTag = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 3h8l10 10-8 8L3 11z" />
    <circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" stroke="none" />
  </Svg>
)
export const IconDownload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />
  </Svg>
)
export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10.5" cy="10.5" r="7" />
    <path d="M20.5 20.5 15.7 15.7" />
  </Svg>
)
export const IconLock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="1.5" />
    <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
  </Svg>
)
export const IconShield = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 2.5 20 5v6.5c0 5-3.5 8.5-8 10.5-4.5-2-8-5.5-8-10.5V5z" />
  </Svg>
)
export const IconDelete = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6.5h16M9 6.5V4h6v2.5M6.5 6.5 7.5 21h9l1-14.5M10 10v7M14 10v7" />
  </Svg>
)
export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)
export const IconRotate = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 5v5h-5" />
    <path d="M4 19v-5h5" />
    <path d="M19.5 10a8 8 0 0 0-14-4M4.5 14a8 8 0 0 0 14 4" />
  </Svg>
)
export const IconCopy = (p: IconProps) => (
  <Svg {...p}>
    <rect x="8" y="8" width="13" height="13" rx="1.5" />
    <path d="M5 16H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v1" />
  </Svg>
)

/* --------------------------------------------- tipos de componente Ladder */
export const IconContact = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 12h5M17 12h5" />
    <path d="M7 5.5 17 12 7 18.5z" />
  </Svg>
)
export const IconCoil = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 12h3M19 12h3" />
    <path d="M5 12a3.5 3.5 0 0 1 0-0.1M5 12a3.5 3.5 0 0 0 7 0 3.5 3.5 0 0 0 7 0" />
  </Svg>
)
export const IconTimer = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 13V8.5M9.5 2h5M12 2v3" />
  </Svg>
)
export const IconCounter = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="6" width="18" height="13" rx="1.5" />
    <path d="M7 3v3M12 3v3M17 3v3M7.5 15l3-6 1.5 4.5L15 10l1.5 5" />
  </Svg>
)
export const IconBranch = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12h5M4 20h5M4 4h5" />
    <path d="M9 4c4 0 3 8 7 8-4 0-3 8-7 8" />
  </Svg>
)
