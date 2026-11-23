import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { createCompressorTankGeometry, createCompressorShroudGeometry, createCompressorTube, createCompressorSpecsGeometry, compressorShroudBulge } from './compressorGeometry'
import type { ElectricalComponent } from '../types'
import { PANEL_UNITS_PER_MM } from './modelPaths'

const U = PANEL_UNITS_PER_MM

const TANK_BLUE = '#00758b'
const COVER_BLACK = '#1a1d22'
const METAL_CAST = '#b8c0c8'
const METAL_BRASS = '#c9a24b'

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function makeCanvasTex(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  draw(ctx, w, h)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.needsUpdate = true
  return tex
}

function createMaxximLogoTexture(image: HTMLImageElement): THREE.CanvasTexture | null {
  return makeCanvasTex(768, 160, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#231f20'
    roundRect(ctx, 0, 0, w, h, 10)
    ctx.fill()
    ctx.drawImage(image, 10, 14, w - 20, h - 28)
  })
}

function createShroudSpecsTexture(): THREE.CanvasTexture | null {
  return makeCanvasTex(512, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    const cells = ['1.8', '116', '24']
    const units = ['HP', 'PSI', 'LT']
    for (let i = 0; i < 3; i++) {
      const cx = w * (0.18 + i * 0.32)
      ctx.fillStyle = '#eef2f6'
      ctx.font = '900 56px Arial, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(cells[i], cx, h * 0.38)
      ctx.font = 'bold 28px Arial, sans-serif'
      ctx.fillText(units[i], cx, h * 0.72)
      if (i < 2) {
        ctx.strokeStyle = 'rgba(238,242,246,0.85)'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(w * (0.34 + i * 0.32), h * 0.18)
        ctx.lineTo(w * (0.34 + i * 0.32), h * 0.82)
        ctx.stroke()
      }
    }
  })
}

function createBarBadgeTexture(): THREE.CanvasTexture | null {
  return makeCanvasTex(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    const cx = w / 2
    const cy = h / 2
    ctx.fillStyle = '#0b0e12'
    ctx.beginPath()
    ctx.arc(cx, cy, w * 0.46, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#f8fafc'
    ctx.lineWidth = 10
    ctx.beginPath()
    ctx.arc(cx, cy, w * 0.335, -Math.PI * 0.78, Math.PI * 0.28)
    ctx.stroke()
    const tipA = Math.PI * 0.28
    ctx.fillStyle = '#f8fafc'
    ctx.beginPath()
    ctx.moveTo(cx + w * 0.335 * Math.cos(tipA), cy + w * 0.335 * Math.sin(tipA))
    ctx.lineTo(cx + w * 0.42 * Math.cos(tipA + 0.28), cy + w * 0.42 * Math.sin(tipA + 0.28))
    ctx.lineTo(cx + w * 0.25 * Math.cos(tipA + 0.3), cy + w * 0.25 * Math.sin(tipA + 0.3))
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#f8fafc'
    ctx.font = '900 84px Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('8', cx, cy - 18)
    ctx.font = 'bold 42px Arial, sans-serif'
    ctx.fillText('Bar', cx, cy + 44)
  })
}

function createBraidedHoseTexture(): THREE.CanvasTexture | null {
  return makeCanvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#b9c2cb'
    ctx.fillRect(0, 0, w, h)
    ctx.lineCap = 'square'
    const weave = (color: string, dx: number, dir: number) => {
      ctx.strokeStyle = color
      ctx.lineWidth = 9
      for (let i = -h; i < w + h; i += 15) {
        ctx.beginPath()
        ctx.moveTo(i + dx, 0)
        ctx.lineTo(i + dx + dir * h, h)
        ctx.stroke()
      }
    }
    weave('rgba(248,250,252,0.6)', 0, 1)
    weave('rgba(96,110,124,0.55)', 7, 1)
    weave('rgba(248,250,252,0.52)', 0, -1)
    weave('rgba(96,110,124,0.5)', 7, -1)
  })
}

