import * as THREE from 'three'
import { applyEasing, posedPart, resolveState } from './definition'
import type { ComponentDefinition, StateDef, Vec3 } from './types'

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

  constructor(private readonly def: ComponentDefinition, root: THREE.Object3D, stateId?: string) {
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
    const blinking = this.def.lights.some((light) => this.target.lights[light.id]?.blink && this.target.lights[light.id]?.on)
    if (this.lightsDirty || blinking) {
      this.updateLights()
      this.lightsDirty = false
      active = active || blinking
    }
    return active
  }

  private updateLights() {
    for (const light of this.def.lights) {
      const node = this.nodes.get(light.partId)
      if (!node) continue
      const state = this.target.lights[light.id] ?? { on: false }
      const part = this.def.parts.find((item) => item.id === light.partId)
      const material = this.def.materials.find((item) => item.id === (this.materialOf.get(light.partId) ?? part?.materialId))
      const pulse = state.blink ? (Math.sin(this.clock * 6) > 0 ? 1 : 0.1) : 1
      for (const mesh of this.meshesOf(node)) {
        const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const item of list as THREE.MeshStandardMaterial[]) {
          if (!item.isMeshStandardMaterial) continue
          if (state.on) { item.emissive.set(state.color ?? light.color); item.emissiveIntensity = (state.intensity ?? light.intensity) * pulse }
          else { item.emissive.set(material?.emissive ?? '#000000'); item.emissiveIntensity = material?.emissiveIntensity ?? 0 }
        }
      }
    }
  }
}
