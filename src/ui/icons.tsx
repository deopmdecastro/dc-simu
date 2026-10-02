/**
 * DC-SIMU — Sistema de ícones
 * ---------------------------
 * Todos os ícones da plataforma vêm do Font Awesome (pacote sólido), através
 * deste único ficheiro: toolbar, biblioteca, painéis, editores e diálogos.
 * Assim, a mesma função tem sempre o mesmo ícone — por exemplo, mostrar e
 * esconder são sempre o olho e o olho cortado.
 *
 * Para trocar um ícone basta mudar a linha correspondente aqui.
 */
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import {
  faAlignCenter,
  faAlignLeft,
  faAlignRight,
  faArrowLeft,
  faArrowPointer,
  faArrowRight,
  faArrowRotateLeft,
  faArrowsLeftRight,
  faArrowsUpDown,
  faArrowsUpDownLeftRight,
  faBarsStaggered,
  faBell,
  faBorderAll,
  faBorderTopLeft,
  faCalculator,
  faCamera,
  faCaretUp,
  faCheck,
  faChevronDown,
  faChevronLeft,
  faChevronRight,
  faChevronUp,
  faCircle,
  faCircleDot,
  faCircleNotch,
  faCircleQuestion,
  faClock,
  faCodeBranch,
  faCodeCompare,
  faCodeFork,
  faCopy,
  faCrosshairs,
  faCube,
  faCubes,
  faDatabase,
  faDiagramProject,
  faDisplay,
  faDownLeftAndUpRightToCenter,
  faDownload,
  faEraser,
  faEye,
  faEyeSlash,
  faFile,
  faFloppyDisk,
  faFolderOpen,
  faFolderTree,
  faForwardStep,
  faHand,
  faHashtag,
  faImage,
  faLayerGroup,
  faLightbulb,
  faLink,
  faLock,
  faLockOpen,
  faMagnet,
  faMagnifyingGlass,
  faMagnifyingGlassMinus,
  faMagnifyingGlassPlus,
  faObjectGroup,
  faObjectUngroup,
  faPause,
  faPlay,
  faPlus,
  faRightFromBracket,
  faRightLeft,
  faRotate,
  faRotateLeft,
  faRotateRight,
  faRulerCombined,
  faScrewdriverWrench,
  faShieldHalved,
  faSquareRootVariable,
  faStar,
  faStethoscope,
  faStop,
  faTableCells,
  faTag,
  faToggleOff,
  faTrashCan,
  faTriangleExclamation,
  faUpDownLeftRight,
  faUser,
  faWandMagicSparkles,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'

export type IconProps = { size?: number; className?: string; title?: string }

/** Base comum: tamanho em pixels e cor herdada do texto. */
function fa(icon: IconDefinition) {
  return function Icon({ size = 14, className, title }: IconProps) {
    return <FontAwesomeIcon icon={icon} className={className} title={title} style={{ width: size, height: size }} aria-hidden={title ? undefined : true} />
  }
}


export const IconFile = fa(faFile)
export const IconSave = fa(faFloppyDisk)
export const IconOpen = fa(faFolderOpen)
export const IconProjects = fa(faFolderTree)
export const IconCursor = fa(faArrowPointer)
export const IconWire = fa(faCodeBranch)
export const IconHelp = fa(faCircleQuestion)
export const IconBell = fa(faBell)
export const IconUser = fa(faUser)
export const IconLogout = fa(faRightFromBracket)
export const IconProbe = fa(faStethoscope)
export const IconErase = fa(faEraser)
export const IconHand = fa(faHand)
export const IconPan = fa(faUpDownLeftRight)
export const IconUndo = fa(faRotateLeft)
export const IconRedo = fa(faRotateRight)
export const IconAlignLeft = fa(faAlignLeft)
export const IconAlignCenterH = fa(faAlignCenter)
export const IconAlignRight = fa(faAlignRight)
export const IconAlignTop = fa(faBorderTopLeft)
export const IconAlignCenterV = fa(faBarsStaggered)
export const IconAlignBottom = fa(faBorderAll)
export const IconDistH = fa(faArrowsLeftRight)
export const IconDistV = fa(faArrowsUpDown)
export const IconPlay = fa(faPlay)
export const IconPause = fa(faPause)
export const IconStop = fa(faStop)
export const IconStep = fa(faForwardStep)
export const IconReset = fa(faArrowRotateLeft)
export const IconGrid = fa(faBorderAll)
export const IconMagnet = fa(faMagnet)
export const IconZoomIn = fa(faMagnifyingGlassPlus)
export const IconZoomOut = fa(faMagnifyingGlassMinus)
export const IconSchematic = fa(faDiagramProject)
export const IconLadder = fa(faTableCells)
export const IconCube = fa(faCube)
export const IconMonitor = fa(faDisplay)
export const IconTools = fa(faScrewdriverWrench)
export const IconLayers = fa(faLayerGroup)
export const IconOrganize = fa(faWandMagicSparkles)
export const IconTag = fa(faTag)
export const IconDownload = fa(faDownload)
export const IconSearch = fa(faMagnifyingGlass)
export const IconChevronDown = fa(faChevronDown)
export const IconChevronLeft = fa(faChevronLeft)
export const IconChevronRight = fa(faChevronRight)
export const IconChevronUp = fa(faChevronUp)
export const IconArrowRight = fa(faArrowRight)
export const IconArrowLeft = fa(faArrowLeft)
export const IconLock = fa(faLock)
export const IconUnlock = fa(faLockOpen)
export const IconShield = fa(faShieldHalved)
export const IconDelete = fa(faTrashCan)
export const IconPlus = fa(faPlus)
export const IconRotate = fa(faRotate)
export const IconCopy = fa(faCopy)
export const IconContact = fa(faToggleOff)
export const IconCoil = fa(faCircleDot)
export const IconTimer = fa(faClock)
export const IconCounter = fa(faHashtag)
export const IconBranch = fa(faCodeFork)
export const IconCompare = fa(faCodeCompare)
export const IconMove = fa(faArrowsUpDownLeftRight)
export const IconMath = fa(faCalculator)
export const IconFunction = fa(faSquareRootVariable)
export const IconClose = fa(faXmark)
export const IconCheck = fa(faCheck)
export const IconWarning = fa(faTriangleExclamation)
export const IconLink = fa(faLink)
export const IconEye = fa(faEye)
export const IconEyeOff = fa(faEyeSlash)
export const IconBox = fa(faCube)
export const IconCylinder = fa(faDatabase)
export const IconSphere = fa(faCircle)
export const IconCone = fa(faCaretUp)
export const IconTorus = fa(faCircleNotch)
export const IconGroup = fa(faObjectGroup)
export const IconUngroup = fa(faObjectUngroup)
export const IconModel = fa(faCubes)
export const IconSparkle = fa(faLightbulb)
export const IconCamera = fa(faCamera)
export const IconImage = fa(faImage)
export const IconStar = fa(faStar)
export const IconSwap = fa(faRightLeft)
export const IconFocus = fa(faCrosshairs)
export const IconGround = fa(faDownLeftAndUpRightToCenter)
export const IconRuler = fa(faRulerCombined)
