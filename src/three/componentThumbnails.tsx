/**
 * Miniaturas 3D reais da biblioteca de componentes.
 *
 * Em vez de ícones genéricos, cada item da biblioteca mostra uma miniatura
 * renderizada a partir de um modelo 3D simplificado (mesma família visual do
 * Painel 3D), gerado uma única vez por tipo e guardado em cache como PNG.
 *
 * Importante: usamos UM ÚNICO WebGLRenderer partilhado (em vez de um
 * <Canvas> por item) para não esgotar o limite de contextos WebGL do
 * navegador quando a biblioteca tem dezenas de itens visíveis ao mesmo
 * tempo. Cada miniatura é desenhada, capturada como dataURL e o resultado
 * fica em cache — depois disso não existe nenhum WebGL "vivo" por item.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { getLogo3DImages } from '../schematic/logo3DImage'
import { getProauto3DImage } from '../schematic/proauto3DImage'
import { getWeg3DImage } from '../schematic/weg3DImage'
import { getCad3DImage } from '../schematic/cad3DImage'
import { getComponentModelSpec } from './modelPaths'
import { getComponentTurntableFrames } from './componentTurntable'
import * as THREE from 'three'
import { TEMPLATES } from '../electrical/factory'
import type { ComponentType } from '../types'

// Renderizar a 128 px preserva a nitidez das miniaturas de 44 px em ecrãs HiDPI.
const SIZE = 128

const CASING = '#d7dbe0'
const CASING_DARK = '#2b2e34'
const BLACK = '#16181b'
const METAL = '#aab0ba'
const METAL_DARK = '#6b7280'
const GREEN = '#22c55e'
const RED = '#ef4444'
const AMBER = '#f59e0b'
const BLUE = '#38bdf8'
const WHITE = '#f4f6f8'
const BRASS = '#cdae55'
const NEUTRAL_BLUE = '#5b7fb5'
const PE_GREEN = '#3f9142'
const SCREEN_GREEN = '#22c55e'
const SCREEN_BLUE = '#4fc3f7'

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
const cache = new Map<string, string>()

function ensureRenderer() {
  if (renderer) return
  const canvas = document.createElement('canvas')
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setSize(SIZE, SIZE, false)
  renderer.setPixelRatio(1)
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20)
  camera.position.set(1.9, 1.55, 2.15)
  camera.lookAt(0, 0.05, 0)
  scene.add(new THREE.AmbientLight('#ffffff', 0.7))
  const key = new THREE.DirectionalLight('#ffffff', 1.0)
  key.position.set(3, 5, 4)
  scene.add(key)
  const fill = new THREE.DirectionalLight('#bcd2ff', 0.35)
  fill.position.set(-3, 1.5, -2)
  scene.add(fill)
}

function mat(color: string, opts: { metalness?: number; roughness?: number; emissive?: string; emissiveIntensity?: number; opacity?: number } = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: opts.metalness ?? 0.15,
    roughness: opts.roughness ?? 0.55,
    emissive: opts.emissive ? new THREE.Color(opts.emissive) : undefined,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    transparent: opts.opacity !== undefined,
    opacity: opts.opacity ?? 1,
  })
}

function box(g: THREE.Group, w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0, opts?: Parameters<typeof mat>[1]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts))
  m.position.set(x, y, z)
  g.add(m)
  return m
}

function cyl(g: THREE.Group, rTop: number, rBot: number, h: number, color: string, x = 0, y = 0, z = 0, opts?: Parameters<typeof mat>[1], seg = 20) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat(color, opts))
  m.position.set(x, y, z)
  g.add(m)
  return m
}

/* ------------------------------------------------------------------ formas por categoria */

