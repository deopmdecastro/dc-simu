/**
 * Cabos soltos (pigtails) em aparelhos com terminais `contact: 'lead'` (torre de sinalização,
 * sensores de 3 fios…). A ponta de cada condutor é o ponto de ligação a bornes/pentes.
 *
 * Como nos aparelhos reais:
 *  - raízes juntas (um só cabo a sair do corpo, ex.: sensor) → bainha multipolar preta que se abre
 *    nos condutores coloridos;
 *  - torre SB2-3011 → tampa e bucim central, com fios separados até aos bornes;
 *  - restantes raízes afastadas → fios individuais, quase paralelos;
 *  - em ambos, o fim de cada condutor é cobre descarnado.
 */
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { ElectricalComponent } from '../types'
import { leadPigtailLayout, towerCableEntry, type Core } from './leadPigtailLayout'
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
  // Manga termoretrátil na raiz do condutor (saída da bainha multipolar):
  // tubo curto, quase cilíndrico, a apertar o isolamento colorido.
  const shrink = useMemo(() => {
    const pts = core.points
    if (pts.length < 2) return null
    const a = pts[0]
    const b = pts[1]
    const dir = b.clone().sub(a).normalize()
    const length = 6.5 * U
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
    const center = a.clone().addScaledVector(dir, length * 0.48)
    const r = core.radius
    return {
      center,
      quaternion,
      length,
      rMid: r * 1.32,
      rEnd: r * 1.12,
    }
  }, [core])
  return <group userData={{ noSnapshot: true }}>
    <mesh geometry={insulation} castShadow>
      <meshStandardMaterial color={core.color} roughness={0.5} metalness={0.04} envMapIntensity={0.9} />
    </mesh>
    {shrink && (
      <group position={shrink.center} quaternion={shrink.quaternion} userData={{ noSnapshot: true }}>
        <mesh castShadow>
          <cylinderGeometry args={[shrink.rMid, shrink.rMid * 0.98, shrink.length * 0.7, 14]} />
          <meshStandardMaterial color="#1a1f27" roughness={0.72} metalness={0.04} />
        </mesh>
        <mesh position={[0, -shrink.length * 0.38, 0]} castShadow>
          <cylinderGeometry args={[shrink.rMid * 0.98, shrink.rEnd, shrink.length * 0.28, 14]} />
          <meshStandardMaterial color="#1a1f27" roughness={0.74} metalness={0.04} />
        </mesh>
        <mesh position={[0, shrink.length * 0.38, 0]} castShadow>
          <cylinderGeometry args={[shrink.rEnd, shrink.rMid, shrink.length * 0.28, 14]} />
          <meshStandardMaterial color="#0f1318" roughness={0.8} metalness={0.03} />
        </mesh>
      </group>
    )}
    <mesh geometry={copper.geometry} position={copper.center} quaternion={copper.quaternion} castShadow>
      <meshStandardMaterial color={COPPER} roughness={0.32} metalness={0.85} envMapIntensity={1.2} />
    </mesh>
  </group>
}

/** Tampa sobre a cavidade e bucim central, modelados como acessórios visuais. */
function TowerCableEntry3D({ component }: { component: ElectricalComponent }) {
  const entry = towerCableEntry(component)
  if (!entry) return null
  const { center, coverWidth, coverDepth, coverThickness, glandRadius } = entry
  return <group position={center} name="tower-cable-entry" userData={{ noSnapshot: true }}>
    <mesh position={[0, -coverThickness / 2, 0]} castShadow>
      <boxGeometry args={[coverWidth, coverThickness, coverDepth]} />
      <meshStandardMaterial color="#30363d" metalness={0.45} roughness={0.52} />
    </mesh>
    {/* Porca hexagonal e corpo do bucim na face exterior da tampa. */}
    <mesh position={[0, -3.3 * U, 0]} castShadow>
      <cylinderGeometry args={[glandRadius * 1.18, glandRadius * 1.18, 2.8 * U, 6]} />
      <meshStandardMaterial color="#2b3035" metalness={0.24} roughness={0.5} />
    </mesh>
    <mesh position={[0, -6.7 * U, 0]} castShadow>
      <cylinderGeometry args={[glandRadius, glandRadius * 0.83, 4.5 * U, 16]} />
      <meshStandardMaterial color="#181d22" metalness={0.15} roughness={0.48} />
    </mesh>
    <mesh position={[0, -9.2 * U, 0]}>
      <cylinderGeometry args={[glandRadius * 0.7, glandRadius * 0.7, 1 * U, 16]} />
      <meshStandardMaterial color="#0c1014" roughness={0.8} />
    </mesh>
    {[-1, 1].map(sign => <mesh key={sign} position={[sign * 15.5 * U, -2.1 * U, 0]}>
      <cylinderGeometry args={[1.15 * U, 1.15 * U, 0.5 * U, 12]} />
      <meshStandardMaterial color="#9ca3af" metalness={0.8} roughness={0.35} />
    </mesh>)}
  </group>
}

/** Desenha os cabos soltos de um componente (torre de luz, sensores de 3 fios…). */
export default function LeadPigtails3D({ component }: { component: ElectricalComponent }) {
  const layout = useMemo(() => leadPigtailLayout(component), [component])
  useEffect(() => () => layout?.sheath?.geometry.dispose(), [layout])

  if (!layout) return null
  return (
    <group name={`leads-${component.id}`} userData={{ noSnapshot: true }}>
      <TowerCableEntry3D component={component} />
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
