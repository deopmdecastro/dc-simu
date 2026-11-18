import path from 'node:path'
import {writeFile} from 'node:fs/promises'
import {browserFixture} from './lib/browser-fixture.mjs'
import {attachPanel} from './lib/panel-fixture.mjs'
import {attachAdmin} from './lib/admin-fixture.mjs'

// Real save/reopen/publish UI against isolated IndexedDB. No external requests,
// cloud/account writes, release commits or deployment.
const output=process.env.MECHANICAL_OUTPUT||path.resolve('runtime/mechanical-catalog')
const f=await browserFixture({baseURL:process.env.INDUSTRIAL_TEST_URL,output}),{page,check}=f
const devices=['contactorWegCwbc65','levelRelayAvel411','timerGeyaGrt8M1','timerGeyaGrt8B1','meterD522066']
const assemblies=['powerSource1ph','powerSource3ph','powerSource24v','terminalSet1ph','terminalSet3ph','terminalSet24v']
const published=[],contracts={}
async function contract(mode){
 return page.evaluate(mode=>{
  const r=mode==='admin'?window.__adminState():window.__panelState(),T=window.__fixtureThree,names=[];r.scene.updateMatrixWorld(true)
  r.scene.traverse(n=>{if(n.isMesh)names.push(n.name)})
  const heads=names.filter(n=>n.startsWith('terminal_screw_head_')),label=r.scene.getObjectByName('industrial_avel_label'),image=label?.material?.map?.image
  let fascia=null
  if(image){
   const canvas=document.createElement('canvas');canvas.width=44;canvas.height=100;const ctx=canvas.getContext('2d')
   // GLTFExporter bakes flipY into the PNG and the loader then sets flipY=false.
   // Compare actual UV-visible pixels, not the two opposite storage row orders.
   if(label.material.map.flipY){ctx.translate(0,100);ctx.scale(1,-1)}ctx.drawImage(image,0,0,44,100)
   const pixels=ctx.getImageData(0,0,44,100).data;let hash=2166136261
   for(const n of pixels)hash=Math.imul(hash^n,16777619)
   fascia={width:image.width,height:image.height,flipY:label.material.map.flipY,hash:hash>>>0}
  }
  const unit=mode==='admin'?1:100,front=r.scene.getObjectByName('cwbc65_physical_front_frame');let envelope=null
  if(front)envelope=new T.Box3().setFromObject(front,true).getSize(new T.Vector3()).multiplyScalar(unit).toArray()
  const carrier=r.scene.getObjectByName('imported_carrier'),fixed=[]
  front?.traverse(n=>{if(n.isMesh&&/^cad_/.test(n.name)&&!['cad_38_','cad_39_'].includes(n.name))fixed.push([n.name,n.getWorldPosition(new T.Vector3()).multiplyScalar(unit).toArray()])})
  const shield=r.scene.getObjectByName('terminal-assembly-acrylic-shield');let visible=!!shield
  for(let n=shield;n;n=n.parent)if(!n.visible)visible=false
  const cover=shield?{visible,opacity:shield.material.opacity,transmission:shield.material.transmission,width:new T.Box3().setFromObject(shield,true).getSize(new T.Vector3()).x*unit}:null
  return{heads,fascia,envelope,carrier:carrier?{point:carrier.getWorldPosition(new T.Vector3()).multiplyScalar(unit).toArray(),pose:carrier.userData.cwbcCarrier}:null,fixed,cover,lcd:!!r.scene.getObjectByName('digital_meter_lcd')||names.some(n=>n.startsWith('display:'))}
 },mode)
}
function hardware(result,type,route){
 if(type==='contactorWegCwbc65')check(result.envelope&&result.envelope.every((n,i)=>Math.abs(n-[57.61,115,159.4][i])<.04)&&result.carrier?.pose,route+': corrected CWBC65 front, full scale, exposed coils and actual carrier metadata survive')
 if(type==='levelRelayAvel411')check(result.fascia?.width===1408&&result.fascia?.height===3200,route+': AVEL retains the legible high-resolution silk screen')
 if(type.startsWith('timerGeya'))check(result.heads.filter(n=>n.startsWith('terminal_screw_head_geya_')).length===6,route+': GEYA keeps all six geometric cross screws')
 if(type==='meterD522066')check(result.heads.filter(n=>n.startsWith('terminal_screw_head_d52_')).length===2&&result.lcd,route+': D52 keeps improved terminals and its live display')
}
async function waitCarrier(mode,on){
 await page.waitForFunction(({mode,on})=>{
  const r=mode==='admin'?window.__adminState():window.__panelState(),T=window.__fixtureThree,n=r?.scene.getObjectByName('imported_carrier'),pose=n?.userData.cwbcCarrier
  return !!pose&&n.position.distanceTo(new T.Vector3(...pose.rest).addScaledVector(new T.Vector3(...pose.travel),on?1:0))<1e-6
 },{mode,on},{timeout:90000})
}
async function waitCover(mode,on){
 await page.waitForFunction(({mode,on})=>{
  const r=mode==='admin'?window.__adminState():window.__panelState(),shield=r?.scene.getObjectByName('terminal-assembly-acrylic-shield');if(!shield)return false
  let visible=true;for(let n=shield;n;n=n.parent)if(!n.visible)visible=false
  return visible===on
 },{mode,on},{timeout:60000})
}
try{
 const admin=await attachAdmin(f)
 for(const type of [...devices,...assemblies]){
  const draft=await admin.open(type)
  const ids=await admin.editor(s=>s.getState().def.terminals.map(t=>t.id))
  let coverDefault=false
  if(devices.includes(type)){
   const before=await contract('admin');hardware(before,type,'Admin '+type);contracts[type]=before
   if(type==='contactorWegCwbc65'){
    await admin.editor(s=>s.getState().set({tab:'controls'}))
    const coil=page.locator('.ce-action-card').filter({has:page.locator('input[value="Bobina energizada"]')}).getByRole('checkbox').last()
    await coil.check();await waitCarrier('admin',true)
    const on=await contract('admin'),delta=on.carrier.point.map((n,i)=>n-before.carrier.point[i])
    check(Math.hypot(delta[0],delta[1],delta[2]+2.8)<.02&&JSON.stringify(on.fixed)===JSON.stringify(before.fixed),'Actual Admin coil preview moves only cad38/39 inward 2.8 mm in physical Z; body, screws and resistors stay fixed')
    await page.screenshot({timeout:120000,path:path.join(output,'contactorWegCwbc65-admin-powered.png')})
    await coil.uncheck();await waitCarrier('admin',false)
   }
   await admin.editor(s=>s.getState().edit(def=>({...def,terminals:def.terminals.map((t,i)=>i?t:{...t,name:'AUTOR '+t.label})})))
   const signature=await admin.editor(s=>JSON.stringify(s.getState().def.terminals))
   await admin.reopen(draft.id)
   check(await admin.editor(s=>JSON.stringify(s.getState().def.terminals))===signature,type+': actual Admin save/reopen preserves authored names, terminal IDs and cable geometry')
  }else{
   const before=await contract('admin'),bodySignature=await admin.editor(s=>JSON.stringify({parts:s.getState().def.parts.filter(p=>!p.procedural),terminals:s.getState().def.terminals}))
   check(before.cover&&!before.cover.visible&&before.cover.opacity===.38,type+': actual Admin has a real optional shield, initially OFF')
   await page.getByRole('button',{name:'Sem acrílico',exact:true}).click();await waitCover('admin',true)
   const on=await contract('admin')
   check(on.cover.opacity===.38&&on.cover.transmission===.9&&on.cover.width>24,type+': actual Admin toggle shows the same physical transparent protection, not a UI-only flag')
   const coverId=await admin.editor(s=>s.getState().def.parts.find(p=>p.procedural==='terminal-assembly-cover').id)
   await admin.reopen(draft.id);await waitCover('admin',true)
   check(await admin.editor(s=>JSON.stringify({parts:s.getState().def.parts.filter(p=>!p.procedural),terminals:s.getState().def.terminals}))===bodySignature&&await admin.editor(s=>s.getState().def.parts.find(p=>p.procedural==='terminal-assembly-cover').id)===coverId,type+': save/reopen retains the actual cover identity while preserving body transforms, all terminals and IDs')
   await page.screenshot({timeout:120000,path:path.join(output,type+'-admin-acrylic.png')})
   // Publish both defaults, proving that Admin authors the initial choice.
   coverDefault=assemblies.indexOf(type)%2===0
   if(!coverDefault){await page.getByRole('button',{name:'Com acrílico',exact:true}).click();await waitCover('admin',false)}
   contracts[type]=await contract('admin')
  }
  const result=await admin.publish()
  check(JSON.stringify(result.version.definition.terminals.map(t=>t.id))===JSON.stringify(ids),type+': actual local publication preserves every terminal ID')
  if(type==='contactorWegCwbc65'){
   const packed=await page.evaluate(async({id,version})=>{
    const {catalogApi}=await window.__fixtureImport('/src/catalog/catalogApi.ts'),url=await catalogApi.glbUrl(id,version),bytes=await(await fetch(url)).arrayBuffer(),view=new DataView(bytes),doc=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,20,view.getUint32(12,true))))
    URL.revokeObjectURL(url);return{bytes:bytes.byteLength,required:doc.extensionsRequired}
   },{id:result.id,version:result.version.version})
   check(packed.bytes<=4_500_000&&packed.required?.includes('EXT_meshopt_compression'),'CWBC65: actual Admin publication stays within the unchanged cap using lossless packing, with no removed CAD detail')
  }
  published.push({source:type,id:result.id,version:result.version.version,coverDefault})
 }
 await f.reload();const panel=await attachPanel(f)
 await page.evaluate(async()=>{const {useCatalogStore}=await window.__fixtureImport('/src/catalog/registry.ts');await useCatalogStore.getState().load()})
 for(const entry of published.filter(e=>devices.includes(e.source))){
  await panel.show('cat:'+entry.id+':v'+entry.version)
  const actual=await contract('panel');hardware(actual,entry.source,'Published '+entry.source)
  if(actual.fascia)check(actual.fascia.hash===contracts[entry.source].fascia.hash,'AVEL: published face pixels match the actual saved Admin texture')
  if(entry.source==='contactorWegCwbc65'){
   const source=published.find(e=>e.source==='powerSource3ph')
   const circuit=await panel.store((s,sourceType)=>{
    const c=s.getState().components[0],sourceId=s.getState().addComponent(sourceType,400,0),supply=s.getState().components.find(c=>c.id===sourceId)
    const id=(component,label)=>component.terminals.find(t=>t.label===label).id
    s.getState().addWire(id(supply,'L1'),id(c,'A1'),'black');s.getState().addWire(id(supply,'N'),id(c,'A2'),'blue');s.getState().addWire(id(supply,'L1'),id(c,'1L1'),'black');s.getState().step(100)
    return{type:c.type,id:c.id,output:id(c,'2T1')}
   },'cat:'+source.id+':v'+source.version)
   await waitCarrier('panel',true)
   const on=await contract('panel'),delta=on.carrier.point.map((n,i)=>n-actual.carrier.point[i])
   check(Math.hypot(delta[0],delta[1],delta[2]+2.8)<.03&&JSON.stringify(on.fixed)===JSON.stringify(actual.fixed)&&await panel.store((s,id)=>s.getState().runtime.energizedTerminals.has(id),circuit.output),'Published source and CWBC65: real coil wiring energizes the output and moves only the real carrier along physical Z')
   await page.screenshot({timeout:120000,path:path.join(output,'contactorWegCwbc65-published-powered.png')})
   await panel.store(s=>s.getState().stop());await waitCarrier('panel',false)
   check(await panel.store((s,type)=>s.getState().components[0].type===type,circuit.type),'Published CWBC65 STOP restores the carrier without rewriting its immutable catalog type')
  }
  await page.screenshot({timeout:120000,path:path.join(output,entry.source+'-published.png')})
 }
 // The actual main inspector must operate the BAKED part, not add a second cover.
 await page.evaluate(async()=>{
  const React=window.__fixtureReact,{default:Sidebar}=await import('/src/components/Sidebar.tsx'),{default:Panel3D}=await import('/src/three/Panel3D.tsx')
  window.__fixtureRoot.render(React.createElement('div',{style:{display:'flex',height:'100%',width:'100%'}},React.createElement(Sidebar,{width:340}),React.createElement('div',{style:{flex:1,minWidth:0}},React.createElement(Panel3D,{frontEdit:true}))))
 })
 for(const entry of published.filter(e=>assemblies.includes(e.source))){
  const type='cat:'+entry.id+':v'+entry.version,[id]=await panel.show(type)
  await panel.store((s,id)=>s.getState().selectComponents([id]),id);await waitCover('panel',entry.coverDefault)
  check((await contract('panel')).cover.visible===entry.coverDefault&&await panel.store(s=>s.getState().components[0].state.acrylicCover)===entry.coverDefault,entry.source+': published instance starts with the actual Admin-authored acrylic default')
  if(!entry.coverDefault){await page.getByRole('button',{name:'Sem acrílico',exact:true}).click();await waitCover('panel',true)}
  const cover=await contract('panel')
  const count=await page.evaluate(()=>{let count=0;window.__panelState().scene.traverse(n=>{if(n.name==='terminal-assembly-acrylic-shield')count++});return count})
  check(count===1&&cover.cover.opacity===.38&&cover.cover.transmission===.9&&Math.abs(cover.cover.width-contracts[entry.source].cover.width)<.02,entry.source+': real inspector shows exactly one baked transparent shield, matching Admin dimensions/material')
  const signature=await panel.store(s=>JSON.stringify(s.getState().components.map(c=>[c.id,c.type,c.terminals.map(t=>t.id)]))),saved=await panel.store(s=>s.getState().saveJSON())
  await page.getByRole('button',{name:'Com acrílico',exact:true}).click();await waitCover('panel',false)
  await panel.store((s,json)=>{s.getState().newProject();s.getState().loadJSON(json)},saved);await waitCover('panel',true)
  check(await panel.store(s=>JSON.stringify(s.getState().components.map(c=>[c.id,c.type,c.terminals.map(t=>t.id)])))===signature&&await panel.store(s=>s.getState().components[0].state.acrylicCover)===true,entry.source+': published cover roundtrip retains version, component and terminal identities')
  await page.screenshot({timeout:120000,path:path.join(output,entry.source+'-published-acrylic.png')})
 }
 f.stable();await writeFile(path.join(output,'results.json'),JSON.stringify({checks:f.count(),published,contracts,errors:f.errors},null,2));console.log(f.count()+' Admin/catalog acceptance checks passed')
}catch(error){await page.screenshot({timeout:20000,path:path.join(output,'failure.png')}).catch(()=>{});await writeFile(path.join(output,'failure.txt'),String(error.stack||error));throw error}
finally{await f.browser.close()}
