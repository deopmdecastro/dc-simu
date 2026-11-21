/** A política de formulário não altera os contratos nem os resultados do motor. */
const DERIVED = new Set(['powered', 'energized', 'running', 'done', 'elapsedMs', 'starDone', 'deltaDone', 'reading', 'supplyMismatch', 'tripReason', 'rpmVisual'])
const FIXED_METADATA = new Set(['manufacturer', 'brand', 'code', 'model', 'norm', 'ue', 'article', 'referenceOnly'])
const FIXED_SCHNEIDER = new Set(['breakerSchneiderIc60h1p', 'residualBreakerSchneiderIid4p', 'residualBreakerSchneiderIdpnVigi', 'switchSchneiderEz9s1p', 'switchSchneiderEz9s2p', 'switchSchneiderEz9s4p'])
const FIXED_RATINGS = new Set(['poles', 'curve', 'inA', 'icn', 'sensmA', 'rcdType'])
const NONNEGATIVE_SETTINGS = new Set(['presetMs', 'transitionMs', 'rampMs', 'rampUpMs', 'rampDownMs', 'presetHz', 'preset', 'currentPct'])

export function inspectorStatePolicy(type: string, key: string): { readOnly: boolean; min?: number; integer?: boolean } {
  const meter = type === 'meterD522066' || type === 'meterKws306'
  const pilot = type === 'pilotLightSchneiderIil1p' || type === 'pilotLightSchneiderIil3p'
  const lamp = type === 'lampIncandescentE27' || type === 'lampFluorescentE27' || type === 'lampLedE27'
  const readOnly = DERIVED.has(key) || FIXED_METADATA.has(key)
    || (FIXED_SCHNEIDER.has(type) && FIXED_RATINGS.has(key))
    || (meter && !['switchOn', 'screenMode', 'resetPressed'].includes(key))
    || (pilot && ['on', 'l1On', 'l2On', 'l3On', 'phaseLoss', 'voltage'].includes(key))
    || (lamp && ['on', 'socket', 'voltage'].includes(key))
    || (type === 'vfd' && key === 'frequencyHz')
    || (type === 'softStarter' && key === 'bypass')
    || (type === 'timerRelayTOF' && key === 'offDelay')
    || (type === 'currentTransformerSplitCore' && ['primaryA', 'secondaryA'].includes(key))
    || (type === 'hmi' && key === 'on')
  return { readOnly, ...(NONNEGATIVE_SETTINGS.has(key) ? { min: 0 } : {}), ...(type === 'counterRelay' && key === 'preset' ? { integer: true } : {}) }
}
