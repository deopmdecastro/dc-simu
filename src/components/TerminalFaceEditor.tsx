import { uiConfirm } from '../ui/dialogs'
import Select from '../ui/Select'
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { useSimStore } from '../store/useSimStore'
import { hasComponent3DModel } from '../three/modelPaths'
import { getOrientedComponentImage } from '../three/orientedComponentImage'
import { terminal3DPositionOf, type Terminal3DFace } from '../three/terminal3D'
import {
  FACE_IMAGE_PAD,
  FACE_META,
  FACE_ORDER,
  defaultFacePosition,
  faceSizeMm,
  faceUV,
  facesOfTerminal,
  nearestFace,
  nextFreeTerminalLabel,
  positionFromFaceUV,
  snapToNearestSurface,
} from '../three/terminalFaces'
import { TERMINAL_KIND_LABEL, TERMINAL_TYPE_LABEL } from '../schematic/symbols'
import { inferTerminalElectricalClass, terminalDatasheetGuidance, TERMINAL_ELECTRICAL_CLASS_LABEL } from '../electrical/terminalClassification'
import { IconCursor, IconDelete, IconLayers, IconLock, IconPlus, IconZoomIn } from '../ui/icons'
import TerminalLibrary, { DND_PROFILE, DND_TERMINAL } from './TerminalLibrary'
import { layoutSpecsUV } from '../three/terminalProfileLayout'
import { uniqueLabel } from '../catalog/terminalLayout'
import { BUILTIN_PROFILES, defaultParams, type ProfileParams, type TerminalProfile, type TerminalSpec } from '../catalog/terminalProfiles'
import { allProfiles, useProfileStore } from '../catalog/profileStore'
import type { ComponentType, ElectricalComponent, Terminal, TerminalElectricalClass, TerminalKind, TerminalType } from '../types'

type Tool = 'move' | 'add'
type FaceImage = { status: 'loading' | 'ready' | 'error'; url?: string; w: number; h: number }

const ZOOMS = [1, 2, 4]
const STAGE_HEIGHT = 300
const NUDGE = 0.005

/** Capturas ortográficas reais do GLB, uma por face, carregadas por ordem de prioridade. */
function useFaceImages(type: ComponentType, enabled: boolean, priority: Terminal3DFace): Record<Terminal3DFace, FaceImage> {
  const empty = () => Object.fromEntries(FACE_ORDER.map((face) => [face, { status: enabled ? 'loading' : 'error', w: 0, h: 0 } as FaceImage])) as Record<Terminal3DFace, FaceImage>
  const [images, setImages] = useState<Record<Terminal3DFace, FaceImage>>(empty)
  const priorityRef = useRef(priority)
  priorityRef.current = priority
  useEffect(() => {
    setImages(empty())
    if (!enabled) return
    let live = true
    const order = [priorityRef.current, ...FACE_ORDER.filter((face) => face !== priorityRef.current)]
    for (const face of order) {
      getOrientedComponentImage(type, FACE_META[face].orientation)
        .then((url) => {
          const img = new Image()
          img.onload = () => live && setImages((current) => ({ ...current, [face]: { status: 'ready', url, w: img.naturalWidth, h: img.naturalHeight } }))
          img.onerror = () => live && setImages((current) => ({ ...current, [face]: { status: 'error', w: 0, h: 0 } }))
          img.src = url
        })
        .catch(() => live && setImages((current) => ({ ...current, [face]: { status: 'error', w: 0, h: 0 } })))
    }
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, enabled])
  return images
}

/** Campo de texto que só grava identificações válidas (não vazias e únicas). */
function LabelInput({ terminal, others, onCommit }: { terminal: Terminal; others: Terminal[]; onCommit: (label: string) => void }) {
  const [value, setValue] = useState(terminal.label)
  useEffect(() => setValue(terminal.label), [terminal.id, terminal.label])
  const trimmed = value.trim()
  const duplicate = !!trimmed && others.some((other) => other.label.toLocaleUpperCase() === trimmed.toLocaleUpperCase())
  const invalid = !trimmed || duplicate
  return <label className="tfe-field">
    <span>Identificação</span>
    <input value={value} aria-invalid={invalid} onChange={(event) => { setValue(event.target.value); const next = event.target.value.trim(); if (next && !others.some((other) => other.label.toLocaleUpperCase() === next.toLocaleUpperCase())) onCommit(next) }} onBlur={() => { if (invalid) setValue(terminal.label) }} />
    {invalid && <small className="tfe-error">{duplicate ? 'Já existe um borne com esta identificação.' : 'A identificação é obrigatória.'}</small>}
  </label>
}

