import { nanoid } from 'nanoid'
import type { LadderTag } from '../types'
import ActionSymbol, { actionShape } from './ActionSymbol'
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import { uiConfirm } from '../ui/dialogs'
import { allowedViews } from '../project/kind'
import { isSmallScreen } from '../ui/cleanMode'
import { useSimStore } from '../store/useSimStore'
import {
  ACTION_KINDS,
  normalizeActionVariable,
  actionsOfStep,
  evalCondition,
  transitionReceptivity,
  transitionsOf,
  validateGrafcet,
  validCondition,
  type GrafcetAction,
  type GrafcetActionKind,
  type GrafcetIssue,
  type GrafcetStep,
  type GrafcetChart,
  type GrafcetTransition,
  type GrafcetBranchType,
  type GrafcetProgram,
  type GrafcetComment,
} from './engine'
import StepDialog from './StepDialog'
import ActionDialog from './ActionDialog'
import TransitionDialog from './TransitionDialog'
import ConditionEditor from './ConditionEditor'
import SignalTableDialog from './SignalTableDialog'
import { grafcetSignals, insertCondition, signalAddressesInCondition, signalUsage, undeclaredSignals, type SignalArea } from './signals'
import SignalsPanel, { type SignalsContext } from './SignalsPanel'
import { GRAFCET_TEMPLATES, type GrafcetTemplateInfo } from './templates'
import { renderConditionTspans } from './grafcetRender'
import GrafcetSimPanel from './GrafcetSimPanel'
import GrafcetSimBar from './GrafcetSimBar'
import GrafcetTemplatesDialog from './GrafcetTemplatesDialog'
import { applyLadderFromGrafcet, describeLadderDiff, diffGeneratedLadder, hasGeneratedLadder, ladderSyncStatus, previewLadder } from './ladderSync'
import {
  IconChevronLeft,
  IconCopy,
  IconCursor,
  IconDelete,
  IconHand,
  IconSearch,
  IconWire,
  IconChevronDown, IconCheck,
  IconSchematic,
  IconPlus,
  IconImport,
  IconTemplates,
  IconExample,
  IconOpen,
  IconClose,
  IconAlignCenterH,
  IconAlignTop,
  IconDistH,
  IconDistV,
  IconFocus,
  IconZoomIn,
  IconZoomOut,
  IconReset,
  IconGrid,
  IconTools,
  IconLayers
} from '../ui/icons'
import CollapsedPanelRail from '../components/CollapsedPanelRail'
import { useNarrowMenu } from '../ui/toolbarKit'
import SidePanelHeader from '../components/SidePanelHeader'
import GrafcetShortcutsDialog from './GrafcetShortcutsDialog'
import GrafcetMinimap from './GrafcetMinimap'
import GrafcetContextMenu, { type ContextMenuItem } from './GrafcetContextMenu'
import { rectFromPoints, stepsInRect, unionIds, toggleId, clampGroupDelta, alignPositions, distributePositions, cloneSubDiagram, boundsOf, fitView, type Pos, type AlignMode, type DistributeAxis, type SubDiagram } from './selection'
import { useEditorShortcuts } from '../ui/shortcuts'
import { pinchPan, usePinchZoom } from '../ui/usePinchZoom'
import { useGrafcetUi, type GrafcetBusAction } from './grafcetBus'
import { EDITOR_THEME } from '../ui/editorTheme'
import {
  GRID,
  SPINE_X,
  START_Y,
  STEP_H,
  alignToOthers,
  autoLayout,
  clampPosition,
  snapToGrid,
  stepPitch,
} from './layout'

import { applySegmentDrag, beginSegmentDrag, bendInsertIndex, expandPolyline, findClearSpot, interiorBends, moveBendOrthogonal, nearestLeg, polylineMidpoint, routeThrough, routeVertical, simplifyOrthogonal, type Point, type SegmentDrag } from './links'
import { foldText } from '../utils/text'
import { readGrafcetFile } from './importFile'
import GrafcetImportDialog from './GrafcetImportDialog'
import { requireFeature } from '../saas/usePlan'
import '../styles/grafcet-construction.css'
import { InlineName } from '../ui/InlineName'

const id = () => crypto.randomUUID()

type PaletteItem = 'initial' | 'step' | 'transition' | 'action' | 'conditional' | 'fork' | 'join' | 'or-block' | 'and-block'
type EditorTab = 'steps' | 'transitions' | 'signals' | 'io' | 'diagnostics'
type HistoryMode = 'auto' | 'force' | 'skip'
type ValidationIssue = GrafcetIssue

const GRAFCET_MIME = 'application/x-dcsimu-grafcet'

// Geometria das ações no diagrama (caixa IEC junto à etapa / solta)
const ACTION_X = SPINE_X + 80
const ACTION_W = 140
const ACTION_H = 30
const ACTION_QUALIFIER_W = 32
const ACTION_PITCH = 38
const ACTION_FREE_W = ACTION_W
const ACTION_FREE_H = ACTION_H
/** Distância do eixo da etapa à caixa da ação anexada (a coluna de ações acompanha a etapa). */
const ACTION_OFFSET_X = ACTION_X - SPINE_X
/** Desvio vertical da 1.ª ação: o seu centro fica alinhado com a ligação que sai da etapa (linha reta). */
const ACTION_TOP_OFFSET = (STEP_H - ACTION_H) / 2
/** Distância do barramento vertical de ligação à caixa da ação. */
const ACTION_BUS_GAP = 24

/** Disposição das ações de uma etapa: em linha (lado a lado, por omissão) ou empilhadas na vertical. */
type ActionLayout = 'row' | 'column'
const stepActionLayout = (step: { actionLayout?: ActionLayout } | undefined): ActionLayout => (step?.actionLayout === 'column' ? 'column' : 'row')
/** Deslocamento (relativo ao eixo/topo da etapa) do canto superior esquerdo da ação de índice `index`. */
const actionSlotOffset = (layout: ActionLayout, index: number) =>
  layout === 'row'
    ? { dx: ACTION_OFFSET_X + index * ACTION_W, dy: ACTION_TOP_OFFSET }
    : { dx: ACTION_OFFSET_X, dy: ACTION_TOP_OFFSET + index * ACTION_PITCH }
/** Largura ocupada pelas ações (à direita do eixo da etapa) com `count` ações. */
const actionsExtentX = (layout: ActionLayout, count: number) => ACTION_OFFSET_X + (layout === 'row' ? Math.max(1, count) * ACTION_W : ACTION_W)

/** Keep diagram labels inside their lane; the complete value remains in the SVG title. */
const diagramLabel = (value: string, limit: number) => value.length > limit ? `${value.slice(0, limit - 1).trimEnd()}…` : value
const actionLabel = (action: GrafcetAction) => action.displayDescription && action.description
  ? action.description
  : action.variable || action.address || 'ação'
const diagramCondition = (condition: string) => <>
  <title>{condition}</title>
  <tspan fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" paintOrder="stroke" stroke="#fbfcfe" strokeWidth="4" strokeLinejoin="round">
    {renderConditionTspans(condition === '1' ? '=1' : diagramLabel(condition || '1', 40))}
  </tspan>
</>

/**
 * Ligação ortogonal etapa → ação com cantos arredondados:
 * sai de (x1, y1), desce/sobe pelo barramento em `busX` e entra em (x2, y2).
 * Reta quando os dois extremos estão à mesma altura.
 */
function actionLinkPath(x1: number, y1: number, busX: number, y2: number, x2: number, radius = 8): string {
  const dy = y2 - y1
  if (Math.abs(dy) < 1.5) return `M ${x1} ${y1} H ${x2}`
  const dir = dy > 0 ? 1 : -1
  const r = Math.max(0, Math.min(radius, Math.abs(dy) / 2, Math.abs(busX - x1), Math.abs(x2 - busX)))
  return `M ${x1} ${y1} H ${busX - r} Q ${busX} ${y1} ${busX} ${y1 + dir * r} V ${y2 - dir * r} Q ${busX} ${y2} ${busX + r} ${y2} H ${x2}`
}
const PALETTE: Array<{ group: string; items: Array<{ kind: PaletteItem; icon: string; name: string; detail: string }> }> = [
  {
    group: 'Etapas e ligações',
    items: [
      { kind: 'initial', icon: '◎', name: 'Etapa inicial', detail: 'Ponto de partida da sequência' },
      { kind: 'step', icon: '□', name: 'Etapa', detail: 'Nasce sem ligação — una-a depois' },
      { kind: 'transition', icon: '⊣', name: 'Transição solta', detail: 'Barra livre — arraste ou ligue por linha' },
    ],
  },
  {
    group: 'Ações',
    items: [
      { kind: 'action', icon: '▤', name: 'Ação', detail: 'Saída Q ou memória M' },
      { kind: 'conditional', icon: '◇', name: 'Ação condicionada', detail: 'Saída ativa sob condição' },
    ],
  },
  {
    group: 'Ramos simultâneos',
    items: [
      { kind: 'fork', icon: '⑂', name: 'Divergência AND', detail: 'Uma etapa → dois ramos' },
      { kind: 'join', icon: '⑃', name: 'Convergência AND', detail: 'Dois ramos → uma etapa' },
    ],
  },
  {
    group: 'Estruturas prontas',
    items: [
      { kind: 'or-block', icon: '⑂', name: 'Seleção OU (2 ramos)', detail: 'Etapa → 2 ramos alternativos → etapa final' },
      { kind: 'and-block', icon: '⑂', name: 'Paralelismo ET (2 ramos)', detail: 'Etapa → 2 ramos simultâneos (barra dupla) → etapa final' },
    ],
  },
]

/** Símbolos IEC compactos para a paleta: consistentes com os elementos do canvas,
 * sem depender de caracteres de fonte que variam entre sistemas operativos. */
function GrafcetPaletteGlyph({ kind }: { kind: PaletteItem }) {
  const props = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (kind === 'initial') return <svg viewBox="0 0 36 30" aria-hidden="true"><rect x="8" y="5" width="20" height="20" rx="2" {...props} /><rect x="11" y="8" width="14" height="14" rx="1" {...props} /></svg>
  if (kind === 'step') return <svg viewBox="0 0 36 30" aria-hidden="true"><rect x="8" y="5" width="20" height="20" rx="2" {...props} /><path d="M14 15h8" {...props} /></svg>
  if (kind === 'transition') return <svg viewBox="0 0 36 30" aria-hidden="true"><path d="M18 3v8M10 12h16M18 13v14" {...props} /></svg>
  if (kind === 'action') return <svg viewBox="0 0 36 30" aria-hidden="true"><path d="M4 15h6M10 7h21v16H10zM15 12h11M15 18h7" {...props} /></svg>
  if (kind === 'conditional') return <svg viewBox="0 0 36 30" aria-hidden="true"><path d="M4 15h5M9 7h22v16H9zM15 15l4-4 4 4-4 4z" {...props} /></svg>
  if (kind === 'or-block') return <svg viewBox="0 0 36 30" aria-hidden="true"><path d="M18 2v5M7 7h22M7 7v3M29 7v3M4 12h6M26 12h6M7 12v8M29 12v8M7 20h22M18 20v8" {...props} /></svg>
  if (kind === 'and-block') return <svg viewBox="0 0 36 30" aria-hidden="true"><path d="M18 2v4M6 7h24M6 10h24M9 10v10M27 10v10M6 20h24M6 23h24M18 23v5" {...props} /></svg>
  if (kind === 'fork') return <svg viewBox="0 0 36 30" aria-hidden="true"><path d="M18 3v6M8 10h20M8 14h20M18 14v13M12 14v7M24 14v7" {...props} /></svg>
  return <svg viewBox="0 0 36 30" aria-hidden="true"><path d="M12 3v7M24 3v7M8 10h20M8 14h20M18 14v13" {...props} /></svg>
}

const norm = foldText

const actionsOf = (step: GrafcetStep): GrafcetAction[] => actionsOfStep(step)
const fmtSeconds = (ms: number) => `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s`

export const getStepDisplayInfo = (step: GrafcetStep, fallbackIndex: number) => {
  const explicitComment = (step.description || step.comment || '').trim()
  const rawName = (step.name || '').trim()

  if (!rawName) {
    return { stepNumber: String(fallbackIndex), comment: explicitComment }
  }

  // Se o nome for formato "Etapa 81" ou "Step 81" ou "E81" (com ou sem comentário "Etapa 81: Espera")
  const prefixMatch = rawName.match(/^(?:Etapa|Step|E)\s*(\d+[a-zA-Z]?)(?:\s*[-:]\s*(.*))?$/i)
  if (prefixMatch) {
    const num = prefixMatch[1]
    const parsedComment = prefixMatch[2]?.trim() || ''
    return { stepNumber: num, comment: explicitComment || parsedComment }
  }

  // Se começar com número seguido de comentário, ex: "81 - Aguarda Peça" ou "81: Espera"
  const numCommentMatch = rawName.match(/^(\d+[a-zA-Z]?)(?:\s*[-:]\s*(.*))$/)
  if (numCommentMatch) {
    const num = numCommentMatch[1]
    const parsedComment = numCommentMatch[2]?.trim() || ''
    return { stepNumber: num, comment: explicitComment || parsedComment }
  }

  // Se for apenas o número/identificador da etapa, ex: "81", "85", "0", "1", "11", "20"
  if (/^\d+[a-zA-Z]?$/.test(rawName)) {
    return { stepNumber: rawName, comment: explicitComment }
  }

  // Se for um identificador curto industrial como "INIT", "M1", "WAIT" (até 5 caracteres sem espaço)
  if (rawName.length <= 5 && !rawName.includes(' ')) {
    return { stepNumber: rawName, comment: explicitComment }
  }

  // Nome longo descritivo: se já tem explicitComment, usa fallbackIndex; se não, usa rawName como comment
  return { stepNumber: String(fallbackIndex), comment: explicitComment || rawName }
}

/** Menor número de etapa ainda livre (evita «Etapa 2» repetida depois de apagar ou reordenar etapas). */
export const nextFreeStepNumber = (steps: readonly GrafcetStep[]): number => {
  const used = new Set(steps.map((step, index) => getStepDisplayInfo(step, index).stepNumber))
  let n = 0
  while (used.has(String(n))) n++
  return n
}

/** Zoom máximo do diagrama (roda do rato, botões e pinça): suficiente para ler os textos num telemóvel. */
const GRAFCET_ZOOM_MAX = 5

