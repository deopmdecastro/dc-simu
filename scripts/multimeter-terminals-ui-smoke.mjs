import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const baseURL = process.env.TERMINAL_TEST_URL || 'http://127.0.0.1:5173'
const output = process.env.TERMINAL_TEST_OUTPUT || path.resolve('../../../runtime/dm20-terminals')
const browser = await chromium.launch(process.env.TERMINAL_TEST_CHANNEL ? { channel:process.env.TERMINAL_TEST_CHANNEL } : {})
const context = await browser.newContext({ viewport:{ width:1440,height:1000 }, serviceWorkers:'block' })
await context.route('**/*', (route) => {
  const url = new URL(route.request().url())
  const local = url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') && url.pathname !== '/version.json'
  const font = ['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname) || (url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith('/gh/lojjic/unicode-font-resolver@'))
  return local || font ? route.continue() : route.abort()
})
await context.route('**/__multimeter-fixture__', (route) => route.fulfill({ contentType:'text/html', body:'<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>' }))
await context.addInitScript(() => {
  localStorage.setItem('dcsimu:workspace:view','schematic')
})
const page = await context.newPage()
const errors = []
page.on('pageerror',(error) => errors.push(error.message))
const check = (ok,message) => { assert.ok(ok,message); console.log('PASS — '+message) }
const state = (fn,arg) => page.evaluate(async ([source,arg]) => {
  const { useSimStore } = await import('/src/store/useSimStore.ts')
  return Function('store','arg','return ('+source+')(store,arg)')(useSimStore,arg)
},[fn.toString(),arg])
const capture = (name) => page.screenshot({ path:path.join(output,name+'.png') })

try {
  await fs.mkdir(output,{recursive:true})
  await page.goto(baseURL+'/__multimeter-fixture__')
  await page.evaluate(async () => {
    const refresh=(await import('/@react-refresh')).default
    refresh.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true
    const main=await (await fetch('/src/main.tsx')).text()
    const dep=(name)=> { const found=main.match(new RegExp('"([^"\\n]*\\/'+name+'\\.js\\?v=[^"\\n]+)"')); if(!found)throw Error('Dependência Vite: '+name); return found[1] }
    await Promise.all([...main.matchAll(/import "([^"\n]+\.css(?:\?[^"\n]*)?)"/g)].map(match=>import(match[1])))
    const React=(await import(dep('react'))).default, ReactDOM=(await import(dep('react-dom_client'))).default
    const { BrowserRouter }=await import(dep('react-router-dom'))
    const { default:App }=await import('/src/App.tsx'), { default:DialogHost }=await import('/src/ui/dialogs.tsx')
    const { useSimStore }=await import('/src/store/useSimStore.ts'), { usePlanStore }=await import('/src/saas/usePlan.ts')
    const { createComponent }=await import('/src/electrical/factory.ts')
    const { componentPanelXY }=await import('/src/three/panelLayout.ts')
    const { terminalWorld3D }=await import('/src/three/terminal3D.ts')
    const THREE=await import('/node_modules/.vite/deps/three.js')
    usePlanStore.getState().set({role:'admin',plan:null})
    useSimStore.getState().newProject()
    const meter=createComponent('multimeterDm20','MM1','Multímetro — teste local',0,1000,600)
    meter.viewOrientation={x:0,y:-25,z:0}
    useSimStore.setState({components:[meter],wires:[],showLibrary:false})
    const xy=componentPanelXY(meter), pivot=new THREE.Vector3(xy.x,xy.y,0.4)
    for(const [i,terminal] of meter.terminals.entries()) {
      const at=terminalWorld3D(meter,terminal,pivot)
      useSimStore.getState().addWire3D({terminalId:terminal.id},{point:{x:at.x-1.2,y:at.y+i*0.12,z:at.z+0.05}})
    }
    useSimStore.setState({selectedWireId:null,selectedComponentIds:[]})
    useSimStore.getState().setCurrentProjectName('Multímetro — teste local')
    document.documentElement.style.height='100%'; document.body.style.height='100%'; document.getElementById('root').style.height='100%'
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,React.createElement(React.Fragment,null,React.createElement(App,{onBack:()=>{}}),React.createElement(DialogHost))))
  })
  await page.getByRole('button',{name:'Visualização 3D',exact:true}).click()
  await page.waitForFunction(async()=> {
    const source=await (await fetch('/src/three/Panel3D.tsx')).text()
    const module=source.match(/from "([^"]*\/\@react-three_fiber\.js\?v=[^"]+)"/)[1]
    const {_roots}=await import(module)
    return [..._roots.values()].some(root=>root.store.getState().scene.getObjectByName('occurrence_of_Cube002_Material008_0'))
  },null,{timeout:30000})
  // Compara o CAD realmente montado com o mesmo GLB centrado, no referencial dos
  // bornes. A geometria isolada já passava; o erro existia na montagem do painel.
  const alignment=async()=>page.evaluate(async()=> {
    const source=await (await fetch('/src/three/Panel3D.tsx')).text()
    const {_roots}=await import(source.match(/from "([^"]*\/\@react-three_fiber\.js\?v=[^"]+)"/)[1])
    const THREE=await import('/node_modules/.vite/deps/three.js')
    const {useSimStore}=await import('/src/store/useSimStore.ts')
    const {getComponentModelSpec}=await import('/src/three/modelPaths.ts')
    const {cloneModelScene,fitComponentModel}=await import('/src/three/modelFit.ts')
    const {createGltfLoader}=await import('/src/three/gltfLoader.ts')
    const {orientationRadians}=await import('/src/three/componentOrientation.ts')
    const {terminalWorld3D}=await import('/src/three/terminal3D.ts')
    const state=[..._roots.values()].map(root=>root.store.getState()).find(root=> {
      let connected=false; root.scene.traverse(node=>{if(node.userData.wireEndType)connected=true})
      return connected&&root.scene.getObjectByName('occurrence_of_Cube002_Material008_0')
    })
    const glass=state.scene.getObjectByName('occurrence_of_Cube002_Material008_0')
    state.scene.updateMatrixWorld(true)
    let instance=glass.parent
    while(instance&&!instance.userData.wireSurface) instance=instance.parent
    if(!instance)throw Error('Instância do multímetro não encontrada')
    const meter=useSimStore.getState().components[0]
    const spec=getComponentModelSpec(meter.type)
    const model=fitComponentModel(cloneModelScene((await createGltfLoader().loadAsync(spec.path)).scene),spec)
    const referenceGlass=model.getObjectByName(glass.name)
    let referenceMesh,renderedMesh
    referenceGlass.traverse(node=>{if(!referenceMesh&&node.isMesh)referenceMesh=node})
    glass.traverse(node=>{if(!renderedMesh&&node.isMesh)renderedMesh=node})
    const local=referenceMesh.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(referenceMesh.matrixWorld)
    const pivot=instance.getWorldPosition(new THREE.Vector3())
    const transform=point=> {
      const scale=meter.view3DScale
      if(scale)point.multiply(new THREE.Vector3(scale.x,scale.y,scale.z))
      point.applyEuler(new THREE.Euler(...orientationRadians(meter.viewOrientation)))
      if(meter.mirrored)point.x*=-1
      return point.applyAxisAngle(new THREE.Vector3(0,0,1),-(meter.rotation??0)*Math.PI/180).add(pivot)
    }
    const expected=transform(local)
    const actual=renderedMesh.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(renderedMesh.matrixWorld)
    return {errorMm:actual.distanceTo(expected)*100,connections:meter.terminals.map(t=>({id:t.id,position:terminalWorld3D(meter,t,pivot).toArray()})),wires:useSimStore.getState().wires.length}
  })
  for(const [index,orientation] of [{x:0,y:-25,z:0},{x:18,y:35,z:12}].entries()) {
    await page.evaluate(async(orientation)=> {
      const {useSimStore}=await import('/src/store/useSimStore.ts')
      useSimStore.setState(s=>({components:s.components.map(c=>({...c,viewOrientation:orientation}))}))
    },orientation)
    await page.waitForTimeout(150)
    const report=await alignment()
    check(report.errorMm<0.01,`Orientação ${index+1}: CAD e bornes coincidem (desvio ${report.errorMm.toFixed(4)} mm)`)
    check(report.connections.length===4&&report.wires===4,'As quatro tomadas mantêm os cabos ligados')
    await capture(`multimeter-connected-${index+1}`)
  }
  const before=await state(store=>({terminals:store.getState().components[0].terminals.map(t=>t.id),wires:store.getState().wires.map(w=>[w.fromTerminalId,w.toTerminalId])}))
  await state(store=>store.getState().loadJSON(store.getState().saveJSON()))
  const after=await state(store=>({terminals:store.getState().components[0].terminals.map(t=>t.id),wires:store.getState().wires.map(w=>[w.fromTerminalId,w.toTerminalId])}))
  assert.deepEqual(after,before,'Guardar/reabrir preserva os bornes e as ligações')
  console.log('PASS — Guardar/reabrir preserva os bornes e as ligações')
  await page.evaluate(async()=> {
    const {useSimStore}=await import('/src/store/useSimStore.ts')
    const {nativePartidaDiretaContent}=await import('/src/project/nativeProjects.ts')
    useSimStore.getState().loadJSON(JSON.stringify(nativePartidaDiretaContent()))
  })
  await page.waitForFunction(async()=> {
    const source=await(await fetch('/src/three/Panel3D.tsx')).text()
    const {_roots}=await import(source.match(/from "([^"]*\/\@react-three_fiber\.js\?v=[^"]+)"/)[1])
    let probes=0,bananas=0,doubles=0,ports=0
    for(const root of _roots.values())root.store.getState().scene.traverse(node=>{if(node.userData.wireEndType==='probe')probes++;if(node.userData.wireEndType==='banana')bananas++;if(node.userData.wireEndType==='ferruleDouble')doubles++;if(node.userData.ferrulePort)ports++})
    return probes===2&&bananas===2&&doubles===11&&ports===22
  },null,{timeout:30000})
  check(true,'Nativo renderiza duas fichas banana, duas sondas e onze ponteiras duplas com vinte e duas entradas')
  const stopClean=await state(store=>{
    const s=store.getState()
    return s.sim.runState==='stopped' && s.grafcetRuntime.active.length===0 && s.components.every(c=>!c.state.lit&&!c.state.energized&&!c.state.running)
  })
  check(stopClean,'Em STOP inicial tudo permanece desligado (sinalizadores, GRAFCET e motor)')
  await page.keyboard.press('Home')
  await page.waitForTimeout(200)
  await page.evaluate(async()=> {
    const {useSimStore}=await import('/src/store/useSimStore.ts')
    useSimStore.getState().play()
    useSimStore.getState().setComponentState('native-push',{startPressed:true})
  })
  await page.waitForFunction(async()=> {
    const {useSimStore}=await import('/src/store/useSimStore.ts')
    const s=useSimStore.getState(),meter=s.components.find(c=>c.id==='native-mm1')
    const {meterInputFor}=await import('/src/electrical/meterModel.ts')
    const {DM20_DEFINITION}=await import('/src/three/MultimeterDm20Panel.tsx')
    return Math.abs(meterInputFor(DM20_DEFINITION,meter,s.components,s.wires,s.runtime.energizedTerminals,meter.state.catalogVars).vac-400)<0.01
  },null,{timeout:30000})
  check(true,'Multímetro renderizado mede 400 V na entrada do motor em RUN')
  await page.waitForTimeout(300)
  await capture('native-motor-meter-run')
  await page.evaluate(async()=> {
    const source=await(await fetch('/src/three/Panel3D.tsx')).text()
    const {_roots}=await import(source.match(/from "([^"]*\/\@react-three_fiber\.js\?v=[^"]+)"/)[1])
    const state=[..._roots.values()].map(root=>root.store.getState()).find(s=>{let probe=false;s.scene.traverse(n=>{if(n.userData.wireEndType==='probe')probe=true});return probe}),controls=state.controls
    state.camera.position.copy(controls.target).add({x:9,y:1,z:0.8})
    state.camera.lookAt(controls.target);controls.update();state.invalidate()
  })
  await page.waitForTimeout(150)
  await capture('native-motor-meter-side')
  await page.evaluate(async()=> {
    const source=await(await fetch('/src/three/Panel3D.tsx')).text()
    const {_roots}=await import(source.match(/from "([^"]*\/\@react-three_fiber\.js\?v=[^"]+)"/)[1])
    const state=[..._roots.values()].map(root=>root.store.getState()).find(s=>{let probe=false;s.scene.traverse(n=>{if(n.userData.wireEndType==='probe')probe=true});return probe})
    state.scene.updateMatrixWorld(true)
    const ends=[];state.scene.traverse(n=>{if(n.userData.wireEndType==='probe')ends.push(n.getWorldPosition(state.camera.position.clone()))})
    const center=ends[0].clone().add(ends[1]).multiplyScalar(0.5);center.y+=0.65
    state.controls.target.copy(center);state.camera.position.copy(center).add({x:2.2,y:1.5,z:3.4});state.camera.zoom=1.7;state.camera.updateProjectionMatrix();state.controls.update();state.invalidate()
  })
  await page.waitForTimeout(200)
  await capture('native-motor-double-ferrule-detail')
  await state(store=>store.getState().stop())
  check(errors.length===0,'Sem erros JavaScript')
} catch(error) {
  console.error('Erros da página:',errors)
  console.error(await page.locator('body').innerText().catch(()=>''))
  await capture('failure').catch(()=>{})
  throw error
} finally { await browser.close() }
