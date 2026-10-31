import * as THREE from 'three'
import type { ElectricalComponent, Terminal } from '../types'
import { LEAD_PIGTAIL_LENGTH_MM } from '../electrical/realInterfaces'
import { component3DDimensions, terminalLocal3D } from './terminal3D'
import { PANEL_UNITS_PER_MM } from './modelPaths'

const U = PANEL_UNITS_PER_MM
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

/** Tampa e bucim adicionados à abertura retangular da base do CAD SB2-3011.
 * Medidas visuais aproximadas em mm, não são uma especificação do fabricante. */
export function towerCableEntry(component: ElectricalComponent) {
  if (component.type !== 'towerLightSb23011') return null
  const dim = component3DDimensions(component)
  const baseY = -dim.y / 2
  const center = new THREE.Vector3(0, baseY, 9.5 * U)
  return {
    center,
    coverWidth: 34 * U, coverDepth: 22 * U, coverThickness: 2 * U,
    glandRadius: 6 * U,
    // Extremidade visível do bucim, com o conjunto de fios a sair pelo centro.
    exit: center.clone().add(new THREE.Vector3(0, -10 * U, 0)),
  }
}

export type Core = { terminal: Terminal; points: THREE.Vector3[]; tip: THREE.Vector3; radius: number; color: string }

export function leadPigtailLayout(component: ElectricalComponent) {
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

  const entry = towerCableEntry(component)
  if (entry) {
    // Os quatro fios saem do mesmo bucim e abrem em leque até aos bornes
    // já existentes; posições elétricas e raízes guardadas não são alteradas.
    const cores: Core[] = items.map(({ terminal, tip }, index) => {
      const fan = fanOf(index)
      const start = entry.exit.clone().add(new THREE.Vector3(fan * 1.1 * U, 2 * U, 0))
      const mid = start.clone().lerp(tip, 0.5).addScaledVector(perp, fan * 1.5 * U)
      return { terminal, tip, points: [start, mid, tip], radius: radiusOf(terminal) * 0.75, color: terminal.color || '#1e293b' }
    })
    return { sheath: null, cores }
  }

  if (items.length > 1 && spread < MULTICORE_SPREAD_MM * U) {
    // Cabo multipolar: bainha comum até ~40 % do comprimento, depois os condutores abrem-se.
    const coreRadius = Math.max(...items.map((i) => radiusOf(i.terminal)))
    // A bainha do CAD XUKT termina com Ø5 mm; continuar com o mesmo diâmetro.
    const sheathRadius = component.type === 'photoSensorXukt1ksml2' ? 2.5 * U : coreRadius * 2.35
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
}
