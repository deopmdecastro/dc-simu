import { memo, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { computeFactoryHallLayout, type FactoryHallSize } from './factoryPhysics'
import { factoryWallVisibility, useFactoryWalls } from './factoryWalls'

export interface FactoryWallMountBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

interface FactoryEnvironment3DProps {
  /** Centro horizontal/vertical da zona do painel elétrico. */
  center: [number, number, number]
  /** Plano Z exato da face frontal da parede onde o quadro fica fixo. */
  wallFrontZ: number
  /** Cota Y do piso industrial. */
  floorY: number
  /** Caixa do quadro/chapa montado na parede (para fixações, eletroduto e faixa de segurança). */
  mountBounds: FactoryWallMountBounds | null
  /** Extensão real de todos os equipamentos no espaço 3D (evita qualquer parede atravessar quadros ou reservatórios). */
  sceneSpan?: { minX: number; maxX: number; maxZ: number } | null
  /** Tamanho fixo da nave (m); `null` mantém o crescimento automático. */
  fixedSize?: FactoryHallSize | null
}

const NO_RAYCAST: THREE.Object3D['raycast'] = () => {}

interface PbrTexturePair {
  map: THREE.CanvasTexture
  bumpMap: THREE.CanvasTexture
  roughnessMap: THREE.CanvasTexture
}

/** Gerador determinístico rápido (LCG) para grão mineral realista sem ruído aleatório a cada render. */
function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * Pavimento industrial em betão polido / epóxi acetinado (1024×1024):
 * - Grão mineral multi-escala + manchas suaves de betão afagado a helicóptero
 * - Juntas de dilatação com bisel subtil
 * - Mapas PBR de cor, relevo (bump) e rugosidade (roughness)
 */
function createConcreteFloorPbr(): PbrTexturePair | null {
  if (typeof document === 'undefined') return null
  const size = 1024
  const cMap = document.createElement('canvas')
  const cBump = document.createElement('canvas')
  const cRough = document.createElement('canvas')
  cMap.width = cBump.width = cRough.width = size
  cMap.height = cBump.height = cRough.height = size

  const ctx = cMap.getContext('2d')
  const btx = cBump.getContext('2d')
  const rtx = cRough.getContext('2d')
  if (!ctx || !btx || !rtx) return null

  const rand = makeRng(42071)

  // Base betão industrial polido cinzento-ardósia claro
  ctx.fillStyle = '#9aa1aa'
  ctx.fillRect(0, 0, size, size)
  btx.fillStyle = '#808080'
  btx.fillRect(0, 0, size, size)
  rtx.fillStyle = '#b6b6b6' // rugosidade base ~0.71 (acetinado realista)
  rtx.fillRect(0, 0, size, size)

  // Manchas amplas de afagamento (trowel clouding) — dá aspeto fotográfico real
  for (let i = 0; i < 140; i++) {
    const x = rand() * size
    const y = rand() * size
    const r = 45 + rand() * 130
    const delta = (rand() - 0.5) * 26
    const v = Math.round(152 + delta)
    const g = ctx.createRadialGradient(x, y, 4, x, y, r)
    g.addColorStop(0, `rgba(${v}, ${v + 3}, ${v + 7}, 0.22)`)
    g.addColorStop(1, `rgba(${v}, ${v + 3}, ${v + 7}, 0)`)
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)

    // Variação correspondente de brilho/rugosidade (zonas ligeiramente mais polidas)
    const rv = Math.round(170 + (rand() - 0.5) * 58)
    const rg = rtx.createRadialGradient(x, y, 4, x, y, r)
    rg.addColorStop(0, `rgba(${rv}, ${rv}, ${rv}, 0.35)`)
    rg.addColorStop(1, `rgba(${rv}, ${rv}, ${rv}, 0)`)
    rtx.fillStyle = rg
    rtx.fillRect(x - r, y - r, r * 2, r * 2)
  }

  // Agregado mineral fino + microporos reais
  for (let i = 0; i < 9000; i++) {
    const x = rand() * size
    const y = rand() * size
    const w = 1 + rand() * 3.2
    const h = 1 + rand() * 3.2
    const dark = rand() < 0.52
    const shade = dark ? Math.round(112 + rand() * 28) : Math.round(172 + rand() * 26)
    ctx.fillStyle = `rgba(${shade}, ${shade + 2}, ${shade + 5}, ${0.09 + rand() * 0.14})`
    ctx.fillRect(x, y, w, h)

    const bv = dark ? Math.round(104 + rand() * 20) : Math.round(138 + rand() * 22)
    btx.fillStyle = `rgba(${bv}, ${bv}, ${bv}, 0.25)`
    btx.fillRect(x, y, w, h)
  }

  // Micro-riscos subtis de circulação industrial
  ctx.strokeStyle = 'rgba(218, 224, 232, 0.14)'
  ctx.lineWidth = 1
  for (let i = 0; i < 36; i++) {
    const x = rand() * size
    const y = rand() * size
    const ang = rand() * Math.PI * 2
    const len = 18 + rand() * 65
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len)
    ctx.stroke()
  }

  // Juntas de dilatação de laje industrial (2×2 por mosaico) com sulco + bisel claro
  const joints = [0, 512]
  for (const pos of joints) {
    // Sombra do sulco
    ctx.strokeStyle = 'rgba(52, 60, 72, 0.52)'
    ctx.lineWidth = 4
    ctx.beginPath(); ctx.moveTo(pos, 0); ctx.lineTo(pos, size); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, pos); ctx.lineTo(size, pos); ctx.stroke()

    // Bisel claro adjacente
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.28)'
    ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(pos + 3, 0); ctx.lineTo(pos + 3, size); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, pos + 3); ctx.lineTo(size, pos + 3); ctx.stroke()

    // Sulco profundo no bump map e rugosidade alta na junta
    btx.strokeStyle = '#282828'
    btx.lineWidth = 5
    btx.beginPath(); btx.moveTo(pos, 0); btx.lineTo(pos, size); btx.stroke()
    btx.beginPath(); btx.moveTo(0, pos); btx.lineTo(size, pos); btx.stroke()

    rtx.strokeStyle = '#f2f2f2'
    rtx.lineWidth = 6
    rtx.beginPath(); rtx.moveTo(pos, 0); rtx.lineTo(pos, size); rtx.stroke()
    rtx.beginPath(); rtx.moveTo(0, pos); rtx.lineTo(size, pos); rtx.stroke()
  }

  const configure = (canvas: HTMLCanvasElement, isColor: boolean) => {
    const tex = new THREE.CanvasTexture(canvas)
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(10, 9)
    tex.anisotropy = 8
    if (isColor) tex.colorSpace = THREE.SRGBColorSpace
    tex.needsUpdate = true
    return tex
  }

  return {
    map: configure(cMap, true),
    bumpMap: configure(cBump, false),
    roughnessMap: configure(cRough, false),
  }
}

