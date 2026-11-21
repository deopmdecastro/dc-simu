import { useEffect, useRef, type PointerEvent } from 'react'
import type { ComponentDecal, ElectricalComponent } from '../types'
import { SCHEMATIC_PX_PER_MM } from '../three/modelPaths'
import { useSimStore } from '../store/useSimStore'
import { releaseTypingFocus } from '../ui/editorKeys'
import { useDecalRaster } from '../components/DecalPreview'

export default function ComponentDecals2D({ c }: { c: ElectricalComponent }) {
  return <>{(c.decals ?? []).map((decal, index) => <Decal2D key={decal.id} c={c} decal={decal} index={index + 1} />)}</>
}

function Decal2D({ c, decal: d, index }: { c: ElectricalComponent; decal: ComponentDecal; index: number }) {
  const selected = useSimStore((s) => s.selectedDecal?.componentId === c.id && s.selectedDecal?.decalId === d.id)
  const stopped = useSimStore((s) => s.sim.runState === 'stopped')
  const tool = useSimStore((s) => s.tool)
  const raster = useDecalRaster(d)
  const drag = useRef<{ inverse: DOMMatrix; x: number; y: number; pointerId: number; element: SVGGElement } | null>(null)
  const px = SCHEMATIC_PX_PER_MM
  const width = (d.widthMm ?? 30) * px, height = (d.heightMm ?? 15) * px
  const allowed = stopped && !c.locked && tool === 'select'
  const release = () => {
    const gesture = drag.current
    drag.current = null
    if (!gesture) return
    try { if (gesture.element.hasPointerCapture(gesture.pointerId)) gesture.element.releasePointerCapture(gesture.pointerId) } catch { /* captura já cancelada */ }
  }
  useEffect(() => { if (!selected) release() }, [selected])
  useEffect(() => () => { if (drag.current) { useSimStore.getState().cancelDecalMove(); release() } }, [c.id, d.id])
  useEffect(() => {
    const blur = () => { if (drag.current) { useSimStore.getState().endDecalMove(); release() } }
    window.addEventListener('blur', blur)
    return () => window.removeEventListener('blur', blur)
  }, [])
  const local = (event: PointerEvent<SVGGElement>, inverse: DOMMatrix) => new DOMPoint(event.clientX, event.clientY).matrixTransform(inverse)
  const down = (event: PointerEvent<SVGGElement>) => {
    if (!allowed || event.button !== 0) return
    event.stopPropagation(); event.preventDefault(); releaseTypingFocus()
    const matrix = (event.currentTarget.parentNode as SVGGElement).getScreenCTM()
    if (!matrix) return
    const inverse = matrix.inverse(), point = local(event, inverse)
    const store = useSimStore.getState(); store.selectDecal(c.id, d.id); store.beginDecalMove()
    drag.current = { inverse, x: point.x, y: point.y, pointerId: event.pointerId, element: event.currentTarget }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const move = (event: PointerEvent<SVGGElement>) => {
    const gesture = drag.current
    if (!gesture) return
    event.stopPropagation(); event.preventDefault()
    const point = local(event, gesture.inverse)
    useSimStore.getState().moveSelectedDecal((point.x - gesture.x) / px, -(point.y - gesture.y) / px)
  }
  const end = (event: PointerEvent<SVGGElement>, cancel: boolean) => {
    if (!drag.current) return
    event.stopPropagation(); event.preventDefault()
    if (cancel) useSimStore.getState().cancelDecalMove(); else useSimStore.getState().endDecalMove()
    release()
  }
  return <g data-decal-id={d.id} data-component-id={c.id} data-selected={selected ? 'true' : undefined} role="button" aria-label={`Selecionar etiqueta ${index}: ${d.text || 'Imagem'}`} tabIndex={allowed ? 0 : -1}
    transform={`translate(${c.w / 2 + (d.offsetXmm ?? 0) * px},${c.h / 2 - (d.offsetYmm ?? 0) * px}) rotate(${-(d.rotationDeg ?? 0)})`}
    style={{ cursor: allowed ? (drag.current ? 'grabbing' : 'grab') : 'inherit', touchAction: allowed ? 'none' : undefined }} pointerEvents={allowed ? 'all' : 'none'}
    onPointerDown={down} onPointerMove={move} onPointerUp={(event) => end(event, false)} onPointerCancel={(event) => end(event, true)} onLostPointerCapture={(event) => end(event, true)}
    onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}
    onKeyDown={(event) => { if (allowed && ['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); useSimStore.getState().selectDecal(c.id, d.id) } }}>
    <title>{d.text || 'Imagem'} · arraste para mover</title>
    {raster ? <image href={raster} x={-width / 2} y={-height / 2} width={width} height={height} pointerEvents="none" /> : <rect x={-width / 2} y={-height / 2} width={width} height={height} fill={d.background ?? '#fff'} />}
    <rect x={-width / 2} y={-height / 2} width={width} height={height} fill="transparent" stroke={selected ? '#2563eb' : 'none'} strokeWidth={selected ? 2 : 0} strokeDasharray={selected ? '5 3' : undefined} vectorEffect="non-scaling-stroke" />
  </g>
}