function buildProtection(g: THREE.Group, type: string, st: any) {
  if (type === 'phoenixEcb3000760') {
    box(g, 0.42, 0.96, 0.38, '#17191b')
    box(g, 0.32, 0.68, 0.02, '#34383b', 0, 0.02, 0.205)
    box(g, 0.2, 0.13, 0.025, '#166534', 0, 0.19, 0.225, { emissive: '#22c55e', emissiveIntensity: 0.25 })
    box(g, 0.23, 0.035, 0.025, '#e5e7eb', 0, -0.1, 0.225)
    for (const y of [-0.38, 0.38]) cyl(g, 0.045, 0.045, 0.035, METAL, 0, y, 0.22, { metalness: 0.75, roughness: 0.25 }, 12)
    return
  }
  if (type.startsWith('fuse')) {
    cyl(g, 0.16, 0.16, 0.55, type === 'fuseHolder' ? CASING : METAL, 0, 0.12, 0, { metalness: type === 'fuseHolder' ? 0.1 : 0.6, roughness: 0.3 })
    box(g, 0.4, 0.12, 0.3, CASING_DARK, 0, -0.3, 0)
    return
  }
  if (type === 'surgeProtector') {
    box(g, 0.42, 0.8, 0.32, CASING, 0, 0, 0)
    cyl(g, 0.05, 0.05, 0.1, BLUE, 0, 0.25, 0.17, { emissive: BLUE, emissiveIntensity: 0.4 })
    return
  }
  if (type === 'thermalRelay') {
    box(g, 0.9, 0.65, 0.35, CASING, 0, 0, 0)
    cyl(g, 0.09, 0.09, 0.06, AMBER, -0.25, 0.05, 0.2, {}, 24)
    box(g, 0.6, 0.14, 0.02, BLACK, 0.1, 0.05, 0.2)
    return
  }
  const poles = st?.poles ?? 1
  const w = 0.28 + poles * 0.16
  box(g, w, 0.8, 0.34, CASING, 0, 0, 0)
  for (let i = 0; i < poles; i++) {
    const x = -w / 2 + (i + 0.5) * (w / poles)
    box(g, (w / poles) * 0.42, 0.12, 0.1, type === 'motorBreaker' ? AMBER : RED, x, 0.25, 0.19)
  }
}

function buildCommand(g: THREE.Group, type: string) {
  if (type === 'dualPushButtonNpb22D11') {
    box(g, 0.72, 0.48, 0.3, CASING_DARK, 0, -0.08, 0)
    box(g, 0.25, 0.3, 0.08, RED, -0.17, 0.08, 0.19)
    box(g, 0.25, 0.3, 0.08, GREEN, 0.17, 0.08, 0.19)
    return
  }
  if (type === 'emergencyButton' || type === 'emergencyButtonKeyP20ACR') {
    box(g, 0.5, 0.42, 0.32, CASING_DARK, 0, -0.14, 0)
    cyl(g, 0.32, 0.32, 0.1, AMBER, 0, 0.14, 0)
    cyl(g, 0.22, 0.24, 0.18, RED, 0, 0.26, 0)
    return
  }
  if (type === 'keySwitch') {
    cyl(g, 0.2, 0.2, 0.4, CASING_DARK, 0, 0, 0)
    box(g, 0.22, 0.05, 0.05, METAL, 0.2, 0.2, 0.1, { metalness: 0.7, roughness: 0.25 })
    return
  }
  if (type === 'footSwitch') {
    box(g, 0.6, 0.14, 0.5, CASING_DARK, 0, -0.2, 0)
    box(g, 0.44, 0.12, 0.34, AMBER, 0, 0, 0.02)
    return
  }
  if (type === 'limitSwitch') {
    box(g, 0.34, 0.34, 0.3, CASING, -0.1, 0, 0)
    box(g, 0.4, 0.045, 0.045, METAL_DARK, 0.28, 0.15, 0, { metalness: 0.5, roughness: 0.4 })
    cyl(g, 0.06, 0.06, 0.05, BLACK, 0.48, 0.15, 0, {}, 12)
    return
  }
  box(g, 0.4, 0.4, 0.28, CASING_DARK, 0, -0.06, 0)
  const color = type.includes('NC') ? RED : type.includes('NO') ? GREEN : METAL
  cyl(g, 0.18, 0.18, 0.14, color, 0, 0.2, 0)
}

function buildSensor(g: THREE.Group, type: string) {
  if (type === 'pressureSwitch' || type === 'thermostat') {
    box(g, 0.4, 0.4, 0.28, CASING, 0, 0, 0)
    cyl(g, 0.13, 0.13, 0.05, WHITE, 0, 0.03, 0.16, {}, 24)
    box(g, 0.02, 0.1, 0.02, RED, 0.03, 0.06, 0.19)
    return
  }
  if (type === 'floatSwitch') {
    box(g, 0.12, 0.3, 0.12, CASING_DARK, 0, 0.16, 0)
    cyl(g, 0.16, 0.16, 0.16, WHITE, 0, -0.14, 0, { metalness: 0.1, roughness: 0.35 }, 16)
    return
  }
  cyl(g, 0.13, 0.13, 0.55, METAL, 0, 0, 0, { metalness: 0.8, roughness: 0.25 })
  cyl(g, 0.13, 0.13, 0.03, type === 'photoSensor' ? RED : BLUE, 0, 0.29, 0, { emissive: type === 'photoSensor' ? RED : BLUE, emissiveIntensity: 0.6 })
}

