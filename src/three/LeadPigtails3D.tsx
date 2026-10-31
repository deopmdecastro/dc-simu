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
import { useMemo } from 'react'
import * as THREE from 'three'
import type { ElectricalComponent, Terminal } from '../types'
import { LEAD_PIGTAIL_LENGTH_MM } from '../electrical/realInterfaces'
import { component3DDimensions, terminalLocal3D } from './terminal3D'
import { PANEL_UNITS_PER_MM } from './modelPaths'

const U = PANEL_UNITS_PER_MM
const COPPER = '#c77b3b'
const SHEATH = '#1f2329'
/** Comprimento de cobre descarnado na ponta (mm). */
const STRIP_MM = 7
/** Raízes a menos disto (mm) umas das outras = um só cabo multipolar. */
const MULTICORE_SPREAD_MM = 8

function rootLocal(component: ElectricalComponent, terminal: Terminal): THREE.Vector3 {
  const dim = component3DDimensions(component)
  const root = terminal.socket3D?.position
  if (root) return new THREE.Vector3((root.x - 0.5) * dim.x, (root.y - 0.5) * dim.y, (root.z - 0.5) * dim.z)
  const tip = terminalLocal3D(component, terminal)
  const n = terminal.socket3D?.normal
  if (n) return tip.clone().addScaledVector(new THREE.Vector3(n[0], n[1], n[2]).normalize(), -LEAD_PIGTAIL_LENGTH_MM * U)
  return tip.clone().multiplyScalar(0.85)
}

type Core = { terminal: Terminal; points: THREE.Vector3[]; tip: THREE.Vector3; radius: number; color: string }

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
  const layout = useMemo(() => {
    const leads = component.terminals.filter((t) => t.contact === 'lead')
    if (!leads.length) return null
    const items = leads.map((terminal) => ({ terminal, root: rootLocal(component, terminal), tip: terminalLocal3D(component, terminal) }))
    const rootCenter = items.reduce((acc, i) => acc.add(i.root), new THREE.Vector3()).divideScalar(items.length)
    const tipCenter = items.reduce((acc, i) => acc.add(i.tip), new THREE.Vector3()).divideScalar(items.length)
    const spread = Math.max(...items.map((i) => i.root.distanceTo(rootCenter)))
    const along = tipCenter.clone().sub(rootCenter)
    const length = Math.max(along.length(), 0.01)
    const dir = along.clone().normalize()
    // Perpendicular para abrir os condutores em leque (no plano que contém a direção do cabo).
    const side = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
    const perp = side.sub(dir.clone().multiplyScalar(side.dot(dir))).normalize()
    const radiusOf = (t: Terminal) => Math.max(0.6, (t.socket3D?.diameterMm ?? t.diameter ?? 1.5) * 0.5) * U
    const fanOf = (index: number) => (items.length <= 1 ? 0 : (index / (items.length - 1)) * 2 - 1)

    if (items.length > 1 && spread < MULTICORE_SPREAD_MM * U) {
      // Cabo multipolar: bainha comum até ~40 % do comprimento, depois os condutores abrem-se.
      const coreRadius = Math.max(...items.map((i) => radiusOf(i.terminal)))
      const sheathRadius = coreRadius * 2.35
      const sheathStart = rootCenter.clone().addScaledVector(dir, -2 * U)
      const sheathEnd = rootCenter.clone().addScaledVector(dir, length * 0.4)
      const sheathMid = rootCenter.clone().lerp(sheathEnd, 0.5)
      const sheathCurve = new THREE.CatmullRomCurve3([sheathStart, sheathMid, sheathEnd])
      const cores: Core[] = items.map(({ terminal, tip }, index) => {
        const fan = fanOf(index)
        const start = sheathEnd.clone().addScaledVector(perp, fan * coreRadius * 0.9)
        const bulge = start.clone().lerp(tip, 0.45).addScaledVector(perp, fan * 5 * U)
        return { terminal, tip, points: [start, bulge, tip], radius: coreRadius, color: terminal.color || '#1e293b' }
      })
      return { sheath: { geometry: new THREE.TubeGeometry(sheathCurve, 12, sheathRadius, 14, false), end: sheathEnd, dir, radius: sheathRadius }, cores }
    }

    // Fios individuais (ex.: torre): saem da base quase paralelos, com uma ligeira queda.
    const cores: Core[] = items.map(({ terminal, root, tip }, index) => {
      const start = root.clone().addScaledVector(dir, -2 * U)
      const mid = root.clone().lerp(tip, 0.55).addScaledVector(perp, fanOf(index) * 1.2 * U)
      return { terminal, tip, points: [start, mid, tip], radius: radiusOf(terminal) * 0.75, color: terminal.color || '#1e293b' }
    })
    return { sheath: null, cores }
  }, [component])

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
