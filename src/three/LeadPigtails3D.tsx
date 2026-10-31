/**
 * Cabos soltos (pigtails) em aparelhos com terminais `contact: 'lead'` (torre de sinalização,
 * sensores de 3 fios…). A ponta de cada condutor é o ponto de ligação a bornes/pentes.
 *
 * Como nos aparelhos reais:
 *  - raízes juntas (um só cabo a sair do corpo, ex.: sensor) → bainha multipolar preta que se abre
 *    nos condutores coloridos;
 *  - raízes afastadas (ex.: base da torre) → fios individuais, quase paralelos;
 *  - em ambos, o fim de cada condutor é cobre descarnado.
 */
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { ElectricalComponent } from '../types'
import { leadPigtailLayout, type Core } from './leadPigtailLayout'
import { PANEL_UNITS_PER_MM } from './modelPaths'

const U = PANEL_UNITS_PER_MM
const COPPER = '#c77b3b'
const SHEATH = '#1f2329'
/** Comprimento de cobre descarnado na ponta (mm). */
const STRIP_MM = 7

/** Isolamento até ao início do cobre e o troço de cobre (orientado segundo o fim do condutor). */
function CoreMesh({ core }: { core: Core }) {
  const { insulation, copper } = useMemo(() => {
    const pts = core.points
    const before = pts[pts.length - 2]
    const dir = core.tip.clone().sub(before).normalize()
    const stripStart = core.tip.clone().addScaledVector(dir, -STRIP_MM * U)
    const curve = new THREE.CatmullRomCurve3([...pts.slice(0, -1), stripStart])
    const insulationGeometry = new THREE.TubeGeometry(curve, 24, core.radius, 10, false)
    const copperGeometry = new THREE.CylinderGeometry(core.radius * 0.62, core.radius * 0.55, STRIP_MM * U, 10)
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
    const center = stripStart.clone().lerp(core.tip, 0.5)
    return { insulation: insulationGeometry, copper: { geometry: copperGeometry, quaternion, center } }
  }, [core])
  useEffect(() => () => { insulation.dispose(); copper.geometry.dispose() }, [insulation, copper])
  return <group userData={{ noSnapshot: true }}>
    <mesh geometry={insulation} castShadow>
      <meshStandardMaterial color={core.color} roughness={0.5} metalness={0.04} envMapIntensity={0.9} />
    </mesh>
    <mesh geometry={copper.geometry} position={copper.center} quaternion={copper.quaternion} castShadow>
      <meshStandardMaterial color={COPPER} roughness={0.32} metalness={0.85} envMapIntensity={1.2} />
    </mesh>
  </group>
}

/** Desenha os cabos soltos de um componente (torre de luz, sensores de 3 fios…). */
export default function LeadPigtails3D({ component }: { component: ElectricalComponent }) {
  const layout = useMemo(() => leadPigtailLayout(component), [component])
  useEffect(() => () => layout?.sheath?.geometry.dispose(), [layout])

  if (!layout) return null
  return (
    <group name={`leads-${component.id}`} userData={{ noSnapshot: true }}>
      {layout.sheath && <>
        <mesh geometry={layout.sheath.geometry} castShadow>
          <meshStandardMaterial color={SHEATH} roughness={0.62} metalness={0.05} envMapIntensity={0.8} />
        </mesh>
        {/* Corte da bainha (anel ligeiramente mais largo) onde os condutores saem. */}
        <mesh position={layout.sheath.end} quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), layout.sheath.dir)}>
          <cylinderGeometry args={[layout.sheath.radius * 1.04, layout.sheath.radius * 1.04, 1.2 * U, 14]} />
          <meshStandardMaterial color="#111418" roughness={0.7} />
        </mesh>
      </>}
      {layout.cores.map((core) => <CoreMesh key={core.terminal.id} core={core} />)}
    </group>
  )
}
