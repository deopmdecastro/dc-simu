import * as THREE from 'three'

/**
 * Arrasto de equipamentos no pavimento em vistas rasantes.
 *
 * Com a câmara baixa, intersetar o raio do rato com o plano do chão é mal condicionado:
 * um pixel vertical corresponde a metros de profundidade (cresce com 1/sin²(elevação)) e o
 * equipamento «salta». Abaixo de ~30° o movimento passa a ser medido no ecrã, à escala do
 * próprio objeto: horizontal segue o cursor; vertical move em profundidade com o ganho da
 * perspetiva (1/sin(elevação)) limitado a `MAX_DEPTH_GAIN`.
 */
export const EXACT_PLANE_MIN_ELEVATION = 0.5 // sin(30°): acima disto a interseção com o chão é exata e estável
export const MAX_DEPTH_GAIN = 2.5

export interface FloorDragBasis {
  right: THREE.Vector3
  forward: THREE.Vector3
  /** Unidades de cena que cabem na altura do ecrã, à distância do objeto. */
  span: number
  depthGain: number
}

/** `null` quando a vista é alta o suficiente para a interseção exata com o chão. */
export function floorDragBasis(camera: THREE.Camera, origin: THREE.Vector3, elevation: number): FloorDragBasis | null {
  if (elevation >= EXACT_PLANE_MIN_ELEVATION) return null
  camera.updateMatrixWorld()
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0)
  const forward = camera.getWorldDirection(new THREE.Vector3()).setY(0)
  if (right.lengthSq() < 1e-8 || forward.lengthSq() < 1e-8) return null
  right.normalize(); forward.normalize()
  let span: number
  if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
    const o = camera as THREE.OrthographicCamera
    span = (o.top - o.bottom) / o.zoom
  } else {
    const p = camera as THREE.PerspectiveCamera
    const distance = Math.max(0.5, camera.getWorldPosition(new THREE.Vector3()).distanceTo(origin))
    span = 2 * distance * Math.tan(THREE.MathUtils.degToRad(p.fov ?? 50) / 2) / (p.zoom || 1)
  }
  const depthGain = Math.min(MAX_DEPTH_GAIN, 1 / Math.max(elevation, 1 / MAX_DEPTH_GAIN))
  return { right, forward, span, depthGain }
}

/** Deslocamento no chão (x, z) para um movimento do rato de (dx, dy) px num ecrã de `height` px. */
export function floorDragDelta(basis: FloorDragBasis, dx: number, dy: number, height: number): { x: number; z: number } {
  const perPixel = basis.span / Math.max(1, height)
  const along = dx * perPixel
  const depth = -dy * perPixel * basis.depthGain // subir o rato afasta o equipamento da câmara
  return {
    x: basis.right.x * along + basis.forward.x * depth,
    z: basis.right.z * along + basis.forward.z * depth,
  }
}
