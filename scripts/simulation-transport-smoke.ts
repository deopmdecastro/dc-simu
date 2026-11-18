import assert from 'node:assert/strict'
import { useSimStore } from '../src/store/useSimStore'
import { useCommandsUi } from '../src/commands/commandsUi'
import { listSimModules,moduleOfView,scopeNeedsPanel,scopeNeedsCommands } from '../src/ui/simScope'
import { make,cable,assertions } from './lib/electrical-fixture'
const {check,done}=assertions()
Object.defineProperty(globalThis,'window',{configurable:true,value:globalThis})
const st=()=>useSimStore.getState(),cmd=()=>useCommandsUi.getState()
st().newProject()
const source=make('powerSource1ph'),meter=make('meterD522066'),motor=make('motor1ph')
const wires=[cable(source,'L',meter,'1'),cable(source,'N',meter,'2'),cable(source,'L',meter,'CT-IN'),cable(meter,'CT-OUT',motor,'U1'),cable(source,'N',motor,'U2')]
useSimStore.setState({components:[source,meter,motor],wires,demoMode:false})
const originalEndpoints=st().wires.map(w=>[w.id,w.fromTerminalId,w.toTerminalId])
st().step();check(st().sim.scanCount===1&&st().components.find(c=>c.id===motor.id)?.state.running,'single step performs a real wired electrical scan')
check(st().sim.runState==='paused'&&!st()._intervalId,'STEP from STOP leaves a live paused simulation, never a still-stopped field UI')
const initialEnergy=st().components.find(c=>c.id===meter.id)!.state.energy;check(initialEnergy>0,'single step integrates exactly its simulated time even outside continuous RUN')
st().play();const interval=st()._intervalId;check(st().sim.runState==='running'&&!!interval,'RUN starts the real scheduler')
st().pause();check(st().sim.runState==='paused'&&!st()._intervalId,'PAUSE removes the interval without clearing energized state')
const scanCount=st().sim.scanCount;st().step();check(st().sim.scanCount===scanCount+1&&st().sim.runState==='paused','STEP in pause advances once and remains paused')
const energy=st().components.find(c=>c.id===meter.id)!.state.energy;st().play();check(st().sim.runState==='running','RUN resumes after pause');const afterResume=st().components.find(c=>c.id===meter.id)!.state.energy;check(afterResume>energy,'RUN immediately executes its first resumed scan');st().stop()
check(st().sim.runState==='stopped'&&!st()._intervalId&&!st().components.some(c=>c.state.running),'STOP cancels scheduler and drops loads')
check(!st().components.find(c=>c.id===meter.id)!.state.on&&st().components.find(c=>c.id===meter.id)!.state.energy===afterResume,'STOP blanks LCD but preserves cumulative energy')
assert.deepEqual(st().wires.map(w=>[w.id,w.fromTerminalId,w.toTerminalId]),originalEndpoints);check(true,'transport never rewrites circuit geometry or electrical endpoint identities')
st().setCommands({parts:[{id:'l',kind:'lamp',tag:'H1',x:0,y:0,rot:0}],wires:[]},'force')
cmd().start({withPlc:false});cmd().tick(100);const time=cmd().rt.time;cmd().pause();cmd().tick(500);check(cmd().rt.time===time,'IEC pause does not advance its independent clock')
cmd().tick(100,true);check(cmd().rt.time===time+100&&cmd().paused,'IEC forced step advances 100 ms without resuming')
cmd().start({withPlc:false});check(!cmd().paused&&cmd().rt.time===time+100,'IEC resume retains clock/state');cmd().stop();check(!cmd().rt.running,'IEC stop is explicit, not caused by switching views')
const modules=listSimModules({components:st().components,ladderRungs:[],grafcet:st().grafcet,commands:st().commands})
check(modules.some(m=>m.id==='schematic')&&modules.some(m=>m.id==='commands'),'multi-simulator scope derives from actual content')
check(scopeNeedsPanel('all')&&scopeNeedsCommands('all')&&!scopeNeedsPanel('commands')&&!scopeNeedsCommands('grafcet'),'scope routing never starts another engine by accident')
check(moduleOfView('commands')==='commands'&&moduleOfView('grafcet')==='grafcet','F6/view routing keeps simulators distinct')
st().reset();check(!st().sim.scanCount&&!st()._intervalId,'RESET returns scheduler to a clean stopped state')
done('simulation transport assertions')
