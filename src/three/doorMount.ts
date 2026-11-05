import * as THREE from 'three'
import type { ElectricalComponent } from '../types'
import { componentOrientationOf, orientationRadians } from './componentOrientation'
import { ENCLOSURE, ENCLOSURE_PLATE_FRONT_MM, enclosureDimsOf, enclosureHingeOf } from './enclosureParts'
import { componentPanelXY } from './panelLayout'
import { PANEL_UNITS_PER_MM as U } from './modelPaths'

export function doorMountMotion(c: ElectricalComponent, components: ElectricalComponent[], plateFrontZ: number) {
  if (!c.panelMount || !['door', 'doorOuter'].includes(c.panelMount.face)) return null
  const enclosure = components.find(e => e.id === c.panelMount!.enclosureId && e.type === 'panelEnclosure')
  if (!enclosure || enclosure.state.doorOpen === false) return null
  const dims = enclosureDimsOf(enclosure.state)
  const center = componentPanelXY(enclosure)
  const side = enclosureHingeOf(enclosure.state) === 'right' ? 1 : -1
  return {
    hinge: new THREE.Vector3(center.x + side * (dims.widthMm / 2 + 3) * U, center.y,
      plateFrontZ - ENCLOSURE_PLATE_FRONT_MM * U + (dims.depthMm + 6) * U),
    angle: THREE.MathUtils.degToRad(side * ENCLOSURE.openDeg),
  }
}

/** A mesma orientação para a malha, as caixas sólidas e as pontas dos cabos. */
export function doorMountedComponent(c: ElectricalComponent, components: ElectricalComponent[]): ElectricalComponent {
  const motion = doorMountMotion(c, components, 0)
  if (!motion) return c
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...orientationRadians(componentOrientationOf(c))))
  q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), motion.angle))
  const e = new THREE.Euler().setFromQuaternion(q)
  return { ...c, viewOrientation: { x: THREE.MathUtils.radToDeg(e.x), y: THREE.MathUtils.radToDeg(e.y), z: THREE.MathUtils.radToDeg(e.z) } }
}
