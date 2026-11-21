import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { ElectricalComponent } from '../types'
import { getComponentModelSpec, PANEL_UNITS_PER_MM } from './modelPaths'
import { cloneModelScene, disposeModelClone, fitComponentModel } from './modelFit'
import { updateMotorBodyMotion } from './motorBodyMotion'
import {
  FLOAT_SWITCH_SIZE_MM,
  WATER_PUMP_SIZE_MM,
  waterTankDimensionsOf,
} from './hydraulicsModel'
import { Text } from './SceneText'
import MotorTerminalBoxCover3D from './MotorTerminalBoxCover3D'

const U = PANEL_UNITS_PER_MM

// ============================================================================
// 1. INTERRUPTOR DE BÓIA 3D CAD — FELIX ENERGY (fiel a image-10.png)
// ============================================================================

function createFloatSilkscreenTexture(back = false): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 384
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // Base azul cobalto do corpo flutuador
  ctx.fillStyle = '#1b49c9'
  ctx.fillRect(0, 0, 512, 384)

  // Moldura subtil do ressalto central
  ctx.strokeStyle = 'rgba(255,255,255,0.14)'
  ctx.lineWidth = 4
  ctx.strokeRect(24, 24, 464, 336)

  if (!back) {
    // Logótipo "FELIX ENERGY" fiel à referência (FELIX preto geométrico + ENERGY amarelo vivo)
    ctx.textBaseline = 'middle'
    ctx.font = '800 54px system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillStyle = '#0f172a'
    ctx.fillText('FELIX', 238, 178)
    ctx.textAlign = 'left'
    ctx.fillStyle = '#facc15'
    ctx.fillText('ENERGY', 250, 178)

    // Sub-serigrafia técnica discreta
    ctx.textAlign = 'center'
    ctx.font = '600 18px system-ui, -apple-system, sans-serif'
    ctx.fillStyle = 'rgba(226, 232, 240, 0.88)'
    ctx.fillText('FLOAT SWITCH · 16(8)A 250V~ · IP68', 256, 248)
    ctx.font = '500 15px system-ui, -apple-system, sans-serif'
    ctx.fillStyle = 'rgba(191, 219, 254, 0.78)'
    ctx.fillText('H07RN-F 3×1.0 mm² · T60 · CE', 256, 278)
  } else {
    // Verso técnico: esquema dos 3 fios (Preto COM / Castanho NA / Azul NF)
    ctx.textAlign = 'center'
    ctx.fillStyle = '#facc15'
    ctx.font = '800 26px system-ui, -apple-system, sans-serif'
    ctx.fillText('FELIX ENERGY · IP68', 256, 78)
    ctx.fillStyle = '#e2e8f0'
    ctx.font = '600 20px system-ui, -apple-system, sans-serif'
    ctx.fillText('16(8)A 250V~  50/60Hz  T60', 256, 126)
    ctx.textAlign = 'left'
    ctx.font = '600 19px system-ui, -apple-system, sans-serif'
    ctx.fillStyle = '#fde047'
    ctx.fillText('• PRETO (C): Comum', 96, 190)
    ctx.fillStyle = '#fed7aa'
    ctx.fillText('• CASTANHO (NA): Sobe / Esvaziar', 96, 232)
    ctx.fillStyle = '#93c5fd'
    ctx.fillText('• AZUL (NF): Desce / Encher', 96, 274)
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.needsUpdate = true
  return tex
}

function roundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const hw = w / 2
  const hh = h / 2
  const cr = Math.min(r, hw * 0.9, hh * 0.9)
  const s = new THREE.Shape()
  s.moveTo(-hw + cr, -hh)
  s.lineTo(hw - cr, -hh)
  s.quadraticCurveTo(hw, -hh, hw, -hh + cr)
  s.lineTo(hw, hh - cr)
  s.quadraticCurveTo(hw, hh, hw - cr, hh)
  s.lineTo(-hw + cr, hh)
  s.quadraticCurveTo(-hw, hh, -hw, hh - cr)
  s.lineTo(-hw, -hh + cr)
  s.quadraticCurveTo(-hw, -hh, -hw + cr, -hh)
  return s
}

