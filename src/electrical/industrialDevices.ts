/** Variantes industriais documentadas; não altera terminais dos modelos legados. */
import geometry from '../data/industrial-device-geometry.json'
import type { ElectricalComponent, TerminalKind } from '../types'
import type { ComponentTemplate, TerminalTemplate } from './factory'

export type IndustrialDeviceType = keyof typeof geometry
export const INDUSTRIAL_DEVICE_TYPES = Object.keys(geometry) as IndustrialDeviceType[]
export const isIndustrialDevice = (type: string): type is IndustrialDeviceType => Object.prototype.hasOwnProperty.call(geometry, type)
export const INDUSTRIAL_GEOMETRY = geometry

/** Só tipos nativos ou versões do catálogo explicitamente originadas num deles. */
export function industrialDeviceTypeOf(c: Pick<ElectricalComponent, 'type' | 'state'>): IndustrialDeviceType | null {
  if (isIndustrialDevice(c.type)) return c.type
  const origin = c.state?.industrialOrigin
  return c.type.startsWith('cat:') && typeof origin === 'string' && isIndustrialDevice(origin) ? origin : null
}

export const INDUSTRIAL_INFO: Record<IndustrialDeviceType, {
  name: string; manufacturer: string; reference: string; category: ComponentTemplate['category']; tag: string
  datasheet: string; source: string; provenance: string; scope: string; defaultState: Record<string, unknown>
}> = {
  vfdSchneiderAtv320: {
    name: 'Variador Schneider Altivar Machine ATV320U04M2C · 0,37 kW', manufacturer: 'Schneider Electric', reference: 'ATV320U04M2C', category: 'drive', tag: 'U',
    datasheet: '/datasheets/industrial/schneider-atv320u04m2c.pdf', source: 'https://www.se.com/uk/en/download/document/MCADID0000926_3D-CAD/', provenance: 'STEP oficial Schneider MCADID0000926, adaptado; cores, visor e comandos separados.',
    scope: 'Entrada monofásica 200–240 V CA; saída trifásica, 0,37 kW / 3,3 A. STO e DI1/DI2 têm de ser cablados: não há pontes nem botão RUN inventados. Encoder/ESC navegam Ref/Mon/Conf e ajustam a referência. Modelo didático com rampa linear, não PWM, PID, comunicação ou validação SIL/PL. Bornes de controlo sob tampa: localização funcional de referência, não certificada para fabrico.',
    defaultState: { powered: false, running: false, enabled: true, editing: false, controlCoverOpen: false, frequencyHz: 0, presetHz: 50, rampUpMs: 3000, rampDownMs: 3000, menu: 'ref', direction: 'cw', stoReleased: false, supplyMismatch: false, deviceFault: false },
  },
  relayFinder5534: {
    name: 'Relé de interface Finder 55.34 + base 94.04 · 4 CO · 24 V DC', manufacturer: 'Finder', reference: '55.34.9.024.0040 + 94.04', category: 'relay', tag: 'KA',
    datasheet: '/datasheets/industrial/finder-serie-55.pdf', source: 'https://cdn.findernet.com/app/uploads/S55PT.pdf', provenance: 'Dois STEP oficiais Finder; interior transparente e montagem adaptados.',
    scope: 'Quatro inversores isolados: 11/12/14, 21/22/24, 31/32/34 e 41/42/44. Bobina A1/A2 de 24 V CC, 7 A / 250 V CA nos contactos. Teste mecânico momentâneo com cancelamento; esta variante de bobina é explícita, não uma identificação comprovada da fotografia. Não tem LCD.',
    defaultState: { powered: false, energized: false, testPressed: false, supplyMismatch: false },
  },
  timerGeyaGrt8M1: {
    name: 'Temporizador GEYA GRT8-M1 W240 · multifunções · TON em A', manufacturer: 'GEYA', reference: 'GRT8-M1 W240', category: 'relay', tag: 'KT',
    datasheet: '/datasheets/industrial/geya-grt8-m.pdf', source: 'https://www.geya.net/wp-content/uploads/2021/05/GRT8-M-Instruction-Manual.pdf', provenance: 'Reconstrução 3D cotada/fotográfica; não foi obtido STEP do fabricante.',
    scope: 'A1/A2: 12–240 V CA/CC, S: comando, inversor 15/16/18 de 16 A AC1. Dez funções A…J; A=TON, E=TOF por S (B é intervalo, não TOF neste modelo). Atraso = escala × ajuste 10–100%; 0,1 s…10 dias. Sem LCD. Simulação ideal, sem tolerâncias eletromecânicas.',
    defaultState: { powered: false, energized: false, function: 'A', rangeMs: 10000, fraction: .3, presetMs: 3000, elapsedMs: 0, running: false, supplyMismatch: false },
  },
  timerGeyaGrt8M2: {
    name: 'Temporizador GEYA GRT8-M2 W240 · multifunções · 2×SPDT · TON em A', manufacturer: 'GEYA', reference: 'GRT8-M2 W240', category: 'relay', tag: 'KT',
    datasheet: '/datasheets/industrial/geya-grt8-m.pdf', source: 'https://www.geya.net/wp-content/uploads/2021/05/GRT8-M-Instruction-Manual.pdf', provenance: 'Reconstrução 3D cotada/fotográfica; não foi obtido STEP do fabricante.',
    scope: 'A1/A2: 12–240 V CA/CC, S: comando, dois inversores independentes de 16 A AC1: 15/16/18 e 25/26/28. Dez funções A…J; A=TON, E=TOF por S. Atraso = escala × ajuste 10–100%; 0,1 s…10 dias. Sem LCD. Simulação ideal, sem tolerâncias eletromecânicas.',
    defaultState: { powered: false, energized: false, function: 'A', rangeMs: 10000, fraction: .3, presetMs: 3000, elapsedMs: 0, running: false, supplyMismatch: false },
  },
  timerGeyaGrt8B1: {
    name: 'Temporizador TOF GEYA GRT8-B1 A230 · desoperação por S', manufacturer: 'GEYA', reference: 'GRT8-B1 A230', category: 'relay', tag: 'KT',
    datasheet: '/datasheets/industrial/geya-grt8-ab.pdf', source: 'https://www.geya.net/wp-content/uploads/2022/10/GRT8-AB-Manual.pdf', provenance: 'Reconstrução 3D cotada/fotográfica; não foi obtido STEP do fabricante.',
    scope: 'A1/A2: 230 V CA (195,5–253 V), alimentados continuamente; ao alimentar começa o intervalo de desoperação da figura GEYA, fechar S atraca imediatamente, abrir S inicia TOF. Perda de A1/A2 liberta imediatamente: não é atraso alimentado por energia armazenada. 15 comum / 16 NF / 18 NA, 16 A AC1. Escala × ajuste 10–100%; sem LCD.',
    defaultState: { powered: false, energized: false, function: 'E', rangeMs: 10000, fraction: .3, presetMs: 3000, elapsedMs: 0, running: false, supplyMismatch: false },
  },
  levelRelayAvel411: {
    name: 'Relé de nível AVEL 411RNPD0023 · poço e depósito · 230 V AC', manufacturer: 'AVEL', reference: '411RNPD0023', category: 'relay', tag: 'KN',
    datasheet: '/datasheets/industrial/avel-411rnpd0.pdf', source: 'https://www.caiado.pt/images/uploaded/CatalogosCaiado/catalogo-avel-reles-eletronicos.pdf', provenance: 'Reconstrução 3D cotada e rótulo real do catálogo AVEL; sem STEP oficial.',
    scope: 'Plug-in 11 pinos; base não incluída automaticamente. Alimentação 2–10, 230 V CA. Contacto 1–3 NA / 1–4 NF, 10 A. Depósito: mínimo 11, máximo 8, comum 9; poço: mínimo 6, máximo 5, comum 7 (seis sondas). Histerese de enchimento e proteção de poço seco. As sondas podem ser contactos cablados ou ambiente de ensaio explicitamente virtual. Seis LEDs, sem botões nem LCD.',
    defaultState: { powered: false, energized: false, probeMode: 'wired', tankMinWet: false, tankMaxWet: false, wellMinWet: false, wellMaxWet: false, wellReady: false, tankDemand: true, supplyMismatch: false },
  },
  relaySocketFinder9023: {
    name: 'Base undecal Finder 90.23 · 11 pinos · painel/calha DIN', manufacturer: 'Finder', reference: '90.23', category: 'terminal', tag: 'X',
    datasheet: '/datasheets/industrial/finder-serie-60-bases-90.pdf', source: 'https://www.findernet.com/en/canada/series/90-series-sockets-for-60-and-88-series-relay-and-timers/type/type-9023-socket-with-box-clamp-terminals/', provenance: 'STEP oficial Finder 9023.stp; orientação/material adaptados, patim na pose CAD.',
    scope: 'Onze vias independentes, 10 A / 250 V, parafuso 1…11 e alvéolo P1…P11 da mesma via. Sem relé e sem contactos comutados internos. P2/P10 não são uma bobina na base vazia. A compatibilidade geométrica com um relé não certifica toda a aplicação. Envelope do CAD inclui saliências de montagem.',
    defaultState: {},
  },
  buzzerMetaltexTby301: {
    name: 'Sinalizador sonoro Metaltex TBY-301 · 110 V AC · Ø30 mm', manufacturer: 'Metaltex', reference: 'TBY-301', category: 'signaling', tag: 'HA',
    datasheet: '/datasheets/industrial/metaltex-tby.pdf', source: 'https://arquivo.metaltex.com.br/produtos/pdf/tby.pdf', provenance: 'Reconstrução 3D cotada do desenho Metaltex; não foi obtido STEP do fabricante.',
    scope: '110 V CA 50/60 Hz, som contínuo, cabeça Ø35 mm / furação Ø30, corpo 47×47 mm, comprimento nominal 69,5 mm. Ficha: >85 dB e máximo 30 minutos contínuos. Som sintetizado de ensaio, sem calibração SPL nem promessa de reprodução exata. As fotos «tend / AC110V» não são prova de marca Metaltex. Sem LCD ou luz inventada.',
    defaultState: { on: false, powered: false, activeMs: 0, dutyLimitReached: false, supplyMismatch: false },
  },
  // Botoeira Ø22 mm KEOLEA KL-XB2 (vermelho NF 1-2, verde NA 3-4, preto NA 3-4).
  // Bloco de contacto instantâneo com retorno por mola; anel Ø29 mm, furação Ø22.
  pushButtonXb2No: {
    name: 'Botoeira KEOLEA KL-XB2 verde · NA 3-4 · momentânea', manufacturer: 'KEOLEA', reference: 'KL-XB2-BA31', category: 'command', tag: 'S',
    datasheet: '/datasheets/industrial/keolea-xb2.pdf', source: 'https://www.keolea.com/uploads/xb2-ba.pdf', provenance: 'Reconstrução 3D cotada das fotografias do utilizador; não foi obtido STEP do fabricante.',
    scope: 'Ø22 mm de furação, anel serrilhado Ø29 mm, bloco NA verde 3-4. Ui 660 V, Ith 10 A, Uimp 6 kV, AC-15 240 V/3 A, DC-13. Contacto fecha enquanto premido e abre por mola ao largar. Sem iluminação nem manípulo de manobra.',
    defaultState: { pressed: false, momentary: true, color: '#16a34a' },
  },
  pushButtonXb2Nc: {
    name: 'Botoeira KEOLEA KL-XB2 vermelha · NF 1-2 · momentânea', manufacturer: 'KEOLEA', reference: 'KL-XB2-BA42', category: 'command', tag: 'S',
    datasheet: '/datasheets/industrial/keolea-xb2.pdf', source: 'https://www.keolea.com/uploads/xb2-ba.pdf', provenance: 'Reconstrução 3D cotada das fotografias do utilizador; não foi obtido STEP do fabricante.',
    scope: 'Ø22 mm de furação, anel serrilhado Ø29 mm, bloco NF vermelho 1-2. Ui 660 V, Ith 10 A, Uimp 6 kV, AC-15 240 V/3 A, DC-13. Contacto abre enquanto premido e fecha por mola ao largar. Sem iluminação nem manípulo de manobra.',
    defaultState: { pressed: false, momentary: true, color: '#dc2626' },
  },
  pushButtonXb2Black: {
    name: 'Botoeira KEOLEA KL-XB2 preta · NA 3-4 · momentânea', manufacturer: 'KEOLEA', reference: 'KL-XB2-BA21', category: 'command', tag: 'S',
    datasheet: '/datasheets/industrial/keolea-xb2.pdf', source: 'https://www.keolea.com/uploads/xb2-ba.pdf', provenance: 'Reconstrução 3D cotada das fotografias do utilizador; não foi obtido STEP do fabricante.',
    scope: 'Ø22 mm de furação, anel serrilhado Ø29 mm, bloco NA branco 3-4 (tampa preta). Ui 660 V, Ith 10 A, Uimp 6 kV, AC-15 240 V/3 A, DC-13. Contacto fecha enquanto premido e abre por mola ao largar. Sem iluminação nem manípulo de manobra.',
    defaultState: { pressed: false, momentary: true, color: '#1f2937' },
  },
  pushButtonXb2Yellow: {
    name: 'Botoeira KEOLEA KL-XB2 amarela · NA 3-4 · momentânea', manufacturer: 'KEOLEA', reference: 'KL-XB2-BA51', category: 'command', tag: 'S',
    datasheet: '/datasheets/industrial/keolea-xb2.pdf', source: 'https://www.keolea.com/uploads/xb2-ba.pdf', provenance: 'Reconstrução 3D cotada das fotografias do utilizador; não foi obtido STEP do fabricante.',
    scope: 'Ø22 mm de furação, anel serrilhado Ø29 mm, bloco NA 3-4. Ui 660 V, Ith 10 A, Uimp 6 kV, AC-15 240 V/3 A, DC-13. Contacto fecha enquanto premido e abre por mola ao largar. Sem iluminação nem manípulo de manobra.',
    defaultState: { pressed: false, momentary: true, color: '#eab308' },
  },
  pushButtonXb2Blue: {
    name: 'Botoeira KEOLEA KL-XB2 azul · NA 3-4 · momentânea', manufacturer: 'KEOLEA', reference: 'KL-XB2-BA61', category: 'command', tag: 'S',
    datasheet: '/datasheets/industrial/keolea-xb2.pdf', source: 'https://www.keolea.com/uploads/xb2-ba.pdf', provenance: 'Reconstrução 3D cotada das fotografias do utilizador; não foi obtido STEP do fabricante.',
    scope: 'Ø22 mm de furação, anel serrilhado Ø29 mm, bloco NA 3-4. Ui 660 V, Ith 10 A, Uimp 6 kV, AC-15 240 V/3 A, DC-13. Contacto fecha enquanto premido e abre por mola ao largar. Sem iluminação nem manípulo de manobra.',
    defaultState: { pressed: false, momentary: true, color: '#2563eb' },
  },
  pushButtonXb2White: {
    name: 'Botoeira KEOLEA KL-XB2 branca · NA 3-4 · momentânea', manufacturer: 'KEOLEA', reference: 'KL-XB2-BA11', category: 'command', tag: 'S',
    datasheet: '/datasheets/industrial/keolea-xb2.pdf', source: 'https://www.keolea.com/uploads/xb2-ba.pdf', provenance: 'Reconstrução 3D cotada das fotografias do utilizador; não foi obtido STEP do fabricante.',
    scope: 'Ø22 mm de furação, anel serrilhado Ø29 mm, bloco NA 3-4. Ui 660 V, Ith 10 A, Uimp 6 kV, AC-15 240 V/3 A, DC-13. Contacto fecha enquanto premido e abre por mola ao largar. Sem iluminação nem manípulo de manobra.',
    defaultState: { pressed: false, momentary: true, color: '#f8fafc' },
  },
  breakerMurrelektronikMico46: {
    name: 'Proteção eletrónica Murrelektronik MICO Classic 4.6 · 4 canais · 24 V DC', manufacturer: 'Murrelektronik', reference: '9000-41034-0100600', category: 'protection', tag: 'F',
    datasheet: '/datasheets/industrial/murrelektronik-mico46.pdf', source: 'https://media.automation24.com/manual/101523.pdf', provenance: 'Reconstrução 3D cotada do manual de instalação MICO 4.6 V2.5; não foi obtido STEP do fabricante.',
    scope: 'Entrada +24 V DC (18–30 V) por bornes de mola 16 mm² (L+/L+2); 4 canais OUT 24 V com seletor de corrente 1/2/4/6 A por canal e botão ON/OFF com LED bi-cor (verde=on, verde intermitente=>90%I, vermelho=off, vermelho 1 Hz=sobrecorrente disparado, vermelho 5 Hz=defeito interno). Arranque em cascata 75 ms por canal; memória de estado após corte de rede. Sammelmeldung 13-14 contacto livre de potencial 30 V AC/DC 100 mA (abre em qualquer disparo); entrada ON remota 10–30 V DC ≥20 ms (restart). GND alimenta a eletrónica. Corrente máxima de ponte 40 A; paralelo de canais não permitido.',
    defaultState: { powered: false, onRemote: false, channels: { '1': { on: false, tripped: false, fault: false, currentA: 0, setpointA: 1 }, '2': { on: false, tripped: false, fault: false, currentA: 0, setpointA: 1 }, '3': { on: false, tripped: false, fault: false, currentA: 0, setpointA: 1 }, '4': { on: false, tripped: false, fault: false, currentA: 0, setpointA: 1 } }, supplyMismatch: false },
  },
}

