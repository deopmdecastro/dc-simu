import { useEffect, useState, type MutableRefObject } from 'react'
import CanvasPanScrollbars from '../ui/CanvasPanScrollbars'
import type { CameraScrollMetrics } from './cameraScroll'

export interface PanelScrollBridge {
  metrics?: CameraScrollMetrics
  report?: (metrics: CameraScrollMetrics) => void
  pan?: (position: { x: number; y: number }) => void
}
const initialMetrics: CameraScrollMetrics = { view: { x: -3, y: -2, width: 6, height: 4 }, bounds: { minX: -2, minY: -2, maxX: 2, maxY: 2 } }

/** Só este overlay acompanha o pan por frame; a árvore dos modelos 3D mantém-se. */
export default function PanelCanvasScrollbars({ bridge, controlsId, disabled, label }: { bridge: MutableRefObject<PanelScrollBridge>; controlsId: string; disabled: boolean; label: string }) {
  const [metrics, setMetrics] = useState(bridge.current.metrics ?? initialMetrics)
  useEffect(() => {
    bridge.current.report = setMetrics
    if (bridge.current.metrics) setMetrics(bridge.current.metrics)
    return () => { bridge.current.report = undefined }
  }, [bridge])
  return <CanvasPanScrollbars view={metrics.view} bounds={metrics.bounds} label={label} controlsId={controlsId} disabled={disabled} onChange={position => bridge.current.pan?.(position)} />
}
