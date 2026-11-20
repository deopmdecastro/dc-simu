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

/** Obturador preto atrás da pega do iID: fecha o interior omitido no STEP
 * simplificado. Cilindro fechado no eixo real, por isso acompanha o manípulo
 * sem abrir uma folga durante o curso. `unit` converte mm para o referencial local. */
export function completeSchneiderIidHandle(root: THREE.Object3D, unit = .001): void {
  const pivot = root.getObjectByName(SCHNEIDER_RCD_HANDLE_NODE)
  if (!pivot?.getObjectByName('schneider_handle_grip')) return
  // A fita VisiSafe assenta à frente da superfície curva, na mesma posição XY.
  for (const suffix of ['', '_on', '_trip']) {
    const indicator = root.getObjectByName('schneider_visisafe' + suffix)
    if (indicator) indicator.position.z = (68.45 + (suffix === '_on' ? .016 : suffix === '_trip' ? .008 : 0)) * unit
  }
  // O ombro da alavanca vinha no branco da carcaça e, à volta do tambor escuro, lia-se como
  // uma bola branca. No iID a alavanca é toda antracite: mesmo material da pega.
  const grip = pivot.getObjectByName('schneider_handle_grip') as THREE.Mesh | undefined
  const shoulder = pivot.getObjectByName('schneider_handle_white') as THREE.Mesh | undefined
  if (grip?.isMesh && shoulder?.isMesh && shoulder.material !== grip.material) shoulder.material = grip.material
  if (grip?.isMesh) splitIidCradle(root, grip.material as THREE.Material, unit)
  const previous = pivot.getObjectByName('schneider_handle_barrel')
  if (previous?.userData.schneiderHandleClosure === 3) return
  previous?.removeFromParent()
  // A ranhura da carcaça tem 9,0 mm (x −31,4…−22,4); com 8,9 mm ficavam duas frestas
  // brancas ao lado da alavanca. 9,6 mm: as pontas ficam escondidas na carcaça.
  const geometry = new THREE.CylinderGeometry(15.85 * unit, 15.85 * unit, 9.6 * unit, 96, 1, false)
  geometry.rotateZ(Math.PI / 2)
  const barrel = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#181b1b', metalness: .02, roughness: .43 }))
  barrel.name = 'schneider_handle_barrel'
  barrel.position.copy(SCHNEIDER_IID_AXIS_OFFSET_M).multiplyScalar(unit / .001)
  barrel.userData.schneiderControl = 'toggle'
  barrel.userData.schneiderHandleClosure = 3
  pivot.add(barrel)
}

/** Cúpula do berço da alavanca do iID (mm no referencial do GLB): esfera ~Ø19 mm
 *  moldada na carcaça à volta da ranhura, x −36,5…−17,5, y 24,5…47, frente até z 71. */
const IID_CRADLE = { x: [-37, -17], y: [24.5, 47.5], zMin: 66.3, face: 69, center: [-26.9, 35.4], radius: 11 } as const

/** O STEP funde a cúpula do berço na carcaça branca; ao lado da alavanca lia-se como uma
 *  bola branca. Passa para uma malha própria com o material antracite da alavanca (fixa:
 *  não roda). Só os triângulos inteiros dentro da cúpula; a travessa e a faixa a z 66 ficam. */
function splitIidCradle(root: THREE.Object3D, material: THREE.Material, unit: number): void {
  const body = root.getObjectByName('schneider_body') as THREE.Mesh | undefined
  if (!body?.isMesh || body.parent?.getObjectByName('schneider_handle_cradle')) return
  root.updateMatrixWorld(true)
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(body.matrixWorld)
  const geometry = body.geometry, position = geometry.getAttribute('position'), index = geometry.getIndex()
  const count = index ? index.count : position.count, at = (i: number) => index ? index.getX(i) : i
  const mm = (i: number) => new THREE.Vector3().fromBufferAttribute(position, at(i)).applyMatrix4(toRoot).divideScalar(unit)
  const within = (p: THREE.Vector3[], r: { x: readonly number[]; y: readonly number[] }) => p.every((v) => v.x >= r.x[0] && v.x <= r.x[1] && v.y >= r.y[0] && v.y <= r.y[1])
  const keep: number[] = [], cradle: number[] = []
  for (let i = 0; i < count; i += 3) {
    const p = [mm(i), mm(i + 1), mm(i + 2)], z = (p[0].z + p[1].z + p[2].z) / 3
    const flatFace = p.every((v) => Math.abs(v.z - IID_CRADLE.face) < .08) // frente plana da carcaça
    const cx = (p[0].x + p[1].x + p[2].x) / 3 - IID_CRADLE.center[0], cy = (p[0].y + p[1].y + p[2].y) / 3 - IID_CRADLE.center[1]
    const dome = within(p, IID_CRADLE) && z > IID_CRADLE.zMin && !flatFace && Math.hypot(cx, cy) <= IID_CRADLE.radius
    ;(dome ? cradle : keep).push(at(i), at(i + 1), at(i + 2))
  }
  if (!cradle.length) return
  const shell = geometry.clone(); shell.setIndex(keep)
  const dome = geometry.clone(); dome.setIndex(cradle)
  body.geometry = shell
  const mesh = new THREE.Mesh(dome, material)
  mesh.name = 'schneider_handle_cradle'
  mesh.position.copy(body.position); mesh.quaternion.copy(body.quaternion); mesh.scale.copy(body.scale)
  mesh.castShadow = mesh.receiveShadow = true
  body.parent!.add(mesh)
}

/** Anota as peças móveis ANTES da junção de malhas estáticas do painel. */
export function prepareSchneiderRcdModel(root: THREE.Object3D): void {
  completeSchneiderIidHandle(root)
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