function terminalKind(type: IndustrialDeviceType, label: string): TerminalKind {
  if (['pushButtonXb2No','pushButtonXb2Black','pushButtonXb2Yellow','pushButtonXb2Blue','pushButtonXb2White'].includes(type)) return label === '3' ? 'power-in' : 'power-out'
  if (type === 'pushButtonXb2Nc') return label === '1' ? 'power-in' : 'power-out'
  if (type === 'vfdSchneiderAtv320') {
    if (label.startsWith('PE')) return 'earth'
    if (['R/L1','S/L2'].includes(label)) return 'power-in'
    if (['U/T1','V/T2','W/T3'].includes(label)) return 'power-out'
    if (label.startsWith('COM') || label === 'DQ-') return 'neutral'
    if (['+24','10V'].includes(label)) return 'power-out'
    if (label === 'P24') return 'power-in'
    if (/AI|AQ/.test(label)) return 'analog'
  }
  if (['relayFinder5534','timerGeyaGrt8M1','timerGeyaGrt8M2','timerGeyaGrt8B1'].includes(type)) {
    if (label === 'A1') return 'coil-plus'
    if (label === 'A2') return 'coil-minus'
    if (label === 'S') return 'io'
    if (/[26]$/.test(label)) return 'aux-nc'
    return 'aux-no'
  }
  if (type === 'levelRelayAvel411') return label === '2' ? 'coil-plus' : label === '10' ? 'coil-minus' : label === '4' ? 'aux-nc' : 'io'
  if (type === 'breakerMurrelektronikMico46') {
    if (label === 'GND' || label === 'GND2') return 'neutral'
    if (label === 'L+' || label === 'L+2') return 'power-in'
    if (label === 'ON') return 'io'
    if (label === '13' || label === '14') return 'aux-no'
    if (/^OUT[1-4]$/.test(label)) return 'power-out'
    return 'io'
  }
  return 'io'
}