/**
 * Paredes industriais em betão pré-fabricado arquitetónico (1024×1024):
 * - Painéis verticais e juntas horizontais reais
 * - Furos de tirante de cofragem (tie-rod cones) subtis
 * - Textura mineral real de betão à vista (cor + bump + roughness)
 */
function createConcreteWallPbr(): PbrTexturePair | null {
  if (typeof document === 'undefined') return null
  const size = 1024
  const cMap = document.createElement('canvas')
  const cBump = document.createElement('canvas')
  const cRough = document.createElement('canvas')
  cMap.width = cBump.width = cRough.width = size
  cMap.height = cBump.height = cRough.height = size

  const ctx = cMap.getContext('2d')
  const btx = cBump.getContext('2d')
  const rtx = cRough.getContext('2d')
  if (!ctx || !btx || !rtx) return null

  const rand = makeRng(9137)

  // Base betão arquitetónico claro quente (aspeto real de nave moderna)
  ctx.fillStyle = '#d3cfc7'
  ctx.fillRect(0, 0, size, size)
  btx.fillStyle = '#808080'
  btx.fillRect(0, 0, size, size)
  rtx.fillStyle = '#d8d8d8' // rugosidade ~0.85 (mate mineral real)
  rtx.fillRect(0, 0, size, size)

  // Diferença tonal subtil entre painéis pré-fabricados (4 colunas × 2 fiadas)
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      const shift = Math.round((rand() - 0.5) * 14)
      ctx.fillStyle = `rgb(${210 + shift}, ${206 + shift}, ${198 + shift})`
      ctx.fillRect(col * 256, row * 512, 256, 512)
    }
  }

  // Nuvens subtis de cura do betão
  for (let i = 0; i < 110; i++) {
    const x = rand() * size
    const y = rand() * size
    const r = 40 + rand() * 110
    const v = Math.round(200 + (rand() - 0.5) * 24)
    const g = ctx.createRadialGradient(x, y, 4, x, y, r)
    g.addColorStop(0, `rgba(${v}, ${v - 3}, ${v - 8}, 0.18)`)
    g.addColorStop(1, `rgba(${v}, ${v - 3}, ${v - 8}, 0)`)
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }

  // Textura porosa / mineral fina
  for (let i = 0; i < 8000; i++) {
    const x = rand() * size
    const y = rand() * size
    const w = 1 + rand() * 2.6
    const dark = rand() < 0.5
    const shade = dark ? Math.round(166 + rand() * 24) : Math.round(218 + rand() * 22)
    ctx.fillStyle = `rgba(${shade}, ${shade - 2}, ${shade - 6}, ${0.08 + rand() * 0.11})`
    ctx.fillRect(x, y, w, w)

    const bv = dark ? 112 : 146
    btx.fillStyle = `rgba(${bv}, ${bv}, ${bv}, 0.22)`
    btx.fillRect(x, y, w, w)
  }

  // Juntas de painel verticais e horizontais com relevo real
  for (let x = 0; x < size; x += 256) {
    ctx.strokeStyle = 'rgba(92, 96, 102, 0.42)'
    ctx.lineWidth = 4
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.32)'
    ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(x + 3, 0); ctx.lineTo(x + 3, size); ctx.stroke()

    btx.strokeStyle = '#303030'
    btx.lineWidth = 5
    btx.beginPath(); btx.moveTo(x, 0); btx.lineTo(x, size); btx.stroke()
  }
  for (let y = 0; y < size; y += 512) {
    ctx.strokeStyle = 'rgba(92, 96, 102, 0.36)'
    ctx.lineWidth = 4
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)'
    ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(0, y + 3); ctx.lineTo(size, y + 3); ctx.stroke()

    btx.strokeStyle = '#343434'
    btx.lineWidth = 5
    btx.beginPath(); btx.moveTo(0, y); btx.lineTo(size, y); btx.stroke()
  }

  // Furos de tirante (tie-rod holes) característicos de betão industrial pré-fabricado
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      for (const ox of [54, 202]) {
        for (const oy of [130, 382]) {
          const cx = col * 256 + ox
          const cy = row * 512 + oy
          ctx.fillStyle = 'rgba(94, 98, 106, 0.42)'
          ctx.beginPath(); ctx.arc(cx, cy, 4.2, 0, Math.PI * 2); ctx.fill()
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
          ctx.lineWidth = 1
          ctx.beginPath(); ctx.arc(cx + 0.8, cy + 0.8, 4.4, 0, Math.PI * 2); ctx.stroke()

          btx.fillStyle = '#3a3a3a'
          btx.beginPath(); btx.arc(cx, cy, 4.5, 0, Math.PI * 2); btx.fill()
        }
      }
    }
  }

  const configure = (canvas: HTMLCanvasElement, isColor: boolean) => {
    const tex = new THREE.CanvasTexture(canvas)
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(6, 2)
    tex.anisotropy = 8
    if (isColor) tex.colorSpace = THREE.SRGBColorSpace
    tex.needsUpdate = true
    return tex
  }

  return {
    map: configure(cMap, true),
    bumpMap: configure(cBump, false),
    roughnessMap: configure(cRough, false),
  }
}

