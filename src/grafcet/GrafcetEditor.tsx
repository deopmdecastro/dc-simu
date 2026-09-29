import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import { useSimStore } from '../store/useSimStore'
import { evalCondition, transitionsOf, validCondition } from './engine'
import type { GrafcetAction, GrafcetStep, GrafcetTransition, GrafcetProgram } from './engine'
import { IconCopy, IconDelete, IconHelp, IconRedo, IconSearch, IconUndo } from '../ui/icons'
import GrafcetShortcutsDialog from './GrafcetShortcutsDialog'

const id = () => crypto.randomUUID()

type PaletteItem = 'initial' | 'step' | 'transition' | 'action' | 'conditional' | 'fork' | 'join'
type EditorTab = 'steps' | 'transitions' | 'diagnostics'
type HistoryMode = 'auto' | 'force' | 'skip'
type ValidationIssue = { id: string; message: string; entityId?: string; tab: EditorTab }

const GRAFCET_MIME = 'application/x-dcsimu-grafcet'
const PALETTE: Array<{ group: string; items: Array<{ kind: PaletteItem; icon: string; name: string; detail: string }> }> = [
  { group: 'Etapas e ligações', items: [
    { kind: 'initial', icon: '◎', name: 'Etapa inicial', detail: 'Ponto de partida da sequência' },
    { kind: 'step', icon: '□', name: 'Etapa ligada', detail: 'Nova etapa após a selecionada' },
    { kind: 'transition', icon: '─', name: 'Transição', detail: 'Condição entre duas etapas' },
  ] },
  { group: 'Ações', items: [
    { kind: 'action', icon: '▤', name: 'Ação', detail: 'Saída Q ou memória M' },
    { kind: 'conditional', icon: '◇', name: 'Ação condicionada', detail: 'Saída ativa sob condição' },
  ] },
  { group: 'Ramos simultâneos', items: [
    { kind: 'fork', icon: '⑂', name: 'Divergência AND', detail: 'Uma etapa → dois ramos' },
    { kind: 'join', icon: '⑃', name: 'Convergência AND', detail: 'Dois ramos → uma etapa' },
  ] },
]

const norm = (value: string) => value.toLocaleLowerCase('pt-PT').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const actionsOf = (step: GrafcetStep): GrafcetAction[] => [
  ...(step.action ? [{ id: `legacy-${step.id}`, address: step.action, condition: '1' }] : []),
  ...(step.actions ?? []),
]

/** Editor GRAFCET com transições explícitas, divergência/convergência AND,
 * histórico agrupado e monitorização do estado de execução. */
