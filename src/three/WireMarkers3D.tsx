import { useMemo } from 'react'
import * as THREE from 'three'
import type { Wire } from '../types'
import { PANEL_UNITS_PER_MM } from './modelPaths'
import { expandWireMarkerRings, type WireMarkerRing } from '../electrical/wireMarkers'

/**
 * Anilhas de identificação de cabos 3D tipo clip encaixável (WIC / CAB3 / Partex PA),
 * com código de cores internacional IEC 60062 (0 preto … 9 branco) e letras/símbolos
 * de alto contraste impressos na coroa frontal de cada anel individual.
 */

const glyphTexCache = new Map<string, THREE.CanvasTexture>()
const sleeveMatCache = new Map<string, THREE.MeshPhysicalMaterial>()
const labelMatCache = new Map<string, THREE.MeshStandardMaterial>()

let sharedSleeveGeo: THREE.BufferGeometry | null = null
let sharedGrooveGeo: THREE.BufferGeometry | null = null
let sharedJawMat: THREE.MeshStandardMaterial | null = null

/**
 * Perfil C/D real de uma anilha clip-on industrial (normalizado para raio = 1, largura X = 1):
 * coroa frontal ligeiramente achatada para o carácter impresso, abas laterais elásticas e
 * fenda traseira de encaixe sobre o isolamento do condutor.
 */
function getSharedSleeveGeometry(): THREE.BufferGeometry {
  if (sharedSleeveGeo) return sharedSleeveGeo
  const shape = new THREE.Shape()
  // Secção no plano YZ (será rodada para o eixo X ser a direção do cabo e +Z a face impressa).
  // x_shape -> Y (transversal), y_shape -> Z (frente = +).
  shape.moveTo(-0.34, -0.92)
  shape.quadraticCurveTo(-1.05, -0.78, -1.04, 0.05)
  shape.quadraticCurveTo(-1.02, 0.96, -0.56, 1.12)
  shape.lineTo(0.56, 1.12)
  shape.quadraticCurveTo(1.02, 0.96, 1.04, 0.05)
  shape.quadraticCurveTo(1.05, -0.78, 0.34, -0.92)
  // Fenda interior C que abraça o condutor
  shape.lineTo(0.24, -0.62)
  shape.absarc(0, 0, 0.67, -Math.PI * 0.38, Math.PI * 1.38, false)
  shape.closePath()

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.88,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.045,
    bevelSegments: 2,
    curveSegments: 16,
  })
  // Centrar a extrusão em [-0.5, +0.5] e alinhar eixo de extrusão com +X (tangente do cabo),
  // ficando a coroa impressa (y_shape = +1.12) apontada para +Z (frente do quadro).
  geo.translate(0, 0, -0.44)
  geo.rotateY(Math.PI / 2)
  geo.rotateX(-Math.PI / 2)
  // Agora: X = direção do cabo, Y = perpendicular no plano do quadro, Z = frente (+1.12 = coroa impressa).
  geo.computeVertexNormals()
  sharedSleeveGeo = geo
  return geo
}

function getSharedGrooveGeometry(): THREE.BufferGeometry {
  if (sharedGrooveGeo) return sharedGrooveGeo
  // Pequeno dente/encaixe em V tipo WIC/CAB3 que trava cada anilha na seguinte sem rodar.
  const g = new THREE.TorusGeometry(0.96, 0.045, 8, 22, Math.PI * 1.55)
  g.rotateY(Math.PI / 2)
  g.rotateX(Math.PI * 0.22)
  sharedGrooveGeo = g
  return g
}

function getJawMaterial(): THREE.MeshStandardMaterial {
  if (sharedJawMat) return sharedJawMat
  sharedJawMat = new THREE.MeshStandardMaterial({
    color: '#1e293b',
    roughness: 0.55,
    metalness: 0.04,
  })
  return sharedJawMat
}

