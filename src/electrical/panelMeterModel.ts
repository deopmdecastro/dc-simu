import { electricalComponentView } from './builtinRuntime'
import type { ElectricalComponent, Wire } from '../types'
import { computeContinuity, sourceTerminalIds, type ContinuityResult } from './engine'
import { computePhaseLabels } from './phases'
import { industrialInput, type IndustrialElectricalContext } from './industrialDevices'

/** Topological load estimates, NOT an impedance/harmonic/transient solver.
 * Only loads in the measured series branch contribute; an unrelated running
 * motor elsewhere in the project must never appear on a meter. */
const finite = (v: unknown, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback
const idOf = (c: ElectricalComponent, label: string) => c.terminals.find(t => t.label === label)?.id
function net(start: string | undefined, graph: Map<string, Set<string>>): Set<string> {
  const found = new Set<string>(), queue = start ? [start] : []
  for (let i=0; i<queue.length; i++) { const id=queue[i]; if(found.has(id))continue; found.add(id); for(const next of graph.get(id)??[])if(!found.has(next))queue.push(next) }
  return found
}
function loadEstimate(c: ElectricalComponent): { amps: number; pf: number; terminals: string[] } | null {
  const ids = (labels: string[]) => labels.map(label=>idOf(c,label)).filter((id):id is string=>!!id)
  if (c.type==='motor1ph' || c.type==='motor3ph') return c.state.running ? { amps:Math.max(0,finite(c.state.currentA)),pf:Math.max(0,Math.min(1,finite(c.state.powerFactor,.8))),terminals:ids(c.type==='motor3ph'?['U1','V1','W1']:['U1','U2']) } : null
  if (/pilotLight|^led|^lamp$|^buzzer/.test(c.type)) return c.state.on ? {amps:Math.max(0,finite(c.state.currentA,.02)),pf:1,terminals:ids(['X1','X2','L','N'])}:null
  if (/contactor|^auxRelay|^relayFinder/.test(c.type)) return c.state.energized ? {amps:Math.max(0,finite(c.state.coilCurrentA,.04)),pf:Math.max(0,Math.min(1,finite(c.state.powerFactor,.8))),terminals:ids(['A1','A2'])}:null
  return null
}
function branch(c:ElectricalComponent,a:string,b:string,components:ElectricalComponent[],wires:Wire[],live:Set<string>,voltage:number) {
  const x=idOf(c,a),y=idOf(c,b)
  if(!x||!y||!live.has(x)||!live.has(y))return {amps:0,watts:0,ambiguous:false}
  // Omit only this device's internal paths, retaining every external wire,
  // including a direct bypass between the same two terminal identities.
  const graph=computeContinuity(components.filter(other=>other.id!==c.id),wires,[]).reachable
  const left=net(x,graph),right=net(y,graph),sources=sourceTerminalIds(components,undefined,wires)
  const leftFed=sources.some(id=>left.has(id)),rightFed=sources.some(id=>right.has(id))
  if(left.has(y)||leftFed===rightFed)return {amps:0,watts:0,ambiguous:true}
  const downstream=leftFed?right:left
  let amps=0,watts=0
  for(const load of components){
    if(load.id===c.id)continue
    const estimate=loadEstimate(load)
    if(!estimate||!estimate.terminals.some(id=>downstream.has(id)&&live.has(id)))continue
    amps+=estimate.amps;watts+=voltage*estimate.amps*estimate.pf
  }
  return {amps,watts,ambiguous:false}
}
function frequency(c:ElectricalComponent,label:string,ctx:IndustrialElectricalContext):number {
  const connected=net(idOf(c,label),ctx.adjacency as Map<string,Set<string>>)
  const source=ctx.components.find(other=>/^powerSource[13]ph$/.test(other.type)&&other.terminals.some(t=>connected.has(t.id)))
  return Math.max(0,finite(source?.state.frequencyHz??source?.state.frequency,50))
}
function integrate(c:ElectricalComponent,watts:number,dtMs:number,running:boolean) {
  const prior=Math.max(0,finite(c.state.energy))
  // kWh = W × ms / 3.6e9. Keep precision in state; round only the LCD.
  c.state.energy=prior+(running?Math.max(0,watts)*Math.max(0,finite(dtMs))/3_600_000_000:0)
  c.state.measurementKind='topological-estimate'
}
export function updatePanelMeters(components:ElectricalComponent[],wires:Wire[],continuity:ContinuityResult,dtMs:number,running:boolean):void {
  components = components.map(electricalComponentView)
  const ctx:IndustrialElectricalContext={components,live:continuity.energizedTerminals,adjacency:continuity.reachable,phases:computePhaseLabels(components,wires)}
  for(const c of components){
    if(c.type==='meterD522066'){
      const input=industrialInput(c,'1','2',ctx),powered=!input.dc&&input.voltage>=40&&input.voltage<=300
      const sensed=powered?branch(c,'CT-IN','CT-OUT',components,wires,ctx.live,input.voltage):{amps:0,watts:0,ambiguous:false}
      Object.assign(c.state,{on:powered,voltage:powered?input.voltage:0,current:sensed.amps,power:sensed.watts,powerFactor:sensed.amps>0&&input.voltage>0?sensed.watts/(input.voltage*sensed.amps):0,frequency:powered?frequency(c,'1',ctx):0,measurementAmbiguous:sensed.ambiguous})
      integrate(c,sensed.watts,dtMs,running)
    }else if(c.type==='meterKws306'){
      let any=false,watts=0,ambiguous=false
      for(const [phase,suffix]of [['L1','A'],['L2','B'],['L3','C']]){
        const input=industrialInput(c,phase+'-IN','N-IN',ctx),v=!input.dc?input.voltage:0
        const reading=c.state.switchOn!==false&&v>0?branch(c,phase+'-IN',phase+'-OUT',components,wires,ctx.live,v):{amps:0,watts:0,ambiguous:false}
        c.state['v'+suffix]=v;c.state['i'+suffix]=reading.amps;c.state['p'+suffix]=reading.watts/1000
        any||=v>0;watts+=reading.watts;ambiguous||=reading.ambiguous
      }
      Object.assign(c.state,{on:any,frequency:any?frequency(c,['L1','L2','L3'].find((_,i)=>c.state['v'+'ABC'[i]]>0)+'-IN',ctx):0,measurementAmbiguous:ambiguous})
      integrate(c,watts,dtMs,running)
    }else if(c.type==='currentTransformerSplitCore'){
      const sensed=branch(c,'P1','P2',components,wires,ctx.live,0)
      c.state.primaryCurrentA=sensed.amps
      c.state.secondaryCurrentA=sensed.amps*Math.max(0,finite(c.state.secondaryA,.05))/Math.max(.001,finite(c.state.primaryA,100))
      c.state.measurementAmbiguous=sensed.ambiguous
    }
  }
}
