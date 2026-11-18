import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { adminFixture } from './lib/admin-fixture.mjs'
import { attachPanel } from './lib/panel-fixture.mjs'
const output=process.env.METERS_ADMIN_UI_OUTPUT||path.resolve('runtime/meters-schneider-admin'),f=await adminFixture({baseURL:process.env.INDUSTRIAL_TEST_URL,output}),{page,check,editor,frame,open,point,click,reopen,publish}=f
const types=['meterD522066','meterKws306','currentTransformerSplitCore','breakerSchneiderIc60h1p','pilotLightSchneiderIil1p','pilotLightSchneiderIil3p','residualBreakerSchneiderIid4p','residualBreakerSchneiderIdpnVigi'],published=[]
try{
 for(const type of types){
  const draft=await open(type)
  check(draft.usedModel||draft.usedComposite,type+': full Admin imports real shared CAD/procedural geometry')
  check(draft.terminals.length>0&&new Set(draft.terminals.map(t=>t.id)).size===draft.terminals.length,type+': distinct editable electrical terminals')
  const expected=['meterD522066','breakerSchneiderIc60h1p'].includes(type)?1:type==='meterKws306'?4:type.startsWith('residualBreaker')?2:0
  check(draft.controls.length===expected,type+': only real physical controls, no invented switches')
  {
   const alignment=await page.evaluate(async type=>{
    const {useEditorStore}=await window.__fixtureImport('/src/admin/editor3d/editorStore.ts'),{createComponent}=await window.__fixtureImport('/src/electrical/factory.ts'),{terminalLocal3D}=await window.__fixtureImport('/src/three/terminal3D.ts'),{getComponentPhysicalSizeMm}=await window.__fixtureImport('/src/three/modelPaths.ts'),T=window.__fixtureThree,r=window.__adminState(),c=createComponent(type),height=getComponentPhysicalSizeMm(type).height;r.scene.updateMatrixWorld(true)
    return useEditorStore.getState().def.terminals.map(t=>{const mouth=r.scene.getObjectByName((type.includes('Schneider')?'acti9_connection_':'digital_meter_connection_')+T.PropertyBinding.sanitizeNodeName(t.label)),at=mouth?.getWorldPosition(new T.Vector3()).addScaledVector(new T.Vector3(...t.normal),-(t.socketInsetMm??0)),expected=terminalLocal3D(c,c.terminals.find(s=>s.label===t.label)).multiplyScalar(100).add(new T.Vector3(0,height/2,0));return{label:t.label,endpointError:expected.distanceTo(new T.Vector3(...t.position)),mouthError:at?at.distanceTo(new T.Vector3(...t.position)):type.includes('Schneider')?Infinity:0}})
   },type);check(alignment.every(t=>t.endpointError<.03&&t.mouthError<.03),type+': actual Admin mouths and simulator endpoints align in preserved physical frame '+JSON.stringify(alignment))
  }
  check(await page.evaluate(()=>{let n=0;window.__adminState().scene.traverse(o=>{if(o.userData.controlId)n++});return n===0}),type+': no automatic invisible actuator proxy')
  await page.getByRole('tab',{name:'Simular',exact:true}).first().click()
  if(type==='meterD522066'){
   await editor(s=>s.getState().set({previewVars:{...s.getState().previewVars,on:true,energy:4.2}}));await frame();await click('digital_meter_reset');check(await editor(s=>s.getState().previewVars.energy)===4.2,'Admin D52: short RESET leaves energy unchanged')
   let p=await point('digital_meter_reset');await page.mouse.move(p.x,p.y);await page.mouse.down();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.up();check(await editor(s=>s.getState().previewVars.energy)===4.2,'Admin D52: cancelled hold does not reset')
   await page.clock.install();p=await point('digital_meter_reset');await page.mouse.move(p.x,p.y);await page.mouse.down();await page.clock.fastForward(5001);await page.mouse.up();check(await editor(s=>s.getState().previewVars.energy)===0,'Admin D52: actual five-second hold resets');await page.clock.resume()
  }else if(type==='meterKws306'){
   await click('digital_meter_menu');check(await editor(s=>s.getState().previewVars.screenMode)===1,'Admin KWS: actual M button changes screen mode');await click('digital_meter_menu_2');check(await editor(s=>s.getState().previewVars.screenMode)===0,'Admin KWS: minus button runs the reverse cycle')
  }else if(type==='breakerSchneiderIc60h1p'){
   const value=await editor(s=>s.getState().previewVars.closed);await click('acti9_handle_pivot');check(await editor(s=>s.getState().previewVars.closed)!==value,'Admin iC60H: actual rocker toggles shared variable')
  }else if(type.startsWith('residualBreaker')){
   const p=await point('schneider_test');await page.mouse.move(p.x,p.y);await page.mouse.down();check(await editor(s=>s.getState().previewVars.testPressed&&s.getState().previewVars.tripped),'Admin '+type+': physical T hold trips');await page.mouse.move(8,8);await page.mouse.up();check(await editor(s=>!s.getState().previewVars.testPressed&&s.getState().previewVars.tripped),'Admin '+type+': outside release preserves trip but returns spring')
  }else if(type.startsWith('pilotLight')){
   await editor(s=>s.getState().set({previewVars:{...s.getState().previewVars,on:true,l1On:true,l2On:false,l3On:true}}));await frame();check(await page.evaluate(()=>window.__adminState().scene.getObjectByName('acti9_lens_1').material.emissiveIntensity>0),'Admin '+type+': physical lens follows live preview')
  }
  await page.screenshot({path:path.join(output,type+'.png')})
  await page.getByRole('tab',{name:'Editar',exact:true}).first().click()
  await editor(s=>s.getState().edit(def=>({...def,controls:def.controls.map((c,i)=>i?c:{...c,name:c.name+' · authored'})})))
  const before=await editor(s=>({controls:s.getState().def.controls.map(c=>[c.id,c.name]),terminals:s.getState().def.terminals.map(t=>[t.id,t.label])}));await reopen(draft.id)
  const after=await editor(s=>({controls:s.getState().def.controls.map(c=>[c.id,c.name]),terminals:s.getState().def.terminals.map(t=>[t.id,t.label])}));check(JSON.stringify(after)===JSON.stringify(before),type+': save/reopen preserves authored controls and exact terminal IDs')
  const result=await publish();check(result.version.definition.terminals.length===draft.terminals.length&&result.version.runtime.widthMm>0,type+': actual Admin bake/publication stores usable version');published.push({type,id:result.id,version:result.version.version})
  f.stable()
 }
 // Full page reload clears module/global caches; catalogue is loaded afresh from
 // the real local account backend, not registered from a fabricated test row.
 await f.reload();await page.evaluate(async()=>{const {useCatalogStore}=await window.__fixtureImport('/src/catalog/registry.ts');await useCatalogStore.getState().load()})
 const panel=await attachPanel(f)
 for(const entry of published){
  const type=`cat:${entry.id}:v${entry.version}`;await panel.show(type,2)
  const tested=await page.evaluate(async({type,origin})=>{
   const {useSimStore}=await window.__fixtureImport('/src/store/useSimStore.ts'),{createComponent}=await window.__fixtureImport('/src/electrical/factory.ts'),s=useSimStore.getState(),[first,second]=s.components,ac=createComponent('powerSource1ph','AC','',9,-800,600),motor=createComponent('motor1ph','M','',10,-600,600)
   const term=(c,label)=>{const t=c.terminals.find(t=>t.label===label);if(!t)throw new Error(origin+': missing '+label);return t.id},wires=[]
   const wire=(a,al,b,bl)=>wires.push({id:'fresh-'+wires.length,fromTerminalId:term(a,al),toTerminalId:term(b,bl),color:'black',kind:'power',waypoints:[],routeMode:'manual',gauge:1.5,style:'solid',path3D:[],lengthMm:100,energized:false})
   if(origin==='meterD522066'){wire(ac,'L',first,'1');wire(ac,'N',first,'2');wire(ac,'L',first,'CT-IN');wire(first,'CT-OUT',motor,'U1');wire(ac,'N',motor,'U2')}
   if(origin==='meterKws306'){wire(ac,'L',first,'L1-IN');wire(ac,'N',first,'N-IN');wire(first,'L1-OUT',motor,'U1');wire(ac,'N',motor,'U2')}
   if(origin==='currentTransformerSplitCore'){wire(ac,'L',first,'P1');wire(first,'P2',motor,'U1');wire(ac,'N',motor,'U2')}
   if(origin.startsWith('pilotLight')){wire(ac,'L',first,origin.endsWith('3p')?'L1':'X1');wire(ac,'N',first,origin.endsWith('3p')?'N':'X2')}
   if(origin==='breakerSchneiderIc60h1p'||origin.startsWith('residualBreaker')){wire(ac,'L',first,'1');wire(first,'2',motor,'U1');wire(ac,'N',motor,'U2')}
   useSimStore.setState({components:[first,second,ac,motor],wires});useSimStore.getState().step()
   const live=useSimStore.getState(),a=live.components[0],b=live.components[1]
   const {internalBridges}=await window.__fixtureImport('/src/electrical/engine.ts'),before=JSON.stringify([live.components.map(c=>[c.type,c.terminals.map(t=>t.id)]),live.wires.map(w=>[w.id,w.fromTerminalId,w.toTerminalId])]),saved=live.saveJSON()
   const result={first:{...a.state},second:{...b.state},unchanged:a.type===type&&b.type===type,bridges:internalBridges(a).length,secondary:origin==='currentTransformerSplitCore'?live.runtime.energizedTerminals.has(term(a,'S1')):false}
   live.newProject();useSimStore.getState().loadJSON(saved)
   const restored=useSimStore.getState();result.roundtrip=before===JSON.stringify([restored.components.map(c=>[c.type,c.terminals.map(t=>t.id)]),restored.wires.map(w=>[w.id,w.fromTerminalId,w.toTerminalId])])
   // loadJSON returns to STOP; one genuine STEP drives the mounted fresh model.
   restored.step();return result
  },{type,origin:entry.type})
  check(tested.unchanged,entry.type+': freshly reloaded published instance retains immutable catalog type')
  check(tested.roundtrip,entry.type+': project save/load keeps every catalog type, terminal ID and connected wire endpoint')
  if(entry.type==='meterD522066')check(tested.first.on&&tested.first.current>0&&!tested.second.on,entry.type+': published metering follows real series wiring with independent second instance')
  else if(entry.type==='meterKws306')check(tested.first.on&&tested.first.iA>0&&!tested.second.on,entry.type+': published phase current is wired, not a demo value')
  else if(entry.type==='currentTransformerSplitCore')check(tested.first.primaryCurrentA>0&&!tested.secondary,entry.type+': published CT retains isolated primary/secondary semantics')
  else if(entry.type.startsWith('pilotLight'))check(tested.first.on&&!tested.second.on,entry.type+': published lamp follows actual voltage, not catalog-only preview variables')
  else check(tested.bridges>0,entry.type+': published protective poles conduct using retained source semantics')
  await panel.frame()
  if(entry.type==='meterD522066'||entry.type==='meterKws306'){
   const pixels=await page.evaluate(async()=>{
    const {useSimStore}=await window.__fixtureImport('/src/store/useSimStore.ts'),ids=useSimStore.getState().components.slice(0,2).map(c=>c.id),r=window.__panelState()
    return ids.map(id=>{let root;r.scene.traverse(o=>{if(o.userData.isComponentRoot&&o.userData.componentId===id)root=o});const canvas=root?.getObjectByName('digital_meter_lcd')?.material?.map?.image;if(!canvas?.getContext)return-1;const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let lit=0;for(let i=0;i<data.length;i+=4)if(Math.max(data[i],data[i+1],data[i+2])>60)lit++;return lit})
   });check(pixels[0]>100&&pixels[1]===0,entry.type+': actual freshly published LCD texture shows wired readings while independent disconnected instance stays blank '+JSON.stringify(pixels))
  }
  f.stable()
 }
 await writeFile(path.join(output,'results.json'),JSON.stringify({assertions:f.count(),exceptions:f.errors,published,scope:'Actual ComponentEditor3D/save/reopen/publish/bake, full page reload, fresh IndexedDB catalogue fetch and actual Panel3D instances. No live cloud writes.'},null,2));console.log(`\nPASS — ${f.count()} actual meter/Schneider Admin and fresh-catalog assertions`)
}catch(e){console.error(f.errors);await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});throw e}finally{await f.browser.close()}
