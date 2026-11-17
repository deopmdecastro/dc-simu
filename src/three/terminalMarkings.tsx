import { useMemo } from 'react'
import * as THREE from 'three'
import { PANEL_UNITS_PER_MM } from './modelPaths'

const U = PANEL_UNITS_PER_MM
const NO_RAYCAST = () => {}

const markerTexCache = new Map<string, THREE.CanvasTexture>()
const MAX_CACHE = 192

function getMarkerCardTexture(text: string, isPe: boolean, disconnected: boolean): THREE.CanvasTexture {
  const clean = (text || '1').trim().slice(0, 5)
  const key = `${isPe ? 'pe' : 'zb'}:${disconnected ? 'open' : 'ok'}:${clean}`
  const hit = markerTexCache.get(key)
  if (hit) return hit

  const canvas = document.createElement('canvas')
  canvas.width = 160
  canvas.height = 176
  const ctx = canvas.getContext('2d')
  if (ctx) {
    // Cartão PA66 branco acetinado tipo Phoenix Contact Zackband ZB 8 / ZB 5
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height)
    grad.addColorStop(0, '#ffffff')
    grad.addColorStop(0.55, '#f8fafc')
    grad.addColorStop(1, '#e8eef5')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Rebordo de encaixe superior e inferior (ranhura Zackband)
    ctx.fillStyle = isPe ? '#16a34a' : disconnected ? '#f97316' : '#cbd5e1'
    ctx.fillRect(0, 0, canvas.width, isPe ? 18 : 11)
    ctx.fillRect(0, canvas.height - (isPe ? 18 : 11), canvas.width, isPe ? 18 : 11)
    if (isPe) {
      ctx.fillStyle = '#facc15'
      ctx.fillRect(canvas.width * 0.35, 0, canvas.width * 0.3, 18)
      ctx.fillRect(canvas.width * 0.35, canvas.height - 18, canvas.width * 0.3, 18)
    }

    // Moldura fina lateral
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.22)'
    ctx.lineWidth = 4
    ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4)

    // Impressão térmica preta industrial (escala automática para 1…5 caracteres)
    const len = clean.length
    const fontSize = len <= 1 ? 94 : len === 2 ? 78 : len === 3 ? 58 : len === 4 ? 46 : 38
    ctx.fillStyle = '#0f172a'
    ctx.font = `900 ${fontSize}px "DIN Alternate", "Arial Narrow", "Inter", system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(clean, canvas.width / 2, canvas.height / 2 + 2, canvas.width - 18)
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.needsUpdate = true
  if (markerTexCache.size >= MAX_CACHE) {
    const oldest = markerTexCache.keys().next().value
    if (oldest) {
      markerTexCache.get(oldest)?.dispose()
      markerTexCache.delete(oldest)
    }
  }
  markerTexCache.set(key, tex)
  return tex
}

const cardBodyMat = new THREE.MeshStandardMaterial({
  color: '#f1f5f9',
  roughness: 0.48,
  metalness: 0.02,
})

const fbsCapMat = new THREE.MeshStandardMaterial({
  color: '#c81e1e',
  roughness: 0.36,
  metalness: 0.04,
})

const fbsCopperMat = new THREE.MeshStandardMaterial({
  color: '#d4a373',
  roughness: 0.28,
  metalness: 0.82,
})

/**
 * Plaqueta de identificação ZB 8 / ZB 5 encaixada na ranhura frontal real do borne DIN
 * (referencial local `anchor = 'bottom'`: y ∈ [0, H], z ∈ [-D/2, +D/2]).
 */
export function TerminalMarkerCard3D({
  type,
  text,
  offsetX = 0,
  disconnected = false,
}: {
  type: string
  text: string
  offsetX?: number
  disconnected?: boolean
}) {
  const isPe = type === 'terminalPE'
  const tex = useMemo(() => getMarkerCardTexture(text, isPe, disconnected), [text, isPe, disconnected])
  // Cotas medidas por raycast nos GLB reais:
  //  • PTI 6 (8,15 × 66,02 × 48,5 mm): ranhura central ZB 8 em y = 32,0 mm, lábios z = 24,25 mm
  //  • Borne PE (5,15 × 48,60 × 35,25 mm): ranhura frontal ZB 5 em y = 29,0 mm, z = 16,2 mm
  const w = (isPe ? 4.35 : 6.95) * U
  const h = (isPe ? 6.0 : 7.4) * U
  const d = 0.55 * U
  const y = (isPe ? 29.0 : 32.1) * U
  const z = (isPe ? 16.55 : 24.32) * U

  return (
    <group position={[offsetX, y, z]} userData={{ terminalMarking: true, protectionMarking: true }}>
      <mesh material={cardBodyMat} raycast={NO_RAYCAST} userData={{ terminalMarking: true, protectionMarking: true }}>
        <boxGeometry args={[w, h, d]} />
      </mesh>
      <mesh position={[0, 0, d / 2 + 0.0004]} raycast={NO_RAYCAST} userData={{ terminalMarking: true, protectionMarking: true }}>
        <planeGeometry args={[w * 0.96, h * 0.96]} />
        <meshStandardMaterial map={tex} roughness={0.42} metalness={0.02} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
    </group>
  )
}

/**
 * Ponte de encaixe vermelha isolada Phoenix Contact FBS entre dois bornes adjacentes (ou pente de N pólos).
 * Posicionada no canal central de shuntagem CLIPLINE (y ≈ 40,2 mm, z ≈ 17,6 mm).
 */
export function TerminalJumperBridge3D({
  spanX,
  centerX = 0,
  baseY = 0,
  baseZ = 0,
  pinOffsetsX,
}: {
  spanX: number
  centerX?: number
  baseY?: number
  baseZ?: number
  pinOffsetsX?: number[]
}) {
  const capW = Math.max(spanX + 4.8 * U, 10 * U)
  const capH = 4.2 * U
  const capD = 3.8 * U
  const y = baseY + 39.8 * U
  const z = baseZ + 18.6 * U
  const pins = pinOffsetsX ?? [-spanX / 2, spanX / 2]

  return (
    <group position={[centerX, y, z]} userData={{ terminalMarking: true, protectionMarking: true }}>
      {/* Cabeça isolante vermelha PA66 */}
      <mesh material={fbsCapMat} castShadow raycast={NO_RAYCAST} userData={{ terminalMarking: true, protectionMarking: true }}>
        <boxGeometry args={[capW, capH, capD]} />
      </mesh>
      {/* Garfos condutores encaixados no canal de shuntagem */}
      {pins.map((px, i) => (
        <mesh
          key={i}
          position={[px, -0.6 * U, -2.6 * U]}
          material={fbsCopperMat}
          raycast={NO_RAYCAST}
          userData={{ terminalMarking: true, protectionMarking: true }}
        >
          <boxGeometry args={[2.1 * U, 2.6 * U, 3.6 * U]} />
        </mesh>
      ))}
    </group>
  )
}