/** Mesma escala física do restante esquema (1,5 px/mm). A área de seleção e
 * as legendas podem ter margem; a peça nunca é alargada para as acomodar. */
export function industrialSchematicFootprint(type: IndustrialDeviceType): { w: number; h: number } {
  const { width, height } = geometry[type].physicalSizeMm
  return { w: Math.max(1, Math.round(width * 1.5)), h: Math.max(1, Math.round(height * 1.5)) }
}

/** Pasta da biblioteca por categoria (as mesmas dos integrados) — nunca «o resto vai para Relés». */
const INDUSTRIAL_PALETTE_GROUP: Record<ComponentTemplate['category'], string> = {
  protection: 'Proteção', command: 'Comando', sensor: 'Sensores', measurement: 'Aparelhos de medir',
  contactor: 'Contatores', relay: 'Relés', signaling: 'Sinalização', motor: 'Motores', drive: 'Acionamentos',
  controller: 'Controladores', terminal: 'Bornes e barras', power: 'Fontes',
}

export function industrialTemplates(): Record<IndustrialDeviceType, ComponentTemplate> {
  return Object.fromEntries(INDUSTRIAL_DEVICE_TYPES.map(type => {
    const g = geometry[type], info = INDUSTRIAL_INFO[type]
    const normals = { front: [0,0,1], back: [0,0,-1], top: [0,1,0], bottom: [0,-1,0], left: [-1,0,0], right: [1,0,0] }
    // Grupos lógicos em grelha. IDs e coordenadas 3D continuam a vir do fabricante.
    const groups: typeof g.terminals[] = []
    if (type === 'vfdSchneiderAtv320') {
      const power = g.terminals.filter(t => ['PB','PO','PA/+','PC/-','U/T1','V/T2','W/T3','R/L1','S/L2','PE-IN','PE-OUT'].includes(t.label))
      const controls = g.terminals.filter(t => !power.includes(t))
      for (let i = 0; i < controls.length; i += 8) groups.push(controls.slice(i,i+8))
      for (let i = 0; i < power.length; i += 7) groups.push(power.slice(i,i+7))
    } else if (type === 'relaySocketFinder9023') {
      groups.push(g.terminals.filter(t => !t.label.startsWith('P')).slice(0,6), g.terminals.filter(t => !t.label.startsWith('P')).slice(6),
        g.terminals.filter(t => t.label.startsWith('P')).slice(0,6), g.terminals.filter(t => t.label.startsWith('P')).slice(6))
    } else {
      const columns = type === 'relayFinder5534' ? 4 : type === 'levelRelayAvel411' ? 4 : 3
      for (let i = 0; i < g.terminals.length; i += columns) groups.push(g.terminals.slice(i,i+columns))
    }
    const footprint = industrialSchematicFootprint(type)
    const terminals: TerminalTemplate[] = g.terminals.map(spot => {
      const row = groups.findIndex(group => group.includes(spot)), column = groups[row].indexOf(spot)
      const position = { x: spot.x, y: 1-spot.y, z: spot.z }
      // Retain existing logical layouts where already legible. Narrow 18 mm
      // relays need slightly wider target spacing, not an enlarged body/CAD.
      const logicalPitch = Math.max(1 / (groups[row].length + 1), 8.5 / footprint.w)
      return { label: spot.label, kind: terminalKind(type,spot.label),
        x: .5 + (column - (groups[row].length - 1) / 2) * logicalPitch,
        y: groups.length === 1 ? .85 : .08 + row/(groups.length-1)*.84,
        terminalType: spot.contact === 'pin' ? 'plug' : 'screw', contact: spot.contact as 'pin'|'socket'|'surface',
        diameter: Math.min(6,spot.diameterMm??3), position3D: position,
        face: spot.face as 'front'|'back'|'top'|'bottom'|'left'|'right',
        socket3D: { diameterMm: spot.diameterMm??3, depthMm: spot.holeDepthMm??5, insetMm: 0,
          normal: normals[spot.face as keyof typeof normals] as [number,number,number], position },
        ...(spot.contact==='pin'?{displayName:'Pino '+spot.label}:spot.label.startsWith('P')&&type==='relaySocketFinder9023'?{displayName:'Alvéolo '+spot.label}:{}) }
    })
    return [type,{ category:info.category,paletteName:info.name,group:INDUSTRIAL_PALETTE_GROUP[info.category],
      tag:info.tag,...industrialSchematicFootprint(type),terminals,defaultState:structuredClone(info.defaultState) }]
  })) as Record<IndustrialDeviceType,ComponentTemplate>
}

