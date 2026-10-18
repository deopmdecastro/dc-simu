import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent, type WheelEvent } from 'react'
import { uiConfirm } from '../ui/dialogs'
import { isSmallScreen } from '../ui/cleanMode'
import { useSimStore } from '../store/useSimStore'
import {
  ACTION_KINDS,
  actionsOfStep,
  evalCondition,
  transitionsOf,
  validateGrafcet,
  validCondition,
  type GrafcetAction,
  type GrafcetActionKind,
  type GrafcetIssue,
  type GrafcetStep,
  type GrafcetTransition,
  type GrafcetProgram,
} from './engine'
import StepDialog from './StepDialog'
import ActionDialog from './ActionDialog'
import TransitionDialog from './TransitionDialog'
import { GRAFCET_TEMPLATES, type GrafcetTemplateInfo } from './templates'
import { renderConditionTspans, fmtDuration } from './grafcetRender'
import VirtualIoPanel from '../components/VirtualIoPanel'
import { grafcetToLadder } from './toLadder'
import { collectUsedAddresses } from '../ladder/ladderEngine'
import { allowedViews } from '../project/kind'
import { triggerN8nWorkflow } from '../n8n/n8nClient'
import {
  IconChevronRight,
  IconCopy,
  IconCursor,
  IconDelete,
  IconHand,
  IconHelp,
  IconLock,
  IconRedo,
  IconSearch,
  IconUndo,
  IconZoomIn,
  IconZoomOut,
} from '../ui/icons'
import GrafcetShortcutsDialog from './GrafcetShortcutsDialog'
import { useEditorShortcuts } from '../ui/shortcuts'
import { useGrafcetUi, type GrafcetBusAction, type GrafcetCanvasTool } from './grafcetBus'

const id = () => crypto.randomUUID()

type PaletteItem = 'initial' | 'step' | 'transition' | 'action' | 'conditional' | 'fork' | 'join'
type EditorTab = 'steps' | 'transitions' | 'io' | 'diagnostics'
type HistoryMode = 'auto' | 'force' | 'skip'
type ValidationIssue = GrafcetIssue