function createPressostatoTexture(): THREE.CanvasTexture | null {
  return makeCanvasTex(128, 224, (ctx, w, h) => {
    ctx.fillStyle = '#191b1d'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#f4f5f4'
    ctx.font = 'bold 18px Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('AVISO!', w / 2 + 10, 24)
    ctx.strokeStyle = '#f4f5f4'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(14, 10); ctx.lineTo(23, 26); ctx.lineTo(5, 26); ctx.closePath(); ctx.stroke()
    ctx.font = 'bold 12px Arial, sans-serif'
    ctx.fillText('!', 14, 23)
    ctx.fillStyle = '#087291'
    ctx.fillRect(5, 33, w - 10, h - 38)
    ctx.fillStyle = '#c6e1e5'
    for (let y = 44; y < 141; y += 8) {
      for (let x = 12; x < 110; x += 19) ctx.fillRect(x, y, 14, 2)
    }
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 15px Arial, sans-serif'
    ctx.fillText('ON', w / 2, 168)
    ctx.fillText('OFF', w / 2, 202)
  })
}

function createBarGaugeTexture(pressureBar: number, maxBar = 12): THREE.CanvasTexture | null {
  return makeCanvasTex(280, 280, (ctx, w, h) => {
    const cx = w / 2
    const cy = h / 2
    const grad = ctx.createRadialGradient(cx, cy, w * 0.08, cx, cy, w * 0.48)
    grad.addColorStop(0, '#ffffff')
    grad.addColorStop(0.85, '#eef2f6')
    grad.addColorStop(1, '#94a3b8')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(cx, cy, w * 0.46, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#64748b'
    ctx.lineWidth = 3
    ctx.stroke()
    const startA = Math.PI * 0.75
    const sweepA = Math.PI * 1.5
    for (let b = 0; b <= maxBar; b += 1) {
      const a = startA + (b / maxBar) * sweepA
      const major = b % 2 === 0
      const r1 = w * (major ? 0.33 : 0.36)
      const r2 = w * 0.42
      ctx.strokeStyle = b >= maxBar * 0.75 ? '#dc2626' : '#0f172a'
      ctx.lineWidth = major ? 2.8 : 1.4
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1)
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2)
      ctx.stroke()
      if (major) {
        ctx.fillStyle = b >= maxBar * 0.75 ? '#dc2626' : '#0f172a'
        ctx.font = 'bold 15px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(b), cx + Math.cos(a) * (w * 0.26), cy + Math.sin(a) * (w * 0.26))
      }
    }
    ctx.fillStyle = '#334155'
    ctx.font = 'bold 14px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('bar', cx, w * 0.72)
    const clamped = Math.max(0, Math.min(maxBar, pressureBar))
    const needleA = startA + (clamped / maxBar) * sweepA
    ctx.strokeStyle = '#dc2626'
    ctx.lineWidth = 4.5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(cx - Math.cos(needleA) * 12, cy - Math.sin(needleA) * 12)
    ctx.lineTo(cx + Math.cos(needleA) * (w * 0.34), cy + Math.sin(needleA) * (w * 0.34))
    ctx.stroke()
    ctx.fillStyle = '#1e293b'
    ctx.beginPath()
    ctx.arc(cx, cy, 9, 0, Math.PI * 2)
    ctx.fill()
  })
}

function createTankDecalGeometry(radiusMm: number, widthMm: number, arcMm: number): THREE.BufferGeometry {
  const radius = radiusMm * U
  const geo = new THREE.PlaneGeometry(widthMm * U, arcMm * U, 24, 8)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const ang = y / radius
    pos.setXYZ(i, x, Math.sin(ang) * radius, Math.cos(ang) * radius)
  }
  geo.computeVertexNormals()
  return geo
}

function TankDecal({
  texture,
  widthMm,
  arcMm,
  position,
  radiusMm = 95.8,
}: {
  texture: THREE.CanvasTexture | null
  widthMm: number
  arcMm: number
  position: [number, number, number]
  radiusMm?: number
}) {
  const geo = useMemo(() => createTankDecalGeometry(radiusMm, widthMm, arcMm), [radiusMm, widthMm, arcMm])
  useEffect(() => () => { geo.dispose() }, [geo])
  if (!texture) return null
  return (
    <mesh geometry={geo} position={position}>
      <meshStandardMaterial map={texture} transparent userData={{ keepTransparent: true }} side={THREE.DoubleSide} roughness={0.42} metalness={0.08} />
    </mesh>
  )
}

