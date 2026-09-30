import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSimStore } from '../store/useSimStore'
import { SymbolGlyph, ComponentTerminals, TerminalGlyph, WIRE_COLORS, terminalPos } from './symbols'
import { IconProbe, IconHelp, IconCube, IconSchematic } from '../ui/icons'
import type { ElectricalComponent, ComponentType, WireEndType } from '../types'
import { createComponent } from '../electrical/factory'
import { getLogo3DImages } from './logo3DImage'
import { getProauto3DImage } from './proauto3DImage'
import { getWeg3DImage } from './weg3DImage'
import { getCad3DImage } from './cad3DImage'
import { getComponentModelSpec, hasComponent3DModel, MIN_SCHEMATIC_HIT_WIDTH } from '../three/modelPaths'
import { componentOrientationOf, isOriginalComponentOrientation } from '../three/componentOrientation'
import { projectedComponentBounds } from './componentTerminalViews'
import { getOrientedComponentImage } from '../three/orientedComponentImage'
import ComponentViewEditor from '../components/ComponentViewEditor'
import { nearestTerminal, nearestModelTerminal } from './terminalSnap'
import { wireEndColor } from './wireEndColor'
import { wireGeometry, wireGeometryForWire, type Pt } from './wireGeometry'
import Panel3D from '../three/Panel3D'
import { wireEnergyEffectVisible } from '../three/panel3DEditing'

const SCHEMATIC_CANVAS_MODE_KEY = 'dc-simu:schematic-canvas-mode:v1'
type SchematicCanvasMode = '2d' | '3d'

/** O Esquema e o Painel usam o mesmo renderer físico no modo 3D: não há
 * cópia de componentes, bornes, cabos ou estado elétrico. */
export default function SchematicView({ libraryCollapsed = false }: { libraryCollapsed?: boolean }) {
  const placingType = useSimStore((state) => state.placingType)
  const [canvasMode, setCanvasMode] = useState<SchematicCanvasMode>(() => {
    try { return localStorage.getItem(SCHEMATIC_CANVAS_MODE_KEY) === '3d' ? '3d' : '2d' } catch { return '2d' }
  })
  const chooseMode = useCallback((mode: SchematicCanvasMode) => {
    setCanvasMode(mode)
    try { localStorage.setItem(SCHEMATIC_CANVAS_MODE_KEY, mode) } catch { /* preferência apenas visual */ }
  }, [])

  // A inserção por clique depende de coordenadas do desenho. Se o utilizador
  // escolher um item na Biblioteca durante a inspeção 3D, volta ao Canvas 2D
  // automaticamente para mostrar o fantasma e permitir posicioná-lo.
  useEffect(() => {
    if (placingType && canvasMode === '3d') chooseMode('2d')
  }, [placingType, canvasMode, chooseMode])

  return <div className="schematic-view-shell" data-canvas-mode={canvasMode}>
    {canvasMode === '3d' ? <Panel3D embedded /> : <Schematic2DView libraryCollapsed={libraryCollapsed} />}
    <div className="schematic-dimension-switch" role="group" aria-label="Dimensão de visualização do Canvas do Esquema">
      <button type="button" className={canvasMode === '2d' ? 'is-active' : ''} aria-pressed={canvasMode === '2d'} onClick={() => chooseMode('2d')} title="Editar o esquema, bornes e traçados em 2D">
        <IconSchematic size={13} />Esquema 2D
      </button>
      <button type="button" className={canvasMode === '3d' ? 'is-active' : ''} aria-pressed={canvasMode === '3d'} onClick={() => chooseMode('3d')} title="Visualizar os mesmos componentes, bornes e cabos em 3D">
        <IconCube size={13} />Visualização 3D
      </button>
      {canvasMode === '3d' && <span><i />Sincronizado</span>}
    </div>
  </div>
}

const CANVAS_W = 2000
const CANVAS_H = 1400

function pngDataAspect(dataUri?: string | null): number | null {
  if (!dataUri?.startsWith('data:image/png;base64,')) return null
  try {
    const raw = atob(dataUri.slice(dataUri.indexOf(',') + 1, dataUri.indexOf(',') + 1 + 40))
    if (raw.length < 24) return null
    const read32 = (offset: number) => ((raw.charCodeAt(offset) << 24) >>> 0) + (raw.charCodeAt(offset + 1) << 16) + (raw.charCodeAt(offset + 2) << 8) + raw.charCodeAt(offset + 3)
    const width = read32(16)
    const height = read32(20)
    return width > 0 && height > 0 ? width / height : null
  } catch {
    return null
  }
}

/** Direção unitária (terminal → interior do cabo) a partir da lista de pontos. */
function endDir(pts: Pt[], atStart: boolean): Pt {
  const list = atStart ? pts : [...pts].reverse()
  const p = list[0]
  const q = list.find((x, i) => i > 0 && Math.hypot(x.x - p.x, x.y - p.y) > 1) ?? list[list.length - 1]
  const len = Math.hypot(q.x - p.x, q.y - p.y) || 1
  return { x: (q.x - p.x) / len, y: (q.y - p.y) / len }
}

/** Desenho do terminal crimpado na ponta do cabo (ponteira, olhal, forquilha…). */
function WireEnd({ p, dir, type, color }: { p: Pt; dir: Pt; type: WireEndType; color: string }) {
  if (type === 'none') return null
  const ang = (Math.atan2(dir.y, dir.x) * 180) / Math.PI
  const metal = '#c3ccd8'
  const edge = '#6b7a90'
  let body: JSX.Element
  switch (type) {
    case 'ferrule':
      body = (
        <>
          <rect x={0} y={-2.2} width={8} height={4.4} rx={0.8} fill={metal} stroke={edge} strokeWidth={0.6} />
          <rect x={8} y={-3.4} width={5} height={6.8} rx={1.2} fill={color} stroke={edge} strokeWidth={0.5} />
        </>
      )
      break
    case 'ferruleDouble':
      body = (
        <>
          <rect x={0} y={-3.2} width={8} height={6.4} rx={0.8} fill={metal} stroke={edge} strokeWidth={0.6} />
          <line x1={0} y1={0} x2={8} y2={0} stroke={edge} strokeWidth={0.5} />
          <rect x={8} y={-4.6} width={6} height={9.2} rx={1.5} fill={color} stroke={edge} strokeWidth={0.5} />
        </>
      )
      break
    case 'ring':
      body = (
        <>
          <circle cx={0} cy={0} r={4.6} fill="none" stroke={metal} strokeWidth={2.4} />
          <circle cx={0} cy={0} r={4.6} fill="none" stroke={edge} strokeWidth={0.5} />
          <rect x={4.2} y={-2} width={6} height={4} fill={metal} stroke={edge} strokeWidth={0.5} />
          <rect x={10} y={-3} width={4} height={6} rx={1} fill={color} stroke={edge} strokeWidth={0.5} />
        </>
      )
      break
    case 'fork':
      body = (
        <>
          <path d="M -2 -4.5 L 4 -4.5 L 4 -1.4 L 1 -1.4 L 1 1.4 L 4 1.4 L 4 4.5 L -2 4.5 Z" fill={metal} stroke={edge} strokeWidth={0.5} />
          <rect x={4} y={-2} width={6} height={4} fill={metal} stroke={edge} strokeWidth={0.5} />
          <rect x={10} y={-3} width={4} height={6} rx={1} fill={color} stroke={edge} strokeWidth={0.5} />
        </>
      )
      break
    case 'pin':
      body = (
        <>
          <line x1={-2} y1={0} x2={8} y2={0} stroke={edge} strokeWidth={2.4} strokeLinecap="round" />
          <line x1={-2} y1={0} x2={8} y2={0} stroke={metal} strokeWidth={1.4} strokeLinecap="round" />
          <rect x={8} y={-3} width={5} height={6} rx={1.2} fill={color} stroke={edge} strokeWidth={0.5} />
        </>
      )
      break
    case 'faston':
      body = (
        <>
          <rect x={-1} y={-3} width={9} height={6} rx={0.6} fill={metal} stroke={edge} strokeWidth={0.6} />
          <line x1={1} y1={-1.2} x2={7} y2={-1.2} stroke={edge} strokeWidth={0.4} />
          <rect x={8} y={-3.6} width={5.5} height={7.2} rx={1.4} fill={color} stroke={edge} strokeWidth={0.5} />
        </>
      )
      break
    case 'tinned':
    default:
      body = <line x1={0} y1={0} x2={6} y2={0} stroke="#aeb8c6" strokeWidth={2.2} strokeLinecap="round" />
  }
  return (
    <g transform={`translate(${p.x},${p.y}) rotate(${ang})`} pointerEvents="none">
      {body}
    </g>
  )
}

/** Insere um ponto na posição correta da sequência (segmento mais próximo). */
function insertWaypoint(a: Pt, b: Pt, waypoints: Pt[], p: Pt): Pt[] {
  const pts = [a, ...waypoints, b]
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < pts.length - 1; i++) {
    const s = pts[i]
    const e = pts[i + 1]
    const dx = e.x - s.x
    const dy = e.y - s.y
    const lenSq = dx * dx + dy * dy || 1
    const t = Math.max(0, Math.min(1, ((p.x - s.x) * dx + (p.y - s.y) * dy) / lenSq))
    const qx = s.x + dx * t
    const qy = s.y + dy * t
    const dist = Math.hypot(p.x - qx, p.y - qy)
    if (dist < bestDist) {
      bestDist = dist
      best = i
    }
  }
  const next = [...waypoints]
  next.splice(best, 0, p)
  return next
}

