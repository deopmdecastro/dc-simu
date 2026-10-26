import * as THREE from 'three'
import type { ControlDef } from './types'

export function localControlArea(control: Pick<ControlDef, 'hitArea'>): THREE.Box3 | null {
  const area = control.hitArea
  if (!area || area.position.length !== 3 || area.size.length !== 3
    || !area.position.every(Number.isFinite) || !area.size.every((value) => Number.isFinite(value) && value > 0)) return null
  return new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(...area.position), new THREE.Vector3(...area.size))
}

/** Caixa mundial da área de clique; acompanha a peça e os grupos antepassados. */
export function controlAreaBox(root: THREE.Object3D, control: Pick<ControlDef, 'partId' | 'hitArea'>): THREE.Box3 | null {
  const box = localControlArea(control), part = root.getObjectByName(control.partId)
  if (!box || !part) return null
  part.updateWorldMatrix(true, false)
  return box.applyMatrix4(part.matrixWorld)
}
