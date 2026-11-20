/** Offline CAD helpers. Millimetres until writeGlb(); never anisotropic scaling. */
import fs from 'node:fs/promises'
import * as T from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import occtImportJs from '@sunbox/occt-import-js'
import { createHash } from 'node:crypto'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

globalThis.FileReader ??= class { readAsArrayBuffer(blob) { blob.arrayBuffer().then(value => { this.result = value; this.onloadend?.() }).catch(error => this.onerror?.(error)) } }
export const sha = bytes => createHash('sha256').update(bytes).digest('hex')
export const mat = (color, metalness = 0, roughness = .55) => new T.MeshStandardMaterial({ color, metalness, roughness })
let importer
export async function readStep(file) {
  importer ??= await occtImportJs({ wasmBinary: await fs.readFile(new URL('./occt-import-js.wasm', import.meta.resolve('@sunbox/occt-import-js'))) })
  const bytes = await fs.readFile(file)
  const result = importer.ReadStepFile(bytes, { linearUnit: 'millimeter', linearDeflectionType: 'absolute_value', linearDeflection: .12, angularDeflection: .35 })
  if (!result.success || !result.meshes?.length) throw new Error(`STEP inválido: ${file}`)
  return { ...result, sha256: sha(bytes) }
}
export function occGeometry(mesh, map = (x,y,z) => [x,y,z], faceIds) {
  const a = mesh.attributes.position.array, indices = mesh.index.array
  const selected = faceIds ? faceIds.flatMap(i => { const f=mesh.brep_faces[i]; return Array.from(indices).slice(f.first*3,(f.last+1)*3) }) : Array.from(indices)
  const p = [], n = [], normals = mesh.attributes.normal?.array
  // map is an affine rigid transform. Derive its rotation for normals.
  const o = map(0,0,0), ex=map(1,0,0).map((v,i)=>v-o[i]), ey=map(0,1,0).map((v,i)=>v-o[i]), ez=map(0,0,1).map((v,i)=>v-o[i])
  const determinant = new T.Vector3(...ex).dot(new T.Vector3(...ey).cross(new T.Vector3(...ez)))
  if (determinant < 0) for (let i=0;i<selected.length;i+=3) [selected[i+1],selected[i+2]]=[selected[i+2],selected[i+1]]
  for (const i of selected) {
    p.push(...map(a[i*3],a[i*3+1],a[i*3+2]))
    if (normals) { const x=normals[i*3],y=normals[i*3+1],z=normals[i*3+2]; n.push(...ex.map((v,j)=>v*x+ey[j]*y+ez[j]*z)) }
  }
  const g = new T.BufferGeometry(); g.setAttribute('position',new T.Float32BufferAttribute(p,3))
  if (normals) g.setAttribute('normal',new T.Float32BufferAttribute(n,3)); else g.computeVertexNormals()
  return g
}
export function fromOcc(mesh,map,material,name,faces) { const m=new T.Mesh(occGeometry(mesh,map,faces),material); m.name=name; m.userData.cadName=mesh.name??''; return m }
export function box(w,h,d,material,name,at=[0,0,0]) { const m=new T.Mesh(new T.BoxGeometry(w,h,d),material); m.name=name; m.position.set(...at); return m }
export function plane(w,h,material,name,at=[0,0,0]) { const m=new T.Mesh(new T.PlaneGeometry(w,h),material); m.name=name;m.position.set(...at);m.userData.protectionMarking=true;return m }
export function cylinder(r,h,material,name,at=[0,0,0],axis='z',segments=32) { const m=new T.Mesh(new T.CylinderGeometry(r,r,h,segments),material); if(axis==='z')m.rotation.x=Math.PI/2; if(axis==='x')m.rotation.z=Math.PI/2; m.name=name;m.position.set(...at);return m }
export function shapePlate(w,h,d,holes,material,name,at=[0,0,0]) {
 const shape=new T.Shape();shape.moveTo(-w/2,-h/2);shape.lineTo(w/2,-h/2);shape.lineTo(w/2,h/2);shape.lineTo(-w/2,h/2);shape.closePath()
 for(const[x,y,r]of holes){const p=new T.Path();p.absarc(x,y,r,0,Math.PI*2,true);shape.holes.push(p)}
 const mesh=new T.Mesh(new T.ExtrudeGeometry(shape,{depth:d,bevelEnabled:false,curveSegments:20}),material);mesh.name=name;mesh.position.set(...at);return mesh
}
/** Finite convex cylinder subtraction, retaining all geometry OUTSIDE the volume.
 * Cuts original CAD surfaces instead of pasting a black disk over solid plastic. */
