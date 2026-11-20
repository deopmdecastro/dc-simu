/** Offline regression: actual exported assets + real electrical graphs and store scans. */
import './node-env'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createComponent, terminalByLabel } from '../src/electrical/factory'
import { computeContinuity, internalBridges, sourceTerminalIds } from '../src/electrical/engine'
import { computePhaseLabels } from '../src/electrical/phases'
import { INDUSTRIAL_DEVICE_TYPES, INDUSTRIAL_GEOMETRY, INDUSTRIAL_INFO, industrialControlPatch, industrialDeviceTypeOf, updateIndustrialDevice, updateGeyaTimer, type IndustrialElectricalContext, type IndustrialDeviceType } from '../src/electrical/industrialDevices'
import { applyIndustrialState, industrialAction, prepareIndustrialModel } from '../src/three/industrialFinish'
import { cloneModelScene } from '../src/three/modelFit'
import { mergeStaticMeshes } from '../src/three/staticMerge'
import { useSimStore } from '../src/store/useSimStore'
import type { ElectricalComponent, Wire } from '../src/types'
let checks = 0, wireSerial = 0
const errors: string[] = []
const check = (ok: unknown, name: string) => { checks++; if (!ok) errors.push(name); console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}`) }
const id = (c: ElectricalComponent, label: string) => { const t = terminalByLabel(c, label); assert.ok(t, `${c.type}.${label}`); return t.id }
const cable = (a: ElectricalComponent, al: string, b: ElectricalComponent, bl: string): Wire => ({ id: `w${wireSerial++}-${al}-${bl}`, fromTerminalId: id(a, al), toTerminalId: id(b, bl), color: '#1f2937', gauge: '1.5mm²', kind: 'power', flexibility: 'flexible', route: 'straight', bend: .5, energized: false } as Wire)
const context = (components: ElectricalComponent[], wires: Wire[]): IndustrialElectricalContext => {
  const graph = computeContinuity(components, wires, sourceTerminalIds(components, undefined, wires))
  return { components, adjacency: graph.reachable, live: graph.energizedTerminals, phases: computePhaseLabels(components, wires) }
}
const provenance = JSON.parse(fs.readFileSync('public/models/industriais/sources.json', 'utf8'))
check(INDUSTRIAL_DEVICE_TYPES.length === 16, 'sixteen explicit industrial references')
for (const type of INDUSTRIAL_DEVICE_TYPES) {
  const g = INDUSTRIAL_GEOMETRY[type], info = INDUSTRIAL_INFO[type], c = createComponent(type)
  check(c.terminals.length === g.terminals.length && new Set(c.terminals.map(t => t.id)).size === c.terminals.length, `${type}: stable unique terminal identities`)
  check(fs.readFileSync('public' + info.datasheet).subarray(0, 5).toString() === '%PDF-', `${type}: real local PDF`)
  const bytes = fs.readFileSync('public' + g.path), record = provenance.models.find((r: any) => r.type === type)
  check(record?.sha256 === createHash('sha256').update(bytes).digest('hex'), `${type}: GLB hash matches build provenance`)
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
  const box = new THREE.Box3().setFromObject(scene, true), size = box.getSize(new THREE.Vector3())
  check(!!scene.getObjectByName('industrial_lcd') === (type === 'vfdSchneiderAtv320'), `${type}: only the actual local-display device has an LCD; none invented on relays, socket or buzzer`)
  check([size.x, size.y, size.z].every((v, i) => Math.abs(v * 1000 - Object.values(g.physicalSizeMm)[i]) < .015), `${type}: millimetres, axes and exported bounds`)
  const clone = cloneModelScene(scene); prepareIndustrialModel(clone, type); mergeStaticMeshes(clone)
  check(clone.getObjectByName('industrial_device_' + type), `${type}: static merge preserves device identity`)
  if (type === 'breakerMurrelektronikMico46') {
    check([1,2,3,4].every(i=>scene.getObjectByName('industrial_mico_channel_blade_'+i)) && !!scene.getObjectByName('industrial_mico_perforated_roof'), 'MICO: four distinct sloping channel blades and perforated roof in the exported asset')
    check(g.terminals.length===12 && g.terminals.some(t=>t.label==='ON2') && Math.abs(g.physicalSizeMm.width-70)<.2 && Math.abs(g.physicalSizeMm.height-90)<.2 && Math.abs(g.physicalSizeMm.depth-80)<.2, 'MICO: manual W70 H90 D80 envelope and duplicated ON entry')
    // O clique 3D tem de dar um controlo que a lógica conhece (antes «button1» era ignorado).
    for (const i of [1, 2, 3, 4]) {
      const btn = clone.getObjectByName('industrial_mico_button_' + i), sel = clone.getObjectByName('industrial_mico_select_' + i)
      const btnAction = btn && industrialAction(btn.children[0] ?? btn), selAction = sel && industrialAction(sel.children[0] ?? sel)
      check(btnAction === 'ch' + i && Object.keys(industrialControlPatch(type, createComponent(type).state, btnAction as any)).length > 0, `MICO: clique no botão ${i} liga/desliga o canal (${btnAction})`)
      check(selAction === 'sel' + i && Object.keys(industrialControlPatch(type, createComponent(type).state, selAction as any)).length > 0, `MICO: clique no seletor ${i} muda a corrente (${selAction})`)
    }
  }
  if(type==='breakerMurrelektronikMico24'){
    check(g.terminals.length===10&&Math.abs(g.physicalSizeMm.width-36)<.01&&Math.abs(g.physicalSizeMm.height-90)<.01&&Math.abs(g.physicalSizeMm.depth-80)<.11,'MICO 2.4: W36 H90 D80, ten measured spring entries')
    check([1,2].every(i=>scene.getObjectByName('industrial_mico_channel_blade_'+i)&&scene.getObjectByName('industrial_mico_button_'+i))&&!scene.getObjectByName('industrial_mico_button_3'),'MICO 2.4: two real blades and keys, no hidden four-channel copy')
    check(Object.keys(industrialControlPatch(type,c.state,'ch3')).length===0&&Object.keys(industrialControlPatch(type,c.state,'sel4')).length===0,'MICO 2.4: non-existent controls cannot create ghost channels')
    for(const i of [1,2]){
      const btn=clone.getObjectByName('industrial_mico_button_'+i)!,sel=clone.getObjectByName('industrial_mico_select_'+i)!
      check(industrialAction(btn.children[0])==='ch'+i&&industrialAction(sel.children[0])==='sel'+i,'MICO 2.4: actual key/selector '+i+' survive static merge')
    }
  }
  const cavityErrors: string[] = []
  for (const terminal of g.terminals) {
    if (terminal.contact !== 'socket') continue
    const normal = new THREE.Vector3(...('normal' in terminal ? terminal.normal : ({ front: [0,0,1], back: [0,0,-1], top: [0,1,0], bottom: [0,-1,0], left: [-1,0,0], right: [1,0,0] } as const)[terminal.face]))
    const at = new THREE.Vector3(box.min.x + terminal.x * size.x, box.max.y - terminal.y * size.y, box.min.z + terminal.z * size.z)
    const ray = new THREE.Raycaster(at.clone().addScaledVector(normal, .00015), normal.clone().negate(), 0, terminal.holeDepthMm / 1000 + .001)
    const hits = ray.intersectObject(scene, true).filter(h => !h.object.name.includes('label') && !h.object.name.includes('sticker'))
    const first = hits[0]
    if (!scene.getObjectByName(THREE.PropertyBinding.sanitizeNodeName('cavity_' + terminal.label)) || (first && first.distance * 1000 < terminal.holeDepthMm - 1.15)) cavityErrors.push(`${terminal.label}:${first?.object.name ?? 'none'}@${((first?.distance ?? 0)*1000).toFixed(2)}mm`)
  }
  check(!cavityErrors.length, `${type}: finite open mouths, no plastic/black disk occluding the bore${cavityErrors.length ? ' — ' + cavityErrors.join(', ') : ''}`)
  if (type === 'timerGeyaGrt8M1') {
    const range = clone.getObjectByName('industrial_range')!
    check(industrialAction(range.children[0]) === 'range', 'GEYA: pickable physical knob survives static merge')
    applyIndustrialState(clone, type, { rangeMs: 60000, fraction: .8, function: 'E' })
    check(Math.abs(range.rotation.z) > 1, 'GEYA: state rotates the actual knob')
  }
}
const dc = createComponent('powerSource24v'), ac = createComponent('powerSource1ph')
const relay = createComponent('relayFinder5534')
let wires = [cable(dc, '+24V', relay, 'A1'), cable(dc, '0V', relay, 'A2')]
updateIndustrialDevice(relay, context([dc, relay], wires), 100)
check(relay.state.energized && internalBridges(relay).length === 4, 'Finder: 24 V DC pulls four isolated changeovers')
wires = [cable(dc, '0V', relay, 'A1'), cable(dc, '+24V', relay, 'A2')]
updateIndustrialDevice(relay, context([dc, relay], wires), 100)
check(!relay.state.energized && relay.state.supplyMismatch, 'Finder: reversed DC is not a valid coil supply')
relay.state.testPressed = true; updateIndustrialDevice(relay, context([relay], []), 100)
check(relay.state.energized && !relay.state.powered, 'Finder: mechanical TEST without pretending the coil is powered')
relay.state.testPressed = false; updateIndustrialDevice(relay, context([relay], []), 100)
check(!relay.state.energized, 'Finder: TEST release restores all four NC paths')
const socket = createComponent('relaySocketFinder9023')
check(internalBridges(socket).length === 11 && internalBridges(socket).every(([a,b],i) => a === id(socket, String(i+1)) && b === id(socket, 'P'+(i+1))), '90.23: eleven independent n–Pn routes, never a coil')
for (const fn of 'ABCDEFGHIJ') {
  const s: Record<string, any> = { function: fn, rangeMs: 1000, fraction: 1 }
  for (let i=0;i<9;i++) updateGeyaTimer(s, true, false, 100)
  check(typeof s.energized === 'boolean' && Number.isFinite(s.elapsedMs), `GEYA ${fn}: deterministic finite timing state`)
  updateGeyaTimer(s, false, false, 100)
  check(!s.energized && !s.running && s.elapsedMs === 0, `GEYA ${fn}: power loss releases immediately`)
}
let s: Record<string, any> = { function: 'A', rangeMs: 1000, fraction: .5 }
for(let i=0;i<4;i++)updateGeyaTimer(s,true,false,100)
check(!s.energized, 'M1/A TON remains off before 500 ms'); updateGeyaTimer(s,true,false,100)
check(s.energized, 'M1/A TON closes exactly at scale × fraction')
s = { rangeMs: 1000, fraction: .5 }
updateGeyaTimer(s,true,false,100,true); check(s.energized, 'B1: initial powered-on TOF interval follows manual')
for(let i=0;i<4;i++)updateGeyaTimer(s,true,false,100,true)
check(!s.energized, 'B1: initial interval ends'); updateGeyaTimer(s,true,true,100,true)
check(s.energized, 'B1: closing S energizes immediately')
for(let i=0;i<4;i++)updateGeyaTimer(s,true,false,100,true)
check(s.energized, 'B1: holds through 400 ms after S opens'); updateGeyaTimer(s,true,false,100,true)
check(!s.energized, 'B1: releases after 500 ms, not at power-off')
const b1 = createComponent('timerGeyaGrt8B1')
wires=[cable(dc,'+24V',b1,'A1'),cable(dc,'0V',b1,'A2')]
updateIndustrialDevice(b1,context([dc,b1],wires),100)
check(!b1.state.powered&&b1.state.supplyMismatch,'B1/A230 rejects 24 V DC')
wires=[cable(ac,'L',b1,'A1'),cable(ac,'N',b1,'A2')]
updateIndustrialDevice(b1,context([ac,b1],wires),100)
check(b1.state.powered,'B1/A230 accepts a wired 230 V AC source')
const level=createComponent('levelRelayAvel411');level.state.probeMode='virtual'
wires=[cable(ac,'L',level,'2'),cable(ac,'N',level,'10')]
const scanLevel=()=>updateIndustrialDevice(level,context([ac,level],wires),100)
scanLevel();check(!level.state.energized,'AVEL: dry well inhibits pumping')
Object.assign(level.state,{wellMinWet:true,wellMaxWet:true});scanLevel();check(level.state.energized,'AVEL: full well and empty tank request filling')
level.state.tankMinWet=true;scanLevel();check(level.state.energized,'AVEL: hysteresis keeps filling above tank minimum')
level.state.tankMaxWet=true;scanLevel();check(!level.state.energized,'AVEL: tank maximum stops filling')
level.state.tankMaxWet=false;scanLevel();check(!level.state.energized,'AVEL: does not restart until tank minimum clears')
level.state.tankMinWet=false;scanLevel();check(level.state.energized,'AVEL: empty tank starts a new cycle')
level.state.wellMinWet=false;scanLevel();check(!level.state.energized,'AVEL: well minimum stops the pump')
const buzzer=createComponent('buzzerMetaltexTby301');ac.state.nominalV=110
wires=[cable(ac,'L',buzzer,'1'),cable(ac,'N',buzzer,'2')]
updateIndustrialDevice(buzzer,context([ac,buzzer],wires),100)
check(buzzer.state.on,'TBY-301: wired 110 V AC turns sound on')
updateIndustrialDevice(buzzer,context([ac,buzzer],wires),1800000)
check(!buzzer.state.on&&buzzer.state.dutyLimitReached,'TBY-301: explicit 30-minute continuous-duty guard')
const drive=createComponent('vfdSchneiderAtv320');ac.state.nominalV=230
wires=[cable(ac,'L',drive,'R/L1'),cable(ac,'N',drive,'S/L2')]
useSimStore.getState().loadJSON(JSON.stringify({app:'dc-simu',version:6,components:[ac,drive],wires}))
const liveDrive=()=>useSimStore.getState().components.find(c=>c.id===drive.id)!
// STEP em STOP não faz nada (8479475: só ▶ acorda a simulação); em PAUSA avança um scan.
useSimStore.setState(s=>({sim:{...s.sim,runState:'paused'}}))
useSimStore.getState().step();check(liveDrive().state.powered&&!liveDrive().state.running,'ATV: mains supply powers controls but cannot invent STO/DI wiring')
useSimStore.setState({wires:[...useSimStore.getState().wires,cable(drive,'+24',drive,'STO'),cable(drive,'+24',drive,'DI1')]})
for(let i=0;i<8;i++)useSimStore.getState().step()
check(liveDrive().state.stoReleased&&liveDrive().state.running&&liveDrive().state.frequencyHz>0,'ATV: actual store scan, wired STO + DI1, ramped output')
check(!internalBridges(liveDrive()).some(([a,b])=>['R/L1','S/L2'].some(l=>a===id(drive,l)||b===id(drive,l))),'ATV: no conductive bridge between mains and synthesized output')
useSimStore.getState().stop();check(!liveDrive().state.running&&!liveDrive().state.powered,'STOP deenergizes industrial devices')
const saved=useSimStore.getState().saveJSON();useSimStore.getState().loadJSON(saved)
check(liveDrive().terminals.map(t=>t.id).join()===drive.terminals.map(t=>t.id).join(),'save/load preserves industrial endpoint identities')
check(industrialDeviceTypeOf({type:'cat:test:v1',state:{industrialOrigin:'relayFinder5534'}} as ElectricalComponent)==='relayFinder5534','published catalog industrial origin remains functional')
// MICO Classic 4.6: alimentação 24 V DC, canais ON/OFF, disparo por sobrecorrente e Sammelmeldung 13-14.
const dcSrc=createComponent('powerSource24v');dcSrc.state.nominalV=24
const mico=createComponent('breakerMurrelektronikMico46')
wires=[cable(dcSrc,'+24V',mico,'L+'),cable(dcSrc,'0V',mico,'GND')]
const scanMico=()=>updateIndustrialDevice(mico,context([dcSrc,mico],wires),100)
scanMico();check(mico.state.powered===true&&mico.state.supplyMismatch===false,'MICO: 24 V DC alimenta sem mismatch')
const duplicateFeed=createComponent('breakerMurrelektronikMico46'), duplicateWires=[cable(dcSrc,'+24V',duplicateFeed,'L+2'),cable(dcSrc,'0V',duplicateFeed,'GND2')]
updateIndustrialDevice(duplicateFeed,context([dcSrc,duplicateFeed],duplicateWires),100)
check(duplicateFeed.state.powered===true,'MICO: duplicated L+2 and GND2 feed the same input rails')
const duplicateGraph=context([duplicateFeed],[])
check([...(duplicateGraph.adjacency.get(id(duplicateFeed,'ON'))??[])].includes(id(duplicateFeed,'ON2')),'MICO: ON and ON2 share the same restart input')
check(mico.state.channels['1'].on===false,'MICO: entrega com canais OFF (estado de fábrica)')
const patch=industrialControlPatch('breakerMurrelektronikMico46',mico.state,'ch1')
Object.assign(mico.state,patch);scanMico()
check(mico.state.channels['1'].on===true,'MICO: botão liga canal')
check(mico.state.channels['1'].tripped===false,'MICO: 0 A não dispara')
mico.state.channels['1'].currentA=2;scanMico()
check(mico.state.channels['1'].tripped===true&&mico.state.alarmOpen===true,'MICO: sobrecorrente dispara e abre Sammelmeldung')
const selPatch=industrialControlPatch('breakerMurrelektronikMico46',mico.state,'sel1')
Object.assign(mico.state,selPatch)
check(mico.state.channels['1'].setpointA===2&&mico.state.channels['1'].on===false,'MICO: mudar seletor desliga canal')
mico.state.channels['1'].on=true;mico.state.channels['1'].tripped=true;mico.state.onRemote=true
scanMico()
check(mico.state.channels['1'].tripped===false,'MICO: ON remoto rearma canal disparado')
mico.state.onRemote=false
dcSrc.state.nominalV=0;scanMico()
check(mico.state.powered===false&&mico.state.channels['1'].tripped===false,'MICO: corte de rede limpa disparo')
check(!('running' in industrialControlPatch('vfdSchneiderAtv320',{},'enter')),'ATV encoder is not an invented RUN button')
const compact=createComponent('breakerMurrelektronikMico24'),supply24=createComponent('powerSource24v')
const supplyWires=[cable(supply24,'+24V',compact,'L+'),cable(supply24,'0V',compact,'GND')]
const scan24=(dt=100,extra:Wire[]=[])=>updateIndustrialDevice(compact,context([supply24,compact],[...supplyWires,...extra]),dt)
scan24();check(compact.state.powered&&Object.keys(compact.state.channels).length===2,'MICO 2.4: real 24 V wiring powers exactly two channels')
for(const channel of [1,2]){
 const actual:number[]=[]
 for(let i=0;i<4;i++){actual.push(compact.state.channels[String(channel)].setpointA);Object.assign(compact.state,industrialControlPatch(compact.type,compact.state,('sel'+channel) as any))}
 check(actual.join(',')==='1,2,3,4'&&compact.state.channels[String(channel)].setpointA===1,'MICO 2.4: selector '+channel+' cycles 1/2/3/4 A, never 6 A')
 Object.assign(compact.state,industrialControlPatch(compact.type,compact.state,('ch'+channel) as any))
}
scan24()
let graph24=context([supply24,compact],supplyWires)
check(['OUT1','OUT1-2','OUT2','OUT2-2'].every(label=>graph24.live.has(id(compact,label))),'MICO 2.4: both physical outputs of each enabled channel are live')
compact.state.channels['1'].currentA=2;scan24()
graph24=context([supply24,compact],supplyWires)
check(compact.state.channels['1'].tripped&&!compact.state.channels['2'].tripped&&!graph24.live.has(id(compact,'OUT1'))&&!graph24.live.has(id(compact,'OUT1-2'))&&graph24.live.has(id(compact,'OUT2'))&&graph24.live.has(id(compact,'OUT2-2')),'MICO 2.4: channel 1 trip isolates its two outputs and preserves channel 2')
check(compact.state.alarmOpen&&!internalBridges(compact).some(([a,b])=>a===id(compact,'13')&&b===id(compact,'14')),'MICO 2.4: a trip opens the dry 13–14 alarm contact')
const remote24=[cable(supply24,'+24V',compact,'ON2')]
scan24(10,remote24);scan24(9,remote24)
check(compact.state.channels['1'].tripped,'MICO 2.4: a 19 ms ON pulse cannot rearm')
scan24(1,remote24);check(!compact.state.channels['1'].tripped,'MICO 2.4: wired ON2 rearms at 20 ms')
compact.state.channels['1'].currentA=2;scan24(100,remote24)
check(compact.state.channels['1'].tripped,'MICO 2.4: holding ON high does not repeatedly clear a new fault')
scan24(10);scan24(20,remote24);check(!compact.state.channels['1'].tripped,'MICO 2.4: a new ON pulse rearms again')
Object.assign(compact.state,industrialControlPatch(compact.type,compact.state,'ch2'));scan24()
graph24=context([supply24,compact],supplyWires)
check(!graph24.live.has(id(compact,'OUT2'))&&!graph24.live.has(id(compact,'OUT2-2')),'MICO 2.4: manual OFF isolates both channel 2 sockets')
const reverseWires=[cable(supply24,'+24V',compact,'GND'),cable(supply24,'0V',compact,'L+')]
updateIndustrialDevice(compact,context([supply24,compact],reverseWires),100)
check(!compact.state.powered&&compact.state.supplyMismatch,'MICO 2.4: reversed DC does not power the electronics')
const missingGnd=[cable(supply24,'+24V',compact,'L+')]
updateIndustrialDevice(compact,context([supply24,compact],missingGnd),100)
check(!compact.state.powered&&!context([supply24,compact],missingGnd).live.has(id(compact,'OUT1')),'MICO 2.4: missing GND cannot enable an output')
check(Object.keys(compact.state.channels).join(',')==='1,2','MICO 2.4: scans never create channels 3 or 4')
if(errors.length){console.error(`\n${errors.length}/${checks} failed:\n${errors.join('\n')}`);process.exitCode=1}else console.log(`\nPASS — ${checks} industrial asset/electrical checks`)
