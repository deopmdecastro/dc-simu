import { useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react'

export type ViewCubeFace = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'isometric'

export interface ViewCubeProps {
  /** Azimute (°) e elevação (°) da câmara em torno do alvo — mesma convenção do Painel 3D. */
  yaw: number
  pitch: number
  onPick: (view: ViewCubeFace) => void
  /** Arrastar o cubo orbita a câmara (deltas em pixéis). */
  onOrbit: (dx: number, dy: number) => void
  /** Desloca o cubo para a esquerda quando o painel "Editar componente 3D" está aberto. */
  shifted?: boolean
  /** Há um componente selecionado: o botão "Editar componente 3D" ocupa o canto, o cubo fica por baixo. */
  belowCommand?: boolean
}

const FACES: Array<{ id: Exclude<ViewCubeFace, 'isometric'>; label: string; title: string }> = [
  { id: 'front', label: 'FRENTE', title: 'Vista frontal' },
  { id: 'back', label: 'TRÁS', title: 'Vista de trás' },
  { id: 'right', label: 'DIR.', title: 'Vista da direita' },
  { id: 'left', label: 'ESQ.', title: 'Vista da esquerda' },
  { id: 'top', label: 'TOPO', title: 'Vista superior' },
  { id: 'bottom', label: 'BASE', title: 'Vista inferior' },
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

/** Cubo de vista: mostra a orientação da câmara 3D; clicar numa face/canto muda a vista, arrastar orbita. */
export default function ViewCube({ yaw, pitch, onPick, onOrbit, shifted = false, belowCommand = false }: ViewCubeProps) {
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null)
  const transform = useMemo(() => viewCubeMatrix(yaw, pitch), [yaw, pitch])
  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== event.pointerId) return
    const dx = event.clientX - d.x
    const dy = event.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < 3) return
    d.moved = true
    d.x = event.clientX
    d.y = event.clientY
    onOrbit(dx, dy)
  }
  const up = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    // O clique só conta se não houve arrasto (evita mudar de vista ao orbitar).
    window.setTimeout(() => { drag.current = null }, 0)
  }
  const pick = (view: ViewCubeFace) => (event: { stopPropagation: () => void }) => {
    event.stopPropagation()
    if (drag.current?.moved) return
    onPick(view)
  }
  return <div className={`panel3d-viewcube${shifted ? ' is-shifted' : belowCommand ? ' below-command' : ''}`} role="group" aria-label="Cubo de vista da câmara 3D" onPointerDown={(event) => event.stopPropagation()}>
    <div className="panel3d-viewcube-stage" title="Clique numa face para mudar de vista · arraste para orbitar" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <div className="panel3d-viewcube-body" style={{ transform }}>
        {FACES.map((face) => <button type="button" key={face.id} className={`face ${face.id}`} title={face.title} aria-label={face.title} onClick={pick(face.id)}>{face.label}</button>)}
      </div>
    </div>
    <button type="button" className="panel3d-viewcube-iso" onClick={() => onPick('isometric')} title="Vista isométrica">ISO</button>
    <small>{Math.round(((yaw % 360) + 360) % 360)}° · {Math.round(pitch)}°</small>
  </div>
}