export function FloatSwitchFelix3D({
  c,
  position,
  onToggle,
}: {
  c: ElectricalComponent
  position: [number, number, number]
  onToggle?: () => void
}) {
  const invalidate = useThree((s) => s.invalidate)
  const triggered = !!c.state.triggered
  const floatPivotRef = useRef<THREE.Group>(null)
  const currentAngle = useRef(triggered ? 0.42 : -0.22)

  const W = FLOAT_SWITCH_SIZE_MM.width * U
  const H = FLOAT_SWITCH_SIZE_MM.height * U

  const geoms = useMemo(() => {
    // Corpo do flutuador: 105 × 82 × 44 mm (escala real)
    const bodyW = 105 * U
    const bodyH = 82 * U
    const rimDepth = 16 * U
    const rimGeom = new THREE.ExtrudeGeometry(roundedRectShape(bodyW, bodyH, 24 * U), {
      depth: rimDepth,
      bevelEnabled: true,
      bevelThickness: 4 * U,
      bevelSize: 3.5 * U,
      bevelSegments: 4,
    })
    rimGeom.translate(0, 0, -rimDepth / 2)

    // Concha frontal e traseira azul cobalto (ligeiramente mais estreita para revelar o aro amarelo perimetral)
    const shellW = 92 * U
    const shellH = 70 * U
    const shellDepth = 26 * U
    const shellGeom = new THREE.ExtrudeGeometry(roundedRectShape(shellW, shellH, 20 * U), {
      depth: shellDepth,
      bevelEnabled: true,
      bevelThickness: 6 * U,
      bevelSize: 5 * U,
      bevelSegments: 5,
    })
    shellGeom.translate(0, 0, -shellDepth / 2)

    // Cabo preto flexível H07RN-F enrolado desde a bota amarela até ao contrapeso amarelo no topo
    const cablePts: THREE.Vector3[] = [
      new THREE.Vector3(-12 * U, -44 * U, 0),
      new THREE.Vector3(24 * U, -44 * U, 0),
      new THREE.Vector3(62 * U, -28 * U, 4 * U),
      new THREE.Vector3(78 * U, 12 * U, 8 * U),
      new THREE.Vector3(56 * U, 42 * U, 4 * U),
      new THREE.Vector3(20 * U, 34 * U, -4 * U),
      new THREE.Vector3(12 * U, -4 * U, -8 * U),
      new THREE.Vector3(42 * U, -24 * U, -4 * U),
      new THREE.Vector3(76 * U, -4 * U, 2 * U),
      new THREE.Vector3(82 * U, 38 * U, 6 * U),
      new THREE.Vector3(64 * U, 64 * U, 2 * U),
      new THREE.Vector3(38 * U, 62 * U, 0),
    ]
    const cableCurve = new THREE.CatmullRomCurve3(cablePts)
    const cableGeom = new THREE.TubeGeometry(cableCurve, 96, 4.4 * U, 12, false)

    // 3 fios soltos emergindo do contrapeso amarelo para a esquerda até aos 3 bornes reais (NA / C / NF)
    // Coordenadas dos bornes relativas ao centro do volume:
    // x = (0.43 - 0.5) * W = -16.8 mm; y = (0.88/0.82/0.76 - 0.5) * H = +70.3 / +59.2 / +48.1 mm
    const leadStartX = 24 * U
    const leadEndX = (0.43 - 0.5) * W + 6 * U
    const makeLead = (startY: number, endY: number) => {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(leadStartX, startY, 0),
        new THREE.Vector3((leadStartX + leadEndX) * 0.5, (startY + endY) * 0.5 + 1.5 * U, 0),
        new THREE.Vector3(leadEndX, endY, 0),
      ])
      return new THREE.TubeGeometry(curve, 18, 1.55 * U, 8, false)
    }

    const yNA = (0.88 - 0.5) * H
    const yC = (0.82 - 0.5) * H
    const yNF = (0.76 - 0.5) * H

    const leadNA = makeLead(62 * U, yNA)
    const leadC = makeLead(59 * U, yC)
    const leadNF = makeLead(56 * U, yNF)

    return { rimGeom, shellGeom, cableGeom, leadNA, leadC, leadNF, yNA, yC, yNF, leadEndX }
  }, [W, H])

  const textures = useMemo(() => ({
    front: createFloatSilkscreenTexture(false),
    back: createFloatSilkscreenTexture(true),
  }), [])

  useEffect(() => () => {
    geoms.rimGeom.dispose()
    geoms.shellGeom.dispose()
    geoms.cableGeom.dispose()
    geoms.leadNA.dispose()
    geoms.leadC.dispose()
    geoms.leadNF.dispose()
    textures.front?.dispose()
    textures.back?.dispose()
  }, [geoms, textures])

  // Animação suave da inclinação da bóia ao comutar nível
  useFrame((_, delta) => {
    const target = triggered ? 0.36 : -0.18
    const diff = target - currentAngle.current
    if (Math.abs(diff) > 0.002) {
      currentAngle.current += diff * Math.min(1, delta * 9)
      if (floatPivotRef.current) floatPivotRef.current.rotation.z = currentAngle.current
      invalidate()
    } else if (floatPivotRef.current && floatPivotRef.current.rotation.z !== target) {
      currentAngle.current = target
      floatPivotRef.current.rotation.z = target
    }
  })

  return (
    <group
      position={position}
      name={`float-switch-3d-${c.id}`}
      onClick={(e) => {
        if (!onToggle) return
        e.stopPropagation()
        onToggle()
      }}
    >
      {/* Bloco articulado do flutuador (pivô na entrada da bota prensa-cabos) */}
      <group ref={floatPivotRef} position={[-12 * U, -44 * U, 0]} rotation={[0, 0, currentAngle.current]}>
        {/* Corpo principal flutuador deslocado para a esquerda do pivô */}
        <group position={[-58 * U, 0, 0]}>
          {/* Aro perimetral amarelo industrial */}
          <mesh geometry={geoms.rimGeom} castShadow receiveShadow>
            <meshStandardMaterial color="#f5c518" roughness={0.34} metalness={0.06} />
          </mesh>
          {/* Concha azul cobalto frente e verso */}
          <mesh geometry={geoms.shellGeom} castShadow receiveShadow>
            <meshStandardMaterial color="#1d4ed8" roughness={0.32} metalness={0.08} />
          </mesh>
          {/* Serigrafia frontal FELIX ENERGY */}
          {textures.front && (
            <mesh position={[0, 0, 19.6 * U]}>
              <planeGeometry args={[68 * U, 48 * U]} />
              <meshStandardMaterial map={textures.front} roughness={0.36} metalness={0.04} />
            </mesh>
          )}
          {/* Serigrafia traseira com esquema de fios */}
          {textures.back && (
            <mesh position={[0, 0, -19.6 * U]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[68 * U, 48 * U]} />
              <meshStandardMaterial map={textures.back} roughness={0.36} metalness={0.04} />
            </mesh>
          )}
        </group>

        {/* Bota prensa-cabos amarela flexível com 5 nervuras de alívio de tensão (fiel a image-10.png) */}
        <group position={[-4 * U, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          {/* Colarinho base largo */}
          <mesh position={[0, -4 * U, 0]} castShadow>
            <cylinderGeometry args={[10.5 * U, 14.5 * U, 18 * U, 16]} />
            <meshStandardMaterial color="#f5c518" roughness={0.38} metalness={0.05} />
          </mesh>
          {/* Seção flexível cónica */}
          <mesh position={[0, 13 * U, 0]} castShadow>
            <cylinderGeometry args={[6.2 * U, 10.2 * U, 18 * U, 16]} />
            <meshStandardMaterial color="#f5c518" roughness={0.38} metalness={0.05} />
          </mesh>
          {/* 5 nervuras características de flexão */}
          {[6, 10, 14, 18, 21].map((dy, i) => (
            <mesh key={i} position={[0, dy * U, 0]}>
              <cylinderGeometry args={[(9.8 - i * 0.72) * U, (9.8 - i * 0.72) * U, 1.5 * U, 14]} />
              <meshStandardMaterial color="#ca8a04" roughness={0.45} metalness={0.05} />
            </mesh>
          ))}
        </group>
      </group>

      {/* Cabo preto H07RN-F 3×1.0 mm² em laço realista */}
      <mesh geometry={geoms.cableGeom} castShadow receiveShadow>
        <meshStandardMaterial color="#18181b" roughness={0.62} metalness={0.08} />
      </mesh>

      {/* Contrapeso cilíndrico amarelo no topo direito (fiel a image-10.png) */}
      <group position={[42 * U, 61 * U, 0]} rotation={[0, 0, Math.PI / 2]}>
        <mesh castShadow receiveShadow>
          <cylinderGeometry args={[20 * U, 20 * U, 44 * U, 24]} />
          <meshStandardMaterial color="#f5c518" roughness={0.36} metalness={0.06} />
        </mesh>
        {/* Anel/friso central de encaixe do contrapeso */}
        <mesh position={[0, 0, 0]}>
          <cylinderGeometry args={[20.6 * U, 20.6 * U, 2.2 * U, 24]} />
          <meshStandardMaterial color="#eab308" roughness={0.42} metalness={0.06} />
        </mesh>
      </group>

      {/* 3 fios coloridos soltos (Castanho NA · Preto C · Azul NF) + pontas estanhadas nos bornes */}
      <mesh geometry={geoms.leadNA} castShadow>
        <meshStandardMaterial color="#78350f" roughness={0.5} metalness={0.06} />
      </mesh>
      <mesh geometry={geoms.leadC} castShadow>
        <meshStandardMaterial color="#111827" roughness={0.55} metalness={0.06} />
      </mesh>
      <mesh geometry={geoms.leadNF} castShadow>
        <meshStandardMaterial color="#2563eb" roughness={0.48} metalness={0.06} />
      </mesh>

      {/* Pontas estanhadas (cobre/estanho) nos 3 terminais */}
      {[geoms.yNA, geoms.yC, geoms.yNF].map((ly, idx) => (
        <mesh key={idx} position={[geoms.leadEndX - 3.5 * U, ly, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.95 * U, 0.95 * U, 7.5 * U, 10]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.28} metalness={0.85} />
        </mesh>
      ))}

      {/* Etiqueta técnica discreta abaixo da bóia */}
      <Text position={[0, -H / 2 - 12 * U, 6 * U]} fontSize={0.09} color="#1e293b" anchorX="center" anchorY="top">
        {`${c.ref} · Bóia FELIX · ${triggered ? 'ALTO (C-NA)' : 'BAIXO (C-NF)'}`}
      </Text>
    </group>
  )
}

// ============================================================================
// 2. RESERVATÓRIO DE ÁGUA 3D TRANSPARENTE COM ÁGUA REALISTA (fiel a image-11.png)
// ============================================================================

function createTankScaleTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.clearRect(0, 0, 512, 512)

  // Linha vermelha tracejada "Water level line" a 85% (tal como em image-11.png)
  const maxLineY = Math.round(512 * (1 - 0.85))
  ctx.save()
  ctx.strokeStyle = '#dc2626'
  ctx.lineWidth = 4
  ctx.setLineDash([16, 10])
  ctx.beginPath()
  ctx.moveTo(20, maxLineY)
  ctx.lineTo(492, maxLineY)
  ctx.stroke()
  ctx.restore()

  ctx.fillStyle = '#1e293b'
  ctx.font = 'bold 20px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText('Nível máx. (85%)', 476, maxLineY - 12)

  // Régua vertical graduada 0%..100% no lado esquerdo frontal
  ctx.strokeStyle = 'rgba(30, 41, 59, 0.65)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(46, 26)
  ctx.lineTo(46, 486)
  ctx.stroke()

  ctx.textAlign = 'left'
  ctx.font = '700 18px system-ui, -apple-system, sans-serif'
  for (let pct = 0; pct <= 100; pct += 25) {
    const y = 486 - (pct / 100) * 460
    ctx.beginPath()
    ctx.moveTo(34, y)
    ctx.lineTo(58, y)
    ctx.stroke()
    ctx.fillText(`${pct}%`, 66, y + 6)
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.needsUpdate = true
  return tex
}

export function WaterTankTransparent3D({
  c,
  position,
  onToggleValve,
}: {
  c: ElectricalComponent
  position: [number, number, number]
  onToggleValve?: () => void
}) {
  const dims = waterTankDimensionsOf(c.state)
  const levelPct = Math.max(0, Math.min(100, Number(c.state.levelPct ?? 68)))
  const filling = !!c.state.filling || !!c.state.manualFill
  const outletOpen = !!c.state.outletValveOpen

  const R = (dims.diameterMm / 2) * U
  const H = dims.heightMm * U
  const standH = dims.standHeightMm * U
  const domeH = dims.domeHeightMm * U
  const totalW = dims.totalWidthMm * U
  const totalH = dims.totalHeightMm * U

  // Base do cilindro relativamente ao centro do volume total
  const bottomY = -totalH / 2
  const cylBottomY = bottomY + standH
  const cylCenterY = cylBottomY + H / 2
  const cylTopY = cylBottomY + H

  // Superfície animada da água (malha circular subdividida para ondas 3D contínuas)
  const waveGeom = useMemo(() => {
    const segs = 28
    const rings = 10
    const geom = new THREE.BufferGeometry()
    const positions: number[] = []
    const indices: number[] = []
    // Centro
    positions.push(0, 0, 0)
    for (let r = 1; r <= rings; r++) {
      const frac = r / rings
      for (let s = 0; s < segs; s++) {
        const ang = (s / segs) * Math.PI * 2
        positions.push(Math.cos(ang) * frac, 0, Math.sin(ang) * frac)
      }
    }
    for (let s = 0; s < segs; s++) {
      const next = (s + 1) % segs
      indices.push(0, 1 + next, 1 + s)
    }
    for (let r = 1; r < rings; r++) {
      const rowA = 1 + (r - 1) * segs
      const rowB = 1 + r * segs
      for (let s = 0; s < segs; s++) {
        const next = (s + 1) % segs
        indices.push(rowA + s, rowA + next, rowB + next)
        indices.push(rowA + s, rowB + next, rowB + s)
      }
    }
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geom.setIndex(indices)
    geom.computeVertexNormals()
    return geom
  }, [])

  const scaleTex = useMemo(() => createTankScaleTexture(), [])
  const waveMeshRef = useRef<THREE.Mesh>(null)
  const jetRef = useRef<THREE.Mesh>(null)
  const dropRef = useRef<THREE.Mesh>(null)
  const phaseRef = useRef(0)
  const { invalidate } = useThree()

  useEffect(() => () => {
    waveGeom.dispose()
    scaleTex?.dispose()
  }, [waveGeom, scaleTex])

  // Temporizador adaptativo para manter as ondas 3D vivas em frameloop="demand" sem saturar GPUs lentas
  useEffect(() => {
    if (levelPct <= 0.5) return
    const timer = window.setInterval(() => {
      invalidate()
    }, 95)
    return () => window.clearInterval(timer)
  }, [levelPct > 0.5, invalidate])

  // Animação realista das ondas 3D na superfície da água + gota/jato de enchimento
  useFrame((_state, delta) => {
    const dt = Math.min(delta, 0.12)
    phaseRef.current += dt * (filling ? 4.2 : outletOpen ? 3.2 : 2.2)
    const t = phaseRef.current
    const pos = waveGeom.attributes.position as THREE.BufferAttribute
    const amp = filling ? 0.072 : outletOpen ? 0.048 : 0.036
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const rad = Math.hypot(x, z)
      const edgeDamp = Math.max(0.42, 1 - rad * 0.25)
      const y =
        (Math.sin(x * 6.4 + t * 1.5) * 0.5 +
          Math.cos(z * 5.8 - t * 1.2) * 0.35 +
          Math.sin(rad * 11.0 - t * 2.4) * (filling ? 0.55 : 0.25)) *
        amp *
        edgeDamp
      pos.setY(i, y)
    }
    pos.needsUpdate = true
    waveGeom.computeVertexNormals()

    if (jetRef.current && filling) {
      const pulse = 0.88 + Math.sin(t * 5.2) * 0.14
      jetRef.current.scale.set(pulse, 1, pulse)
    }
    if (dropRef.current && filling) {
      const fallFrac = (t * 0.65) % 1
      dropRef.current.position.y = -fallFrac * Math.max(0.15, H * (1 - levelPct / 100) * 0.72)
    }
  })

  const waterR = R * 0.945
  const waterH = Math.max(0.01, (H * 0.96 * levelPct) / 100)
  const waterSurfaceY = cylBottomY + 0.02 + waterH
  const inletY = bottomY + totalH * 0.78
  const outletY = bottomY + totalH * 0.22
  const leftNozzleX = -totalW / 2 + totalW * 0.04
  const rightNozzleX = -totalW / 2 + totalW * 0.96
  const pipeRadius = Math.max(14 * U, R * 0.075)
  const valveSpoutX = -R * 0.34
  const valveSpoutY = inletY - pipeRadius * 1.6
  const jetHeight = Math.max(0.06, valveSpoutY - waterSurfaceY)

  return (
    <group position={position} name={`water-tank-3d-${c.id}`}>
      {/* === BASE ESTRUTURAL METÁLICA ESCURA COM PÉS (estilo image-11.png) === */}
      <group position={[0, bottomY + standH / 2, 0]}>
        {/* Plataforma / anel superior da base */}
        <mesh position={[0, standH / 2 - 14 * U, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[R * 1.06, R * 1.08, 28 * U, 32]} />
          <meshStandardMaterial color="#374151" roughness={0.62} metalness={0.42} />
        </mesh>
        {/* 4 pés estruturais inclinados + pilar central */}
        {[0, 1, 2, 3].map((i) => {
          const ang = (i * Math.PI) / 2 + Math.PI / 4
          return (
            <mesh
              key={i}
              position={[Math.cos(ang) * R * 0.76, -8 * U, Math.sin(ang) * R * 0.76]}
              rotation={[Math.sin(ang) * 0.16, 0, -Math.cos(ang) * 0.16]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[28 * U, standH, 28 * U]} />
              <meshStandardMaterial color="#334155" roughness={0.65} metalness={0.38} />
            </mesh>
          )
        })}
        <mesh position={[0, -8 * U, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[22 * U, 26 * U, standH, 16]} />
          <meshStandardMaterial color="#334155" roughness={0.65} metalness={0.38} />
        </mesh>
      </group>

      {/* === VOLUME DE ÁGUA REALISTA TRANSLÚCIDA === */}
      {levelPct > 0.5 && (
        <group>
          {/* Corpo líquido azul cobalto-turquesa com profundidade realista */}
          <mesh position={[0, cylBottomY + 0.02 + waterH / 2, 0]} renderOrder={2}>
            <cylinderGeometry args={[waterR, waterR, waterH, 36]} />
            <meshPhysicalMaterial
              userData={{ keepTransparent: true, dcSimuBodySurface: 'preserve' }}
              color="#1b7fe8"
              emissive="#0284c7"
              emissiveIntensity={0.22}
              roughness={0.12}
              metalness={0.04}
              transparent
              opacity={0.84}
              clearcoat={1}
              clearcoatRoughness={0.06}
            />
          </mesh>
          {/* Superfície superior ondulada em tempo real 3D */}
          <mesh
            ref={waveMeshRef}
            geometry={waveGeom}
            position={[0, waterSurfaceY, 0]}
            scale={[waterR, waterR, waterR]}
            renderOrder={3}
          >
            <meshPhysicalMaterial
              userData={{ keepTransparent: true, dcSimuBodySurface: 'preserve' }}
              color="#60d5ff"
              emissive="#0ea5e9"
              emissiveIntensity={0.32}
              roughness={0.06}
              metalness={0.06}
              transparent
              opacity={0.94}
              clearcoat={1}
              clearcoatRoughness={0.04}
              side={THREE.DoubleSide}
            />
          </mesh>
          {/* Menisco luminoso no contacto água-acrílico */}
          <mesh position={[0, waterSurfaceY + 0.005, 0]} rotation={[Math.PI / 2, 0, 0]} renderOrder={3}>
            <torusGeometry args={[waterR * 0.99, Math.max(4 * U, R * 0.018), 10, 42]} />
            <meshStandardMaterial
              userData={{ keepTransparent: true, dcSimuBodySurface: 'preserve' }}
              color="#e0f2fe"
              emissive="#38bdf8"
              emissiveIntensity={0.55}
              transparent
              opacity={0.9}
            />
          </mesh>
        </group>
      )}

      {/* === VÁLVULA FLUTUADORA INTERNA + JATO DE ENCHIMENTO (fiel a image-11.png) === */}
      <group position={[0, inletY, 0]}>
        {/* Tubo de entrada horizontal desde a flange esquerda até à válvula flutuadora interna */}
        <mesh position={[(leftNozzleX - R * 0.56) / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[pipeRadius, pipeRadius, Math.max(0.05, Math.abs(-R * 0.56 - leftNozzleX)), 16]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.35} metalness={0.72} />
        </mesh>
        {/* Flange exterior esquerda de ligação hidráulica (porta IN) */}
        <mesh position={[leftNozzleX + 12 * U, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[pipeRadius * 1.65, pipeRadius * 1.65, 14 * U, 18]} />
          <meshStandardMaterial color="#64748b" roughness={0.38} metalness={0.78} />
        </mesh>
        {/* Corpo azul/branco da válvula flutuadora interna */}
        <mesh position={[-R * 0.56, -R * 0.14, 0]}>
          <cylinderGeometry args={[R * 0.18, R * 0.16, R * 0.34, 20]} />
          <meshStandardMaterial color="#38bdf8" roughness={0.32} metalness={0.08} />
        </mesh>
        <mesh position={[-R * 0.56, R * 0.04, 0]}>
          <cylinderGeometry args={[R * 0.19, R * 0.19, R * 0.08, 20]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.35} metalness={0.05} />
        </mesh>
        {/* Cotovelo branco de descarga interna */}
        <mesh position={[-R * 0.44, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[pipeRadius * 0.85, pipeRadius * 0.85, R * 0.24, 14]} />
          <meshStandardMaterial color="#f1f5f9" roughness={0.35} metalness={0.05} />
        </mesh>
        <mesh position={[valveSpoutX, -pipeRadius * 0.8, 0]}>
          <cylinderGeometry args={[pipeRadius * 0.8, pipeRadius * 0.72, pipeRadius * 1.8, 14]} />
          <meshStandardMaterial color="#f1f5f9" roughness={0.35} metalness={0.05} />
        </mesh>
      </group>

      {/* Jato de água e gota animados quando o reservatório está a encher */}
      {filling && valveSpoutY > waterSurfaceY + 0.04 && (
        <group position={[valveSpoutX, valveSpoutY, 0]}>
          <mesh ref={jetRef} position={[0, -jetHeight / 2, 0]} renderOrder={4}>
            <cylinderGeometry args={[pipeRadius * 0.36, pipeRadius * 0.48, jetHeight, 12]} />
            <meshPhysicalMaterial
              userData={{ keepTransparent: true, dcSimuBodySurface: 'preserve' }}
              color="#38bdf8"
              emissive="#0ea5e9"
              emissiveIntensity={0.45}
              transparent
              opacity={0.86}
              roughness={0.08}
            />
          </mesh>
          <mesh ref={dropRef} position={[0, -0.05, 0]} renderOrder={4}>
            <sphereGeometry args={[pipeRadius * 0.65, 12, 12]} />
            <meshStandardMaterial
              userData={{ keepTransparent: true, dcSimuBodySurface: 'preserve' }}
              color="#7dd3fc"
              emissive="#38bdf8"
              emissiveIntensity={0.65}
              transparent
              opacity={0.92}
            />
          </mesh>
        </group>
      )}

      {/* === SAÍDA INFERIOR DIREITA (OUT) COM VÁLVULA DE ESFERA VERMELHA CLICÁVEL === */}
      <group position={[0, outletY, 0]}>
        <mesh position={[(R + rightNozzleX) / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[pipeRadius, pipeRadius, Math.max(0.05, rightNozzleX - R + 16 * U), 16]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.35} metalness={0.72} />
        </mesh>
        {/* Flange exterior direita */}
        <mesh position={[rightNozzleX - 12 * U, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[pipeRadius * 1.65, pipeRadius * 1.65, 14 * U, 18]} />
          <meshStandardMaterial color="#64748b" roughness={0.38} metalness={0.78} />
        </mesh>
        {/* Manípulo vermelho clicável da válvula de saída */}
        <group
          position={[R + (rightNozzleX - R) * 0.48, pipeRadius * 1.35, 0]}
          rotation={[0, outletOpen ? 0 : Math.PI / 2, 0]}
          onClick={(e) => {
            if (!onToggleValve) return
            e.stopPropagation()
            onToggleValve()
          }}
        >
          <mesh position={[0, -pipeRadius * 0.4, 0]}>
            <cylinderGeometry args={[pipeRadius * 0.32, pipeRadius * 0.32, pipeRadius * 0.9, 10]} />
            <meshStandardMaterial color="#cbd5e1" roughness={0.3} metalness={0.8} />
          </mesh>
          <mesh castShadow>
            <boxGeometry args={[pipeRadius * 3.2, pipeRadius * 0.45, pipeRadius * 0.65]} />
            <meshStandardMaterial color={outletOpen ? '#16a34a' : '#dc2626'} roughness={0.38} metalness={0.18} />
          </mesh>
        </group>
      </group>

      {/* === CORPO CILÍNDRICO TRANSPARENTE DO RESERVATÓRIO + CÚPULA SUPERIOR === */}
      <mesh position={[0, cylCenterY, 0]} renderOrder={5}>
        <cylinderGeometry args={[R, R, H, 40, 1, true]} />
        <meshPhysicalMaterial
          userData={{ keepTransparent: true, dcSimuBodySurface: 'preserve' }}
          color="#d8f0ff"
          roughness={0.05}
          metalness={0.08}
          transparent
          opacity={0.18}
          clearcoat={1}
          clearcoatRoughness={0.04}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Escala graduada 0-100% + linha vermelha de nível máximo aplicada à frente do cilindro */}
      {scaleTex && (
        <mesh position={[0, cylCenterY, 0]} renderOrder={6}>
          <cylinderGeometry args={[R * 1.005, R * 1.005, H * 0.94, 32, 1, true, -Math.PI * 0.32, Math.PI * 0.64]} />
          <meshBasicMaterial userData={{ keepTransparent: true, dcSimuBodySurface: 'preserve' }} map={scaleTex} transparent depthWrite={false} />
        </mesh>
      )}
      {/* Aros metálicos superior e inferior do tanque */}
      <mesh position={[0, cylTopY, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[R, 9 * U, 12, 42]} />
        <meshStandardMaterial color="#475569" roughness={0.42} metalness={0.62} />
      </mesh>
      <mesh position={[0, cylBottomY, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[R, 10 * U, 12, 42]} />
        <meshStandardMaterial color="#475569" roughness={0.42} metalness={0.62} />
      </mesh>
      {/* Cúpula transparente superior + tampa de inspeção */}
      <mesh position={[0, cylTopY, 0]} scale={[1, domeH / R, 1]} renderOrder={5}>
        <sphereGeometry args={[R, 36, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshPhysicalMaterial
          userData={{ keepTransparent: true, dcSimuBodySurface: 'preserve' }}
          color="#d8f0ff"
          roughness={0.06}
          metalness={0.08}
          transparent
          opacity={0.22}
          clearcoat={1}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, cylTopY + domeH * 0.96, 0]}>
        <cylinderGeometry args={[R * 0.24, R * 0.26, 18 * U, 24]} />
        <meshStandardMaterial color="#475569" roughness={0.44} metalness={0.55} />
      </mesh>

      {/* Etiqueta técnica com dimensões e volume calculado */}
      <Text position={[0, bottomY - 14 * U, R + 8 * U]} fontSize={0.11} color="#1e293b" anchorX="center" anchorY="top">
        {`${c.ref} · ${Math.round(levelPct)}% · Ø${dims.diameterMm}×${dims.heightMm}mm (${dims.volumeLiters} L)${outletOpen ? ' · Válvula ABERTA' : ''}`}
      </Text>
    </group>
  )
}

// ============================================================================
// 3. ELETROBOMBA PERIFÉRICA 3D CAD — CALPEDA CT 61 (aproveita motor SEW 3D!)
// ============================================================================

function createCalpedaNameplateTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = '#0f172a'
  ctx.fillRect(0, 0, 512, 256)
  ctx.strokeStyle = '#cbd5e1'
  ctx.lineWidth = 6
  ctx.strokeRect(10, 10, 492, 236)

  ctx.fillStyle = '#e2e8f0'
  ctx.font = '800 34px system-ui, -apple-system, sans-serif'
  ctx.fillText('CALPEDA', 28, 56)
  ctx.fillStyle = '#38bdf8'
  ctx.font = '700 26px system-ui, -apple-system, sans-serif'
  ctx.fillText('CT 61  ·  CE  ·  IP54', 240, 54)

  ctx.strokeStyle = 'rgba(203,213,225,0.4)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(26, 76)
  ctx.lineTo(486, 76)
  ctx.stroke()

  ctx.fillStyle = '#f8fafc'
  ctx.font = '600 21px monospace'
  ctx.fillText('230V~ 50Hz   2.4 A   0.37 kW (0.5 HP)', 28, 118)
  ctx.fillText('n = 2900/min   Ins.Cl. F   S1   C 10uF', 28, 158)
  ctx.fillStyle = '#7dd3fc'
  ctx.fillText('Q = 5 - 40 L/min   H = 40 - 5 m   G 1"', 28, 202)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.needsUpdate = true
  return tex
}

const CALPEDA_TEAL = '#0b748d'
const CALPEDA_TEAL_DARK = '#085b70'

export function WaterPumpCalpeda3D({
  c,
  position,
}: {
  c: ElectricalComponent
  position: [number, number, number]
}) {
  const motorSpec = getComponentModelSpec('motor3ph')!
  const { scene } = useGLTF(motorSpec.path)
  const bodyRef = useRef<THREE.Group>(null)
  const impellerRef = useRef<THREE.Group>(null)
  const vibeTime = useRef(0)

  const pumpTealHex = typeof c.bodyColor === 'string' && /^#[0-9a-f]{6}$/i.test(c.bodyColor) ? c.bodyColor : CALPEDA_TEAL
  const nameplateTex = useMemo(() => createCalpedaNameplateTexture(), [])

  // Reaproveita o modelo CAD realista do motor SEW, repintado em azul-petróleo Calpeda
  const motorModel = useMemo(() => {
    const object = cloneModelScene(scene)
    const tealCol = new THREE.Color(pumpTealHex)
    object.traverse((node: THREE.Object3D) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      const next = mats.map((m) => {
        const cloned = m.clone() as THREE.MeshStandardMaterial
        if (cloned.color) {
          // Mantém parafusos metálicos brilhantes e pinta carcaça/alhetas/caixa no azul Calpeda
          const hsl = { h: 0, s: 0, l: 0 }
          cloned.color.getHSL(hsl)
          if (!(hsl.s < 0.08 && hsl.l > 0.62)) {
            cloned.color.copy(tealCol)
            cloned.metalness = 0.44
            cloned.roughness = 0.34
          }
        }
        return cloned
      })
      mesh.material = Array.isArray(mesh.material) ? next : next[0]
      mesh.castShadow = true
      mesh.receiveShadow = true
    })
    // Escala ligeiramente compacta (0.88x) para acoplar a cabeça de bomba periférica no lado esquerdo (-X)
    const fitted = fitComponentModel(object, { ...motorSpec, targetHeight: motorSpec.targetHeight * 0.88 }, PANEL_UNITS_PER_MM, 'bottom')
    // Roda 180° em Y para que o veio fique voltado para a esquerda (-X), exatamente como em image-12.png!
    fitted.rotation.y += Math.PI
    return fitted
  }, [scene, motorSpec, pumpTealHex])

  useEffect(() => () => {
    disposeModelClone(motorModel)
    nameplateTex?.dispose()
  }, [motorModel, nameplateTex])

  const running = !!c.state.running
  const W = WATER_PUMP_SIZE_MM.width * U
  const H = WATER_PUMP_SIZE_MM.height * U
  const baseY = -H / 2

  useFrame((_, delta) => {
    const rpmVisual = running ? Math.max(1.2, Number(c.state.rpmVisual ?? 2.2)) : 0
    if (impellerRef.current && rpmVisual > 0) {
      impellerRef.current.rotation.x += rpmVisual * 14 * delta
    }
    if (bodyRef.current) {
      vibeTime.current += delta
      updateMotorBodyMotion(bodyRef.current, baseY, running, rpmVisual, vibeTime.current, delta)
    }
  })

  // Posição da cabeça da bomba periférica acoplada à frente do motor (-X)
  const headX = -W * 0.30
  const shaftY = H * 0.42
  const nozzleInX = -W * 0.47
  const nozzleOutX = -W * 0.34
  const nozzleOutTopY = H * 0.88

  return (
    <group position={position} name={`water-pump-3d-${c.id}`}>
      <group ref={bodyRef} position={[0, baseY, 0]}>
        {/* Motor 3D realista reaproveitado (posicionado à direita da cabeça da bomba) */}
        <group position={[W * 0.14, 0, 0]}>
          <primitive object={motorModel} />
          {/* Tampa da caixa de bornes destapada por defeito e tapável no Inspetor */}
          <group rotation={[0, Math.PI, 0]} scale={[0.88, 0.88, 0.88]}>
            <MotorTerminalBoxCover3D covered={!!c.state.terminalBoxCovered} color={pumpTealHex} />
          </group>
          {/* Chapa metálica CALPEDA CT 61 rebitada sobre base plana na lateral frontal da carcaça (longe das alhetas e da caixa de bornes!) */}
          {nameplateTex && (
            <group position={[0, H * 0.44, 73.5 * U]}>
              <mesh position={[0, 0, -2.5 * U]} castShadow>
                <boxGeometry args={[78 * U, 40 * U, 5 * U]} />
                <meshStandardMaterial color={pumpTealHex} roughness={0.34} metalness={0.55} />
              </mesh>
              <mesh castShadow>
                <boxGeometry args={[76 * U, 38 * U, 2.4 * U]} />
                <meshStandardMaterial color="#1e293b" roughness={0.4} metalness={0.7} />
              </mesh>
              <mesh position={[0, 0, 1.5 * U]}>
                <planeGeometry args={[72 * U, 34 * U]} />
                <meshStandardMaterial map={nameplateTex} roughness={0.32} metalness={0.28} />
              </mesh>
              {[[-32, 13], [32, 13], [-32, -13], [32, -13]].map(([rx, ry], idx) => (
                <mesh key={idx} position={[rx * U, ry * U, 1.8 * U]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[1.4 * U, 1.4 * U, 1.4 * U, 8]} />
                  <meshStandardMaterial color="#e2e8f0" roughness={0.22} metalness={0.92} />
                </mesh>
              ))}
            </group>
          )}
        </group>

        {/* === CABEÇA DE BOMBA PERIFÉRICA CAD (CALPEDA CT 61 — fiel a image-12.png) === */}
        <group position={[headX, shaftY, 0]}>
          {/* Lanterna / suporte intermédio de ligação ao motor */}
          <mesh position={[34 * U, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
            <cylinderGeometry args={[48 * U, 56 * U, 52 * U, 24]} />
            <meshStandardMaterial color={pumpTealHex} roughness={0.34} metalness={0.44} />
          </mesh>
          {/* 4 tirantes metálicos inox a unir o motor à cabeça da bomba */}
          {[[38, 38], [38, -38], [-38, 38], [-38, -38]].map(([dy, dz], idx) => (
            <mesh key={idx} position={[76 * U, dy * U, dz * U]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[3.2 * U, 3.2 * U, 128 * U, 10]} />
              <meshStandardMaterial color="#e2e8f0" roughness={0.24} metalness={0.86} />
            </mesh>
          ))}

          {/* Voluta circular principal da bomba periférica */}
          <mesh position={[-12 * U, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
            <cylinderGeometry args={[62 * U, 62 * U, 42 * U, 32]} />
            <meshStandardMaterial color={pumpTealHex} roughness={0.34} metalness={0.46} />
          </mesh>
          {/* Tampa frontal rebaixada + aro saliente + nervuras em cruz características (image-12.png) */}
          <mesh position={[-34 * U, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[52 * U, 56 * U, 8 * U, 28]} />
            <meshStandardMaterial color={CALPEDA_TEAL_DARK} roughness={0.36} metalness={0.48} />
          </mesh>
          {/* Nervuras em X na tampa frontal */}
          <mesh position={[-38 * U, 0, 0]} rotation={[Math.PI / 4, 0, 0]} castShadow>
            <boxGeometry args={[7 * U, 98 * U, 10 * U]} />
            <meshStandardMaterial color={pumpTealHex} roughness={0.34} metalness={0.45} />
          </mesh>
          <mesh position={[-38 * U, 0, 0]} rotation={[-Math.PI / 4, 0, 0]} castShadow>
            <boxGeometry args={[7 * U, 98 * U, 10 * U]} />
            <meshStandardMaterial color={pumpTealHex} roughness={0.34} metalness={0.45} />
          </mesh>
          {/* Cubo central + indicador rotativo de impulsor */}
          <mesh position={[-39 * U, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[18 * U, 20 * U, 9 * U, 20]} />
            <meshStandardMaterial color={pumpTealHex} roughness={0.32} metalness={0.48} />
          </mesh>
          <group ref={impellerRef} position={[-44 * U, 0, 0]}>
            <mesh>
              <boxGeometry args={[3 * U, 22 * U, 5 * U]} />
              <meshStandardMaterial
                color={running ? '#38bdf8' : '#cbd5e1'}
                emissive={running ? '#0ea5e9' : '#000000'}
                emissiveIntensity={running ? 0.7 : 0}
                roughness={0.3}
                metalness={0.6}
              />
            </mesh>
          </group>
          {/* 4 parafusos sextavados na periferia da tampa frontal */}
          {[[42, 42], [42, -42], [-42, 42], [-42, -42]].map(([dy, dz], idx) => (
            <mesh key={`bolt-${idx}`} position={[-38 * U, dy * U, dz * U]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[6 * U, 6 * U, 12 * U, 6]} />
              <meshStandardMaterial color="#cbd5e1" roughness={0.28} metalness={0.84} />
            </mesh>
          ))}
          {/* Bujão de escorva em latão dourado no ombro superior (fiel a image-12.png) */}
          <mesh position={[-12 * U, 58 * U, -20 * U]} castShadow>
            <cylinderGeometry args={[9 * U, 9 * U, 14 * U, 6]} />
            <meshStandardMaterial color="#d97706" roughness={0.28} metalness={0.82} />
          </mesh>
        </group>

        {/* === BOCAL DE ASPIRAÇÃO (IN — horizontal frontal/esquerda G 1") === */}
        <group position={[nozzleInX + 20 * U, shaftY + 8 * U, 0]} rotation={[0, 0, Math.PI / 2]}>
          <mesh castShadow receiveShadow>
            <cylinderGeometry args={[23 * U, 26 * U, 42 * U, 24]} />
            <meshStandardMaterial color={pumpTealHex} roughness={0.34} metalness={0.46} />
          </mesh>
          {/* Colarinho da boca roscada */}
          <mesh position={[0, 18 * U, 0]}>
            <cylinderGeometry args={[27 * U, 25 * U, 10 * U, 24]} />
            <meshStandardMaterial color={pumpTealHex} roughness={0.32} metalness={0.48} />
          </mesh>
          {/* Interior roscado escuro */}
          <mesh position={[0, 21.5 * U, 0]}>
            <cylinderGeometry args={[17 * U, 17 * U, 6 * U, 20]} />
            <meshStandardMaterial color="#0f172a" roughness={0.7} metalness={0.5} />
          </mesh>
        </group>

        {/* === BOCAL DE RECALQUE / DESCARGA (OUT — vertical superior G 1", fiel a image-12.png) === */}
        <group position={[nozzleOutX, (shaftY + nozzleOutTopY) / 2 + 12 * U, 0]}>
          <mesh castShadow receiveShadow>
            <cylinderGeometry args={[22 * U, 26 * U, Math.max(0.25, nozzleOutTopY - shaftY - 12 * U), 24]} />
            <meshStandardMaterial color={pumpTealHex} roughness={0.34} metalness={0.46} />
          </mesh>
          {/* Colarinho roscado superior */}
          <mesh position={[0, (nozzleOutTopY - shaftY - 12 * U) / 2 - 4 * U, 0]}>
            <cylinderGeometry args={[28 * U, 24 * U, 12 * U, 24]} />
            <meshStandardMaterial color={pumpTealHex} roughness={0.32} metalness={0.48} />
          </mesh>
          {/* Interior roscado escuro */}
          <mesh position={[0, (nozzleOutTopY - shaftY - 12 * U) / 2 + 1 * U, 0]}>
            <cylinderGeometry args={[17 * U, 17 * U, 5 * U, 20]} />
            <meshStandardMaterial color="#0f172a" roughness={0.7} metalness={0.5} />
          </mesh>
        </group>
      </group>

      {/* Etiqueta frontal */}
      <Text position={[0, baseY - 10 * U, (WATER_PUMP_SIZE_MM.depth / 2) * U + 6 * U]} fontSize={0.095} color="#0f172a" anchorX="center" anchorY="top">
        {`${c.ref} · Bomba CALPEDA CT 61 · ${running ? 'EM MARCHA (2900 rpm)' : 'PARADA'}`}
      </Text>
    </group>
  )
}

/** 4. Válvula de esfera hidráulica 3D (latão forjado G 1" + manípulo vermelho interativo) */
export function HydraulicValve3D({
  c,
  position,
  onToggle,
}: {
  c: ElectricalComponent
  position: [number, number, number]
  onToggle?: () => void
}) {
  const open = c.state.open !== false
  return (
    <group position={position} name={`hydraulic-valve-3d-${c.id}`}>
      {/* Corpo esférico central em latão niquelado/forjado */}
      <mesh position={[0, -14 * U, 0]} castShadow receiveShadow>
        <sphereGeometry args={[28 * U, 24, 20]} />
        <meshStandardMaterial color="#d4a029" roughness={0.3} metalness={0.82} />
      </mesh>
      {/* Porcas sextavadas laterais G 1" (IN -X / OUT +X) */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 42 * U, -14 * U, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
            <cylinderGeometry args={[23 * U, 23 * U, 28 * U, 6]} />
            <meshStandardMaterial color="#ca9522" roughness={0.28} metalness={0.84} />
          </mesh>
          <mesh position={[side * 15 * U, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[15 * U, 15 * U, 4 * U, 18]} />
            <meshStandardMaterial color="#0f172a" roughness={0.75} />
          </mesh>
        </group>
      ))}
      {/* Castelo superior e veio cromado */}
      <mesh position={[0, 14 * U, 0]} castShadow>
        <cylinderGeometry args={[12 * U, 15 * U, 24 * U, 16]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.22} metalness={0.9} />
      </mesh>
      {/* Manípulo vermelho 1/4 de volta (alinhado com tubo = aberta; 90° = fechada) */}
      <group
        position={[0, 28 * U, 0]}
        rotation={[0, open ? 0 : Math.PI / 2, 0]}
        onClick={(e) => { e.stopPropagation(); onToggle?.() }}
      >
        <mesh position={[34 * U, 6 * U, 0]} castShadow>
          <boxGeometry args={[76 * U, 10 * U, 14 * U]} />
          <meshStandardMaterial color={open ? '#dc2626' : '#991b1b'} roughness={0.38} metalness={0.12} />
        </mesh>
        <mesh castShadow>
          <cylinderGeometry args={[9 * U, 9 * U, 12 * U, 14]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.24} metalness={0.88} />
        </mesh>
      </group>
    </group>
  )
}

/** 5. União em T hidráulica latão 3 vias (A / B / C) */
export function HydraulicTee3D({
  c,
  position,
}: {
  c: ElectricalComponent
  position: [number, number, number]
}) {
  return (
    <group position={position} name={`hydraulic-tee-3d-${c.id}`}>
      {/* Corpo horizontal A (-X) ↔ B (+X) */}
      <mesh position={[0, -10 * U, 0]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[20 * U, 20 * U, 96 * U, 20]} />
        <meshStandardMaterial color="#d4a029" roughness={0.3} metalness={0.82} />
      </mesh>
      {/* Derivação vertical C (+Y) */}
      <mesh position={[0, 14 * U, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[20 * U, 20 * U, 52 * U, 20]} />
        <meshStandardMaterial color="#d4a029" roughness={0.3} metalness={0.82} />
      </mesh>
      {/* 3 colares sextavados de união */}
      {[-44 * U, 44 * U].map((xPos, i) => (
        <mesh key={i} position={[xPos, -10 * U, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[24 * U, 24 * U, 16 * U, 6]} />
          <meshStandardMaterial color="#c48e1c" roughness={0.28} metalness={0.85} />
        </mesh>
      ))}
      <mesh position={[0, 34 * U, 0]} castShadow>
        <cylinderGeometry args={[24 * U, 24 * U, 16 * U, 6]} />
        <meshStandardMaterial color="#c48e1c" roughness={0.28} metalness={0.85} />
      </mesh>
    </group>
  )
}