function GaugeFace({
  texture,
  radius = 23 * U,
}: {
  texture: THREE.CanvasTexture | null
  radius?: number
}) {
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[radius * 1.12, radius * 1.12, 10 * U, 28]} />
        <meshStandardMaterial color="#cdd6df" roughness={0.18} metalness={0.92} />
      </mesh>
      {texture && (
        <mesh position={[0, 0, 5.2 * U]}>
          <circleGeometry args={[radius, 36]} />
          <meshStandardMaterial map={texture} roughness={0.24} metalness={0.05} />
        </mesh>
      )}
      <mesh position={[0, 0, 6.2 * U]}>
        <circleGeometry args={[radius * 1.04, 36]} />
        <meshPhysicalMaterial
          color="#eef4fa"
          transparent
          opacity={0.16}
          roughness={0.06}
          metalness={0}
          userData={{ keepTransparent: true }}
        />
      </mesh>
    </group>
  )
}

function CompressorWheel({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh castShadow>
        <torusGeometry args={[47 * U, 8 * U, 16, 48]} />
        <meshStandardMaterial color="#15181d" roughness={0.62} metalness={0.12} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[47 * U, 47 * U, 18 * U, 48]} />
        <meshStandardMaterial color="#15181d" roughness={0.62} metalness={0.12} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 10 * U]}>
        <cylinderGeometry args={[42 * U, 42 * U, 3 * U, 48]} />
        <meshStandardMaterial color="#1c2128" roughness={0.5} metalness={0.2} />
      </mesh>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <mesh key={i} rotation={[0, 0, (i * Math.PI) / 4]} position={[-Math.sin(i * Math.PI / 4) * 26 * U, Math.cos(i * Math.PI / 4) * 26 * U, 14 * U]}>
          <boxGeometry args={[4 * U, 31 * U, 5 * U]} />
          <meshStandardMaterial color="#111418" roughness={0.52} metalness={0.18} />
        </mesh>
      ))}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 15 * U]}>
        <cylinderGeometry args={[13 * U, 13 * U, 10 * U, 20]} />
        <meshStandardMaterial color="#23282f" roughness={0.42} metalness={0.35} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 23 * U]}>
        <cylinderGeometry args={[7 * U, 7 * U, 7 * U, 6]} />
        <meshStandardMaterial color={METAL_BRASS} roughness={0.28} metalness={0.88} />
      </mesh>
    </group>
  )
}

