/** Lista encaixes reais candidatos, em mm; a associação elétrica exige revisão. */
import fs from 'node:fs/promises'
import path from 'node:path'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { detectHoles } from '../src/catalog/holeDetect'
import models from '../src/data/imported-component-models.json'
import calibrated from '../src/data/imported-component-terminals.json'

const output = process.argv[2]
if (!output) throw new Error('Indique uma pasta local para as medições')
await fs.mkdir(output, { recursive: true })
for (const model of models) {
  if (!process.argv[3] && !Object.prototype.hasOwnProperty.call(calibrated, model.type)) continue
  if (process.argv[3] && !process.argv[3].split(',').includes(model.type)) continue
  const bytes=await fs.readFile(path.join('public', model.path))
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length), '')
  scene.scale.setScalar(1000)
  scene.updateMatrixWorld(true)
  const report: Record<string, unknown> = { type:model.type, bounds:new THREE.Box3().setFromObject(scene,true) }
  for (const face of ['top','bottom','front'] as const) {
    report[face]=detectHoles(scene,face,{grid:72,minDiameterMm:2,maxDiameterMm:18,minDepthMm:1,limit:40})
  }
  await fs.writeFile(path.join(output,`${model.type}-holes.json`),JSON.stringify(report,null,2)+'\n')
  console.log(model.type, ...['top','bottom','front'].map(face=>`${face}:${(report[face] as unknown[]).length}`))
  scene.traverse(node=>{const mesh=node as THREE.Mesh;if(mesh.isMesh)mesh.geometry.dispose()})
}
