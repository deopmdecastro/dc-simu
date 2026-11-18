import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { PANEL_UNITS_PER_MM } from './modelPaths'

const U = PANEL_UNITS_PER_MM

export interface FaultPoint3D {
  position: [number, number, number]
  intensity: number // 0.0 a 1.0
}

interface Particle {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  size: number
  maxSize: number
  opacity: number
  life: number
  maxLife: number
}

interface Spark {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  life: number
  maxLife: number
}

/**
 * Cria textura procedural circular com gradiente suave para partículas de fumo
 */
function createSmokePuffTexture(): THREE.CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, 'rgba(40, 48, 60, 0.95)')
  grad.addColorStop(0.35, 'rgba(55, 65, 81, 0.75)')
  grad.addColorStop(0.7, 'rgba(75, 85, 99, 0.35)')
  grad.addColorStop(1, 'rgba(100, 116, 139, 0)')

  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)

  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  return tex
}

/**
 * Efeitos tridimensionais fotorrealistas de Arco Elétrico, Faíscas e Fumação (Smoke)
 */
export function FaultEffects3D({
  arcActive = false,
  arcPosition = [0, 0, 0.22],
  smokePoints = [],
  burntPoints = [],
}: {
  arcActive?: boolean
  arcPosition?: [number, number, number]
  smokePoints?: FaultPoint3D[]
  burntPoints?: Array<[number, number, number]>
}) {
  const smokePuffs = useRef<Particle[]>([])
  const sparks = useRef<Spark[]>([])

  const arcLightRef = useRef<THREE.PointLight>(null)
  const arcCoreRef = useRef<THREE.Mesh>(null)
  const smokeGroupRef = useRef<THREE.Group>(null)
  const sparksLinesRef = useRef<THREE.LineSegments>(null)

  const smokeTexture = useMemo(() => createSmokePuffTexture(), [])

  // Material reutilizável para partículas de fumo
  const smokeMaterial = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: smokeTexture,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
        blending: THREE.NormalBlending,
      }),
    [smokeTexture],
  )

  // Material de faíscas incandescentes
  const sparkMaterial = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: '#ffdd66',
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
      }),
    [],
  )

  // Geometria de faíscas
  const sparkGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(60 * 6) // 60 faíscas × 2 vértices (linha) × 3 coords
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return geo
  }, [])

  // Material de mancha de queimadura/fuligem para componentes queimados
  const sootMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#080808',
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
      }),
    [],
  )

  useEffect(() => {
    return () => {
      smokeTexture.dispose()
      smokeMaterial.dispose()
      sparkMaterial.dispose()
      sparkGeo.dispose()
      sootMaterial.dispose()
    }
  }, [smokeTexture, smokeMaterial, sparkMaterial, sparkGeo, sootMaterial])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1)

    // 1. Animação violenta do arco elétrico (Flicker & Flash)
    if (arcActive && arcLightRef.current) {
      // Flutuação caótica rápida de intensidade (20..50 Hz)
      const flicker = Math.random() > 0.15 ? 4.5 + Math.random() * 5.5 : 0.8
      arcLightRef.current.intensity = flicker
      arcLightRef.current.color.set(Math.random() > 0.4 ? '#ffffff' : Math.random() > 0.5 ? '#93c5fd' : '#f97316')

      if (arcCoreRef.current) {
        const s = (0.04 + Math.random() * 0.05)
        arcCoreRef.current.scale.set(s, s, s)
        arcCoreRef.current.visible = true
      }

      // Emite faíscas incandescentes do centro do arco
      if (sparks.current.length < 50 && Math.random() > 0.25) {
        for (let i = 0; i < 4; i++) {
          const speed = 0.8 + Math.random() * 1.8
          const theta = Math.random() * Math.PI * 2
          const phi = (Math.random() - 0.2) * Math.PI
          sparks.current.push({
            x: arcPosition[0] + (Math.random() - 0.5) * 0.02,
            y: arcPosition[1] + (Math.random() - 0.5) * 0.02,
            z: arcPosition[2] + (Math.random() - 0.5) * 0.02,
            vx: Math.cos(theta) * Math.cos(phi) * speed,
            vy: Math.sin(phi) * speed + 0.3,
            vz: Math.sin(theta) * Math.cos(phi) * speed + 0.4,
            life: 0,
            maxLife: 0.18 + Math.random() * 0.22,
          })
        }
      }
    } else {
      if (arcLightRef.current) arcLightRef.current.intensity = 0
      if (arcCoreRef.current) arcCoreRef.current.visible = false
    }

    // 2. Atualiza e desenha faíscas
    const posAttr = sparkGeo.attributes.position as THREE.BufferAttribute
    const posArr = posAttr.array as Float32Array
    let sparkIdx = 0

    for (let i = sparks.current.length - 1; i >= 0; i--) {
      const sp = sparks.current[i]
      sp.life += dt
      if (sp.life >= sp.maxLife) {
        sparks.current.splice(i, 1)
        continue
      }

      // Gravidade puxa as faíscas para baixo
      sp.vy -= 4.2 * dt
      const prevX = sp.x
      const prevY = sp.y
      const prevZ = sp.z
      sp.x += sp.vx * dt
      sp.y += sp.vy * dt
      sp.z += sp.vz * dt

      if (sparkIdx < 60) {
        const base = sparkIdx * 6
        posArr[base] = prevX
        posArr[base + 1] = prevY
        posArr[base + 2] = prevZ
        posArr[base + 3] = sp.x
        posArr[base + 4] = sp.y
        posArr[base + 5] = sp.z
        sparkIdx++
      }
    }

    // Limpa vértices restantes
    for (let i = sparkIdx * 6; i < posArr.length; i++) {
      posArr[i] = 0
    }
    posAttr.needsUpdate = true

    // 3. Emissão de fumo (smoke puff generation)
    // Emite fumo nos pontos sobreaquecidos ou no arco ativo
    const allEmitters: Array<{ pos: [number, number, number]; intensity: number }> = []
    if (arcActive) {
      allEmitters.push({ pos: arcPosition, intensity: 1.0 })
    }
    for (const p of smokePoints) {
      allEmitters.push({ pos: p.position, intensity: p.intensity })
    }

    for (const emitter of allEmitters) {
      if (smokePuffs.current.length < 90 && Math.random() < emitter.intensity * 0.65) {
        const driftX = (Math.random() - 0.5) * 0.05
        const driftZ = (Math.random() - 0.3) * 0.05
        smokePuffs.current.push({
          x: emitter.pos[0] + (Math.random() - 0.5) * 0.03,
          y: emitter.pos[1] + 0.02,
          z: emitter.pos[2] + 0.02,
          vx: driftX,
          vy: 0.35 + Math.random() * 0.35, // ascensão convectiva vertical rápida
          vz: driftZ,
          size: 0.035,
          maxSize: 0.16 + Math.random() * 0.12,
          opacity: 0.72 * emitter.intensity,
          life: 0,
          maxLife: 1.4 + Math.random() * 0.8,
        })
      }
    }

    // Atualiza partículas de fumo no grupo
    const group = smokeGroupRef.current
    if (group) {
      // Remove sprites mortos
      for (let i = smokePuffs.current.length - 1; i >= 0; i--) {
        const p = smokePuffs.current[i]
        p.life += dt
        if (p.life >= p.maxLife) {
          smokePuffs.current.splice(i, 1)
          continue
        }

        const progress = p.life / p.maxLife
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.z += p.vz * dt
        p.size = THREE.MathUtils.lerp(0.035, p.maxSize, Math.sqrt(progress))
        p.opacity = THREE.MathUtils.lerp(0.75, 0, progress)
      }

      // Sincroniza sprites filhos no Three.js
      while (group.children.length < smokePuffs.current.length) {
        const sprite = new THREE.Sprite(smokeMaterial)
        sprite.renderOrder = 45
        group.add(sprite)
      }
      while (group.children.length > smokePuffs.current.length) {
        const child = group.children[group.children.length - 1]
        group.remove(child)
      }

      for (let i = 0; i < smokePuffs.current.length; i++) {
        const p = smokePuffs.current[i]
        const sprite = group.children[i] as THREE.Sprite
        sprite.position.set(p.x, p.y, p.z)
        sprite.scale.set(p.size, p.size, 1)
        ;(sprite.material as THREE.SpriteMaterial).opacity = p.opacity
      }
    }
  })

  return (
    <group userData={{ noPick: true, noSnapshot: true }}>
      {/* Luz intensa de arco voltaico de curto-circuito */}
      <pointLight
        ref={arcLightRef}
        position={arcPosition}
        distance={2.4}
        decay={2}
        intensity={0}
      />

      {/* Núcleo brilhante visível do arco */}
      <mesh ref={arcCoreRef} position={arcPosition} visible={false}>
        <sphereGeometry args={[0.04, 16, 16]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>

      {/* Feixe de faíscas voando do arco */}
      <lineSegments ref={sparksLinesRef} geometry={sparkGeo} material={sparkMaterial} />

      {/* Nuvem de fumo em ascensão */}
      <group ref={smokeGroupRef} />

      {/* Manchas de fuligem carbonizada / queimadura em componentes avariados */}
      {burntPoints.map((pos, idx) => (
        <group key={`soot-${idx}`} position={pos}>
          {/* Mancha irregular de fuligem preta carbonizada */}
          <mesh position={[0, 0, 0.005]} material={sootMaterial}>
            <circleGeometry args={[0.075, 24]} />
          </mesh>
          <mesh position={[0.015, -0.01, 0.006]} material={sootMaterial}>
            <circleGeometry args={[0.045, 16]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
