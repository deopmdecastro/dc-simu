// Gera as miniaturas GLB do quadro metálico e da calha técnica (o Painel 3D usa os geradores paramétricos).
// Uso: npx tsx scripts/build-enclosure-glb.ts
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { buildCableDuct, buildEnclosure, CABLE_DUCT, ENCLOSURE } from '../src/three/enclosureParts'

// O GLTFExporter usa FileReader (browser). Polyfill mínimo para Node.
;(globalThis as any).FileReader = class {
  result: ArrayBuffer | string | null = null
  onloadend: (() => void) | null = null
  readAsArrayBuffer(blob: Blob) { blob.arrayBuffer().then((b) => { this.result = b; this.onloadend?.() }) }
  readAsDataURL(blob: Blob) { blob.arrayBuffer().then((b) => { this.result = `data:${blob.type};base64,${Buffer.from(b).toString('base64')}`; this.onloadend?.() }) }
}

const std = (color: string, metalness: number, roughness: number, name: string) => new THREE.MeshStandardMaterial({ color, metalness, roughness, name })
const write = (out: string, object: THREE.Object3D) => new Promise<void>((resolve) => {
  const scene = new THREE.Scene(); scene.add(object)
  new GLTFExporter().parse(scene, (result) => {
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, Buffer.from(result as ArrayBuffer))
    console.log('GLB escrito:', out, (result as ArrayBuffer).byteLength, 'bytes')
    resolve()
  }, (error) => { console.error(error); process.exit(1) }, { binary: true })
})

const unit = 0.001 // GLB em metros
const parts = buildEnclosure({ widthMm: ENCLOSURE.defaultWidthMm, heightMm: ENCLOSURE.defaultHeightMm, depthMm: ENCLOSURE.defaultDepthMm }, unit, {
  body: std('#cfd1cb', 0.2, 0.55, 'pintura-ral7035'),
  plate: std('#c9cfd2', 0.85, 0.38, 'chapa-galvanizada'),
  gasket: std('#1f2328', 0, 0.85, 'junta-pu'),
  metal: std('#b8bec6', 0.9, 0.3, 'cromado'),
  dark: std('#3b4048', 0.4, 0.5, 'zamak-escuro'),
})
// Miniatura com a porta fechada: o envelope coincide com a ficha física (auditoria de escala).
const enclosure = new THREE.Group(); enclosure.add(parts.body, parts.door)
enclosure.position.z = -(ENCLOSURE.defaultDepthMm + 30) * unit / 2
await write('public/models/quadros/quadro-metalico-600x800x250.glb', enclosure)

const duct = buildCableDuct({ lengthMm: CABLE_DUCT.defaultLengthMm, widthMm: CABLE_DUCT.defaultWidthMm, heightMm: CABLE_DUCT.defaultHeightMm }, unit, {
  body: std('#a9aca8', 0.02, 0.62, 'pvc-ral7030'),
  cover: std('#b1b4b0', 0.02, 0.58, 'pvc-tampa'),
})
duct.position.z = -(CABLE_DUCT.defaultHeightMm + 2) * unit / 2
await write('public/models/quadros/calha-tecnica-40x60-600.glb', duct)