/** Textura de faixa de segurança amarela e preta discreta (zona de acesso ao quadro elétrico). */
function createHazardStripeTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = '#eab308'
  ctx.fillRect(0, 0, 256, 64)
  ctx.fillStyle = '#1e293b'
  for (let x = -64; x < 320; x += 48) {
    ctx.beginPath()
    ctx.moveTo(x, 64)
    ctx.lineTo(x + 22, 64)
    ctx.lineTo(x + 48, 0)
    ctx.lineTo(x + 26, 0)
    ctx.closePath()
    ctx.fill()
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(5, 1)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

function createElectricalSignTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 300
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = '#facc15'
  ctx.fillRect(0, 0, 256, 300)
  ctx.strokeStyle = '#1e293b'
  ctx.lineWidth = 10
  ctx.strokeRect(10, 10, 236, 280)

  ctx.beginPath()
  ctx.moveTo(128, 38)
  ctx.lineTo(212, 182)
  ctx.lineTo(44, 182)
  ctx.closePath()
  ctx.fillStyle = '#fef08a'
  ctx.fill()
  ctx.lineWidth = 12
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#0f172a'
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(136, 78)
  ctx.lineTo(104, 132)
  ctx.lineTo(128, 132)
  ctx.lineTo(114, 168)
  ctx.lineTo(154, 118)
  ctx.lineTo(130, 118)
  ctx.closePath()
  ctx.fillStyle = '#0f172a'
  ctx.fill()

  ctx.fillStyle = '#0f172a'
  ctx.fillRect(24, 206, 208, 66)
  ctx.fillStyle = '#facc15'
  ctx.font = 'bold 26px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('PERIGO', 128, 238)
  ctx.font = 'bold 19px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = '#ffffff'
  ctx.fillText('ALTA TENSÃO', 128, 263)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

/** Pilar estrutural metálico em perfil I (H-beam) com chapa de base e chumbadouros no piso. */
function SteelColumn({
  x,
  z,
  floorY,
  height,
  rotateY = 0,
}: {
  x: number
  z: number
  floorY: number
  height: number
  rotateY?: number
}) {
  return (
    <group position={[x, floorY, z]} rotation={[0, rotateY, 0]}>
      {/* Chapa de base aparafusada ao pavimento */}
      <mesh position={[0, 0.04, 0]} receiveShadow castShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[0.72, 0.08, 0.62]} />
        <meshStandardMaterial color="#3b434f" roughness={0.55} metalness={0.68} />
      </mesh>
      {/* 4 porcas/chumbadouros */}
      {[
        [-0.25, -0.2],
        [0.25, -0.2],
        [-0.25, 0.2],
        [0.25, 0.2],
      ].map(([bx, bz], i) => (
        <mesh key={i} position={[bx, 0.095, bz]} raycast={NO_RAYCAST}>
          <cylinderGeometry args={[0.035, 0.035, 0.04, 6]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.3} metalness={0.85} />
        </mesh>
      ))}
      {/* Alma central */}
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[0.07, height, 0.34]} />
        <meshStandardMaterial color="#586372" roughness={0.48} metalness={0.62} />
      </mesh>
      {/* Abas esquerda e direita do perfil I */}
      <mesh position={[-0.17, height / 2, 0]} castShadow receiveShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[0.06, height, 0.42]} />
        <meshStandardMaterial color="#647080" roughness={0.44} metalness={0.65} />
      </mesh>
      <mesh position={[0.17, height / 2, 0]} castShadow receiveShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[0.06, height, 0.42]} />
        <meshStandardMaterial color="#647080" roughness={0.44} metalness={0.65} />
      </mesh>
    </group>
  )
}

