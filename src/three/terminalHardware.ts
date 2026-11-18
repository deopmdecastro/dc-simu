import * as THREE from 'three'

/** Captive terminal screw, in a local +Z screwdriver frame. The origin is the
 * head face; all metal stays behind it. The cross recess is a real void in the
 * cap, with metal at its recessed floor — never painted over a solid cylinder.
 * Geometry is authored in mm and can also be used by the offline GLB builder.
 */
export function buildCaptiveTerminalScrew(label: string, radiusMm: number, unit = 1): THREE.Group {
  const root = new THREE.Group()
  root.name = 'terminal_screw_' + label
  root.userData.terminalHardware = 'captive-cross-recess-v1'
  const steel = new THREE.MeshStandardMaterial({ color: '#bfc5ca', metalness: .86, roughness: .3 })
  const recess = new THREE.MeshStandardMaterial({ color: '#555b5d', metalness: .7, roughness: .48 })
  const r = radiusMm, halfSlot = r * .145, reach = r * .77, capDepth = .52, baseDepth = .38
  const shape = new THREE.Shape()
  shape.absarc(0, 0, r, 0, 2 * Math.PI, false)
  const hole = new THREE.Path()
  const points = [[-halfSlot, reach], [halfSlot, reach], [halfSlot, halfSlot], [reach, halfSlot], [reach, -halfSlot], [halfSlot, -halfSlot], [halfSlot, -reach], [-halfSlot, -reach], [-halfSlot, -halfSlot], [-reach, -halfSlot], [-reach, halfSlot], [-halfSlot, halfSlot]]
  points.forEach(([x, y], i) => i ? hole.lineTo(x, y) : hole.moveTo(x, y)); hole.closePath(); shape.holes.push(hole)
  const headGeometry = new THREE.ExtrudeGeometry(shape, { depth: capDepth, bevelEnabled: false, curveSegments: 24 })
  headGeometry.translate(0, 0, -capDepth); headGeometry.scale(unit, unit, unit)
  const head = new THREE.Mesh(headGeometry, steel); head.name = 'terminal_screw_head_' + label; root.add(head)
  const baseGeometry = new THREE.CylinderGeometry(r * .98, r * .98, baseDepth, 32)
  baseGeometry.rotateX(Math.PI / 2); baseGeometry.translate(0, 0, -capDepth - baseDepth / 2); baseGeometry.scale(unit, unit, unit)
  const base = new THREE.Mesh(baseGeometry, recess); base.name = 'terminal_screw_slot_floor_' + label; root.add(base)
  root.rotation.z = Math.PI / 9
  return root
}
