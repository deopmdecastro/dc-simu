import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { panelFixture } from './lib/panel-fixture.mjs'
const output=process.env.PANEL_PROFILE_OUTPUT||path.resolve('runtime/panel-profile'),f=await panelFixture({baseURL:process.env.INDUSTRIAL_TEST_URL,output}),{page,check,store,frame,show}=f
try{
 await show('meterD522066',2)
 const cdp=await f.context.newCDPSession(page);await cdp.send('Performance.enable')
 const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]))
 const heapBefore=await metrics(),records=[]
 for(let cycle=0;cycle<5;cycle++){
  for(const type of ['meterD522066','pilotLightSchneiderIil3p','residualBreakerSchneiderIid4p']){await show(type,2);await store(s=>s.setState({components:[]}));await frame()}
  const sample=await page.evaluate(()=>{const r=window.__panelState();r.invalidate();return{...r.gl.info.memory,programs:r.gl.info.programs?.length??0}});records.push(sample)
 }
 const tail=records.slice(1);check(Math.max(...tail.map(r=>r.geometries))-Math.min(...tail.map(r=>r.geometries))<=3,'actual persistent Panel3D renderer: geometries plateau across repeated component unmount/remount')
 check(Math.max(...tail.map(r=>r.textures))-Math.min(...tail.map(r=>r.textures))<=3,'actual persistent Panel3D renderer: LCD/shared texture counts plateau, not one leak per mount')
 await page.evaluate(async()=>{
  const {useSimStore}=await window.__fixtureImport('/src/store/useSimStore.ts'),{createComponent}=await window.__fixtureImport('/src/electrical/factory.ts')
  const types=['vfdSchneiderAtv320','relayFinder5534','timerGeyaGrt8M1','timerGeyaGrt8B1','levelRelayAvel411','relaySocketFinder9023','buzzerMetaltexTby301','meterD522066','meterKws306','currentTransformerSplitCore','pilotLightSchneiderIil1p','pilotLightSchneiderIil3p','breakerSchneiderIc60h1p','residualBreakerSchneiderIid4p','residualBreakerSchneiderIdpnVigi']
  useSimStore.setState({components:types.map((type,i)=>createComponent(type,'P'+i,'',i,(i%5)*220,Math.floor(i/5)*250)),wires:[]})
 })
 await page.waitForFunction(()=>{const r=window.__panelState();if(!r)return false;let n=0;r.scene.traverse(o=>{if(o.userData.isComponentRoot){let meshes=0;o.traverse(c=>{if(c.isMesh)meshes++});if(meshes)n++}});return n===15&&!document.querySelector('.panel3d-loading-overlay')},null,{timeout:120000})
 await frame()
 const report=await page.evaluate(async()=>{
  const r=window.__panelState(),T=window.__fixtureThree,b=new T.Box3();r.scene.traverse(o=>{if(o.userData.isComponentRoot)b.expandByObject(o,true)})
  const center=b.getCenter(new T.Vector3()),size=b.getSize(new T.Vector3()),distance=Math.max(size.x/r.camera.aspect,size.y)/(2*Math.tan(r.camera.fov*Math.PI/360))*1.3+size.z
  r.camera.position.set(center.x,center.y,b.max.z+distance);r.camera.lookAt(center);r.controls.target.copy(center);r.controls.update()
  const calls=[],cpu=[],original=r.gl.render.bind(r.gl),start=performance.now();r.gl.render=(...args)=>{const t=performance.now();const result=original(...args);cpu.push(performance.now()-t);calls.push(performance.now());return result}
  try{
   await new Promise(resolve=>{const tick=()=>{if(performance.now()-start>8000)return resolve();r.camera.position.x+=.003;r.controls.update();r.invalidate();requestAnimationFrame(tick)};tick()})
  }finally{r.gl.render=original}
  const elapsed=performance.now()-start,gl=r.gl.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info'),meshCount={visible:0,total:0};r.scene.traverse(o=>{if(o.isMesh){meshCount.total++;if(o.visible)meshCount.visible++}})
  const sorted=[...cpu].sort((a,b)=>a-b)
  return{elapsedMs:elapsed,renderedFrames:calls.length,observedFps:calls.length/(elapsed/1000),meanRenderCpuMs:cpu.reduce((a,b)=>a+b,0)/(cpu.length||1),p95RenderCpuMs:sorted[Math.floor(sorted.length*.95)]??0,memory:{...r.gl.info.memory},drawCalls:r.gl.info.render.calls,triangles:r.gl.info.render.triangles,meshCount,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),vendor:debug?gl.getParameter(debug.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),userAgent:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight},dpr:devicePixelRatio}
 })
 check(report.renderedFrames>0&&Number.isFinite(report.meanRenderCpuMs),'actual React/R3F demand rendering and orbit workload measured; no direct Three-only substitute')
 const cache=await page.evaluate(async()=>{
  const {cachedCanvasTexture,bindCachedCanvasTexture}=await window.__fixtureImport('/src/three/canvasTextureCache.ts'),T=window.__fixtureThree
  const tex=cachedCanvasTexture('profile-live-retained',64,64,(c,w,h)=>{c.fillStyle='#ff0000';c.fillRect(0,0,w,h)}),a=new T.MeshBasicMaterial({map:tex}),b=new T.MeshBasicMaterial({map:tex});let disposed=0;tex.addEventListener('dispose',()=>disposed++);bindCachedCanvasTexture(a,tex);bindCachedCanvasTexture(b,tex)
  for(let i=0;i<110;i++)cachedCanvasTexture('profile-cold-'+i,16,16,c=>c.fillRect(0,0,16,16))
  const both=disposed;a.dispose();for(let i=0;i<110;i++)cachedCanvasTexture('profile-second-'+i,16,16,c=>c.fillRect(0,0,16,16));const one=disposed;b.dispose();return{both,one}
 });check(cache.both===0&&cache.one===0,'canvas cache pressure never disposes artwork while either mounted material still owns it')
 const heapAfter=await metrics();await page.screenshot({path:path.join(output,'actual-panel-workload.png')});f.stable()
 const data={assertions:f.count(),exceptions:f.errors,unmountCycles:records,profile:report,heap:{before:heapBefore.JSHeapUsedSize,after:heapAfter.JSHeapUsedSize},scope:'Actual isolated Panel3D/R3F/Vite with 15 distinct devices, orbit and demand rendering. CPU render submission and observed software-browser frame rate, not GPU timestamp/hardware benchmark. No fixed FPS approval asserted.'}
 await writeFile(path.join(output,'profile.json'),JSON.stringify(data,null,2));console.log(JSON.stringify(data,null,2));console.log(`\nAUDITED — actual Panel3D; ${f.count()} lifecycle/instrumentation assertions, ${report.observedFps.toFixed(2)} observed FPS on ${report.renderer}`)
}catch(e){console.error(f.errors);await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});throw e}finally{await f.browser.close()}
