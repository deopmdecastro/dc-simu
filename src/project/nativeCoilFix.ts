/**
 * Bobina AC do KM1 no projeto nativo «Partida direta» guardado antes da correção c3df70f.
 *
 * A cablagem antiga ligava a bobina AC (WEG CWC09) ao 0 V DC da PS1 (KM1:A2 → PS1:-V2) e
 * alimentava a saída Q0.0 do LOGO! com os +24 V DC (PS1:+V1 → Q0.0 → Q0.1), o que o diagnóstico
 * acusa («classes incompatíveis»). A semente atual comuta a bobina com a fase do comando:
 *  · Q0:2 → Q0.0 (fase 230 V), ponte +24 V só para os sinalizadores (+V1 → Q0.1 → Q0.2);
 *  · retorno da bobina ao neutro do Q0 (Q0:4) — pela passagem A2 do F1 se este estiver encaixado.
 * Os cabos são encontrados pelas pontas (os ids antigos podem diferir) e só nessa forma antiga.
 */
import type { ElectricalComponent, Wire } from '../types'
import { NATIVE_COIL_AC_FEATURE, NATIVE_PARTIDA_ID } from './nativeMotorMeter'

export { NATIVE_COIL_AC_FEATURE }

const between = (w: Wire, a: string, b: string) => (w.fromTerminalId === a && w.toTerminalId === b) || (w.fromTerminalId === b && w.toTerminalId === a)

export function fixNativeCoilWiring<T extends Record<string, any>>(content: T): T {
  if (content.nativeId !== NATIVE_PARTIDA_ID || !Array.isArray(content.wires) || !Array.isArray(content.components)) return content
  const features: string[] = Array.isArray(content.nativeFeatures) ? content.nativeFeatures.filter((v: unknown) => typeof v === 'string') : []
  if (features.includes(NATIVE_COIL_AC_FEATURE)) return content
  const wires = content.wires as Wire[]
  const components = content.components as ElectricalComponent[]
  const f1Mounted = components.some((c) => c.id === 'native-f1' && c.mountedOn === 'native-km1')
  const returnFrom = f1Mounted ? 'native-f1-A2' : 'native-km1-A2'
  let changed = false
  const next = wires.map((w) => {
    // Retorno da bobina AC ao 0 V DC → neutro do comando (Q0:4).
    if (between(w, 'native-km1-A2', 'native-psu--V2')) { changed = true; return { ...w, fromTerminalId: returnFrom, toTerminalId: 'native-q0-4' } }
    // +24 V na saída Q0.0 → só nos sinalizadores (Q0.1).
    if (between(w, 'native-psu-+V1', 'native-plc-Q0.0')) { changed = true; return { ...w, fromTerminalId: 'native-psu-+V1', toTerminalId: 'native-plc-Q0.1' } }
    // Ponte Q0.0 → Q0.1 passa a ser a fase do comando a alimentar Q0.0 (Q0:2 → Q0.0).
    if (between(w, 'native-plc-Q0.0', 'native-plc-Q0.1')) {
      changed = true
      return { ...w, fromTerminalId: 'native-q0-2', toTerminalId: 'native-plc-Q0.0', color: 'black' as Wire['color'], waypoints: undefined, waypoints3D: undefined }
    }
    return w
  })
  return { ...content, ...(changed ? { wires: next } : {}), nativeFeatures: [...features, NATIVE_COIL_AC_FEATURE] }
}
