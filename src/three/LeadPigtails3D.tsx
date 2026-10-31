/**
 * Cabos soltos (pigtails) em aparelhos com terminais `contact: 'lead'`.
 * A raiz sai do corpo; a ponta livre é o ponto de ligação a bornes/pentes.
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
  // Sem raiz explícita: recua a ponta ao longo da normal exterior.
  const tip = tipLocal(component, terminal)
  const n = terminal.socket3D?.normal
  if (n) {
    const outward = new THREE.Vector3(n[0], n[1], n[2]).normalize()
    return tip.clone().addScaledVector(outward, -LEAD_PIGTAIL_LENGTH_MM * U)
  }
  return tip.clone().multiplyScalar(0.85)
}

function leadCurve(root: THREE.Vector3, tip: THREE.Vector3): THREE.CatmullRomCurve3 {
  const mid = root.clone().lerp(tip, 0.55)
  // Queda natural do cabo flexível.
  mid.y -= Math.min(0.018, root.distanceTo(tip) * 0.25)
  return new THREE.CatmullRomCurve3([root, mid, tip])
}

function LeadCable({ component, terminal }: { component: ElectricalComponent; terminal: Terminal }) {
  const { curve, radius, color } = useMemo(() => {
    const root = rootLocal(component, terminal)
    const tip = tipLocal(component, terminal)
    const diameterMm = terminal.socket3D?.diameterMm ?? terminal.diameter ?? 1.5
    return {
      curve: leadCurve(root, tip),
      radius: Math.max(0.004, (diameterMm * 0.55) * U),
      color: terminal.color || '#1e293b',
    }
  }, [component, terminal])

  const geometry = useMemo(() => new THREE.TubeGeometry(curve, 12, radius, 8, false), [curve, radius])
  const tip = tipLocal(component, terminal)

  return (
    <group userData={{ noSnapshot: true }}>
      <mesh geometry={geometry} castShadow>
        <meshStandardMaterial color={color} roughness={0.55} metalness={0.05} envMapIntensity={0.9} />
      </mesh>
      {/* Ponta livre — o borne de ligação */}
      <mesh position={tip}>
        <sphereGeometry args={[radius * 1.35, 12, 12]} />
        <meshStandardMaterial color={color} metalness={0.15} roughness={0.4} />
      </mesh>
      {/* Isolamento descascado perto da ponta */}
      <mesh position={tip.clone().lerp(rootLocal(component, terminal), 0.12)}>
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
      {leads.map((terminal) => (
        <LeadCable key={terminal.id} component={component} terminal={terminal} />
      ))}
    </group>
  )
}
