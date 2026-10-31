// ============================================================================
// Comandos elétricos — modelo do esquema (IEC 60617 / IEC 81346)
//
// Um esquema de comando é feito de SÍMBOLOS ligados por CABOS. Cada símbolo é
// uma parte de um aparelho identificado pela sua referência (K1, S1, F7…):
// a bobina A1-A2 de K1 comanda todos os contactos marcados K1, o botão S1
// acciona todos os contactos S1, o relé térmico F7 abre o 95-96 quando dispara.
// Os símbolos desenham-se na vertical (a corrente desce) e rodam de 90 em 90°.
// ============================================================================

export const CMD_GRID = 20

export type CmdKind =
  | 'supply' | 'node' | 'ground' | 'pageRef' | 'pageRefIn'
  | 'fuse' | 'fuse3' | 'breaker1' | 'breaker3' | 'disconnector3' | 'thermal3' | 'rcd'
  | 'contact3' | 'contactNO' | 'contactNC' | 'changeover' | 'timedNO' | 'timedNC' | 'thermalNC' | 'thermalNO'
  | 'pushNO' | 'pushNC' | 'pushIllum' | 'emergency' | 'selector' | 'limitNO' | 'limitNC' | 'proximity'
  | 'coil' | 'timerCoil' | 'lamp' | 'buzzer' | 'solenoid' | 'heater'
  | 'motor3' | 'motor6'
  | 'diode' | 'resistor' | 'capacitor' | 'transformer' | 'rectifier'
  | 'plcIn' | 'plcOut'
  /** Pneumática / hidráulica (ISO 1219 — símbolos próprios DC-Simu). */
  | 'airSource' | 'exhaust' | 'valve32' | 'valve52' | 'cylSE' | 'cylDE' | 'throttle' | 'checkValve'
  | 'hydPump' | 'hydTank' | 'hydCyl'

export type CmdRotation = 0 | 90 | 180 | 270

export interface CmdPart {
  id: string
  kind: CmdKind
  /** Posição do ponto de referência (1.º borne), em px do esquema, sempre na grelha. */
  x: number
  y: number
  rot: CmdRotation
  /** Referência do aparelho (IEC 81346): K1, S1, F7, M1… */
  tag: string
  /** Marcação dos bornes, pela ordem de `CMD_PARTS[kind].terminals`. */
  labels?: string[]
  /** Temporizador: atraso à operação (ms). */
  delayMs?: number
  /** Sinalizador: cor. */
  color?: 'green' | 'red' | 'yellow' | 'white' | 'blue'
  /** Alimentação: fases/polaridades disponíveis, uma por borne (L1, L2, L3, N, PE, L+, M). */
  lines?: string[]
  /** Página do esquema (folha). Por omissão a primeira. */
  page?: string
}

export interface CmdEnd { part: string; term: number }

export interface CmdWire {
  id: string
  a: CmdEnd
  b: CmdEnd
  /** Posição do troço do meio (y se o cabo muda de coluna, x se muda de linha); vazio = a meio. */
  mid?: number
  /** Página do cabo (folha). Por omissão a dos bornes. */
  page?: string
}

export interface CmdText { id: string; x: number; y: number; text: string; page?: string }

export interface CmdPage {
  id: string
  name: string
}

export interface CommandsDiagram {
  parts: CmdPart[]
  wires: CmdWire[]
  texts?: CmdText[]
  /** Folhas do esquema. Sem valor: uma única «Página 1». */
  pages?: CmdPage[]
  /** Nome do esquema (aparece no cabeçalho e na capa). */
  name?: string
}

export const emptyCommands = (): CommandsDiagram => ({
  parts: [],
  wires: [],
  texts: [],
  pages: [{ id: 'page-1', name: 'Página 1' }],
})

export interface Pt { x: number; y: number }

type Family = 'source' | 'protection' | 'contact' | 'button' | 'coil' | 'load' | 'sensor' | 'electronic' | 'pneumatic' | 'hydraulic'

export interface CmdPartDef {
  label: string
  /** Descrição curta para a paleta. */
  hint: string
  family: Family
  /** Prefixo da referência (IEC 81346-2): F, Q, K, S, H, M, X. */
  prefix: string
  /** Bornes com posição local (rotação 0) e marcação por omissão. */
  terminals: Array<{ x: number; y: number; label: string }>
  /** Pares de bornes que conduzem quando o elemento está «fechado» (ver `closedPairs`). */
  poles: Array<[number, number]>
  /** Retângulo ocupado (rotação 0), para seleção. */
  box: { x: number; y: number; w: number; h: number }
}

