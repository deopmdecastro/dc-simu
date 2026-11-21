import { useEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'

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
}

const NO_RAYCAST: THREE.Object3D['raycast'] = () => {}

/** Textura procedural leve de pavimento industrial (betão polido com juntas de dilatação). */
function createConcreteFloorTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = '#a3aab3'
  ctx.fillRect(0, 0, 512, 512)

  // Variação mineral subtil de betão afagado
  for (let i = 0; i < 1800; i++) {
    const x = (i * 197) % 512
    const y = (i * 353) % 512
    const w = 2 + (i % 5)
    const shade = 152 + ((i * 29) % 24)
    ctx.fillStyle = `rgba(${shade}, ${shade + 4}, ${shade + 9}, 0.16)`
    ctx.fillRect(x, y, w, w)
  }

  // Juntas de dilatação em quadrícula limpa
  ctx.strokeStyle = 'rgba(71, 85, 105, 0.28)'
  ctx.lineWidth = 2
  for (const pos of [0, 256]) {
    ctx.beginPath(); ctx.moveTo(pos, 0); ctx.lineTo(pos, 512); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, pos); ctx.lineTo(512, pos); ctx.stroke()
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(16, 14)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

/** Textura procedural subtil para paredes bege/areia da nave fabril (referência arquitetónica). */
function createFactoryWallTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = '#ddd0b8'
  ctx.fillRect(0, 0, 512, 512)

  // Painéis pré-fabricados industriais verticais muito suaves
  ctx.strokeStyle = 'rgba(138, 121, 95, 0.16)'
  ctx.lineWidth = 2
  for (let x = 0; x < 512; x += 128) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke()
  }
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)'
  ctx.lineWidth = 1
  for (let x = 2; x < 512; x += 128) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke()
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(10, 2)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

/** Textura de faixa de segurança amarela e preta (área de manobra do quadro elétrico). */
function createHazardStripeTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = '#facc15'
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

interface BoxInstance {
  pos: [number, number, number]
  scale: [number, number, number]
  color?: string
}

