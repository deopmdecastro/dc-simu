import assert from 'node:assert/strict'
import { createComponent, terminalByLabel } from '../../src/electrical/factory'
import { computeContinuity, sourceTerminalIds } from '../../src/electrical/engine'
import { computePhaseLabels } from '../../src/electrical/phases'
import type { ElectricalComponent, Wire, ComponentType } from '../../src/types'
export const make=(type:ComponentType)=>createComponent(type)
export const terminal=(c:ElectricalComponent,label:string)=>{const t=terminalByLabel(c,label);assert.ok(t,`${c.type}.${label}`);return t.id}
let serial=0
export const cable=(a:ElectricalComponent,al:string,b:ElectricalComponent,bl:string):Wire=>({id:`fixture-${serial++}`,fromTerminalId:terminal(a,al),toTerminalId:terminal(b,bl),color:'black',gauge:'1.5mm²',kind:'power',route:'straight',flexibility:'flexible',bend:.5,energized:false} as Wire)
export const graph=(components:ElectricalComponent[],wires:Wire[])=>computeContinuity(components,wires,sourceTerminalIds(components,undefined,wires))
export const context=(components:ElectricalComponent[],wires:Wire[])=>{const g=graph(components,wires);return {components,adjacency:g.reachable,live:g.energizedTerminals,phases:computePhaseLabels(components,wires)}}
export function assertions(){let count=0;return {check:(ok:unknown,label:string)=>{assert.ok(ok,label);console.log('PASS — '+label);count++},done:(scope:string)=>console.log(`\nPASS — ${count} ${scope}`)}}
