import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { ElectricalComponent } from '../types'
import { getComponentModelSpec, PANEL_UNITS_PER_MM } from './modelPaths'
import { cloneModelScene, disposeModelClone, fitComponentModel } from './modelFit'
import MotorTerminalBoxCover3D from './MotorTerminalBoxCover3D'
import {
  conveyorDimensionsOf,
  conveyorLineSensorsOf,
  opticalReflectorSizeMm,
  type ConveyorLineSensor,
} from './conveyorModel'
import { Text } from './SceneText'

const U = PANEL_UNITS_PER_MM

/** Textura da chapa lateral FERPLAST / DC-SIMU (fiel a image-14.png / image-15.png). */
function createConveyorBrandTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 192
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = '#f8fafc'
  ctx.fillRect(0, 0, 512, 192)
  ctx.strokeStyle = '#64748b'
  ctx.lineWidth = 6
  ctx.strokeRect(6, 6, 500, 180)

  // Símbolo azul estilo FERPLAST
  ctx.beginPath()
  ctx.arc(72, 86, 42, 0, Math.PI * 2)
  ctx.fillStyle = '#1d6fa5'
  ctx.fill()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 8
  ctx.beginPath()
  ctx.moveTo(46, 68); ctx.lineTo(98, 68)
  ctx.moveTo(72, 68); ctx.lineTo(72, 118)
  ctx.moveTo(54, 92); ctx.lineTo(90, 92)
  ctx.stroke()

  ctx.fillStyle = '#1e293b'
  ctx.font = 'bold 54px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('FERPLAST', 132, 96)

  ctx.fillStyle = '#475569'
  ctx.font = 'bold 20px system-ui, -apple-system, sans-serif'
  ctx.fillText('ROLLER CONVEYOR · RLM SERIES · DC-SIMU', 132, 132)
  ctx.font = '17px monospace'
  ctx.fillStyle = '#64748b'
  ctx.fillText('CE · 3~ 400V 50Hz · IP55', 132, 160)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

/** Textura micro-prismática catadióptrica para espelhos refletores óticos (XUZC50 / P250). */
function createPrismReflectorTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = '#cfd8e3'
  ctx.fillRect(0, 0, size, size)

  const cell = 16
  for (let y = 0; y < size; y += cell) {
    for (let x = 0; x < size; x += cell) {
      // Triângulos prismáticos alternados simulando micro-cubos retrorrefletores
      ctx.fillStyle = '#f8fafc'
      ctx.beginPath()
      ctx.moveTo(x, y); ctx.lineTo(x + cell, y); ctx.lineTo(x + cell / 2, y + cell / 2)
      ctx.closePath(); ctx.fill()

      ctx.fillStyle = '#94a3b8'
      ctx.beginPath()
      ctx.moveTo(x + cell, y); ctx.lineTo(x + cell, y + cell); ctx.lineTo(x + cell / 2, y + cell / 2)
      ctx.closePath(); ctx.fill()

      ctx.fillStyle = '#cbd5e1'
      ctx.beginPath()
      ctx.moveTo(x + cell, y + cell); ctx.lineTo(x, y + cell); ctx.lineTo(x + cell / 2, y + cell / 2)
      ctx.closePath(); ctx.fill()

      ctx.fillStyle = '#e2e8f0'
      ctx.beginPath()
      ctx.moveTo(x, y + cell); ctx.lineTo(x, y); ctx.lineTo(x + cell / 2, y + cell / 2)
      ctx.closePath(); ctx.fill()

      ctx.strokeStyle = 'rgba(51, 65, 85, 0.22)'
      ctx.lineWidth = 0.7
      ctx.strokeRect(x, y, cell, cell)
    }
  }

  // Brilho diagonal subtil
  const grad = ctx.createLinearGradient(0, 0, size, size)
  grad.addColorStop(0, 'rgba(255,255,255,0.28)')
  grad.addColorStop(0.5, 'rgba(255,255,255,0.02)')
  grad.addColorStop(1, 'rgba(255,255,255,0.22)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

/** Textura metálica escovada com riscas subtis para tornar a rotação dos rolos claramente visível. */
function createRollerMetalTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const grad = ctx.createLinearGradient(0, 0, 256, 0)
  grad.addColorStop(0, '#c8d1dc')
  grad.addColorStop(0.22, '#eef3f8')
  grad.addColorStop(0.45, '#b6c1ce')
  grad.addColorStop(0.68, '#e8eef5')
  grad.addColorStop(0.88, '#adb8c6')
  grad.addColorStop(1, '#c8d1dc')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 256, 256)

  // Linhas subtis de torneamento longitudinal para perceção imediata de rotação em marcha
  ctx.fillStyle = 'rgba(71, 85, 105, 0.24)'
  ctx.fillRect(58, 0, 7, 256)
  ctx.fillRect(186, 0, 7, 256)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
  ctx.fillRect(66, 0, 4, 256)
  ctx.fillRect(194, 0, 4, 256)

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