function InstancedBoxes({
  items,
  material,
  castShadow = false,
  receiveShadow = true,
}: {
  items: BoxInstance[]
  material: THREE.Material
  castShadow?: boolean
  receiveShadow?: boolean
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  useEffect(() => () => geometry.dispose(), [geometry])

  useEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    const col = new THREE.Color()
    items.forEach((item, idx) => {
      dummy.position.set(item.pos[0], item.pos[1], item.pos[2])
      dummy.scale.set(item.scale[0], item.scale[1], item.scale[2])
      dummy.updateMatrix()
      mesh.setMatrixAt(idx, dummy.matrix)
      if (item.color) {
        col.set(item.color)
        mesh.setColorAt(idx, col)
      }
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [items])

  if (!items.length) return null
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, items.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      raycast={NO_RAYCAST}
    />
  )
}

/**
 * Ambiente fabril arquitetónico 3D (vista isométrica em corte, inspirada numa nave industrial moderna):
 * - O quadro elétrico e a chapa ficam fisicamente fixos na parede principal bege com suportes,
 *   esteira de cabos superior e zona de segurança amarela no piso.
 * - Ao redor distribuem-se estantes de paletização azuis com cargas, tapetes transportadores com
 *   passadiço metálico, empilhadores, escritório técnico envidraçado e cais de carga.
 * - Todas as malhas ignoram raycast para nunca interferir com edição, arrasto ou cablagem.
 */
export function FactoryEnvironment3D({ center, wallFrontZ, floorY, mountBounds }: FactoryEnvironment3DProps) {
  const invalidate = useThree((s) => s.invalidate)
  const textures = useMemo(() => ({
    floor: createConcreteFloorTexture(),
    wall: createFactoryWallTexture(),
    hazard: createHazardStripeTexture(),
    sign: createElectricalSignTexture(),
  }), [])

  const materials = useMemo(() => ({
    floor: new THREE.MeshStandardMaterial({
      color: '#aeb5be',
      map: textures.floor ?? undefined,
      roughness: 0.78,
      metalness: 0.06,
    }),
    wall: new THREE.MeshStandardMaterial({
      color: '#e0d3bc',
      map: textures.wall ?? undefined,
      roughness: 0.85,
      metalness: 0.02,
    }),
    wallCap: new THREE.MeshStandardMaterial({ color: '#c4b396', roughness: 0.75, metalness: 0.04 }),
    dado: new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.65, metalness: 0.14 }),
    column: new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.55, metalness: 0.28 }),
    steel: new THREE.MeshStandardMaterial({ color: '#7c8796', roughness: 0.42, metalness: 0.62 }),
    rackBlue: new THREE.MeshStandardMaterial({ color: '#1d4ed8', roughness: 0.48, metalness: 0.35 }),
    rackOrange: new THREE.MeshStandardMaterial({ color: '#ea580c', roughness: 0.48, metalness: 0.25 }),
    cargo: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.72, metalness: 0.03 }),
    yellowLine: new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.55, metalness: 0.04 }),
    hazard: new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: textures.hazard ?? undefined,
      roughness: 0.58,
      metalness: 0.05,
    }),
    sign: new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: textures.sign ?? undefined,
      roughness: 0.42,
      metalness: 0.08,
    }),
    conveyorBelt: new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.72, metalness: 0.18 }),
    conveyorFrame: new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.46, metalness: 0.48 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: '#bfdbfe',
      transparent: true,
      opacity: 0.36,
      roughness: 0.12,
      metalness: 0.08,
      depthWrite: false,
    }),
    forkliftYellow: new THREE.MeshStandardMaterial({ color: '#eab308', roughness: 0.42, metalness: 0.22 }),
    truckOrange: new THREE.MeshStandardMaterial({ color: '#ea580c', roughness: 0.44, metalness: 0.22 }),
    trailerGray: new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.55, metalness: 0.16 }),
    darkTire: new THREE.MeshStandardMaterial({ color: '#1f2937', roughness: 0.85, metalness: 0.08 }),
    officeWhite: new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.65, metalness: 0.05 }),
    screenGlow: new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#0ea5e9', emissiveIntensity: 0.55, roughness: 0.25 }),
  }), [textures])

  useEffect(() => () => {
    Object.values(materials).forEach((m) => m.dispose())
    Object.values(textures).forEach((t) => t?.dispose())
  }, [materials, textures])

  useEffect(() => {
    invalidate()
  }, [invalidate, center, wallFrontZ, floorY, mountBounds])

  // Dimensões da nave industrial em unidades da cena (1 u = 100 mm; 10 u = 1 m)
  const originX = center[0]
  const hallW = 138       // ~13,8 m de largura visível (estantes + zona do quadro + corredor)
  const hallD = 112       // ~11,2 m de profundidade à frente da parede
  const wallH = 26        // ~2,6 m em corte arquitetónico limpo (acima do quadro, sem tapar vista)
  const wallT = 1.6
  const backWallZ = wallFrontZ - wallT / 2
  const leftWallX = originX - hallW / 2
  const rightWallX = originX + hallW / 2
  const floorCenterZ = wallFrontZ + hallD / 2

  // Caixa efetiva do quadro na parede para alinhar suportes, calha superior e faixa de segurança
  const panelMinX = mountBounds ? mountBounds.minX : originX - 4
  const panelMaxX = mountBounds ? mountBounds.maxX : originX + 4
  const panelMinY = mountBounds ? mountBounds.minY : floorY + 6
  const panelMaxY = mountBounds ? mountBounds.maxY : floorY + 16
  const panelCenterX = (panelMinX + panelMaxX) / 2
  const panelWidth = Math.max(4, panelMaxX - panelMinX)
  const trayY = Math.min(floorY + wallH - 3.2, panelMaxY + 3.4)

  // Construção instanciada das estantes azuis + vigas laranja + paletes/caixas (estilo image-8.png)
  const warehouse = useMemo(() => {
    const blueParts: BoxInstance[] = []
    const orangeParts: BoxInstance[] = []
    const cargoBoxes: BoxInstance[] = []

    const addRackRow = (startX: number, startZ: number, bays: number, levels: number, alongZ: boolean, bayLen = 6.2, rackDepth = 3.2, levelH = 3.4) => {
      const totalH = levels * levelH + 0.8
      for (let b = 0; b <= bays; b++) {
        const bx = alongZ ? startX : startX + b * bayLen
        const bz = alongZ ? startZ + b * bayLen : startZ
        const dx = alongZ ? rackDepth / 2 : 0
        const dz = alongZ ? 0 : rackDepth / 2
        // Montantes verticais azuis (frente e trás)
        blueParts.push({ pos: [bx - dx, floorY + totalH / 2, bz - dz], scale: [0.34, totalH, 0.34] })
        blueParts.push({ pos: [bx + dx, floorY + totalH / 2, bz + dz], scale: [0.34, totalH, 0.34] })
        // Travessas laterais azuis
        for (let lv = 1; lv <= levels; lv++) {
          const y = floorY + lv * levelH - 0.15
          blueParts.push({
            pos: [bx, y, bz],
            scale: alongZ ? [rackDepth, 0.22, 0.22] : [0.22, 0.22, rackDepth],
          })
        }
      }
      // Longarinas horizontais laranja + caixas brancas/cinzentas em cada módulo
      const cargoPalette = ['#f8fafc', '#e2e8f0', '#f1f5f9', '#dbeafe', '#e7e5e4']
      for (let b = 0; b < bays; b++) {
        const cx = alongZ ? startX : startX + (b + 0.5) * bayLen
        const cz = alongZ ? startZ + (b + 0.5) * bayLen : startZ
        const dx = alongZ ? rackDepth / 2 : 0
        const dz = alongZ ? 0 : rackDepth / 2
        for (let lv = 0; lv < levels; lv++) {
          const beamY = floorY + lv * levelH + 0.32
          orangeParts.push({
            pos: [cx - dx, beamY, cz - dz],
            scale: alongZ ? [0.22, 0.26, bayLen - 0.2] : [bayLen - 0.2, 0.26, 0.22],
          })
          orangeParts.push({
            pos: [cx + dx, beamY, cz + dz],
            scale: alongZ ? [0.22, 0.26, bayLen - 0.2] : [bayLen - 0.2, 0.26, 0.22],
          })
          // 2 paletes/caixas por módulo (com ligeira variação realista de altura)
          for (let slot = 0; slot < 2; slot++) {
            const seed = (b * 13 + lv * 7 + slot * 5 + Math.round(startX)) & 31
            if (seed % 9 === 0 && lv === levels - 1) continue // algumas vagas livres no topo
            const offset = (slot - 0.5) * (bayLen * 0.46)
            const px = alongZ ? cx : cx + offset
            const pz = alongZ ? cz + offset : cz
            const boxH = 1.9 + (seed % 3) * 0.34
            const boxW = bayLen * 0.4
            const boxD = rackDepth * 0.82
            cargoBoxes.push({
              pos: [px, beamY + 0.14 + boxH / 2, pz],
              scale: alongZ ? [boxD, boxH, boxW] : [boxW, boxH, boxD],
              color: cargoPalette[seed % cargoPalette.length],
            })
          }
        }
      }
    }

    // Bloco esquerdo de estantes (enquadramento fabril rico com corredor livre em frente ao quadro)
    addRackRow(originX - 46, wallFrontZ + 10, 4, 4, false, 6.2, 3.2, 3.5)
    addRackRow(originX - 46, wallFrontZ + 18, 4, 4, false, 6.2, 3.2, 3.5)
    addRackRow(originX - 46, wallFrontZ + 26, 4, 4, false, 6.2, 3.2, 3.5)

    // Bloco direito de estantes azuis de alta densidade (como no canto direito de image-8.png,
    // preservando linha de visão limpa para o quadro e motores em vista isométrica)
    addRackRow(originX + 30, wallFrontZ + 20, 5, 5, true, 6.0, 3.2, 3.3)
    addRackRow(originX + 40, wallFrontZ + 20, 5, 5, true, 6.0, 3.2, 3.3)
    addRackRow(originX + 50, wallFrontZ + 20, 5, 5, true, 6.0, 3.2, 3.3)

    // Pilhas de paletes brancas no corredor logístico central (como em image-8.png)
    const stackOrigin = [
      { x: originX - 8, z: wallFrontZ + 56, cols: 3, rows: 2 },
      { x: originX + 10, z: wallFrontZ + 62, cols: 3, rows: 2 },
    ]
    for (const st of stackOrigin) {
      for (let c = 0; c < st.cols; c++) {
        for (let r = 0; r < st.rows; r++) {
          const h = ((c + r) % 2 === 0) ? 2.4 : 1.7
          cargoBoxes.push({
            pos: [st.x + c * 2.7, floorY + h / 2, st.z + r * 2.7],
            scale: [2.35, h, 2.35],
            color: (c + r) % 2 === 0 ? '#f8fafc' : '#e2e8f0',
          })
        }
      }
    }

    return { blueParts, orangeParts, cargoBoxes }
  }, [originX, wallFrontZ, floorY])

  // Pilares estruturais ao longo da parede traseira (evitando sobrepor a zona do quadro elétrico)
  const wallPillars = useMemo(() => {
    const xs: number[] = []
    for (let x = leftWallX + 8; x <= rightWallX - 8; x += 22) {
      if (x > panelMinX - 4.5 && x < panelMaxX + 4.5) continue
      xs.push(x)
    }
    return xs
  }, [leftWallX, rightWallX, panelMinX, panelMaxX])

  // Posição das 4 orelhas exteriores de fixação do quadro à parede (fora do perímetro da caixa, sem invadir o interior)
  const mountBrackets = useMemo((): Array<[number, number]> => {
    const outX = 0.22
    const insetY = 0.85
    return [
      [panelMinX - outX, panelMaxY - insetY],
      [panelMaxX + outX, panelMaxY - insetY],
      [panelMinX - outX, panelMinY + insetY],
      [panelMaxX + outX, panelMinY + insetY],
    ]
  }, [panelMinX, panelMaxX, panelMinY, panelMaxY])

  return (
    <group name="factory-environment-3d" userData={{ excludeFromCover: true, noSnapshot: true }}>
      {/* === PISO INDUSTRIAL DE BETÃO === */}
      <mesh
        position={[originX, floorY - 0.4, floorCenterZ]}
        material={materials.floor}
        receiveShadow
        raycast={NO_RAYCAST}
      >
        <boxGeometry args={[hallW, 0.8, hallD]} />
      </mesh>
      {/* Plinto cinzento exterior subtil da maquete arquitetónica */}
      <mesh position={[originX, floorY - 0.9, floorCenterZ]} material={materials.dado} raycast={NO_RAYCAST}>
        <boxGeometry args={[hallW + 1.8, 0.45, hallD + 1.8]} />
      </mesh>

      {/* === PAREDE PRINCIPAL (ONDE O QUADRO ELÉTRICO FICA FIXO) === */}
      <mesh
        position={[originX, floorY + wallH / 2, backWallZ]}
        material={materials.wall}
        receiveShadow
        raycast={NO_RAYCAST}
      >
        <boxGeometry args={[hallW, wallH, wallT]} />
      </mesh>
      {/* Remate superior arquitetónico da parede traseira */}
      <mesh position={[originX, floorY + wallH + 0.14, backWallZ]} material={materials.wallCap} raycast={NO_RAYCAST}>
        <boxGeometry args={[hallW + 0.2, 0.28, wallT + 0.2]} />
      </mesh>
      {/* Rodapé técnico cinzento da parede traseira */}
      <mesh position={[originX, floorY + 0.9, wallFrontZ + 0.04]} material={materials.dado} raycast={NO_RAYCAST}>
        <boxGeometry args={[hallW, 1.8, 0.12]} />
      </mesh>

      {/* === PAREDE LATERAL ESQUERDA (EM CORTE ISOMÉTRICO) === */}
      <mesh
        position={[leftWallX - wallT / 2, floorY + wallH / 2, floorCenterZ]}
        material={materials.wall}
        receiveShadow
        raycast={NO_RAYCAST}
      >
        <boxGeometry args={[wallT, wallH, hallD]} />
      </mesh>
      <mesh position={[leftWallX - wallT / 2, floorY + wallH + 0.14, floorCenterZ]} material={materials.wallCap} raycast={NO_RAYCAST}>
        <boxGeometry args={[wallT + 0.2, 0.28, hallD + 0.2]} />
      </mesh>
      <mesh position={[leftWallX + 0.04, floorY + 0.9, floorCenterZ]} material={materials.dado} raycast={NO_RAYCAST}>
        <boxGeometry args={[0.12, 1.8, hallD]} />
      </mesh>

      {/* === MURETE PERIMETRAL BAIXO À DIREITA E FRENTE-DIREITA (ESTILO CORTE DA REFERÊNCIA) === */}
      <mesh position={[rightWallX + wallT / 2, floorY + 3.2, floorCenterZ - 14]} material={materials.wall} raycast={NO_RAYCAST}>
        <boxGeometry args={[wallT, 6.4, hallD - 28]} />
      </mesh>
      <mesh position={[rightWallX + wallT / 2, floorY + 6.5, floorCenterZ - 14]} material={materials.wallCap} raycast={NO_RAYCAST}>
        <boxGeometry args={[wallT + 0.18, 0.24, hallD - 28]} />
      </mesh>

      {/* Pilares estruturais verticais na parede traseira */}
      {wallPillars.map((px) => (
        <mesh key={`pillar-${px}`} position={[px, floorY + wallH / 2, wallFrontZ + 0.22]} material={materials.column} castShadow receiveShadow raycast={NO_RAYCAST}>
          <boxGeometry args={[0.9, wallH, 0.52]} />
        </mesh>
      ))}

      {/* === FIXAÇÃO DO QUADRO NA PAREDE + ESTEIRA DE CABOS + ZONA DE SEGURANÇA === */}
      {/* 4 orelhas metálicas exteriores de ancoragem do quadro à parede */}
      {mountBounds && mountBrackets.map(([bx, by], idx) => (
        <mesh key={`bracket-${idx}`} position={[bx, by, wallFrontZ + 0.04]} material={materials.steel} raycast={NO_RAYCAST}>
          <boxGeometry args={[0.42, 0.56, 0.08]} />
        </mesh>
      ))}
      {/* Placa industrial amarela de aviso elétrico na parede junto ao quadro */}
      {mountBounds && (
        <mesh position={[panelMaxX + 2.2, Math.min(panelMaxY - 1.1, floorY + 17), wallFrontZ + 0.04]} material={materials.sign} raycast={NO_RAYCAST}>
          <boxGeometry args={[1.65, 1.95, 0.06]} />
        </mesh>
      )}
      {/* Esteira metálica superior de distribuição elétrica correndo pela parede */}
      <mesh position={[originX, trayY, wallFrontZ + 0.45]} material={materials.steel} raycast={NO_RAYCAST}>
        <boxGeometry args={[hallW - 6, 0.22, 0.9]} />
      </mesh>
      <mesh position={[originX, trayY + 0.25, wallFrontZ + 0.88]} material={materials.steel} raycast={NO_RAYCAST}>
        <boxGeometry args={[hallW - 6, 0.34, 0.08]} />
      </mesh>
      {/* Descida vertical de eletroduto/calha da esteira superior até ao topo do quadro */}
      {mountBounds && trayY > panelMaxY + 0.4 && (
        <group>
          <mesh position={[panelCenterX - panelWidth * 0.22, (trayY + panelMaxY) / 2, wallFrontZ + 0.32]} material={materials.steel} raycast={NO_RAYCAST}>
            <boxGeometry args={[0.55, trayY - panelMaxY, 0.45]} />
          </mesh>
          <mesh position={[panelCenterX + panelWidth * 0.22, (trayY + panelMaxY) / 2, wallFrontZ + 0.32]} material={materials.steel} raycast={NO_RAYCAST}>
            <boxGeometry args={[0.42, trayY - panelMaxY, 0.38]} />
          </mesh>
        </group>
      )}
      {/* Faixa de segurança amarela e preta no piso diretamente em frente ao quadro elétrico */}
      <mesh position={[panelCenterX, floorY + 0.025, wallFrontZ + 5.2]} rotation={[-Math.PI / 2, 0, 0]} material={materials.hazard} raycast={NO_RAYCAST}>
        <planeGeometry args={[panelWidth + 4.8, 0.72]} />
      </mesh>
      <mesh position={[panelCenterX - (panelWidth + 4.8) / 2 + 0.28, floorY + 0.025, wallFrontZ + 2.6]} rotation={[-Math.PI / 2, 0, 0]} material={materials.yellowLine} raycast={NO_RAYCAST}>
        <planeGeometry args={[0.38, 5.2]} />
      </mesh>
      <mesh position={[panelCenterX + (panelWidth + 4.8) / 2 - 0.28, floorY + 0.025, wallFrontZ + 2.6]} rotation={[-Math.PI / 2, 0, 0]} material={materials.yellowLine} raycast={NO_RAYCAST}>
        <planeGeometry args={[0.38, 5.2]} />
      </mesh>

      {/* === LINHAS AMARELAS DE CIRCULAÇÃO INDUSTRIAL NO PISO === */}
      <mesh position={[originX, floorY + 0.02, wallFrontZ + 44]} rotation={[-Math.PI / 2, 0, 0]} material={materials.yellowLine} raycast={NO_RAYCAST}>
        <planeGeometry args={[hallW - 10, 0.38]} />
      </mesh>
      <mesh position={[originX + 20, floorY + 0.02, wallFrontZ + 46]} rotation={[-Math.PI / 2, 0, 0]} material={materials.yellowLine} raycast={NO_RAYCAST}>
        <planeGeometry args={[0.38, 72]} />
      </mesh>
      <mesh position={[originX - 24, floorY + 0.02, wallFrontZ + 58]} rotation={[-Math.PI / 2, 0, 0]} material={materials.yellowLine} raycast={NO_RAYCAST}>
        <planeGeometry args={[0.38, 62]} />
      </mesh>

      {/* === ESTANTES DE PALETIZAÇÃO AZUIS + PALETES INSTANCIADAS === */}
      <InstancedBoxes items={warehouse.blueParts} material={materials.rackBlue} castShadow />
      <InstancedBoxes items={warehouse.orangeParts} material={materials.rackOrange} />
      <InstancedBoxes items={warehouse.cargoBoxes} material={materials.cargo} castShadow />

      {/* === TAPETES TRANSPORTADORES (CONVEYORS) E PASSADIÇO AZUL À ESQUERDA === */}
      <group position={[originX - 44, floorY, wallFrontZ + 52]}>
        {[0, 5.5, 11].map((zOff, i) => (
          <group key={`conv-${i}`} position={[0, 0, zOff]}>
            <mesh position={[0, 1.85, 0]} material={materials.conveyorFrame} castShadow raycast={NO_RAYCAST}>
              <boxGeometry args={[28, 0.42, 2.2]} />
            </mesh>
            <mesh position={[0, 2.1, 0]} material={materials.conveyorBelt} raycast={NO_RAYCAST}>
              <boxGeometry args={[27.6, 0.14, 1.85]} />
            </mesh>
            {[-12, -4, 4, 12].map((lx) => (
              <mesh key={`leg-${lx}`} position={[lx, 0.9, 0]} material={materials.rackBlue} raycast={NO_RAYCAST}>
                <boxGeometry args={[0.32, 1.8, 2.0]} />
              </mesh>
            ))}
            {/* Caixas sobre o tapete */}
            <mesh position={[-7 + i * 5, 2.85, 0]} material={materials.cargo} castShadow raycast={NO_RAYCAST}>
              <boxGeometry args={[2.1, 1.4, 1.55]} />
            </mesh>
            <mesh position={[6 - i * 3, 2.85, 0]} material={materials.cargo} castShadow raycast={NO_RAYCAST}>
              <boxGeometry args={[1.9, 1.4, 1.5]} />
            </mesh>
          </group>
        ))}
        {/* Passadiço metálico elevado azul (assinatura da referência) */}
        <mesh position={[0, 6.2, -5.2]} material={materials.rackBlue} castShadow raycast={NO_RAYCAST}>
          <boxGeometry args={[32, 0.35, 3.2]} />
        </mesh>
        <mesh position={[0, 7.6, -3.7]} material={materials.rackBlue} raycast={NO_RAYCAST}>
          <boxGeometry args={[32, 0.18, 0.14]} />
        </mesh>
        <mesh position={[0, 7.6, -6.7]} material={materials.rackBlue} raycast={NO_RAYCAST}>
          <boxGeometry args={[32, 0.18, 0.14]} />
        </mesh>
        {[-14, -5, 5, 14].map((px) => (
          <mesh key={`mezz-col-${px}`} position={[px, 3.1, -5.2]} material={materials.rackBlue} raycast={NO_RAYCAST}>
            <boxGeometry args={[0.36, 6.2, 0.36]} />
          </mesh>
        ))}
      </group>

      {/* === SALA TÉCNICA MODULAR (CANTO TRASEIRO DIREITO, COMO EM IMAGE-8) === */}
      <group position={[originX + 46, floorY, wallFrontZ + 10]}>
        <mesh position={[0, 4.4, 0]} material={materials.officeWhite} castShadow receiveShadow raycast={NO_RAYCAST}>
          <boxGeometry args={[14, 8.8, 9]} />
        </mesh>
        <mesh position={[-4.5, 3.1, 4.55]} material={materials.dado} raycast={NO_RAYCAST}>
          <boxGeometry args={[2.6, 6.2, 0.16]} />
        </mesh>
      </group>

      {/* === ESCRITÓRIO / SALA DE CONTROLO ENVIDRAÇADA (FRENTE-DIREITA) === */}
      <group position={[originX + 16, floorY, wallFrontZ + 92]}>
        <mesh position={[0, 0.08, 0]} material={materials.officeWhite} receiveShadow raycast={NO_RAYCAST}>
          <boxGeometry args={[24, 0.16, 16]} />
        </mesh>
        {/* Paredes de vidro frontais e laterais */}
        <mesh position={[0, 3.2, -8]} material={materials.glass} raycast={NO_RAYCAST}>
          <boxGeometry args={[24, 6.4, 0.16]} />
        </mesh>
        <mesh position={[-12, 3.2, 0]} material={materials.glass} raycast={NO_RAYCAST}>
          <boxGeometry args={[0.16, 6.4, 16]} />
        </mesh>
        {/* Parede exterior bege baixa do escritório */}
        <mesh position={[0, 3.4, 8]} material={materials.wall} raycast={NO_RAYCAST}>
          <boxGeometry args={[24.4, 6.8, 0.9]} />
        </mesh>
        <mesh position={[12, 3.4, 0]} material={materials.wall} raycast={NO_RAYCAST}>
          <boxGeometry args={[0.9, 6.8, 16.4]} />
        </mesh>
        {/* Secretárias e monitores de supervisão */}
        {[-4, 4].map((dx) => (
          <group key={`desk-${dx}`} position={[dx, 0, -1]}>
            <mesh position={[0, 1.5, 0]} material={materials.officeWhite} raycast={NO_RAYCAST}>
              <boxGeometry args={[5.2, 0.22, 2.4]} />
            </mesh>
            <mesh position={[0, 2.35, -0.5]} material={materials.screenGlow} raycast={NO_RAYCAST}>
              <boxGeometry args={[1.6, 1.0, 0.12]} />
            </mesh>
          </group>
        ))}
      </group>

      {/* === DOIS EMPILHADORES AMARELOS NO CORREDOR LOGÍSTICO === */}
      {[
        { pos: [originX + 2, floorY, wallFrontZ + 48] as [number, number, number], rotY: 0.25 },
        { pos: [originX + 24, floorY, wallFrontZ + 76] as [number, number, number], rotY: -1.1 },
      ].map((fl, idx) => (
        <group key={`forklift-${idx}`} position={fl.pos} rotation={[0, fl.rotY, 0]}>
          <mesh position={[0, 1.4, 0]} material={materials.forkliftYellow} castShadow raycast={NO_RAYCAST}>
            <boxGeometry args={[2.5, 1.6, 4.0]} />
          </mesh>
          <mesh position={[0, 3.1, -0.3]} material={materials.darkTire} raycast={NO_RAYCAST}>
            <boxGeometry args={[2.2, 2.0, 2.4]} />
          </mesh>
          {/* Mastro frontal + garfos */}
          <mesh position={[-0.75, 2.8, 2.15]} material={materials.darkTire} raycast={NO_RAYCAST}>
            <boxGeometry args={[0.24, 5.2, 0.26]} />
          </mesh>
          <mesh position={[0.75, 2.8, 2.15]} material={materials.darkTire} raycast={NO_RAYCAST}>
            <boxGeometry args={[0.24, 5.2, 0.26]} />
          </mesh>
          <mesh position={[-0.6, 0.35, 3.25]} material={materials.steel} raycast={NO_RAYCAST}>
            <boxGeometry args={[0.24, 0.14, 2.2]} />
          </mesh>
          <mesh position={[0.6, 0.35, 3.25]} material={materials.steel} raycast={NO_RAYCAST}>
            <boxGeometry args={[0.24, 0.14, 2.2]} />
          </mesh>
        </group>
      ))}

      {/* === CAIS DE CARGA E CAMIÃO LARANJA/CINZENTO (FRENTE-ESQUERDA, COMO IMAGE-8) === */}
      <group position={[originX - 38, floorY, wallFrontZ + 92]}>
        {/* Guias de doca no chão */}
        {[-7, 1, 9].map((dx) => (
          <mesh key={`dock-${dx}`} position={[dx, 0.45, 2]} material={materials.column} raycast={NO_RAYCAST}>
            <boxGeometry args={[1.1, 0.9, 14]} />
          </mesh>
        ))}
        {/* Camião estacionado no cais 1 */}
        <group position={[-3, 0, 1]} rotation={[0, Math.PI, 0]}>
          {/* Reboque cinzento */}
          <mesh position={[0, 4.1, -2.5]} material={materials.trailerGray} castShadow raycast={NO_RAYCAST}>
            <boxGeometry args={[5.2, 5.6, 13.5]} />
          </mesh>
          {/* Cabina laranja */}
          <mesh position={[0, 3.4, 6.2]} material={materials.truckOrange} castShadow raycast={NO_RAYCAST}>
            <boxGeometry args={[4.9, 4.8, 3.8]} />
          </mesh>
          {/* Para-brisas */}
          <mesh position={[0, 4.2, 8.15]} material={materials.darkTire} raycast={NO_RAYCAST}>
            <boxGeometry args={[4.3, 1.8, 0.12]} />
          </mesh>
          {/* Rodas */}
          {[-2.35, 2.35].map((wx) =>
            [-6.5, -2.2, 6.0].map((wz) => (
              <mesh key={`wheel-${wx}-${wz}`} position={[wx, 1.1, wz]} rotation={[0, 0, Math.PI / 2]} material={materials.darkTire} raycast={NO_RAYCAST}>
                <cylinderGeometry args={[1.1, 1.1, 0.65, 16]} />
              </mesh>
            )),
          )}
        </group>
      </group>
    </group>
  )
}