const pole = (x: number, top: string, bottom: string, h = 60) => [{ x, y: 0, label: top }, { x, y: h, label: bottom }]

export const CMD_PARTS: Record<CmdKind, CmdPartDef> = {
  supply: { label: 'Alimentação', hint: 'Fases L1 L2 L3 / N / PE', family: 'source', prefix: '', terminals: [{ x: 0, y: 0, label: 'L1' }], poles: [], box: { x: -12, y: -26, w: 24, h: 30 } },
  node: { label: 'Nó', hint: 'Ponto de ligação de cabos', family: 'source', prefix: '', terminals: [{ x: 0, y: 0, label: '' }], poles: [], box: { x: -6, y: -6, w: 12, h: 12 } },
  ground: { label: 'Terra / PE', hint: 'Ligação à terra de proteção', family: 'source', prefix: 'PE', terminals: [{ x: 0, y: 0, label: 'PE' }], poles: [], box: { x: -14, y: -4, w: 28, h: 28 } },
  pageRef: { label: 'Ligação → outras páginas', hint: 'Conector de saída: leva corrente para outra página — o mesmo nome (tag) une as páginas', family: 'source', prefix: 'X', terminals: [{ x: 0, y: 0, label: '' }], poles: [], box: { x: -10, y: -14, w: 56, h: 28 } },
  pageRefIn: { label: 'Ligação ← outras páginas', hint: 'Conector de entrada: recebe corrente de outra página — o mesmo nome (tag) une as páginas', family: 'source', prefix: 'X', terminals: [{ x: 0, y: 0, label: '' }], poles: [], box: { x: -42, y: -14, w: 56, h: 28 } },

  fuse: { label: 'Fusível', hint: 'Proteção contra curto-circuito', family: 'protection', prefix: 'F', terminals: pole(0, '1', '2'), poles: [[0, 1]], box: { x: -10, y: 0, w: 20, h: 60 } },
  fuse3: { label: 'Fusíveis 3P', hint: 'Três fusíveis do circuito de potência', family: 'protection', prefix: 'F', terminals: [...pole(0, '1', '2'), ...pole(20, '3', '4'), ...pole(40, '5', '6')], poles: [[0, 1], [2, 3], [4, 5]], box: { x: -10, y: 0, w: 60, h: 60 } },
  breaker1: { label: 'Disjuntor 1P', hint: 'Q · unipolar (clique para ligar/desligar)', family: 'protection', prefix: 'Q', terminals: pole(0, '1', '2'), poles: [[0, 1]], box: { x: -12, y: 0, w: 24, h: 60 } },
  breaker3: { label: 'Disjuntor-motor', hint: 'Q · manobra e proteção (clique para ligar/desligar)', family: 'protection', prefix: 'Q', terminals: [...pole(0, '1', '2'), ...pole(20, '3', '4'), ...pole(40, '5', '6')], poles: [[0, 1], [2, 3], [4, 5]], box: { x: -10, y: 0, w: 60, h: 60 } },
  disconnector3: { label: 'Seccionador', hint: 'Q · corte geral manual', family: 'protection', prefix: 'Q', terminals: [...pole(0, '1', '2'), ...pole(20, '3', '4'), ...pole(40, '5', '6')], poles: [[0, 1], [2, 3], [4, 5]], box: { x: -10, y: 0, w: 60, h: 60 } },
  thermal3: { label: 'Relé térmico', hint: 'F · elementos de aquecimento (potência)', family: 'protection', prefix: 'F', terminals: [...pole(0, '1', '2'), ...pole(20, '3', '4'), ...pole(40, '5', '6')], poles: [[0, 1], [2, 3], [4, 5]], box: { x: -10, y: 0, w: 60, h: 60 } },
  rcd: { label: 'Diferencial (RCD)', hint: 'Q · proteção diferencial', family: 'protection', prefix: 'Q', terminals: [...pole(0, '1', '2'), ...pole(20, '3', '4')], poles: [[0, 1], [2, 3]], box: { x: -10, y: 0, w: 40, h: 60 } },
  contact3: { label: 'Contactos principais', hint: 'K · 1-2 3-4 5-6 do contactor', family: 'contact', prefix: 'K', terminals: [...pole(0, '1', '2'), ...pole(20, '3', '4'), ...pole(40, '5', '6')], poles: [[0, 1], [2, 3], [4, 5]], box: { x: -10, y: 0, w: 60, h: 60 } },
  contactNO: { label: 'Contacto NA', hint: 'K · auxiliar normalmente aberto', family: 'contact', prefix: 'K', terminals: pole(0, '13', '14'), poles: [[0, 1]], box: { x: -14, y: 0, w: 28, h: 60 } },
  contactNC: { label: 'Contacto NF', hint: 'K · auxiliar normalmente fechado', family: 'contact', prefix: 'K', terminals: pole(0, '21', '22'), poles: [[0, 1]], box: { x: -14, y: 0, w: 28, h: 60 } },
  changeover: { label: 'Contacto comutador', hint: 'K · inversor (COM–NA–NF)', family: 'contact', prefix: 'K', terminals: [{ x: 0, y: 0, label: '11' }, { x: 0, y: 60, label: '14' }, { x: 20, y: 60, label: '12' }], poles: [[0, 1]], box: { x: -14, y: 0, w: 40, h: 60 } },
  timedNO: { label: 'NA temporizado', hint: 'K · fecha após o atraso', family: 'contact', prefix: 'K', terminals: pole(0, '67', '68'), poles: [[0, 1]], box: { x: -30, y: 0, w: 48, h: 60 } },
  timedNC: { label: 'NF temporizado', hint: 'K · abre após o atraso', family: 'contact', prefix: 'K', terminals: pole(0, '65', '66'), poles: [[0, 1]], box: { x: -30, y: 0, w: 48, h: 60 } },
  thermalNC: { label: 'NF térmico', hint: 'F · 95-96 abre ao disparar', family: 'contact', prefix: 'F', terminals: pole(0, '95', '96'), poles: [[0, 1]], box: { x: -14, y: 0, w: 28, h: 60 } },
  thermalNO: { label: 'NA térmico', hint: 'F · 97-98 fecha ao disparar', family: 'contact', prefix: 'F', terminals: pole(0, '97', '98'), poles: [[0, 1]], box: { x: -14, y: 0, w: 28, h: 60 } },
  pushNO: { label: 'Botão NA', hint: 'S · impulso a fechar', family: 'button', prefix: 'S', terminals: pole(0, '13', '14'), poles: [[0, 1]], box: { x: -16, y: 0, w: 32, h: 60 } },
  pushNC: { label: 'Botão NF', hint: 'S · impulso a abrir', family: 'button', prefix: 'S', terminals: pole(0, '11', '12'), poles: [[0, 1]], box: { x: -16, y: 0, w: 32, h: 60 } },
  pushIllum: { label: 'Botão luminoso', hint: 'S · NA com lâmpada integrada', family: 'button', prefix: 'S', terminals: [...pole(0, '13', '14'), ...pole(20, 'X1', 'X2')], poles: [[0, 1]], box: { x: -16, y: 0, w: 48, h: 60 } },
  emergency: { label: 'Emergência', hint: 'S · cogumelo (mantém aberto até reset)', family: 'button', prefix: 'S', terminals: pole(0, '11', '12'), poles: [[0, 1]], box: { x: -18, y: 0, w: 36, h: 60 } },
  selector: { label: 'Comutador', hint: 'S · 0-1 manual', family: 'button', prefix: 'S', terminals: pole(0, '13', '14'), poles: [[0, 1]], box: { x: -16, y: 0, w: 32, h: 60 } },
  limitNO: { label: 'Fim de curso NA', hint: 'S · actuado pela máquina', family: 'sensor', prefix: 'S', terminals: pole(0, '13', '14'), poles: [[0, 1]], box: { x: -16, y: 0, w: 32, h: 60 } },
  limitNC: { label: 'Fim de curso NF', hint: 'S · abre ao actuar', family: 'sensor', prefix: 'S', terminals: pole(0, '11', '12'), poles: [[0, 1]], box: { x: -16, y: 0, w: 32, h: 60 } },
  proximity: { label: 'Proximidade', hint: 'B · sensor indutivo/capacitivo (NA)', family: 'sensor', prefix: 'B', terminals: pole(0, '3', '4'), poles: [[0, 1]], box: { x: -16, y: 0, w: 32, h: 60 } },
  coil: { label: 'Bobina', hint: 'K · A1-A2 do contactor/relé', family: 'coil', prefix: 'K', terminals: pole(0, 'A1', 'A2'), poles: [], box: { x: -16, y: 0, w: 32, h: 60 } },
  timerCoil: { label: 'Temporizador', hint: 'K · bobina com atraso à operação', family: 'coil', prefix: 'K', terminals: pole(0, 'A1', 'A2'), poles: [], box: { x: -16, y: 0, w: 32, h: 60 } },
  lamp: { label: 'Sinalizador', hint: 'H · lâmpada de indicação', family: 'load', prefix: 'H', terminals: pole(0, 'X1', 'X2'), poles: [], box: { x: -14, y: 0, w: 28, h: 60 } },
  buzzer: { label: 'Campainha / buzzer', hint: 'H · sinalização sonora', family: 'load', prefix: 'H', terminals: pole(0, 'X1', 'X2'), poles: [], box: { x: -16, y: 0, w: 32, h: 60 } },
  solenoid: { label: 'Solenoide', hint: 'Y · bobina de válvula ou travão', family: 'load', prefix: 'Y', terminals: pole(0, 'A1', 'A2'), poles: [], box: { x: -16, y: 0, w: 32, h: 60 } },
  heater: { label: 'Resistência / aquecedor', hint: 'E · carga resistiva', family: 'load', prefix: 'E', terminals: pole(0, '1', '2'), poles: [], box: { x: -14, y: 0, w: 28, h: 60 } },
  motor3: { label: 'Motor 3~', hint: 'M · três fases', family: 'load', prefix: 'M', terminals: [{ x: 0, y: 0, label: 'U1' }, { x: 20, y: 0, label: 'V1' }, { x: 40, y: 0, label: 'W1' }], poles: [], box: { x: -8, y: 0, w: 56, h: 80 } },
  motor6: { label: 'Motor 6 bornes', hint: 'M · U1 V1 W1 U2 V2 W2 (Y/Δ)', family: 'load', prefix: 'M', terminals: [{ x: 0, y: 0, label: 'U1' }, { x: 20, y: 0, label: 'V1' }, { x: 40, y: 0, label: 'W1' }, { x: 80, y: 40, label: 'U2' }, { x: 80, y: 60, label: 'V2' }, { x: 80, y: 80, label: 'W2' }], poles: [], box: { x: -8, y: 0, w: 96, h: 96 } },
  diode: { label: 'Diodo', hint: 'V · semicondutor (conduz num sentido)', family: 'electronic', prefix: 'V', terminals: pole(0, 'A', 'K'), poles: [[0, 1]], box: { x: -12, y: 0, w: 24, h: 60 } },
  resistor: { label: 'Resistência', hint: 'R · limitadora / carga', family: 'electronic', prefix: 'R', terminals: pole(0, '1', '2'), poles: [[0, 1]], box: { x: -12, y: 0, w: 24, h: 60 } },
  capacitor: { label: 'Condensador', hint: 'C · filtragem / arranque', family: 'electronic', prefix: 'C', terminals: pole(0, '1', '2'), poles: [[0, 1]], box: { x: -12, y: 0, w: 24, h: 60 } },
  transformer: { label: 'Transformador', hint: 'T · isolação / tensão de comando', family: 'electronic', prefix: 'T', terminals: [...pole(0, '1', '2'), ...pole(30, '3', '4')], poles: [], box: { x: -10, y: 0, w: 50, h: 60 } },
  rectifier: { label: 'Ponte retificadora', hint: 'V · AC→DC', family: 'electronic', prefix: 'V', terminals: [{ x: 0, y: 0, label: '~' }, { x: 40, y: 0, label: '~' }, { x: 0, y: 60, label: '+' }, { x: 40, y: 60, label: '−' }], poles: [], box: { x: -8, y: 0, w: 56, h: 60 } },
  plcIn: { label: 'Entrada PLC', hint: 'I · entrada digital', family: 'electronic', prefix: 'I', terminals: pole(0, '1', '2'), poles: [], box: { x: -18, y: 0, w: 36, h: 60 } },
  plcOut: { label: 'Saída PLC', hint: 'Q · saída digital (contacto)', family: 'electronic', prefix: 'Q', terminals: pole(0, '1', '2'), poles: [[0, 1]], box: { x: -18, y: 0, w: 36, h: 60 } },
  airSource: { label: 'Fonte de ar', hint: 'Pressão pneumática', family: 'pneumatic', prefix: 'P', terminals: [{ x: 0, y: 0, label: 'P' }], poles: [], box: { x: -16, y: -20, w: 32, h: 28 } },
  exhaust: { label: 'Escape', hint: 'Descarga para atmosfera', family: 'pneumatic', prefix: 'R', terminals: [{ x: 0, y: 0, label: 'R' }], poles: [], box: { x: -14, y: -4, w: 28, h: 24 } },
  valve32: { label: 'Válvula 3/2', hint: 'Válvula 3 vias / 2 posições', family: 'pneumatic', prefix: 'V', terminals: [{ x: 0, y: 30, label: '1' }, { x: 40, y: 0, label: '2' }, { x: 40, y: 60, label: '3' }], poles: [[0, 1]], box: { x: -4, y: -4, w: 52, h: 68 } },
  valve52: { label: 'Válvula 5/2', hint: 'Válvula 5 vias / 2 posições (cilindro DE)', family: 'pneumatic', prefix: 'V', terminals: [{ x: 0, y: 30, label: '1' }, { x: 50, y: 0, label: '4' }, { x: 50, y: 60, label: '2' }, { x: 0, y: 0, label: '5' }, { x: 0, y: 60, label: '3' }], poles: [[0, 1], [0, 2]], box: { x: -4, y: -4, w: 62, h: 68 } },
  cylSE: { label: 'Cilindro SE', hint: 'Simples efeito — mola de retorno', family: 'pneumatic', prefix: 'A', terminals: [{ x: 0, y: 20, label: 'A' }], poles: [], box: { x: -4, y: -8, w: 80, h: 48 } },
  cylDE: { label: 'Cilindro DE', hint: 'Duplo efeito', family: 'pneumatic', prefix: 'A', terminals: [{ x: 0, y: 10, label: 'A' }, { x: 0, y: 40, label: 'B' }], poles: [], box: { x: -4, y: -8, w: 90, h: 60 } },
  throttle: { label: 'Regulador de caudal', hint: 'Estrangulamento unidirecional', family: 'pneumatic', prefix: 'R', terminals: pole(0, '1', '2', 40), poles: [[0, 1]], box: { x: -14, y: 0, w: 28, h: 40 } },
  checkValve: { label: 'Anti-retorno', hint: 'Válvula de retenção', family: 'pneumatic', prefix: 'R', terminals: pole(0, '1', '2', 40), poles: [[0, 1]], box: { x: -14, y: 0, w: 28, h: 40 } },
  hydPump: { label: 'Bomba hidráulica', hint: 'Fonte de caudal hidráulico', family: 'hydraulic', prefix: 'M', terminals: [{ x: 0, y: 0, label: 'P' }, { x: 0, y: 40, label: 'T' }], poles: [], box: { x: -20, y: -8, w: 40, h: 56 } },
  hydTank: { label: 'Depósito', hint: 'Retorno / tanque', family: 'hydraulic', prefix: 'T', terminals: [{ x: 0, y: 0, label: 'T' }], poles: [], box: { x: -18, y: -4, w: 36, h: 28 } },
  hydCyl: { label: 'Cilindro hidráulico', hint: 'Atuador de duplo efeito', family: 'hydraulic', prefix: 'A', terminals: [{ x: 0, y: 10, label: 'A' }, { x: 0, y: 40, label: 'B' }], poles: [], box: { x: -4, y: -8, w: 90, h: 60 } },
}

