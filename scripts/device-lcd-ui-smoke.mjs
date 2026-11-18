import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { panelFixture, attachPanel } from './lib/panel-fixture.mjs'
import { attachAdmin } from './lib/admin-fixture.mjs'

const output=process.env.DEVICE_LCD_OUTPUT||path.resolve('runtime/device-lcd')
const f=await panelFixture({baseURL:process.env.INDUSTRIAL_TEST_URL,output}),{page,check}=f
const samples={
 meterD522066:{on:true,power:256.3,energy:.22,voltage:223.8,current:1.14,frequency:50,powerFactor:1},
 meterKws306:{on:true,switchOn:true,screenMode:0,vA:211,vB:210.4,vC:210.4,iA:7.892,iB:0,iC:0,pA:1.665,pB:0,pC:0,energy:.140,frequency:50,temp:15},
 vfdSchneiderAtv320:{powered:true,menu:'ref',editing:false,deviceFault:false,presetHz:50,frequencyHz:12.3},
}
const types=Object.keys(samples),native={},adminImages={},published=[]
async function installInspector(){
 await page.evaluate(()=>{
  const original=CanvasRenderingContext2D.prototype.fillText,writes=new WeakMap()
  CanvasRenderingContext2D.prototype.fillText=function(text,...args){let a=writes.get(this.canvas);if(!a){a=[];writes.set(this.canvas,a)}a.push(String(text));if(a.length>100)a.shift();return original.call(this,text,...args)}
  window.__lcdInspect=async({mode,type,index=0})=>{
   const r=mode==='admin'?window.__adminState():window.__panelState(),T=window.__fixtureThree
   let root=r.scene
   if(mode!=='admin'){
    const {useSimStore}=await window.__fixtureImport('/src/store/useSimStore.ts'),id=useSimStore.getState().components[index].id
    r.scene.traverse(o=>{if(o.userData.isComponentRoot&&o.userData.componentId===id)root=o})
   }
   const candidates=[]
   root.traverse(o=>{if((o.name==='digital_meter_lcd'||o.name==='industrial_lcd'||o.name.startsWith('display:'))&&o.visible&&o.material?.map?.image?.getContext)candidates.push(o)})
   if(candidates.length!==1){
    const nodes=[];root.traverse(o=>{if(/lcd|display|reset/.test(o.name))nodes.push({name:o.name,visible:o.visible,image:o.material?.map?.image?.constructor?.name})})
    throw new Error('Expected one actual visible LCD canvas: '+JSON.stringify({candidates:candidates.map(o=>o.name),nodes,registryModules:performance.getEntriesByType('resource').map(r=>r.name).filter(n=>n.includes('/catalog/registry.ts'))}))
   }
   const mesh=candidates[0],canvas=mesh.material.map.image,ctx=canvas.getContext('2d'),pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data
   let lit=0;for(let i=0;i<pixels.length;i+=4)if(Math.max(pixels[i],pixels[i+1],pixels[i+2])>65)lit++
   // Independent, normalized field windows and colour oracle derived from the
   // supplied device photographs. Not a call to the implementation's layout.
   const windows=type==='meterD522066'?[
    ['power',[.03,.025,.8,.19],'yellow'],['energy',[.03,.27,.8,.19],'orange'],
    ['voltage',[.02,.58,.45,.14],'cyan'],['frequency',[.56,.58,.32,.14],'white'],
    ['current',[.02,.81,.45,.14],'red'],['pf',[.56,.81,.32,.14],'blue'],
   ]:type==='meterKws306'?[
    ...[0,1,2].flatMap(i=>[['voltage-'+i,[.065,.11+i*.199,.29,.16],'blue'],['current-'+i,[.375,.11+i*.199,.29,.16],'red'],['power-'+i,[.69,.11+i*.199,.29,.16],'yellow']]),
    ['total',[.015,.85,.48,.12],'cyan'],['frequency',[.59,.85,.13,.12],'white'],['temperature',[.79,.85,.15,.12],'white'],
   ]:[['four-digit-local-terminal',[.05,.12,.9,.77],'red']]
   const color=(r,g,b,c)=>c==='yellow'?r>150&&g>150&&b<110:c==='orange'?r>160&&g>60&&g<170&&b<110:c==='red'?r>160&&g<110&&b<110:c==='cyan'?r<100&&g>145&&b>145:c==='blue'?r<120&&b>160&&g<180:r>170&&g>170&&b>170
   const fields=windows.map(([name,rect,colour])=>{const [x,y,w,h]=rect.map((n,i)=>Math.floor(n*(i%2?canvas.height:canvas.width)));let n=0;for(let py=y;py<Math.min(y+h,canvas.height);py++)for(let px=x;px<Math.min(x+w,canvas.width);px++){const i=(py*canvas.width+px)*4;if(color(pixels[i],pixels[i+1],pixels[i+2],colour))n++}return{name,ink:n/(w*h)}})
   // Coarse RGB occupancy is stable across native/authoring texture densities,
   // unlike comparing resampled antialiasing bytes as if they were geometry.
   const grid=[]
   for(let gy=0;gy<16;gy++)for(let gx=0;gx<32;gx++){
    let n=0,rs=0,gs=0,bs=0
    for(let y=Math.floor(gy*canvas.height/16);y<Math.floor((gy+1)*canvas.height/16);y++)for(let x=Math.floor(gx*canvas.width/32);x<Math.floor((gx+1)*canvas.width/32);x++){
     const i=(y*canvas.width+x)*4;if(Math.max(pixels[i],pixels[i+1],pixels[i+2])>65){n++;rs+=pixels[i];gs+=pixels[i+1];bs+=pixels[i+2]}
    }
    const area=(Math.floor((gx+1)*canvas.width/32)-Math.floor(gx*canvas.width/32))*(Math.floor((gy+1)*canvas.height/16)-Math.floor(gy*canvas.height/16))
    grid.push([rs,gs,bs].map(v=>v/(Math.max(1,area)*255)))
   }
   const box=new T.Box3().setFromObject(mesh,true),size=box.getSize(new T.Vector3())
   return{data:canvas.toDataURL(),texture:mesh.material.map.uuid,version:mesh.material.map.version,lit,fields,grid,w:canvas.width,h:canvas.height,aspect:size.x/size.y,textWrites:writes.get(canvas)||[],name:mesh.name}
  }
 })
}
const inspect=(mode,type,index=0)=>page.evaluate(a=>window.__lcdInspect(a),{mode,type,index})
const saveCanvas=async(name,image)=>writeFile(path.join(output,name+'.png'),Buffer.from(image.data.split(',')[1],'base64'))
const parity=(a,b)=>a.grid.reduce((sum,row,i)=>sum+row.reduce((s,n,j)=>s+Math.abs(n-b.grid[i][j]),0),0)/(a.grid.length*3)
const optical=(image,type,label)=>{
 check(image.fields.every(field=>field.ink>.006),label+': every photographed numeric field has the correct colour/location '+JSON.stringify(image.fields))
 check(!image.textWrites.some(text=>/^-?\d+(?:\.\d+)?$/.test(text)),label+': actual numerals are seven-segment geometry, never a browser font')
 if(type==='meterKws306')check(image.aspect>1.43&&image.aspect<1.53,label+': LCD aperture has the real landscape proportions, not the whole square fascia')
}
try{
 await installInspector()
 for(const type of types){
  await f.show(type,2)
  const dark=await inspect('panel',type);check(dark.lit===0,type+': a new unpowered actual Panel3D instance has a blank LCD')
  await f.store((s,arg)=>s.setState({components:s.getState().components.map((c,i)=>({...c,state:{...c.state,...(i===0?arg:{on:false,powered:false})}}))}),samples[type]);await f.frame()
  const first=await inspect('panel',type),second=await inspect('panel',type,1)
  optical(first,type,'native '+type)
  check(first.texture!==second.texture&&first.lit>100&&second.lit===0,type+': separate physical instances own independent live/blank textures')
  const repeated=await inspect('panel',type);check(repeated.texture===first.texture&&repeated.version===first.version,type+': unchanged visible values reuse the same texture')
  native[type]=first;await saveCanvas(type+'-native-lcd',first);await page.screenshot({path:path.join(output,type+'-native-panel.png')})
 }
 await f.show('meterKws306');
 for(const mode of [0,1,2]){
  await f.store((s,arg)=>s.setState({components:s.getState().components.map(c=>({...c,state:{...c.state,...arg}}))}),{...samples.meterKws306,screenMode:mode});await f.frame()
  const image=await inspect('panel','meterKws306');optical(image,'meterKws306','KWS presentation '+mode);await saveCanvas('kws-view-'+mode,image)
  check(!image.textWrites.some(t=>['ENERGY','TOTAL','PHASE POWER','ON','KWS-306'].includes(t)),'KWS '+mode+': no invented full-screen presentation or ON banner')
 }
 await f.store((s,arg)=>s.setState({components:s.getState().components.map(c=>({...c,state:{...c.state,...arg}}))}),{...samples.meterKws306,switchOn:false});await f.frame();await saveCanvas('kws-output-off',await inspect('panel','meterKws306'))
 console.log('NATIVE LCD SCENARIOS COMPLETE; validating real Admin persistence/publication next.')
 const admin=await attachAdmin(f)
 for(const type of types){
  const draft=await admin.open(type)
  await page.getByRole('tab',{name:'Simular',exact:true}).first().click()
  const dark=await inspect('admin',type);check(dark.lit===0,type+': actual new Admin draft starts unpowered, with no baked demo digits')
  await admin.editor((s,arg)=>s.getState().set({previewVars:{...s.getState().previewVars,...arg}}),samples[type]);await admin.frame()
  const image=await inspect('admin',type);optical(image,type,'Admin '+type)
  const difference=parity(image,native[type]);check(difference<.018,type+': native and Admin actual LCD masks match across texture density '+difference)
  adminImages[type]=image;await saveCanvas(type+'-admin-lcd',image);await page.screenshot({path:path.join(output,type+'-admin.png')})
  if(type==='vfdSchneiderAtv320')check(await admin.editor(s=>s.getState().def.displays[0].deviceFace)==='atv320','ATV Admin stores an explicit four-digit physical display profile')
  await page.getByRole('tab',{name:'Editar',exact:true}).first().click()
  if(type==='vfdSchneiderAtv320'){
   const selectDisplay=()=>admin.editor(s=>s.getState().set({selection:{kind:'display',id:s.getState().def.displays[0].id},tab:'displays'}))
   const faceChoice=page.locator('label.ce-field').filter({hasText:'Apresentação'}).locator('button.dcx-select')
   const geometryBefore=await admin.editor(s=>{const d=s.getState().def.displays[0];return JSON.stringify([d.id,d.position,d.normal,d.roll,d.widthMm,d.heightMm,d.hideNodesPart,d.hideNodes])})
   await selectDisplay();await faceChoice.click();await page.getByRole('option',{name:'Texto personalizado',exact:true}).click()
   check(await admin.editor(s=>s.getState().def.displays[0].deviceFace)==='custom','ATV actual Admin presentation choice explicitly opts out of the physical renderer')
   await page.locator('.ce-display-line summary').first().click()
   await page.locator('.ce-display-line .ce-action-head input').first().fill('AUTOR {presetHz}')
   // Save while the UI is dirty, before time spent inspecting live pixels lets
   // the real five-second autosave correctly disable the manual Save button.
   const authoredDisplay=await admin.editor(s=>JSON.stringify(s.getState().def.displays))
   await admin.reopen(draft.id)
   check(await admin.editor(s=>JSON.stringify(s.getState().def.displays))===authoredDisplay,'ATV explicit custom choice and authored text survive actual save/reopen unchanged')
   await page.getByRole('tab',{name:'Simular',exact:true}).first().click()
   await admin.editor((s,arg)=>s.getState().set({previewVars:arg}),samples[type]);await admin.frame()
   const customImage=await inspect('admin',type)
   check(customImage.textWrites.includes('AUTOR 50'),'ATV actual custom LCD renders the authored line and live variable without a factory override')
   await saveCanvas('atv-authored-custom-lcd',customImage)
   await page.getByRole('tab',{name:'Editar',exact:true}).first().click()
   await selectDisplay();await faceChoice.click();await page.getByRole('option',{name:'ATV320 · visor físico',exact:true}).click()
   check(await admin.editor(s=>{const d=s.getState().def.displays[0];return d.deviceFace==='atv320'&&d.lines[0].text==='AUTOR {presetHz}'})&&await admin.editor(s=>{const d=s.getState().def.displays[0];return JSON.stringify([d.id,d.position,d.normal,d.roll,d.widthMm,d.heightMm,d.hideNodesPart,d.hideNodes])})===geometryBefore,'ATV choosing the physical face again preserves authored text, display ID and exact geometry')
   await page.getByRole('tab',{name:'Simular',exact:true}).first().click()
   await admin.editor((s,arg)=>s.getState().set({previewVars:arg}),samples[type]);await admin.frame()
   check(parity(await inspect('admin',type),image)<.018,'ATV switching presentation back restores the same actual physical seven-segment pixels')
   await page.getByRole('tab',{name:'Editar',exact:true}).first().click()
  }
  await admin.editor(s=>s.getState().edit(def=>({...def,controls:def.controls.map((c,i)=>i?c:{...c,name:c.name+' · LCD authored'})})))
  const before=await admin.editor(s=>JSON.stringify({controls:s.getState().def.controls,displays:s.getState().def.displays,terminals:s.getState().def.terminals}))
  await admin.reopen(draft.id)
  check(await admin.editor(s=>JSON.stringify({controls:s.getState().def.controls,displays:s.getState().def.displays,terminals:s.getState().def.terminals}))===before,type+': actual save/reopen retains authored controls, display profile/coordinates and exact terminal IDs')
  const result=await admin.publish();check(result.version.runtime.widthMm>0&&result.version.definition.terminals.length===draft.terminals.length,type+': actual bake/publication persists the full component without losing terminals')
  published.push({source:type,id:result.id,version:result.version.version})
  f.stable()
 }
 // Mount first so __fixtureImport resolves the very registry module used by
 // Panel3D (including Vite's HMR suffix), not an unused second store instance.
 await f.reload();const panel=await attachPanel(f)
 await page.evaluate(async()=>{const {useCatalogStore}=await window.__fixtureImport('/src/catalog/registry.ts');await useCatalogStore.getState().load()})
 await installInspector()
 for(const entry of published){
  const type='cat:'+entry.id+':v'+entry.version,source=entry.source
  await panel.show(type,2)
  await panel.store((s,arg)=>s.setState({components:s.getState().components.map((c,i)=>({...c,state:{...c.state,...(i===0?arg:{on:false,powered:false})}}))}),samples[source]);await panel.frame()
  const first=await inspect('panel',source),second=await inspect('panel',source,1)
  optical(first,source,'freshly published '+source)
  check(first.texture!==second.texture&&first.lit>100&&second.lit===0,source+': fresh catalogue load has independently owned live/blank LCDs')
  const difference=parity(first,adminImages[source]);check(difference<.018,source+': actual published LCD matches the saved Admin physical face '+difference)
  await saveCanvas(source+'-published-lcd',first);await page.screenshot({path:path.join(output,source+'-published-panel.png')})
  const electrical=await page.evaluate(async({type,source})=>{
   const {useSimStore}=await window.__fixtureImport('/src/store/useSimStore.ts'),{createComponent}=await window.__fixtureImport('/src/electrical/factory.ts'),[a,b]=useSimStore.getState().components
   const ac=createComponent('powerSource1ph','AC','wired LCD acceptance',9,-800,600),motor=createComponent('motor1ph','M','real series branch',10,-600,600),wires=[]
   const id=(c,label)=>{const t=c.terminals.find(t=>t.label===label);if(!t)throw new Error('Missing real terminal '+label);return t.id}
   const wire=(from,fl,to,tl)=>wires.push({id:'lcd-wired-'+wires.length,fromTerminalId:id(from,fl),toTerminalId:id(to,tl),color:'black',kind:'power',waypoints:[],routeMode:'manual',gauge:1.5,style:'solid',path3D:[],lengthMm:100,energized:false})
   if(source==='meterD522066'){wire(ac,'L',a,'1');wire(ac,'N',a,'2');wire(ac,'L',a,'CT-IN');wire(a,'CT-OUT',motor,'U1');wire(ac,'N',motor,'U2')}
   if(source==='meterKws306'){wire(ac,'L',a,'L1-IN');wire(ac,'N',a,'N-IN');wire(a,'L1-OUT',motor,'U1');wire(ac,'N',motor,'U2')}
   if(source==='vfdSchneiderAtv320'){wire(ac,'L',a,'R/L1');wire(ac,'N',a,'S/L2')}
   useSimStore.getState().stop();useSimStore.setState({components:[a,b,ac,motor],wires});useSimStore.getState().step()
   const s=useSimStore.getState(),signature=JSON.stringify([s.components.map(c=>[c.type,c.terminals.map(t=>t.id)]),s.wires.map(w=>[w.id,w.fromTerminalId,w.toTerminalId])]),json=s.saveJSON()
   const result={first:{...s.components[0].state},second:{...s.components[1].state},typeIntact:s.components[0].type===type&&s.components[1].type===type}
   s.newProject();useSimStore.getState().loadJSON(json);const restored=useSimStore.getState()
   result.roundtrip=signature===JSON.stringify([restored.components.map(c=>[c.type,c.terminals.map(t=>t.id)]),restored.wires.map(w=>[w.id,w.fromTerminalId,w.toTerminalId])]);restored.step();return result
  },{type,source});await panel.frame()
  check(electrical.typeIntact&&electrical.roundtrip,source+': actual project roundtrip retains catalogue types, every terminal ID and connected wire')
  check(source==='vfdSchneiderAtv320'?electrical.first.powered&&!electrical.second.powered:electrical.first.on&&!electrical.second.on,source+': genuine source wiring/STEP powers only the connected instance')
  if(source!=='vfdSchneiderAtv320')check((source==='meterD522066'?electrical.first.current:electrical.first.iA)>0,source+': LCD current comes from a real series load, not the optical reference fixture')
  const wired=await inspect('panel',source),unwired=await inspect('panel',source,1)
  check(wired.lit>100&&unwired.lit===0,source+': genuine wired publication updates actual LCD pixels; unconnected instance remains blank')
  await saveCanvas(source+'-published-wired-lcd',wired)
  await panel.store(s=>s.getState().stop());await panel.frame()
  check((await inspect('panel',source)).lit===0&&(await inspect('panel',source,1)).lit===0,source+': actual STOP blanks both displays without leaving baked digits')
  f.stable()
 }
 await writeFile(path.join(output,'results.json'),JSON.stringify({assertions:f.count(),exceptions:f.errors,published,scope:'Actual mounted Panel3D and ComponentEditor3D; supplied-photo optical fixtures, physical pixel windows, native/Admin/published parity, real local save/reopen/bake/publication, full reload, wired STEP and STOP. No live cloud or firmware certification.'},null,2))
 console.log(`\nPASS — ${f.count()} real device LCD / Admin / published-catalogue assertions`)
}catch(error){console.error(f.errors);await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});throw error}finally{await f.browser.close()}
