import type { ComponentTemplate, TerminalTemplate } from './factory'
import type { ComponentCategory, ElectricalComponent, TerminalKind } from '../types'
import type { ImportedComponentType } from '../types/imported'

type Pair = readonly [string, string]
export type ImportedComponentInfo = {
  name: string; manufacturer: string; reference: string; category: ComponentCategory; tag: string
  behavior: 'fuse' | 'thermal' | 'breaker' | 'selector' | 'contactor' | 'surge' | 'safety' | 'photo' | 'tower' | 'actuator' | 'button-no' | 'button-nc'
  terminals: Array<[string, TerminalKind]>
  poles?: Pair[]; neutral?: Pair[]; state: Record<string, unknown>; scope: string; source?: string
}
const poles: Pair[] = [['1L1', '2T1'], ['3L2', '4T2'], ['5L3', '6T3']]
const powerTerminals = poles.flatMap(([a,b]) => [[a, 'power-in'], [b, 'power-out']] as Array<[string, TerminalKind]>)
export const IMPORTED_COMPONENTS: Record<ImportedComponentType, ImportedComponentInfo> = {
  fuseHolderSchneiderDf103nv: { name: 'Porta-fusíveis Schneider DF103NV · 3P+N · 10×38', manufacturer:'Schneider Electric', reference:'DF103NV', category:'protection', tag:'FU', behavior:'fuse', terminals:[['1','power-in'],['2','power-out'],['3','power-in'],['4','power-out'],['5','power-in'],['6','power-out'],['N1','neutral'],['N2','neutral']], poles:[['1','2'],['3','4'],['5','6']], neutral:[['N1','N2']], state:{closed:true,blown:false,inA:32}, scope:'Continuidade dos três fusíveis e seccionamento do neutro; sem curva tempo/corrente ou indicador néon.', source:'https://download.schneider-electric.com/files?p_Doc_Ref=9400HO1601&p_File_Ext=.PDF' },
  fuseHolderSchneiderDf101v: { name: 'Porta-fusível Schneider DF101V · 1P · 10×38', manufacturer:'Schneider Electric', reference:'DF101V', category:'protection', tag:'FU', behavior:'fuse', terminals:[['1','power-in'],['2','power-out']], poles:[['1','2']], state:{closed:true,blown:false,inA:32}, scope:'Continuidade do fusível e seccionamento; sem curva tempo/corrente ou indicador néon.', source:'https://www.se.com/us/en/faqs/FA126621/' },
  fuseHolderSchneiderDf81n: { name: 'Porta-fusível Schneider DF81N · 1P+N', manufacturer:'Schneider Electric', reference:'DF81N', category:'protection', tag:'FU', behavior:'fuse', terminals:[['1','power-in'],['2','power-out'],['N1','neutral'],['N2','neutral']], poles:[['1','2']], neutral:[['N1','N2']], state:{closed:true,blown:false}, scope:'Continuidade do fusível e seccionamento do neutro; calibre do cartucho a definir.', source:'https://download.schneider-electric.com/files?p_Doc_Ref=9400HO1601&p_File_Ext=.PDF' },
  keyActuatorEao61: { name:'Atuador de chave EAO 61-2101.0/D · 2 posições', manufacturer:'EAO', reference:'61-2101.0/D', category:'command',tag:'S',behavior:'actuator',terminals:[],state:{pressed:false,momentary:true},scope:'Atuador mecânico com retorno; não inclui um bloco de contactos identificado. Sem ligações elétricas inventadas.',source:'https://www.eao.com/api/action/component/datasheet?lang=en&objectID=61-2101.0%2FD'},
  thermalRelaySiemens3ru1116: {name:'Relé térmico Siemens 3RU1116-1AB0 · 1,1–1,6 A',manufacturer:'Siemens',reference:'3RU1116-1AB0',category:'protection',tag:'RT',behavior:'thermal',terminals:[...powerTerminals,['95','aux-nc'],['96','aux-nc'],['97','aux-no'],['98','aux-no']],poles,state:{tripped:false,rangeA:'1,1–1,6 A',manual:true},scope:'O disparo comuta 95–96/97–98; os percursos de potência mantêm-se condutivos. Sem modelo térmico temporizado.',source:'https://sieportal.siemens.com/en-be/products-services/detail/3RU11161AB0'},
  residualBreakerHagerCfc225p: {name:'Interruptor diferencial Hager CFC225P · 2P · 25 A · 300 mA',manufacturer:'Hager',reference:'CFC225P',category:'protection',tag:'QDR',behavior:'breaker',terminals:[['1','power-in'],['2','power-out'],['N1','neutral'],['N2','neutral']],poles:[['1','2'],['N1','N2']],state:{closed:false,tripped:false,inA:25,sensmA:300},scope:'Manobra e disparo manual dos dois polos; sem medição de corrente diferencial.',source:'https://assets.hager.com/step-content/P/PDS_156170925001PT/Document/std.lang.all/PDS_CFC225P_5001_pt-PT.pdf'},
  limitSwitchLongRoller: {name:'Fim de curso com haste longa e rolete · CAD por converter',manufacturer:'Não identificado',reference:'40.108',category:'command',tag:'SQ',behavior:'button-no',terminals:[],state:{pressed:false,momentary:true},scope:'Aguarda exportação STEP/GLB do SLDPRT e confirmação dos contactos.'},
  selectorSchneiderXa2ed33: {name:'Seletor Schneider Harmony XA2ED33 · 3 posições · 2NA',manufacturer:'Schneider Electric',reference:'XA2ED33',category:'command',tag:'S',behavior:'selector',terminals:[['13','aux-no'],['14','aux-no'],['23','aux-no'],['24','aux-no']],state:{position:0,maintain:true},scope:'Esquerda fecha 13–14; centro abre ambos; direita fecha 23–24. Posições mantidas.',source:'https://www.se.com/sg/en/product/XA2ED33/complete-selector-switch-harmony-xa2-plastic-black-22mm-3-positions-stay-put-2no/'},
  contactorWegCwbc65: {name:'Contactor para condensadores WEG CWBC65',manufacturer:'WEG',reference:'CWBC65',category:'contactor',tag:'KM',behavior:'contactor',terminals:[...powerTerminals,['A1','coil-plus'],['A2','coil-minus']],poles,state:{energized:false},scope:'Bobina A1/A2 e três polos principais; sem simulação dos pré-contactos/resistências de inserção ou de auxiliares não identificados.',source:'https://static.weg.net/medias/downloadcenter/h97/h0e/WEG-capacitors-for-power-factor-correction-50033846-en.pdf'},
  surgeProtectorWegSpw02: {name:'DPS WEG SPW02-275 · CA',manufacturer:'WEG',reference:'SPW02-275-10…40',category:'protection',tag:'DPS',behavior:'surge',terminals:[['L','power-in'],['PE','earth']],state:{failed:false},scope:'DPS em paralelo: sem ponte permanente L–PE. Descargas e tensão de limitação não são simuladas.',source:'https://static.weg.net/medias/downloadcenter/hff/heb/WEG-product-line-automation-50019085-brochure-en.pdf'},
  surgeProtectorWegSpw12: {name:'DPS fotovoltaico WEG SPW12 · CC',manufacturer:'WEG',reference:'SPW12-600…1100',category:'protection',tag:'DPS',behavior:'surge',terminals:[['+','power-in'],['-','coil-minus'],['PE','earth']],state:{failed:false},scope:'DPS fotovoltaico em paralelo, três ligações independentes; sem pontes permanentes nem simulação de impulsos.',source:'https://static.weg.net/medias/downloadcenter/hff/heb/WEG-product-line-automation-50019085-brochure-en.pdf'},
  safetyRelaySiemens3tk2840: {name:'Relé de segurança Siemens SIRIUS 3TK2840',manufacturer:'Siemens',reference:'3TK2840',category:'relay',tag:'KS',behavior:'safety',terminals:[['A1','coil-plus'],['A2','coil-minus'],['Y11','io'],['Y12','io'],['Y21','io'],['Y22','io'],['Y20','io'],['Y33','io'],['Y34','io'],['14','power-out'],['24','power-out']],state:{powered:false,energized:false,tripped:false,resetRequested:false},scope:'Modelo didático de dois canais e rearme: 14/24 são saídas estáticas; não representa contactos secos nem valida PL/SIL, pulsos de teste ou falhas cruzadas.',source:'https://cache.industry.siemens.com/dl/files/445/58843445/att_904331/v1/manual_safety_relay_3TK28_en-US.pdf'},
  motorBreakerSchneiderGv2me: {name:'Disjuntor-motor Schneider TeSys GV2ME · 3P',manufacturer:'Schneider Electric',reference:'GV2ME (calibre não identificado)',category:'protection',tag:'QM',behavior:'breaker',terminals:[['1','power-in'],['2','power-out'],['3','power-in'],['4','power-out'],['5','power-in'],['6','power-out']],poles:[['1','2'],['3','4'],['5','6']],state:{closed:false,tripped:false,poles:3},scope:'Manobra dos três polos por botões e disparo manual; o CAD não identifica o calibre da variante. Sem curva térmica/magnética.',source:'https://download.schneider-electric.com/files?filename=Catalog&p_Doc_Ref=MKTED210011EN'},
  buttonStart22: {name:'Botão START 22 mm · CAD por converter',manufacturer:'Não identificado',reference:'START BUTTON',category:'command',tag:'S',behavior:'button-no',terminals:[],state:{pressed:false,momentary:true},scope:'Aguarda exportação STEP/GLB do conjunto Inventor e confirmação do bloco de contactos.'},
  buttonStop22: {name:'Botão STOP 22 mm · CAD por converter',manufacturer:'Não identificado',reference:'STOP BUTTON',category:'command',tag:'S',behavior:'button-nc',terminals:[],state:{pressed:false,momentary:true},scope:'Aguarda exportação STEP/GLB do conjunto Inventor e confirmação do bloco de contactos.'},
  towerLightSb23011: {name:'Torre de sinalização SB2-3011 · 3 cores',manufacturer:'Não confirmado',reference:'SB2-3011',category:'signaling',tag:'H',behavior:'tower',terminals:[],state:{red:false,yellow:false,green:false,on:false},scope:'Modelo visual de três cores; pinagem e tensão da torre recebida não confirmadas. Sem ligações elétricas presumidas.'},
  photoSensorXukt1ksml2: {name:'Sensor fotoelétrico Telemecanique XUKT1KSML2 · reflex · 3 fios',manufacturer:'Telemecanique Sensors',reference:'XUKT1KSML2',category:'sensor',tag:'B',behavior:'photo',terminals:[['V+','power-in'],['0V','coil-minus'],['OUT','io']],state:{powered:false,triggered:false,type:'PNP',no:true,rangeM:1.5},scope:'Saída única PNP/NPN, NA/NF configurável, dependente da alimentação; sem temporização ou ótica física. Ligações representam os fios do cabo, não parafusos no corpo.',source:'https://downloads.telemecaniquesensors.com/dam/datasheets/en/XUKT1KSML2_EN.pdf'},
}
export const importedComponentInfo = (type: string): ImportedComponentInfo | undefined => Object.prototype.hasOwnProperty.call(IMPORTED_COMPONENTS, type) ? IMPORTED_COMPONENTS[type as ImportedComponentType] : undefined