/** Sensor montado na longarina do tapete (editável em posição, lado, altura, ângulo e espelho). */
function ConveyorSensorMount3D({
  sensor,
  L,
  W,
  rollerTopY,
  prismTex,
}: {
  sensor: ConveyorLineSensor
  L: number
  W: number
  rollerTopY: number
  prismTex: THREE.CanvasTexture | null
}) {
  const x = -L / 2 + (L * sensor.positionPct) / 100
  const sideSign = sensor.side === 'back' ? -1 : 1
  const railZ = sideSign * (W / 2 + 24 * U)
  const sensorY = rollerTopY + sensor.heightOffsetMm * U
  const yawRad = (sensor.angleDeg * Math.PI) / 180
  const triggered = !!sensor.triggered
  const isOptical = sensor.kind === 'optical'
  const beamSpan = W + 24 * U

  return (
    <group>
      {/* Suporte em L de aço inox + sensor orientável */}
      <group position={[x, rollerTopY, railZ]}>
        {/* Braço vertical do suporte fixo à longarina */}
        <mesh position={[0, (sensor.heightOffsetMm * U) / 2 - 22 * U, 0]} castShadow>
          <boxGeometry args={[18 * U, sensor.heightOffsetMm * U + 44 * U, 6 * U]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.34} metalness={0.82} />
        </mesh>
        {/* Abraçadeira na longarina */}
        <mesh position={[0, -34 * U, -sideSign * 10 * U]} castShadow>
          <boxGeometry args={[28 * U, 24 * U, 22 * U]} />
          <meshStandardMaterial color="#64748b" roughness={0.44} metalness={0.7} />
        </mesh>

        {/* Cabeça do sensor rotacionável pelo utilizador (`angleDeg`) */}
        <group position={[0, sensorY - rollerTopY, -sideSign * 14 * U]} rotation={[0, yawRad, 0]}>
          {isOptical ? (
            <>
              {/* Corpo fotoelétrico industrial (estilo XUKT) */}
              <mesh castShadow>
                <boxGeometry args={[22 * U, 44 * U, 34 * U]} />
                <meshStandardMaterial color="#1f2937" roughness={0.42} metalness={0.18} />
              </mesh>
              {/* Lente frontal voltada para o tapete */}
              <mesh position={[0, 5 * U, -sideSign * 17.5 * U]}>
                <boxGeometry args={[14 * U, 20 * U, 2 * U]} />
                <meshStandardMaterial
                  color="#7f1d1d"
                  emissive="#ef4444"
                  emissiveIntensity={triggered ? 1.8 : 0.7}
                  roughness={0.18}
                />
              </mesh>
              {/* LED indicador de estado (verde standby / âmbar detetado) */}
              <mesh position={[0, 23 * U, 0]}>
                <sphereGeometry args={[4.5 * U, 10, 10]} />
                <meshStandardMaterial
                  color={triggered ? '#f59e0b' : '#22c55e'}
                  emissive={triggered ? '#f59e0b' : '#22c55e'}
                  emissiveIntensity={1.6}
                />
              </mesh>
              {/* Feixe ótico laser vermelho visível até ao espelho ou até à peça */}
              <mesh
                position={[0, 5 * U, -sideSign * (triggered ? beamSpan * 0.25 : beamSpan * 0.5)]}
                rotation={[Math.PI / 2, 0, 0]}
              >
                <cylinderGeometry
                  args={[2.4 * U, 2.4 * U, triggered ? beamSpan * 0.45 : beamSpan, 8]}
                />
                <meshBasicMaterial
                  userData={{ keepTransparent: true, dcSimuBodySurface: 'preserve' }}
                  color={triggered ? '#fbbf24' : '#ef4444'}
                  transparent
                  opacity={triggered ? 0.65 : 0.36}
                  depthWrite={false}
                />
              </mesh>
            </>
          ) : (
            <>
              {/* Sensor indutivo cilíndrico M18 latão niquelado + face azul */}
              <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
                <cylinderGeometry args={[10 * U, 10 * U, 52 * U, 18]} />
                <meshStandardMaterial color="#cbd5e1" roughness={0.28} metalness={0.86} />
              </mesh>
              <mesh position={[0, 0, -sideSign * 27 * U]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[9.2 * U, 9.2 * U, 4 * U, 18]} />
                <meshStandardMaterial color="#2563eb" roughness={0.32} metalness={0.15} />
              </mesh>
              <mesh position={[0, 0, sideSign * 24 * U]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[10.8 * U, 10.8 * U, 6 * U, 16]} />
                <meshStandardMaterial
                  color={triggered ? '#f59e0b' : '#16a34a'}
                  emissive={triggered ? '#f59e0b' : '#16a34a'}
                  emissiveIntensity={triggered ? 1.8 : 0.6}
                />
              </mesh>
            </>
          )}
        </group>
      </group>

      {/* Espelho refletor prismático montado na longarina oposta (para sensores óticos) */}
      {isOptical && sensor.withReflector && (
        <group position={[x, rollerTopY, -railZ]}>
          <mesh position={[0, (sensor.heightOffsetMm * U) / 2 - 22 * U, 0]} castShadow>
            <boxGeometry args={[16 * U, sensor.heightOffsetMm * U + 44 * U, 6 * U]} />
            <meshStandardMaterial color="#cbd5e1" roughness={0.34} metalness={0.82} />
          </mesh>
          <group position={[0, sensorY - rollerTopY, sideSign * 10 * U]}>
            <mesh castShadow>
              <boxGeometry args={[52 * U, 52 * U, 9 * U]} />
              <meshStandardMaterial color="#334155" roughness={0.46} metalness={0.25} />
            </mesh>
            <mesh position={[0, 0, sideSign * 5 * U]}>
              <boxGeometry args={[44 * U, 44 * U, 2 * U]} />
              <meshPhysicalMaterial
                map={prismTex ?? undefined}
                color="#f1f5f9"
                roughness={0.15}
                metalness={0.78}
                clearcoat={1}
                clearcoatRoughness={0.08}
              />
            </mesh>
          </group>
        </group>
      )}
    </group>
  )
}