export const GEYA_RANGES_MS = [1000,10000,60000,600000,3600000,36000000,86400000,864000000,-1,0] as const
export const GEYA_FUNCTIONS = ['A','B','C','D','E','F','G','H','I','J'] as const
export const GEYA_FUNCTION_LABELS: Record<string,string> = {A:'TON · atraso à operação',B:'Intervalo ao alimentar',C:'Ciclo · começa desligado',D:'Ciclo · começa ligado',E:'TOF · atraso ao abrir S',F:'Impulso na subida de S',G:'Impulso redisparável por S (diagrama GEYA)',H:'Atraso à operação/desoperação',I:'Relé biestável',J:'Gerador de impulso 0,5 s'}

/** Pontes de contactos secos; nunca liga alimentação, sondas e potência do variador. */
export function industrialBridges(c: ElectricalComponent): Array<[string,string]> | null {
  const type = industrialDeviceTypeOf(c)
  if (!type) return null
  const out:Array<[string,string]>=[],id=(label:string)=>c.terminals.find(t=>t.label===label)?.id
  const pair=(a:string,b:string)=>{const x=id(a),y=id(b);if(x&&y)out.push([x,y])}
  if(type==='relaySocketFinder9023')for(let i=1;i<=11;i++)pair(String(i),'P'+i)
  else if(type==='relayFinder5534')for(const n of [1,2,3,4])pair(n+'1',n+(c.state.energized?'4':'2'))
  else if(type==='timerGeyaGrt8M1'||type==='timerGeyaGrt8B1')pair('15',c.state.energized?'18':'16')
  else if(type==='timerGeyaGrt8M2'){const on=c.state.energized;pair('15',on?'18':'16');pair('25',on?'28':'26')}
  else if(type==='levelRelayAvel411')pair('1',c.state.energized?'3':'4')
  else if(type.startsWith('pushButtonXb2')&&type!=='pushButtonXb2Nc'){if(c.state.pressed)pair('3','4')}
  else if(type==='pushButtonXb2Nc'){if(!c.state.pressed)pair('1','2')}
  else if(type==='breakerMurrelektronikMico46'){
    const ch=(c.state.channels??{}) as Record<string,{on:boolean;tripped:boolean;fault:boolean}>
    const anyBad=[1,2,3,4].some(i=>{const k=ch[String(i)];return !!k?.on&&(!!k?.tripped||!!k?.fault)})
    if(!anyBad)pair('13','14')
    for(let i=1;i<=4;i++){
      const k=ch[String(i)]
      if(k?.on&&!k?.tripped&&!k?.fault)pair('L+','OUT'+i)
    }
  }
  else if(type==='vfdSchneiderAtv320'){
    pair('PE-IN','PE-OUT');pair('COM1','COM2')
    pair('R1C',c.state.powered&&!c.state.deviceFault?'R1A':'R1B')
    if(c.state.running)pair('R2C','R2A')
  }
  return out
}

