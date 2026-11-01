/**
 * Sinalização do projeto nativo «Partida direta» guardado antes de `signals-v1`.
 *
 * A semente passou a ter:
 *  · o 97-98 do relé térmico F1 (NA, fecha no disparo) na entrada I0.3 do LOGO!;
 *  · H3 EMERGÊNCIA (vermelho) na saída Q0.3 e H2 PARADO laranja (antes vermelho);
 *  · GRAFCET com o F1: arranque só com o F1 armado, disparo = reset completo para X0; em X0,
 *    H2 acende sem falha e H3 com emergência premida ou F1 disparado.
 * Cada parte só entra se o projeto ainda a tiver como de origem (nunca sobrepõe alterações):
 *  · H3 entra se não existir; H2 muda de cor só se ainda for o vermelho de origem;
 *  · os cabos novos entram só se os bornes que ocupam (97, 98, I0.3, Q0.3, H3) estiverem livres;
 *  · GRAFCET, programa do LOGO! (FC1/FC2/OB100, OB1) e tags só se o GRAFCET estiver intacto.
 */
import type { ElectricalComponent, Wire } from '../types'
import { syncSharedTerminalFerrules } from '../electrical/sharedFerrules'
import { NATIVE_PARTIDA_ID, NATIVE_SIGNALS_FEATURE } from './nativeMotorMeter'
import { buildNativePartidaDireta, NATIVE_H2_COLOR, NATIVE_H3_ID, NATIVE_PLC_ID } from './nativeProjects'

export { NATIVE_SIGNALS_FEATURE }

/** Bornes que só os cabos novos usam (no quadro de origem estavam livres). */
const NEW_TERMINALS = ['native-f1-97', 'native-f1-98', 'native-plc-I0.3', 'native-plc-Q0.3', 'native-plc-Q0.3·2']
const ORIGINAL_H2_COLOR = '#ef4444'

/** GRAFCET de origem (antes do F1): duas etapas e as receptividades sem I0.3. */
function isOriginalGrafcet(grafcet: any): boolean {
  if (!Array.isArray(grafcet?.steps) || !Array.isArray(grafcet?.transitions)) return false
  const ids = grafcet.steps.map((s: any) => s?.id).join(',')
  const t1 = grafcet.transitions.find((t: any) => t?.id === 'native-t1')
  const t2 = grafcet.transitions.find((t: any) => t?.id === 'native-t2')
  const actions = grafcet.steps.map((s: any) => (Array.isArray(s?.actions) ? s.actions.map((a: any) => `${a?.address}:${a?.condition}`).join('+') : '')).join('|')
  return ids === 'native-s0,native-s1' && grafcet.transitions.length === 2
    && t1?.condition === 'I0.0*I0.2*I0.1' && t2?.condition === '!I0.0+!I0.2'
    && actions === 'Q0.2:1|Q0.0:1+Q0.1:1'
}

export function addNativeSignals<T extends Record<string, any>>(content: T): T {
  if (content.nativeId !== NATIVE_PARTIDA_ID || !Array.isArray(content.components) || !Array.isArray(content.wires)) return content
  const features: string[] = Array.isArray(content.nativeFeatures) ? content.nativeFeatures.filter((v: unknown) => typeof v === 'string') : []
  if (features.includes(NATIVE_SIGNALS_FEATURE)) return content
  const seed = buildNativePartidaDireta()
  let components = content.components as ElectricalComponent[]
  let wires = content.wires as Wire[]
  const next: Record<string, any> = { ...content }

  // Sinalizadores: H2 laranja (se ainda de origem) e H3 vermelho ao lado.
  components = components.map((c) => (c.id === 'native-h2' && c.state?.color === ORIGINAL_H2_COLOR ? { ...c, state: { ...c.state, color: NATIVE_H2_COLOR } } : c))
  const seedH3 = seed.components.find((c) => c.id === NATIVE_H3_ID)!
  const hasBase = ['native-h2', 'native-plc', 'native-f1', 'native-psu'].every((id) => components.some((c) => c.id === id))
  if (hasBase && !components.some((c) => c.id === NATIVE_H3_ID)) {
    const at = components.findIndex((c) => c.id === 'native-h2')
    components = [...components.slice(0, at + 1), structuredClone(seedH3), ...components.slice(at + 1)]
  }

  // Cabos do F1 → I0.3 e de Q0.3 → H3, só com os bornes novos livres.
  const used = new Set(wires.flatMap((w) => [w.fromTerminalId, w.toTerminalId]))
  const added = seed.wires.filter((w) => [w.fromTerminalId, w.toTerminalId].some((t) => NEW_TERMINALS.includes(t) || t.startsWith(`${NATIVE_H3_ID}-`)))
  const free = NEW_TERMINALS.every((t) => !used.has(t)) && components.some((c) => c.id === NATIVE_H3_ID) && hasBase
  if (free) {
    const ids = new Set(wires.map((w) => w.id))
    const fresh = added.map((w) => structuredClone(w)).map((w, i) => (ids.has(w.id) ? { ...w, id: `${w.id}-sig${i}` } : w))
    wires = syncSharedTerminalFerrules([...wires, ...fresh])
  }
  next.components = components
  next.wires = wires

  // GRAFCET e programa do LOGO! (só intactos).
  if (isOriginalGrafcet(content.grafcet)) {
    next.grafcet = structuredClone(seed.grafcet)
    next.ladder = structuredClone(seed.ladder)
    const files = content.projectFiles && typeof content.projectFiles === 'object' ? content.projectFiles : {}
    const seedFiles = seed.projectFiles[NATIVE_PLC_ID]
    const own = Array.isArray(files[NATIVE_PLC_ID]) ? files[NATIVE_PLC_ID] : []
    next.projectFiles = { ...files, [NATIVE_PLC_ID]: [...own.filter((f: any) => !seedFiles.some((s) => s.id === f?.id)), ...structuredClone(seedFiles)] }
    const tags = Array.isArray(content.tags) ? content.tags : []
    next.tags = [...structuredClone(seed.tags), ...tags.filter((t: any) => !seed.tags.some((s) => s.address === t?.address || s.name === t?.name))]
  }
  next.nativeFeatures = [...features, NATIVE_SIGNALS_FEATURE]
  return next as T
}
