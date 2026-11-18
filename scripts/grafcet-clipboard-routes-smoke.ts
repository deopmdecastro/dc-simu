import assert from 'node:assert/strict'
import { cloneSubDiagram } from '../src/grafcet/selection'
import { expandPolyline } from '../src/grafcet/links'
import { writeGrafcetCrossClipboard,readGrafcetCrossClipboard } from '../src/clipboard/crossProjectClipboard'
import { useSimStore } from '../src/store/useSimStore'
import type { GrafcetProgram } from '../src/grafcet/engine'
import { assertions } from './lib/electrical-fixture'
const {check,done}=assertions(),memory=new Map<string,string>()
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>memory.set(k,v)}})
const p:GrafcetProgram={steps:[{id:'s0',name:'0',initial:true,action:'',condition:'',x:100,y:100,pinned:true},{id:'s1',name:'1',initial:false,action:'Q0.0',condition:'',x:100,y:400,pinned:true},{id:'outside',name:'2',initial:false,action:'',condition:''}],transitions:[{id:'t0',from:['s0'],to:['s1'],condition:'I0.0'},{id:'external',from:['s1'],to:['outside'],condition:'1'}],linkBends:{t0:[{x:100,y:200},{x:260,y:200},{x:260,y:300},{x:100,y:300}],external:[{x:500,y:500}]},linkBars:{t0:{x:260,y:250}},comments:[{id:'text',text:'Keep me',x:80,y:70,font:'serif',italic:true}]}
let n=0
const clone=()=>cloneSubDiagram(p.steps,p.transitions!,['s0','s1'],id=>p.steps.find(s=>s.id===id)! ,{dx:60,dy:80},()=>`new-${n++}`,' copy',p)
const source=JSON.stringify(p),copy=clone(),tid=copy.transitions[0].id
check(copy.steps.length===2&&copy.transitions.length===1,'only internal transitions are copied')
check(!copy.steps[0].initial&&copy.steps[0].id!=='s0','copied initial step is not another startup step')
check(copy.transitions[0].from[0]===copy.steps[0].id&&copy.transitions[0].to[0]===copy.steps[1].id,'all copied endpoints are remapped, never linked back to originals')
assert.deepEqual(copy.linkBars?.[tid],{x:320,y:330});assert.deepEqual(copy.linkBends?.[tid],p.linkBends!.t0.map(v=>({x:v.x+60,y:v.y+80})))
check(Object.keys(copy.linkBends!).join()===tid,'routes and bars are rekeyed and rigidly translated')
check(copy.comments![0].id!=='text'&&copy.comments![0].text==='Keep me'&&copy.comments![0].italic&&copy.comments![0].x===140,'mixed free text content, style and relative position survive')
check(JSON.stringify(p)===source,'clipboard clone leaves all source data untouched')
writeGrafcetCrossClipboard({stepIds:['s0','s1'],steps:p.steps,transitions:p.transitions!,positions:p.steps.map(s=>({id:s.id,x:s.x??0,y:s.y??0})),linkBends:p.linkBends,linkBars:p.linkBars,comments:p.comments})
const read=readGrafcetCrossClipboard()!;assert.deepEqual(read.linkBends,p.linkBends);assert.deepEqual(read.comments,p.comments)
check(true,'cross-project storage includes route, bar and mixed text data')
const textOnly=cloneSubDiagram([],[],[],()=>({x:0,y:0}),{dx:1,dy:2},()=>`n-${n++}`,'', {comments:p.comments})
check(textOnly.comments?.[0].y===72&&!textOnly.steps.length,'text-only clipboard is a valid selection')
const st=()=>useSimStore.getState();st().newProject('grafcet');st().setGrafcet({...p,steps:[...p.steps,...copy.steps],transitions:[...p.transitions!,...copy.transitions],linkBends:{...p.linkBends,...copy.linkBends},linkBars:{...p.linkBars,...copy.linkBars}},'force')
const saved=st().saveJSON();st().newProject();st().loadJSON(saved);assert.deepEqual(st().grafcet.linkBars?.[tid],copy.linkBars![tid])
check(expandPolyline(st().grafcet.linkBends![tid]).every((v,i,a)=>i===0||v.x===a[i-1].x||v.y===a[i-1].y),'saved pasted route stays orthogonal after reload')
done('GRAFCET clipboard/route assertions')