export interface IndustrialElectricalContext {
  components: ElectricalComponent[]
  live: Set<string>
  adjacency: Map<string, Set<string> | string[]>
  phases: Map<string,string>
}
function netOf(id: string, graph: IndustrialElectricalContext['adjacency']):Set<string>{const seen=new Set([id]),queue=[id];for(let i=0;i<queue.length;i++)for(const n of graph.get(queue[i])??[])if(!seen.has(n)){seen.add(n);queue.push(n)}return seen}
function terminal(c:ElectricalComponent,label:string){return c.terminals.find(t=>t.label===label)?.id}
export function industrialConnected(c:ElectricalComponent,a:string,b:string,ctx:IndustrialElectricalContext):boolean {const x=terminal(c,a),y=terminal(c,b);return !!x&&!!y&&netOf(x,ctx.adjacency).has(y)}
/** Tensão nominal por rede de origem. Não é um solver analógico de impedâncias. */
export function industrialInput(c:ElectricalComponent,a:string,b:string,ctx:IndustrialElectricalContext):{voltage:number;dc:boolean;positive:boolean} {
  const x=terminal(c,a),y=terminal(c,b),zero={voltage:0,dc:false,positive:false}
  if(!x||!y||!ctx.live.has(x)||!ctx.live.has(y))return zero
  const nx=netOf(x,ctx.adjacency),ny=netOf(y,ctx.adjacency)
  if(nx.has(y))return zero
  const px=ctx.phases.get(x),py=ctx.phases.get(y)
  if(px&&py&&px===py)return zero
  for(const source of ctx.components){
    const pair=(p:string,n:string,v:number,dc:boolean)=>{
      const plus=terminal(source,p),minus=terminal(source,n)
      return plus&&minus&&((nx.has(plus)&&ny.has(minus))||(ny.has(plus)&&nx.has(minus)))?{voltage:v,dc,positive:nx.has(plus)}:null
    }
    if(source.type==='powerSource24v'){const r=pair('+24V','0V',Number(source.state.nominalV??24),true);if(r)return r}
    if(source.type==='powerSupplyProauto24A'){const r=pair('+V1','-V1',24,true)??pair('+V2','-V2',24,true);if(r)return r}
    if(source.type==='powerSource1ph'){const r=pair('L','N',Number(source.state.nominalV??230),false);if(r)return r}
    if(source.type==='powerSource3ph'){
      for(const p of ['L1','L2','L3']){const r=pair(p,'N',Number(source.state.nominalV??400)/Math.sqrt(3),false);if(r)return r}
      for(const [p,n]of [['L1','L2'],['L2','L3'],['L3','L1']]){const r=pair(p,n,Number(source.state.nominalV??400),false);if(r)return r}
    }
    if(industrialDeviceTypeOf(source)==='vfdSchneiderAtv320'&&source.state.powered){const r=pair('+24','COM1',24,true)??pair('+24','COM2',24,true)??pair('10V','COM1',10,true);if(r)return r}
  }
  // Alimentação implícita dos disjuntores gerais da plataforma, sem inventar CC.
  if(px&&py&&((/^L[123]$/.test(px)&&py==='N')||(/^L[123]$/.test(py)&&px==='N')))return {voltage:230,dc:false,positive:false}
  if(px&&py&&/^L[123]$/.test(px)&&/^L[123]$/.test(py)&&px!==py)return {voltage:400,dc:false,positive:false}
  return zero
}
const inRange=(v:number,a:number,b:number)=>v>=a&&v<=b