function buildContactor(g: THREE.Group, type: string) {
  if (type === 'auxContactBlock') {
    box(g, 0.34, 0.5, 0.28, CASING, 0, 0, 0)
    box(g, 0.24, 0.34, 0.03, BLACK, 0, 0, 0.16)
    return
  }
  box(g, 0.9, 0.75, 0.5, CASING_DARK, 0, 0, 0)
  box(g, 0.7, 0.35, 0.02, '#3d4451', 0, 0.05, 0.26)
}

function buildRelay(g: THREE.Group, type: string) {
  box(g, 0.68, 0.6, 0.42, CASING, 0, 0, 0)
  box(g, 0.56, 0.42, 0.03, '#bcd8ff', 0, 0.03, 0.22, { opacity: 0.55, metalness: 0.1, roughness: 0.1 })
  if (type.startsWith('timer') || type === 'counterRelay') {
    box(g, 0.42, 0.16, 0.02, BLACK, 0, -0.16, 0.23)
  }
  if (type === 'safetyRelay') {
    box(g, 0.68, 0.08, 0.44, AMBER, 0, 0.3, 0)
  }
}

function buildSignaling(g: THREE.Group, type: string) {
  if (type === 'towerLight') {
    box(g, 0.22, 0.2, 0.22, CASING_DARK, 0, -0.4, 0)
    cyl(g, 0.16, 0.16, 0.22, RED, 0, -0.1, 0, { emissive: RED, emissiveIntensity: 0.3 }, 16)
    cyl(g, 0.16, 0.16, 0.22, AMBER, 0, 0.13, 0, { emissive: AMBER, emissiveIntensity: 0.3 }, 16)
    cyl(g, 0.16, 0.16, 0.22, GREEN, 0, 0.36, 0, { emissive: GREEN, emissiveIntensity: 0.3 }, 16)
    return
  }
  if (type === 'buzzer') {
    cyl(g, 0.28, 0.34, 0.3, CASING_DARK, 0, 0, 0, {}, 20)
    cyl(g, 0.05, 0.05, 0.32, BLACK, 0, 0, 0, {}, 8)
    return
  }
  const color = type === 'pilotLightAd22' ? RED : type.includes('Green') ? GREEN : type.includes('Red') ? RED : type.includes('Yellow') ? AMBER : WHITE
  cyl(g, 0.16, 0.2, 0.2, CASING_DARK, 0, -0.18, 0, {}, 20)
  cyl(g, 0.16, 0.16, 0.22, color, 0, 0.1, 0, { emissive: color, emissiveIntensity: 0.45 }, 20)
}

function buildMotor(g: THREE.Group) {
  cyl(g, 0.32, 0.32, 0.7, '#8b93a1', 0, 0, 0, { metalness: 0.6, roughness: 0.35 }, 24)
  for (let i = -2; i <= 2; i++) cyl(g, 0.34, 0.34, 0.05, METAL_DARK, 0, i * 0.12, 0, { metalness: 0.6, roughness: 0.4 }, 24)
  box(g, 0.3, 0.22, 0.3, CASING_DARK, 0, 0.44, 0)
  cyl(g, 0.06, 0.06, 0.22, METAL, 0, 0, 0.42, { metalness: 0.8, roughness: 0.25 }, 12)
}

function buildDrive(g: THREE.Group) {
  box(g, 0.7, 1.0, 0.4, CASING_DARK, 0, 0, 0)
  box(g, 0.5, 0.26, 0.02, SCREEN_BLUE, 0, 0.2, 0.21, { emissive: SCREEN_BLUE, emissiveIntensity: 0.45 })
  for (let i = -2; i <= 2; i++) box(g, 0.5, 0.02, 0.02, '#050607', 0, -0.15 + i * 0.06, 0.21)
}

function buildController(g: THREE.Group, type: string) {
  box(g, 1.0, 0.7, 0.32, CASING_DARK, 0, 0, 0)
  if (type === 'hmi') {
    box(g, 0.8, 0.5, 0.02, SCREEN_BLUE, 0, 0, 0.17, { emissive: SCREEN_BLUE, emissiveIntensity: 0.4 })
    return
  }
  box(g, 0.42, 0.32, 0.02, SCREEN_GREEN, -0.16, 0.05, 0.17, { emissive: SCREEN_GREEN, emissiveIntensity: 0.55 })
  box(g, 0.22, 0.5, 0.02, METAL, 0.32, 0, 0.17, { metalness: 0.3, roughness: 0.5 })
}

