import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { browserFixture } from './lib/browser-fixture.mjs'
const output=process.env.GRAFCET_LIFECYCLE_OUTPUT||path.resolve('runtime/editor-lifecycle'),f=await browserFixture({baseURL:process.env.INDUSTRIAL_TEST_URL,output}),{page,check}=f
const fixture={name:'Geometry lifecycle',steps:[{id:'s0',name:'0',initial:true,action:'',condition:'',x:220,y:120,pinned:true},{id:'s1',name:'1',initial:false,action:'Q0.0',condition:'',x:220,y:400,pinned:true}],transitions:[{id:'t0',from:['s0'],to:['s1'],condition:'I0.0'}],linkBends:{t0:[{x:220,y:220},{x:380,y:220},{x:380,y:340},{x:220,y:340}]},linkBars:{t0:{x:380,y:280}},comments:[{id:'note',text:'Mixed geometry',x:440,y:150,font:'sans',fontSize:14}]}
const commands={parts:[{id:'a',kind:'coil',tag:'K1',x:180,y:160,rot:0},{id:'b',kind:'lamp',tag:'H1',x:420,y:400,rot:0}],wires:[{id:'w',a:{part:'a',term:1},b:{part:'b',term:0},bends:[{x:180,y:320},{x:420,y:320}]}]}
const store=(fn,arg)=>page.evaluate(async({source,arg})=>{const {useSimStore}=await window.__fixtureImport('/src/store/useSimStore.ts');return Function('s','arg','return ('+source+')(s,arg)')(useSimStore,arg)},{source:fn.toString(),arg})
const frame=()=>page.evaluate(()=>window.__fixtureFrames()),program=()=>store(s=>s.getState().grafcet),readIEC=()=>store(s=>({commands:s.getState().commands,texts:s.getState().canvasTexts}))
const seed=async(mode='grafcet',p=fixture)=>{
 await page.evaluate(async()=>{window.__fixtureRoot.render(null);await window.__fixtureFrames()})
 await store((s,arg)=>{s.getState().newProject();s.setState({demoMode:false,components:[],wires:[],history:[],future:[],sim:{...s.getState().sim,runState:'stopped'}});s.getState().setGrafcet(arg.p,'force');s.getState().setCommands(arg.commands,'force');s.setState({canvasTexts:[{id:'iec-note',view:'commands',text:'IEC text',x:470,y:200,size:14,font:'sans',color:'#334155'}],history:[],future:[]})},{p,commands})
 await page.evaluate(async mode=>{const {useGrafcetUi}=await window.__fixtureImport('/src/grafcet/grafcetBus.ts'),{useCommandsUi}=await window.__fixtureImport('/src/commands/commandsUi.ts');useCommandsUi.getState().stop();useGrafcetUi.setState({tool:'select',snapOn:true});useCommandsUi.getState().selectGroup([],[],[]);useCommandsUi.setState({tool:'select',selection:null,selectedPartIds:[],selectedTextIds:[],selectedLabelIds:[],gridOn:true,snapOn:true});window.__renderEditors(mode)},mode)
 await page.locator(mode==='grafcet'?'.grafcet-canvas':'.dc-cmd-canvas').waitFor();await frame()
 // Finish framing with the actual shortcut before taking pointer coordinates.
 // CommandsEditor schedules its initial fit at 60 ms; a fast warm-cache drag
 // otherwise hits the old position while that fit moves the text under it.
 if(mode==='commands'){await page.keyboard.press('Control+0');await frame()}
}
const beginDrag=async locator=>{const b=await locator.boundingBox();if(!b)throw new Error('No draggable DOM geometry');const p={x:b.x+b.width/2,y:b.y+b.height/2};await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+65,p.y+37,{steps:4});await frame();return p}
const release=async(kind,locator)=>{
 if(kind==='Escape')await page.keyboard.press('Escape')
 else if(kind==='blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')))
 else if(kind==='pointercancel')await locator.dispatchEvent('pointercancel',{pointerId:1})
 else if(kind==='F6'||kind==='F5')await page.keyboard.press(kind)
 else if(kind==='RUN'){
  // Invoke the mounted Toolbar handler without releasing the held pointer first.
  const commands=await page.locator('.dc-cmd-canvas').count()
  await page.getByRole('button',{name:'Play',exact:true}).evaluate(button=>button.click())
  const dialog=page.getByRole('alertdialog',{name:'Âmbito da simulação'})
  await dialog.locator('[data-choice="'+(commands?'commands':'grafcet')+'"]').evaluate(button=>button.click())
  await dialog.locator('[data-choice="'+(commands?'commands':'grafcet')+'"][aria-checked="true"]').waitFor()
  await dialog.getByRole('button',{name:'Iniciar',exact:true}).evaluate(button=>button.click())
  await page.waitForFunction(commands=>commands?window.__fixtureModule('/src/commands/commandsUi.ts').useCommandsUi.getState().rt.running:window.__fixtureModule('/src/store/useSimStore.ts').useSimStore.getState().sim.runState==='running',!!commands)
 }else if(kind==='RUN-panel')await store(s=>s.getState().play())
 else if(kind==='STEP-panel')await store(s=>s.getState().step())
 else if(kind==='unmount')await page.evaluate(async()=>{window.__fixtureRoot.render(null);await window.__fixtureFrames()})
 await page.mouse.up();await frame()
}
try{
 await page.evaluate(async()=>{
  const {default:Grafcet}=await import('/src/grafcet/GrafcetEditor.tsx'),{default:Commands}=await import('/src/commands/CommandsEditor.tsx'),{default:Toolbar}=await import('/src/components/Toolbar.tsx'),{default:DialogHost}=await import('/src/ui/dialogs.tsx'),R=window.__fixtureReact
  function Editors({initial}){const [mode,setMode]=R.useState(initial);return R.createElement('div',{style:{height:'100%',display:'flex',flexDirection:'column'}},R.createElement(DialogHost),R.createElement(Toolbar,{mode,setMode,views:['grafcet','commands'],ladderSection:'ob1',setLadderSection(){},onBack(){}}),R.createElement('div',{style:{flex:1,minHeight:0,display:'flex',flexDirection:'column'}},mode==='grafcet'?R.createElement(Grafcet,{full:true}):R.createElement(Commands)))}
  window.__renderEditors=mode=>window.__fixtureRoot.render(R.createElement(Editors,{initial:mode}))
 })
 for(const kind of ['Escape','pointercancel','blur','F6','RUN','unmount']){
  await seed();const node=page.locator('[data-step-id="s0"] .grafcet-step-box'),before=await program();await beginDrag(node);await release(kind,node);check(JSON.stringify(await program())===JSON.stringify(before),'GRAFCET step '+kind+': preview cancels without changing geometry/topology');check(await store(s=>s.getState().history.length)===0,'GRAFCET step '+kind+': no phantom undo entry')
 }
 for(const kind of ['Escape','pointercancel','blur','F6','RUN','unmount']){
  await seed();await page.locator('[data-step-id="s0"] .grafcet-step-box').click();const handle=page.locator('[data-step-id="s0"] [data-resize="e"]').first(),before=await program();await beginDrag(handle);await release(kind,handle);check(JSON.stringify(await program())===JSON.stringify(before),'GRAFCET resize '+kind+': native window listeners rollback')
 }
 for(const kind of ['Escape','pointercancel','blur','F6','RUN','unmount']){
  await seed();const text=page.locator('[data-grafcet-text="note"] .grafcet-free-text-frame'),before=await program();await beginDrag(text);await release(kind,text);check(JSON.stringify(await program())===JSON.stringify(before),'GRAFCET free text '+kind+': cancelled drag does not commit')
 }
 await seed();await page.locator('[data-step-id="s0"] .grafcet-step-box').click();await page.keyboard.press('Control+a');const before=await program();await page.keyboard.press('ArrowRight');let moved=await program(),dx=moved.steps[0].x-before.steps[0].x
 check(dx>0&&moved.steps.every((s,i)=>s.x-before.steps[i].x===dx)&&moved.comments[0].x-before.comments[0].x===dx,'GRAFCET mixed arrows move all selected steps and free text rigidly')
 check(moved.linkBars.t0.x-before.linkBars.t0.x===dx&&moved.linkBends.t0.every((p,i)=>p.x-before.linkBends.t0[i].x===dx),'GRAFCET internal bars and orthogonal route translate with all endpoints')
 await page.keyboard.press('Shift+ArrowRight');const coarse=await program();check(coarse.steps[0].x-moved.steps[0].x===dx*5,'GRAFCET Shift+arrow provides coarse movement')
 await page.keyboard.press('Control+c');const dest={name:'Destination',charts:[{id:'destination',name:'Destination'}],activeChart:'destination',steps:[],transitions:[],comments:[]};await seed('grafcet',dest);await page.keyboard.press('Control+v');const pasted=await program()
 check(pasted.steps.length===2&&pasted.steps.every(s=>s.chart==='destination'&&!fixture.steps.some(old=>old.id===s.id)),'actual cross-project paste remaps IDs into destination chart')
 const t=pasted.transitions[0];check(t&&t.from.every(id=>pasted.steps.some(s=>s.id===id))&&t.to.every(id=>pasted.steps.some(s=>s.id===id))&&pasted.linkBars?.[t.id]&&pasted.linkBends?.[t.id]?.length,'actual paste retains internal topology, edited bar and route')
 check(pasted.comments?.some(c=>c.text==='Mixed geometry'&&c.chart==='destination'),'actual paste retains mixed free text in destination chart')
 const saved=await store(s=>s.getState().saveJSON());await store((s,json)=>{s.getState().newProject();s.getState().loadJSON(json)},saved);check(JSON.stringify((await program()).linkBends)===JSON.stringify(pasted.linkBends),'actual pasted custom route survives save/load')
 for(const kind of ['Escape','pointercancel','blur','F5','RUN','RUN-panel','STEP-panel','unmount']){
  await seed('commands');const text=page.locator('[data-cmd-text="iec-note"]'),before=await readIEC();await beginDrag(text);await release(kind,text);check(JSON.stringify(await readIEC())===JSON.stringify(before),'IEC free text '+kind+': cancellation restores exact document and text position')
 }
 // Exercise the editor's group gesture deliberately, not through stale selection
 // leaking between fixtures. Its text previews are live but must roll back in
 // the same transport update, even before pointerup or a React effect commits.
 for(const kind of ['Escape','pointercancel','RUN','RUN-panel','STEP-panel','unmount']){
  await seed('commands');await page.keyboard.press('Control+a');const text=page.locator('[data-cmd-text="iec-note"]'),before=await readIEC();await beginDrag(text)
  check((await readIEC()).texts[0].x!==before.texts[0].x,'IEC mixed group '+kind+': actual group text preview moved before cancellation')
  await release(kind,text);check(JSON.stringify(await readIEC())===JSON.stringify(before),'IEC mixed group '+kind+': cancellation restores parts, routes and live text positions')
  check(await store(s=>s.getState().history.length)===0,'IEC mixed group '+kind+': no phantom undo entry')
 }
 await seed('commands');await page.locator('[data-cmd-part="a"]').click();const original=await readIEC();await page.keyboard.press('Alt+ArrowRight');const fine=await readIEC();check(fine.commands.parts[0].x-original.commands.parts[0].x===1,'IEC Alt+arrow moves exactly one world unit')
 await page.keyboard.press('Shift+ArrowDown');const large=await readIEC();check(large.commands.parts[0].y-fine.commands.parts[0].y===100,'IEC Shift+arrow moves five 20-unit grid steps')
 await page.keyboard.press('Control+z');check((await readIEC()).commands.parts[0].y===fine.commands.parts[0].y,'IEC actual Undo restores keyboard geometry');await page.keyboard.press('Control+y');check((await readIEC()).commands.parts[0].y===large.commands.parts[0].y,'IEC actual Redo restores keyboard geometry')
 await page.screenshot({path:path.join(output,'iec-and-grafcet-lifecycle.png')});f.stable();await writeFile(path.join(output,'results.json'),JSON.stringify({assertions:f.count(),exceptions:f.errors,scope:'Actual Toolbar F6 and mounted React GRAFCET/IEC canvases; isolated local synthetic documents, no cloud.'},null,2));console.log(`\nPASS — ${f.count()} actual editor lifecycle assertions`)
}catch(e){console.error(f.errors);await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});throw e}finally{await f.browser.close()}
