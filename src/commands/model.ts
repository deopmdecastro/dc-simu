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
  | 'supply' | 'node'
  | 'fuse' | 'fuse3' | 'breaker3' | 'disconnector3' | 'thermal3'
  | 'contact3' | 'contactNO' | 'contactNC' | 'timedNO' | 'timedNC' | 'thermalNC' | 'thermalNO'
  | 'pushNO' | 'pushNC' | 'emergency' | 'selector' | 'limitNO'
  | 'coil' | 'timerCoil' | 'lamp' | 'motor3' | 'motor6'
  /** Referência de potencial / conector entre páginas: o mesmo tag une a corrente entre folhas. */
  | 'pageRef'

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

type Family = 'source' | 'protection' | 'contact' | 'button' | 'coil' | 'load'

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
  pageRef: { label: 'Ligação entre páginas', hint: 'Leva ou traz corrente de outra página — o mesmo nome (tag) une as páginas', family: 'source', prefix: 'X', terminals: [{ x: 0, y: 0, label: '' }], poles: [], box: { x: -10, y: -14, w: 56, h: 28 } },
  fuse: { label: 'Fusível', hint: 'Proteção contra curto-circuito', family: 'protection', prefix: 'F', terminals: pole(0, '1', '2'), poles: [[0, 1]], box: { x: -10, y: 0, w: 20, h: 60 } },
  fuse3: { label: 'Fusíveis 3P', hint: 'Três fusíveis do circuito de potência', family: 'protection', prefix: 'F', terminals: [...pole(0, '1', '2'), ...pole(20, '3', '4'), ...pole(40, '5', '6')], poles: [[0, 1], [2, 3], [4, 5]], box: { x: -10, y: 0, w: 60, h: 60 } },
  breaker3: { label: 'Disjuntor-motor', hint: 'Q · manobra e proteção (clique para ligar/desligar)', family: 'protection', prefix: 'Q', terminals: [...pole(0, '1', '2'), ...pole(20, '3', '4'), ...pole(40, '5', '6')], poles: [[0, 1], [2, 3], [4, 5]], box: { x: -10, y: 0, w: 60, h: 60 } },
  disconnector3: { label: 'Seccionador', hint: 'Q · corte geral manual', family: 'protection', prefix: 'Q', terminals: [...pole(0, '1', '2'), ...pole(20, '3', '4'), ...pole(40, '5', '6')], poles: [[0, 1], [2, 3], [4, 5]], box: { x: -10, y: 0, w: 60, h: 60 } },
  thermal3: { label: 'Relé térmico', hint: 'F · elementos de aquecimento (potência)', family: 'protection', prefix: 'F', terminals: [...pole(0, '1', '2'), ...pole(20, '3', '4'), ...pole(40, '5', '6')], poles: [[0, 1], [2, 3], [4, 5]], box: { x: -10, y: 0, w: 60, h: 60 } },
  contact3: { label: 'Contactos principais', hint: 'K · 1-2 3-4 5-6 do contactor', family: 'contact', prefix: 'K', terminals: [...pole(0, '1', '2'), ...pole(20, '3', '4'), ...pole(40, '5', '6')], poles: [[0, 1], [2, 3], [4, 5]], box: { x: -10, y: 0, w: 60, h: 60 } },
  contactNO: { label: 'Contacto NA', hint: 'K · auxiliar normalmente aberto', family: 'contact', prefix: 'K', terminals: pole(0, '13', '14'), poles: [[0, 1]], box: { x: -14, y: 0, w: 28, h: 60 } },
  contactNC: { label: 'Contacto NF', hint: 'K · auxiliar normalmente fechado', family: 'contact', prefix: 'K', terminals: pole(0, '21', '22'), poles: [[0, 1]], box: { x: -14, y: 0, w: 28, h: 60 } },
  timedNO: { label: 'NA temporizado', hint: 'K · fecha após o atraso', family: 'contact', prefix: 'K', terminals: pole(0, '67', '68'), poles: [[0, 1]], box: { x: -30, y: 0, w: 48, h: 60 } },
  timedNC: { label: 'NF temporizado', hint: 'K · abre após o atraso', family: 'contact', prefix: 'K', terminals: pole(0, '55', '56'), poles: [[0, 1]], box: { x: -30, y: 0, w: 52, h: 60 } },
  thermalNC: { label: 'Térmico 95-96', hint: 'F · abre quando o relé dispara', family: 'contact', prefix: 'F', terminals: pole(0, '95', '96'), poles: [[0, 1]], box: { x: -28, y: 0, w: 50, h: 60 } },
  thermalNO: { label: 'Térmico 97-98', hint: 'F · sinaliza o disparo', family: 'contact', prefix: 'F', terminals: pole(0, '97', '98'), poles: [[0, 1]], box: { x: -28, y: 0, w: 46, h: 60 } },
  pushNO: { label: 'Botão NA', hint: 'S · arranque (pressionar)', family: 'button', prefix: 'S', terminals: pole(0, '13', '14'), poles: [[0, 1]], box: { x: -20, y: 0, w: 34, h: 60 } },
  pushNC: { label: 'Botão NF', hint: 'S · paragem (pressionar)', family: 'button', prefix: 'S', terminals: pole(0, '11', '12'), poles: [[0, 1]], box: { x: -20, y: 0, w: 34, h: 60 } },
  emergency: { label: 'Emergência', hint: 'S · NF com encravamento (clique)', family: 'button', prefix: 'S', terminals: pole(0, '11', '12'), poles: [[0, 1]], box: { x: -24, y: 0, w: 38, h: 60 } },
  selector: { label: 'Comutador', hint: 'S · NA com posição mantida (clique)', family: 'button', prefix: 'S', terminals: pole(0, '13', '14'), poles: [[0, 1]], box: { x: -20, y: 0, w: 34, h: 60 } },
  limitNO: { label: 'Fim de curso', hint: 'B · NA acionado mecanicamente (pressionar)', family: 'button', prefix: 'B', terminals: pole(0, '13', '14'), poles: [[0, 1]], box: { x: -20, y: 0, w: 34, h: 60 } },
  coil: { label: 'Bobina', hint: 'K · contactor ou relé (A1-A2)', family: 'coil', prefix: 'K', terminals: pole(0, 'A1', 'A2'), poles: [], box: { x: -16, y: 0, w: 32, h: 60 } },
  timerCoil: { label: 'Temporizador', hint: 'K · atraso à operação (A1-A2)', family: 'coil', prefix: 'K', terminals: pole(0, 'A1', 'A2'), poles: [], box: { x: -16, y: 0, w: 32, h: 60 } },
  lamp: { label: 'Sinalizador', hint: 'H · lâmpada X1-X2', family: 'load', prefix: 'H', terminals: pole(0, 'X1', 'X2'), poles: [], box: { x: -14, y: 0, w: 28, h: 60 } },
  motor3: { label: 'Motor 3~', hint: 'M · U1 V1 W1', family: 'load', prefix: 'M', terminals: [{ x: 0, y: 0, label: 'U1' }, { x: 20, y: 0, label: 'V1' }, { x: 40, y: 0, label: 'W1' }], poles: [], box: { x: -10, y: 0, w: 60, h: 80 } },
  // Motor de 6 bornes: U1 V1 W1 em cima; W2 V2 U2 à direita (de cima para baixo), como nos esquemas Y-Δ.
  motor6: { label: 'Motor 3~ (6 bornes)', hint: 'M · estrela-triângulo U1 V1 W1 / U2 V2 W2', family: 'load', prefix: 'M', terminals: [{ x: 0, y: 0, label: 'U1' }, { x: 20, y: 0, label: 'V1' }, { x: 40, y: 0, label: 'W1' }, { x: 80, y: 80, label: 'U2' }, { x: 80, y: 60, label: 'V2' }, { x: 80, y: 40, label: 'W2' }], poles: [], box: { x: -10, y: 0, w: 100, h: 90 } },
}