export default function GrafcetEditor({ full = false, onOpenEditor }: { full?: boolean; onOpenEditor?: () => void }) {
  const program = useSimStore((state) => state.grafcet)
  const runtime = useSimStore((state) => state.grafcetRuntime)
  const table = useSimStore((state) => state.runtime.table)
  const tags = useSimStore((state) => state.tags)
  const setGrafcet = useSimStore((state) => state.setGrafcet)
  const history = useSimStore((state) => state.history)
  const future = useSimStore((state) => state.future)
  const running = useSimStore((state) => state.sim.runState === 'running')

  const steps = program.steps
  const transitions = transitionsOf(program)
  const [selected, setSelected] = useState<string | null>(() => full ? steps[0]?.id ?? null : null)
  const [tab, setTab] = useState<EditorTab>('steps')
  const [showPalette, setShowPalette] = useState(() => {
    try {
      const saved = localStorage.getItem('dcsimu:grafcet:palette')
      return saved === null ? window.innerWidth > 800 : saved !== '0'
    } catch { return window.innerWidth > 800 }
  })
  const [paletteFilter, setPaletteFilter] = useState('')
  const [entityFilter, setEntityFilter] = useState('')
  const [dropActive, setDropActive] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const paletteSearchRef = useRef<HTMLInputElement>(null)

  const selectedStep = steps.find((step) => step.id === selected)
  const selectedTransition = transitions.find((transition) => transition.id === selected)

  useEffect(() => {
    try { localStorage.setItem('dcsimu:grafcet:palette', showPalette ? '1' : '0') } catch { /* navegação privada */ }
  }, [showPalette])
  useEffect(() => () => window.clearTimeout(toastTimer.current), [])
  useEffect(() => {
    if (selected && !steps.some((step) => step.id === selected) && !transitions.some((transition) => transition.id === selected)) setSelected(null)
  }, [selected, steps, transitions])

  const notify = (text: string) => {
    window.clearTimeout(toastTimer.current)
    setToast({ id: Date.now(), text })
    toastTimer.current = window.setTimeout(() => setToast(null), 1500)
  }
  const save = (patch: Partial<GrafcetProgram>, mode: HistoryMode = 'force', historyKey = 'grafcet') =>
    setGrafcet({ ...program, transitions, ...patch }, mode, historyKey)
  const updateStep = (stepId: string, patch: Partial<GrafcetStep>, mode: HistoryMode = 'auto', historyKey = `grafcet:step:${stepId}:${Object.keys(patch).sort().join(',')}`) =>
    save({ steps: steps.map((step) => step.id === stepId ? { ...step, ...patch } : step) }, mode, historyKey)
  const updateTransition = (transitionId: string, patch: Partial<GrafcetTransition>, mode: HistoryMode = 'auto', historyKey = `grafcet:transition:${transitionId}:${Object.keys(patch).sort().join(',')}`) =>
    save({ transitions: transitions.map((transition) => transition.id === transitionId ? { ...transition, ...patch } : transition) }, mode, historyKey)

  const addStep = () => {
    const newStep: GrafcetStep = { id: id(), name: `Etapa ${steps.length}`, initial: steps.length === 0, action: '', condition: 'I1', actions: [] }
    save({ steps: [...steps, newStep] })
    setSelected(newStep.id)
    setTab('steps')
    notify(newStep.initial ? 'Etapa inicial criada' : 'Etapa solta criada')
  }
  const addConnectedStep = () => {
    const source = selectedStep ?? steps[steps.length - 1]
    if (!source) return addStep()
    const newStep: GrafcetStep = { id: id(), name: `Etapa ${steps.length}`, initial: false, action: '', condition: 'I1', actions: [] }
    save({ steps: [...steps, newStep], transitions: [...transitions, { id: id(), from: [source.id], to: [newStep.id], condition: 'I1' }] })
    setSelected(newStep.id)
    setTab('steps')
    notify('Etapa e transição criadas')
  }
  const removeStep = (stepId: string) => {
    const index = steps.findIndex((step) => step.id === stepId)
    const neighbour = steps[index + 1] ?? steps[index - 1]
    save({ steps: steps.filter((step) => step.id !== stepId), transitions: transitions.filter((transition) => !transition.from.includes(stepId) && !transition.to.includes(stepId)) })
    setSelected(neighbour?.id ?? null)
    setTab('steps')
    notify('Etapa eliminada · Ctrl+Z repõe')
  }
  const removeTransition = (transitionId: string) => {
    const index = transitions.findIndex((transition) => transition.id === transitionId)
    const neighbour = transitions[index + 1] ?? transitions[index - 1]
    save({ transitions: transitions.filter((transition) => transition.id !== transitionId) })
    setSelected(neighbour?.id ?? null)
    setTab('transitions')
    notify('Transição eliminada · Ctrl+Z repõe')
  }
  const requestDelete = () => {
    if (selectedStep) {
      const linked = transitions.filter((transition) => transition.from.includes(selectedStep.id) || transition.to.includes(selectedStep.id)).length
      if (window.confirm(`Eliminar a etapa ${steps.indexOf(selectedStep)} «${selectedStep.name}»${linked ? ` e ${linked} transição(ões) ligada(s)` : ''}?`)) removeStep(selectedStep.id)
    } else if (selectedTransition && window.confirm(`Eliminar a transição T${transitions.indexOf(selectedTransition) + 1}?`)) removeTransition(selectedTransition.id)
  }
  const duplicateSelected = () => {
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
      setTab('steps')
      notify('Etapa duplicada')
    } else if (selectedTransition) {
      const clone = { ...selectedTransition, id: id() }
      const index = transitions.indexOf(selectedTransition)
      save({ transitions: [...transitions.slice(0, index + 1), clone, ...transitions.slice(index + 1)] })
      setSelected(clone.id)
      setTab('transitions')
      notify('Transição duplicada')
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
    const transition: GrafcetTransition = { id: id(), from: [steps[sourceIndex].id], to: [steps[(sourceIndex + 1) % steps.length].id], condition: 'I1' }
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
    const newStep: GrafcetStep = { id: id(), name: `Etapa ${steps.length}`, initial: true, action: '', condition: 'I1', actions: [] }
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
    updateStep(target.id, { actions: [...(target.actions ?? []), { id: id(), address: `Q${n}`, condition: conditional ? 'I1' : '1' }] }, 'force')
    setSelected(target.id)
    setTab('steps')
    notify(conditional ? 'Ação condicionada criada' : 'Ação criada')
  }
  const addFork = () => {
    const source = selectedStep ?? steps[steps.length - 1]
    if (!source) return
    const left: GrafcetStep = { id: id(), name: 'Ramo A', initial: false, action: '', condition: 'I1', actions: [] }
    const right: GrafcetStep = { id: id(), name: 'Ramo B', initial: false, action: '', condition: 'I1', actions: [] }
    save({ steps: [...steps, left, right], transitions: [...transitions, { id: id(), from: [source.id], to: [left.id, right.id], condition: 'I1' }] })
    setSelected(left.id)
    setTab('steps')
    notify('Divergência AND criada')
  }
  const addJoin = () => {
    if (steps.length < 2) return
    const primary = selectedStep ?? steps[steps.length - 1]
    const fork = transitions.find((transition) => transition.to.length >= 2 && transition.to.includes(primary.id))
    const otherId = fork?.to.find((value) => value !== primary.id && steps.some((step) => step.id === value))
      ?? [...steps].reverse().find((step) => step.id !== primary.id)?.id
    if (!otherId) return
    const next: GrafcetStep = { id: id(), name: 'Após convergência', initial: false, action: '', condition: 'I1', actions: [] }
    save({ steps: [...steps, next], transitions: [...transitions, { id: id(), from: [primary.id, otherId], to: [next.id], condition: 'I1' }] })
    setSelected(next.id)
    setTab('steps')
    notify('Convergência AND criada')
  }
  const loadExample = () => {
    const a = id(), b = id(), c = id()
    save({
      steps: [
        { id: a, name: 'Espera', initial: true, action: '', condition: 'I1', actions: [] },
        { id: b, name: 'Motor A', initial: false, action: '', condition: 'I2', actions: [{ id: id(), address: 'Q1', condition: '1' }] },
        { id: c, name: 'Motor B', initial: false, action: '', condition: 'I3', actions: [{ id: id(), address: 'Q2', condition: '1' }] },
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
    (kind === 'transition' || kind === 'join') ? steps.length < 2
      : (kind === 'action' || kind === 'conditional' || kind === 'fork') ? steps.length === 0 : false
  const choose = (ids: string[], stepId: string) => ids.includes(stepId) ? ids.filter((value) => value !== stepId) : [...ids, stepId]

  const issues: ValidationIssue[] = []
  const stepIds = new Set(steps.map((step) => step.id))
  if (steps.length && !steps.some((step) => step.initial)) issues.push({ id: 'initial', message: 'Defina pelo menos uma etapa inicial.', tab: 'steps' })
  transitions.forEach((transition, index) => {
    if (!transition.from.length || !transition.to.length) issues.push({ id: `${transition.id}:links`, message: `T${index + 1} precisa de origem e destino.`, entityId: transition.id, tab: 'transitions' })
    else if ([...transition.from, ...transition.to].some((stepId) => !stepIds.has(stepId))) issues.push({ id: `${transition.id}:missing`, message: `T${index + 1} referencia uma etapa inexistente.`, entityId: transition.id, tab: 'transitions' })
    if (!validCondition(transition.condition)) issues.push({ id: `${transition.id}:condition`, message: `Condição inválida em T${index + 1}: «${transition.condition || 'vazia'}».`, entityId: transition.id, tab: 'transitions' })
  })
  const incoming = new Set(transitions.flatMap((transition) => transition.to))
  steps.forEach((step, stepIndex) => {
    if (!step.initial && !incoming.has(step.id)) issues.push({ id: `${step.id}:orphan`, message: `A etapa ${stepIndex} «${step.name}» não tem transição de entrada.`, entityId: step.id, tab: 'steps' })
    actionsOf(step).forEach((action, actionIndex) => {
      if (!/^[QM]\d{1,2}$/.test(action.address)) issues.push({ id: `${step.id}:action:${actionIndex}`, message: `Ação ${actionIndex + 1} da etapa ${stepIndex}: use um endereço Q ou M.`, entityId: step.id, tab: 'steps' })
      if (!validCondition(action.condition)) issues.push({ id: `${step.id}:action-condition:${actionIndex}`, message: `Condição inválida na ação ${actionIndex + 1} da etapa ${stepIndex}.`, entityId: step.id, tab: 'steps' })
    })
  })

  const selectIssue = (issue: ValidationIssue) => {
    setTab(issue.tab)
    setSelected(issue.entityId ?? null)
  }
  const query = norm(entityFilter.trim())
  const filteredSteps = steps.filter((step, index) => !query || norm(`${index} ${step.name} ${actionsOf(step).map((action) => `${action.address} ${action.condition}`).join(' ')}`).includes(query))
  const filteredTransitions = transitions.filter((transition, index) => !query || norm(`T${index + 1} ${transition.condition} ${transition.from.join(' ')} ${transition.to.join(' ')}`).includes(query))

  // A altura de cada faixa cresce com o número de ações para impedir sobreposição.
  const stepPositions = new Map<string, number>()
  let cursorY = 70
  steps.forEach((step) => {
    stepPositions.set(step.id, cursorY)
    cursorY += Math.max(154, actionsOf(step).length * 34 + 88)
  })
  const stepY = (stepId: string) => stepPositions.get(stepId) ?? 70
  const width = full ? 760 : 560
  const height = Math.max(260, cursorY + 25)

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
    setPan({ x: point.x - (point.x - position.x) * next / scale, y: point.y - (point.y - position.y) * next / scale })
    setZoom(next)
  }
  const resetView = () => { setZoom(null); setPan(null) }
  const onPreviewWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!steps.length) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    zoomAt(scale * (event.deltaY < 0 ? 1.12 : 1 / 1.12), { x: event.clientX - rect.left, y: event.clientY - rect.top })
  }
  const onPreviewDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!steps.length || event.button !== 0 || (event.target as Element).closest('button, [role="button"]')) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { x: event.clientX, y: event.clientY, px: position.x, py: position.y }
  }
  const onPreviewMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    setPan({ x: dragRef.current.px + event.clientX - dragRef.current.x, y: dragRef.current.py + event.clientY - dragRef.current.y })
  }
  const onPreviewUp = () => { dragRef.current = null }

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

  useEffect(() => {
    if (!full) return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing = !!target?.closest('input,textarea,select,[contenteditable="true"]')
      const mod = event.ctrlKey || event.metaKey
      const lower = event.key.toLowerCase()
      if (mod && event.key === '/') { event.preventDefault(); setHelpOpen((value) => !value); return }
      if (typing || helpOpen) return
      if (mod && !event.altKey && lower === 'z') { event.preventDefault(); event.shiftKey ? doRedo() : doUndo(); return }
      if (mod && !event.altKey && lower === 'y') { event.preventDefault(); doRedo(); return }
      if (mod && lower === 'b') { event.preventDefault(); setShowPalette((value) => !value); return }
      if (mod && lower === 'f') { event.preventDefault(); setShowPalette(true); requestAnimationFrame(() => paletteSearchRef.current?.focus()); return }
      if (mod && (event.key === '+' || event.key === '=')) { event.preventDefault(); zoomAt(scale * 1.2, { x: viewport.width / 2, y: viewport.height / 2 }); return }
      if (mod && event.key === '-') { event.preventDefault(); zoomAt(scale / 1.2, { x: viewport.width / 2, y: viewport.height / 2 }); return }
      if (mod && event.key === '0') { event.preventDefault(); resetView(); return }
      if (mod && lower === 'd') { event.preventDefault(); duplicateSelected(); return }
      if (event.key === 'Delete' || event.key === 'Backspace') { if (selected) { event.preventDefault(); requestDelete() } return }
      if (event.key === 'Escape') { setSelected(null); return }
      if (event.key === 'Home') { event.preventDefault(); resetView(); return }
      if (event.key === 'Insert') { event.preventDefault(); event.shiftKey ? addStep() : addConnectedStep(); return }
      if (event.key === '?') { event.preventDefault(); setHelpOpen(true); return }
      if (!mod && !event.altKey && lower === 'a') { event.preventDefault(); addAction(event.shiftKey); return }
      if (!mod && !event.altKey && lower === 't') { event.preventDefault(); addTransition(); return }
      if (!mod && !event.altKey && lower === 'f') { event.preventDefault(); addFork(); return }
      if (!mod && !event.altKey && lower === 'j') { event.preventDefault(); addJoin() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const actionAddresses = tags.filter((tag) => /^[QM]\d{1,2}$/.test(tag.address))
  const liveBits = Object.entries(table).filter(([key, value]) => /^[QM]/.test(key) && value).map(([key]) => key)

  return <div className={`grafcet-editor grafcet-designer ${full ? 'grafcet-full' : 'grafcet-preview'}`}>
    <header className="grafcet-header">
      <div className="grafcet-title">
        <strong>GRAFCET</strong>
        <small>{steps.length} etapas · {transitions.length} transições · {runtime.active.length} ativas</small>
      </div>
      {full ? <button className={`grafcet-validation ${issues.length ? 'has-issues' : 'is-valid'}`} title={issues.length ? 'Abrir diagnóstico do programa' : 'Estrutura GRAFCET válida'} onClick={() => setTab('diagnostics')}>
        {issues.length ? `⚠ ${issues.length} aviso${issues.length === 1 ? '' : 's'}` : '✓ Validado'}
      </button> : <span className={`grafcet-validation ${issues.length ? 'has-issues' : 'is-valid'}`}>{issues.length ? `⚠ ${issues.length}` : '✓ Validado'}</span>}
      {full ? <div className="grafcet-header-actions">
        <button className="grafcet-icon-button" onClick={doUndo} disabled={!history.length} title="Desfazer (Ctrl+Z)" aria-label="Desfazer"><IconUndo size={14} /></button>
        <button className="grafcet-icon-button" onClick={doRedo} disabled={!future.length} title="Refazer (Ctrl+Y)" aria-label="Refazer"><IconRedo size={14} /></button>
        <button className="grafcet-icon-button" onClick={() => setHelpOpen(true)} title="Atalhos (?)" aria-label="Atalhos do GRAFCET"><IconHelp size={14} /></button>
        <span className="grafcet-header-separator" />
        <button className="dc-btn" onClick={addStep}>+ Etapa solta</button>
        <button className="dc-btn-primary dc-btn" onClick={addConnectedStep}>+ Etapa ligada</button>
        <button className="dc-btn" disabled={steps.length < 2} onClick={addTransition}>+ Transição</button>
      </div> : <button className="dc-btn-primary dc-btn" onClick={onOpenEditor}>Abrir editor ↗</button>}
    </header>

    <div className="grafcet-designer-body">
      {full && (showPalette ? <aside className="grafcet-toolbox" aria-label="Ferramentas GRAFCET">
        <div className="grafcet-toolbox-head"><div><strong>Componentes</strong><small>Construa e ligue a sequência</small></div><button title="Recolher ferramentas (Ctrl+B)" aria-label="Recolher ferramentas" onClick={() => setShowPalette(false)}>‹</button></div>
        <div className="grafcet-toolbox-search"><IconSearch size={13} /><input ref={paletteSearchRef} className="dc-input" value={paletteFilter} onChange={(event) => setPaletteFilter(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { setPaletteFilter(''); event.currentTarget.blur() } }} placeholder="Pesquisar componentes…" aria-label="Pesquisar componentes GRAFCET" />{paletteFilter && <button onClick={() => setPaletteFilter('')} title="Limpar pesquisa">×</button>}</div>
        <div className="grafcet-toolbox-list">{PALETTE.map((group) => {
          const items = group.items.filter((item) => norm(`${item.name} ${item.detail}`).includes(norm(paletteFilter)))
          return items.length ? <section key={group.group}><h3>{group.group}</h3>{items.map((item) => <button key={item.kind} disabled={paletteDisabled(item.kind)} onClick={() => usePalette(item.kind)} draggable={!paletteDisabled(item.kind)} onDragStart={(event) => { event.dataTransfer.setData(GRAFCET_MIME, item.kind); event.dataTransfer.effectAllowed = 'copy' }} className="grafcet-toolbox-item" title={`${item.name}: clique ou arraste para o diagrama`}><span className="grafcet-toolbox-icon">{item.icon}</span><span><strong>{item.name}</strong><small>{item.detail}</small></span></button>)}</section> : null
        })}{!PALETTE.some((group) => group.items.some((item) => norm(`${item.name} ${item.detail}`).includes(norm(paletteFilter)))) && <div className="grafcet-toolbox-empty">Nenhum componente encontrado.</div>}</div>
        <p className="grafcet-toolbox-tip">Selecione uma etapa e clique ou arraste um componente. Configure a entidade no painel à direita.</p>
      </aside> : <button className="grafcet-toolbox-restore" onClick={() => setShowPalette(true)} title="Mostrar componentes (Ctrl+B)">› Ferramentas</button>)}

      <div
        ref={viewportRef}
        className={`grafcet-canvas ${dropActive ? 'is-palette-drop' : ''}`}
        aria-label="Diagrama GRAFCET"
        onDragOver={full ? (event) => { if (event.dataTransfer.types.includes(GRAFCET_MIME)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setDropActive(true) } } : undefined}
        onDragLeave={full ? (event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropActive(false) } : undefined}
        onDrop={full ? (event) => { event.preventDefault(); setDropActive(false); const kind = event.dataTransfer.getData(GRAFCET_MIME) as PaletteItem; if (PALETTE.some((group) => group.items.some((item) => item.kind === kind)) && !paletteDisabled(kind)) usePalette(kind) } : undefined}
        onWheel={onPreviewWheel}
        onPointerDown={onPreviewDown}
        onPointerMove={onPreviewMove}
        onPointerUp={onPreviewUp}
        onPointerCancel={onPreviewUp}
      >
        {!!steps.length && <div className="grafcet-viewport-tools" onPointerDown={(event) => event.stopPropagation()}>
          <button title="Reduzir zoom (Ctrl−)" aria-label="Reduzir zoom" onClick={() => zoomAt(scale / 1.2, { x: viewport.width / 2, y: viewport.height / 2 })}>−</button>
          <span>{Math.round(scale * 100)}%</span>
          <button title="Aumentar zoom (Ctrl+)" aria-label="Aumentar zoom" onClick={() => zoomAt(scale * 1.2, { x: viewport.width / 2, y: viewport.height / 2 })}>+</button>
          <button onClick={resetView} title="Ajustar diagrama (Ctrl+0)">Ajustar</button>
        </div>}
        {!steps.length && <div className="grafcet-empty"><strong>Ainda não há etapas</strong><p>{full ? 'Crie a primeira etapa ou abra o exemplo para iniciar a sequência.' : 'Abra o editor para criar a primeira etapa.'}</p>{full && <div className="grafcet-empty-actions"><button className="dc-btn-primary dc-btn" onClick={addStep}>Criar etapa inicial</button><button className="dc-btn" onClick={loadExample}>Abrir exemplo de 3 etapas</button></div>}</div>}
        {!!steps.length && <div className="grafcet-pan-layer" style={{ width, height, transform: `translate(${position.x}px, ${position.y}px) scale(${scale})` }}>
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Etapas, ações e transições do GRAFCET">
            <defs><marker id="grafcet-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0 0 L7 3 L0 6" fill="none" stroke="#526883" /></marker></defs>
            {transitions.flatMap((transition, transitionIndex) => {
              const sources = transition.from.filter((value) => steps.some((step) => step.id === value))
              const targets = transition.to.filter((value) => steps.some((step) => step.id === value))
              if (!sources.length || !targets.length) return []
              const selfLoop = sources.length === 1 && targets.length === 1 && sources[0] === targets[0]
              const ty = Math.max(42, Math.min(height - 45, (sources.reduce((sum, value) => sum + stepY(value), 0) / sources.length + targets.reduce((sum, value) => sum + stepY(value), 0) / targets.length) / 2))
              const returning = Math.min(...targets.map(stepY)) <= Math.max(...sources.map(stepY))
              const tx = returning ? 65 - transitionIndex % 3 * 16 : 290 + transitionIndex % 3 * 27
              const conditionOn = validCondition(transition.condition) && evalCondition(transition.condition, table)
              const enabled = running && conditionOn && sources.every((value) => runtime.active.includes(value))
              const selectedLink = selected === transition.id
              const linkColor = selectedLink ? '#2563eb' : enabled ? '#16a34a' : running && conditionOn ? '#d97706' : '#526883'
              const selectTransition = () => { if (full) { setSelected(transition.id); setTab('transitions') } }
              if (selfLoop) {
                const y = stepY(sources[0])
                const path = `M 150 ${y + 54} V ${y + 92} H 62 V ${y - 22} H 150 V ${y}`
                return <g key={transition.id} onClick={selectTransition} className={full ? 'grafcet-graph-link' : ''} role={full ? 'button' : undefined} tabIndex={full ? 0 : undefined} aria-label={`Transição T${transitionIndex + 1}: ${transition.condition}`} onKeyDown={full ? (event) => { if (event.key === 'Enter') selectTransition() } : undefined}><path d={path} fill="none" stroke={linkColor} strokeWidth={enabled ? 3 : 2} markerEnd="url(#grafcet-arrow)"/><path d={path} fill="none" stroke="transparent" strokeWidth="14"/><path d={`M 51 ${y + 83} h 22`} stroke={linkColor} strokeWidth="3"/><text x="79" y={y + 85} fill={linkColor} fontSize="12" fontWeight="600">{transition.condition.slice(0, 24)}</text></g>
              }
              return <g key={transition.id} onClick={selectTransition} className={full ? 'grafcet-graph-link' : ''} role={full ? 'button' : undefined} tabIndex={full ? 0 : undefined} aria-label={`Transição T${transitionIndex + 1}: ${transition.condition}`} onKeyDown={full ? (event) => { if (event.key === 'Enter') selectTransition() } : undefined}>
                {sources.map((value) => <path key={`f-${value}`} d={`M 182 ${stepY(value) + 27} H ${tx} V ${ty}`} fill="none" stroke={linkColor} strokeWidth={enabled ? 3 : 2} />)}
                {targets.map((value) => <path key={`t-${value}`} d={`M ${tx} ${ty} V ${stepY(value)} H 119`} fill="none" stroke={linkColor} strokeWidth={enabled ? 3 : 2} markerEnd="url(#grafcet-arrow)" />)}
                <path d={`M ${tx - 11} ${ty} h 22`} stroke={linkColor} strokeWidth="4" />
                <rect x={tx + 14} y={ty - 19} width={Math.min(155, Math.max(34, transition.condition.length * 7 + 10))} height="19" rx="4" fill={enabled ? '#dcfce7' : conditionOn && running ? '#fff7ed' : '#f8fafc'} />
                <text x={tx + 19} y={ty - 6} fill={linkColor} fontSize="11" fontWeight="600">{transition.condition.slice(0, 20)}</text>
                {(sources.length > 1 || targets.length > 1) && <text x={tx - 24} y={ty - 9} fill="#c2410c" fontSize="10" fontWeight="700">AND</text>}
              </g>
            })}
            {steps.map((step, index) => {
              const active = runtime.active.includes(step.id)
              const selectStep = () => { if (full) { setSelected(step.id); setTab('steps') } }
              return <g key={step.id} className={full ? 'grafcet-graph-node' : ''} role={full ? 'button' : undefined} tabIndex={full ? 0 : undefined} aria-label={`Etapa ${index}: ${step.name}${active ? ', ativa' : ''}`} onClick={selectStep} onKeyDown={full ? (event) => { if (event.key === 'Enter') selectStep() } : undefined}>
                {active && <circle cx="103" cy={stepY(step.id) + 27} r="6" fill="#22c55e"><animate attributeName="opacity" values="1;.45;1" dur="1.4s" repeatCount="indefinite" /></circle>}
                <rect x="119" y={stepY(step.id)} width="64" height="54" rx="2" fill={active ? '#dcfce7' : 'white'} stroke={selected === step.id ? '#2563eb' : active ? '#16a34a' : '#263d59'} strokeWidth={selected === step.id || active ? 3 : 2.5} />
                {step.initial && <rect x="124" y={stepY(step.id) + 5} width="54" height="44" fill="none" stroke={active ? '#16a34a' : '#263d59'} strokeWidth="1.5" />}
                <text x="151" y={stepY(step.id) + 34} textAnchor="middle" fill="#1e293b" fontWeight="700" fontSize="17">{index}</text>
                <text x="196" y={stepY(step.id) + 17} fill="#334155" fontSize="12" fontWeight="600">{step.name.slice(0, 30)}</text>
                {actionsOf(step).map((action, actionIndex) => {
                  const actionY = stepY(step.id) + actionIndex * 34
                  const actionOn = !!table[action.address]
                  return <g key={action.id}><path d={`M 183 ${stepY(step.id) + 27} H 310 V ${actionY + 14} H 335`} fill="none" stroke={actionOn ? '#16a34a' : '#263d59'} strokeWidth={actionOn ? 2.5 : 1.5} /><rect x="335" y={actionY} width="176" height="28" rx="3" fill={actionOn ? '#dcfce7' : 'white'} stroke={actionOn ? '#16a34a' : '#263d59'} strokeWidth={actionOn ? 2 : 1.5} /><text x="345" y={actionY + 18} fill={actionOn ? '#15803d' : '#1e293b'} fontSize="11" fontWeight={actionOn ? 700 : 500}>{action.address || 'ação sem endereço'}{action.condition !== '1' ? `  [${action.condition}]` : ''}</text></g>
                })}
              </g>
            })}
          </svg>
        </div>}
      </div>

      {full && <aside className="grafcet-properties">
        <div className="grafcet-properties-summary"><div><strong>{selectedStep ? `Etapa ${steps.indexOf(selectedStep)}` : selectedTransition ? `Transição T${transitions.indexOf(selectedTransition) + 1}` : 'Propriedades'}</strong><small>{running ? '● Simulação ativa' : '○ Simulação parada'}</small></div>{selected && <div className="grafcet-selection-actions"><button onClick={duplicateSelected} title="Duplicar (Ctrl+D)" aria-label="Duplicar seleção"><IconCopy size={13} /></button><button className="is-danger" onClick={requestDelete} title="Eliminar (Del)" aria-label="Eliminar seleção"><IconDelete size={13} /></button></div>}</div>
        <div className="grafcet-tabs" role="tablist" aria-label="Painel GRAFCET">
          <button role="tab" aria-selected={tab === 'steps'} className={tab === 'steps' ? 'is-active' : ''} onClick={() => setTab('steps')}>Etapas <em>{steps.length}</em></button>
          <button role="tab" aria-selected={tab === 'transitions'} className={tab === 'transitions' ? 'is-active' : ''} onClick={() => setTab('transitions')}>Transições <em>{transitions.length}</em></button>
          <button role="tab" aria-selected={tab === 'diagnostics'} className={tab === 'diagnostics' ? `is-active ${issues.length ? 'has-warning' : ''}` : ''} onClick={() => setTab('diagnostics')}>Diagnóstico <em>{issues.length}</em></button>
        </div>
        {tab !== 'diagnostics' && <div className="grafcet-entity-search"><IconSearch size={13} /><input className="dc-input" value={entityFilter} onChange={(event) => setEntityFilter(event.target.value)} placeholder={tab === 'steps' ? 'Filtrar etapas ou ações…' : 'Filtrar transições…'} aria-label="Filtrar entidades GRAFCET" />{entityFilter && <button onClick={() => setEntityFilter('')} aria-label="Limpar filtro">×</button>}</div>}

        {tab === 'steps' && <>
          <div className="grafcet-entity-list">{filteredSteps.map((step) => {
            const index = steps.indexOf(step)
            return <div className={`grafcet-step-row ${selected === step.id ? 'is-active' : ''}`} key={step.id}><button onClick={() => setSelected(step.id)}>{step.initial ? '◎' : '□'} <b>{index}</b><span>{step.name}</span>{runtime.active.includes(step.id) && <i title="Etapa ativa" />}</button><button aria-label={`Subir etapa ${index}`} title="Mover para cima" disabled={index === 0} onClick={() => moveStep(step.id, -1)}>↑</button><button aria-label={`Descer etapa ${index}`} title="Mover para baixo" disabled={index === steps.length - 1} onClick={() => moveStep(step.id, 1)}>↓</button></div>
          })}{!filteredSteps.length && <p className="grafcet-list-empty">Nenhuma etapa corresponde ao filtro.</p>}</div>
          {!selectedStep && <p className="grafcet-hint">Selecione uma etapa no diagrama ou na lista para editar ações e propriedades.</p>}
          {selectedStep && <div className="grafcet-form">
            <h3>Etapa {steps.indexOf(selectedStep)} {selectedStep.initial ? '· inicial' : ''}</h3>
            <label>Nome<input className="dc-input" value={selectedStep.name} onChange={(event) => updateStep(selectedStep.id, { name: event.target.value }, 'auto', `grafcet:step:${selectedStep.id}:name`)} /></label>
            <label className="grafcet-inline"><input type="checkbox" checked={selectedStep.initial} onChange={(event) => updateStep(selectedStep.id, { initial: event.target.checked }, 'force')} /> Etapa inicial</label>
            <div className="grafcet-form-heading"><h3>Ações contínuas</h3><button onClick={() => addAction(false)}>+ ação</button></div>
            <datalist id="grafcet-action-addresses">{actionAddresses.map((tag) => <option key={tag.id} value={tag.address}>{tag.name}</option>)}</datalist>
            {actionsOf(selectedStep).map((action, actionIndex) => <div className={`grafcet-action-row ${table[action.address] ? 'is-on' : ''}`} key={action.id}>
              <input className="dc-input" list="grafcet-action-addresses" aria-label={`Endereço da ação ${actionIndex + 1}`} placeholder="Q1" value={action.address} onChange={(event) => action.id.startsWith('legacy-') ? updateStep(selectedStep.id, { action: event.target.value.toUpperCase() }, 'auto', `grafcet:step:${selectedStep.id}:legacy-action`) : updateStep(selectedStep.id, { actions: (selectedStep.actions ?? []).map((value) => value.id === action.id ? { ...value, address: event.target.value.toUpperCase() } : value) }, 'auto', `grafcet:action:${action.id}:address`)} />
              <input className="dc-input" aria-label={`Condição da ação ${actionIndex + 1}`} placeholder="1" value={action.condition} onChange={(event) => {
                const condition = event.target.value.toUpperCase()
                if (action.id.startsWith('legacy-')) updateStep(selectedStep.id, { action: '', actions: [...(selectedStep.actions ?? []), { id: id(), address: action.address, condition }] }, 'auto', `grafcet:step:${selectedStep.id}:legacy-condition`)
                else updateStep(selectedStep.id, { actions: (selectedStep.actions ?? []).map((value) => value.id === action.id ? { ...value, condition } : value) }, 'auto', `grafcet:action:${action.id}:condition`)
              }} />
              <button title="Remover ação" aria-label={`Remover ação ${actionIndex + 1}`} onClick={() => updateStep(selectedStep.id, action.id.startsWith('legacy-') ? { action: '' } : { actions: (selectedStep.actions ?? []).filter((value) => value.id !== action.id) }, 'force')}>×</button>
              {!/^[QM]\d{1,2}$/.test(action.address) && <small className="grafcet-error">Use Q1 ou M1</small>}
              {!validCondition(action.condition) && <small className="grafcet-error">Condição inválida</small>}
            </div>)}
            {!actionsOf(selectedStep).length && <p className="grafcet-form-empty">Esta etapa não tem ações.</p>}
            <button className="dc-btn" onClick={() => addAction(false)}>+ Adicionar ação</button>
            <button className="dc-btn grafcet-danger" onClick={requestDelete}>Eliminar etapa</button>
          </div>}
        </>}

        {tab === 'transitions' && <>
          <p className="grafcet-hint">Uma origem → vários destinos cria divergência AND. Várias origens → um destino cria convergência AND. A ordem define a prioridade.</p>
          <div className="grafcet-entity-list">{filteredTransitions.map((transition) => {
            const index = transitions.indexOf(transition)
            const conditionOn = running && validCondition(transition.condition) && evalCondition(transition.condition, table)
            return <div className={`grafcet-transition-row ${selected === transition.id ? 'is-active' : ''}`} key={transition.id}><button onClick={() => setSelected(transition.id)} aria-label={`Selecionar transição T${index + 1}`}><i className={conditionOn ? 'is-on' : ''} />T{index + 1}: {transition.from.map((value) => steps.findIndex((step) => step.id === value)).join('+')} → {transition.to.map((value) => steps.findIndex((step) => step.id === value)).join('+')} <span className={!validCondition(transition.condition) ? 'grafcet-error' : ''}>[{transition.condition}]</span></button><button title="Aumentar prioridade" aria-label={`Subir transição T${index + 1}`} disabled={index === 0} onClick={() => moveTransition(transition.id, -1)}>↑</button><button title="Diminuir prioridade" aria-label={`Descer transição T${index + 1}`} disabled={index === transitions.length - 1} onClick={() => moveTransition(transition.id, 1)}>↓</button></div>
          })}{!filteredTransitions.length && <p className="grafcet-list-empty">Nenhuma transição corresponde ao filtro.</p>}</div>
          {!selectedTransition && <p className="grafcet-hint">Selecione uma transição no diagrama ou na lista para definir condição e ligações.</p>}
          {selectedTransition && <div className="grafcet-form">
            <h3>Transição T{transitions.indexOf(selectedTransition) + 1}</h3>
            <label>Condição<input className="dc-input" value={selectedTransition.condition} placeholder="I1 & !I2 | M1" onChange={(event) => updateTransition(selectedTransition.id, { condition: event.target.value.toUpperCase() }, 'auto', `grafcet:transition:${selectedTransition.id}:condition`)} /></label>
            <div className="grafcet-condition-state"><span className={validCondition(selectedTransition.condition) && evalCondition(selectedTransition.condition, table) ? 'is-on' : ''}><i /> Resultado atual: {validCondition(selectedTransition.condition) && evalCondition(selectedTransition.condition, table) ? 'VERDADEIRO' : 'FALSO'}</span></div>
            {!validCondition(selectedTransition.condition) && <small className="grafcet-error">Expressão inválida: use I/Q/M, !, &amp;, | e parênteses.</small>}
            {(['from', 'to'] as const).map((field) => <fieldset key={field}><legend>{field === 'from' ? 'Origens (todas ativas)' : 'Destinos (ativados juntos)'}</legend><div className="grafcet-step-checks">{steps.map((step, index) => <label className="grafcet-inline" key={step.id}><input type="checkbox" checked={selectedTransition[field].includes(step.id)} onChange={() => updateTransition(selectedTransition.id, { [field]: choose(selectedTransition[field], step.id) }, 'force')} /> {index} · {step.name}</label>)}</div></fieldset>)}
            {(!selectedTransition.from.length || !selectedTransition.to.length) && <small className="grafcet-error">Escolha pelo menos uma origem e um destino.</small>}
            <button className="dc-btn grafcet-danger" onClick={requestDelete}>Eliminar transição</button>
          </div>}
        </>}

        {tab === 'diagnostics' && <div className="grafcet-diagnostics">
          <div className={`grafcet-diagnostic-summary ${issues.length ? 'has-issues' : 'is-valid'}`}><strong>{issues.length ? `${issues.length} problema${issues.length === 1 ? '' : 's'} encontrado${issues.length === 1 ? '' : 's'}` : 'Programa validado'}</strong><span>{issues.length ? 'Selecione um problema para abrir a entidade correspondente.' : 'Todas as etapas, ações e transições estão coerentes.'}</span></div>
          {issues.map((issue) => <button key={issue.id} className="grafcet-issue" onClick={() => selectIssue(issue)}><b>!</b><span>{issue.message}</span><em>abrir</em></button>)}
          {!issues.length && <div className="grafcet-validation-checks"><span>✓ Etapa inicial definida</span><span>✓ Ligações completas</span><span>✓ Condições válidas</span><span>✓ Ações endereçadas</span></div>}
        </div>}

        <div className="grafcet-live-status"><span className={running ? 'is-running' : ''}><i />{running ? 'Simulação ativa' : 'Parado'}</span><small>Saídas ativas: {liveBits.join(', ') || 'nenhuma'}</small></div>
      </aside>}
    </div>

    {!full && <div className="grafcet-preview-status" role="status"><span className={running ? 'is-running' : ''}>● {running ? 'Simulação ativa' : 'Parado'}</span><span>{runtime.active.length ? `Etapas ativas: ${runtime.active.map((value) => steps.findIndex((step) => step.id === value)).join(', ')}` : 'Nenhuma etapa ativa'}</span><span>Arraste para navegar · roda para ampliar</span></div>}
    <GrafcetShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    {toast && <div key={toast.id} className="ladder-toast grafcet-toast" role="status" aria-live="polite">{toast.text}</div>}
  </div>
}
