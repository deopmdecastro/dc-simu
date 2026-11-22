import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { panelFixture } from './lib/panel-fixture.mjs'

const output=path.resolve('runtime/socket-fidelity')
await mkdir(output,{recursive:true})
const f=await panelFixture({baseURL:process.env.SOCKETS_TEST_URL??'http://127.0.0.1:5173',output,height:1000})
const {page,check}=f
async function studio(){
  await page.evaluate(()=>{
    const r=window.__panelState(),T=window.__fixtureThree,keep=new Set(),box=new T.Box3()
    r.scene.updateMatrixWorld(true)
    r.scene.traverse(o=>{
      if(!o.userData.isComponentRoot)return
      for(let p=o;p&&p!==r.scene;p=p.parent)keep.add(p)
      o.traverse(n=>{
        if(n.isSprite){n.visible=false;return}
        for(let p=n;p;p=p.parent)if(!p.visible)return
        if(n.isMesh && n.material?.visible!==false)box.expandByObject(n,true)
      })
    })
    for(const o of r.scene.children)if(!keep.has(o)&&!o.isLight&&!o.isCamera)o.visible=false
    r.scene.background=new T.Color('#ffffff')
    const center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3())
    const distance=size.length()/2/Math.sin(r.camera.fov*Math.PI/360)*1.13
    r.controls?.dispatchEvent({type:'start'})
    r.camera.position.copy(center).add(new T.Vector3(.7,.43,1.3).normalize().multiplyScalar(distance))
    r.camera.lookAt(center);r.camera.updateProjectionMatrix();r.controls?.target.copy(center);r.controls?.update();r.invalidate()
  })
  await f.frame()
}
try{
  for(const type of ['socketEfapelIp65','socketFamatelSwitch','socketFamatelCombo']){
    const [id]=await f.show(type)
    await studio();await page.locator('canvas').screenshot({path:path.join(output,type+'-closed.png')})
    await f.click(type==='socketEfapelIp65'?'efapel-lid':type==='socketFamatelCombo'?'schuko-cover-disc':'cee-cover-disc')
    const state=await f.store((s,id)=>s.getState().components.find(c=>c.id===id).state,id)
    check(Boolean(type==='socketEfapelIp65'?state.coverOpen:state.blueCoverOpen),type+': clique físico abre a tampa')
    if(type==='socketFamatelCombo'){
      check(!state.redCoverOpen,'FAMATEL: abrir tampa azul mantém vermelha fechada')
      await f.click('cee-cover-disc')
      check(await f.store((s,id)=>s.getState().components.find(c=>c.id===id).state.redCoverOpen,id),'FAMATEL: segunda tampa abre independentemente')
    }
    if(type==='socketFamatelSwitch'){
      await f.click('isolator-grip')
      check(await f.store((s,id)=>s.getState().components.find(c=>c.id===id).state.switchOn,id),'RoadEu: STOP impede manobrar o seccionador')
      await f.store(s=>s.setState({sim:{...s.getState().sim,runState:'paused'}}))
      await f.click('isolator-grip')
      check(!(await f.store((s,id)=>s.getState().components.find(c=>c.id===id).state.switchOn,id)),'RoadEu: em PAUSA o clique roda o seccionador')
    }
    await studio();await page.locator('canvas').screenshot({path:path.join(output,type+'-open.png')})
    await f.store((s,id)=>s.getState().setComponentState(id,{serviceOpen:true}),id)
    await f.frame()
    const terminals=await page.evaluate(()=>{
      const r=window.__panelState();let compartment
      r.scene.traverse(o=>{if(o.name==='socket-wiring-compartment')compartment=o})
      return compartment?.visible&&compartment.children.some(o=>o.name.startsWith('socket-terminal-'))
    })
    check(terminals,type+': acesso à cablagem expõe os bornes de serviço')
    await studio();await page.locator('canvas').screenshot({path:path.join(output,type+'-service.png')})
  }
  f.stable();console.log(`${f.count()} verificações UI das tomadas passaram`)
}finally{await f.browser.close()}
