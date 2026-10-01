import * as THREE from 'three'

/**
 * Captura de imagens do modelo do editor (miniaturas por vista e capa do componente).
 * O Viewport regista aqui uma função ligada ao renderer e ao modelo atuais; o resto da UI
 * (escolha de vistas, guardar/publicar) limita-se a pedir imagens.
 */
export type CaptureView = 'iso' | 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'current'

export interface CaptureOptions {
  view: CaptureView
  width: number
  height: number
  /** Cor de fundo (CSS). Por omissão um cinza-azulado claro, igual ao viewport. */
  background?: string
  format?: 'png' | 'jpeg'
  quality?: number
}

export type CaptureFn = (options: CaptureOptions) => string | null

let capture: CaptureFn | null = null
/** Câmara atual do viewport (para «capturar a vista atual»). */
let liveCamera: THREE.Camera | null = null

export function registerCapture(fn: CaptureFn | null, camera: THREE.Camera | null = null) {
  capture = fn
  liveCamera = camera
}

export const canCapture = () => !!capture

export function captureImage(options: CaptureOptions): string | null {
  try { return capture?.(options) ?? null } catch { return null }
}

/** Limite de caracteres da capa guardada nos metadados (JPEG em base64). */
export const COVER_LIMIT = 260_000

/** Capa do componente: vista isométrica, 480×360, JPEG. Reduz a qualidade até caber no limite. */
export function captureCover(view: CaptureView = 'iso'): string | null {
  for (const quality of [0.85, 0.72, 0.6, 0.45]) {
    const url = captureImage({ view, width: 480, height: 360, format: 'jpeg', quality })
    if (url && url.length <= COVER_LIMIT) return url
    if (!url) return null
  }
  return null
}

const FACE_DIR: Record<Exclude<CaptureView, 'iso' | 'current'>, { dir: THREE.Vector3; up: THREE.Vector3 }> = {
  front: { dir: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) },
  back: { dir: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0) },
  left: { dir: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
  right: { dir: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
  top: { dir: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, -1) },
  bottom: { dir: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 0, 1) },
}

/** Câmara que enquadra a caixa `box` na vista pedida (ortográfica nas faces, em perspetiva no resto). */
function frameCamera(box: THREE.Box3, view: CaptureView, aspect: number): THREE.Camera {
  const center = box.getCenter(new THREE.Vector3())
  const sphere = box.getBoundingSphere(new THREE.Sphere())
  const radius = Math.max(sphere.radius, 1)

  if (view !== 'iso' && view !== 'current') {
    const { dir, up } = FACE_DIR[view]
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, radius * 8)
    camera.up.copy(up)
    camera.position.copy(center).addScaledVector(dir, radius * 3)
    camera.lookAt(center)
    camera.updateMatrixWorld(true)
    // extensão da caixa no plano da imagem
    const right = new THREE.Vector3().crossVectors(up, dir).normalize()
    let halfW = 0, halfH = 0
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const delta = new THREE.Vector3(x, y, z).sub(center)
      halfW = Math.max(halfW, Math.abs(delta.dot(right)))
      halfH = Math.max(halfH, Math.abs(delta.dot(up)))
    }
    halfW = Math.max(halfW, 1) * 1.12
    halfH = Math.max(halfH, 1) * 1.12
    const halfHeight = Math.max(halfH, halfW / aspect)
    camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect; camera.top = halfHeight; camera.bottom = -halfHeight
    camera.updateProjectionMatrix()
    return camera
  }

  const camera = new THREE.PerspectiveCamera(30, aspect, 1, radius * 40)
  const dir = view === 'current' && liveCamera
    ? liveCamera.position.clone().sub(center).normalize()
    : new THREE.Vector3(0.8, 0.6, 1).normalize()
  const vFov = (camera.fov * Math.PI) / 180
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect)
  const distance = (radius * 1.08) / Math.sin(Math.min(vFov, hFov) / 2)
  camera.position.copy(center).addScaledVector(dir, distance)
  camera.lookAt(center)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld(true)
  return camera
}

/**
 * Renderiza `root` num alvo fora do ecrã e devolve um data URL.
 * `root` é movido para uma cena temporária e devolvido ao pai original no fim (tudo síncrono).
 */
export function renderCapture(renderer: THREE.WebGLRenderer, root: THREE.Object3D, options: CaptureOptions): string | null {
  const { width, height } = options
  root.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(root)
  if (box.isEmpty()) return null

  const parent = root.parent
  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight('#ffffff', '#9aa7ba', 0.95))
  const key = new THREE.DirectionalLight('#ffffff', 1.5)
  key.position.set(160, 260, 200)
  const fill = new THREE.DirectionalLight('#ffffff', 0.55)
  fill.position.set(-180, 120, -160)
  scene.add(key, fill)
  scene.add(root) // tira o modelo da cena principal (restaurado no finally)

  const previousTarget = renderer.getRenderTarget()
  const previousClear = renderer.getClearColor(new THREE.Color())
  const previousAlpha = renderer.getClearAlpha()
  const target = new THREE.WebGLRenderTarget(width, height, { samples: 4, type: THREE.UnsignedByteType })
  target.texture.colorSpace = THREE.SRGBColorSpace

  try {
    const camera = frameCamera(box, options.view, width / height)
    renderer.setRenderTarget(target)
    renderer.setClearColor(new THREE.Color(options.background ?? '#eaf0f8'), 1)
    renderer.clear()
    renderer.render(scene, camera)
    const pixels = new Uint8Array(width * height * 4)
    renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels)

    const canvas = document.createElement('canvas')
    canvas.width = width; canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const image = ctx.createImageData(width, height)
    for (let y = 0; y < height; y += 1) { // o WebGL devolve as linhas de baixo para cima
      const src = (height - 1 - y) * width * 4
      image.data.set(pixels.subarray(src, src + width * 4), y * width * 4)
    }
    ctx.putImageData(image, 0, 0)
    return options.format === 'png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', options.quality ?? 0.85)
  } finally {
    renderer.setRenderTarget(previousTarget)
    renderer.setClearColor(previousClear, previousAlpha)
    target.dispose()
    scene.remove(root)
    parent?.add(root)
  }
}
