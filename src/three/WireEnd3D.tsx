import { useMemo } from 'react'
import * as THREE from 'three'
import { PANEL_UNITS_PER_MM } from './modelPaths'
import type { WireEndGeometry } from './wireGeometry3D'
import { DOUBLE_FERRULE_COLLAR_MM, FERRULE_COLLAR_MM, ferrulePortOffsetMm } from './wireGeometry3D'

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
export function WireEnd3D({ geometry, wireRadius, color, side }: { geometry: WireEndGeometry; wireRadius: number; color: string; side?: 'from' | 'to' }) {
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
  // Manga metálica proporcional ao furo do borne, mas limitada pelo cabo
  // (evita ponteiras enormes em bornes M4/M5 ou estojos do motor).
  const socketR = geometry.socketDiameterMm ? (geometry.socketDiameterMm * U) / 2 : R * 0.85
  const sleeveR = Math.min(Math.max(R * 0.95, socketR * 0.72), R * 1.35)
  // Colar isolante redondo: ~1.4× o raio do cabo (DIN 46228-4 típico).
  const collarR = Math.max(R * 1.38, sleeveR * 1.08)
  // As ponteiras entram `embed` no borne: o referencial começa nesse recuo.
  const body = (() => {
    switch (geometry.type) {
      case 'banana':
        return <>
          <Cyl y={-2 * U} length={4 * U} radius={2 * U} color={METAL} metalness={0.85} />
          <Cyl y={5 * U} length={10 * U} radius={4.4 * U} color={color} />
          <Cyl y={14 * U} length={8 * U} radius={3.5 * U} color={color} roughness={0.8} />
          <Cyl y={19 * U} length={2 * U} radius={2 * U} color={color} />
        </>
      case 'probe':
        // Ponta de prova: agulha fina centrada no eixo, corpo cónico e cabo
        // alinhados — a ponta assenta no borne sem «flutuar».
        return <>
          <Cyl y={4 * U} length={12 * U} radius={0.55 * U} color={METAL} metalness={0.92} roughness={0.18} />
          <mesh position={[0, 14 * U, 0]} raycast={() => null}>
            <cylinderGeometry args={[3.6 * U, 0.9 * U, 10 * U, 20]} /><meshStandardMaterial color={color} roughness={0.62} />
          </mesh>
          <Cyl y={22 * U} length={3.5 * U} radius={6.5 * U} color={color} roughness={0.78} />
          <Cyl y={52 * U} length={56 * U} radius={4.2 * U} color={color} roughness={0.72} />
          {[34, 42, 50, 58, 66].map(y => <Cyl key={y} y={y * U} length={1.2 * U} radius={4.5 * U} color={color} roughness={0.88} />)}
          <Cyl y={88 * U} length={12 * U} radius={2.4 * U} color={color} roughness={0.8} />
        </>
      case 'ferrule': {
        // Ponteira tubular isolada REDONDA (comando e força): manga metálica +
        // colar cilíndrico proporcional ao cabo — nunca um bloco quadrado.
        const sleeve = Math.min(embed || 6 * U, 8 * U)
        const collar = FERRULE_COLLAR_MM * U
        return <>
          <Cyl y={-sleeve / 2} length={sleeve} radius={sleeveR} color={METAL} metalness={0.88} roughness={0.22} />
          <Cyl y={collar / 2} length={collar} radius={collarR} color={color} roughness={0.6} />
          <Cyl y={collar - 0.4 * U} length={0.9 * U} radius={collarR * 0.92} color={color} roughness={0.64} />
          <Cyl y={collar + 0.2 * U} length={0.45 * U} radius={R * 1.02} color="#1e2430" roughness={0.9} />
        </>
      }
      case 'ferruleDouble': {
        // Colar duplo: corpo oval/cilíndrico compacto com bocas redondas.
        const sleeve = Math.min(embed || 6 * U, 8 * U)
        const collar = DOUBLE_FERRULE_COLLAR_MM * U
        const nPorts = Math.min(4, Math.max(2, geometry.portCount ?? 2))
        const ports = Array.from({ length: nPorts }, (_, idx) => ferrulePortOffsetMm(idx, nPorts) * U)
        const halfSpan = Math.abs(ports[0])
        const bodyR = collarR * 0.95
        const scaleX = (halfSpan + bodyR) / bodyR
        return <group>
          <Cyl y={-sleeve / 2} length={sleeve} radius={sleeveR} color={METAL} metalness={0.88} roughness={0.22} />
          <Cyl y={collar / 2} length={collar} radius={bodyR} scaleX={scaleX} color={color} roughness={0.58} />
          <Cyl y={collar - 0.35 * U} length={0.8 * U} radius={bodyR * 0.94} scaleX={scaleX} color={color} roughness={0.62} />
          {ports.map((x, idx) => (
            <group key={idx} position={[x, collar + 0.08 * U, 0]} userData={{ ferrulePort: true }}>
              <Cyl y={0} length={0.5 * U} radius={R * 1.05} color="#1a1f28" roughness={0.92} />
            </group>
          ))}
        </group>
      }
      case 'pin': {
        const pin = embed || 8 * U
        const collar = 6 * U
        return <>
          <Cyl y={-pin / 2} length={pin} radius={socketR * 0.98} color={METAL} metalness={0.9} roughness={0.2} />
          <Cyl y={collar / 2} length={collar} radius={collarR} color={color} roughness={0.68} />
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

  return <group position={geometry.origin} quaternion={quaternion} userData={{ noPick: true, wireEndType: geometry.type, wireEndSide: side }}>{body}</group>
}