function getSleeveMaterial(bg: string): THREE.MeshPhysicalMaterial {
  const hit = sleeveMatCache.get(bg)
  if (hit) return hit
  const mat = new THREE.MeshPhysicalMaterial({
    color: bg,
    roughness: 0.34,
    metalness: 0.02,
    clearcoat: 0.28,
    clearcoatRoughness: 0.28,
  })
  sleeveMatCache.set(bg, mat)
  return mat
}

function getGlyphMaterial(ring: WireMarkerRing, verticalStack: boolean): THREE.MeshStandardMaterial | null {
  if (typeof document === 'undefined') return null
  const key = `${ring.char}|${ring.bg}|${ring.fg}|${verticalStack ? 'V' : 'H'}`
  const hit = labelMatCache.get(key)
  if (hit) return hit

  let tex = glyphTexCache.get(key)
  if (!tex) {
    const size = 256
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    // Fundo da cor exata da anilha com leve curvatura cilíndrica para fusão perfeita.
    ctx.fillStyle = ring.bg
    ctx.fillRect(0, 0, size, size)
    const shade = ctx.createLinearGradient(0, 0, 0, size)
    shade.addColorStop(0, 'rgba(255,255,255,0.16)')
    shade.addColorStop(0.5, 'rgba(255,255,255,0.04)')
    shade.addColorStop(1, 'rgba(0,0,0,0.18)')
    ctx.fillStyle = shade
    ctx.fillRect(0, 0, size, size)

    // Vinco lateral subtil de encaixe chevron (como nas anilhas reais da régua WIC).
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'
    ctx.lineWidth = 6
    ctx.strokeRect(3, 3, size - 6, size - 6)

    // Carácter impresso a quente (DIN industrial, traço grosso e nítido).
    ctx.save()
    ctx.translate(size / 2, size / 2)
    ctx.fillStyle = ring.fg
    ctx.font = '900 186px "DIN Alternate", "Arial Narrow", "Inter", "Arial", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(ring.char, 0, 8)
    // Sublinhado de desambiguação nos dígitos 6 e 9 (norma industrial de anilhas).
    if (ring.char === '6' || ring.char === '9') {
      ctx.fillRect(-44, 88, 88, 13)
    }
    ctx.restore()

    tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    tex.minFilter = THREE.LinearMipmapLinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.needsUpdate = true
    glyphTexCache.set(key, tex)
  }

  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.36,
    metalness: 0.01,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  labelMatCache.set(key, mat)
  return mat
}

let sharedCrownGeo: THREE.BufferGeometry | null = null
function getSharedCrownGeometry(): THREE.BufferGeometry {
  if (sharedCrownGeo) return sharedCrownGeo
  // Superfície ligeiramente abaulada sobre a coroa frontal (+Z) da anilha, acompanhando o perfil real.
  const geo = new THREE.PlaneGeometry(0.90, 1.32, 1, 6)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i)
    const ny = y / 0.66
    const z = 1.135 - ny * ny * 0.14
    pos.setZ(i, z)
  }
  geo.computeVertexNormals()
  sharedCrownGeo = geo
  return geo
}

interface PlacedRing {
  ring: WireMarkerRing
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  radius: number
  width: number
  verticalStack: boolean
}

const WORLD_FRONT = new THREE.Vector3(0, 0, 1)
const WORLD_UP = new THREE.Vector3(0, 1, 0)

