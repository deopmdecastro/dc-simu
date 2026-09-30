import { useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react'

export type ViewCubeFace = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'isometric'
export type ViewCubeCorner = 'nw' | 'ne' | 'sw' | 'se'
type FaceId = Exclude<ViewCubeFace, 'isometric'>

/** Pedido de vista vindo do cubo: uma face/ISO ou ângulos livres da câmara (°). */
export type ViewCubeRequest = { view: ViewCubeFace } | { yaw: number; pitch: number }

/** Inclinação isométrica verdadeira (°) usada pelos cantos do cubo. */
export const ISO_PITCH = 35.264

/** Ângulos (yaw/pitch) da câmara para cada canto do cubo. */
export const CORNER_ANGLES: Record<ViewCubeCorner, { yaw: number; pitch: number; label: string }> = {
  nw: { yaw: -45, pitch: ISO_PITCH, label: 'Canto isométrico superior esquerdo' },
  ne: { yaw: 45, pitch: ISO_PITCH, label: 'Canto isométrico superior direito' },
  sw: { yaw: -45, pitch: -ISO_PITCH, label: 'Canto isométrico inferior esquerdo' },
  se: { yaw: 45, pitch: -ISO_PITCH, label: 'Canto isométrico inferior direito' },
}

const FACES: Array<{ id: FaceId; label: string; title: string }> = [
  { id: 'front', label: 'FRENTE', title: 'Frente' },
  { id: 'back', label: 'TRÁS', title: 'Trás' },
  { id: 'right', label: 'DIR', title: 'Direita' },
  { id: 'left', label: 'ESQ', title: 'Esquerda' },
  { id: 'top', label: 'SUP', title: 'Superior' },
  { id: 'bottom', label: 'INF', title: 'Inferior' },
]

const CORNERS: ViewCubeCorner[] = ['nw', 'ne', 'sw', 'se']
const ARROWS: Array<{ id: 'up' | 'down' | 'left' | 'right'; glyph: string; title: string; sx: number; sy: number }> = [
  { id: 'up', glyph: '▲', title: 'Rodar para cima', sx: 0, sy: -1 },
  { id: 'right', glyph: '▶', title: 'Rodar para a direita', sx: 1, sy: 0 },
  { id: 'down', glyph: '▼', title: 'Rodar para baixo', sx: 0, sy: 1 },
  { id: 'left', glyph: '◀', title: 'Rodar para a esquerda', sx: -1, sy: 0 },
]

/**
 * Matriz CSS (mundo → ecrã) para a câmara em (yaw, pitch). O referencial CSS tem
 * Y para baixo; o mundo tem Y para cima — por isso as linhas 1 e 2 invertem o sinal de Y.
 */
export function viewCubeMatrix(yawDeg: number, pitchDeg: number): string {
  const yaw = (yawDeg * Math.PI) / 180
  const pitch = (pitchDeg * Math.PI) / 180
  const o = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)] // câmara → alvo (invertido)
  const f = [-o[0], -o[1], -o[2]]
  const r = [Math.cos(yaw), 0, -Math.sin(yaw)]
  // up = r × f
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]]
  const m = [
    [r[0], -r[1], r[2]],
    [-u[0], u[1], -u[2]],
    [o[0], -o[1], o[2]],
  ]
  const c = (row: number, col: number) => m[row][col].toFixed(5)
  return `matrix3d(${c(0, 0)},${c(1, 0)},${c(2, 0)},0,${c(0, 1)},${c(1, 1)},${c(2, 1)},0,${c(0, 2)},${c(1, 2)},${c(2, 2)},0,0,0,0,1)`
}

/** Face do cubo mais virada para quem vê, dada a posição da câmara (yaw/pitch em °). */
export function cameraFacingFace(yawDeg: number, pitchDeg: number): FaceId {
  const yaw = (yawDeg * Math.PI) / 180
  const pitch = (pitchDeg * Math.PI) / 180
  const x = Math.sin(yaw) * Math.cos(pitch)
  const y = Math.sin(pitch)
  const z = Math.cos(yaw) * Math.cos(pitch)
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z)
  if (ay >= ax && ay >= az) return y >= 0 ? 'top' : 'bottom'
  if (az >= ax) return z >= 0 ? 'front' : 'back'
  return x >= 0 ? 'right' : 'left'
}

