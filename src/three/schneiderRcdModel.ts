import { bindCachedCanvasTexture } from './canvasTextureCache'
import * as THREE from 'three'
import type { ComponentType, ElectricalComponent } from '../types'
import { cachedCanvasTexture } from './protectionMarkings'

export type SchneiderRcdType = 'residualBreakerSchneiderIid4p' | 'residualBreakerSchneiderIdpnVigi'
export const isSchneiderRcd = (type: ComponentType): type is SchneiderRcdType =>
  type === 'residualBreakerSchneiderIid4p' || type === 'residualBreakerSchneiderIdpnVigi'

export const SCHNEIDER_RCD_HANDLE_NODE = 'schneider_handle_pivot'
export const SCHNEIDER_RCD_TEST_NODE = 'schneider_test'
export const SCHNEIDER_RCD_THROW_DEG = 70
/** iID 4P: curso da alavanca e eixo real relativo ao nó do GLB (metros: y −3,2 mm, z −6 mm). */
export const SCHNEIDER_IID_THROW_DEG = 45
export const SCHNEIDER_IID_AXIS_OFFSET_M = new THREE.Vector3(0, -0.0032, -0.006)
export type SchneiderRcdAction = 'toggle' | 'test'
const ownedIndicators = new WeakSet<THREE.Object3D>()

/** Anota as peças móveis ANTES da junção de malhas estáticas do painel. */
export function prepareSchneiderRcdModel(root: THREE.Object3D): void {
  root.traverse((node) => {
    if (node.name.startsWith('schneider_handle') || node.name.startsWith('schneider_visisafe')) node.userData.schneiderControl = 'toggle'
    else if (node.name.startsWith('schneider_test')) node.userData.schneiderControl = 'test'
    // As fitas têm UVs próprios 0…1. O acabamento CAD não pode reprojetá-los
    // em milímetros antes de as texturas O.OFF / I.ON serem aplicadas.
    if (node.name.startsWith('schneider_visisafe')) {
      node.userData.protectionMarking = true
      const mesh = node as THREE.Mesh
      if (mesh.isMesh && !ownedIndicators.has(node)) {
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(m => m.clone()) : mesh.material.clone()
        ownedIndicators.add(node)
      }
    }
    const mesh = node as THREE.Mesh
    if (mesh.isMesh) mesh.castShadow = mesh.receiveShadow = true
  })
}

export function schneiderRcdAction(object: THREE.Object3D): SchneiderRcdAction | null {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    const action = node.userData.schneiderControl
    if (action === 'test' || action === 'toggle') return action
  }
  return null
}

/** A geometria não altera IDs, bornes nem a lógica RCCB/RCBO dos projetos. */
export function schneiderRcdActionPatch(component: Pick<ElectricalComponent, 'state' | 'locked'>, action: SchneiderRcdAction): Record<string, unknown> | null {
  if (component.locked) return null
  return action === 'test'
    ? { closed: false, tripped: true, tripReason: 'test', testPressed: false }
    : { closed: component.state.tripped ? true : !component.state.closed, tripped: false, tripReason: '', testPressed: false }
}

/** Mesma pose/VisiSafe no painel, na vista frontal e na capa da biblioteca. */
export function applySchneiderRcdState(root: THREE.Object3D, state: Record<string, unknown>): void {
  const tripped = !!state.tripped
  const closed = !!state.closed && !tripped
  const pivot = root.getObjectByName(SCHNEIDER_RCD_HANDLE_NODE)
  if (pivot && pivot.getObjectByName('schneider_handle_grip')) {
    // iID 4P: o nó do GLB está quase à face (z 61 mm) e rodava 70° — a alavanca saltava para
    // fora, o punho saía pela lateral e via-se o interior oco da peça do STEP. O eixo real fica
    // no centro da alavanca, ~11 mm dentro do corpo; daí o punho vai de baixo (O.OFF) a cima
    // (I.ON) simetricamente, num curso de 45°. Roda-se em torno desse eixo sem regenerar o GLB.
    const restPosition = (pivot.userData.schneiderRestPosition ??= pivot.position.clone()) as THREE.Vector3
    const angle = -THREE.MathUtils.degToRad(SCHNEIDER_IID_THROW_DEG) * (closed ? 1 : tripped ? 0.5 : 0)
    const toAxis = SCHNEIDER_IID_AXIS_OFFSET_M.clone()
    pivot.rotation.x = angle
    // posição = eixo + R·(repouso − eixo), com o eixo = repouso + toAxis
    pivot.position.copy(restPosition).add(toAxis).add(toAxis.clone().negate().applyAxisAngle(new THREE.Vector3(1, 0, 0), angle))
  } else if (pivot) pivot.rotation.x = -THREE.MathUtils.degToRad(SCHNEIDER_RCD_THROW_DEG) * (closed ? 1 : tripped ? 0.48 : 0)
  root.traverse((node) => {
    if (node.name.startsWith('schneider_test')) {
      node.userData.schneiderRestZ ??= node.position.z
      node.position.z = Number(node.userData.schneiderRestZ) - (state.testPressed ? 0.0012 : 0)
    }
  })
  applySchneiderRcdIndicator(root, state)
  root.updateMatrixWorld(true)
}

/** Só a sinalização: a rig genérica do Admin já é responsável pela cinemática. */
export function applySchneiderRcdIndicator(root: THREE.Object3D, state: Record<string, unknown>): void {
  const tripped = !!state.tripped, closed = !!state.closed && !tripped
  const pose = closed ? '_on' : tripped ? '_trip' : ''
  for (const suffix of ['', '_on', '_trip']) {
    const status = root.getObjectByName(`schneider_visisafe${suffix}`) as THREE.Mesh | undefined
    if (!status) continue
    const active = suffix === pose
    // Mantém os três nós no GLB exportado pelo Admin (onlyVisible); só o
    // material e o picking da região inativa ficam desligados.
    status.visible = true
    status.raycast = active ? THREE.Mesh.prototype.raycast : () => {}
    const on = suffix === '_on'
    const texture = cachedCanvasTexture(`acti9:visisafe:v1:${on ? 'on' : 'off'}`, 360, 100, (ctx, w, h) => {
      ctx.fillStyle = on ? '#bf252c' : '#138246'
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#f2f5ec'
      ctx.font = '600 72px Arial, sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(on ? 'I.ON' : 'O.OFF', w / 2, h * 0.55)
    })
    const material = status.material as THREE.MeshStandardMaterial
    material.visible = active
    material.color.set(texture ? '#ffffff' : on ? '#bf252c' : '#138246')
    if (material.map !== texture) { bindCachedCanvasTexture(material,texture); material.map = texture; material.needsUpdate = true }
  }
}