/** Editor de esquema completo: malha, arraste, seleção, cabos, bornes, sonda. */
function Schematic2DView({ libraryCollapsed = false }: { libraryCollapsed?: boolean }) {
  const components = useSimStore((s) => s.components)
  const [logoImages, setLogoImages] = useState<{ off: string; on: string } | null>(null)
  const [proautoImage, setProautoImage] = useState<string | null>(null)
  const [wegImage, setWegImage] = useState<string | null>(null)
  const [cadImages, setCadImages] = useState<Partial<Record<ComponentType, string>>>({})
  const [orientedImages, setOrientedImages] = useState<Record<string, { requestKey: string; image: string }>>({})
  const [modelErrors, setModelErrors] = useState<Record<string, string>>({})
  const viewOrientationEditor = useSimStore((state) => state.viewOrientationEditor)
  const hasProauto = components.some((c) => c.type === 'powerSupplyProauto24A')
  useEffect(() => {
    if (!hasProauto) return
    let active = true
    setModelErrors((current) => { const next = { ...current }; delete next['type:powerSupplyProauto24A']; return next })
    getProauto3DImage().then((image) => { if (active) setProautoImage(image) }).catch((error) => {
      console.warn('Modelo da fonte indisponível', error)
      if (active) setModelErrors((current) => ({ ...current, 'type:powerSupplyProauto24A': 'Não foi possível gerar a vista 3D.' }))
    })
    return () => { active = false }
  }, [hasProauto])
  const hasWegContactor = components.some((c) => c.type === 'contactorWegCWC09')
  useEffect(() => {
    if (!hasWegContactor) return
    let active = true
    setModelErrors((current) => { const next = { ...current }; delete next['type:contactorWegCWC09']; return next })
    getWeg3DImage().then((image) => { if (active) setWegImage(image) }).catch((error) => {
      console.warn('Modelo do contator WEG indisponível', error)
      if (active) setModelErrors((current) => ({ ...current, 'type:contactorWegCWC09': 'Não foi possível gerar a vista 3D.' }))
    })
    return () => { active = false }
  }, [hasWegContactor])
  const hasLogo = components.some((c) => c.type === 'plcSiemensLogo1224RC')
  useEffect(() => {
    if (!hasLogo) return
    let active = true
    setModelErrors((current) => { const next = { ...current }; delete next['type:plcSiemensLogo1224RC']; return next })
    getLogo3DImages().then((images) => { if (active) setLogoImages(images) }).catch((error) => {
      console.warn('Modelo LOGO! indisponível', error)
      if (active) setModelErrors((current) => ({ ...current, 'type:plcSiemensLogo1224RC': 'Não foi possível gerar a vista 3D.' }))
    })
    return () => { active = false }
  }, [hasLogo])
  const dedicatedImageTypes: ComponentType[] = ['plcSiemensLogo1224RC', 'powerSupplyProauto24A', 'contactorWegCWC09']
  const cadTypesKey = [...new Set(components.map((c) => c.type).filter((type) => !!getComponentModelSpec(type) && !dedicatedImageTypes.includes(type)))].sort().join('|')
  useEffect(() => {
    const types = cadTypesKey ? cadTypesKey.split('|') as ComponentType[] : []
    if (!types.length) return
    let active = true
    types.forEach((type) => {
      setModelErrors((current) => { const next = { ...current }; delete next[`type:${type}`]; return next })
      getCad3DImage(type)
        .then((image) => { if (active) setCadImages((current) => ({ ...current, [type]: image })) })
        .catch((error) => {
          console.warn(`Modelo CAD ${type} indisponível no esquema`, error)
          if (active) setModelErrors((current) => ({ ...current, [`type:${type}`]: 'Não foi possível gerar a vista 3D.' }))
        })
    })
    return () => { active = false }
  }, [cadTypesKey])
  const orientedRequests = components.flatMap((component) => {
    if (!hasComponent3DModel(component.type)) return []
    const orientation = viewOrientationEditor?.componentId === component.id ? viewOrientationEditor.draft : componentOrientationOf(component)
    return isOriginalComponentOrientation(orientation) ? [] : [{ id: component.id, type: component.type, orientation }]
  })
  const orientedRequestsKey = orientedRequests.map(({ id, type, orientation }) => `${id}:${type}:${orientation.x}:${orientation.y}:${orientation.z}`).join('|')
  useEffect(() => {
    const activeIds = new Set(orientedRequests.map((request) => request.id))
    setOrientedImages((current) => Object.fromEntries(Object.entries(current).filter(([id]) => activeIds.has(id))))
    if (!orientedRequests.length) return
    let active = true
    const timer = window.setTimeout(() => {
      orientedRequests.forEach((request) => {
        const errorKey = `component:${request.id}:${request.type}:${request.orientation.x}:${request.orientation.y}:${request.orientation.z}`
        setModelErrors((current) => { const next = { ...current }; delete next[errorKey]; return next })
        getOrientedComponentImage(request.type, request.orientation)
          .then((image) => { if (active) setOrientedImages((current) => ({ ...current, [request.id]: { requestKey: `${request.type}:${request.orientation.x}:${request.orientation.y}:${request.orientation.z}`, image } })) })
          .catch((error) => {
            console.warn(`Não foi possível renderizar a vista personalizada de ${request.type}.`, error)
            if (active) setModelErrors((current) => ({ ...current, [errorKey]: 'Não foi possível gerar esta orientação 3D.' }))
          })
      })
    }, 70)
    return () => { active = false; window.clearTimeout(timer) }
    // A chave contém exclusivamente os dados visuais relevantes; alterações elétricas não recriam imagens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orientedRequestsKey])
  const showEmptyWelcome = useSimStore((s) => s.showEmptyWelcome)
  const wires = useSimStore((s) => s.wires)
  const simRunState = useSimStore((s) => s.sim.runState)
  const selectedIds = useSimStore((s) => s.selectedComponentIds)
  const selectedWireId = useSimStore((s) => s.selectedWireId)
  const selectedTerminalId = useSimStore((s) => s.selectedTerminalId)
  const tool = useSimStore((s) => s.tool)
  const gridDragEnabled = useSimStore((s) => s.gridDragEnabled)
  const grid = useSimStore((s) => s.grid)
  const zoom = useSimStore((s) => s.zoom)
  const panX = useSimStore((s) => s.panX)
  const panY = useSimStore((s) => s.panY)
  const probeResult = useSimStore((s) => s.probeResult)
  const placingType = useSimStore((s) => s.placingType)
  const setPlacingType = useSimStore((s) => s.setPlacingType)
  const dragType = useSimStore((s) => s.dragType)
  /** fantasma real do componente (clique-para-posicionar ou arraste da biblioteca) */
  const ghostType = dragType ?? placingType
  const ghost = useMemo(() => (ghostType ? createComponent(ghostType) : null), [ghostType])

  const {
    selectComponents,
    selectWire,
    selectTerminal,
    moveComponent,
    commitHistory,
    addWire,
    addFreeWire,
    pressButton,
    toggleTerminal,
    deleteSelection,
    rotateComponent,
    duplicateComponents,
    setZoom,
    setPan,
    runProbe,
    clearProbe,
    connectChain,
    organizeWires,
    updateWire,
    bringSelectionToFront,
    sendSelectionToBack,
    bringSelectionForward,
    sendSelectionBackward,
  } = useSimStore()

  const svgRef = useRef<SVGSVGElement>(null)
  const pinchRef = useRef<{ distance: number; zoom: number; worldX: number; worldY: number } | null>(null)
  const [drag, setDrag] = useState<{ ids: string[]; startX: number; startY: number; orig: Record<string, { x: number; y: number }>; committed?: boolean } | null>(null)
  const [wireFrom, setWireFrom] = useState<string | null>(null)
  const [freeStart, setFreeStart] = useState<Pt | null>(null)
  const [activeWireId, setActiveWireId] = useState<string | null>(null)
  const [draftPoints, setDraftPoints] = useState<Pt[]>([])
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [panning, setPanning] = useState<{ sx: number; sy: number; px: number; py: number } | null>(null)
  const [hoverTerminal, setHoverTerminal] = useState<string | null>(null)
  /** cadeia de bornes selecionados com shift+clique (ligação inteligente) */
  const [chain, setChain] = useState<string[]>([])
  /** arraste do ponto de dobra/curva/waypoint de um cabo diretamente no esquema */
  const [wireDrag, setWireDrag] = useState<{ wireId: string; mode: 'bend' | 'curve' | 'waypoint' | 'fromPoint' | 'toPoint'; index?: number; originalTerminalId?: string; start?: Pt } | null>(null)
  const [terminalViewDrag, setTerminalViewDrag] = useState<{ componentId: string; terminalId: string } | null>(null)
  const [dropPos, setDropPos] = useState<{ x: number; y: number } | null>(null)
  const [cursorPos, setCursorPos] = useState<Pt | null>(null)
  const [showHints, setShowHints] = useState(() => {
    try {
      const saved = localStorage.getItem('dc-simu:showHints')
      return saved === null ? !window.matchMedia('(max-width: 700px), (pointer: coarse)').matches : saved === '1'
    } catch {
      return true
    }
  })

  const toggleHints = () => {
    setShowHints((v) => {
      const next = !v
      try {
        localStorage.setItem('dc-simu:showHints', next ? '1' : '0')
      } catch {
        /* localStorage indisponível (modo privado, etc.) — ignora */
      }
      return next
    })
  }

  const displayComponents = useMemo(() => components.map((component) => viewOrientationEditor?.componentId === component.id ? {
    ...component,
    viewOrientation: viewOrientationEditor.draft,
    terminalViewPositions: viewOrientationEditor.terminalViewPositions,
    terminals: viewOrientationEditor.terminals,
    view3DScale: viewOrientationEditor.scale3D,
    view3DRenderMode: viewOrientationEditor.renderMode3D,
    bodyColor: viewOrientationEditor.bodyColor3D,
  } : component), [components, viewOrientationEditor])

  const terminalIndex = useMemo(() => {
    const map = new Map<string, { c: ElectricalComponent; x: number; y: number; label: string; color: string; energized: boolean }>()
    for (const c of displayComponents) {
      for (const t of c.terminals) {
        const p = terminalPos(c, t)
        map.set(t.id, { c, x: p.x, y: p.y, label: `${c.ref}.${t.displayName || t.label}`, color: t.color, energized: t.energized })
      }
    }
    return map
  }, [displayComponents])

  useEffect(() => {
    if (tool !== 'wire' || gridDragEnabled) { setChain([]); setWireFrom(null); setFreeStart(null); setDraftPoints([]); setActiveWireId(null) }
  }, [tool, gridDragEnabled])

  const snap = (v: number) => (grid.snap ? Math.round(v / grid.size) * grid.size : v)

  const toCanvas = (clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    return {
      x: (clientX - rect.left - panX) / zoom,
      y: (clientY - rect.top - panY) / zoom,
    }
  }

  /** Enquadra todo o conteúdo sem alterar posições, ligações ou dados elétricos. */
  const fitContent = useCallback(() => {
    const svg = svgRef.current
    if (!svg) return
    const points: Pt[] = []
    components.forEach((component) => {
      points.push(
        { x: component.schematicX, y: component.schematicY },
        { x: component.schematicX + component.w, y: component.schematicY + component.h },
      )
    })
    wires.forEach((wire) => {
      if (wire.fromPoint) points.push(wire.fromPoint)
      if (wire.toPoint) points.push(wire.toPoint)
      points.push(...(wire.waypoints ?? []))
    })
    if (!points.length) {
      setZoom(1)
      setPan(0, 0)
      return
    }
    const minX = Math.min(...points.map((point) => point.x))
    const minY = Math.min(...points.map((point) => point.y))
    const maxX = Math.max(...points.map((point) => point.x))
    const maxY = Math.max(...points.map((point) => point.y))
    const contentWidth = Math.max(80, maxX - minX)
    const contentHeight = Math.max(80, maxY - minY)
    const margin = 72
    const nextZoom = Math.max(0.25, Math.min(2.5, Math.min(
      svg.clientWidth / (contentWidth + margin * 2),
      svg.clientHeight / (contentHeight + margin * 2),
    )))
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    setZoom(nextZoom)
    setPan(svg.clientWidth / 2 - centerX * nextZoom, svg.clientHeight / 2 - centerY * nextZoom)
  }, [components, wires, setPan, setZoom])

  // ---------------------------------------------------------------- teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setWireFrom(null)
        setFreeStart(null)
        setDraftPoints([])
        setActiveWireId(null)
        setChain([])
        useSimStore.getState().setGridDragEnabled(false)
        useSimStore.getState().setPlacingType(null)
        selectComponents([])
        clearProbe()
        return
      }
      const target = e.target as HTMLElement
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return
      if (e.key === 'Home' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        fitContent()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        deleteSelection()
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'r' && selectedIds.length === 1) {
        rotateComponent(selectedIds[0])
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'd' && selectedIds.length) {
        duplicateComponents(selectedIds)
      } else if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        useSimStore.getState().undo()
      } else if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        useSimStore.getState().redo()
      } else if (e.ctrlKey && e.key === ']') {
        e.preventDefault()
        if (e.shiftKey) bringSelectionToFront()
        else bringSelectionForward()
      } else if (e.ctrlKey && e.key === '[') {
        e.preventDefault()
        if (e.shiftKey) sendSelectionToBack()
        else sendSelectionBackward()
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === '1') useSimStore.getState().setTool('select')
      else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === '2') useSimStore.getState().setTool('wire')
      else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === '3') useSimStore.getState().setTool('probe')
      else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === '4') useSimStore.getState().setTool('erase')
      else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === '5') useSimStore.getState().setTool('pan')
      else if (e.ctrlKey && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        selectComponents(components.map((c) => c.id))
      } else if (e.ctrlKey && e.key.toLowerCase() === 'c') {
        useSimStore.getState().copySelection()
      } else if (e.ctrlKey && e.key.toLowerCase() === 'v') {
        e.preventDefault()
        useSimStore.getState().pasteClipboard()
      } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') && selectedIds.length) {
        // move o(s) componente(s) selecionado(s): 1px, ou o passo da malha com Shift
        e.preventDefault()
        const step = e.shiftKey ? grid.size : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        const ids = new Set(selectedIds)
        commitHistory()
        useSimStore.setState((s) => ({
          components: s.components.map((c) => (ids.has(c.id) ? { ...c, schematicX: c.schematicX + dx, schematicY: c.schematicY + dy } : c)),
          dirty: true,
        }))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    selectedIds,
    deleteSelection,
    rotateComponent,
    duplicateComponents,
    selectComponents,
    clearProbe,
    bringSelectionToFront,
    sendSelectionToBack,
    bringSelectionForward,
    sendSelectionBackward,
    components,
    grid,
    commitHistory,
    fitContent,
  ])

  // --------------------------------------------------------------- mouse
  const onBackgroundDown = (e: React.MouseEvent) => {
    if (gridDragEnabled) {
      if (e.button === 0 || e.button === 1) setPanning({ sx: e.clientX, sy: e.clientY, px: panX, py: panY })
      return
    }
    // modo "posicionar componente": clique esquerdo posiciona (Shift = vários),
    // clique direito ou Esc cancela
    if (placingType) {
      if (!hasComponent3DModel(placingType)) {
        setPlacingType(null)
        return
      }
      if (e.button === 2) {
        e.preventDefault()
        setPlacingType(null)
        return
      }
      if (e.button === 0) {
        const p = toCanvas(e.clientX, e.clientY)
        const g = ghost ?? { w: 80, h: 80 }
        useSimStore.getState().addComponent(placingType, snap(p.x - g.w / 2), snap(p.y - g.h / 2))
        if (!e.shiftKey) setPlacingType(null)
        return
      }
    }
    if (e.button === 1 || tool === 'pan' || e.altKey) {
      setPanning({ sx: e.clientX, sy: e.clientY, px: panX, py: panY })
      return
    }
    if (e.button === 2 && tool === 'wire') return
    if (tool === 'select') {
      const p = toCanvas(e.clientX, e.clientY)
      setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
      if (!e.shiftKey) selectComponents([])
    }
    if (tool === 'wire' && e.button === 0) {
      const p = toCanvas(e.clientX, e.clientY)
      // Testar proximidade ANTES de encaixar à malha: o parafuso pode estar
      // entre pontos de grelha e nunca deve ser aproximado a 20px.
      const close = nearestTerminal(components, p, 16 / zoom, wireFrom ?? undefined)
        ?? nearestModelTerminal(components, p, wireFrom ?? undefined, Math.min(24, 28 / zoom))
      if (close) { onTerminalDown(e, close.id); setCursorPos(close.point); return }
      const point = { x: snap(p.x), y: snap(p.y) }
      if (wireFrom || freeStart) {
        // Cada clique prolonga o mesmo cabo; Esc apenas termina o traçado.
        // A extremidade anterior torna-se waypoint, mantendo um único cabo
        // e a continuidade elétrica quando a outra ponta chegar a um borne.
        if (activeWireId && freeStart) {
          const current = useSimStore.getState().wires.find((w) => w.id === activeWireId)
          if (current && Math.hypot(freeStart.x - point.x, freeStart.y - point.y) >= 5) {
            commitHistory()
            updateWire(activeWireId, { toPoint: point, waypoints: [...(current.waypoints ?? []), ...draftPoints, freeStart] })
            setFreeStart(point)
            setDraftPoints([])
          }
        } else if (wireFrom) {
          addFreeWire({ terminalId: wireFrom }, { point }, draftPoints)
          setActiveWireId(useSimStore.getState().wires.slice(-1)[0]?.id ?? null)
          setWireFrom(null)
          setFreeStart(point)
          setDraftPoints([])
        } else if (freeStart && Math.hypot(freeStart.x - point.x, freeStart.y - point.y) >= 5) {
          addFreeWire({ point: freeStart }, { point }, draftPoints)
          setActiveWireId(useSimStore.getState().wires.slice(-1)[0]?.id ?? null)
          setFreeStart(point)
          setDraftPoints([])
        }
      } else setFreeStart(point)
      setCursorPos(point)
    }
    if (tool === 'probe') clearProbe()
  }

  const onMouseMove = (e: React.MouseEvent) => {
    if (panning) {
      setPan(panning.px + e.clientX - panning.sx, panning.py + e.clientY - panning.sy)
      return
    }
    const p = toCanvas(e.clientX, e.clientY)
    if (terminalViewDrag) {
      const component = components.find((item) => item.id === terminalViewDrag.componentId)
      if (!component) return
      const cx = component.w / 2
      const cy = component.h / 2
      const angle = (-component.rotation * Math.PI) / 180
      const dx = p.x - component.schematicX - cx
      const dy = p.y - component.schematicY - cy
      let localX = dx * Math.cos(angle) - dy * Math.sin(angle) + cx
      const localY = dx * Math.sin(angle) + dy * Math.cos(angle) + cy
      if (component.mirrored) localX = component.w - localX
      useSimStore.getState().setViewTerminalPosition(terminalViewDrag.terminalId, {
        x: Math.max(-0.5, Math.min(1.5, localX / component.w)),
        y: Math.max(-0.5, Math.min(1.5, localY / component.h)),
      })
      return
    }
    if (wireDrag) {
      const w = wires.find((x) => x.id === wireDrag.wireId)
      if (w && (wireDrag.mode === 'fromPoint' || wireDrag.mode === 'toPoint')) {
        if (wireDrag.start && Math.hypot(p.x - wireDrag.start.x, p.y - wireDrag.start.y) < 3 / zoom) return
        updateWire(w.id, { [wireDrag.mode]: { x: snap(p.x), y: snap(p.y) } })
        return
      }
      const a = w && terminalIndex.get(w.fromTerminalId)
      const b = w && terminalIndex.get(w.toTerminalId)
      if (w && wireDrag.mode === 'waypoint' && wireDrag.index !== undefined) {
        const next = [...(w.waypoints ?? [])]
        next[wireDrag.index] = { x: snap(p.x), y: snap(p.y) }
        updateWire(w.id, { waypoints: next })
        return
      }
      if (w && a && b) {
        const dx = b.x - a.x
        const dy = b.y - a.y
        const lenSq = dx * dx + dy * dy || 1
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
        if (wireDrag.mode === 'bend') {
          updateWire(w.id, { bend: t })
        } else {
          const len = Math.sqrt(lenSq)
          const nx = -dy / len
          const ny = dx / len
          const px = a.x + dx * t
          const py = a.y + dy * t
          const offset = (p.x - px) * nx + (p.y - py) * ny
          updateWire(w.id, { bend: t, curveOffset: offset })
        }
      }
      return
    }
    if (drag) {
      const dx = p.x - drag.startX
      const dy = p.y - drag.startY
      // Só entra no histórico se houver movimento real, e ANTES de alterar
      // (o Desfazer volta assim à posição original).
      if (!drag.committed) {
        if (Math.hypot(dx, dy) < 2 / zoom) return
        commitHistory()
        drag.committed = true // mutação intencional: evita um 2.º commit antes do re-render
      }
      for (const id of drag.ids) {
        const o = drag.orig[id]
        if (o) moveComponent(id, snap(o.x + dx), snap(o.y + dy))
      }
    }
    if (marquee) setMarquee({ ...marquee, x1: p.x, y1: p.y })
    if ((tool === 'wire' && (wireFrom || freeStart)) || placingType) setCursorPos(p)
  }

  const onMouseUp = (e?: React.MouseEvent) => {
    setTerminalViewDrag(null)
    if (wireDrag && (wireDrag.mode === 'fromPoint' || wireDrag.mode === 'toPoint') && e) {
      const w = useSimStore.getState().wires.find((item) => item.id === wireDrag.wireId)
      const p = toCanvas(e.clientX, e.clientY)
      const target = nearestTerminal(components, p, 16 / zoom, wireDrag.mode === 'fromPoint' ? w?.toTerminalId : w?.fromTerminalId)
        ?? nearestModelTerminal(components, p, wireDrag.mode === 'fromPoint' ? w?.toTerminalId : w?.fromTerminalId, Math.min(24, 28 / zoom))
      if (w && target) {
        const isFrom = wireDrag.mode === 'fromPoint'
        updateWire(w.id, isFrom ? { fromTerminalId: target.id, fromPoint: undefined } : { toTerminalId: target.id, toPoint: undefined })
        useSimStore.getState().step()
      } else if (w && wireDrag.originalTerminalId && wireDrag.start && Math.hypot(p.x - wireDrag.start.x, p.y - wireDrag.start.y) < 3 / zoom) {
        // Um clique sem deslocação não desliga o borne.
        updateWire(w.id, wireDrag.mode === 'fromPoint' ? { fromTerminalId: wireDrag.originalTerminalId, fromPoint: undefined } : { toTerminalId: wireDrag.originalTerminalId, toPoint: undefined })
      }
    }
    setWireDrag(null)
    if (marquee) {
      const x0 = Math.min(marquee.x0, marquee.x1)
      const x1 = Math.max(marquee.x0, marquee.x1)
      const y0 = Math.min(marquee.y0, marquee.y1)
      const y1 = Math.max(marquee.y0, marquee.y1)
      const hit = components.filter((c) => c.schematicX < x1 && c.schematicX + c.w > x0 && c.schematicY < y1 && c.schematicY + c.h > y0)
      if (hit.length) selectComponents(hit.map((c) => c.id))
    }
    setDrag(null)
    setMarquee(null)
    setPanning(null)
  }

  const onTouchStart = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length !== 2) return
    e.preventDefault()
    const [a, b] = [e.touches[0], e.touches[1]]
    const centerX = (a.clientX + b.clientX) / 2
    const centerY = (a.clientY + b.clientY) / 2
    const world = toCanvas(centerX, centerY)
    pinchRef.current = { distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), zoom, worldX: world.x, worldY: world.y }
  }
  const onTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length !== 2 || !pinchRef.current || !svgRef.current) return
    e.preventDefault()
    const [a, b] = [e.touches[0], e.touches[1]]
    const original = pinchRef.current
    const nextZoom = Math.min(3, Math.max(0.25, original.zoom * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / Math.max(1, original.distance)))
    const rect = svgRef.current.getBoundingClientRect()
    setZoom(nextZoom)
    setPan((a.clientX + b.clientX) / 2 - rect.left - original.worldX * nextZoom, (a.clientY + b.clientY) / 2 - rect.top - original.worldY * nextZoom)
  }

  const onCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDropPos(null)
    const compType = (e.dataTransfer.getData('application/dc-simu-component') || e.dataTransfer.getData('application/x-dcsimu-component') || e.dataTransfer.getData('text/plain')) as ComponentType
    useSimStore.getState().setDragType(null)
    setCursorPos(null)
    if (!compType || compType.includes(':') || !hasComponent3DModel(compType)) return
    const p = toCanvas(e.clientX, e.clientY)
    const g = createComponent(compType)
    selectWire(null)
    selectTerminal(null)
    selectComponents([])
    useSimStore.getState().addComponent(compType, snap(p.x - g.w / 2), snap(p.y - g.h / 2))
  }

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    if (e.ctrlKey) setZoom(zoom * factor)
    else setPan(panX - e.deltaX, panY - e.deltaY)
  }

  const startDrag = (e: React.MouseEvent, c: ElectricalComponent) => {
    if (tool !== 'select') return
    e.stopPropagation()
    const p = toCanvas(e.clientX, e.clientY)
    const ids = selectedIds.includes(c.id) ? selectedIds : [c.id]
    if (!selectedIds.includes(c.id)) selectComponents(ids, e.shiftKey)
    const orig: Record<string, { x: number; y: number }> = {}
    for (const id of ids) {
      const comp = components.find((x) => x.id === id)
      if (comp && !comp.locked) orig[id] = { x: comp.schematicX, y: comp.schematicY }
    }
    if (Object.keys(orig).length) setDrag({ ids: Object.keys(orig), startX: p.x, startY: p.y, orig })
  }

  const isPressable = (c: ElectricalComponent) =>
    ['buttonNO', 'buttonNC', 'dualPushButtonNpb22D11', 'emergencyButton', 'emergencyButtonKeyP20ACR', 'selector2', 'selector3', 'keySwitch', 'footSwitch', 'limitSwitch', 'proximitySensor', 'photoSensor', 'pressureSwitch', 'thermostat'].includes(c.type)

  const toggleField = (c: ElectricalComponent, down: boolean) => {
    if (!isPressable(c)) return
    if (c.type === 'proximitySensor' || c.type === 'photoSensor' || c.type === 'pressureSwitch' || c.type === 'thermostat') {
      useSimStore.getState().setComponentState(c.id, { triggered: down })
    } else if (c.type === 'dualPushButtonNpb22D11') {
      useSimStore.getState().setComponentState(c.id, { startPressed: down })
    } else if (c.state.maintain) {
      useSimStore.getState().setComponentState(c.id, { pressed: !c.state.pressed })
    } else {
      pressButton(c.id, down)
    }
  }

  const onTerminalDown = (e: React.MouseEvent, terminalId: string) => {
    e.stopPropagation()
    if (tool === 'wire') {
      if (e.button !== 0) return
      // Shift+clique acumula bornes numa cadeia para ligação inteligente:
      // ao confirmar, todos são interligados em sequência e o roteamento já
      // sai organizado (sem sobreposição).
      if (e.shiftKey) {
        setChain((c) => (c.includes(terminalId) ? c.filter((id) => id !== terminalId) : [...c, terminalId]))
        return
      }
      if (freeStart) {
        if (activeWireId) {
          const current = useSimStore.getState().wires.find((w) => w.id === activeWireId)
          if (current) {
            commitHistory()
            updateWire(activeWireId, { toTerminalId: terminalId, toPoint: undefined, waypoints: [...(current.waypoints ?? []), ...draftPoints] })
          }
        } else addFreeWire({ point: freeStart }, { terminalId }, draftPoints)
        setActiveWireId(null)
        setFreeStart(null)
        setWireFrom(terminalId)
        setDraftPoints([])
      } else if (!wireFrom) {
        setWireFrom(terminalId)
      } else if (wireFrom !== terminalId) {
        addWire(wireFrom, terminalId, undefined, draftPoints)
        setWireFrom(terminalId)
        setDraftPoints([])
      }
      return
    }
    if (tool === 'probe') {
      selectTerminal(terminalId)
      runProbe()
      return
    }
    if (tool === 'erase') {
      selectTerminal(terminalId)
      deleteSelection()
      return
    }
    // seleção simples: duplo clique alterna estado de proteção
    selectTerminal(terminalId)
  }

  const pendingFrom = wireFrom ? terminalIndex.get(wireFrom) : freeStart

  // ---------------------------------------------------------- ordem (camadas)
  // Cabos e componentes compartilham o mesmo espaço de empilhamento (campo `z`,
  // padrão 0); em caso de empate mantém a ordem original (cabos, depois
  // componentes) para reproduzir o comportamento clássico quando ninguém
  // nunca mexeu na ordem.
  type DrawEntry = { kind: 'wire'; wire: (typeof wires)[number] } | { kind: 'component'; comp: ElectricalComponent }
  const drawOrder = useMemo(() => {
    const entries: (DrawEntry & { z: number; idx: number })[] = []
    wires.forEach((w, i) => entries.push({ kind: 'wire', wire: w, z: w.z ?? 0, idx: i }))
    displayComponents.forEach((c, i) => entries.push({ kind: 'component', comp: c, z: c.z ?? 0, idx: i + wires.length }))
    entries.sort((a, b) => a.z - b.z || a.idx - b.idx)
    return entries
  }, [wires, displayComponents])

  // Nos modelos reais o centro do parafuso fica dentro da fotografia.
  // Sair perpendicularmente do corpo antes do primeiro cotovelo evita que
  // o troço visível pare desalinhado na borda da imagem.
  const modelLead = (terminalId: string): Pt | null => {
    const t = terminalIndex.get(terminalId)
    if (!t || (!getComponentModelSpec(t.c.type) && !['plcSiemensLogo1224RC', 'powerSupplyProauto24A', 'contactorWegCWC09'].includes(t.c.type))) return null
    const c = t.c
    const bounds = modelBounds(c)
    const rotated = Math.abs(c.rotation % 180) === 90
    const cx = c.schematicX + c.w / 2
    const cy = c.schematicY + c.h / 2
    const halfW = (rotated ? bounds.h : bounds.w) / 2
    const halfH = (rotated ? bounds.w : bounds.h) / 2
    const distances = [
      { distance: Math.abs(t.y - (cy - halfH)), point: { x: t.x, y: cy - halfH - 8 } },
      { distance: Math.abs(t.y - (cy + halfH)), point: { x: t.x, y: cy + halfH + 8 } },
      { distance: Math.abs(t.x - (cx - halfW)), point: { x: cx - halfW - 8, y: t.y } },
      { distance: Math.abs(t.x - (cx + halfW)), point: { x: cx + halfW + 8, y: t.y } },
    ]
    return distances.reduce((best, item) => item.distance < best.distance ? item : best).point
  }

  const wireDisplay = (w: (typeof wires)[number]) => {
    const a = w.fromPoint ?? terminalIndex.get(w.fromTerminalId)
    const b = w.toPoint ?? terminalIndex.get(w.toTerminalId)
    if (!a || !b) return null
    const fromLead = w.fromPoint ? null : modelLead(w.fromTerminalId)
    const toLead = w.toPoint ? null : modelLead(w.toTerminalId)
    const points = [...(fromLead ? [fromLead] : []), ...(w.waypoints ?? []), ...(toLead ? [toLead] : [])]
    const geometry = wireGeometryForWire(w, a, b, points.length ? points : undefined)
    return { a, b, fromLead, toLead, geometry }
  }

  const renderWireEl = (w: (typeof wires)[number]) => {
    const display = wireDisplay(w)
    if (!display) return null
    const { a, b } = display
    const col = WIRE_COLORS[w.color] ?? '#94a3b8'
    const flexible = w.flexibility === 'flexible'
    const selected = selectedWireId === w.id
    const { d, handle } = display.geometry
    const width = Math.min(4.4, 1.2 + Math.sqrt(parseFloat(w.gauge) || 1.5) * 0.95)
    const cap = 'square'
    const join = 'miter'
    const showEnergyFlow = wireEnergyEffectVisible(simRunState, w.energized)
    const addPoint = (e: React.MouseEvent) => {
      // duplo clique no cabo = adiciona um ponto de curva arrastável
      e.stopPropagation()
      const point = toCanvas(e.clientX, e.clientY)
      const p = { x: snap(point.x), y: snap(point.y) }
      commitHistory()
      updateWire(w.id, { waypoints: insertWaypoint(a, b, w.waypoints ?? [], p) })
      selectWire(w.id)
    }
    return (
      <g key={w.id}>
        {/* halo de seleção e brilho de energia por BAIXO — a cor do cabo fica sempre visível */}
        {selected && <g pointerEvents="none" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d={d} stroke="#2f6bff" strokeWidth={width + 14} opacity={0.10} />
          <path d={d} stroke="#3b82f6" strokeWidth={width + 9} opacity={0.18} />
          <path d={d} stroke="#60a5fa" strokeWidth={width + 4} opacity={0.42} />
        </g>}
        {showEnergyFlow && <path d={d} fill="none" stroke="#fbbf24" strokeWidth={width + 6} opacity={0.35} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />}
        {/* contorno escuro fino: dá leitura a cores claras (branco, amarelo, azul-claro) */}
        <path d={d} fill="none" stroke="#1e293b" strokeOpacity={0.35} strokeWidth={width + 1.4} strokeLinecap={cap} strokeLinejoin={join} pointerEvents="none" />
        <path d={d} fill="none" stroke={col} strokeWidth={width} strokeLinecap={cap} strokeLinejoin={join} pointerEvents="none" />
        {/* O acabamento do fio é igual para rígido e flexível. */}
        <path d={d} fill="none" stroke="#ffffff" strokeOpacity={0.2} strokeWidth={Math.max(0.6, width * 0.26)} strokeLinecap="butt" strokeLinejoin="miter" pointerEvents="none" />
        {showEnergyFlow && <path d={d} fill="none" stroke="#fde047" strokeWidth={Math.max(1, width * 0.45)} strokeDasharray="4 10" className="dc-flow" strokeLinecap="round" pointerEvents="none" />}
        {/* área de clique larga (clique seleciona · duplo clique adiciona ponto de curva) */}
        <path
          d={d}
          fill="none"
          stroke="transparent"
          strokeWidth={Math.max(12, width + 10)}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ cursor: 'pointer' }}
          onMouseDown={(e) => {
            if (tool === 'pan' || e.button !== 0 || tool === 'wire') return
            e.stopPropagation()
            if (tool === 'erase') {
              useSimStore.getState().deleteWire(w.id)
              return
            }
            selectWire(w.id)
          }}
          onDoubleClick={addPoint}
        >
          <title>{`Cabo ${w.number ?? ''} · ${w.gauge} · ${flexible ? 'flexível' : 'rígido'} · ${w.color} — clique = editar · duplo clique = adicionar ponto de curva`}</title>
        </path>
        <circle cx={a.x} cy={a.y} r={3.4} fill="white" stroke={col} strokeWidth={1.5} pointerEvents="none" />
        <circle cx={b.x} cy={b.y} r={3.4} fill="white" stroke={col} strokeWidth={1.5} pointerEvents="none" />
        {w.fromPoint && !selected && <circle cx={a.x} cy={a.y} r={5} fill="white" stroke={col} strokeWidth={2} pointerEvents="none" />}
        {w.toPoint && !selected && <circle cx={b.x} cy={b.y} r={5} fill="white" stroke={col} strokeWidth={2} pointerEvents="none" />}
        {/* pontos de curva do cabo — visíveis quando selecionado */}
        {selected &&
          (w.waypoints ?? []).map((wp, i) => (
            <circle
              key={`${w.id}-wp-${i}`}
              cx={wp.x}
              cy={wp.y}
              r={5.5}
              fill="#ffffff"
              stroke="#2f6bff"
              strokeWidth={2}
              style={{ cursor: 'grab' }}
              onMouseDown={(e) => {
                e.stopPropagation()
                commitHistory()
                setWireDrag({ wireId: w.id, mode: 'waypoint', index: i })
              }}
              onDoubleClick={(e) => {
                // duplo clique no ponto = remove
                e.stopPropagation()
                commitHistory()
                const next = (w.waypoints ?? []).filter((_, j) => j !== i)
                updateWire(w.id, { waypoints: next.length ? next : undefined })
              }}
            >
              <title>Arraste para mover · duplo clique remove o ponto</title>
            </circle>
          ))}
        {selected && handle && (
          <circle
            cx={handle.x}
            cy={handle.y}
            r={6}
            fill="#ffffff"
            stroke="#2f6bff"
            strokeWidth={2}
            style={{ cursor: handle.mode === 'curve' ? 'grab' : 'ew-resize' }}
            onMouseDown={(e) => {
              e.stopPropagation()
              commitHistory()
              setWireDrag({ wireId: w.id, mode: handle.mode })
            }}
          >
            <title>Arraste para {handle.mode === 'curve' ? 'curvar' : 'dobrar'} o cabo</title>
          </circle>
        )}
      </g>
    )
  }

  const modelBounds = (c: ElectricalComponent, model?: string | null) => {
    if (!hasComponent3DModel(c.type)) return { x: 0, y: 0, w: c.w, h: c.h }
    const orientation = componentOrientationOf(c)
    if (isOriginalComponentOrientation(orientation)) return { x: 0, y: 0, w: c.w, h: c.h }
    const projected = projectedComponentBounds(c, orientation)
    const aspect = pngDataAspect(model)
    let raster = projected
    if (aspect) {
      const baseAspect = c.w / Math.max(1, c.h)
      const w = aspect >= baseAspect ? c.h * aspect : c.w
      const h = aspect >= baseAspect ? c.h : c.w / aspect
      raster = { x: (c.w - w) / 2, y: (c.h - h) / 2, w, h }
    }
    const x = Math.min(projected.x, raster.x)
    const y = Math.min(projected.y, raster.y)
    const right = Math.max(projected.x + projected.w, raster.x + raster.w)
    const bottom = Math.max(projected.y + projected.h, raster.y + raster.h)
    return { x, y, w: right - x, h: bottom - y }
  }

  const renderWireEnds = (layer: 'back' | 'front') => wires.flatMap((w) => {
    const display = wireDisplay(w)
    if (!display) return []
    const color = WIRE_COLORS[w.color] ?? '#94a3b8'
    const width = Math.min(4.4, 1.2 + Math.sqrt(parseFloat(w.gauge) || 1.5) * 0.95)
    return (['from', 'to'] as const).map((side) => {
      const endLayer = (side === 'from' ? w.fromEndLayer : w.toEndLayer) ?? 'back'
      if (endLayer !== layer) return null
      const point = side === 'from' ? display.a : display.b
      const lead = side === 'from' ? display.fromLead : display.toLead
      const type = (side === 'from' ? w.fromEndType : w.toEndType) ?? w.endType ?? 'none'
      const dir = endDir(display.geometry.pts, side === 'from')
      const attached = side === 'from' ? !w.fromPoint : !w.toPoint
      const terminalColor = attached ? terminalIndex.get(side === 'from' ? w.fromTerminalId : w.toTerminalId)?.color : undefined
      const endColor = wireEndColor(w, side, terminalColor)
      return <g key={`${w.id}-${side}-${layer}`} pointerEvents="none">
        {layer === 'front' && lead && <>
          <path d={`M ${point.x},${point.y} L ${lead.x},${lead.y}`} fill="none" stroke="#1e293b" strokeOpacity={0.35} strokeWidth={width + 1.4} />
          <path d={`M ${point.x},${point.y} L ${lead.x},${lead.y}`} fill="none" stroke={color} strokeWidth={width} />
        </>}
        <WireEnd p={point} dir={dir} type={type} color={endColor} />
        {type === 'none' && <circle cx={point.x} cy={point.y} r={2.7} fill={endColor} stroke="white" strokeWidth={0.8} />}
      </g>
    })
  })

  const renderComponentEl = (c: ElectricalComponent) => {
    const selected = selectedIds.includes(c.id)
    const cadImage = cadImages[c.type]
    const baseModelImage = c.type === 'plcSiemensLogo1224RC' ? (logoImages ? (c.state.powered ? logoImages.on : logoImages.off) : null)
      : c.type === 'powerSupplyProauto24A' ? proautoImage
        : c.type === 'contactorWegCWC09' ? wegImage
          : cadImage
    const orientation = componentOrientationOf(c)
    const needsOrientedImage = !isOriginalComponentOrientation(orientation)
    const orientedRequestKey = `${c.type}:${orientation.x}:${orientation.y}:${orientation.z}`
    const orientedImage = orientedImages[c.id]
    // Nunca apresentar a orientação base, uma captura antiga ou o símbolo SVG
    // enquanto a vista correta ainda está a ser gerada.
    const model = needsOrientedImage && orientedImage?.requestKey === orientedRequestKey ? orientedImage.image : needsOrientedImage ? null : baseModelImage
    const modelError = modelErrors[needsOrientedImage ? `component:${c.id}:${orientedRequestKey}` : `type:${c.type}`]
    const imageBounds = modelBounds(c, model)
    const hitWidth = Math.max(imageBounds.w, MIN_SCHEMATIC_HIT_WIDTH)
    const bounds = { ...imageBounds, x: imageBounds.x - (hitWidth - imageBounds.w) / 2, w: hitWidth }
    return (
      <g
        key={c.id}
        transform={`translate(${c.schematicX},${c.schematicY}) rotate(${c.rotation},${c.w / 2},${c.h / 2}) ${c.mirrored ? `translate(${c.w},0) scale(-1,1)` : ''}`}
        onMouseDown={(e) => startDrag(e, c)}
        onDoubleClick={(e) => {
          e.stopPropagation()
          toggleField(c, true)
        }}
        filter={selected ? 'url(#dc-select-glow)' : undefined}
        style={{ cursor: c.locked ? 'not-allowed' : tool === 'select' ? (drag ? 'grabbing' : 'grab') : 'inherit', opacity: c.locked ? 0.85 : 1 }}
      >
        {c.type === 'contactorWegCWC09' && model ? (
          <>
            {/* vista do mesmo GLB usado no Painel 3D — não é um SVG */}
            <image x={imageBounds.x} y={imageBounds.y} width={imageBounds.w} height={imageBounds.h} href={model} preserveAspectRatio="xMidYMid meet" pointerEvents="none" />
            <rect x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h} fill="transparent" />
            <ComponentTerminals c={c} />
            <text x={c.w / 2} y={imageBounds.y + imageBounds.h + 14} textAnchor="middle" fontSize={11} fill="#334155" pointerEvents="none">{c.ref}</text>
          </>
        ) : c.type === 'powerSupplyProauto24A' && model ? (
          <>
            <image x={imageBounds.x} y={imageBounds.y} width={imageBounds.w} height={imageBounds.h} href={model} preserveAspectRatio="xMidYMid meet" pointerEvents="none" />
            <rect x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h} fill="transparent" />
            <ComponentTerminals c={c} />
            <text x={c.w / 2} y={imageBounds.y + imageBounds.h + 14} textAnchor="middle" fontSize={11} fill="#334155" pointerEvents="none">{c.ref}</text>
          </>
        ) : c.type === 'plcSiemensLogo1224RC' && model ? (
          <>
            <image x={imageBounds.x} y={imageBounds.y} width={imageBounds.w} height={imageBounds.h} href={model} preserveAspectRatio="xMidYMid meet" pointerEvents="none" />
            {/* Alvos de seleção e bornes mantêm-se nas coordenadas reais do esquema. */}
            <rect x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h} fill="transparent" />
            <ComponentTerminals c={c} />
            {/* Zonas dos botões do modelo: continuam operacionais na vista frontal. */}
            {isOriginalComponentOrientation(orientation) && (['up', 'down', 'left', 'right', 'ESC', 'OK'] as const).map((button) => {
              const imageW = c.w
              const imageH = c.h
              const x0 = 0
              const y0 = 0
              const coords = { up: [0.8, 0.45], down: [0.8, 0.63], left: [0.68, 0.54], right: [0.92, 0.54], ESC: [0.72, 0.72], OK: [0.88, 0.72] }
              const [bx, by] = coords[button]
              return <rect key={button} x={x0 + (bx - 0.055) * imageW} y={y0 + (by - 0.035) * imageH} width={imageW * 0.11} height={imageH * 0.07} rx={3} fill={c.state.pressedButton === button ? '#38bdf8' : 'transparent'} fillOpacity={0.2} style={{ cursor: 'pointer' }}
                onMouseDown={(e) => { e.stopPropagation(); useSimStore.getState().setComponentState(c.id, { pressedButton: button }) }}
                onMouseUp={(e) => { e.stopPropagation(); useSimStore.getState().setComponentState(c.id, { pressedButton: null }) }}
                onMouseLeave={() => { if (useSimStore.getState().components.find((item) => item.id === c.id)?.state.pressedButton === button) useSimStore.getState().setComponentState(c.id, { pressedButton: null }) }}
                onDoubleClick={(e) => e.stopPropagation()}><title>{button}</title></rect>
            })}
            <text x={c.w / 2} y={imageBounds.y + imageBounds.h + 14} textAnchor="middle" fontSize={11} fill="#334155" pointerEvents="none">{c.ref}</text>
          </>
        ) : model ? (
          <>
            {/* Mesmo CAD e materiais, com orientação visual específica desta instância. */}
            <image x={imageBounds.x} y={imageBounds.y} width={imageBounds.w} height={imageBounds.h} href={model} preserveAspectRatio="xMidYMid meet" pointerEvents="none" />
            <rect x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h} fill="transparent" />
            <ComponentTerminals c={c} />
            {c.type === 'pilotLightAd22' && isOriginalComponentOrientation(orientation) && <g pointerEvents="none">
              <circle cx={c.w / 2} cy={c.h / 2} r={Math.min(c.w, c.h) * 0.17}
                fill={String(c.state.color ?? '#ef4444')} fillOpacity={c.state.on ? 0.78 : 0.34}
                stroke={String(c.state.color ?? '#ef4444')} strokeWidth={c.state.on ? 4 : 2} strokeOpacity={c.state.on ? 0.5 : 0.28} />
              {c.state.on && <circle cx={c.w / 2} cy={c.h / 2} r={Math.min(c.w, c.h) * 0.23}
                fill="none" stroke={String(c.state.color ?? '#ef4444')} strokeWidth={4} strokeOpacity={0.2} />}
            </g>}
            {c.type === 'dualPushButtonNpb22D11' && isOriginalComponentOrientation(orientation) && <>
              <rect x={c.w * 0.12} y={c.h * 0.18} width={c.w * 0.34} height={c.h * 0.55} rx={6}
                fill={c.state.stopPressed ? '#ef4444' : 'transparent'} fillOpacity={0.2} style={{ cursor: 'pointer' }}
                onMouseDown={(e) => { e.stopPropagation(); useSimStore.getState().setComponentState(c.id, { stopPressed: true }) }}
                onMouseUp={(e) => { e.stopPropagation(); useSimStore.getState().setComponentState(c.id, { stopPressed: false }) }}
                onMouseLeave={() => { if (useSimStore.getState().components.find((item) => item.id === c.id)?.state.stopPressed) useSimStore.getState().setComponentState(c.id, { stopPressed: false }) }}
                onDoubleClick={(e) => e.stopPropagation()}><title>STOP · contacto NF 21–22</title></rect>
              <rect x={c.w * 0.54} y={c.h * 0.18} width={c.w * 0.34} height={c.h * 0.55} rx={6}
                fill={c.state.startPressed ? '#22c55e' : 'transparent'} fillOpacity={0.2} style={{ cursor: 'pointer' }}
                onMouseDown={(e) => { e.stopPropagation(); useSimStore.getState().setComponentState(c.id, { startPressed: true }) }}
                onMouseUp={(e) => { e.stopPropagation(); useSimStore.getState().setComponentState(c.id, { startPressed: false }) }}
                onMouseLeave={() => { if (useSimStore.getState().components.find((item) => item.id === c.id)?.state.startPressed) useSimStore.getState().setComponentState(c.id, { startPressed: false }) }}
                onDoubleClick={(e) => e.stopPropagation()}><title>START · contacto NA 13–14</title></rect>
            </>}
            <text x={c.w / 2} y={imageBounds.y + imageBounds.h + 14} textAnchor="middle" fontSize={11} fill="#334155" pointerEvents="none">{c.ref}</text>
          </>
        ) : hasComponent3DModel(c.type) ? (
          <g data-model-state={modelError ? 'error' : 'loading'}>
            <rect x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h} rx={7}
              fill={modelError ? '#fff1f2' : '#edf2f8'} stroke={modelError ? '#dc2626' : '#b8c5d6'}
              strokeWidth={1.2} strokeDasharray={modelError ? '4 3' : undefined} />
            {!modelError && <rect x={bounds.x + bounds.w * 0.16} y={bounds.y + bounds.h * 0.19} width={bounds.w * 0.68} height={bounds.h * 0.52} rx={5}
              fill="#dce5f0" stroke="#c3cfde" strokeWidth={0.8} />}
            <text x={c.w / 2} y={c.h / 2 - 2} textAnchor="middle" fontSize={9} fontWeight={700}
              fill={modelError ? '#b91c1c' : '#64748b'} pointerEvents="none">{modelError ? 'Modelo 3D indisponível' : 'A carregar modelo 3D…'}</text>
            <text x={c.w / 2} y={c.h / 2 + 11} textAnchor="middle" fontSize={7}
              fill={modelError ? '#be123c' : '#8190a5'} pointerEvents="none">{modelError ?? c.ref}</text>
          </g>
        ) : <SymbolGlyph c={c} selected={selected} />}
        {c.locked && <text x={bounds.x + bounds.w - 12} y={bounds.y + 12} fontSize={10} fill="#b45309">🔒</text>}
      </g>
    )
  }

  return (
    <div className="schematic-stage w-full h-full relative overflow-hidden bg-[#f8fafd]">
      <ComponentViewEditor />
      <svg
        ref={svgRef}
        className="w-full h-full"
        style={{ cursor: gridDragEnabled ? (panning ? 'grabbing' : 'grab') : tool === 'select' ? 'default' : tool === 'wire' ? 'crosshair' : tool === 'pan' ? 'grab' : 'pointer' }}
         onMouseDown={onBackgroundDown}
         onMouseMove={onMouseMove}
         onMouseUp={onMouseUp}
         onMouseLeave={onMouseUp}
         onWheel={onWheel}
         onTouchStart={onTouchStart}
         onTouchMove={onTouchMove}
         onTouchEnd={(e) => { if (e.touches.length < 2) pinchRef.current = null }}
         onContextMenu={(e) => e.preventDefault()}
         onDragOver={(e) => {
           e.preventDefault()
           e.dataTransfer.dropEffect = 'copy'
           const p = toCanvas(e.clientX, e.clientY)
           setDropPos({ x: snap(p.x), y: snap(p.y) })
           setCursorPos(p)
         }}
         onDragLeave={() => { setDropPos(null); setCursorPos(null) }}
         onDrop={onCanvasDrop}
       >
        <defs>
          {/* Destaque de seleção: brilho suave que segue a silhueta do componente
              (não desenha molduras, por isso nunca corta o modelo). */}
          <filter id="dc-select-glow" x="-35%" y="-35%" width="170%" height="170%" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2.2" result="tight" />
            <feGaussianBlur in="SourceAlpha" stdDeviation="7" result="wide" />
            <feFlood floodColor="#60a5fa" floodOpacity="0.95" result="tightColor" />
            <feComposite in="tightColor" in2="tight" operator="in" result="tightGlow" />
            <feFlood floodColor="#2f6bff" floodOpacity="0.7" result="wideColor" />
            <feComposite in="wideColor" in2="wide" operator="in" result="wideGlow" />
            <feMerge>
              <feMergeNode in="wideGlow" />
              <feMergeNode in="tightGlow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <pattern id="dc-grid-dots" width={grid.size} height={grid.size} patternUnits="userSpaceOnUse">
            <circle cx={1} cy={1} r={1} fill="#ccd5e3" />
          </pattern>
          <pattern id="dc-grid-lines" width={grid.size} height={grid.size} patternUnits="userSpaceOnUse">
            <path d={`M ${grid.size} 0 L 0 0 0 ${grid.size}`} fill="none" stroke="#e4eaf2" strokeWidth={1} />
          </pattern>
        </defs>

        <rect width="100%" height="100%" fill={grid.background} />
        <g transform={`translate(${panX},${panY}) scale(${zoom})`}>
          {grid.enabled && <rect x={-CANVAS_W} y={-CANVAS_H} width={CANVAS_W * 3} height={CANVAS_H * 3} fill={grid.style === 'dots' ? 'url(#dc-grid-dots)' : 'url(#dc-grid-lines)'} />}

          {/* Pontas de trás: atrás de todos os componentes, independentemente
              da camada do corpo do cabo. */}
          {renderWireEnds('back')}

          {/* Cabos e componentes partilham a mesma ordem z. */}
          {drawOrder.map((entry) => (entry.kind === 'wire' ? renderWireEl(entry.wire) : renderComponentEl(entry.comp)))}

          {/* O fio entra até ao centro do parafuso; a cabeça do borne fica
              desenhada sobre o condutor, mesmo quando a ponteira está atrás. */}
          {wires.flatMap((w) => {
            const d = wireDisplay(w)
            if (!d) return []
            return (['from', 'to'] as const).map((side) => {
              const lead = side === 'from' ? d.fromLead : d.toLead
              const point = side === 'from' ? d.a : d.b
              if (!lead) return null
              return <path key={`${w.id}-${side}-insert`} d={`M ${lead.x},${lead.y} L ${point.x},${point.y}`}
                fill="none" stroke={WIRE_COLORS[w.color] ?? '#94a3b8'} strokeWidth={Math.min(4.4, 1.2 + Math.sqrt(parseFloat(w.gauge) || 1.5) * 0.95)} pointerEvents="none" />
            })
          })}
          {displayComponents.flatMap((c) => c.terminals.filter((t) => wires.some((w) => (!w.fromPoint && w.fromTerminalId === t.id) || (!w.toPoint && w.toTerminalId === t.id))).map((t) => {
            const p = terminalPos(c, t)
            return <g key={`connected-${t.id}`} pointerEvents="none"><TerminalGlyph x={p.x} y={p.y} type={t.terminalType} color={t.color} energized={t.energized} r={4.5} /></g>
          }))}
          {/* Pontas da frente: apenas as escolhidas no inspetor. */}
          {renderWireEnds('front')}

          {/* cabo em construção */}
          {pendingFrom && draftPoints.map((point, i) => <circle key={`draft-${i}`} cx={point.x} cy={point.y} r={4} fill="white" stroke="#2563eb" strokeWidth={2} pointerEvents="none" />)}
          {pendingFrom && cursorPos && <path d={wireGeometry(pendingFrom, hoverTerminal && terminalIndex.get(hoverTerminal) ? terminalIndex.get(hoverTerminal)! : nearestTerminal(components, cursorPos, 16 / zoom, wireFrom ?? undefined)?.point ?? nearestModelTerminal(components, cursorPos, wireFrom ?? undefined, Math.min(24, 28 / zoom))?.point ?? cursorPos, 'orthogonal', 0.5, 0, draftPoints).d} fill="none" stroke="#2563eb" strokeWidth={2} strokeDasharray="5 4" pointerEvents="none" />}
          {/* alvos clicáveis dos bornes (acima de tudo) */}
          {displayComponents.map((c) =>
            c.terminals.map((t) => {
              const p = terminalPos(c, t)
              const isFrom = wireFrom === t.id
              const isSel = selectedTerminalId === t.id
              const chainIdx = chain.indexOf(t.id)
              const isDrawTarget = tool === 'wire' && (!!wireFrom || !!freeStart) && wireFrom !== t.id && hoverTerminal === t.id
              const isViewEditing = viewOrientationEditor?.componentId === c.id
              return (
                <g key={`${t.id}-hit`}>
                  {isDrawTarget && <circle cx={p.x} cy={p.y} r={9} fill="#dcfce7" stroke="#16a34a" strokeWidth={1.5} style={{ pointerEvents: 'none' }} />}
                  {isViewEditing && <>
                    <circle cx={p.x} cy={p.y} r={10} fill="#dbeafe" fillOpacity={0.8} stroke="#2563eb" strokeWidth={1.5} strokeDasharray="2 2" pointerEvents="none" />
                    <text x={p.x + 10} y={p.y - 8} fontSize={8} fontWeight={700} fill="#1d4ed8" pointerEvents="none">{t.label}</text>
                  </>}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={7}
                    fill="transparent"
                    stroke={chainIdx >= 0 ? '#65a30d' : isFrom ? '#2f6bff' : isDrawTarget ? '#16a34a' : isSel ? '#db2777' : 'transparent'}
                    strokeWidth={2}
                    style={{ cursor: isViewEditing ? 'grab' : tool === 'select' ? 'pointer' : 'crosshair' }}
                    onMouseDown={(e) => {
                      if (isViewEditing) {
                        e.preventDefault()
                        e.stopPropagation()
                        setTerminalViewDrag({ componentId: c.id, terminalId: t.id })
                        return
                      }
                      onTerminalDown(e, t.id)
                    }}
                    onContextMenu={(e) => e.preventDefault()}
                    onMouseEnter={() => setHoverTerminal(t.id)}
                    onMouseLeave={() => setHoverTerminal(null)}
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      toggleTerminal(t.id)
                    }}
                  >
                    <title>{`${c.ref}.${t.displayName || t.label} (${t.label}) — ${t.energized ? 'ENERGIZADO' : 'sem tensão'}`}</title>
                  </circle>
                  {chainIdx >= 0 && (
                    <text x={p.x + 9} y={p.y - 9} fontSize={10} fontWeight="bold" fill="#65a30d" style={{ pointerEvents: 'none' }}>
                      {chainIdx + 1}
                    </text>
                  )}
                </g>
              )
            }),
          )}

          {/* Arrastar uma ponta já ligada para outro borne mantém o mesmo cabo. */}
          {tool === 'select' && selectedWireId && (() => {
            const w = wires.find((item) => item.id === selectedWireId)
            if (!w) return null
            return (['from', 'to'] as const).map((side) => {
              const point = side === 'from' ? (w.fromPoint ?? terminalIndex.get(w.fromTerminalId)) : (w.toPoint ?? terminalIndex.get(w.toTerminalId))
              if (!point) return null
              return <circle key={`${w.id}-${side}-drag`} cx={point.x} cy={point.y} r={9} fill="white" fillOpacity={0.01} stroke="#2563eb" strokeWidth={1.5}
                style={{ cursor: 'grab' }} onMouseDown={(e) => {
                  if (e.button !== 0) return
                  e.stopPropagation()
                  commitHistory()
                  setWireDrag({ wireId: w.id, mode: side === 'from' ? 'fromPoint' : 'toPoint', start: { x: point.x, y: point.y }, originalTerminalId: side === 'from' ? (!w.fromPoint ? w.fromTerminalId : undefined) : (!w.toPoint ? w.toTerminalId : undefined) })
                }}><title>Arraste esta ponta para outro borne sem apagar o cabo</title></circle>
            })
          })()}

          {/* Camada de arrasto: cobre componentes e bornes, sem alterar a seleção. */}
          {gridDragEnabled && <rect x={-CANVAS_W} y={-CANVAS_H} width={CANVAS_W * 3} height={CANVAS_H * 3} fill="transparent" pointerEvents="all" />}

          {/* marquee */}
          {marquee && (
            <rect
              x={Math.min(marquee.x0, marquee.x1)}
              y={Math.min(marquee.y0, marquee.y1)}
              width={Math.abs(marquee.x1 - marquee.x0)}
              height={Math.abs(marquee.y1 - marquee.y0)}
              fill="#2f6bff"
              opacity={0.08}
           stroke="#2f6bff"
               strokeWidth={1.5}
             />
           )}

           {/* fantasma real do componente (arraste da biblioteca ou clique-para-posicionar) */}
           {ghost && cursorPos && (
             <g style={{ pointerEvents: 'none' }}>
               <g transform={`translate(${snap(cursorPos.x - ghost.w / 2)},${snap(cursorPos.y - ghost.h / 2)})`} opacity={0.62}>
                 <rect x={-6} y={-6} width={ghost.w + 12} height={ghost.h + 12} rx={6} fill="#2f6bff" fillOpacity={0.06} stroke="#2f6bff" strokeWidth={1.2} strokeDasharray="6 3" />
                 <SymbolGlyph c={ghost} selected={false} />
                 <text x={0} y={-12} className="dc-ghost-label">{ghost.label}</text>
               </g>
             </g>
           )}
         </g>
      </svg>

      {/* banner do modo de posicionamento */}
      {placingType && (
        <div className="absolute left-1/2 -translate-x-1/2 top-2 flex items-center gap-2 text-[11px] rounded-md border border-brand-300 bg-white px-3 py-1.5 text-ink-900 shadow-md z-10">
          <span className="text-brand-700 font-semibold">Posicionar componente:</span>
          <span className="font-mono">{placingType}</span>
          <span className="text-ink-400">clique para largar · Shift+clique = vários · Esc cancela</span>
          <button className="px-2 py-0.5 rounded bg-white border border-line text-ink-700 hover:bg-slate-50" onClick={() => setPlacingType(null)}>
            Cancelar
          </button>
        </div>
      )}

      {showEmptyWelcome && components.length === 0 && wires.length === 0 && tool !== 'wire' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[520px] max-w-[calc(100%-32px)] rounded-md border border-line bg-white/95 p-4 text-center shadow-md backdrop-blur-sm pointer-events-auto">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-md border border-brand-200 bg-brand-50 text-brand-700">
              DC
            </div>
            <h2 className="text-sm font-bold text-ink-900">Projeto vazio</h2>
            <p className="mx-auto mt-1 max-w-[390px] text-xs leading-relaxed text-ink-500">
              Abra a Biblioteca e adicione o primeiro componente. O mesmo projeto será refletido no Esquema 2D, na Visualização 3D e no programa Ladder.
            </p>
            <div className="mx-auto mt-4 max-w-[360px] rounded-md border border-brand-100 bg-brand-50 px-3 py-2 text-[11px] leading-relaxed text-brand-700">
              Nenhum exemplo é carregado automaticamente. Componentes, bornes, cabos, TAGs e estados pertencem sempre a este projeto.
            </div>
          </div>
        </div>
      )}

      {/* Estado do editor num único HUD compacto. Não se sobrepõe ao botão Biblioteca. */}
      <div className={`schematic-hud ${libraryCollapsed ? 'is-library-collapsed' : ''}`} role="status" aria-label="Estado do editor de esquema">
        <span className="schematic-hud-tool"><i /> {gridDragEnabled ? 'Arrastar malha' : tool === 'select' ? 'Selecionar' : tool === 'wire' ? 'Desenhar fio' : tool === 'probe' ? 'Sonda' : tool === 'erase' ? 'Apagar' : 'Mover vista'}</span>
        <span className="schematic-hud-separator" />
        <span title={`Malha ${grid.enabled ? `${grid.size}px, encaixe ${grid.snap ? 'ativo' : 'inativo'}` : 'desligada'}`}>▦ {grid.enabled ? `${grid.size}px${grid.snap ? ' · ímã' : ''}` : 'off'}</span>
        <span className="schematic-hud-separator" />
        <button type="button" className="schematic-hud-action" onClick={() => { setZoom(1); setPan(0, 0) }} title="Restaurar zoom e posição">⌕ {Math.round(zoom * 100)}%</button>
        <button type="button" className="schematic-hud-action" onClick={fitContent} title="Enquadrar todos os componentes e fios (Home)">⊙ Ajustar</button>
        <span className="schematic-hud-separator" />
        <span title="Quantidade de componentes e cabos no projeto">{components.length} comp. · {wires.length} fios</span>
      </div>

      {/* ligação inteligente: cadeia de bornes acumulada por shift+clique */}
      {tool === 'wire' && chain.length > 0 && (
        <div className="absolute left-1/2 -translate-x-1/2 top-2 flex items-center gap-2 text-[11px] rounded-md border border-lime-500 bg-white px-3 py-1.5 text-ink-900 shadow-md">
          <span className="text-lime-700 font-semibold">Ligação inteligente:</span>
          <span>{chain.length} borne(s) selecionado(s)</span>
          <button
            className="px-2 py-0.5 rounded bg-lime-600 hover:bg-lime-700 text-white disabled:opacity-40"
            disabled={chain.length < 2}
            onClick={() => {
              connectChain(chain)
              setChain([])
            }}
          >
            Conectar em cadeia
          </button>
          <button className="px-2 py-0.5 rounded bg-white border border-line text-ink-700 hover:bg-slate-50" onClick={() => setChain([])}>
            Limpar
          </button>
        </div>
      )}

      {probeResult && (
        <div className="absolute right-3 bottom-3 w-72 text-[11px] rounded-md border border-brand-300 bg-white shadow-md p-3 text-ink-900">
          <div className="font-semibold text-brand-700 mb-1 flex items-center gap-1.5"><IconProbe size={12} /> Medição da sonda</div>
          {probeResult.b ? (
            <>
              <div className="font-mono">{terminalIndex.get(probeResult.a!)?.label ?? probeResult.a} ↔ {terminalIndex.get(probeResult.b!)?.label ?? probeResult.b}</div>
              <div>{probeResult.connected ? 'CONTINUIDADE: sim' : 'CONTINUIDADE: não (circuito aberto)'}</div>
              <div>{probeResult.resistanceOhm !== null ? `R ≈ ${probeResult.resistanceOhm} Ω` : 'R = ∞'}</div>
              <div>{probeResult.voltage}</div>
              <div className="text-neutral-400 mt-1">{probeResult.note}</div>
            </>
          ) : (
            <div className="text-neutral-400">{probeResult.note}</div>
          )}
          <button onClick={clearProbe} className="mt-2 px-2 py-0.5 rounded border border-line bg-white hover:bg-slate-50 text-ink-700">limpar</button>
        </div>
      )}

      {tool === 'wire' && !gridDragEnabled && <div className="absolute right-3 top-3 z-10 dc-wire-guide">
        <strong>Desenhar fio</strong><span>{wireFrom || freeStart ? 'Clique para continuar a desenhar; Esc termina. Clique num borne para ligar a ponta.' : 'Clique num borne ou no espaço vazio para começar.'}</span>
        <small>Cada clique prolonga o cabo rígido · bornes ligam a ponta · Esc termina o desenho.</small>

      </div>}
      <div className="absolute left-2 bottom-2 flex flex-col items-start gap-1.5 z-10">
        {showHints && (
          <div className="text-[10px] text-ink-400 text-left leading-relaxed rounded-md bg-white/95 border border-line shadow-xs px-2 py-1.5 max-w-[260px]">
            <div>arraste = mover · shift+clique = multi-seleção</div>
            <div>biblioteca: clique ou arraste → pré-visualização real → solte para posicionar</div>
            <div>clique no cabo = editar (cor, condutor, terminal) · duplo clique = ponto de curva</div>
            <div>duplo clique num ponto de curva = remover · duplo no borne = alternar</div>
            <div>ferramenta Cabo: shift+clique nos bornes = ligação inteligente em cadeia</div>
            <div>ferramenta Cabo: clique prolonga · Esc termina e conserva o traçado</div>
            <div>rígido e flexível têm o mesmo percurso ortogonal · arraste os pontos para ajustar</div>
            <div>Ctrl+] avança · Ctrl+[ recua · Ctrl+Shift+]/[ frente/trás</div>
            <div>1–5 ferramentas · Home ajusta a vista · R gira · D duplica · Del apaga · Ctrl+Z desfaz</div>
          </div>
        )}
        <button
          onClick={toggleHints}
          className="w-6 h-6 flex items-center justify-center rounded-full border border-line bg-white/95 shadow-xs text-ink-500 hover:text-brand-600 hover:border-brand-300 transition-colors"
          title={showHints ? 'Esconder dicas' : 'Mostrar dicas'}
        >
          <IconHelp size={13} />
        </button>
      </div>
    </div>
  )
}
