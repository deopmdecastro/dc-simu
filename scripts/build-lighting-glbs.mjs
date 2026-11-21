/**
 * Exporta os 6 modelos 3D CAD da família de Iluminação (lâmpadas E27 + interruptores Odace)
 * para GLB em metros (`public/models/iluminacao/*.glb`) e gera o manifesto de proveniência.
 *
 * Execução: `node --import tsx scripts/build-lighting-glbs.mjs`
 */
import './node-env'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import {
  buildLightingModelMm,
  LAMP_SPECS,
  LIGHTING_TYPES,
  SWITCH_SPECS,
  isLightingLampType,
} from '../src/three/lightingModel'

const OUT_DIR = path.resolve('public/models/iluminacao')

const FILE_NAMES = {
  lampIncandescentE27: 'philips-incandescent-e27.glb',
  lampFluorescentE27: 'philips-fluorescent-cfl-e27.glb',
  lampLedE27: 'philips-led-a60-e27.glb',
  wallSwitchSimple: 'schneider-odace-simple.glb',
  wallSwitchDouble: 'schneider-odace-double.glb',
  wallSwitchStaircase: 'schneider-odace-staircase.glb',
}

async function exportGlb(scene) {
  const exporter = new GLTFExporter()
  const ab = await new Promise((resolve, reject) => {
    exporter.parse(scene, resolve, reject, { binary: true })
  })
  return Buffer.from(ab)
}

await fs.mkdir(OUT_DIR, { recursive: true })
const manifestModels = []

for (const type of LIGHTING_TYPES) {
  const rootMm = buildLightingModelMm(type)
  rootMm.updateMatrixWorld(true)

  // Normaliza para metros (escala 0,001 aplicada a cada geometria e posição para preservar nós nomeados)
  const scale = 0.001
  rootMm.traverse((obj) => {
    obj.position.multiplyScalar(scale)
    if (obj.isMesh && obj.geometry) {
      obj.geometry.scale(scale, scale, scale)
      obj.geometry.computeBoundingBox()
      obj.geometry.computeBoundingSphere()
    }
  })
  rootMm.updateMatrixWorld(true)

  const box = new THREE.Box3().setFromObject(rootMm)
  const sizeMm = box.getSize(new THREE.Vector3()).multiplyScalar(1000)
  const nominal = isLightingLampType(type) ? LAMP_SPECS[type].sizeMm : SWITCH_SPECS[type].sizeMm

  const file = FILE_NAMES[type]
  const outPath = path.join(OUT_DIR, file)
  const buf = await exportGlb(rootMm)
  await fs.writeFile(outPath, buf)

  const sha256 = crypto.createHash('sha256').update(buf).digest('hex')
  manifestModels.push({
    type,
    path: `/models/iluminacao/${file}`,
    bytes: buf.length,
    sha256,
    nominalSizeMm: nominal,
    measuredSizeMm: {
      width: Number(sizeMm.x.toFixed(2)),
      height: Number(sizeMm.y.toFixed(2)),
      depth: Number(sizeMm.z.toFixed(2)),
    },
    boundsMm: {
      min: [Number((box.min.x * 1000).toFixed(2)), Number((box.min.y * 1000).toFixed(2)), Number((box.min.z * 1000).toFixed(2))],
      max: [Number((box.max.x * 1000).toFixed(2)), Number((box.max.y * 1000).toFixed(2)), Number((box.max.z * 1000).toFixed(2))],
    },
  })

  console.log(
    `✓ ${file}: ${buf.length} bytes · medido ${sizeMm.x.toFixed(1)}×${sizeMm.y.toFixed(1)}×${sizeMm.z.toFixed(1)} mm (nominal ${nominal.width}×${nominal.height}×${nominal.depth} mm)`,
  )
}

await fs.writeFile(
  path.join(OUT_DIR, 'sources.json'),
  JSON.stringify(
    {
      format: 1,
      generatedBy: 'scripts/build-lighting-glbs.mjs',
      units: 'metres',
      note: 'Parametric CAD-grade simulation assets modeled to real Philips A60/Genie/CorePro E27 and Schneider Electric Odace dimensions; not official manufacturer STEP CAD.',
      models: manifestModels,
    },
    null,
    2,
  ) + '\n',
)
console.log(`✓ public/models/iluminacao/sources.json (${manifestModels.length} modelos)`)