/** Grupos da paleta, pela ordem em que se monta um esquema. */
export const CMD_PALETTE: Array<{ title: string; kinds: CmdKind[] }> = [
  { title: 'Alimentação', kinds: ['supply', 'node', 'pageRef'] },
  { title: 'Proteção e manobra', kinds: ['fuse3', 'fuse', 'disconnector3', 'breaker3', 'thermal3', 'thermalNC', 'thermalNO'] },
  { title: 'Botões e sensores', kinds: ['pushNC', 'pushNO', 'emergency', 'selector', 'limitNO'] },
  { title: 'Contactores e relés', kinds: ['coil', 'contact3', 'contactNO', 'contactNC'] },
  { title: 'Temporizadores', kinds: ['timerCoil', 'timedNO', 'timedNC'] },
  { title: 'Sinalização e motores', kinds: ['lamp', 'motor3', 'motor6'] },
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
  if (kind === 'pageRef') {
    // Nomes de rede típicos: X1, X2… (o mesmo nome noutra página liga a corrente)
    const used = new Set(diagram.parts.filter((p) => p.kind === 'pageRef').map((p) => p.tag))
    for (let n = 1; ; n++) if (!used.has(`X${n}`)) return `X${n}`
  }
  const prefix = CMD_PARTS[kind].prefix
  if (!prefix) return ''
  const used = new Set(diagram.parts.map((p) => p.tag))
  for (let n = 1; ; n++) if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`
}

/** Símbolos que partilham o aparelho de outro (contactos de uma bobina, etc.) reutilizam a referência. */
export const isDriver = (kind: CmdKind) => kind === 'coil' || kind === 'timerCoil'
