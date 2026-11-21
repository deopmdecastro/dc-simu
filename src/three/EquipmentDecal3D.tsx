import { useEffect, useMemo, useRef } from 'react'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { ComponentDecal } from '../types'
import { PANEL_UNITS_PER_MM } from './modelPaths'
import { createDecalCanvas, decalContentKey, paintDecalImage } from './decalContent'
import { useSimStore } from '../store/useSimStore'
import { releaseTypingFocus } from '../ui/editorKeys'
import { useDecalKeyboard } from '../ui/useDecalKeyboard'

/** Gesto no plano físico da face; a porta conserva a sua animação. */
export function EquipmentDecal3D({ decal: d, componentId, interactive = true }: { decal: ComponentDecal; componentId?: string; interactive?: boolean }) {
  const { invalidate, controls } = useThree()
  useDecalKeyboard()
  const mesh = useRef<THREE.Mesh>(null)
  const selected = useSimStore((s) => s.selectedDecal?.componentId === componentId && s.selectedDecal?.decalId === d.id)
  const editable = useSimStore((s) => !!componentId && interactive && s.sim.runState === 'stopped' && s.tool === 'select' && !s.components.find((item) => item.id === componentId)?.locked)
  const drag = useRef<{ plane: THREE.Plane; inverse: THREE.Matrix4; start: THREE.Vector3; orbit?: { enabled: boolean }; wasEnabled?: boolean; pointerId: number; capture: { releasePointerCapture: (id: number) => void; hasPointerCapture?: (id: number) => boolean } } | null>(null)
  const width = (d.widthMm ?? 30) * PANEL_UNITS_PER_MM, height = (d.heightMm ?? 15) * PANEL_UNITS_PER_MM
  const key = decalContentKey(d)
  const canvas = useMemo(() => createDecalCanvas(d), [key])
  const texture = useMemo(() => { const value = new THREE.CanvasTexture(canvas); value.colorSpace = THREE.SRGBColorSpace; value.anisotropy = 4; return value }, [canvas])
  useEffect(() => {
    let live = true
    paintDecalImage(canvas, d).then(() => { if (live) { texture.needsUpdate = true; invalidate() } }).catch(() => {})
    return () => { live = false; texture.dispose() }
  }, [canvas, texture, invalidate])
  const outline = useMemo(() => new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-width / 2, -height / 2, .001), new THREE.Vector3(width / 2, -height / 2, .001), new THREE.Vector3(width / 2, height / 2, .001), new THREE.Vector3(-width / 2, height / 2, .001)]), [width, height])
  useEffect(() => () => outline.dispose(), [outline])
  const restore = () => {
    const gesture = drag.current
    drag.current = null
    if (!gesture) return
    if (gesture.orbit) gesture.orbit.enabled = gesture.wasEnabled ?? true
    try { if (!gesture.capture.hasPointerCapture || gesture.capture.hasPointerCapture(gesture.pointerId)) gesture.capture.releasePointerCapture(gesture.pointerId) } catch { /* captura já libertada pelo browser */ }
  }
  useEffect(() => { if (!selected && drag.current) restore() }, [selected])
  useEffect(() => () => { if (drag.current) { useSimStore.getState().cancelDecalMove(); restore() } }, [componentId, d.id])
  useEffect(() => {
    const blur = () => { if (drag.current) { useSimStore.getState().endDecalMove(); restore() } }
    window.addEventListener('blur', blur)
    return () => window.removeEventListener('blur', blur)
  }, [])
  const allowed = () => {
    const state = useSimStore.getState()
    return !!componentId && interactive && state.tool === 'select' && state.sim.runState === 'stopped' && !state.components.find((item) => item.id === componentId)?.locked
  }
  const down = (event: ThreeEvent<PointerEvent>) => {
    if (!allowed() || event.button !== 0 || !mesh.current || !componentId) return
    event.stopPropagation(); event.nativeEvent.stopPropagation(); releaseTypingFocus()
    const store = useSimStore.getState()
    store.selectDecal(componentId, d.id); store.beginDecalMove()
    mesh.current.updateWorldMatrix(true, false)
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(mesh.current.matrixWorld)
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, event.point)
    const face = mesh.current.parent?.parent ?? mesh.current.parent ?? mesh.current
    const inverse = face.matrixWorld.clone().invert()
    const orbit = controls as unknown as { enabled: boolean } | undefined
    drag.current = { plane, inverse, start: event.point.clone().applyMatrix4(inverse), orbit, wasEnabled: orbit?.enabled, pointerId: event.pointerId, capture: event.target as unknown as { releasePointerCapture: (id: number) => void; hasPointerCapture: (id: number) => boolean } }
    if (orbit) orbit.enabled = false
    ;(event.target as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture(event.pointerId)
  }
  const move = (event: ThreeEvent<PointerEvent>) => {
    const gesture = drag.current
    if (!gesture || !allowed()) return
    event.stopPropagation()
    const point = event.ray.intersectPlane(gesture.plane, new THREE.Vector3())
    if (!point) return
    point.applyMatrix4(gesture.inverse).sub(gesture.start)
    useSimStore.getState().moveSelectedDecal(point.x / PANEL_UNITS_PER_MM, point.y / PANEL_UNITS_PER_MM)
    invalidate()
  }
  const end = (event: ThreeEvent<PointerEvent>, cancel = false) => {
    if (!drag.current) return
    event.stopPropagation()
    const state = useSimStore.getState()
    if (cancel) state.cancelDecalMove(); else state.endDecalMove()
    restore()
  }
  return <>
    <mesh ref={mesh} name={`decal-${d.id}`} userData={{ decalId: d.id, componentId }} raycast={editable ? THREE.Mesh.prototype.raycast : () => {}} onPointerDown={down} onPointerMove={move} onPointerUp={(event) => end(event)} onPointerCancel={(event) => end(event, true)} onClick={(event) => { if (editable) event.stopPropagation() }} onDoubleClick={(event) => { if (editable) event.stopPropagation() }}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} toneMapped={false} polygonOffset polygonOffsetFactor={-1} transparent />
    </mesh>
    {selected && <lineLoop geometry={outline} raycast={() => {}}><lineBasicMaterial color="#2563eb" toneMapped={false} depthTest={false} /></lineLoop>}
  </>
}
