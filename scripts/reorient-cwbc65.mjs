/** One-time, SHA-gated rigid frame correction of the supplied CWBC65 CAD.
 * Re-runs are a checked no-op. Does not stretch/re-tessellate the source solid.
 * Fresh STEP conversions use [90,-90,0] in imported-components.config.json.
 * node scripts/reorient-cwbc65.mjs
 */
import fs from 'node:fs/promises'
import {createHash} from 'node:crypto'
import * as T from 'three'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js'
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js'
globalThis.FileReader ??= class {readAsArrayBuffer(blob){blob.arrayBuffer().then(buffer=>{this.result=buffer;this.onloadend?.()}).catch(error=>this.onerror?.(error))}}
const metadata='src/data/imported-component-models.json',rows=JSON.parse(await fs.readFile(metadata,'utf8')),row=rows.find(r=>r.type==='contactorWegCwbc65')
const file='public'+row.path,bytes=await fs.readFile(file),sha=b=>createHash('sha256').update(b).digest('hex'),revision='cwbc65-front-v1'
if(row.frameRevision===revision){
 if(sha(bytes)!==row.glbSha256)throw new Error('CWBC65: changed asset; refuse a second rotation')
 console.log('CWBC65: rigid frame already corrected; verified no-op')
}else{
 const previous='95f15d36a0921c494e2f1b7828ffadda0dfacfa087e19f1ba7c0e4ae3cac3f93'
 if(sha(bytes)!==previous)throw new Error('CWBC65: unrecognized input; manual review required')
 const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
 const corrected=new T.Group();corrected.name='cwbc65_physical_front_frame';corrected.add(...scene.children.slice());corrected.rotation.x=Math.PI/2;corrected.position.y=.115
 const output=new T.Scene();output.add(corrected);output.updateMatrixWorld(true)
 const size=new T.Box3().setFromObject(output,true).getSize(new T.Vector3()).multiplyScalar(1000)
 const glb=Buffer.from(await new GLTFExporter().parseAsync(output,{binary:true,onlyVisible:false}))
 await fs.writeFile(file,glb)
 Object.assign(row,{physicalSizeMm:{width:+size.x.toFixed(3),height:+size.y.toFixed(3),depth:+size.z.toFixed(3)},sourceRotationDeg:[90,-90,0],frameRevision:revision,frameCorrection:{previousGlbSha256:previous,operation:'Rigid Rx(+90 degrees), translate Y +115 mm; terminal/front side faces +Z, DIN rear faces -Z. No change to source dimensions or tessellation.'},bytes:glb.length,glbSha256:sha(glb)})
 await fs.writeFile(metadata,JSON.stringify(rows,null,2)+'\n');console.log('CWBC65:',row.physicalSizeMm,row.glbSha256)
}
