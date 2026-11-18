import './node-env'
import assert from 'node:assert/strict'
import { deviceLcdFrame, lcdNumber, atv320DisplayText, deviceLcdSegments, type DeviceLcdProfile } from '../src/three/deviceLcd'
import { factoryDeviceDisplay, isLegacyAtvFactoryDisplay } from '../src/catalog/displayCanvas'
import { DEFAULT_META, normalizeDefinition } from '../src/catalog/definition'
import { useEditorStore } from '../src/admin/editor3d/editorStore'
import { mergeVars } from '../src/catalog/behavior'
import { prepareActuatorHead } from '../src/three/actuatorHead'
import { createDigitalMeterObject } from '../src/three/digitalMeterModel'
import { disposeModelClone } from '../src/three/modelFit'
import type * as THREE from 'three'
import type { DisplayDef } from '../src/catalog/types'

let checks = 0
const check = (ok: unknown, text: string) => { assert.ok(ok, text); checks++; console.log('PASS — ' + text) }
const frames = {
  d52: deviceLcdFrame('d52-2066', { on: true, power: 256.3, energy: .22, voltage: 223.8, current: 1.14, frequency: 50, powerFactor: 1 }),
  kws: deviceLcdFrame('kws-306', { on: true, vA: 211, vB: 210.4, vC: 210.4, iA: 7.892, iB: 0, iC: 0, pA: 1.665, pB: 0, pC: 0, energy: .140, frequency: 50, temp: 15 }),
  atv: deviceLcdFrame('atv320', { powered: true, menu: 'ref' }),
}
const cells = (key: keyof typeof frames) => Object.fromEntries(frames[key].cells.map(c => [c.id, c]))
const d = cells('d52'), k = cells('kws'), a = cells('atv')
check(d.power.text === '256.3' && d.energy.text === '0.22' && d.voltage.text === '223.8' && d.current.text === '1.14', 'D52 photographed six-field face uses the supplied readings, never a screenshot')
check(d.frequency.text === '50.0' && d.powerFactor.text === '1.00', 'D52 Hz and PF retain their physical decimal precision')
check(d.power.rect[1] < d.energy.rect[1] && d.voltage.rect[1] === d.frequency.rect[1] && d.current.rect[1] === d.powerFactor.rect[1], 'D52 has two full-width top lines and two paired bottom lines')
check(d.power.color !== d.energy.color && d.voltage.color !== d.current.color && d.frequency.color !== d.powerFactor.color, 'D52 six measured fields retain photographed yellow/orange/cyan/white/red/blue groups')
check(['W','kWh','V','Hz','A','PF'].every(unit => frames.d52.cells.some(c => c.kind === 'legend' && c.text === unit)), 'D52 units are separate legends, not letters mixed into numeral geometry')
for (const [v, expected] of [[999.99,'999.99'],[999.999,'1000.0'],[1234.56,'1234.6'],[9999.99,'10000'],[12345.67,'12346']] as const) check(lcdNumber(v,5,2) === expected, 'D52 five-digit energy resolution/rounding ' + v + ' → ' + expected)
check(lcdNumber(9999.96,5,1) === '10000' && lcdNumber(45000,5,1) === '45000', 'D52 power crosses 9999.9 W without six-digit overflow or rescaling')
check(lcdNumber(NaN,5,2) === '-----' && lcdNumber(Infinity,4,1) === '----' && lcdNumber(-1,4,1) === '----' && lcdNumber(1e30,5,1) === '-----', 'invalid/negative/over-capacity unsigned readings are dashes, never NaN, exponent text or saturation')
check(lcdNumber(0,4,3) === '0.000' && lcdNumber(80,4,3) === '80.00' && lcdNumber(23,4,3) === '23.00', 'KWS physical four-digit channels adapt decimals rather than squeeze extra digits')
check(k['voltage-A'].text === '211.0' && k['current-A'].text === '7.892' && k['power-A'].text === '1.665', 'KWS photographed V/A/kW grid and channel precision')
check(k['voltage-A'].color === '#3932f3' && k['current-A'].color === '#f1322b' && k['power-A'].color === '#edf137', 'KWS voltage is blue-violet, current red and power yellow, not generic cyan text')
check(k.total.text === '0000.140' && k['total-marker'].text === 'SUM' && k['total-unit'].text === 'kWh', 'KWS seven-slot cyan energy footer is explicitly total, never mislabeled phase A')
check(k.frequency.text === '50' && k.temperature.text === '15' && k['temperature-unit'].text === '°C', 'KWS physical footer includes white frequency and temperature')
for (const mode of [0,1,2]) {
  const f=deviceLcdFrame('kws-306',{on:true,screenMode:mode,vA:230,iA:2,pA:.368,pB:.1,pC:.2,energy:2,temp:20})
  const by=Object.fromEntries(f.cells.map(c=>[c.id,c]))
  check(['A','B','C'].every(p=>by['voltage-'+p]&&by['current-'+p]&&by['power-'+p]) && !f.cells.some(c=>['ENERGY','PHASE POWER','TOTAL','KWS-306','ON'].includes(c.text)), 'KWS view '+mode+' keeps the physical face, without invented full-screen pages or branding inside the LCD')
  if(mode===1)check(by['power-unit'].text==='PF'&&by['power-A'].text==='0.80','KWS PF uses the actual same-phase watts/(V×A), not a second fake measurement')
  if(mode===2)check(by.total.text==='0.668'&&by['total-unit'].text==='kW','KWS total-power view uses documented footer fields and real summed kW')
}
const off=deviceLcdFrame('kws-306',{on:true,switchOn:false,vA:230,temp:20})
check(off.cells.find(c=>c.id==='total')?.text==='OFF'&&!off.cells.some(c=>c.id==='total-unit'),'KWS manual OFF opens output without falsely blanking the powered input display')
check(deviceLcdFrame('kws-306',{on:true}).cells.find(c=>c.id==='temperature')?.text==='---','KWS absent temperature is not replaced by a plausible demo temperature')
check(lcdNumber(-20,3,0,false,true)==='-20','KWS signed temperature fits the actual three-slot area')
check(a.value.text === 'rEF-' && a.value.kind === 'segments' && a.value.slots === 4, 'ATV local terminal has four real seven-segment cells and the documented rEF- spelling')
check(atv320DisplayText({powered:true,menu:'conf'})==='COnF' && atv320DisplayText({powered:true,menu:'mon',frequencyHz:12.3})==='12.3', 'ATV COnF and monitoring frequency use documented glyphs/decimal point')
check(atv320DisplayText({powered:true,menu:'ref',editing:true,presetHz:599})==='599.0'&&atv320DisplayText({powered:true,menu:'conf',editing:true,rampUpMs:3500})==='3.5','ATV reference/ramp edit values fit four physical digits')
check(atv320DisplayText({powered:true,deviceFault:true})==='----'&&atv320DisplayText({powered:true,deviceFault:true,faultCode:'OSF'})==='OSF'&&atv320DisplayText({powered:true,deviceFault:true,faultCode:'FAULT'})==='----','ATV boolean fault does not invent a diagnostic cause or print the impossible five-character FAULT')
for (const c of '0123456789rEFCOnUSLF-') check(!!deviceLcdSegments(c), 'physical segment glyph exists for '+c)
for (const profile of ['d52-2066','kws-306','atv320'] as DeviceLcdProfile[]) {
  const state={on:false,powered:false,power:999,energy:999,frequency:50,temp:20},before=JSON.stringify(state)
  check(deviceLcdFrame(profile,state).cells.length===0,'unpowered '+profile+' has no residual digits, units or demo values')
  check(JSON.stringify(state)===before,'drawing '+profile+' does not mutate simulation state')
  const frame=deviceLcdFrame(profile,{on:true,powered:true,temp:20})
  check(frame.cells.every(c=>{const [x,y,w,h]=c.rect;return x>=0&&y>=0&&w>0&&h>0&&x+w<=frame.width&&y+h<=frame.height}),'every '+profile+' physical field lies inside its LCD aperture')
}
const legacy:DisplayDef={id:'authored-id',name:'Altivar · visor local',kind:'text',position:[1,2,3],normal:[0,0,1],roll:0,widthMm:30.3,heightMm:8.1,density:30,background:'#10190d',foreground:'#e54024',powerVar:'powered',hideNodesPart:'glb',hideNodes:['industrial_lcd'],lines:[{id:'line-id',text:'{industrialDisplay}',x:.95,y:.68,size:.72,align:'right'}]}
const original=JSON.stringify(legacy),resolved=factoryDeviceDisplay(legacy,'vfdSchneiderAtv320')
check(isLegacyAtvFactoryDisplay(legacy)&&resolved.deviceFace==='atv320'&&resolved.id===legacy.id&&resolved.position===legacy.position&&JSON.stringify(legacy)===original,'legacy factory compatibility is render-only; IDs, geometry and stored definition are untouched')
check(factoryDeviceDisplay(legacy,'relayFinder5534')===legacy,'same text on an unrelated device never activates a factory override')
for (const patch of [{deviceFace:'custom' as const},{name:'My display'},{foreground:'#00ff00'},{background:'#111111'},{backlightVar:'lamp'},{lines:[{...legacy.lines[0],text:'MY {presetHz}'}]},{lines:[{...legacy.lines[0],size:.6}]}]) {
 const custom={...legacy,...patch};check(factoryDeviceDisplay(custom,'vfdSchneiderAtv320')===custom,'authored display setting is not replaced: '+Object.keys(patch)[0])
}
const def=normalizeDefinition({displays:[{...resolved,deviceFace:'atv320'}]})
check(JSON.parse(JSON.stringify(def)).displays[0].deviceFace==='atv320','physical face survives normal definition / JSON persistence')
for (const type of ['meterD522066','meterKws306'] as const) {
 const root=createDigitalMeterObject(type),lcd=root.getObjectByName('digital_meter_lcd')!,before:Array<[string,boolean,unknown]>=[]
 root.traverse(o=>before.push([o.name,o.visible,(o as THREE.Mesh).geometry]))
 const def=normalizeDefinition({controls:[]}),result=prepareActuatorHead(root,def,.01),after:Array<[string,boolean,unknown]>=[]
 root.traverse(o=>after.push([o.name,o.visible,(o as THREE.Mesh).geometry]))
 check(result.head===null&&result.definition===def&&before.length===after.length&&before.every((row,i)=>row.every((n,j)=>n===after[i][j])),type+': publishing/runtime preparation never cuts a non-emergency into a fake head')
 check(lcd.visible&&!root.getObjectByName('digital_meter_lcd__head'),type+': live LCD remains the visible surface; no stale baked copy occludes it')
 disposeModelClone(root)
}
const editorBefore=useEditorStore.getState(),draft=normalizeDefinition({vars:[{id:'on',name:'on',type:'bool',initial:false},{id:'energy',name:'energy',type:'number',initial:0}]})
const entry={id:'lcd-isolation',meta:{...DEFAULT_META},status:'draft' as const,latestVersion:0,archived:false,updatedAt:'2026-11-17T00:00:00Z',versions:[],draft}
const savedDraft=JSON.stringify(draft)
useEditorStore.setState({previewVars:{on:true,powered:true,energy:987.65}})
useEditorStore.getState().open(entry)
check(Object.keys(useEditorStore.getState().previewVars).length===0,'opening a different Admin draft clears prior-device LCD preview values')
const vars=mergeVars(useEditorStore.getState().def,useEditorStore.getState().previewVars)
check(vars.on===false&&vars.energy===0,'new Admin LCD uses its own authored initial values, never prior test readings')
check(JSON.stringify(draft)===savedDraft,'clearing ephemeral preview does not overwrite persisted vars, parts or authored definitions')
useEditorStore.setState(editorBefore)
console.log(`\nPASS — ${checks} device LCD geometry, precision, provenance-scope and authored-definition assertions`)
