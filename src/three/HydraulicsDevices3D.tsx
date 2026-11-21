import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { RoundedBox, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { FontLoader, type FontData } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import embossFont from 'three/examples/fonts/helvetiker_bold.typeface.json'
import type { ElectricalComponent } from '../types'
import { getComponentModelSpec, PANEL_UNITS_PER_MM } from './modelPaths'
import { cloneModelScene, disposeModelClone, fitComponentModel } from './modelFit'
import { updateMotorBodyMotion } from './motorBodyMotion'
import {
  FLOAT_SWITCH_SIZE_MM,
  WATER_PUMP_SIZE_MM,
  flowMeterSpecOf,
  waterTankDimensionsOf,
} from './hydraulicsModel'
import { useSimStore } from '../store/useSimStore'
import { tankHasJunctionBracket, tankJunctionBracketOf, type TankJunctionBracket } from './hydraulicsModel'
import { InlineWagoSplices3D, type WagoSpliceCable } from './JunctionWagoDevices3D'
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

export interface FloatSwitchTankContext {
  /** Raio interior do reservatório (unidades 3D) */
  tankRadius: number
  /** Altura útil da coluna de água (unidades 3D) */
  tankHeight: number
  /** Nível atual da água no reservatório (0–100%) */
  waterLevelPct: number
  /** Profundidade / cota do contrapeso onde a bóia bascula (10–92%) */
  mountDepthPct: number
  /** Lado de instalação no interior da tampa (-1 esq, 0 centro, +1 dir) */
  sideSign: number
  /** Destino externo do cabo da bóia (coordenadas locais desde o prensa-cabo até à caixa OBO exterior) */
  externalCableTarget?: [number, number, number] | null
}

export function FloatSwitchFelix3D({
  c,
  position,
  onToggle,
  tankContext,
}: {
  c: ElectricalComponent
  position: [number, number, number]
  onToggle?: () => void
  tankContext?: FloatSwitchTankContext | null
}) {
  const invalidate = useThree((s) => s.invalidate)
  const triggered = !!c.state.triggered
  const floatPivotRef = useRef<THREE.Group>(null)
  const bobPhaseRef = useRef(0)
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

  // Animação suave da inclinação da bóia ao comutar nível + flutuação viva sobre a superfície da água no tanque
  useFrame((_, delta) => {
    if (tankContext) {
      bobPhaseRef.current += Math.min(delta, 0.1) * 3.1
    }
    const target = tankContext
      ? (tankContext.waterLevelPct >= tankContext.mountDepthPct ? 0.62 : -0.82)
      : (triggered ? 0.36 : -0.18)
    const diff = target - currentAngle.current
    if (Math.abs(diff) > 0.002) {
      currentAngle.current += diff * Math.min(1, delta * 9)
      if (floatPivotRef.current) floatPivotRef.current.rotation.z = currentAngle.current
      invalidate()
    } else if (floatPivotRef.current) {
      const bob = tankContext && tankContext.waterLevelPct >= tankContext.mountDepthPct - 8
        ? Math.sin(bobPhaseRef.current) * 0.06
        : 0
      floatPivotRef.current.rotation.z = target + bob
    }
  })

  // === MODO REAL INSTALADO DENTRO DO RESERVATÓRIO (cabo pendente + contrapeso + flutuador na água) ===
  const inTankGeom = useMemo(() => {
    if (!tankContext) return null
    const tankH = tankContext.tankHeight
    const tankR = tankContext.tankRadius
    const depthFrac = Math.max(0.12, Math.min(0.92, tankContext.mountDepthPct / 100))
    const waterFrac = Math.max(0.02, Math.min(0.98, tankContext.waterLevelPct / 100))
    // `position` da bóia montada fica exatamente no topo do reservatório (y = 0 local = tampa do reservatório)
    const counterY = -(1 - depthFrac) * tankH
    const tetherLen = Math.min(tankR * 0.62, Math.max(0.36, tankH * 0.22))
    const waterY = -(1 - waterFrac) * tankH
    // Flutuador acompanha a superfície real da água, limitado pelo raio do cabo preso ao contrapeso
    const rawDy = waterY - counterY
    const clampedDy = Math.max(-tetherLen * 0.92, Math.min(tetherLen * 0.85, rawDy))
    const horizSign = tankContext.sideSign >= 0 ? -1 : 1
    const dx = horizSign * Math.sqrt(Math.max(0.02, tetherLen * tetherLen - clampedDy * clampedDy))
    const floatX = dx
    const floatY = counterY + clampedDy
    const tetherCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, counterY - 0.05, 0),
      new THREE.Vector3(dx * 0.45, counterY + clampedDy * 0.35 - 0.09, 0.03),
      new THREE.Vector3(floatX - horizSign * 0.06, floatY, 0),
    ])
    const tetherTube = new THREE.TubeGeometry(tetherCurve, 28, 4.2 * U, 10, false)
    const verticalDropLen = Math.max(0.12, Math.abs(counterY))

    // Cabo H07RN-F estanque editável a sair FORA do reservatório até ao bucim da caixa de derivação exterior!
    const exitSide = tankContext.sideSign === 0 ? 1 : tankContext.sideSign
    const bendX = Number(c.state.cableBendXMm ?? 0) * U
    const bendY = Number(c.state.cableBendYMm ?? 0) * U
    const bendZ = Number(c.state.cableBendZMm ?? 0) * U
    const endOffX = Number(c.state.cableEndXMm ?? 0) * U
    const endOffY = Number(c.state.cableEndYMm ?? 0) * U
    const endOffZ = Number(c.state.cableEndZMm ?? 0) * U
    const cableRad = Math.max(2.5, Math.min(10, Number(c.state.cableDiameterMm ?? 8.8) * 0.5)) * U

    const baseTarget = tankContext.externalCableTarget
      ? new THREE.Vector3(...tankContext.externalCableTarget)
      : new THREE.Vector3(exitSide * (tankR * 0.72 + 0.55), -0.32, 0.14)
    const extTarget = new THREE.Vector3(
      baseTarget.x + endOffX,
      baseTarget.y + endOffY,
      baseTarget.z + endOffZ,
    )
    // Aproximação vertical limpa ao bucim (entra reto na gola PG13.5, nunca fura a parede de lado!)
    const extMid1 = new THREE.Vector3(
      extTarget.x * 0.42 + bendX,
      Math.max(0.36, extTarget.y + 0.48) + bendY,
      extTarget.z * 0.42 + bendZ,
    )
    const extMid2 = new THREE.Vector3(
      extTarget.x + bendX * 0.25,
      extTarget.y + 0.30 + bendY * 0.25,
      extTarget.z + bendZ * 0.25,
    )
    const extGlandEntry = new THREE.Vector3(extTarget.x, extTarget.y + 0.08, extTarget.z)
    const extInsideBox = new THREE.Vector3(extTarget.x, extTarget.y - 0.12, extTarget.z)
    const externalCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.22, 0),
      extMid1,
      extMid2,
      extGlandEntry,
      tankContext.externalCableTarget ? extInsideBox : extTarget,
    ])
    const externalCableTube = new THREE.TubeGeometry(externalCurve, 44, cableRad, 12, false)

    return { counterY, floatX, floatY, horizSign, tetherTube, verticalDropLen, externalCableTube, extTarget }
  }, [
    tankContext,
    c.state.cableBendXMm,
    c.state.cableBendYMm,
    c.state.cableBendZMm,
    c.state.cableEndXMm,
    c.state.cableEndYMm,
    c.state.cableEndZMm,
    c.state.cableDiameterMm,
  ])

  useEffect(() => () => {
    inTankGeom?.tetherTube.dispose()
    inTankGeom?.externalCableTube.dispose()
  }, [inTankGeom])

  if (tankContext && inTankGeom) {
    const { counterY, floatX, floatY, horizSign, tetherTube, verticalDropLen, externalCableTube, extTarget } = inTankGeom
    const floatScale = Math.max(0.75, Math.min(1.25, tankContext.tankRadius * 0.68))
    const cableColor = typeof c.state.cableColor === 'string' && c.state.cableColor ? c.state.cableColor : '#18181b'
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
        {/* Prensa-cabo estanque PG13.5 aparafusado na tampa superior do reservatório */}
        <group position={[0, 0.04, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[20 * U, 24 * U, 22 * U, 16]} />
            <meshStandardMaterial color="#334155" roughness={0.42} metalness={0.55} />
          </mesh>
          <mesh position={[0, 16 * U, 0]} castShadow>
            <cylinderGeometry args={[14 * U, 17 * U, 18 * U, 6]} />
            <meshStandardMaterial color="#475569" roughness={0.38} metalness={0.62} />
          </mesh>
        </group>

        {/* Cabo H07RN-F encaminhado FORA do reservatório até ao bucim da caixa de derivação exterior */}
        <mesh geometry={externalCableTube} castShadow receiveShadow>
          <meshStandardMaterial color={cableColor} roughness={0.56} metalness={0.08} />
        </mesh>

        {/* 3 fios de ligação elétrica (Castanho NA · Preto C · Azul NF) — se não entrar numa caixa OBO, mostra pontas livres */}
        {!tankContext.externalCableTarget && (
        <group position={[extTarget.x, extTarget.y, extTarget.z]}>
          {[
            { x: -10 * U, color: '#78350f' },
            { x: 0, color: '#111827' },
            { x: 10 * U, color: '#2563eb' },
          ].map((w, idx) => (
            <group key={idx} position={[w.x, -14 * U, 0]}>
              <mesh>
                <cylinderGeometry args={[2.2 * U, 2.2 * U, 28 * U, 8]} />
                <meshStandardMaterial color={w.color} roughness={0.48} />
              </mesh>
              <mesh position={[0, -15 * U, 0]}>
                <cylinderGeometry args={[1.2 * U, 1.2 * U, 6 * U, 8]} />
                <meshStandardMaterial color="#cbd5e1" metalness={0.88} roughness={0.25} />
              </mesh>
            </group>
          ))}
        </group>
        )}

        {/* Cabo vertical submerso H07RN-F desde a tampa até ao contrapeso */}
        <mesh position={[0, -verticalDropLen / 2, 0]} castShadow renderOrder={4}>
          <cylinderGeometry args={[4.2 * U, 4.2 * U, verticalDropLen, 10]} />
          <meshStandardMaterial color="#18181b" roughness={0.62} metalness={0.08} />
        </mesh>

        {/* Contrapeso cilíndrico regulável amarelo/preto à cota de disparo (mountDepthPct) */}
        <group position={[0, counterY, 0]} renderOrder={4}>
          <mesh castShadow>
            <cylinderGeometry args={[22 * U, 22 * U, 52 * U, 20]} />
            <meshStandardMaterial color="#f5c518" roughness={0.36} metalness={0.06} />
          </mesh>
          <mesh position={[0, 0, 0]}>
            <cylinderGeometry args={[23 * U, 23 * U, 10 * U, 20]} />
            <meshStandardMaterial color="#1e293b" roughness={0.5} metalness={0.18} />
          </mesh>
        </group>

        {/* Cabo flexível curvo do contrapeso até ao corpo da bóia */}
        <mesh geometry={tetherTube} castShadow renderOrder={4}>
          <meshStandardMaterial color="#18181b" roughness={0.62} metalness={0.08} />
        </mesh>

        {/* Corpo flutuador FELIX ENERGY dentro da água, basculando com o nível real! */}
        <group
          ref={floatPivotRef}
          position={[floatX, floatY, 0]}
          rotation={[0, horizSign < 0 ? 0 : Math.PI, currentAngle.current]}
          scale={[floatScale, floatScale, floatScale]}
          renderOrder={4}
        >
          <group position={[-58 * U, 0, 0]}>
            <mesh geometry={geoms.rimGeom} castShadow receiveShadow>
              <meshStandardMaterial color="#f5c518" roughness={0.32} metalness={0.06} />
            </mesh>
            <mesh geometry={geoms.shellGeom} castShadow receiveShadow>
              <meshStandardMaterial color="#1d4ed8" roughness={0.28} metalness={0.08} />
            </mesh>
            {textures.front && (
              <mesh position={[0, 0, 19.6 * U]}>
                <planeGeometry args={[68 * U, 48 * U]} />
                <meshStandardMaterial map={textures.front} roughness={0.34} metalness={0.04} />
              </mesh>
            )}
            {textures.back && (
              <mesh position={[0, 0, -19.6 * U]} rotation={[0, Math.PI, 0]}>
                <planeGeometry args={[68 * U, 48 * U]} />
                <meshStandardMaterial map={textures.back} roughness={0.34} metalness={0.04} />
              </mesh>
            )}
          </group>
          {/* Bota prensa-cabos amarela flexível */}
          <group position={[-4 * U, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <mesh position={[0, -4 * U, 0]} castShadow>
              <cylinderGeometry args={[10.5 * U, 14.5 * U, 18 * U, 14]} />
              <meshStandardMaterial color="#f5c518" roughness={0.38} />
            </mesh>
            <mesh position={[0, 13 * U, 0]} castShadow>
              <cylinderGeometry args={[6.2 * U, 10.2 * U, 18 * U, 14]} />
              <meshStandardMaterial color="#f5c518" roughness={0.38} />
            </mesh>
          </group>
        </group>
      </group>
    )
  }

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

/** Textura realista do punho vermelho PVC impresso "TURIA 3000 · ARCO" (fiel a image-34.png) */
function createArcoTuriaGripTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const W = 384
  const H = 96
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const grad = ctx.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, '#e32424')
  grad.addColorStop(0.5, '#c81919')
  grad.addColorStop(1, '#a61414')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  ctx.fillStyle = '#ffffff'
  ctx.font = '900 22px sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillText('TURIA', 24, 34)
  ctx.font = 'bold 21px sans-serif'
  ctx.fillText('3000', 26, 62)

  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(146, 48, 22, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(134, 62)
  ctx.lineTo(146, 30)
  ctx.lineTo(158, 62)
  ctx.stroke()

  ctx.fillStyle = '#ffffff'
  ctx.font = '900 44px sans-serif'
  ctx.fillText('arco', 180, 50)
  ctx.font = 'bold 14px sans-serif'
  ctx.fillText('®', 292, 34)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.needsUpdate = true
  return tex
}

/** Passador com ombros arredondados, uniões sextavadas, roscas e alavanca revestida. */
function ArcoTuria3000ValveMesh({
  scale,
  open,
  leverRef,
  withSpout = false,
  closedAngle = Math.PI / 2,
}: {
  scale: number
  open: boolean
  leverRef?: React.RefObject<THREE.Group>
  withSpout?: boolean
  closedAngle?: number
}) {
  const gripTex = useMemo(() => createArcoTuriaGripTexture(), [])
  useEffect(() => () => { gripTex?.dispose() }, [gripTex])
  const bodyGeometry = useMemo(() => new THREE.LatheGeometry([
    new THREE.Vector2(scale * 1.18, -scale * 0.98), new THREE.Vector2(scale * 1.32, -scale * 0.87),
    new THREE.Vector2(scale * 1.44, -scale * 0.64), new THREE.Vector2(scale * 1.46, 0),
    new THREE.Vector2(scale * 1.44, scale * 0.64), new THREE.Vector2(scale * 1.32, scale * 0.87),
    new THREE.Vector2(scale * 1.18, scale * 0.98),
  ], 40), [scale])
  useEffect(() => () => bodyGeometry.dispose(), [bodyGeometry])

  const s = scale
  return (
    <group>
      {/* Corpo central forjado em latão cromado/niquelado acetinado (forma barril ARCO TURIA 3000) */}
      <mesh name="arco-nickel-body" geometry={bodyGeometry} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <meshStandardMaterial name="Nickel acetinado" color="#cbd0d2" roughness={0.24} metalness={0.94} />
      </mesh>
      {/* Nervura central de união das duas meias-carcaças do corpo */}
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[s * 1.54, s * 1.54, s * 0.34, 28]} />
        <meshStandardMaterial color="#cfd7df" roughness={0.24} metalness={0.9} />
      </mesh>
      {/* 2 uniões sextavadas fêmea cromadas pesadas (-X entrada / +X saída) */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * s * 1.56, 0, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
            <cylinderGeometry args={[s * 1.48, s * 1.48, s * 1.25, 6]} />
            <meshStandardMaterial color="#d8dfe6" roughness={0.2} metalness={0.93} />
          </mesh>
          {[-1, 1].map((edge) => <mesh key={edge} position={[edge * s * 0.64, 0, 0]} rotation={[0, 0, edge * Math.PI / 2]}>
            <cylinderGeometry args={[s * 1.48, s * 1.34, s * 0.12, 6]} />
            <meshStandardMaterial name="Chanfro niquelado" color="#cbd1d4" roughness={0.23} metalness={0.94} />
          </mesh>)}
          {/* Chanfro frontal da boca */}
          <mesh position={[side * s * 0.66, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[s * 1.18, s * 1.32, s * 0.18, 22]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.18} metalness={0.94} />
          </mesh>
          {/* Interior com rosca BSP dourada em latão visível (assinatura visual de image-34.png!) */}
          {(!withSpout || side === -1) && (
            <>
              <mesh position={[side * s * 0.68, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[s * 0.94, s * 0.94, s * 0.42, 22, 1, true]} />
                <meshStandardMaterial color="#c99c38" roughness={0.32} metalness={0.84} side={THREE.DoubleSide} />
              </mesh>
              <mesh position={[side * s * 0.56, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[s * 0.86, s * 0.86, s * 0.12, 20]} />
                <meshStandardMaterial color={open ? '#0f172a' : '#dce2e8'} roughness={open ? 0.85 : 0.14} metalness={open ? 0.1 : 0.95} />
              </mesh>
              {Array.from({ length: 5 }, (_, thread) => <mesh key={thread} position={[side * s * (0.48 + thread * 0.07), 0, 0]} rotation={[0, Math.PI / 2, 0]}>
                <torusGeometry args={[s * 0.96, s * 0.035, 6, 32]} />
                <meshStandardMaterial name="Latão da rosca" color="#ad883c" roughness={0.3} metalness={0.88} />
              </mesh>)}
            </>
          )}
        </group>
      ))}

      {/* Castelo superior cromado + porca sextavada prensa-empanque */}
      <mesh position={[0, s * 1.32, 0]} castShadow>
        <cylinderGeometry args={[s * 0.62, s * 0.78, s * 0.92, 20]} />
        <meshStandardMaterial color="#d8dfe6" roughness={0.22} metalness={0.92} />
      </mesh>
      <mesh position={[0, s * 1.82, 0]} castShadow>
        <cylinderGeometry args={[s * 0.62, s * 0.62, s * 0.36, 6]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.24} metalness={0.92} />
      </mesh>

      {/* === ALAVANCA ESCALONADA PRETA + PUNHO VERMELHO PVC "TURIA 3000 ARCO" (fiel a image-34.png!) === */}
      <group
        ref={leverRef}
        position={[0, s * 2.04, 0]}
        rotation={[0, open ? 0 : closedAngle, 0]}
      >
        {/* Porca sextavada superior de fixação + topo do veio */}
        <mesh position={[0, s * 0.32, 0]} castShadow>
          <cylinderGeometry args={[s * 0.48, s * 0.48, s * 0.38, 6]} />
          <meshStandardMaterial color="#dce2e8" roughness={0.2} metalness={0.94} />
        </mesh>
        <mesh position={[0, s * 0.52, 0]}>
          <cylinderGeometry args={[s * 0.28, s * 0.28, s * 0.1, 14]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.28} metalness={0.9} />
        </mesh>

        {/* Base horizontal da alavanca em aço pintado preto + patilha batente dobrada 90° */}
        <mesh position={[s * 0.22, s * 0.08, 0]} castShadow>
          <boxGeometry args={[s * 1.65, s * 0.22, s * 0.86]} />
          <meshStandardMaterial color="#14181f" roughness={0.28} metalness={0.76} />
        </mesh>
        <mesh position={[-s * 0.66, -s * 0.22, 0]} castShadow>
          <boxGeometry args={[s * 0.22, s * 0.72, s * 0.58]} />
          <meshStandardMaterial color="#14181f" roughness={0.28} metalness={0.76} />
        </mesh>

        {/* Braço escalonado inclinado a ~38° para cima em aço preto (assinatura de image-34.png!) */}
        <mesh position={[s * 1.48, s * 0.68, 0]} rotation={[0, 0, 0.68]} castShadow>
          <boxGeometry args={[s * 1.65, s * 0.22, s * 0.78]} />
          <meshStandardMaterial color="#14181f" roughness={0.28} metalness={0.76} />
        </mesh>

        {/* Braço horizontal superior revestido em PVC VERMELHO ARCO com impressão "TURIA 3000 · ARCO" */}
        <RoundedBox name="arco-pvc-grip" position={[s * 3.85, s * 1.22, 0]} args={[s * 3.75, s * 0.44, s * 0.96]} radius={s * 0.12} smoothness={3} castShadow receiveShadow>
          <meshPhysicalMaterial
            color="#d91e1e"
            roughness={0.34}
            metalness={0.06}
            clearcoat={0.25}
            clearcoatRoughness={0.28}
          />
        </RoundedBox>
        {/* Ponta arredondada do punho vermelho */}
        <mesh position={[s * 5.72, s * 1.22, 0]} castShadow>
          <cylinderGeometry args={[s * 0.48, s * 0.48, s * 0.44, 16]} />
          <meshPhysicalMaterial color="#d91e1e" roughness={0.34} metalness={0.06} clearcoat={0.25} />
        </mesh>
        {/* Face superior impressa "TURIA 3000 · ARCO" */}
        {gripTex && (
          <mesh position={[s * 3.85, s * 1.45, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[s * 3.6, s * 0.88]} />
            <meshStandardMaterial map={gripTex} roughness={0.32} metalness={0.05} />
          </mesh>
        )}
      </group>
    </group>
  )
}

/** Suporte em inox escovado: duas cintas aparafusadas ao cilindro, braços em barra chata e placa de
 *  montagem com quatro furos (a caixa OBO aparafusa-se pelo fundo). Geometria em tankJunctionBracketOf. */
function TankJunctionBracket3D({ bracket }: { bracket: TankJunctionBracket }) {
  const { radius: R, plate, bandYs } = bracket
  const steel = { color: '#c3cad2', metalness: 0.86, roughness: 0.3 } as const
  const plateLeft = plate.x - plate.w / 2
  const armLen = Math.max(0.02, plateLeft - R)
  return (
    <group name="tank-junction-bracket">
      {bandYs.map((y, i) => (
        <group key={i} position={[0, y, 0]}>
          {/* Cinta à volta do cilindro */}
          <mesh castShadow>
            <cylinderGeometry args={[R + 3 * U, R + 3 * U, 20 * U, 48, 1, true]} />
            <meshStandardMaterial {...steel} side={THREE.DoubleSide} />
          </mesh>
          {/* Patilhas de aperto com parafuso */}
          <mesh position={[R + 10 * U, 0, 0]} castShadow>
            <boxGeometry args={[16 * U, 20 * U, 26 * U]} />
            <meshStandardMaterial {...steel} />
          </mesh>
          <mesh position={[R + 10 * U, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[3.5 * U, 3.5 * U, 34 * U, 10]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.25} />
          </mesh>
          {/* Braço em barra chata até à placa */}
          <mesh position={[R + armLen / 2, 0, 0]} castShadow>
            <boxGeometry args={[armLen, 20 * U, 4 * U]} />
            <meshStandardMaterial {...steel} />
          </mesh>
        </group>
      ))}
      {/* Placa de montagem com quatro furos e dobra de reforço */}
      <group position={[plate.x, plate.y, plate.z]} name="tank-junction-bracket-plate">
        <mesh castShadow receiveShadow>
          <boxGeometry args={[plate.w, plate.h, plate.t]} />
          <meshStandardMaterial {...steel} />
        </mesh>
        <mesh position={[-plate.w / 2 + 2 * U, 0, -8 * U]} castShadow>
          <boxGeometry args={[4 * U, plate.h, 16 * U]} />
          <meshStandardMaterial {...steel} />
        </mesh>
        {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy], i) => (
          <mesh key={i} position={[sx * plate.w * 0.4, sy * plate.h * 0.4, plate.t / 2 + 0.002]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[3 * U, 3 * U, 1 * U, 12]} />
            <meshStandardMaterial color="#1f2937" roughness={0.7} />
          </mesh>
        ))}
      </group>
    </group>
  )
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
  const levelPct = Math.max(0, Math.min(100, Number(c.state.levelPct ?? 0)))
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
  const leverRef = useRef<THREE.Group>(null)
  const drainStreamRef = useRef<THREE.Mesh>(null)
  const drainDropsRef = useRef<THREE.Group>(null)
  const splashRingRef = useRef<THREE.Mesh>(null)
  const leverAngleRef = useRef(outletOpen ? 0 : Math.PI / 2)
  const phaseRef = useRef(0)
  const { invalidate, gl } = useThree()

  const waterR = R * 0.945
  const waterH = Math.max(0.01, (H * 0.96 * levelPct) / 100)
  const waterSurfaceY = cylBottomY + 0.02 + waterH
  const inletY = bottomY + totalH * 0.78
  const outletY = bottomY + totalH * 0.22
  const leftNozzleX = -totalW / 2 + totalW * 0.04
  const rightNozzleX = -totalW / 2 + totalW * 0.96
  const pipeRadius = Math.min(24 * U, Math.max(14 * U, R * 0.068))
  const valveSpoutX = -R * 0.34
  const valveSpoutY = inletY - pipeRadius * 1.6
  const jetHeight = Math.max(0.06, valveSpoutY - waterSurfaceY)

  // Geometria do bico curvo 90° do passador real + curva parabólica real da água a cair até ao chão
  const valveBodyX = R + Math.max(pipeRadius * 2.1, Math.min(pipeRadius * 3.2, (rightNozzleX - R) * 0.52))
  const spoutStartX = valveBodyX + pipeRadius * 2.1
  const spoutEndX = spoutStartX + pipeRadius * 2.4
  const spoutEndY = -pipeRadius * 2.35
  const dropDistY = Math.max(0.28, (outletY + spoutEndY) - bottomY)
  const pressureThrow = pipeRadius * (1.2 + (levelPct / 100) * 2.6)

  const { spoutGeom, drainStreamGeom, drainCurve } = useMemo(() => {
    const sc = new THREE.CatmullRomCurve3([
      new THREE.Vector3(spoutStartX - pipeRadius * 0.4, 0, 0),
      new THREE.Vector3(spoutStartX + pipeRadius * 1.4, 0, 0),
      new THREE.Vector3(spoutEndX, -pipeRadius * 0.85, 0),
      new THREE.Vector3(spoutEndX, spoutEndY, 0),
    ])
    const sGeom = new THREE.TubeGeometry(sc, 20, pipeRadius * 0.86, 14, false)

    // Trajetória parabólica realista da água em queda livre (desde a ponta do bico até ao chão!)
    const dc = new THREE.CatmullRomCurve3([
      new THREE.Vector3(spoutEndX, spoutEndY, 0),
      new THREE.Vector3(spoutEndX + pressureThrow * 0.25, spoutEndY - dropDistY * 0.22, 0),
      new THREE.Vector3(spoutEndX + pressureThrow * 0.58, spoutEndY - dropDistY * 0.58, 0),
      new THREE.Vector3(spoutEndX + pressureThrow * 0.88, spoutEndY - dropDistY * 0.98, 0),
    ])
    const streamR = Math.max(pipeRadius * 0.34, pipeRadius * (0.34 + (levelPct / 100) * 0.34))
    const dGeom = new THREE.TubeGeometry(dc, 24, streamR, 12, false)
    return { spoutGeom: sGeom, drainStreamGeom: dGeom, drainCurve: dc }
  }, [spoutStartX, spoutEndX, spoutEndY, pipeRadius, dropDistY, pressureThrow, levelPct])

  useEffect(() => () => {
    waveGeom.dispose()
    scaleTex?.dispose()
    spoutGeom.dispose()
    drainStreamGeom.dispose()
  }, [waveGeom, scaleTex, spoutGeom, drainStreamGeom])

  // Temporizador adaptativo para manter as ondas 3D vivas + baixar o nível da água gradualmente até 0% com a torneira aberta!
  useEffect(() => {
    if (levelPct <= 0.05) return
    const intervalMs = outletOpen ? 95 : 115
    const timer = window.setInterval(() => {
      if (outletOpen) {
        const st = useSimStore.getState()
        // Em modo RUN o motor de simulação (useSimStore) já atualiza o nível; fora do RUN esvazia suavemente em tempo real!
        if (st.sim.runState !== 'running') {
          const curTank = st.components.find((item) => item.id === c.id)
          if (curTank && curTank.state.outletValveOpen) {
            const curLvl = Number(curTank.state.levelPct ?? 0)
            if (curLvl > 0) {
              // Descarga realista proporcional à coluna de água (esvazia gradualmente até 0%!)
              const headFactor = 0.45 + 0.55 * Math.sqrt(Math.max(0.01, curLvl / 100))
              const drop = (intervalMs / 1000) * 6.5 * headFactor
              const nextLvl = curLvl - drop <= 0.15 ? 0 : Math.round((curLvl - drop) * 10) / 10
              st.setComponentState(c.id, { levelPct: nextLvl })
              // Sincroniza de imediato qualquer bóia acoplada dentro deste reservatório
              for (const comp of st.components) {
                if (comp.type !== 'floatSwitch' || comp.state.detachedFromTank === true) continue
                if (comp.state.linkedTankId === c.id || (!comp.state.linkedTankId && comp.state.autoCoupleTank !== false)) {
                  const thresh = typeof comp.state.mountDepthPct === 'number' ? comp.state.mountDepthPct : 74
                  const nextTrig = nextLvl >= thresh
                  if (Boolean(comp.state.triggered) !== nextTrig) {
                    st.setComponentState(comp.id, { triggered: nextTrig, level: nextTrig ? 'alto' : 'baixo' })
                  }
                }
              }
            }
          }
        }
      }
      invalidate()
    }, intervalMs)
    return () => window.clearInterval(timer)
  }, [levelPct > 0.05, outletOpen, c.id, invalidate])

  // Animação realista das ondas 3D + rotação suave do manípulo + queda real de água e salpicos no chão!
  useFrame((_state, delta) => {
    const dt = Math.min(delta, 0.12)
    phaseRef.current += dt * (filling ? 4.4 : outletOpen ? 5.2 : 2.2)
    const t = phaseRef.current
    const pos = waveGeom.attributes.position as THREE.BufferAttribute
    const amp = filling ? 0.072 : outletOpen ? 0.052 : 0.036
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

    // Animação suave de 90° do manípulo do passador (aberto ↔ fechado)
    const targetLever = outletOpen ? 0 : Math.PI / 2
    if (Math.abs(targetLever - leverAngleRef.current) > 0.004) {
      leverAngleRef.current += (targetLever - leverAngleRef.current) * Math.min(1, dt * 14)
      if (leverRef.current) leverRef.current.rotation.y = leverAngleRef.current
      invalidate()
    } else if (leverRef.current) {
      leverRef.current.rotation.y = targetLever
    }

    if (jetRef.current && filling) {
      const pulse = 0.88 + Math.sin(t * 5.2) * 0.14
      jetRef.current.scale.set(pulse, 1, pulse)
    }
    if (dropRef.current && filling) {
      const fallFrac = (t * 0.65) % 1
      dropRef.current.position.y = -fallFrac * Math.max(0.15, H * (1 - levelPct / 100) * 0.72)
    }
    if (outletOpen && levelPct > 0.5) {
      if (drainStreamRef.current) {
        const wPulse = 0.9 + Math.sin(t * 8.5) * 0.12
        drainStreamRef.current.scale.set(1, 1, wPulse)
      }
      if (drainDropsRef.current) {
        const children = drainDropsRef.current.children
        for (let i = 0; i < children.length; i += 1) {
          const frac = ((t * 0.72) + i / children.length) % 1
          const pt = drainCurve.getPoint(frac)
          children[i].position.set(pt.x, pt.y, pt.z + Math.sin(t * 7 + i * 2.1) * pipeRadius * 0.18)
          const s = 0.75 + Math.sin(frac * Math.PI) * 0.55
          children[i].scale.setScalar(s)
        }
      }
      if (splashRingRef.current) {
        const sPulse = 0.85 + ((t * 0.85) % 1) * 0.75
        splashRingRef.current.scale.set(sPulse, sPulse, 1)
      }
    }
  })

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

      {/* === PASSADOR REAL DE DESCARGA ARCO TURIA 3000 (DUPLO CLIQUE ABRE/FECHA + BICO CURVO + ÁGUA REAL A CAIR!) === */}
      <group
        position={[0, outletY, 0]}
        onPointerOver={(e) => {
          if (!onToggleValve) return
          e.stopPropagation()
          gl.domElement.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          gl.domElement.style.cursor = ''
        }}
        onDoubleClick={(e) => {
          if (!onToggleValve) return
          e.stopPropagation()
          onToggleValve()
        }}
      >
        {/* Flange passa-parede (bulkhead) + junta EPDM preta encostada à parede acrílica do reservatório */}
        <mesh position={[R - pipeRadius * 0.12, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[pipeRadius * 1.95, pipeRadius * 1.95, pipeRadius * 0.55, 22]} />
          <meshStandardMaterial color="#1e293b" roughness={0.72} metalness={0.12} />
        </mesh>
        <mesh position={[R + pipeRadius * 0.42, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[pipeRadius * 1.75, pipeRadius * 1.75, pipeRadius * 0.7, 6]} />
          <meshStandardMaterial color="#d8dfe6" roughness={0.22} metalness={0.92} />
        </mesh>
        {/* Troço roscado de ligação desde o tanque até ao passador ARCO TURIA 3000 */}
        <mesh position={[(R + valveBodyX) / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[pipeRadius * 0.96, pipeRadius * 0.96, Math.max(0.04, valveBodyX - R), 16]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.24} metalness={0.9} />
        </mesh>
        {/* Corpo realista da válvula de esfera cromada ARCO TURIA 3000 */}
        <group position={[valveBodyX, 0, 0]}>
          <ArcoTuria3000ValveMesh scale={pipeRadius * 1.04} open={outletOpen} leverRef={leverRef} withSpout />
        </group>
        {/* Bico curvo 90° cromado de descarga virado para baixo */}
        <mesh geometry={spoutGeom} castShadow receiveShadow>
          <meshStandardMaterial color="#dce2e8" roughness={0.2} metalness={0.92} />
        </mesh>
        {/* Bocal/anel estriado na ponta inferior do bico */}
        <mesh position={[spoutEndX, spoutEndY + pipeRadius * 0.12, 0]} castShadow>
          <cylinderGeometry args={[pipeRadius * 0.98, pipeRadius * 0.92, pipeRadius * 0.55, 16]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.26} metalness={0.88} />
        </mesh>

        {/* === JATO PARABÓLICO REAL DE ÁGUA A CAIR + GOTAS + POÇA E SALPICOS NO CHÃO === */}
        {outletOpen && levelPct > 0.5 && (
          <group name={`water-tank-drain-stream-${c.id}`}>
            {/* Jato contínuo parabólico de água cristalina */}
            <mesh ref={drainStreamRef} geometry={drainStreamGeom} renderOrder={4}>
              <meshPhysicalMaterial
                userData={{ keepTransparent: true, dcSimuBodySurface: 'preserve' }}
                color="#38bdf8"
                emissive="#0ea5e9"
                emissiveIntensity={0.38}
                roughness={0.05}
                metalness={0.04}
                transparent
                opacity={0.86}
                clearcoat={1}
                clearcoatRoughness={0.04}
              />
            </mesh>
            {/* 6 gotas/bolhas brilhantes em queda contínua ao longo do jato */}
            <group ref={drainDropsRef}>
              {[0, 1, 2, 3, 4, 5].map((idx) => (
                <mesh key={idx} renderOrder={4}>
                  <sphereGeometry args={[pipeRadius * 0.42, 10, 10]} />
                  <meshStandardMaterial
                    userData={{ keepTransparent: true, dcSimuBodySurface: 'preserve' }}
                    color="#e0f2fe"
                    emissive="#38bdf8"
                    emissiveIntensity={0.6}
                    transparent
                    opacity={0.9}
                  />
                </mesh>
              ))}
            </group>
            {/* Poça translúcida no pavimento + anel animado de espuma/salpico no ponto de impacto */}
            <group position={[spoutEndX + pressureThrow * 0.88, bottomY - outletY + 0.025, 0]}>
              <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
                <circleGeometry args={[pipeRadius * (3.2 + (levelPct / 100) * 2.2), 28]} />
                <meshPhysicalMaterial
                  userData={{ keepTransparent: true, dcSimuBodySurface: 'preserve' }}
                  color="#38bdf8"
                  emissive="#0284c7"
                  emissiveIntensity={0.22}
                  roughness={0.08}
                  metalness={0.05}
                  transparent
                  opacity={0.56}
                  clearcoat={1}
                />
              </mesh>
              <mesh ref={splashRingRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]} renderOrder={4}>
                <ringGeometry args={[pipeRadius * 1.1, pipeRadius * 1.9, 24]} />
                <meshStandardMaterial
                  userData={{ keepTransparent: true, dcSimuBodySurface: 'preserve' }}
                  color="#e0f2fe"
                  emissive="#7dd3fc"
                  emissiveIntensity={0.55}
                  transparent
                  opacity={0.82}
                  side={THREE.DoubleSide}
                />
              </mesh>
            </group>
          </group>
        )}
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
      {/* Suporte inox para a caixa de derivação (cintas + braços + placa) */}
      {tankHasJunctionBracket(c.state) && <TankJunctionBracket3D bracket={tankJunctionBracketOf(c.state, U)} />}

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

/** 4. Válvula de esfera hidráulica 3D ARCO TURIA 3000 (cromada G 1" + alavanca escalonada preta/vermelha · duplo clique abre/fecha!) */
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
  const leverRef = useRef<THREE.Group>(null)
  const angleRef = useRef(open ? 0 : Math.PI / 2)
  const { invalidate, gl } = useThree()

  useFrame((_, delta) => {
    const target = open ? 0 : Math.PI / 2
    const diff = target - angleRef.current
    if (Math.abs(diff) > 0.006) {
      angleRef.current += diff * Math.min(1, delta * 12)
      invalidate()
    } else {
      angleRef.current = target
    }
    if (leverRef.current) leverRef.current.rotation.y = angleRef.current
  })

  return (
    <group
      position={position}
      name={`hydraulic-valve-3d-${c.id}`}
      onPointerOver={(e) => {
        if (!onToggle) return
        e.stopPropagation()
        gl.domElement.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        gl.domElement.style.cursor = ''
      }}
      onDoubleClick={(e) => {
        if (!onToggle) return
        e.stopPropagation()
        onToggle()
      }}
    >
      <group position={[0, -14 * U, 0]}>
        <ArcoTuria3000ValveMesh scale={19.5 * U} open={open} leverRef={leverRef} />
      </group>
    </group>
  )
}

/** 5. União em T hidráulica em latão forjado pesado G 1" (3 vias A / B / C com colares sextavados e roscas) */
export function HydraulicTee3D({
  c,
  position,
}: {
  c: ElectricalComponent
  position: [number, number, number]
}) {
  return (
    <group position={position} name={`hydraulic-tee-3d-${c.id}`}>
      {/* Esfera central de reforço do corpo forjado */}
      <mesh position={[0, -10 * U, 0]} castShadow receiveShadow>
        <sphereGeometry args={[23 * U, 22, 18]} />
        <meshStandardMaterial color="#d9b252" roughness={0.28} metalness={0.86} />
      </mesh>
      {/* Corpo horizontal A (-X) ↔ B (+X) */}
      <mesh position={[0, -10 * U, 0]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[19 * U, 19 * U, 92 * U, 22]} />
        <meshStandardMaterial color="#d4a029" roughness={0.28} metalness={0.86} />
      </mesh>
      {/* Derivação vertical C (+Y) */}
      <mesh position={[0, 14 * U, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[19 * U, 19 * U, 52 * U, 22]} />
        <meshStandardMaterial color="#d4a029" roughness={0.28} metalness={0.86} />
      </mesh>
      {/* 3 colares sextavados + furos roscados internos */}
      {[-44 * U, 44 * U].map((xPos, i) => (
        <group key={i} position={[xPos, -10 * U, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[24.5 * U, 24.5 * U, 16 * U, 6]} />
            <meshStandardMaterial color="#c99522" roughness={0.25} metalness={0.88} />
          </mesh>
          <mesh position={[(i === 0 ? -9 : 9) * U, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[14 * U, 14 * U, 3 * U, 18]} />
            <meshStandardMaterial color="#0f172a" roughness={0.75} />
          </mesh>
        </group>
      ))}
      <group position={[0, 36 * U, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[24.5 * U, 24.5 * U, 16 * U, 6]} />
          <meshStandardMaterial color="#c99522" roughness={0.25} metalness={0.88} />
        </mesh>
        <mesh position={[0, 9 * U, 0]}>
          <cylinderGeometry args={[14 * U, 14 * U, 3 * U, 18]} />
          <meshStandardMaterial color="#0f172a" roughness={0.75} />
        </mesh>
      </group>
    </group>
  )
}

// ============================================================================
// 5. CONTADOR DE ÁGUA ELETRÓNICO 3D — ZJLCD-BT01 (fiel a image-46..51.png)
// ============================================================================

function createFlowMeterFaceplateTexture(
  singleL: number,
  totalL: number,
  flowLpm: number,
  displayMode: 'total' | 'instant',
  pipeDN: string,
  powered: boolean,
): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 296
  const ctx = c.getContext('2d')
  if (!ctx) return null

  // Corpo azul cobalto industrial do frontal ZJLCD-BT01 (fiel a image-46/47.png)
  const bg = ctx.createLinearGradient(0, 0, 0, c.height)
  bg.addColorStop(0, '#225fb8')
  bg.addColorStop(1, '#1a4a94')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, c.width, c.height)

  // Moldura octogonal chanfrada cinzento-escuro nos cantos
  ctx.fillStyle = '#525861'
  const ch = 44
  for (const pts of [
    [[0, 0], [ch, 0], [0, ch]],
    [[c.width, 0], [c.width - ch, 0], [c.width, ch]],
    [[0, c.height], [ch, c.height], [0, c.height - ch]],
    [[c.width, c.height], [c.width - ch, c.height], [c.width, c.height - ch]],
  ]) {
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    ctx.lineTo(pts[1][0], pts[1][1])
    ctx.lineTo(pts[2][0], pts[2][1])
    ctx.closePath()
    ctx.fill()
  }

  // Serigrafia branca superior & inferior exata de image-46/47.png
  ctx.fillStyle = '#f8fafc'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '800 28px Arial, sans-serif'
  ctx.fillText('ZJLCD-BT01', 286, 40)

  ctx.font = '600 17px Arial, sans-serif'
  ctx.fillText(`${pipeDN}  ·  VOLUME / CAUDAL`, 286, 260)

  // Botões de membrana pretos com anel branco (SET e CLEAR)
  const drawMembraneBtn = (bx: number, by: number, label: string) => {
    ctx.beginPath()
    ctx.arc(bx, by, 34, 0, Math.PI * 2)
    ctx.fillStyle = '#e2e8f0'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(bx, by, 28, 0, Math.PI * 2)
    ctx.fillStyle = '#111827'
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = '800 15px Arial, sans-serif'
    ctx.fillText(label, bx, by + 1)
  }
  drawMembraneBtn(92, 92, 'SET')
  drawMembraneBtn(92, 206, 'CLEAR')

  // Visor LCD reflexivo verde-acinzentado com borda branca
  const lx = 158
  const ly = 68
  const lw = 312
  const lh = 160
  ctx.fillStyle = '#e2e8f0'
  ctx.fillRect(lx - 5, ly - 5, lw + 10, lh + 10)
  const lcdGrad = ctx.createLinearGradient(lx, ly, lx, ly + lh)
  lcdGrad.addColorStop(0, powered ? '#c6cfb9' : '#777f71')
  lcdGrad.addColorStop(1, powered ? '#aeb9a0' : '#666e61')
  ctx.fillStyle = lcdGrad
  ctx.fillRect(lx, ly, lw, lh)

  // Sem alimentação, o LCD permanece sem segmentos; a serigrafia física mantém-se visível.
  if (powered) {
  // Leitura LCD principal (volume parcial em litros).
  ctx.fillStyle = '#1e241b'
  ctx.textAlign = 'right'
  ctx.font = '800 62px "Courier New", monospace'
  ctx.fillText(singleL.toFixed(3).slice(0, 7), lx + lw - 34, ly + 56)
  ctx.font = '800 20px Arial, sans-serif'
  ctx.fillText('L', lx + lw - 12, ly + 66)

  // Linha inferior do LCD: Total acumulado (TOTAL) ou Caudal instantâneo (L/min)
  if (displayMode === 'instant') {
    ctx.font = '800 40px "Courier New", monospace'
    ctx.fillText(flowLpm.toFixed(1), lx + lw - 76, ly + 124)
    ctx.font = '700 17px Arial, sans-serif'
    ctx.fillText('L/min', lx + lw - 12, ly + 126)
    ctx.textAlign = 'left'
    ctx.font = '700 13px Arial, sans-serif'
    ctx.fillText('FLOW RATE', lx + 12, ly + 126)
  } else {
    ctx.font = '800 38px "Courier New", monospace'
    ctx.fillText(totalL.toFixed(1).padStart(7, '0'), lx + lw - 66, ly + 124)
    ctx.font = '700 15px Arial, sans-serif'
    ctx.fillText('TOTAL', lx + lw - 10, ly + 126)
  }
  }

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

export function WaterFlowMeterZjLcd3D({
  c,
  position,
  onPressSet,
  onPressClear,
}: {
  c: ElectricalComponent
  position: [number, number, number]
  onPressSet?: () => void
  onPressClear?: () => void
}) {
  const spec = flowMeterSpecOf(c.state)
  const L = spec.lengthMm * U
  const pipeOuterR = (spec.outerMm / 2) * U
  const pipeInnerR = (spec.innerMm / 2) * U
  const nutR = pipeOuterR * 1.42
  const nutLen = L * 0.19
  const withCable = c.state.withCable !== false
  const singleL = Math.max(0, Number(c.state.singleVolumeL ?? 0))
  const totalL = Math.max(0, Number(c.state.totalVolumeL ?? 0))
  const flowLpm = Math.max(0, Number(c.state.flowRateLpm ?? 0))
  const displayMode: 'total' | 'instant' = c.state.displayMode === 'instant' ? 'instant' : 'total'
  const verticalMount = c.state.installOrientation === 'vertical'
  const powered = c.state.powered === true

  // Quantizar leitura para não recriar CanvasTexture a cada milissegundo
  const qSingle = Math.round(singleL * 100) / 100
  const qTotal = Math.round(totalL * 10) / 10
  const qFlow = Math.round(flowLpm * 10) / 10

  const faceTex = useMemo(
    () => createFlowMeterFaceplateTexture(qSingle, qTotal, qFlow, displayMode, spec.dn, powered),
    [qSingle, qTotal, qFlow, displayMode, spec.dn, powered],
  )
  useEffect(() => () => faceTex?.dispose(), [faceTex])

  const cableGeom = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.08, -pipeOuterR * 0.45, pipeOuterR * 0.65),
      new THREE.Vector3(-0.18, -pipeOuterR * 1.15, pipeOuterR * 0.92),
      new THREE.Vector3(0.0, -pipeOuterR * 1.38, pipeOuterR * 0.78),
      new THREE.Vector3(0.16, -pipeOuterR * 1.28, pipeOuterR * 0.48),
    ])
    return new THREE.TubeGeometry(curve, 24, 3.6 * U, 8, false)
  }, [pipeOuterR])
  useEffect(() => () => cableGeom.dispose(), [cableGeom])

  const headW = Math.max(0.86, L * 0.47)
  const headH = headW * 0.56
  const headD = Math.max(0.28, pipeOuterR * 0.95)
  const pvcDark = '#4b525c'
  const pvcMid = '#5a626e'

  return (
    <group position={position} rotation={[0, 0, verticalMount ? Math.PI / 2 : 0]} name={`water-flow-meter-3d-${c.id}`} userData={{ meterPowered: powered }}>
      {/* Corpo central tubular UPVC cinzento-escuro */}
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[pipeOuterR * 1.06, pipeOuterR * 1.06, L * 0.62, 24]} />
        <meshStandardMaterial color={pvcDark} roughness={0.44} metalness={0.08} />
      </mesh>

      {/* 2 pés moldados inferiores de apoio (fiel a image-46.png) */}
      {[-L * 0.16, L * 0.16].map((fx, i) => (
        <mesh key={i} position={[fx, -pipeOuterR * 1.16, 0]} castShadow>
          <boxGeometry args={[L * 0.075, pipeOuterR * 0.68, pipeOuterR * 1.48]} />
          <meshStandardMaterial color={pvcDark} roughness={0.48} />
        </mesh>
      ))}

      {/* 2 porcas de união estriadas (esquerda e direita) + bocais lisos UPVC (fiel a image-46/47.png) */}
      {[-1, 1].map((side) => (
        <group key={side}>
          {/* Bocal liso PVC com interior escuro */}
          <mesh position={[side * (L * 0.43), 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
            <cylinderGeometry args={[pipeOuterR, pipeOuterR, L * 0.14, 24]} />
            <meshStandardMaterial color={pvcMid} roughness={0.38} metalness={0.06} />
          </mesh>
          <mesh position={[side * (L * 0.501), 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[pipeInnerR * 0.92, pipeInnerR * 0.92, 0.015, 20]} />
            <meshStandardMaterial color="#0f172a" roughness={0.85} />
          </mesh>
          {/* Porca de união PVC + 12 nervuras de aperto */}
          <group position={[side * (L * 0.285), 0, 0]}>
            <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
              <cylinderGeometry args={[nutR, nutR, nutLen, 24]} />
              <meshStandardMaterial color={pvcMid} roughness={0.40} metalness={0.08} />
            </mesh>
            {Array.from({ length: 12 }).map((_, rIdx) => {
              const ang = (rIdx * Math.PI * 2) / 12
              return (
                <RoundedBox
                  key={rIdx}
                  position={[0, Math.sin(ang) * (nutR * 0.98), Math.cos(ang) * (nutR * 0.98)]}
                  rotation={[ang, 0, 0]}
                  args={[nutLen * 0.74, 0.036, 0.042]} radius={0.006} smoothness={2}
                >
                  <meshStandardMaterial color="#3f4650" roughness={0.48} />
                </RoundedBox>
              )
            })}
          </group>
        </group>
      ))}

      {/* Pescoço de suporte da cabeça eletrónica */}
      <mesh position={[0, pipeOuterR * 0.85, pipeOuterR * 0.25]} castShadow>
        <boxGeometry args={[headW * 0.62, pipeOuterR * 0.95, pipeOuterR * 0.95]} />
        <meshStandardMaterial color={pvcDark} roughness={0.44} />
      </mesh>

      {/* Cabeça eletrónica LCD ZJLCD-BT01 ligeiramente inclinada para o operador (fiel a image-46.png) */}
      <group position={[0, pipeOuterR * 1.18 + headH * 0.24, pipeOuterR * 0.56]} rotation={[-0.24, 0, 0]}>
        {/* Caixa exterior cinzento-escuro */}
        <RoundedBox name="flow-meter-electronics-housing" args={[headW, headH, headD]} radius={2.2 * U} smoothness={3} castShadow receiveShadow>
          <meshPhysicalMaterial name="ABS do contador" color="#4d5660" roughness={0.38} metalness={0.02} clearcoat={0.15} clearcoatRoughness={0.38} />
        </RoundedBox>
        {/* Faceplate azul + LCD dinâmico */}
        {faceTex && (
          <mesh name="flow-meter-faceplate" position={[0, 0, headD / 2 + 0.008]} userData={{ meterPowered: powered }}>
            <planeGeometry args={[headW * 0.95, headH * 0.92]} />
            <meshStandardMaterial name="Serigrafia do contador" map={faceTex} roughness={0.34} metalness={0.05} polygonOffset polygonOffsetFactor={-1} />
          </mesh>
        )}
        {/* Rebaixo, junta e cobertura ótica do visor, em planos distintos da serigrafia. */}
        <group position={[headW * 0.107, 0, headD / 2 + 0.017]} name="flow-meter-lcd-bezel">
          {[[0, headH * 0.255, headW * 0.60, 0.012], [0, -headH * 0.255, headW * 0.60, 0.012], [-headW * 0.296, 0, 0.012, headH * 0.52], [headW * 0.296, 0, 0.012, headH * 0.52]].map(([x, y, w, h], i) => <RoundedBox key={i} position={[x, y, 0]} args={[w, h, 0.018]} radius={0.004} smoothness={2}>
            <meshStandardMaterial name="Junta LCD" color="#303a35" roughness={0.78} />
          </RoundedBox>)}
          <mesh name="flow-meter-lcd-glass" position={[0, 0, 0.012]} userData={{ meterPowered: powered }}>
            <boxGeometry args={[headW * 0.578, headH * 0.49, 0.008]} />
            <meshPhysicalMaterial name="LCD glass" userData={{ dcSimuBodySurface: 'preserve', keepTransparent: true }} color="#d5e1d0" transparent opacity={0.13} roughness={0.09} metalness={0} clearcoat={1} clearcoatRoughness={0.06} depthWrite={false} />
          </mesh>
        </group>
        {/* 4 parafusos metálicos Phillips nos cantos */}
        {[
          [-headW * 0.43, headH * 0.40],
          [headW * 0.43, headH * 0.40],
          [-headW * 0.43, -headH * 0.40],
          [headW * 0.43, -headH * 0.40],
        ].map(([sx, sy], idx) => (
          <group key={idx} position={[sx, sy, headD / 2 + 0.015]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.026, 0.026, 0.018, 24]} /><meshStandardMaterial name="Aço do parafuso" color="#aeb8c1" metalness={0.9} roughness={0.25} /></mesh>
            {[0, Math.PI / 2].map((angle, i) => <mesh key={i} position={[0, 0, 0.01]} rotation={[0, 0, angle]}><boxGeometry args={[0.029, 0.006, 0.002]} /><meshStandardMaterial color="#3a4044" roughness={0.7} /></mesh>)}
          </group>
        ))}

        {/* Botões de membrana com espessura física, sem interação eletrónica quando desligados. */}
        <mesh
          name="flow-meter-set"
          position={[-headW * 0.30, headH * 0.18, headD / 2 + 0.018]}
          rotation={[Math.PI / 2, 0, 0]}
          onClick={(e) => {
            e.stopPropagation()
            if (powered) onPressSet?.()
          }}
        >
          <cylinderGeometry args={[headH * 0.13, headH * 0.14, 0.018, 24]} />
          <meshStandardMaterial name="Membrana SET" color="#252d34" roughness={0.61} />
        </mesh>
        <mesh
          name="flow-meter-clear"
          position={[-headW * 0.30, -headH * 0.19, headD / 2 + 0.018]}
          rotation={[Math.PI / 2, 0, 0]}
          onClick={(e) => {
            e.stopPropagation()
            if (powered) onPressClear?.()
          }}
        >
          <cylinderGeometry args={[headH * 0.13, headH * 0.14, 0.018, 24]} />
          <meshStandardMaterial name="Membrana CLEAR" color="#252d34" roughness={0.61} />
        </mesh>
        <Text position={[-headW * 0.30, headH * 0.18, headD / 2 + 0.031]} fontSize={headH * 0.055} color="#e8edf2" anchorX="center" anchorY="middle">SET</Text>
        <Text position={[-headW * 0.30, -headH * 0.19, headD / 2 + 0.031]} fontSize={headH * 0.047} color="#e8edf2" anchorX="center" anchorY="middle">CLEAR</Text>
      </group>

      {/* Versão com cabo Open-Drain (+24V Vermelho · PULSE Amarelo · GND Preto — fiel a image-48.png) */}
      {withCable && (
        <group>
          <mesh geometry={cableGeom} castShadow>
            <meshStandardMaterial color="#18181b" roughness={0.58} metalness={0.08} />
          </mesh>
          {[
            { dy: 0.05, color: '#dc2626' },
            { dy: 0, color: '#eab308' },
            { dy: -0.05, color: '#111827' },
          ].map((lead, idx) => (
            <mesh
              key={idx}
              position={[0.24, -pipeOuterR * 1.28 + lead.dy, pipeOuterR * 0.48]}
              rotation={[0, 0, Math.PI / 2]}
            >
              <cylinderGeometry args={[2.1 * U, 2.1 * U, 18 * U, 8]} />
              <meshStandardMaterial color={lead.color} roughness={0.48} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  )
}

// ============================================================================
// 7. CAIXA DE FONTE DE ÁGUA / CONTADOR DE ÁGUA 3D (fiel a image-52.png e image-53.png)
//    - Caixa branca de embutir/parede "ÁGUA" com porta basculante que abre e fecha
//    - Reaproveita passador ARCO + tubo UPVC + contador eletrónico ZJLCD-BT01 no interior
//    - Caixa de derivação interna com 3 conectores WAGO 221 transparentes já ligados ao contador!
// ============================================================================

export function WaterSupplyBox3D({
  c,
  position = [0, 0, 0],
  onToggleDoor,
  onToggleValve,
  onPressSet,
  onPressClear,
  floorOffsetY,
}: {
  c: ElectricalComponent
  position?: [number, number, number]
  onToggleDoor?: () => void
  onToggleValve?: () => void
  onPressSet?: () => void
  onPressClear?: () => void
  /** Cota do pavimento relativa ao centro do armário (onde a água derramada cai). */
  floorOffsetY?: number
}) {
  const { invalidate } = useThree()
  const doorPivotRef = useRef<THREE.Group>(null)
  const valvePivotRef = useRef<THREE.Group>(null)
  const doorProgressRef = useRef(c.state.doorOpen !== false ? 1 : 0)
  const valveAngleRef = useRef(c.state.valveOpen !== false ? 0 : -Math.PI / 2)

  const doorOpen = c.state.doorOpen !== false
  const valveOpen = c.state.valveOpen !== false
  const windowOpen = Boolean(c.state.readingHatchOpen ?? c.state.windowOpen)
  const junctionCoverOpen = c.state.internalBoxCoverOpen !== false

  const W = 460 * U
  const H = 330 * U
  const D = 170 * U
  const wallT = 10 * U

  const embossedLabel = useMemo(() => {
    const font = new FontLoader().parse(embossFont as unknown as FontData)
    const geometry = new TextGeometry('ÁGUA', { font, size: 27 * U, depth: 0.6 * U, curveSegments: 5, bevelEnabled: true, bevelSize: 0.15 * U, bevelThickness: 0.15 * U, bevelSegments: 1 })
    geometry.computeBoundingBox()
    const center = geometry.boundingBox!.getCenter(new THREE.Vector3())
    geometry.translate(-center.x, -center.y, 0)
    return geometry
  }, [])
  useEffect(() => () => embossedLabel.dispose(), [embossedLabel])

  // Sub-componente virtual para reaproveitar o modelo real WaterFlowMeterZjLcd3D no interior!
  const meterComp = useMemo<ElectricalComponent>(() => ({
    ...c,
    id: `${c.id}-inner-meter`,
    type: 'hydraulicFlowMeter',
    state: {
      ...c.state,
      pipeDN: c.state.pipeDN ?? 'DN32',
      withCable: false,
      installOrientation: 'horizontal',
    },
  }), [c])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.08)
    const targetDoor = doorOpen ? 1 : 0
    if (Math.abs(doorProgressRef.current - targetDoor) > 0.004) {
      doorProgressRef.current += (targetDoor - doorProgressRef.current) * Math.min(1, dt * 8)
      if (Math.abs(doorProgressRef.current - targetDoor) <= 0.004) doorProgressRef.current = targetDoor
      invalidate()
    }
    if (doorPivotRef.current) {
      doorPivotRef.current.rotation.y = doorProgressRef.current * (Math.PI * 0.78)
    }
    const targetValve = valveOpen ? 0 : -Math.PI / 2
    if (Math.abs(valveAngleRef.current - targetValve) > 0.005) {
      valveAngleRef.current += (targetValve - valveAngleRef.current) * Math.min(1, dt * 12)
      if (Math.abs(valveAngleRef.current - targetValve) <= 0.005) valveAngleRef.current = targetValve
      invalidate()
    }
    if (valvePivotRef.current) {
      valvePivotRef.current.rotation.y = valveAngleRef.current
    }
  })

  // Racor de saída na parede direita, no ponto do borne OUT (onde o tubo hidráulico encaixa).
  const outTerminal = c.terminals.find((t) => t.label === 'OUT')
  const outPos = outTerminal?.position3D ?? { x: 1.03, y: 0.58, z: 0.44 }
  const outlet = useMemo(() => {
    const tip = new THREE.Vector3((outPos.x - 0.5) * W, (outPos.y - 0.5) * H, (outPos.z - 0.5) * D)
    const wallX = W / 2
    // Tubo interior desde a saída do conjunto hidráulico até à parede (com curva se a cota diferir).
    const from = new THREE.Vector3(W * 0.45 + 9 * U, H * 0.08, -D * 0.06)
    const inner = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([from, new THREE.Vector3((from.x + wallX) / 2, (from.y + tip.y) / 2, (from.z + tip.z) / 2), new THREE.Vector3(wallX, tip.y, tip.z)]), 16, 17 * U, 14, false)
    return { tip, wallX, inner }
  }, [W, H, D, outPos.x, outPos.y, outPos.z])
  useEffect(() => () => outlet.inner.dispose(), [outlet])
  const outId = outTerminal?.id
  const pipeConnected = useSimStore((st) => !!outId && st.wires.some((w) => w.kind === 'hydraulic' && (w.fromTerminalId === outId || w.toTerminalId === outId)))
  const spilling = c.state.mainsSupplyOn !== false && valveOpen && !pipeConnected
  // Derrame: jato parabólico desde o racor até ao chão, gotas e poça que cresce enquanto corre.
  const floorY = floorOffsetY ?? -H / 2
  const spill = useMemo(() => {
    const { tip } = outlet
    const land = new THREE.Vector3(tip.x + 0.42, floorY + 0.01, tip.z)
    const curve = new THREE.CatmullRomCurve3([
      tip.clone().add(new THREE.Vector3(0.02, 0, 0)),
      new THREE.Vector3(tip.x + 0.2, tip.y - 0.04, tip.z),
      new THREE.Vector3(tip.x + 0.34, (tip.y + land.y) / 2, tip.z),
      land,
    ])
    return { curve, land, stream: new THREE.TubeGeometry(curve, 40, 7 * U, 10, false) }
  }, [outlet, floorY])
  useEffect(() => () => spill.stream.dispose(), [spill])
  const spillDropsRef = useRef<THREE.Group>(null)
  const puddleRef = useRef<THREE.Mesh>(null)
  const splashRef = useRef<THREE.Mesh>(null)
  const puddleSize = useRef(0)
  const spillPhase = useRef(0)
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.08)
    if (spilling || puddleSize.current > 0.001) {
      // A poça cresce enquanto corre água (até ~0,9 m) e seca devagar depois de fechar.
      puddleSize.current = spilling ? Math.min(1, puddleSize.current + dt * 0.12) : Math.max(0, puddleSize.current - dt * 0.04)
      spillPhase.current += dt
      if (puddleRef.current) { const sc = 0.15 + puddleSize.current * 0.85; puddleRef.current.scale.set(sc, sc, 1); puddleRef.current.visible = puddleSize.current > 0.002 }
      if (spillDropsRef.current) spillDropsRef.current.children.forEach((child, i, all) => {
        const frac = (spillPhase.current * 0.9 + i / all.length) % 1
        child.position.copy(spill.curve.getPoint(frac))
      })
      if (splashRef.current) { const p = 0.8 + ((spillPhase.current * 1.1) % 1) * 0.8; splashRef.current.scale.set(p, p, 1) }
      invalidate()
    }
  })

  const junction = useMemo(() => {
    const w = 110 * U, h = 80 * U, d = 45 * U, glandX = 30 * U
    const backInner = -D / 2 + wallT
    const center: [number, number, number] = [W * 0.31, H * 0.31, backInner + d / 2]
    // Saída do cabo do contador (referencial do contador → armário): conjunto [0, H·0,08, −D·0,06], contador [W·0,11, 2, 6] mm, escala 0,68.
    const pipeOuterR = (flowMeterSpecOf(meterComp.state).outerMm / 2) * U
    const scale = 0.68
    const meterExit = new THREE.Vector3(W * 0.11 + scale * -0.08, H * 0.08 + 2 * U + scale * (-pipeOuterR * 0.45), -D * 0.06 + 6 * U + scale * (pipeOuterR * 0.65))
    const gIn = new THREE.Vector3(center[0] - glandX, center[1] - h / 2 - 14 * U, center[2])
    // Desce por baixo do tubo, passa por trás dele (junto ao fundo) e sobe até ao bucim de entrada.
    const meterCable = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      meterExit,
      new THREE.Vector3(meterExit.x + 0.02, -0.06, meterExit.z),
      new THREE.Vector3((meterExit.x + gIn.x) / 2, -0.08, (meterExit.z + gIn.z) / 2),
      new THREE.Vector3(gIn.x, 0.12, gIn.z),
      gIn,
    ]), 48, 3.6 * U, 10, false)
    const gOut = new THREE.Vector3(center[0] + glandX, center[1] + h / 2 + 14 * U, center[2])
    const outCable = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      gOut, new THREE.Vector3(gOut.x, (gOut.y + H / 2) / 2, gOut.z), new THREE.Vector3(gOut.x, H / 2 + 0.35, gOut.z),
    ]), 16, 3.6 * U, 10, false)
    const z0 = 0
    const splice: WagoSpliceCable = {
      key: 'contador',
      sheathEntry: [-glandX, -h / 2 - 14 * U, z0],
      sheathEnd: [-glandX, -h / 2 + 12 * U, z0],
      origin: [0, h / 2 - 23 * U, z0],
      conductors: [{ color: '#dc2626', label: '+24V' }, { color: '#eab308', label: 'PULSE' }, { color: '#111827', label: 'GND' }],
      exitSheathStart: [glandX, h / 2 - 13 * U, z0],
      exitSheathEnd: [glandX, h / 2 + 14 * U, z0],
    }
    return { w, h, d, glandX, center, splice, meterCable, outCable, outX: gOut.x }
  }, [W, H, D, wallT, meterComp.state])
  useEffect(() => () => { junction.meterCable.dispose(); junction.outCable.dispose() }, [junction])

  const boxWhite = '#dfe3e5'
  const innerWhite = '#cbd1d5'
  const pipeGrey = '#464d56'

  return (
    <group position={position} name={`water-supply-box-3d-${c.id}`}>
      {/* Fundo da caixa com 2 furos de fixação */}
      <RoundedBox name="water-box-backplate" position={[0, 0, -D / 2 + wallT / 2]} args={[W, H, wallT]} radius={1.2 * U} smoothness={3} castShadow receiveShadow>
        <meshStandardMaterial name="ABS interior do armário" color={innerWhite} roughness={0.52} />
      </RoundedBox>
      {[-W * 0.36, W * 0.32].map((hx, i) => (
        <mesh key={i} position={[hx, H * 0.34, -D / 2 + wallT + 1 * U]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[7 * U, 7 * U, 3 * U, 14]} />
          <meshStandardMaterial color="#475569" roughness={0.65} />
        </mesh>
      ))}

      {/* 4 paredes laterais */}
      {[[0, H / 2 - wallT / 2, W, wallT], [0, -H / 2 + wallT / 2, W, wallT], [-W / 2 + wallT / 2, 0, wallT, H - wallT * 2], [W / 2 - wallT / 2, 0, wallT, H - wallT * 2]].map(([x, y, w, h], i) => <RoundedBox key={i} position={[x, y, 0]} args={[w, h, D]} radius={1.2 * U} smoothness={3} castShadow receiveShadow>
        <meshPhysicalMaterial name="ABS acetinado do armário" color={boxWhite} roughness={0.42} clearcoat={0.12} clearcoatRoughness={0.4} />
      </RoundedBox>)}

      {/* Moldura frontal perimetral saliente */}
      {[
        [0, H / 2 + 5 * U, W + 24 * U, 16 * U],
        [0, -H / 2 - 5 * U, W + 24 * U, 16 * U],
        [-W / 2 - 5 * U, 0, 16 * U, H + 12 * U],
        [W / 2 + 5 * U, 0, 16 * U, H + 12 * U],
      ].map(([x, y, bw, bh], idx) => (
        <RoundedBox key={idx} position={[x, y, D / 2 - 4 * U]} args={[bw, bh, 12 * U]} radius={1.2 * U} smoothness={3} castShadow receiveShadow>
          <meshStandardMaterial name="Moldura ABS" color="#e2e6e8" roughness={0.42} />
        </RoundedBox>
      ))}
      {/* Vedante recuado e dobradiças reais, visíveis com a porta aberta. */}
      {[[0, H / 2 - 7 * U, W - 12 * U, 2.5 * U], [0, -H / 2 + 7 * U, W - 12 * U, 2.5 * U], [-W / 2 + 7 * U, 0, 2.5 * U, H - 12 * U], [W / 2 - 7 * U, 0, 2.5 * U, H - 12 * U]].map(([x, y, w, h], i) => <mesh key={`seal-${i}`} position={[x, y, D / 2 - 11 * U]}><boxGeometry args={[w, h, 2.5 * U]} /><meshStandardMaterial name="Borracha do vedante" color="#525a5d" roughness={0.86} /></mesh>)}
      {[-H * 0.32, H * 0.32].map((y, i) => <group key={`hinge-${i}`} position={[W / 2 - 3 * U, y, D / 2 + 1 * U]} name="water-box-hinge">
        <mesh castShadow><cylinderGeometry args={[4 * U, 4 * U, 30 * U, 24]} /><meshStandardMaterial name="Aço das dobradiças" color="#aab4bb" metalness={0.9} roughness={0.3} /></mesh>
        {[-8 * U, 8 * U].map((dy, k) => <mesh key={k} position={[-7 * U, dy, -3 * U]}><boxGeometry args={[12 * U, 9 * U, 2 * U]} /><meshStandardMaterial color="#aab4bb" metalness={0.9} roughness={0.3} /></mesh>)}
      </group>)}

      {/* Painel frontal inferior fixo com relevo "ÁGUA" e orifício da fechadura */}
      <group position={[0, -H * 0.24, D / 2 - 5 * U]}>
        <RoundedBox args={[W - wallT * 1.6, H * 0.46, 9 * U]} radius={1.1 * U} smoothness={3} castShadow receiveShadow>
          <meshStandardMaterial name="ABS do painel inferior" color={boxWhite} roughness={0.44} />
        </RoundedBox>
        <mesh name="water-box-embossed-label" geometry={embossedLabel} position={[W * 0.05, 0, 4.6 * U]} castShadow receiveShadow>
          <meshStandardMaterial name="ABS do relevo ÁGUA" color="#d5dadd" roughness={0.46} />
        </mesh>
        <RoundedBox name="water-box-service-hatch" position={[-W * 0.37, 0, 5 * U]} args={[58 * U, 116 * U, 2 * U]} radius={0.8 * U} smoothness={2} castShadow receiveShadow>
          <meshStandardMaterial name="ABS da tampa de serviço" color="#d3d9dc" roughness={0.46} />
        </RoundedBox>
        <mesh position={[-W * 0.37, H * 0.12, 5.5 * U]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[9 * U, 9 * U, 6 * U, 16]} />
          <meshStandardMaterial color="#334155" roughness={0.6} />
        </mesh>
      </group>

      {/* Conjunto hidráulico interno: tubos UPVC + passador ARCO + contador ZJLCD-BT01 */}
      <group position={[0, H * 0.08, -D * 0.06]}>
        <mesh position={[-W * 0.40, -62 * U, 0]} castShadow>
          <cylinderGeometry args={[17 * U, 17 * U, 84 * U, 32]} />
          <meshStandardMaterial color={pipeGrey} roughness={0.42} metalness={0.08} />
        </mesh>
        <mesh position={[-W * 0.40 + 20 * U, -20 * U, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <torusGeometry args={[20 * U, 17 * U, 16, 24, Math.PI / 2]} />
          <meshStandardMaterial color={pipeGrey} roughness={0.4} />
        </mesh>
        <mesh position={[-W * 0.31, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[17 * U, 17 * U, 46 * U, 32]} />
          <meshStandardMaterial color={pipeGrey} roughness={0.42} />
        </mesh>

        {/* Passador ARCO TURIA 3000 clicável em 3D */}
        <group
          position={[-W * 0.19, 0, 0]}
          onClick={(e) => {
            if (!onToggleValve) return
            e.stopPropagation()
            onToggleValve()
          }}
        >
          <ArcoTuria3000ValveMesh scale={13 * U} open={valveOpen} leverRef={valvePivotRef} closedAngle={-Math.PI / 2} />
        </group>

        <mesh position={[-W * 0.08, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[17 * U, 17 * U, 44 * U, 20]} />
          <meshStandardMaterial color={pipeGrey} roughness={0.42} />
        </mesh>

        {/* Contador Eletrónico de Água ZJLCD-BT01 REAL reaproveitado no interior! */}
        <group position={[W * 0.11, 2 * U, 6 * U]} scale={0.68}>
          <WaterFlowMeterZjLcd3D
            c={meterComp}
            position={[0, 0, 0]}
            onPressSet={onPressSet}
            onPressClear={onPressClear}
          />
        </group>

        {/* Tubo UPVC de saída (OUT) */}
        <mesh position={[W * 0.37, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[17 * U, 17 * U, 86 * U, 20]} />
          <meshStandardMaterial color={pipeGrey} roughness={0.42} />
        </mesh>
        <mesh position={[W * 0.45, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[21 * U, 21 * U, 18 * U, 20]} />
          <meshStandardMaterial color="#383e46" roughness={0.38} />
        </mesh>
      </group>

      {/* Caixa de derivação interna (acima do contador, visível com a porta aberta): cabo do contador
          entra pelo bucim inferior e cada condutor (+24V / PULSE / GND) fica no seu WAGO 221-2411 (1-1);
          o cabo de saída sobe e atravessa o topo do armário. */}
      <group position={junction.center} name="water-box-junction">
        <mesh position={[0, 0, -junction.d / 2 + 3 * U]} castShadow receiveShadow>
          <boxGeometry args={[junction.w, junction.h, 6 * U]} />
          <meshStandardMaterial color="#c5cdd6" roughness={0.5} />
        </mesh>
        {[[0, junction.h / 2 - 3 * U, junction.w, 6 * U], [0, -junction.h / 2 + 3 * U, junction.w, 6 * U], [-junction.w / 2 + 3 * U, 0, 6 * U, junction.h], [junction.w / 2 - 3 * U, 0, 6 * U, junction.h]].map(([x, y, bw, bh], i) => (
          <mesh key={i} position={[x, y, 0]} castShadow receiveShadow>
            <boxGeometry args={[bw, bh, junction.d]} />
            <meshStandardMaterial color="#c5cdd6" roughness={0.5} />
          </mesh>
        ))}
        {/* Bucins: entrada (em baixo, à esquerda) e saída (em cima, à direita) */}
        {[[-junction.glandX, -junction.h / 2 - 7 * U], [junction.glandX, junction.h / 2 + 7 * U]].map(([x, y], i) => (
          <mesh key={i} position={[x, y, 0]} castShadow>
            <cylinderGeometry args={[9 * U, 11 * U, 16 * U, 6]} />
            <meshStandardMaterial color="#64748b" roughness={0.42} />
          </mesh>
        ))}
        <InlineWagoSplices3D cables={[junction.splice]} scale={0.55} rowPitch={0.14} />
        {!junctionCoverOpen && (
          <mesh position={[0, 0, junction.d / 2 + 2 * U]} castShadow receiveShadow>
            <boxGeometry args={[junction.w + 4 * U, junction.h + 4 * U, 5 * U]} />
            <meshStandardMaterial color="#d8dce0" roughness={0.36} />
          </mesh>
        )}
      </group>
      {/* Cabo do contador (do sensor até ao bucim de entrada) e cabo de saída pelo topo do armário */}
      <mesh geometry={junction.meterCable} castShadow><meshStandardMaterial color="#18181b" roughness={0.58} metalness={0.08} /></mesh>
      <mesh geometry={junction.outCable} castShadow><meshStandardMaterial color="#18181b" roughness={0.58} metalness={0.08} /></mesh>
      <mesh position={[junction.outX, H / 2, junction.center[2]]} castShadow>
        <cylinderGeometry args={[10 * U, 10 * U, wallT + 6 * U, 14]} />
        <meshStandardMaterial color="#334155" roughness={0.6} />
      </mesh>

      {/* Saída lateral OUT: tubo interior até à parede, passa-parede, porca de união e niple roscado */}
      <mesh geometry={outlet.inner} castShadow>
        <meshStandardMaterial color={pipeGrey} roughness={0.42} metalness={0.08} />
      </mesh>
      <group position={[outlet.wallX, outlet.tip.y, outlet.tip.z]} name={`water-box-outlet-${c.id}`}>
        <mesh position={[0.02, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[30 * U, 30 * U, 8 * U, 24]} />
          <meshStandardMaterial color="#1e293b" roughness={0.7} />
        </mesh>
        <mesh position={[0.07, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[25 * U, 25 * U, 22 * U, 6]} />
          <meshStandardMaterial color="#c8a14a" metalness={0.85} roughness={0.28} />
        </mesh>
        <mesh position={[(outlet.tip.x - outlet.wallX + 0.1) / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[16 * U, 16 * U, Math.max(0.04, outlet.tip.x - outlet.wallX - 0.08), 20]} />
          <meshStandardMaterial color="#d4b15c" metalness={0.88} roughness={0.24} />
        </mesh>
        {/* Rosca do niple (anéis) */}
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} position={[0.1 + i * 0.022, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[16.5 * U, 1.4 * U, 6, 20]} />
            <meshStandardMaterial color="#b8923f" metalness={0.9} roughness={0.22} />
          </mesh>
        ))}
      </group>
      {(spilling || puddleSize.current > 0.002) && (
        <group name={`water-box-spill-${c.id}`} userData={{ spilling }}>
          {spilling && (
            <>
              <mesh geometry={spill.stream} renderOrder={4}>
                <meshPhysicalMaterial userData={{ keepTransparent: true, dcSimuBodySurface: 'preserve' }} color="#38bdf8" emissive="#0ea5e9" emissiveIntensity={0.38} roughness={0.05} transparent opacity={0.85} clearcoat={1} />
              </mesh>
              <group ref={spillDropsRef}>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <mesh key={i} renderOrder={4}>
                    <sphereGeometry args={[6 * U, 10, 10]} />
                    <meshStandardMaterial userData={{ keepTransparent: true, dcSimuBodySurface: 'preserve' }} color="#e0f2fe" emissive="#38bdf8" emissiveIntensity={0.6} transparent opacity={0.9} />
                  </mesh>
                ))}
              </group>
              <mesh ref={splashRef} position={[spill.land.x, spill.land.y + 0.012, spill.land.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={4}>
                <ringGeometry args={[10 * U, 18 * U, 24]} />
                <meshStandardMaterial userData={{ keepTransparent: true, dcSimuBodySurface: 'preserve' }} color="#e0f2fe" emissive="#7dd3fc" emissiveIntensity={0.55} transparent opacity={0.82} side={THREE.DoubleSide} />
              </mesh>
            </>
          )}
          <mesh ref={puddleRef} position={[spill.land.x + 0.1, spill.land.y, spill.land.z + 0.12]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
            <circleGeometry args={[0.9, 36]} />
            <meshPhysicalMaterial userData={{ keepTransparent: true, dcSimuBodySurface: 'preserve' }} color="#38bdf8" emissive="#0284c7" emissiveIntensity={0.2} roughness={0.06} transparent opacity={0.5} clearcoat={1} depthWrite={false} />
          </mesh>
        </group>
      )}

      {/* Porta frontal basculante que abre e fecha (clicar na porta alterna!) */}
      <group
        ref={doorPivotRef}
        position={[W / 2 - 4 * U, 0, D / 2 + 2 * U]}
        rotation={[0, doorProgressRef.current * (Math.PI * 0.78), 0]}
        onClick={(e) => {
          if (!onToggleDoor) return
          e.stopPropagation()
          onToggleDoor()
        }}
      >
        <group position={[-(W / 2 - 4 * U), 0, 0]}>
          <RoundedBox name="water-box-door" args={[W - 6 * U, H - 6 * U, 10 * U]} radius={1.6 * U} smoothness={3} castShadow receiveShadow>
            <meshPhysicalMaterial name="ABS acetinado da porta" color={boxWhite} roughness={0.42} clearcoat={0.12} clearcoatRoughness={0.4} />
          </RoundedBox>
          <group position={[W * 0.06, H * 0.17, 6 * U]} rotation={[windowOpen ? -Math.PI * 0.45 : 0, 0, 0]}>
            <RoundedBox args={[W * 0.52, H * 0.34, 6 * U]} radius={1.2 * U} smoothness={3} castShadow>
              <meshStandardMaterial name="ABS da tampa de leitura" color="#e5e8e9" roughness={0.4} />
            </RoundedBox>
            {[-W * 0.16, W * 0.16].map((hx, i) => (
              <mesh key={i} position={[hx, H * 0.17, 1 * U]}>
                <boxGeometry args={[8 * U, 6 * U, 7 * U]} />
                <meshStandardMaterial color="#94a3b8" metalness={0.85} roughness={0.25} />
              </mesh>
            ))}
          </group>
          <mesh position={[-W * 0.42, 0, -4 * U]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[6 * U, 6 * U, 14 * U, 12]} />
            <meshStandardMaterial name="Aço do fecho" color="#a4afb7" metalness={0.88} roughness={0.26} />
          </mesh>
          <mesh position={[-W * 0.42, 0, 6.5 * U]}><boxGeometry args={[2 * U, 7 * U, 0.8 * U]} /><meshStandardMaterial color="#263238" roughness={0.76} /></mesh>
        </group>
      </group>

      <Text position={[0, -H / 2 - 14 * U, D / 2]} fontSize={0.08} color="#1e293b" anchorX="center" anchorY="top">
        {`${c.ref} · Fonte de Água · ${valveOpen ? 'ABERTA' : 'FECHADA'} · ${Number(c.state.flowRateLpm ?? 0).toFixed(1)} L/m`}
      </Text>
    </group>
  )
}