export const CMD_PALETTE: Array<{ title: string; kinds: CmdKind[] }> = [
  { title: 'Alimentação', kinds: ['supply', 'node', 'ground', 'pageRef', 'pageRefIn'] },
  { title: 'Proteção', kinds: ['fuse', 'fuse3', 'breaker1', 'breaker3', 'disconnector3', 'thermal3', 'rcd'] },
  { title: 'Contactos', kinds: ['contact3', 'contactNO', 'contactNC', 'changeover', 'timedNO', 'timedNC', 'thermalNC', 'thermalNO'] },
  { title: 'Comando', kinds: ['pushNO', 'pushNC', 'pushIllum', 'emergency', 'selector'] },
  { title: 'Sensores', kinds: ['limitNO', 'limitNC', 'proximity'] },
  { title: 'Bobinas e cargas', kinds: ['coil', 'timerCoil', 'lamp', 'buzzer', 'solenoid', 'heater', 'motor3', 'motor6'] },
  { title: 'Eletrónica', kinds: ['diode', 'resistor', 'capacitor', 'transformer', 'rectifier', 'plcIn', 'plcOut'] },
  { title: 'Pneumática', kinds: ['airSource', 'exhaust', 'valve32', 'valve52', 'cylSE', 'cylDE', 'throttle', 'checkValve'] },
  { title: 'Hidráulica', kinds: ['hydPump', 'hydTank', 'hydCyl'] },
]

