import * as THREE from 'three'
import { applyEasing, posedPart, resolveState } from './definition'
import { evalWhen, type Vars } from './behavior'
import type { ComponentDefinition, LightZoneDef, StateDef, Vec3 } from './types'
import { GLOW_HALO_FLAG, GLOW_SPECS, glowFrame, glowTexture, stepGlow } from '../three/glow'
import { chosenColor as chosenColorOf, glowSettings, resolveLightLook } from './lightLook'

const DEG = Math.PI / 180
/** Estado sintético: a pose base das peças, sem diferenças. */
export const BASE_STATE = '__base'
const BASE: StateDef = { id: BASE_STATE, name: 'Base', parts: {}, lights: {}, durationMs: 0, easing: 'linear' }

interface Snapshot { position: Vec3; rotation: Vec3; scale: Vec3 }

/**
 * Anima um objeto construído a partir de uma definição (editor, pré-visualização e painel 3D):
 * transições entre estados (posição/rotação/escala/visibilidade/material) e zonas luminosas.
 * Os nós são procurados pelo nome (= id da peça).
 */
export class StateAnimator {
  private readonly nodes = new Map<string, THREE.Object3D>()
  private readonly from = new Map<string, Snapshot>()
  private readonly materialOf = new Map<string, string | null>()
  private target: StateDef
  private progress = 1
  private lightsDirty = true
  private clock = 0
  private vars: Vars = {}
  private readonly ledNodes = new Map<string, THREE.Object3D[]>()
  private readonly root: THREE.Object3D
  private readonly halos = new Map<string, { sprite: THREE.Sprite; level: number; radius: number }>()

  constructor(private readonly def: ComponentDefinition, root: THREE.Object3D, stateId?: string) {
    this.root = root
    root.traverse((node) => { if (node.name && def.parts.some((part) => part.id === node.name)) this.nodes.set(node.name, node) })
    this.target = stateId === BASE_STATE ? BASE : resolveState(def, stateId)
    this.snap()
    this.apply(1)
    this.progress = 1
  }

  get stateId() { return this.target.id }

  private snap() {
    for (const [id, node] of this.nodes) {
      this.from.set(id, {
        position: [node.position.x, node.position.y, node.position.z],
        rotation: [node.rotation.x / DEG, node.rotation.y / DEG, node.rotation.z / DEG],
        scale: [node.scale.x, node.scale.y, node.scale.z],
      })
    }
  }

  setState(stateId: string | undefined, instant = false) {
    const next = stateId === BASE_STATE ? BASE : resolveState(this.def, stateId)
    if (next.id === this.target.id && !instant) return
    this.snap()
    this.target = next
    this.progress = instant || next.durationMs <= 0 ? 1 : 0
    this.lightsDirty = true
    if (instant) this.apply(1)
  }

  private meshesOf(node: THREE.Object3D) {
    const meshes: THREE.Mesh[] = []
    node.traverse((child) => { const mesh = child as THREE.Mesh; if (mesh.isMesh) meshes.push(mesh) })
    return meshes
  }

