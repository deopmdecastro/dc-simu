/**
 * Varre cada GLB da biblioteca à procura das interfaces reais do aparelho:
 * furos/encaixes de bornes (por face) e objetos candidatos a peça móvel
 * (manípulos, botões). Serve de base às posições por omissão dos componentes.
 *
 *   npx tsx scripts/detect-interfaces.ts [tipo…]
 */
import fs from 'node:fs'
import path from 'node:path'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { detectHoles } from '../src/catalog/holeDetect'
import type { Face } from '../src/catalog/terminalProfiles'
import { COMPONENT_PHYSICAL_SIZE_MM, getComponentModelSpec } from '../src/three/modelPaths'
import type { ComponentType } from '../src/types'

const FACES: Face[] = ['top', 'bottom', 'front', 'back', 'left', 'right']

export async function loadModelMm(type: ComponentType) {
  const spec = getComponentModelSpec(type)
  if (!spec) return null
  const file = path.join('public', decodeURIComponent(spec.path))
  if (!fs.existsSync(file)) return null
  const buf = fs.readFileSync(file)
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  const gltf = await new Promise<any>((resolve, reject) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parse(ab, '', resolve, reject))
  const scene: THREE.Object3D = gltf.scene
  scene.rotation.set(...spec.rotation)
  scene.updateMatrixWorld(true)
  const size = new THREE.Box3().setFromObject(scene, true).getSize(new THREE.Vector3())
  const phys = COMPONENT_PHYSICAL_SIZE_MM[type]!
  const scale = Math.exp((Math.log(phys.width / size.x) + Math.log(phys.height / size.y) + Math.log(phys.depth / size.z)) / 3)
  const root = new THREE.Group()
  root.add(scene)
  root.scale.setScalar(scale)
  root.updateMatrixWorld(true)
  // centrar como o editor (origem no centro da caixa)
  const box = new THREE.Box3().setFromObject(root, true)
  const centre = box.getCenter(new THREE.Vector3())
  root.position.sub(centre)
  root.updateMatrixWorld(true)
  return { root, box: new THREE.Box3().setFromObject(root, true), phys }
}

/** Objetos com nome: candidatos a manípulo/botão (volume e posição relativa). */
export function movableCandidates(root: THREE.Object3D, box: THREE.Box3) {
  const size = box.getSize(new THREE.Vector3())
  const out: Array<{ name: string; volume: number; centre: number[]; frac: number[] }> = []
  root.traverse((node) => {
    if (!(node as THREE.Mesh).isMesh || !node.name) return
    const b = new THREE.Box3().setFromObject(node, true)
    const s = b.getSize(new THREE.Vector3())
    const c = b.getCenter(new THREE.Vector3())
    out.push({
      name: node.name,
      volume: s.x * s.y * s.z,
      centre: [c.x, c.y, c.z].map((v) => Math.round(v * 10) / 10),
      frac: [(c.x - box.min.x) / size.x, (c.y - box.min.y) / size.y, (c.z - box.min.z) / size.z].map((v) => Math.round(v * 1000) / 1000),
    })
  })
  return out.sort((a, b) => b.volume - a.volume)
}

async function main() {
  const only = process.argv.slice(2)
  const types = (Object.keys(COMPONENT_PHYSICAL_SIZE_MM) as ComponentType[]).filter((type) => getComponentModelSpec(type) && (!only.length || only.includes(type)))
  const report: Record<string, unknown> = {}
  for (const type of types) {
    const model = await loadModelMm(type)
    if (!model) continue
    const { root, box, phys } = model
    const size = box.getSize(new THREE.Vector3())
    const holes: Array<Record<string, unknown>> = []
    for (const face of FACES) {
      for (const hole of detectHoles(root, face, { grid: 128, minDiameterMm: 1.6, maxDiameterMm: 26, limit: 60 })) {
        holes.push({
          face,
          mm: hole.position.map((v) => Math.round(v * 10) / 10),
          frac: [
            Math.round(((hole.position[0] - box.min.x) / size.x) * 1000) / 1000,
            Math.round(((box.max.y - hole.position[1]) / size.y) * 1000) / 1000, // y: 0 em cima (como position3D)
            Math.round(((hole.position[2] - box.min.z) / size.z) * 1000) / 1000,
          ],
          d: Math.round(hole.diameterMm * 10) / 10,
          depth: Math.round(hole.depthMm * 10) / 10,
          through: hole.through,
        })
      }
    }
    const parts = movableCandidates(root, box).slice(0, 14)
    report[type] = { physical: phys, holes, parts }
    console.log(`\n### ${type}  (${phys.width}×${phys.height}×${phys.depth} mm) — ${holes.length} furo(s)`)
    for (const hole of holes) console.log('   ', hole.face.padEnd(7), 'Ø' + String(hole.d).padStart(5), 'prof', String(hole.depth).padStart(5), 'frac', (hole.frac as number[]).map((v) => v.toFixed(3)).join(' / '), hole.through ? 'passante' : '')
    console.log('    peças:', parts.slice(0, 8).map((p) => p.name).join(', '))
  }
  fs.mkdirSync('docs', { recursive: true })
  fs.writeFileSync('docs/model-interfaces.json', JSON.stringify(report, null, 2))
}

if (process.argv[1]?.endsWith('detect-interfaces.ts')) await main()