function buildTerminal(g: THREE.Group, type: string) {
  if (type.startsWith('busbar') || type === 'earthBar') {
    const color = type === 'busbarPhase' ? BRASS : type === 'busbarNeutral' ? NEUTRAL_BLUE : PE_GREEN
    box(g, 1.3, 0.12, 0.12, color, 0, 0, 0, { metalness: 0.5, roughness: 0.35 })
    return
  }
  const color = type === 'terminalPE' ? PE_GREEN : CASING
  for (let i = -1; i <= 1; i++) box(g, 0.18, 0.4, 0.22, color, i * 0.22, 0, 0)
}

function buildPower(g: THREE.Group, type: string) {
  if (type === 'powerSupplyProauto24A') {
    box(g, 0.62, 0.95, 0.42, '#485561')
    box(g, 0.49, 0.61, 0.025, '#dce3e7', 0, 0.03, 0.23)
    cyl(g, 0.045, 0.045, 0.03, GREEN, 0.16, -0.14, 0.26, { emissive: GREEN, emissiveIntensity: 0.5 })
    return
  }
  if (type === 'analogAmmeter') {
    cyl(g, 0.32, 0.32, 0.08, CASING_DARK, 0, 0, 0, {}, 28)
    cyl(g, 0.26, 0.26, 0.09, WHITE, 0, 0, 0.01, {}, 28)
    box(g, 0.02, 0.2, 0.02, RED, 0.03, 0.08, 0.06)
    return
  }
  if (type === 'transformer') {
    box(g, 0.8, 0.6, 0.5, '#3a3f47', 0, 0, 0)
    cyl(g, 0.14, 0.14, 0.18, '#8b93a1', -0.18, 0.39, 0, { metalness: 0.6, roughness: 0.3 }, 20)
    cyl(g, 0.14, 0.14, 0.18, '#8b93a1', 0.18, 0.39, 0, { metalness: 0.6, roughness: 0.3 }, 20)
    return
  }
  box(g, 0.7, 0.65, 0.38, CASING_DARK, 0, 0, 0)
  cyl(g, 0.03, 0.03, 0.03, BLUE, 0, 0.2, 0.2, { emissive: BLUE, emissiveIntensity: 0.7 }, 12)
}

function buildFallback(g: THREE.Group) {
  box(g, 0.6, 0.6, 0.35, CASING, 0, 0, 0)
}

function disposeGroup(g: THREE.Object3D) {
  g.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    if (mesh.material) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      materials.forEach((m) => m.dispose())
    }
  })
}

/** Gera (ou devolve do cache) uma miniatura PNG 3D real para o tipo de componente indicado. */
export function getComponentThumbnail(type: ComponentType): string {
  const cached = cache.get(type)
  if (cached) return cached

  ensureRenderer()
  if (!renderer || !scene || !camera) return ''

  const tpl = TEMPLATES[type]
  const content = new THREE.Group()
  try {
    switch (tpl?.category) {
      case 'protection': buildProtection(content, type, tpl.defaultState); break
      case 'command': buildCommand(content, type); break
      case 'sensor': buildSensor(content, type); break
      case 'contactor': buildContactor(content, type); break
      case 'relay': buildRelay(content, type); break
      case 'signaling': buildSignaling(content, type); break
      case 'motor': buildMotor(content); break
      case 'drive': buildDrive(content); break
      case 'controller': buildController(content, type); break
      case 'terminal': buildTerminal(content, type); break
      case 'power': buildPower(content, type); break
      default: buildFallback(content)
    }
  } catch {
    content.clear()
    buildFallback(content)
  }

  // enquadramento: roda primeiro, calcula a caixa envolvente já rodada,
  // centra e escala — assim qualquer forma (larga, alta, cilíndrica) fica
  // sempre enquadrada de forma consistente.
  const rotated = new THREE.Group()
  rotated.rotation.x = -0.12
  rotated.rotation.y = Math.PI / 5.5
  rotated.add(content)
  rotated.updateMatrixWorld(true)

  const bbox = new THREE.Box3().setFromObject(rotated, true)
  const size = new THREE.Vector3()
  const center = new THREE.Vector3()
  bbox.getSize(size)
  bbox.getCenter(center)
  const maxDim = Math.max(size.x, size.y, size.z) || 1
  rotated.position.sub(center)

  const holder = new THREE.Group()
  holder.add(rotated)
  holder.scale.setScalar(1.35 / maxDim)

  scene.add(holder)
  renderer.render(scene, camera)
  const url = renderer.domElement.toDataURL('image/png')
  scene.remove(holder)
  disposeGroup(holder)

  cache.set(type, url)
  return url
}

