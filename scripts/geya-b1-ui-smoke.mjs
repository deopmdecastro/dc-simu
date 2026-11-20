// GEYA B1 no Painel real; projeto sintético isolado, sem pedidos externos.
import path from 'node:path'
import {writeFile} from 'node:fs/promises'
import {panelFixture} from './lib/panel-fixture.mjs'

const output=path.resolve('docs/validation/geya-b1')
const f=await panelFixture({baseURL:process.env.INDUSTRIAL_TEST_URL,output})
const {page,check}=f
try{
 await f.show('timerGeyaGrt8B1')
 await page.waitForFunction(()=>{
  const r=window.__panelState(),names=['industrial_fascia','industrial_geya_side_l','industrial_geya_side_r']
  return names.every(name=>r.scene.getObjectByName(name)?.material.map?.image)
 })
 const hardware=await page.evaluate(()=>{
  const r=window.__panelState(),T=window.__fixtureThree;r.scene.updateMatrixWorld(true)
  return ['A1','S','A2','15','16','18'].map(label=>{
   const screw=r.scene.getObjectByName('terminal_screw_geya_'+label)
   const origin=screw.localToWorld(new T.Vector3(.0008,.0008,.012)),end=screw.localToWorld(new T.Vector3(.0008,.0008,0))
   const hit=new T.Raycaster(origin,end.sub(origin).normalize()).intersectObject(r.scene,true)[0]
   return {label,hit:hit?.object.name}
  })
 })
 for(const {label,hit} of hardware)check(hit==='terminal_screw_head_geya_'+label,label+': cabeça metálica acessível na cena real, sem placa opaca sobreposta')
 await f.store(s=>{s.getState().play();s.getState().pause()});await f.frame()
 for(const name of ['range','fraction']){
  const before=await f.store((s,name)=>s.getState().components[0].state[name==='range'?'rangeMs':'fraction'],name)
  await f.click('industrial_'+name)
  check(await f.store((s,{name,before})=>s.getState().components[0].state[name==='range'?'rangeMs':'fraction']!==before,{name,before}),name+': seletor físico atua no estado do B1')
 }
 for(const powered of [true,false]){
  await f.store((s,powered)=>s.setState({components:s.getState().components.map(c=>({...c,state:{...c.state,powered,energized:powered}}))}),powered)
  await f.frame()
  const leds=await page.evaluate(()=>['power','relay'].map(name=>window.__panelState().scene.getObjectByName('industrial_led_'+name).material.emissiveIntensity))
  check(leds.every(n=>n===(powered?1.3:0)),'Lentes convexas acompanham o estado elétrico '+powered)
 }
 await page.screenshot({path:path.join(output,'frente.png')})
 await page.evaluate(()=>{
  const r=window.__panelState(),T=window.__fixtureThree,b=new T.Box3()
  r.scene.traverse(n=>{if(n.userData.isComponentRoot)b.expandByObject(n,true)})
  const c=b.getCenter(new T.Vector3()),distance=r.camera.position.distanceTo(c)
  r.controls?.dispatchEvent({type:'start'});r.camera.position.copy(c).add(new T.Vector3(-.65,.22,1).normalize().multiplyScalar(distance))
  r.camera.lookAt(c);r.controls?.target.copy(c);r.controls?.update();r.invalidate()
 })
 await f.frame();await page.screenshot({path:path.join(output,'perspetiva.png')})
 f.stable()
 await writeFile(path.join(output,'results.json'),JSON.stringify({checks:f.count(),hardware,exceptions:f.errors,scope:'Painel React/R3F real, projeto sintético isolado'},null,2)+'\n')
}finally{await f.browser.close()}