/**
 * Cronogramas do manual GRT8-M p.2. G: o texto/diagrama mostram redisparo na
 * subida apesar do título contraditório; H conserva impulsos S curtos (retardo
 * independente de cada flanco), não é um TON que descarta esses impulsos.
 */
export function updateGeyaTimer(state:Record<string,any>,powered:boolean,trigger:boolean,dtMs:number,fixedTof=false):void {
  const dt = Math.max(0,Number.isFinite(dtMs)?dtMs:0)
  const rawRange = Number(state.rangeMs??10000), range = Number.isFinite(rawRange)?rawRange:10000
  const rawFraction = Number(state.fraction??.3), fraction = Math.max(.1,Math.min(1,Number.isFinite(rawFraction)?rawFraction:.3))
  const preset = Math.max(100,range*fraction), fn = fixedTof?'E':String(state.function??'A')
  state.presetMs=preset;state.powered=powered
  if(!powered){
    state.energized=false;state.elapsedMs=0;state.running=false
    for(const key of ['_wasPowered','_wasTrigger','_offTiming','_pulseActive'])state[key]=false
    state._delayedEdges=[];return
  }
  const rising=trigger&&!state._wasTrigger,falling=!trigger&&!!state._wasTrigger,newPower=!state._wasPowered
  let elapsed=Math.max(0,Number(state.elapsedMs)||0),on=!!state.energized,running=false
  if(range===-1){on=true;elapsed=0}
  else if(range===0){on=false;elapsed=0}
  else if(fn==='A'){elapsed=Math.min(preset,elapsed+dt);on=elapsed>=preset;running=!on}
  else if(fn==='B'){elapsed=Math.min(preset,elapsed+dt);on=elapsed<preset;running=on}
  else if(fn==='C'||fn==='D'){elapsed=(elapsed+dt)%(preset*2);on=fn==='D'?elapsed<preset:elapsed>=preset;running=true}
  else if(fn==='E'){
    if(newPower&&fixedTof){state._offTiming=true;elapsed=0}
    if(trigger){on=true;elapsed=0;state._offTiming=false}
    else if(falling){elapsed=0;state._offTiming=true}
    if(!trigger&&state._offTiming){elapsed=Math.min(preset,elapsed+dt);on=elapsed<preset;running=on;if(!on)state._offTiming=false}
    else if(!trigger&&!state._offTiming)on=false
  }else if(fn==='F'||fn==='G'){
    if(rising&&(!state._pulseActive||fn==='G')){elapsed=0;state._pulseActive=true}
    if(state._pulseActive){elapsed=Math.min(preset,elapsed+dt);on=elapsed<preset;running=on;if(!on)state._pulseActive=false}else on=false
  }else if(fn==='H'){
    const edges = (Array.isArray(state._delayedEdges)?state._delayedEdges:[]) as Array<{ remaining:number; on:boolean }>
    if(rising||falling)edges.push({remaining:preset,on:trigger})
    for(const edge of edges)edge.remaining-=dt
    while(edges.length&&edges[0].remaining<=0)on=edges.shift()!.on
    state._delayedEdges=edges;running=edges.length>0;elapsed=running?Math.max(0,preset-edges[0].remaining):0
  }else if(fn==='I'){if(rising)on=!on;elapsed=0}
  else if(fn==='J'){elapsed=Math.min(preset+500,elapsed+dt);on=elapsed>=preset&&elapsed<preset+500;running=elapsed<preset+500}
  state.energized=on;state.elapsedMs=elapsed;state.running=running;state._wasPowered=true;state._wasTrigger=trigger
}

