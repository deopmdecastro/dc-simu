import * as THREE from 'three'
import { applyEasing, posedPart, resolveState } from './definition'
import { evalWhen, type Vars } from './behavior'
import type { ComponentDefinition, LightZoneDef, StateDef, Vec3 } from './types'
import { GLOW_SPECS, glowFrame, glowTexture, stepGlow } from '../three/glow'

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
    const blinking = this.def.lights.some((light) => (this.target.lights[light.id]?.blink && this.target.lights[light.id]?.on) || (light.blink && !!light.when && evalWhen(light.when, this.vars)))
    if (this.lightsDirty || blinking) {
      this.updateLights()
      this.lightsDirty = false
      active = active || blinking
    }
    if (this.updateHalos(deltaSeconds)) active = true
    return active
  }

  /** Estado luminoso de uma zona (estado do componente + condição `when`). */
  private lightStatus(light: LightZoneDef) {
    const state = this.target.lights[light.id] ?? { on: false }
    const byVar = !!light.when && evalWhen(light.when, this.vars)
    const selected = this.vars[`color.${light.id}`]
    const chosen = typeof selected === 'string' && light.userPalette?.some((color) => color.toLowerCase() === selected.toLowerCase()) ? selected : light.color
    return { on: state.on || byVar, blink: !!state.blink || (byVar && !!light.blink), color: state.on ? state.color ?? chosen : chosen }
  }

  /** Halo aditivo («brilho real») sobre cada zona luminosa, com subida/descida suaves e pisca. Devolve true enquanto muda. */
  private updateHalos(dt: number): boolean {
    const texture = glowTexture(THREE)
    if (!texture) return false
    let busy = false
    const rootScale = Math.max(1e-6, this.root.getWorldScale(new THREE.Vector3()).x)
    for (const light of this.def.lights) {
      const lightNodes = this.lightNodes(light)
      if (!lightNodes.length) continue
      let halo = this.halos.get(light.id)
      if (!halo) {
        const box = new THREE.Box3()
        for (const node of lightNodes) box.expandByObject(node)
        if (box.isEmpty()) continue
        const size = box.getSize(new THREE.Vector3())
        const center = this.root.worldToLocal(box.getCenter(new THREE.Vector3()))
        const material = new THREE.SpriteMaterial({ map: texture, color: light.color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
        const sprite = new THREE.Sprite(material)
        sprite.position.copy(center)
        sprite.renderOrder = 40
        sprite.visible = false
        sprite.userData.noPick = true
        sprite.raycast = () => undefined
        this.root.add(sprite)
        halo = { sprite, level: 0, radius: Math.max(size.x, size.y, size.z) / 2 / rootScale }
        this.halos.set(light.id, halo)
      }
      const status = this.lightStatus(light)
      const spec = GLOW_SPECS[light.kind === 'lamp' ? 'lamp' : 'led']
      const previous = halo.level
      halo.level = stepGlow(halo.level, status.on, dt, light.kind === 'lamp' ? 0.09 : 0.04, light.kind === 'lamp' ? 0.28 : 0.1)
      const frame = glowFrame(spec, halo.level, this.clock, status.blink)
      const material = halo.sprite.material as THREE.SpriteMaterial
      material.color.set(status.color)
      material.opacity = Math.min(1, frame.haloOpacity)
      const size = Math.max(halo.radius, 1e-4) * frame.haloScale
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
      const state = this.target.lights[light.id] ?? { on: false }
      const byVar = !!light.when && evalWhen(light.when, this.vars)
      const isOn = state.on || byVar
      const blinks = !!state.blink || (byVar && !!light.blink)
      const part = this.def.parts.find((item) => item.id === light.partId)
      const material = this.def.materials.find((item) => item.id === (this.materialOf.get(light.partId) ?? part?.materialId))
      const pulse = blinks ? (Math.sin(this.clock * 6) > 0 ? 1 : 0.1) : 1
      const selected = this.vars[`color.${light.id}`]
      const chosenColor = typeof selected === 'string' && light.userPalette?.some((color) => color.toLowerCase() === selected.toLowerCase()) ? selected : light.color
      for (const mesh of lightNodes.flatMap((node) => this.meshesOf(node))) {
        const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const item of list as THREE.MeshStandardMaterial[]) {
          if (!item.isMeshStandardMaterial) continue
          if (light.tintMaterial && light.userPalette?.length) item.color.set(chosenColor)
          item.toneMapped = !isOn
          if (isOn) { item.emissive.set(state.on ? state.color ?? chosenColor : chosenColor); item.emissiveIntensity = Math.max(1.6, state.on ? state.intensity ?? light.intensity : light.intensity) * pulse }
          else { item.emissive.set(light.nodes?.length ? '#000000' : material?.emissive ?? '#000000'); item.emissiveIntensity = light.nodes?.length ? 0 : material?.emissiveIntensity ?? 0 }
        }
      }
    }
  }
}