export function WireMarkers3D({
  markers,
  curve,
  wireRadius,
}: {
  markers: NonNullable<Wire['markers']>
  curve: THREE.Curve<THREE.Vector3>
  wireRadius: number
}) {
  const placed = useMemo<PlacedRing[]>(() => {
    if (!markers.length) return []
    const totalLen = Math.max(0.001, curve.getLength())
    // Dimensões reais de anilhas WIC1/WIC2 (Ø exterior ~3,4–5,2 mm, passo 3,0 mm por anel).
    const minSleeveR = 1.65 * PANEL_UNITS_PER_MM
    const radius = Math.max(minSleeveR, wireRadius * 1.48)
    const ringWidth = Math.max(2.9 * PANEL_UNITS_PER_MM, radius * 1.42)
    const ringStep = ringWidth * 1.02

    const out: PlacedRing[] = []
    for (const marker of markers) {
      const rings = expandWireMarkerRings(marker)
      if (!rings.length) continue
      const centerT = Math.min(0.96, Math.max(0.04, marker.t))
      const baseTangent = curve.getTangentAt(centerT).normalize()

      // Sentido canónico de leitura: da esquerda para a direita em troços horizontais;
      // de cima para baixo (ou ao longo da leitura) sem NUNCA inverter os caracteres de cabeça para baixo.
      const mostlyVertical = Math.abs(baseTangent.y) > Math.abs(baseTangent.x) * 1.15
      let dirSign = 1
      if (mostlyVertical) {
        // Nos cabos verticais (como na foto IMG_5782): lê-se da esquerda→direita rodando a cabeça ligeiramente,
        // ou de cima→baixo (0-2-5-3-4-1 a descer ao longo do condutor).
        dirSign = baseTangent.y <= 0 ? 1 : -1
      } else {
        // Nos cabos horizontais/oblíquos: sempre da esquerda (+X) para a direita.
        dirSign = baseTangent.x >= 0 ? 1 : -1
      }

      const spanLen = (rings.length - 1) * ringStep
      const minCenter = Math.min(0.45 * totalLen, 0.03 * totalLen + spanLen / 2)
      const maxCenter = Math.max(minCenter, 0.97 * totalLen - spanLen / 2)
      const centerDist = Math.min(maxCenter, Math.max(minCenter, centerT * totalLen))

      rings.forEach((ring, idx) => {
        const offset = (idx - (rings.length - 1) / 2) * ringStep * dirSign
        const dist = Math.min(totalLen * 0.985, Math.max(totalLen * 0.015, centerDist + offset))
        const u = dist / totalLen
        const pos = curve.getPointAt(u)
        const tan = curve.getTangentAt(u).normalize().multiplyScalar(dirSign)

        // Construir referencial ortonormal:
        //   xAxis = direção de leitura ao longo do cabo
        //   zAxis = frente da anilha (o mais virada possível para +Z do quadro)
        //   yAxis = topo do carácter impresso
        const xAxis = tan.clone()
        let zAxis = WORLD_FRONT.clone().addScaledVector(xAxis, -WORLD_FRONT.dot(xAxis))
        if (zAxis.lengthSq() < 1e-4) {
          zAxis = WORLD_UP.clone().addScaledVector(xAxis, -WORLD_UP.dot(xAxis))
        }
        zAxis.normalize()
        const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize()
        // Garantir que o topo do carácter nunca fica virado para baixo.
        if (yAxis.y < -0.15) {
          xAxis.negate()
          yAxis.negate()
        }
        const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis)
        const quat = new THREE.Quaternion().setFromRotationMatrix(basis)
        out.push({
          ring,
          position: pos,
          quaternion: quat,
          radius,
          width: ringWidth,
          verticalStack: mostlyVertical,
        })
      })
    }
    return out
  }, [markers, curve, wireRadius])

  if (!placed.length) return null
  const sleeveGeo = getSharedSleeveGeometry()
  const crownGeo = getSharedCrownGeometry()
  const grooveGeo = getSharedGrooveGeometry()
  const jawMat = getJawMaterial()

  return (
    <group name="wire-markers-3d">
      {placed.map((item, idx) => {
        const sleeveMat = getSleeveMaterial(item.ring.bg)
        const glyphMat = getGlyphMaterial(item.ring, item.verticalStack)
        return (
          <group
            key={idx}
            position={item.position}
            quaternion={item.quaternion}
            scale={[item.width, item.radius, item.radius]}
          >
            <mesh geometry={sleeveGeo} material={sleeveMat} castShadow receiveShadow raycast={() => null} />
            <mesh geometry={grooveGeo} material={jawMat} position={[0.47, 0, 0]} raycast={() => null} />
            {glyphMat && <mesh geometry={crownGeo} material={glyphMat} raycast={() => null} />}
          </group>
        )
      })}
    </group>
  )
}
