/**
 * Cabos soltos (pigtails) em aparelhos com terminais `contact: 'lead'`.
 * A raiz sai do corpo; a ponta livre é o ponto de ligação a bornes/pentes.
 * Visual: feixe que cai e abre ligeiramente (como na torre de sinalização).
 */
import { useMemo } from 'react'
import * as THREE from 'three'
import type { ElectricalComponent, Terminal } from '../types'
import { LEAD_PIGTAIL_LENGTH_MM } from '../electrical/realInterfaces'
import { component3DDimensions, terminalLocal3D } from './terminal3D'
import { PANEL_UNITS_PER_MM } from './modelPaths'

const U = PANEL_UNITS_PER_MM

function tipLocal(component: ElectricalComponent, terminal: Terminal): THREE.Vector3 {
  return terminalLocal3D(component, terminal)
}

function rootLocal(component: ElectricalComponent, terminal: Terminal): THREE.Vector3 {
  const dim = component3DDimensions(component)
  const root = terminal.socket3D?.position
  if (root) {
    return new THREE.Vector3(
      (root.x - 0.5) * dim.x,
      (root.y - 0.5) * dim.y,
      (root.z - 0.5) * dim.z,
    )
  }
  const tip = tipLocal(component, terminal)
  const n = terminal.socket3D?.normal
  if (n) {
    const outward = new THREE.Vector3(n[0], n[1], n[2]).normalize()
    return tip.clone().addScaledVector(outward, -LEAD_PIGTAIL_LENGTH_MM * U)
  }
  return tip.clone().multiplyScalar(0.85)
}

/** Índice estável do fio no feixe (para abrir em leque). */
function leadIndex(component: ElectricalComponent, terminal: Terminal): number {
  const leads = component.terminals.filter((t) => t.contact === 'lead')
  const i = leads.findIndex((t) => t.id === terminal.id)
  return i < 0 ? 0 : i
}

function leadCurve(root: THREE.Vector3, tip: THREE.Vector3, fan: number): THREE.CatmullRomCurve3 {
  const dir = tip.clone().sub(root)
  const len = Math.max(0.01, dir.length())
  // Queda natural: o cabo sai quase vertical e depois curva para a ponta.
  const mid1 = root.clone().lerp(tip, 0.28)
  mid1.y -= Math.min(0.022, len * 0.18)
  mid1.x += fan * 0.004
  mid1.z += fan * 0.002
  const mid2 = root.clone().lerp(tip, 0.72)
  mid2.y -= Math.min(0.012, len * 0.1)
  mid2.x += fan * 0.01
  mid2.z += fan * 0.006
  const tipFan = tip.clone()
  tipFan.x += fan * 0.012
  tipFan.z += fan * 0.008
  return new THREE.CatmullRomCurve3([root, mid1, mid2, tipFan])
}

function LeadCable({
  component,
  terminal,
  index,
  total,
}: {
  component: ElectricalComponent
  terminal: Terminal
  index: number
  total: number
}) {
  const { curve, radius, color, tipPos } = useMemo(() => {
    const root = rootLocal(component, terminal)
    const tip = tipLocal(component, terminal)
    const diameterMm = terminal.socket3D?.diameterMm ?? terminal.diameter ?? 1.5
    // Abertura em leque centrada: -1 … +1
    const fan = total <= 1 ? 0 : (index / (total - 1)) * 2 - 1
    return {
      curve: leadCurve(root, tip, fan),
      radius: Math.max(0.0035, (diameterMm * 0.5) * U),
      color: terminal.color || '#1e293b',
      tipPos: tip.clone().add(new THREE.Vector3(fan * 0.012, 0, fan * 0.008)),
    }
  }, [component, terminal, index, total])

  const geometry = useMemo(() => new THREE.TubeGeometry(curve, 16, radius, 8, false), [curve, radius])
  const root = rootLocal(component, terminal)

  return (
    <group userData={{ noSnapshot: true }}>
      <mesh geometry={geometry} castShadow>
        <meshStandardMaterial color={color} roughness={0.55} metalness={0.05} envMapIntensity={0.9} />
      </mesh>
      {/* Ponta livre — o borne de ligação */}
      <mesh position={tipPos}>
        <sphereGeometry args={[radius * 1.35, 12, 12]} />
        <meshStandardMaterial color={color} metalness={0.15} roughness={0.4} />
      </mesh>
      {/* Isolamento descascado perto da ponta */}
      <mesh position={tipPos.clone().lerp(root, 0.12)}>
        <sphereGeometry args={[radius * 1.15, 10, 10]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.7} metalness={0.05} />
      </mesh>
    </group>
  )
}

/** Desenha os cabos soltos de um componente (torre de luz, sensores de 3 fios…). */
export default function LeadPigtails3D({ component }: { component: ElectricalComponent }) {
  const leads = component.terminals.filter((t) => t.contact === 'lead')
  if (!leads.length) return null
  return (
    <group name={`leads-${component.id}`}>
      {leads.map((terminal, index) => (
        <LeadCable
          key={terminal.id}
          component={component}
          terminal={terminal}
          index={index}
          total={leads.length}
        />
      ))}
    </group>
  )
}
