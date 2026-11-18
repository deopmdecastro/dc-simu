/** Lista encaixes reais candidatos, em mm; a associação elétrica exige revisão. */
import fs from 'node:fs/promises'
import path from 'node:path'
import * as THREE from 'three'
import { loadModelMm } from './detect-interfaces'
import { detectHoles } from '../src/catalog/holeDetect'
import models from '../src/data/imported-component-models.json'
import calibrated from '../src/data/imported-component-terminals.json'

const output = process.argv[2]
if (!output) throw new Error('Indique uma pasta local para as medições')
await fs.mkdir(output, { recursive: true })
for (const model of models) {
  if (!process.argv[3] && !Object.prototype.hasOwnProperty.call(calibrated, model.type)) continue
  if (process.argv[3] && !process.argv[3].split(',').includes(model.type)) continue
  // Scan the same rotated/fitted CAD as Panel3D, not the unrotated GLB.
  const loaded = await loadModelMm(model.type as Parameters<typeof loadModelMm>[0])
  if (!loaded) throw new Error('Missing actual CAD: ' + model.type)
  const scene = loaded.root
  // Calibration reports use x centred, y from base, z from back.
  scene.position.y += loaded.phys.height / 2
  scene.position.z += loaded.phys.depth / 2
  scene.updateMatrixWorld(true)
  const report: Record<string, unknown> = { type:model.type, bounds:new THREE.Box3().setFromObject(scene,true) }
  for (const face of ['top','bottom','front'] as const) {
    report[face]=detectHoles(scene,face,{grid:72,minDiameterMm:2,maxDiameterMm:18,minDepthMm:1,limit:40})
  }
  await fs.writeFile(path.join(output,`${model.type}-holes.json`),JSON.stringify(report,null,2)+'\n')
  console.log(model.type, ...['top','bottom','front'].map(face=>`${face}:${(report[face] as unknown[]).length}`))
  scene.traverse(node=>{const mesh=node as THREE.Mesh;if(mesh.isMesh)mesh.geometry.dispose()})
}
