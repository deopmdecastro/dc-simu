import path from 'node:path'
import {writeFile} from 'node:fs/promises'
import {panelFixture,attachPanel} from './lib/panel-fixture.mjs'
import {attachAdmin} from './lib/admin-fixture.mjs'
const output=process.env.MECHANICAL_OUTPUT||path.resolve('runtime/mechanical-refinement')
const f=await panelFixture({baseURL:process.env.INDUSTRIAL_TEST_URL,output}),{page,check}=f
const evidence={acrylic:[],devices:[],errors:f.errors}
const types=['powerSource1ph','powerSource3ph','powerSource24v','terminalSet1ph','terminalSet3ph','terminalSet24v']
const inspect=()=>page.evaluate(()=>{
 const r=window.__panelState(),T=window.__fixtureThree;let component
 r.scene.traverse(n=>{if(n.userData.isComponentRoot)component=n})
 const shields=[];component?.traverse(n=>{if(n.name==='terminal-assembly-acrylic-shield')shields.push(n)})
 if(!shields.length)return{count:0}
 const shield=shields[0],cover=shield.parent,box=new T.Box3().setFromObject(shield,true),geos=new Set(),materials=new Set()
 cover.traverse(n=>{if(n.geometry)geos.add(n.geometry);if(n.material)for(const m of Array.isArray(n.material)?n.material:[n.material])materials.add(m)})
 window.__acrylicDisposed={geometries:0,materials:0}
 geos.forEach(g=>g.addEventListener('dispose',()=>window.__acrylicDisposed.geometries++));materials.forEach(m=>m.addEventListener('dispose',()=>window.__acrylicDisposed.materials++))
 return{count:shields.length,width:box.getSize(new T.Vector3()).x,center:box.getCenter(new T.Vector3()).toArray(),opacity:shield.material.opacity,geometries:geos.size,materials:materials.size}
})
async function pose(dir=[.65,.3,1.8]){
 await page.evaluate(dir=>{const r=window.__panelState(),T=window.__fixtureThree,b=new T.Box3();r.scene.updateMatrixWorld(true);r.scene.traverse(n=>{if(n.userData.isComponentRoot)b.expandByObject(n,true)});const c=b.getCenter(new T.Vector3()),s=b.getSize(new T.Vector3()),distance=Math.max(s.x/r.camera.aspect,s.y,s.z)*2.0;r.controls?.dispatchEvent({type:'start'});r.camera.position.copy(c).add(new T.Vector3(...dir).normalize().multiplyScalar(distance));r.camera.lookAt(c);r.controls?.target.copy(c);r.controls?.update();r.invalidate()},dir);await f.frame()
}
try{
 await page.evaluate(async()=>{
  const React=window.__fixtureReact,{default:Sidebar}=await import('/src/components/Sidebar.tsx'),{default:Panel3D}=await import('/src/three/Panel3D.tsx')
  window.__fixtureRoot.render(React.createElement('div',{style:{display:'flex',height:'100%',width:'100%'}},React.createElement(Sidebar,{width:340}),React.createElement('div',{style:{flex:1,minWidth:0}},React.createElement(Panel3D,{frontEdit:true}))))
 })
 for(const type of types){
  const [id]=await f.show(type);await f.store((s,id)=>s.getState().selectComponents([id]),id)
  await page.getByRole('button',{name:'Sem acrílico',exact:true}).waitFor()
  check((await inspect()).count===0,type+': actual CAD route starts without the cover')
  await page.getByRole('button',{name:'Sem acrílico',exact:true}).click()
  await page.waitForFunction(()=>!!window.__panelState()?.scene.getObjectByName('terminal-assembly-acrylic-shield'));await f.frame()
  const on=await inspect();console.log('ACRYLIC',type,JSON.stringify(on));check(on.count===1&&on.opacity>0&&on.opacity<1,type+': actual inspector click adds one visible transparent shield')
  const before=await f.store(s=>s.getState().components[0].terminals.map(t=>t.id))
  const saved=await f.store(s=>s.getState().saveJSON())
  await page.getByRole('button',{name:'Com acrílico',exact:true}).click()
  await page.waitForFunction(()=>!window.__panelState()?.scene.getObjectByName('terminal-assembly-acrylic-shield'));await f.frame()
  const disposed=await page.evaluate(()=>window.__acrylicDisposed)
  check((await inspect()).count===0&&disposed.geometries===on.geometries&&disposed.materials===on.materials,type+': OFF removes and disposes all generated geometry/materials, including edge lines')
  await f.store((s,json)=>{s.getState().newProject();s.getState().loadJSON(json)},saved);await f.frame()
  await page.waitForFunction(()=>!!window.__panelState()?.scene.getObjectByName('terminal-assembly-acrylic-shield'))
  const reopened=await inspect(),ids=await f.store(s=>s.getState().components[0].terminals.map(t=>t.id))
  check(reopened.count===1&&JSON.stringify(ids)===JSON.stringify(before)&&await f.store(s=>s.getState().components[0].state.acrylicCover)===true,type+': project roundtrip restores the cover without changing terminal IDs')
  await f.store((s,id)=>s.getState().selectComponents([id]),id);await pose()
  await page.screenshot({timeout:120000,path:path.join(output,type+'-inspector-acrylic.png')})
  evidence.acrylic.push({type,on,reopened,disposal:disposed})
 }
 await f.reload();const panel=await attachPanel(f)
 for(const type of ['contactorWegCwbc65','levelRelayAvel411','timerGeyaGrt8M1','timerGeyaGrt8B1','meterD522066']){
  const [componentId]=await panel.show(type)
  await page.waitForTimeout(300)
  if(type==='levelRelayAvel411')await page.waitForFunction(()=>!!window.__panelState()?.scene.getObjectByName('industrial_avel_label')?.material.map)
  const stats=await page.evaluate(()=>{
   const r=window.__panelState(),nodes=[];r.scene.traverse(n=>{if(n.isMesh)nodes.push({name:n.name,texture:n.material?.map?.image?{width:n.material.map.image.width,height:n.material.map.image.height}:null})});return nodes.filter(n=>/screw_head_|industrial_avel_label|digital_meter_lcd/.test(n.name))
  })
  if(type==='contactorWegCwbc65'){
   const saved=await panel.store(s=>s.getState().saveJSON())
   const physical=()=>page.evaluate(id=>{
    const r=window.__panelState(),T=window.__fixtureThree;let root;r.scene.traverse(n=>{if(n.userData.isComponentRoot&&n.userData.componentId===id)root=n});r.scene.updateMatrixWorld(true)
    const carrier=root.getObjectByName('imported_carrier'),fixed=[];root.traverse(n=>{if(n.isMesh&&/^cad_/.test(n.name)&&!['cad_38_','cad_39_'].includes(n.name))fixed.push([n.name,n.getWorldPosition(new T.Vector3()).toArray()])})
    return{carrier:carrier.getWorldPosition(new T.Vector3()).toArray(),fixed}
   },componentId)
   const before=await physical()
   const output=await panel.store((s,id)=>{
    const c=s.getState().components.find(c=>c.id===id),sourceId=s.getState().addComponent('powerSource3ph',1000,0),source=s.getState().components.find(c=>c.id===sourceId),term=(c,label)=>c.terminals.find(t=>t.label===label).id
    s.getState().addWire(term(source,'L1'),term(c,'A1'),'black');s.getState().addWire(term(source,'N'),term(c,'A2'),'blue');s.getState().addWire(term(source,'L1'),term(c,'1L1'),'black');s.getState().step();return term(c,'2T1')
   },componentId)
   await page.waitForFunction(()=>{const n=window.__panelState()?.scene.getObjectByName('imported_carrier'),pose=n?.userData.cwbcCarrier,T=window.__fixtureThree;return!!pose&&n.position.distanceTo(new T.Vector3(...pose.rest).add(new T.Vector3(...pose.travel)))<1e-6},undefined,{timeout:90000})
   const on=await physical(),delta=on.carrier.map((n,i)=>(n-before.carrier[i])*100)
   check(Math.hypot(delta[0],delta[1],delta[2]+2.8)<.03&&JSON.stringify(on.fixed)===JSON.stringify(before.fixed)&&await panel.store((s,id)=>s.getState().runtime.energizedTerminals.has(id),output),'Native CWBC65: actual supply wires energize its coil/output and move only cad38/39 inward 2.8 mm in physical Z')
   await panel.store(s=>s.getState().stop())
   await page.waitForFunction(()=>{const n=window.__panelState()?.scene.getObjectByName('imported_carrier'),pose=n?.userData.cwbcCarrier,T=window.__fixtureThree;return!!pose&&n.position.distanceTo(new T.Vector3(...pose.rest))<1e-9},undefined,{timeout:90000})
   const stopped=await physical()
   if(!stopped.carrier.every((n,i)=>Math.abs(n-before.carrier[i])<1e-7))console.log('NATIVE STOP DIAGNOSTIC',JSON.stringify({before,stopped,delta:stopped.carrier.map((n,i)=>n-before.carrier[i])}))
   check(stopped.carrier.every((n,i)=>Math.abs(n-before.carrier[i])<1e-7)&&JSON.stringify(stopped.fixed)===JSON.stringify(before.fixed),'Native CWBC65: real STOP restores the carrier, without tilting the housing or either resistor bank')
   await panel.store((s,json)=>s.getState().loadJSON(json),saved);await panel.frame()
  }
  if(type==='levelRelayAvel411')check(stats.some(n=>n.name==='industrial_avel_label'&&n.texture?.width===1408&&n.texture?.height===3200),'AVEL: actual canvas uses the rebuilt high-resolution fascia')
  if(type.startsWith('timerGeya'))check(stats.filter(n=>n.name.startsWith('terminal_screw_head_geya_')).length===6,type+': actual canvas displays six recessed cross screws')
  if(type==='meterD522066')check(stats.filter(n=>n.name.startsWith('terminal_screw_head_d52_')).length===2&&stats.some(n=>n.name==='digital_meter_lcd'),'D52: actual canvas has the improved hardware and the original live LCD')
  for(const [name,dir]of [['front',[0,0,1]],['oblique',[.7,.35,1.8]]]){await pose(dir);await page.screenshot({timeout:120000,path:path.join(output,type+'-'+name+'.png')})}
  evidence.devices.push({type,stats})
 }
 // Real inspector insertion/mount UI. Keep the rendered comb/feeder together.
 await page.evaluate(async()=>{
  const {useSimStore}=await window.__fixtureImport('/src/store/useSimStore.ts');useSimStore.getState().newProject();useSimStore.setState({demoMode:false,components:[],wires:[]})
  const s=()=>useSimStore.getState(),br=s().addComponent('breaker3p',300,300),comb=s().addComponent('busbarComb',300,200),feeder=s().addComponent('combBusbarConnector',300,200)
  s().updateCombBusbar(comb,{poleCount:3,combMode:'3P',teethDirection:'down'});s().mountCombBusbar(comb,br);s().mountCombConnector(feeder,br,'3')
  window.__combIds={br,comb,feeder}
 })
 await page.waitForFunction(()=>!!window.__panelState()?.scene.getObjectByName('comb-busbar-connector'));await f.frame()
 const separation=await page.evaluate(async()=>{
  const T=window.__fixtureThree,r=window.__panelState();r.scene.updateMatrixWorld(true)
  const {useSimStore}=await window.__fixtureImport('/src/store/useSimStore.ts'),{combPhysicalTipWorld3D,breakerMountMouthWorld3D,combMountBridges}=await import('/src/three/combMount.ts')
  const components=useSimStore.getState().components,{br,comb,feeder}=window.__combIds,find=id=>components.find(c=>c.id===id),root=id=>{let result;r.scene.traverse(n=>{if(n.userData.isComponentRoot&&n.userData.componentId===id)result=n});return result}
  const tip=combPhysicalTipWorld3D(find(feeder),'PINO',new T.Vector3()).applyMatrix4(root(feeder).matrixWorld)
  const mouth=breakerMountMouthWorld3D(find(br),'3','feed',new T.Vector3()).applyMatrix4(root(br).matrixWorld)
  return{tip:tip.toArray(),mouth:mouth.toArray(),dx:Math.abs(tip.x-mouth.x),dz:Math.abs(tip.z-mouth.z),insert:mouth.y-tip.y,bridges:combMountBridges(components).length}
 })
 check(separation.dx<.0034&&separation.dz<.00001&&Math.abs(separation.insert-.1)<.0034,'Actual canvas feeder metal, not just its terminal marker, aligns with the front cable lane')
 await pose([1,.8,1.8]);await page.screenshot({timeout:120000,path:path.join(output,'comb-front-cable-entry.png')})
 await pose([1,0,.35]);await page.screenshot({timeout:120000,path:path.join(output,'comb-entry-side.png')})
 evidence.comb=separation
 // The same authored assets must remain editable through the real Admin.
 await f.reload();const admin=await attachAdmin(f)
 for(const type of ['contactorWegCwbc65','levelRelayAvel411','timerGeyaGrt8M1','timerGeyaGrt8B1','meterD522066',...types]){
  const result=await admin.open(type);check(result.terminals.length>0,type+': actual Admin loads the same component with its electrical interfaces')
  await page.screenshot({timeout:120000,path:path.join(output,type+'-admin.png')})
 }
 f.stable();await writeFile(path.join(output,'results.json'),JSON.stringify({...evidence,checks:f.count()},null,2))
 console.log(f.count()+' browser acceptance checks passed')
} catch(error){await page.screenshot({timeout:20000,path:path.join(output,'failure.png')}).catch(()=>{});await writeFile(path.join(output,'failure.txt'),String(error.stack||error));throw error}
finally{await f.browser.close()}
