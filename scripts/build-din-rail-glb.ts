// Gera public/models/bornes-e-barras/din-rail-15x5-5-perfurada-1m.glb
// Uso: npx tsx scripts/build-din-rail-glb.ts
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { buildDinRailGroup, DIN_RAIL_15X55 } from '../src/three/dinRailGeometry'

// O GLTFExporter usa FileReader (browser). Polyfill mínimo para Node.
;(globalThis as any).FileReader = class {
  result: ArrayBuffer | string | null = null
  onloadend: (() => void) | null = null
  readAsArrayBuffer(blob: Blob) { blob.arrayBuffer().then((b) => { this.result = b; this.onloadend?.() }) }
  readAsDataURL(blob: Blob) { blob.arrayBuffer().then((b) => { this.result = `data:${blob.type};base64,${Buffer.from(b).toString('base64')}`; this.onloadend?.() }) }
}

const out = 'public/models/bornes-e-barras/din-rail-15x5-5-perfurada-1m.glb'
const scene = new THREE.Scene()
scene.add(buildDinRailGroup(DIN_RAIL_15X55.defaultLengthMm, 0.001)) // GLB em metros
new GLTFExporter().parse(scene, (result) => {
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, Buffer.from(result as ArrayBuffer))
  console.log('GLB escrito:', out, (result as ArrayBuffer).byteLength, 'bytes')
}, (error) => { console.error(error); process.exit(1) }, { binary: true })
