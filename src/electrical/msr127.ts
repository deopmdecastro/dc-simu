import type { ElectricalComponent } from '../types'
import { industrialConnected, industrialInput, type IndustrialElectricalContext } from './industrialDevices'

export const MSR127_SCOPE = 'Modelo didático MSR127TP 24 V AC/DC: continuidade, arranque 1 s, recuperação 100 ms e start por nível S12–S34. Não certifica PL/SIL, resistência de contactos, soldadura, falhas cruzadas ou versões 115/230 V.'

/** 440R-IN079D-EN-P p.2/3. TP is level-sensitive, NOT RP edge reset.
 * S11/S52/S12 and S21/S22 are checked as separate passive control paths;
 * the safety contacts never bridge their supply or one output pole to another.
 */
export function updateMsr127(c: ElectricalComponent, ctx: IndustrialElectricalContext, dtMs: number): void {
  const s=c.state, dt=Math.max(0,Number.isFinite(dtMs)?dtMs:0)
  const supply=industrialInput(c,'A1','A2',ctx)
  const powered=supply.voltage>=20.4&&supply.voltage<=26.4&&(!supply.dc||supply.positive)
  const connected=(a:string,b:string)=>industrialConnected(c,a,b,ctx)
  const channel1=connected('S11','S52')&&connected('S11','S12')
  const channel2=connected('S21','S22')
  // The external PNP diagram leaves S11 unused and references S21 to 0 V.
  const pnp1=industrialInput(c,'S52','S21',ctx),pnp2=industrialInput(c,'S12','S21',ctx)
  const positive24=(v:typeof pnp1)=>v.dc&&v.positive&&v.voltage>=20.4&&v.voltage<=26.4
  const pnp=positive24(pnp1)&&positive24(pnp2)&&channel2
  const safe=(channel1&&channel2)||pnp
  s.powered=powered;s.supplyMismatch=supply.voltage>0&&!powered
  s.startupElapsedMs=powered?Math.min(1000,(Number(s.startupElapsedMs)||0)+dt):0
  s.recoveryElapsedMs=powered&&safe?Math.min(100,(Number(s.recoveryElapsedMs)||0)+dt):0
  s.input1Closed=powered&&(channel1||pnp);s.input2Closed=powered&&channel2
  s.resetClosed=connected('S12','S34')
  s.energized=powered&&s.startupElapsedMs>=1000&&s.recoveryElapsedMs>=100&&safe&&s.resetClosed
  s.tripped=powered&&!safe
  s.channel1On=s.energized;s.channel2On=s.energized
  s.simulationScope=MSR127_SCOPE
}
