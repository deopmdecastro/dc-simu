import { useEffect, useRef, useState, type DragEvent } from 'react'
import { useSimStore } from '../store/useSimStore'
import type { LadderContact, LadderRung } from '../types'
import {
  COMPONENT_TO_LADDER, LADDER_MIME, LADDER_MOVE_MIME, applyKind, getLadderDrag, isContactKind, putContact, setLadderDrag, takeContact,
  type DropTarget, type MovePayload, type PaletteKind,
} from './ladderDnd'

export type RungSelection =
  | { type: 'insert' }
  | { type: 'contact'; branchId: string; elementId: string }
  | { type: 'coil'; coilId: string }
  | { type: 'timer' }
  | { type: 'move' }
  | { type: 'call' }
  | { type: 'counter' }
  | null

/* ------------------------------------------------------------------ grelha
 * Tudo é múltiplo da malha de 20px — rails, fios, contatos, bobinas e blocos
 * caem sempre sobre os pontos da grelha (padronização estilo TIA Portal).   */
export const LADDER_GRID = 20
const COL_W = 100 // largura de uma célula de contato (5 × 20)
const ROW_H = 80 // altura de um ramo (4 × 20)
const TOP = 10
const CY_OFF = 50 // linha de corrente dentro da linha → y = 60, 140, 220…
const RAIL_X = 20
const BOX_W = 120
const BOX_SLOT = 100 // blocos (TON/CTU/MOVE): caixa de 70–80px + etiqueta
const OUT_H = 60 // bobinas / CALL: mais compacto que os ramos de contactos (ROW_H)

const C_OFF = '#1f2a3d' // offline (sem simulação)
const C_ON = '#16a34a' // fluxo de corrente
const C_IDLE = '#2f6fe4' // online sem fluxo (tracejado)

function fmtTime(ms: number) {
  if (ms >= 1000 && ms % 1000 === 0) return `T#${ms / 1000}S`
  if (ms >= 1000) return `T#${(ms / 1000).toFixed(1)}S`
  return `T#${Math.round(ms)}MS`
}

interface Props {
  rung: LadderRung
  selection?: RungSelection
  onSelect?: (s: RungSelection) => void
  /** Duplo clique abre o editor completo de propriedades/presets. */
  onEdit?: (s: Exclude<NonNullable<RungSelection>, { type: 'insert' }>) => void
  readonly?: boolean
  minWidth?: number
}

