// Aceitação dos GRT8-M1/M2 e ATV320U04M2C na aplicação React/R3F real.
import path from 'node:path'
import {writeFile} from 'node:fs/promises'
import {panelFixture} from './lib/panel-fixture.mjs'

const output=path.resolve('docs/validation/industrial-fidelity')
const f=await panelFixture({baseURL:process.env.INDUSTRIAL_TEST_URL,output}),{page,check}=f
const types=['timerGeyaGrt8M1','timerGeyaGrt8M2','vfdSchneiderAtv320']
try{
 for(const type of types){
  await f.show(type)
  await page.waitForFunction(type=>{
   const r=window.__panelState(),names=type.startsWith('timer')?['industrial_fascia','industrial_geya_side_l','industrial_geya_side_r']:['industrial_hmi_legend_fault','industrial_escape_label','industrial_schneider_logo']
   return names.every(n=>r.scene.getObjectByName(n)?.material.map?.image)
  },type)
  await f.store(s=>{s.getState().play();s.getState().pause()});await f.frame()
  if(type.startsWith('timer')){
   const labels=type.endsWith('M2')?['A1','S','A2','15','16','18','25','26','28']:['A1','S','A2','15','16','18']
   const hits=await page.evaluate(labels=>{
    const r=window.__panelState(),T=window.__fixtureThree;r.scene.updateMatrixWorld(true)
    return labels.map(label=>{const s=r.scene.getObjectByName('terminal_screw_geya_'+label),p=s.localToWorld(new T.Vector3(.0008,.0008,.012)),q=s.localToWorld(new T.Vector3(.0008,.0008,0));return new T.Raycaster(p,q.sub(p).normalize()).intersectObject(r.scene,true)[0]?.object.name})
   },labels)
   labels.forEach((l,i)=>check(hits[i]==='terminal_screw_head_geya_'+l,type+' '+l+': cabeça de parafuso exposta na cavidade real'))
   for(const name of ['range','fraction','function']){
    const key=name==='range'?'rangeMs':name,before=await f.store((s,key)=>s.getState().components[0].state[key],key)
    await f.click('industrial_'+name)
    check(await f.store((s,{key,before})=>s.getState().components[0].state[key]!==before,{key,before}),type+': seletor '+name+' atua por clique real')
   }
   check(await f.store(s=>new Set(s.getState().components[0].terminals.map(t=>JSON.stringify(t.socket3D?.position??t.position3D))).size===s.getState().components[0].terminals.length),type+': entradas de condutores fisicamente distintas')
  }else{
   const hardware=await page.evaluate(()=>{
    const r=window.__panelState(),names=[];r.scene.traverse(n=>names.push(n.name))
    return {screws:names.filter(n=>n.startsWith('terminal_screw_head_atv_')).length,grip:names.some(n=>n.startsWith('industrial_encoder_grip_')),fault:!!r.scene.getObjectByName('industrial_hmi_legend_fault')}
   })
   check(hardware.screws===33,'ATV: 33 parafusos em cavidades de potência e comando')
   check(hardware.grip&&hardware.fault,'ATV: pega triangular e legenda FAULT presentes no GLB real')
   await f.click('industrial_encoder')
   check(await f.store(s=>s.getState().components[0].state.editing===true),'ATV: encoder entra na edição da referência')
   await f.click('industrial_escape')
   check(await f.store(s=>s.getState().components[0].state.editing===false),'ATV: ESC com inscrição ao centro sai da edição')
   await f.click('industrial_cover_latch')
   check(await page.evaluate(()=>!window.__panelState().scene.getObjectByName('industrial_control_cover').visible&&window.__panelState().scene.getObjectByName('industrial_control_interior').visible),'ATV: tampa expõe os bornes reais de comando')
   await page.screenshot({path:path.join(output,type+'-bornes.png')});await f.click('industrial_cover_latch')
   await f.store(s=>s.setState({components:s.getState().components.map(c=>({...c,state:{...c.state,powered:true,menu:'mon',frequencyHz:23.5}}))}));await f.frame()
   check(await page.evaluate(()=>!!window.__panelState().scene.getObjectByName('industrial_lcd').material.map?.image?.toDataURL?.()),'ATV: visor dinâmico mantém a textura Canvas independente')
  }
  await page.screenshot({path:path.join(output,type+'-frente.png')})
  await page.evaluate(()=>{
   const r=window.__panelState(),T=window.__fixtureThree,b=new T.Box3();r.scene.traverse(n=>{if(n.userData.isComponentRoot)b.expandByObject(n,true)})
   const c=b.getCenter(new T.Vector3()),d=r.camera.position.distanceTo(c);r.controls?.dispatchEvent({type:'start'})
   r.camera.position.copy(c).add(new T.Vector3(-.65,.2,1).normalize().multiplyScalar(d));r.camera.lookAt(c);r.controls?.target.copy(c);r.controls?.update();r.invalidate()
  });await f.frame();await page.screenshot({path:path.join(output,type+'-perspetiva.png')})
 }
 f.stable();await writeFile(path.join(output,'results.json'),JSON.stringify({checks:f.count(),types,exceptions:f.errors,scope:'Painel React/R3F real; projeto sintético isolado, pedidos externos bloqueados'},null,2)+'\n')
}catch(error){await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});throw error}
finally{await f.browser.close()}
