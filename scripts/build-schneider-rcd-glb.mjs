import { source, makeRoot, addMesh, pivot, cavities, status, saveModel, manifest, materials as m } from './lib/schneider-building.mjs'
import fs from 'node:fs/promises'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js'
import {completeSchneiderIidHandle} from '../src/three/schneiderRcdModel.ts'

// node --import tsx scripts/build-schneider-rcd-glb.mjs --refresh-iid-barrel
// Atualiza um GLB existente sem repetir o download/conversão do STEP original.
if(process.argv.includes('--refresh-iid-barrel')){
 const file='public/models/protecao/schneider-acti9-iid-4p.glb',manifestFile='public/models/protecao/schneider-acti9-rcd-sources.json'
 const provenance=JSON.parse(await fs.readFile(manifestFile,'utf8')),previous=provenance.models.find(m=>m.path==='/models/protecao/schneider-acti9-iid-4p.glb')
 const bytes=await fs.readFile(file),{scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
 const root=scene.getObjectByName('schneider_residualBreakerSchneiderIid4p')
 if(!root)throw Error('Missing original iID model root')
 root.traverse(n=>{if(n.isMesh)n.geometry.scale(1000,1000,1000);n.position.multiplyScalar(1000)})
 completeSchneiderIidHandle(root,1)
 const note='Added a capped black handle barrel behind the original STEP grip, concentric with the reviewed iID axis. Reconstructed closure prevents visibility through the simplified handle aperture; no electrical interfaces changed.'
 const record=await saveModel(root,previous.path,previous.nominalSizeMm,previous.source,[...new Set([...previous.adaptations,note])])
 provenance.models=provenance.models.map(m=>m.path===record.path?record:m)
 await fs.writeFile(manifestFile,JSON.stringify(provenance,null,2)+'\n')
 console.log('iID: obturador preto integrado no GLB ('+record.bytes+' bytes)');process.exit(0)
}
const sourceDir=process.argv.includes('--source-dir')?process.argv[process.argv.indexOf('--source-dir')+1]:undefined
const models=[]
{
 const s=await source('0952',sourceDir),dims={width:36,height:85,depth:73},root=makeRoot('residualBreakerSchneiderIdpnVigi',dims)
 if(s.meshes.length!==10||s.meshes[0].name!=='COQUE')throw Error('Unexpected iDPN N Vigi STEP anatomy')
 const map=(x,y,z)=>[x-18.751,y+.1,z+71.076],handle=[]
 s.meshes.forEach((mesh,i)=>{
  const kind=i===1?'test':[2,3].includes(i)?'handle':i>=4&&i<=7?'screw':i>=8?'clip':'body'
  const node=addMesh(root,mesh,(x,y,z)=>map(x,y+(i===8?-4.989:i===9?4.969:0),z),kind==='screw'?m.steel:kind==='clip'?m.latch:kind==='test'?m.white:i===3?m.dark:m.white,'schneider_'+kind+(kind==='test'?'':'_'+i))
  if(kind==='handle')handle.push(node)
 })
 pivot(root,'schneider_handle_pivot',handle,[-9,36,61])
 status(root,'schneider_visisafe',-9,41.8,66.4,9)
 cavities(root,dims,[['N1','top',.126404,0,.238,8.2,13.5],['1','top',.365169,0,.305,8.2,13.5],['N2','bottom',.634831,1,.238,8.2,13.5],['2','bottom',.873596,1,.305,8.2,13.5]])
 models.push(await saveModel(root,'/models/protecao/schneider-acti9-idpn-n-vigi-1pn.glb',dims,s.source,[
  'Rigid front-facing transform. Original STEP shell, two handle pieces, four screws and test button preserved separately.',
  'Rear clips translated by their extension to mounting pose. No anisotropic envelope fit.',
  'Added live VisiSafe regions and reopened conductor cavities at stable electrical terminal axes.'
 ]))
}
{
 const s=await source('1753',sourceDir),dims={width:72,height:85,depth:73.5},root=makeRoot('residualBreakerSchneiderIid4p',dims)
 const shell=s.meshes[0]
 if(shell.name!=='COQUE_ARRIERE_1_1'||shell.brep_faces.length!==346)throw Error('Unexpected iID 4P STEP face topology')
 const map=(x,y,z)=>[x-35.85,y+.1,z]
 const whiteHandle=[103,117,118,119,120],darkHandle=Array.from({length:13},(_,i)=>104+i),test=[186,187,188,189,190]
 const moving=new Set([...whiteHandle,...darkHandle,...test])
 addMesh(root,shell,map,m.white,'schneider_body',shell.brep_faces.map((_,i)=>i).filter(i=>!moving.has(i)))
 const a=addMesh(root,shell,map,m.white,'schneider_handle_white',whiteHandle)
 const b=addMesh(root,shell,map,m.dark,'schneider_handle_grip',darkHandle)
 pivot(root,'schneider_handle_pivot',[a,b],[-26.9,36.5,61])
 addMesh(root,shell,map,m.white,'schneider_test',test)
 for(let i=1;i<s.meshes.length;i++)addMesh(root,s.meshes[i],(x,y,z)=>map(x,y+(i<=2?-5.504:5.069),z),m.latch,'schneider_clip_'+i)
 status(root,'schneider_visisafe',-26.9,41.8,66.4,9)
 completeSchneiderIidHandle(root,1)
 const rows=[]
 for(const [face,ny,labels]of [['top',0,['N1','1','3','5']],['bottom',1,['N2','2','4','6']]])
  for(let k=0;k<4;k++)rows.push([labels[k],face,[.127615,.375872,.624128,.872385][k],ny,.284821,8,13.5])
 cavities(root,dims,rows)
 models.push(await saveModel(root,'/models/protecao/schneider-acti9-iid-4p.glb',dims,s.source,[
  'Fused simplified STEP explicitly split by reviewed original faces: rocker 103/117-120, dark grip 104-116, test button 186-190. No replacement generic shell.',
  'Rear clips rigidly translated to mounting pose. Body and curved front remain at source scale; nominal depth differs from source handle envelope by less than 1 mm.',
  'Added live VisiSafe regions and reopened all eight conductor cavities; identities and RCCB electrical function unchanged.',
  'Closed black handle barrel reconstructed behind the original grip, concentric with the real hinge axis, to occlude the hollow simplified STEP aperture.'
 ]))
}
await manifest('models/protecao/schneider-acti9-rcd-sources.json',models)
console.log(JSON.stringify(models.map(({path,bytes,measuredSizeMm})=>({path,bytes,measuredSizeMm})),null,2))