/** Uma regra de manobra partilhada pelo Esquema e pelo Painel 3D. */
export function importedActuationPatch(component: ElectricalComponent, pressed: boolean): Record<string, unknown> | null {
  const info = importedComponentInfo(component.type)
  if (!info) return null
  if (info.behavior === 'actuator' || info.behavior.startsWith('button')) return { pressed }
  if (!pressed) return null
  if (info.behavior === 'breaker' || info.behavior === 'fuse') return { closed: !component.state.closed || !!component.state.tripped, tripped: false }
  if (info.behavior === 'thermal') return { tripped: !component.state.tripped }
  if (info.behavior === 'selector') return { position: component.state.position === -1 ? 0 : component.state.position === 0 ? 1 : -1 }
  if (info.behavior === 'photo') return { triggered: !component.state.triggered }
  if (info.behavior === 'safety') return { resetRequested: true }
  return null
}

/** Pontos funcionais iniciais; os encaixes medidos são aplicados separadamente. */
export const importedTemplates = (): Record<ImportedComponentType, ComponentTemplate> => {
  const result = {} as Record<ImportedComponentType, ComponentTemplate>
  for (const type of Object.keys(IMPORTED_COMPONENTS) as ImportedComponentType[]) {
  const info = IMPORTED_COMPONENTS[type]
  const top = info.terminals.filter(([label,kind]) => kind === 'power-in' || kind === 'coil-plus' || ['13','23','95','97','A1','V+'].includes(label))
  const bottom = info.terminals.filter(item => !top.includes(item))
  const terminals: TerminalTemplate[] = info.terminals.map(([label, kind]) => {
    const row = top.some(item => item[0] === label) ? top : bottom
    const index = row.findIndex(item => item[0] === label)
    const x = (index + .5) / Math.max(1,row.length), y = row === top ? 0 : 1
    return { label,kind,x,y,terminalType:'screw',position3D:{x,y:1-y,z:.5} }
  })
  const group = ({protection:'Proteção',command:'Comando',sensor:'Sensores',contactor:'Contatores',relay:'Relés',signaling:'Sinalização'} as Partial<Record<ComponentCategory,string>>)[info.category] ?? 'Componentes'
  result[type] = {category:info.category,paletteName:info.name,group,tag:info.tag,w:90,h:120,terminals,defaultState:{...info.state,manufacturer:info.manufacturer,code:info.reference}}
  }
  return result
}

