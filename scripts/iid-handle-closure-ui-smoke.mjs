import path from 'node:path'
import {mkdir,mkdtemp,rename,rm,writeFile} from 'node:fs/promises'
import {panelFixture,attachPanel} from './lib/panel-fixture.mjs'
import {attachAdmin} from './lib/admin-fixture.mjs'

const output=path.resolve('docs/validation/iid-photo-finish')
await mkdir(output,{recursive:true})
const staging=await mkdtemp(path.join(output,'.iid-handle-closure-'))
let f,page,check
try{
 f=await panelFixture({baseURL:process.env.INDUSTRIAL_TEST_URL,output:staging})
 ;({page,check}=f)
 await f.show('residualBreakerSchneiderIid4p')
 await page.evaluate(()=>{
  const r=window.__panelState(),T=window.__fixtureThree,b=new T.Box3();r.scene.traverse(n=>{if(n.userData.isComponentRoot)b.expandByObject(n,true)})
  const c=b.getCenter(new T.Vector3()),d=r.camera.position.distanceTo(c)*.78;r.controls?.dispatchEvent({type:'start'})
  r.camera.position.copy(c).add(new T.Vector3(-.37,.17,1).normalize().multiplyScalar(d));r.camera.lookAt(c);r.controls?.target.copy(c);r.controls?.update();r.invalidate()
 });await f.frame()
 const finish=await page.evaluate(()=>{
  const s=window.__panelState().scene,color=name=>s.getObjectByName(name).material.color.getHexString()
  return{
   rocker:color('schneider_handle_white'),
   grip:color('schneider_handle_grip'),
   body:color('schneider_body'),
   test:!!s.getObjectByName('__dcSchneiderTestMarking'),
   testRecess:!!s.getObjectByName('schneider_test_recess'),
   visitrip:!!s.getObjectByName('schneider_visitrip_flag'),
   screws:Array.from({length:8},(_,i)=>!!s.getObjectByName('schneider_terminal_screw_'+i)),
  }
 })
 check(finish.rocker==='f5f6f4'&&finish.grip==='42474c'&&finish.body==='f5f6f4','Painel: carcaça/alavanca branca acetinada e pega antracite da referência')
 check(finish.screws.every(Boolean)&&finish.test&&finish.testRecess&&finish.visitrip,'Painel: oito poços de parafuso profundos, botão T em cavidade fechada e janela VisiTrip visíveis')
 const measurements=[]
 for(const [name,state]of [['off',{closed:false,tripped:false}],['on',{closed:true,tripped:false}],['trip',{closed:false,tripped:true}]]){
  await f.store((s,state)=>s.setState({components:s.getState().components.map(c=>({...c,state:{...c.state,...state}}))}),state);await f.frame()
  const actual=await page.evaluate(()=>{
   const r=window.__panelState(),T=window.__fixtureThree,p=r.scene.getObjectByName('schneider_handle_pivot'),b=r.scene.getObjectByName('schneider_handle_barrel');r.scene.updateMatrixWorld(true)
   const center=b.getWorldPosition(new T.Vector3()),hits=[]
   const axis=p.parent.localToWorld(new T.Vector3(-.0269,.0350,.0605)),fwd=new T.Vector3(0,0,1).transformDirection(p.parent.matrixWorld)
   for(const x of [-.0025,0,.0025])for(const y of [-.004,0,.004]){
    const target=p.parent.localToWorld(new T.Vector3(-.0269+x,.0350+y,.0605)),origin=target.clone().addScaledVector(fwd,.4)
    const hit=new T.Raycaster(origin,fwd.clone().negate()).intersectObject(p.parent,true).find(h=>!h.object.name.startsWith('schneider_visisafe'));hits.push(hit?.object.name??null)
   }
   const mats=Array.isArray(b.material)?b.material:[b.material]
   const status=['','_on','_trip'].map(s=>p.parent.getObjectByName('schneider_visisafe'+s)).find(n=>n.material.visible)
   const statusBox=new T.Box3().setFromObject(status,true)
   const statusCenter=statusBox.getCenter(new T.Vector3())
   const statusRayHit=new T.Raycaster(statusCenter.clone().addScaledVector(fwd,.4),fwd.clone().negate()).intersectObject(p.parent,true)[0]?.object.name
   const vtFlag=r.scene.getObjectByName('schneider_visitrip_flag')
   const vtColor=vtFlag?.material?.color?.getHexString()??null
   const barrelBox=new T.Box3().setFromObject(b,true)
   const bodyBox=new T.Box3().setFromObject(r.scene.getObjectByName('schneider_body'),true)
   const barrelRelMinY=(barrelBox.min.y-bodyBox.min.y)/(bodyBox.max.y-bodyBox.min.y)
   return{hits,statusRayHit,vtColor,barrelRelMinY,centerError:center.distanceTo(axis),opaque:mats.every(m=>!m.transparent&&m.opacity===1),angle:p.rotation.x}
  })
  check(actual.opaque,name+': alavanca opaca, sem transparência')
  check(actual.centerError<1e-7,name+': tambor branco permanece concêntrico com o eixo real')
  check(actual.barrelRelMinY>0.28,name+': tambor permanece contido no berço sem sobressair abaixo da frente ('+actual.barrelRelMinY.toFixed(3)+')')
  check(actual.hits.every(n=>n&&(/schneider_handle|schneider_body/.test(n))),name+': nove raios na abertura não veem os componentes interiores '+JSON.stringify(actual.hits))
  check(actual.hits.includes('schneider_handle_barrel'),name+': o tambor fecha a abertura atrás da pega')
  check(actual.statusRayHit?.startsWith('schneider_visisafe'),name+': faixa VisiSafe curva livre e visível de frente ('+actual.statusRayHit+')')
  check(name==='trip'?actual.vtColor==='d92027':actual.vtColor==='ebeeeb',name+': janela VisiTrip mostra '+(name==='trip'?'vermelho':'branco')+' ('+actual.vtColor+')')
  measurements.push({name,...actual});await page.screenshot({path:path.join(staging,name+'.png')})
 }
 const cameraPosition=await page.evaluate(()=>{
  const r=window.__panelState(),T=window.__fixtureThree,c=r.controls.target.clone(),p=r.camera.position.toArray(),d=r.camera.position.distanceTo(c)
  r.camera.position.copy(c).add(new T.Vector3(0,0,d));r.camera.lookAt(c);r.controls.update();r.invalidate();return p
 });await f.frame();await page.screenshot({path:path.join(staging,'front.png')})
 await page.evaluate(p=>{const r=window.__panelState();r.camera.position.fromArray(p);r.camera.lookAt(r.controls.target);r.controls.update();r.invalidate()},cameraPosition);await f.frame()
 await f.store(s=>{s.getState().play();s.getState().pause()});await f.frame()
 const before=await f.store(s=>s.getState().components[0].state.closed)
 await f.click('schneider_handle_barrel')
 check(await f.store((s,before)=>s.getState().components[0].state.closed!==before,before),'Clique na alavanca continua a manobrar o diferencial')
 const admin=await attachAdmin(f),draft=await admin.open('residualBreakerSchneiderIid4p')
 check(!!await page.evaluate(()=>{const s=window.__adminState().scene;return s.getObjectByName('schneider_handle_barrel')&&s.getObjectByName('schneider_visitrip_flag')&&s.getObjectByName('schneider_test_recess')}),'Admin importa tambor concêntrico, janela VisiTrip e cavidade do botão T do GLB')
 await page.getByRole('tab',{name:'Simular',exact:true}).first().click()
 const centers=[]
 for(const closed of [false,true]){
  await admin.editor((s,closed)=>s.getState().set({previewVars:{...s.getState().previewVars,closed,tripped:false}}),closed);await admin.frame()
  centers.push(await page.evaluate(()=>window.__adminState().scene.getObjectByName('schneider_handle_barrel').getWorldPosition(new window.__fixtureThree.Vector3()).toArray()))
 }
 check(centers[0].every((v,i)=>Math.abs(v-centers[1][i])<.0001),'Admin: o tambor roda no eixo sem deslocar o centro')
 await admin.editor(s=>s.getState().edit(def=>({...def,terminals:def.terminals.map((t,i)=>i?t:{...t,name:'Ensaio local '+t.label})})))
 await admin.reopen(draft.id)
 check(!!await page.evaluate(()=>window.__adminState().scene.getObjectByName('schneider_handle_barrel')),'Admin guardar/reabrir conserva a alavanca completa')
 const published=await admin.publish()
 await f.reload();const panel=await attachPanel(f)
 await page.evaluate(async()=>{const {useCatalogStore}=await window.__fixtureImport('/src/catalog/registry.ts');await useCatalogStore.getState().load()})
 await panel.show('cat:'+published.id+':v'+published.version.version)
 check(!!await page.evaluate(()=>{const s=window.__panelState().scene;return s.getObjectByName('schneider_handle_barrel')&&s.getObjectByName('schneider_visitrip_flag')&&s.getObjectByName('schneider_test_recess')}),'Catálogo local de teste: GLB exportado conserva todos os acabamentos iID')
 f.stable();await writeFile(path.join(staging,'results.json'),JSON.stringify({checks:f.count(),finish,measurements,errors:f.errors,scope:'Painel/Admin React/R3F reais, guardar/reabrir/exportar para catálogo em IndexedDB isolado, pedidos externos bloqueados'},null,2)+'\n')
 for(const name of ['off.png','on.png','trip.png','front.png','results.json'])await rename(path.join(staging,name),path.join(output,name))
}catch(error){if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});throw error}
finally{try{if(f)await f.browser.close()}finally{await rm(staging,{recursive:true,force:true})}}
