import * as THREE from 'three'
import type { ComponentDefinition } from '../../catalog/types'
import type { Selection, TestWire } from './editorStore'
import { wireModel } from './wirePath'
import { controlAreaBox } from '../../catalog/controlArea'

/** Caixa conjunta de tudo o que a interface anuncia como selecionado. */
export function editorSelectionBounds(def: ComponentDefinition, root: THREE.Object3D, selection: Selection, multi: string[], selectedWire: string | null, wires: TestWire[]): THREE.Box3 {
  root.updateMatrixWorld(true)
  const box = new THREE.Box3()
  const includePart = (id: string, names?: string[]) => {
    const part = root.getObjectByName(id)
    if (!part) return
    const nodes = names?.length ? names.map((name) => part.getObjectByName(name)).filter((node): node is THREE.Object3D => !!node) : [part]
    nodes.forEach((node) => box.union(new THREE.Box3().setFromObject(node, true)))
  }
  if (selection?.kind === 'part') [selection.id, ...multi].forEach((id) => includePart(id))
  else if (selection?.kind === 'terminal') {
    const terminal = def.terminals.find((terminal) => terminal.id === selection.id)
    if (terminal) box.setFromCenterAndSize(new THREE.Vector3(...terminal.position), new THREE.Vector3(12, 12, 12))
  } else if (selection?.kind === 'control') {
    const control = def.controls?.find((control) => control.id === selection.id)
    if (control) {
      const area = controlAreaBox(root, control)
      if (area) box.union(area)
      else includePart(control.partId, control.nodes)
    }
  } else if (selection?.kind === 'light') {
    const light = def.lights.find((light) => light.id === selection.id)
    if (light) includePart(light.partId, light.nodes)
  } else if (selection?.kind === 'display') {
    const display = def.displays?.find((display) => display.id === selection.id)
    if (display) {
      const span = Math.max(display.widthMm, display.heightMm, 8)
      box.setFromCenterAndSize(new THREE.Vector3(...display.position), new THREE.Vector3(span, span, span))
    }
  } else if (selectedWire) {
    const wire = wires.find((wire) => wire.id === selectedWire)
    if (wire) wireModel(def.terminals, wire)?.chain.forEach((point) => box.expandByPoint(point))
  }
  return box
}