/** MICO Classic 4.6: atualiza cada canal (disparo por sobrecorrente / defeito / manual) e o Sammelmeldung. */
export function updateMico46(state:Record<string,any>,powered:boolean,dtMs:number):void {
  const dt=Math.max(0,Number.isFinite(dtMs)?dtMs:0)
  state.powered=powered
  const ch=(state.channels??{}) as Record<string,{on:boolean;tripped:boolean;fault:boolean;currentA:number;setpointA:number}>
  for(const key of ['1','2','3','4']){
    const c=ch[key]??={on:false,tripped:false,fault:false,currentA:0,setpointA:1}
    c.currentA=Math.max(0,Number(c.currentA)||0)
    c.setpointA=[1,2,4,6].includes(c.setpointA)?c.setpointA:1
    if(!powered){c.tripped=false;c.fault=false;c.currentA=0;continue}
    if(c.on&&!c.fault&&!c.tripped){
      if(c.currentA>c.setpointA)c.tripped=true
    }
  }
  if(powered&&!state._wasPowered){
    for(const key of ['1','2','3','4'])if(ch[key]?.on)state['_cascade_'+key]=75*(Number(key)-1)
  }
  state._wasPowered=powered
  if(powered&&state.onRemote)for(const key of ['1','2','3','4']){const c=ch[key];if(c?.on&&c?.tripped&&!c?.fault){c.tripped=false;c.currentA=0}}
  state.alarmOpen=[1,2,3,4].some(i=>{const c=ch[String(i)];return !!c?.on&&(!!c?.tripped||!!c?.fault)})
  void dt
}

/** dt real uma única vez/scan; a pré-passagem do ATV calcula só a rede de controlo. */
export function updateIndustrialDevice(c:ElectricalComponent,ctx:IndustrialElectricalContext,dtMs:number):void {
  const type=industrialDeviceTypeOf(c)
  if(!type||type==='relaySocketFinder9023')return
  const s=c.state,dt=Math.max(0,Number.isFinite(dtMs)?dtMs:0)
  if(type==='relayFinder5534'){
    const v=industrialInput(c,'A1','A2',ctx),ok=v.dc&&v.positive&&inRange(v.voltage,19.2,26.4)
    s.powered=ok;s.supplyMismatch=v.voltage>0&&!ok;s.energized=ok||!!s.testPressed;return
  }
  if(type==='timerGeyaGrt8M1'||type==='timerGeyaGrt8M2'||type==='timerGeyaGrt8B1'){
    const v=industrialInput(c,'A1','A2',ctx)
    const ok=type==='timerGeyaGrt8B1'?!v.dc&&inRange(v.voltage,195.5,253):inRange(v.voltage,12,240)&&(!v.dc||v.positive)
    // S só é comando quando fechado à MESMA alimentação A1, não uma segunda fonte.
    const trigger=industrialConnected(c,'S','A1',ctx)
    s.supplyMismatch=v.voltage>0&&!ok;updateGeyaTimer(s,ok,ok&&trigger,dt,type==='timerGeyaGrt8B1');return
  }
  if(type==='levelRelayAvel411'){
    const v=industrialInput(c,'2','10',ctx),ok=!v.dc&&inRange(v.voltage,195.5,253)
    s.powered=ok;s.supplyMismatch=v.voltage>0&&!ok
    if(s.probeMode!=='virtual'){
      s.tankMinWet=industrialConnected(c,'11','9',ctx);s.tankMaxWet=industrialConnected(c,'8','9',ctx)
      s.wellMinWet=industrialConnected(c,'6','7',ctx);s.wellMaxWet=industrialConnected(c,'5','7',ctx)
    }
    if(!ok){s.energized=false;s.wellReady=false;s.tankDemand=true;return}
    if(!s.wellMinWet)s.wellReady=false
    if(s.wellMaxWet&&s.wellMinWet)s.wellReady=true
    if(s.tankMaxWet)s.tankDemand=false
    if(!s.tankMinWet&&!s.tankMaxWet)s.tankDemand=true
    s.energized=!!s.tankDemand&&!!s.wellReady;return
  }
  if(type==='buzzerMetaltexTby301'){
    const v=industrialInput(c,'1','2',ctx),ok=!v.dc&&inRange(v.voltage,99,121)
    s.powered=ok;s.supplyMismatch=v.voltage>0&&!ok;s.activeMs=ok?(Number(s.activeMs)||0)+dt:0
    s.dutyLimitReached=s.activeMs>=1800000;s.on=ok&&!s.dutyLimitReached;return
  }
  if(type==='breakerMurrelektronikMico46'){
    const v=industrialInput(c,'L+','GND',ctx),ok=v.dc&&inRange(v.voltage,18,30)
    s.supplyMismatch=v.voltage>0&&!ok;updateMico46(s,ok,dt);return
  }
  const v=industrialInput(c,'R/L1','S/L2',ctx),ok=!v.dc&&inRange(v.voltage,170,264)
  s.powered=ok;s.supplyMismatch=v.voltage>0&&!ok
  const signal=(label:string,min:number)=>{const x=industrialInput(c,label,'COM1',ctx);return x.dc&&x.positive&&x.voltage>min&&x.voltage<=30}
  s.stoReleased=ok&&signal('STO',20.4-1e-8)
  const forward=signal('DI1',11),reverse=signal('DI2',11),desired=reverse?'ccw':'cw'
  const wants=ok&&s.stoReleased&&s.enabled!==false&&!s.deviceFault&&(forward!==reverse)
  const raw=Number(s.presetHz??50),setpoint=Math.max(0,Math.min(599,Number.isFinite(raw)?raw:50)),current=Math.max(0,Number(s.frequencyHz)||0)
  const reversing=wants&&current>.01&&s.direction!==desired
  const accelerating=wants&&!reversing
  const rawRamp=Number(accelerating?s.rampUpMs??3000:s.rampDownMs??3000),ramp=Math.max(100,Number.isFinite(rawRamp)?rawRamp:3000)
  const step=dt/ramp*Math.max(1,setpoint)
  // STO/perda de rede remove binário; manobra normal e reversão passam pela rampa/zero.
  s.frequencyHz=!ok||!s.stoReleased||s.deviceFault?0:accelerating?Math.min(setpoint,current+step):Math.max(0,current-step)
  if(wants&&current<=.01)s.direction=desired
  s.running=ok&&s.stoReleased&&!s.deviceFault&&s.frequencyHz>.01
}