  private applyMaterial(partId: string, materialId: string | null) {
    if (this.materialOf.get(partId) === materialId) return
    this.materialOf.set(partId, materialId)
    const node = this.nodes.get(partId)
    const material = this.def.materials.find((item) => item.id === materialId)
    if (!node || !material) return
    for (const mesh of this.meshesOf(node)) {
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const item of list as THREE.MeshStandardMaterial[]) {
        if (!item.isMeshStandardMaterial) continue
        item.color.set(material.color); item.roughness = material.roughness; item.metalness = material.metalness
        item.emissive.set(material.emissive); item.emissiveIntensity = material.emissiveIntensity
        item.opacity = material.opacity; item.transparent = material.opacity < 1
      }
    }
    this.lightsDirty = true
  }

  private apply(k: number) {
    for (const part of this.def.parts) {
      const node = this.nodes.get(part.id)
      if (!node) continue
      const pose = posedPart(part, this.target.parts[part.id])
      const from = this.from.get(part.id)
      const mix = (a: number, b: number) => a + (b - a) * k
      if (from && k < 1) {
        node.position.set(mix(from.position[0], pose.position[0]), mix(from.position[1], pose.position[1]), mix(from.position[2], pose.position[2]))
        node.rotation.set(mix(from.rotation[0], pose.rotation[0]) * DEG, mix(from.rotation[1], pose.rotation[1]) * DEG, mix(from.rotation[2], pose.rotation[2]) * DEG)
        node.scale.set(mix(from.scale[0], pose.scale[0]), mix(from.scale[1], pose.scale[1]), mix(from.scale[2], pose.scale[2]))
      } else {
        node.position.set(...pose.position)
        node.rotation.set(pose.rotation[0] * DEG, pose.rotation[1] * DEG, pose.rotation[2] * DEG)
        node.scale.set(...pose.scale)
      }
      node.visible = pose.visible
      if (part.kind !== 'group' && part.kind !== 'glb') this.applyMaterial(part.id, pose.materialId)
    }
  }

  /** Devolve true enquanto algo muda (para a vista pedir novo frame). */
  update(deltaSeconds: number): boolean {
    this.clock += deltaSeconds
    let active = false
    if (this.progress < 1) {
      this.progress = Math.min(1, this.progress + (deltaSeconds * 1000) / Math.max(1, this.target.durationMs))
      this.apply(applyEasing(this.target.easing, this.progress))
      active = true
    }
    const blinking = this.def.lights.some((light) => resolveLightLook(light, this.target.lights[light.id], this.vars).on && resolveLightLook(light, this.target.lights[light.id], this.vars).blink)
    if (this.lightsDirty || blinking) {
      this.updateLights()
      this.lightsDirty = false
      active = active || blinking
    }
    if (this.updateHalos(deltaSeconds)) active = true
    return active
  }

  /** Estado luminoso de uma zona (estado do componente + condição `when`). Em STOP da simulação (`$simStopped`), permanece desligada. */
  private lightStatus(light: LightZoneDef) {
    if (this.vars['$simStopped']) return { on: false, blink: false, color: chosenColorOf(light, this.vars), intensity: 0 }
    return resolveLightLook(light, this.target.lights[light.id], this.vars)
  }

  /** Halo aditivo («brilho real») encostado à face frontal da lente, com subida/descida suaves e pisca. Devolve true enquanto muda. */
  private updateHalos(dt: number): boolean {
    const texture = glowTexture(THREE)
    if (!texture) return false
    let busy = false
    let matricesUpdated = false
    for (const light of this.def.lights) {
      const lightNodes = this.lightNodes(light)
      if (!lightNodes.length) continue
      let halo = this.halos.get(light.id)
      if (!halo) {
        if (!matricesUpdated) {
          this.root.updateMatrixWorld(true)
          matricesUpdated = true
        }
        const invRoot = new THREE.Matrix4().copy(this.root.matrixWorld).invert()
        const localBox = new THREE.Box3()
        const meshMat = new THREE.Matrix4()
        const corner = new THREE.Vector3()
        for (const node of lightNodes) {
          node.updateWorldMatrix(true, true)
          node.traverse((child) => {
            const mesh = child as THREE.Mesh
            if (!mesh.isMesh || !mesh.geometry) return
            if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
            const gbox = mesh.geometry.boundingBox
            if (!gbox || gbox.isEmpty()) return
            meshMat.multiplyMatrices(invRoot, mesh.matrixWorld)
            for (let ix = 0; ix < 2; ix++) {
              for (let iy = 0; iy < 2; iy++) {
                for (let iz = 0; iz < 2; iz++) {
                  corner.set(
                    ix ? gbox.max.x : gbox.min.x,
                    iy ? gbox.max.y : gbox.min.y,
                    iz ? gbox.max.z : gbox.min.z,
                  ).applyMatrix4(meshMat)
                  localBox.expandByPoint(corner)
                }
              }
            }
          })
        }
        if (localBox.isEmpty()) continue
        const localSize = localBox.getSize(new THREE.Vector3())
        const lensRadius = Math.max(localSize.x, localSize.y, localSize.z * 0.5) / 2
        // Encostado diretamente à superfície frontal do vidro da lente (+Z local).
        const lensFront = new THREE.Vector3(
          (localBox.min.x + localBox.max.x) / 2,
          (localBox.min.y + localBox.max.y) / 2,
          localBox.max.z + lensRadius * 0.03,
        )
        const material = new THREE.SpriteMaterial({ map: texture, color: light.color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
        const sprite = new THREE.Sprite(material)
        sprite.position.copy(lensFront)
        sprite.renderOrder = 40
        sprite.visible = false
        sprite.userData.noPick = true
        sprite.userData[GLOW_HALO_FLAG] = true
        sprite.raycast = () => undefined
        this.root.add(sprite)
        halo = { sprite, level: 0, radius: lensRadius }
        this.halos.set(light.id, halo)
      }
      const status = this.lightStatus(light)
      const settings = glowSettings(light)
      const spec = GLOW_SPECS[light.kind === 'lamp' ? 'lamp' : 'led']
      const previous = halo.level
      halo.level = stepGlow(halo.level, status.on && settings.enabled, dt, settings.riseMs / 1000, settings.fallMs / 1000)
      const frame = glowFrame(spec, halo.level, this.clock, status.blink)
      const material = halo.sprite.material as THREE.SpriteMaterial
      material.color.set(status.color)
      material.opacity = Math.min(1, frame.haloOpacity)
      const size = Math.max(halo.radius, 1e-4) * frame.haloScale * settings.size
      halo.sprite.scale.set(size, size, 1)
      halo.sprite.visible = frame.haloOpacity > 0.004
      if (halo.level !== previous || (status.on && status.blink)) busy = true
    }
    return busy
  }

  /** Variáveis do componente: as zonas com condição (`when`) acendem/apagam em função delas. */
  setVars(vars: Vars) { this.vars = vars; this.lightsDirty = true }

  private lightNodes(light: LightZoneDef): THREE.Object3D[] {
    if (!light.nodes?.length) { const node = this.nodes.get(light.partId); return node ? [node] : [] }
    const cached = this.ledNodes.get(light.id)
    if (cached) return cached
    const part = this.nodes.get(light.partId)
    const list = light.nodes.map((name) => part?.getObjectByName(name)).filter((node): node is THREE.Object3D => !!node)
    // materiais próprios: acender um LED do GLB não pode acender o resto do modelo
    for (const node of list) node.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (mesh.isMesh) mesh.material = Array.isArray(mesh.material) ? mesh.material.map((item) => item.clone()) : mesh.material.clone()
    })
    this.ledNodes.set(light.id, list)
    return list
  }

  private updateLights() {
    for (const light of this.def.lights) {
      const lightNodes = this.lightNodes(light)
      if (!lightNodes.length) continue
      const look = this.lightStatus(light)
      const isOn = look.on
      const part = this.def.parts.find((item) => item.id === light.partId)
      const material = this.def.materials.find((item) => item.id === (this.materialOf.get(light.partId) ?? part?.materialId))
      const pulse = look.blink ? (Math.sin(this.clock * 6) > 0 ? 1 : 0.1) : 1
      const chosenColor = chosenColorOf(light, this.vars)
      for (const mesh of lightNodes.flatMap((node) => this.meshesOf(node))) {
        const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const item of list as THREE.MeshStandardMaterial[]) {
          if (!item.isMeshStandardMaterial) continue
          if (light.tintMaterial && light.userPalette?.length) item.color.set(chosenColor)
          item.toneMapped = !isOn
          if (isOn) { item.emissive.set(look.color); item.emissiveIntensity = Math.max(1.6, look.intensity) * pulse }
          else { item.emissive.set(light.nodes?.length ? '#000000' : material?.emissive ?? '#000000'); item.emissiveIntensity = light.nodes?.length ? 0 : material?.emissiveIntensity ?? 0 }
        }
      }
    }
  }
}