const GRAFCET_MIME = 'application/x-dcsimu-grafcet'
const PALETTE: Array<{ group: string; items: Array<{ kind: PaletteItem; icon: string; name: string; detail: string }> }> = [
  {
    group: 'Etapas e ligações',
    items: [
      { kind: 'initial', icon: '◎', name: 'Etapa inicial', detail: 'Ponto de partida da sequência' },
      { kind: 'step', icon: '□', name: 'Etapa ligada', detail: 'Nova etapa após a selecionada' },
      { kind: 'transition', icon: '─', name: 'Transição', detail: 'Condição entre duas etapas' },
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
]

const norm = (value: string) =>
  value
    .toLocaleLowerCase('pt-PT')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

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

export default function GrafcetEditor({ full = false, onOpenEditor }: { full?: boolean; onOpenEditor?: () => void }) {
  const program = useSimStore((state) => state.grafcet)
  const runtime = useSimStore((state) => state.grafcetRuntime)
  const table = useSimStore((state) => state.runtime.table)
  const tags = useSimStore((state) => state.tags)
  const setGrafcet = useSimStore((state) => state.setGrafcet)
  const history = useSimStore((state) => state.history)
  const future = useSimStore((state) => state.future)
  const running = useSimStore((state) => state.sim.runState === 'running')
  const blackBox = useSimStore((state) => state.sim.blackBox)
  const projectKind = useSimStore((state) => state.projectKind)
  const canGenerateLadder = allowedViews(projectKind).includes('ladder')

  const steps = program.steps
  const transitions = transitionsOf(program)
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
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const paletteSearchRef = useRef<HTMLInputElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // FluidSIM Dialogs state
  const [editingStep, setEditingStep] = useState<GrafcetStep | null>(null)
  const [editingTransition, setEditingTransition] = useState<GrafcetTransition | null>(null)
  const [editingAction, setEditingAction] = useState<{ step: GrafcetStep; action: GrafcetAction } | null>(null)
  const [hoveredStepId, setHoveredStepId] = useState<string | null>(null)
  const [hoveredTransitionId, setHoveredTransitionId] = useState<string | null>(null)
  const [hoveredActionId, setHoveredActionId] = useState<string | null>(null)
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Ferramentas ativas: Selecionar vs Arrastar (Mão)
  const activeTool = useGrafcetUi((state) => state.tool)
  const setCanvasTool = useGrafcetUi((state) => state.setTool)
  const [isSpacePan, setIsSpacePan] = useState(false)
  const spacePressed = useRef(false)

  // Arrastamento direto de etapas para reposicionamento/reordenação na sequência
  const [draggingStepId, setDraggingStepId] = useState<string | null>(null)
  const [stepDragOffset, setStepDragOffset] = useState<number | null>(null)
  const [dropTargetStepId, setDropTargetStepId] = useState<string | null>(null)
  const stepDragStartRef = useRef<{ stepId: string; startY: number; origIndex: number; hasMoved: boolean } | null>(null)

  const selectedStep = steps.find((step) => step.id === selected)
  const selectedTransition = transitions.find((transition) => transition.id === selected)
  const selectedAction = selectedStep ? (actionsOf(selectedStep).find((a) => a.id === selectedActionId) ?? null) : null

  const isStepSelected = (stepId: string) => selected === stepId && !selectedActionId
  const isActionSelected = (actionId: string) => selectedActionId === actionId
  const isTransitionSelected = (transId: string) => selected === transId && !selectedActionId

  useEffect(() => {
    try {
      localStorage.setItem('dcsimu:grafcet:palette', showPalette ? '1' : '0')
    } catch {
      /* navegação privada */
    }
  }, [showPalette])

  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  useEffect(() => {
    if (selected && !steps.some((step) => step.id === selected) && !transitions.some((transition) => transition.id === selected)) {
      setSelected(null)
      setSelectedActionId(null)
    }
  }, [selected, steps, transitions])

  const notify = (text: string) => {
    window.clearTimeout(toastTimer.current)
    setToast({ id: Date.now(), text })
    toastTimer.current = window.setTimeout(() => setToast(null), 1500)
  }

  const save = (patch: Partial<GrafcetProgram>, mode: HistoryMode = 'force', historyKey = 'grafcet') =>
    setGrafcet({ ...program, transitions, ...patch }, mode, historyKey)

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

  const appendToCondition = (transition: GrafcetTransition, token: string) => {
    const base = transition.condition.trim()
    const joined = !base || base === '1' ? token : /[&|(!]$/.test(base) ? `${base} ${token}` : `${base} & ${token}`
    updateTransition(transition.id, { condition: joined.toUpperCase() }, 'force')
  }

  const generateLadder = async () => {
    if (!steps.length) return notify('Crie primeiro as etapas do GRAFCET')
    if (errorCount) return notify('Corrija os erros do GRAFCET antes de gerar o Ladder')
    const state = useSimStore.getState()
    const result = grafcetToLadder({ ...program, transitions }, collectUsedAddresses(state.ladder))
    const note = result.warnings.length ? `\n\nAvisos:\n- ${result.warnings.join('\n- ')}` : ''
    if (
      !(await uiConfirm(
        `Acrescentar ${result.rungs.length} networks ao programa Ladder ativo?\n\nCada etapa usa um bit M do PLC, reproduzindo a execução do GRAFCET no PLC.${note}`
      ))
    )
      return
    state.appendRungs(result.rungs)
    notify(`${result.rungs.length} networks Ladder criadas`)
  }

  const sendToN8n = async () => {
    if (!steps.length) return notify('Crie primeiro o GRAFCET antes de enviar para o n8n')
    notify('A enviar dados para o workflow n8n...')
    try {
      const state = useSimStore.getState()
      const ladderRes = grafcetToLadder({ ...program, transitions }, collectUsedAddresses(state.ladder))
      const res = await triggerN8nWorkflow({
        event: 'grafcet.export',
        project: { name: state.currentProjectName || 'GRAFCET DC-SIMU' },
        grafcet: {
          stepsCount: steps.length,
          transitionsCount: transitions.length,
          steps,
          transitions,
          ladder: JSON.stringify(ladderRes.rungs),
        },
        meta: {
          activeSteps: runtime.active,
          errors: errorCount,
        },
      })
      notify(res.message || '✓ Dados enviados para o workflow n8n (MipSJCjJ6fya9UGt)')
    } catch (err) {
      notify(`Erro ao comunicar com n8n: ${String(err)}`)
    }
  }

  const addStep = () => {
    const nextIdx = steps.length
    const newStep: GrafcetStep = {
      id: id(),
      name: `Etapa ${nextIdx}`,
      initial: steps.length === 0,
      stepType: steps.length === 0 ? 'initial' : 'simple',
      action: '',
      condition: 'I1',
      actions: [],
    }
    save({ steps: [...steps, newStep] })
    setSelected(newStep.id)
    setTab('steps')
    notify(newStep.initial ? 'Etapa inicial criada' : 'Etapa solta criada')
  }

  const addConnectedStep = (fromStep?: GrafcetStep) => {
    const source = fromStep ?? selectedStep ?? steps[steps.length - 1]
    if (!source) return addStep()
    const nextIdx = steps.length
    
    // Procura o próximo número lógico para a etapa (ex: se anterior é 81, tenta 82 ou 85)
    let nextName = `Etapa ${nextIdx}`
    if (/^\d+$/.test(source.name.trim())) {
      const num = parseInt(source.name.trim(), 10)
      const existingNames = new Set(steps.map((s) => s.name.trim()))
      let candidate = num + 1
      while (existingNames.has(String(candidate))) {
        candidate++
      }
      nextName = String(candidate)
    }

    const newStep: GrafcetStep = {
      id: id(),
      name: nextName,
      initial: false,
      stepType: 'simple',
      action: '',
      condition: 'I1',
      actions: [],
    }

    // Comportamento inteligente estilo grafcet.io:
    // Se a etapa de origem já tiver uma única transição de saída para outra etapa,
    // insere a nova etapa ENTRE a origem e a próxima etapa!
    const outgoing = transitions.find((t) => t.from.length === 1 && t.from[0] === source.id && t.to.length === 1)
    if (outgoing && steps.some((s) => s.id === outgoing.to[0])) {
      const nextTargetId = outgoing.to[0]
      const newTransition: GrafcetTransition = {
        id: id(),
        from: [newStep.id],
        to: [nextTargetId],
        condition: '1',
      }
      const updatedOutgoing: GrafcetTransition = {
        ...outgoing,
        to: [newStep.id],
      }
      const sourceIndex = steps.indexOf(source)
      const newSteps = [...steps.slice(0, sourceIndex + 1), newStep, ...steps.slice(sourceIndex + 1)]
      save({
        steps: newSteps,
        transitions: transitions.map((t) => (t.id === outgoing.id ? updatedOutgoing : t)).concat(newTransition),
      })
      setSelected(newStep.id)
      setTab('steps')
      notify(`Etapa ${newStep.name} inserida na sequência`)
      return
    }

    save({
      steps: [...steps, newStep],
      transitions: [...transitions, { id: id(), from: [source.id], to: [newStep.id], condition: 'I1' }],
    })
    setSelected(newStep.id)
    setTab('steps')
    notify(`Etapa ${newStep.name} e transição criadas`)
  }

  const addActionToStep = (target: GrafcetStep, conditional = false) => {
    const used = new Set(steps.flatMap((step) => [step.action, ...(step.actions ?? []).map((action) => action.address)]))
    let n = 1
    while (used.has(`Q${n}`)) n++
    updateStep(
      target.id,
      { actions: [...(target.actions ?? []), { id: id(), address: `Q${n}`, variable: `Q${n}`, condition: conditional ? 'I1' : '1', kind: 'N' }] },
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
    save({ transitions: transitions.filter((transition) => transition.id !== transitionId) })
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
    if (full) {
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

  const selectTransition = (transition: GrafcetTransition, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    if (full) {
      setSelected(transition.id)
      setSelectedActionId(null)
      setTab('transitions')
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

  const addTransition = () => {
    if (steps.length < 2) return
    const sourceIndex = Math.max(0, steps.findIndex((step) => step.id === selected))
    const transition: GrafcetTransition = {
      id: id(),
      from: [steps[sourceIndex].id],
      to: [steps[(sourceIndex + 1) % steps.length].id],
      condition: 'I1',
    }
    save({ transitions: [...transitions, transition] })
    setSelected(transition.id)
    setTab('transitions')
    notify('Transição criada')
  }

  const moveTransition = (transitionId: string, direction: -1 | 1) => {
    const index = transitions.findIndex((transition) => transition.id === transitionId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= transitions.length) return
    const reordered = [...transitions]
    ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
    save({ transitions: reordered })
  }

  const addInitial = () => {
    const newStep: GrafcetStep = {
      id: id(),
      name: `Etapa ${steps.length}`,
      initial: true,
      stepType: 'initial',
      action: '',
      condition: 'I1',
      actions: [],
    }
    save({ steps: [...steps, newStep] })
    setSelected(newStep.id)
    setTab('steps')
    notify('Etapa inicial criada')
  }

  const addAction = (conditional: boolean) => {
    const target = selectedStep ?? steps[steps.length - 1]
    if (!target) return
    const used = new Set(steps.flatMap((step) => [step.action, ...(step.actions ?? []).map((action) => action.address)]))
    let n = 1
    while (used.has(`Q${n}`)) n++
    updateStep(
      target.id,
      { actions: [...(target.actions ?? []), { id: id(), address: `Q${n}`, variable: `Q${n}`, condition: conditional ? 'I1' : '1', kind: 'N' }] },
      'force'
    )
    setSelected(target.id)
    setTab('steps')
    notify(conditional ? 'Ação condicionada criada' : 'Ação criada')
  }

  const addFork = () => {
    const source = selectedStep ?? steps[steps.length - 1]
    if (!source) return
    const left: GrafcetStep = { id: id(), name: 'Ramo A', initial: false, action: '', condition: 'I1', actions: [] }
    const right: GrafcetStep = { id: id(), name: 'Ramo B', initial: false, action: '', condition: 'I1', actions: [] }
    save({
      steps: [...steps, left, right],
      transitions: [...transitions, { id: id(), from: [source.id], to: [left.id, right.id], condition: 'I1' }],
    })
    setSelected(left.id)
    setTab('steps')
    notify('Divergência AND criada')
  }

  const addJoin = () => {
    if (steps.length < 2) return
    const primary = selectedStep ?? steps[steps.length - 1]
    const fork = transitions.find((transition) => transition.to.length >= 2 && transition.to.includes(primary.id))
    const otherId =
      fork?.to.find((value) => value !== primary.id && steps.some((step) => step.id === value)) ??
      [...steps].reverse().find((step) => step.id !== primary.id)?.id
    if (!otherId) return
    const next: GrafcetStep = { id: id(), name: 'Após convergência', initial: false, action: '', condition: 'I1', actions: [] }
    save({
      steps: [...steps, next],
      transitions: [...transitions, { id: id(), from: [primary.id, otherId], to: [next.id], condition: 'I1' }],
    })
    setSelected(next.id)
    setTab('steps')
    notify('Convergência AND criada')
  }

  const loadExample = () => {
    const a = id(),
      b = id(),
      c = id()
    save({
      steps: [
        { id: a, name: 'Espera', initial: true, stepType: 'initial', action: '', condition: 'I1', actions: [] },
        { id: b, name: 'Motor A', initial: false, stepType: 'simple', action: '', condition: 'I2', actions: [{ id: id(), address: 'Q1', variable: 'Q1', condition: '1', kind: 'N' }] },
        { id: c, name: 'Motor B', initial: false, stepType: 'simple', action: '', condition: 'I3', actions: [{ id: id(), address: 'Q2', variable: 'Q2', condition: '1', kind: 'N' }] },
      ],
      transitions: [
        { id: id(), from: [a], to: [b], condition: 'I1' },
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

  const usePalette = (kind: PaletteItem) => {
    if (kind === 'initial') addInitial()
    else if (kind === 'step') addConnectedStep()
    else if (kind === 'transition') addTransition()
    else if (kind === 'action') addAction(false)
    else if (kind === 'conditional') addAction(true)
    else if (kind === 'fork') addFork()
    else addJoin()
  }

  const paletteDisabled = (kind: PaletteItem) =>
    kind === 'transition' || kind === 'join'
      ? steps.length < 2
      : kind === 'action' || kind === 'conditional' || kind === 'fork'
      ? steps.length === 0
      : false

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
  let cursorY = 70
  steps.forEach((step) => {
    stepPositions.set(step.id, cursorY)
    cursorY += Math.max(140, actionsOf(step).length * 36 + 88)
  })
  const stepY = (stepId: string) => stepPositions.get(stepId) ?? 70
  const width = full ? 760 : 560
  const height = Math.max(280, cursorY + 35)

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

  const fit = full ? Math.min(1.35, Math.max(0.45, (viewport.width - 70) / width)) : Math.min(1, Math.max(0.25, (viewport.width - 28) / width))
  const scale = zoom ?? fit
  const position = pan ?? { x: (viewport.width - width * scale) / 2, y: full ? 38 : 22 }
  const clamp = (value: number) => Math.max(0.25, Math.min(2.5, value))

  const zoomAt = (value: number, point: { x: number; y: number }) => {
    const next = clamp(value)
    setPan({ x: point.x - ((point.x - position.x) * next) / scale, y: point.y - ((point.y - position.y) * next) / scale })
    setZoom(next)
  }

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
      setIsDragging(true)
      dragRef.current = { x: event.clientX, y: event.clientY, px: position.x, py: position.y }
    }
  }

  const onPreviewMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    setPan({ x: dragRef.current.px + event.clientX - dragRef.current.x, y: dragRef.current.py + event.clientY - dragRef.current.y })
  }

  const onPreviewUp = (event: PointerEvent<HTMLDivElement>) => {
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
        setSelected(null)
        setSelectedActionId(null)
      }
    }
  }

  const onStepPointerDown = (step: GrafcetStep, e: React.PointerEvent) => {
    if (activeTool !== 'select' || isSpacePan) return
    if (e.button !== 0) return
    if ((e.target as Element).closest('.grafcet-node-handle, button')) return
    e.stopPropagation()
    stepDragStartRef.current = {
      stepId: step.id,
      startY: e.clientY,
      origIndex: steps.findIndex((s) => s.id === step.id),
      hasMoved: false,
    }
    setDraggingStepId(step.id)
    try {
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    } catch {
      /* noop */
    }
  }

  const onStepPointerMove = (step: GrafcetStep, e: React.PointerEvent) => {
    if (!stepDragStartRef.current || stepDragStartRef.current.stepId !== step.id) return
    const dy = e.clientY - stepDragStartRef.current.startY
    if (Math.abs(dy) > 5) {
      stepDragStartRef.current.hasMoved = true
    }
    if (!stepDragStartRef.current.hasMoved) return
    const scaledDy = dy / scale
    setStepDragOffset(scaledDy)

    const currentY = stepY(step.id) + scaledDy
    let closestStep = steps[0]
    let minDiff = Infinity
    steps.forEach((s) => {
      if (s.id === step.id) return
      const diff = Math.abs(stepY(s.id) - currentY)
      if (diff < minDiff) {
        minDiff = diff
        closestStep = s
      }
    })
    if (minDiff < 75) {
      setDropTargetStepId(closestStep.id)
    } else {
      setDropTargetStepId(null)
    }
  }

  const onStepPointerUp = (step: GrafcetStep, e: React.PointerEvent) => {
    if (!stepDragStartRef.current || stepDragStartRef.current.stepId !== step.id) return
    const { origIndex, hasMoved } = stepDragStartRef.current
    try {
      ;(e.currentTarget as Element).releasePointerCapture(e.pointerId)
    } catch {
      /* noop */
    }
    const targetId = dropTargetStepId
    setDraggingStepId(null)
    setStepDragOffset(null)
    setDropTargetStepId(null)
    stepDragStartRef.current = null

    if (!hasMoved) {
      setSelected(step.id)
      setSelectedActionId(null)
      setTab('steps')
      return
    }

    if (targetId && targetId !== step.id) {
      const targetIndex = steps.findIndex((s) => s.id === targetId)
      if (targetIndex !== -1 && targetIndex !== origIndex) {
        const reordered = [...steps]
        const [moved] = reordered.splice(origIndex, 1)
        reordered.splice(targetIndex, 0, moved)
        save({ steps: reordered })
        setSelected(step.id)
        notify(`Etapa ${step.name} reposicionada na sequência`)
      }
    }
  }

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
    a.download = `grafcet-project-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    notify('Projeto GRAFCET exportado')
  }

  const importJson = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string)
        if (parsed.steps && Array.isArray(parsed.steps)) {
          save(parsed, 'force')
          resetView()
          notify('Projeto GRAFCET importado')
        } else {
          notify('Ficheiro inválido: estrutura de etapas não encontrada')
        }
      } catch {
        notify('Erro ao ler o ficheiro JSON')
      }
    }
    reader.readAsText(file)
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
      if (typing || helpOpen || editingStep || editingTransition || editingAction || templatesOpen) return
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
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selected || selectedActionId) {
          event.preventDefault()
          requestDelete()
        }
        return
      }
      if (event.key === 'Escape') {
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
            setEditingAction({ step: selectedStep, action: act })
            return
          }
        }
        if (selectedStep) {
          event.preventDefault()
          setEditingStep(selectedStep)
          return
        }
        if (selectedTransition) {
          event.preventDefault()
          setEditingTransition(selectedTransition)
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
        case 'openTemplates':
          setTemplatesOpen(true)
          break
        case 'generateLadder':
          void generateLadder()
          break
        case 'sendToN8n':
          void sendToN8n()
          break
        case 'exportSvg':
          exportSvg()
          break
        case 'exportJson':
          exportJson()
          break
        case 'importJson':
          fileInputRef.current?.click()
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
    { enabled: full && !helpOpen }
  )

  const tagNames = tags.map((t) => t.name).filter(Boolean)
  const tagAddresses = tags.map((t) => t.address).filter(Boolean)
  const stepNames = steps.map((s, idx) => s.name || String(idx))
  const stepBits = stepNames.map((n) => `X${n}`)
  const stepTimers = stepNames.flatMap((n) => [`1s/X${n}`, `2s/X${n}`, `5s/X${n}`])

  const actionAddresses = tags.filter((tag) => /^[QM]\d{1,2}$/.test(tag.address))

  const actionVariableSuggestions = Array.from(new Set([
    ...tagAddresses.filter((a) => /^[QM]/.test(a)),
    ...tagNames,
    'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8',
    'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8',
    'KM1', 'KM2', 'KM3',
    'L_Verde', 'L_Amarela', 'L_Vermelha', 'Buzzer',
    'Y0_A+', 'Y1_A-', 'Y2_B+', 'Y3_B-', 'Y4_C+', 'C-', 'Y5_D+', 'Y6_D-',
    ...steps.flatMap((step) => actionsOf(step).map((a) => a.variable || a.address)).filter(Boolean)
  ]))

  const transitionVariableSuggestions = Array.from(new Set([
    ...tagAddresses,
    ...tagNames,
    'I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8',
    'B_Start', 'B_Stop_NF', 'In_Man', 'B_Reset', 'Emerg_NF', 'Int_Emerg_NF',
    'fc_a0', 'fc_a1', 'fc_b0', 'fc_b1', 'b0', 'b1', 'a0', 'a1', 'S_Rolamento',
    ...stepBits,
    ...stepTimers,
    'Q1', 'Q2', 'Q3', 'Q4', 'M1', 'M2', 'M3', 'M4',
    '1HZ', '0.5HZ', '2HZ', '1'
  ]))

  const liveBitsAll = [...new Set(steps.flatMap((step) => actionsOf(step).map((action) => action.address.trim().toUpperCase())))]
  const liveBits = Object.entries(table)
    .filter(([key, value]) => /^[QM]/.test(key) && value)
    .map(([key]) => key)

  return (
    <div className={`grafcet-editor grafcet-designer ${full ? 'grafcet-full' : 'grafcet-preview'}`}>
      <input ref={fileInputRef} type="file" accept=".json,.grafcet" style={{ display: 'none' }} onChange={importJson} />

      {!full && (
        /* Modo Pré-visualização lateral (dock) */
        <header className="grafcet-header">
          <div className="grafcet-title">
            <strong>GRAFCET</strong>
            <small>
              {steps.length} etapas · {transitions.length} transições · {runtime.active.length} ativas
            </small>
          </div>
          <button className="dc-btn-primary dc-btn" onClick={onOpenEditor}>
            Abrir editor ↗
          </button>
        </header>
      )}

      {/* CORPO DO DESIGNER: Painel de Ferramentas à Esquerda + Canvas no Centro + Propriedades à Direita */}
      <div className="grafcet-designer-body">
        {/* PALETA DE COMPONENTES (Layout clássico com busca e recolher) */}
        {full &&
          (showPalette ? (
            <aside className="grafcet-toolbox" aria-label="Ferramentas GRAFCET">
              <div className="grafcet-toolbox-head">
                <div>
                  <strong>Componentes</strong>
                  <small>Construa e ligue a sequência</small>
                </div>
                <button title="Recolher ferramentas (Ctrl+B)" aria-label="Recolher ferramentas" onClick={() => setShowPalette(false)}>
                  ‹
                </button>
              </div>

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
                  <button onClick={() => setPaletteFilter('')} title="Limpar pesquisa">
                    ×
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
                          onClick={() => usePalette(item.kind)}
                          draggable={!paletteDisabled(item.kind)}
                          onDragStart={(event) => {
                            event.dataTransfer.setData(GRAFCET_MIME, item.kind)
                            event.dataTransfer.effectAllowed = 'copy'
                          }}
                          className="grafcet-toolbox-item"
                          title={`${item.name}: clique ou arraste para o diagrama`}
                        >
                          <span className="grafcet-toolbox-icon">{item.icon}</span>
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
              <p className="grafcet-toolbox-tip">Selecione uma etapa e clique ou arraste um componente. Configure a entidade no painel à direita.</p>
            </aside>
          ) : (
            <button className="grafcet-toolbox-restore" onClick={() => setShowPalette(true)} title="Mostrar componentes (Ctrl+B)">
              <IconChevronRight size={11} /> Ferramentas
            </button>
          ))}

        {/* CANVAS CENTRAL COM O DIAGRAMA VERTICAL ROBUSTO */}
        <div
          ref={viewportRef}
          className={`grafcet-canvas ${activeTool === 'pan' ? 'is-pan-mode' : 'is-select-mode'} ${isSpacePan ? 'is-space-pan' : ''} ${dropActive ? 'is-palette-drop' : ''} ${isDragging ? 'is-dragging' : ''}`}
          aria-label="Diagrama GRAFCET"
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
                    usePalette(kind)
                  }
                }
              : undefined
          }
          onWheel={onPreviewWheel}
          onPointerDown={onPreviewDown}
          onPointerMove={onPreviewMove}
          onPointerUp={onPreviewUp}
          onPointerCancel={onPreviewUp}
        >
          {/* Estado Vazio Amigável */}
          {!steps.length && (
            <div className="grafcet-empty">
              <strong>Ainda não há etapas</strong>
              <p>{full ? 'Crie a primeira etapa ou abra um modelo para iniciar a sequência.' : 'Abra o editor para criar a primeira etapa.'}</p>
              {full && (
                <div className="grafcet-empty-actions">
                  <button className="dc-btn-primary dc-btn" onClick={addStep}>
                    Criar etapa inicial
                  </button>
                  <button className="dc-btn" onClick={() => setTemplatesOpen(true)}>
                    ★ Modelos industriais
                  </button>
                  <button className="dc-btn" onClick={loadExample}>
                    Abrir exemplo de 3 etapas
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
                viewBox={`0 0 ${width} ${height}`}
                role="img"
                aria-label="Etapas, ações e transições do GRAFCET"
              >
                <defs>
                  <marker id="grafcet-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
                    <path d="M0 0 L7 3 L0 6" fill="none" stroke="#526883" />
                  </marker>
                  <marker id="grafcet-arrow-active" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
                    <path d="M0 0 L7 3 L0 6" fill="none" stroke="#16a34a" />
                  </marker>
                </defs>

                {/* TRANSIÇÕES E LINHAS DE FLUXO */}
                {transitions.flatMap((transition, transitionIndex) => {
                  const sources = transition.from.filter((value) => steps.some((step) => step.id === value))
                  const targets = transition.to.filter((value) => steps.some((step) => step.id === value))
                  if (!sources.length || !targets.length) return []

                  const selfLoop = sources.length === 1 && targets.length === 1 && sources[0] === targets[0]
                  const isSingleSource = sources.length === 1
                  const isSingleTarget = targets.length === 1
                  const sourceStep = isSingleSource ? steps.find((s) => s.id === sources[0]) : null
                  const targetStep = isSingleTarget ? steps.find((s) => s.id === targets[0]) : null
                  const sourceIdx = sourceStep ? steps.indexOf(sourceStep) : -1
                  const targetIdx = targetStep ? steps.indexOf(targetStep) : -1

                  const isConsecutive = isSingleSource && isSingleTarget && sourceStep && targetStep && targetIdx === sourceIdx + 1
                  const isReturning = isSingleSource && isSingleTarget && sourceStep && targetStep && stepY(targetStep.id) <= stepY(sourceStep.id) && !selfLoop

                  const conditionOn = validCondition(transition.condition) && evalCondition(transition.condition, table)
                  const enabled = running && conditionOn && sources.every((value) => runtime.active.includes(value))
                  const selectedLink = isTransitionSelected(transition.id)
                  const linkColor = selectedLink ? '#2563eb' : enabled ? '#16a34a' : running && conditionOn ? '#d97706' : '#526883'
                  const isTransHovered = hoveredTransitionId === transition.id

                  const onSelectThisTransition = (e: React.MouseEvent) => {
                    e.stopPropagation()
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
                    return (
                      <g
                        key={transition.id}
                        onClick={onSelectThisTransition}
                        onDoubleClick={onTransDoubleClick}
                        onMouseEnter={() => setHoveredTransitionId(transition.id)}
                        onMouseLeave={() => setHoveredTransitionId(null)}
                        className={full ? 'grafcet-graph-link' : ''}
                        role={full ? 'button' : undefined}
                        tabIndex={full ? 0 : undefined}
                        aria-label={`Transição T${transitionIndex + 1}: ${transition.condition}`}
                      >
                        <path d={path} fill="none" stroke={linkColor} strokeWidth={enabled || selectedLink ? 3 : 2} markerEnd={enabled ? 'url(#grafcet-arrow-active)' : 'url(#grafcet-arrow)'} />
                        <path d={path} fill="none" stroke="transparent" strokeWidth="16" />
                        <line x1="50" y1={y + 83} x2="74" y2={y + 83} stroke={linkColor} strokeWidth={selectedLink || enabled ? 4 : 3} />
                        <text x="80" y={y + 86} fill={linkColor} fontSize="12" fontWeight="600">
                          {renderConditionTspans(transition.condition.slice(0, 24))}
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

                  // 2. Transição direta consecutiva IEC (fluxo vertical direto na espinha x = 151)
                  if (isConsecutive && sourceStep && targetStep) {
                    const sY = stepY(sourceStep.id)
                    const tY = stepY(targetStep.id)
                    const sBottom = sY + 54
                    const tTop = tY
                    const tx = 151
                    const ty = Math.round((sBottom + tTop) / 2)

                    return (
                      <g
                        key={transition.id}
                        onClick={onSelectThisTransition}
                        onDoubleClick={onTransDoubleClick}
                        onMouseEnter={() => setHoveredTransitionId(transition.id)}
                        onMouseLeave={() => setHoveredTransitionId(null)}
                        className={full ? 'grafcet-graph-link' : ''}
                        role={full ? 'button' : undefined}
                        tabIndex={full ? 0 : undefined}
                        aria-label={`Transição T${transitionIndex + 1}: ${transition.condition}${enabled ? ' (Receptiva - clique para disparar)' : ''}`}
                      >
                        {/* Linha vertical central IEC até à etapa seguinte com seta */}
                        <path
                          d={`M 151 ${sBottom} V ${tTop}`}
                          fill="none"
                          stroke={linkColor}
                          strokeWidth={enabled || selectedLink ? 3 : 2}
                          markerEnd={enabled ? 'url(#grafcet-arrow-active)' : 'url(#grafcet-arrow)'}
                        />
                        <path d={`M 151 ${sBottom} V ${tTop}`} fill="none" stroke="transparent" strokeWidth="18" />

                        {/* Barra transversal normalizada IEC 60848 */}
                        <line
                          x1={tx - 14}
                          y1={ty}
                          x2={tx + 14}
                          y2={ty}
                          stroke={linkColor}
                          strokeWidth={selectedLink || enabled ? 4 : 3}
                        />

                        {/* Identificador numérico da transição à esquerda */}
                        <text
                          x={tx - 18}
                          y={ty + 3}
                          textAnchor="end"
                          fill={selectedLink ? '#2563eb' : enabled ? '#16a34a' : '#64748b'}
                          fontSize="10.5"
                          fontWeight="700"
                        >
                          {transitionIndex + 1}
                        </text>

                        {/* Texto da condição formatada com suporte a barra superior / NOT */}
                        <g transform={`translate(${tx + 18}, ${ty + 4})`}>
                          <text fill={linkColor} fontSize="12" fontWeight={enabled ? '700' : '600'}>
                            {renderConditionTspans(transition.condition.slice(0, 28))}
                          </text>
                        </g>

                        {/* Indicador pulsante quando receptiva (pronta a disparar) */}
                        {enabled && (
                          <g>
                            <circle cx={tx} cy={ty} r="7" fill="none" stroke="#22c55e" strokeWidth="2">
                              <animate attributeName="r" values="7;13;7" dur="1.2s" repeatCount="indefinite" />
                              <animate attributeName="opacity" values="0.9;0.2;0.9" dur="1.2s" repeatCount="indefinite" />
                            </circle>
                          </g>
                        )}

                        {/* Manipuladores rápidos estilo grafcet.io para a transição selecionada ou em hover */}
                        {full && (isTransHovered || selectedLink) && (
                          <>
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
                      </g>
                    )
                  }

                  // 3. Retorno / Loopback para etapa anterior (ex: da última para a inicial)
                  if (isReturning && sourceStep && targetStep) {
                    const sY = stepY(sourceStep.id)
                    const tY = stepY(targetStep.id)
                    const sBottom = sY + 54
                    const tTop = tY
                    const tx = 151
                    const ty = sBottom + 12
                    const trackX = 54 - (transitionIndex % 3) * 16

                    return (
                      <g
                        key={transition.id}
                        onClick={onSelectThisTransition}
                        onDoubleClick={onTransDoubleClick}
                        onMouseEnter={() => setHoveredTransitionId(transition.id)}
                        onMouseLeave={() => setHoveredTransitionId(null)}
                        className={full ? 'grafcet-graph-link' : ''}
                        role={full ? 'button' : undefined}
                        tabIndex={full ? 0 : undefined}
                        aria-label={`Transição T${transitionIndex + 1}: ${transition.condition}`}
                      >
                        {/* Linha de retorno: desce do fundo, vai à esquerda pelo barramento, sobe e entra pelo topo */}
                        <path
                          d={`M 151 ${sBottom} V ${sBottom + 24} H ${trackX} V ${tTop - 18} H 151 V ${tTop}`}
                          fill="none"
                          stroke={linkColor}
                          strokeWidth={enabled || selectedLink ? 3 : 2}
                          markerEnd={enabled ? 'url(#grafcet-arrow-active)' : 'url(#grafcet-arrow)'}
                        />
                        <path
                          d={`M 151 ${sBottom} V ${sBottom + 24} H ${trackX} V ${tTop - 18} H 151 V ${tTop}`}
                          fill="none"
                          stroke="transparent"
                          strokeWidth="18"
                        />

                        {/* Seta direcional subindo no barramento à esquerda */}
                        <path
                          d={`M ${trackX - 4} ${(sBottom + tTop) / 2 + 5} L ${trackX} ${(sBottom + tTop) / 2 - 2} L ${trackX + 4} ${(sBottom + tTop) / 2 + 5}`}
                          fill="none"
                          stroke={linkColor}
                          strokeWidth="2"
                        />

                        {/* Barra transversal da transição */}
                        <line
                          x1={tx - 14}
                          y1={ty}
                          x2={tx + 14}
                          y2={ty}
                          stroke={linkColor}
                          strokeWidth={selectedLink || enabled ? 4 : 3}
                        />

                        {/* Número da transição */}
                        <text
                          x={tx - 18}
                          y={ty + 3}
                          textAnchor="end"
                          fill={selectedLink ? '#2563eb' : enabled ? '#16a34a' : '#64748b'}
                          fontSize="10.5"
                          fontWeight="700"
                        >
                          {transitionIndex + 1}
                        </text>

                        {/* Texto da condição formatada */}
                        <g transform={`translate(${tx + 18}, ${ty + 4})`}>
                          <text fill={linkColor} fontSize="12" fontWeight={enabled ? '700' : '600'}>
                            {renderConditionTspans(transition.condition.slice(0, 28))}
                          </text>
                        </g>

                        {/* Indicador pulsante quando receptiva */}
                        {enabled && (
                          <g>
                            <circle cx={tx} cy={ty} r="7" fill="none" stroke="#22c55e" strokeWidth="2">
                              <animate attributeName="r" values="7;13;7" dur="1.2s" repeatCount="indefinite" />
                              <animate attributeName="opacity" values="0.9;0.2;0.9" dur="1.2s" repeatCount="indefinite" />
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
                            <circle cx={trackX} cy={(sBottom + tTop) / 2 - 16} r="7.5" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
                            <path d={`M ${trackX - 2.5} ${(sBottom + tTop) / 2 - 18.5} L ${trackX + 2.5} ${(sBottom + tTop) / 2 - 13.5} M ${trackX + 2.5} ${(sBottom + tTop) / 2 - 18.5} L ${trackX - 2.5} ${(sBottom + tTop) / 2 - 13.5}`} stroke="#ffffff" strokeWidth="1.4" strokeLinecap="round" />
                          </g>
                        )}
                      </g>
                    )
                  }

                  // 4. Caso geral: divergências, convergências e saltos entre múltiplos ramos
                  const avgSourceY = sources.reduce((sum, value) => sum + stepY(value), 0) / sources.length
                  const avgTargetY = targets.reduce((sum, value) => sum + stepY(value), 0) / targets.length
                  const ty = Math.max(42, Math.min(height - 45, (avgSourceY + avgTargetY) / 2))
                  const returning = Math.min(...targets.map(stepY)) <= Math.max(...sources.map(stepY))
                  const tx = returning ? 60 - (transitionIndex % 3) * 16 : 280 + (transitionIndex % 3) * 24
                  const hasAndConvergence = sources.length > 1
                  const hasAndDivergence = targets.length > 1

                  return (
                    <g
                      key={transition.id}
                      onClick={onSelectThisTransition}
                      onDoubleClick={onTransDoubleClick}
                      onMouseEnter={() => setHoveredTransitionId(transition.id)}
                      onMouseLeave={() => setHoveredTransitionId(null)}
                      className={full ? 'grafcet-graph-link' : ''}
                      role={full ? 'button' : undefined}
                      tabIndex={full ? 0 : undefined}
                      aria-label={`Transição T${transitionIndex + 1}: ${transition.condition}`}
                    >
                      {/* Linhas das origens */}
                      {sources.map((value) => (
                        <path
                          key={`f-${value}`}
                          d={`M 182 ${stepY(value) + 27} H ${tx} V ${ty}`}
                          fill="none"
                          stroke={linkColor}
                          strokeWidth={enabled ? 3 : 2}
                        />
                      ))}

                      {/* Linhas para os destinos */}
                      {targets.map((value) => (
                        <path
                          key={`t-${value}`}
                          d={`M ${tx} ${ty} V ${stepY(value)} H 151`}
                          fill="none"
                          stroke={linkColor}
                          strokeWidth={enabled ? 3 : 2}
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

                      {/* Texto da condição formatada com suporte a barra superior (overbar) */}
                      <g transform={`translate(${tx + 16}, ${ty + 4})`}>
                        <text fill={linkColor} fontSize="12" fontWeight={enabled ? '700' : '600'}>
                          {renderConditionTspans(transition.condition.slice(0, 24))}
                        </text>
                      </g>

                      {(hasAndConvergence || hasAndDivergence) && (
                        <text x={tx - 26} y={ty - 7} fill="#c2410c" fontSize="9" fontWeight="700">
                          AND
                        </text>
                      )}

                      {/* Manipulador rápido estilo grafcet.io: Inserir etapa após transição e eliminar transição */}
                      {full && (isTransHovered || selectedLink) && (
                        <>
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

                {/* ETAPAS E AÇÕES ATRELADAS */}
                {steps.map((step, index) => {
                  const active = runtime.active.includes(step.id)
                  const isThisStepSelected = isStepSelected(step.id)
                  const isStepHovered = hoveredStepId === step.id
                  const isInitial = step.initial || step.stepType === 'initial' || step.stepType === 'initial-enclosing'
                  const isMacro = step.stepType === 'macro'
                  const isEnclosing = step.stepType === 'enclosing' || step.stepType === 'initial-enclosing'
                  const y = stepY(step.id)
                  const actionsCount = actionsOf(step).length

                  const onStepClick = (e: React.MouseEvent) => {
                    selectStep(step, e)
                  }

                  const onStepDoubleClick = (e: React.MouseEvent) => {
                    e.stopPropagation()
                    setEditingStep(step)
                  }

                  // Informação da etapa: número/identificador dentro da caixa e comentário/descrição acima
                  const { stepNumber, comment } = getStepDisplayInfo(step, index)
                  const isStepBeingDragged = draggingStepId === step.id && stepDragOffset !== null
                  const stepTranslateY = isStepBeingDragged ? stepDragOffset : 0
                  const isDropTarget = dropTargetStepId === step.id && draggingStepId !== null && draggingStepId !== step.id

                  return (
                    <g
                      key={step.id}
                      className={`${full ? 'grafcet-graph-node' : ''} ${isStepBeingDragged ? 'grafcet-step-dragging' : ''} ${isThisStepSelected ? 'is-selected' : ''}`}
                      transform={stepTranslateY ? `translate(0, ${stepTranslateY})` : undefined}
                      role={full ? 'button' : undefined}
                      tabIndex={full ? 0 : undefined}
                      aria-label={`Etapa ${stepNumber}: ${step.name}${active ? ', ativa' : ''}`}
                      onClick={onStepClick}
                      onDoubleClick={onStepDoubleClick}
                      onPointerDown={(e) => onStepPointerDown(step, e)}
                      onPointerMove={(e) => onStepPointerMove(step, e)}
                      onPointerUp={(e) => onStepPointerUp(step, e)}
                      onPointerCancel={(e) => onStepPointerUp(step, e)}
                      onMouseEnter={() => setHoveredStepId(step.id)}
                      onMouseLeave={() => setHoveredStepId(null)}
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
                      {/* Linha indicadora de destino ao arrastar etapa para reordenar */}
                      {isDropTarget && (
                        <line x1="85" y1={y - 8} x2="217" y2={y - 8} className="grafcet-drop-target-slot" />
                      )}

                      {/* Ponto verde pulsante de atividade na etapa */}
                      {active && (
                        <circle cx="103" cy={y + 27} r="6" fill="#22c55e">
                          <animate attributeName="opacity" values="1;.45;1" dur="1.4s" repeatCount="indefinite" />
                        </circle>
                      )}

                      {/* Nome/descrição personalizado acima da etapa quando existir */}
                      {comment && (
                        <text x="151" y={y - 7} textAnchor="middle" fill="#334155" fontSize="11" fontWeight="600">
                          {comment.slice(0, 32)}
                        </text>
                      )}

                      {/* Caixa externa da etapa */}
                      <rect
                        x="119"
                        y={y}
                        width="64"
                        height="54"
                        rx="2"
                        fill={active ? '#dcfce7' : isThisStepSelected ? '#eff6ff' : 'white'}
                        stroke={isThisStepSelected ? '#2563eb' : active ? '#16a34a' : '#263d59'}
                        strokeWidth={isThisStepSelected ? 3 : active ? 2.5 : 2}
                        filter={isThisStepSelected ? 'drop-shadow(0 2px 8px rgba(37,99,235,0.3))' : undefined}
                      />

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
                        y={y + 34}
                        textAnchor="middle"
                        fill="#1e293b"
                        fontWeight="700"
                        fontSize={stepNumber.length > 3 ? '14' : stepNumber.length > 2 ? '15' : '17'}
                      >
                        {stepNumber}
                      </text>

                      {/* Tempo ativo da etapa com badge estilo pílula */}
                      {active && (
                        <g>
                          <rect x="121" y={y + 59} width="60" height="17" rx="4" fill="#dcfce7" stroke="#16a34a" strokeWidth="1" />
                          <text x="151" y={y + 71} textAnchor="middle" fill="#15803d" fontSize="10" fontWeight="700">
                            ⏱ {fmtSeconds(runtime.elapsed?.[step.id] ?? 0)}
                          </text>
                        </g>
                      )}

                      {/* Manipuladores rápidos estilo grafcet.io para a etapa selecionada ou em hover */}
                      {full && (isStepHovered || isThisStepSelected) && (
                        <>
                          {/* Botão + abaixo da etapa: Adicionar etapa seguinte e transição */}
                          <g
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
                          </g>

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

                  const actionX = 330
                  const actionW = 195
                  const actionH = 30
                  const qualifierW = 32

                  return (
                    <g key={`step-actions-${step.id}`}>
                      {actions.map((action, actionIndex) => {
                        const actionY = y + actionIndex * 38
                        const actionOn = !!table[action.address]
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

                        const strokeColor = isThisActionSelected
                          ? '#2563eb'
                          : actionOn
                          ? '#16a34a'
                          : '#263d59'

                        return (
                          <g
                            key={action.id}
                            className={`grafcet-graph-action ${isThisActionSelected ? 'is-selected' : ''}`}
                            onClick={onActionClick}
                            onDoubleClick={onActionDoubleClick}
                            onMouseEnter={() => setHoveredActionId(action.id)}
                            onMouseLeave={() => setHoveredActionId(null)}
                            role="button"
                            tabIndex={0}
                            aria-label={`Ação ${action.address || action.variable || 'ação'}${isThisActionSelected ? ' selecionada' : ''}`}
                          >
                            {/* Linha conectora da etapa até esta ação */}
                            <path
                              d={`M 183 ${y + 27} H 305 V ${actionY + actionH / 2} H ${actionX}`}
                              fill="none"
                              stroke={strokeColor}
                              strokeWidth={isThisActionSelected || actionOn ? 2.5 : 1.5}
                            />

                            {/* Ponto LED verde pulsante quando a ação está energizada */}
                            {actionOn && (
                              <g>
                                <circle cx={actionX - 10} cy={actionY + actionH / 2} r="4.5" fill="#22c55e">
                                  <animate attributeName="opacity" values="1;0.4;1" dur="1.2s" repeatCount="indefinite" />
                                </circle>
                                <circle cx={actionX - 10} cy={actionY + actionH / 2} r="7.5" fill="none" stroke="#22c55e" strokeWidth="1.2" opacity="0.6" />
                              </g>
                            )}

                            {/* Bandeira / suporte superior da ação condicionada IEC */}
                            {isConditional && (
                              <g>
                                <path
                                  d={`M ${actionX + 16} ${actionY} V ${actionY - 10} H ${actionX + 85}`}
                                  fill="none"
                                  stroke={strokeColor}
                                  strokeWidth={isThisActionSelected ? 2 : 1.5}
                                />
                                <text
                                  x={actionX + 20}
                                  y={actionY - 13}
                                  fill={isThisActionSelected ? '#1d4ed8' : '#2563eb'}
                                  fontSize="10"
                                  fontWeight="700"
                                >
                                  {action.condition}
                                </text>
                              </g>
                            )}

                            {/* Caixa principal da ação IEC */}
                            <rect
                              x={actionX}
                              y={actionY}
                              width={actionW}
                              height={actionH}
                              rx="2"
                              fill={actionOn ? '#dcfce7' : isThisActionSelected ? '#eff6ff' : 'white'}
                              stroke={strokeColor}
                              strokeWidth={isThisActionSelected ? 2.5 : actionOn ? 2 : 1.5}
                              filter={isThisActionSelected ? 'drop-shadow(0 2px 8px rgba(37,99,235,0.35))' : undefined}
                            />

                            {/* Comando compulsivo: retângulo duplo interno */}
                            {(action.allocation === 'compulsory' || kind === 'C') && (
                              <rect
                                x={actionX + 2.5}
                                y={actionY + 2.5}
                                width={actionW - 5}
                                height={actionH - 5}
                                fill="none"
                                stroke={strokeColor}
                                strokeWidth="1.2"
                              />
                            )}

                            {/* Linha divisória do qualificador IEC */}
                            <line
                              x1={actionX + qualifierW}
                              y1={actionY}
                              x2={actionX + qualifierW}
                              y2={actionY + actionH}
                              stroke={strokeColor}
                              strokeWidth={isThisActionSelected ? 2 : 1.5}
                            />

                            {/* Símbolo do qualificador IEC na coluna esquerda */}
                            {kind === 'S' && (
                              <text x={actionX + qualifierW / 2} y={actionY + 19} textAnchor="middle" fill={strokeColor} fontSize="12" fontWeight="700">S</text>
                            )}
                            {kind === 'R' && (
                              <text x={actionX + qualifierW / 2} y={actionY + 19} textAnchor="middle" fill={strokeColor} fontSize="12" fontWeight="700">R</text>
                            )}
                            {kind === 'D' && (
                              <>
                                <text x={actionX + qualifierW / 2} y={actionY + 13} textAnchor="middle" fill={strokeColor} fontSize="9.5" fontWeight="700">D</text>
                                <text x={actionX + qualifierW / 2} y={actionY + 24} textAnchor="middle" fill={strokeColor} fontSize="8" fontWeight="600">{((action.timeMs ?? 2000) / 1000)}s</text>
                              </>
                            )}
                            {kind === 'L' && (
                              <>
                                <text x={actionX + qualifierW / 2} y={actionY + 13} textAnchor="middle" fill={strokeColor} fontSize="9.5" fontWeight="700">L</text>
                                <text x={actionX + qualifierW / 2} y={actionY + 24} textAnchor="middle" fill={strokeColor} fontSize="8" fontWeight="600">{((action.timeMs ?? 2000) / 1000)}s</text>
                              </>
                            )}
                            {(kind === 'A' || action.allocation === 'activation') && (
                              <g stroke={strokeColor} strokeWidth="1.6" fill="none">
                                <line x1={actionX + 16} y1={actionY + 22} x2={actionX + 16} y2={actionY + 8} />
                                <path d={`M ${actionX + 13} ${actionY + 12} L ${actionX + 16} ${actionY + 7} L ${actionX + 19} ${actionY + 12}`} />
                              </g>
                            )}
                            {(kind === 'DA' || action.allocation === 'deactivation') && (
                              <g stroke={strokeColor} strokeWidth="1.6" fill="none">
                                <line x1={actionX + 16} y1={actionY + 8} x2={actionX + 16} y2={actionY + 22} />
                                <path d={`M ${actionX + 13} ${actionY + 18} L ${actionX + 16} ${actionY + 23} L ${actionX + 19} ${actionY + 18}`} />
                              </g>
                            )}
                            {kind === 'N' && (
                              <text x={actionX + qualifierW / 2} y={actionY + 19} textAnchor="middle" fill="#94a3b8" fontSize="11" fontWeight="600">N</text>
                            )}

                            {/* Variável e descrição no corpo da ação */}
                            <text
                              x={actionX + qualifierW + 9}
                              y={actionY + 19}
                              fill={isThisActionSelected ? '#1d4ed8' : actionOn ? '#15803d' : '#1e293b'}
                              fontSize="12"
                              fontWeight={isThisActionSelected || actionOn ? 700 : 600}
                            >
                              {action.displayDescription && action.description ? action.description : (action.variable || action.address || 'ação')}
                              {action.displayDescription && action.description && action.variable && action.description !== action.variable ? (
                                <tspan fill="#64748b" fontSize="10" fontWeight="500"> [{action.variable}]</tspan>
                              ) : null}
                            </text>

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
                                  <circle cx={actionX + actionW - 22} cy={actionY + actionH / 2} r="7.5" fill="#2563eb" stroke="#ffffff" strokeWidth="1.5" />
                                  <path d={`M ${actionX + actionW - 24} ${actionY + actionH / 2 + 2} L ${actionX + actionW - 20} ${actionY + actionH / 2 - 2}`} stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
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
                                  <circle cx={actionX + actionW - 7} cy={actionY + actionH / 2} r="7.5" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
                                  <path
                                    d={`M ${actionX + actionW - 9.5} ${actionY + actionH / 2 - 2.5} L ${actionX + actionW - 4.5} ${actionY + actionH / 2 + 2.5} M ${actionX + actionW - 4.5} ${actionY + actionH / 2 - 2.5} L ${actionX + actionW - 9.5} ${actionY + actionH / 2 + 2.5}`}
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

                      {/* Botão + Ação abaixo da lista de ações quando a etapa está selecionada */}
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
                            x={actionX}
                            y={y + actions.length * 38 + 4}
                            width="90"
                            height="22"
                            rx="4"
                            fill="#eff6ff"
                            stroke="#3b82f6"
                            strokeWidth="1.2"
                            strokeDasharray="3 2"
                          />
                          <text
                            x={actionX + 45}
                            y={y + actions.length * 38 + 19}
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
              </svg>
            </div>
          )}

          {/* HUD flutuante de navegação estilo grafcet.io */}
          {full && steps.length > 0 && (
            <div className="grafcet-canvas-hud" role="toolbar" aria-label="Navegação e zoom da tela">
              <button
                type="button"
                className={activeTool === 'select' && !isSpacePan ? 'is-active' : ''}
                onClick={() => setCanvasTool('select')}
                title="Ferramenta Selecionar: selecione e arraste etapas [V ou S]"
                aria-label="Ferramenta Selecionar"
              >
                <IconCursor size={12} />
                <span>Selecionar</span>
              </button>
              <button
                type="button"
                className={activeTool === 'pan' || isSpacePan ? 'is-active' : ''}
                onClick={() => setCanvasTool('pan')}
                title="Ferramenta Arrastar: mova a tela arrastando o diagrama [H ou Barra de Espaço]"
                aria-label="Ferramenta Arrastar"
              >
                <IconHand size={12} />
                <span>Arrastar</span>
              </button>
              <span className="grafcet-canvas-hud-sep" />
              <button
                type="button"
                onClick={() => zoomAt(scale / 1.2, { x: viewport.width / 2, y: viewport.height / 2 })}
                title="Diminuir zoom (Roda do rato / -)"
                aria-label="Diminuir zoom"
              >
                −
              </button>
              <button
                type="button"
                className="grafcet-canvas-hud-pct"
                onClick={resetView}
                title="Ajustar escala (Ctrl+0)"
                aria-label="Zoom automático"
              >
                {Math.round(scale * 100)}%
              </button>
              <button
                type="button"
                onClick={() => zoomAt(scale * 1.2, { x: viewport.width / 2, y: viewport.height / 2 })}
                title="Aumentar zoom (Roda do rato / +)"
                aria-label="Aumentar zoom"
              >
                +
              </button>
              <span className="grafcet-canvas-hud-sep" />
              <button
                type="button"
                onClick={resetView}
                title="Ajustar diagrama à janela (Ctrl+0 / Duplo clique no fundo)"
              >
                Ajustar
              </button>
              <span className="grafcet-canvas-hud-sep" />
              <span style={{ fontSize: '10.5px', color: '#64748b', padding: '0 4px', fontWeight: 600 }}>
                {steps.length} etapas · {transitions.length} transições · {steps.reduce((acc, s) => acc + actionsOf(s).length, 0)} ações
              </span>
            </div>
          )}
        </div>

        {/* PAINEL DE PROPRIEDADES À DIREITA (Estrutura e Abas Clássicas: Etapas, Transições, Simulador, Diagnóstico) */}
        {full && (
          <aside className="grafcet-properties">
            <div className="grafcet-properties-summary">
              <div>
                <strong>
                  {selectedStep && selectedAction
                    ? (() => {
                        const { stepNumber } = getStepDisplayInfo(selectedStep, steps.indexOf(selectedStep))
                        return `Ação: ${selectedAction.variable || selectedAction.address || 'Ação'} · Etapa ${stepNumber}`
                      })()
                    : selectedStep
                    ? (() => {
                        const { stepNumber, comment } = getStepDisplayInfo(selectedStep, steps.indexOf(selectedStep))
                        return `Etapa ${stepNumber}${comment ? `: ${comment}` : ''}`
                      })()
                    : selectedTransition
                    ? `Transição T${transitions.indexOf(selectedTransition) + 1}`
                    : 'Propriedades'}
                </strong>
                <small>{running ? '● Simulação ativa' : '○ Simulação parada'}</small>
              </div>
              {selected && (
                <div className="grafcet-selection-actions">
                  <button onClick={duplicateSelected} title={selectedActionId ? 'Duplicar ação (Ctrl+D)' : 'Duplicar (Ctrl+D)'} aria-label="Duplicar seleção">
                    <IconCopy size={13} />
                  </button>
                  <button className="is-danger" onClick={requestDelete} title={selectedActionId ? 'Eliminar ação (Del)' : 'Eliminar (Del)'} aria-label="Eliminar seleção">
                    <IconDelete size={13} />
                  </button>
                </div>
              )}
            </div>

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
              <button role="tab" aria-selected={tab === 'io'} className={tab === 'io' ? 'is-active' : ''} onClick={() => setTab('io')}>
                Simulador
              </button>
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
                  {!filteredSteps.length && <p className="grafcet-list-empty">Nenhuma etapa corresponde ao filtro.</p>}
                </div>

                {!selectedStep && <p className="grafcet-hint">Selecione uma etapa no diagrama ou na lista para editar ações e propriedades.</p>}

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
                        title="Abrir o diálogo de configuração avançada FluidSIM"
                      >
                        Diálogo FluidSIM ↗
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
                      <button onClick={() => addAction(false)}>+ ação</button>
                    </div>

                    <datalist id="grafcet-action-addresses">
                      {actionAddresses.map((tag) => (
                        <option key={tag.id} value={tag.address}>
                          {tag.name}
                        </option>
                      ))}
                    </datalist>

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
                            className="dc-input"
                            list="grafcet-action-addresses"
                            aria-label={`Endereço da ação ${actionIndex + 1}`}
                            placeholder="Q1"
                            value={action.address || action.variable || ''}
                            onChange={(event) =>
                              patchAction(selectedStep, action, {
                                address: event.target.value.toUpperCase(),
                                variable: event.target.value.toUpperCase(),
                              })
                            }
                          />
                          <input
                            className="dc-input"
                            aria-label={`Condição da ação ${actionIndex + 1}`}
                            placeholder="1"
                            value={action.condition}
                            onChange={(event) => patchAction(selectedStep, action, { condition: event.target.value.toUpperCase() })}
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
                            className="dc-btn"
                            style={{ fontSize: '11px', padding: '1px 5px', minWidth: '22px' }}
                            title="Abrir diálogo FluidSIM da ação"
                            aria-label={`Abrir diálogo da ação ${actionIndex + 1}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingAction({ step: selectedStep, action })
                            }}
                          >
                            ↗
                          </button>
                          <button
                            type="button"
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
                    <button className="dc-btn" onClick={() => addAction(false)}>
                      + Adicionar ação
                    </button>
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
                  Uma origem → vários destinos cria divergência AND. Várias origens → um destino cria convergência AND. A ordem define a prioridade.
                </p>
                <div className="grafcet-entity-list">
                  {filteredTransitions.map((transition) => {
                    const index = transitions.indexOf(transition)
                    const conditionOn = running && validCondition(transition.condition) && evalCondition(transition.condition, table)
                    const getStepNum = (id: string) => {
                      const step = steps.find((s) => s.id === id)
                      return step ? getStepDisplayInfo(step, steps.indexOf(step)).stepNumber : '?'
                    }
                    return (
                      <div className={`grafcet-transition-row ${selected === transition.id ? 'is-active' : ''}`} key={transition.id}>
                        <button onClick={() => setSelected(transition.id)} aria-label={`Selecionar transição T${index + 1}`}>
                          <i className={conditionOn ? 'is-on' : ''} />
                          T{index + 1}: {transition.from.map(getStepNum).join('+')} → {transition.to.map(getStepNum).join('+')}{' '}
                          <span className={!validCondition(transition.condition) ? 'grafcet-error' : ''}>[{transition.condition}]</span>
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
                  {!filteredTransitions.length && <p className="grafcet-list-empty">Nenhuma transição corresponde ao filtro.</p>}
                </div>

                {!selectedTransition && (
                  <p className="grafcet-hint">Selecione uma transição no diagrama ou na lista para definir condição e ligações.</p>
                )}

                {selectedTransition && (
                  <div className="grafcet-form">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <h3>Transição T{transitions.indexOf(selectedTransition) + 1}</h3>
                      <button
                        className="dc-btn"
                        style={{ fontSize: '11px', padding: '2px 8px' }}
                        onClick={() => setEditingTransition(selectedTransition)}
                        title="Abrir diálogo FluidSIM da transição"
                      >
                        Diálogo FluidSIM ↗
                      </button>
                    </div>

                    <label>
                      Condição
                      <input
                        className="dc-input"
                        value={selectedTransition.condition}
                        placeholder="I1 & !I2 | 10s/X1"
                        onChange={(event) =>
                          updateTransition(
                            selectedTransition.id,
                            { condition: event.target.value.toUpperCase() },
                            'auto',
                            `grafcet:transition:${selectedTransition.id}:condition`
                          )
                        }
                      />
                    </label>

                    <div className="grafcet-token-chips" role="group" aria-label="Inserir na condição">
                      <button type="button" title="Temporização normalizada IEC (ex.: 10s desde a ativação da etapa)" onClick={() => appendToCondition(selectedTransition, '10s/X1')}>
                        ⏱ 10s/X1
                      </button>
                      <button type="button" title="Tempo desde que a etapa de origem ficou ativa" onClick={() => appendToCondition(selectedTransition, 'T(2S)')}>
                        ⏱ T(2s)
                      </button>
                      <button type="button" title="Flanco ascendente" onClick={() => appendToCondition(selectedTransition, '^I1')}>
                        ↑ ^I1
                      </button>
                      <button type="button" title="Flanco descendente" onClick={() => appendToCondition(selectedTransition, '\\I1')}>
                        ↓ \I1
                      </button>
                      <button type="button" title="Etapa N ativa" onClick={() => appendToCondition(selectedTransition, 'X1')}>
                        X1
                      </button>
                      <button type="button" title="Receptividade sempre verdadeira" onClick={() => updateTransition(selectedTransition.id, { condition: '1' }, 'force')}>
                        1
                      </button>
                    </div>

                    <div className="grafcet-condition-state">
                      <span className={validCondition(selectedTransition.condition) && evalCondition(selectedTransition.condition, table) ? 'is-on' : ''}>
                        <i /> Resultado atual:{' '}
                        {validCondition(selectedTransition.condition) && evalCondition(selectedTransition.condition, table) ? 'VERDADEIRO' : 'FALSO'}
                      </span>
                    </div>

                    {!validCondition(selectedTransition.condition) && (
                      <small className="grafcet-error">Expressão inválida: use I/Q/M, Xn, 10s/X1, T(2s), ^I1, \I1, !, *, + e parênteses.</small>
                    )}

                    {(['from', 'to'] as const).map((field) => (
                      <fieldset key={field}>
                        <legend>{field === 'from' ? 'Origens (todas ativas)' : 'Destinos (ativados juntos)'}</legend>
                        <div className="grafcet-step-checks">
                          {steps.map((step, index) => (
                            <label className="grafcet-inline" key={step.id}>
                              <input
                                type="checkbox"
                                checked={selectedTransition[field].includes(step.id)}
                                onChange={() =>
                                  updateTransition(selectedTransition.id, { [field]: choose(selectedTransition[field], step.id) }, 'force')
                                }
                              />{' '}
                              {index} · {step.name}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    ))}

                    {(!selectedTransition.from.length || !selectedTransition.to.length) && (
                      <small className="grafcet-error">Escolha pelo menos uma origem e um destino.</small>
                    )}

                    <button
                      className="dc-btn"
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

                    <label>
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

                    <button className="dc-btn grafcet-danger" onClick={requestDelete}>
                      Eliminar transição
                    </button>
                  </div>
                )}
              </>
            )}

            {/* ABA SIMULADOR */}
            {tab === 'io' && (
              <div className="grafcet-io">
                <VirtualIoPanel compact extraBits={liveBitsAll} />
                <div className="vio-panel is-compact">
                  <div className="vio-head">
                    <strong>Etapas ativas</strong>
                    <small>{runtime.fired ?? 0} transição(ões) disparada(s)</small>
                  </div>
                  <div className="grafcet-active-list">
                    {runtime.active.length ? (
                      runtime.active.map((value) => {
                        const index = steps.findIndex((step) => step.id === value)
                        const step = steps[index]
                        const { stepNumber, comment } = step ? getStepDisplayInfo(step, index) : { stepNumber: '?', comment: '' }
                        return (
                          <button
                            key={value}
                            onClick={() => {
                              setSelected(value)
                              setTab('steps')
                            }}
                          >
                            <b>{stepNumber}</b> {comment || step?.name} <em>{fmtSeconds(runtime.elapsed?.[value] ?? 0)}</em>
                          </button>
                        )
                      })
                    ) : (
                      <small>Nenhuma etapa ativa. Prima Run (ou Passo a passo) para começar.</small>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ABA DIAGNÓSTICO */}
            {tab === 'diagnostics' && (
              <div className="grafcet-diagnostics">
                <div className={`grafcet-diagnostic-summary ${issues.length ? 'has-issues' : 'is-valid'}`}>
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
                    <span>✓ Etapa inicial definida</span>
                    <span>✓ Ligações completas</span>
                    <span>✓ Condições válidas</span>
                    <span>✓ Ações endereçadas</span>
                    <span>✓ Todas as etapas alcançáveis</span>
                  </div>
                )}
              </div>
            )}

            <div className="grafcet-live-status">
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

      {/* DIÁLOGOS FLUIDSIM E ATALHOS */}
      <StepDialog
        open={!!editingStep}
        step={editingStep}
        stepIndex={editingStep ? steps.findIndex((s) => s.id === editingStep.id) : 0}
        onSave={(patch) => {
          if (editingStep) updateStep(editingStep.id, patch, 'force')
        }}
        onClose={() => setEditingStep(null)}
      />

      <TransitionDialog
        open={!!editingTransition}
        transition={editingTransition}
        availableSteps={steps}
        availableVariables={transitionVariableSuggestions}
        onSave={(patch) => {
          if (editingTransition) updateTransition(editingTransition.id, patch, 'force')
        }}
        onClose={() => setEditingTransition(null)}
      />

      <ActionDialog
        open={!!editingAction}
        action={editingAction?.action ?? null}
        availableVariables={actionVariableSuggestions}
        onSave={(patch) => {
          if (editingAction) patchAction(editingAction.step, editingAction.action, patch, 'force')
        }}
        onClose={() => setEditingAction(null)}
      />

      <GrafcetShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />

      {/* MODAL DE MODELOS INDUSTRIAIS */}
      {templatesOpen && (
        <div className="grafcet-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setTemplatesOpen(false) }}>
          <div className="dc-card" style={{ maxWidth: '540px', width: '100%', padding: '20px', background: 'white' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b', margin: 0 }}>Modelos de GRAFCET Prontos</h3>
              <button className="dc-btn" onClick={() => setTemplatesOpen(false)}>✕</button>
            </div>
            <p style={{ fontSize: '11.5px', color: '#64748b', marginBottom: '16px' }}>
              Carregue uma arquitetura padrão para acelerar o desenvolvimento do seu projeto:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {GRAFCET_TEMPLATES.map((tmpl) => (
                <div
                  key={tmpl.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    background: '#f8fafc',
                  }}
                >
                  <div>
                    <strong style={{ fontSize: '12.5px', color: '#0f172a' }}>{tmpl.name}</strong>
                    <p style={{ fontSize: '11px', color: '#64748b', margin: '3px 0 0' }}>{tmpl.description}</p>
                  </div>
                  <button className="dc-btn-primary dc-btn" onClick={() => loadTemplate(tmpl)}>
                    Carregar
                  </button>
                </div>
              ))}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  background: '#f8fafc',
                }}
              >
                <div>
                  <strong style={{ fontSize: '12.5px', color: '#0f172a' }}>Exemplo Didático de 3 Etapas</strong>
                  <p style={{ fontSize: '11px', color: '#64748b', margin: '3px 0 0' }}>Espera, Motor A (Q1) e Motor B (Q2) em sequência fechada.</p>
                </div>
                <button
                  className="dc-btn"
                  onClick={() => {
                    loadExample()
                    setTemplatesOpen(false)
                  }}
                >
                  Carregar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div key={toast.id} className="ladder-toast grafcet-toast" role="status" aria-live="polite">
          {toast.text}
        </div>
      )}
    </div>
  )
}