/** Não altera o comportamento dos tipos legados. */
export function importedBridges(component: ElectricalComponent): Array<[string,string]> | null {
  const info = importedComponentInfo(component.type)
  if (!info) return null
  const state = component.state
  let pairs: Pair[] = []
  if (info.behavior === 'fuse' && state.closed) pairs = [...(!state.blown ? info.poles ?? [] : []), ...info.neutral ?? []]
  if (info.behavior === 'breaker' && state.closed && !state.tripped) pairs = info.poles ?? []
  if (info.behavior === 'thermal') pairs = [...info.poles ?? [], state.tripped ? ['97','98'] : ['95','96']]
  if (info.behavior === 'contactor' && state.energized) pairs = info.poles ?? []
  if (info.behavior === 'selector') pairs = state.position === -1 ? [['13','14']] : state.position === 1 ? [['23','24']] : []
  if (info.behavior === 'photo' && ['PNP','NPN'].includes(state.type) && state.powered && (state.no !== false ? state.triggered : !state.triggered)) pairs = [[state.type === 'NPN' ? '0V' : 'V+', 'OUT']]
  if (info.behavior === 'safety' && state.powered) pairs = [['A1','Y11'],['A1','Y21'], ...(state.energized && !state.tripped ? [['A1','14'],['A1','24']] as Pair[] : [])]
  return pairs.flatMap(([a,b]) => {
    const first=component.terminals.find(t=>t.label===a), second=component.terminals.find(t=>t.label===b)
    return first && second ? [[first.id,second.id] as [string,string]] : []
  })
}

