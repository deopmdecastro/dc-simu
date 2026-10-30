export interface CanvasScrollAxis { min: number; max: number; value: number; size: number }
export interface CanvasScrollView { x: number; y: number; width: number; height: number }
export interface CanvasScrollBounds { minX: number; minY: number; maxX: number; maxY: number }

/** Uma margem de trabalho de cada lado mantém navegáveis os desenhos pequenos e vazios. */
export function canvasScrollAxis(start: number, end: number, value: number, size: number): CanvasScrollAxis {
  size = Number.isFinite(size) && size > 0 ? size : 1
  value = Number.isFinite(value) ? value : 0
  start = Number.isFinite(start) ? start : 0
  end = Number.isFinite(end) ? Math.max(start, end) : start
  return { min: Math.min(start - size, value), max: Math.max(end, value), value, size }
}

export function canvasScrollThumb(axis: CanvasScrollAxis, track: number) {
  const total = axis.max - axis.min + axis.size
  const length = Math.min(track, Math.max(28, track * axis.size / total))
  const travel = Math.max(0, track - length)
  const offset = travel * (axis.value - axis.min) / Math.max(1e-9, axis.max - axis.min)
  return { length, travel, offset }
}

export const clampCanvasScroll = (value: number, axis: CanvasScrollAxis) => Math.max(axis.min, Math.min(axis.max, value))