export function bore(source,axis,c,radius,min,max,sides=24){
 const input=source.index?source.toNonIndexed():source.clone(),p=input.attributes.position,n=input.attributes.normal,positions=[],normals=[]
 const k={x:0,y:1,z:2}[axis],uv=[0,1,2].filter(i=>i!==k)
 const planes=Array.from({length:sides},(_,i)=>{const a=2*Math.PI*i/sides,v=[0,0,0];v[uv[0]]=Math.cos(a);v[uv[1]]=Math.sin(a);return [...v,radius-v[0]*c[0]-v[1]*c[1]-v[2]*c[2]]})
 const lo=[0,0,0,-min],hi=[0,0,0,max];lo[k]=1;hi[k]=-1;planes.push(lo,hi)
 const clip=(poly,plane,sign)=>{const out=[],dist=v=>sign*(v[0]*plane[0]+v[1]*plane[1]+v[2]*plane[2]+plane[3]);for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=dist(a),db=dist(b);if(da>=-1e-8)out.push(a);if(da*db<0)out.push(a.map((x,j)=>x+(b[j]-x)*da/(da-db)))}return out}
 const emit=poly=>{for(let i=1;i<poly.length-1;i++)for(const v of [poly[0],poly[i],poly[i+1]]){positions.push(...v.slice(0,3));normals.push(...v.slice(3))}}
 for(let i=0;i<p.count;i+=3){let poly=[0,1,2].map(j=>[p.getX(i+j),p.getY(i+j),p.getZ(i+j),n?.getX(i+j)??0,n?.getY(i+j)??0,n?.getZ(i+j)??1]);if(Math.max(...poly.map(v=>v[k]))<min||Math.min(...poly.map(v=>v[k]))>max||uv.some(j=>Math.max(...poly.map(v=>v[j]))<c[j]-radius||Math.min(...poly.map(v=>v[j]))>c[j]+radius)){emit(poly);continue}for(const plane of planes){emit(clip(poly,plane,-1));poly=clip(poly,plane,1);if(poly.length<3)break}}
 input.dispose();const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));g.normalizeNormals();return g
}
export function drill(meshes,axis,c,r,min,max) { for(const mesh of meshes){const old=mesh.geometry;mesh.geometry=bore(old,axis,c,r,min,max);old.dispose()} }
/** Finite rectangular recess. Removes the original triangles inside the box. */
export function cutBox(mesh,lo,hi){
 const old=mesh.geometry,input=old.index?old.toNonIndexed():old,p=input.attributes.position,n=input.attributes.normal,positions=[],normals=[]
 const planes=[[1,0,0,-lo[0]],[-1,0,0,hi[0]],[0,1,0,-lo[1]],[0,-1,0,hi[1]],[0,0,1,-lo[2]],[0,0,-1,hi[2]]]
 const clip=(poly,plane,sign)=>{const out=[],dist=v=>sign*(v[0]*plane[0]+v[1]*plane[1]+v[2]*plane[2]+plane[3]);for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=dist(a),db=dist(b);if(da>=-1e-8)out.push(a);if(da*db<0)out.push(a.map((x,j)=>x+(b[j]-x)*da/(da-db)))}return out}
 const emit=poly=>{for(let i=1;i<poly.length-1;i++)for(const v of [poly[0],poly[i],poly[i+1]]){positions.push(...v.slice(0,3));normals.push(...v.slice(3))}}
 for(let i=0;i<p.count;i+=3){let poly=[0,1,2].map(j=>[p.getX(i+j),p.getY(i+j),p.getZ(i+j),n.getX(i+j),n.getY(i+j),n.getZ(i+j)]);if([0,1,2].some(k=>Math.max(...poly.map(v=>v[k]))<lo[k]||Math.min(...poly.map(v=>v[k]))>hi[k])){emit(poly);continue}for(const plane of planes){emit(clip(poly,plane,-1));poly=clip(poly,plane,1);if(poly.length<3)break}}
 mesh.geometry=new T.BufferGeometry();mesh.geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));mesh.geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));old.dispose()
 if(input!==old)input.dispose()
}
const inner=mat('#3b3b32',.1,.7), brass=mat('#b9a167',.65,.4)
/** Deep cavity: open mouth, inner wall and recessed contact, never a surface disk. */
export function terminal(root,label,x,y,z,{r=2.3,depth=6,face='front',contact='socket',screw=true}={}) {
 const normal={front:[0,0,1],back:[0,0,-1],top:[0,1,0],bottom:[0,-1,0],left:[-1,0,0],right:[1,0,0]}[face]
 if(contact==='socket'){
  const group=new T.Group();group.name='industrial_connection_'+label;group.position.set(x,y,z)
  group.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),new T.Vector3(...normal))
  const g=new T.CylinderGeometry(r,r,depth,24,1,true);g.rotateX(Math.PI/2);g.translate(0,0,-depth/2)
  const wall=new T.Mesh(g,inner.clone());wall.material.side=T.DoubleSide;wall.name='cavity_'+label;group.add(wall)
  if(screw)group.add(cylinder(r*.65,.6,brass,'contact_'+label,[0,0,-depth+.4]))
  root.add(group)
 }
 return {label,point:[x,y,z],face,contact,diameterMm:r*2,holeDepthMm:depth}
}
export function led(root,x,y,z,color,name,r=1.2){const m=cylinder(r,.45,mat(color),name,[x,y,z]);m.userData.ledColor=color;root.add(m);return m}
export async function writeGlb(file,root){
 root.traverse(node=>{if(node.isMesh){const old=node.geometry;node.geometry=mergeVertices(old,1e-5);if(old!==node.geometry)old.dispose();node.geometry.scale(.001,.001,.001)}node.position.multiplyScalar(.001)})
 root.updateMatrixWorld(true)
 const scene=new T.Scene();scene.add(root)
 const bytes=Buffer.from(await new GLTFExporter().parseAsync(scene,{binary:true,onlyVisible:false}));await fs.mkdir(new URL('.',file),{recursive:true});await fs.writeFile(file,bytes);return {bytes:bytes.length,sha256:sha(bytes)}
}
