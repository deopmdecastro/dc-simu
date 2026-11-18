import { source, makeRoot, addMesh, pivot, faceBounds, cavities, status, saveModel, manifest, materials as m } from './lib/schneider-building.mjs'
const sourceDir = process.argv.includes('--source-dir') ? process.argv[process.argv.indexOf('--source-dir')+1] : undefined
const models = []
{
  const s = await source('0984',sourceDir), dims = {width:18,height:91,depth:78.5}
  if(s.meshes.length!==10 || s.meshes[0].name!=='COQUE')throw Error('Unexpected iC60H STEP anatomy')
  const root = makeRoot('breakerSchneiderIc60h1p', dims)
  const map = (x,y,z)=>[x-9.4,y+1.4,z+71.438]
  const handle=[]
  s.meshes.forEach((mesh,i)=>{
    const kind = [1,9].includes(i)?'handle': [2,3].includes(i)?'screw': [4,5,6,7].includes(i)?'clip':'body'
    const node=addMesh(root,mesh,map,kind==='screw'?m.steel:kind==='clip'?m.latch:i===9?m.dark:m.white,`acti9_${kind}_${i}`)
    if(kind==='handle')handle.push(node)
  })
  pivot(root,'acti9_handle_pivot',handle,[0,37.8,61.8])
  status(root,'acti9_visisafe',0,41.0,66.6,9)
  cavities(root,dims,[['1','top',.5,.01545,.262,8.7,14.1],['2','bottom',.5,.98455,.262,8.7,14.1]])
  models.push(await saveModel(root,'/models/protecao/schneider-acti9-ic60h-1p.glb',dims,s.source,[
    'Rigid coordinate transform; white rocker and dark grip retain distinct STEP meshes under an articulated pivot.',
    'Manufacturer screw/clip/body distinctions retained; live VisiSafe overlays added; conductor entrances reopened along electrical terminal axes.',
    'Nominal 18x91x78.5 mm is a placement frame, not an anisotropic scale of the CAD envelope.'
  ]))
}
for(const [id,type,path,dims] of [
 ['0979','pilotLightSchneiderIil1p','/models/sinalizacao/schneider-acti9-iil-1p.glb',{width:18,height:82,depth:68}],
 ['0980','pilotLightSchneiderIil3p','/models/sinalizacao/schneider-acti9-iil-3p.glb',{width:18,height:82,depth:69.5}],
]){
 const s=await source(id,sourceDir),root=makeRoot(type,dims)
 const center=id==='0979'?8.925:8.9,map=(x,y,z)=>[x-center,y+.3,z]
 if(id==='0979'){
  addMesh(root,s.meshes[0],map,m.white,'acti9_body')
  addMesh(root,s.meshes[1],map,m.lens,'acti9_lens_1')
  for(let i=2;i<4;i++)addMesh(root,s.meshes[i],map,m.steel,'acti9_screw_'+i)
  for(let i=4;i<6;i++)addMesh(root,s.meshes[i],(x,y,z)=>map(x,y+(i===4?4.8:-5.576),z),m.latch,'acti9_clip_'+i)
  cavities(root,dims,[['X1','bottom',.23,1,.195,5.2,4],['X2','bottom',.633,1,.195,5.2,4]])
 }else{
  // The simplified file combines its retractable rear clips and metal
  // terminals with the shell. Separate complete colored faces, then translate
  // each rear clip rigidly to its mounting pose. No stretching of the shell.
  const shell=s.meshes[0],body=[],metal=[],lower=[],upper=[]
  shell.brep_faces.forEach((face,i)=>{
   const b=faceBounds(shell,i),rear=b[2][1]<=5.51
   if(rear&&face.color?.[0]===1&&(b[1][0]<25||b[1][1]>56)) (b[1][0]<25?lower:upper).push(i)
   else if(face.color&&face.color[0]>.2&&face.color[0]<.3)metal.push(i)
   else body.push(i)
  })
  addMesh(root,shell,map,m.white,'acti9_body',body)
  addMesh(root,shell,map,m.steel,'acti9_terminals',metal)
  addMesh(root,shell,(x,y,z)=>map(x,y+4.41,z),m.latch,'acti9_clip_lower',lower)
  addMesh(root,shell,(x,y,z)=>map(x,y-4.745,z),m.latch,'acti9_clip_upper',upper)
  // One oval lens is the manufacturer's outer cover. Three independently
  // emissive regions partition that original shape; no invented 54 mm body.
  const lens=s.meshes[1], all=addMesh(root,lens,map,m.lens,'acti9_lens_cover')
  const geometry=all.geometry,positions=geometry.attributes.position, normals=geometry.attributes.normal
  root.remove(all)
  for(let k=0;k<3;k++){
   const p=[],n=[];const lo=[24.415,29.978,35.542][k],hi=[29.978,35.542,41.106][k]
   // Clip triangles at the exact horizontal optical partition planes.
   const clip=(poly,y,sign)=>{const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=sign*(a[1]-y),db=sign*(b[1]-y);if(da>=-1e-7)out.push(a);if(da*db<0)out.push(a.map((v,j)=>v+(b[j]-v)*da/(da-db)))}return out}
   for(let i=0;i<positions.count;i+=3){let poly=[0,1,2].map(j=>[positions.getX(i+j),positions.getY(i+j),positions.getZ(i+j),normals.getX(i+j),normals.getY(i+j),normals.getZ(i+j)]);poly=clip(clip(poly,lo+.3,1),hi+.3,-1);for(let j=1;j<poly.length-1;j++)for(const v of [poly[0],poly[j],poly[j+1]]){p.push(...v.slice(0,3));n.push(...v.slice(3))}}
   const part=all.clone();part.geometry=geometry.clone();part.geometry.setAttribute('position',new positions.constructor(new Float32Array(p),3));part.geometry.setAttribute('normal',new normals.constructor(new Float32Array(n),3));part.geometry.setIndex(null);part.material=m.lens.clone();part.name='acti9_lens_'+(k+1);root.add(part)
  }
  geometry.dispose();all.material.dispose()
  cavities(root,dims,[['L1','bottom',.230337,1,.180646,6.9,8],['L2','bottom',.634831,1,.180646,6.9,8],['L3','bottom',.365169,.907862,.460648,6,9],['N','bottom',.769663,.907862,.460648,6,9]])
 }
 models.push(await saveModel(root,path,dims,s.source,[
   'CAD shell retained at manufacturer millimetre scale; retractable fixing clips translated to mounting pose, not scaled.',
   'Live red lens material; 3-phase lens partitioned into three independent emissive regions, whose internal optical partitions are a simulation adaptation.',
   'Conductor cavities reopened at documented terminal axes. Local vector manufacturer artwork is projected at runtime.'
 ]))
}
await manifest('models/protecao/schneider-acti9-modular-sources.json',models)
console.log(JSON.stringify(models.map(({path,bytes,measuredSizeMm})=>({path,bytes,measuredSizeMm})),null,2))
