/**
 * Acrescenta os 6 terminais faston 6,3 mm ao topo do condensador CBB65
 * (`capacitor-run-generic.glb`, STEP Godrej 60 µF), alinhados com os bornes
 * lógicos 1/1B (um lado) e 2/2B/2C/2D (lado oposto) de factory.ts.
 * Atualiza também o manifesto sources.json da pasta motores.
 */
import fs from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import * as T from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { sha, box, writeGlb } from './lib/cad-building.mjs'

const file = path.resolve('public/models/motores/capacitor-run-generic.glb')
const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(readFileSync(file).buffer, '', resolve, reject))
const root = new T.Group(); root.name = 'capacitor_run_cbb65_with_faston'; root.add(gltf.scene)
// CBB65-60µF Ø50 × 120 mm no referencial do GLB: tampa em y=+120, topo dos
// pinos em y=+132. Fastons 6,3×0,8 mm segundo o padrão DIN 46244.
const brass = new T.MeshStandardMaterial({ color: '#b9a167', metalness: .75, roughness: .35 })
const pins = [
  ['1', -7.5, 0], ['1B', -4.5, 0], ['2', 4.5, -2.5], ['2B', 7.5, -2.5], ['2C', 4.5, 2.5], ['2D', 7.5, 2.5],
]
for (const [label, x, z] of pins) {
  const blade = box(6.3, 12, .8, brass, 'faston_63_' + label, [x, 126, z]); root.add(blade)
  const shoulder = box(8.3, 1.2, 2.8, brass, 'faston_63_shoulder_' + label, [x, 120.6, z]); root.add(shoulder)
}
const result = await writeGlb(new URL('file://' + file), root)
const sourcesPath = path.resolve('public/models/motores/sources.json')
let sources = { models: [] }
try { sources = JSON.parse(await fs.readFile(sourcesPath, 'utf8')) } catch {}
sources.models = [...(sources.models ?? []).filter(m => m.type !== 'capacitorRun60uF'),
  { type: 'capacitorRun60uF', kind: 'adapted-manufacturer-CAD', source: 'https://grabcad.com/library/60uf-capacitor-godrej-1', physicalSizeMm: { width: 50, height: 132, depth: 50 }, interfaces: 6, pins: 6, ...result, changes: 'Six DIN 46244 6.3×0.8 mm faston blades added on the top cap, grouped 1/1B (negative) and 2/2B/2C/2D (positive) per user photograph IMG_5852; original STEP body unchanged. Not a manufacturer CAD amendment; visualisation only.' }]
await fs.writeFile(sourcesPath, JSON.stringify(sources, null, 2) + '\n')
console.log('capacitorRun60uF', result.bytes, result.sha256)