const fmt = (value: number) => (Math.round(value * 10) / 10).toLocaleString('pt-PT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export default function TerminalFaceEditor({ component }: { component: ElectricalComponent }) {
  const editor = useSimStore((state) => state.viewOrientationEditor)!
  const wires = useSimStore((state) => state.wires)
  const setPosition3D = useSimStore((state) => state.setViewTerminalPosition3D)
  const setDefinition = useSimStore((state) => state.setViewTerminalDefinition)
  const addTerminal = useSimStore((state) => state.addViewTerminal)
  const deleteTerminal = useSimStore((state) => state.deleteViewTerminal)
  const setActive = useSimStore((state) => state.setViewActiveTerminal)
  const setDiameter = useSimStore((state) => state.setViewTerminalDiameter)

  const terminals = component.terminals
  const selected = terminals.find((terminal) => terminal.id === editor.activeTerminalId) ?? terminals[0]
  const [face, setFace] = useState<Terminal3DFace>(() => (selected ? facesOfTerminal(selected)[0] ?? nearestFace(terminal3DPositionOf(selected)) : 'front'))
  const [tool, setTool] = useState<Tool>('move')
  const [zoom, setZoom] = useState(1)
  const [showLabels, setShowLabels] = useState(true)
  const [newLabel, setNewLabel] = useState('')
  const [newKind, setNewKind] = useState<TerminalKind>('io')
  const [cursor, setCursor] = useState<{ u: number; v: number } | null>(null)
  const [libOpen, setLibOpen] = useState(false)
  const [armed, setArmed] = useState<TerminalSpec | null>(null)
  const [notice, setNotice] = useState('')
  const [dropping, setDropping] = useState(false)
  const [stageSize, setStageSize] = useState({ w: 340, h: STAGE_HEIGHT })
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; terminalId: string } | null>(null)

  const has3D = hasComponent3DModel(component.type)
  const images = useFaceImages(component.type, has3D, face)
  const image = images[face]
  const size = useMemo(() => faceSizeMm(component, face), [component.type, component.w, component.h, face])
  const aspect = image.status === 'ready' && image.w > 0 ? image.w / image.h : Math.max(0.2, Math.min(5, size.w / Math.max(1, size.h)))

  useEffect(() => {
    const element = stageRef.current
    if (!element) return
    const observer = new ResizeObserver(() => setStageSize({ w: Math.max(120, element.clientWidth - 2), h: Math.max(120, element.clientHeight - 2) }))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // Ajusta a vista à face quando a seleção muda por fora (lista, cena 3D…).
  const selectedId = selected?.id
  useEffect(() => {
    const current = terminals.find((terminal) => terminal.id === selectedId)
    if (!current) return
    const faces = facesOfTerminal(current)
    if (faces.length > 0 && !faces.includes(face)) setFace(faces[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])
  useEffect(() => { setTool('move'); setNewLabel(''); setArmed(null) }, [component.id])
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 3500); return () => window.clearTimeout(timer) }, [notice])

  const fit = Math.min((stageSize.w - 28) / aspect, stageSize.h - 40)
  const canvasH = fit * zoom
  const canvasW = canvasH * aspect

  const onFace = useMemo(() => terminals.filter((terminal) => facesOfTerminal(terminal).includes(face)), [terminals, face])
  const counts = useMemo(() => Object.fromEntries(FACE_ORDER.map((id) => [id, terminals.filter((terminal) => facesOfTerminal(terminal).includes(id)).length])) as Record<Terminal3DFace, number>, [terminals])
  const offSurface = useMemo(() => terminals.filter((terminal) => facesOfTerminal(terminal).length === 0), [terminals])
  const wireCount = useCallback((terminal: Terminal) => wires.filter((wire) => wire.fromTerminalId === terminal.id || wire.toTerminalId === terminal.id).length, [wires])

  const pointerToUV = (event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return null
    const span = 1 - 2 * FACE_IMAGE_PAD
    return {
      u: Math.max(0, Math.min(1, ((event.clientX - rect.left) / rect.width - FACE_IMAGE_PAD) / span)),
      v: Math.max(0, Math.min(1, ((event.clientY - rect.top) / rect.height - FACE_IMAGE_PAD) / span)),
    }
  }
  const toPercent = (value: number) => (FACE_IMAGE_PAD + value * (1 - 2 * FACE_IMAGE_PAD)) * 100

  const placeNewTerminal = (u: number, v: number, spec: TerminalSpec | null = armed) => {
    const taken = new Set(terminals.map((terminal) => terminal.label.trim().toLocaleUpperCase()))
    const typed = (spec ? spec.label : newLabel).trim()
    const label = typed && !taken.has(typed.toLocaleUpperCase()) ? typed : spec && typed ? uniqueLabel(typed, new Set(terminals.map((terminal) => terminal.label))) : nextFreeTerminalLabel(terminals)
    const position3D = positionFromFaceUV(face, u, v)
    addTerminal({
      label, kind: spec?.kind ?? newKind, terminalType: spec?.terminalType ?? 'screw', color: spec?.color ?? '#64748b',
      ...(spec ? { displayName: spec.name, electricalClass: spec.electricalClass } : {}),
      x: position3D.x, y: 1 - position3D.y, position3D,
    })
    setNewLabel('')
  }

  /** Aplica um perfil da biblioteca: cria os bornes nas faces certas (todos continuam editáveis). */
  const applyProfileToComponent = async (profile: TerminalProfile, params: ProfileParams, replace: boolean) => {
    const specs = profile.build(params)
    if (!specs.length) return
    if (replace && terminals.length > 0) {
      const linked = terminals.reduce((sum, terminal) => sum + wireCount(terminal), 0)
      if (!await uiConfirm(linked > 0 ? `Substituir os ${terminals.length} bornes atuais? ${linked} cabo(s) ligado(s) serão removidos ao Aplicar.` : `Substituir os ${terminals.length} bornes atuais?`)) return
      terminals.forEach((terminal) => deleteTerminal(terminal.id))
    }
    const used = new Set(replace ? [] : terminals.map((terminal) => terminal.label))
    const places = layoutSpecsUV(specs)
    specs.forEach((spec, index) => {
      const place = places[index]
      const position3D = positionFromFaceUV(place.face, place.u, place.v)
      addTerminal({
        label: uniqueLabel(spec.label, used), kind: spec.kind, terminalType: spec.terminalType, color: spec.color, displayName: spec.name, electricalClass: spec.electricalClass,
        x: position3D.x, y: 1 - position3D.y, position3D,
      })
    })
    setFace(places[0].face)
    setArmed(null); setTool('move')
    setNotice(`${profile.name}: ${specs.length} bornes adicionados.`)
  }

  const removeTerminal = async (terminal: Terminal) => {
    const linked = wireCount(terminal)
    if (linked > 0 && !await uiConfirm(`O borne ${terminal.label} tem ${linked} cabo(s). Ao Aplicar, esses cabos serão removidos. Continuar?`)) return
    deleteTerminal(terminal.id)
  }

  const onStageKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
    const key = event.key.toLowerCase()
    if (event.key === 'Escape') { setArmed(null); setTool('move'); return }
    if (key === 'v') { setTool('move'); setArmed(null); return }
    if (key === 'a') { setTool('add'); return }
    if (!selected) return
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removeTerminal(selected); return }
    const delta: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    const move = delta[event.key]
    if (!move || !facesOfTerminal(selected).includes(face)) return
    event.preventDefault()
    const step = (event.shiftKey ? 5 : 1) * NUDGE
    const point = faceUV(face, terminal3DPositionOf(selected))
    setPosition3D(selected.id, positionFromFaceUV(face, point.u + move[0] * step, point.v + move[1] * step))
  }

  const dragMove = (event: ReactPointerEvent<HTMLElement>) => {
    const point = pointerToUV(event)
    setCursor(point)
    const drag = dragRef.current
    if (drag?.pointerId === event.pointerId && point) setPosition3D(drag.terminalId, positionFromFaceUV(face, point.u, point.v))
  }

  const selectFromList = (terminal: Terminal) => {
    setActive(terminal.id)
    const faces = facesOfTerminal(terminal)
    if (faces.length > 0 && !faces.includes(face)) setFace(faces[0])
    else if (faces.length === 0) setFace(nearestFace(terminal3DPositionOf(terminal)))
  }

  const moveToFace = (terminal: Terminal, target: Terminal3DFace) => {
    if (facesOfTerminal(terminal).length === 1 && facesOfTerminal(terminal)[0] === target) { setFace(target); return }
    const others = { ...component, terminals: terminals.filter((item) => item.id !== terminal.id) }
    setDefinition(terminal.id, { position3D: defaultFacePosition(others, target) })
    setFace(target)
  }

  const snapAll = () => offSurface.forEach((terminal) => setDefinition(terminal.id, { position3D: snapToNearestSurface(terminal3DPositionOf(terminal)) }))

  const selectedFaces = selected ? facesOfTerminal(selected) : []
  const selectedPoint = selected && selectedFaces.length > 0 ? faceUV(selectedFaces.includes(face) ? face : selectedFaces[0], terminal3DPositionOf(selected)) : null
  const detailFace = selected && selectedFaces.length > 0 ? (selectedFaces.includes(face) ? face : selectedFaces[0]) : face
  const detailSize = faceSizeMm(component, detailFace)
  const setMm = (axis: 'u' | 'v', mm: number) => {
    if (!selected || !selectedPoint || !Number.isFinite(mm)) return
    const next = axis === 'u' ? { u: mm / Math.max(1, detailSize.w), v: selectedPoint.v } : { u: selectedPoint.u, v: mm / Math.max(1, detailSize.h) }
    setPosition3D(selected.id, positionFromFaceUV(detailFace, next.u, next.v))
  }
  const selectedClass = selected ? selected.electricalClass ?? inferTerminalElectricalClass(component, selected) : 'other'
  const dotSize = (terminal: Terminal) => Math.max(11, Math.min(24, Math.round((terminal.diameter ?? 9) * 1.5)))

  return <div className="tfe">
    <header className="tfe-head">
      <div>
        <strong>Bornes por vista</strong>
        <small>Escolha a face do componente e coloque os bornes sobre a superfície real.</small>
      </div>
      <span className="tfe-total" title="Nesta instância, os bornes usam coordenadas locais e acompanham sempre o movimento e a rotação do componente"><IconLock size={11} /> Ligados · {terminals.length} {terminals.length === 1 ? 'borne' : 'bornes'}</span>
    </header>

    <div className="tfe-faces" role="tablist" aria-label="Face do componente">
      {FACE_ORDER.map((id) => {
        const thumb = images[id]
        return <button type="button" role="tab" key={id} aria-selected={face === id} className={face === id ? 'active' : ''} onClick={() => setFace(id)} title={FACE_META[id].hint}>
          <span className="tfe-thumb">
            {thumb.status === 'ready' && thumb.url ? <img src={thumb.url} alt="" draggable={false} /> : <i className={thumb.status === 'loading' ? 'is-loading' : ''} />}
            {counts[id] > 0 && <b>{counts[id]}</b>}
          </span>
          <em>{FACE_META[id].tile}</em>
        </button>
      })}
    </div>

    <div className="tfe-toolbar" role="toolbar" aria-label="Ferramentas de bornes">
      <div className="tfe-seg" role="group" aria-label="Ferramenta">
        <button type="button" className={tool === 'move' ? 'active' : ''} aria-pressed={tool === 'move'} onClick={() => { setTool('move'); setArmed(null) }} title="Selecionar e arrastar bornes (V)"><IconCursor size={13} />Mover</button>
        <button type="button" className={tool === 'add' ? 'active' : ''} aria-pressed={tool === 'add'} onClick={() => { setTool('add'); setArmed(null) }} title="Clicar na superfície para criar um borne (A)"><IconPlus size={13} />Adicionar</button>
      </div>
      <div className="tfe-seg" role="group" aria-label="Ampliação">
        <span className="tfe-seg-icon" aria-hidden="true"><IconZoomIn size={13} /></span>
        {ZOOMS.map((value) => <button type="button" key={value} className={zoom === value ? 'active' : ''} aria-pressed={zoom === value} onClick={() => setZoom(value)}>{value}×</button>)}
      </div>
      <button type="button" className={`tfe-toggle${libOpen ? ' active' : ''}`} aria-pressed={libOpen} onClick={() => setLibOpen((value) => !value)} title="Perfis de bornes e bornes soltos prontos a usar"><IconLayers size={13} /> Biblioteca</button>
      <button type="button" className={`tfe-toggle${showLabels ? ' active' : ''}`} aria-pressed={showLabels} onClick={() => setShowLabels((value) => !value)} title="Mostrar ou ocultar as identificações">Rótulos</button>
    </div>

    {libOpen && <div className="tfe-lib" aria-label="Biblioteca de bornes">
      <TerminalLibrary mode="insert" armedLabel={armed?.label ?? null} onInsert={applyProfileToComponent}
        onArmChip={(spec) => { setArmed(spec); setNewKind(spec.kind); setTool('add') }} />
    </div>}
    {notice && <p className="tfe-notice-ok" role="status">{notice}</p>}

    {tool === 'add' && <div className="tfe-add" role="group" aria-label="Novo borne">
      {!armed && <label className="tfe-field"><span>Identificação</span><input value={newLabel} placeholder={`Auto (${nextFreeTerminalLabel(terminals)})`} onChange={(event) => setNewLabel(event.target.value)} /></label>}
      {!armed && <label className="tfe-field"><span>Função elétrica</span><Select value={newKind} onChange={(event) => setNewKind(event.target.value as TerminalKind)}>{Object.entries(TERMINAL_KIND_LABEL).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</Select></label>}
      <p>{armed ? <>A colocar <strong>{armed.label}</strong> · {armed.name}. </> : null}Clique na superfície da face <strong>{FACE_META[face].label}</strong> para criar o borne. Pode continuar a clicar para criar vários{armed ? ' · Esc termina' : ''}.</p>
    </div>}

    <div className="tfe-stage" ref={stageRef} style={{ height: STAGE_HEIGHT }} tabIndex={0} onKeyDown={onStageKeyDown} aria-label={`Vista ${FACE_META[face].label} de ${component.ref}. Setas movem o borne selecionado, Delete remove.`}>
      <div
        ref={canvasRef}
        className={`tfe-canvas${dropping ? ' is-dropping' : ''}${tool === 'add' ? ' is-adding' : ''}${image.status !== 'ready' ? ' is-blueprint' : ''}`}
        style={{ width: canvasW, height: canvasH }}
        onDragOver={(event) => { if (event.dataTransfer.types.includes(DND_TERMINAL) || event.dataTransfer.types.includes(DND_PROFILE)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; if (!dropping) setDropping(true) } }}
        onDragLeave={() => setDropping(false)}
        onDrop={(event) => {
          setDropping(false)
          const chip = event.dataTransfer.getData(DND_TERMINAL), profileData = event.dataTransfer.getData(DND_PROFILE)
          if (!chip && !profileData) return
          event.preventDefault()
          if (chip) { const point = pointerToUV(event); if (point) placeNewTerminal(point.u, point.v, JSON.parse(chip) as TerminalSpec); return }
          const { id, params } = JSON.parse(profileData) as { id: string; params: ProfileParams }
          const profile = allProfiles(useProfileStore.getState().custom).find((item) => item.id === id) ?? BUILTIN_PROFILES.find((item) => item.id === id)
          if (profile) applyProfileToComponent(profile, { ...defaultParams(profile), ...params }, false)
        }}
        onPointerMove={dragMove}
        onPointerLeave={() => { if (!dragRef.current) setCursor(null) }}
        onPointerUp={(event) => {
          if (dragRef.current?.pointerId !== event.pointerId) return
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
          dragRef.current = null
        }}
        onPointerCancel={() => { dragRef.current = null }}
        onPointerDown={(event) => {
          if (tool === 'add') {
            const point = pointerToUV(event)
            if (point) placeNewTerminal(point.u, point.v)
            return
          }
        }}
      >
        {image.status === 'ready' && image.url && <img className="tfe-image" src={image.url} alt={`Vista ${FACE_META[face].label} real de ${component.ref}`} draggable={false} />}
        {image.status === 'loading' && <span className="tfe-state">A gerar a vista real…</span>}
        {image.status === 'error' && <span className="tfe-state">{has3D ? 'Não foi possível gerar a vista.' : 'Sem modelo 3D — esboço da face.'}</span>}
        <div className="tfe-surface" style={{ inset: `${FACE_IMAGE_PAD * 100}%` }} aria-hidden="true" />
        {tool === 'add' && cursor && <i className="tfe-ghost" style={{ left: `${toPercent(cursor.u)}%`, top: `${toPercent(cursor.v)}%` }} />}
        {onFace.map((terminal) => {
          const point = faceUV(face, terminal3DPositionOf(terminal))
          const active = terminal.id === selected?.id
          const px = dotSize(terminal)
          return <button
            type="button"
            key={terminal.id}
            className={`tfe-dot${active ? ' selected' : ''}`}
            style={{ left: `${toPercent(point.u)}%`, top: `${toPercent(point.v)}%`, width: px, height: px, backgroundColor: terminal.color }}
            title={`${terminal.label}${terminal.displayName ? ` · ${terminal.displayName}` : ''} — arraste para mover na superfície`}
            aria-label={`Borne ${terminal.label}`}
            onPointerDown={(event) => {
              if (tool === 'add') return
              event.preventDefault()
              event.stopPropagation()
              setActive(terminal.id)
              dragRef.current = { pointerId: event.pointerId, terminalId: terminal.id }
              canvasRef.current?.setPointerCapture(event.pointerId)
              stageRef.current?.focus({ preventScroll: true })
            }}
          >{showLabels && <span>{terminal.label}</span>}</button>
        })}
        {onFace.length === 0 && image.status !== 'loading' && tool === 'move' && <div className="tfe-empty"><strong>Sem bornes nesta face</strong></div>}
      </div>
    </div>

    <div className="tfe-readout" aria-live="polite">
      {cursor
        ? <span>Cursor · {fmt(cursor.u * size.w)} mm da esquerda · {fmt(cursor.v * size.h)} mm de cima</span>
        : <span>Face {FACE_META[face].label.toLowerCase()} · {fmt(size.w)} × {fmt(size.h)} mm · {onFace.length} {onFace.length === 1 ? 'borne' : 'bornes'}</span>}
      <kbd>V</kbd><kbd>A</kbd><kbd>↑↓←→</kbd>
    </div>

    {offSurface.length > 0 && <div className="tfe-notice" role="alert">
      <span><strong>{offSurface.length} {offSurface.length === 1 ? 'borne está' : 'bornes estão'} dentro do volume</strong> e não aparece{offSurface.length === 1 ? '' : 'm'} em nenhuma face: {offSurface.map((terminal) => terminal.label).join(', ')}.</span>
      <button type="button" onClick={snapAll}>Fixar à superfície</button>
    </div>}

    {terminals.length > 0 && <ul className="tfe-list" aria-label="Bornes do componente">
      {terminals.map((terminal) => {
        const faces = facesOfTerminal(terminal)
        const linked = wireCount(terminal)
        const active = terminal.id === selected?.id
        return <li key={terminal.id}>
          <button type="button" className={active ? 'active' : ''} aria-current={active} onClick={() => selectFromList(terminal)}>
            <i style={{ background: terminal.color }} />
            <strong>{terminal.label}</strong>
            <span className="tfe-list-name">{terminal.displayName || TERMINAL_KIND_LABEL[terminal.kind] || terminal.kind}</span>
            <span className={`tfe-tag${faces.length === 0 ? ' warn' : ''}`}>{faces.length === 0 ? 'Interior' : faces.map((id) => FACE_META[id].label).join(' · ')}</span>
            {linked > 0 && <small title={`${linked} cabo(s) ligado(s)`}>{linked}</small>}
          </button>
        </li>
      })}
    </ul>}

    {selected && <section className="tfe-detail" aria-label={`Propriedades do borne ${selected.label}`}>
      <header>
        <span><i style={{ background: selected.color }} /><strong>Borne {selected.label}</strong>{wireCount(selected) > 0 && <small>{wireCount(selected)} cabo(s)</small>}</span>
        <button type="button" className="tfe-remove" onClick={() => removeTerminal(selected)} title="Remover borne (Delete)"><IconDelete size={13} />Remover</button>
      </header>

      <div className="tfe-block">
        <h4>Identificação</h4>
        <div className="tfe-grid">
          <LabelInput terminal={selected} others={terminals.filter((terminal) => terminal.id !== selected.id)} onCommit={(label) => setDefinition(selected.id, { label })} />
          <label className="tfe-field"><span>Nome visível</span><input value={selected.displayName ?? ''} placeholder={selected.label} onChange={(event) => setDefinition(selected.id, { displayName: event.target.value || undefined })} /></label>
        </div>
      </div>

      <div className="tfe-block">
        <h4>Vistas onde aparece</h4>
        <div className="tfe-chips" role="group" aria-label="Superfície do borne">
          {FACE_ORDER.map((id) => <button type="button" key={id} className={selectedFaces.includes(id) ? 'active' : ''} aria-pressed={selectedFaces.includes(id)} onClick={() => moveToFace(selected, id)} title={FACE_META[id].hint}>{FACE_META[id].tile}</button>)}
        </div>
        <p className="tfe-help">{selectedFaces.length === 0 ? 'O borne está no interior. Escolha uma face para o fixar à superfície.' : selectedFaces.length > 1 ? 'Está numa aresta, por isso aparece nas duas faces.' : 'Escolha outra face para mudar o borne de superfície.'}</p>
        {selectedPoint && <div className="tfe-grid">
          <label className="tfe-field"><span>Da esquerda (mm)</span><input type="number" step={0.1} min={0} max={Math.round(detailSize.w * 10) / 10} value={Math.round(selectedPoint.u * detailSize.w * 10) / 10} onChange={(event) => setMm('u', Number(event.target.value))} /></label>
          <label className="tfe-field"><span>De cima (mm)</span><input type="number" step={0.1} min={0} max={Math.round(detailSize.h * 10) / 10} value={Math.round(selectedPoint.v * detailSize.h * 10) / 10} onChange={(event) => setMm('v', Number(event.target.value))} /></label>
        </div>}
      </div>

      <div className="tfe-block">
        <h4>Elétrico</h4>
        <div className="tfe-grid">
          <label className="tfe-field"><span>Função</span><Select value={selected.kind} onChange={(event) => setDefinition(selected.id, { kind: event.target.value as TerminalKind })}>{Object.entries(TERMINAL_KIND_LABEL).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</Select></label>
          <label className="tfe-field"><span>Tipo físico</span><Select value={selected.terminalType} onChange={(event) => setDefinition(selected.id, { terminalType: event.target.value as TerminalType })}>{Object.entries(TERMINAL_TYPE_LABEL).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</Select></label>
          <label className="tfe-field"><span>Categoria</span><Select value={selectedClass} onChange={(event) => setDefinition(selected.id, { electricalClass: event.target.value as TerminalElectricalClass, electricalClassCustom: event.target.value === 'other' ? selected.electricalClassCustom : undefined })}>{Object.entries(TERMINAL_ELECTRICAL_CLASS_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</Select><small>{selected.electricalClass ? 'Definida manualmente' : 'Sugerida pela ficha técnica'}</small></label>
          {selectedClass === 'other' && <label className="tfe-field"><span>Designação</span><input value={selected.electricalClassCustom ?? ''} placeholder="Ex.: PE, contacto seco" onChange={(event) => setDefinition(selected.id, { electricalClassCustom: event.target.value || undefined })} /></label>}
        </div>
        <p className="tfe-help">{terminalDatasheetGuidance(component)}</p>
      </div>

      <div className="tfe-block">
        <h4>Aparência</h4>
        <div className="tfe-appearance">
          <label className="tfe-field tfe-color"><span>Cor</span><input type="color" value={selected.color} onChange={(event) => setDefinition(selected.id, { color: event.target.value })} /></label>
          <label className="tfe-field tfe-range"><span>Diâmetro · {selected.diameter ? `${selected.diameter} px` : 'padrão'}</span><input type="range" min={3} max={24} step={0.5} value={selected.diameter ?? 9} onChange={(event) => setDiameter(Number(event.target.value), selected.id)} /></label>
          <div className="tfe-inline">
            <button type="button" onClick={() => setDiameter(selected.diameter ?? 9)} title="Aplicar este diâmetro a todos os bornes do componente">Todos</button>
            <button type="button" onClick={() => setDiameter(undefined, selected.id)} title="Voltar ao tamanho padrão">Padrão</button>
          </div>
        </div>
      </div>
    </section>}
  </div>
}