export default function GrafcetEditor({ full: fullProp = false, onOpenEditor, onOpenLadder }: { full?: boolean; onOpenEditor?: () => void; onOpenLadder?: () => void }) {
  const demoMode = useSimStore((state) => state.demoMode)
  // Na demonstração da landing o GRAFCET funciona exclusivamente em modo visualização/simulação (sem edição nem eliminação).
  const full = fullProp && !demoMode
  const program = useSimStore((state) => state.grafcet)
  const runtime = useSimStore((state) => state.grafcetRuntime)
  const table = useSimStore((state) => state.runtime.table)
  const tags = useSimStore((state) => state.tags)
  const setGrafcet = useSimStore((state) => state.setGrafcet)
  const sharedGridStyle = useSimStore((state) => state.grid.style)
  const running = useSimStore((state) => state.sim.runState === 'running')

  // ── Páginas do GRAFCET (charts IEC 60848): cada página mostra as suas etapas,
  //  transições, ações soltas e comentários. Elementos sem página pertencem à 1.ª.
  //  As páginas partilham o motor (todas correm em simultâneo), os sinais e a
  //  numeração global das etapas — é assim que comunicam (ex.: X7 noutra página,
  //  ligações «sem fio» X, sinais S/Q/I/MW e ações S/R).
  const pageCharts = program.charts ?? []
  const firstChartId = pageCharts[0]?.id
  const activeChart = pageCharts.some((c) => c.id === program.activeChart) ? program.activeChart! : firstChartId
  const inPage = <T extends { chart?: string }>(x: T): boolean => !firstChartId || (x.chart ?? firstChartId) === activeChart
  const allSteps = program.steps
  const allTransitions = transitionsOf(program)
  const allFree = program.freeActions ?? []
  const allComments = program.comments ?? []
  const steps = firstChartId ? allSteps.filter(inPage) : allSteps
  const transitions = firstChartId ? allTransitions.filter(inPage) : allTransitions
  const freeActions = firstChartId ? allFree.filter(inPage) : allFree
  const comments = firstChartId ? allComments.filter(inPage) : allComments
  const [selected, setSelected] = useState<string | null>(() => (full ? steps[0]?.id ?? null : null))
  const [tab, setTab] = useState<EditorTab>('steps')
  const [showPalette, setShowPalette] = useState(() => {
    try {
      const saved = localStorage.getItem('dcsimu:grafcet:palette')
      return saved === null ? !isSmallScreen() : saved !== '0'
    } catch {
      return !isSmallScreen()
    }
  })
  const [paletteFilter, setPaletteFilter] = useState('')
  const [entityFilter, setEntityFilter] = useState('')
  const [dropActive, setDropActive] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [signalsOpen, setSignalsOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const openLadderTimer = useRef<number | undefined>(undefined)
  const paletteSearchRef = useRef<HTMLInputElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const importRequestRef = useRef(0)
  useEffect(() => () => { importRequestRef.current++ }, [])

  // FluidSIM Dialogs state
  const [editingStep, setEditingStep] = useState<GrafcetStep | null>(null)
  const [editingTransition, setEditingTransition] = useState<GrafcetTransition | null>(null)
  const [editingAction, setEditingAction] = useState<{ step: GrafcetStep | null; action: GrafcetAction } | null>(null)
  const [hoveredStepId, setHoveredStepId] = useState<string | null>(null)
  const [hoveredTransitionId, setHoveredTransitionId] = useState<string | null>(null)
  const [hoveredActionId, setHoveredActionId] = useState<string | null>(null)
  const [focusedStepId, setFocusedStepId] = useState<string | null>(null)
  const [focusedTransitionId, setFocusedTransitionId] = useState<string | null>(null)
  const [focusedActionId, setFocusedActionId] = useState<string | null>(null)
  /* Hover com «intenção»: entrar aplica-se logo, sair só limpa passados uns ms. Sem isto, ao
     atravessar a folga entre um componente e os seus botões (ou ao passar de um para outro), os
     botões desmontavam e montavam a cada movimento do rato — o «piscar». */
  const hoverTimers = useRef<Partial<Record<'step' | 'transition' | 'action', number>>>({})
  const hoverElement = useCallback((kind: 'step' | 'transition' | 'action', id: string | null) => {
    const timers = hoverTimers.current
    window.clearTimeout(timers[kind])
    const apply = () => {
      timers[kind] = undefined
      if (kind === 'step') setHoveredStepId(id)
      else if (kind === 'transition') setHoveredTransitionId(id)
      else setHoveredActionId(id)
    }
    if (id) apply()
    else timers[kind] = window.setTimeout(apply, 90)
  }, [])
  useEffect(() => () => { Object.values(hoverTimers.current).forEach((timer) => window.clearTimeout(timer)) }, [])
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Ferramentas ativas: Selecionar vs Arrastar (Mão)
  const activeTool = useGrafcetUi((state) => state.tool)
  const setCanvasTool = useGrafcetUi((state) => state.setTool)
  const [isSpacePan, setIsSpacePan] = useState(false)
  const spacePressed = useRef(false)

  // Arrastamento livre de etapas dentro da grelha (posição guardada em step.x/y + pinned)
  const gridOn = useGrafcetUi((state) => state.gridOn)
  const snapOn = useGrafcetUi((state) => state.snapOn)
  const simVisible = useGrafcetUi((state) => state.simVisible)
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null)
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null })
  const dragPosRef = useRef<{ id: string; x: number; y: number } | null>(null)

  // Ligação por linha (ferramenta Ligar) e transições soltas arrastáveis
  /** Porto de um elemento: saída de etapa/transição (início de fio) ou entrada (fim de fio). */
  /**
   * Porta de ligação por linha: saída/entrada de etapa (transições), saída-ação da etapa
   * (ligar ações), entrada de transição solta, entrada de ação solta e "etapa como destino de ação".
   */
  type PortRef = { kind: 'step-out' | 'step-in' | 'trans-out' | 'trans-in' | 'step-action' | 'action-in' | 'step-attach' | 'branch-out'; id: string; side?: 'l' | 'r' | 't' | 'b' }
  const [wireDraft, setWireDraft] = useState<{ start: PortRef; x: number; y: number; moved: boolean } | null>(null)
  const [wireHover, setWireHover] = useState<PortRef | null>(null)
  const wireDraftRef = useRef<typeof wireDraft>(null)
  const wireHoverRef = useRef<PortRef | null>(null)
  /** Fio iniciado pelo puxador de uma etapa/transição (fora da ferramenta Ligar): termina sempre ao largar. */
  const quickWireRef = useRef(false)
  wireDraftRef.current = wireDraft
  wireHoverRef.current = wireHover
  const transDragRef = useRef<{
    transId: string
    startX: number
    startY: number
    origX: number
    origY: number
    moved: boolean
  } | null>(null)
  const [transDragPos, setTransDragPos] = useState<{ id: string; x: number; y: number } | null>(null)
  const [bendDragLive, setBendDragLive] = useState<{ tid: string; index: number; x: number; y: number } | null>(null)
  /** Percurso ortogonal ao vivo enquanto se arrasta um troço inteiro (só se guarda ao largar). */
  const [segDragLive, setSegDragLive] = useState<{ tid: string; points: Point[] } | null>(null)
  const bendDragRef = useRef<{ tid: string; index: number; x: number; y: number; moved: boolean } | null>(null)
  const segDragRef = useRef<{ tid: string; drag: SegmentDrag; startX: number; startY: number; moved: boolean; points: Point[] } | null>(null)
  const transDragPosRef = useRef<{ id: string; x: number; y: number } | null>(null)
  /** Etapa candidata a receber a transição solta que está a ser arrastada. */
  const [transDropStep, setTransDropStep] = useState<string | null>(null)

  // Arrastamento de ações (soltas ou desanexadas de uma etapa) pela grelha.
  const actionDragRef = useRef<{
    actionId: string
    fromStepId: string | null
    startX: number
    startY: number
    origX: number
    origY: number
    moved: boolean
  } | null>(null)
  const [actionDragPos, setActionDragPos] = useState<{ id: string; x: number; y: number } | null>(null)
  const actionDragPosRef = useRef<{ id: string; x: number; y: number } | null>(null)
  /** Etapa candidata a receber a ação que está a ser arrastada. */
  const [actionDropStep, setActionDropStep] = useState<string | null>(null)
  const stepDragRef = useRef<{
    stepId: string
    startX: number
    startY: number
    origX: number
    origY: number
    moved: boolean
    /** Posições iniciais de todas as etapas do grupo (arrasto em grupo). */
    group?: Pos[]
  } | null>(null)

  // Seleção múltipla: `multi` guarda o grupo (≥ 2 etapas) e `selected` é sempre um dos membros.
  const [multi, setMulti] = useState<string[]>([])
  /** Retângulo de seleção em curso (coordenadas do ecrã, relativas à vista). */
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const marqueeRef = useRef<{ sx: number; sy: number; add: boolean; base: string[]; moved: boolean } | null>(null)
  /** Deslocamento aplicado aos restantes membros do grupo durante o arrasto. */
  const [groupOffset, setGroupOffset] = useState<{ dx: number; dy: number } | null>(null)
  /** Evita que o clique que termina um arrasto altere a seleção. */
  const suppressClickRef = useRef(false)
  /** Menu de contexto (botão direito) e minimapa. */
  const [menu, setMenu] = useState<{ x: number; y: number; kind: 'step' | 'group' | 'canvas'; stepId?: string; at: { x: number; y: number } } | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const [minimapOn, setMinimapOn] = useState(() => {
    try {
      return localStorage.getItem('dcsimu:grafcet:minimap') !== '0'
    } catch {
      return true
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('dcsimu:grafcet:minimap', minimapOn ? '1' : '0')
    } catch {
      /* navegação privada */
    }
  }, [minimapOn])
  // O canvas já não tem HUD flutuante: o botão «Mapa» e o resumo do diagrama vivem na barra
  // de ferramentas, que só vê o estado que lhe for espelhado (DC-ADR-059).
  useEffect(() => { useGrafcetUi.getState().setMinimapOn(minimapOn) }, [minimapOn])
  useEffect(() => {
    const total = steps.reduce((acc, step) => acc + actionsOf(step).length, 0) + freeActions.length
    useGrafcetUi.getState().setStats(`${steps.length} etapas · ${transitions.length} transições · ${total} ações${freeActions.length > 0 ? ` (${freeActions.length} soltas)` : ''}`)
  }, [steps, transitions, freeActions])
  /** Área de transferência interna do editor (Ctrl+C / Ctrl+V). */
  const clipboardRef = useRef<{ ids: string[]; steps: GrafcetStep[]; transitions: GrafcetTransition[]; pos: Map<string, { x: number; y: number }>; pastes: number } | null>(null)

  const selectedStep = steps.find((step) => step.id === selected)
  const selectedTransition = transitions.find((transition) => transition.id === selected)
  const selectedAction = selectedStep ? (actionsOf(selectedStep).find((a) => a.id === selectedActionId) ?? null) : null
  /** Mobile: Propriedades é uma gaveta recolhida; abre ao selecionar algo (no desktop é sempre visível). */
  const [propsOpen, setPropsOpen] = useState(false)
  /* Até 800 px o inspetor é uma gaveta no fundo (index.css): as setas apontam para cima/baixo, não para os lados. */
  const propsAtBottom = useNarrowMenu('(max-width: 800px)')
  const [propsTall, setPropsTall] = useState(false)
  const propsFirstRun = useRef(true)
  useEffect(() => {
    if (propsFirstRun.current) { propsFirstRun.current = false; return }
    // No telemóvel a gaveta não abre sozinha: tapar o diagrama a cada seleção
    // esconde justamente o que se acabou de tocar. O resumo mostra o elemento
    // selecionado e um botão abre as propriedades.
    const narrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 800px)').matches
    if (selected && !narrow) setPropsOpen(true)
  }, [selected])

  const isStepSelected = (stepId: string) => (selected === stepId && !selectedActionId) || multi.includes(stepId)
  const isActionSelected = (actionId: string) => selectedActionId === actionId
  const isTransitionSelected = (transId: string) => selected === transId && !selectedActionId

  useEffect(() => {
    try {
      localStorage.setItem('dcsimu:grafcet:palette', showPalette ? '1' : '0')
    } catch {
      /* navegação privada */
    }
  }, [showPalette])
  useEffect(() => {
    if (full) useGrafcetUi.getState().setPaletteOpen(showPalette)
  }, [showPalette, full])
  useEffect(() => {
    if (!simVisible && tab === 'io') setTab('steps')
  }, [simVisible, tab])

  useEffect(() => () => { window.clearTimeout(toastTimer.current); window.clearTimeout(openLadderTimer.current) }, [])

  useEffect(() => {
    if (selected && !steps.some((step) => step.id === selected) && !transitions.some((transition) => transition.id === selected)) {
      setSelected(null)
      setSelectedActionId(null)
    }
  }, [selected, steps, transitions])

  // Mantém o grupo coerente: sem etapas apagadas e sempre com a seleção principal lá dentro.
  useEffect(() => {
    if (!multi.length) return
    const alive = multi.filter((value) => steps.some((step) => step.id === value))
    if (alive.length < 2 || !selected || !alive.includes(selected)) setMulti([])
    else if (alive.length !== multi.length) setMulti(alive)
  }, [selected, steps, multi])

  const notify = (text: string) => {
    window.clearTimeout(toastTimer.current)
    setToast({ id: Date.now(), text })
    toastTimer.current = window.setTimeout(() => setToast(null), 1500)
  }

  const save = (patch: Partial<GrafcetProgram>, mode: HistoryMode = 'force', historyKey = 'grafcet') => {
    const p = { ...patch }
    if (firstChartId) {
      const stamp = <T extends { id: string; chart?: string }>(all: T[], edited: T[]): T[] => {
        const known = new Set(all.map((x) => x.id))
        return edited.map((x) => (known.has(x.id) || x.chart ? x : { ...x, chart: activeChart }))
      }
      if (p.steps) p.steps = [...allSteps.filter((s) => !inPage(s)), ...stamp(allSteps, p.steps)]
      if (p.transitions) p.transitions = [...allTransitions.filter((t) => !inPage(t)), ...stamp(allTransitions, p.transitions)]
      if (p.freeActions) p.freeActions = [...allFree.filter((a) => !inPage(a)), ...stamp(allFree, p.freeActions)]
      if (p.comments) p.comments = [...allComments.filter((c) => !inPage(c)), ...stamp(allComments, p.comments)]
    }
    setGrafcet({ ...program, transitions: p.transitions ?? allTransitions, ...p }, mode, historyKey)
  }

  // ---------- páginas (charts) ----------
  const pageActive = activeChart
  const chartOf = (x: { chart?: string }) => x.chart ?? firstChartId
  const addPage = () => {
    const ensured: GrafcetChart[] = pageCharts.length ? pageCharts : [{ id: 'chart-p1', name: 'Página 1', title: 'Página 1' }]
    const id = `chart-${Date.now().toString(36)}`
    const title = `Página ${ensured.length + 1}`
    setGrafcet({ ...program, charts: [...ensured, { id, name: title, title }], activeChart: id }, 'force', 'grafcet:pages')
    notify(`Página «${title}» criada — as páginas comunicam por sinais, referências X e ligações sem fio`)
    setTab('steps')
  }
  const switchPage = (id: string) => {
    setSelected(null)
    setMulti([])
    setGrafcet({ ...program, activeChart: id }, 'skip', 'grafcet:pages:switch')
  }
  const renamePage = (id: string, next: string) => {
    const name = next.trim()
    const chart = pageCharts.find((c) => c.id === id)
    if (!name || (chart && name === (chart.title || chart.name))) return
    const base = pageCharts.length ? pageCharts : [{ id, name: 'Página 1', title: 'Página 1' } as GrafcetChart]
    save({ charts: base.map((c) => (c.id === id ? { ...c, name, title: name } : c)) }, 'force', 'grafcet:pages:rename')
  }
  const deletePage = async (id: string) => {
    const chartSteps = allSteps.filter((s) => chartOf(s) === id)
    const chartTransitions = allTransitions.filter((t) => chartOf(t) === id)
    const touchedElsewhere = allTransitions.filter((t) => chartOf(t) !== id && (t.from.some((f) => chartSteps.some((s) => s.id === f)) || t.to.some((f) => chartSteps.some((s) => s.id === f))))
    if (chartSteps.length || chartTransitions.length || touchedElsewhere.length) {
      const okDel = await uiConfirm(
        `Eliminar a página «${pageCharts.find((c) => c.id === id)?.title ?? id}»? Isto remove ${chartSteps.length} etapa(s) e ${chartTransitions.length} transição(ões)${touchedElsewhere.length ? `, mais ${touchedElsewhere.length} transição(ões) de outras páginas que a referenciam` : ''}.`,
      )
      if (!okDel) return
    }
    const goneSteps = new Set(chartSteps.map((s) => s.id))
    const nextCharts = pageCharts.filter((c) => c.id !== id)
    setGrafcet({
      ...program,
      charts: nextCharts,
      activeChart: nextCharts[0]?.id,
      steps: allSteps.filter((s) => chartOf(s) !== id),
      transitions: allTransitions.filter((t) => chartOf(t) !== id && !t.from.some((f) => goneSteps.has(f)) && !t.to.some((f) => goneSteps.has(f))),
      freeActions: allFree.filter((a) => chartOf(a) !== id),
      comments: allComments.filter((c) => chartOf(c) !== id),
    }, 'force', 'grafcet:pages')
    setSelected(null)
    setMulti([])
  }

  const updateStep = (
    stepId: string,
    patch: Partial<GrafcetStep>,
    mode: HistoryMode = 'auto',
    historyKey = `grafcet:step:${stepId}:${Object.keys(patch).sort().join(',')}`
  ) => save({ steps: steps.map((step) => (step.id === stepId ? { ...step, ...patch } : step)) }, mode, historyKey)

  const updateTransition = (
    transitionId: string,
    patch: Partial<GrafcetTransition>,
    mode: HistoryMode = 'auto',
    historyKey = `grafcet:transition:${transitionId}:${Object.keys(patch).sort().join(',')}`
  ) =>
    save(
      { transitions: transitions.map((transition) => (transition.id === transitionId ? { ...transition, ...patch } : transition)) },
      mode,
      historyKey
    )

  const patchAction = (step: GrafcetStep, action: GrafcetAction, patch: Partial<GrafcetAction>, mode: HistoryMode = 'auto') => {
    const key = `grafcet:action:${action.id}:${Object.keys(patch).sort().join(',')}`
    if (action.id.startsWith('legacy-')) {
      const migrated: GrafcetAction = {
        id: id(),
        address: action.address,
        condition: action.condition,
        kind: action.kind,
        timeMs: action.timeMs,
        ...patch,
      }
      updateStep(step.id, { action: '', actions: [migrated, ...(step.actions ?? [])] }, 'force')
    } else {
      updateStep(
        step.id,
        { actions: (step.actions ?? []).map((value) => (value.id === action.id ? { ...value, ...patch } : value)) },
        mode,
        key
      )
    }
  }

  const setActionKind = (step: GrafcetStep, action: GrafcetAction, kind: GrafcetActionKind) =>
    patchAction(step, action, { kind, timeMs: kind === 'D' || kind === 'L' ? action.timeMs || 2000 : undefined }, 'force')

  // ------------------------------------------------------------------
  // Ações soltas: nascem sem etapa e ligam-se por arrasto ou por linha.
  // ------------------------------------------------------------------

  const nextFreeActionAddress = () => {
    const used = new Set([
      ...steps.flatMap((step) => [step.action, ...actionsOf(step).map((action) => action.address)]),
      ...freeActions.map((action) => action.address),
    ])
    let n = 1
    while (used.has(`Q${n}`)) n++
    return `Q${n}`
  }

  const addFreeAction = (conditional = false, at?: { x: number; y: number }) => {
    const nFree = freeActions.length
    const pos = at
      ? { x: Math.max(at.x, 40), y: Math.max(at.y, 40) }
      : selectedStep
        ? { x: stepX(selectedStep.id) + 290, y: stepY(selectedStep.id) + nFree * 38 }
        : { x: 560, y: Math.max(cursorY + 46, START_Y) + nFree * 38 }
    const address = nextFreeActionAddress()
    const action: GrafcetAction = {
      id: id(),
      address,
      variable: address,
      condition: conditional ? 'I0.0' : '1',
      kind: 'N',
      type: conditional ? 'conditional' : 'simple',
      x: Math.round(pos.x / GRID) * GRID,
      y: Math.round(pos.y / GRID) * GRID,
    }
    save({ freeActions: [...freeActions, action] })
    setSelected(null)
    setSelectedActionId(action.id)
    setTab('steps')
    notify('Ação solta criada — arraste-a sobre uma etapa ou ligue por linha (L)')
  }

  const addComment = (at?: { x: number; y: number }) => {
    const text = window.prompt('Texto solto do GRAFCET:')?.trim()
    if (!text) return
    const pos = at ?? { x: SPINE_X + 260, y: START_Y }
    const comment: GrafcetComment = { id: id(), text, x: Math.round(pos.x / GRID) * GRID, y: Math.round(pos.y / GRID) * GRID, fontSize: 13, fontWeight: '600', ...(activeChart ? { chart: activeChart } : {}) }
    save({ comments: [...allComments, comment] }, 'force', `grafcet:comment:${comment.id}`)
    notify('Comentário criado — duplo clique para editar')
  }

  const removeComment = (commentId: string) => save({ comments: allComments.filter((comment) => comment.id !== commentId) }, 'force', `grafcet:comment:remove:${commentId}`)

  const removeFreeAction = (actionId: string) => {
    save({ freeActions: freeActions.filter((action) => action.id !== actionId) })
    if (selectedActionId === actionId) setSelectedActionId(null)
    notify('Ação eliminada · Ctrl+Z repõe')
  }

  const patchFreeAction = (action: GrafcetAction, patch: Partial<GrafcetAction>, mode: HistoryMode = 'auto') =>
    save(
      { freeActions: freeActions.map((value) => (value.id === action.id ? { ...value, ...patch } : value)) },
      mode,
      `grafcet:free-action:${action.id}:${Object.keys(patch).sort().join(',')}`
    )

  /** Liga uma ação solta a uma etapa (remove-a da lista de soltas). */
  const attachFreeAction = (actionId: string, stepId: string) => {
    const action = freeActions.find((value) => value.id === actionId)
    const step = stepById.get(stepId)
    if (!action || !step) return
    const { x: _x, y: _y, ...clean } = action
    save({
      steps: steps.map((value) => (value.id === stepId ? { ...value, actions: [...(value.actions ?? []), clean as GrafcetAction] } : value)),
      freeActions: freeActions.filter((value) => value.id !== actionId),
    })
    setSelected(stepId)
    setSelectedActionId(actionId)
    setTab('steps')
    const { stepNumber } = getStepDisplayInfo(step, steps.indexOf(step))
    notify(`Ação ligada à Etapa ${stepNumber}`)
  }

  /** Desanexa uma ação de uma etapa: passa a solta na posição indicada. */
  const detachAction = (stepId: string, actionId: string, pos: { x: number; y: number }) => {
    const step = stepById.get(stepId)
    if (!step) return
    const action = actionsOf(step).find((value) => value.id === actionId)
    if (!action || action.id.startsWith('legacy-')) return
    save({
      steps: steps.map((value) => (value.id === stepId ? { ...value, actions: (value.actions ?? []).filter((a) => a.id !== actionId) } : value)),
      freeActions: [...freeActions, { ...action, x: pos.x, y: pos.y }],
    })
    setSelected(null)
    setSelectedActionId(actionId)
    setTab('steps')
    notify('Ação desanexada — largue-a sobre outra etapa')
  }

  /** Move uma ação entre etapas. */
  const moveActionToStep = (fromStepId: string, actionId: string, targetStepId: string) => {
    if (fromStepId === targetStepId) return
    const from = stepById.get(fromStepId)
    const target = stepById.get(targetStepId)
    if (!from || !target) return
    const action = actionsOf(from).find((value) => value.id === actionId)
    if (!action || action.id.startsWith('legacy-')) return
    save({
      steps: steps.map((value) => {
        if (value.id === fromStepId) return { ...value, actions: (value.actions ?? []).filter((a) => a.id !== actionId) }
        if (value.id === targetStepId) return { ...value, actions: [...(value.actions ?? []), action] }
        return value
      }),
    })
    setSelected(targetStepId)
    setSelectedActionId(actionId)
    setTab('steps')
    const { stepNumber } = getStepDisplayInfo(target, steps.indexOf(target))
    notify(`Ação movida para a Etapa ${stepNumber}`)
  }


  const generateLadder = async () => {
    if (!steps.length) return notify('Crie primeiro as etapas do GRAFCET')
    if (errorCount) return notify('Corrija os erros do GRAFCET antes de gerar o Ladder')
    const updating = hasGeneratedLadder()
    if (!updating) {
      const preview = previewLadder({ ...program, transitions })
      const note = preview.warnings.length ? `\n\nAvisos:\n- ${preview.warnings.join('\n- ')}` : ''
      const what = preview.method === 'word'
        ? `• Registo de etapa: G0 (%MW) guarda o número da etapa ativa\n• Complete restart [OB 100]: ${preview.startupRungs.length} network(s) (G0 = etapa inicial)\n• FC Grafcet: ${preview.blocks?.find((b) => b.label === 'Grafcet')?.rungs.length ?? 0} networks (uma por transição, com MOVE)\n• FC Outputs: ${preview.blocks?.find((b) => b.label === 'Outputs')?.rungs.length ?? 0} networks (saídas por etapa)\n• Main [OB 1]: chama os FC Grafcet e Outputs\n• Tabela de variáveis: ${preview.tags.length} novas entradas, saídas e registo`
        : `• Complete restart [OB 100]: ${preview.startupRungs.length} networks (repõe e ativa as etapas iniciais)\n• Main [OB 1]: ${preview.rungs.length} networks (funções do GRAFCET e saídas)\n• Tabela de variáveis: ${preview.tags.length} entradas, saídas e memórias\n\n(Método de bits de etapa: ${preview.fallbackReason ?? 'GRAFCET fora do registo de etapa'}.)`
      if (
        !(await uiConfirm(
          `Gerar o Ladder deste GRAFCET?\n\n${what}\n\nDepois de gerado, o botão passa a «Atualizar Ladder» e o Ladder acompanha o GRAFCET. As suas networks ficam como estão.${note}`
        ))
      )
        return
    } else {
      // GRAFCET-LADDER-DIFF-01: mostrar o que muda antes de substituir as networks geradas.
      const diff = diffGeneratedLadder({ ...program, transitions })
      if (diff.empty) {
        useGrafcetUi.getState().setLadderSync('synced')
        return notify('O Ladder já corresponde ao GRAFCET — nada a atualizar')
      }
      if (!(await uiConfirm(`Atualizar o Ladder gerado?\n\n${describeLadderDiff(diff)}\n\nSó mudam as networks «GRAFCET ·», «Complete restart ·» e os FC gerados. As suas networks ficam como estão.`))) return
    }
    const result = applyLadderFromGrafcet({ ...program, transitions })
    useGrafcetUi.getState().setLadderSync('synced')
    const warn = result.warnings.length ? ` · ${result.warnings.length} aviso${result.warnings.length === 1 ? '' : 's'}: ${result.warnings[0]}` : ''
    // Projeto só GRAFCET, primeira geração: o editor Ladder passa a existir — abrir para o utilizador o ver.
    const opensLadder = !updating && !allowedViews(useSimStore.getState().projectKind).includes('ladder')
    notify(`Ladder ${updating ? 'atualizado' : 'gerado'}${result.method === 'word' ? ' (registo de etapa G0)' : ''}: Complete restart (${result.startupRungs.length}), ${result.method === 'word' ? 'FC Grafcet e Outputs' : `Main (${result.rungs.length})`} e ${result.tags.length} variáveis${warn}${opensLadder ? ' — a abrir o editor Ladder…' : ''}`)
    if (opensLadder) {
      window.clearTimeout(openLadderTimer.current)
      openLadderTimer.current = window.setTimeout(() => onOpenLadder?.(), 900)
    }
  }

  // Estado de sincronização GRAFCET ↔ Ladder + atualização automática (só depois de gerado).
  const ladderRungs = useSimStore((state) => state.ladder.rungs)
  const projectFiles = useSimStore((state) => state.projectFiles)
  const autoSync = useGrafcetUi((state) => state.autoSync)
  const syncStatus = useMemo(() => ladderSyncStatus(program), [program, ladderRungs, projectFiles]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { useGrafcetUi.getState().setLadderSync(syncStatus) }, [syncStatus])
  const programSignature = useMemo(() => JSON.stringify({ steps: program.steps, transitions: transitionsOf(program) }), [program])
  const lastAutoSync = useRef(programSignature)
  useEffect(() => {
    if (programSignature === lastAutoSync.current) return
    lastAutoSync.current = programSignature
    if (!autoSync || syncStatus !== 'stale') return
    const timer = window.setTimeout(() => {
      if (ladderSyncStatus({ ...useSimStore.getState().grafcet, transitions: transitionsOf(useSimStore.getState().grafcet) }) !== 'stale') return
      applyLadderFromGrafcet(useSimStore.getState().grafcet)
      useGrafcetUi.getState().setLadderSync('synced')
    }, 800)
    return () => window.clearTimeout(timer)
  }, [programSignature, autoSync, syncStatus])

  /** Posição livre para um elemento novo: onde foi largado, ou junto ao elemento selecionado; nunca por cima de outro. */
  const clearSpot = (want: { x: number; y: number }) => {
    const occupied = [
      ...steps.map((s) => ({ x: stepX(s.id), y: stepY(s.id) })),
      ...transitions.filter((t) => t.x !== undefined).map((t) => transXY(t)),
      ...freeActions.map((a) => actionXY(a)),
    ]
    return findClearSpot(want, occupied)
  }
  const defaultSpot = (offsetX = 0) => selectedStep
    ? { x: stepX(selectedStep.id) + offsetX, y: stepY(selectedStep.id) + stepPitch(actionsOf(selectedStep).length) }
    : { x: SPINE_X + offsetX, y: Math.max(cursorY, START_Y) }

  const addStep = (at?: { x: number; y: number }) => {
    const place = clearSpot(at ?? defaultSpot())
    const newStep: GrafcetStep = {
      id: id(),
      name: `Etapa ${nextFreeStepNumber(allSteps)}`,
      initial: steps.length === 0,
      stepType: steps.length === 0 ? 'initial' : 'simple',
      action: '',
      condition: 'I0.0',
      actions: [],
      x: place.x, y: place.y, pinned: true,
    }
    save({ steps: [...steps, newStep] })
    setSelected(newStep.id)
    setTab('steps')
    notify(newStep.initial ? 'Etapa inicial criada' : 'Etapa solta criada — arraste-a até uma transição ou ligue por linha (L)')
  }

  const addConnectedStep = (fromStep?: GrafcetStep, at?: { x: number; y: number }) => {
    const source = fromStep ?? selectedStep ?? steps[steps.length - 1]
    if (!source) return addStep(at)
    // Procura o próximo número lógico para a etapa (ex.: se a anterior é 81, tenta 82; se já existir, segue em frente)
    const usedNumbers = new Set(steps.map((s, i) => getStepDisplayInfo(s, i).stepNumber))
    let nextName = `Etapa ${nextFreeStepNumber(allSteps)}`
    const sourceNumber = getStepDisplayInfo(source, steps.indexOf(source)).stepNumber
    if (/^\d+$/.test(sourceNumber)) {
      let candidate = parseInt(sourceNumber, 10) + 1
      while (usedNumbers.has(String(candidate))) candidate++
      nextName = String(candidate)
    }

    // Posição da nova etapa: onde foi largada, ou logo abaixo da origem quando esta foi movida à mão.
    const place = clearSpot(at ?? { x: stepX(source.id), y: stepY(source.id) + stepPitch(actionsOf(source).length) })
    const newStep: GrafcetStep = {
      id: id(),
      name: nextName,
      initial: false,
      stepType: 'simple',
      action: '',
      condition: 'I0.0',
      actions: [],
      x: place.x, y: place.y, pinned: true,
    }

    // A etapa nasce SEM transição: a ligação faz-se depois com uma transição solta
    // (arrasto sobre a etapa) ou com a ferramenta Ligar [L] (fio entre etapas).
    // Mantém a ordem visual: insere no array logo a seguir à etapa de origem.
    const sourceIndex = steps.indexOf(source)
    const newSteps = [...steps.slice(0, sourceIndex + 1), newStep, ...steps.slice(sourceIndex + 1)]
    save({ steps: newSteps })
    setSelected(newStep.id)
    setTab('steps')
    notify(`Etapa ${newStep.name} criada sem ligação — use T (transição solta) ou L (fio)`)
  }

  const addActionToStep = (target: GrafcetStep, conditional = false) => {
    const used = new Set(steps.flatMap((step) => [step.action, ...(step.actions ?? []).map((action) => action.address)]))
    let n = 1
    while (used.has(`Q${n}`)) n++
    updateStep(
      target.id,
      { actions: [...(target.actions ?? []), { id: id(), address: `Q${Math.floor((n - 1) / 8)}.${(n - 1) % 8}`, variable: `Q${n}`, condition: conditional ? 'I0.0' : '1', kind: 'N' }] },
      'force'
    )
    setSelected(target.id)
    setTab('steps')
    notify(conditional ? 'Ação condicionada adicionada' : 'Ação adicionada')
  }

  const removeStep = (stepId: string) => {
    const index = steps.findIndex((step) => step.id === stepId)
    const neighbour = steps[index + 1] ?? steps[index - 1]
    save({
      steps: steps.filter((step) => step.id !== stepId),
      transitions: transitions.filter((transition) => !transition.from.includes(stepId) && !transition.to.includes(stepId)),
    })
    setSelected(neighbour?.id ?? null)
    setSelectedActionId(null)
    setTab('steps')
    notify('Etapa eliminada · Ctrl+Z repõe')
  }

  const removeTransition = (transitionId: string) => {
    const index = transitions.findIndex((transition) => transition.id === transitionId)
    const neighbour = transitions[index + 1] ?? transitions[index - 1]
    const linkBends = { ...(program.linkBends ?? {}) }
    delete linkBends[transitionId]
    save({ transitions: transitions.filter((transition) => transition.id !== transitionId), linkBends })
    setSelected(neighbour?.id ?? null)
    setSelectedActionId(null)
    setTab('transitions')
    notify('Transição eliminada · Ctrl+Z repõe')
  }

  const removeAction = (step: GrafcetStep, actionId: string) => {
    const currentActions = actionsOf(step)
    const targetAction = currentActions.find((a) => a.id === actionId)
    const remaining = currentActions.filter((a) => a.id !== actionId)
    updateStep(
      step.id,
      { actions: remaining, action: remaining.length === 0 ? '' : step.action },
      'force'
    )
    if (selectedActionId === actionId) {
      setSelectedActionId(null)
    }
    notify(`Ação ${targetAction?.variable || targetAction?.address || ''} eliminada`)
  }

  const requestDelete = async () => {
    if (groupIds.length >= 2) {
      const gone = new Set(groupIds)
      const linked = transitions.filter((t) => t.from.some((v) => gone.has(v)) || t.to.some((v) => gone.has(v))).length
      if (await uiConfirm(`Eliminar ${groupIds.length} etapas${linked ? ` e ${linked} transição(ões) ligada(s)` : ''}?`)) {
        save({
          steps: steps.filter((step) => !gone.has(step.id)),
          transitions: transitions.filter((t) => !t.from.some((v) => gone.has(v)) && !t.to.some((v) => gone.has(v))),
        })
        setMulti([])
        setSelected(null)
        setSelectedActionId(null)
        notify(`${gone.size} etapas eliminadas · Ctrl+Z repõe`)
      }
      return
    }
    const selectedFree = freeActions.find((action) => action.id === selectedActionId)
    if (!selectedStep && selectedFree) {
      if (await uiConfirm(`Eliminar a ação solta «${selectedFree.variable || selectedFree.address || ''}»?`)) {
        removeFreeAction(selectedFree.id)
      }
      return
    }
    if (selectedStep && selectedActionId) {
      const act = actionsOf(selectedStep).find((a) => a.id === selectedActionId)
      if (act) {
        removeAction(selectedStep, selectedActionId)
        return
      }
    }
    if (selectedStep) {
      const { stepNumber } = getStepDisplayInfo(selectedStep, steps.indexOf(selectedStep))
      const linked = transitions.filter(
        (transition) => transition.from.includes(selectedStep.id) || transition.to.includes(selectedStep.id)
      ).length
      if (
        await uiConfirm(
          `Eliminar a etapa ${stepNumber} «${selectedStep.name}»${
            linked ? ` e ${linked} transição(ões) ligada(s)` : ''
          }?`
        )
      ) {
        removeStep(selectedStep.id)
      }
    } else if (selectedTransition) {
      if (await uiConfirm(`Eliminar a transição T${transitions.indexOf(selectedTransition) + 1}?`)) {
        removeTransition(selectedTransition.id)
      }
    }
  }

  const duplicateSelected = () => {
    if (groupIds.length >= 2) {
      copySelection(true)
      pasteClipboard()
      return
    }
    // Ação solta selecionada: duplica ao lado.
    const selectedFree = freeActions.find((action) => action.id === selectedActionId)
    if (selectedFree) {
      const clone: GrafcetAction = {
        ...selectedFree,
        id: id(),
        x: (selectedFree.x ?? ACTION_X) + GRID * 3,
        y: (selectedFree.y ?? cursorY) + GRID * 3,
      }
      save({ freeActions: [...freeActions, clone] })
      setSelectedActionId(clone.id)
      notify('Ação solta duplicada')
      return
    }
    if (selectedStep && selectedAction) {
      const clone = { ...selectedAction, id: id() }
      const current = actionsOf(selectedStep)
      const actionIndex = current.indexOf(selectedAction)
      const next = [...current.slice(0, actionIndex + 1), clone, ...current.slice(actionIndex + 1)]
      updateStep(selectedStep.id, { actions: next }, 'force')
      setSelectedActionId(clone.id)
      notify('Ação duplicada')
      return
    }
    if (selectedStep) {
      const clone: GrafcetStep = {
        ...selectedStep,
        id: id(),
        name: `${selectedStep.name} (cópia)`,
        initial: false,
        action: selectedStep.action,
        actions: (selectedStep.actions ?? []).map((action) => ({ ...action, id: id() })),
        ...(isPinned(selectedStep) ? { x: stepX(selectedStep.id) + GRID * 4, y: stepY(selectedStep.id) + GRID * 2, pinned: true } : {}),
      }
      const index = steps.indexOf(selectedStep)
      const next = [...steps.slice(0, index + 1), clone, ...steps.slice(index + 1)]
      save({ steps: next })
      setSelected(clone.id)
      setSelectedActionId(null)
      setTab('steps')
      notify('Etapa duplicada')
    } else if (selectedTransition) {
      const clone = { ...selectedTransition, id: id() }
      const index = transitions.indexOf(selectedTransition)
      const next = [...transitions.slice(0, index + 1), clone, ...transitions.slice(index + 1)]
      save({ transitions: next })
      setSelected(clone.id)
      setSelectedActionId(null)
      setTab('transitions')
      notify('Transição duplicada')
    }
  }

  const selectStep = (step: GrafcetStep, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    if (suppressClickRef.current) return // o clique que fecha um arrasto não muda a seleção
    if (full && e && (e.shiftKey || e.ctrlKey || e.metaKey)) {
      // Shift/Ctrl+clique: liga/desliga a etapa no grupo.
      const base = groupIds.length >= 2 ? groupIds : selected && !selectedActionId && stepById.has(selected) ? [selected] : []
      const next = toggleId(base, step.id)
      setMulti(next.length >= 2 ? next : [])
      setSelected(next.length ? (next.includes(step.id) ? step.id : next[next.length - 1]) : null)
      setSelectedActionId(null)
      setTab('steps')
      return
    }
    if (full) {
      setMulti([])
      setSelected(step.id)
      setSelectedActionId(null)
      setTab('steps')
    }
  }

  const selectAction = (step: GrafcetStep, action: GrafcetAction, e: React.MouseEvent) => {
    e.stopPropagation()
    if (full) {
      setSelected(step.id)
      setSelectedActionId(action.id)
      setTab('steps')
    }
  }


  const moveStep = (stepId: string, direction: -1 | 1) => {
    const index = steps.findIndex((step) => step.id === stepId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= steps.length) return
    const reordered = [...steps]
    ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
    save({ steps: reordered })
  }

  /**
   * Cria uma transição SOLTA: vem para a tela sem origem nem destino.
   * O utilizador liga-a depois — arrastando a barra sobre uma etapa
   * (metade de cima = origem, metade de baixo = destino) ou com a
   * ferramenta Ligar por linha (atalho L).
   */
  const addFreeTransition = (at?: { x: number; y: number }) => {
    if (!steps.length) {
      notify('Crie primeiro uma etapa')
      return
    }
    // Posição por omissão: por baixo da última etapa, na espinha central.
    const freeCount = transitions.filter((t) => !t.from.filter((v) => stepById.has(v)).length || !t.to.filter((v) => stepById.has(v)).length).length
    const at2 = at ?? { x: SPINE_X + (freeCount % 2 === 0 ? 0 : GRID * 4), y: cursorY + 46 }
    const clamped = clearSpot(at2)
    const transition: GrafcetTransition = {
      id: id(),
      from: [],
      to: [],
      condition: '1',
      x: Math.round(clamped.x),
      y: Math.round(clamped.y),
    }
    save({ transitions: [...transitions, transition] })
    setSelected(transition.id)
    setSelectedActionId(null)
    setTab('transitions')
    notify('Transição solta criada — arraste-a sobre etapas ou ligue por linha (L)')
  }

  const addTransition = () => addFreeTransition()

  const moveTransition = (transitionId: string, direction: -1 | 1) => {
    const index = transitions.findIndex((transition) => transition.id === transitionId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= transitions.length) return
    const reordered = [...transitions]
    ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
    save({ transitions: reordered })
  }

  const addInitial = (at?: { x: number; y: number }) => {
    const place = clearSpot(at ?? defaultSpot())
    const newStep: GrafcetStep = {
      id: id(),
      name: `Etapa ${nextFreeStepNumber(allSteps)}`,
      initial: true,
      stepType: 'initial',
      action: '',
      condition: 'I0.0',
      actions: [],
      x: place.x, y: place.y, pinned: true,
    }
    save({ steps: [...steps, newStep] })
    setSelected(newStep.id)
    setTab('steps')
    notify('Etapa inicial criada')
  }

  const addAction = (conditional: boolean) => {
    if (selectedStep) {
      addActionToStep(selectedStep, conditional)
      return
    }
    addFreeAction(conditional)
  }

  /**
   * Divergência/convergência AND: nasce SOLTA (barra dupla sem origens nem destinos).
   * As etapas ligam-se depois por aproximação ou por linha, como qualquer transição.
   */
  const addBranchBar = (branchType: 'and-divergence' | 'and-convergence', at?: { x: number; y: number }) => {
    const spot = clearSpot(at ?? defaultSpot(GRID * 4))
    const transition: GrafcetTransition = { id: id(), from: [], to: [], condition: '1', x: spot.x, y: spot.y, branchType }
    save({ transitions: [...transitions, transition] })
    setSelected(transition.id)
    setSelectedActionId(null)
    setTab('transitions')
    notify(`${branchType === 'and-divergence' ? 'Divergência' : 'Convergência'} AND solta criada — ligue as etapas por aproximação ou por linha (L)`)
  }
  const addFork = (at?: { x: number; y: number }) => addBranchBar('and-divergence', at)
  const addJoin = (at?: { x: number; y: number }) => addBranchBar('and-convergence', at)

  /**
   * Estrutura pronta com 2 ramos e etapa final de convergência:
   *  - OU: duas transições alternativas a partir da mesma etapa (linha simples) e convergência OU;
   *  - ET: divergência e convergência com barra dupla (ramos simultâneos).
   * Nasce por baixo da etapa selecionada (ou cria a etapa de partida se não houver nenhuma).
   */
  const addBranchBlock = (type: 'or' | 'and') => {
    let n = nextFreeStepNumber(allSteps)
    const mk = (x: number, y: number, initial = false): GrafcetStep => ({
      id: id(), name: `Etapa ${n++}`, initial, stepType: initial ? 'initial' : 'simple', action: '', condition: 'I0.0', actions: [], x, y, pinned: true,
    })
    const created: GrafcetStep[] = []
    let source = selectedStep
    if (!source) {
      const place = clearSpot(defaultSpot())
      source = mk(place.x, place.y, steps.length === 0)
      created.push(source)
    }
    const bx = stepX(source.id)
    const by = stepY(source.id) + stepPitch(actionsOf(source).length)
    const left = mk(snapToGrid(bx - 150, SPINE_X), by)
    const right = mk(snapToGrid(bx + 150, SPINE_X), by)
    const end = mk(bx, by + stepPitch(0))
    created.push(left, right, end)
    const link = (from: string[], to: string[], condition: string, branchType: GrafcetBranchType): GrafcetTransition => ({ id: id(), from, to, condition, branchType })
    const added = type === 'or'
      ? [
          link([source.id], [left.id], 'I0.0', 'or-divergence'),
          link([source.id], [right.id], '/I0.0', 'or-divergence'),
          link([left.id], [end.id], 'I0.1', 'or-convergence'),
          link([right.id], [end.id], 'I0.2', 'or-convergence'),
        ]
      : [
          link([source.id], [left.id, right.id], 'I0.0', 'and-divergence'),
          link([left.id, right.id], [end.id], 'I0.1', 'and-convergence'),
        ]
    save({ steps: [...steps, ...created], transitions: [...transitions, ...added] })
    setSelected(left.id)
    setSelectedActionId(null)
    setTab('steps')
    notify(type === 'or' ? 'Seleção OU criada — edite as condições das transições e adicione ações aos ramos' : 'Paralelismo ET criado — edite as condições das transições e adicione ações aos ramos')
  }

  const loadExample = () => {
    const a = id(),
      b = id(),
      c = id()
    save({
      steps: [
        { id: a, name: 'Espera', initial: true, stepType: 'initial', action: '', condition: 'I0.0', actions: [] },
        { id: b, name: 'Motor A', initial: false, stepType: 'simple', action: '', condition: 'I2', actions: [{ id: id(), address: 'Q1', variable: 'Q1', condition: '1', kind: 'N' }] },
        { id: c, name: 'Motor B', initial: false, stepType: 'simple', action: '', condition: 'I3', actions: [{ id: id(), address: 'Q2', variable: 'Q2', condition: '1', kind: 'N' }] },
      ],
      transitions: [
        { id: id(), from: [a], to: [b], condition: 'I0.0' },
        { id: id(), from: [b], to: [c], condition: 'I2' },
        { id: id(), from: [c], to: [a], condition: 'I3' },
      ],
    })
    setSelected(a)
    setTab('steps')
    resetView()
    notify('Exemplo carregado')
  }

  const loadTemplate = (tmpl: GrafcetTemplateInfo) => {
    save(tmpl.program, 'force')
    setTemplatesOpen(false)
    resetView()
    notify(`Modelo carregado: ${tmpl.name}`)
  }

  const usePalette = (kind: PaletteItem, at?: { x: number; y: number }) => {
    if (kind === 'initial') addInitial(at)
    else if (kind === 'step') addConnectedStep(undefined, at)
    else if (kind === 'transition') addFreeTransition(at)
    else if (kind === 'action') addFreeAction(false, at)
    else if (kind === 'conditional') addFreeAction(true, at)
    else if (kind === 'fork') addFork(at)
    else if (kind === 'or-block') addBranchBlock('or')
    else if (kind === 'and-block') addBranchBlock('and')
    else addJoin(at)
  }

  const paletteDisabled = (kind: PaletteItem) =>
    kind === 'transition' ? steps.length === 0 : false

  const choose = (ids: string[], stepId: string) =>
    ids.includes(stepId) ? ids.filter((value) => value !== stepId) : [...ids, stepId]

  const issues: ValidationIssue[] = validateGrafcet({ ...program, transitions })
  const errorCount = issues.filter((issue) => issue.level === 'error').length

  const selectIssue = (issue: ValidationIssue) => {
    setTab(issue.tab)
    setSelected(issue.entityId ?? null)
  }

  const query = norm(entityFilter.trim())
  const filteredSteps = steps.filter(
    (step, index) =>
      !query ||
      norm(
        `${index} ${step.name} ${actionsOf(step)
          .map((action) => `${action.address} ${action.condition}`)
          .join(' ')}`
      ).includes(query)
  )

  const filteredTransitions = transitions.filter(
    (transition, index) =>
      !query ||
      norm(`T${index + 1} ${transition.condition} ${transition.from.join(' ')} ${transition.to.join(' ')}`).includes(query)
  )

  // Altura e posicionamento vertical das etapas
  const stepPositions = new Map<string, number>()
  let cursorY = START_Y
  steps.forEach((step) => {
    stepPositions.set(step.id, cursorY)
    cursorY += stepPitch(actionsOf(step).length)
  })
  const stepById = new Map(allSteps.map((step) => [step.id, step]))
  /** Etapas do grupo selecionado (vazio quando há 0 ou 1 etapa selecionada). */
  const groupIds = multi.length >= 2 ? multi.filter((value) => stepById.has(value)) : []
  const isPinned = (step?: GrafcetStep) => !!step && step.pinned === true && Number.isFinite(step.x) && Number.isFinite(step.y)
  /** Topo da etapa: posição manual (ou a do arrasto em curso) ou a do layout automático. */
  const stepY = (stepId: string) => {
    if (dragPos?.id === stepId) return dragPos.y
    const step = stepById.get(stepId)
    const base = isPinned(step) ? step!.y! : stepPositions.get(stepId) ?? START_Y
    return groupOffset && multi.includes(stepId) ? base + groupOffset.dy : base
  }
  /** Eixo central da etapa. */
  const stepX = (stepId: string) => {
    if (dragPos?.id === stepId) return dragPos.x
    const step = stepById.get(stepId)
    const base = isPinned(step) ? step!.x! : SPINE_X
    return groupOffset && multi.includes(stepId) ? base + groupOffset.dx : base
  }
  let maxRight = full ? 440 : 400
  let maxBottom = 280
  steps.forEach((step) => {
    const count = actionsOf(step).length
    const layout = stepActionLayout(step)
    maxRight = Math.max(maxRight, stepX(step.id) + (count ? actionsExtentX(layout, count) : 220) + 130)
    maxBottom = Math.max(maxBottom, stepY(step.id) + Math.max(STEP_H + 84, layout === 'row' ? STEP_H + 84 : ACTION_TOP_OFFSET + count * ACTION_PITCH + 28))
  })

  // ------------------------------------------------------------------
  // Transições soltas (sem origem/destino completo) e ligação por linha
  // ------------------------------------------------------------------
  const existsStep = (value: string) => stepById.has(value)
  /** true quando a transição ainda tem algum lado por ligar. */
  const isFreeTransition = (t: GrafcetTransition) => !t.from.filter(existsStep).length || !t.to.filter(existsStep).length
  /** Posição atual da barra de uma transição solta (guardada ou em arrasto). */
  const transXY = (t: GrafcetTransition): { x: number; y: number } => {
    if (transDragPos?.id === t.id) return transDragPos
    return { x: t.x ?? SPINE_X, y: t.y ?? cursorY + 46 }
  }
  transitions.forEach((t) => {
    if (!isFreeTransition(t)) return
    const p = transXY(t)
    maxRight = Math.max(maxRight, p.x + 220)
    maxBottom = Math.max(maxBottom, p.y + 70)
  })

  /** Posição do canto superior esquerdo de uma ação solta (guardada ou em arrasto). */
  const actionXY = (a: GrafcetAction): { x: number; y: number } => {
    if (actionDragPos?.id === a.id) return { x: actionDragPos.x, y: actionDragPos.y }
    return { x: a.x ?? ACTION_X + 46, y: a.y ?? cursorY + 46 }
  }

  /** Posição do canto superior esquerdo de uma ação anexada (coluna junto à etapa). */
  const attachedActionPos = (stepId: string, actionId: string): { x: number; y: number } => {
    const step = stepById.get(stepId)
    if (!step) return { x: ACTION_X, y: cursorY + 46 }
    if (actionDragPos?.id === actionId) return { x: actionDragPos.x, y: actionDragPos.y }
    const index = actionsOf(step).findIndex((a) => a.id === actionId)
    const slot = actionSlotOffset(stepActionLayout(step), Math.max(index, 0))
    return { x: stepX(stepId) + slot.dx, y: stepY(stepId) + slot.dy }
  }

  freeActions.forEach((a) => {
    const p = actionXY(a)
    maxRight = Math.max(maxRight, p.x + ACTION_W + 46)
    maxBottom = Math.max(maxBottom, p.y + ACTION_H + 36)
  })
  comments.forEach((c) => {
    maxRight = Math.max(maxRight, c.x + c.text.length * (c.fontSize ?? 13) * 0.7 + 20)
    maxBottom = Math.max(maxBottom, c.y + (c.fontSize ?? 13) + 20)
  })
  // Os pontos de quebra das linhas (laços de retorno, desvios) também contam para a área do diagrama.
  Object.values(program.linkBends ?? {}).forEach((points) => points.forEach((point) => {
    maxRight = Math.max(maxRight, point.x + 40)
    maxBottom = Math.max(maxBottom, point.y + 40)
  }))
  const width = maxRight
  const height = Math.max(280, maxBottom)

  /** Coordenadas do diagrama a partir de um ponto do cliente (rato/toque). */
  const clientToWorld = (cx: number, cy: number) => {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: (cx - rect.left - position.x) / scale, y: (cy - rect.top - position.y) / scale }
  }

  // ------------------------------------------------------------------
  // Pontos de quebra das linhas (duplo clique cria; arrastar dobra a linha)
  // ------------------------------------------------------------------
  /** Quebras guardadas daquela ligação, com a posição ao vivo enquanto se arrasta. */
  const bendsOf = (tid: string): Point[] => {
    const stored = program.linkBends?.[tid] ?? []
    if (segDragLive?.tid === tid) return interiorBends(segDragLive.points)
    if (bendDragLive?.tid === tid) return moveBendOrthogonal(stored, bendDragLive.index, { x: bendDragLive.x, y: bendDragLive.y })
    return stored
  }
  const commitBends = (tid: string, bends: Point[]) => {
    const next = { ...(program.linkBends ?? {}) }
    if (bends.length) next[tid] = bends.map((bend) => ({ x: Math.round(bend.x), y: Math.round(bend.y) }))
    else delete next[tid]
    save({ linkBends: next }, 'force', `grafcet:bends:${tid}`)
  }
  /** Duplo clique na linha: cria o ponto de quebra no troço clicado. */
  const addLinkBend = (tid: string, points: Point[], e: React.MouseEvent) => {
    if (!full || activeTool !== 'select' || isSpacePan) return
    e.stopPropagation()
    const w = clientToWorld(e.clientX, e.clientY)
    const p = snapOn ? { x: snapToGrid(w.x, SPINE_X), y: snapToGrid(w.y, START_Y) } : { x: Math.round(w.x), y: Math.round(w.y) }
    const bends = points.slice(1, -1)
    const at = bendInsertIndex(points, p)
    commitBends(tid, [...bends.slice(0, at), p, ...bends.slice(at)])
    setSelected(tid)
    setSelectedActionId(null)
    setTab('transitions')
    notify('Ponto de quebra criado — arraste-o para dobrar a linha · duplo clique remove-o')
  }
  const onBendPointerDown = (tid: string, index: number, e: React.PointerEvent) => {
    if (!full || activeTool !== 'select' || isSpacePan) return
    if (e.button !== 0) return
    e.stopPropagation()
    const bend = bendsOf(tid)[index]
    if (!bend) return
    bendDragRef.current = { tid, index, x: bend.x, y: bend.y, moved: false }
    setBendDragLive({ tid, index, x: bend.x, y: bend.y })
    try {
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    } catch {
      /* noop */
    }
  }
  const onBendPointerMove = (tid: string, index: number, e: React.PointerEvent) => {
    const drag = bendDragRef.current
    if (!drag || drag.tid !== tid || drag.index !== index) return
    const w = clientToWorld(e.clientX, e.clientY)
    drag.moved = true
    const p = snapOn && !e.altKey ? { x: snapToGrid(w.x, SPINE_X), y: snapToGrid(w.y, START_Y) } : { x: Math.round(w.x), y: Math.round(w.y) }
    drag.x = p.x
    drag.y = p.y
    setBendDragLive({ tid, index, x: p.x, y: p.y })
  }
  const onBendPointerUp = (tid: string, index: number, e: React.PointerEvent) => {
    const drag = bendDragRef.current
    if (!drag || drag.tid !== tid || drag.index !== index) return
    bendDragRef.current = null
    try {
      ;(e.currentTarget as Element).releasePointerCapture(e.pointerId)
    } catch {
      /* noop */
    }
    const live = { index, x: drag.x, y: drag.y }
    setBendDragLive(null)
    if (!drag.moved) return
    commitBends(tid, moveBendOrthogonal(program.linkBends?.[tid] ?? [], index, { x: live.x, y: live.y }))
    suppressClickRef.current = true
  }
  /**
   * Arrastar um troço desliza-o na perpendicular (como no FluidSIM): os vizinhos esticam e os ângulos
   * continuam retos; as ancoragens nas etapas não se movem. Guarda-se uma só vez, ao largar.
   * `rendered` é o percurso ortogonal que está desenhado neste momento.
   */
  const startSegmentDrag = (tid: string, rendered: Point[], e: React.PointerEvent) => {
    if (!full || activeTool !== 'select' || isSpacePan || e.button !== 0 || running) return
    e.stopPropagation()
    const point = clientToWorld(e.clientX, e.clientY)
    const path = simplifyOrthogonal(expandPolyline(rendered))
    const drag = beginSegmentDrag(path, nearestLeg(path, point))
    setSelected(tid)
    setSelectedActionId(null)
    setTab('transitions')
    if (!drag) return
    segDragRef.current = { tid, drag, startX: point.x, startY: point.y, moved: false, points: drag.base }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* captura indisponível */ }
  }
  const moveSegment = (tid: string, e: React.PointerEvent) => {
    const state = segDragRef.current
    if (!state || state.tid !== tid) return
    const w = clientToWorld(e.clientX, e.clientY)
    if (!state.moved && Math.hypot(w.x - state.startX, w.y - state.startY) < 5 / scale) return
    state.moved = true
    const { drag } = state
    const at = drag.base[drag.leg][drag.axis]
    const raw = drag.axis === 'x' ? w.x : w.y
    const target = snapOn && !e.altKey ? snapToGrid(raw, drag.axis === 'x' ? SPINE_X : START_Y) : Math.round(raw)
    // O gesto só desloca o troço no seu eixo livre: ignora o movimento ao longo do troço.
    state.points = applySegmentDrag(drag, target - at)
    setSegDragLive({ tid, points: state.points })
  }
  const finishSegment = (tid: string, e: React.PointerEvent) => {
    const state = segDragRef.current
    if (!state || state.tid !== tid) return
    segDragRef.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* noop */ }
    setSegDragLive(null)
    if (!state.moved) return
    commitBends(tid, interiorBends(state.points))
    suppressClickRef.current = true
  }
  const cancelBendDrag = () => { bendDragRef.current = null; segDragRef.current = null; setBendDragLive(null); setSegDragLive(null) }
  const removeLinkBend = (tid: string, index: number, e: React.MouseEvent) => {
    e.stopPropagation()
    const stored = program.linkBends?.[tid] ?? []
    commitBends(tid, stored.filter((_, i) => i !== index))
    notify('Ponto de quebra removido')
  }
  /** Pegas dos pontos de quebra de uma ligação (visíveis com a transição selecionada). */
  const renderBendHandles = (tid: string, linkColor: string) =>
    bendsOf(tid).map((bend, index) => (
      <g
        key={`bend-${tid}-${index}`}
        onPointerDown={(e) => onBendPointerDown(tid, index, e)}
        onPointerMove={(e) => onBendPointerMove(tid, index, e)}
        onPointerUp={(e) => onBendPointerUp(tid, index, e)}
        onPointerCancel={() => {
          bendDragRef.current = null
          setBendDragLive(null)
        }}
        onDoubleClick={(e) => removeLinkBend(tid, index, e)}
        style={{ cursor: 'grab', touchAction: 'none' }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault(); e.stopPropagation()
            commitBends(tid, (program.linkBends?.[tid] ?? []).filter((_, i) => i !== index))
          } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault(); e.stopPropagation()
            const distance = e.shiftKey ? GRID * 5 : GRID
            commitBends(tid, (program.linkBends?.[tid] ?? []).map((p, i) => i === index ? { x: Math.max(0, p.x + (e.key === 'ArrowLeft' ? -distance : e.key === 'ArrowRight' ? distance : 0)), y: Math.max(0, p.y + (e.key === 'ArrowUp' ? -distance : e.key === 'ArrowDown' ? distance : 0)) } : p))
          }
        }}
        aria-label={`Ponto de quebra ${index + 1} da linha — arrastar para dobrar, duplo clique remove`}
      >
        <title>Ponto de quebra — arraste para dobrar a linha · duplo clique remove</title>
        <circle cx={bend.x} cy={bend.y} r={9} fill="transparent" />
        <circle cx={bend.x} cy={bend.y} r={5} fill="#ffffff" stroke={linkColor} strokeWidth="2" />
      </g>
    ))

  /** Etapa cuja caixa contém o ponto (com folga vertical para largar barras por cima/por baixo). */
  const hitStepAt = (wx: number, wy: number) =>
    steps.find((s) => Math.abs(wx - stepX(s.id)) < 60 && wy >= stepY(s.id) - 30 && wy <= stepY(s.id) + STEP_H + 50)

  /** Deteta etapa para largada de ação: inclui o corpo da etapa E toda a área de ligação de ações à sua direita. */
  const hitStepForActionDrop = (wx: number, wy: number, ax?: number, ay?: number) => {
    const direct = hitStepAt(wx, wy)
    if (direct) return direct

    return steps.find((s) => {
      const sx = stepX(s.id)
      const sy = stepY(s.id)
      const actionsCount = actionsOf(s).length
      const slotMinY = sy - 30
      const rowLayout = stepActionLayout(s) === 'row'
      const slotMaxY = sy + STEP_H + (rowLayout ? 0 : Math.max(actionsCount, 1) * ACTION_PITCH) + 30
      const slotMaxX = rowLayout ? sx + actionsExtentX('row', actionsCount + 1) + 40 : sx + 420

      const inZone = (px: number, py: number) =>
        px >= sx - 40 && px <= slotMaxX && py >= slotMinY && py <= slotMaxY

      if (inZone(wx, wy)) return true
      if (ax !== undefined && ay !== undefined && inZone(ax, ay)) return true
      return false
    })
  }

  // A geometria efetivamente desenhada alimenta os portos, incluindo transições já ligadas.
  const transitionAnchors = new Map<string, Point>()
  const branchPointOf = (tid: string): Point => {
    const transition = transitions.find((item) => item.id === tid)
    const source = transition?.from.find(existsStep)
    return source ? { x: stepX(source), y: stepY(source) + STEP_H + 24 } : { x: SPINE_X, y: cursorY }
  }
  /** Posição de cada face (esquerda, direita, topo, base) de uma ação solta onde nasce/termina um fio. */
  const actionPortAt = (pos: { x: number; y: number }, side: 'l' | 'r' | 't' | 'b'): { x: number; y: number } => {
    if (side === 'r') return { x: pos.x + ACTION_FREE_W + 14, y: pos.y + ACTION_FREE_H / 2 }
    if (side === 't') return { x: pos.x + ACTION_FREE_W / 2, y: pos.y - 14 }
    if (side === 'b') return { x: pos.x + ACTION_FREE_W / 2, y: pos.y + ACTION_FREE_H + 14 }
    return { x: pos.x - 14, y: pos.y + ACTION_FREE_H / 2 }
  }
  /** Posição mundo de um porto. */
  const portPosOf = (p: PortRef): { x: number; y: number } => {
    if (p.kind === 'branch-out') return branchPointOf(p.id)
    if (p.kind === 'step-out') return { x: stepX(p.id), y: stepY(p.id) + STEP_H }
    if (p.kind === 'step-in') return { x: stepX(p.id), y: stepY(p.id) }
    if (p.kind === 'step-action' || p.kind === 'step-attach') return { x: stepX(p.id) + 32, y: stepY(p.id) + 27 }
    if (p.kind === 'action-in') {
      const a = freeActions.find((value) => value.id === p.id)
      if (!a) return { x: ACTION_X, y: cursorY }
      const pos = actionXY(a)
      return actionPortAt(pos, p.side ?? 'l')
    }
    const t = transitions.find((tr) => tr.id === p.id)
    if (!t) return { x: SPINE_X, y: cursorY }
    const pos = transitionAnchors.get(t.id) ?? transXY(t)
    if (p.kind === 'trans-in') return { x: pos.x, y: t.from.filter(existsStep).length ? pos.y - 8 : pos.y - 30 }
    return { x: pos.x, y: t.to.filter(existsStep).length ? pos.y + 8 : pos.y + 30 }
  }

  /** Porto de destino (entrada) válido sob um ponto, para completar um fio. */
  const hitWireTarget = (wx: number, wy: number, start: PortRef): PortRef | null => {
    const compatible: PortRef[] = []
    const upstream = start.kind === 'trans-in' || start.kind === 'step-in'
    for (const step of steps) {
      if (start.kind === 'action-in') compatible.push({ kind: 'step-attach', id: step.id })
      else if (start.kind !== 'step-action') compatible.push({ kind: upstream ? 'step-out' : 'step-in', id: step.id })
    }
    if (start.kind === 'step-out') for (const t of transitions) compatible.push({ kind: 'trans-in', id: t.id })
    if (start.kind === 'step-in') for (const t of transitions) compatible.push({ kind: 'trans-out', id: t.id })
    if (start.kind === 'step-action') for (const action of freeActions) compatible.push({ kind: 'action-in', id: action.id })
    if (start.kind === 'step-action') {
      // Largar sobre qualquer face (ou sobre o corpo) de uma ação solta liga-a à etapa.
      const margin = 18
      const hit = freeActions.find((action) => {
        const pos = actionXY(action)
        return wx >= pos.x - margin && wx <= pos.x + ACTION_FREE_W + margin && wy >= pos.y - margin && wy <= pos.y + ACTION_FREE_H + margin
      })
      if (hit) return { kind: 'action-in', id: hit.id }
    }
    const distance = (p: PortRef) => { const at = portPosOf(p); return Math.hypot(wx - at.x, wy - at.y) }
    const target = compatible.filter((p) => p.kind !== start.kind || p.id !== start.id).sort((a, b) => distance(a) - distance(b))[0]
    if (target && distance(target) <= Math.max(14, Math.min(32, 22 / scale))) return target
    const step = steps.find((item) => Math.abs(wx - stepX(item.id)) <= 34 && wy >= stepY(item.id) && wy <= stepY(item.id) + STEP_H)
    if (step) {
      // Um fio vindo de uma ação solta liga a ação à etapa; saída-ação da etapa só fala com ações.
      if (start.kind === 'action-in') return { kind: 'step-attach', id: step.id }
      if (start.kind === 'step-action') return null
      return { kind: upstream ? 'step-out' : 'step-in', id: step.id }
    }
    return null
  }

  /** Inicia um fio a partir de um porto de SAÍDA (etapa ou transição solta). */
  const startWire = (start: PortRef, cx: number, cy: number) => {
    const w = clientToWorld(cx, cy)
    setWireDraft({ start, x: w.x, y: w.y, moved: false })
    setWireHover(null)
  }

  /** Puxador «arrastar para ligar»: da etapa (nova transição) ou da transição (novo destino) até uma etapa. */
  const startQuickWire = (start: PortRef, event: React.PointerEvent) => {
    event.stopPropagation()
    event.preventDefault()
    if (event.button !== 0) return
    const draft = wireDraftRef.current
    if (draft) {
      if (draft.start.id === start.id && draft.start.kind === start.kind) { cancelWire(); return }
      const point = clientToWorld(event.clientX, event.clientY)
      const target = hitWireTarget(point.x, point.y, draft.start)
      if (target) { completeWire(draft.start, target); cancelWire(); return }
    }
    quickWireRef.current = true
    startWire(start, event.clientX, event.clientY)
  }

  /** Completa o fio armado (Ligar) ligando a `start` ao destino `end`. */
  const completeWire = (start: PortRef, end: PortRef): void => {
    if ((start.kind === 'trans-in' && end.kind === 'step-out') || (start.kind === 'step-in' && (end.kind === 'trans-out' || end.kind === 'step-out'))) {
      return completeWire(end, start)
    }
    const stepNum = (sid: string) => {
      const s = stepById.get(sid)
      return s ? getStepDisplayInfo(s, steps.indexOf(s)).stepNumber : '?'
    }
    if (start.kind === 'branch-out' && end.kind === 'step-in') {
      const source = transitions.find((item) => item.id === start.id)
      if (!source || source.from.length !== 1 || source.to.length !== 1 || source.wireless) return
      const point = branchPointOf(source.id)
      const branch: GrafcetTransition = { id: id(), from: [...source.from], to: [end.id], condition: '1', branchType: 'or-divergence' }
      const previousBends = program.linkBends?.[source.id] ?? []
      const bends = previousBends.some((p) => p.x === point.x && p.y === point.y) ? previousBends : [point, ...previousBends]
      save({ transitions: [...transitions.map((t) => t.id === source.id ? { ...t, branchType: 'or-divergence' as const } : t), branch], linkBends: { ...(program.linkBends ?? {}), [source.id]: bends, [branch.id]: [point] } }, 'force')
      setSelected(branch.id)
      setSelectedActionId(null)
      setTab('transitions')
      notify('Ramo alternativo criado — cada transição mantém a sua condição')
      return
    }
    // Porto de ação da etapa ↔ ação solta (bidirecional): liga a ação à etapa.
    if (
      (start.kind === 'step-action' && end.kind === 'action-in') ||
      (start.kind === 'action-in' && (end.kind === 'step-attach' || end.kind === 'step-action' || end.kind === 'step-in'))
    ) {
      const actionId = start.kind === 'action-in' ? start.id : end.id
      const stepId = start.kind === 'action-in' ? end.id : start.id
      attachFreeAction(actionId, stepId)
      return
    }
    // Fio de ação sem destino válido: orienta o utilizador.
    if (start.kind === 'step-action' || end.kind === 'step-attach') {
      notify('O fio de ação liga-se a uma ação solta — largue-o sobre a caixa âmbar')
      return
    }
    if (start.kind === 'action-in' || end.kind === 'action-in') {
      notify('Ligue o fio da ação solta a uma etapa para anexá-la')
      return
    }
    if (start.kind === 'step-out' && end.kind === 'step-in') {
      const t: GrafcetTransition = { id: id(), from: [start.id], to: [end.id], condition: '1' }
      save({ transitions: [...transitions, t] })
      setSelected(t.id)
      setSelectedActionId(null)
      setTab('transitions')
      notify(`Transição criada: Etapa ${stepNum(start.id)} → Etapa ${stepNum(end.id)}`)
      return
    }
    if (start.kind === 'step-out' && end.kind === 'trans-in') {
      const t = transitions.find((tr) => tr.id === end.id)
      if (t && !t.from.includes(start.id)) {
        updateTransition(end.id, { from: [...t.from, start.id] }, 'force')
        setSelected(end.id)
        setSelectedActionId(null)
        setTab('transitions')
        notify(`Etapa ${stepNum(start.id)} ligada à origem da transição T${transitions.indexOf(t) + 1}`)
      } else notify('Essa etapa já é origem desta transição')
      return
    }
    if (start.kind === 'trans-out' && end.kind === 'step-in') {
      const t = transitions.find((tr) => tr.id === start.id)
      if (t && !t.to.includes(end.id)) {
        updateTransition(start.id, { to: [...t.to, end.id] }, 'force')
        setSelected(start.id)
        setSelectedActionId(null)
        setTab('transitions')
        notify(`Etapa ${stepNum(end.id)} ligada ao destino da transição T${transitions.indexOf(t) + 1}`)
      } else notify('Essa etapa já é destino desta transição')
    }
  }

  const cancelWire = (silent = true) => {
    quickWireRef.current = false
    setWireDraft(null)
    setWireHover(null)
    if (!silent) notify('Fio cancelado — toque num porto de saída para recomeçar')
  }
  const activatePort = (port: PortRef) => {
    const draft = wireDraftRef.current
    if (draft?.start.id === port.id && draft.start.kind === port.kind) { cancelWire(); return }
    const at = portPosOf(port)
    const target = draft ? hitWireTarget(at.x, at.y, draft.start) : null
    if (draft && target) { completeWire(draft.start, target); cancelWire(); return }
    quickWireRef.current = true
    setWireDraft({ start: port, ...at, moved: false })
    setWireHover(null)
  }
  const renderWirePort = (port: PortRef, at: Point, label: string) => {
    const armed = wireDraft?.start.kind === port.kind && wireDraft.start.id === port.id && (wireDraft.start.side ?? '') === (port.side ?? '')
    const target = wireHover?.kind === port.kind && wireHover.id === port.id && (port.kind !== 'action-in' || !port.side || wireHover.side === undefined || wireHover.side === port.side)
    const origin = wireDraft?.start.kind
    const compatible = !!origin && (
      (['step-out', 'trans-out', 'branch-out'].includes(origin) && port.kind === 'step-in') ||
      (origin === 'step-out' && port.kind === 'trans-in') ||
      (['step-in', 'trans-in'].includes(origin) && port.kind === 'step-out') ||
      (origin === 'step-in' && port.kind === 'trans-out') ||
      (origin === 'action-in' && port.kind === 'step-action') ||
      (origin === 'step-action' && port.kind === 'action-in')
    )
    return <g key={`${port.kind}-${port.id}-${port.side ?? ''}`} className={`grafcet-construction-port ${armed ? 'is-armed' : ''} ${compatible ? 'is-compatible' : ''} ${target ? 'is-target' : ''}`}
      role="button" tabIndex={0} aria-label={label} data-port-kind={port.kind} data-port-id={port.id} data-port-side={port.side}
      onPointerDown={(event) => startQuickWire(port, event)} onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); activatePort(port) } }}>
      <title>{label} · arraste ou escolha os dois pontos · Esc cancela</title>
      <circle className="grafcet-port-hit" cx={at.x} cy={at.y} r="14" fill="transparent" />
      <circle className="grafcet-port-ring" cx={at.x} cy={at.y} r="5" />
      <circle className="grafcet-port-core" cx={at.x} cy={at.y} r="1.5" />
    </g>
  }

  // Ao sair da ferramenta Ligar, o fio armado é cancelado.
  useEffect(() => {
    if (activeTool !== 'connect' && wireDraftRef.current && !quickWireRef.current) cancelWire()
  }, [activeTool])

  // Gestos globais da ligação por linha: mover/terminar/cancelar enquanto houver fio armado.
  useEffect(() => {
    if (!wireDraft) return
    const onMove = (event: globalThis.PointerEvent) => {
      const w = clientToWorld(event.clientX, event.clientY)
      const draft = wireDraftRef.current
      if (!draft) return
      const target = hitWireTarget(w.x, w.y, draft.start)
      setWireDraft({ ...draft, x: w.x, y: w.y, moved: draft.moved || Math.hypot(w.x - portPosOf(draft.start).x, w.y - portPosOf(draft.start).y) > 8 })
      setWireHover(target)
    }
    const onUp = (event: globalThis.PointerEvent) => {
      const draft = wireDraftRef.current
      if (!draft) return
      const w = clientToWorld(event.clientX, event.clientY)
      const origin = portPosOf(draft.start)
      if (!draft.moved && Math.hypot(w.x - origin.x, w.y - origin.y) < 8 / scale) return
      const target = hitWireTarget(w.x, w.y, draft.start)
      if (target) {
        completeWire(draft.start, target)
        cancelWire()
      } else if (draft.moved) {
        // Arrastou e soltou no vazio: cancela. Um simples toque MANTÉM o fio armado (fluxo toque-a-toque).
        cancelWire(false)
      }
    }
    const onCancel = () => cancelWire()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        cancelWire(false)
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [wireDraft !== null])

  /** Liga (ou move junto) a transição solta `transId` à etapa em que foi largada. */
  /**
   * Liga uma transição solta a uma etapa. `stepTop` permite passar a posição
   * final da etapa quando ela acabou de ser arrastada (o estado ainda é o antigo).
   */
  const attachFreeTransition = (
    trans: GrafcetTransition,
    stepId: string,
    barY?: number,
    stepTop?: { x: number; y: number },
  ) => {
    const step = stepById.get(stepId)
    if (!step) return
    const { stepNumber } = getStepDisplayInfo(step, steps.indexOf(step))
    const sX = stepTop?.x ?? stepX(stepId)
    const sY = stepTop?.y ?? stepY(stepId)
    const by = barY ?? transXY(trans).y
    const asSource = sY + STEP_H / 2 < by // etapa acima da barra → origem
    if (asSource) {
      if (trans.from.includes(stepId)) return notify(`A Etapa ${stepNumber} já é origem desta transição`)
      const stillFree = !trans.to.filter(existsStep).length
      updateTransition(
        trans.id,
        {
          from: [...trans.from, stepId],
          ...(stillFree ? { x: sX, y: sY + STEP_H + 30 } : {}),
        },
        'force'
      )
      notify(`Origem ligada: Etapa ${stepNumber} — agora ligue o destino`)
    } else {
      if (trans.to.includes(stepId)) return notify(`A Etapa ${stepNumber} já é destino desta transição`)
      const stillFree = !trans.from.filter(existsStep).length
      updateTransition(
        trans.id,
        {
          to: [...trans.to, stepId],
          ...(stillFree ? { x: sX, y: sY - 30 } : {}),
        },
        'force'
      )
      notify(`Destino ligado: Etapa ${stepNumber}`)
    }
  }

  const resetTransDrag = () => {
    transDragRef.current = null
    transDragPosRef.current = null
    setTransDragPos(null)
    setTransDropStep(null)
  }

  const onFreeTransPointerDown = (t: GrafcetTransition, e: React.PointerEvent) => {
    if (!full || activeTool !== 'select' || isSpacePan) return
    if (e.button !== 0) return
    if ((e.target as Element).closest('.grafcet-node-handle, .grafcet-port, button')) return
    e.stopPropagation()
    const pos = transXY(t)
    transDragRef.current = { transId: t.id, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y, moved: false }
    setSelected(t.id)
    setSelectedActionId(null)
    setTab('transitions')
    try {
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    } catch {
      /* noop */
    }
  }

  const onFreeTransPointerMove = (t: GrafcetTransition, e: React.PointerEvent) => {
    const drag = transDragRef.current
    if (!drag || drag.transId !== t.id) return
    const rawDx = e.clientX - drag.startX
    const rawDy = e.clientY - drag.startY
    if (!drag.moved) {
      if (Math.hypot(rawDx, rawDy) < 4) return
      drag.moved = true
      if (zoom === null) setZoom(scale)
      if (pan === null) setPan(position)
    }
    let x = drag.origX + rawDx / scale
    let y = drag.origY + rawDy / scale
    if (snapOn && !e.altKey) {
      x = snapToGrid(x, SPINE_X)
      y = snapToGrid(y, START_Y)
    }
    const clamped = clampPosition(x, y)
    const next = { id: t.id, x: Math.round(clamped.x), y: Math.round(clamped.y) }
    transDragPosRef.current = next
    setTransDragPos(next)
    // Deteta a etapa sob a barra para pré-visualizar a ligação (drop): primeiro o cursor, depois o centro da barra.
    const w = clientToWorld(e.clientX, e.clientY)
    setTransDropStep(hitStepAt(w.x, w.y)?.id ?? hitStepAt(next.x, next.y)?.id ?? null)
  }

  const onFreeTransPointerUp = (t: GrafcetTransition, e: React.PointerEvent) => {
    const drag = transDragRef.current
    if (!drag || drag.transId !== t.id) return
    try {
      ;(e.currentTarget as Element).releasePointerCapture(e.pointerId)
    } catch {
      /* noop */
    }
    const final = transDragPosRef.current
    let dropStepId = transDropStep
    if (!dropStepId && final) {
      dropStepId = hitStepAt(final.x, final.y)?.id ?? null
    }
    resetTransDrag()
    if (drag.moved && dropStepId && stepById.has(dropStepId)) {
      // Largada sobre uma etapa: guarda a posição e LIGA automaticamente.
      if (final) updateTransition(t.id, { x: final.x, y: final.y }, 'force')
      attachFreeTransition({ ...t, ...(final ? { x: final.x, y: final.y } : {}) }, dropStepId, final?.y ?? transXY(t).y)
      return
    }
    if (!drag.moved || !final || (final.x === drag.origX && final.y === drag.origY)) return
    updateTransition(t.id, { x: final.x, y: final.y }, 'force')
  }

  // ------------------------------------------------------------------
  // Arrasto de ações: soltas no grid, ou desanexadas/transferidas entre etapas.
  // ------------------------------------------------------------------

  const resetActionDrag = () => {
    actionDragRef.current = null
    actionDragPosRef.current = null
    setActionDragPos(null)
    setActionDropStep(null)
  }

  /**
   * Inicia o arrasto de uma ação. `fromStepId = null` para ações já soltas;
   * para ações anexadas, `origX/origY` é a posição da caixa junto à etapa.
   */
  const onActionPointerDown = (action: GrafcetAction, fromStepId: string | null, e: React.PointerEvent) => {
    if (!full || activeTool !== 'select' || isSpacePan) return
    if (e.button !== 0) return
    if ((e.target as Element).closest('.grafcet-node-handle, .grafcet-port, button')) return
    if (action.id.startsWith('legacy-')) return
    e.stopPropagation()
    const pos = fromStepId ? attachedActionPos(fromStepId, action.id) : actionXY(action)
    actionDragRef.current = {
      actionId: action.id,
      fromStepId,
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
      moved: false,
    }
    if (fromStepId) setSelected(fromStepId)
    else setSelected(null)
    setSelectedActionId(action.id)
    setTab('steps')
    try {
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    } catch {
      /* noop */
    }
  }

  const onActionPointerMove = (action: GrafcetAction, e: React.PointerEvent) => {
    const drag = actionDragRef.current
    if (!drag || drag.actionId !== action.id) return
    const rawDx = e.clientX - drag.startX
    const rawDy = e.clientY - drag.startY
    if (!drag.moved) {
      if (Math.hypot(rawDx, rawDy) < 4) return
      drag.moved = true
      if (zoom === null) setZoom(scale)
      if (pan === null) setPan(position)
    }
    let x = drag.origX + rawDx / scale
    let y = drag.origY + rawDy / scale
    if (snapOn && !e.altKey) {
      x = Math.round(x / GRID) * GRID
      y = Math.round(y / GRID) * GRID
    }
    x = Math.max(24, Math.min(x, width - 220))
    y = Math.max(24, Math.min(y, height - 44))
    const next = { id: action.id, x: Math.round(x), y: Math.round(y) }
    actionDragPosRef.current = next
    setActionDragPos(next)
    // Pré-visualização: deteta etapa sob o cursor ou sob a zona de encaixe da ação.
    const w = clientToWorld(e.clientX, e.clientY)
    const center = { x: next.x + ACTION_FREE_W / 2, y: next.y + ACTION_FREE_H / 2 }
    const dropTarget = hitStepForActionDrop(w.x, w.y, next.x, next.y) ?? hitStepForActionDrop(center.x, center.y)
    setActionDropStep(dropTarget?.id ?? null)
  }

  const onActionPointerUp = (action: GrafcetAction, e: React.PointerEvent) => {
    const drag = actionDragRef.current
    if (!drag || drag.actionId !== action.id) return
    try {
      ;(e.currentTarget as Element).releasePointerCapture(e.pointerId)
    } catch {
      /* noop */
    }
    const final = actionDragPosRef.current
    let dropStepId = actionDropStep
    if (!dropStepId && final) {
      dropStepId = (hitStepForActionDrop(final.x, final.y) ?? hitStepForActionDrop(final.x + ACTION_FREE_W / 2, final.y + ACTION_FREE_H / 2))?.id ?? null
    }
    const { fromStepId, moved } = drag
    resetActionDrag()
    if (!moved || !final) return
    if (dropStepId && stepById.has(dropStepId)) {
      if (fromStepId) {
        if (dropStepId !== fromStepId) moveActionToStep(fromStepId, action.id, dropStepId)
        // Largada na mesma etapa: volta ao lugar (não faz nada).
        else resetActionDrag()
      } else {
        attachFreeAction(action.id, dropStepId)
      }
      return
    }
    // Largada em espaço vazio: fica solta (ou passa a solta) na posição final.
    if (fromStepId) detachAction(fromStepId, action.id, { x: final.x, y: final.y })
    else patchFreeAction(action, { x: final.x, y: final.y }, 'force')
  }

  /** true se o troço direto entre duas etapas não atravessa nenhuma outra etapa. */
  const clearPath = (a: GrafcetStep, b: GrafcetStep) => {
    const left = Math.min(stepX(a.id), stepX(b.id)) - 36
    const right = Math.max(stepX(a.id), stepX(b.id)) + 36
    const top = stepY(a.id) + STEP_H
    const bottom = stepY(b.id)
    return !steps.some(
      (o) => o.id !== a.id && o.id !== b.id && stepX(o.id) + 32 > left && stepX(o.id) - 32 < right && stepY(o.id) + STEP_H > top && stepY(o.id) < bottom
    )
  }

  // Viewport / Zoom / Pan
  const viewportRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const [viewport, setViewport] = useState({ width: 440, height: 500 })
  const [zoom, setZoom] = useState<number | null>(null)
  const [pan, setPan] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!viewportRef.current) return
    const node = viewportRef.current
    const observer = new ResizeObserver(() => setViewport({ width: node.clientWidth, height: node.clientHeight }))
    observer.observe(node)
    setViewport({ width: node.clientWidth, height: node.clientHeight })
    return () => observer.disconnect()
  }, [full])

  const fit = full
    ? Math.min(1.35, Math.max(0.15, Math.min((viewport.width - 70) / width, (viewport.height - 86) / height)))
    : Math.min(1, Math.max(0.25, (viewport.width - 28) / width))
  const scale = zoom ?? fit
  // Thin the visible grid by powers of two when zoomed out; snap geometry stays at GRID.
  const gridSpacing = GRID * scale * 2 ** Math.max(0, Math.ceil(Math.log2(16 / (GRID * scale))))
  const position = pan ?? { x: (viewport.width - width * scale) / 2, y: full ? 38 : 22 }
  const clamp = (value: number) => Math.max(full ? 0.15 : 0.25, Math.min(GRAFCET_ZOOM_MAX, value))

  const zoomAt = (value: number, point: { x: number; y: number }) => {
    const next = clamp(value)
    setPan({ x: point.x - ((point.x - position.x) * next) / scale, y: point.y - ((point.y - position.y) * next) / scale })
    setZoom(next)
  }

  // Zoom com dois dedos (telemóvel/tablet): o ponto sob os dedos acompanha-os, e mover os dedos desloca a vista.
  const pinchStartRef = useRef<{ zoom: number; pos: { x: number; y: number } } | null>(null)
  usePinchZoom(viewportRef, {
    swallowPointers: true,
    enabled: steps.length > 0,
    onStart: () => { pinchStartRef.current = { zoom: scale, pos: position } },
    onChange: ({ ratio, center, startCenter }) => {
      const start = pinchStartRef.current
      if (!start) return
      const next = clamp(start.zoom * ratio)
      setPan(pinchPan(start.pos, start.zoom, next, startCenter, center))
      setZoom(next)
    },
    onEnd: () => { pinchStartRef.current = null },
  })

  const resetView = () => {
    setZoom(null)
    setPan(null)
  }

  const onPreviewWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!steps.length) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    zoomAt(scale * (event.deltaY < 0 ? 1.12 : 1 / 1.12), { x: event.clientX - rect.left, y: event.clientY - rect.top })
  }

  const clickStartRef = useRef<{ x: number; y: number } | null>(null)

  const onPreviewDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!steps.length) return
    clickStartRef.current = { x: event.clientX, y: event.clientY }
    // Botão do meio (1), ou ferramenta 'pan' (Arrastar), ou espaço pressionado:
    if (event.button === 1 || activeTool === 'pan' || isSpacePan) {
      event.currentTarget.setPointerCapture(event.pointerId)
      setIsDragging(true)
      dragRef.current = { x: event.clientX, y: event.clientY, px: position.x, py: position.y }
      return
    }

    // Ferramenta 'select' e botão esquerdo (0):
    if (event.button === 0) {
      if ((event.target as Element).closest('button, [role="button"], .grafcet-node-handle, .grafcet-graph-node, .grafcet-graph-link, .grafcet-graph-action')) return
      event.currentTarget.setPointerCapture(event.pointerId)
      // Ferramenta Selecionar (rato/caneta): arrastar no fundo desenha um retângulo de seleção.
      // Para mover a vista: ferramenta Arrastar [H], Espaço, botão do meio ou toque.
      if (full && activeTool === 'select' && event.pointerType !== 'touch') {
        const add = event.shiftKey || event.ctrlKey || event.metaKey
        marqueeRef.current = {
          sx: event.clientX,
          sy: event.clientY,
          add,
          base: add ? (groupIds.length >= 2 ? groupIds : selected && !selectedActionId && stepById.has(selected) ? [selected] : []) : [],
          moved: false,
        }
        return
      }
      setIsDragging(true)
      dragRef.current = { x: event.clientX, y: event.clientY, px: position.x, py: position.y }
    }
  }

  const onPreviewMove = (event: PointerEvent<HTMLDivElement>) => {
    const mq = marqueeRef.current
    if (mq) {
      if (!mq.moved && Math.hypot(event.clientX - mq.sx, event.clientY - mq.sy) < 4) return
      mq.moved = true
      const box = event.currentTarget.getBoundingClientRect()
      setMarquee({ x0: mq.sx - box.left, y0: mq.sy - box.top, x1: event.clientX - box.left, y1: event.clientY - box.top })
      const a = clientToWorld(mq.sx, mq.sy)
      const b = clientToWorld(event.clientX, event.clientY)
      const hit = stepsInRect(steps.map((step) => ({ id: step.id, x: stepX(step.id), y: stepY(step.id) })), rectFromPoints(a.x, a.y, b.x, b.y))
      const next = unionIds(mq.base, hit)
      setMulti(next.length >= 2 ? next : [])
      setSelected(next[0] ?? null)
      setSelectedActionId(null)
      return
    }
    if (!dragRef.current) return
    setPan({ x: dragRef.current.px + event.clientX - dragRef.current.x, y: dragRef.current.py + event.clientY - dragRef.current.y })
  }

  const onPreviewUp = (event: PointerEvent<HTMLDivElement>) => {
    const mq = marqueeRef.current
    if (mq) {
      marqueeRef.current = null
      setMarquee(null)
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        /* noop */
      }
      if (!mq.moved) {
        // Clique simples no fundo: cancela o fio armado ou limpa a seleção.
        if (wireDraftRef.current) cancelWire(false)
        else if (!mq.add) {
          setMulti([])
          setSelected(null)
          setSelectedActionId(null)
        }
      } else {
        setTab('steps')
      }
      return
    }
    if (dragRef.current) {
      const movedDist = clickStartRef.current ? Math.hypot(event.clientX - clickStartRef.current.x, event.clientY - clickStartRef.current.y) : 0
      dragRef.current = null
      setIsDragging(false)
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        /* noop */
      }
      if (movedDist < 5 && !(event.target as Element).closest('button, [role="button"], .grafcet-node-handle, .grafcet-graph-node, .grafcet-graph-link, .grafcet-graph-action')) {
        if (wireDraftRef.current) {
          // Clique no fundo da tela: cancela o fio armado (ferramenta Ligar).
          cancelWire(false)
        } else {
          setMulti([])
          setSelected(null)
          setSelectedActionId(null)
        }
      }
    }
  }

  const resetStepDrag = () => {
    stepDragRef.current = null
    dragPosRef.current = null
    setDragPos(null)
    setGroupOffset(null)
    setGuides({ x: null, y: null })
  }

  const onStepPointerDown = (step: GrafcetStep, e: React.PointerEvent) => {
    if (!full || activeTool !== 'select' || isSpacePan) return // na ferramenta Ligar, a etapa não se arrasta
    if (e.button !== 0) return
    if ((e.target as Element).closest('.grafcet-node-handle, button')) return
    const modifier = e.shiftKey || e.ctrlKey || e.metaKey
    const inGroup = groupIds.length >= 2 && groupIds.includes(step.id)
    // Com Shift/Ctrl só se arrasta o que já está selecionado; caso contrário o clique alterna a seleção.
    if (modifier && !inGroup && !(selected === step.id && !selectedActionId)) return
    e.stopPropagation()
    stepDragRef.current = {
      stepId: step.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: stepX(step.id),
      origY: stepY(step.id),
      moved: false,
      group: inGroup ? groupIds.map((sid) => ({ id: sid, x: stepX(sid), y: stepY(sid) })) : undefined,
    }
    // Seleciona logo ao pressionar, para o painel já mostrar a etapa que se vai mover.
    if (!modifier) {
      setSelected(step.id)
      setSelectedActionId(null)
      setTab('steps')
    }
    try {
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    } catch {
      /* noop */
    }
  }

  const onStepPointerMove = (step: GrafcetStep, e: React.PointerEvent) => {
    const drag = stepDragRef.current
    if (!drag || drag.stepId !== step.id) return
    const rawDx = e.clientX - drag.startX
    const rawDy = e.clientY - drag.startY
    if (!drag.moved) {
      if (Math.hypot(rawDx, rawDy) < 4) return
      drag.moved = true
      // Congela a vista (o "ajustar" automático depende da largura, que pode crescer ao arrastar).
      if (zoom === null) setZoom(scale)
      if (pan === null) setPan(position)
    }
    let x = drag.origX + rawDx / scale
    let y = drag.origY + rawDy / scale
    // Shift bloqueia o movimento ao eixo dominante.
    if (e.shiftKey) {
      if (Math.abs(rawDx) >= Math.abs(rawDy)) y = drag.origY
      else x = drag.origX
    }
    let guideX: number | null = null
    let guideY: number | null = null
    // Alt = movimento livre (sem encaixe nem guias).
    if (!e.altKey) {
      if (snapOn) {
        x = snapToGrid(x, SPINE_X)
        y = snapToGrid(y, START_Y)
      }
      const moving = new Set(drag.group ? drag.group.map((p) => p.id) : [step.id])
      const others = steps.filter((s) => !moving.has(s.id)).map((s) => ({ x: stepX(s.id), y: stepY(s.id) }))
      const aligned = alignToOthers(x, y, others, 6 / scale)
      x = aligned.x
      y = aligned.y
      guideX = aligned.guideX
      guideY = aligned.guideY
    }
    const clamped = clampPosition(x, y)
    const next = { id: step.id, x: Math.round(clamped.x), y: Math.round(clamped.y) }
    if (drag.group) {
      // Arrasto em grupo: o deslocamento é limitado para o grupo manter a forma junto às bordas.
      const delta = clampGroupDelta(drag.group, next.x - drag.origX, next.y - drag.origY)
      next.x = drag.origX + delta.dx
      next.y = drag.origY + delta.dy
      setGroupOffset(delta)
    }
    dragPosRef.current = next
    setDragPos(next)
    setGuides({ x: guideX, y: guideY })
  }

  const onStepPointerUp = (step: GrafcetStep, e: React.PointerEvent) => {
    const drag = stepDragRef.current
    if (!drag || drag.stepId !== step.id) return
    try {
      ;(e.currentTarget as Element).releasePointerCapture(e.pointerId)
    } catch {
      /* noop */
    }
    const final = dragPosRef.current
    resetStepDrag()
    if (drag.moved) {
      suppressClickRef.current = true
      window.setTimeout(() => {
        suppressClickRef.current = false
      }, 0)
    }
    if (!drag.moved || !final || final.id !== step.id) return
    if (final.x === drag.origX && final.y === drag.origY) return
    if (drag.group) {
      const dx = final.x - drag.origX
      const dy = final.y - drag.origY
      const start = new Map(drag.group.map((p) => [p.id, p]))
      save({ steps: steps.map((s) => (start.has(s.id) ? { ...s, x: start.get(s.id)!.x + dx, y: start.get(s.id)!.y + dy, pinned: true } : s)) })
      return
    }
    // Largar a etapa junto a uma barra de transição solta liga-a (aproximação).
    const stepCenter = { x: final.x, y: final.y + STEP_H / 2 }
    const near = transitions.find((t) => {
      if (!isFreeTransition(t)) return false
      const p = transXY(t)
      return Math.abs(stepCenter.x - p.x) < 70 && Math.abs(stepCenter.y - p.y) < 52
    })
    updateStep(step.id, { x: final.x, y: final.y, pinned: true }, 'force')
    if (near) attachFreeTransition({ ...near }, step.id, transXY(near).y, { x: final.x, y: final.y })
  }

  const onStepPointerCancel = () => resetStepDrag()

  // Esc cancela o arrastamento em curso sem guardar (etapa, transição solta ou ação).
  useEffect(() => {
    if (!dragPos && !transDragPos && !actionDragPos) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        resetStepDrag()
        resetTransDrag()
        resetActionDrag()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [dragPos !== null, transDragPos !== null, actionDragPos !== null])

  const organizeLayout = () => {
    if (!steps.length) return notify('Sem etapas para organizar')
    const layout = autoLayout(steps, transitions)
    save({
      steps: steps.map((step) => {
        const point = layout.get(step.id)
        return point ? { ...step, x: point.x, y: point.y, pinned: true } : step
      }),
    })
    resetView()
    notify('Diagrama organizado · Ctrl+Z repõe')
  }

  /** Shift+setas movem a etapa selecionada um passo (grelha com íman, 4 px sem). */
  const nudgeSelection = (dx: number, dy: number, big: boolean) => {
    if (!full || !selectedStep || selectedActionId) return
    const amount = (snapOn ? GRID : 4) * (big ? 5 : 1)
    if (groupIds.length >= 2) {
      const items = groupIds.map((sid) => ({ id: sid, x: stepX(sid), y: stepY(sid) }))
      const delta = clampGroupDelta(items, dx * amount, dy * amount)
      if (!delta.dx && !delta.dy) return
      const moved = new Map(items.map((p) => [p.id, p]))
      save({ steps: steps.map((s) => (moved.has(s.id) ? { ...s, x: moved.get(s.id)!.x + delta.dx, y: moved.get(s.id)!.y + delta.dy, pinned: true } : s)) }, 'auto', 'grafcet:nudge:group')
      return
    }
    let x = stepX(selectedStep.id) + dx * amount
    let y = stepY(selectedStep.id) + dy * amount
    if (snapOn) {
      x = snapToGrid(x, SPINE_X)
      y = snapToGrid(y, START_Y)
    }
    const next = clampPosition(x, y)
    if (next.x === stepX(selectedStep.id) && next.y === stepY(selectedStep.id) && isPinned(selectedStep)) return
    updateStep(selectedStep.id, { x: Math.round(next.x), y: Math.round(next.y), pinned: true }, 'auto', `grafcet:nudge:${selectedStep.id}`)
  }

  // ------------------------------------------------------------------
  // Seleção múltipla: alinhar, distribuir, copiar/colar, zoom à seleção
  // ------------------------------------------------------------------
  const groupPositions = (): Pos[] => groupIds.map((sid) => ({ id: sid, x: stepX(sid), y: stepY(sid) }))

  const applyPositions = (items: Pos[], message: string) => {
    const placed = new Map(items.map((p) => [p.id, p]))
    save({ steps: steps.map((s) => (placed.has(s.id) ? { ...s, x: Math.round(placed.get(s.id)!.x), y: Math.round(placed.get(s.id)!.y), pinned: true } : s)) })
    notify(message)
  }

  const alignGroup = (mode: AlignMode) => {
    if (groupIds.length < 2) return
    applyPositions(alignPositions(groupPositions(), mode), mode === 'axis' ? 'Etapas alinhadas ao eixo · Ctrl+Z desfaz' : 'Etapas alinhadas pelo topo · Ctrl+Z desfaz')
  }

  const distributeGroup = (axis: DistributeAxis) => {
    if (groupIds.length < 3) return notify('Distribuir precisa de, pelo menos, 3 etapas')
    applyPositions(distributePositions(groupPositions(), axis), axis === 'h' ? 'Distribuídas na horizontal · Ctrl+Z desfaz' : 'Distribuídas na vertical · Ctrl+Z desfaz')
  }

  /** Ids das etapas a copiar: o grupo, ou a etapa selecionada. */
  const copyableIds = () => (groupIds.length >= 2 ? groupIds : selectedStep && !selectedActionId ? [selectedStep.id] : [])

  const copySelection = (silent = false) => {
    const ids = copyableIds()
    if (!ids.length) return false
    clipboardRef.current = { ids, steps, transitions, pos: new Map(ids.map((sid) => [sid, { x: stepX(sid), y: stepY(sid) }])), pastes: 0 }
    if (!silent) notify(ids.length === 1 ? 'Etapa copiada · Ctrl+V cola' : `${ids.length} etapas copiadas · Ctrl+V cola`)
    return true
  }

  const pasteClipboard = () => {
    const clip = clipboardRef.current
    if (!clip) return notify('Nada para colar — copie etapas com Ctrl+C')
    clip.pastes += 1
    const shift = GRID * 3 * clip.pastes
    const copy: SubDiagram = cloneSubDiagram(clip.steps, clip.transitions, clip.ids, (sid) => clip.pos.get(sid) ?? { x: SPINE_X, y: START_Y }, { dx: shift, dy: shift }, id)
    if (!copy.steps.length) return notify('As etapas copiadas já não existem')
    save({ steps: [...steps, ...copy.steps], transitions: [...transitions, ...copy.transitions] })
    const pasted = copy.steps.map((s) => s.id)
    setMulti(pasted.length >= 2 ? pasted : [])
    setSelected(pasted[0])
    setSelectedActionId(null)
    setTab('steps')
    notify(pasted.length === 1 ? 'Etapa colada' : `${pasted.length} etapas coladas · Ctrl+Z desfaz`)
  }

  const selectAllSteps = () => {
    if (!steps.length) return
    const all = steps.map((s) => s.id)
    setMulti(all.length >= 2 ? all : [])
    setSelected(all[0])
    setSelectedActionId(null)
    setTab('steps')
    notify(`${all.length} etapas selecionadas`)
  }

  /** Enquadra a seleção (ou o diagrama todo, se nada estiver selecionado) na janela. */
  const zoomToSelection = () => {
    const ids = copyableIds()
    const items = (ids.length ? ids : steps.map((s) => s.id)).map((sid) => ({ id: sid, x: stepX(sid), y: stepY(sid) }))
    const box = boundsOf(items, 20)
    if (!box) return
    items.forEach((item) => {
      const itemStep = stepById.get(item.id)!
      const count = actionsOf(itemStep).length
      const layout = stepActionLayout(itemStep)
      box.x1 = Math.max(box.x1, item.x + (count ? actionsExtentX(layout, count) : 220) + 20)
      box.y1 = Math.max(box.y1, item.y + (layout === 'row' ? STEP_H : ACTION_TOP_OFFSET + Math.max(0, count - 1) * ACTION_PITCH + ACTION_H) + 20)
    })
    const view = fitView(box, viewport.width, viewport.height, 0.15, 1.6)
    setZoom(view.scale)
    setPan({ x: view.x, y: view.y })
    notify(ids.length ? 'Vista ampliada à seleção' : 'Vista ajustada ao diagrama')
  }

  /** Posição do diagrama (encaixada à grelha) para criar um elemento no ponto do ecrã indicado. */
  const placeAtScreen = (cx: number, cy: number) => {
    const world = clientToWorld(cx, cy)
    let wx = world.x
    let wy = world.y - STEP_H / 2
    if (snapOn) {
      wx = snapToGrid(wx, SPINE_X)
      wy = snapToGrid(wy, START_Y)
    }
    const clamped = clampPosition(wx, wy)
    // Congela a vista, como ao largar da paleta (o ajuste automático depende da largura).
    if (zoom === null) setZoom(scale)
    if (pan === null) setPan(position)
    return { x: Math.round(clamped.x), y: Math.round(clamped.y) }
  }

  const onCanvasContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!full) return
    event.preventDefault()
    const stepId = (event.target as Element).closest('[data-step-id]')?.getAttribute('data-step-id') ?? undefined
    const inGroup = !!stepId && groupIds.includes(stepId)
    if (stepId && !inGroup) {
      setMulti([])
      setSelected(stepId)
      setSelectedActionId(null)
      setTab('steps')
    }
    setMenu({
      x: event.clientX,
      y: event.clientY,
      kind: stepId ? (inGroup ? 'group' : 'step') : 'canvas',
      stepId,
      at: { x: event.clientX, y: event.clientY },
    })
  }

  const menuItems = (): ContextMenuItem[] => {
    if (!menu) return []
    const sep: ContextMenuItem = { separator: true }
    if (menu.kind === 'group') {
      return [
        { label: 'Alinhar ao eixo', onSelect: () => alignGroup('axis') },
        { label: 'Alinhar pelo topo', onSelect: () => alignGroup('top') },
        { label: 'Distribuir na horizontal', disabled: groupIds.length < 3, onSelect: () => distributeGroup('h') },
        { label: 'Distribuir na vertical', disabled: groupIds.length < 3, onSelect: () => distributeGroup('v') },
        sep,
        { label: 'Copiar', hint: 'Ctrl+C', onSelect: () => copySelection() },
        { label: 'Duplicar', hint: 'Ctrl+D', onSelect: duplicateSelected },
        { label: 'Ampliar à seleção', hint: 'Z', onSelect: zoomToSelection },
        sep,
        { label: `Eliminar ${groupIds.length} etapas`, hint: 'Del', danger: true, onSelect: () => void requestDelete() },
      ]
    }
    if (menu.kind === 'step') {
      const target = menu.stepId ? stepById.get(menu.stepId) : undefined
      return [
        { label: 'Editar etapa…', hint: 'Enter', disabled: demoMode || !target, onSelect: () => !demoMode && target && setEditingStep(target) },
        { label: 'Criar etapa ligada abaixo', disabled: !target, onSelect: () => addConnectedStep(target) },
        sep,
        { label: 'Copiar', hint: 'Ctrl+C', onSelect: () => copySelection() },
        { label: 'Duplicar', hint: 'Ctrl+D', onSelect: duplicateSelected },
        { label: 'Ampliar à etapa', hint: 'Z', onSelect: zoomToSelection },
        sep,
        { label: 'Eliminar etapa', hint: 'Del', danger: true, onSelect: () => void requestDelete() },
      ]
    }
    const place = () => placeAtScreen(menu.at.x, menu.at.y)
    return [
      { label: 'Nova etapa aqui', onSelect: () => addStep(place()) },
      { label: 'Nova transição solta aqui', onSelect: () => addFreeTransition(place()) },
      { label: 'Nova ação solta aqui', onSelect: () => addFreeAction(false, place()) },
      { label: 'Novo comentário aqui', onSelect: () => addComment(place()) },
      sep,
      { label: 'Colar', hint: 'Ctrl+V', disabled: !clipboardRef.current, onSelect: pasteClipboard },
      { label: 'Selecionar tudo', hint: 'Ctrl+A', disabled: !steps.length, onSelect: selectAllSteps },
      sep,
      { label: 'Ajustar vista ao diagrama', hint: 'Ctrl+0', onSelect: resetView },
      { label: minimapOn ? 'Esconder minimapa' : 'Mostrar minimapa', onSelect: () => setMinimapOn((value) => !value) },
    ]
  }

  /** O minimapa só serve quando há diagrama fora da vista; se tudo cabe, é ruído. */
  const diagramFitsView = (() => {
    const box = boundsOf(steps.map((step) => ({ id: step.id, x: stepX(step.id), y: stepY(step.id) })), 20)
    if (!box) return true
    const left = -position.x / scale
    const top = -position.y / scale
    return box.x0 >= left && box.y0 >= top && box.x1 + 220 <= left + viewport.width / scale && box.y1 <= top + viewport.height / scale
  })()

  const doUndo = () => {
    const state = useSimStore.getState()
    if (!state.history.length) return notify('Nada para desfazer')
    state.undo()
    notify('Desfeito')
  }

  const doRedo = () => {
    const state = useSimStore.getState()
    if (!state.future.length) return notify('Nada para refazer')
    state.redo()
    notify('Refeito')
  }

  // Export SVG / JSON
  const exportSvg = () => {
    if (!svgRef.current) return
    const clone = svgRef.current.cloneNode(true) as SVGSVGElement
    clone.removeAttribute('style')
    const serializer = new XMLSerializer()
    const svgStr = serializer.serializeToString(clone)
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `grafcet-${Date.now()}.svg`
    a.click()
    URL.revokeObjectURL(url)
    notify('Diagrama exportado em SVG')
  }

  const exportJson = () => {
    const data = JSON.stringify({ ...program, transitions }, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(program.name ?? '').trim().replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'grafcet-project'}-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    notify('Projeto GRAFCET exportado')
  }

  const importGrafcet = async (file: File) => {
    const request = ++importRequestRef.current
    const projectPath = window.location.pathname
    const previousProgram = useSimStore.getState().grafcet
    const stillCurrent = () => importRequestRef.current === request && window.location.pathname === projectPath && useSimStore.getState().grafcet === previousProgram
    try {
      const result = await readGrafcetFile(file)
      if (!stillCurrent()) return
      if (result.source === 'fluidsim4' && !requireFeature('fluidsimImport', notify)) return
      const imported = result.program
      const actionCount = imported.steps.reduce((total, step) => total + (step.actions?.length ?? 0), 0) + (imported.freeActions?.length ?? 0)
      const summary = `${file.name}\n${imported.steps.length} etapas · ${imported.transitions?.length ?? 0} transições · ${actionCount} ações`
      const warnings = result.warnings.length ? `\n\n${result.warnings.join('\n')}` : ''
      if (!await uiConfirm(`${summary}${warnings}\n\nSubstituir o GRAFCET atual, incluindo as suas páginas? Pode desfazer a importação.`, { title: 'Importar GRAFCET', confirmLabel: 'Importar', cancelLabel: 'Cancelar' })) return
      if (!stillCurrent()) return
      // Uma importação substitui o programa completo; save() mescla apenas a página ativa.
      setGrafcet(imported, 'force', 'grafcet:import')
      setSelected(null)
      setSelectedActionId(null)
      setMulti([])
      cancelWire()
      resetView()
      notify(result.source === 'fluidsim4' ? 'GRAFCET FluidSIM 4 importado' : 'Projeto GRAFCET importado')
    } catch (error) {
      if (importRequestRef.current === request) notify(error instanceof Error ? error.message : 'Não foi possível ler o ficheiro GRAFCET')
    }
  }

  // Teclado e atalhos
  useEffect(() => {
    if (!full) return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing = !!target?.closest('input,textarea,select,[contenteditable="true"]')
      const mod = event.ctrlKey || event.metaKey
      const lower = event.key.toLowerCase()
      if (mod && event.key === '/') {
        event.preventDefault()
        setHelpOpen((value) => !value)
        return
      }
      if (typing || helpOpen || signalsOpen || editingStep || editingTransition || editingAction || templatesOpen || importOpen) return
      if (event.code === 'Space' && !spacePressed.current && !event.repeat) {
        spacePressed.current = true
        setIsSpacePan(true)
      }
      if (!mod && !event.altKey && (lower === 'v' || lower === 's')) {
        event.preventDefault()
        setCanvasTool('select')
        notify('Ferramenta Selecionar ativa [V]')
        return
      }
      if (!mod && !event.altKey && lower === 'h') {
        event.preventDefault()
        setCanvasTool('pan')
        notify('Ferramenta Arrastar (Mão) ativa [H]')
        return
      }
      if (!mod && !event.altKey && lower === 'l') {
        event.preventDefault()
        setCanvasTool('connect')
        notify('Ferramenta Ligar ativa — toque numa saída e depois no destino [L]')
        return
      }
      if (mod && lower === 'b') {
        event.preventDefault()
        setShowPalette((value) => !value)
        return
      }
      if (mod && lower === 'f') {
        event.preventDefault()
        setShowPalette(true)
        requestAnimationFrame(() => paletteSearchRef.current?.focus())
        return
      }
      if (mod && lower === 'd') {
        event.preventDefault()
        duplicateSelected()
        return
      }
      if (mod && lower === 'a') {
        event.preventDefault()
        selectAllSteps()
        return
      }
      if (mod && lower === 'c') {
        if (copySelection()) event.preventDefault()
        return
      }
      if (mod && lower === 'v') {
        event.preventDefault()
        pasteClipboard()
        return
      }
      if (!mod && !event.altKey && !event.shiftKey && lower === 'z') {
        event.preventDefault()
        zoomToSelection()
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selected || selectedActionId) {
          event.preventDefault()
          requestDelete()
        }
        return
      }
      if (event.key === 'Escape') {
        setMulti([])
        setSelected(null)
        setSelectedActionId(null)
        return
      }
      if (mod && (event.key === '0' || event.key === 'Digit0')) {
        event.preventDefault()
        resetView()
        notify('Vista ajustada')
        return
      }
      if (event.shiftKey && !mod && !event.altKey && selectedStep && !selectedActionId) {
        const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key as string]
        if (dir) {
          event.preventDefault()
          nudgeSelection(dir[0], dir[1], false)
          return
        }
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        if (!steps.length) return
        const currentIdx = steps.findIndex((s) => s.id === selected)
        const nextIdx = currentIdx === -1 ? 0 : Math.min(steps.length - 1, currentIdx + 1)
        setSelected(steps[nextIdx].id)
        setSelectedActionId(null)
        setTab('steps')
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        if (!steps.length) return
        const currentIdx = steps.findIndex((s) => s.id === selected)
        const prevIdx = currentIdx === -1 ? steps.length - 1 : Math.max(0, currentIdx - 1)
        setSelected(steps[prevIdx].id)
        setSelectedActionId(null)
        setTab('steps')
        return
      }
      if (event.key === 'Enter') {
        if (selectedStep && selectedActionId) {
          const act = actionsOf(selectedStep).find((a) => a.id === selectedActionId)
          if (act) {
            event.preventDefault()
            if (!demoMode) setEditingAction({ step: selectedStep, action: act })
            return
          }
        }
        if (selectedStep) {
          event.preventDefault()
          if (!demoMode) setEditingStep(selectedStep)
          return
        }
        if (selectedTransition) {
          event.preventDefault()
          if (!demoMode) setEditingTransition(selectedTransition)
          return
        }
      }
      if (event.key === '1') {
        event.preventDefault()
        addConnectedStep()
        return
      }
      if (event.key === '2') {
        event.preventDefault()
        addStep()
        return
      }
      if (event.key === '3') {
        event.preventDefault()
        addTransition()
        return
      }
      if (event.key === '4') {
        event.preventDefault()
        addAction(false)
        return
      }
      if (event.key === 'Insert') {
        event.preventDefault()
        event.shiftKey ? addStep() : addConnectedStep()
        return
      }
      if (event.key === '?') {
        event.preventDefault()
        setHelpOpen(true)
        return
      }
      if (!mod && !event.altKey && lower === 'a') {
        event.preventDefault()
        addAction(event.shiftKey)
        return
      }
      if (!mod && !event.altKey && lower === 't') {
        event.preventDefault()
        addTransition()
        return
      }
      if (!mod && !event.altKey && lower === 'f') {
        event.preventDefault()
        addFork()
        return
      }
      if (!mod && !event.altKey && lower === 'j') {
        event.preventDefault()
        addJoin()
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        spacePressed.current = false
        setIsSpacePan(false)
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
    }
  })

  useEffect(() => {
    if (full) {
      useGrafcetUi.getState().setZoom(scale)
    }
  }, [full, scale])

  useEffect(() => {
    if (full) {
      useGrafcetUi.getState().setSelectedStepId(selectedStep?.id ?? null)
    }
  }, [full, selectedStep?.id])

  useEffect(() => {
    if (!full) return
    useGrafcetUi.getState().setActionHandler((action: GrafcetBusAction) => {
      switch (action) {
        case 'setToolSelect':
          setCanvasTool('select')
          break
        case 'setToolPan':
          setCanvasTool('pan')
          break
        case 'setToolConnect':
          setCanvasTool('connect')
          break
        case 'addConnectedStep':
          addConnectedStep()
          break
        case 'addStep':
          addStep()
          break
        case 'addTransition':
          addTransition()
          break
        case 'addAction':
          addAction(false)
          break
        case 'addFork':
          addFork()
          break
        case 'addJoin':
          addJoin()
          break
        case 'openSignals':
          setSignalsOpen(true)
          break
        case 'togglePalette':
          setShowPalette((value) => !value)
          break
        case 'openTemplates':
          setTemplatesOpen(true)
          break
        case 'generateLadder':
          void generateLadder()
          break
        case 'exportSvg':
          exportSvg()
          break
        case 'exportJson':
          exportJson()
          break
        case 'importJson':
          setImportOpen(true)
          break
        case 'restart':
          useSimStore.getState().restartGrafcet()
          notify('Sequência reiniciada nas etapas iniciais')
          break
        case 'zoomIn':
          zoomAt(scale * 1.2, { x: viewport.width / 2, y: viewport.height / 2 })
          break
        case 'zoomOut':
          zoomAt(scale / 1.2, { x: viewport.width / 2, y: viewport.height / 2 })
          break
        case 'zoomReset':
          resetView()
          break
        case 'openShortcuts':
          setHelpOpen(true)
          break
        case 'openDiagnostics':
          setTab('diagnostics')
          break
        case 'autoLayout':
          organizeLayout()
          break
        case 'toggleMinimap':
          setMinimapOn((value) => !value)
          break
        case 'fitView':
          resetView()
          break
      }
    })
    return () => {
      useGrafcetUi.getState().setActionHandler(undefined)
    }
  })

  useEditorShortcuts(
    {
      undo: doUndo,
      redo: doRedo,
      fitView: resetView,
      zoomView: (factor) => zoomAt(scale * factor, { x: viewport.width / 2, y: viewport.height / 2 }),
      panView: (dx, dy) => setPan({ x: position.x - dx, y: position.y - dy }),
    },
    { enabled: full && !helpOpen && !signalsOpen && !editingStep && !editingTransition && !editingAction && !templatesOpen && !importOpen }
  )

  const signalSuggestions = useMemo(() => grafcetSignals(tags), [tags])
  const actionSignals = signalSuggestions.filter((signal) => signal.area !== 'I')
  // Uso e declaração dos sinais: recalculados sempre que o programa ou a tabela mudam.
  const usageBySignal = useMemo(() => signalUsage(program), [program])
  const undeclared = useMemo(() => undeclaredSignals(program, tags), [program, tags])
  const selectedFreeAction = !selectedStep ? freeActions.find((action) => action.id === selectedActionId) ?? null : null

  /** O que «Usar» faz na aba Sinais, conforme a seleção atual. */
  const signalsContext: SignalsContext | null = selectedTransition
    ? { text: `Transição T${transitions.indexOf(selectedTransition) + 1}: «Usar» acrescenta o sinal à condição (AND).`, accepts: () => true }
    : selectedStep && selectedAction
      ? { text: `Ação ${selectedAction.variable || selectedAction.address}: «Usar» troca a saída (Q ou M).`, accepts: (area) => area !== 'I' }
      : selectedFreeAction
        ? { text: `Ação solta ${selectedFreeAction.variable || selectedFreeAction.address}: «Usar» troca a saída (Q ou M).`, accepts: (area) => area !== 'I' }
        : selectedStep
          ? { text: `Etapa ${getStepDisplayInfo(selectedStep, steps.indexOf(selectedStep)).stepNumber}: «Usar» cria uma ação com a saída (Q ou M).`, accepts: (area) => area !== 'I' }
          : null

  const applySignal = (address: string, area: SignalArea) => {
    if (selectedTransition) {
      if (signalAddressesInCondition(selectedTransition.condition).includes(address)) return notify(`${address} já está na condição`)
      updateTransition(selectedTransition.id, { condition: insertCondition(selectedTransition.condition, address) }, 'force')
      return notify(`${address} acrescentado à condição`)
    }
    if (area === 'I') return notify('As entradas usam-se em condições: selecione uma transição')
    if (selectedStep && selectedAction) {
      patchAction(selectedStep, selectedAction, { address, variable: address }, 'force')
      return notify(`Ação ligada a ${address}`)
    }
    if (selectedFreeAction) {
      patchFreeAction(selectedFreeAction, { address, variable: address }, 'force')
      return notify(`Ação solta ligada a ${address}`)
    }
    if (selectedStep) {
      const created: GrafcetAction = { id: id(), address, variable: address, condition: '1', kind: 'N' }
      updateStep(selectedStep.id, { actions: [...(selectedStep.actions ?? []), created] }, 'force')
      setSelectedActionId(created.id)
      return notify(`Ação ${address} criada na etapa`)
    }
    notify('Selecione uma transição, etapa ou ação para usar o sinal')
  }

  const liveBitsAll = [...new Set(steps.flatMap((step) => actionsOf(step).map((action) => action.address.trim().toUpperCase())))]
  const liveBits = Object.entries(table)
    .filter(([key, value]) => /^[QM]/.test(key) && value)
    .map(([key]) => key)

  return (
    <div className={`grafcet-editor grafcet-designer ${full ? 'grafcet-full' : 'grafcet-preview'}`}>
      <datalist id="grafcet-action-addresses">{actionSignals.map((signal) => <option key={signal.address} value={signal.address}>{signal.name} {signal.comment}</option>)}</datalist>
      <datalist id="grafcet-condition-signals">{signalSuggestions.map((signal) => <option key={signal.address} value={signal.address}>{signal.name} {signal.comment}</option>)}</datalist>

      {!full && (
        /* Modo Pré-visualização lateral (dock) */
        <header className="grafcet-header">
          <div className="grafcet-title">
            <strong>{program.name?.trim() || 'GRAFCET'}</strong>
            <small>
              {steps.length} etapas · {transitions.length} transições · {runtime.active.length} ativas
            </small>
          </div>
          {!demoMode && (
          <button className="dc-btn-primary dc-btn" onClick={onOpenEditor}>
            <IconOpen size={13} />Abrir editor
          </button>
          )}
        </header>
      )}

      {full && (
        <div className="grafcet-pages" role="tablist" aria-label="Páginas do GRAFCET">
          <span className="grafcet-title-edit">
            <InlineName
              value={program.name ?? ''}
              placeholder="GRAFCET sem nome"
              label="Nome do GRAFCET"
              allowEmpty
              maxLength={60}
              dataAttr="grafcet-name"
              title="Clique para mudar o nome do GRAFCET (aparece no editor, na barra de estado e nos comentários do Ladder gerado)"
              onCommit={(next) => save({ name: next }, 'force', 'grafcet:name')}
            />
          </span>
          <span className="grafcet-pages-label">Páginas</span>
          {(pageCharts.length ? pageCharts : [{ id: 'chart-p1', name: 'Página 1', title: 'Página 1' } as GrafcetChart]).map((chart) => {
            const isActive = chart.id === (pageActive ?? chart.id)
            const count = allSteps.filter((s) => (s.chart ?? (pageCharts[0]?.id ?? 'chart-p1')) === chart.id).length
            return (
              <span key={chart.id} className={`grafcet-page-chip ${isActive ? 'is-active' : ''}`}>
                <InlineName
                  role="tab"
                  ariaSelected={isActive}
                  value={chart.title || chart.name}
                  label="Nome da página"
                  editOnClick={isActive}
                  onIdleClick={() => switchPage(chart.id)}
                  showIcon={false}
                  dataAttr="grafcet-page-name"
                  title={`${chart.title || chart.name} — ${count} etapa(s). ${isActive ? 'Clique no nome para o mudar.' : 'Clique para abrir; duplo clique para mudar o nome.'} As páginas comunicam por sinais, ações S/R, referências X e ligações sem fio.`}
                  after={<em>{count}</em>}
                  onCommit={(next) => renamePage(chart.id, next)}
                />
                {pageCharts.length > 1 && !demoMode && (
                  <button type="button" className="grafcet-page-del" aria-label={`Eliminar ${chart.title || chart.name}`} title="Eliminar página" onClick={() => void deletePage(chart.id)}><IconClose size={11} /></button>
                )}
              </span>
            )
          })}
          {!demoMode && <button type="button" className="grafcet-page-add" onClick={addPage} title="Nova página (chart). Ex.: um GRAFCET por estação, a comunicarem por sinais e referências X."><IconPlus size={12} />Nova página</button>}
        </div>
      )}

      {/* CORPO DO DESIGNER: Painel de Ferramentas à Esquerda + Canvas no Centro + Propriedades à Direita */}
      <div className="grafcet-designer-body">
        {full && showPalette && !demoMode && <button type="button" className="grafcet-toolbox-backdrop" aria-label="Fechar componentes" onClick={() => setShowPalette(false)} />}
        {/* PALETA DE COMPONENTES (Layout clássico com busca e recolher) */}
        {full && !demoMode &&
          (showPalette ? (
            <aside className="grafcet-toolbox" aria-label="Ferramentas GRAFCET">
              <SidePanelHeader eyebrow="GRAFCET" title="Componentes" detail="Construa e ligue a sequência" side="left" onToggle={() => setShowPalette(false)} toggleLabel="Recolher ferramentas (Ctrl+B)" />

              <div className="grafcet-toolbox-search">
                <IconSearch size={13} />
                <input
                  ref={paletteSearchRef}
                  className="dc-input"
                  value={paletteFilter}
                  onChange={(event) => setPaletteFilter(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      setPaletteFilter('')
                      event.currentTarget.blur()
                    }
                  }}
                  placeholder="Pesquisar componentes…"
                  aria-label="Pesquisar componentes GRAFCET"
                />
                {paletteFilter && (
                  <button onClick={() => setPaletteFilter('')} title="Limpar pesquisa" aria-label="Limpar pesquisa">
                    <IconClose size={11} />
                  </button>
                )}
              </div>

              <div className="grafcet-toolbox-list">
                {PALETTE.map((group) => {
                  const items = group.items.filter((item) => norm(`${item.name} ${item.detail}`).includes(norm(paletteFilter)))
                  return items.length ? (
                    <section key={group.group}>
                      <h3>{group.group}</h3>
                      {items.map((item) => (
                        <button
                          key={item.kind}
                          disabled={paletteDisabled(item.kind)}
                          onClick={() => { usePalette(item.kind); if (window.matchMedia('(max-width: 1199px)').matches) setShowPalette(false) }}
                          draggable={!paletteDisabled(item.kind)}
                          onDragStart={(event) => {
                            event.dataTransfer.setData(GRAFCET_MIME, item.kind)
                            event.dataTransfer.effectAllowed = 'copy'
                          }}
                          className="grafcet-toolbox-item"
                          title={`${item.name}: clique ou arraste para o diagrama`}
                        >
                          <span className="grafcet-toolbox-icon"><GrafcetPaletteGlyph kind={item.kind} /></span>
                          <span>
                            <strong>{item.name}</strong>
                            <small>{item.detail}</small>
                          </span>
                        </button>
                      ))}
                    </section>
                  ) : null
                })}
                {!PALETTE.some((group) => group.items.some((item) => norm(`${item.name} ${item.detail}`).includes(norm(paletteFilter)))) && (
                  <div className="grafcet-toolbox-empty">Nenhum componente encontrado.</div>
                )}
              </div>
              <p className="grafcet-toolbox-tip">Clique ou arraste componentes para a tela. Etapas nascem sem transição; transições e ações soltas ligam-se por arrasto ou com a ferramenta Ligar [L]. Para selecionar várias etapas, arraste um retângulo no fundo (Shift/Ctrl+clique também soma); Ctrl+C/V copia e cola, Ctrl+A seleciona tudo, Del apaga.</p>
            </aside>
          ) : (
            <CollapsedPanelRail className="grafcet-toolbox-restore" label="Componentes" side="left" icon={<IconLayers size={15} />} onExpand={() => setShowPalette(true)} />
          ))}

        {/* CANVAS CENTRAL COM O DIAGRAMA VERTICAL ROBUSTO */}
        <div
          ref={viewportRef}
          className={`grafcet-canvas ${sharedGridStyle === 'lines' ? 'grid-lines' : ''} ${activeTool === 'pan' ? 'is-pan-mode' : activeTool === 'connect' ? 'is-connect-mode' : 'is-select-mode'} ${isSpacePan ? 'is-space-pan' : ''} ${dropActive ? 'is-palette-drop' : ''} ${isDragging ? 'is-dragging' : ''} ${wireDraft ? 'is-wiring' : ''}`}
          aria-label="Diagrama GRAFCET"
          style={
            full
              ? gridOn
                ? {
                    // A grelha acompanha pan/zoom e coincide com o encaixe. Usa os mesmos
                    // fundo e pontos de 1 px dos restantes editores, sem linhas maiores próprias.
                    backgroundColor: EDITOR_THEME.background,
                    backgroundImage: sharedGridStyle === 'lines'
                      ? `linear-gradient(to right, ${EDITOR_THEME.line} 1px, transparent 1px), linear-gradient(to bottom, ${EDITOR_THEME.line} 1px, transparent 1px)`
                      : `radial-gradient(circle at 1px 1px, ${EDITOR_THEME.dot} 1px, transparent 1px)`,
                    backgroundSize: `${gridSpacing}px ${gridSpacing}px`,
                    backgroundPosition: `${position.x + SPINE_X * scale - gridSpacing / 2}px ${position.y + START_Y * scale - gridSpacing / 2}px`,
                  }
                : { backgroundImage: 'none' }
              : undefined
          }
          onDoubleClick={(event) => {
            if ((event.target as HTMLElement).classList?.contains('grafcet-canvas') || (event.target as SVGElement).tagName === 'svg') {
              resetView()
              notify('Diagrama ajustado à janela')
            }
          }}
          onDragOver={
            full
              ? (event) => {
                  if (event.dataTransfer.types.includes(GRAFCET_MIME)) {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'copy'
                    setDropActive(true)
                  }
                }
              : undefined
          }
          onDragLeave={
            full
              ? (event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropActive(false)
                }
              : undefined
          }
          onDrop={
            full
              ? (event) => {
                  event.preventDefault()
                  setDropActive(false)
                  const kind = event.dataTransfer.getData(GRAFCET_MIME) as PaletteItem
                  if (PALETTE.some((group) => group.items.some((item) => item.kind === kind)) && !paletteDisabled(kind)) {
                    // Elementos largados na tela ficam exatamente onde o rato os soltou (encaixados à grelha).
                    let at: { x: number; y: number } | undefined
                    if (kind === 'initial' || kind === 'step' || kind === 'transition' || kind === 'action' || kind === 'conditional') {
                      const rect = event.currentTarget.getBoundingClientRect()
                      let wx = (event.clientX - rect.left - position.x) / scale
                      let wy = (event.clientY - rect.top - position.y) / scale - STEP_H / 2
                      if (snapOn && !event.altKey) {
                        wx = snapToGrid(wx, SPINE_X)
                        wy = snapToGrid(wy, START_Y)
                      }
                      const clamped = clampPosition(wx, wy)
                      at = { x: Math.round(clamped.x), y: Math.round(clamped.y) }
                      if (zoom === null) setZoom(scale)
                      if (pan === null) setPan(position)
                    }
                    usePalette(kind, at)
                  }
                }
              : undefined
          }
          onWheel={onPreviewWheel}
          onContextMenu={onCanvasContextMenu}
          onPointerDown={onPreviewDown}
          onPointerMove={onPreviewMove}
          onPointerUp={onPreviewUp}
          onPointerCancel={onPreviewUp}
        >
          {/* Estado Vazio Amigável */}
          {!steps.length && (
            <div className="grafcet-empty">
              <span className="grafcet-empty-icon" aria-hidden="true"><IconSchematic size={26} /></span>
              <strong>Ainda não há etapas</strong>
              <p>{full ? 'Crie a primeira etapa ou parta de um modelo, de um exemplo ou de um ficheiro.' : 'Abra o editor para criar a primeira etapa.'}</p>
              {full && (
                <div className="grafcet-empty-actions">
                  <button className="dc-btn-primary dc-btn grafcet-empty-main" onClick={() => addStep()}>
                    <IconPlus size={14} />Criar etapa inicial
                  </button>
                  <button className="dc-btn" onClick={() => setTemplatesOpen(true)}>
                    <IconTemplates size={14} />Modelos industriais
                  </button>
                  <button className="dc-btn" onClick={() => setImportOpen(true)} title="Importar GRAFCET FluidSIM 4 (.ct), JSON ou .grafcet">
                    <IconImport size={14} />Importar GRAFCET
                  </button>
                  <button className="dc-btn grafcet-empty-wide" onClick={loadExample}>
                    <IconExample size={14} />Abrir exemplo de 3 etapas
                  </button>
                </div>
              )}
            </div>
          )}

          {/* SVG DO DIAGRAMA GRAFCET COM ESTILO NORMALIZADO IEC E DUPLA LINHA AND */}
          {!!steps.length && (
            <div
              className="grafcet-pan-layer"
              style={{ width, height, transform: `translate(${position.x}px, ${position.y}px) scale(${scale})` }}
            >
              <svg
                ref={svgRef}
                width={width}
                height={height}
                style={{ width, height, overflow: 'visible' }}
                viewBox={`0 0 ${width} ${height}`}
                fontFamily="Inter, Segoe UI, system-ui, -apple-system, sans-serif"
                role="img"
                aria-label="Etapas, ações e transições do GRAFCET"
              >
                <defs>
                  <marker id="grafcet-arrow" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                    <path d="M1 1 L7 4 L1 7" fill="none" stroke="#526883" strokeWidth="1.25" />
                  </marker>
                  <marker id="grafcet-arrow-active" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                    <path d="M1 1 L7 4 L1 7" fill="none" stroke="#16a34a" strokeWidth="1.25" />
                  </marker>
                </defs>

                {/* TRANSIÇÕES E LINHAS DE FLUXO */}
                {transitions.flatMap((transition, transitionIndex) => {
                  const sources = transition.from.filter((value) => steps.some((step) => step.id === value))
                  const targets = transition.to.filter((value) => steps.some((step) => step.id === value))
                  if (!sources.length || !targets.length) {
                    // ---- Transição SOLTA/parcial: barra livre na tela, arrastável,
                    // com stubs tracejados nos lados por ligar.
                    const fp = transXY(transition)
                    const ftx = fp.x
                    const fty = fp.y
                    transitionAnchors.set(transition.id, { x: ftx, y: fty })
                    const freeSelected = isTransitionSelected(transition.id)
                    const freeHovered = hoveredTransitionId === transition.id
                    const barColor = freeSelected ? '#2563eb' : freeHovered ? '#b45309' : '#d97706'
                    const armedFromThis = wireDraft?.start.kind === 'trans-out' && wireDraft.start.id === transition.id
                    const targetThis = wireHover?.kind === 'trans-in' && wireHover.id === transition.id
                    // Fios reais dos lados já ligados (curvas suaves até à barra).
                    const srcWires = sources.map((sid) => {
                      const sx = stepX(sid)
                      const sy = stepY(sid) + STEP_H
                      const my = (sy + fty) / 2
                      return (
                        <path
                          key={`fw-${sid}`}
                          d={routeVertical(sx, sy, ftx, fty - 7, my)}
                          fill="none"
                          stroke="#526883"
                          strokeWidth="2"
                        />
                      )
                    })
                    const dstWires = targets.map((sid) => {
                      const sx = stepX(sid)
                      const sy = stepY(sid)
                      const my = (sy + fty) / 2
                      return (
                        <path
                          key={`tw-${sid}`}
                          d={routeVertical(ftx, fty + 7, sx, sy - 2, my)}
                          fill="none"
                          stroke="#526883"
                          strokeWidth="2"
                          markerEnd="url(#grafcet-arrow)"
                        />
                      )
                    })
                    return (
                      <g
                        key={transition.id}
                        className={`${full ? 'grafcet-graph-link' : ''} grafcect-free ${freeSelected ? 'is-selected' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (full) {
                            setSelected(transition.id)
                            setSelectedActionId(null)
                            setTab('transitions')
                          }
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation()
                          setEditingTransition(transition)
                        }}
                        onPointerDown={(e) => onFreeTransPointerDown(transition, e)}
                        onPointerMove={(e) => onFreeTransPointerMove(transition, e)}
                        onPointerUp={(e) => onFreeTransPointerUp(transition, e)}
                        onPointerCancel={resetTransDrag}
                        onMouseEnter={() => hoverElement('transition', transition.id)}
                        onMouseLeave={() => hoverElement('transition', null)}
                        onFocus={() => {
                          setFocusedTransitionId(transition.id)
                          hoverElement('transition', transition.id)
                        }}
                        onBlur={() => {
                          setFocusedTransitionId(null)
                          hoverElement('transition', null)
                        }}
                        role={full ? 'button' : undefined}
                        tabIndex={full ? 0 : undefined}
                        aria-keyshortcuts="L"
                        aria-label={`Transição T${transitionIndex + 1} por ligar: ${transition.condition}. Arraste-a sobre uma etapa ou use Ligar, tecla L.`}
                      >
                        <title>{`Transição T${transitionIndex + 1} por ligar · arraste sobre uma etapa ou use a ferramenta Ligar [L]`}</title>
                        {/* halo de agarre generoso para rato e toque */}
                        <rect x={ftx - 42} y={fty - 34} width="84" height="68" fill="transparent" />

                        {srcWires}
                        {dstWires}

                        {/* Stub de origem por ligar (cima) com porto de entrada */}
                        {!sources.length && (
                          <>
                            <line x1={ftx} y1={fty - 30} x2={ftx} y2={fty - 8} stroke="#d97706" strokeWidth="2" strokeDasharray="4 4" />
                            <circle
                              cx={ftx}
                              cy={fty - 30}
                              r="5"
                              className={`grafcet-free-port ${targetThis ? 'is-hover' : ''}`}
                              fill={targetThis ? '#bbf7d0' : '#ffffff'}
                              stroke={targetThis ? '#16a34a' : '#d97706'}
                              strokeWidth="2.2"
                            />
                          </>
                        )}

                        {/* Stub de destino por ligar (baixo) com porto de saída */}
                        {!targets.length && (
                          <>
                            <line x1={ftx} y1={fty + 8} x2={ftx} y2={fty + 30} stroke="#d97706" strokeWidth="2" strokeDasharray="4 4" />
                            <circle
                              cx={ftx}
                              cy={fty + 30}
                              r="5"
                              className={`grafcet-free-port ${armedFromThis ? 'is-armed' : ''}`}
                              fill={armedFromThis ? '#2563eb' : '#ffffff'}
                              stroke={armedFromThis ? '#2563eb' : '#d97706'}
                              strokeWidth="2.2"
                            />
                          </>
                        )}

                        {/* Barra transversal IEC da transição */}
                        <line x1={ftx - 13} y1={fty} x2={ftx + 13} y2={fty} stroke={barColor} strokeWidth={freeSelected ? 4 : 3} />
                        {transition.branchType?.startsWith('and-') && (
                          <line x1={ftx - 18} y1={fty + (transition.branchType === 'and-divergence' ? 4 : -4)} x2={ftx + 18} y2={fty + (transition.branchType === 'and-divergence' ? 4 : -4)} stroke={barColor} strokeWidth="2.5" />
                        )}

                        {/* Identificador e condição normalizados IEC */}
                        <text x={ftx - 17} y={fty + 3.5} textAnchor="end" fill={freeSelected ? '#2563eb' : '#b45309'} fontSize="10.5" fontWeight="700">
                          {transition.name || `T${transitionIndex + 1}`}
                        </text>
                        <g transform={`translate(${ftx + 17}, ${fty + 4})`}>
                          <text fill={barColor} fontSize="12" fontWeight="600">
                            {diagramCondition(transition.condition)}
                          </text>
                        </g>

                        {full && (
                          <g className="grafcet-detached-status" pointerEvents="none">
                            <rect x={ftx - 34} y={fty - 51} width="68" height="15" rx="4" />
                            <text x={ftx} y={fty - 40} textAnchor="middle">POR LIGAR</text>
                          </g>
                        )}

                        {/* A dica surge apenas durante foco/hover para não competir com o diagrama. */}
                        {full && (freeHovered || freeSelected || focusedTransitionId === transition.id) && !wireDraft && (
                          <text className="grafcet-detached-hint" x={ftx} y={fty + 47} textAnchor="middle" pointerEvents="none">
                            arraste sobre etapa · Ligar [L]
                          </text>
                        )}

                        {/* Porto interativo na ferramenta Ligar: início de fio a partir desta transição */}
                        {full && activeTool === 'connect' && (
                          <g
                            className={`grafcet-port is-out ${armedFromThis ? 'is-armed' : ''}`}
                            onPointerDown={(e) => {
                              e.stopPropagation()
                              startWire({ kind: 'trans-out', id: transition.id }, e.clientX, e.clientY)
                            }}
                            role="button"
                            aria-label="Ligar destino da transição"
                          >
                            <circle cx={ftx} cy={fty + (targets.length ? 8 : 30)} r="13" fill="transparent" />
                            <circle cx={ftx} cy={fty + (targets.length ? 8 : 30)} r="5" fill={armedFromThis ? '#2563eb' : '#ffffff'} stroke="#2563eb" strokeWidth="2.2" />
                          </g>
                        )}

                        {/* Alvo interativo na ferramenta Ligar: recebe fio vindo de uma etapa (entrada) */}
                        {full && activeTool === 'connect' && wireDraft && wireDraft.start.kind === 'step-out' && wireDraft.start.id && (
                          <g
                            className={`grafcet-port is-in is-compatible ${targetThis ? 'is-hover' : ''}`}
                            style={{ pointerEvents: 'none' }}
                          >
                            <circle cx={ftx} cy={fty - (sources.length ? 8 : 30)} r="6.5" fill={targetThis ? '#bbf7d0' : 'rgba(255,255,255,0.75)'} stroke="#16a34a" strokeWidth="2" strokeDasharray={targetThis ? undefined : '3 3'} />
                          </g>
                        )}

                        {/* Eliminar */}
                        {full && (freeHovered || freeSelected) && (
                          <g
                            className="grafcet-node-handle is-delete"
                            onClick={(e) => {
                              e.stopPropagation()
                              removeTransition(transition.id)
                            }}
                            style={{ cursor: 'pointer' }}
                            role="button"
                            aria-label="Eliminar transição"
                          >
                            <circle cx={ftx - 21} cy={fty - 13} r="7.5" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
                            <path d={`M ${ftx - 23.5} ${fty - 15.5} L ${ftx - 18.5} ${fty - 10.5} M ${ftx - 18.5} ${fty - 15.5} L ${ftx - 23.5} ${fty - 10.5}`} stroke="#ffffff" strokeWidth="1.4" strokeLinecap="round" />
                          </g>
                        )}
                      </g>
                    )
                  }

                  const selfLoop = sources.length === 1 && targets.length === 1 && sources[0] === targets[0]
                  const isSingleSource = sources.length === 1
                  const isSingleTarget = targets.length === 1
                  const sourceStep = isSingleSource ? steps.find((s) => s.id === sources[0]) : null
                  const targetStep = isSingleTarget ? steps.find((s) => s.id === targets[0]) : null
                  const sourceIdx = sourceStep ? steps.indexOf(sourceStep) : -1
                  const targetIdx = targetStep ? steps.indexOf(targetStep) : -1

                  const sourceX = sourceStep ? stepX(sourceStep.id) : SPINE_X
                  const targetX = targetStep ? stepX(targetStep.id) : SPINE_X
                  // Com etapas movidas à mão, a ligação segue a geometria (e não só a ordem da lista).
                  const manualLink = isPinned(sourceStep ?? undefined) || isPinned(targetStep ?? undefined) || dragPos?.id === sourceStep?.id || dragPos?.id === targetStep?.id
                  const isForward = !!sourceStep && !!targetStep && stepY(targetStep.id) >= stepY(sourceStep.id) + STEP_H + 24
                  const isConsecutive =
                    isSingleSource && isSingleTarget && sourceStep && targetStep && !selfLoop && (manualLink ? isForward && clearPath(sourceStep, targetStep) : targetIdx === sourceIdx + 1)
                  const isReturning =
                    isSingleSource && isSingleTarget && sourceStep && targetStep && !selfLoop && !isConsecutive && (manualLink ? !isForward : stepY(targetStep.id) <= stepY(sourceStep.id))

                  const conditionOn = transitionReceptivity(program, runtime, table, transition)
                  const enabled = running && conditionOn && sources.every((value) => runtime.active.includes(value))
                  const selectedLink = isTransitionSelected(transition.id)
                  const linkColor = selectedLink ? '#2563eb' : enabled ? '#16a34a' : running && conditionOn ? '#d97706' : '#526883'
                  const isTransHovered = hoveredTransitionId === transition.id

                  const onSelectThisTransition = (e: React.MouseEvent) => {
                    e.stopPropagation()
                    if (suppressClickRef.current) { suppressClickRef.current = false; return }
                    if (full) {
                      setSelected(transition.id)
                      setSelectedActionId(null)
                      setTab('transitions')
                      if (running && sources.every((value) => runtime.active.includes(value))) {
                        useSimStore.getState().fireGrafcetTransition(transition.id)
                        notify(`Transição T${transitionIndex + 1} disparada`)
                      }
                    }
                  }

                  const onTransDoubleClick = (e: React.MouseEvent) => {
                    e.stopPropagation()
                    setEditingTransition(transition)
                  }

                  // 1. Auto-loopback (etapa para si mesma)
                  if (selfLoop) {
                    const y = stepY(sources[0])
                    const path = `M 151 ${y + 54} V ${y + 92} H 62 V ${y - 22} H 151 V ${y}`
                    const loopShift = stepX(sources[0]) - SPINE_X
                    transitionAnchors.set(transition.id, { x: 62 + loopShift, y: y + 83 })
                    return (
                      <g
                        key={transition.id}
                        transform={loopShift ? `translate(${loopShift}, 0)` : undefined}
                        onClick={onSelectThisTransition}
                        onDoubleClick={onTransDoubleClick}
                        onMouseEnter={() => hoverElement('transition', transition.id)}
                        onMouseLeave={() => hoverElement('transition', null)}
                        className={`${full ? 'grafcet-graph-link' : ''} ${selectedLink ? 'is-selected' : ''}`}
                        role={full ? 'button' : undefined}
                        tabIndex={full ? 0 : undefined}
                        aria-label={`Transição T${transitionIndex + 1}: ${transition.condition}`}
                      >
                        <path d={path} fill="none" stroke={linkColor} strokeWidth={enabled || selectedLink ? 2 : 1.5} markerEnd={enabled ? 'url(#grafcet-arrow-active)' : 'url(#grafcet-arrow)'} />
                        <path d={path} fill="none" stroke="transparent" strokeWidth="16" />
                        <line x1="50" y1={y + 83} x2="74" y2={y + 83} stroke={linkColor} strokeWidth={selectedLink || enabled ? 4 : 3} />
                        <text x="80" y={y + 86} fill={linkColor} fontSize="12" fontWeight="600">
                          {diagramCondition(transition.condition)}
                        </text>
                        {full && (isTransHovered || selectedLink) && (
                          <g
                            className="grafcet-node-handle is-delete"
                            onClick={(e) => {
                              e.stopPropagation()
                              removeTransition(transition.id)
                            }}
                            style={{ cursor: 'pointer' }}
                            role="button"
                            aria-label="Eliminar transição"
                          >
                            <circle cx="62" cy={y - 12} r="7.5" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
                            <path d={`M 59.5 ${y - 14.5} L 64.5 ${y - 9.5} M 64.5 ${y - 14.5} L 59.5 ${y - 9.5}`} stroke="#ffffff" strokeWidth="1.4" strokeLinecap="round" />
                          </g>
                        )}
                      </g>
                    )
                  }

                  // 1bis. Ligação por referência (sem linha, IEC 60848): a barra fica junto à
                  // primeira origem e cada ponta indica o número da etapa do outro lado.
                  if (transition.wireless) {
                    const refOf = (stepId: string) => {
                      const target = stepById.get(stepId)
                      return target ? `X${getStepDisplayInfo(target, steps.indexOf(target)).stepNumber}` : 'X?'
                    }
                    const refX = stepX(sources[0])
                    const refTop = stepY(sources[0]) + 54
                    const refBarY = refTop + 34
                    transitionAnchors.set(transition.id, { x: refX, y: refBarY })
                    const outRefs = targets.map(refOf).join(' ')
                    const inRefs = sources.map(refOf).join(' ')
                    return (
                      <g
                        key={transition.id}
                        onClick={onSelectThisTransition}
                        onDoubleClick={onTransDoubleClick}
                        onMouseEnter={() => hoverElement('transition', transition.id)}
                        onMouseLeave={() => hoverElement('transition', null)}
                        className={`${full ? 'grafcet-graph-link' : ''} ${selectedLink ? 'is-selected' : ''}`}
                        role={full ? 'button' : undefined}
                        tabIndex={full ? 0 : undefined}
                        aria-label={`Transição T${transitionIndex + 1} (por referência, sem linha): ${transition.condition}`}
                      >
                        <path d={`M ${refX} ${refTop} V ${refBarY}`} fill="none" stroke={linkColor} strokeWidth={enabled || selectedLink ? 2 : 1.5} />
                        <path d={`M ${refX} ${refBarY} V ${refBarY + 24}`} fill="none" stroke={linkColor} strokeWidth={enabled || selectedLink ? 2 : 1.5} markerEnd={enabled ? 'url(#grafcet-arrow-active)' : 'url(#grafcet-arrow)'} />
                        <line x1={refX - 14} y1={refBarY} x2={refX + 14} y2={refBarY} stroke={linkColor} strokeWidth={selectedLink || enabled ? 4 : 3} />
                        <text x={refX - 18} y={refBarY + 3} textAnchor="end" fill={selectedLink ? '#2563eb' : enabled ? '#16a34a' : '#64748b'} fontSize="10.5" fontWeight="700">
                          {transition.name || `T${transitionIndex + 1}`}
                        </text>
                        <g transform={`translate(${refX + 18}, ${refBarY + 4})`}>
                          <text fill={linkColor} fontSize="12" fontWeight={enabled ? '700' : '600'}>
                            {diagramCondition(transition.condition)}
                          </text>
                        </g>
                        <text x={refX + 10} y={refBarY + 20} fill={selectedLink ? '#2563eb' : '#64748b'} fontSize="10.5" fontWeight="600">
                          {`→ ${outRefs}`}
                        </text>
                        {/* Origens adicionais: seta curta com a referência dos destinos */}
                        {sources.slice(1).map((sid) => {
                          const x = stepX(sid)
                          const y = stepY(sid) + 54
                          return (
                            <g key={`ref-src-${sid}`}>
                              <path d={`M ${x} ${y} V ${y + 24}`} fill="none" stroke={linkColor} strokeWidth="1.5" markerEnd="url(#grafcet-arrow)" />
                              <text x={x + 10} y={y + 18} fill="#64748b" fontSize="10.5" fontWeight="600">{`→ ${outRefs}`}</text>
                            </g>
                          )
                        })}
                        {/* Destinos: referência acima da etapa, seta a entrar por cima */}
                        {targets.map((tid) => {
                          const x = stepX(tid)
                          const y = stepY(tid)
                          return (
                            <g key={`ref-dst-${tid}`}>
                              <path d={`M ${x} ${y - 28} V ${y - 3}`} fill="none" stroke={linkColor} strokeWidth="1.5" markerEnd={enabled ? 'url(#grafcet-arrow-active)' : 'url(#grafcet-arrow)'} />
                              <text x={x + 10} y={y - 14} fill="#64748b" fontSize="10.5" fontWeight="600">{`${inRefs} →`}</text>
                            </g>
                          )
                        })}
                        {enabled && <circle cx={refX} cy={refBarY} r="7" fill="none" stroke="#22c55e" strokeWidth="2" />}
                        {full && (isTransHovered || selectedLink) && (
                          <>
                            <g
                              className="grafcet-node-handle"
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingTransition(transition)
                              }}
                              style={{ cursor: 'pointer' }}
                              role="button"
                              aria-label="Configurar transição"
                            >
                              <circle cx={refX + 11} cy={refBarY - 13} r="7" fill="#2563eb" stroke="#ffffff" strokeWidth="1.5" />
                              <path d={`M ${refX + 9} ${refBarY - 11} L ${refX + 13} ${refBarY - 15}`} stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
                            </g>
                            {transitions.length > 1 && (
                              <g
                                className="grafcet-node-handle is-delete"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  removeTransition(transition.id)
                                }}
                                style={{ cursor: 'pointer' }}
                                role="button"
                                aria-label="Eliminar transição"
                              >
                                <circle cx={refX - 18} cy={refBarY - 12} r="7.5" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
                                <path d={`M ${refX - 20.5} ${refBarY - 14.5} L ${refX - 15.5} ${refBarY - 9.5} M ${refX - 15.5} ${refBarY - 14.5} L ${refX - 20.5} ${refBarY - 9.5}`} stroke="#ffffff" strokeWidth="1.4" strokeLinecap="round" />
                              </g>
                            )}
                          </>
                        )}
                      </g>
                    )
                  }

                  // 2. Transição direta consecutiva IEC (fluxo vertical direto na espinha x = 151)
                  if (isConsecutive && sourceStep && targetStep) {
                    const sY = stepY(sourceStep.id)
                    const tY = stepY(targetStep.id)
                    const sBottom = sY + 54
                    const tTop = tY
                    const bent = sourceX !== targetX
                    // Seleção OU (IEC 60848): vários ramos alternativos partilham uma só linha horizontal;
                    // na divergência a transição fica em cada ramo logo abaixo dessa linha, na convergência fica
                    // em cada ramo antes de a linha se juntar.
                    const orDivergent = transitions.some((o) => o.id !== transition.id && !o.wireless && o.from.length === 1 && o.from[0] === sourceStep.id && o.to.length === 1 && o.to[0] !== targetStep.id)
                    const orConvergent = !orDivergent && transitions.some((o) => o.id !== transition.id && !o.wireless && o.to.length === 1 && o.to[0] === targetStep.id && o.from.length === 1 && o.from[0] !== sourceStep.id)
                    const roomForOr = tTop - sBottom >= 70
                    const midY = roomForOr && orDivergent ? sBottom + 26 : roomForOr && orConvergent ? tTop - 26 : Math.round((sBottom + tTop) / 2)
                    // Pontos de quebra (duplo clique na linha): o percurso passa por eles, com ângulos retos.
                    const bends = bendsOf(transition.id)
                    const linkPoints: Point[] = [{ x: sourceX, y: sBottom }, ...bends, { x: targetX, y: tTop }]
                    const linkPath = bends.length ? routeThrough(linkPoints) : routeVertical(sourceX, sBottom, targetX, tTop, midY)
                    const barMid = bends.length ? polylineMidpoint(linkPoints) : null
                    // Se as etapas não estão alinhadas, a ligação faz um "Z" e a barra fica no troço final.
                    const barOnFirstLeg = !barMid && roomForOr && orConvergent
                    const tx = barMid?.x ?? (barOnFirstLeg ? sourceX : targetX)
                    const ty = barMid?.y ?? (barOnFirstLeg ? Math.round((sBottom + midY) / 2) : bent || (roomForOr && orDivergent) ? Math.round((midY + tTop) / 2) : midY)
                    transitionAnchors.set(transition.id, { x: tx, y: ty })

                    return (
                      <g
                        key={transition.id}
                        onClick={onSelectThisTransition}
                        onDoubleClick={onTransDoubleClick}
                        onMouseEnter={() => hoverElement('transition', transition.id)}
                        onMouseLeave={() => hoverElement('transition', null)}
                        className={`${full ? 'grafcet-graph-link' : ''} ${selectedLink ? 'is-selected' : ''}`}
                        role={full ? 'button' : undefined}
                        tabIndex={full ? 0 : undefined}
                        aria-label={`Transição T${transitionIndex + 1}: ${transition.condition}${enabled ? ' (Receptiva - clique para disparar)' : ''}`}
                      >
                        {/* Linha vertical central IEC até à etapa seguinte com seta */}
                        <path
                          d={linkPath}
                          fill="none"
                          stroke={linkColor}
                          strokeWidth={enabled || selectedLink ? 2 : 1.5}
                          markerEnd={enabled ? 'url(#grafcet-arrow-active)' : 'url(#grafcet-arrow)'}
                        />
                        <path
                          d={linkPath}
                          fill="none"
                          stroke="transparent"
                          strokeWidth="18"
                          onDoubleClick={(e) => addLinkBend(transition.id, linkPoints, e)}
                          onPointerDown={(e) => startSegmentDrag(transition.id, bends.length ? linkPoints : bent ? [{ x: sourceX, y: sBottom }, { x: sourceX, y: midY }, { x: targetX, y: midY }, { x: targetX, y: tTop }] : linkPoints, e)}
                          onPointerMove={(e) => moveSegment(transition.id, e)}
                          onPointerUp={(e) => finishSegment(transition.id, e)}
                          onPointerCancel={cancelBendDrag}
                          className="grafcet-editable-segment"
                          style={{ cursor: 'grab', touchAction: 'none' }}
                        >
                          <title>Arraste a linha para criar uma dobra · duplo clique adiciona um nó</title>
                        </path>

                        {/* Barra transversal normalizada IEC 60848 */}
                        <line
                          x1={tx - 14}
                          y1={ty}
                          x2={tx + 14}
                          y2={ty}
                          stroke={linkColor}
                          strokeWidth={selectedLink || enabled ? 4 : 3}
                        />

                        {/* Identificador numérico da transição à esquerda normalizado IEC */}
                        <text
                          x={tx - 18}
                          y={ty + 3}
                          textAnchor="end"
                          fill={selectedLink ? '#2563eb' : enabled ? '#16a34a' : '#64748b'}
                          fontSize="10.5"
                          fontWeight="700"
                        >
                          {transition.name || `T${transitionIndex + 1}`}
                        </text>

                        {/* Texto da condição formatada com suporte a barra superior / NOT */}
                        <g transform={`translate(${tx + 18}, ${ty + 4})`}>
                          <text fill={linkColor} fontSize="12" fontWeight={enabled ? '700' : '600'}>
                            {diagramCondition(transition.condition)}
                          </text>
                        </g>

                        {/* Indicador pulsante quando receptiva (pronta a disparar) */}
                        {enabled && (
                          <g>
                            <circle cx={tx} cy={ty} r="7" fill="none" stroke="#22c55e" strokeWidth="2">
                            </circle>
                          </g>
                        )}

                        {/* Manipuladores rápidos estilo grafcet.io para a transição selecionada ou em hover */}
                        {full && (isTransHovered || selectedLink) && (
                          <>
                            <g
                              className="grafcet-node-handle grafcet-link-drag-handle"
                              onPointerDown={(e) => startQuickWire({ kind: 'trans-out', id: transition.id }, e)}
                              onClick={(e) => e.stopPropagation()}
                              style={{ cursor: 'crosshair', touchAction: 'none' }}
                              role="button"
                              aria-label="Arrastar até uma etapa para ligar o destino desta transição"
                            >
                              <title>Arrastar até uma etapa para ligar o destino desta transição</title>
                              <circle cx={tx + 24} cy={ty + 18} r="8" fill="#16a34a" stroke="#ffffff" strokeWidth="1.5" />
                              <path d={`M ${tx + 24 - 4} ${ty + 18} H ${tx + 24 + 3} M ${tx + 24} ${ty + 18 - 3.5} L ${tx + 24 + 3.5} ${ty + 18} L ${tx + 24} ${ty + 18 + 3.5}`} fill="none" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </g>
                            {/* Botão + para inserir etapa seguinte */}
                            <g
                              className="grafcet-node-handle"
                              onClick={(e) => {
                                e.stopPropagation()
                                addConnectedStep(sourceStep)
                              }}
                              style={{ cursor: 'pointer' }}
                              role="button"
                              aria-label="Inserir etapa após esta transição"
                            >
                              <circle cx={tx} cy={ty + 18} r="8.5" fill="#2563eb" stroke="#ffffff" strokeWidth="1.5" />
                              <path d={`M ${tx} ${ty + 14} V ${ty + 22} M ${tx - 4} ${ty + 18} H ${tx + 4}`} stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
                            </g>

                            {/* Botão ✎ para abrir diálogo da transição */}
                            <g
                              className="grafcet-node-handle"
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingTransition(transition)
                              }}
                              style={{ cursor: 'pointer' }}
                              role="button"
                              aria-label="Configurar transição"
                            >
                              <circle cx={tx + 11} cy={ty - 13} r="7" fill="#2563eb" stroke="#ffffff" strokeWidth="1.5" />
                              <path d={`M ${tx + 9} ${ty - 11} L ${tx + 13} ${ty - 15}`} stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
                            </g>

                            {transitions.length > 1 && (
                              <g
                                className="grafcet-node-handle is-delete"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  removeTransition(transition.id)
                                }}
                                style={{ cursor: 'pointer' }}
                                role="button"
                                aria-label="Eliminar transição"
                              >
                                <circle cx={tx - 18} cy={ty - 12} r="7.5" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" filter="drop-shadow(0 1px 3px rgba(0,0,0,0.25))" />
                                <path d={`M ${tx - 20.5} ${ty - 14.5} L ${tx - 15.5} ${ty - 9.5} M ${tx - 15.5} ${ty - 14.5} L ${tx - 20.5} ${ty - 9.5}`} stroke="#ffffff" strokeWidth="1.4" strokeLinecap="round" />
                              </g>
                            )}
                          </>
                        )}
                        {/* Pontos de quebra da linha (criados por duplo clique) */}
                        {full && (isTransHovered || selectedLink) && renderBendHandles(transition.id, linkColor)}
                      </g>
                    )
                  }

                  // 3. Retorno / Loopback para etapa anterior (ex: da última para a inicial)
                  if (isReturning && sourceStep && targetStep) {
                    const sY = stepY(sourceStep.id)
                    const tY = stepY(targetStep.id)
                    const sBottom = sY + 54
                    const tTop = tY
                    const trackX = Math.min(sourceX, targetX) - 97 - (transitionIndex % 3) * 16
                    // Pontos de quebra (duplo clique na linha): o percurso passa por eles, com ângulos retos.
                    const bends = bendsOf(transition.id)
                    const autoReturnPoints: Point[] = [
                      { x: sourceX, y: sBottom },
                      { x: sourceX, y: sBottom + 48 },
                      { x: trackX, y: sBottom + 48 },
                      { x: trackX, y: tTop - 24 },
                      { x: targetX, y: tTop - 24 },
                      { x: targetX, y: tTop },
                    ]
                    // Usa o trilho automático como geometria inicial da edição. Ao arrastar uma perna,
                    // preserva os restantes cotovelos em vez de colapsar o retorno numa ligação direta.
                    const linkPoints: Point[] = bends.length
                      ? [{ x: sourceX, y: sBottom }, ...bends, { x: targetX, y: tTop }]
                      : autoReturnPoints
                    const returnPath = routeThrough(linkPoints)
                    // IEC 60848 / FluidSIM: a transição de um retorno fica logo abaixo da etapa de origem.
                    // Com cotovelos, mantém-se aí enquanto a primeira perna descer a direito da etapa.
                    const firstLegDown = bends.length > 0 && bends[0].x === sourceX && bends[0].y >= sBottom + 36
                    const barMid = bends.length && !firstLegDown ? polylineMidpoint(linkPoints) : null
                    const tx = barMid?.x ?? sourceX
                    const ty = barMid?.y ?? sBottom + 24
                    // Seta de subida no troço vertical ascendente mais longo (o «barramento» do retorno).
                    const upLeg = linkPoints.slice(1).map((p, i) => ({ a: linkPoints[i], b: p }))
                      .filter(({ a, b }) => a.x === b.x && b.y < a.y - 40)
                      .sort((m, n) => (m.a.y - m.b.y) - (n.a.y - n.b.y)).pop()
                    transitionAnchors.set(transition.id, { x: tx, y: ty })
                    const delX = bends.length ? tx - 18 : trackX
                    const delY = bends.length ? ty - 12 : (sBottom + tTop) / 2 - 16
                    const arrowAt = bends.length ? (upLeg ? { x: upLeg.a.x, y: (upLeg.a.y + upLeg.b.y) / 2 } : null) : { x: trackX, y: (sBottom + tTop) / 2 }

                    return (
                      <g
                        key={transition.id}
                        onClick={onSelectThisTransition}
                        onDoubleClick={onTransDoubleClick}
                        onMouseEnter={() => hoverElement('transition', transition.id)}
                        onMouseLeave={() => hoverElement('transition', null)}
                        className={`${full ? 'grafcet-graph-link' : ''} ${selectedLink ? 'is-selected' : ''}`}
                        role={full ? 'button' : undefined}
                        tabIndex={full ? 0 : undefined}
                        aria-label={`Transição T${transitionIndex + 1}: ${transition.condition}`}
                      >
                        {/* Linha de retorno: desce do fundo, vai à esquerda pelo barramento, sobe e entra pelo topo */}
                        <path
                          d={returnPath}
                          fill="none"
                          stroke={linkColor}
                          strokeWidth={enabled || selectedLink ? 2 : 1.5}
                          markerEnd={enabled ? 'url(#grafcet-arrow-active)' : 'url(#grafcet-arrow)'}
                        />
                        <path
                          d={returnPath}
                          fill="none"
                          stroke="transparent"
                          strokeWidth="18"
                          onDoubleClick={(e) => addLinkBend(transition.id, linkPoints, e)}
                          onPointerDown={(e) => startSegmentDrag(transition.id, linkPoints, e)}
                          onPointerMove={(e) => moveSegment(transition.id, e)}
                          onPointerUp={(e) => finishSegment(transition.id, e)}
                          onPointerCancel={cancelBendDrag}
                          className="grafcet-editable-segment"
                          style={{ cursor: 'grab', touchAction: 'none' }}
                        >
                          <title>Arraste a linha para criar uma dobra · duplo clique adiciona um nó</title>
                        </path>

                        {/* Seta direcional subindo no barramento à esquerda (só no traçado automático) */}
                        {arrowAt && (
                          <path
                            d={`M ${arrowAt.x - 4} ${arrowAt.y + 5} L ${arrowAt.x} ${arrowAt.y - 2} L ${arrowAt.x + 4} ${arrowAt.y + 5}`}
                            fill="none"
                            stroke={linkColor}
                            strokeWidth="2"
                          />
                        )}

                        {/* Barra transversal da transição */}
                        <line
                          x1={tx - 14}
                          y1={ty}
                          x2={tx + 14}
                          y2={ty}
                          stroke={linkColor}
                          strokeWidth={selectedLink || enabled ? 4 : 3}
                        />

                        {/* Identificador da transição à esquerda */}
                        <text
                          x={tx - 18}
                          y={ty + 3}
                          textAnchor="end"
                          fill={selectedLink ? '#2563eb' : enabled ? '#16a34a' : '#64748b'}
                          fontSize="10.5"
                          fontWeight="700"
                        >
                          {transition.name || `T${transitionIndex + 1}`}
                        </text>

                        {/* Texto da condição formatada */}
                        <g transform={`translate(${tx + 18}, ${ty + 4})`}>
                          <text fill={linkColor} fontSize="12" fontWeight={enabled ? '700' : '600'}>
                            {diagramCondition(transition.condition)}
                          </text>
                        </g>

                        {/* Indicador pulsante quando receptiva */}
                        {enabled && (
                          <g>
                            <circle cx={tx} cy={ty} r="7" fill="none" stroke="#22c55e" strokeWidth="2">
                            </circle>
                          </g>
                        )}

                        {/* Manipulador rápido de eliminação */}
                        {full && (isTransHovered || selectedLink) && (
                          <g
                            className="grafcet-node-handle is-delete"
                            onClick={(e) => {
                              e.stopPropagation()
                              removeTransition(transition.id)
                            }}
                            style={{ cursor: 'pointer' }}
                            role="button"
                            aria-label="Eliminar transição"
                          >
                            <circle cx={delX} cy={delY} r="7.5" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
                            <path d={`M ${delX - 2.5} ${delY - 2.5} L ${delX + 2.5} ${delY + 2.5} M ${delX + 2.5} ${delY - 2.5} L ${delX - 2.5} ${delY + 2.5}`} stroke="#ffffff" strokeWidth="1.4" strokeLinecap="round" />
                          </g>
                        )}
                        {/* Pontos de quebra da linha (criados por duplo clique) */}
                        {full && (isTransHovered || selectedLink) && renderBendHandles(transition.id, linkColor)}
                      </g>
                    )
                  }

                  // 4. Caso geral: divergências, convergências e saltos entre múltiplos ramos
                  const avgSourceY = sources.reduce((sum, value) => sum + stepY(value), 0) / sources.length
                  const avgTargetY = targets.reduce((sum, value) => sum + stepY(value), 0) / targets.length
                  const returning = Math.min(...targets.map(stepY)) <= Math.max(...sources.map(stepY))
                  const allX = [...sources, ...targets].map(stepX)
                  const hasAndConvergence = sources.length > 1
                  const hasAndDivergence = targets.length > 1
                  // IEC 60848: divergência/convergência AND = barra dupla horizontal sobre os ramos
                  // (a transição fica na linha única: acima da barra na divergência, abaixo na convergência).
                  const STEP_BOTTOM = 54
                  const iecFork = !returning && sources.length === 1 && targets.length > 1 && Math.min(...targets.map(stepY)) >= stepY(sources[0]) + STEP_BOTTOM + 44
                  const iecJoin = !returning && targets.length === 1 && sources.length > 1 && stepY(targets[0]) >= Math.max(...sources.map(stepY)) + STEP_BOTTOM + 44
                  const iec = iecFork || iecJoin
                  const iecBarY = iecFork
                    ? Math.round(Math.min(...targets.map(stepY)) - 26)
                    : Math.round(Math.max(...sources.map(stepY)) + STEP_BOTTOM + 26)
                  const iecBarX1 = Math.min(...allX) - 24
                  const iecBarX2 = Math.max(...allX) + 24
                  const ty = iec
                    ? (iecFork
                      ? Math.round((stepY(sources[0]) + STEP_BOTTOM + iecBarY) / 2)
                      : Math.round((iecBarY + 4 + stepY(targets[0])) / 2))
                    : Math.max(42, Math.min(height - 45, (avgSourceY + avgTargetY) / 2))
                  const tx = iec
                    ? (iecFork ? stepX(sources[0]) : stepX(targets[0]))
                    : returning ? Math.min(...allX) - 91 - (transitionIndex % 3) * 16 : Math.max(...allX) + 129 + (transitionIndex % 3) * 24
                  transitionAnchors.set(transition.id, { x: tx, y: ty })

                  return (
                    <g
                      key={transition.id}
                      onClick={onSelectThisTransition}
                      onDoubleClick={onTransDoubleClick}
                      onMouseEnter={() => hoverElement('transition', transition.id)}
                      onMouseLeave={() => hoverElement('transition', null)}
                      className={`${full ? 'grafcet-graph-link' : ''} ${selectedLink ? 'is-selected' : ''}`}
                      role={full ? 'button' : undefined}
                      tabIndex={full ? 0 : undefined}
                      aria-label={`Transição T${transitionIndex + 1}: ${transition.condition}`}
                    >
                      {iec ? (
                        <>
                          {/* Origens descem até à barra dupla (na divergência, é uma só linha com a transição) */}
                          {sources.map((value) => (
                            <path key={`f-${value}`} d={`M ${stepX(value)} ${stepY(value) + STEP_BOTTOM} V ${iecBarY}`} fill="none" stroke={linkColor} strokeWidth={enabled ? 2 : 1.5} />
                          ))}
                          {/* Da barra dupla descem os destinos (na convergência, é uma só linha com a transição) */}
                          {targets.map((value) => (
                            <path
                              key={`t-${value}`}
                              d={`M ${stepX(value)} ${iecBarY + 4} V ${stepY(value) - 1}`}
                              fill="none"
                              stroke={linkColor}
                              strokeWidth={enabled ? 2 : 1.5}
                              markerEnd={enabled ? 'url(#grafcet-arrow-active)' : 'url(#grafcet-arrow)'}
                            />
                          ))}
                          <line x1={iecBarX1} y1={iecBarY} x2={iecBarX2} y2={iecBarY} stroke={linkColor} strokeWidth="2.5" />
                          <line x1={iecBarX1} y1={iecBarY + 4} x2={iecBarX2} y2={iecBarY + 4} stroke={linkColor} strokeWidth="2.5" />
                          <line x1={iecBarX1} y1={iecBarY + 2} x2={iecBarX2} y2={iecBarY + 2} stroke="transparent" strokeWidth="16" />
                          {/* Barra da transição na linha única */}
                          <line x1={tx - 14} y1={ty} x2={tx + 14} y2={ty} stroke={linkColor} strokeWidth={selectedLink || enabled ? 4 : 3} />
                          <text x={tx - 18} y={ty + 3.5} textAnchor="end" fill={selectedLink ? '#2563eb' : enabled ? '#16a34a' : '#64748b'} fontSize="10.5" fontWeight="700">
                            {transition.name || `T${transitionIndex + 1}`}
                          </text>
                          <g transform={`translate(${tx + 18}, ${ty + 4})`}>
                            <text fill={linkColor} fontSize="12" fontWeight={enabled ? '700' : '600'}>
                              {diagramCondition(transition.condition)}
                            </text>
                          </g>
                          {enabled && (
                            <circle cx={tx} cy={ty} r="7" fill="none" stroke="#22c55e" strokeWidth="2">
                            </circle>
                          )}
                        </>
                      ) : (
                        <>
                      {/* Linhas das origens */}
                      {sources.map((value) => (
                        <path
                          key={`f-${value}`}
                          d={`M ${stepX(value) + 31} ${stepY(value) + 27} H ${tx} V ${ty}`}
                          fill="none"
                          stroke={linkColor}
                          strokeWidth={enabled ? 2 : 1.5}
                        />
                      ))}

                      {/* Linhas para os destinos */}
                      {targets.map((value) => (
                        <path
                          key={`t-${value}`}
                          d={`M ${tx} ${ty} V ${stepY(value)} H ${stepX(value)}`}
                          fill="none"
                          stroke={linkColor}
                          strokeWidth={enabled ? 2 : 1.5}
                          markerEnd={enabled ? 'url(#grafcet-arrow-active)' : 'url(#grafcet-arrow)'}
                        />
                      ))}

                      {/* Barra transversal da transição */}
                      <line x1={tx - 12} y1={ty} x2={tx + 12} y2={ty} stroke={linkColor} strokeWidth={selectedLink || enabled ? 4 : 3} />

                      {/* Barra dupla normalizada IEC se houver convergência ou divergência AND */}
                      {hasAndConvergence && (
                        <line x1={tx - 18} y1={ty - 4} x2={tx + 18} y2={ty - 4} stroke={linkColor} strokeWidth="2.5" />
                      )}
                      {hasAndDivergence && (
                        <line x1={tx - 18} y1={ty + 4} x2={tx + 18} y2={ty + 4} stroke={linkColor} strokeWidth="2.5" />
                      )}

                      {/* Identificador da transição à esquerda */}
                      <text
                        x={tx - (hasAndConvergence || hasAndDivergence ? 22 : 16)}
                        y={ty + 3.5}
                        textAnchor="end"
                        fill={selectedLink ? '#2563eb' : enabled ? '#16a34a' : '#64748b'}
                        fontSize="10.5"
                        fontWeight="700"
                      >
                        {transition.name || `T${transitionIndex + 1}`}
                      </text>

                      {/* Texto da condição formatada com suporte a barra superior (overbar) */}
                      <g transform={`translate(${tx + 16}, ${ty + 4})`}>
                        <text fill={linkColor} fontSize="12" fontWeight={enabled ? '700' : '600'}>
                          {diagramCondition(transition.condition)}
                        </text>
                      </g>

                      {(hasAndConvergence || hasAndDivergence) && (
                        <text x={tx - 26} y={ty - 7} fill="#c2410c" fontSize="9" fontWeight="700">
                          AND
                        </text>
                      )}

                        </>
                      )}

                      {/* Manipulador rápido estilo grafcet.io: Inserir etapa após transição e eliminar transição */}
                      {full && (isTransHovered || selectedLink) && (
                        <>
                          <g
                            className="grafcet-node-handle grafcet-link-drag-handle"
                            onPointerDown={(e) => startQuickWire({ kind: 'trans-out', id: transition.id }, e)}
                            onClick={(e) => e.stopPropagation()}
                            style={{ cursor: 'crosshair', touchAction: 'none' }}
                            role="button"
                            aria-label="Arrastar até uma etapa para ligar o destino desta transição"
                          >
                            <title>Arrastar até uma etapa para ligar o destino desta transição</title>
                            <circle cx={tx + 24} cy={ty + 18} r="8" fill="#16a34a" stroke="#ffffff" strokeWidth="1.5" />
                            <path d={`M ${tx + 20} ${ty + 18} H ${tx + 27} M ${tx + 24} ${ty + 14.5} L ${tx + 27.5} ${ty + 18} L ${tx + 24} ${ty + 21.5}`} fill="none" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </g>
                          <g
                            className="grafcet-node-handle"
                            onClick={(e) => {
                              e.stopPropagation()
                              const sourceStep = steps.find((s) => transition.from.includes(s.id))
                              if (sourceStep) {
                                addConnectedStep(sourceStep)
                              } else {
                                addConnectedStep()
                              }
                            }}
                            style={{ cursor: 'pointer' }}
                            role="button"
                            aria-label="Inserir etapa após esta transição"
                          >
                            <circle cx={tx} cy={ty + 18} r="8.5" fill="#2563eb" stroke="#ffffff" strokeWidth="1.5" />
                            <path d={`M ${tx} ${ty + 14} V ${ty + 22} M ${tx - 4} ${ty + 18} H ${tx + 4}`} stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
                          </g>

                          {transitions.length > 1 && (
                            <g
                              className="grafcet-node-handle is-delete"
                              onClick={(e) => {
                                e.stopPropagation()
                                removeTransition(transition.id)
                              }}
                              style={{ cursor: 'pointer' }}
                              role="button"
                              aria-label="Eliminar transição"
                            >
                              <circle cx={tx - 18} cy={ty - 12} r="7.5" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" filter="drop-shadow(0 1px 3px rgba(0,0,0,0.25))" />
                              <path d={`M ${tx - 20.5} ${ty - 14.5} L ${tx - 15.5} ${ty - 9.5} M ${tx - 15.5} ${ty - 14.5} L ${tx - 20.5} ${ty - 9.5}`} stroke="#ffffff" strokeWidth="1.4" strokeLinecap="round" />
                            </g>
                          )}
                        </>
                      )}
                    </g>
                  )
                })}

                {/* COMENTÁRIOS / LEGENDAS (ex.: títulos importados do FluidSIM) */}
                {comments.map((comment) => (
                  <text
                    key={comment.id}
                    className="grafcet-comment"
                    x={comment.x}
                    y={comment.y + (comment.fontSize ?? 13)}
                    fontSize={comment.fontSize ?? 13}
                    fontWeight={comment.fontWeight ?? 600}
                    fill="#334155"
                    style={{ pointerEvents: 'auto', userSelect: 'none', cursor: 'pointer' }}
                    onDoubleClick={(event) => {
                      event.stopPropagation()
                      const text = window.prompt('Editar comentário:', comment.text)?.trim()
                      if (text) save({ comments: allComments.map((item) => item.id === comment.id ? { ...item, text } : item) }, 'force', `grafcet:comment:${comment.id}`)
                    }}
                    onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); removeComment(comment.id) }}
                  >
                    <title>Duplo clique edita · botão direito elimina</title>
                    {comment.text}
                  </text>
                ))}

                {/* ETAPAS E AÇÕES ATRELADAS */}
                {steps.map((step, index) => {
                  const active = runtime.active.includes(step.id)
                  const isThisStepSelected = isStepSelected(step.id)
                  const isStepHovered = hoveredStepId === step.id
                  /* Com transição à saída, o «+» da própria transição insere a etapa seguinte: o da etapa ficaria por cima dela. */
                  const hasOutgoingTransition = transitions.some((item) => item.from.includes(step.id))
                  const isInitial = step.initial || step.stepType === 'initial' || step.stepType === 'initial-enclosing'
                  const isMacro = step.stepType === 'macro'
                  const isMacroInput = step.stepType === 'macro-input'
                  const isMacroOutput = step.stepType === 'macro-output'
                  const isEnclosing = step.stepType === 'enclosing' || step.stepType === 'initial-enclosing'
                  const y = stepY(step.id)
                  const isStepUnlinked = !transitions.some((t) => t.from.includes(step.id) || t.to.includes(step.id))

                  const onStepClick = (e: React.MouseEvent) => {
                    // Ferramenta Ligar: toque-a-toque — 1.º toque arma a saída da etapa, o 2.º define a entrada.
                    if (full && activeTool === 'connect') {
                      e.stopPropagation()
                      const draft = wireDraftRef.current
                      if (draft) {
                        // Um fio vindo de uma ação solta liga a ação à etapa; os restantes vão para a entrada.
                        completeWire(draft.start, {
                          kind: draft.start.kind === 'action-in' ? 'step-attach' : 'step-in',
                          id: step.id,
                        })
                        cancelWire()
                      } else {
                        startWire({ kind: 'step-out', id: step.id }, e.clientX, e.clientY)
                      }
                      return
                    }
                    selectStep(step, e)
                  }

                  const onStepDoubleClick = (e: React.MouseEvent) => {
                    e.stopPropagation()
                    setEditingStep(step)
                  }

                  // Informação da etapa: número/identificador dentro da caixa e comentário/descrição acima
                  const { stepNumber, comment } = getStepDisplayInfo(step, index)
                  const isStepBeingDragged = dragPos?.id === step.id
                  const stepShiftX = stepX(step.id) - SPINE_X

                  return (
                    <g
                      key={step.id}
                      data-step-id={step.id}
                      className={`${full ? 'grafcet-graph-node' : ''} ${isStepBeingDragged ? 'grafcet-step-dragging' : ''} ${active ? 'is-active' : ''} ${isThisStepSelected ? 'is-selected' : ''} ${multi.includes(step.id) ? 'is-multi' : ''} ${isStepUnlinked ? 'is-unlinked' : ''}`}
                      transform={stepShiftX ? `translate(${stepShiftX}, 0)` : undefined}
                      role={full ? 'button' : undefined}
                      tabIndex={full ? 0 : undefined}
                      aria-keyshortcuts={isStepUnlinked ? 'L' : undefined}
                      aria-label={`Etapa ${stepNumber}: ${step.name}${isStepUnlinked ? ', por ligar' : ''}${active ? ', ativa' : ''}`}
                      onClick={onStepClick}
                      onDoubleClick={onStepDoubleClick}
                      onPointerDown={(e) => onStepPointerDown(step, e)}
                      onPointerMove={(e) => onStepPointerMove(step, e)}
                      onPointerUp={(e) => onStepPointerUp(step, e)}
                      onPointerCancel={onStepPointerCancel}
                      onMouseEnter={() => hoverElement('step', step.id)}
                      onMouseLeave={() => hoverElement('step', null)}
                      onFocus={() => {
                        setFocusedStepId(step.id)
                        hoverElement('step', step.id)
                      }}
                      onBlur={() => {
                        setFocusedStepId(null)
                        hoverElement('step', null)
                      }}
                      onDragOver={
                        full
                          ? (event) => {
                              if (event.dataTransfer.types.includes(GRAFCET_MIME)) {
                                event.preventDefault()
                                event.stopPropagation()
                                event.dataTransfer.dropEffect = 'copy'
                              }
                            }
                          : undefined
                      }
                      onDrop={
                        full
                          ? (event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              const kind = event.dataTransfer.getData(GRAFCET_MIME) as PaletteItem
                              if (kind === 'action') {
                                addActionToStep(step, false)
                              } else if (kind === 'conditional') {
                                addActionToStep(step, true)
                              } else if (kind === 'transition') {
                                // Largar uma transição sobre uma etapa: nasce solta já com a origem ligada.
                                const t: GrafcetTransition = {
                                  id: id(),
                                  from: [step.id],
                                  to: [],
                                  condition: '1',
                                  x: stepX(step.id),
                                  y: stepY(step.id) + STEP_H + 30,
                                }
                                save({ transitions: [...transitions, t] })
                                setSelected(t.id)
                                setSelectedActionId(null)
                                setTab('transitions')
                                notify(`Transição após a Etapa ${stepNumber} — ligue o destino`)
                              } else if (kind === 'step') {
                                addConnectedStep(step)
                              } else if (kind === 'initial') {
                                updateStep(step.id, { initial: true, stepType: 'initial' }, 'force')
                                notify(`Etapa ${stepNumber} definida como inicial`)
                              } else {
                                usePalette(kind)
                              }
                            }
                          : undefined
                      }
                    >
                      {/* Área contínua de hover: une visualmente a etapa ao atalho «+».
                          Assim, a ação de adicionar etapa/transição não desaparece ao mover o rato. */}
                      {full && (
                        <rect
                          className="grafcet-step-hover-zone"
                          x="100"
                          y={y - 16}
                          width="112"
                          height={hasOutgoingTransition ? 54 + 16 : active ? 114 : 98}
                          fill="transparent"
                          onPointerEnter={() => hoverElement('step', step.id)}
                        />
                      )}
                      {full && wireDraft && wireHover?.kind === 'step-in' && wireHover.id === step.id && (
                        <rect x="113" y={y - 6} width="76" height="66" rx="6" fill="rgba(34,197,94,0.10)" stroke="#16a34a" strokeWidth="2.5" strokeDasharray="6 4" pointerEvents="none" />
                      )}
                      <title>{`Etapa ${stepNumber}${comment ? ` · ${comment}` : ''}${isStepUnlinked ? ' · por ligar — arraste uma transição ou use Ligar [L]' : ''}${active ? ` · ativa há ${fmtSeconds(runtime.elapsed?.[step.id] ?? 0)}` : ''}`}</title>

                      {full && isStepUnlinked && (
                        <>
                          <g className="grafcet-detached-status grafcet-step-detached-status" pointerEvents="none">
                            <rect x="119" y={y - 18} width="64" height="14" rx="4" />
                            <text x="151" y={y - 8} textAnchor="middle">POR LIGAR</text>
                          </g>
                          {(isStepHovered || isThisStepSelected || focusedStepId === step.id) && (
                            <text className="grafcet-detached-hint" x="151" y={y + 69} textAnchor="middle" pointerEvents="none">
                              arraste uma transição · Ligar [L]
                            </text>
                          )}
                        </>
                      )}

                      {/* Captions occupy the right lane, clear of the incoming flow. */}
                      {comment && (
                        <text className="grafcet-step-caption" x={SPINE_X + 44} y={y - 9} fill="#475569" fontSize="11" fontWeight="600" paintOrder="stroke" stroke="#fbfcfe" strokeWidth="5" strokeLinejoin="round">
                          {diagramLabel(comment, 25)}
                        </text>
                      )}

                      {/* Halo de hover/seleção: só um traço translúcido (sem filtros), controlado por CSS — não repinta o grupo nem pisca */}
                      {full && <rect className="grafcet-hover-halo" x="119" y={y} width="64" height="54" rx="4" pointerEvents="none" />}
                      {/* Caixa externa da etapa */}
                      <rect
                        className="grafcet-step-box"
                        x="119"
                        y={y}
                        width="64"
                        height="54"
                        rx="2"
                        fill={active ? '#edf9f1' : isThisStepSelected ? '#eff6ff' : '#ffffff'}
                        stroke={isThisStepSelected ? '#2563eb' : active ? '#16a34a' : '#334155'}
                        strokeWidth={isThisStepSelected || active ? 2 : 1.6}
                        vectorEffect="non-scaling-stroke"
                      />

                      {/* Contorno de destino quando uma transição ou ação solta paira sobre esta etapa */}
                      {(transDropStep === step.id || actionDropStep === step.id) && (
                        <g>
                          <rect
                            x="111"
                            y={y - 8}
                            width="80"
                            height="70"
                            rx="9"
                            fill="none"
                            stroke={actionDropStep === step.id ? '#2563eb' : '#d97706'}
                            strokeWidth="2.5"
                            strokeDasharray="7 4"
                            className="grafcet-drop-outline"
                          />
                          {actionDropStep === step.id && (
                            <>
                              <path
                                d={actionLinkPath(
                                  SPINE_X + 32,
                                  y + STEP_H / 2,
                                  ACTION_X - ACTION_BUS_GAP,
                                  y + ACTION_TOP_OFFSET + (stepActionLayout(step) === 'row' ? 0 : actionsOf(step).length * ACTION_PITCH) + ACTION_H / 2,
                                  ACTION_X + (stepActionLayout(step) === 'row' ? actionsOf(step).length * ACTION_W : 0)
                                )}
                                fill="none"
                                stroke="#2563eb"
                                strokeWidth="2"
                                strokeDasharray="4 3"
                                strokeLinecap="round"
                              />
                              <rect
                                x={ACTION_X + (stepActionLayout(step) === 'row' ? actionsOf(step).length * ACTION_W : 0)}
                                y={y + ACTION_TOP_OFFSET + (stepActionLayout(step) === 'row' ? 0 : actionsOf(step).length * ACTION_PITCH)}
                                width={ACTION_W}
                                height={ACTION_H}
                                rx="3"
                                fill="#eff6ff"
                                stroke="#2563eb"
                                strokeWidth="2"
                                strokeDasharray="5 3"
                              />
                              <text
                                x={ACTION_X + ACTION_W / 2 + (stepActionLayout(step) === 'row' ? actionsOf(step).length * ACTION_W : 0)}
                                y={y + ACTION_TOP_OFFSET + (stepActionLayout(step) === 'row' ? 0 : actionsOf(step).length * ACTION_PITCH) + 19}
                                textAnchor="middle"
                                fill="#1d4ed8"
                                fontSize="11"
                                fontWeight="700"
                              >
                                + Ligar ação aqui
                              </text>
                            </>
                          )}
                        </g>
                      )}

                      {/* Portos diretos nas faces (topo, base, direita): sempre visíveis em edição, realçados ao selecionar, passar ou ligar. */}
                      {full && activeTool !== 'pan' && !running && <g className={`grafcet-step-ports ${activeTool === 'connect' || isThisStepSelected || hoveredStepId === step.id || focusedStepId === step.id || wireDraft ? 'is-emphasized' : 'is-idle'}`}>
                        {renderWirePort({ kind: 'step-in', id: step.id }, { x: SPINE_X, y }, `Entrada da etapa ${stepNumber}`)}
                        {renderWirePort({ kind: 'step-out', id: step.id }, { x: SPINE_X, y: y + STEP_H }, `Saída da etapa ${stepNumber}: arraste um fio para uma etapa ou transição`)}
                        {renderWirePort({ kind: 'step-action', id: step.id }, { x: SPINE_X + 32, y: y + STEP_H / 2 }, `Porto de ação da etapa ${stepNumber}: arraste um fio para uma ação solta`)}
                      </g>}

                      {/* Caixa interna de etapa inicial normalizada IEC */}
                      {isInitial && (
                        <rect
                          x="124"
                          y={y + 5}
                          width="54"
                          height="44"
                          fill="none"
                          stroke={isThisStepSelected ? '#2563eb' : active ? '#16a34a' : '#263d59'}
                          strokeWidth="1.5"
                        />
                      )}

                      {/* Macro etapa */}
                      {isMacro && (
                        <>
                          <line x1="119" y1={y + 10} x2="183" y2={y + 10} stroke="#263d59" strokeWidth="1.5" />
                          <line x1="119" y1={y + 44} x2="183" y2={y + 44} stroke="#263d59" strokeWidth="1.5" />
                          <text x="151" y={y + 8} textAnchor="middle" fontSize="8" fontWeight="bold" fill="#64748b">
                            M
                          </text>
                        </>
                      )}

                      {isMacroInput && <text x="130" y={y + 17} textAnchor="middle" fontSize="10" fontWeight="bold" fill="#64748b">E</text>}
                      {isMacroOutput && <text x="172" y={y + 45} textAnchor="middle" fontSize="10" fontWeight="bold" fill="#64748b">S</text>}

                      {/* Etapa encapsulante */}
                      {isEnclosing && (
                        <>
                          <line x1="119" y1={y + 10} x2="129" y2={y} stroke="#263d59" strokeWidth="2" />
                          <line x1="173" y1={y} x2="183" y2={y + 10} stroke="#263d59" strokeWidth="2" />
                          <line x1="119" y1={y + 44} x2="129" y2={y + 54} stroke="#263d59" strokeWidth="2" />
                          <line x1="173" y1={y + 54} x2="183" y2={y + 44} stroke="#263d59" strokeWidth="2" />
                        </>
                      )}

                      {/* Número da etapa centralizado e nítido dentro da caixa da etapa */}
                      <text
                        x="151"
                        y={y + (active ? 28 : 34)}
                        textAnchor="middle"
                        fill="#1e293b"
                        fontWeight="700"
                        fontSize={stepNumber.length > 3 ? '14' : stepNumber.length > 2 ? '16' : '19'}
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {stepNumber}
                      </text>

                      {/* Elapsed time stays inside the symbol, clear of flow and action lanes. */}
                      {active && (
                        <g className="grafcet-step-elapsed" pointerEvents="none">
                          <text x="151" y={y + 40} textAnchor="middle" fill="#187442" fontSize="9" fontWeight="600" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {fmtSeconds(runtime.elapsed?.[step.id] ?? 0)}
                          </text>
                        </g>
                      )}

                      {/* Manipuladores rápidos estilo grafcet.io para a etapa selecionada ou em hover */}
                      {full && (isStepHovered || isThisStepSelected) && (
                        <>
                          <g
                              className="grafcet-node-handle grafcet-link-drag-handle"
                              onPointerDown={(e) => startQuickWire({ kind: 'step-out', id: step.id }, e)}
                              onClick={(e) => e.stopPropagation()}
                              style={{ cursor: 'crosshair', touchAction: 'none' }}
                              role="button"
                              aria-label="Arrastar até outra etapa para criar uma transição"
                            >
                              <title>Arrastar até outra etapa para criar uma transição</title>
                              <circle cx={196} cy={y + 48} r="8" fill="#16a34a" stroke="#ffffff" strokeWidth="1.5" />
                              <path d={`M ${196 - 4} ${y + 48} H ${196 + 3} M ${196} ${y + 48 - 3.5} L ${196 + 3.5} ${y + 48} L ${196} ${y + 48 + 3.5}`} fill="none" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </g>
                          {/* Botão + abaixo da etapa: Adicionar etapa seguinte e transição */}
                          {!hasOutgoingTransition && <g
                            className="grafcet-node-handle"
                            onClick={(e) => {
                              e.stopPropagation()
                              addConnectedStep(step)
                            }}
                            style={{ cursor: 'pointer' }}
                            role="button"
                            aria-label="Adicionar etapa seguinte e transição"
                          >
                            <circle cx="151" cy={active ? y + 84 : y + 68} r="10" fill="#2563eb" stroke="#ffffff" strokeWidth="2" />
                            <path d={`M 151 ${active ? y + 79 : y + 63} V ${active ? y + 89 : y + 73} M 146 ${active ? y + 84 : y + 68} H 156`} stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
                          </g>}

                          {/* Botão + à direita da etapa: adicionar ação a esta etapa */}
                          <g
                            className="grafcet-node-handle"
                            onClick={(e) => {
                              e.stopPropagation()
                              addActionToStep(step)
                            }}
                            style={{ cursor: 'pointer' }}
                            role="button"
                            aria-label="Adicionar ação a esta etapa"
                          >
                            <circle cx="196" cy={y + 27} r="9" fill="#0284c7" stroke="#ffffff" strokeWidth="2" />
                            <path d={`M 196 ${y + 23} V ${y + 31} M 192 ${y + 27} H 200`} stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
                          </g>

                          {/* Botão ✎ no canto superior direito: Editar etapa no diálogo FluidSIM */}
                          <g
                            className="grafcet-node-handle"
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingStep(step)
                            }}
                            style={{ cursor: 'pointer' }}
                            role="button"
                            aria-label="Configurar etapa"
                          >
                            <circle cx="196" cy={y + 6} r="8" fill="#2563eb" stroke="#ffffff" strokeWidth="1.8" filter="drop-shadow(0 1px 3px rgba(0,0,0,0.25))" />
                            <path d={`M 194 ${y + 8} L 198 ${y + 4}`} stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
                          </g>

                          {/* Botão ✕ no canto superior esquerdo: Eliminar etapa com folga externa */}
                          {steps.length > 1 && (
                            <g
                              className="grafcet-node-handle is-delete"
                              onClick={(e) => {
                                e.stopPropagation()
                                removeStep(step.id)
                              }}
                              style={{ cursor: 'pointer' }}
                              role="button"
                              aria-label="Eliminar etapa"
                            >
                              <circle cx="106" cy={y + 6} r="8" fill="#ef4444" stroke="#ffffff" strokeWidth="1.8" filter="drop-shadow(0 1px 3px rgba(0,0,0,0.25))" />
                              <path d={`M 103.5 ${y + 3.5} L 108.5 ${y + 8.5} M 108.5 ${y + 3.5} L 103.5 ${y + 8.5}`} stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
                            </g>
                          )}
                        </>
                      )}
                    </g>
                  )
                })}

                {/* AÇÕES INDEPENDENTES E LINHAS CONECTORAS (PADRÃO IEC 60848 & FLUIDSIM) */}
                {steps.map((step) => {
                  const actions = actionsOf(step)
                  if (!actions.length) return null
                  const y = stepY(step.id)
                  const isThisStepSelected = isStepSelected(step.id)

                  // A coluna de ações acompanha o eixo real da etapa (etapas movidas/fixadas ou em colunas paralelas).
                  const stepCx = stepX(step.id)
                  const actionX = stepCx + ACTION_OFFSET_X
                  const actionW = ACTION_W
                  const actionH = ACTION_H
                  const qualifierW = ACTION_QUALIFIER_W
                  const linkX = stepCx + 32
                  const linkY = y + STEP_H / 2
                  const busX = actionX - ACTION_BUS_GAP
                  const layout = stepActionLayout(step)
                  const slotTop = (index: number) => y + actionSlotOffset(layout, index).dy
                  const slotLeft = (index: number) => stepCx + actionSlotOffset(layout, index).dx

                  // Ligações etapa → ação: camada própria (as realçadas por cima das neutras, sem mistura de cores).
                  const linkLayer = actions
                    .map((action, index) => {
                      // Em linha, só a 1.ª ação liga à etapa: as restantes encostam-se à anterior.
                      if (layout === 'row' && index > 0) return null
                      const dragging = full && actionDragPos?.id === action.id
                      if (dragging) return null
                      const selected = isActionSelected(action.id)
                      const on = !!table[action.address]
                      return {
                        key: action.id,
                        d: actionLinkPath(linkX, linkY, busX, slotTop(index) + actionH / 2, actionX),
                        rank: selected ? 2 : on ? 1 : 0,
                      }
                    })
                    .filter((link): link is { key: string; d: string; rank: number } => link !== null)
                    .sort((a, b) => a.rank - b.rank)
                  const anchorRank = linkLayer.reduce((max, link) => Math.max(max, link.rank), 0)
                  const linkColor = (rank: number) => (rank === 2 ? '#2563eb' : rank === 1 ? '#16a34a' : '#263d59')

                  return (
                    <g key={`step-actions-${step.id}`}>
                      <g className="grafcet-action-links" pointerEvents="none">
                        {linkLayer.map((link) => (
                          <path
                            key={link.key}
                            className={`grafcet-action-link ${link.rank === 2 ? 'is-selected' : link.rank === 1 ? 'is-on' : ''}`}
                            d={link.d}
                            fill="none"
                            stroke={linkColor(link.rank)}
                            strokeWidth={link.rank ? 2 : 1.4}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        ))}
                        {/* Ponto de ancoragem na etapa */}
                        <circle cx={linkX} cy={linkY} r="3" fill={linkColor(anchorRank)} />
                      </g>
                      {actions.map((action, actionIndex) => {
                        const dragOverride = full && actionDragPos?.id === action.id ? actionDragPos : null
                        const actionY = dragOverride ? dragOverride.y : slotTop(actionIndex)
                        const renderX = dragOverride ? dragOverride.x : slotLeft(actionIndex)
                        const actionOn = !dragOverride && !!table[action.address]
                        const isThisActionSelected = isActionSelected(action.id)
                        const isThisActionHovered = hoveredActionId === action.id
                        const kind = action.kind ?? 'N'
                        const isConditional = !!(action.condition && action.condition !== '1')

                        const onActionClick = (e: React.MouseEvent) => {
                          selectAction(step, action, e)
                        }

                        const onActionDoubleClick = (e: React.MouseEvent) => {
                          e.stopPropagation()
                          setEditingAction({ step, action })
                        }

                        const strokeColor = dragOverride
                          ? '#d97706'
                          : isThisActionSelected
                          ? '#2563eb'
                          : actionOn
                          ? '#16a34a'
                          : '#263d59'

                        return (
                          <g
                            key={action.id}
                            className={`grafcet-graph-action ${isThisActionSelected ? 'is-selected' : ''} ${dragOverride ? 'is-dragging-action' : ''}`}
                            onClick={onActionClick}
                            onDoubleClick={onActionDoubleClick}
                            onPointerDown={(e) => onActionPointerDown(action, step.id, e)}
                            onPointerMove={(e) => onActionPointerMove(action, e)}
                            onPointerUp={(e) => onActionPointerUp(action, e)}
                            onPointerCancel={resetActionDrag}
                            onMouseEnter={() => hoverElement('action', action.id)}
                            onMouseLeave={() => hoverElement('action', null)}
                            onFocus={() => {
                              setFocusedActionId(action.id)
                              hoverElement('action', action.id)
                            }}
                            onBlur={() => {
                              setFocusedActionId(null)
                              hoverElement('action', null)
                            }}
                            style={full ? { cursor: 'grab', touchAction: 'none' } : undefined}
                            role="button"
                            tabIndex={0}
                            aria-label={`Ação ${action.address || action.variable || 'ação'}${isThisActionSelected ? ' selecionada' : ''} — arraste para mover ou desanexar`}
                          >
                            {/* A linha conectora etapa → ação é desenhada na camada .grafcet-action-links (some durante o arrasto) */}

                            <title>{`${kind} · ${actionLabel(action)}${action.variable ? ` · ${action.variable}` : ''}${isConditional ? ` · condição: ${action.condition}` : ''}`}</title>

                            {/* Halo de hover/seleção (ver .grafcet-hover-halo) */}
                            {full && <rect className="grafcet-hover-halo" x={renderX} y={actionY} width={actionW} height={actionH} rx="2" pointerEvents="none" />}
                            {/* Símbolo IEC 60848 partilhado com a modal */}
                            <ActionSymbol
                              x={renderX}
                              y={actionY}
                              w={actionW}
                              h={actionH}
                              shape={actionShape(action)}
                              condition={action.condition}
                              timeSeconds={(action.timeMs ?? 2000) / 1000}
                              qualifierW={qualifierW}
                              stroke={strokeColor}
                              strokeWidth={isThisActionSelected || actionOn ? 2 : 1.5}
                              fill={actionOn ? '#edf9f1' : isThisActionSelected ? '#eff6ff' : 'white'}
                              textColor={isThisActionSelected ? '#1d4ed8' : actionOn ? '#15803d' : '#1e293b'}
                              label={diagramLabel(actionLabel(action), isThisActionSelected || isThisActionHovered ? 8 : actionShape(action).qualifier ? 12 : 16)}
                              subLabel={action.displayDescription && action.description && action.variable && action.description !== action.variable ? diagramLabel(action.variable, isThisActionSelected || isThisActionHovered ? 10 : 16) : undefined}
                            />

                            {/* Manipuladores rápidos na ação: ✎ editar e ✕ eliminar */}
                            {full && (isThisActionSelected || isThisActionHovered) && (
                              <>
                                <g
                                  className="grafcet-node-handle"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setEditingAction({ step, action })
                                  }}
                                  style={{ cursor: 'pointer' }}
                                  role="button"
                                  aria-label="Configurar ação"
                                >
                                  <circle cx={renderX + actionW - 22} cy={actionY + actionH / 2} r="7.5" fill="#2563eb" stroke="#ffffff" strokeWidth="1.5" />
                                  <path d={`M ${renderX + actionW - 24} ${actionY + actionH / 2 + 2} L ${renderX + actionW - 20} ${actionY + actionH / 2 - 2}`} stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
                                </g>

                                <g
                                  className="grafcet-node-handle is-delete"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    removeAction(step, action.id)
                                  }}
                                  style={{ cursor: 'pointer' }}
                                  role="button"
                                  aria-label="Remover ação"
                                >
                                  <circle cx={renderX + actionW - 7} cy={actionY + actionH / 2} r="7.5" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
                                  <path
                                    d={`M ${renderX + actionW - 9.5} ${actionY + actionH / 2 - 2.5} L ${renderX + actionW - 4.5} ${actionY + actionH / 2 + 2.5} M ${renderX + actionW - 4.5} ${actionY + actionH / 2 - 2.5} L ${renderX + actionW - 9.5} ${actionY + actionH / 2 + 2.5}`}
                                    stroke="#ffffff"
                                    strokeWidth="1.4"
                                    strokeLinecap="round"
                                  />
                                </g>
                              </>
                            )}
                          </g>
                        )
                      })}

                      {/* Botão + Ação: à direita da última ação (em linha) ou por baixo (empilhadas), com a etapa selecionada */}
                      {full && isThisStepSelected && (
                        <g
                          className="grafcet-node-handle"
                          onClick={(e) => {
                            e.stopPropagation()
                            addActionToStep(step)
                          }}
                          style={{ cursor: 'pointer' }}
                          role="button"
                          aria-label="Adicionar ação"
                        >
                          <rect
                            x={layout === 'row' ? actionX + actions.length * actionW + 16 : actionX}
                            y={layout === 'row' ? slotTop(0) + (actionH - 22) / 2 : slotTop(actions.length) + 4}
                            width="90"
                            height="22"
                            rx="4"
                            fill="#eff6ff"
                            stroke="#3b82f6"
                            strokeWidth="1.2"
                            strokeDasharray="3 2"
                          />
                          <text
                            x={layout === 'row' ? actionX + actions.length * actionW + 16 + 45 : actionX + 45}
                            y={layout === 'row' ? slotTop(0) + actionH / 2 + 3.5 : slotTop(actions.length) + 19}
                            textAnchor="middle"
                            fill="#1d4ed8"
                            fontSize="10.5"
                            fontWeight="600"
                          >
                            + Ação
                          </text>
                        </g>
                      )}
                    </g>
                  )
                })}

                {/* AÇÕES SOLTAS: caixas IEC livres no grid — arrastam-se e ligam-se por aproximação ou por linha */}
                {freeActions.map((action) => {
                  const pos = actionXY(action)
                  const x = pos.x
                  const y = pos.y
                  const kind = action.kind ?? 'N'
                  const isThisActionSelected = isActionSelected(action.id)
                  const isThisActionHovered = hoveredActionId === action.id
                  const isConditional = !!(action.condition && action.condition !== '1')
                  const strokeColor = isThisActionSelected ? '#2563eb' : '#d97706'
                  const midY = y + ACTION_FREE_H / 2
                  const kindLabel = kind === 'N' ? 'N' : kind
                  return (
                    <g
                      key={`free-action-${action.id}`}
                      className={`grafcet-graph-action grafcet-action-free ${isThisActionSelected ? 'is-selected' : ''}`}
                      onClick={
                        full
                          ? (e) => {
                              e.stopPropagation()
                              setSelected(null)
                              setSelectedActionId(action.id)
                              setTab('steps')
                            }
                          : undefined
                      }
                      onDoubleClick={
                        full
                          ? (e) => {
                              e.stopPropagation()
                              setEditingAction({ step: null, action })
                            }
                          : undefined
                      }
                      onPointerDown={full ? (e) => onActionPointerDown(action, null, e) : undefined}
                      onPointerMove={full ? (e) => onActionPointerMove(action, e) : undefined}
                      onPointerUp={full ? (e) => onActionPointerUp(action, e) : undefined}
                      onPointerCancel={full ? resetActionDrag : undefined}
                      onMouseEnter={() => hoverElement('action', action.id)}
                      onMouseLeave={() => hoverElement('action', null)}
                      onFocus={() => {
                        setFocusedActionId(action.id)
                        hoverElement('action', action.id)
                      }}
                      onBlur={() => {
                        setFocusedActionId(null)
                        hoverElement('action', null)
                      }}
                      style={full ? { cursor: 'grab', touchAction: 'none' } : { pointerEvents: 'none' }}
                      role="button"
                      tabIndex={0}
                      aria-keyshortcuts="L"
                      aria-label={`Ação solta ${action.variable || action.address || ''} — arraste sobre uma etapa ou use Ligar, tecla L`}
                    >
                      <title>{`${kind} · ${actionLabel(action)}${action.variable ? ` · ${action.variable}` : ''}${isConditional ? ` · condição: ${action.condition}` : ''} · ação por ligar · arraste sobre uma etapa ou use Ligar [L]`}</title>
                      {/* Halo transparente para agarrar com facilidade (rato e toque) */}
                      <rect x={x - 36} y={y - 18} width={ACTION_FREE_W + 72} height={ACTION_FREE_H + 36} fill="transparent" />

                      {/* Stubs tracejados nas quatro faces — os círculos de ligação ficam abaixo, depois do símbolo */}
                      <line x1={x - 14} y1={midY} x2={x} y2={midY} stroke="#d97706" strokeWidth="1.6" strokeDasharray="3 2" className="grafcet-free-stub" />
                      {full && activeTool !== 'pan' && !running && <>
                        <line x1={x + ACTION_FREE_W} y1={midY} x2={x + ACTION_FREE_W + 14} y2={midY} stroke="#d97706" strokeWidth="1.6" strokeDasharray="3 2" className="grafcet-free-stub" />
                        <line x1={x + ACTION_FREE_W / 2} y1={y - 14} x2={x + ACTION_FREE_W / 2} y2={y} stroke="#d97706" strokeWidth="1.6" strokeDasharray="3 2" className="grafcet-free-stub" />
                        <line x1={x + ACTION_FREE_W / 2} y1={y + ACTION_FREE_H} x2={x + ACTION_FREE_W / 2} y2={y + ACTION_FREE_H + 14} stroke="#d97706" strokeWidth="1.6" strokeDasharray="3 2" className="grafcet-free-stub" />
                      </>}

                      {/* Halo de hover/seleção (ver .grafcet-hover-halo) */}
                      {full && <rect className="grafcet-hover-halo" x={x} y={y} width={ACTION_FREE_W} height={ACTION_FREE_H} rx="2" pointerEvents="none" />}
                      {/* Símbolo IEC 60848 (âmbar tracejado enquanto solta) */}
                      <ActionSymbol
                        x={x}
                        y={y}
                        w={ACTION_FREE_W}
                        h={ACTION_FREE_H}
                        shape={actionShape(action)}
                        condition={action.condition}
                        timeSeconds={(action.timeMs ?? 2000) / 1000}
                        qualifierW={ACTION_QUALIFIER_W}
                        stroke={strokeColor}
                        strokeWidth={isThisActionSelected ? 2.2 : 1.6}
                        fill={isThisActionSelected ? '#eff6ff' : '#fffbeb'}
                        textColor={isThisActionSelected ? '#1d4ed8' : '#1e293b'}
                        dashed={!isThisActionSelected}
                        label={diagramLabel(actionLabel(action), isThisActionSelected || isThisActionHovered ? 8 : 13)}
                      />

                      {/* Círculos de ligação em cada face da ação: arraste de qualquer um até uma etapa (ou largue o fio da etapa sobre a ação) */}
                      {full && activeTool !== 'pan' && !running && <g className={`grafcet-action-ports grafcet-step-ports ${activeTool === 'connect' || isThisActionSelected || isThisActionHovered || focusedActionId === action.id || wireDraft ? 'is-emphasized' : 'is-idle'}`}>
                        {(['l', 'r', 't', 'b'] as const).map((side) => renderWirePort(
                          { kind: 'action-in', id: action.id, side },
                          actionPortAt({ x, y }, side),
                          `Porto ${side === 'l' ? 'esquerdo' : side === 'r' ? 'direito' : side === 't' ? 'superior' : 'inferior'} da ação solta ${action.variable || action.address || ''}: arraste um fio até uma etapa`,
                        ))}
                      </g>}

                      {/* A marca permanece fora da caixa para não colidir com controlos ou texto. */}
                      <g className="grafcet-detached-status grafcet-action-detached-status" transform={`translate(${x - 50}, ${y - 11})`} pointerEvents="none">
                        <rect width="64" height="15" rx="4" />
                        <text x="32" y="10.5" textAnchor="middle">POR LIGAR</text>
                      </g>

                      {/* Dica contextual */}
                      {full && (isThisActionHovered || isThisActionSelected || focusedActionId === action.id) && (
                        <text className="grafcet-detached-hint" x={x + ACTION_FREE_W / 2} y={y + ACTION_FREE_H + 36} textAnchor="middle" pointerEvents="none">
                          arraste para etapa · Ligar [L]
                        </text>
                      )}

                      {/* Manipulador rápido: Anexar à etapa selecionada se houver */}
                      {full && (isThisActionSelected || isThisActionHovered) && selectedStep && (
                        <g
                          className="grafcet-node-handle"
                          onClick={(e) => {
                            e.stopPropagation()
                            attachFreeAction(action.id, selectedStep.id)
                          }}
                          style={{ cursor: 'pointer' }}
                          role="button"
                          aria-label={`Ligar à Etapa ${selectedStep.name}`}
                        >
                          <title>{`Ligar à Etapa ${selectedStep.name}`}</title>
                          <circle cx={x - 28} cy={midY} r="7.5" fill="#16a34a" stroke="#ffffff" strokeWidth="1.5" />
                          <path d={`M ${x - 31} ${midY} H ${x - 25} M ${x - 27} ${midY - 2} L ${x - 25} ${midY} L ${x - 27} ${midY + 2}`} stroke="#ffffff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                        </g>
                      )}

                      {/* Manipuladores ✎ editar e ✕ eliminar */}
                      {full && (isThisActionSelected || isThisActionHovered) && (
                        <>
                          <g
                            className="grafcet-node-handle"
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingAction({ step: null, action })
                            }}
                            style={{ cursor: 'pointer' }}
                            role="button"
                            aria-label="Configurar ação solta"
                          >
                            <circle cx={x + ACTION_FREE_W - 22} cy={midY} r="7.5" fill="#2563eb" stroke="#ffffff" strokeWidth="1.5" />
                            <path d={`M ${x + ACTION_FREE_W - 24} ${midY + 2} L ${x + ACTION_FREE_W - 20} ${midY - 2}`} stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
                          </g>
                          <g
                            className="grafcet-node-handle is-delete"
                            onClick={(e) => {
                              e.stopPropagation()
                              removeFreeAction(action.id)
                            }}
                            style={{ cursor: 'pointer' }}
                            role="button"
                            aria-label="Eliminar ação solta"
                          >
                            <circle cx={x + ACTION_FREE_W - 7} cy={midY} r="7.5" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
                            <path
                              d={`M ${x + ACTION_FREE_W - 9.5} ${midY - 2.5} L ${x + ACTION_FREE_W - 4.5} ${midY + 2.5} M ${x + ACTION_FREE_W - 4.5} ${midY - 2.5} L ${x + ACTION_FREE_W - 9.5} ${midY + 2.5}`}
                              stroke="#ffffff"
                              strokeWidth="1.4"
                              strokeLinecap="round"
                            />
                          </g>
                        </>
                      )}

                    </g>
                  )
                })}

                {/* Os dois lados de qualquer transição podem ligar-se diretamente, sem abrir propriedades. */}
                {full && activeTool !== 'pan' && transitions.map((transition, index) => {
                  if (!(activeTool === 'connect' || wireDraft || selected === transition.id || hoveredTransitionId === transition.id || focusedTransitionId === transition.id)) return null
                  const anchor = transitionAnchors.get(transition.id)
                  if (!anchor) return null
                  const incoming = portPosOf({ kind: 'trans-in', id: transition.id })
                  const outgoing = portPosOf({ kind: 'trans-out', id: transition.id })
                  const name = transition.name || `T${index + 1}`
                  const branch = transition.from.length === 1 && transition.to.length === 1 && !transition.wireless && selected === transition.id
                  return <g key={`ports-${transition.id}`} className="grafcet-transition-ports">
                    {renderWirePort({ kind: 'trans-in', id: transition.id }, incoming, `Entrada da transição ${name}: ligar uma origem`)}
                    {renderWirePort({ kind: 'trans-out', id: transition.id }, outgoing, `Saída da transição ${name}: ligar um destino`)}
                    {branch && <g className="grafcet-branch-node">
                      {renderWirePort({ kind: 'branch-out', id: transition.id }, branchPointOf(transition.id), `Nó de derivação de ${name}: arraste para uma etapa e crie um ramo alternativo`)}
                    </g>}
                  </g>
                })}

                {/* Guias de alinhamento durante o arrastamento */}
                {dragPos && guides.x !== null && (
                  <line x1={guides.x} y1={0} x2={guides.x} y2={height} className="grafcet-guide" />
                )}
                {dragPos && guides.y !== null && (
                  <line x1={0} y1={guides.y} x2={width} y2={guides.y} className="grafcet-guide" />
                )}
                {dragPos && (
                  <text x={dragPos.x + 42} y={dragPos.y - 8} className="grafcet-drag-badge">
                    {Math.round(dragPos.x - SPINE_X)}, {Math.round(dragPos.y - START_Y)}
                  </text>
                )}

                {/* FIO EM CURSO (ferramenta Ligar): linha tracejada do porto de saída até ao cursor */}
                {wireDraft && (
                  <g className="grafcet-wire-draft" style={{ pointerEvents: 'none' }}>
                    {(() => {
                      const from = portPosOf(wireDraft.start)
                      const my = (from.y + wireDraft.y) / 2
                      const color = wireHover ? '#16a34a' : '#2563eb'
                      return (
                        <>
                          <path
                            d={routeVertical(from.x, from.y, wireHover ? portPosOf(wireHover).x : wireDraft.x, wireHover ? portPosOf(wireHover).y : wireDraft.y, my)}
                            fill="none"
                            stroke={color}
                            strokeWidth="2.5"
                            strokeDasharray="7 5"
                            strokeLinecap="round"
                            className="grafcet-wire-draft-line"
                          />
                          <circle cx={wireDraft.x} cy={wireDraft.y} r="4" fill={color} />
                          <circle cx={from.x} cy={from.y} r="6.5" fill="none" stroke={color} strokeWidth="2" opacity="0.7">
                          </circle>
                        </>
                      )
                    })()}
                  </g>
                )}
              </svg>
            </div>
          )}

          {full && steps.length > 0 && !running && activeTool !== 'pan' && !isSpacePan && <div className={`grafcet-construction-guide ${wireDraft ? 'is-active' : ''}`}>
            <span className="grafcet-construction-indicator" aria-hidden="true" />
            <span role="status" aria-live="polite">{wireDraft
              ? wireHover ? 'Solte para ligar · Esc cancela' : wireDraft.start.kind === 'branch-out' ? 'Escolha uma etapa para o novo ramo · Esc cancela' : 'Escolha outro ponto para ligar · Esc cancela'
              : demoMode ? 'Selecione etapas e ligações · arraste o fundo para ajustar a vista' : 'Arraste os pontos para ligar · arraste uma linha para a dobrar'}</span>
            {wireDraft && <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => cancelWire()} aria-label="Cancelar ligação em curso"><IconClose size={12} />Cancelar</button>}
          </div>}

          {/* Retângulo de seleção por arrastamento */}
          {marquee && (
            <div
              className="grafcet-marquee"
              aria-hidden="true"
              style={{ left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1), width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0) }}
            />
          )}

          {/* Barra de ações do grupo selecionado */}
          {full && groupIds.length >= 2 && !marquee && (
            <div className="grafcet-selbar" role="toolbar" aria-label="Ações sobre as etapas selecionadas" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
              <strong className="grafcet-selbar-count">{groupIds.length} etapas</strong>
              <span className="grafcet-canvas-hud-sep" />
              <button type="button" onClick={() => alignGroup('axis')} title="Alinhar todas ao mesmo eixo vertical"><IconAlignCenterH size={12} />Alinhar eixo</button>
              <button type="button" onClick={() => alignGroup('top')} title="Alinhar todas pelo topo"><IconAlignTop size={12} />Alinhar topo</button>
              <button type="button" onClick={() => distributeGroup('h')} disabled={groupIds.length < 3} title="Espaçamento horizontal igual (mín. 3 etapas)"><IconDistH size={12} />Distribuir</button>
              <button type="button" onClick={() => distributeGroup('v')} disabled={groupIds.length < 3} title="Espaçamento vertical igual (mín. 3 etapas)"><IconDistV size={12} />Distribuir</button>
              <span className="grafcet-canvas-hud-sep" />
              <button type="button" onClick={() => copySelection()} title="Copiar o grupo com as ações e as transições internas (Ctrl+C)"><IconCopy size={12} />Copiar</button>
              <button type="button" onClick={duplicateSelected} title="Duplicar o grupo com as transições internas (Ctrl+D)"><IconCopy size={12} />Duplicar</button>
              <button type="button" onClick={zoomToSelection} title="Ampliar a vista ao grupo (Z)"><IconFocus size={12} />Ampliar</button>
              <button type="button" className="is-danger" onClick={() => void requestDelete()} title="Eliminar as etapas selecionadas (Del)"><IconDelete size={12} />Eliminar</button>
              <button type="button" onClick={() => { setMulti([]); setSelected(null) }} aria-label="Limpar seleção" title="Limpar seleção (Esc)"><IconClose size={12} /></button>
            </div>
          )}

          {/* Minimapa: visão geral clicável/arrastável do diagrama */}
          {full && minimapOn && steps.length > 0 && !wireDraft && !diagramFitsView && (
            <GrafcetMinimap
              width={width}
              height={height}
              sourceSvgRef={svgRef}
              view={{ x: -position.x / scale, y: -position.y / scale, w: viewport.width / scale, h: viewport.height / scale }}
              onNavigate={(wx, wy) => {
                setZoom(scale)
                setPan({ x: viewport.width / 2 - wx * scale, y: viewport.height / 2 - wy * scale })
              }}
            />
          )}

        </div>

        {/* PAINEL DE PROPRIEDADES À DIREITA (Estrutura e Abas Clássicas: Etapas, Transições, Simulador, Diagnóstico) */}
        {full && (
          <aside className={`grafcet-properties ${propsOpen ? 'is-open' : ''} ${propsTall ? 'is-tall' : ''} ${tab === 'io' && simVisible ? 'is-simulator' : ''}`}>
            <SidePanelHeader
              className="grafcet-properties-summary"
              eyebrow="GRAFCET"
              title={selectedStep && selectedAction
                ? (() => { const { stepNumber } = getStepDisplayInfo(selectedStep, steps.indexOf(selectedStep)); return `Ação: ${selectedAction.variable || selectedAction.address || 'Ação'} · Etapa ${stepNumber}` })()
                : selectedStep
                ? (() => { const { stepNumber, comment } = getStepDisplayInfo(selectedStep, steps.indexOf(selectedStep)); return `Etapa ${stepNumber}${comment ? `: ${comment}` : ''}` })()
                : selectedTransition
                ? `Transição T${transitions.indexOf(selectedTransition) + 1}`
                : 'Propriedades'}
              detail={simVisible ? `${running ? '● Simulação ativa' : '○ Simulação parada'}${runtime.active.length ? ` · Etapas ativas: ${runtime.active.map((value) => { const index = steps.findIndex((step) => step.id === value); return index < 0 ? '?' : getStepDisplayInfo(steps[index], index).stepNumber }).join(', ')}` : ''}` : undefined}
              side={propsAtBottom ? 'bottom' : 'right'}
              expanded={propsOpen}
              onToggle={() => setPropsOpen((value) => !value)}
              toggleTitle
              toggleLabel={propsOpen ? 'Recolher propriedades' : 'Abrir propriedades'}
              actions={<div className="grafcet-selection-actions">
                {propsOpen && <button type="button" className="grafcet-properties-tall" aria-pressed={propsTall} aria-label={propsTall ? 'Reduzir painel' : 'Ampliar painel'} title={propsTall ? 'Reduzir painel' : 'Ampliar painel'} onClick={() => setPropsTall((value) => !value)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {propsTall ? <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" /> : <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />}
                  </svg>
                </button>}
                {selected && <>
                  <button type="button" onClick={duplicateSelected} title={selectedActionId ? 'Duplicar ação (Ctrl+D)' : 'Duplicar (Ctrl+D)'} aria-label="Duplicar seleção"><IconCopy size={13} /></button>
                  <button type="button" className="is-danger" onClick={requestDelete} title={selectedActionId ? 'Eliminar ação (Del)' : 'Eliminar (Del)'} aria-label="Eliminar seleção"><IconDelete size={13} /></button>
                </>}
              </div>}
            />

            <div className="grafcet-tabs" role="tablist" aria-label="Painel GRAFCET">
              <button role="tab" aria-selected={tab === 'steps'} className={tab === 'steps' ? 'is-active' : ''} onClick={() => setTab('steps')}>
                Etapas <em>{steps.length}</em>
              </button>
              <button
                role="tab"
                aria-selected={tab === 'transitions'}
                className={tab === 'transitions' ? 'is-active' : ''}
                onClick={() => setTab('transitions')}
              >
                Transições <em>{transitions.length}</em>
              </button>
              <button
                role="tab"
                aria-selected={tab === 'signals'}
                className={tab === 'signals' ? 'is-active' : ''}
                onClick={() => setTab('signals')}
                title={undeclared.length ? `${signalSuggestions.length} declarados · ${undeclared.length} usados no GRAFCET sem estarem na tabela` : `${signalSuggestions.length} sinais declarados (I, Q, M)`}
              >
                Sinais <em>{signalSuggestions.length}</em>
                {undeclared.length > 0 && <span className="grafcet-tab-dot" aria-label={`${undeclared.length} por declarar`} />}
              </button>
              {simVisible && (
                <button role="tab" aria-selected={tab === 'io'} className={tab === 'io' ? 'is-active' : ''} onClick={() => setTab('io')}>
                  Simulador
                  <i className={`grafcet-tab-live ${running ? 'is-running' : ''}`} aria-hidden="true" />
                </button>
              )}
              <button
                role="tab"
                aria-selected={tab === 'diagnostics'}
                className={tab === 'diagnostics' ? `is-active ${issues.length ? 'has-warning' : ''}` : ''}
                onClick={() => setTab('diagnostics')}
              >
                Diagnóstico <em>{issues.length}</em>
              </button>
            </div>

            {(tab === 'steps' || tab === 'transitions') && (
              <div className="grafcet-entity-search">
                <IconSearch size={13} />
                <input
                  className="dc-input"
                  value={entityFilter}
                  onChange={(event) => setEntityFilter(event.target.value)}
                  placeholder={tab === 'steps' ? 'Filtrar etapas ou ações…' : 'Filtrar transições…'}
                  aria-label="Filtrar entidades GRAFCET"
                />
                {entityFilter && (
                  <button onClick={() => setEntityFilter('')} aria-label="Limpar filtro">
                    ×
                  </button>
                )}
              </div>
            )}

            {/* ABA ETAPAS */}
            {tab === 'steps' && (
              <>
                <div className="grafcet-entity-list">
                  {filteredSteps.map((step) => {
                    const index = steps.indexOf(step)
                    const { stepNumber, comment } = getStepDisplayInfo(step, index)
                    return (
                      <div className={`grafcet-step-row ${selected === step.id ? 'is-active' : ''}`} key={step.id}>
                        <button onClick={() => setSelected(step.id)}>
                          {step.initial || step.stepType === 'initial' ? '◎' : '□'} <b>{stepNumber}</b>
                          <span>{comment || (step.name !== stepNumber ? step.name : `Etapa ${stepNumber}`)}</span>
                          {runtime.active.includes(step.id) && <i title="Etapa ativa" />}
                        </button>
                        <button aria-label={`Subir etapa ${stepNumber}`} title="Mover para cima" disabled={index === 0} onClick={() => moveStep(step.id, -1)}>
                          ↑
                        </button>
                        <button
                          aria-label={`Descer etapa ${stepNumber}`}
                          title="Mover para baixo"
                          disabled={index === steps.length - 1}
                          onClick={() => moveStep(step.id, 1)}
                        >
                          ↓
                        </button>
                      </div>
                    )
                  })}
                  {!filteredSteps.length && <p className="grafcet-list-empty">{query ? 'Nenhuma etapa corresponde ao filtro.' : 'Ainda não há etapas. Crie a etapa inicial no diagrama.'}</p>}
                </div>

                {freeActions.length > 0 && (
                  <div className="grafcet-free-actions-block">
                    <h4 className="grafcet-free-actions-title">Ações soltas ({freeActions.length})</h4>
                    <div className="grafcet-entity-list">
                      {freeActions.map((action) => (
                        <div
                          className={`grafcet-transition-row is-incomplete ${!selected && selectedActionId === action.id ? 'is-active' : ''}`}
                          key={action.id}
                        >
                          <button
                            onClick={() => {
                              setSelected(null)
                              setSelectedActionId(action.id)
                            }}
                            title="Sem etapa — arraste a caixa sobre uma etapa ou use Ligar [L]"
                          >
                            <i className="is-pending" />
                            ▤ <b>{action.variable || action.address || 'ação'}</b>
                            {action.condition && action.condition !== '1' && <span className="grafcet-free-action-cond">· {action.condition}</span>}
                            <em className="grafcet-tag-free">por ligar</em>
                          </button>
                          <button aria-label="Editar ação solta" title="Editar ação" onClick={() => setEditingAction({ step: null, action })}>
                            ✎
                          </button>
                          <button aria-label="Eliminar ação solta" title="Eliminar ação" onClick={() => removeFreeAction(action.id)}>
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!selectedStep && (() => {
                  const freeAct = freeActions.find((a) => a.id === selectedActionId)
                  if (freeAct) {
                    return (
                      <div className="grafcet-form">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <h3>
                            Ação Solta: {freeAct.variable || freeAct.address || 'Ação'}
                          </h3>
                          {!demoMode && <button
                            className="dc-btn"
                            style={{ fontSize: '11px', padding: '2px 8px' }}
                            onClick={() => setEditingAction({ step: null, action: freeAct })}
                            title="Editar propriedades da ação" aria-label="Editar propriedades da ação solta"
                          >
                            Editar propriedades
                          </button>}
                        </div>

                        <div className="grafcet-field" style={{ marginTop: '10px' }}>
                          <label><strong>Associar a uma etapa:</strong></label>
                          <select
                            className="dc-input"
                            style={{ marginTop: '4px' }}
                            onChange={(e) => {
                              if (e.target.value) attachFreeAction(freeAct.id, e.target.value)
                            }}
                            defaultValue=""
                          >
                            <option value="" disabled>Selecione a etapa de destino...</option>
                            {steps.map((s, idx) => {
                              const { stepNumber } = getStepDisplayInfo(s, idx)
                              return (
                                <option key={s.id} value={s.id}>
                                  Etapa {stepNumber} {s.description ? `(${s.description})` : ''}
                                </option>
                              )
                            })}
                          </select>
                        </div>

                        <label style={{ marginTop: '10px' }}>
                          Variável / Saída
                          <input
                            className="dc-input"
                            list="grafcet-action-addresses"
                            value={freeAct.variable || freeAct.address || ''}
                            onChange={(event) =>
                              patchFreeAction(freeAct, { variable: event.target.value, address: event.target.value }, 'force')
                            }
                            onBlur={(event) => {
                              const fixed = normalizeActionVariable(event.target.value)
                              if (fixed !== event.target.value) patchFreeAction(freeAct, { variable: fixed, address: fixed }, 'force')
                            }}
                            placeholder="Q1, KM1, Y1_A-"
                          />
                        </label>

                        <div className="grafcet-field" style={{ marginTop: '10px' }}>
                          <label><strong>Qualificador IEC:</strong></label>
                          <div className="grafcet-qualifier-row" style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                            {(['N', 'S', 'R', 'D', 'L'] as const).map((k) => (
                              <button
                                key={k}
                                type="button"
                                className={`grafcet-qualifier-chip ${freeAct.kind === k ? 'is-active' : ''}`}
                                onClick={() => patchFreeAction(freeAct, { kind: k }, 'force')}
                              >
                                {k}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div style={{ marginTop: '16px' }}>
                          <button
                            className="dc-btn grafcet-danger"
                            onClick={() => removeFreeAction(freeAct.id)}
                          >
                            Eliminar ação solta
                          </button>
                        </div>
                      </div>
                    )
                  }
                  return (
                    <p className="grafcet-hint">
                      Selecione um elemento no diagrama ou na lista para editar. Para vários, arraste um retângulo no
                      fundo da tela (ou Shift/Ctrl+clique) — depois arraste qualquer etapa para mover todas, Ctrl+C/V
                      copia e cola com ligações, Ctrl+A seleciona tudo, Del apaga. Elementos soltos (transições e ações)
                      ligam-se por arrasto ou com a ferramenta Ligar [L].
                    </p>
                  )
                })()}

                {selectedStep && (
                  <div className="grafcet-form">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <h3>
                        Etapa {getStepDisplayInfo(selectedStep, steps.indexOf(selectedStep)).stepNumber} {selectedStep.initial ? '· inicial' : ''}
                      </h3>
                      <button
                        className="dc-btn"
                        style={{ fontSize: '11px', padding: '2px 8px' }}
                        onClick={() => setEditingStep(selectedStep)}
                        title="Editar propriedades da etapa" aria-label="Editar propriedades da etapa"
                      >
                        Editar propriedades
                      </button>
                    </div>

                    <label>
                      Nome
                      <input
                        className="dc-input"
                        value={selectedStep.name}
                        onChange={(event) =>
                          updateStep(selectedStep.id, { name: event.target.value }, 'auto', `grafcet:step:${selectedStep.id}:name`)
                        }
                      />
                    </label>

                    <label className="grafcet-inline">
                      <input
                        type="checkbox"
                        checked={selectedStep.initial || selectedStep.stepType === 'initial'}
                        onChange={(event) =>
                          updateStep(
                            selectedStep.id,
                            { initial: event.target.checked, stepType: event.target.checked ? 'initial' : 'simple' },
                            'force'
                          )
                        }
                      />
                      Etapa inicial
                    </label>

                    <label>
                      Comentário
                      <input
                        className="dc-input"
                        value={selectedStep.comment ?? selectedStep.description ?? ''}
                        placeholder="Descrição da etapa (opcional)"
                        onChange={(event) =>
                          updateStep(
                            selectedStep.id,
                            { comment: event.target.value, description: event.target.value },
                            'auto',
                            `grafcet:step:${selectedStep.id}:comment`
                          )
                        }
                      />
                    </label>

                    <div className="grafcet-step-tools">
                      <button
                        className="dc-btn"
                        onClick={() => {
                          useSimStore.getState().forceGrafcetSteps([selectedStep.id])
                          notify(`Etapa ${steps.indexOf(selectedStep)} forçada`)
                        }}
                        title="Torna esta a única etapa ativa (forçagem)"
                      >
                        ⚑ Forçar esta etapa
                      </button>
                      {runtime.active.includes(selectedStep.id) && (
                        <span className="grafcet-step-timer">ativa há {fmtSeconds(runtime.elapsed?.[selectedStep.id] ?? 0)}</span>
                      )}
                    </div>

                    <div className="grafcet-form-heading">
                      <h3>Ações</h3>
                      <button onClick={() => addActionToStep(selectedStep)}>+ ação</button>
                    </div>
                    <div className="grafcet-action-layout-toggle" role="group" aria-label="Disposição das ações no diagrama">
                      <span>Disposição:</span>
                      <button
                        type="button"
                        aria-pressed={stepActionLayout(selectedStep) === 'row'}
                        onClick={() => updateStep(selectedStep.id, { actionLayout: 'row' }, 'force')}
                        title="Ações lado a lado (a nova ação aparece à direita)"
                      >
                        ▭▭ Em linha
                      </button>
                      <button
                        type="button"
                        aria-pressed={stepActionLayout(selectedStep) === 'column'}
                        onClick={() => updateStep(selectedStep.id, { actionLayout: 'column' }, 'force')}
                        title="Ações empilhadas na vertical (a nova ação aparece por baixo)"
                      >
                        ▭ Empilhadas
                      </button>
                    </div>

                    {actionsOf(selectedStep).map((action, actionIndex) => {
                      const kind = action.kind ?? 'N'
                      const timed = ACTION_KINDS.find((k) => k.id === kind)?.timed
                      const isRowSelected = selectedActionId === action.id
                      return (
                        <div
                          className={`grafcet-action-row ${table[action.address] ? 'is-on' : ''} ${isRowSelected ? 'is-selected-action' : ''}`}
                          key={action.id}
                          onClick={() => {
                            setSelected(selectedStep.id)
                            setSelectedActionId(action.id)
                          }}
                        >
                          <select
                            className="dc-input grafcet-action-kind"
                            aria-label={`Tipo da ação ${actionIndex + 1}`}
                            title={ACTION_KINDS.find((k) => k.id === kind)?.hint}
                            value={kind}
                            onChange={(event) => setActionKind(selectedStep, action, event.target.value as GrafcetActionKind)}
                          >
                            {ACTION_KINDS.map((k) => (
                              <option key={k.id} value={k.id}>
                                {k.label}
                              </option>
                            ))}
                          </select>
                          <input
                            className="dc-input grafcet-action-address"
                            list="grafcet-action-addresses"
                            aria-label={`Endereço da ação ${actionIndex + 1}`}
                            title="Saída (Q) ou memória (M) comandada"
                            placeholder="Saída Q1"
                            value={action.address || action.variable || ''}
                            onChange={(event) =>
                              patchAction(selectedStep, action, {
                                address: event.target.value,
                                variable: event.target.value,
                              })
                            }
                            onBlur={(event) => {
                              const fixed = normalizeActionVariable(event.target.value)
                              if (fixed !== event.target.value) patchAction(selectedStep, action, { address: fixed, variable: fixed }, 'force')
                            }}
                          />
                          <input
                            className="dc-input grafcet-action-condition"
                            aria-label={`Condição da ação ${actionIndex + 1}`}
                            title="Condição de execução (1 = sempre)"
                            list="grafcet-condition-signals"
                            placeholder="Condição (1)"
                            value={action.condition}
                            onChange={(event) => patchAction(selectedStep, action, { condition: event.target.value })}
                          />
                          {timed && (
                            <label className="grafcet-time">
                              <input
                                className="dc-input"
                                type="number"
                                min={0.1}
                                step={0.1}
                                aria-label={`Tempo da ação ${actionIndex + 1} em segundos`}
                                value={(action.timeMs ?? 0) / 1000}
                                onChange={(event) =>
                                  patchAction(selectedStep, action, {
                                    timeMs: Math.max(0, Math.round(Number(event.target.value) * 1000)),
                                  })
                                }
                              />
                              s
                            </label>
                          )}
                          <button
                            type="button"
                            className="dc-btn grafcet-action-edit"
                            title="Editar propriedades da ação"
                            aria-label={`Editar propriedades da ação ${actionIndex + 1}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingAction({ step: selectedStep, action })
                            }}
                          >
                            ↗
                          </button>
                          <button
                            type="button"
                            className="grafcet-action-remove"
                            title="Remover ação"
                            aria-label={`Remover ação ${actionIndex + 1}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              removeAction(selectedStep, action.id)
                            }}
                          >
                            ×
                          </button>
                        </div>
                      )
                    })}

                    {!actionsOf(selectedStep).length && <p className="grafcet-form-empty">Esta etapa não tem ações.</p>}
                    <button className="dc-btn" onClick={() => addActionToStep(selectedStep)}>
                      + Adicionar ação
                    </button>

                    {freeActions.length > 0 && (
                      <div style={{ marginTop: '12px', padding: '10px', background: '#fffbeb', borderRadius: '6px', border: '1px solid #fde68a' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#b45309', display: 'block', marginBottom: '6px' }}>
                          Anexar ação solta a esta etapa:
                        </span>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {freeActions.map((fa) => (
                            <button
                              key={fa.id}
                              type="button"
                              className="dc-btn"
                              style={{ fontSize: '11px', padding: '2px 8px', background: '#fef3c7', color: '#92400e', border: '1px solid #f59e0b', cursor: 'pointer' }}
                              onClick={() => attachFreeAction(fa.id, selectedStep.id)}
                              title={`Anexar ação ${fa.variable || fa.address} à Etapa ${getStepDisplayInfo(selectedStep, steps.indexOf(selectedStep)).stepNumber}`}
                            >
                              + Anexar {fa.variable || fa.address}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <button className="dc-btn grafcet-danger" onClick={requestDelete}>
                      Eliminar etapa
                    </button>
                  </div>
                )}
              </>
            )}

            {/* ABA TRANSIÇÕES */}
            {tab === 'transitions' && (
              <>
                <p className="grafcet-hint">
                  Tecla <b>T</b> cria uma transição <b>solta</b>: arraste a barra sobre uma etapa (metade de cima = origem, de baixo = destino) ou
                  use a ferramenta <b>Ligar [L]</b> e una etapas por linha. A origem → vários destinos cria divergência AND; várias origens → um
                  destino cria convergência AND.
                </p>
                <div className="grafcet-entity-list">
                  {filteredTransitions.map((transition) => {
                    const index = transitions.indexOf(transition)
                    const conditionOn = running && transitionReceptivity(program, runtime, table, transition)
                    const incomplete = !transition.from.length || !transition.to.length
                    const getStepNum = (id: string) => {
                      const step = steps.find((s) => s.id === id)
                      return step ? getStepDisplayInfo(step, steps.indexOf(step)).stepNumber : '?'
                    }
                    return (
                      <div
                        className={`grafcet-transition-row ${selected === transition.id ? 'is-active' : ''} ${incomplete ? 'is-incomplete' : ''}`}
                        key={transition.id}
                      >
                        <button
                          onClick={() => setSelected(transition.id)}
                          aria-label={`Selecionar transição T${index + 1}${incomplete ? ' (incompleta)' : ''}`}
                          title={incomplete ? 'Transição solta/incompleta — arraste a barra sobre uma etapa ou ligue por linha (L)' : undefined}
                        >
                          <i className={conditionOn ? 'is-on' : incomplete ? 'is-pending' : ''} />
                          T{index + 1}: {transition.from.length ? transition.from.map(getStepNum).join('+') : '—'} →{' '}
                          {transition.to.length ? transition.to.map(getStepNum).join('+') : '—'}{' '}
                          <span className={!validCondition(transition.condition) ? 'grafcet-error' : ''}>[{transition.condition}]</span>
                          {incomplete && <em className="grafcet-tag-free">por ligar</em>}
                        </button>
                        <button
                          title="Aumentar prioridade"
                          aria-label={`Subir transição T${index + 1}`}
                          disabled={index === 0}
                          onClick={() => moveTransition(transition.id, -1)}
                        >
                          ↑
                        </button>
                        <button
                          title="Diminuir prioridade"
                          aria-label={`Descer transição T${index + 1}`}
                          disabled={index === transitions.length - 1}
                          onClick={() => moveTransition(transition.id, 1)}
                        >
                          ↓
                        </button>
                      </div>
                    )
                  })}
                  {!filteredTransitions.length && <p className="grafcet-list-empty">{query ? 'Nenhuma transição corresponde ao filtro.' : 'Ainda não há transições. Ligue duas etapas para criar a primeira.'}</p>}
                </div>

                {!selectedTransition && (
                  <p className="grafcet-hint">Selecione uma transição no diagrama ou na lista para definir condição e ligações.</p>
                )}

                {selectedTransition && (
                  <div className="grafcet-form grafcet-transition-inspector">
                    <div className="grafcet-form-heading">
                      <h3>Transição T{transitions.indexOf(selectedTransition) + 1}</h3>
                      {!demoMode && <button
                        className="dc-btn"
                        style={{ fontSize: '11px', padding: '2px 8px' }}
                        onClick={() => setEditingTransition(selectedTransition)}
                        title="Editar propriedades da transição" aria-label="Editar propriedades da transição"
                      >
                        Editar propriedades
                      </button>}
                    </div>

                    <section className="grafcet-inspector-group is-condition" aria-label="Condição da transição">
                      <ConditionEditor id="inspector-trans-condition-input" value={selectedTransition.condition} onChange={(condition) => updateTransition(selectedTransition.id, { condition }, 'auto', `grafcet:transition:${selectedTransition.id}:condition`)} signals={signalSuggestions} availableSteps={program.steps} resetKey={selectedTransition.id} active={!signalsOpen && !helpOpen && !editingStep && !editingAction && !editingTransition} />

                      <div className="grafcet-condition-state">
                        <span className={transitionReceptivity(program, runtime, table, selectedTransition) ? 'is-on' : ''}>
                          <i /> Resultado atual:{' '}
                          {transitionReceptivity(program, runtime, table, selectedTransition) ? 'VERDADEIRO' : 'FALSO'}
                        </span>
                      </div>

                      {!validCondition(selectedTransition.condition) && (
                        <small className="grafcet-error">Expressão inválida: use I/Q/M, Xn, 10s/X1, T(2s), ^I1, \I1, !, *, + e parênteses.</small>
                      )}
                    </section>

                    <section className="grafcet-inspector-group is-connections" aria-label="Ligações da transição">
                      <h4>Ligações</h4>
                      {(['from', 'to'] as const).map((field) => (
                        <fieldset className="grafcet-transition-links" key={field}>
                          <legend>{field === 'from' ? 'Origens (todas ativas)' : 'Destinos (ativados juntos)'}</legend>
                          <div className="grafcet-step-checks">
                            {steps.map((step, index) => {
                              const checked = selectedTransition[field].includes(step.id)
                              return (
                                <label className={`grafcet-transition-step-option${checked ? ' is-selected' : ''}`} key={step.id}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                      updateTransition(selectedTransition.id, { [field]: choose(selectedTransition[field], step.id) }, 'force')
                                    }
                                  />
                                  <span>{index} · {step.name}</span>
                                </label>
                              )
                            })}
                          </div>
                        </fieldset>
                      ))}
                    </section>

                    {(!selectedTransition.from.length || !selectedTransition.to.length) && (
                      <small className="grafcet-error">Escolha pelo menos uma origem e um destino.</small>
                    )}

                    <section className="grafcet-inspector-group is-actions" aria-label="Ações e comentário">
                      <button
                        className="dc-btn grafcet-fire-transition"
                        disabled={!selectedTransition.from.every((value) => runtime.active.includes(value)) || !selectedTransition.from.length}
                        title="Dispara a transição ignorando a condição (só se as origens estiverem ativas)"
                        onClick={() =>
                          notify(
                            useSimStore.getState().fireGrafcetTransition(selectedTransition.id)
                              ? 'Transição disparada'
                              : 'As etapas de origem não estão ativas'
                          )
                        }
                      >
                        ▶ Disparar manualmente
                      </button>

                      <label className="grafcet-transition-comment">
                        Comentário
                        <input
                          className="dc-input"
                          value={selectedTransition.comment ?? ''}
                          placeholder="Descrição (opcional)"
                          onChange={(event) =>
                            updateTransition(
                              selectedTransition.id,
                              { comment: event.target.value },
                              'auto',
                              `grafcet:transition:${selectedTransition.id}:comment`
                            )
                          }
                        />
                      </label>

                      <button className="dc-btn grafcet-danger grafcet-delete-transition" onClick={requestDelete}>
                        Eliminar transição
                      </button>
                    </section>
                  </div>
                )}
              </>
            )}

            {/* ABA SIMULADOR */}
            {tab === 'signals' && (
              <SignalsPanel
                tags={tags}
                live={table}
                running={running}
                usage={usageBySignal}
                undeclared={undeclared}
                context={signalsContext}
                onUse={applySignal}
                onOpenTable={() => setSignalsOpen(true)}
              />
            )}

            {tab === 'io' && simVisible && (
              <div className="grafcet-io">
                <GrafcetSimBar />
                <GrafcetSimPanel
                  program={program}
                  runtime={runtime}
                  stepLabel={(stepId) => {
                    const index = steps.findIndex((step) => step.id === stepId)
                    return index < 0 ? '?' : getStepDisplayInfo(steps[index], index).stepNumber
                  }}
                  extraBits={liveBitsAll}
                  stepDescription={(stepId) => {
                    const index = steps.findIndex((step) => step.id === stepId)
                    const step = steps[index]
                    return step ? getStepDisplayInfo(step, index).comment || step.name || '' : ''
                  }}
                  onOpenStep={(stepId) => {
                    setSelected(stepId)
                    setTab('steps')
                  }}
                  onRenameTransition={(transitionId, name) =>
                    updateTransition(transitionId, { name }, 'auto', `grafcet:transition:${transitionId}:name`)
                  }
                  onRenameAllTransitions={(names) => {
                    save({ transitions: transitions.map((t) => (names[t.id] ? { ...t, name: names[t.id] } : t)) }, 'force')
                    notify(`${Object.keys(names).length} transição(ões) nomeada(s)`)
                  }}
                  onOpenTransition={(transitionId) => {
                    setSelected(transitionId)
                    setTab('transitions')
                  }}
                />
              </div>
            )}

            {/* ABA DIAGNÓSTICO */}
            {tab === 'diagnostics' && (
              <div className="grafcet-diagnostics">
                <div className={`grafcet-diagnostic-summary ${issues.length ? 'has-issues' : 'is-valid'}`} role="status" aria-live="polite">
                  <strong>
                    {issues.length
                      ? `${errorCount} erro${errorCount === 1 ? '' : 's'} · ${issues.length - errorCount} aviso${
                          issues.length - errorCount === 1 ? '' : 's'
                        }`
                      : 'Programa validado'}
                  </strong>
                  <span>
                    {issues.length
                      ? 'Selecione um problema para abrir a entidade correspondente.'
                      : 'Todas as etapas, ações e transições estão coerentes.'}
                  </span>
                </div>
                {issues.map((issue) => (
                  <button key={issue.id} className={`grafcet-issue is-${issue.level}`} onClick={() => selectIssue(issue)}>
                    <b>{issue.level === 'error' ? '✖' : '!'}</b>
                    <span>{issue.message}</span>
                    <em>abrir</em>
                  </button>
                ))}
                {!issues.length && (
                  <div className="grafcet-validation-checks">
                    <span><IconCheck size={10} className="ui-ck" />Etapa inicial definida</span>
                    <span><IconCheck size={10} className="ui-ck" />Ligações completas</span>
                    <span><IconCheck size={10} className="ui-ck" />Condições válidas</span>
                    <span><IconCheck size={10} className="ui-ck" />Ações endereçadas</span>
                    <span><IconCheck size={10} className="ui-ck" />Todas as etapas alcançáveis</span>
                  </div>
                )}
              </div>
            )}

            <div className="grafcet-live-status" hidden={!simVisible}>
              <span className={running ? 'is-running' : ''}>
                <i />
                {running ? 'Simulação ativa' : 'Parado'}
              </span>
              <small>Saídas ativas: {liveBits.join(', ') || 'nenhuma'}</small>
            </div>
          </aside>
        )}
      </div>

      {!full && (
        <div className="grafcet-preview-status" role="status">
          <span className={running ? 'is-running' : ''}>● {running ? 'Simulação ativa' : 'Parado'}</span>
          <span>
            {runtime.active.length
              ? `Etapas ativas: ${runtime.active
                  .map((value) => {
                    const step = steps.find((s) => s.id === value)
                    return step ? getStepDisplayInfo(step, steps.indexOf(step)).stepNumber : '?'
                  })
                  .join(', ')}`
              : 'Nenhuma etapa ativa'}
          </span>
          <span>Arraste para navegar · roda para ampliar</span>
        </div>
      )}

      {signalsOpen && <SignalTableDialog onClose={() => setSignalsOpen(false)} />}

      {/* DIÁLOGOS FLUIDSIM E ATALHOS */}
      <StepDialog
        open={!!editingStep}
        step={editingStep}
        stepIndex={editingStep ? steps.findIndex((s) => s.id === editingStep.id) : 0}
        availableSteps={program.steps}
        transitions={transitions}
        onSave={(patch) => {
          if (editingStep) updateStep(editingStep.id, patch, 'force')
        }}
        onClose={() => setEditingStep(null)}
      />

      <TransitionDialog
        open={!!editingTransition}
        transition={editingTransition}
        transitionIndex={editingTransition ? transitions.findIndex((transition) => transition.id === editingTransition.id) : 0}
        availableSteps={program.steps}
        signals={signalSuggestions}
        onSave={(patch) => {
          if (editingTransition) updateTransition(editingTransition.id, patch, 'force')
        }}
        onClose={() => setEditingTransition(null)}
      />

      <ActionDialog
        open={!!editingAction}
        action={editingAction?.action ?? null}
        signals={signalSuggestions}
        availableSteps={program.steps}
        program={program}
        ownerStep={editingAction?.step ?? null}
        ownerStepIndex={editingAction?.step ? program.steps.findIndex((step) => step.id === editingAction.step?.id) : 0}
        onSave={(patch) => {
          if (!editingAction) return
          if (editingAction.step) patchAction(editingAction.step, editingAction.action, patch, 'force')
          else patchFreeAction(editingAction.action, patch, 'force')
        }}
        onClose={() => setEditingAction(null)}
      />

      <GrafcetShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />

      <GrafcetImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onChoose={(file) => { void importGrafcet(file) }}
      />

      {menu && <GrafcetContextMenu x={menu.x} y={menu.y} items={menuItems()} onClose={closeMenu} />}

      {/* MODAL DE MODELOS PRONTOS */}
      <GrafcetTemplatesDialog
        open={templatesOpen}
        templates={GRAFCET_TEMPLATES}
        onClose={() => setTemplatesOpen(false)}
        onLoad={loadTemplate}
        onLoadExample={() => {
          loadExample()
          setTemplatesOpen(false)
        }}
      />

      {toast && (
        <div key={toast.id} className="ladder-toast grafcet-toast" role="status" aria-live="polite">
          {toast.text}
        </div>
      )}
    </div>
  )
}
