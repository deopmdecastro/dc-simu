/**
 * DC-SIMU — Sistema de ícones
 * ---------------------------
 * Os ícones de ação da plataforma vêm do Font Awesome (pacote sólido), através
 * deste ficheiro: toolbar, biblioteca, painéis, editores e diálogos. Os símbolos
 * técnicos das etiquetas DIN usam os pictogramas SVG de CircuitIcon.tsx.
 * Assim, a mesma função tem sempre o mesmo ícone — por exemplo, mostrar e
 * esconder são sempre o olho e o olho cortado.
 *
 * Para trocar um ícone basta mudar a linha correspondente aqui.
 */
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { faBold } from '@fortawesome/free-solid-svg-icons/faBold'
import { faItalic } from '@fortawesome/free-solid-svg-icons/faItalic'
import { faUnderline } from '@fortawesome/free-solid-svg-icons/faUnderline'
import { faFont } from '@fortawesome/free-solid-svg-icons/faFont'
import { faNoteSticky } from '@fortawesome/free-solid-svg-icons/faNoteSticky'
import { faPalette } from '@fortawesome/free-solid-svg-icons/faPalette'
import { faPaperPlane } from '@fortawesome/free-solid-svg-icons/faPaperPlane'
import { faAlignCenter } from '@fortawesome/free-solid-svg-icons/faAlignCenter'
import { faAlignLeft } from '@fortawesome/free-solid-svg-icons/faAlignLeft'
import { faAlignRight } from '@fortawesome/free-solid-svg-icons/faAlignRight'
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons/faArrowLeft'
import { faArrowDown } from '@fortawesome/free-solid-svg-icons/faArrowDown'
import { faArrowPointer } from '@fortawesome/free-solid-svg-icons/faArrowPointer'
import { faArrowRight } from '@fortawesome/free-solid-svg-icons/faArrowRight'
import { faArrowUp } from '@fortawesome/free-solid-svg-icons/faArrowUp'
import { faArrowRotateLeft } from '@fortawesome/free-solid-svg-icons/faArrowRotateLeft'
import { faArrowsLeftRight } from '@fortawesome/free-solid-svg-icons/faArrowsLeftRight'
import { faArrowsUpDown } from '@fortawesome/free-solid-svg-icons/faArrowsUpDown'
import { faArrowsUpDownLeftRight } from '@fortawesome/free-solid-svg-icons/faArrowsUpDownLeftRight'
import { faBarsStaggered } from '@fortawesome/free-solid-svg-icons/faBarsStaggered'
import { faBell } from '@fortawesome/free-solid-svg-icons/faBell'
import { faBorderAll } from '@fortawesome/free-solid-svg-icons/faBorderAll'
import { faBorderTopLeft } from '@fortawesome/free-solid-svg-icons/faBorderTopLeft'
import { faCalculator } from '@fortawesome/free-solid-svg-icons/faCalculator'
import { faCamera } from '@fortawesome/free-solid-svg-icons/faCamera'
import { faCaretUp } from '@fortawesome/free-solid-svg-icons/faCaretUp'
import { faCheck } from '@fortawesome/free-solid-svg-icons/faCheck'
import { faCircleCheck } from '@fortawesome/free-solid-svg-icons/faCircleCheck'
import { faCircleXmark } from '@fortawesome/free-solid-svg-icons/faCircleXmark'
import { faClockRotateLeft } from '@fortawesome/free-solid-svg-icons/faClockRotateLeft'
import { faCommentDots } from '@fortawesome/free-solid-svg-icons/faCommentDots'
import { faChevronDown } from '@fortawesome/free-solid-svg-icons/faChevronDown'
import { faChevronLeft } from '@fortawesome/free-solid-svg-icons/faChevronLeft'
import { faChevronRight } from '@fortawesome/free-solid-svg-icons/faChevronRight'
import { faChevronUp } from '@fortawesome/free-solid-svg-icons/faChevronUp'
import { faCircle } from '@fortawesome/free-solid-svg-icons/faCircle'
import { faCircleDot } from '@fortawesome/free-solid-svg-icons/faCircleDot'
import { faCircleNotch } from '@fortawesome/free-solid-svg-icons/faCircleNotch'
import { faCircleQuestion } from '@fortawesome/free-solid-svg-icons/faCircleQuestion'
import { faClock } from '@fortawesome/free-solid-svg-icons/faClock'
import { faCodeBranch } from '@fortawesome/free-solid-svg-icons/faCodeBranch'
import { faCodeCompare } from '@fortawesome/free-solid-svg-icons/faCodeCompare'
import { faCodeFork } from '@fortawesome/free-solid-svg-icons/faCodeFork'
import { faCopy } from '@fortawesome/free-solid-svg-icons/faCopy'
import { faCrosshairs } from '@fortawesome/free-solid-svg-icons/faCrosshairs'
import { faCube } from '@fortawesome/free-solid-svg-icons/faCube'
import { faCubes } from '@fortawesome/free-solid-svg-icons/faCubes'
import { faDatabase } from '@fortawesome/free-solid-svg-icons/faDatabase'
import { faDiagramProject } from '@fortawesome/free-solid-svg-icons/faDiagramProject'
import { faDisplay } from '@fortawesome/free-solid-svg-icons/faDisplay'
import { faDownLeftAndUpRightToCenter } from '@fortawesome/free-solid-svg-icons/faDownLeftAndUpRightToCenter'
import { faDownload } from '@fortawesome/free-solid-svg-icons/faDownload'
import { faEraser } from '@fortawesome/free-solid-svg-icons/faEraser'
import { faEye } from '@fortawesome/free-solid-svg-icons/faEye'
import { faEyeSlash } from '@fortawesome/free-solid-svg-icons/faEyeSlash'
import { faFile } from '@fortawesome/free-solid-svg-icons/faFile'
import { faFileArrowUp } from '@fortawesome/free-solid-svg-icons/faFileArrowUp'
import { faFileImport } from '@fortawesome/free-solid-svg-icons/faFileImport'
import { faFilePdf } from '@fortawesome/free-solid-svg-icons/faFilePdf'
import { faHardDrive } from '@fortawesome/free-solid-svg-icons/faHardDrive'
import { faHourglassHalf } from '@fortawesome/free-solid-svg-icons/faHourglassHalf'
import { faInbox } from '@fortawesome/free-solid-svg-icons/faInbox'
import { faShapes } from '@fortawesome/free-solid-svg-icons/faShapes'
import { faFloppyDisk } from '@fortawesome/free-solid-svg-icons/faFloppyDisk'
import { faFolder } from '@fortawesome/free-solid-svg-icons/faFolder'
import { faFolderOpen } from '@fortawesome/free-solid-svg-icons/faFolderOpen'
import { faFolderTree } from '@fortawesome/free-solid-svg-icons/faFolderTree'
import { faForwardStep } from '@fortawesome/free-solid-svg-icons/faForwardStep'
import { faHand } from '@fortawesome/free-solid-svg-icons/faHand'
import { faHashtag } from '@fortawesome/free-solid-svg-icons/faHashtag'
import { faImage } from '@fortawesome/free-solid-svg-icons/faImage'
import { faKeyboard } from '@fortawesome/free-solid-svg-icons/faKeyboard'
import { faLayerGroup } from '@fortawesome/free-solid-svg-icons/faLayerGroup'
import { faLightbulb } from '@fortawesome/free-solid-svg-icons/faLightbulb'
import { faLink } from '@fortawesome/free-solid-svg-icons/faLink'
import { faLock } from '@fortawesome/free-solid-svg-icons/faLock'
import { faLockOpen } from '@fortawesome/free-solid-svg-icons/faLockOpen'
import { faMagnet } from '@fortawesome/free-solid-svg-icons/faMagnet'
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons/faMagnifyingGlass'
import { faMagnifyingGlassMinus } from '@fortawesome/free-solid-svg-icons/faMagnifyingGlassMinus'
import { faMagnifyingGlassPlus } from '@fortawesome/free-solid-svg-icons/faMagnifyingGlassPlus'
import { faObjectGroup } from '@fortawesome/free-solid-svg-icons/faObjectGroup'
import { faObjectUngroup } from '@fortawesome/free-solid-svg-icons/faObjectUngroup'
import { faPause } from '@fortawesome/free-solid-svg-icons/faPause'
import { faPenToSquare } from '@fortawesome/free-solid-svg-icons/faPenToSquare'
import { faPlay } from '@fortawesome/free-solid-svg-icons/faPlay'
import { faPlus } from '@fortawesome/free-solid-svg-icons/faPlus'
import { faRightFromBracket } from '@fortawesome/free-solid-svg-icons/faRightFromBracket'
import { faRightLeft } from '@fortawesome/free-solid-svg-icons/faRightLeft'
import { faRotate } from '@fortawesome/free-solid-svg-icons/faRotate'
import { faRotateLeft } from '@fortawesome/free-solid-svg-icons/faRotateLeft'
import { faRotateRight } from '@fortawesome/free-solid-svg-icons/faRotateRight'
import { faRulerCombined } from '@fortawesome/free-solid-svg-icons/faRulerCombined'
import { faScrewdriverWrench } from '@fortawesome/free-solid-svg-icons/faScrewdriverWrench'
import { faShieldHalved } from '@fortawesome/free-solid-svg-icons/faShieldHalved'
import { faSquareRootVariable } from '@fortawesome/free-solid-svg-icons/faSquareRootVariable'
import { faStar } from '@fortawesome/free-solid-svg-icons/faStar'
import { faStethoscope } from '@fortawesome/free-solid-svg-icons/faStethoscope'
import { faStop } from '@fortawesome/free-solid-svg-icons/faStop'
import { faTableCells } from '@fortawesome/free-solid-svg-icons/faTableCells'
import { faTag } from '@fortawesome/free-solid-svg-icons/faTag'
import { faToggleOff } from '@fortawesome/free-solid-svg-icons/faToggleOff'
import { faTrashCan } from '@fortawesome/free-solid-svg-icons/faTrashCan'
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons/faTriangleExclamation'
import { faUpDownLeftRight } from '@fortawesome/free-solid-svg-icons/faUpDownLeftRight'
import { faUser } from '@fortawesome/free-solid-svg-icons/faUser'
import { faUsers } from '@fortawesome/free-solid-svg-icons/faUsers'
import { faWandMagicSparkles } from '@fortawesome/free-solid-svg-icons/faWandMagicSparkles'
import { faXmark } from '@fortawesome/free-solid-svg-icons/faXmark'
import { faIdCard } from '@fortawesome/free-solid-svg-icons/faIdCard'
import { faCreditCard } from '@fortawesome/free-solid-svg-icons/faCreditCard'
import { faKey } from '@fortawesome/free-solid-svg-icons/faKey'
import { faEnvelope } from '@fortawesome/free-solid-svg-icons/faEnvelope'
import { faEllipsis } from '@fortawesome/free-solid-svg-icons/faEllipsis'
import { faSliders } from '@fortawesome/free-solid-svg-icons/faSliders'
import { faUserGear } from '@fortawesome/free-solid-svg-icons/faUserGear'
import { faBolt } from '@fortawesome/free-solid-svg-icons/faBolt'
import { faCircleInfo } from '@fortawesome/free-solid-svg-icons/faCircleInfo'
import { faGraduationCap } from '@fortawesome/free-solid-svg-icons/faGraduationCap'
import { faSkullCrossbones } from '@fortawesome/free-solid-svg-icons/faSkullCrossbones'
import { faDeleteLeft } from '@fortawesome/free-solid-svg-icons/faDeleteLeft'
import { faFlag } from '@fortawesome/free-solid-svg-icons/faFlag'
import { faArrowUpRightFromSquare } from '@fortawesome/free-solid-svg-icons/faArrowUpRightFromSquare'
import { faVolumeHigh } from '@fortawesome/free-solid-svg-icons/faVolumeHigh'