/**
 * Face virada para o ecrã quando o cubo roda com `rotateX(-x) rotateY(y) rotateZ(z)`
 * (convenção do editor de orientação do componente; eixos CSS, Y para baixo).
 */
export function orientationFacingFace(xDeg: number, yDeg: number, zDeg: number): FaceId {
  const rad = (v: number) => (v * Math.PI) / 180
  const a = rad(-xDeg), b = rad(yDeg), c = rad(zDeg)
  const normals: Record<FaceId, [number, number, number]> = {
    front: [0, 0, 1], back: [0, 0, -1], right: [1, 0, 0], left: [-1, 0, 0], top: [0, -1, 0], bottom: [0, 1, 0],
  }
  let best: FaceId = 'front'
  let bestZ = -Infinity
  for (const id of Object.keys(normals) as FaceId[]) {
    let [x, y, z] = normals[id]
    ;[x, y] = [x * Math.cos(c) - y * Math.sin(c), x * Math.sin(c) + y * Math.cos(c)] // rotateZ
    ;[x, z] = [x * Math.cos(b) + z * Math.sin(b), -x * Math.sin(b) + z * Math.cos(b)] // rotateY
    ;[y, z] = [y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)] // rotateX
    if (z > bestZ) { bestZ = z; best = id }
  }
  return best
}

export interface ViewCubeDialProps {
  /** Valor CSS `transform` aplicado ao cubo (matriz da câmara ou rotações do componente). */
  transform: string
  /** Face virada para o ecrã — fica realçada. */
  activeFace?: FaceId
  onFace: (face: FaceId) => void
  onCorner: (corner: ViewCubeCorner) => void
  onIso: () => void
  /** Volta à vista frontal (botão ⌂). */
  onHome?: () => void
  /** Arrasto incremental em pixéis; `shift` = modificador premido. */
  onDrag: (dx: number, dy: number, shift: boolean) => void
  /** Fim do arrasto (útil para aplicar a orientação final). */
  onDragEnd?: () => void
  /** Tamanho, em pixéis de arrasto, de cada clique nas setas. */
  arrowStep?: number
  caption: string
  readout?: string
  /** `floating` = cartão sobre o canvas · `panel` = integrado no painel "Editar componente 3D". */
  variant?: 'floating' | 'panel'
  /** Posição do cartão flutuante (ver CSS). */
  placement?: 'top' | 'below-command' | 'shifted'
  ariaLabel?: string
  dragTitle?: string
}