const rotate = (p: Pt, rot: CmdRotation): Pt => {
  if (rot === 90) return { x: -p.y, y: p.x }
  if (rot === 180) return { x: -p.x, y: -p.y }
  if (rot === 270) return { x: p.y, y: -p.x }
  return { x: p.x, y: p.y }
}

/** Bornes do símbolo (com a alimentação a ter um borne por fase). */
export function partTerminals(part: Pick<CmdPart, 'kind' | 'lines'>): Array<{ x: number; y: number; label: string }> {
  if (part.kind === 'supply') return (part.lines?.length ? part.lines : ['L1']).map((label, i) => ({ x: i * CMD_GRID, y: 0, label }))
  return CMD_PARTS[part.kind].terminals
}

/** Posição absoluta do borne `term` de uma parte. */
export function terminalAt(part: CmdPart, term: number): Pt {
  const local = partTerminals(part)[term] ?? { x: 0, y: 0 }
  const r = rotate(local, part.rot)
  return { x: part.x + r.x, y: part.y + r.y }
}

/** Marcação visível de um borne (a do utilizador ou a da norma). */
export function terminalLabel(part: CmdPart, term: number): string {
  return part.labels?.[term] || partTerminals(part)[term]?.label || ''
}

/** Retângulo ocupado (coordenadas absolutas). */
export function partBox(part: CmdPart): { x: number; y: number; w: number; h: number } {
  const def = CMD_PARTS[part.kind]
  const box = part.kind === 'supply' ? { ...def.box, w: def.box.w + ((part.lines?.length ?? 1) - 1) * CMD_GRID } : def.box
  const corners = [rotate({ x: box.x, y: box.y }, part.rot), rotate({ x: box.x + box.w, y: box.y + box.h }, part.rot)]
  const x = Math.min(corners[0].x, corners[1].x)
  const y = Math.min(corners[0].y, corners[1].y)
  return { x: part.x + x, y: part.y + y, w: Math.abs(corners[1].x - corners[0].x), h: Math.abs(corners[1].y - corners[0].y) }
}

