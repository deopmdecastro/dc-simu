import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'

// One scene raycast per native wheel event, even in a panel with many models.
// Weak keys never retain an event or an unmounted scene.
const hitsByEvent = new WeakMap<WheelEvent, { scene: THREE.Scene; hits: THREE.Intersection[] }>()

function visibleHit(hit: THREE.Intersection): boolean {
  const mesh = hit.object as THREE.Mesh
  if (!mesh.isMesh) return false
  for (let node: THREE.Object3D | null = mesh; node; node = node.parent) if (!node.visible) return false
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  const material = materials[hit.face?.materialIndex ?? 0]
  // An explicitly authored control proxy is pickable; invisible selection,
  // cable and terminal helpers must not swallow the physical encoder gesture.
  return !!material?.visible && (material.opacity > 0 || typeof mesh.userData.controlId === 'string')
}

/** True only for this model instance, never another clone with the same names. */
export function isInControlModel(object: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) if (node === root) return true
  return false
}

/**
 * Capture precedes OrbitControls' DOM wheel listener. Returning true consumes
 * only a real selector/encoder hit; ordinary canvas scrolling still zooms.
 * R3F's bubbling onWheel alone is too late when its event source is a parent.
 */
export function useControlWheel(handle: (hits: THREE.Intersection[], step: 1 | -1) => boolean): void {
  const { gl, camera, scene } = useThree()
  const latest = useRef(handle)
  latest.current = handle
  useEffect(() => {
    const canvas = gl.domElement, caster = new THREE.Raycaster(), pointer = new THREE.Vector2()
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.deltaY === 0) return // pinch remains a view gesture
      let cached = hitsByEvent.get(event)
      if (!cached || cached.scene !== scene) {
        const rect = canvas.getBoundingClientRect()
        if (!rect.width || !rect.height) return
        pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2)
        scene.updateMatrixWorld(true); camera.updateMatrixWorld()
        caster.setFromCamera(pointer, camera)
        cached = { scene, hits: caster.intersectObjects(scene.children, true).filter(visibleHit) }
        hitsByEvent.set(event, cached)
      }
      if (!latest.current(cached.hits, event.deltaY > 0 ? -1 : 1)) return
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    canvas.addEventListener('wheel', wheel, { capture: true, passive: false })
    return () => canvas.removeEventListener('wheel', wheel, true)
  }, [gl, camera, scene])
}