/** Cubo de vista em mostrador circular: usado no Esquema 2D, na Visualização 3D e no editor do componente. */
export function ViewCubeDial({
  transform, activeFace, onFace, onCorner, onIso, onHome, onDrag, onDragEnd, arrowStep = 24,
  caption, readout, variant = 'floating', placement = 'top', ariaLabel = 'Cubo de vista', dragTitle,
}: ViewCubeDialProps) {
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null)
  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false }
    event.stopPropagation()
  }
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== event.pointerId) return
    const dx = event.clientX - d.x
    const dy = event.clientY - d.y
    if (!d.moved) {
      if (Math.hypot(dx, dy) < 3) return
      d.moved = true
      // Só captura quando é mesmo um arrasto — assim os cliques nas faces continuam a funcionar.
      try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* ponteiro já libertado */ }
    }
    d.x = event.clientX
    d.y = event.clientY
    onDrag(dx, dy, event.shiftKey)
  }
  const up = (event: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    // O clique seguinte ao arrasto não conta (evita mudar de vista ao orbitar).
    window.setTimeout(() => { drag.current = null }, 0)
    if (d.moved) onDragEnd?.()
  }
  const guard = (action: () => void) => (event: { stopPropagation: () => void }) => {
    event.stopPropagation()
    if (drag.current?.moved) return
    action()
  }
  const cls = `vcube vcube-${variant}${variant === 'floating' ? ` vcube-${placement}` : ''}`
  return <div className={cls} role="group" aria-label={ariaLabel} onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
    <div className="vcube-heading" aria-hidden="true"><span>ORIENTAÇÃO</span><b>3D</b></div>
    <div className="vcube-stage" title={dragTitle ?? 'Arraste para rodar · clique numa face ou num canto para mudar de vista'} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      {ARROWS.map((arrow) => <button
        type="button"
        key={arrow.id}
        className={`vcube-arrow ${arrow.id}`}
        title={arrow.title}
        aria-label={arrow.title}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => { event.stopPropagation(); onDrag(arrow.sx * arrowStep, arrow.sy * arrowStep, false); onDragEnd?.() }}
      >{arrow.glyph}</button>)}
      <div className="vcube-body" style={{ transform }}>
        <i className="vcube-axis x" /><i className="vcube-axis y" /><i className="vcube-axis z" />
        {FACES.map((face) => <button
          type="button"
          key={face.id}
          className={`face ${face.id}${activeFace === face.id ? ' is-facing' : ''}`}
          title={face.title}
          aria-label={`Vista ${face.title.toLowerCase()}`}
          onClick={guard(() => onFace(face.id))}
        >{face.label}</button>)}
      </div>
      {CORNERS.map((corner) => <button
        type="button"
        key={corner}
        className={`vcube-corner ${corner}`}
        aria-label={CORNER_ANGLES[corner].label}
        title={CORNER_ANGLES[corner].label}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={guard(() => onCorner(corner))}
      />)}
    </div>
    <div className="vcube-actions">
      <span className="vcube-legend" title="Eixos: X vermelho · Y verde · Z azul"><b className="x">X</b><b className="y">Y</b><b className="z">Z</b></span>
      {onHome && <button type="button" onClick={guard(onHome)} title="Vista frontal (a mesma do Esquema 2D)">⌂ Frente</button>}
      <button type="button" onClick={guard(onIso)} title="Vista isométrica">ISO</button>
    </div>
    <small>{caption}</small>
    {readout && <small className="vcube-readout">{readout}</small>}
  </div>
}

export interface ViewCubeProps {
  /** Azimute (°) e elevação (°) da câmara em torno do alvo — mesma convenção da Visualização 3D. */
  yaw: number
  pitch: number
  onPick: (view: ViewCubeFace) => void
  /** Ângulos livres (cantos do cubo). */
  onAngles?: (yaw: number, pitch: number) => void
  /** Arrastar o cubo orbita a câmara (deltas em pixéis). */
  onOrbit: (dx: number, dy: number) => void
  /** Chamado ao largar depois de um arrasto (o Esquema 2D usa-o para abrir o 3D nessa vista). */
  onOrbitEnd?: () => void
  /** Posição do cartão flutuante. */
  placement?: 'top' | 'below-command' | 'shifted'
  /** Legenda extra no rodapé (ex.: "Esquema 2D · vista frontal"). */
  note?: string
  /** Mostra o botão ⌂ Frente (no Esquema 2D a vista já é frontal). */
  showHome?: boolean
}

/** Cubo de vista da câmara: mostra a orientação da câmara; clicar numa face/canto muda a vista, arrastar orbita. */
export default function ViewCube({ yaw, pitch, onPick, onAngles, onOrbit, onOrbitEnd, placement = 'top', note, showHome = true }: ViewCubeProps) {
  const transform = useMemo(() => viewCubeMatrix(yaw, pitch), [yaw, pitch])
  const active = cameraFacingFace(yaw, pitch)
  const wrapYaw = Math.round(((((yaw + 180) % 360) + 360) % 360) - 180)
  return <ViewCubeDial
    transform={transform}
    activeFace={active}
    variant="floating"
    placement={placement}
    ariaLabel="Cubo de vista da câmara"
    onFace={onPick}
    onIso={() => onPick('isometric')}
    onHome={showHome ? () => onPick('front') : undefined}
    onCorner={(corner) => {
      const angle = CORNER_ANGLES[corner]
      if (onAngles) onAngles(angle.yaw, angle.pitch)
      else onPick('isometric')
    }}
    // Shift = só horizontal (mantém a elevação).
    onDrag={(dx, dy, shift) => onOrbit(dx, shift ? 0 : dy)}
    onDragEnd={onOrbitEnd}
    arrowStep={56}
    caption={note ?? 'Arraste o cubo · Shift = só horizontal'}
    readout={`${wrapYaw}° · ${Math.round(pitch)}°`}
  />
}