export type IconProps = { size?: number; className?: string; title?: string }

/** Base comum: tamanho em pixels e cor herdada do texto. */
function fa(icon: IconDefinition) {
  return function Icon({ size = 14, className, title }: IconProps) {
    return <FontAwesomeIcon icon={icon} className={className} title={title} style={{ width: size, height: size, flexShrink: 0 }} focusable="false" aria-hidden={title ? undefined : true} />
  }
}


export const IconFile = fa(faFile)
export const IconSave = fa(faFloppyDisk)
export const IconFolder = fa(faFolder)
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
export const IconEdit = fa(faPenToSquare)
export const IconArrowLeft = fa(faArrowLeft)
export const IconArrowUp = fa(faArrowUp)
export const IconArrowDown = fa(faArrowDown)
export const IconLock = fa(faLock)
export const IconUnlock = fa(faLockOpen)
export const IconShield = fa(faShieldHalved)
export const IconDelete = fa(faTrashCan)
export const IconPlus = fa(faPlus)
export const IconRotate = fa(faRotate)
export const IconRotateLeft = fa(faRotateLeft)
export const IconRotateRight = fa(faRotateRight)
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
export const IconCheckCircle = fa(faCircleCheck)
export const IconXCircle = fa(faCircleXmark)
export const IconPending = fa(faHourglassHalf)
export const IconUsers = fa(faUsers)
export const IconStorage = fa(faHardDrive)
export const IconInbox = fa(faInbox)
export const IconHistory = fa(faClockRotateLeft)
export const IconPdf = fa(faFilePdf)
/** Comentários do projeto (bolha com pontos). */
export const IconComment = fa(faCommentDots)
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
export const IconKeyboard = fa(faKeyboard)
export const IconStar = fa(faStar)
/** Importar ficheiro para o projeto (ficheiro com seta a entrar). */
export const IconImport = fa(faFileImport)
/** Zona de largar ficheiro (ficheiro com seta para cima). */
export const IconFileUpload = fa(faFileArrowUp)
export const IconTemplates = fa(faShapes)
export const IconExample = fa(faWandMagicSparkles)
export const IconSwap = fa(faRightLeft)
export const IconFocus = fa(faCrosshairs)
export const IconGround = fa(faDownLeftAndUpRightToCenter)
export const IconRuler = fa(faRulerCombined)

