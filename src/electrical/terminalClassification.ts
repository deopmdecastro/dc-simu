import type { ElectricalComponent, Terminal, TerminalElectricalClass } from '../types'

export const TERMINAL_ELECTRICAL_CLASS_LABEL: Record<TerminalElectricalClass, string> = {
  dc: 'DC · corrente contínua',
  ac: 'AC · corrente alternada',
  network: 'Rede / comunicação',
  other: 'Outro / personalizado',
}

const NETWORK_LABEL = /(^|[^A-Z])(ETH|LAN|RJ45|PROFINET|MODBUS|CAN|BUS|RS[- ]?485|RS[- ]?232|SERVICE)([^A-Z]|$)/i
const DC_LABEL = /(^|[^A-Z])(L\+|M|24V|12V|V\+|V-|\+V|-V|0V|DI\d*|DO\d*)([^A-Z]|$)/i
const AC_LABEL = /(^|[^A-Z])(L\d*|N|U\d*|V\d*|W\d*|T\d*|S\d*)([^A-Z]|$)/i

/** Classificação sugerida a partir da serigrafia e da ficha técnica integrada.
 * A escolha explícita do utilizador (`electricalClass`) tem sempre prioridade. */
export function inferTerminalElectricalClass(component: ElectricalComponent, terminal: Terminal): TerminalElectricalClass {
  const label = `${terminal.label} ${terminal.displayName ?? ''}`.trim()
  if (NETWORK_LABEL.test(label) || terminal.kind === 'bus') return 'network'
  if (terminal.kind === 'earth') return 'other'

  if (component.type === 'powerSupplyProauto24A') {
    if (/^(L|N)$/i.test(terminal.label)) return 'ac'
    if (/^[+-]V/i.test(terminal.label)) return 'dc'
    return 'other' // RDY = contacto de sinalização sem potencial
  }
  if (component.type === 'plcSiemensLogo1224RC') {
    if (/^(L\+|M|I\d+)$/i.test(terminal.label)) return 'dc'
    return 'other' // saídas Q a relé aceitam circuitos externos AC/DC
  }
  if (component.type === 'plcLsXbmDn32s') return /^(L\+|M|I\d+|Q\d+)$/i.test(terminal.label) ? 'dc' : 'network'
  if (component.type === 'siemensTsAdapterIeBasic') return /^(ETH|SERVICE)$/i.test(terminal.label) ? 'network' : 'dc'
  // A variante AD22 integrada é nominalmente 24 V AC/DC; sem categoria dupla,
  // "outro" evita impor uma alimentação incompatível ao projeto.
  if (component.type === 'pilotLightAd22') return 'other'
  if (component.type === 'motor3ph' || component.type === 'motor1ph') return 'ac'
  if (component.type === 'transformer') return 'ac'
  if (component.type === 'contactorWegCWC09') {
    if (/^(A1|A2|[1-6][LT]\d)$/i.test(terminal.label)) return 'ac'
    return 'other'
  }
  if (component.category === 'protection' && (terminal.kind === 'power-in' || terminal.kind === 'power-out' || terminal.kind === 'neutral')) return 'ac'
  if (component.category === 'controller' && (terminal.kind === 'io' || terminal.kind === 'analog')) return 'dc'
  if (component.category === 'command' || component.category === 'relay') return 'other'

  if (DC_LABEL.test(label) || terminal.kind === 'coil-plus' || terminal.kind === 'coil-minus' || terminal.kind === 'analog') return 'dc'
  if (AC_LABEL.test(label) || terminal.kind === 'neutral') return 'ac'
  return 'other'
}

export function terminalElectricalClassOf(component: ElectricalComponent, terminal: Terminal): TerminalElectricalClass {
  return terminal.electricalClass ?? inferTerminalElectricalClass(component, terminal)
}

export function terminalDatasheetGuidance(component: ElectricalComponent): string {
  switch (component.type) {
    case 'powerSupplyProauto24A': return 'Ficha DRAN120-24A: L/N são AC; +V/−V são DC 24 V; RDY é contacto seco.'
    case 'plcSiemensLogo1224RC': return 'Ficha LOGO! 12/24RC: L+/M e I1…I8 são DC; Q1…Q4 são contactos de relé AC/DC.'
    case 'plcLsXbmDn32s': return 'Ficha XBM-DN32S: alimentação e I/O são DC; portas de comunicação devem ser Rede.'
    case 'siemensTsAdapterIeBasic': return 'Ficha TS Adapter: L+/M são DC; ETH e SERVICE são Rede/comunicação.'
    case 'motor3ph': return 'Ficha DRN80MK4/B3: U1/V1/W1 são AC trifásico; PE é proteção e deve ficar em Outro/terra.'
    case 'pilotLightAd22': return 'Ficha AD22-22DS: X1/X2 aceitam 24 V AC/DC. Use Outro “AC/DC 24 V”, ou fixe AC/DC conforme o circuito.'
    case 'contactorWegCWC09': return 'Ficha CWC09 integrada: polos de potência e bobina são AC; auxiliares 13/14 e 21/22 são contactos secos.'
    case 'dualPushButtonNpb22D11': return 'Ficha NPB22-D11: 13/14 e 21/22 são contactos secos; classifique como Outro.'
    default: return 'Confirme na ficha técnica a tensão, polaridade e protocolo antes de guardar o borne.'
  }
}

export function terminalClassesCompatible(a: TerminalElectricalClass, b: TerminalElectricalClass): boolean {
  if (a === 'other' || b === 'other') return true
  return a === b
}
