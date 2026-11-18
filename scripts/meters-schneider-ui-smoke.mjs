import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { panelFixture } from './lib/panel-fixture.mjs'
const output=process.env.METERS_TEST_OUTPUT||path.resolve('runtime/meters-schneider-panel'),f=await panelFixture({baseURL:process.env.INDUSTRIAL_TEST_URL,output}),{page,check,store,show,click,point,frame}=f
const state=()=>store(s=>s.getState().components[0].state)
try{
 for(const type of ['meterD522066','meterKws306','currentTransformerSplitCore','breakerSchneiderIc60h1p','pilotLightSchneiderIil1p','pilotLightSchneiderIil3p','residualBreakerSchneiderIid4p','residualBreakerSchneiderIdpnVigi']){
  await show(type)
  const result=await page.evaluate(type=>{
   const r=window.__panelState();let meshes=0,markings=0,names=[];r.scene.traverse(o=>{if(o.isMesh){meshes++;if(o.userData.protectionMarking&&o.material?.map?.image)markings++}if(/^acti9_|^schneider_/.test(o.name))names.push(o.name)})
   return{meshes,markings,names}
  },type)
  check(result.meshes>0,type+': actual React Panel3D renderer mounts')
  if(type.includes('Schneider'))check(result.names.some(n=>n.startsWith('acti9_connection_')),type+': manufacturer-derived CAD with real cavity nodes, not generic fallback')
  if(type!=='currentTransformerSplitCore')check(result.markings>0,type+': actual local markings/LCD texture is uploaded')
  await page.screenshot({path:path.join(output,type+'.png')});f.stable()
 }
 await show('breakerSchneiderIc60h1p');const closed=(await state()).closed;await click('acti9_handle_pivot');check((await state()).closed!==closed,'iC60H: actual dedicated CAD rocker changes electrical state')
 const angle=await page.evaluate(()=>window.__panelState().scene.getObjectByName('acti9_handle_pivot').rotation.x);check(Math.abs(angle)<.01,'iC60H actual rocker follows open pose')
 await show('residualBreakerSchneiderIid4p');await store(s=>s.setState({sim:{...s.getState().sim,runState:'paused'}}))
 let p=await point('schneider_test');await page.mouse.move(p.x,p.y);await page.mouse.down();check((await state()).tripped&&(await state()).testPressed,'iID: physical T trips and holds spring actuator')
 await page.mouse.move(10,10);await page.mouse.up();check(!(await state()).testPressed&&(await state()).tripped,'iID release outside returns T while trip remains latched')
 check(await page.evaluate(()=>window.__panelState().controls.enabled),'iID: orbit controls restored after outside release')
 await show('pilotLightSchneiderIil3p',2);await store(s=>s.setState({components:s.getState().components.map((c,i)=>({...c,state:{...c.state,l1On:i===0,l2On:i===1,l3On:i===0}}))}));await frame()
 const lenses=await page.evaluate(()=>{const out=[];window.__panelState().scene.traverse(o=>{if(o.name==='acti9_lens_1')out.push({id:o.material.uuid,on:o.material.emissiveIntensity})});return out});check(lenses.length===2&&lenses[0].id!==lenses[1].id&&lenses[0].on>0&&lenses[1].on===0,'two actual iIL3P instances have independent red lens materials/state')
 await show('meterD522066',2);await store(s=>s.setState({components:s.getState().components.map((c,i)=>({...c,state:{...c.state,on:true,voltage:230,current:i+1,power:100+i*200,energy:i+3}}))}));await frame()
 const lcd=await page.evaluate(()=>{const out=[];window.__panelState().scene.traverse(o=>{if(o.name==='digital_meter_lcd')out.push({id:o.material.map?.uuid,pixels:o.material.map?.image?.toDataURL()})});return out});check(lcd.length===2&&lcd[0].id!==lcd[1].id&&lcd[0].pixels!==lcd[1].pixels,'two actual meter LCDs have distinct textures and readings')
 await show('meterD522066');await store(s=>s.setState({components:s.getState().components.map(c=>({...c,state:{...c.state,on:true,energy:4.2}})),sim:{...s.getState().sim,runState:'paused'}}));await frame()
 await click('digital_meter_reset');check((await state()).energy===4.2,'D52 click does not reset energy: RESET requires a real five-second hold')
 p=await point('digital_meter_reset');await page.mouse.move(p.x,p.y);await page.mouse.down();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.up();check((await state()).energy===4.2,'D52 cancelled/blurred RESET does not alter energy')
 await page.clock.install();p=await point('digital_meter_reset');await page.mouse.move(p.x,p.y);await page.mouse.down();await page.clock.fastForward(5001);await page.mouse.up();check((await state()).energy===0,'D52 held RESET for 5 s clears cumulative energy');await page.clock.resume()
 const brand=await page.evaluate(async()=>{
  const {drawBrandArtwork}=await window.__fixtureImport('/src/three/brandArtwork.ts'),data=(await window.__fixtureImport('/src/data/brand-vector-paths.json')).default,out=[]
  for(const name of ['schneider-electric','hager']){
   const c=document.createElement('canvas');c.width=600;c.height=240;drawBrandArtwork(c.getContext('2d'),name,0,0,c.width,c.height)
   const image=new Image();image.src='/brands/'+name+'.svg';await image.decode();const expected=document.createElement('canvas');expected.width=c.width;expected.height=c.height
   const [, ,w,h]=data[name].viewBox,k=Math.min(c.width/w,c.height/h);expected.getContext('2d').drawImage(image,(c.width-w*k)/2,(c.height-h*k)/2,w*k,h*k)
   const a=c.getContext('2d').getImageData(0,0,c.width,c.height).data,b=expected.getContext('2d').getImageData(0,0,c.width,c.height).data;let diff=0,ink=0
   for(let i=0;i<a.length;i+=4){if(a[i+3])ink++;if(Math.abs(a[i+3]-b[i+3])>40||Math.abs(a[i]-b[i])>50||Math.abs(a[i+1]-b[i+1])>50)diff++}
   out.push({name,ink,difference:diff/(c.width*c.height)})
  }return out
 })
 for(const b of brand)check(b.ink>1000&&b.difference<.025,b.name+': synchronous vector path artwork matches actual local SVG raster '+b.difference.toFixed(5))
 f.stable();await writeFile(path.join(output,'results.json'),JSON.stringify({assertions:f.count(),errors:f.errors,scope:'Actual Panel3D/R3F; local synthetic project and source SVG raster comparisons; not hardware or live cloud.'},null,2));console.log(`\nPASS — ${f.count()} actual meter/Schneider Panel3D assertions`)
}catch(e){console.error(f.errors);await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});throw e}finally{await f.browser.close()}
