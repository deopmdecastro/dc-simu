import * as THREE from 'three'
import type { CanvasScrollBounds, CanvasScrollView } from '../ui/canvasScroll'

export interface CameraScrollBounds extends CanvasScrollBounds { minZ: number; maxZ: number }
export interface CameraScrollMetrics { view: CanvasScrollView; bounds: CanvasScrollBounds }

/** Coordenadas no plano da câmara: X para a direita, Y para baixo, em unidades da cena. */
export function cameraScrollMetrics(camera: THREE.Camera, target: THREE.Vector3, size: { width: number; height: number }, bounds: CameraScrollBounds): CameraScrollMetrics {
  camera.updateMatrixWorld()
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
  const perspective = camera as THREE.PerspectiveCamera
  const height = 2 * camera.position.distanceTo(target) * Math.tan(THREE.MathUtils.degToRad(perspective.fov || 44) / 2) / (perspective.zoom || 1)
  const width = height * Math.max(1, size.width) / Math.max(1, size.height)
  const projected = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  for (const x of [bounds.minX, bounds.maxX]) for (const y of [bounds.minY, bounds.maxY]) for (const z of [bounds.minZ, bounds.maxZ]) {
    const point = new THREE.Vector3(x, y, z), px = point.dot(right), py = -point.dot(up)
    projected.minX = Math.min(projected.minX, px); projected.maxX = Math.max(projected.maxX, px)
    projected.minY = Math.min(projected.minY, py); projected.maxY = Math.max(projected.maxY, py)
  }
  return { view: { x: target.dot(right) - width / 2, y: -target.dot(up) - height / 2, width, height }, bounds: projected }
}

/** Mover a câmara e o alvo pela mesma translação conserva orientação, distância e zoom. */
export function panCameraToScroll(camera: THREE.Camera, target: THREE.Vector3, view: CanvasScrollView, position: { x: number; y: number }): void {
  camera.updateMatrixWorld()
  const delta = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(position.x - view.x)
    .add(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar(view.y - position.y))
  camera.position.add(delta); target.add(delta)
  camera.updateMatrixWorld()
}
