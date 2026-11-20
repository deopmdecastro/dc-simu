import path from 'node:path'
import {writeFile} from 'node:fs/promises'
import {panelFixture,attachPanel} from './lib/panel-fixture.mjs'
import {attachAdmin} from './lib/admin-fixture.mjs'

const output=path.resolve('docs/validation/mico-classic-photo')
const type='breakerMurrelektronikMico46'
const f=await panelFixture({baseURL:process.env.INDUSTRIAL_TEST_URL,output}),{page,check}=f
try{
 await f.show(type)
 check(await f.store(s=>s.getState().components[0].terminals.length===12),'Painel: 12 bornes, incluindo ON e ON2')
 const details=await page.evaluate(()=>{
  const r=window.__panelState(),T=window.__fixtureThree,guard=r.scene.getObjectByName('industrial_mico_guard_panel'),key=r.scene.getObjectByName('industrial_mico_button_cap_1')
  const material=m=>{const a=Array.isArray(m.material)?m.material:[m.material];return a.map(v=>({transparent:v.transparent,opacity:v.opacity,transmission:v.transmission??0}))}
  return{guard:material(guard),key:material(key)}
 })
 check(details.guard.every(m=>m.transparent&&m.opacity<.5),'Painel: tampa real transparente')
 check(details.key.every(m=>m.transparent&&m.opacity<.5),'Painel: teclas translúcidas separadas da tampa')
 await page.screenshot({path:path.join(output,'front.png')})
 await f.store(s=>{s.getState().play();s.getState().pause()});await f.frame()
 for(let i=1;i<=4;i++){
  const before=await f.store((s,i)=>s.getState().components[0].state.channels[String(i)].on,i)
  await f.click('industrial_mico_button_'+i)
  check(await f.store((s,{i,before})=>s.getState().components[0].state.channels[String(i)].on!==before,{i,before}),'Botão físico '+i+' comuta o canal')
  const amps=await f.store((s,i)=>s.getState().components[0].state.channels[String(i)].setpointA,i)
  await f.click('industrial_mico_select_'+i)
  check(await f.store((s,{i,amps})=>s.getState().components[0].state.channels[String(i)].setpointA!==amps,{i,amps}),'Seletor físico '+i+' responde através da tampa transparente')
 }
 await f.store(s=>s.setState({components:s.getState().components.map(c=>({...c,state:{...c.state,powered:true,channels:{...c.state.channels,'1':{...c.state.channels['1'],on:true,tripped:false,fault:false},'2':{...c.state.channels['2'],on:false}}}}))}));await f.frame()
 const led=await page.evaluate(()=>[1,2].map(i=>window.__panelState().scene.getObjectByName('industrial_mico_led_'+i).material.color.getHexString()))
 check(led[0]==='36c938'&&led[1]==='d52e32','LED verde em ON e vermelho em OFF com alimentação')
 await page.evaluate(()=>{
  const r=window.__panelState(),T=window.__fixtureThree,b=new T.Box3();r.scene.traverse(n=>{if(n.userData.isComponentRoot)b.expandByObject(n,true)})
  const c=b.getCenter(new T.Vector3()),d=r.camera.position.distanceTo(c)*.9;r.controls?.dispatchEvent({type:'start'})
  r.camera.position.copy(c).add(new T.Vector3(.68,.42,1).normalize().multiplyScalar(d));r.camera.lookAt(c);r.controls?.target.copy(c);r.controls?.update();r.invalidate()
 });await f.frame();await page.screenshot({path:path.join(output,'isometric.png')})
 const admin=await attachAdmin(f),draft=await admin.open(type)
 check(await page.evaluate(()=>!!window.__adminState().scene.getObjectByName('industrial_mico_guard_panel')),'Admin importa a mesma tampa e geometria')
 await admin.editor(s=>s.getState().edit(def=>({...def,terminals:def.terminals.map((t,i)=>i?t:{...t,name:'Ensaio local '+t.label})})))
 await admin.reopen(draft.id)
 check(await admin.editor(s=>s.getState().def.terminals.length===12),'Admin guardar/reabrir conserva os 12 bornes')
 const published=await admin.publish()
 await f.reload();const panel=await attachPanel(f)
 await page.evaluate(async()=>{const {useCatalogStore}=await window.__fixtureImport('/src/catalog/registry.ts');await useCatalogStore.getState().load()})
 await panel.show('cat:'+published.id+':v'+published.version.version)
 check(await page.evaluate(()=>!!window.__panelState().scene.getObjectByName('industrial_mico_guard_panel')),'Catálogo local de teste conserva a tampa transparente')
 check(await panel.store(s=>s.getState().components[0].terminals.length===12),'Catálogo local de teste conserva ON2 e os restantes bornes')
 f.stable();await writeFile(path.join(output,'results.json'),JSON.stringify({checks:f.count(),details,led,errors:f.errors,scope:'Painel/Admin React/R3F reais; guardar/reabrir/exportar apenas em IndexedDB isolado, pedidos externos bloqueados.'},null,2)+'\n')
}catch(error){await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});throw error}
finally{await f.browser.close()}