/** Atualização didática da alimentação e dos dois canais; não substitui um relé de segurança físico. */
export function updateImportedPower(component: ElectricalComponent, live: Set<string>, adjacency: Map<string, Set<string>>) {
  const info = importedComponentInfo(component.type)
  if (!info || !['photo','safety'].includes(info.behavior)) return
  const terminal = (label: string) => component.terminals.find(t => t.label === label)?.id
  const labels = info.behavior === 'photo' ? ['V+','0V'] : ['A1','A2']
  const powered = labels.every(label => { const id = terminal(label); return !!id && live.has(id) })
  component.state.powered = powered
  if (info.behavior !== 'safety') return
  const connected = (a: string,b: string) => {
    const first = terminal(a), last = terminal(b)
    if (!first || !last) return false
    const visited = new Set([first]), queue = [first]
    while(queue.length) {
      const id = queue.shift()!
      if (id === last) return true
      for (const next of adjacency.get(id) ?? []) if (!visited.has(next)) { visited.add(next); queue.push(next) }
    }
    return false
  }
  const ready = powered && !component.state.tripped && connected('Y11','Y12') && connected('Y21','Y22') && connected('Y33','Y34')
  component.state.energized = ready && (!!component.state.energized || !!component.state.resetRequested)
  component.state.resetRequested = false
}
