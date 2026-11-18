import assert from 'node:assert/strict'
import { commandWirePoints, commandSegmentDrag, moveCommandSegment, moveCommandsSelection } from '../src/commands/geometry'
import { terminalAt, type CommandsDiagram } from '../src/commands/model'
import { useSimStore } from '../src/store/useSimStore'
import { assertions } from './lib/electrical-fixture'
const {check,done}=assertions()
const initial:CommandsDiagram={parts:[{id:'a',kind:'coil',tag:'K1',x:100,y:100,rot:0},{id:'b',kind:'lamp',tag:'H1',x:300,y:280,rot:0},{id:'c',kind:'node',tag:'',x:460,y:420,rot:0}],wires:[{id:'internal',a:{part:'a',term:1},b:{part:'b',term:0},mid:220},{id:'external',a:{part:'b',term:1},b:{part:'c',term:0}}],texts:[{id:'title',text:'Mixed group',x:180,y:80}]}
const parts=new Map(initial.parts.map(p=>[p.id,p])), wire=initial.wires[0]
const ortho=(p:{x:number;y:number}[])=>p.slice(1).every((v,i)=>v.x===p[i].x||v.y===p[i].y)
const before=JSON.stringify(initial),path=commandWirePoints(wire,parts)
for(let leg=0;leg<path.length-1;leg++){
 const drag=commandSegmentDrag(wire,parts,leg)!
 const changed=moveCommandSegment(wire,drag,37),points=commandWirePoints(changed,parts)
 check(ortho(points),`IEC leg ${leg}: all segments remain orthogonal`)
 assert.deepEqual(points[0],terminalAt(initial.parts[0],1));assert.deepEqual(points.at(-1),terminalAt(initial.parts[1],0))
 check(changed.a===wire.a&&changed.b===wire.b,`IEC leg ${leg}: endpoint identities and terminal anchors unchanged`)
}
const changed=moveCommandSegment(wire,commandSegmentDrag(wire,parts,1)!,80)
const d={...initial,wires:[changed,initial.wires[1]]}
const moved=moveCommandsSelection(d,['a','b'],['title'],1,100)
check(moved.parts[0].x===101&&moved.parts[1].y===380&&moved.texts![0].x===181,'fine/coarse mixed move preserves relative geometry')
check(moved.wires[0].bends?.[0].x===changed.bends![0].x+1&&moved.wires[0].bends[0].y===changed.bends![0].y+100,'internal route translates with both selected endpoints')
check(moved.wires[1]===d.wires[1]&&moved.parts[2]===d.parts[2],'external wire and unselected symbols are not rewritten')
check(JSON.stringify(initial)===before,'all drag previews are immutable; cancellation is write-free')
const st=()=>useSimStore.getState();st().newProject('commands');st().setCommands(d,'force');const canonical=structuredClone(st().commands);st().setCommands(moved,'force');const canonicalMoved=structuredClone(st().commands);st().undo();assert.deepEqual(st().commands,canonical);st().redo();assert.deepEqual(st().commands,canonicalMoved)
check(true,'mixed geometry edit is one undo/redo step')
const saved=st().saveJSON();st().newProject();st().loadJSON(saved);assert.deepEqual(st().commands.wires,canonicalMoved.wires)
check(true,'custom orthogonal segments and endpoint identities survive save/reload')
done('IEC geometry assertions')
