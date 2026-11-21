import * as THREE from 'three'

export type SchneiderModularType = 'breakerSchneiderIc60h1p' | 'pilotLightSchneiderIil1p' | 'pilotLightSchneiderIil3p'
export const ACTI9_MCB_HANDLE = 'acti9_handle_pivot'
export const ACTI9_MCB_THROW_DEG = 70
export const isSchneiderModular = (type: string): type is SchneiderModularType =>
  type === 'breakerSchneiderIc60h1p' || type === 'pilotLightSchneiderIil1p' || type === 'pilotLightSchneiderIil3p'

// WeakSet, não uma flag exportada no GLB: um clone precisa dos seus materiais.
const ownedLenses = new WeakSet<THREE.Object3D>()

const HEX_COLOR_RE = /^#(?:[\da-f]{3}|[\da-f]{6})$/i

function tagLensMaterials(mesh: THREE.Mesh): void {
  for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
    material.userData.acti9Lens = true
    material.userData.dcSimuBodySurface = 'preserve'
  }
}

/** Anota só peças funcionais. O corpo não se torna uma zona de manobra invisível. */
export function prepareSchneiderModular(root: THREE.Object3D): void {
  const handle = root.getObjectByName(ACTI9_MCB_HANDLE)
  if (handle) handle.userData.schneiderControl = 'toggle'
  root.traverse(node => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    if (/^acti9_lens_[123]$/.test(node.name) || node.name.startsWith('acti9_visisafe')) {
      node.userData.acti9Lens = true // impede a fusão estática de lentes independentes
      if (!ownedLenses.has(node)) {
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(m => m.clone()) : mesh.material.clone()
        ownedLenses.add(node)
      }
      tagLensMaterials(mesh)
    }
    if (node.name.startsWith('acti9_visisafe')) node.userData.protectionMarking = true
  })
}

/** Estado físico comum a Painel, Admin e capturas; a rig pode ser dona da cinemática. */
export function applySchneiderModularState(root: THREE.Object3D, type: SchneiderModularType, state: Record<string, unknown>, moveControls = true): void {
  prepareSchneiderModular(root)
  if (type === 'breakerSchneiderIc60h1p') {
    const tripped = Boolean(state.tripped), closed = Boolean(state.closed) && !tripped
    const handle = root.getObjectByName(ACTI9_MCB_HANDLE)
    if (moveControls && handle) handle.rotation.x = -THREE.MathUtils.degToRad(ACTI9_MCB_THROW_DEG) * (closed ? 1 : tripped ? .48 : 0)
    // Preserva os três nós para exportação, mas só uma fita é visível/raycastable.
    const pose = closed ? '_on' : tripped ? '_trip' : ''
    for (const suffix of ['', '_on', '_trip']) {
      const node = root.getObjectByName(`acti9_visisafe${suffix}`) as THREE.Mesh | undefined
      if (!node?.isMesh) continue
      const active = suffix === pose
      node.visible = true
      const materials = Array.isArray(node.material) ? node.material : [node.material]
      for (const material of materials) material.visible = active
      node.raycast = active ? THREE.Mesh.prototype.raycast : () => {}
    }
  } else {
    const count = type === 'pilotLightSchneiderIil3p' ? 3 : 1
    const rawColor = typeof state.color === 'string' && HEX_COLOR_RE.test(state.color) ? state.color : '#ef4444'
    const rawGlass = typeof state.glassColor === 'string' && HEX_COLOR_RE.test(state.glassColor) ? state.glassColor : null
    const glowColor = new THREE.Color(rawColor)
    const offColor = rawGlass ? new THREE.Color(rawGlass) : glowColor.clone().multiplyScalar(0.42)
    for (let i = 1; i <= count; i++) {
      const lens = root.getObjectByName(`acti9_lens_${i}`) as THREE.Mesh | undefined
      if (!lens?.isMesh) continue
      tagLensMaterials(lens)
      const lit = Boolean(state[count === 1 ? 'on' : `l${i}On`])
      for (const material of Array.isArray(lens.material) ? lens.material : [lens.material]) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue
        // A lente reflete sempre a cor da luz/vidro escolhida (tanto apagada como acesa).
        material.color.copy(lit ? (rawGlass ? offColor : glowColor) : offColor)
        material.emissive.copy(lit ? glowColor : new THREE.Color('#000000'))
        material.emissiveIntensity = lit ? 1.65 : 0
        const nextToneMapped = !lit
        if (material.toneMapped !== nextToneMapped) {
          material.toneMapped = nextToneMapped
          material.needsUpdate = true
        }
      }
    }
  }
  root.updateMatrixWorld(true)
}

export function schneiderModularAction(object: THREE.Object3D): 'toggle' | null {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (node.userData.schneiderControl === 'toggle') return 'toggle'
  }
  return null
}
