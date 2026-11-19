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
check(INDUSTRIAL_DEVICE_TYPES.length === 14, 'fourteen explicit industrial references')
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
  const cavityErrors: string[] = []
  for (const terminal of g.terminals) {
    if (terminal.contact !== 'socket') continue
    const normal = new THREE.Vector3(...({ front: [0,0,1], back: [0,0,-1], top: [0,1,0], bottom: [0,-1,0], left: [-1,0,0], right: [1,0,0] } as const)[terminal.face])
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
if(errors.length){console.error(`\n${errors.length}/${checks} failed:\n${errors.join('\n')}`);process.exitCode=1}else console.log(`\nPASS — ${checks} industrial asset/electrical checks`)
