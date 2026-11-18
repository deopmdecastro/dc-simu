import React from 'react'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import IecPageStatic,{iecPageBounds} from '../src/export/IecPageStatic'
import { commandWirePoints,commandSegmentDrag,moveCommandSegment } from '../src/commands/geometry'
import type { CommandsDiagram } from '../src/commands/model'
import { assertions } from './lib/electrical-fixture'
const {check,done}=assertions()
const d:CommandsDiagram={parts:[{id:'a',kind:'coil',tag:'K1',x:100,y:100,rot:0},{id:'b',kind:'lamp',tag:'H1',x:300,y:350,rot:90}],wires:[{id:'w',a:{part:'a',term:1},b:{part:'b',term:0},mid:250,color:'red'}],pages:[{id:'p',name:'One'},{id:'other',name:'Two'}]}
const byId=new Map(d.parts.map(p=>[p.id,p]));d.wires[0]=moveCommandSegment(d.wires[0],commandSegmentDrag(d.wires[0],byId,0)!,-480)
const points=commandWirePoints(d.wires[0],byId),path=points.map((p,i)=>`${i?'L':'M'} ${p.x} ${p.y}`).join(' ')
const svg=renderToStaticMarkup(<IecPageStatic diagram={d} pageId="p" free={[]}/>),box=iecPageBounds(d,'p',[])!
check(svg.includes(`d="${path}"`),'static PDF SVG uses exactly the edited route, not a newly generated default')
check(points.every(p=>p.x>=box.x&&p.x<=box.x+box.w&&p.y>=box.y&&p.y<=box.y+box.h),'export bounds include outlying route legs, not just symbols')
check(!/data-cmd-wire|onPointer|ns-resize|transparent/.test(svg),'export contains no interactive hit areas or handles')
check(!renderToStaticMarkup(<IecPageStatic diagram={d} pageId="other" free={[]}/>),'other pages do not acquire orphan routes')
const ends=structuredClone(d.wires[0]);d.parts[0].x+=1
assert.deepEqual(d.wires[0],ends)
check(commandWirePoints(d.wires[0],new Map(d.parts.map(p=>[p.id,p])))[0].x===101,'after a fine endpoint move, export remains attached to terminal identity')
done('route/export assertions')
