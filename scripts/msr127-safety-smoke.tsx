import React from 'react'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { updateMsr127,MSR127_SCOPE } from '../src/electrical/msr127'
import { internalBridges } from '../src/electrical/engine'
import { SymbolGlyph } from '../src/schematic/symbols'
import { make,cable,context,assertions,terminal } from './lib/electrical-fixture'
import { useSimStore } from '../src/store/useSimStore'
const {check,done}=assertions(),supply=make('powerSource24v'),relay=make('safetyRelay')
let components=[supply,relay],wires=[cable(supply,'+24V',relay,'A1'),cable(supply,'0V',relay,'A2')]
const supplyWires=[...wires],inputs=[cable(relay,'S11',relay,'S52'),cable(relay,'S52',relay,'S12'),cable(relay,'S21',relay,'S22')],reset=cable(relay,'S12',relay,'S34')
const scan=(dt=100)=>updateMsr127(relay,context(components,wires),dt)
for(let i=0;i<12;i++)scan();check(relay.state.powered&&!relay.state.energized,'MSR supply alone cannot close safety outputs')
wires.push(...inputs,reset);relay.state.startupElapsedMs=0;scan(999);check(!relay.state.energized,'MSR respects 1 s power-on delay');scan(1);check(relay.state.energized,'TP level reset wired before inputs is valid after startup')
check(internalBridges(relay).length===3&&['13','23','33'].every(label=>internalBridges(relay).some(pair=>pair.includes(terminal(relay,label)))),'three isolated NO safety outputs close together')
wires=wires.filter(w=>w!==inputs[2]);scan(0);check(!relay.state.energized&&!relay.state.channel1On&&!relay.state.channel2On,'opening either safety channel drops both outputs without waiting for another timer')
check(internalBridges(relay).length===1&&internalBridges(relay)[0].includes(terminal(relay,'41')),'auxiliary 41–42 closes when safety outputs open')
wires.push(inputs[2]);scan(99);check(!relay.state.energized,'100 ms recovery before restart');scan(1);check(relay.state.energized,'TP restarts with continuously closed S12–S34, not a fabricated RP edge')
wires=wires.filter(w=>w!==reset);scan();check(!relay.state.energized,'feedback/start path must remain closed')
wires=[cable(supply,'0V',relay,'A1'),cable(supply,'+24V',relay,'A2'),...inputs,reset];scan();check(!relay.state.powered&&relay.state.supplyMismatch,'reversed DC supply is rejected')
for(const volts of [20.3,26.5,115,230]){supply.state.nominalV=volts;wires=[...supplyWires,...inputs,reset];scan(1100);check(!relay.state.energized,`24 V variant rejects ${volts} V`)}
supply.state.nominalV=24;wires=[...supplyWires,...inputs,reset]
check(/didático/.test(MSR127_SCOPE)&&/Não certifica PL\/SIL/.test(MSR127_SCOPE),'simulation limitations are explicit, never safety certification')
check(new Set(relay.terminals.map(t=>t.id)).size===16&&relay.terminals.some(t=>t.label==='S52'),'sixteen stable electrical terminal identities, including real S52')
const svg=renderToStaticMarkup(<svg><SymbolGlyph c={relay} selected={false}/></svg>);check(svg.includes('S52')&&svg.includes('S34'),'actual schematic symbol exposes safety input and reset interfaces')
Object.defineProperty(globalThis,'window',{configurable:true,value:globalThis})
const st=()=>useSimStore.getState();st().newProject();useSimStore.setState({components,wires,demoMode:false});for(let i=0;i<11;i++)st().step()
check(st().components.find(c=>c.id===relay.id)?.state.energized,'actual store scans invoke the MSR safety model rather than generic coil power')
st().stop();check(!st().components.find(c=>c.id===relay.id)?.state.energized,'STOP de-energizes safety relay')
const ids=st().components.find(c=>c.id===relay.id)!.terminals.map(t=>t.id),saved=st().saveJSON();st().newProject();st().loadJSON(saved);assert.deepEqual(st().components.find(c=>c.id===relay.id)!.terminals.map(t=>t.id),ids)
check(true,'safety interface keeps terminal IDs across save/load')
done('MSR127 safety assertions; ideal topology, not certified hardware')