/** Miniatura 3D real de um componente da biblioteca (renderizada uma vez, depois é apenas uma imagem). */
export function ComponentThumb({ type, size = 26 }: { type: ComponentType; size?: number }) {
  const [logoSrc, setLogoSrc] = useState<string | null>(null)
  const [proautoSrc, setProautoSrc] = useState<string | null>(null)
  const [wegSrc, setWegSrc] = useState<string | null>(null)
  const [cadSrc, setCadSrc] = useState<string | null>(null)
  const fallback = useMemo(() => getComponentThumbnail(type), [type])
  useEffect(() => {
    if (type !== 'plcSiemensLogo1224RC') return
    let active = true
    getLogo3DImages().then(({ off }) => { if (active) setLogoSrc(off) }).catch(() => {
      // O renderizador procedural mantém a biblioteca utilizável sem o GLB.
    })
    return () => { active = false }
  }, [type])
  useEffect(() => {
    if (type !== 'powerSupplyProauto24A') return
    let active = true
    getProauto3DImage().then((image) => { if (active) setProautoSrc(image) }).catch(() => { /* reserva procedural */ })
    return () => { active = false }
  }, [type])
  useEffect(() => {
    if (type !== 'contactorWegCWC09') return
    let active = true
    getWeg3DImage().then((image) => { if (active) setWegSrc(image) }).catch(() => { /* reserva procedural */ })
    return () => { active = false }
  }, [type])
  useEffect(() => {
    if (!getComponentModelSpec(type) || ['plcSiemensLogo1224RC', 'powerSupplyProauto24A', 'contactorWegCWC09'].includes(type)) return
    let active = true
    setCadSrc(null)
    getCad3DImage(type).then((image) => { if (active) setCadSrc(image) }).catch(() => { /* reserva procedural */ })
    return () => { active = false }
  }, [type])
  const src = type === 'plcSiemensLogo1224RC' ? logoSrc ?? fallback
    : type === 'powerSupplyProauto24A' ? proautoSrc ?? fallback
      : type === 'contactorWegCWC09' ? wegSrc ?? fallback
        : getComponentModelSpec(type) ? cadSrc ?? fallback
          : fallback
  if (!src) return <div style={{ width: size, height: size }} className="shrink-0 rounded-[4px] bg-surface-sunken" />
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      className="shrink-0 rounded-[4px] bg-white border border-line-soft"
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  )
}

/**
 * Turntable GLB estático até o utilizador o navegar. Arrastar na horizontal
 * com rato ou dedo escolhe o ângulo; as setas permitem a mesma ação via teclado.
 */
export function InteractiveComponentThumb({ type, size = 112 }: { type: ComponentType; size?: number }) {
  const [frames, setFrames] = useState<string[]>([])
  const [frame, setFrame] = useState(0)
  const [failed, setFailed] = useState(false)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ pointerId: number; startX: number; startFrame: number } | null>(null)

  useEffect(() => {
    let active = true
    setFrames([])
    setFrame(0)
    setFailed(false)
    getComponentTurntableFrames(type)
      .then((images) => { if (active) setFrames(images) })
      .catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [type])

  const normalizedFrame = (index: number) => frames.length ? (index % frames.length + frames.length) % frames.length : 0
  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    drag.current = null
    setDragging(false)
  }
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    setFrame((index) => normalizedFrame(index + (event.key === 'ArrowLeft' ? -1 : 1)))
  }

  if (failed) return <div className="dc-real-glb-loading is-error" style={{ width: size, height: size }} aria-label="Não foi possível apresentar o modelo 3D" />
  const src = frames[frame]
  if (!src) return <div className="dc-real-glb-loading" style={{ width: size, height: size }} aria-hidden="true" />
  return (
    <div
      className={`dc-turntable-control ${dragging ? 'is-dragging' : ''}`}
      style={{ width: size, height: size }}
      role="img"
      tabIndex={0}
      aria-label="Modelo 3D. Arraste horizontalmente para girar; use também as setas esquerda e direita."
      title="Arraste para girar o modelo 3D"
      onKeyDown={onKeyDown}
      onPointerDown={(event) => {
        if (frames.length < 2) return
        drag.current = { pointerId: event.pointerId, startX: event.clientX, startFrame: frame }
        event.currentTarget.setPointerCapture(event.pointerId)
        setDragging(true)
      }}
      onPointerMove={(event) => {
        const current = drag.current
        if (!current || current.pointerId !== event.pointerId) return
        const step = Math.round((event.clientX - current.startX) / 11)
        setFrame(normalizedFrame(current.startFrame - step))
      }}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
    >
      <img
        src={src}
        width={size}
        height={size}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="dc-turntable-thumb"
      />
    </div>
  )
}
