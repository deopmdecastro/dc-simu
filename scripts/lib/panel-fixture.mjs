import { browserFixture } from './browser-fixture.mjs'
export async function panelFixture(options={}){return attachPanel(await browserFixture(options))}
export async function attachPanel(f){
 const {page}=f
 await page.evaluate(async()=>{
  const {default:Panel3D}=await import('/src/three/Panel3D.tsx')
  const source=await(await fetch('/src/three/Panel3D.tsx')).text(),dep=source.match(/from "([^"]*\/@react-three_fiber\.js\?v=[^"]+)"/)
  const {_roots}=await import(dep[1]);window.__fixtureThree=await import('/node_modules/.vite/deps/three.js')
  window.__panelState=()=>[..._roots.values()].map(r=>r.store.getState()).find(r=>r.gl.domElement.isConnected)
  const {useSimStore}=await window.__fixtureImport('/src/store/useSimStore.ts');useSimStore.setState({components:[],wires:[],demoMode:false,selectedComponentIds:[]})
  window.__mountPanel=()=>window.__fixtureRoot.render(window.__fixtureReact.createElement(Panel3D,{frontEdit:true}))
  window.__mountPanel()
 })
 const store=(fn,arg)=>page.evaluate(async({source,arg})=>{const {useSimStore}=await window.__fixtureImport('/src/store/useSimStore.ts');return Function('s','arg','return ('+source+')(s,arg)')(useSimStore,arg)},{source:fn.toString(),arg})
 const frame=()=>page.evaluate(()=>window.__fixtureFrames())
 const show=async(type,count=1)=>{
  const ids=await page.evaluate(async({type,count})=>{
   const {useSimStore}=await window.__fixtureImport('/src/store/useSimStore.ts'),{createComponent}=await window.__fixtureImport('/src/electrical/factory.ts')
   useSimStore.getState().stop();useSimStore.setState({components:[],wires:[],canvasNotes:[],canvasTexts:[],selectedComponentIds:[],selectedTerminalId:null,demoMode:false,tool:'select'});await window.__fixtureFrames()
   const components=Array.from({length:count},(_,i)=>createComponent(type,'UI'+i,'',i,i*180,0));useSimStore.setState({components});return components.map(c=>c.id)
  },{type,count})
  await page.waitForFunction(ids=>{
   const r=window.__panelState?.();if(!r)return false
   return ids.every(id=>{let object; r.scene.traverse(o=>{if(o.userData.isComponentRoot&&o.userData.componentId===id)object=o});let meshes=0;object?.traverse(o=>{if(o.isMesh)meshes++});return meshes>0})&&!document.querySelector('.panel3d-loading-overlay')
  },ids,{timeout:60000})
  await page.evaluate(()=>new Promise(r=>setTimeout(r,150)));await frame()
  await page.evaluate(ids=>{
   const r=window.__panelState(),T=window.__fixtureThree,b=new T.Box3();r.scene.updateMatrixWorld(true)
   r.scene.traverse(o=>{if(o.userData.isComponentRoot&&ids.includes(o.userData.componentId))b.expandByObject(o,true)})
   const center=b.getCenter(new T.Vector3()),size=b.getSize(new T.Vector3()),distance=Math.max(size.x/r.camera.aspect,size.y)/(2*Math.tan(r.camera.fov*Math.PI/360))*1.35+size.z
   // Like a real camera gesture, cancel the outstanding 420 ms auto-fit arc
   // before this fixture takes over framing. Otherwise it moves the physical
   // button between point() and native pointerdown, especially on warm caches.
   r.controls?.dispatchEvent({type:'start'})
   r.camera.position.set(center.x,center.y,b.max.z+distance);r.camera.lookAt(center);r.camera.updateProjectionMatrix();r.controls?.target.copy(center);r.controls?.update();r.invalidate()
  },ids);await frame();return ids
 }
 const point=(name,index=0)=>page.evaluate(({name,index})=>{
  const r=window.__panelState(),T=window.__fixtureThree,nodes=[];r.scene.updateMatrixWorld(true);r.scene.traverse(o=>{if(o.name===name)nodes.push(o)})
  if(!nodes[index])throw new Error('Missing actual model node '+name)
  const b=new T.Box3().setFromObject(nodes[index],true),p=b.getCenter(new T.Vector3());p.z=b.max.z;p.project(r.camera)
  const rect=r.gl.domElement.getBoundingClientRect();return{x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2}
 },{name,index})
 const click=async(name,index=0)=>{const p=await point(name,index);await page.mouse.click(p.x,p.y);await frame()}
 return{...f,store,frame,show,point,click}
}
