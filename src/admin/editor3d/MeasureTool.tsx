import { useEffect, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import type { Vec3 } from '../../catalog/types'
import { useEditorStore } from './editorStore'

const PICK_PX = 14
const CLICK_SLOP_PX = 5
const r1 = (value: number) => Math.round(value * 10) / 10
const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

function Label({ a, b, live, onRemove }: { a: Vec3; b: Vec3; live?: boolean; onRemove?: () => void }) {
  const middle: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
  const d = [Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2])]
  return <Html center position={middle} zIndexRange={[28, 0]} style={{ pointerEvents: onRemove ? 'auto' : 'none' }}>
    <span className={`ce-measure${live ? ' is-live' : ''}`}>
      <b>{r1(distance(a, b))} mm</b>
      <i>Δx {r1(d[0])} · y {r1(d[1])} · z {r1(d[2])}</i>
      {onRemove && <button type="button" aria-label="Apagar medição" title="Apagar medição" onClick={onRemove}>×</button>}
    </span>
  </Html>
}

/** Régua: dois cliques (superfície, borne ou grelha) medem a distância em mm. Esc cancela. */
export function MeasureController({ active, root }: { active: boolean; root: THREE.Object3D }) {
  const { camera, gl, invalidate } = useThree()
  const [cursor, setCursor] = useState<Vec3 | null>(null)
  const from = useEditorStore((s) => s.measureFrom)
  const measurements = useEditorStore((s) => s.measurements)
  const set = useEditorStore((s) => s.set)

  useEffect(() => {
    if (!active) { setCursor(null); return }
    const dom = gl.domElement
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    let down: { x: number; y: number } | null = null
    let frame = 0
    let last: PointerEvent | null = null

    const locate = (event: { clientX: number; clientY: number }): Vec3 | null => {
      const state = useEditorStore.getState()
      const rect = dom.getBoundingClientRect()
      const px = event.clientX - rect.left
      const py = event.clientY - rect.top
      const projected = new THREE.Vector3()
      let best: Vec3 | null = null
      let bestDistance = PICK_PX
      for (const terminal of state.def.terminals) {
        if (state.hiddenTerminals.includes(terminal.id)) continue
        projected.set(...terminal.position).project(camera)
        if (projected.z > 1) continue
        const d = Math.hypot((projected.x * 0.5 + 0.5) * rect.width - px, (-projected.y * 0.5 + 0.5) * rect.height - py)
        if (d < bestDistance) { bestDistance = d; best = terminal.position }
      }
      if (best) return best
      ndc.set((px / rect.width) * 2 - 1, -(py / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      const hit = raycaster.intersectObject(root, true).find((item) => (item.object as THREE.Mesh).isMesh && item.object.visible)
      if (!hit) return null
      const point = hit.point
      if (state.snap.on && !(event as PointerEvent).altKey) {
        const step = Math.min(state.snap.mm, 1)
        return [r1(Math.round(point.x / step) * step), r1(Math.round(point.y / step) * step), r1(Math.round(point.z / step) * step)]
      }
      return [r1(point.x), r1(point.y), r1(point.z)]
    }
    const publish = () => { frame = 0; if (last) { setCursor(locate(last)); invalidate() } }
    const onMove = (event: PointerEvent) => { last = event; if (!frame) frame = requestAnimationFrame(publish) }
    const onDown = (event: PointerEvent) => { down = event.button === 0 ? { x: event.clientX, y: event.clientY } : null }
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || !down) return
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y)
      down = null
      if (moved > CLICK_SLOP_PX) return
      const point = locate(event)
      if (!point) return
      const state = useEditorStore.getState()
      if (!state.measureFrom) { set({ measureFrom: point }); return }
      if (distance(state.measureFrom, point) < 0.05) return
      set({ measurements: [...state.measurements, { id: `m_${Date.now().toString(36)}`, a: state.measureFrom, b: point }], measureFrom: null })
    }
    const onLeave = () => { last = null; setCursor(null) }
    dom.addEventListener('pointermove', onMove)
    dom.addEventListener('pointerdown', onDown)
    dom.addEventListener('click', onClick)
    dom.addEventListener('pointerleave', onLeave)
    dom.style.cursor = 'crosshair'
    return () => {
      dom.removeEventListener('pointermove', onMove); dom.removeEventListener('pointerdown', onDown); dom.removeEventListener('click', onClick); dom.removeEventListener('pointerleave', onLeave)
      if (frame) cancelAnimationFrame(frame)
      dom.style.cursor = ''
    }
  }, [active, camera, gl, invalidate, root, set])

  useEffect(() => { invalidate() }, [from, measurements, cursor, invalidate])

  return <>
    {measurements.map((item) => <group key={item.id}>
      <Line points={[item.a, item.b]} color="#f59e0b" lineWidth={2} depthTest={false} renderOrder={30} />
      {[item.a, item.b].map((point, index) => <mesh key={index} position={point} renderOrder={31} raycast={() => null}><sphereGeometry args={[1.4, 12, 10]} /><meshBasicMaterial color="#f59e0b" depthTest={false} /></mesh>)}
      <Label a={item.a} b={item.b} onRemove={() => set({ measurements: useEditorStore.getState().measurements.filter((entry) => entry.id !== item.id) })} />
    </group>)}
    {active && from && <group>
      <mesh position={from} renderOrder={31} raycast={() => null}><sphereGeometry args={[1.6, 12, 10]} /><meshBasicMaterial color="#2563eb" depthTest={false} /></mesh>
      {cursor && <>
        <Line points={[from, cursor]} color="#2563eb" lineWidth={2} dashed dashSize={2} gapSize={1.5} depthTest={false} renderOrder={30} />
        <Label a={from} b={cursor} live />
      </>}
    </group>}
    {active && cursor && <mesh position={cursor} renderOrder={32} raycast={() => null}><torusGeometry args={[2.4, 0.35, 8, 28]} /><meshBasicMaterial color="#2563eb" depthTest={false} /></mesh>}
  </>
}
