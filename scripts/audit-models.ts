import fs from 'node:fs'
import path from 'node:path'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { COMPONENT_PHYSICAL_SIZE_MM, getComponentModelSpec } from '../src/three/modelPaths'
import type { ComponentType } from '../src/types'

/** Compara a caixa de cada GLB (depois da rotação base) com a ficha física em mm. */
export async function auditModels() {
  const rows: Array<{ type: string; raw: number[]; rotated: number[]; physical: number[]; scale: number; error: number }> = []
  for (const type of Object.keys(COMPONENT_PHYSICAL_SIZE_MM) as ComponentType[]) {
    const spec = getComponentModelSpec(type)
    if (!spec) continue
    const file = path.join('public', decodeURIComponent(spec.path))
    if (!fs.existsSync(file)) continue
    const buf = fs.readFileSync(file)
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
    const gltf: any = await new Promise((resolve, reject) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parse(ab, '', resolve, reject))
    const raw = new THREE.Box3().setFromObject(gltf.scene, true).getSize(new THREE.Vector3())
    gltf.scene.rotation.set(...spec.rotation)
    gltf.scene.updateMatrixWorld(true)
    const size = new THREE.Box3().setFromObject(gltf.scene, true).getSize(new THREE.Vector3())
    const p = spec.physicalSizeMm
    const physical = type === 'dinRail15x55' ? [1000, 15, 5.5] : [p.width, p.height, p.depth]
    // escala uniforme que melhor encaixa (mínimos quadrados em log) e erro residual
    const ratios = [physical[0] / size.x, physical[1] / size.y, physical[2] / size.z]
    const scale = Math.exp(ratios.reduce((a, r) => a + Math.log(r), 0) / 3)
    const error = Math.max(...ratios.map((r) => Math.abs(r / scale - 1)))
    rows.push({ type, raw: [raw.x, raw.y, raw.z], rotated: [size.x, size.y, size.z], physical, scale, error })
  }
  return rows
}

if (process.argv[1]?.endsWith('audit-models.ts')) {
  for (const r of await auditModels()) console.log(r.type.padEnd(28), 'erro', (r.error * 100).toFixed(1).padStart(6) + '%', 'rot', r.rotated.map((v) => v.toFixed(3)).join('×'), 'fís', r.physical.join('×'))
}

/** As 24 rotações axiais próprias (múltiplos de 90°) que podem corrigir a base de um GLB. */
export function axisRotations(): THREE.Euler[] {
  const out: THREE.Euler[] = []
  const seen = new Set<string>()
  const q = [0, 1, 2, 3]
  for (const x of q) for (const y of q) for (const z of q) {
    const e = new THREE.Euler(x * Math.PI / 2, y * Math.PI / 2, z * Math.PI / 2, 'XYZ')
    const m = new THREE.Matrix4().makeRotationFromEuler(e).elements.map((v) => Math.round(v)).join(',')
    if (seen.has(m)) continue
    seen.add(m)
    out.push(e)
  }
  return out
}