/**
 * Tapete Rolante Industrial 3D (fiel a image-14.png & image-15.png):
 * - Longarinas laterais cinzentas com furação de parafusos, placa FERPLAST e pés estruturais
 * - Rolos galvanizados animados em tempo real conforme rotação do motor
 * - Motor SEW 3D reutilizado + redutor parafuso sem-fim (opcional: Com motor | Sem motor)
 * - Caixa de bornes destapada por defeito e tapável no Inspetor
 * - Sensores editáveis na linha (posição, lado, ângulo, espelho refletor) + caixa de teste animada
 */
export function RollerConveyor3D({
  c,
  position,
}: {
  c: ElectricalComponent
  position: [number, number, number]
}) {
  const dims = conveyorDimensionsOf(c.state)
  const sensors = conveyorLineSensorsOf(c.state)
  const running = !!c.state.running && dims.motorized
  const direction = c.state.direction === 'ccw' ? -1 : 1
  const rpmVisual = Number(c.state.rpmVisual ?? (running ? 1 : 0))
  const covered = !!c.state.terminalBoxCovered
  const showBox = c.state.testBoxActive !== false
  const boxPct = Math.max(6, Math.min(94, Number(c.state.testBoxPosPct ?? 26) || 26))

  const motorSpec = getComponentModelSpec('motor3ph')!
  const { scene: motorScene } = useGLTF(motorSpec.path)
  const { invalidate } = useThree()

  const brandTex = useMemo(() => createConveyorBrandTexture(), [])
  const prismTex = useMemo(() => createPrismReflectorTexture(), [])
  const rollerTex = useMemo(() => createRollerMetalTexture(), [])

  // Reaproveita o GLB real do motor SEW DRN80, pintado em alumínio/cinzento industrial (image-15.png)
  const motorModel = useMemo(() => {
    const obj = cloneModelScene(motorScene)
    const bodyCol = new THREE.Color('#9aa4ae')
    obj.traverse((node: THREE.Object3D) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      const cloned = mats.map((m) => {
        const cMat = m.clone() as THREE.MeshStandardMaterial
        if (cMat.color) {
          const hsl = { h: 0, s: 0, l: 0 }
          cMat.color.getHSL(hsl)
          // Pinta apenas a carcaça vermelha original do SEW, preservando placa/bornes/latão/bucim
          if ((hsl.h < 0.08 || hsl.h > 0.92) && hsl.s > 0.35) {
            cMat.color.copy(bodyCol)
            cMat.roughness = 0.36
            cMat.metalness = 0.62
            cMat.userData.dcSimuBodySurface = 'preserve'
          }
        }
        return cMat
      })
      mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0]
    })
    return fitComponentModel(obj, { ...motorSpec, targetHeight: motorSpec.targetHeight * 0.85 }, U, 'bottom')
  }, [motorScene, motorSpec])

  useEffect(() => () => {
    disposeModelClone(motorModel)
    brandTex?.dispose()
    prismTex?.dispose()
    rollerTex?.dispose()
  }, [motorModel, brandTex, prismTex, rollerTex])

  // Mantém a animação dos rolos fluida enquanto o tapete está em marcha
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => invalidate(), 60)
    return () => window.clearInterval(timer)
  }, [running, invalidate])

  const rollersGroupRef = useRef<THREE.Group>(null)
  useFrame((_state, delta) => {
    if (!rollersGroupRef.current || !running) return
    const dt = Math.min(delta, 0.1)
    const dAngle = direction * Math.max(0.35, rpmVisual) * 5.2 * dt
    rollersGroupRef.current.children.forEach((child) => {
      child.rotation.y += dAngle
    })
  })

  const L = dims.lengthMm * U
  const W = dims.widthMm * U
  const H = dims.heightMm * U
  const totalH = dims.totalHeightMm * U
  const frameH = dims.frameHeightMm * U
  const rollerR = (dims.rollerDiameterMm / 2) * U
  const railThick = 34 * U

  // Base dos pés exatamente em y = -totalH / 2 (apoio perfeito no pavimento!)
  const footY = -totalH / 2
  const rollerCenterY = footY + H - rollerR
  const rollerTopY = footY + H
  const frameCenterY = rollerCenterY - 12 * U
  const legHeight = Math.max(0.2, frameCenterY - frameH / 2 - footY)
  const legY = footY + legHeight / 2

  // Número automático de pares de pés conforme comprimento da linha
  const legXs = useMemo(() => {
    const endInset = Math.min(220 * U, L * 0.14)
    if (dims.lengthMm <= 2200) return [-L / 2 + endInset, L / 2 - endInset]
    return [-L / 2 + endInset, 0, L / 2 - endInset]
  }, [L, dims.lengthMm])

  const rollerXs = useMemo(() => {
    const usable = L - 110 * U
    const count = dims.rollerCount
    const out: number[] = []
    for (let i = 0; i < count; i++) {
      const t = count <= 1 ? 0.5 : i / (count - 1)
      out.push(-usable / 2 + t * usable)
    }
    return out
  }, [L, dims.rollerCount])

  const motorSign = dims.motorSide === 'back' ? -1 : 1
  const motorX = L * 0.18
  const gearboxZ = motorSign * (W / 2 + railThick + 55 * U)

  const boxW = Math.min(W * 0.54, 340 * U)
  const boxL = Math.min(L * 0.2, 320 * U)
  const boxH = 220 * U
  const boxX = -L / 2 + (L * boxPct) / 100

  return (
    <group position={position} name={`roller-conveyor-3d-${c.id}`}>
      {/* === 1. LONGARINAS LATERAIS EM AÇO PINTADO CINZENTO (PERFIL C) === */}
      {[-1, 1].map((side) => {
        const zRail = side * (W / 2 + railThick / 2)
        return (
          <group key={`rail-${side}`} position={[0, frameCenterY, zRail]}>
            {/* Alma principal da longarina */}
            <mesh castShadow receiveShadow>
              <boxGeometry args={[L, frameH, railThick]} />
              <meshStandardMaterial color="#919ba6" roughness={0.38} metalness={0.48} />
            </mesh>
            {/* Aba superior dobrada */}
            <mesh position={[0, frameH / 2 + 4 * U, -side * 12 * U]} castShadow receiveShadow>
              <boxGeometry args={[L, 8 * U, railThick + 24 * U]} />
              <meshStandardMaterial color="#a1abb6" roughness={0.35} metalness={0.5} />
            </mesh>
            {/* Aba inferior dobrada */}
            <mesh position={[0, -frameH / 2 - 4 * U, -side * 12 * U]} castShadow receiveShadow>
              <boxGeometry args={[L, 8 * U, railThick + 24 * U]} />
              <meshStandardMaterial color="#838d98" roughness={0.42} metalness={0.5} />
            </mesh>
            {/* Parafusos sextavados laterais alinhados com cada eixo de rolo */}
            {rollerXs.map((rx, idx) => (
              <mesh
                key={`b-${idx}`}
                position={[rx, 12 * U, side * (railThick / 2 + 4 * U)]}
                rotation={[Math.PI / 2, 0, 0]}
              >
                <cylinderGeometry args={[5.5 * U, 5.5 * U, 8 * U, 6]} />
                <meshStandardMaterial color="#475569" roughness={0.32} metalness={0.82} />
              </mesh>
            ))}
          </group>
        )
      })}

      {/* Placa lateral FERPLAST na face frontal esquerda */}
      {brandTex && (
        <mesh position={[-L * 0.24, frameCenterY - 4 * U, W / 2 + railThick + 2 * U]}>
          <planeGeometry args={[Math.min(260 * U, L * 0.24), 76 * U]} />
          <meshStandardMaterial map={brandTex} roughness={0.4} metalness={0.08} />
        </mesh>
      )}

      {/* === 2. PÉS ESTRUTURAIS EM AÇO + SAPATAS APARAFUSADAS AO CHÃO === */}
      {legXs.map((lx, idx) => (
        <group key={`leg-pair-${idx}`} position={[lx, 0, 0]}>
          {/* Travessa superior sob as longarinas */}
          <mesh position={[0, frameCenterY - frameH / 2 - 22 * U, 0]} castShadow receiveShadow>
            <boxGeometry args={[58 * U, 44 * U, W + railThick * 2]} />
            <meshStandardMaterial color="#86909c" roughness={0.42} metalness={0.52} />
          </mesh>
          {/* Barra de contraventamento inferior entre os dois pés */}
          <mesh position={[0, footY + legHeight * 0.22, 0]} castShadow receiveShadow>
            <boxGeometry args={[36 * U, 36 * U, W - 20 * U]} />
            <meshStandardMaterial color="#86909c" roughness={0.42} metalness={0.52} />
          </mesh>
          {/* Coluna esquerda e direita + sapata de fixação ao pavimento */}
          {[-1, 1].map((side) => {
            const lz = side * (W / 2 - 12 * U)
            return (
              <group key={`leg-${side}`} position={[0, 0, lz]}>
                <mesh position={[0, legY, 0]} castShadow receiveShadow>
                  <boxGeometry args={[54 * U, legHeight, 54 * U]} />
                  <meshStandardMaterial color="#919ba6" roughness={0.4} metalness={0.5} />
                </mesh>
                {/* Sapata / chapa de apoio exatamente em y = footY */}
                <mesh position={[0, footY + 7 * U, 0]} castShadow receiveShadow>
                  <boxGeometry args={[104 * U, 14 * U, 92 * U]} />
                  <meshStandardMaterial color="#64748b" roughness={0.44} metalness={0.68} />
                </mesh>
                {/* 2 parafusos de ancoragem no piso */}
                {[-32 * U, 32 * U].map((bx, bi) => (
                  <mesh key={bi} position={[bx, footY + 17 * U, 0]}>
                    <cylinderGeometry args={[6 * U, 6 * U, 8 * U, 6]} />
                    <meshStandardMaterial color="#cbd5e1" roughness={0.28} metalness={0.86} />
                  </mesh>
                ))}
              </group>
            )
          })}
        </group>
      ))}

      {/* === 3. ROLOS METÁLICOS GALVANIZADOS ANIMADOS === */}
      <group ref={rollersGroupRef}>
        {rollerXs.map((rx, idx) => (
          <group key={`roller-${idx}`} position={[rx, rollerCenterY, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <mesh castShadow receiveShadow>
              <cylinderGeometry args={[rollerR, rollerR, W - 10 * U, 18]} />
              <meshStandardMaterial
                map={rollerTex ?? undefined}
                color="#e2e8f0"
                roughness={0.22}
                metalness={0.84}
              />
            </mesh>
            {/* Anéis de rolamento escuros nas extremidades */}
            <mesh position={[0, (W - 16 * U) / 2, 0]}>
              <cylinderGeometry args={[rollerR * 0.86, rollerR * 0.86, 8 * U, 14]} />
              <meshStandardMaterial color="#334155" roughness={0.48} metalness={0.6} />
            </mesh>
            <mesh position={[0, -(W - 16 * U) / 2, 0]}>
              <cylinderGeometry args={[rollerR * 0.86, rollerR * 0.86, 8 * U, 14]} />
              <meshStandardMaterial color="#334155" roughness={0.48} metalness={0.6} />
            </mesh>
          </group>
        ))}
      </group>

      {/* === 4. MOTOREDUTOR LATERAL (REDUTOR SEM-FIM + MOTOR SEW REAPROVEITADO) === */}
      {dims.motorized && (
        <group position={[motorX, frameCenterY - 12 * U, gearboxZ]}>
          {/* Veio de acoplamento do redutor à transmissão dos rolos */}
          <mesh position={[0, 0, -motorSign * 38 * U]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[20 * U, 20 * U, 78 * U, 16]} />
            <meshStandardMaterial color="#475569" roughness={0.36} metalness={0.78} />
          </mesh>
          {/* Caixa redutora parafuso sem-fim em alumínio fundido (fiel a image-15.png) */}
          <mesh castShadow receiveShadow>
            <boxGeometry args={[94 * U, 114 * U, 86 * U]} />
            <meshStandardMaterial color="#9ea8b3" roughness={0.34} metalness={0.72} />
          </mesh>
          {/* Tampa circular lateral do veio oco do redutor */}
          <mesh position={[0, -18 * U, motorSign * 45 * U]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[28 * U, 28 * U, 8 * U, 20]} />
            <meshStandardMaterial color="#475569" roughness={0.42} metalness={0.76} />
          </mesh>
          <mesh position={[0, -18 * U, motorSign * 50 * U]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[12 * U, 12 * U, 4 * U, 14]} />
            <meshStandardMaterial color="#1e293b" roughness={0.5} metalness={0.6} />
          </mesh>
          {/* Flange circular de acoplamento redutor <-> motor */}
          <mesh position={[56 * U, 14 * U, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[62 * U, 62 * U, 22 * U, 22]} />
            <meshStandardMaterial color="#8c96a2" roughness={0.36} metalness={0.72} />
          </mesh>
          {/* Motor elétrico SEW 3D reutilizado (veio acoplado ao redutor, caixa de bornes no topo!) */}
          <group position={[172 * U, -56 * U, 0]} rotation={[0, Math.PI, 0]}>
            <primitive object={motorModel} />
            {/* Tampa aparafusada da caixa de bornes — destapada por defeito, tapável no Inspetor! */}
            <group scale={[0.85, 0.85, 0.85]}>
              <MotorTerminalBoxCover3D covered={covered} color="#8e98a4" />
            </group>
          </group>
        </group>
      )}

      {/* === 5. SENSORES EDITÁVEIS MONTADOS NA LINHA + ESPELHOS REFLETORES === */}
      {sensors.map((sensor) => (
        <ConveyorSensorMount3D
          key={sensor.id}
          sensor={sensor}
          L={L}
          W={W}
          rollerTopY={rollerTopY}
          prismTex={prismTex}
        />
      ))}

      {/* === 6. CAIXA DE TESTE INDUSTRIAL SOBRE OS ROLOS (MOVE-SE COM O MOTOR!) === */}
      {showBox && (
        <group position={[boxX, rollerTopY + boxH / 2 + 2 * U, 0]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[boxL, boxH, boxW]} />
            <meshStandardMaterial color="#c49a6c" roughness={0.78} metalness={0.04} />
          </mesh>
          {/* Fita de selagem no topo da caixa */}
          <mesh position={[0, boxH / 2 + 1 * U, 0]}>
            <boxGeometry args={[boxL * 0.98, 2 * U, boxW * 0.16]} />
            <meshStandardMaterial color="#a67c52" roughness={0.55} />
          </mesh>
          {/* Etiqueta branca de código de barras na lateral */}
          <mesh position={[0, 12 * U, boxW / 2 + 1.5 * U]}>
            <planeGeometry args={[boxL * 0.36, boxH * 0.28]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.5} />
          </mesh>
        </group>
      )}

      {/* Etiqueta técnica frontal no piso */}
      <Text
        position={[0, footY + 12 * U, W / 2 + railThick + (dims.motorized ? 140 * U : 40 * U)]}
        fontSize={0.12}
        color="#1e293b"
        anchorX="center"
        anchorY="bottom"
      >
        {`${c.ref} · Tapete ${dims.lengthMm}×${dims.widthMm}mm · ${
          dims.motorized
            ? running
              ? `EM MARCHA (${direction > 0 ? 'avanço' : 'recuo'})`
              : 'Motorizado (parado)'
            : 'Livre (sem motor)'
        }`}
      </Text>
    </group>
  )
}

/**
 * Componente Espelho Refletor Ótico Prismático 3D (Schneider XUZC50 / Sick P250)
 * para uso com sensores fotoelétricos reflex — movível e rotacionável livremente.
 */
export function OpticalReflector3D({
  c,
  position,
}: {
  c: ElectricalComponent
  position: [number, number, number]
}) {
  const size = opticalReflectorSizeMm(c.state)
  const faceMm = Number(c.state.faceSizeMm) === 80 ? 80 : 50
  const yawDeg = Number(c.state.angleDeg ?? 0) || 0
  const tiltDeg = Number(c.state.tiltDeg ?? 0) || 0
  const showBracket = c.state.bracketMounted !== false

  const prismTex = useMemo(() => createPrismReflectorTexture(), [])
  useEffect(() => () => { prismTex?.dispose() }, [prismTex])

  const face = faceMm * U
  const frameW = (faceMm + 10) * U
  const frameH = (faceMm + 24) * U
  const bodyD = 10 * U

  return (
    <group
      position={position}
      rotation={[(tiltDeg * Math.PI) / 180, (yawDeg * Math.PI) / 180, 0]}
      name={`optical-reflector-3d-${c.id}`}
    >
      {/* Suporte em L de aço escovado orientável */}
      {showBracket && (
        <group position={[0, -frameH * 0.22, -bodyD / 2 - 12 * U]}>
          {/* Chapa vertical traseira */}
          <mesh position={[0, frameH * 0.22, 9 * U]} castShadow receiveShadow>
            <boxGeometry args={[frameW * 0.62, frameH * 0.78, 4 * U]} />
            <meshStandardMaterial color="#b4beca" roughness={0.32} metalness={0.82} />
          </mesh>
          {/* Base horizontal em L */}
          <mesh position={[0, -frameH * 0.16, -6 * U]} castShadow receiveShadow>
            <boxGeometry args={[frameW * 0.68, 4 * U, 34 * U]} />
            <meshStandardMaterial color="#b4beca" roughness={0.32} metalness={0.82} />
          </mesh>
          {/* Parafuso de fixação central */}
          <mesh position={[0, -frameH * 0.12, -10 * U]}>
            <cylinderGeometry args={[4.5 * U, 4.5 * U, 5 * U, 6]} />
            <meshStandardMaterial color="#64748b" roughness={0.3} metalness={0.85} />
          </mesh>
        </group>
      )}

      {/* Moldura ABS cinzenta-escura com abas de fixação M4 */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[frameW, frameH, bodyD]} />
        <meshStandardMaterial color="#27313f" roughness={0.44} metalness={0.2} />
      </mesh>
      {/* 2 furos/parafusos M4 nas abas superior e inferior */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, s * (frameH / 2 - 6 * U), bodyD / 2 + 1 * U]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[3.2 * U, 3.2 * U, 3 * U, 12]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.28} metalness={0.86} />
        </mesh>
      ))}
      {/* Superfície ótica prismática retrorrefletora frontal */}
      <mesh position={[0, 0, bodyD / 2 + 1 * U]}>
        <boxGeometry args={[face, face, 2.2 * U]} />
        <meshPhysicalMaterial
          map={prismTex ?? undefined}
          color="#f8fafc"
          roughness={0.14}
          metalness={0.8}
          clearcoat={1}
          clearcoatRoughness={0.06}
        />
      </mesh>

      <Text
        position={[0, -size.height * U * 0.5 - 6 * U, bodyD / 2 + 4 * U]}
        fontSize={0.075}
        color="#1e293b"
        anchorX="center"
        anchorY="top"
      >
        {`${c.ref} · Espelho ${faceMm}×${faceMm}mm`}
      </Text>
    </group>
  )
}
