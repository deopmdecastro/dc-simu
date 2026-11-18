import { browserFixture } from './browser-fixture.mjs'
export async function adminFixture(options={}){return attachAdmin(await browserFixture({height:1000,...options}))}
export async function attachAdmin(f){
 const {page}=f
 await page.evaluate(async()=>{
  const {default:Editor}=await import('/src/admin/editor3d/ComponentEditor3D.tsx')
  const text=await(await fetch('/src/admin/editor3d/ComponentEditor3D.tsx')).text(),{MemoryRouter}=await import(text.match(/from "([^"]*\/react-router-dom\.js\?v=[^"]+)"/)[1])
  const viewport=await(await fetch('/src/admin/editor3d/Viewport.tsx')).text(),{_roots}=await import(viewport.match(/from "([^"]*\/@react-three_fiber\.js\?v=[^"]+)"/)[1])
  window.__fixtureThree=await import('/node_modules/.vite/deps/three.js')
  await window.__fixtureImport('/src/admin/editor3d/editorStore.ts')
  window.__adminState=()=>[..._roots.values()].map(r=>r.store.getState()).find(r=>r.gl?.domElement.isConnected&&r.gl.domElement.closest('.ce-root'))
  window.__adminRootDiagnostics=()=>[..._roots.values()].map(r=>{const s=r.store.getState();return{connected:s.gl?.domElement.isConnected,editor:!!s.gl?.domElement.closest('.ce-root'),scene:s.scene?.uuid,canvas:s.gl?.domElement.outerHTML.slice(0,160)}})
  window.__renderAdmin=id=>window.__fixtureRoot.render(window.__fixtureReact.createElement(MemoryRouter,{key:id,initialEntries:['/admin/editor/'+id]},window.__fixtureReact.createElement(Editor,{id,onClose(){}})))
 })
 const editor=(fn,arg)=>page.evaluate(async({source,arg})=>{const {useEditorStore}=await window.__fixtureImport('/src/admin/editor3d/editorStore.ts');return Function('s','arg','return ('+source+')(s,arg)')(useEditorStore,arg)},{source:fn.toString(),arg})
 const frame=()=>page.evaluate(()=>window.__fixtureFrames())
 const point=async(name=null)=>{
  // Readiness and projection must be atomic: the real Admin can replace its
  // Canvas while a saved GLB finishes loading. Do not retain a detached root.
  const handle=await page.waitForFunction(name=>{
   const {useEditorStore}=window.__fixtureModule('/src/admin/editor3d/editorStore.ts'),r=window.__adminState?.(),T=window.__fixtureThree
   if(!r)return false
   const parts=useEditorStore.getState().def.parts;if(!parts.length)return false
   r.scene.updateMatrixWorld(true);const b=new T.Box3()
   for(const part of parts){const o=r.scene.getObjectByName(part.id);if(!o)return false;let meshes=0;o.traverse(n=>{if(n.isMesh&&n.geometry?.attributes.position?.count)meshes++});if(!meshes)return false;b.expandByObject(o,true)}
   if(b.isEmpty())return false
   const object=name?r.scene.getObjectByName(name):null;if(name&&!object)return false
   const center=b.getCenter(new T.Vector3()),size=b.getSize(new T.Vector3()),distance=Math.max(size.x/r.camera.aspect,size.y)/(2*Math.tan(r.camera.fov*Math.PI/360))*1.35+size.z
   r.camera.position.set(center.x,center.y,b.max.z+distance);r.camera.lookAt(center);r.camera.updateProjectionMatrix();r.controls?.target.copy(center);r.controls?.update();r.invalidate()
   if(!name)return{ready:true}
   const box=new T.Box3().setFromObject(object,true),p=box.getCenter(new T.Vector3());p.z=box.max.z;p.project(r.camera);const rect=r.gl.domElement.getBoundingClientRect()
   return{x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2}
  },name,{timeout:60000})
  const result=await handle.jsonValue();await handle.dispose();return name?result:null
 }
 const click=async name=>{const p=await point(name);await frame();await page.mouse.click(p.x,p.y);await frame()}
 const wait=async id=>{
  await page.waitForFunction(id=>{const {useEditorStore}=window.__fixtureModule('/src/admin/editor3d/editorStore.ts');const s=useEditorStore.getState(),r=window.__adminState?.();return s.entry?.id===id&&s.def.parts.some(p=>!!r?.scene.getObjectByName(p.id))},id,{timeout:60000})
  await editor(s=>s.getState().set({view:{...s.getState().view,terminals:false,grid:false,floor:false},hiddenTerminals:s.getState().def.terminals.map(t=>t.id)}));await frame();await point()
 }
 const open=async type=>{
  const summary=await page.evaluate(async type=>{
   const {buildBuiltinDraft}=await window.__fixtureImport('/src/admin/editor3d/builtinComponents.ts'),{catalogApi}=await window.__fixtureImport('/src/catalog/catalogApi.ts'),draft=await buildBuiltinDraft(type),id='mfr-ui-'+type.toLowerCase()
   await catalogApi.save(id,draft.meta,draft.def);window.__renderAdmin(id)
   return{id,usedModel:draft.usedModel,usedComposite:draft.usedComposite,terminals:draft.def.terminals.map(t=>({id:t.id,label:t.label,position3D:t.position3D})),controls:draft.def.controls??[],lights:draft.def.lights,meta:draft.meta}
  },type);await wait(summary.id);return summary
 }
 // Saving really renders a new offscreen cover before IndexedDB persists it.
 // SwiftShader can spend more than the generic 30 s in that synchronous click
 // handler; keep a bounded render budget, then independently require saved state.
 const reopen=async id=>{await page.getByRole('button',{name:'Guardar rascunho',exact:true}).click({timeout:120000});await page.waitForFunction(()=>!window.__fixtureModule('/src/admin/editor3d/editorStore.ts').useEditorStore.getState().dirty,undefined,{timeout:90000});await page.evaluate(async id=>{window.__fixtureRoot.render(null);await window.__fixtureFrames();window.__renderAdmin(id)},id);await wait(id)}
 const publish=async()=>{
  // Publishing deliberately leaves the editor and clears its entry. Capture
  // identity before using the actual UI, then verify persisted data by that ID.
  const id=await editor(s=>s.getState().entry?.id);if(!id)throw new Error('No opened Admin entry to publish')
  await page.getByRole('button',{name:'Publicar…',exact:true}).click();const modal=page.getByRole('dialog',{name:'Publicar nova versão'});await modal.getByRole('button',{name:/Publicar v\d+/,exact:true}).click()
  await page.waitForFunction(()=>{const modal=document.querySelector('[role="dialog"][aria-label="Publicar nova versão"]');return !modal||!!modal.querySelector('.ce-error')?.textContent?.trim()},undefined,{timeout:90000})
  const errors=await modal.locator('.ce-error').allTextContents();if(errors.length)throw new Error('Actual Admin publication rejected: '+errors.join(' | '))
  await modal.waitFor({state:'hidden',timeout:90000})
  const result=await page.evaluate(async id=>{const {catalogApi}=await window.__fixtureImport('/src/catalog/catalogApi.ts'),entry=await catalogApi.adminGet(id);return{id,version:entry.versions.at(-1)}},id)
  if(!result.version)throw new Error('No version from actual Admin publish');return result
 }
 return{...f,editor,frame,point,click,open,reopen,publish}
}
