import path from 'node:path'
import {writeFile} from 'node:fs/promises'
import {panelFixture,attachPanel} from './lib/panel-fixture.mjs'
import {attachAdmin} from './lib/admin-fixture.mjs'

const type=process.env.MICO_TEST_TYPE??'breakerMurrelektronikMico46'
const compact=type==='breakerMurrelektronikMico24',channels=compact?2:4,terminals=compact?10:12
const output=path.resolve(compact?'docs/validation/mico24':'docs/validation/mico-classic-photo')
const f=await panelFixture({baseURL:process.env.INDUSTRIAL_TEST_URL,output}),{page,check}=f
try{
 await f.show(type)
 check(await f.store((s,n)=>s.getState().components[0].terminals.length===n,terminals),'Painel: '+terminals+' bornes, incluindo ON e ON2')
 const details=await page.evaluate(()=>{
  const r=window.__panelState(),T=window.__fixtureThree,guard=r.scene.getObjectByName('industrial_mico_guard_panel'),key=r.scene.getObjectByName('industrial_mico_button_cap_1')
  const material=m=>{const a=Array.isArray(m.material)?m.material:[m.material];return a.map(v=>({transparent:v.transparent,opacity:v.opacity,transmission:v.transmission??0}))}
  return{guard:material(guard),key:material(key)}
 })
 check(details.guard.every(m=>m.transparent&&m.opacity<.5),'Painel: tampa real transparente')
 check(details.key.every(m=>m.transparent&&m.opacity<.5),'Painel: teclas translúcidas separadas da tampa')
 await page.screenshot({path:path.join(output,'front.png')})
 await f.store(s=>{s.getState().play();s.getState().pause()});await f.frame()
 for(let i=1;i<=channels;i++){
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
 if(compact){
  check(draft.controls.length===4,'Admin cria quatro controlos físicos: duas teclas e dois seletores')
  await page.getByRole('tab',{name:'Simular',exact:true}).first().click()
  await admin.click('industrial_mico_button_1')
  check(await admin.editor(s=>s.getState().previewVars.mico1On===true),'Admin: tecla 1 altera o canal na pré-visualização')
  await admin.click('industrial_mico_select_1')
  check(await admin.editor(s=>Number(s.getState().previewVars.mico1Amps)===2&&s.getState().previewVars.mico1On===false),'Admin: seletor muda para 2 A e desliga o canal')
  await page.getByRole('tab',{name:'Editar',exact:true}).first().click()
 }
 await admin.editor(s=>s.getState().edit(def=>({...def,terminals:def.terminals.map((t,i)=>i?t:{...t,name:'Ensaio local '+t.label})})))
 await admin.reopen(draft.id)
 check(await admin.editor((s,n)=>s.getState().def.terminals.length===n,terminals),'Admin guardar/reabrir conserva os '+terminals+' bornes')
 const published=await admin.publish()
 await f.reload();const panel=await attachPanel(f)
 await page.evaluate(async()=>{const {useCatalogStore}=await window.__fixtureImport('/src/catalog/registry.ts');await useCatalogStore.getState().load()})
 await panel.show('cat:'+published.id+':v'+published.version.version)
 check(await page.evaluate(()=>!!window.__panelState().scene.getObjectByName('industrial_mico_guard_panel')),'Catálogo local de teste conserva a tampa transparente')
 check(await panel.store((s,n)=>s.getState().components[0].terminals.length===n,terminals),'Catálogo local de teste conserva ON2 e os restantes bornes')
 if(compact){
  check(await panel.store(s=>Object.keys(s.getState().components[0].state.channels).length===2),'Catálogo MICO 2.4 conserva exatamente dois canais')
  await panel.store(s=>{s.getState().play();s.getState().pause()});await panel.frame()
  const before=await panel.store(s=>s.getState().components[0].state.channels['1'].on)
  await panel.click('industrial_mico_button_1')
  check(await panel.store((s,before)=>s.getState().components[0].state.channels['1'].on!==before,before),'Catálogo local: tecla 1 continua funcional após exportação')
  await panel.click('industrial_mico_select_1')
  check(await panel.store(s=>s.getState().components[0].state.channels['1'].setpointA===2&&s.getState().components[0].state.channels['1'].on===false),'Catálogo local: seletor passa a 2 A e desliga o canal')
 }
 f.stable();await writeFile(path.join(output,'results.json'),JSON.stringify({checks:f.count(),details,led,errors:f.errors,scope:'Painel/Admin React/R3F reais; guardar/reabrir/exportar apenas em IndexedDB isolado, pedidos externos bloqueados.'},null,2)+'\n')
}catch(error){await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});throw error}
finally{await f.browser.close()}