export default function NetworkDiagram({ rung, selection = null, onSelect = () => {}, onEdit = () => {}, readonly = false, minWidth = 640 }: Props) {
  const table = useSimStore((s) => s.runtime.table)
  const db = useSimStore((s) => s.runtime.db)
  const timers = useSimStore((s) => s.runtime.timers)
  const counters = useSimStore((s) => s.runtime.counters)
  const rungPowered = useSimStore((s) => s.runtime.rungPowered)
  const simRunning = useSimStore((s) => s.sim.runState !== 'stopped')
  const gridEnabled = useSimStore((s) => s.grid.enabled)
  const tags = useSimStore((s) => s.tags)
  const updateRung = useSimStore((s) => s.updateRung)
  const [drop, setDrop] = useState<DropTarget | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(minWidth)
  useEffect(() => {
    const parent = wrapRef.current?.parentElement
    if (!parent) return
    const observer = new ResizeObserver(() => setAvailableWidth(parent.clientWidth))
    observer.observe(parent)
    setAvailableWidth(parent.clientWidth)
    return () => observer.disconnect()
  }, [])

  const online = simRunning && !readonly
  const tagName = (addr: string) => {
    const t = tags.find((x) => x.address === addr.toUpperCase())
    return t && t.name && t.name !== t.address ? t.name : null
  }

  // ------------------------------------------------------------- layout
  const branches = rung.branches.length ? rung.branches : [{ id: `${rung.id}-b0`, elements: [] as LadderContact[] }]
  const maxLen = Math.max(1, ...branches.map((b) => b.elements.length))
  const nCols = Math.max(2, maxLen)
  const contactsEnd = RAIL_X + nCols * COL_W
  const OJ = contactsEnd + 40 // junção das saídas (paralelo)
  const boxX = OJ + 80
  const hasBox = !!(rung.timer || rung.counter || rung.move || rung.call)
  const cyOf = (row: number) => TOP + row * ROW_H + CY_OFF

  type Out =
    | { type: 'timer'; cy: number }
    | { type: 'counter'; cy: number }
    | { type: 'move'; cy: number }
    | { type: 'call'; cy: number }
    | { type: 'coil'; cy: number; coil: LadderRung['coils'][number] }
    | { type: 'placeholder'; cy: number }
  const outputs: Out[] = []
  let oy = TOP
  if (rung.timer) { outputs.push({ type: 'timer', cy: oy + CY_OFF }); oy += BOX_SLOT }
  if (rung.counter) { outputs.push({ type: 'counter', cy: oy + CY_OFF }); oy += BOX_SLOT }
  if (rung.move) { outputs.push({ type: 'move', cy: oy + CY_OFF }); oy += BOX_SLOT }
  if (rung.call) { outputs.push({ type: 'call', cy: oy + CY_OFF }); oy += OUT_H + 20 }
  rung.coils.forEach((coil) => { outputs.push({ type: 'coil', cy: oy + CY_OFF, coil }); oy += OUT_H })
  if (!rung.coils.length && !hasBox) { outputs.push({ type: 'placeholder', cy: oy + CY_OFF }); oy += ROW_H }

  const extraRow = drop?.kind === 'newBranch' ? 1 : 0
  const branchesBottom = TOP + (branches.length + extraRow) * ROW_H
  const H = Math.max(branchesBottom, oy) + 10
  const minCoil = OJ + (hasBox ? 80 + BOX_W + 100 : 120)
  const W = Math.ceil(Math.max(minWidth, availableWidth, minCoil + 60) / LADDER_GRID) * LADDER_GRID
  const coilCX = W - 60

  // ------------------------------------------------------------- estado
  const rawContact = (el: LadderContact) => db[el.address.toUpperCase()]?.type === 'BOOL' ? db[el.address.toUpperCase()].value === true : !!table[el.address]
  const pass = (el: LadderContact) => el.contactType === 'NC' ? !rawContact(el) : rawContact(el)
  const rungOut = online && !!rungPowered[rung.id]
  const col = (p: boolean) => (!online ? C_OFF : p ? C_ON : C_IDLE)
  const dash = (p: boolean) => (online && !p ? '5 4' : undefined)
  const sw = (p: boolean) => (online && p ? 2.6 : 1.6)
  const wire = (x1: number, y1: number, x2: number, y2: number, p: boolean, key?: string) => (
    <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke={col(p)} strokeWidth={sw(p)} strokeDasharray={dash(p)} strokeLinecap="square" />
  )

  // ------------------------------------------------------------- DnD
  const localPt = (e: DragEvent) => {
    const r = wrapRef.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height }
  }
  const draggedKind = (): PaletteKind | 'REORDER_CONTACT' | null => {
    const d = getLadderDrag()
    if (d) return 'move' in d ? 'REORDER_CONTACT' : d.kind
    const t = useSimStore.getState().dragType
    return t ? COMPONENT_TO_LADDER[t] ?? null : null
  }
  const targetFor = (kind: PaletteKind | 'REORDER_CONTACT', p: { x: number; y: number }): DropTarget => {
    if (kind === 'BRANCH') return { kind: 'newBranch' }
    if (kind === 'REORDER_CONTACT' || isContactKind(kind)) {
      const row = Math.floor((p.y - TOP) / ROW_H)
      if (row >= branches.length) return { kind: 'newBranch' }
      const bi = Math.max(0, row)
      const len = branches[bi].elements.length
      const index = p.x > contactsEnd ? len : Math.max(0, Math.min(len, Math.round((p.x - RAIL_X) / COL_W)))
      return { kind: 'branch', branchIndex: bi, index }
    }
    return { kind: 'output' }
  }
  const onDragOver = (e: DragEvent) => {
    if (readonly) return
    const kind = draggedKind()
    if (!kind) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = kind === 'REORDER_CONTACT' ? 'move' : 'copy'
    const t = targetFor(kind, localPt(e))
    if (JSON.stringify(t) !== JSON.stringify(drop)) setDrop(t)
  }
  const onDragLeave = (e: DragEvent) => {
    const next = e.relatedTarget as Node | null
    if (!next || !wrapRef.current?.contains(next)) setDrop(null)
  }
  const onDrop = (e: DragEvent) => {
    if (readonly) return
    const kind = draggedKind()
    const target = drop ?? (kind ? targetFor(kind, localPt(e)) : null)
    setDrop(null)
    if (!kind || !target) return
    e.preventDefault()
    e.stopPropagation()
    const st = useSimStore.getState()
    if (kind === 'REORDER_CONTACT') {
      let payload: MovePayload | null = null
      try { payload = JSON.parse(e.dataTransfer.getData(LADDER_MOVE_MIME)) } catch { payload = null }
      const d = getLadderDrag()
      if (!payload && d && 'move' in d) payload = d.move
      setLadderDrag(null)
      if (!payload) return
      if (payload.rungId === rung.id) {
        const srcBranch = rung.branches.findIndex((b) => b.id === payload!.branchId)
        const srcIdx = rung.branches[srcBranch]?.elements.findIndex((x) => x.id === payload!.elementId) ?? -1
        let adj = target
        if (target.kind === 'branch' && target.branchIndex === srcBranch && srcIdx >= 0 && srcIdx < target.index) adj = { ...target, index: target.index - 1 }
        let branchId = ''
        updateRung(rung.id, (r) => {
          const taken = takeContact(r, payload!.branchId, payload!.elementId)
          if (!taken.el) return r
          const put = putContact(taken.rung, taken.el, adj)
          branchId = put.branchId
          return put.rung
        }, 'force')
        if (branchId) onSelect({ type: 'contact', branchId, elementId: payload.elementId })
      } else {
        const src = st.ladder.rungs.find((r) => r.id === payload!.rungId)
        if (!src) return
        const taken = takeContact(src, payload.branchId, payload.elementId)
        if (!taken.el) return
        updateRung(src.id, () => taken.rung, 'force')
        const put = putContact(rung, taken.el, target)
        updateRung(rung.id, () => put.rung, 'skip')
        onSelect({ type: 'contact', branchId: put.branchId, elementId: taken.el.id })
      }
      return
    }
    const fromData = (e.dataTransfer.getData(LADDER_MIME) as PaletteKind) || null
    const k = fromData ?? kind
    setLadderDrag(null)
    let created: RungSelection = null
    updateRung(rung.id, (r) => {
      const res = applyKind(r, k, target)
      created = (res.created as RungSelection) ?? null
      return res.rung
    }, 'force')
    if (created) onSelect(created)
  }

  // ------------------------------------------------------------- ações
  const removeContact = (branchId: string, elementId: string) =>
    updateRung(rung.id, (r) => ({ ...r, branches: r.branches.map((b) => (b.id === branchId ? { ...b, elements: b.elements.filter((x) => x.id !== elementId) } : b)) }), 'force')
  const removeCoil = (id: string) => updateRung(rung.id, (r) => ({ ...r, coils: r.coils.filter((c) => c.id !== id) }), 'force')
  const addCoil = () => {
    let created: RungSelection = null
    updateRung(rung.id, (r) => {
      const res = applyKind(r, 'COIL')
      created = res.created as RungSelection
      return res.rung
    }, 'force')
    if (created) onSelect(created)
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (readonly) return
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
    if (e.key === 'Escape' && selection) {
      e.preventDefault()
      e.stopPropagation()
      onSelect(null)
      return
    }
    if (e.key === 'Enter' && selection && selection.type !== 'insert') {
      e.preventDefault()
      e.stopPropagation()
      onEdit(selection)
      return
    }
    if (e.key !== 'Delete' && e.key !== 'Backspace') return
    if (selection?.type === 'contact') removeContact(selection.branchId, selection.elementId)
    else if (selection?.type === 'coil') removeCoil(selection.coilId)
    else if (selection?.type === 'timer') updateRung(rung.id, (r) => ({ ...r, timer: undefined }), 'force')
    else if (selection?.type === 'counter') updateRung(rung.id, (r) => ({ ...r, counter: undefined }), 'force')
    else if (selection?.type === 'move') updateRung(rung.id, (r) => ({ ...r, move: undefined }), 'force')
    else if (selection?.type === 'call') updateRung(rung.id, (r) => ({ ...r, call: undefined }), 'force')
    else return
    e.preventDefault()
    e.stopPropagation()
    onSelect(null)
  }

  // ------------------------------------------------------------- desenho
  const svg: JSX.Element[] = []
  const hits: JSX.Element[] = []
  const label = (x: number, y: number, text: string, opts: { bold?: boolean; grey?: boolean; anchor?: 'start' | 'middle' | 'end'; size?: number } = {}) => (
    <text
      x={x}
      y={y}
      fontSize={opts.size ?? 10}
      fontWeight={opts.bold ? 700 : 500}
      fill={opts.grey ? '#7b8aa3' : '#1f2a3d'}
      textAnchor={opts.anchor ?? 'middle'}
      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
    >
      {text}
    </text>
  )
  const selBox = (x: number, y: number, w: number, h: number, key: string) => (
    <rect key={key} className="lnet-sel" x={x} y={y} width={w} height={h} rx={7} fill="#2f6fe4" fillOpacity={0.09} stroke="#2f6fe4" strokeWidth={1.5} />
  )

  // ramos
  let railBottom = cyOf(branches.length - 1)
  branches.forEach((b, bi) => {
    const cy = cyOf(bi)
    let p = rung.enabled
    b.elements.forEach((el, j) => {
      const x0 = RAIL_X + j * COL_W
      const cx = x0 + COL_W / 2
      const conducts = pass(el)
      const pIn = p
      const pOut = pIn && conducts
      const isSel = selection?.type === 'contact' && selection.elementId === el.id
      const name = tagName(el.address)
      svg.push(
        <g key={el.id}>
          {isSel && selBox(x0 + 10, cy - 46, COL_W - 20, 66, `${el.id}-sel`)}
          {wire(x0, cy, cx - 10, cy, online && pIn)}
          {wire(cx + 10, cy, x0 + COL_W, cy, online && pOut)}
          {online && conducts && <rect x={cx - 10} y={cy - 12} width={20} height={24} fill={C_ON} fillOpacity={0.16} />}
          <line x1={cx - 10} y1={cy - 13} x2={cx - 10} y2={cy + 13} stroke={online && conducts ? C_ON : C_OFF} strokeWidth={2} />
          <line x1={cx + 10} y1={cy - 13} x2={cx + 10} y2={cy + 13} stroke={online && conducts ? C_ON : C_OFF} strokeWidth={2} />
          {el.contactType === 'NC' && <line x1={cx - 13} y1={cy + 12} x2={cx + 13} y2={cy - 12} stroke={online && conducts ? C_ON : C_OFF} strokeWidth={1.6} />}
          {(el.contactType === 'RISING' || el.contactType === 'FALLING') && label(cx, cy + 4, el.contactType === 'RISING' ? 'P' : 'N', { bold: true, size: 11 })}
          {label(cx, cy - 20, `%${el.address}`, { bold: true })}
          {name && label(cx, cy - 33, `"${name}"`, { grey: true, size: 9 })}
          {online && label(cx + 16, cy + 24, rawContact(el) ? '1' : '0', { anchor: 'start', size: 9, grey: !rawContact(el) })}
        </g>,
      )
      if (!readonly)
        hits.push(
          <div
            key={`${el.id}-hit`}
            className="lnet-hit"
            style={{ left: x0 + 10, top: cy - 46, width: COL_W - 20, height: 66 }}
            draggable
            onDragStart={(e) => {
              const payload: MovePayload = { rungId: rung.id, branchId: b.id, elementId: el.id }
              e.dataTransfer.setData(LADDER_MOVE_MIME, JSON.stringify(payload))
              e.dataTransfer.setData('text/plain', `ladder-move:${el.id}`)
              e.dataTransfer.effectAllowed = 'move'
              setLadderDrag({ move: payload })
            }}
            onDragEnd={() => setLadderDrag(null)}
            onClick={(e) => { e.stopPropagation(); onSelect({ type: 'contact', branchId: b.id, elementId: el.id }) }}
            onDoubleClick={(e) => { e.stopPropagation(); onEdit({ type: 'contact', branchId: b.id, elementId: el.id }) }}
            onContextMenu={(e) => { e.preventDefault(); removeContact(b.id, el.id) }}
            title={`%${el.address}${name ? ` "${name}"` : ''} — clique: edição rápida · duplo clique: propriedades e nome · arraste para mover · Del/botão direito remove`}
          />,
        )
      p = pOut
    })
    const endX = RAIL_X + b.elements.length * COL_W
    svg.push(<g key={`${b.id}-tail`}>{wire(endX, cy, contactsEnd, cy, online && p)}</g>)
    if (!readonly && rung.branches.length > 1)
      hits.push(
        <button
          key={`${b.id}-rm`}
          className="lnet-branch-rm"
          style={{ left: contactsEnd - 18, top: cy + 8 }}
          title="Remover este ramo (OR)"
          onClick={(e) => { e.stopPropagation(); updateRung(rung.id, (r) => ({ ...r, branches: r.branches.filter((x) => x.id !== b.id) }), 'force') }}
        >
          ×
        </button>,
      )
  })

  // junção OR
  if (branches.length > 1) svg.push(<g key="or-join">{wire(contactsEnd, cyOf(0), contactsEnd, cyOf(branches.length - 1), rungOut)}</g>)
  // ligação às saídas
  svg.push(<g key="link">{wire(contactsEnd, cyOf(0), OJ, cyOf(0), rungOut)}</g>)
  if (outputs.length > 1) svg.push(<g key="out-join">{wire(OJ, outputs[0].cy, OJ, outputs[outputs.length - 1].cy, rungOut)}</g>)
  railBottom = Math.max(railBottom, cyOf(0))

  outputs.forEach((o, k) => {
    const cy = o.cy
    if (o.type === 'timer' && rung.timer) {
      const t = rung.timer
      const top = cy - 40
      const done = !!table[t.address]
      const et = timers[t.address]?.elapsedMs ?? 0
      const isSel = selection?.type === 'timer'
      svg.push(
        <g key="timer">
          {isSel && selBox(boxX - 8, top - 22, BOX_W + 16, 108, 'timer-sel')}
          {wire(OJ, cy, boxX, cy, rungOut)}
          {label(boxX + BOX_W / 2, top - 7, `%${t.address}`, { bold: true })}
          <rect x={boxX} y={top} width={BOX_W} height={80} fill="#fff" stroke={online && done ? C_ON : '#5b6b84'} strokeWidth={1.3} />
          <rect x={boxX} y={top} width={BOX_W} height={30} fill="#eef3fb" />
          {label(boxX + BOX_W / 2, top + 13, t.timerType === 'STAR_DELTA' ? 'Y-Δ' : t.timerType, { bold: true, size: 11 })}
          {label(boxX + BOX_W / 2, top + 25, 'Time', { grey: true, size: 9 })}
          {label(boxX + 6, cy + 3, 'IN', { anchor: 'start', size: 9 })}
          {label(boxX + 6, cy + 27, 'PT', { anchor: 'start', size: 9 })}
          {label(boxX + BOX_W - 6, cy + 3, 'Q', { anchor: 'end', size: 9 })}
          {label(boxX + BOX_W - 6, cy + 27, 'ET', { anchor: 'end', size: 9 })}
          <line x1={boxX - 14} y1={cy + 24} x2={boxX} y2={cy + 24} stroke="#5b6b84" strokeWidth={1} />
          {label(boxX - 16, cy + 27, fmtTime(t.presetMs), { anchor: 'end', size: 9, grey: true })}
          {wire(boxX + BOX_W, cy, boxX + BOX_W + 16, cy, online && done)}
          <line x1={boxX + BOX_W} y1={cy + 24} x2={boxX + BOX_W + 14} y2={cy + 24} stroke="#5b6b84" strokeWidth={1} />
          {label(boxX + BOX_W + 18, cy + 27, online ? fmtTime(et) : '…', { anchor: 'start', size: 9, grey: true })}
        </g>,
      )
      if (!readonly)
        hits.push(
          <div
            key="timer-hit"
            className="lnet-hit"
            style={{ left: boxX - 8, top: top - 22, width: BOX_W + 16, height: 108 }}
            onClick={(e) => { e.stopPropagation(); onSelect(isSel ? null : { type: 'timer' }) }}
            onDoubleClick={(e) => { e.stopPropagation(); onEdit({ type: 'timer' }) }}
            onContextMenu={(e) => { e.preventDefault(); updateRung(rung.id, (r) => ({ ...r, timer: undefined }), 'force') }}
            title="Temporizador — clique: edição rápida · duplo clique: tipo e presets · Del/botão direito remove"
          />,
        )
    } else if (o.type === 'counter' && rung.counter) {
      const c = rung.counter
      const top = cy - 40
      const done = !!table[c.address]
      const cv = counters[c.address]?.count ?? 0
      const isSel = selection?.type === 'counter'
      svg.push(
        <g key="counter">
          {isSel && selBox(boxX - 8, top - 22, BOX_W + 16, 108, 'counter-sel')}
          {wire(OJ, cy, boxX, cy, rungOut)}
          {label(boxX + BOX_W / 2, top - 7, `%${c.address}`, { bold: true })}
          <rect x={boxX} y={top} width={BOX_W} height={80} fill="#fff" stroke={online && done ? C_ON : '#5b6b84'} strokeWidth={1.3} />
          <rect x={boxX} y={top} width={BOX_W} height={30} fill="#eef3fb" />
          {label(boxX + BOX_W / 2, top + 13, c.counterType, { bold: true, size: 11 })}
          {label(boxX + BOX_W / 2, top + 25, 'Int', { grey: true, size: 9 })}
          {label(boxX + 6, cy + 3, c.counterType === 'CTU' ? 'CU' : 'CD', { anchor: 'start', size: 9 })}
          {label(boxX + 6, cy + 19, c.counterType === 'CTU' ? 'R' : 'LD', { anchor: 'start', size: 9 })}
          {label(boxX + 6, cy + 35, 'PV', { anchor: 'start', size: 9 })}
          <line x1={boxX - 14} y1={cy + 16} x2={boxX} y2={cy + 16} stroke="#5b6b84" strokeWidth={1} />
          <line x1={boxX - 14} y1={cy + 32} x2={boxX} y2={cy + 32} stroke="#5b6b84" strokeWidth={1} />
          {label(boxX - 16, cy + 19, c.resetAddress ? `%${c.resetAddress}` : '…', { anchor: 'end', size: 9, grey: true })}
          {label(boxX - 16, cy + 35, String(c.preset), { anchor: 'end', size: 9, grey: true })}
          {label(boxX + BOX_W - 6, cy + 3, 'Q', { anchor: 'end', size: 9 })}
          {label(boxX + BOX_W - 6, cy + 19, 'CV', { anchor: 'end', size: 9 })}
          {wire(boxX + BOX_W, cy, boxX + BOX_W + 16, cy, online && done)}
          <line x1={boxX + BOX_W} y1={cy + 16} x2={boxX + BOX_W + 14} y2={cy + 16} stroke="#5b6b84" strokeWidth={1} />
          {label(boxX + BOX_W + 18, cy + 19, online ? String(cv) : '…', { anchor: 'start', size: 9, grey: true })}
        </g>,
      )
      if (!readonly)
        hits.push(
          <div
            key="counter-hit"
            className="lnet-hit"
            style={{ left: boxX - 8, top: top - 22, width: BOX_W + 16, height: 108 }}
            onClick={(e) => { e.stopPropagation(); onSelect(isSel ? null : { type: 'counter' }) }}
            onDoubleClick={(e) => { e.stopPropagation(); onEdit({ type: 'counter' }) }}
            onContextMenu={(e) => { e.preventDefault(); updateRung(rung.id, (r) => ({ ...r, counter: undefined }), 'force') }}
            title="Contador — clique: edição rápida · duplo clique: tipo e presets · Del/botão direito remove"
          />,
        )
    } else if (o.type === 'call' && rung.call) {
      const top = cy - 25
      const isSel = selection?.type === 'call'
      svg.push(<g key="call-block">{isSel && selBox(boxX - 8, top - 8, BOX_W + 16, 66, 'call-sel')}{wire(OJ, cy, boxX, cy, rungOut)}
        <rect x={boxX} y={top} width={BOX_W} height={50} rx={4} fill="#fff" stroke={rungOut ? C_ON : '#5b6b84'} strokeWidth={1.5} />
        {label(boxX + BOX_W / 2, cy - 5, 'CALL', { bold: true, size: 11 })}
        {label(boxX + BOX_W / 2, cy + 12, rung.call.targetId, { size: 9 })}
        {wire(boxX + BOX_W, cy, boxX + BOX_W + 16, cy, rungOut)}
      </g>)
      if (!readonly) hits.push(<div key="call-hit" className="lnet-hit" style={{ left: boxX - 8, top: top - 8, width: BOX_W + 16, height: 66 }}
        onClick={(e) => { e.stopPropagation(); onSelect(isSel ? null : { type: 'call' }) }}
        onDoubleClick={(e) => { e.stopPropagation(); onEdit({ type: 'call' }) }}
        onContextMenu={(e) => { e.preventDefault(); updateRung(rung.id, (r) => ({ ...r, call: undefined }), 'force') }}
        title="CALL FC — clique: edição rápida · duplo clique: escolher bloco · botão direito remove" />)
    } else if (o.type === 'move' && rung.move) {
      const m = rung.move
      const top = cy - 40
      const isSel = selection?.type === 'move'
      const operand = (v: string) => (/^[IQM]\d+(\.\d+)?$/i.test(v.trim()) ? `%${v.trim().toUpperCase()}` : v)
      const edge = rungOut ? C_ON : '#5b6b84'
      // TIA Portal: EN/ENO na linha de corrente; IN/OUT1 uma linha abaixo, operandos fora da caixa
      svg.push(<g key="move-block">
        {isSel && selBox(boxX - 8, top - 8, BOX_W + 16, 86, 'move-sel')}
        {wire(OJ, cy, boxX, cy, rungOut)}
        <rect x={boxX} y={top} width={BOX_W} height={70} fill="#fff" stroke={edge} strokeWidth={1.3} />
        <rect x={boxX} y={top} width={BOX_W} height={30} fill="#eef3fb" />
        {label(boxX + BOX_W / 2, top + 19, 'MOVE', { bold: true, size: 11 })}
        {label(boxX + 6, cy + 3, 'EN', { anchor: 'start', size: 9 })}
        {label(boxX + 6, cy + 19, 'IN', { anchor: 'start', size: 9 })}
        {label(boxX + BOX_W - 6, cy + 3, 'ENO', { anchor: 'end', size: 9 })}
        {label(boxX + BOX_W - 6, cy + 19, 'OUT1', { anchor: 'end', size: 9 })}
        <line x1={boxX - 14} y1={cy + 16} x2={boxX} y2={cy + 16} stroke="#5b6b84" strokeWidth={1} />
        {label(boxX - 16, cy + 19, operand(m.source) || '…', { anchor: 'end', size: 9, grey: true })}
        {wire(boxX + BOX_W, cy, boxX + BOX_W + 16, cy, rungOut)}
        <line x1={boxX + BOX_W} y1={cy + 16} x2={boxX + BOX_W + 14} y2={cy + 16} stroke="#5b6b84" strokeWidth={1} />
        {label(boxX + BOX_W + 18, cy + 19, operand(m.target) || '…', { anchor: 'start', size: 9, grey: true })}
      </g>)
      if (!readonly) hits.push(<div key="move-hit" className="lnet-hit" style={{ left: boxX - 8, top: top - 8, width: BOX_W + 16, height: 86 }}
        onClick={(e) => { e.stopPropagation(); onSelect(isSel ? null : { type: 'move' }) }}
        onDoubleClick={(e) => { e.stopPropagation(); onEdit({ type: 'move' }) }}
        onContextMenu={(e) => { e.preventDefault(); updateRung(rung.id, (r) => ({ ...r, move: undefined }), 'force') }}
        title="MOVE — duplo clique: origem e destino · Del/botão direito remove" />)
    } else if (o.type === 'coil') {
      const c = o.coil
      const on = online && !!table[c.address]
      const isSel = selection?.type === 'coil' && selection.coilId === c.id
      const name = tagName(c.address)
      const stroke = on ? C_ON : C_OFF
      svg.push(
        <g key={c.id}>
          {isSel && selBox(coilCX - 40, cy - 46, 80, 66, `${c.id}-sel`)}
          {wire(OJ, cy, coilCX - 12, cy, rungOut)}
          {on && <ellipse cx={coilCX} cy={cy} rx={10} ry={12} fill={C_ON} fillOpacity={0.16} />}
          <path d={`M ${coilCX - 6} ${cy - 13} Q ${coilCX - 15} ${cy} ${coilCX - 6} ${cy + 13}`} fill="none" stroke={stroke} strokeWidth={2} />
          <path d={`M ${coilCX + 6} ${cy - 13} Q ${coilCX + 15} ${cy} ${coilCX + 6} ${cy + 13}`} fill="none" stroke={stroke} strokeWidth={2} />
          {c.coilType !== 'COIL' && label(coilCX, cy + 4, c.coilType === 'SET' ? 'S' : 'R', { bold: true, size: 11 })}
          {label(coilCX, cy - 20, `%${c.address}`, { bold: true })}
          {name && label(coilCX, cy - 33, `"${name}"`, { grey: true, size: 9 })}
        </g>,
      )
      if (!readonly)
        hits.push(
          <div
            key={`${c.id}-hit`}
            className="lnet-hit"
            style={{ left: coilCX - 40, top: cy - 46, width: 80, height: 66 }}
            onClick={(e) => { e.stopPropagation(); onSelect({ type: 'coil', coilId: c.id }) }}
            onDoubleClick={(e) => { e.stopPropagation(); onEdit({ type: 'coil', coilId: c.id }) }}
            onContextMenu={(e) => { e.preventDefault(); removeCoil(c.id) }}
            title={`%${c.address}${name ? ` "${name}"` : ''} — clique: edição rápida · duplo clique: propriedades e nome · Del/botão direito remove`}
          />,
        )
    } else if (o.type === 'placeholder') {
      svg.push(
        <g key="ph" opacity={0.55}>
          {wire(OJ, cy, coilCX - 12, cy, rungOut)}
          <path d={`M ${coilCX - 6} ${cy - 13} Q ${coilCX - 15} ${cy} ${coilCX - 6} ${cy + 13}`} fill="none" stroke="#94a3b8" strokeWidth={1.6} strokeDasharray="3 2" />
          <path d={`M ${coilCX + 6} ${cy - 13} Q ${coilCX + 15} ${cy} ${coilCX + 6} ${cy + 13}`} fill="none" stroke="#94a3b8" strokeWidth={1.6} strokeDasharray="3 2" />
          {label(coilCX, cy - 20, '<??.?>', { grey: true, bold: true })}
        </g>,
      )
      if (!readonly)
        hits.push(
          <div key="ph-hit" className="lnet-hit" style={{ left: coilCX - 40, top: cy - 46, width: 80, height: 66 }} onClick={(e) => { e.stopPropagation(); addCoil() }} title="Clique para adicionar uma bobina (ou arraste uma da paleta)" />,
        )
    }
    if (k === outputs.length - 1) railBottom = Math.max(railBottom, cy)
  })

  // indicadores de largada
  if (drop?.kind === 'branch') {
    const cy = cyOf(drop.branchIndex)
    const x = RAIL_X + drop.index * COL_W
    svg.push(
      <g key="drop" pointerEvents="none">
        <rect x={x - 3} y={cy - 26} width={6} height={52} rx={3} fill="#2f6fe4" />
        <circle cx={x} cy={cy} r={6} fill="#fff" stroke="#2f6fe4" strokeWidth={2} />
      </g>,
    )
  } else if (drop?.kind === 'newBranch') {
    const cy = cyOf(branches.length)
    svg.push(
      <g key="drop" pointerEvents="none">
        <line x1={RAIL_X} y1={cy} x2={contactsEnd} y2={cy} stroke="#2f6fe4" strokeWidth={2} strokeDasharray="6 4" />
        <line x1={contactsEnd} y1={cyOf(0)} x2={contactsEnd} y2={cy} stroke="#2f6fe4" strokeWidth={2} strokeDasharray="6 4" />
        <rect x={RAIL_X + 20} y={cy - 22} width={112} height={18} rx={9} fill="#2f6fe4" />
        <text x={RAIL_X + 76} y={cy - 9} fontSize={10} fontWeight={700} fill="#fff" textAnchor="middle">+ novo ramo (OR)</text>
      </g>,
    )
  } else if (drop?.kind === 'output') {
    svg.push(<rect key="drop" x={OJ + 10} y={TOP} width={W - OJ - 20} height={H - TOP - 6} rx={6} fill="#2f6fe4" fillOpacity={0.06} stroke="#2f6fe4" strokeDasharray="6 4" pointerEvents="none" />)
  }

  const railPowered = online && rung.enabled
  const railTop = TOP + 16
  const railEnd = Math.max(railBottom, drop?.kind === 'newBranch' ? cyOf(branches.length) : 0) + 24

  return (
    <div
      ref={wrapRef}
      className={`lnet ${drop ? 'is-drop' : ''} ${readonly ? 'is-readonly' : ''}`}
      style={{ width: W, height: H }}
      tabIndex={readonly ? -1 : 0}
      onKeyDown={onKeyDown}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => !readonly && onSelect(null)}
    >
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="absolute inset-0" aria-hidden>
        <defs>
          <pattern id={`lnet-grid-${rung.id}`} width={LADDER_GRID} height={LADDER_GRID} patternUnits="userSpaceOnUse">
            <circle cx={0} cy={0} r={0.9} fill="#c9d3e3" />
            <circle cx={LADDER_GRID} cy={0} r={0.9} fill="#c9d3e3" />
            <circle cx={0} cy={LADDER_GRID} r={0.9} fill="#c9d3e3" />
            <circle cx={LADDER_GRID} cy={LADDER_GRID} r={0.9} fill="#c9d3e3" />
          </pattern>
        </defs>
        {gridEnabled && <rect width={W} height={H} fill={`url(#lnet-grid-${rung.id})`} />}
        {/* barramento de alimentação (esquerda) */}
        <line x1={RAIL_X} y1={railTop} x2={RAIL_X} y2={railEnd} stroke={railPowered ? C_ON : C_OFF} strokeWidth={3} />
        {svg}
      </svg>
      {hits}
    </div>
  )
}