// Cache singleton das texturas PBR da nave: evita regenerar 1024×1024 + milhares de partículas
// de betão sempre que se alterna de vista (3D ↔ Esquema ↔ GRAFCET) ou se liga/desliga o ambiente fabril.
let cachedFactoryTextures: {
  floorPbr: PbrTexturePair | null
  wallPbr: PbrTexturePair | null
  hazardTex: THREE.CanvasTexture | null
  signTex: THREE.CanvasTexture | null
} | null = null

function getSharedFactoryTextures() {
  if (!cachedFactoryTextures) {
    cachedFactoryTextures = {
      floorPbr: createConcreteFloorPbr(),
      wallPbr: createConcreteWallPbr(),
      hazardTex: createHazardStripeTexture(),
      signTex: createElectricalSignTexture(),
    }
  }
  return cachedFactoryTextures
}

/**
 * Ambiente fabril limpo e realista (sem prateleiras, camiões nem empilhadores):
 * apenas o quadro elétrico fixo na parede de betão industrial, pilares metálicos,
 * calha técnica superior e pavimento de betão polido com texturas PBR reais.
 */
export const FactoryEnvironment3D = memo(function FactoryEnvironment3D({
  center,
  wallFrontZ,
  floorY,
  mountBounds,
  sceneSpan,
  fixedSize = null,
}: FactoryEnvironment3DProps) {
  const { invalidate } = useThree()
  const { floorPbr, wallPbr, hazardTex, signTex } = useMemo(() => getSharedFactoryTextures(), [])

  useEffect(() => {
    invalidate()
  }, [invalidate, center[0], center[1], wallFrontZ, floorY, sceneSpan?.minX, sceneSpan?.maxX, sceneSpan?.maxZ, fixedSize?.widthM, fixedSize?.depthM, fixedSize?.heightM])

  // Nave industrial: automática (envolve quadros, reservatórios e máquinas, com teto) ou com tamanho fixo
  // escolhido pelo utilizador — nesse caso mover equipamentos já não faz crescer o pavilhão.
  // Sem quadro na parede, a zona do «quadro virtual» segue o centro da cena — exceto com nave fixa (fica no centro da nave).
  const virtualPanelX = fixedSize ? 0 : center[0]
  const panelMinX = mountBounds ? mountBounds.minX : virtualPanelX - 4.0
  const panelMaxX = mountBounds ? mountBounds.maxX : virtualPanelX + 4.0
  const panelMinY = mountBounds ? mountBounds.minY : floorY + 5.0
  const panelMaxY = mountBounds ? mountBounds.maxY : floorY + 12.0
  const panelCx = (panelMinX + panelMaxX) / 2
  const panelW = Math.max(2.6, panelMaxX - panelMinX)
  const { leftWallX, rightWallX, cx, hallWidth, hallDepth, wallHeight } = computeFactoryHallLayout({
    center, wallFrontZ, floorY, mountBounds, sceneSpan: fixedSize ? null : sceneSpan, fixedSize,
  })
  const wallThickness = 0.65
  const wallCenterY = floorY + wallHeight / 2
  const backWallZ = wallFrontZ - wallThickness / 2
  const floorCenterZ = wallFrontZ + hallDepth / 2 - 0.5

  const safeZoneW = Math.max(5.2, panelW + 2.6)
  const safeZoneD = 3.2
  const trayY = Math.min(floorY + wallHeight - 1.4, panelMaxY + 1.45)

  // Pilares metálicos distribuídos ao longo de toda a parede traseira (evitando sempre coincidir com o quadro!)
  const backColumnXs: number[] = []
  const colStep = 7.5
  for (let x = leftWallX + 3.2; x <= rightWallX - 3.0; x += colStep) {
    if (x < panelMinX - 1.8 || x > panelMaxX + 1.8) backColumnXs.push(x)
  }

  const leftColumnZs: number[] = []
  for (let dz = 4; dz <= hallDepth - 3.5; dz += 7.5) leftColumnZs.push(wallFrontZ + dz)

  // Paredes: Mostrar / Auto (corte do lado da câmara) / Ocultar. Atualiza só `visible`, sem re-render.
  const wallsMode = useFactoryWalls((s) => s.mode)
  const backRef = useRef<THREE.Group>(null)
  const leftRef = useRef<THREE.Group>(null)
  const rightRef = useRef<THREE.Group>(null)
  useEffect(() => { invalidate() }, [invalidate, wallsMode])
  useFrame(({ camera, gl }) => {
    const visible = factoryWallVisibility(wallsMode, camera.position, { backZ: wallFrontZ, leftX: leftWallX, rightX: rightWallX })
    let changed = false
    for (const [ref, on] of [[backRef, visible.back], [leftRef, visible.left], [rightRef, visible.right]] as const) {
      if (ref.current && ref.current.visible !== on) { ref.current.visible = on; changed = true }
    }
    // As sombras são assadas a pedido (autoUpdate = false): sem isto ficavam as sombras dos pilares escondidos.
    if (changed) { if (gl.shadowMap.enabled) gl.shadowMap.needsUpdate = true; invalidate() }
  })

  return (
    <group name="dc-simu-factory-environment">
      {/* === 1. PAVIMENTO INDUSTRIAL EM BETÃO POLIDO PBR === */}
      <mesh
        position={[cx, floorY - 0.14, floorCenterZ]}
        receiveShadow
        raycast={NO_RAYCAST}
      >
        <boxGeometry args={[hallWidth + 1.2, 0.28, hallDepth + 1.2]} />
        <meshStandardMaterial
          map={floorPbr?.map}
          bumpMap={floorPbr?.bumpMap}
          bumpScale={0.045}
          roughnessMap={floorPbr?.roughnessMap}
          roughness={0.72}
          metalness={0.08}
        />
      </mesh>

      {/* Paredes agrupadas por lado: «Paredes» (Mostrar/Auto/Ocultar) esconde cada grupo sem tocar no pavimento */}
      <group ref={backRef} name="factory-wall-back">
        {/* === 2. PAREDE TRASEIRA (BETÃO ARQUITETÓNICO PRÉ-FABRICADO) === */}
        <mesh
          position={[cx, wallCenterY, backWallZ]}
          receiveShadow
          raycast={NO_RAYCAST}
        >
          <boxGeometry args={[hallWidth + wallThickness * 2, wallHeight, wallThickness]} />
          <meshStandardMaterial
            map={wallPbr?.map}
            bumpMap={wallPbr?.bumpMap}
            bumpScale={0.055}
            roughnessMap={wallPbr?.roughnessMap}
            roughness={0.86}
            metalness={0.04}
          />
        </mesh>
        {/* Rodapé técnico industrial cinzento escuro na base das paredes */}
        <mesh position={[cx, floorY + 0.24, wallFrontZ + 0.035]} receiveShadow raycast={NO_RAYCAST}>
          <boxGeometry args={[hallWidth, 0.48, 0.07]} />
          <meshStandardMaterial color="#3c4450" roughness={0.62} metalness={0.18} />
        </mesh>
        {/* Viga metálica de coroamento no topo da parede traseira */}
        <mesh position={[cx, floorY + wallHeight - 0.22, wallFrontZ + 0.16]} castShadow receiveShadow raycast={NO_RAYCAST}>
          <boxGeometry args={[hallWidth, 0.42, 0.34]} />
          <meshStandardMaterial color="#525d6c" roughness={0.46} metalness={0.62} />
        </mesh>
        {/* === 3. PILARES ESTRUTURAIS METÁLICOS EM PERFIL I === */}
        {backColumnXs.map((x, idx) => (
          <SteelColumn key={`bcol-${idx}`} x={x} z={wallFrontZ + 0.22} floorY={floorY} height={wallHeight} />
        ))}
        {/* === 4. CALHA TÉCNICA DE CABOS + FIXAÇÃO DO QUADRO NA PAREDE === */}
          {/* Calha metálica galvanizada horizontal */}
          <mesh position={[cx, trayY, wallFrontZ + 0.17]} castShadow receiveShadow raycast={NO_RAYCAST}>
            <boxGeometry args={[hallWidth - 2, 0.24, 0.3]} />
            <meshStandardMaterial color="#8793a2" roughness={0.34} metalness={0.78} />
          </mesh>
          {/* Tampa/bordo superior da calha */}
          <mesh position={[cx, trayY + 0.13, wallFrontZ + 0.18]} raycast={NO_RAYCAST}>
            <boxGeometry args={[hallWidth - 2, 0.03, 0.32]} />
            <meshStandardMaterial color="#6e7a8a" roughness={0.38} metalness={0.8} />
          </mesh>

          {/* Orelhas de fixação do quadro elétrico (exteriores ao perímetro, sem atravessar a chapa interna) */}
          {[
            [panelMinX - 0.18, panelMaxY - 0.55],
            [panelMaxX + 0.18, panelMaxY - 0.55],
            [panelMinX - 0.18, panelMinY + 0.55],
            [panelMaxX + 0.18, panelMinY + 0.55],
          ].map(([bx, by], i) => (
            <mesh key={`br-${i}`} position={[bx, by, wallFrontZ + 0.04]} castShadow raycast={NO_RAYCAST}>
              <boxGeometry args={[0.36, 0.42, 0.08]} />
              <meshStandardMaterial color="#4b5563" roughness={0.46} metalness={0.72} />
            </mesh>
          ))}

          {/* Eletrodutos galvanizados de alimentação desde a calha superior até ao topo do quadro */}
          {trayY > panelMaxY + 0.25 && (
            <>
              <mesh
                position={[panelCx - Math.min(1.1, panelW * 0.22), (trayY + panelMaxY) / 2, wallFrontZ + 0.2]}
                castShadow
                raycast={NO_RAYCAST}
              >
                <cylinderGeometry args={[0.11, 0.11, Math.max(0.2, trayY - panelMaxY), 14]} />
                <meshStandardMaterial color="#8b96a6" roughness={0.32} metalness={0.82} />
              </mesh>
              <mesh
                position={[panelCx + Math.min(1.1, panelW * 0.22), (trayY + panelMaxY) / 2, wallFrontZ + 0.2]}
                castShadow
                raycast={NO_RAYCAST}
              >
                <cylinderGeometry args={[0.09, 0.09, Math.max(0.2, trayY - panelMaxY), 14]} />
                <meshStandardMaterial color="#8b96a6" roughness={0.32} metalness={0.82} />
              </mesh>
            </>
          )}

          {/* Placa normativa de aviso "PERIGO · ALTA TENSÃO" na parede ao lado do quadro */}
          {signTex && (
            <mesh position={[panelMaxX + 1.45, Math.max(floorY + 3.4, (panelMinY + panelMaxY) / 2 + 0.8), wallFrontZ + 0.03]} raycast={NO_RAYCAST}>
              <planeGeometry args={[1.25, 1.46]} />
              <meshStandardMaterial map={signTex} roughness={0.38} metalness={0.08} />
            </mesh>
          )}
      </group>
      <group ref={leftRef} name="factory-wall-left">
        {/* Parede lateral esquerda (betão pré-fabricado) */}
        <mesh
          position={[leftWallX - wallThickness / 2, wallCenterY, floorCenterZ]}
          receiveShadow
          raycast={NO_RAYCAST}
        >
          <boxGeometry args={[wallThickness, wallHeight, hallDepth + 0.6]} />
          <meshStandardMaterial
            map={wallPbr?.map}
            bumpMap={wallPbr?.bumpMap}
            bumpScale={0.055}
            roughnessMap={wallPbr?.roughnessMap}
            roughness={0.86}
            metalness={0.04}
          />
        </mesh>
        <mesh position={[leftWallX + 0.035, floorY + 0.24, floorCenterZ]} receiveShadow raycast={NO_RAYCAST}>
          <boxGeometry args={[0.07, 0.48, hallDepth]} />
          <meshStandardMaterial color="#3c4450" roughness={0.62} metalness={0.18} />
        </mesh>
        {leftColumnZs.map((z, idx) => (
          <SteelColumn key={`lcol-${idx}`} x={leftWallX + 0.22} z={z} floorY={floorY} height={wallHeight} rotateY={Math.PI / 2} />
        ))}
      </group>
      <group ref={rightRef} name="factory-wall-right">
        {/* Murete baixo na lateral direita para manter enquadramento isométrico limpo */}
        <mesh
          position={[rightWallX + wallThickness / 2, floorY + 0.72, floorCenterZ]}
          receiveShadow
          raycast={NO_RAYCAST}
        >
          <boxGeometry args={[wallThickness, 1.44, hallDepth + 0.6]} />
          <meshStandardMaterial
            map={wallPbr?.map}
            bumpMap={wallPbr?.bumpMap}
            bumpScale={0.045}
            roughness={0.86}
            metalness={0.04}
          />
        </mesh>
        <mesh position={[rightWallX - 0.035, floorY + 0.24, floorCenterZ]} receiveShadow raycast={NO_RAYCAST}>
          <boxGeometry args={[0.07, 0.48, hallDepth]} />
          <meshStandardMaterial color="#3c4450" roughness={0.62} metalness={0.18} />
        </mesh>
      </group>
        {/* Faixa de segurança amarela e preta no pavimento sob o quadro elétrico */}
        {hazardTex && (
          <group position={[panelCx, floorY + 0.012, wallFrontZ + safeZoneD / 2 + 0.2]}>
            {/* Bordo frontal */}
            <mesh position={[0, 0, safeZoneD / 2]} rotation={[-Math.PI / 2, 0, 0]} raycast={NO_RAYCAST}>
              <planeGeometry args={[safeZoneW, 0.22]} />
              <meshStandardMaterial map={hazardTex} roughness={0.62} />
            </mesh>
            {/* Bordos laterais esquerdo e direito */}
            <mesh position={[-safeZoneW / 2 + 0.11, 0, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} raycast={NO_RAYCAST}>
              <planeGeometry args={[safeZoneD, 0.22]} />
              <meshStandardMaterial map={hazardTex} roughness={0.62} />
            </mesh>
            <mesh position={[safeZoneW / 2 - 0.11, 0, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} raycast={NO_RAYCAST}>
              <planeGeometry args={[safeZoneD, 0.22]} />
              <meshStandardMaterial map={hazardTex} roughness={0.62} />
            </mesh>
          </group>
        )}
    </group>
  )
})
