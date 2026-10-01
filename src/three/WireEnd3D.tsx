import { useMemo } from 'react'
import * as THREE from 'three'
import { PANEL_UNITS_PER_MM } from './modelPaths'
import type { WireEndGeometry } from './wireGeometry3D'

const U = PANEL_UNITS_PER_MM
const METAL = '#cfd6e0'
const COPPER = '#c8803f'
const TIN = '#d3d9e1'

let forkShape: THREE.ExtrudeGeometry | null = null
/** Forquilha: lâmina plana em U (abertura virada para a ponta). */
function forkGeometry(): THREE.ExtrudeGeometry {
  if (forkShape) return forkShape
  const half = 4.2 * U
  const length = 10 * U
  const notch = 1.9 * U
  const notchDepth = 6 * U
  const shape = new THREE.Shape()
  shape.moveTo(-half, 0)
  shape.lineTo(-notch, 0)
  shape.lineTo(-notch, notchDepth)
  shape.lineTo(notch, notchDepth)
  shape.lineTo(notch, 0)
  shape.lineTo(half, 0)
  shape.lineTo(half, length)
  shape.lineTo(-half, length)
  shape.closePath()
  forkShape = new THREE.ExtrudeGeometry(shape, { depth: 0.9 * U, bevelEnabled: false })
  forkShape.translate(0, 0, -0.45 * U)
  return forkShape
}

function Cyl({ y, length, radius, color, metalness = 0.15, roughness = 0.5, scaleX = 1 }: { y: number; length: number; radius: number; color: string; metalness?: number; roughness?: number; scaleX?: number }) {
  return <mesh position={[0, y, 0]} scale={[scaleX, 1, 1]} userData={{ noPick: true }} raycast={() => null}>
    <cylinderGeometry args={[radius, radius, length, 16]} />
    <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
  </mesh>
}

/**
 * Terminação do cabo à escala real: ponteira tubular (com colarinho isolado na cor da ponteira),
 * ponteira dupla, pino, olhal, forquilha, faston, ponta estanhada ou ponta nua.
 * Referencial local: +Y = eixo (da ponta para o cabo), +Z = espessura dos terminais planos.
 */
export function WireEnd3D({ geometry, wireRadius, color }: { geometry: WireEndGeometry; wireRadius: number; color: string }) {
  const quaternion = useMemo(() => {
    const y = new THREE.Vector3(...geometry.axis).normalize()
    const z = new THREE.Vector3(...geometry.normal)
    z.addScaledVector(y, -z.dot(y))
    if (z.lengthSq() < 1e-6) z.set(0, 0, 1).addScaledVector(y, -y.z)
    z.normalize()
    const x = new THREE.Vector3().crossVectors(y, z).normalize()
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z))
  }, [geometry.axis, geometry.normal])

  const R = wireRadius
  const embed = geometry.embedMm * U
  const collarR = R * 1.17
  // As ponteiras entram `embed` no borne: o referencial começa nesse recuo.
  const body = (() => {
    switch (geometry.type) {
      case 'ferrule': {
        const sleeve = 8 * U
        const collar = 6 * U
        return <>
          <Cyl y={-embed + sleeve / 2} length={sleeve} radius={R * 0.72} color={METAL} metalness={0.85} roughness={0.25} />
          <Cyl y={-embed + sleeve + collar / 2} length={collar} radius={collarR} color={color} roughness={0.45} />
        </>
      }
      case 'ferruleDouble': {
        const sleeve = 8 * U
        const collar = 8 * U
        const off = R * 0.58
        return <group>
          <group position={[-off, 0, 0]}><Cyl y={-embed + sleeve / 2} length={sleeve} radius={R * 0.6} color={METAL} metalness={0.85} roughness={0.25} /></group>
          <group position={[off, 0, 0]}><Cyl y={-embed + sleeve / 2} length={sleeve} radius={R * 0.6} color={METAL} metalness={0.85} roughness={0.25} /></group>
          <Cyl y={-embed + sleeve + collar / 2} length={collar} radius={collarR} scaleX={1.55} color={color} roughness={0.45} />
        </group>
      }
      case 'pin': {
        const pin = 9 * U
        const collar = 6 * U
        return <>
          <Cyl y={-embed + pin / 2} length={pin} radius={R * 0.34} color={METAL} metalness={0.9} roughness={0.2} />
          <Cyl y={-embed + pin + collar / 2} length={collar} radius={collarR} color={color} roughness={0.45} />
        </>
      }
      case 'ring':
      case 'fork':
      case 'faston': {
        const palm = 10 * U
        const barrel = 4 * U
        const collar = 6 * U
        const lug = geometry.type === 'ring'
          ? <mesh position={[0, 5 * U, 0]} userData={{ noPick: true }} raycast={() => null}>
            <torusGeometry args={[3.4 * U, 1.1 * U, 10, 28]} />
            <meshStandardMaterial color={METAL} metalness={0.85} roughness={0.28} />
          </mesh>
          : geometry.type === 'fork'
            ? <mesh geometry={forkGeometry()} userData={{ noPick: true }} raycast={() => null}><meshStandardMaterial color={METAL} metalness={0.85} roughness={0.28} /></mesh>
            : <mesh position={[0, palm / 2, 0]} userData={{ noPick: true }} raycast={() => null}>
              <boxGeometry args={[6.3 * U, palm, 0.9 * U]} />
              <meshStandardMaterial color={METAL} metalness={0.85} roughness={0.28} />
            </mesh>
        return <>
          {lug}
          <mesh position={[0, palm + 1 * U, 0]} userData={{ noPick: true }} raycast={() => null}>
            <boxGeometry args={[4 * U, 3 * U, 0.9 * U]} />
            <meshStandardMaterial color={METAL} metalness={0.85} roughness={0.28} />
          </mesh>
          <Cyl y={palm + barrel / 2} length={barrel} radius={R * 0.8} color={METAL} metalness={0.85} roughness={0.25} />
          <Cyl y={palm + barrel + collar / 2} length={collar} radius={collarR} color={color} roughness={0.45} />
        </>
      }
      case 'tinned':
        return <Cyl y={geometry.length / 2} length={geometry.length} radius={R * 0.46} color={TIN} metalness={0.7} roughness={0.35} />
      default:
        // ponta nua: cobre à vista
        return <Cyl y={geometry.length / 2} length={geometry.length} radius={R * 0.46} color={COPPER} metalness={0.6} roughness={0.4} />
    }
  })()

  return <group position={geometry.origin} quaternion={quaternion} userData={{ noPick: true }}>{body}</group>
}