/* Símbolo oficial GRAFCET: três etapas ligadas, conforme a referência aprovada. */
export const IconGrafcet = fa(faDiagramProject)
/** Comandos elétricos (contactores, botões, motores). */
export const IconCommands = fa(faBolt)
export const IconAccount = fa(faUserGear)
export const IconIdCard = fa(faIdCard)
export const IconCard = fa(faCreditCard)
export const IconKey = fa(faKey)
export const IconMail = fa(faEnvelope)

/* Anotações: texto livre e comentários do canvas. */
export const IconBold = fa(faBold)
export const IconItalic = fa(faItalic)
export const IconUnderline = fa(faUnderline)
export const IconText = fa(faFont)
export const IconNote = fa(faNoteSticky)
export const IconPalette = fa(faPalette)
export const IconSend = fa(faPaperPlane)
/** Alinhamento de texto (o centro do texto não é o «alinhar ao eixo» dos componentes). */
export const IconTextCenter = fa(faAlignCenter)
export const IconMore = fa(faEllipsis)
export const IconSignals = fa(faSliders)
export const IconInfo = fa(faCircleInfo)
export const IconGraduation = fa(faGraduationCap)
export const IconDanger = fa(faSkullCrossbones)
export const IconBackspace = fa(faDeleteLeft)
export const IconFlag = fa(faFlag)
export const IconExternalLink = fa(faArrowUpRightFromSquare)
export const IconSound = fa(faVolumeHigh)

/** Indicadores consistentes para os diagnósticos IEC, 3D, Ladder e GRAFCET. */
export function IconIssue({ level, ...props }: IconProps & { level: 'error' | 'warning' | 'info' }) {
  const Icon = level === 'error' ? IconXCircle : level === 'warning' ? IconWarning : IconInfo
  return <Icon {...props} />
}
