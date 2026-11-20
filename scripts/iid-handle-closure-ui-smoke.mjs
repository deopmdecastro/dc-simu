import path from 'node:path'
import {writeFile} from 'node:fs/promises'
import {panelFixture,attachPanel} from './lib/panel-fixture.mjs'
import {attachAdmin} from './lib/admin-fixture.mjs'

const output=path.resolve('docs/validation/iid-handle-closure')
const f=await panelFixture({baseURL:process.env.INDUSTRIAL_TEST_URL,output}),{page,check}=f
try{
 await f.show('residualBreakerSchneiderIid4p')
 await page.evaluate(()=>{
  const r=window.__panelState(),T=window.__fixtureThree,b=new T.Box3();r.scene.traverse(n=>{if(n.userData.isComponentRoot)b.expandByObject(n,true)})
  const c=b.getCenter(new T.Vector3()),d=r.camera.position.distanceTo(c)*.78;r.controls?.dispatchEvent({type:'start'})
  r.camera.position.copy(c).add(new T.Vector3(-.37,.17,1).normalize().multiplyScalar(d));r.camera.lookAt(c);r.controls?.target.copy(c);r.controls?.update();r.invalidate()
 });await f.frame()
 const measurements=[]
 for(const [name,state]of [['off',{closed:false,tripped:false}],['on',{closed:true,tripped:false}],['trip',{closed:false,tripped:true}]]){
  await f.store((s,state)=>s.setState({components:s.getState().components.map(c=>({...c,state:{...c.state,...state}}))}),state);await f.frame()
  const actual=await page.evaluate(()=>{
   const r=window.__panelState(),T=window.__fixtureThree,p=r.scene.getObjectByName('schneider_handle_pivot'),b=r.scene.getObjectByName('schneider_handle_barrel');r.scene.updateMatrixWorld(true)
   const center=b.getWorldPosition(new T.Vector3()),hits=[]
   const axis=p.parent.localToWorld(new T.Vector3(-.0269,.0333,.055)),fwd=new T.Vector3(0,0,1).transformDirection(p.parent.matrixWorld)
   for(const x of [-.0025,0,.0025])for(const y of [-.005,0,.005]){
    const target=p.parent.localToWorld(new T.Vector3(-.0269+x,.0333+y,.055)),origin=target.clone().addScaledVector(fwd,.4)
    const hit=new T.Raycaster(origin,fwd.clone().negate()).intersectObject(p.parent,true)[0];hits.push(hit?.object.name??null)
   }
   const mats=Array.isArray(b.material)?b.material:[b.material]
   return{hits,centerError:center.distanceTo(axis),opaque:mats.every(m=>!m.transparent&&m.opacity===1),angle:p.rotation.x}
  })
  check(actual.opaque,name+': obturador preto opaco, sem transparência')
  check(actual.centerError<1e-7,name+': corpo preto permanece concêntrico com o eixo real')
  check(actual.hits.every(n=>n&&(/schneider_handle|schneider_body/.test(n))),name+': nove raios na abertura não veem os componentes interiores '+JSON.stringify(actual.hits))
  check(actual.hits.includes('schneider_handle_barrel'),name+': a peça preta fecha a abertura atrás da pega')
  measurements.push({name,...actual});await page.screenshot({path:path.join(output,name+'.png')})
 }
 await f.store(s=>{s.getState().play();s.getState().pause()});await f.frame()
 const before=await f.store(s=>s.getState().components[0].state.closed)
 await f.click('schneider_handle_barrel')
 check(await f.store((s,before)=>s.getState().components[0].state.closed!==before,before),'Clique na peça preta continua a manobrar o diferencial')
 const admin=await attachAdmin(f),draft=await admin.open('residualBreakerSchneiderIid4p')
 check(!!await page.evaluate(()=>window.__adminState().scene.getObjectByName('schneider_handle_barrel')),'Admin importa o mesmo obturador do GLB')
 await page.getByRole('tab',{name:'Simular',exact:true}).first().click()
 const centers=[]
 for(const closed of [false,true]){
  await admin.editor((s,closed)=>s.getState().set({previewVars:{...s.getState().previewVars,closed,tripped:false}}),closed);await admin.frame()
  centers.push(await page.evaluate(()=>window.__adminState().scene.getObjectByName('schneider_handle_barrel').getWorldPosition(new window.__fixtureThree.Vector3()).toArray()))
 }
 check(centers[0].every((v,i)=>Math.abs(v-centers[1][i])<.0001),'Admin: o corpo preto roda no eixo sem deslocar o centro')
 await admin.editor(s=>s.getState().edit(def=>({...def,terminals:def.terminals.map((t,i)=>i?t:{...t,name:'Ensaio local '+t.label})})))
 await admin.reopen(draft.id)
 check(!!await page.evaluate(()=>window.__adminState().scene.getObjectByName('schneider_handle_barrel')),'Admin guardar/reabrir conserva a peça preta')
 const published=await admin.publish()
 await f.reload();const panel=await attachPanel(f)
 await page.evaluate(async()=>{const {useCatalogStore}=await window.__fixtureImport('/src/catalog/registry.ts');await useCatalogStore.getState().load()})
 await panel.show('cat:'+published.id+':v'+published.version.version)
 check(!!await page.evaluate(()=>window.__panelState().scene.getObjectByName('schneider_handle_barrel')),'Catálogo local de teste: GLB exportado conserva o obturador')
 f.stable();await writeFile(path.join(output,'results.json'),JSON.stringify({checks:f.count(),measurements,errors:f.errors,scope:'Painel/Admin React/R3F reais, guardar/reabrir/exportar para catálogo em IndexedDB isolado, pedidos externos bloqueados'},null,2)+'\n')
}catch(error){await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});throw error}
finally{await f.browser.close()}