export type IndustrialControl='encoder'|'enter'|'escape'|'range'|'fraction'|'function'|'test'|'cover'|'button'|'ch1'|'ch2'|'ch3'|'ch4'|'sel1'|'sel2'|'sel3'|'sel4'
export function industrialControlPatch(type:string,state:Record<string,any>,control:IndustrialControl,step:1|-1=1):Record<string,any>{
  if(!isIndustrialDevice(type))return {}
  if(control==='button'&&type.startsWith('pushButtonXb2'))return {pressed:!state.pressed}
  if(type==='breakerMurrelektronikMico46'){
    const m=/^(ch|sel)([1-4])$/.exec(control);if(!m)return {}
    const ch=m[2];const channels=structuredClone((state.channels??{}) as Record<string,{on:boolean;tripped:boolean;fault:boolean;currentA:number;setpointA:number}>)
    const c=channels[ch]??={on:false,tripped:false,fault:false,currentA:0,setpointA:1}
    if(m[1]==='ch'){c.on=!c.on;if(!c.on){c.tripped=false;c.fault=false;c.currentA=0}return {channels}}
    const order=[1,2,4,6];const next=order[(order.indexOf(c.setpointA)+1)%order.length]??1;c.setpointA=next;c.on=false;c.tripped=false;return {channels}
  }
  const cycle=<T>(values:readonly T[],value:T)=>values[(Math.max(0,values.indexOf(value))+step+values.length)%values.length]
  if(control==='cover'&&type==='vfdSchneiderAtv320')return {controlCoverOpen:!state.controlCoverOpen}
  if(control==='test'&&type==='relayFinder5534')return {testPressed:!state.testPressed}
  if(type==='vfdSchneiderAtv320'){
    if(control==='escape')return {editing:false,menu:'ref'}
    if(control==='enter')return {editing:state.menu==='mon'?false:!state.editing}
    if(control==='encoder'){
      if(!state.editing)return {menu:cycle(['ref','mon','conf'],String(state.menu??'ref'))}
      if(state.menu==='ref')return {presetHz:Math.max(0,Math.min(599,Math.round(((Number(state.presetHz)||0)+step)*10)/10))}
      if(state.menu==='conf')return {rampUpMs:Math.max(100,Math.min(600000,(Number(state.rampUpMs)||3000)+step*100))}
    }
    return {}
  }
  const reset={elapsedMs:0,_wasPowered:false,_wasTrigger:false,_pulseActive:false,_offTiming:false,_delayedEdges:[],energized:false}
  if(control==='function'&&(type==='timerGeyaGrt8M1'||type==='timerGeyaGrt8M2'))return {...reset,function:cycle(GEYA_FUNCTIONS,state.function)}
  if((type==='timerGeyaGrt8M1'||type==='timerGeyaGrt8M2'||type==='timerGeyaGrt8B1')&&control==='range')return {...reset,rangeMs:cycle(GEYA_RANGES_MS,state.rangeMs)}
  if((type==='timerGeyaGrt8M1'||type==='timerGeyaGrt8M2'||type==='timerGeyaGrt8B1')&&control==='fraction')return {...reset,fraction:Math.max(.1,Math.min(1,Math.round(((Number(state.fraction)||.3)+step*.1)*10)/10))}
  return {}
}
