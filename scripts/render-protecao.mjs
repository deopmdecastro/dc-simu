// Render simples do GLB XB2 para PNG (painter's algorithm, sem browser)
import fs from 'node:fs/promises'
import * as T from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import sharp from 'sharp'

const SIZE=420
async function loadGlb(file){const buf=await fs.readFile(file);const gltf=await new Promise((res,rej)=>new GLTFLoader().parse(buf.buffer.slice(0), '', res, rej));return gltf.scene}
function render(root,eye){
  const box3=new T.Box3().setFromObject(root);const size=box3.getSize(new T.Vector3());const center=box3.getCenter(new T.Vector3())
  const pixels=new Uint8Array(SIZE*SIZE*4)
  const e=eye.clone().normalize()
  const up=new T.Vector3(0,1,0)
  const right=new T.Vector3().crossVectors(up,e).normalize()
  const camUp=new T.Vector3().crossVectors(e,right).normalize()
  const scale=(SIZE*0.8)/Math.max(size.x,size.y,size.z)
  const tris=[]
  root.traverse(node=>{
    if(!node.isMesh)return
    const geo=node.geometry.index?node.geometry.toNonIndexed():node.geometry
    const pos=geo.attributes.position,normal=geo.attributes.normal
    const m=node.material
    const base=new T.Color(m?.color?.getHex?.()??0x888888)
    const metal=m?.metalness??0,rough=m?.roughness??0.6
    for(let i=0;i<pos.count;i+=3){
      const v=[0,1,2].map(k=>new T.Vector3().fromBufferAttribute(pos,i+k).applyMatrix4(node.matrixWorld))
      const n=normal?[0,1,2].map(k=>new T.Vector3().fromBufferAttribute(normal,i+k).transformDirection(node.matrixWorld)):null
      const cx=(v[0].x+v[1].x+v[2].x)/3,cy=(v[0].y+v[1].y+v[2].y)/3,cz=(v[0].z+v[1].z+v[2].z)/3
      const depth=cx*e.x+cy*e.y+cz*e.z
      const faceN=n?n[0].clone().add(n[1]).add(n[2]).normalize():new T.Vector3(0,0,1)
      const L=new T.Vector3(0.4,0.7,0.6).normalize();const d=Math.abs(faceN.dot(L));const light=0.45+0.55*d
      const col=base.clone().multiplyScalar(light)
      const shade=1-metal*0.25
      const px=v.map(p=>{
        const q=new T.Vector3(p.x-center.x,p.y-center.y,p.z-center.z)
        return [
        Math.round((q.x*right.x+q.y*right.y+q.z*right.z)*scale+SIZE/2),
        Math.round(-(q.x*camUp.x+q.y*camUp.y+q.z*camUp.z)*scale+SIZE/2)]})
      tris.push({px,depth,color:[Math.min(255,col.r*255*shade),Math.min(255,col.g*255*shade),Math.min(255,col.b*255*shade)]})
    }
  })
  tris.sort((a,b)=>a.depth-b.depth)
  for(const{px,color}of tris){
    const minX=Math.max(0,Math.min(...px.map(p=>p[0]))),maxX=Math.min(SIZE-1,Math.max(...px.map(p=>p[0])))
    const minY=Math.max(0,Math.min(...px.map(p=>p[1]))),maxY=Math.min(SIZE-1,Math.max(...px.map(p=>p[1])))
    const d=(px[1][0]-px[0][0])*(px[2][1]-px[0][1])-(px[2][0]-px[0][0])*(px[1][1]-px[0][1])
    if(!d)continue
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
      const w0=((px[1][0]-x)*(px[2][1]-y)-(px[2][0]-x)*(px[1][1]-y))/d
      const w1=((px[2][0]-x)*(px[0][1]-y)-(px[0][0]-x)*(px[2][1]-y))/d
      const w2=1-w0-w1
      if(w0<0||w1<0||w2<0)continue
      const idx=(y*SIZE+x)*4
      pixels.set([...color.map(Math.round),255],idx)
    }
  }
  return pixels
}
const [,,type,view='iso']=process.argv
const root=await loadGlb(`public/models/protecao/${type}.glb`)
const eyes={iso:new T.Vector3(0.6,0.5,1),front:new T.Vector3(0,0.1,1),side:new T.Vector3(1,0.3,0.2),top:new T.Vector3(0.2,1,0.3),back:new T.Vector3(0,0.1,-1)}
const pixels=render(root,eyes[view]??eyes.iso)
await sharp(Buffer.from(pixels),{raw:{width:SIZE,height:SIZE,channels:4}}).png().toFile(`/tmp/xb2-${type}-${view}.png`)
console.log('ok',`/tmp/xb2-${type}-${view}.png`)
