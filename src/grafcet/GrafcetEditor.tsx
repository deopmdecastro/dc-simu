import { useEffect, useRef, useState, useMemo, type PointerEvent, type WheelEvent, type ChangeEvent } from 'react'
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
  parseIecTimer,
  parseDuration,
} from './engine'
import type {
  GrafcetAction,
  GrafcetActionKind,
  GrafcetIssue,
  GrafcetStep,
  GrafcetTransition,
  GrafcetComment,
  GrafcetProgram,
} from './engine'
import StepDialog from './StepDialog'
import ActionDialog from './ActionDialog'
import TransitionDialog from './TransitionDialog'
import { GRAFCET_TEMPLATES } from './templates'
import { renderConditionTspans, fmtDuration } from './grafcetRender'
import VirtualIoPanel from '../components/VirtualIoPanel'
import { grafcetToLadder } from './toLadder'
import { collectUsedAddresses } from '../ladder/ladderEngine'
import { allowedViews } from '../project/kind'
import {
  IconChevronRight,
  IconCopy,
  IconDelete,
  IconHelp,
  IconRedo,
  IconSearch,
  IconUndo,
} from '../ui/icons'
import GrafcetShortcutsDialog from './GrafcetShortcutsDialog'
import { useEditorShortcuts } from '../ui/shortcuts'

const uid = () => crypto.randomUUID()

type EditorTab = 'properties' | 'steps' | 'transitions' | 'simulator' | 'diagnostics'
type HistoryMode = 'auto' | 'force' | 'skip'
type PaletteTool =
  | 'select'
  | 'step'
  | 'initial'
  | 'transition'
  | 'action'
  | 'sequence'
  | 'branch-or'
  | 'branch-and'
  | 'jump'
  | 'comment'

interface DragState {
  type: 'canvas' | 'step' | 'transition' | 'comment'
  id?: string
  startX: number
  startY: number
  elemStartX: number
  elemStartY: number
  hasMoved?: boolean
}

