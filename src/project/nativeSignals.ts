/**
 * Sinalização do projeto nativo «Partida direta» guardado antes da semente atual (`signals-v2`).
 *
 * A semente tem:
 *  · o 97-98 do relé térmico F1 (NA, fecha no disparo) na entrada I0.3 do LOGO!;
 *  · H3 EMERGÊNCIA (vermelho) na saída Q0.3 e H2 PARADO laranja (antes vermelho);
 *  · GRAFCET com o F1: arranque só com o F1 armado, disparo = reset completo para X0; em X0,
 *    H2 acende sem falha e H3 com emergência premida ou F1 disparado.
 * Cada parte só entra se o projeto ainda a tiver como de origem (nunca sobrepõe alterações):
 *  · H3 entra se não existir; H2 muda de cor só se ainda for o vermelho de origem;
 *  · cada cabo novo entra se ainda faltar e os seus bornes exclusivos (97, 98, I0.3, Q0.3, H3) estiverem
 *    livres — cabo a cabo (a v1 era tudo-ou-nada e deixava o H3 sem cabos quando o 98 → I0.3 já
 *    tinha entrado com a migração do F1);
 *  · GRAFCET só se estiver intacto; as variáveis I0.3 F1 e Q0.3 H3 entram se faltarem.
 * O programa e as tags são os efetivos do LOGO! (`plcPrograms`/`plcTags` num projeto gravado): a v1
 * escrevia só em `ladder`/`tags`, que a app ignora ao abrir um projeto já gravado. O Ladder é refeito
 * a partir do GRAFCET em `nativeLadderSync`.
 */
import type { ElectricalComponent, Wire } from '../types'
import { syncSharedTerminalFerrules } from '../electrical/sharedFerrules'
import { NATIVE_PARTIDA_ID, NATIVE_SIGNALS_FEATURE } from './nativeMotorMeter'
import { buildNativePartidaDireta, isNativeSignalWire, nativeProgramOf, NATIVE_H2_COLOR, NATIVE_H3_ID, NATIVE_SIGNAL_TERMINALS, withNativeProgram } from './nativeProjects'

export { NATIVE_SIGNALS_FEATURE }
const ORIGINAL_H2_COLOR = '#ef4444'

/** GRAFCET de origem (antes do F1): duas etapas e as receptividades sem I0.3. */
function isOriginalGrafcet(grafcet: any): boolean {
  if (!Array.isArray(grafcet?.steps) || !Array.isArray(grafcet?.transitions)) return false
  const ids = grafcet.steps.map((s: any) => s?.id).join(',')
  const t1 = grafcet.transitions.find((t: any) => t?.id === 'native-t1')
  const t2 = grafcet.transitions.find((t: any) => t?.id === 'native-t2')
  const actions = grafcet.steps.map((s: any) => (Array.isArray(s?.actions) ? s.actions.map((a: any) => `${a?.address}:${a?.condition || '1'}`).join('+') : '')).join('|')
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
  let next: Record<string, any> = { ...content }

  // Sinalizadores: H2 laranja (se ainda de origem) e H3 vermelho ao lado.
  components = components.map((c) => (c.id === 'native-h2' && c.state?.color === ORIGINAL_H2_COLOR ? { ...c, state: { ...c.state, color: NATIVE_H2_COLOR } } : c))
  const seedH3 = seed.components.find((c) => c.id === NATIVE_H3_ID)!
  const hasBase = ['native-h2', 'native-plc', 'native-f1', 'native-psu'].every((id) => components.some((c) => c.id === id))
  if (hasBase && !components.some((c) => c.id === NATIVE_H3_ID)) {
    const at = components.findIndex((c) => c.id === 'native-h2')
    components = [...components.slice(0, at + 1), structuredClone(seedH3), ...components.slice(at + 1)]
  }

  // Cabos do F1 → I0.3 e de Q0.3 → H3, um a um.
  if (hasBase && components.some((c) => c.id === NATIVE_H3_ID)) {
    const terminalIds = new Set(components.flatMap((c) => c.terminals.map((t) => t.id)))
    const same = (a: Wire, b: Wire) => (a.fromTerminalId === b.fromTerminalId && a.toTerminalId === b.toTerminalId) || (a.fromTerminalId === b.toTerminalId && a.toTerminalId === b.fromTerminalId)
    const fresh: Wire[] = []
    for (const w of seed.wires.filter(isNativeSignalWire)) {
      if (!terminalIds.has(w.fromTerminalId) || !terminalIds.has(w.toTerminalId)) continue
      if (wires.some((x) => same(x, w))) continue
      // Borne exclusivo já usado por outro cabo (do utilizador): esse cabo não entra.
      const exclusive = [w.fromTerminalId, w.toTerminalId].filter((t) => NATIVE_SIGNAL_TERMINALS.includes(t))
      if (exclusive.some((t) => [...wires, ...fresh].some((x) => x.fromTerminalId === t || x.toTerminalId === t))) continue
      const ids = new Set([...wires, ...fresh].map((x) => x.id))
      fresh.push({ ...structuredClone(w), id: ids.has(w.id) ? `${w.id}-sig` : w.id })
    }
    if (fresh.length) wires = syncSharedTerminalFerrules([...wires, ...fresh])
  }
  next.components = components
  next.wires = wires

  // GRAFCET (só intacto) e variáveis I0.3/Q0.3 no programa efetivo do LOGO!.
  if (isOriginalGrafcet(content.grafcet)) next.grafcet = structuredClone(seed.grafcet)
  const { tags } = nativeProgramOf(next)
  const wanted = seed.tags.filter((t) => t.address === 'I0.3' || t.address === 'Q0.3')
  const missing = wanted.filter((t) => !tags.some((x: any) => String(x?.address).toUpperCase() === t.address))
  if (missing.length) next = withNativeProgram(next, { tags: [...tags, ...structuredClone(missing)] })
  next.nativeFeatures = [...features, NATIVE_SIGNALS_FEATURE]
  return next as T
}