export const snap = (v: number) => Math.round(v / CMD_GRID) * CMD_GRID

/** Percurso ortogonal do cabo entre dois bornes. */
export function wirePoints(a: Pt, b: Pt, mid?: number): Pt[] {
  if (a.x === b.x || a.y === b.y) return [a, b]
  const m = mid ?? snap((a.y + b.y) / 2)
  return [a, { x: a.x, y: m }, { x: b.x, y: m }, b]
}

/** Próxima referência livre com o prefixo do símbolo (K1, K2…). */
export function nextTag(diagram: CommandsDiagram, kind: CmdKind): string {
  if (kind === 'pageRef' || kind === 'pageRefIn') {
    // Nomes de rede típicos: X1, X2… (o mesmo nome noutra página liga a corrente)
    const used = new Set(diagram.parts.filter((p) => p.kind === 'pageRef' || p.kind === 'pageRefIn').map((p) => p.tag))
    for (let n = 1; ; n++) if (!used.has(`X${n}`)) return `X${n}`
  }
  const prefix = CMD_PARTS[kind].prefix
  if (!prefix) return ''
  const used = new Set(diagram.parts.map((p) => p.tag))
  for (let n = 1; ; n++) if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`
}

/** Símbolos que partilham o aparelho de outro (contactos de uma bobina, etc.) reutilizam a referência. */
export const isDriver = (kind: CmdKind) => kind === 'coil' || kind === 'timerCoil'
