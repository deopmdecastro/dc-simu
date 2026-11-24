import type { ComponentType, ElectricalComponent } from '../types'
import { INDUSTRIAL_DEVICE_TYPES, industrialDeviceTypeOf } from './industrialDevices'

/** A published version keeps its own immutable catalog type and terminal IDs.
 * Only this explicit set can delegate electrical semantics to its known source;
 * display/category/name guesses must never turn a user component into hardware. */
const SUPPORTED = new Set<ComponentType>([
  ...INDUSTRIAL_DEVICE_TYPES,
  'meterD522066','meterKws306','meterSchneiderIem3255','currentTransformerSplitCore',
  'breakerSchneiderIc60h1p','pilotLightSchneiderIil1p','pilotLightSchneiderIil3p',
  'residualBreakerSchneiderIid4p','residualBreakerSchneiderIdpnVigi','safetyRelay',
  'contactorWegCwbc65',
  'lampIncandescentE27','lampFluorescentE27','lampLedE27',
  'wallSwitchSimple','wallSwitchDouble','wallSwitchStaircase',
  'powerSource1ph','powerSource3ph','powerSource24v','terminalSet1ph','terminalSet3ph','terminalSet24v',
])
export const supportsBuiltinRuntime=(type:ComponentType)=>SUPPORTED.has(type)
export function builtinRuntimeType(c:Pick<ElectricalComponent,'type'|'state'>):ComponentType|null {
  if(SUPPORTED.has(c.type))return c.type
  const industrial=industrialDeviceTypeOf(c)
  if(industrial)return industrial
  const origin=c.state.builtinOrigin
  return c.type.startsWith('cat:')&&typeof origin==='string'&&SUPPORTED.has(origin as ComponentType)?origin as ComponentType:null
}
export function electricalComponentView(c:ElectricalComponent):ElectricalComponent {
  const type=builtinRuntimeType(c)
  return type&&type!==c.type?{...c,type}:c
}