export default function GrafcetEditor({ full = false, onOpenEditor }: { full?: boolean; onOpenEditor?: () => void }) {
  const program = useSimStore((state) => state.grafcet)
  const runtime = useSimStore((state) => state.grafcetRuntime)
  const table = useSimStore((state) => state.runtime.table)
  const tags = useSimStore((state) => state.tags)
  const setGrafcet = useSimStore((state) => state.setGrafcet)
  const history = useSimStore((state) => state.history)
  const future = useSimStore((state) => state.future)
  const runState = useSimStore((state) => state.sim.runState)
  const running = runState === 'running'
  const simSpeed = useSimStore((state) => state.sim.speed)
  const projectKind = useSimStore((state) => state.projectKind)
  const canGenerateLadder = allowedViews(projectKind).includes('ladder')

  const simPlay = useSimStore((state) => state.play)
  const simPause = useSimStore((state) => state.pause)
  const simStop = useSimStore((state) => state.stop)
  const simStep = useSimStore((state) => state.step)
  const setSpeed = useSimStore((state) => state.setSpeed)
  const setVirtualInput = useSimStore((state) => state.setVirtualInput)
  const virtualInputs = useSimStore((state) => state.virtualInputs)

  const steps = program.steps
  const transitions = transitionsOf(program)
  const comments = program.comments ?? []

  // Selection & UI State
  const [selected, setSelected] = useState<string | null>(() => (full ? steps[0]?.id ?? null : null))
  const [selectedType, setSelectedType] = useState<'step' | 'transition' | 'action' | 'comment' | null>(() => (steps[0] ? 'step' : null))
  const [tab, setTab] = useState<EditorTab>('properties')
  const [tool, setTool] = useState<PaletteTool>('select')
  const [activeChart, setActiveChart] = useState<string>('all')
  const [snapToGrid, setSnapToGrid] = useState<boolean>(true)
  const [entityFilter, setEntityFilter] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [showBottomDeck, setShowBottomDeck] = useState(true)

  // FluidSIM Dialogs State
  const [editingStep, setEditingStep] = useState<GrafcetStep | null>(null)
  const [editingAction, setEditingAction] = useState<{ step: GrafcetStep; action: GrafcetAction } | null>(null)
  const [editingTransition, setEditingTransition] = useState<GrafcetTransition | null>(null)

  const toastTimer = useRef<number | undefined>(undefined)
  const svgRef = useRef<SVGSVGElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Selected Entities
  const selectedStep = selectedType === 'step' ? steps.find((s) => s.id === selected) : null
  const selectedTransition = selectedType === 'transition' ? transitions.find((t) => t.id === selected) : null
  const selectedComment = selectedType === 'comment' ? comments.find((c) => c.id === selected) : null

  // Ensure selection remains valid
  useEffect(() => {
    if (selected && !steps.some((s) => s.id === selected) && !transitions.some((t) => t.id === selected) && !comments.some((c) => c.id === selected)) {
      setSelected(null)
      setSelectedType(null)
    }
  }, [selected, steps, transitions, comments])

  const notify = (text: string) => {
    window.clearTimeout(toastTimer.current)
    setToast({ id: Date.now(), text })
    toastTimer.current = window.setTimeout(() => setToast(null), 1800)
  }

  // Save changes with undo/redo support
  const save = (patch: Partial<GrafcetProgram>, mode: HistoryMode = 'force', historyKey = 'grafcet') =>
    setGrafcet({ ...program, transitions, comments, ...patch }, mode, historyKey)

  const updateStep = (
    stepId: string,
    patch: Partial<GrafcetStep>,
    mode: HistoryMode = 'auto',
    historyKey = `grafcet:step:${stepId}:${Object.keys(patch).sort().join(',')}`
  ) =>
    save(
      { steps: steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)) },
      mode,
      historyKey
    )

  const updateTransition = (
    transitionId: string,
    patch: Partial<GrafcetTransition>,
    mode: HistoryMode = 'auto',
    historyKey = `grafcet:transition:${transitionId}:${Object.keys(patch).sort().join(',')}`
  ) =>
    save(
      { transitions: transitions.map((t) => (t.id === transitionId ? { ...t, ...patch } : t)) },
      mode,
      historyKey
    )

  const updateComment = (
    commentId: string,
    patch: Partial<GrafcetComment>,
    mode: HistoryMode = 'auto',
    historyKey = `grafcet:comment:${commentId}`
  ) =>
    save(
      { comments: comments.map((c) => (c.id === commentId ? { ...c, ...patch } : c)) },
      mode,
      historyKey
    )

  // Patch action in a step
  const patchAction = (
    step: GrafcetStep,
    action: GrafcetAction,
    patch: Partial<GrafcetAction>,
    mode: HistoryMode = 'auto'
  ) => {
    const key = `grafcet:action:${action.id}:${Object.keys(patch).sort().join(',')}`
    if (action.id.startsWith('legacy-')) {
      const migrated: GrafcetAction = {
        id: uid(),
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
        { actions: (step.actions ?? []).map((a) => (a.id === action.id ? { ...a, ...patch } : a)) },
        mode,
        key
      )
    }
  }

  // Delete entity
  const deleteSelected = () => {
    if (!selected) return
    if (selectedType === 'step') {
      const nextSteps = steps.filter((s) => s.id !== selected)
      const nextTrans = transitions.filter((t) => !t.from.includes(selected) && !t.to.includes(selected))
      save({ steps: nextSteps, transitions: nextTrans }, 'force')
      setSelected(null)
      setSelectedType(null)
      notify('Etapa eliminada')
    } else if (selectedType === 'transition') {
      save({ transitions: transitions.filter((t) => t.id !== selected) }, 'force')
      setSelected(null)
      setSelectedType(null)
      notify('Transição eliminada')
    } else if (selectedType === 'comment') {
      save({ comments: comments.filter((c) => c.id !== selected) }, 'force')
      setSelected(null)
      setSelectedType(null)
      notify('Nota eliminada')
    }
  }

  // Coordinates and auto-layout calculation
  const stepPositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>()
    let currentY = 70
    steps.forEach((s, idx) => {
      const x = s.x !== undefined ? s.x : 120
      const y = s.y !== undefined ? s.y : currentY
      map.set(s.id, { x, y })
      if (s.y === undefined) {
        currentY += Math.max(140, actionsOfStep(s).length * 36 + 90)
      }
    })
    return map
  }, [steps])

  const getStepPos = (id: string) => stepPositions.get(id) ?? { x: 120, y: 70 }

  const getTransPos = (t: GrafcetTransition) => {
    if (t.x !== undefined && t.y !== undefined) return { x: t.x, y: t.y }
    const sources = t.from.map(getStepPos)
    const targets = t.to.map(getStepPos)
    if (sources.length && targets.length) {
      const avgX = (sources.reduce((sum, p) => sum + p.x, 0) / sources.length + targets.reduce((sum, p) => sum + p.x, 0) / targets.length) / 2
      const avgY = (sources.reduce((sum, p) => sum + p.y, 0) / sources.length + targets.reduce((sum, p) => sum + p.y, 0) / targets.length) / 2
      return { x: avgX, y: avgY }
    }
    if (sources.length) return { x: sources[0].x, y: sources[0].y + 80 }
    return { x: 120, y: 150 }
  }

  // Canvas Viewport Pan & Zoom
  const viewportRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ width: 600, height: 600 })
  const [zoom, setZoom] = useState<number>(1)
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 30, y: 30 })
  const dragState = useRef<DragState | null>(null)

  useEffect(() => {
    if (!viewportRef.current) return
    const node = viewportRef.current
    const observer = new ResizeObserver(() => setViewport({ width: node.clientWidth, height: node.clientHeight }))
    observer.observe(node)
    setViewport({ width: node.clientWidth, height: node.clientHeight })
    return () => observer.disconnect()
  }, [])

  const resetView = () => {
    setZoom(1)
    setPan({ x: 30, y: 30 })
    notify('Vista ajustada')
  }

  const zoomAt = (newZoom: number, center: { x: number; y: number }) => {
    const clamped = Math.max(0.25, Math.min(2.5, newZoom))
    setPan((p) => ({
      x: center.x - ((center.x - p.x) * clamped) / zoom,
      y: center.y - ((center.y - p.y) * clamped) / zoom,
    }))
    setZoom(clamped)
  }

  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
    zoomAt(zoom * factor, { x: mouseX, y: mouseY })
  }

  // Pointer Down (Dragging entities or Canvas)
  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.button !== 1) return
    const target = e.target as HTMLElement | SVGElement
    const stepEl = target.closest('[data-step-id]') as HTMLElement | null
    const transEl = target.closest('[data-trans-id]') as HTMLElement | null
    const commentEl = target.closest('[data-comment-id]') as HTMLElement | null

    if (stepEl) {
      const stepId = stepEl.getAttribute('data-step-id')!
      const pos = getStepPos(stepId)
      setSelected(stepId)
      setSelectedType('step')
      setTab('properties')
      dragState.current = {
        type: 'step',
        id: stepId,
        startX: e.clientX,
        startY: e.clientY,
        elemStartX: pos.x,
        elemStartY: pos.y,
      }
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }

    if (transEl) {
      const transId = transEl.getAttribute('data-trans-id')!
      const trans = transitions.find((t) => t.id === transId)
      const pos = trans ? getTransPos(trans) : { x: 120, y: 150 }
      setSelected(transId)
      setSelectedType('transition')
      setTab('properties')
      dragState.current = {
        type: 'transition',
        id: transId,
        startX: e.clientX,
        startY: e.clientY,
        elemStartX: pos.x,
        elemStartY: pos.y,
      }
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }

    if (commentEl) {
      const cId = commentEl.getAttribute('data-comment-id')!
      const c = comments.find((item) => item.id === cId)
      setSelected(cId)
      setSelectedType('comment')
      dragState.current = {
        type: 'comment',
        id: cId,
        startX: e.clientX,
        startY: e.clientY,
        elemStartX: c?.x ?? 80,
        elemStartY: c?.y ?? 30,
      }
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }

    // Pan canvas
    dragState.current = {
      type: 'canvas',
      startX: e.clientX,
      startY: e.clientY,
      elemStartX: pan.x,
      elemStartY: pan.y,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return
    const ds = dragState.current
    const dx = (e.clientX - ds.startX) / zoom
    const dy = (e.clientY - ds.startY) / zoom
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) ds.hasMoved = true

    if (ds.type === 'canvas') {
      setPan({
        x: ds.elemStartX + (e.clientX - ds.startX),
        y: ds.elemStartY + (e.clientY - ds.startY),
      })
      return
    }

    const snap = (v: number) => (snapToGrid ? Math.round(v / 20) * 20 : Math.round(v))

    if (ds.type === 'step' && ds.id) {
      const nx = snap(ds.elemStartX + dx)
      const ny = snap(ds.elemStartY + dy)
      updateStep(ds.id, { x: nx, y: ny }, 'auto')
    } else if (ds.type === 'transition' && ds.id) {
      const nx = snap(ds.elemStartX + dx)
      const ny = snap(ds.elemStartY + dy)
      updateTransition(ds.id, { x: nx, y: ny }, 'auto')
    } else if (ds.type === 'comment' && ds.id) {
      const nx = snap(ds.elemStartX + dx)
      const ny = snap(ds.elemStartY + dy)
      updateComment(ds.id, { x: nx, y: ny }, 'auto')
    }
  }

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (dragState.current && !dragState.current.hasMoved && dragState.current.type === 'canvas') {
      // Clicked on empty canvas
      if (tool === 'step') addStepAt(e)
      else if (tool === 'initial') addInitialStepAt(e)
      else if (tool === 'transition') addTransition()
      else if (tool === 'comment') addCommentAt(e)
    }
    dragState.current = null
  }

  // Quick insertion helpers
  const addStepAt = (e?: PointerEvent<HTMLDivElement>) => {
    const nextIdx = steps.length
    let x = 120, y = 70 + nextIdx * 120
    if (e && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect()
      x = Math.round(((e.clientX - rect.left - pan.x) / zoom) / 20) * 20
      y = Math.round(((e.clientY - rect.top - pan.y) / zoom) / 20) * 20
    }
    const newStep: GrafcetStep = {
      id: uid(),
      name: String(nextIdx),
      initial: steps.length === 0,
      stepType: steps.length === 0 ? 'initial' : 'simple',
      action: '',
      condition: '1',
      x,
      y,
      actions: [],
      chart: activeChart !== 'all' ? activeChart : undefined,
    }
    save({ steps: [...steps, newStep] }, 'force')
    setSelected(newStep.id)
    setSelectedType('step')
    notify(`Etapa ${newStep.name} criada`)
  }

  const addInitialStepAt = (e?: PointerEvent<HTMLDivElement>) => {
    const nextIdx = steps.length
    let x = 120, y = 70 + nextIdx * 120
    if (e && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect()
      x = Math.round(((e.clientX - rect.left - pan.x) / zoom) / 20) * 20
      y = Math.round(((e.clientY - rect.top - pan.y) / zoom) / 20) * 20
    }
    const newStep: GrafcetStep = {
      id: uid(),
      name: String(nextIdx),
      initial: true,
      stepType: 'initial',
      action: '',
      condition: '1',
      x,
      y,
      actions: [],
      chart: activeChart !== 'all' ? activeChart : undefined,
    }
    save({ steps: [...steps, newStep] }, 'force')
    setSelected(newStep.id)
    setSelectedType('step')
    notify(`Etapa inicial ${newStep.name} criada`)
  }

  const addConnectedStepBelow = (sourceStep: GrafcetStep) => {
    const nextIdx = steps.length
    const sourcePos = getStepPos(sourceStep.id)
    const newStepPos = { x: sourcePos.x, y: sourcePos.y + 140 }
    const newTransPos = { x: sourcePos.x, y: sourcePos.y + 70 }

    const newStep: GrafcetStep = {
      id: uid(),
      name: String(nextIdx),
      initial: false,
      stepType: 'simple',
      action: '',
      condition: '1',
      x: newStepPos.x,
      y: newStepPos.y,
      actions: [],
      chart: sourceStep.chart,
    }

    const newTrans: GrafcetTransition = {
      id: uid(),
      name: `T${transitions.length + 1}`,
      from: [sourceStep.id],
      to: [newStep.id],
      condition: '1',
      x: newTransPos.x,
      y: newTransPos.y,
      chart: sourceStep.chart,
    }

    save({ steps: [...steps, newStep], transitions: [...transitions, newTrans] }, 'force')
    setSelected(newStep.id)
    setSelectedType('step')
    notify(`Etapa ${newStep.name} ligada a ${sourceStep.name}`)
  }

  const addStepBelowTransition = (trans: GrafcetTransition) => {
    const nextIdx = steps.length
    const transPos = getTransPos(trans)
    const newStepPos = { x: transPos.x, y: transPos.y + 70 }

    const newStep: GrafcetStep = {
      id: uid(),
      name: String(nextIdx),
      initial: false,
      stepType: 'simple',
      action: '',
      condition: '1',
      x: newStepPos.x,
      y: newStepPos.y,
      actions: [],
      chart: trans.chart,
    }

    const updatedTrans = { ...trans, to: [...trans.to, newStep.id] }
    save({
      steps: [...steps, newStep],
      transitions: transitions.map((t) => (t.id === trans.id ? updatedTrans : t)),
    }, 'force')
    setSelected(newStep.id)
    setSelectedType('step')
    notify(`Etapa ${newStep.name} ligada a ${trans.name}`)
  }

  const addActionToStep = (step: GrafcetStep) => {
    const newAction: GrafcetAction = {
      id: uid(),
      address: 'Q1',
      variable: 'Q1',
      condition: '1',
      kind: 'N',
      displayDescription: true,
      description: 'Nova Ação',
    }
    const currentActions = actionsOfStep(step)
    updateStep(step.id, { actions: [...currentActions, newAction] }, 'force')
    setEditingAction({ step, action: newAction })
    notify('Ação adicionada')
  }

  const addTransition = () => {
    if (steps.length < 2) return notify('Crie pelo menos duas etapas para ligar com uma transição')
    const source = selectedStep ? selectedStep.id : steps[0].id
    const target = steps.find((s) => s.id !== source)?.id ?? steps[0].id
    const sourcePos = getStepPos(source)
    const targetPos = getStepPos(target)

    const newTrans: GrafcetTransition = {
      id: uid(),
      name: `T${transitions.length + 1}`,
      from: [source],
      to: [target],
      condition: '1',
      x: (sourcePos.x + targetPos.x) / 2,
      y: (sourcePos.y + targetPos.y) / 2,
    }

    save({ transitions: [...transitions, newTrans] }, 'force')
    setSelected(newTrans.id)
    setSelectedType('transition')
    setTab('properties')
    notify('Transição criada')
  }

  const addQuickSequence = () => {
    const s1Id = uid()
    const s2Id = uid()
    const tId = uid()
    const nextIdx = steps.length
    const baseY = steps.length ? Math.max(...steps.map((s) => getStepPos(s.id).y)) + 160 : 70

    const s1: GrafcetStep = {
      id: s1Id,
      name: String(nextIdx),
      initial: steps.length === 0,
      stepType: steps.length === 0 ? 'initial' : 'simple',
      action: '',
      condition: '1',
      x: 120,
      y: baseY,
      actions: [{ id: uid(), address: 'Q1', variable: 'Q1', condition: '1', kind: 'N', displayDescription: true }],
    }

    const t: GrafcetTransition = {
      id: tId,
      name: `T${transitions.length + 1}`,
      from: [s1Id],
      to: [s2Id],
      condition: 'I1',
      x: 120,
      y: baseY + 70,
    }

    const s2: GrafcetStep = {
      id: s2Id,
      name: String(nextIdx + 1),
      initial: false,
      stepType: 'simple',
      action: '',
      condition: '1',
      x: 120,
      y: baseY + 140,
      actions: [],
    }

    save({ steps: [...steps, s1, s2], transitions: [...transitions, t] }, 'force')
    setSelected(s2Id)
    setSelectedType('step')
    notify('Sequência rápida criada')
  }

  const addCommentAt = (e?: PointerEvent<HTMLDivElement>) => {
    let x = 80, y = 30
    if (e && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect()
      x = Math.round(((e.clientX - rect.left - pan.x) / zoom) / 20) * 20
      y = Math.round(((e.clientY - rect.top - pan.y) / zoom) / 20) * 20
    }
    const newComment: GrafcetComment = {
      id: uid(),
      text: 'Novo Título / Nota',
      x,
      y,
      fontSize: 15,
      fontWeight: '700',
    }
    save({ comments: [...comments, newComment] }, 'force')
    setSelected(newComment.id)
    setSelectedType('comment')
    notify('Nota de texto criada')
  }

  // Load Template
  const loadTemplate = (tmpl: typeof GRAFCET_TEMPLATES[0]) => {
    save(tmpl.program, 'force')
    setTemplatesOpen(false)
    resetView()
    notify(`Modelo carregado: ${tmpl.name}`)
  }

  // Generate Ladder logic
  const generateLadder = async () => {
    if (!steps.length) return notify('Crie primeiro as etapas do GRAFCET')
    const issues = validateGrafcet({ ...program, transitions })
    if (issues.some((i) => i.level === 'error')) return notify('Corrija os erros do GRAFCET antes de gerar o Ladder')
    const state = useSimStore.getState()
    const result = grafcetToLadder({ ...program, transitions }, collectUsedAddresses(state.ladder))
    const note = result.warnings.length ? `\n\nAvisos:\n- ${result.warnings.join('\n- ')}` : ''
    if (
      !(await uiConfirm(
        `Acrescentar ${result.rungs.length} networks ao programa Ladder ativo?\n\nCada etapa usa um bit M do PLC, reproduzindo o GRAFCET no PLC.${note}`
      ))
    )
      return
    state.appendRungs(result.rungs)
    notify(`${result.rungs.length} networks Ladder geradas`)
  }

  // Export functions
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
    const data = JSON.stringify({ ...program, transitions, comments }, null, 2)
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

  // Undo / Redo
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

  // Keyboard Shortcuts
  useEffect(() => {
    if (!full) return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing = !!target?.closest('input,textarea,select,[contenteditable="true"]')
      const mod = event.ctrlKey || event.metaKey
      const lower = event.key.toLowerCase()

      if (mod && event.key === '/') {
        event.preventDefault()
        setHelpOpen((v) => !v)
        return
      }
      if (typing || helpOpen || editingStep || editingAction || editingTransition) return

      if (mod && lower === 'z') {
        event.preventDefault()
        if (event.shiftKey) doRedo()
        else doUndo()
        return
      }
      if (mod && lower === 'y') {
        event.preventDefault()
        doRedo()
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selected) {
          event.preventDefault()
          deleteSelected()
        }
        return
      }
      if (event.key === 'Escape') {
        setSelected(null)
        setSelectedType(null)
        return
      }
      if (event.key === '1') { setTool('select'); return }
      if (event.key === '2') { setTool('step'); return }
      if (event.key === '3') { setTool('transition'); return }
      if (event.key === '4') { setTool('action'); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Shortcuts hook
  useEditorShortcuts(
    {
      undo: doUndo,
      redo: doRedo,
      fitView: resetView,
      zoomView: (factor) => zoomAt(zoom * factor, { x: viewport.width / 2, y: viewport.height / 2 }),
      panView: (dx, dy) => setPan((p) => ({ x: p.x - dx, y: p.y - dy })),
    },
    { enabled: full && !helpOpen }
  )

  // Validation
  const issues: GrafcetIssue[] = useMemo(() => validateGrafcet({ ...program, transitions }), [program, transitions])
  const errorCount = issues.filter((i) => i.level === 'error').length

  // Variables used in Grafcet
  const usedVariables = useMemo(() => {
    const set = new Set<string>()
    // From actions
    steps.forEach((s) => {
      actionsOfStep(s).forEach((a) => {
        if (a.variable) set.add(a.variable)
        if (a.address) set.add(a.address)
      })
    })
    // From transitions
    transitions.forEach((t) => {
      const vars = t.condition.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []
      vars.forEach((v) => {
        const u = v.toUpperCase()
        if (!['NOT', 'AND', 'OR', 'T', 'MS', 'S', 'HZ'].includes(u) && !u.startsWith('X')) {
          set.add(v)
        }
      })
    })
    return [...set].sort()
  }, [steps, transitions])

  // Filtered lists for inspector
  const filteredSteps = steps.filter(
    (s, idx) =>
      !entityFilter ||
      s.name.includes(entityFilter) ||
      (s.description ?? '').toLowerCase().includes(entityFilter.toLowerCase()) ||
      String(idx) === entityFilter
  )

  const filteredTransitions = transitions.filter(
    (t, idx) =>
      !entityFilter ||
      (t.name ?? '').includes(entityFilter) ||
      t.condition.toLowerCase().includes(entityFilter.toLowerCase()) ||
      String(idx + 1) === entityFilter
  )

  return (
    <div className={`grafcet-editor grafcet-designer ${full ? 'grafcet-full' : 'grafcet-preview'}`}>
      {/* HEADER */}
      <header className="grafcet-header">
        <div className="grafcet-title">
          <strong>GRAFCET</strong>
          <small>
            {steps.length} etapas · {transitions.length} transições · {runtime.active.length} ativas
          </small>
        </div>

        {full && (
          <div className="grafcet-header-actions">
            {/* Validation badge */}
            <button
              className={`grafcet-validation ${issues.length ? 'has-issues' : 'is-valid'}`}
              title={issues.length ? 'Ver diagnóstico' : 'GRAFCET válido'}
              onClick={() => setTab('diagnostics')}
            >
              {errorCount ? `✖ ${errorCount} erro${errorCount === 1 ? '' : 's'}` : issues.length ? `⚠ ${issues.length}` : '✓ Validado'}
            </button>

            {/* Undo / Redo */}
            <button className="grafcet-icon-button" onClick={doUndo} disabled={!history.length} title="Desfazer (Ctrl+Z)" aria-label="Desfazer">
              <IconUndo size={14} />
            </button>
            <button className="grafcet-icon-button" onClick={doRedo} disabled={!future.length} title="Refazer (Ctrl+Y)" aria-label="Refazer">
              <IconRedo size={14} />
            </button>

            {/* Modelos / Templates */}
            <div style={{ position: 'relative' }}>
              <button className="dc-btn" onClick={() => setTemplatesOpen((v) => !v)} title="Carregar exemplos industriais e exercícios">
                ★ Modelos
              </button>
              {templatesOpen && (
                <div className="grafcet-var-picker-popover" style={{ width: '260px' }}>
                  <div className="grafcet-var-picker-head">
                    <span>Exemplos Industriais</span>
                    <button onClick={() => setTemplatesOpen(false)}>✕</button>
                  </div>
                  <div className="grafcet-var-picker-list">
                    {GRAFCET_TEMPLATES.map((tmpl) => (
                      <button
                        key={tmpl.id}
                        type="button"
                        className="grafcet-var-picker-item"
                        style={{ padding: '6px 8px' }}
                        onClick={() => loadTemplate(tmpl)}
                      >
                        <strong>{tmpl.name}</strong>
                        <small style={{ display: 'block', fontSize: '9.5px', color: '#64748b' }}>{tmpl.description}</small>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Ladder generation */}
            {canGenerateLadder && (
              <button className="dc-btn" onClick={() => void generateLadder()} title="Converter para Ladder IEC 61131-3">
                ⇢ Gerar Ladder
              </button>
            )}

            {/* Simulation controls */}
            <span className="grafcet-header-separator" />
            <button
              className={`dc-btn ${running ? 'dc-btn-primary' : ''}`}
              onClick={() => (running ? simPause() : simPlay())}
              title={running ? 'Pausar simulação' : 'Iniciar simulação'}
            >
              {running ? '⏸ Pausar' : '▶ Simular'}
            </button>
            <button className="dc-btn" onClick={simStop} disabled={runState === 'stopped'} title="Parar simulação">
              ⏹ Parar
            </button>
            <button className="dc-btn" onClick={() => simStep()} title="Avançar um ciclo de scan (Passo a Passo)">
              ⏭ Passo
            </button>
            <button
              className="grafcet-icon-button"
              onClick={() => {
                useSimStore.getState().restartGrafcet()
                notify('Sequência reiniciada nas etapas iniciais')
              }}
              title="Reiniciar etapas iniciais (⟲)"
              aria-label="Reiniciar sequência"
            >
              ⟲
            </button>

            {/* Speed selector */}
            <select
              className="dc-input"
              style={{ padding: '3px 6px', fontSize: '11px', width: '64px' }}
              value={simSpeed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              title="Velocidade da simulação"
            >
              <option value="0.5">0.5x</option>
              <option value="1">1x</option>
              <option value="2">2x</option>
              <option value="5">5x</option>
            </select>

            {/* Export menu */}
            <button className="dc-btn" onClick={exportSvg} title="Exportar diagrama em formato SVG vetorial">
              SVG
            </button>
            <button className="dc-btn" onClick={exportJson} title="Exportar projeto em JSON">
              Salvar
            </button>
            <button className="dc-btn" onClick={() => fileInputRef.current?.click()} title="Abrir projeto JSON">
              Abrir
            </button>
            <input ref={fileInputRef} type="file" accept=".json,.grafcet" style={{ display: 'none' }} onChange={importJson} />

            <button className="grafcet-icon-button" onClick={() => setHelpOpen(true)} title="Atalhos do teclado (?)">
              <IconHelp size={14} />
            </button>
          </div>
        )}

        {!full && (
          <button className="dc-btn-primary dc-btn" onClick={onOpenEditor}>
            Abrir editor ↗
          </button>
        )}
      </header>

      {/* RIBBON TOOLBAR (grafcet.io style) */}
      {full && (
        <nav className="grafcet-ribbon" aria-label="Ferramentas de Criação GRAFCET">
          <div className="grafcet-ribbon-group">
            <button
              className={`grafcet-ribbon-btn ${tool === 'select' ? 'is-active' : ''}`}
              onClick={() => setTool('select')}
              title="Ponteiro: mover e selecionar (Tecla 1)"
            >
              ↖ Ponteiro
            </button>
            <button
              className={`grafcet-ribbon-btn ${tool === 'step' ? 'is-active' : ''}`}
              onClick={() => { setTool('step'); addStepAt() }}
              title="Adicionar etapa simples (□)"
            >
              + Etapa
            </button>
            <button
              className="grafcet-ribbon-btn"
              onClick={() => addInitialStepAt()}
              title="Adicionar etapa inicial com duplo quadrado (⧈)"
            >
              + Etapa Inicial
            </button>
            <button
              className="grafcet-ribbon-btn"
              onClick={addTransition}
              disabled={steps.length < 2}
              title="Adicionar transição entre etapas (─)"
            >
              + Transição
            </button>
            <button
              className="grafcet-ribbon-btn"
              onClick={() => selectedStep && addActionToStep(selectedStep)}
              disabled={!selectedStep}
              title="Adicionar ação à etapa selecionada"
            >
              + Ação
            </button>
            <button
              className="grafcet-ribbon-btn"
              onClick={addQuickSequence}
              title="Criar sequência rápida: Etapa → Transição → Etapa"
            >
              ⚡ Sequência
            </button>
          </div>

          <div className="grafcet-ribbon-group">
            <button className="grafcet-ribbon-btn" onClick={() => addCommentAt()} title="Adicionar título ou comentário no diagrama">
              T Título
            </button>
            <button
              className={`grafcet-ribbon-btn ${snapToGrid ? 'is-active' : ''}`}
              onClick={() => setSnapToGrid((v) => !v)}
              title="Encaixar na grelha de 20px"
            >
              # Grelha
            </button>
            <button className="grafcet-ribbon-btn" onClick={resetView} title="Enquadrar vista (100%)">
              ⊡ Ajustar
            </button>
          </div>

          {/* Sub-chart switcher */}
          <div className="grafcet-ribbon-group" style={{ borderRight: 'none', marginLeft: 'auto' }}>
            <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>Vista:</span>
            <select
              className="dc-input"
              style={{ padding: '2px 8px', fontSize: '11px', height: '26px' }}
              value={activeChart}
              onChange={(e) => setActiveChart(e.target.value)}
              title="Filtrar por Sub-GRAFCET (ex: G0, G1, G2)"
            >
              <option value="all">Todos os Grafcets</option>
              <option value="G0">G0 - Controlo</option>
              <option value="G1">G1 - Funcionamento</option>
              <option value="G2">G2 - Reset</option>
            </select>
          </div>
        </nav>
      )}

      {/* DESIGNER BODY */}
      <div className="grafcet-designer-body">
        {/* CANVAS */}
        <div
          ref={viewportRef}
          className="grafcet-canvas"
          onWheel={onWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ cursor: tool === 'select' ? 'default' : 'crosshair' }}
        >
          {/* Viewport Zoom Controls */}
          {!!steps.length && (
            <div className="grafcet-viewport-tools" onPointerDown={(e) => e.stopPropagation()}>
              <button onClick={() => zoomAt(zoom / 1.2, { x: viewport.width / 2, y: viewport.height / 2 })}>−</button>
              <span>{Math.round(zoom * 100)}%</span>
              <button onClick={() => zoomAt(zoom * 1.2, { x: viewport.width / 2, y: viewport.height / 2 })}>+</button>
              <button onClick={resetView}>100%</button>
            </div>
          )}

          {/* Empty state */}
          {!steps.length && (
            <div className="grafcet-empty">
              <strong>Ainda não há etapas</strong>
              <p>{full ? 'Crie a primeira etapa ou escolha um modelo para começar.' : 'Abra o editor para desenhar o GRAFCET.'}</p>
              {full && (
                <div className="grafcet-empty-actions">
                  <button className="dc-btn-primary dc-btn" onClick={() => addInitialStepAt()}>
                    + Criar Etapa Inicial
                  </button>
                  <button className="dc-btn" onClick={() => loadTemplate(GRAFCET_TEMPLATES[0])}>
                    Carregar G0 - Controlo
                  </button>
                </div>
              )}
            </div>
          )}

          {/* SVG DIAGRAM */}
          {!!steps.length && (
            <svg
              ref={svgRef}
              className="grafcet-main-svg"
              width="100%"
              height="100%"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: '0 0',
                overflow: 'visible',
              }}
            >
              <defs>
                <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                  <path d="M0 1 L7 4 L0 7" fill="none" stroke="#334155" strokeWidth="1.6" />
                </marker>
                <marker id="arrow-active" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                  <path d="M0 1 L7 4 L0 7" fill="none" stroke="#16a34a" strokeWidth="2" />
                </marker>
              </defs>

              {/* COMMENTS / LABELS */}
              {comments
                .filter((c) => activeChart === 'all' || !c.chart || c.chart === activeChart)
                .map((c) => (
                  <g
                    key={c.id}
                    data-comment-id={c.id}
                    transform={`translate(${c.x}, ${c.y})`}
                    style={{ cursor: 'move' }}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelected(c.id)
                      setSelectedType('comment')
                    }}
                  >
                    <text
                      fontSize={c.fontSize ?? 15}
                      fontWeight={c.fontWeight ?? '700'}
                      fill="#0f172a"
                      fontFamily="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
                    >
                      {c.text}
                    </text>
                  </g>
                ))}

              {/* TRANSITIONS & FLOW LINES */}
              {transitions
                .filter((t) => activeChart === 'all' || !t.chart || t.chart === activeChart)
                .map((t, tIdx) => {
                  const sources = t.from.map(getStepPos)
                  const targets = t.to.map(getStepPos)
                  if (!sources.length) return null

                  const pos = getTransPos(t)
                  const isSourcesActive = t.from.every((id) => runtime.active.includes(id))
                  const condTrue = validCondition(t.condition) && evalCondition(t.condition, table)
                  const enabled = isSourcesActive && condTrue
                  const isWaiting = isSourcesActive && !condTrue
                  const strokeColor = enabled ? '#16a34a' : isWaiting ? '#d97706' : '#334155'
                  const isSelected = selected === t.id && selectedType === 'transition'

                  // Check if transition has a timer
                  const iecTimer = parseIecTimer(t.condition)
                  let timerProgressText = ''
                  if (iecTimer && isSourcesActive) {
                    const elapsed = Math.min(...t.from.map((id) => runtime.elapsed?.[id] ?? 0))
                    timerProgressText = `[${fmtDuration(elapsed)} / ${fmtDuration(iecTimer.d1)}]`
                  }

                  const onTransDoubleClick = (e: React.MouseEvent) => {
                    e.stopPropagation()
                    setEditingTransition(t)
                  }

                  const onTransClick = (e: React.MouseEvent) => {
                    e.stopPropagation()
                    setSelected(t.id)
                    setSelectedType('transition')
                    setTab('properties')
                    // If running and enabled, clicking fires the transition!
                    if (running && isSourcesActive) {
                      useSimStore.getState().fireGrafcetTransition(t.id)
                      notify(`Transição ${t.name || tIdx + 1} disparada`)
                    }
                  }

                  return (
                    <g
                      key={t.id}
                      data-trans-id={t.id}
                      className="grafcet-trans-node"
                      onClick={onTransClick}
                      onDoubleClick={onTransDoubleClick}
                      style={{ cursor: isSourcesActive ? 'pointer' : 'default' }}
                    >
                      {/* Connection lines from sources */}
                      {sources.map((sPos, sIdx) => {
                        const startX = sPos.x + 27
                        const startY = sPos.y + 54
                        const pathD =
                          sources.length === 1
                            ? `M ${startX} ${startY} V ${pos.y}`
                            : `M ${startX} ${startY} V ${pos.y - 12} H ${pos.x + 27} V ${pos.y}`
                        return (
                          <path
                            key={sIdx}
                            d={pathD}
                            fill="none"
                            stroke={strokeColor}
                            strokeWidth={enabled ? 3 : 2}
                          />
                        )
                      })}

                      {/* Connection lines to targets (or loopback/jump) */}
                      {targets.map((tPos, tgtIdx) => {
                        const endX = tPos.x + 27
                        const endY = tPos.y
                        const startY = pos.y + 20

                        // Loopback / return up
                        if (endY <= pos.y) {
                          const returnOffset = 30 + (tgtIdx % 3) * 15
                          return (
                            <path
                              key={tgtIdx}
                              d={`M ${pos.x + 27} ${startY} V ${startY + 20} H ${pos.x - returnOffset} V ${endY - 15} H ${endX} V ${endY}`}
                              fill="none"
                              stroke={strokeColor}
                              strokeWidth={enabled ? 3 : 2}
                              markerEnd={enabled ? 'url(#arrow-active)' : 'url(#arrow)'}
                            />
                          )
                        }

                        const pathD =
                          targets.length === 1
                            ? `M ${pos.x + 27} ${startY} V ${endY}`
                            : `M ${pos.x + 27} ${startY} V ${startY + 12} H ${endX} V ${endY}`
                        return (
                          <path
                            key={tgtIdx}
                            d={pathD}
                            fill="none"
                            stroke={strokeColor}
                            strokeWidth={enabled ? 3 : 2}
                            markerEnd={enabled ? 'url(#arrow-active)' : 'url(#arrow)'}
                          />
                        )
                      })}

                      {/* Horizontal Crossbar / Tick */}
                      <line
                        x1={pos.x + 13}
                        y1={pos.y + 20}
                        x2={pos.x + 41}
                        y2={pos.y + 20}
                        stroke={isSelected ? '#2563eb' : strokeColor}
                        strokeWidth={enabled || isSelected ? 4 : 3}
                      />

                      {/* Condition formula text with overline support */}
                      <g transform={`translate(${pos.x + 48}, ${pos.y + 24})`}>
                        <text
                          fontSize="12.5"
                          fontWeight={enabled ? '700' : '600'}
                          fill={isSelected ? '#2563eb' : enabled ? '#15803d' : isWaiting ? '#b45309' : '#0f172a'}
                          fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
                        >
                          {t.displayDescription && t.description
                            ? t.description
                            : renderConditionTspans(t.condition)}
                        </text>

                        {/* Live Timer progress */}
                        {timerProgressText && (
                          <text x="0" y="16" fontSize="10.5" fontWeight="700" fill="#15803d">
                            {timerProgressText}
                          </text>
                        )}
                      </g>

                      {/* Target Info label (FluidSIM style jump destination) */}
                      {t.targetInfo && (
                        <g transform={`translate(${pos.x + 27}, ${pos.y + 40})`}>
                          <text textAnchor="middle" fontSize="12" fontWeight="700" fill="#2563eb">
                            {t.targetInfo}
                          </text>
                        </g>
                      )}

                      {/* Hover quick-add step button */}
                      <g
                        className="grafcet-quick-btn"
                        transform={`translate(${pos.x + 27}, ${pos.y + 35})`}
                        onClick={(e) => {
                          e.stopPropagation()
                          addStepBelowTransition(t)
                        }}
                      >
                        <circle cx="0" cy="0" r="7" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.2" />
                        <text cx="0" cy="0" textAnchor="middle" dy="3.5" fontSize="10" fontWeight="bold" fill="#64748b">+</text>
                      </g>
                    </g>
                  )
                })}

              {/* STEPS & ATTACHED ACTIONS */}
              {steps
                .filter((s) => activeChart === 'all' || !s.chart || s.chart === activeChart)
                .map((s, idx) => {
                  const pos = getStepPos(s.id)
                  const isActive = runtime.active.includes(s.id)
                  const isSelected = selected === s.id && selectedType === 'step'
                  const isInitial = s.initial || s.stepType === 'initial' || s.stepType === 'initial-enclosing'
                  const isMacro = s.stepType === 'macro'
                  const isInput = s.stepType === 'macro-input'
                  const isOutput = s.stepType === 'macro-output'
                  const isEnclosing = s.stepType === 'enclosing' || s.stepType === 'initial-enclosing'

                  const stepActions = actionsOfStep(s)

                  const onStepDoubleClick = (e: React.MouseEvent) => {
                    e.stopPropagation()
                    setEditingStep(s)
                  }

                  const onStepClick = (e: React.MouseEvent) => {
                    e.stopPropagation()
                    setSelected(s.id)
                    setSelectedType('step')
                    setTab('properties')
                  }

                  return (
                    <g
                      key={s.id}
                      data-step-id={s.id}
                      className={`grafcet-step-node ${isActive ? 'is-active' : ''}`}
                      transform={`translate(${pos.x}, ${pos.y})`}
                      onClick={onStepClick}
                      onDoubleClick={onStepDoubleClick}
                      style={{ cursor: 'move' }}
                    >
                      {/* Outer Step Box */}
                      <rect
                        x="0"
                        y="0"
                        width="54"
                        height="54"
                        fill={isActive ? '#dcfce7' : '#ffffff'}
                        stroke={isSelected ? '#2563eb' : isActive ? '#16a34a' : '#1e293b'}
                        strokeWidth={isSelected || isActive ? 3 : 2.2}
                        rx="1"
                      />

                      {/* Initial step inner box */}
                      {isInitial && (
                        <rect
                          x="5"
                          y="5"
                          width="44"
                          height="44"
                          fill="none"
                          stroke={isSelected ? '#2563eb' : isActive ? '#16a34a' : '#1e293b'}
                          strokeWidth="1.6"
                          rx="1"
                        />
                      )}

                      {/* Macro step horizontal bars */}
                      {isMacro && (
                        <>
                          <line x1="0" y1="10" x2="54" y2="10" stroke="#1e293b" strokeWidth="1.6" />
                          <line x1="0" y1="44" x2="54" y2="44" stroke="#1e293b" strokeWidth="1.6" />
                          <text x="27" y="8" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#64748b">M</text>
                        </>
                      )}

                      {/* Macro input/output markers */}
                      {isInput && <text x="8" y="14" fontSize="10" fontWeight="bold" fill="#64748b">E</text>}
                      {isOutput && <text x="44" y="48" fontSize="10" fontWeight="bold" fill="#64748b">S</text>}

                      {/* Enclosing step diagonal corner lines */}
                      {isEnclosing && (
                        <>
                          <line x1="0" y1="12" x2="12" y2="0" stroke="#1e293b" strokeWidth="2" />
                          <line x1="42" y1="0" x2="54" y2="12" stroke="#1e293b" strokeWidth="2" />
                          <line x1="0" y1="42" x2="12" y2="54" stroke="#1e293b" strokeWidth="2" />
                          <line x1="42" y1="54" x2="54" y2="42" stroke="#1e293b" strokeWidth="2" />
                        </>
                      )}

                      {/* Active green activity token dot */}
                      {isActive && (
                        <circle cx="27" cy="14" r="5" fill="#22c55e">
                          <animate attributeName="r" values="4;6.5;4" dur="1.2s" repeatCount="indefinite" />
                        </circle>
                      )}

                      {/* Step Number / Name */}
                      <text
                        x="27"
                        y={isActive ? 36 : 33}
                        textAnchor="middle"
                        fontSize="17"
                        fontWeight="700"
                        fill="#0f172a"
                        fontFamily="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
                      >
                        {s.name || idx}
                      </text>

                      {/* Active timer badge */}
                      {isActive && (
                        <text x="27" y="49" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#15803d">
                          ⏱ {fmtDuration(runtime.elapsed?.[s.id] ?? 0)}
                        </text>
                      )}

                      {/* Step Description / Comment to the right */}
                      {(s.description || s.comment) && (
                        <text
                          x={stepActions.length ? 68 + stepActions.length * 170 : 68}
                          y="32"
                          fontSize="13"
                          fontWeight="700"
                          fill="#1e293b"
                          fontFamily="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
                        >
                          "{s.description || s.comment}"
                        </text>
                      )}

                      {/* ATTACHED ACTIONS (FluidSIM style) */}
                      {stepActions.map((action, aIdx) => {
                        const actX = 68 + aIdx * 170
                        const actY = 12
                        const actW = 155
                        const actH = 30
                        const actKind = action.kind ?? 'N'
                        const isActionOn = !!table[action.address] || !!table[action.variable ?? '']
                        const isConditional = action.type === 'conditional' || (action.condition && action.condition !== '1')
                        const isActivation = action.allocation === 'activation' || actKind === 'A'
                        const isDeactivation = action.allocation === 'deactivation' || actKind === 'DA'
                        const isCompulsory = action.allocation === 'compulsory' || actKind === 'C'
                        const isSelectedAction = selected === action.id && selectedType === 'action'

                        const displayText = action.displayDescription && action.description
                          ? action.description
                          : (isConditional && action.condition !== '1'
                              ? `${action.variable || action.address} [${action.condition}]`
                              : action.variable || action.address || 'Ação')

                        const onActionDoubleClick = (e: React.MouseEvent) => {
                          e.stopPropagation()
                          setEditingAction({ step: s, action })
                        }

                        const onActionClick = (e: React.MouseEvent) => {
                          e.stopPropagation()
                          setSelected(action.id)
                          setSelectedType('action')
                          setTab('properties')
                        }

                        return (
                          <g
                            key={action.id}
                            className="grafcet-action-node"
                            onClick={onActionClick}
                            onDoubleClick={onActionDoubleClick}
                            style={{ cursor: 'pointer' }}
                          >
                            {/* Horizontal leader connector line */}
                            <line
                              x1={aIdx === 0 ? 54 : actX - 15}
                              y1={27}
                              x2={actX}
                              y2={27}
                              stroke={isActionOn ? '#16a34a' : '#1e293b'}
                              strokeWidth={isActionOn ? 2.5 : 1.8}
                            />

                            {/* Conditional flag / notch */}
                            {isConditional && (
                              <g>
                                <path
                                  d={`M ${actX + 16} ${actY} V ${actY - 12} H ${actX + 54}`}
                                  fill="none"
                                  stroke={isActionOn ? '#16a34a' : '#1e293b'}
                                  strokeWidth="1.4"
                                />
                                <text x={actX + 20} y={actY - 15} fontSize="9.5" fontWeight="700" fill="#2563eb">
                                  {action.condition}
                                </text>
                              </g>
                            )}

                            {/* Action rectangle */}
                            <rect
                              x={actX}
                              y={actY}
                              width={actW}
                              height={actH}
                              fill={isActionOn ? '#dcfce7' : '#ffffff'}
                              stroke={isSelectedAction ? '#2563eb' : isActionOn ? '#16a34a' : '#1e293b'}
                              strokeWidth={isSelectedAction || isActionOn ? 2.2 : 1.6}
                              rx="1"
                            />

                            {/* Compulsory double border */}
                            {isCompulsory && (
                              <rect
                                x={actX + 3}
                                y={actY + 3}
                                width={actW - 6}
                                height={actH - 6}
                                fill="none"
                                stroke={isActionOn ? '#16a34a' : '#1e293b'}
                                strokeWidth="1.1"
                              />
                            )}

                            {/* Allocation arrow UP on left edge */}
                            {isActivation && (
                              <g stroke={isActionOn ? '#16a34a' : '#1e293b'} strokeWidth="1.6" fill="none">
                                <line x1={actX + 8} y1={actY + 22} x2={actX + 8} y2={actY + 8} />
                                <path d={`M ${actX + 5} ${actY + 12} L ${actX + 8} ${actY + 7} L ${actX + 11} ${actY + 12}`} />
                              </g>
                            )}

                            {/* Allocation arrow DOWN on left edge */}
                            {isDeactivation && (
                              <g stroke={isActionOn ? '#16a34a' : '#1e293b'} strokeWidth="1.6" fill="none">
                                <line x1={actX + 8} y1={actY + 8} x2={actX + 8} y2={actY + 22} />
                                <path d={`M ${actX + 5} ${actY + 18} L ${actX + 8} ${actY + 23} L ${actX + 11} ${actY + 18}`} />
                              </g>
                            )}

                            {/* IEC Qualifier Box (S, R, D, L) */}
                            {['S', 'R', 'D', 'L'].includes(actKind) && (
                              <g>
                                <line
                                  x1={actX + 28}
                                  y1={actY}
                                  x2={actX + 28}
                                  y2={actY + actH}
                                  stroke={isActionOn ? '#16a34a' : '#1e293b'}
                                  strokeWidth="1.2"
                                />
                                <text
                                  x={actX + 14}
                                  y={actY + 19}
                                  textAnchor="middle"
                                  fontSize="10"
                                  fontWeight="700"
                                  fill={isActionOn ? '#15803d' : '#2563eb'}
                                >
                                  {actKind}
                                </text>
                              </g>
                            )}

                            {/* Action Text */}
                            <text
                              x={['S', 'R', 'D', 'L'].includes(actKind) ? actX + 36 : isActivation || isDeactivation ? actX + 20 : actX + 10}
                              y={actY + 19}
                              fontSize="11.5"
                              fontWeight={isActionOn ? '700' : '600'}
                              fill={isActionOn ? '#15803d' : '#0f172a'}
                              fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
                            >
                              {displayText}
                            </text>
                          </g>
                        )
                      })}

                      {/* Hover quick-add transition button below */}
                      <g
                        className="grafcet-quick-btn"
                        transform="translate(27, 62)"
                        onClick={(e) => {
                          e.stopPropagation()
                          addConnectedStepBelow(s)
                        }}
                      >
                        <circle cx="0" cy="0" r="7" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.2" />
                        <text cx="0" cy="0" textAnchor="middle" dy="3.5" fontSize="10" fontWeight="bold" fill="#64748b">+</text>
                      </g>

                      {/* Hover quick-add action button right */}
                      <g
                        className="grafcet-quick-btn"
                        transform={`translate(${54 + (stepActions.length ? stepActions.length * 170 : 0) + 10}, 27)`}
                        onClick={(e) => {
                          e.stopPropagation()
                          addActionToStep(s)
                        }}
                      >
                        <circle cx="0" cy="0" r="7" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.2" />
                        <text cx="0" cy="0" textAnchor="middle" dy="3.5" fontSize="10" fontWeight="bold" fill="#64748b">+</text>
                      </g>
                    </g>
                  )
                })}
            </svg>
          )}
        </div>

        {/* RIGHT SIDEBAR / INSPECTOR */}
        {full && (
          <aside className="grafcet-properties">
            <div className="grafcet-properties-summary">
              <div>
                <strong>
                  {selectedStep
                    ? `Etapa ${selectedStep.name || steps.indexOf(selectedStep)}`
                    : selectedTransition
                    ? `Transição ${selectedTransition.name || transitions.indexOf(selectedTransition) + 1}`
                    : selectedComment
                    ? 'Nota de Texto'
                    : 'Inspetor GRAFCET'}
                </strong>
                <small>{running ? '● Simulação ativa' : '○ Simulação parada'}</small>
              </div>

              {selected && (
                <div className="grafcet-selection-actions">
                  <button
                    onClick={() => {
                      if (selectedStep) setEditingStep(selectedStep)
                      else if (selectedTransition) setEditingTransition(selectedTransition)
                    }}
                    title="Editar no Diálogo FluidSIM"
                    aria-label="Editar diálogo"
                  >
                    ⚙
                  </button>
                  <button className="is-danger" onClick={deleteSelected} title="Eliminar (Del)" aria-label="Eliminar seleção">
                    <IconDelete size={13} />
                  </button>
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="grafcet-tabs" role="tablist">
              <button role="tab" aria-selected={tab === 'properties'} className={tab === 'properties' ? 'is-active' : ''} onClick={() => setTab('properties')}>
                Propriedades
              </button>
              <button role="tab" aria-selected={tab === 'steps'} className={tab === 'steps' ? 'is-active' : ''} onClick={() => setTab('steps')}>
                Etapas <em>{steps.length}</em>
              </button>
              <button role="tab" aria-selected={tab === 'transitions'} className={tab === 'transitions' ? 'is-active' : ''} onClick={() => setTab('transitions')}>
                Transições <em>{transitions.length}</em>
              </button>
              <button role="tab" aria-selected={tab === 'simulator'} className={tab === 'simulator' ? 'is-active' : ''} onClick={() => setTab('simulator')}>
                Simulador
              </button>
              <button role="tab" aria-selected={tab === 'diagnostics'} className={tab === 'diagnostics' ? `is-active ${issues.length ? 'has-warning' : ''}` : ''} onClick={() => setTab('diagnostics')}>
                Diagnóstico <em>{issues.length}</em>
              </button>
            </div>

            {/* TAB: PROPERTIES */}
            {tab === 'properties' && (
              <div className="grafcet-form">
                {selectedStep && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <h3>Etapa {selectedStep.name}</h3>
                      <button className="dc-btn" onClick={() => setEditingStep(selectedStep)}>
                        Abrir Diálogo FluidSIM ↗
                      </button>
                    </div>

                    <label>
                      Nome
                      <input
                        className="dc-input"
                        value={selectedStep.name}
                        onChange={(e) => updateStep(selectedStep.id, { name: e.target.value })}
                      />
                    </label>

                    <label className="grafcet-inline">
                      <input
                        type="checkbox"
                        checked={selectedStep.initial || selectedStep.stepType === 'initial'}
                        onChange={(e) => updateStep(selectedStep.id, { initial: e.target.checked, stepType: e.target.checked ? 'initial' : 'simple' }, 'force')}
                      />
                      Etapa inicial
                    </label>

                    <label>
                      Descrição / Nota
                      <input
                        className="dc-input"
                        value={selectedStep.description ?? selectedStep.comment ?? ''}
                        placeholder="Ex: Maquina Parada, Maquina Auto"
                        onChange={(e) => updateStep(selectedStep.id, { description: e.target.value, comment: e.target.value })}
                      />
                    </label>

                    <div className="grafcet-step-tools">
                      <button
                        className="dc-btn"
                        onClick={() => {
                          useSimStore.getState().forceGrafcetSteps([selectedStep.id])
                          notify(`Etapa ${selectedStep.name} forçada`)
                        }}
                      >
                        ⚑ Forçar esta etapa
                      </button>
                      {runtime.active.includes(selectedStep.id) && (
                        <span className="grafcet-step-timer">ativa há {fmtDuration(runtime.elapsed?.[selectedStep.id] ?? 0)}</span>
                      )}
                    </div>

                    {/* Actions List */}
                    <div className="grafcet-form-heading">
                      <h3>Ações ({actionsOfStep(selectedStep).length})</h3>
                      <button onClick={() => addActionToStep(selectedStep)}>+ ação</button>
                    </div>

                    {actionsOfStep(selectedStep).map((act) => (
                      <div key={act.id} className="grafcet-action-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>
                          <b>{act.variable || act.address}</b>: {act.description || act.condition}
                        </span>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button className="dc-btn" onClick={() => setEditingAction({ step: selectedStep, action: act })}>
                            Editar
                          </button>
                          <button
                            className="dc-btn grafcet-danger"
                            onClick={() =>
                              updateStep(
                                selectedStep.id,
                                { actions: (selectedStep.actions ?? []).filter((a) => a.id !== act.id) },
                                'force'
                              )
                            }
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {selectedTransition && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <h3>Transição {selectedTransition.name}</h3>
                      <button className="dc-btn" onClick={() => setEditingTransition(selectedTransition)}>
                        Abrir Diálogo FluidSIM ↗
                      </button>
                    </div>

                    <label>
                      Condição / Receptividade
                      <input
                        className="dc-input"
                        value={selectedTransition.condition}
                        onChange={(e) => updateTransition(selectedTransition.id, { condition: e.target.value })}
                        placeholder="Ex: 1s/X45, B_Start * /In_Man"
                      />
                    </label>

                    {/* Quick tokens */}
                    <div className="grafcet-token-chips">
                      <button onClick={() => updateTransition(selectedTransition.id, { condition: `${selectedTransition.condition} * ` })}>AND (*)</button>
                      <button onClick={() => updateTransition(selectedTransition.id, { condition: `${selectedTransition.condition} + ` })}>OR (+)</button>
                      <button onClick={() => updateTransition(selectedTransition.id, { condition: `${selectedTransition.condition} /` })}>NOT (/)</button>
                      <button onClick={() => updateTransition(selectedTransition.id, { condition: `${selectedTransition.condition} 1s/X` })}>1s/X</button>
                      <button onClick={() => updateTransition(selectedTransition.id, { condition: '1' })}>1 (Sempre)</button>
                    </div>

                    <label>
                      Salto / Destino (Connection ID)
                      <input
                        className="dc-input"
                        value={selectedTransition.targetInfo ?? ''}
                        placeholder="Ex: 1, 11, 51"
                        onChange={(e) => updateTransition(selectedTransition.id, { targetInfo: e.target.value })}
                      />
                    </label>

                    <div className="grafcet-condition-state">
                      <span className={validCondition(selectedTransition.condition) && evalCondition(selectedTransition.condition, table) ? 'is-on' : ''}>
                        <i /> Receptividade: {validCondition(selectedTransition.condition) && evalCondition(selectedTransition.condition, table) ? 'VERDADEIRO' : 'FALSO'}
                      </span>
                    </div>

                    <button
                      className="dc-btn"
                      disabled={!selectedTransition.from.every((id) => runtime.active.includes(id))}
                      onClick={() => {
                        const fired = useSimStore.getState().fireGrafcetTransition(selectedTransition.id)
                        notify(fired ? 'Transição disparada' : 'As etapas de origem não estão ativas')
                      }}
                    >
                      ▶ Disparar manualmente
                    </button>
                  </>
                )}

                {selectedComment && (
                  <>
                    <h3>Nota de Texto</h3>
                    <label>
                      Texto
                      <input
                        className="dc-input"
                        value={selectedComment.text}
                        onChange={(e) => updateComment(selectedComment.id, { text: e.target.value })}
                      />
                    </label>
                  </>
                )}

                {!selected && <p className="grafcet-hint">Selecione uma etapa ou transição no diagrama para editar propriedades e ver o estado.</p>}
              </div>
            )}

            {/* TAB: STEPS */}
            {tab === 'steps' && (
              <div className="grafcet-entity-list">
                {filteredSteps.map((step) => {
                  const isActive = runtime.active.includes(step.id)
                  return (
                    <div key={step.id} className={`grafcet-step-row ${selected === step.id ? 'is-active' : ''}`}>
                      <button
                        onClick={() => {
                          setSelected(step.id)
                          setSelectedType('step')
                          setTab('properties')
                        }}
                      >
                        {step.initial ? '◎' : '□'} <b>{step.name}</b> <span>{step.description || step.comment || ''}</span>
                        {isActive && <i title="Etapa ativa" className="is-on" />}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* TAB: TRANSITIONS */}
            {tab === 'transitions' && (
              <div className="grafcet-entity-list">
                {filteredTransitions.map((t, idx) => {
                  const condTrue = validCondition(t.condition) && evalCondition(t.condition, table)
                  return (
                    <div key={t.id} className={`grafcet-transition-row ${selected === t.id ? 'is-active' : ''}`}>
                      <button
                        onClick={() => {
                          setSelected(t.id)
                          setSelectedType('transition')
                          setTab('properties')
                        }}
                      >
                        <i className={condTrue ? 'is-on' : ''} />
                        <b>{t.name || `T${idx + 1}`}</b>: {t.condition}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* TAB: SIMULATOR & IO */}
            {tab === 'simulator' && (
              <div className="grafcet-io">
                <VirtualIoPanel compact extraBits={usedVariables} />
                <div className="vio-panel is-compact">
                  <div className="vio-head">
                    <strong>Etapas Ativas</strong>
                    <small>{runtime.fired ?? 0} transições</small>
                  </div>
                  <div className="grafcet-active-list">
                    {runtime.active.map((id) => {
                      const s = steps.find((item) => item.id === id)
                      return (
                        <button key={id} onClick={() => { setSelected(id); setSelectedType('step'); setTab('properties') }}>
                          <b>{s?.name || id}</b> {s?.description} <em>{fmtDuration(runtime.elapsed?.[id] ?? 0)}</em>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: DIAGNOSTICS */}
            {tab === 'diagnostics' && (
              <div className="grafcet-diagnostics">
                <div className={`grafcet-diagnostic-summary ${issues.length ? 'has-issues' : 'is-valid'}`}>
                  <strong>{issues.length ? `${errorCount} erro(s) · ${issues.length - errorCount} aviso(s)` : 'Estrutura Validada'}</strong>
                  <span>{issues.length ? 'Selecione uma advertência para focar no elemento correspondente.' : 'Diagrama em conformidade com IEC 60848.'}</span>
                </div>
                {issues.map((issue) => (
                  <button
                    key={issue.id}
                    className={`grafcet-issue is-${issue.level}`}
                    onClick={() => {
                      if (issue.entityId) {
                        setSelected(issue.entityId)
                        setTab(issue.tab === 'steps' ? 'steps' : 'transitions')
                      }
                    }}
                  >
                    <b>{issue.level === 'error' ? '✖' : '!'}</b>
                    <span>{issue.message}</span>
                  </button>
                ))}
              </div>
            )}

            {/* BOTTOM STATUS */}
            <div className="grafcet-live-status">
              <span className={running ? 'is-running' : ''}>
                <i /> {running ? 'Simulação ativa' : 'Parado'}
              </span>
              <small>Etapas ativas: {runtime.active.length} · Transições: {runtime.fired ?? 0}</small>
            </div>
          </aside>
        )}
      </div>

      {/* BOTTOM VIRTUAL I/O & INTERACTIVE VARIABLES DECK */}
      {full && (
        <div className="grafcet-io-deck">
          <div className="grafcet-io-deck-header">
            <span>Variáveis Industriais e Sensores do GRAFCET</span>
            <button
              className="dc-btn"
              style={{ fontSize: '10px', padding: '2px 8px' }}
              onClick={() => setShowBottomDeck((v) => !v)}
            >
              {showBottomDeck ? 'Minimizar ▼' : 'Expandir ▲'}
            </button>
          </div>

          {showBottomDeck && (
            <div className="grafcet-io-grid">
              {/* Entradas & Sensores */}
              <div className="grafcet-io-subgroup">
                <strong>Comandos e Sensores (Clique para alternar)</strong>
                <div className="grafcet-io-chips">
                  {usedVariables
                    .filter((v) => !v.startsWith('Q') && !v.startsWith('L_') && !v.startsWith('Y') && !v.startsWith('C-'))
                    .map((varName) => {
                      const isOn = !!table[varName] || !!virtualInputs[varName]
                      return (
                        <button
                          key={varName}
                          type="button"
                          className={`grafcet-io-btn ${isOn ? 'is-on' : ''}`}
                          onClick={() => setVirtualInput(varName, !isOn)}
                          title={`${varName} = ${isOn ? '1 (LIGADO)' : '0 (DESLIGADO)'}`}
                        >
                          <span className="grafcet-io-led-dot" style={{ background: isOn ? '#22c55e' : '#94a3b8' }} />
                          {varName}
                        </button>
                      )
                    })}
                  {/* Se não houver variáveis detectadas, botões padrão */}
                  {!usedVariables.filter((v) => !v.startsWith('Q') && !v.startsWith('L_') && !v.startsWith('Y')).length && (
                    <>
                      {['B_Start', 'B_Stop_NF', 'In_Man', 'b0', 'b1', 'fc_a0', 'fc_a1', 'S_Rolamento'].map((btnName) => {
                        const isOn = !!table[btnName] || !!virtualInputs[btnName]
                        return (
                          <button
                            key={btnName}
                            type="button"
                            className={`grafcet-io-btn ${isOn ? 'is-on' : ''}`}
                            onClick={() => setVirtualInput(btnName, !isOn)}
                          >
                            <span className="grafcet-io-led-dot" style={{ background: isOn ? '#22c55e' : '#94a3b8' }} />
                            {btnName}
                          </button>
                        )
                      })}
                    </>
                  )}
                </div>
              </div>

              {/* Atuadores e Sinalizadores */}
              <div className="grafcet-io-subgroup">
                <strong>Atuadores e Lâmpadas (Saídas)</strong>
                <div className="grafcet-io-chips">
                  {usedVariables
                    .filter((v) => v.startsWith('Q') || v.startsWith('L_') || v.startsWith('Y') || v.startsWith('C-'))
                    .map((varName) => {
                      const isOn = !!table[varName]
                      return (
                        <div key={varName} className={`grafcet-io-led ${isOn ? 'is-on' : ''}`}>
                          <span className="grafcet-io-led-dot" />
                          {varName}
                        </div>
                      )
                    })}
                  {!usedVariables.filter((v) => v.startsWith('Q') || v.startsWith('L_') || v.startsWith('Y') || v.startsWith('C-')).length && (
                    <small style={{ color: '#94a3b8' }}>Nenhuma saída registrada</small>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL DIALOGS (FLUIDSIM) */}
      <StepDialog
        open={!!editingStep}
        step={editingStep}
        stepIndex={editingStep ? steps.indexOf(editingStep) : 0}
        onSave={(patch) => {
          if (editingStep) updateStep(editingStep.id, patch, 'force')
        }}
        onClose={() => setEditingStep(null)}
        onHelp={() => setHelpOpen(true)}
      />

      <ActionDialog
        open={!!editingAction}
        action={editingAction?.action ?? null}
        availableVariables={usedVariables}
        onSave={(patch) => {
          if (editingAction) patchAction(editingAction.step, editingAction.action, patch, 'force')
        }}
        onClose={() => setEditingAction(null)}
        onHelp={() => setHelpOpen(true)}
      />

      <TransitionDialog
        open={!!editingTransition}
        transition={editingTransition}
        transitionIndex={editingTransition ? transitions.indexOf(editingTransition) : 0}
        availableSteps={steps}
        availableVariables={usedVariables}
        onSave={(patch) => {
          if (editingTransition) updateTransition(editingTransition.id, patch, 'force')
        }}
        onClose={() => setEditingTransition(null)}
        onHelp={() => setHelpOpen(true)}
      />

      <GrafcetShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      {toast && <div className="ladder-toast grafcet-toast">{toast.text}</div>}
    </div>
  )
}