/** Compressor Maxxim: proporções da fotografia, vistas e identificação do manual. */
export function AirCompressor3D({ c, position, onToggleRun, onToggleCover }: {
  c: ElectricalComponent
  position: [number, number, number]
  onToggleRun?: () => void
  onToggleCover?: () => void
}) {
  const running = Boolean(c.state.running)
  const coverOpen = Boolean(c.state.coverOpen)
  const tankBar = Math.max(0, Math.min(8, Number(c.state.tankPressureBar ?? 0)))
  const outBar = Math.max(0, Math.min(8, Number(c.state.outletPressureBar ?? tankBar * 0.92)))
  
  // --- ÁUDIO (NOVO) ---
  const { camera } = useThree()
  const listener = useRef<THREE.AudioListener>(null)
  useEffect(() => {
    if (!listener.current) {
      listener.current = new THREE.AudioListener()
      camera.add(listener.current)
    }
  }, [camera])
  
  const soundRef = useRef<THREE.PositionalAudio | null>(null)
  const [soundUrl] = useState('/sounds/compressor-running.mp3') // Ficheiro de som a ser adicionado ao public/
  const audioLoader = useRef(new THREE.AudioLoader()).current
  
  useEffect(() => {
    if (!listener.current || !running) return
    const sound = new THREE.PositionalAudio(listener.current)
    audioLoader.load(soundUrl, (buffer) => {
      sound.setBuffer(buffer)
      sound.setLoop(true)
      sound.setVolume(0.5 * (tankBar / 8)) // Volume proporcional à pressão
      sound.play()
    })
    soundRef.current = sound
    return () => { sound.stop(); sound.dispose() }
  }, [running, tankBar, listener.current, soundUrl, audioLoader])

  const logoImage = useLoader(THREE.TextureLoader, '/component-textures/maxxim-logo.png')
  const labels = useMemo(() => ({ logo: createMaxximLogoTexture(logoImage.image), specs: createShroudSpecsTexture(), badge: createBarBadgeTexture(), press: createPressostatoTexture() }), [logoImage])
  const hoseTex = useMemo(() => {
    const t = createBraidedHoseTexture()
    if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(36, 2) }
    return t
  }, [])
  const tankGauge = useMemo(() => createBarGaugeTexture(tankBar, 12), [tankBar])
  const outGauge = useMemo(() => createBarGaugeTexture(outBar, 12), [outBar])
  
  useEffect(() => () => { Object.values(labels).forEach(t => t?.dispose()); hoseTex?.dispose() }, [labels, hoseTex])
  useEffect(() => () => { tankGauge?.dispose() }, [tankGauge])
  useEffect(() => () => { outGauge?.dispose() }, [outGauge])
  
  const geometry = useMemo(() => ({
    tank: createCompressorTankGeometry(U),
    shroud: createCompressorShroudGeometry(U),
    specs: createCompressorSpecsGeometry(U),
    hose: createCompressorTube([[-163, 234, 92], [-166, 185, 100], [-172, 78, 104], [-162, 8, 106], [-130, -1, 106], [25, -3, 106], [137, -3, 103]], 5.1, U),
    handle: createCompressorTube([[164, 30, -42], [179, 111, -42], [196, 210, -42], [208, 258, -42]], 8, U),
    copper: createCompressorTube([[133, 100, 72], [134, 67, 78], [140, 25, 88], [140, 6, 96]], 2.2, U),
    rib: createCompressorTube([[-125, 185], [-60, 185], [10, 185], [63, 184]].map(([x,y]) => [x,y,74+compressorShroudBulge(x,y)]), 2.2, U),
    inset: createCompressorTube([[-122, 145], [-40, 146], [31, 146], [47, 128], [44, 103], [22, 87], [-122, 87]].map(([x,y]) => [x,y,74+compressorShroudBulge(x,y)]), 1.8, U),
    elbow: createCompressorTube([[-163, 234, 92], [-163, 253, 92], [-156, 257, 86], [-149, 249, 78]], 4, U),
  }), [])
  
  useEffect(() => () => { Object.values(geometry).forEach(g => g.dispose()) }, [geometry])
  
  const fanRef = useRef<THREE.Group>(null)
  useFrame((_, dt) => { if (fanRef.current && running) fanRef.current.rotation.x += dt * 18 })
  
  const blue = <meshStandardMaterial color={TANK_BLUE} roughness={0.36} metalness={0.35} />
  const black = <meshStandardMaterial color={COVER_BLACK} roughness={0.43} metalness={0.12} />
  const brass = <meshStandardMaterial color={METAL_BRASS} roughness={0.27} metalness={0.85} />
  const chrome = <meshStandardMaterial color="#b9c2c6" roughness={0.24} metalness={0.86} />
  
  // --- COMPONENTE DE CABO EDITÁVEL (NOVO) ---
  const EditableCable3D = ({ points, radius, unit, editable, onCurveChange, plugType, socketKey }: {
    points: [number, number, number][],
    radius: number,
    unit: number,
    editable: boolean,
    onCurveChange?: (newPoints: [number, number, number][]) => void,
    plugType?: string,
    socketKey?: string
  }) => {
    const tubeGeo = useMemo(() => createCompressorTube(points, radius / unit, unit), [points, radius, unit])
    useEffect(() => () => tubeGeo.dispose(), [tubeGeo])
    
    const plugPos = points[points.length - 1]
    
    return (
      <group>
        <mesh geometry={tubeGeo} castShadow>
          <meshStandardMaterial color="#b9c2cb" roughness={0.46} metalness={0.72} />
        </mesh>
        <mesh position={[plugPos[0] * unit, plugPos[1] * unit, plugPos[2] * unit]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[7 * unit, 7 * unit, 12 * unit, 6]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.24} metalness={0.9} />
        </mesh>
        <mesh position={[plugPos[0] * unit + 10 * unit, plugPos[1] * unit, plugPos[2] * unit]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[8 * unit, 8 * unit, 15 * unit, 20]} />
          <meshStandardMaterial color="#b9c2c6" roughness={0.24} metalness={0.86} />
        </mesh>
      </group>
    )
  }

  return (
    <group position={position} name={'air-compressor-3d-' + c.id}>
      {/* Adicionar o PositionalAudio ao grupo */}
      {soundRef.current && <primitive object={soundRef.current} attach="userData.audio" />}
      
      <group position={[0, -26 * U, 0]}>
      <mesh name="compressor-tank" geometry={geometry.tank} position={[0, -50 * U, 0]} castShadow receiveShadow>{blue}</mesh>
      {[-194, 194].map(x => <mesh key={x} position={[x * U, -50 * U, 0]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[99 * U, 1.1 * U, 8, 80]} />{blue}
      </mesh>)}
      {[-1, 1].map(side => <mesh key={side} position={[side * 226 * U, -50 * U, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[7 * U, 7 * U, 4 * U, 20]} />{blue}
      </mesh>)}
      <TankDecal texture={labels.logo} widthMm={242} arcMm={51} radiusMm={99.5} position={[-17 * U, -50 * U, 0]} />
      <TankDecal texture={labels.badge} widthMm={53} arcMm={54} radiusMm={99.5} position={[145 * U, -50 * U, 0]} />

      {/* Motor e cárter fundido: parte prateada visível à esquerda da carenagem. */}
      <group position={[-126 * U, 104 * U, 5 * U]}>
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[48 * U, 48 * U, 150 * U, 48]} /><meshStandardMaterial color={METAL_CAST} roughness={0.4} metalness={0.72} /></mesh>
        {[-69, -61, -53].map(x => <mesh key={x} position={[x * U, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[49 * U, 49 * U, 2.5 * U, 48]} />{chrome}
        </mesh>)}
        <group ref={fanRef} position={[-77 * U, 0, 0]}>
          {[0, 1, 2, 3, 4, 5].map(i => <mesh key={i} rotation={[i * Math.PI / 3, 0, 0]}><boxGeometry args={[2 * U, 70 * U, 9 * U]} />{black}</mesh>)}
        </group>
        <mesh position={[-15 * U, 0, 40 * U]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[38 * U, 38 * U, 21 * U, 48]} />{chrome}</mesh>
        {[-28, 28].flatMap(x => [-22, 22].map(y => <mesh key={x + ':' + y} position={[(x - 15) * U, y * U, 52 * U]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[3.3 * U, 3.3 * U, 3 * U, 6]} />{chrome}</mesh>))}\n      </group>
      <group position={[-151 * U, 195 * U, 9 * U]}>
        <mesh><boxGeometry args={[45 * U, 52 * U, 45 * U]} />{black}</mesh>
        {[0, 1, 2, 3, 4, 5].map(i => <mesh key={i} position={[0, (i * 8 - 20) * U, 0]}><boxGeometry args={[57 * U, 3 * U, 54 * U]} />{black}</mesh>)}
        <mesh position={[-43 * U, -18 * U, 0]}><cylinderGeometry args={[7 * U, 7 * U, 38 * U, 24]} />{black}</mesh>
      </group>
      <mesh geometry={geometry.elbow}>{brass}</mesh>
      
      {/* CABO EDITÁVEL (Substitui a mangueira estática) */}
      <EditableCable3D 
        points={geometry.hose.geometry.parameters.path || [[-163, 234, 92], [-166, 185, 100], [-172, 78, 104], [-162, 8, 106], [-130, -1, 106], [25, -3, 106], [137, -3, 103]]}
        radius={5.1}
        unit={U}
        editable={true}
        onCurveChange={(newPoints) => {
          const newGeo = createCompressorTube(newPoints, 5.1, U)
          geometry.hose.dispose()
          geometry.hose = newGeo
        }}
        plugType="socketFamatelSwitch"
        socketKey="socket-compressor"
      />

      {[[-163, 234, 92], [132, -3, 103]].map(([x,y,z],i) => <mesh key={i} position={[x*U,y*U,z*U]} rotation={i ? [0,0,Math.PI/2] : [0,0,0]}><cylinderGeometry args={[7*U,7*U,12*U,6]} />{chrome}</mesh>)}
      <group position={[143 * U, -3 * U, 103 * U]}>
        <mesh rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[8*U,8*U,15*U,20]} />{brass}</mesh>
        <mesh position={[3*U, 8*U, -3*U]}><cylinderGeometry args={[5*U,5*U,15*U,6]} />{brass}</mesh>
        <mesh position={[0, -6*U, -7*U]} rotation={[0.65,0,0]}><cylinderGeometry args={[5*U,5*U,18*U,6]} />{brass}</mesh>
      </group>
      <mesh geometry={geometry.copper}><meshStandardMaterial color="#b56f3c" roughness={0.3} metalness={0.82} /></mesh>

      <group name="compressor-cover" rotation={[0, 0, coverOpen ? 0.55 : 0]}
        onDoubleClick={e => { e.stopPropagation(); onToggleCover?.() }}>
        <mesh geometry={geometry.shroud} castShadow receiveShadow>{black}</mesh>
        <mesh geometry={geometry.rib}><meshStandardMaterial color="#262a2d" roughness={0.45} /></mesh>
        <mesh geometry={geometry.inset}><meshStandardMaterial color="#111417" roughness={0.5} /></mesh>
        {labels.specs && <mesh geometry={geometry.specs}><meshStandardMaterial map={labels.specs} transparent userData={{ keepTransparent: true }} roughness={0.5} /></mesh>}
        <mesh position={[-116*U,160*U,83*U]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[6*U,6*U,2*U,32]} />{chrome}</mesh>
        <mesh position={[-116*U,160*U,85*U]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[3.2*U,3.2*U,2*U,6]} />{chrome}</mesh>
        {[-178,-158,-138].map((x,i) => <group key={x} position={[x*U,(282-i*0.5)*U,0]} rotation={[0,0,-0.01*i]}>
          {Array.from({length:7},(_,j) => <mesh key={j} position={[0,0,(j*7-24)*U]} rotation={[0,0,-0.03]}><boxGeometry args={[16*U,1.8*U,2.2*U]} /><meshStandardMaterial color=\"#0b0d0f\" roughness={0.8} /></mesh>)}
        </group>)}\n      </group>
      {/* Chapa de montagem azul à frente, não uma barra sobre o motor. */}\n      <group position={[-57*U,44*U,78*U]}>\n        <mesh castShadow><boxGeometry args={[139*U,53*U,4*U]} />{blue}</mesh>\n        <mesh position={[35*U,17*U,2.5*U]}><boxGeometry args={[31*U,3*U,1*U]} />{black}</mesh>\n        {[-60,55].map(x => <mesh key={x} position={[x*U,18*U,4*U]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[4*U,4*U,2.5*U,20]} />{chrome}</mesh>)}\n      </group>\n\n      <mesh geometry={geometry.handle} castShadow>{blue}</mesh>\n      <mesh position={[219*U,258*U,-42*U]} rotation={[0,0,Math.PI/2]} castShadow><cylinderGeometry args={[12*U,12*U,30*U,32]} />{black}</mesh>\n      <group position={[148*U,140*U,27*U]} name=\"compressor-pressure-switch\" onDoubleClick={e => { e.stopPropagation(); onToggleRun?.() }}>
        <mesh castShadow><boxGeometry args={[58*U,76*U,46*U]} />{black}</mesh>
        <mesh position={[0,36*U,0]}><boxGeometry args={[61*U,4*U,49*U]} />{black}</mesh>
        {labels.press && <mesh position={[0,-1*U,23.4*U]}><planeGeometry args={[25*U,44*U]} /><meshStandardMaterial map={labels.press} roughness={0.5} /></mesh>}
        <mesh position={[-9*U,43*U,0]}><cylinderGeometry args={[7*U,6*U,10*U,32]} /><meshStandardMaterial color=\"#b32025\" roughness={0.4} /></mesh>
        <mesh position={[-9*U,49*U,0]}><cylinderGeometry args={[8*U,8*U,2*U,32]} /><meshStandardMaterial color=\"#cf3b3c\" roughness={0.4} /></mesh>
      </group>
      {/* Regulador e pressostato independentes, com tubos e racores expostos. */}\n      <group position={[166*U,88*U,37*U]}>\n        <mesh><cylinderGeometry args={[8*U,8*U,52*U,6]} />{brass}</mesh>\n        <mesh position={[-6*U,-28*U,0]}><cylinderGeometry args={[10*U,10*U,31*U,20]} />{blue}</mesh>\n        <group position={[-4*U,0,23*U]}><GaugeFace texture={tankGauge} radius={20*U} /></group>\n        <group position={[45*U,-4*U,20*U]}><GaugeFace texture={outGauge} radius={17*U} /></group>\n        <mesh position={[45*U,10*U,0]}><cylinderGeometry args={[13*U,11*U,24*U,24]} />{black}</mesh>\n        <mesh position={[45*U,24*U,0]}><cylinderGeometry args={[11*U,11*U,5*U,6]} />{chrome}</mesh>\n        <group position={[45*U,41*U,0]}>\n          <mesh castShadow><cylinderGeometry args={[12*U,13*U,24*U,32]} /><meshStandardMaterial color=\"#ad2024\" roughness={0.38} /></mesh>\n          {Array.from({length:16},(_,i) => { const a=i/16*Math.PI*2; return <mesh key={i} position={[Math.cos(a)*12*U,0,Math.sin(a)*12*U]} rotation={[0,-a,0]}><boxGeometry args={[2*U,22*U,2*U]} /><meshStandardMaterial color=\"#931a20\" roughness={0.48} /></mesh> })}\n        </group>\n        <group position={[64*U,0,0]} rotation={[0,0,-Math.PI/2]}>\n          {[{y:0,r:8,h:16},{y:12,r:9,h:10},{y:21,r:8,h:8}].map(({y,r,h},i) => <mesh key={i} position={[0,y*U,0]}><cylinderGeometry args={[r*U,r*U,h*U,i?32:6]} />{i?chrome:brass}</mesh>)}\n          <mesh position={[0,26*U,0]}><cylinderGeometry args={[5*U,5*U,1*U,24]} />{black}</mesh>\n        </group>\n      </group>\n\n      {[-1,1].map(side => <group key={side}>\n        <group position={[-136*U,-182*U,side*101*U]} rotation={[0,side<0?Math.PI:0,0]}><CompressorWheel position={[0,0,0]} /></group>\n        <mesh position={[-136*U,-127*U,side*80*U]} rotation={[0,0,0.12]}><boxGeometry args={[35*U,12*U,33*U]} />{blue}</mesh>\n        <mesh position={[-136*U,-175*U,side*83*U]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[7*U,7*U,40*U,24]} />{chrome}</mesh>\n      </group>)}\n      <group position={[143*U,-187*U,0]}>\n        <mesh rotation={[0,0,0.2]} castShadow><boxGeometry args={[30*U,90*U,8*U]} />{blue}</mesh>\n        <mesh position={[9*U,-39*U,-9*U]}><boxGeometry args={[31*U,8*U,28*U]} />{blue}</mesh>\n        <mesh position={[9*U,-44*U,-9*U]} castShadow><cylinderGeometry args={[16*U,17*U,12*U,40]} /><meshStandardMaterial color=\"#171a1c\" roughness={0.8} /></mesh>\n      </group>\n      <group position={[54*U,-153*U,0]}>\n        <mesh><cylinderGeometry args={[7*U,7*U,8*U,24]} />{blue}</mesh>\n        <mesh position={[0,-7*U,0]}><cylinderGeometry args={[5*U,5*U,9*U,6]} />{brass}</mesh>\n      </group>\n      </group>\n    </group>
  )
}

/**
 * Suporte em esquadro para unidade FRL (estilo Festo MS4-WR / MS4-WP): chapa de aço galvanizado de 3 mm
 * dobrada a 90°. A aba superior aparafusa por baixo do tampo da bancada (2× M6 em rasgos); a chapa
 * traseira desce por trás do FRL e prende o cabeçote com 2× M5 e espaçadores. Reforço triangular na dobra.
 * Coordenadas locais em mm à volta do centro do volume (largura X, altura Y, profundidade Z).
 */
export function PneumaticFrlBracket3D({
  c,
  position,
}: {
  c: ElectricalComponent
  position: [number, number, number]
}) {
  const d = frlBracketDimsOf(c.state)
  const W = d.widthMm, H = d.heightMm, D = d.depthMm, t = d.thicknessMm, F = d.flangeLengthMm
  const zinc = { color: '#c7cfd8', roughness: 0.36, metalness: 0.82 } as const
  const zincDark = { color: '#aeb8c3', roughness: 0.42, metalness: 0.78 } as const
  const steel = { color: '#8f9aa6', roughness: 0.3, metalness: 0.9 } as const
  const slot = { color: '#1f2933', roughness: 0.85, metalness: 0.1 } as const
  const sx = d.flangeSide === 'left' ? -1 : 1
  const flangeX = sx * (W / 2 - F / 2)
  const backZ = -D / 2 + t / 2
  const topY = H / 2 - t / 2
  const gusset = useMemo(() => {
    const s = new THREE.Shape()
    const g = Math.min(D - t, H * 0.3)
    s.moveTo(0, 0)
    s.lineTo(g, 0)
    s.lineTo(0, -g)
    s.closePath()
    const geo = new THREE.ExtrudeGeometry(s, { depth: t * U, bevelEnabled: false })
    geo.scale(U, U, 1)
    return geo
  }, [D, H, t])
  useEffect(() => () => gusset.dispose(), [gusset])
  const hex = (key: string, pos: [number, number, number], rot: [number, number, number], size = 10) => (
    <group key={key} position={pos.map((v) => v * U) as [number, number, number]} rotation={rot}>
      <mesh castShadow><cylinderGeometry args={[size * 0.62 * U, size * 0.62 * U, 1.2 * U, 20]} /><meshStandardMaterial {...steel} /></mesh>
      <mesh position={[0, 2.6 * U, 0]} castShadow><cylinderGeometry args={[size * 0.5 * U, size * 0.5 * U, 4 * U, 6]} /><meshStandardMaterial {...steel} /></mesh>
    </group>
  )
  return (
    <group position={position} name={`pneumatic-frl-bracket-3d-${c.id}`}>
      <mesh position={[0, -t / 2 * U, backZ * U]} castShadow receiveShadow>
        <boxGeometry args={[W * U, (H - t) * U, t * U]} />
        <meshStandardMaterial {...zinc} />
      </mesh>
      <mesh position={[flangeX * U, topY * U, (t / 2) * U]} castShadow receiveShadow>
        <boxGeometry args={[F * U, t * U, (D - t) * U]} />
        <meshStandardMaterial {...zinc} />
      </mesh>
      <mesh position={[flangeX * U, (H / 2 - t) * U, (-D / 2 + t) * U]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[t * U, t * U, F * U, 14, 1, false, Math.PI, Math.PI / 2]} />
        <meshStandardMaterial {...zinc} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={gusset} position={[(flangeX - sx * (F / 2 - t)) * U - (t * U) / 2, (H / 2 - t) * U, (-D / 2 + t) * U]} rotation={[0, -Math.PI / 2, 0]} castShadow>
        <meshStandardMaterial {...zincDark} />
      </mesh>
      {[-1, 1].map((k) => (
        <group key={`top-${k}`}>
          <mesh position={[(flangeX + k * F * 0.22) * U, (topY - t / 2 - 0.05) * U, (t / 2 + 4) * U]}>
            <boxGeometry args={[6.6 * U, 0.2 * U, 16 * U]} />
            <meshStandardMaterial {...slot} />
          </mesh>
          {hex(`b-top-${k}`, [flangeX + k * F * 0.22, H / 2 - t - 0.6, t / 2 + 4], [Math.PI, 0, 0], 10)}
        </group>
      ))}
      {[-1, 1].map((k) => {
        const x = d.mountXmm + k * 22
        return (
          <group key={`frl-${k}`}>
            <mesh position={[x * U, d.mountYmm * U, (backZ - t / 2 - 0.05) * U]}>
              <boxGeometry args={[5.6 * U, 18 * U, 0.2 * U]} />
              <meshStandardMaterial {...slot} />
            </mesh>
            <mesh position={[x * U, d.mountYmm * U, (backZ + t / 2 + d.standoffMm / 2) * U]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[4.2 * U, 4.2 * U, d.standoffMm * U, 6]} />
              <meshStandardMaterial {...steel} />
            </mesh>
            {hex(`b-frl-${k}`, [x, d.mountYmm, backZ - t / 2 - 0.6], [-Math.PI / 2, 0, 0], 8)}
          </group>
        )
      })}
      {[-1, 1].map((k) => (
        <mesh key={`spare-${k}`} position={[k * (W / 2 - 18) * U, (-H / 2 + 26) * U, (backZ + t / 2 + 0.05) * U]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[3.3 * U, 3.3 * U, 0.2 * U, 18]} />
          <meshStandardMaterial {...slot} />
        </mesh>
      ))}
    </group>
  )
}
