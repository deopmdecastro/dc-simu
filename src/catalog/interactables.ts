import type { ControlDef, ControlReturnMode, DisplayDef, LightZoneDef, VarDef, Vec3 } from './types'
import { foldText } from '../utils/text'
import { DEFAULT_TILT } from './controlMotion'

/**
 * Deteção automática de objetos interativos dentro de um modelo GLB.
 *
 * O editor 3D liga botões, manípulos, seletores e LEDs a objetos do modelo pelo **nome do nó**.
 * Este módulo olha para os nomes (e para a geometria: centro e tamanho de cada objeto) e propõe
 * controlos já configurados — eixo, curso/ângulo, variável e ação — que o administrador depois
 * ajusta em «Controlo › Movimento». É só heurística: nada é aplicado sem o utilizador confirmar.
 *
 * Além do nome, a geometria também conta: modelos exportados com nomes genéricos («Mesh_12»,
 * «occurrence_of_Cube002») ainda têm ecrãs (placas finas à face), botões (cilindros pequenos que
 * sobressaem) e seletores (discos maiores). Para cada botão é inferido o retorno — mola (impulso)
 * ou retenção (disjuntor, emergência travada) — conforme o nome e o tipo de equipamento.
 *
 * Módulo puro (sem Three.js) para poder ser testado com `npm run test:interactables`.
 */

/** Objeto de um GLB como o editor o vê: nome, nº de malhas, centro e tamanho em mm. */
export interface NodeBox {
  name: string; meshes: number; centre: Vec3; size: Vec3
  /** Cor dominante do material (#rrggbb) e se emite luz — ajudam a reconhecer ecrãs e LEDs. */
  color?: string
  emissive?: boolean
}

export type InteractableKind = 'button' | 'toggle' | 'selector' | 'led' | 'display' | 'terminal'

/** Contexto do componente: caixa total (mm) e categoria/tipo, para afinar a deteção. */
export interface DetectContext {
  bounds?: { centre: Vec3; size: Vec3 }
  /** Categoria do catálogo ou tipo de equipamento (`command`, `protection`, «botoneira», «disjuntor»…). */
  category?: string
  /** Desliga a deteção pela geometria (só nomes). */
  namesOnly?: boolean
}

export interface Suggestion {
  /** Nome do nó dentro do GLB (é o que o controlo guarda em `nodes`). */
  node: string
  kind: InteractableKind
  label: string
  /** 0..1 — quanto o nome se parece com o tipo detetado. */
  confidence: number
  reason: string
  /** Eixo sugerido: normal da face onde o objeto está montado (curso do botão / eixo de rotação). */
  axis: Vec3
  /** Curso do botão em mm (0 nos seletores). */
  travelMm: number
  /** Ângulo das posições do seletor (graus), para os dois lados do zero. */
  angle: number
  color: string
  /** Variável do componente que o controlo altera (ou que acende o LED). */
  variable: string
  /** Variável fornecida em tempo de execução pelo simulador ($run, $stop…), quando o nome o indica. */
  runtimeVar?: string
  /** De onde veio a sugestão: nome do nó ou forma do objeto. */
  source?: 'name' | 'geometry'
  /** Normal exterior com sinal (face onde o objeto está montado). */
  normal?: Vec3
  /** Botões e manípulos: retorno por mola ou retenção, e porquê. */
  returnMode?: ControlReturnMode
  returnReason?: string
  /** Manípulos de disjuntor: bascular sobre um pivô em vez de deslizar. */
  tilt?: boolean
  /** Ecrãs: retângulo à face (centro, largura e altura em mm). */
  screen?: { position: Vec3; widthMm: number; heightMm: number; light?: boolean }
  /** Bornes: ponto à face do objeto (o editor depois encaixa-o no furo). */
  point?: Vec3
}

/** Normaliza para comparar: minúsculas e sem acentos. */
const fold = foldText

const RULES: Array<{ kind: InteractableKind; patterns: RegExp[]; reason: string }> = [
  { kind: 'display', patterns: [/lcd/, /display/, /ecra/, /screen/, /visor/, /hmi/, /oled/, /tft/, /7seg/, /seven_?seg/, /segment/, /digito/, /digit/, /monitor/], reason: 'nome sugere ecrã/visor' },
  { kind: 'led', patterns: [/led/, /lamp/, /luz/, /light/, /indicador/, /indicator/, /sinal/, /signal/, /neon/, /glow/, /ilumin/], reason: 'nome sugere indicador luminoso' },
  { kind: 'selector', patterns: [/selector/, /seletor/, /dial/, /knob/, /rotary/, /rotativ/, /commut/, /chave/, /posicao/, /position/, /escala/, /scale/], reason: 'nome sugere seletor rotativo' },
  { kind: 'button', patterns: [/button/, /botao/, /btn/, /tecla/, /key/, /push/, /emerg/, /cogumelo/, /mushroom/, /reset/, /start/, /stop/, /test/, /trip/, /dispar/, /pulsador/, /impulso/], reason: 'nome sugere botão' },
  { kind: 'toggle', patterns: [/handle/, /manipul/, /alavanca/, /lever/, /toggle/, /interruptor/, /breaker/, /disjuntor/, /rocker/, /sw/], reason: 'nome sugere manípulo/interruptor' },
]

/** Bornes pelo nome (avaliado antes da estrutura, que exclui «borne»/«terminal» dos controlos). */
const TERMINAL_NAME = [/borne/, /terminal/, /klemme/, /bornier/, /clamp/, /screw_?term/, /ligador/, /conector_?fio/, /wire_?entry/]
const NOT_TERMINAL = /cover|tampa|capa|label|etiqueta|text|marca|marker|block_body|corpo/

/** Nomes genéricos ou de estrutura: não valem um controlo (corpo, chapa, parafusos, grupos do exportador). */
const STRUCTURE = [
  /^root/, /^scene/, /^sketchfab/, /^osg/, /^node\d*$/, /^mesh\d*$/, /^group\d*$/, /^object\d*$/, /^part\d*$/, /^solid\d*$/, /^poly/i,
  /corpo|body|carcac|housing|shell|chassis|chapa|placa|pcb|board|etiqueta|label|text\d|logo|screw|parafuso|borne|terminal|rail|calha|moldura|frame/,
]

/** Classifica um nome de nó. Devolve `null` quando o nome é genérico/estrutural. */
export function classifyNode(name: string): { kind: InteractableKind; confidence: number; reason: string } | null {
  const key = fold(name ?? '')
  if (!key) return null
  const terminalHits = TERMINAL_NAME.filter((re) => re.test(key)).length
  if (terminalHits && !NOT_TERMINAL.test(key)) return { kind: 'terminal', confidence: Math.min(1, 0.6 + 0.15 * (terminalHits - 1)), reason: 'nome sugere borne de ligação' }
  if (STRUCTURE.some((re) => re.test(key))) return null
  let best: { kind: InteractableKind; confidence: number; reason: string } | null = null
  for (const rule of RULES) {
    const hits = rule.patterns.filter((re) => re.test(key)).length
    if (!hits) continue
    const confidence = Math.min(1, 0.55 + 0.15 * (hits - 1))
    // `>` mantém a prioridade da ordem das regras (LED › seletor › botão › manípulo) em caso de empate
    if (!best || confidence > best.confidence) best = { kind: rule.kind, confidence, reason: rule.reason }
  }
  return best
}

/**
 * Eixo «fino» do objeto: é a normal da face onde ele está montado — serve de eixo de rotação
 * (seletor) e de direção do curso (botão/manípulo). Objetos quase cúbicos assumem a frente (+Z).
 */
export function thinAxis(size: Vec3): 0 | 1 | 2 {
  const [x, y, z] = size
  const max = Math.max(x, y, z) || 1
  const min = Math.min(x, y, z)
  if (min > max * 0.7) return 2
  if (z <= x && z <= y) return 2
  return x <= y ? 0 : 1
}

export const axisName = (axis: Vec3): 'x' | 'y' | 'z' =>
  Math.abs(axis[0]) >= Math.abs(axis[1]) && Math.abs(axis[0]) >= Math.abs(axis[2]) ? 'x' : Math.abs(axis[1]) >= Math.abs(axis[2]) ? 'y' : 'z'

const LED_COLORS: Array<[RegExp, string]> = [
  [/verde|green|ok|run|marcha/, '#22c55e'], [/vermelh|red|erro|error|falha|fault|trip|dispar/, '#ef4444'],
  [/amarel|yellow|aviso|warn|stop|parado|orange/, '#f59e0b'], [/azul|blue|com|comunic|link|bus/, '#38bdf8'], [/branco|white/, '#f8fafc'],
]

/** Indicadores que o simulador acende sozinho (variáveis `$…` fornecidas em tempo de execução). */
const RUNTIME_LEDS: Array<[RegExp, string]> = [
  [/run|funcion|marcha/, '$run'], [/stop|parado|paragem/, '$stop'], [/erro|error|falha|fault/, '$error'],
  [/com|comunic|link|bus/, '$communication'], [/trip|dispar/, '$tripped'],
]

const slug = (text: string) =>
  fold(text).replace(/^occurrence_of_/, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'objeto'

const KIND_LABEL: Record<InteractableKind, string> = { button: 'Botão', toggle: 'Manípulo', selector: 'Seletor', led: 'Indicador', display: 'Ecrã', terminal: 'Borne' }
export const kindLabel = (kind: InteractableKind) => KIND_LABEL[kind]

/** Nomes que, mesmo genéricos para controlos, descrevem estrutura evidente (não servem para a geometria). */
const BODY = /corpo|body|carcac|housing|shell|chassis|chapa|placa|pcb|board|rail|calha|moldura|frame|base|tampa|cover|caixa|case|enclosure|screw|parafuso|bolt|nut|porca|washer|anilha|rivet|rebite/
/** Serigrafia e marcas impressas: placas finas que não são ecrãs. */
const PRINT = /text|texto|label|etiqueta|logo|decal|sticker|marca|serigraf|print|cylinder|circle|disc|disk|torus|sphere/

const luminance = (hex?: string): number | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '')
  if (!m) return null
  const n = parseInt(m[1], 16)
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
}
const greenish = (hex?: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '')
  if (!m) return false
  const n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return g > r * 1.15 && g > b * 0.9 && g > 60
}

/** Caixa do componente: a fornecida ou a união dos objetos. */
function boundsOf(nodes: NodeBox[], context: DetectContext): { centre: Vec3; size: Vec3; min: Vec3; max: Vec3 } {
  if (context.bounds) {
    const { centre, size } = context.bounds
    return { centre, size, min: centre.map((c, i) => c - size[i] / 2) as Vec3, max: centre.map((c, i) => c + size[i] / 2) as Vec3 }
  }
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const node of nodes) for (let i = 0; i < 3; i++) {
    min[i] = Math.min(min[i], node.centre[i] - node.size[i] / 2)
    max[i] = Math.max(max[i], node.centre[i] + node.size[i] / 2)
  }
  if (!Number.isFinite(min[0])) return { centre: [0, 0, 0], size: [0, 0, 0], min: [0, 0, 0], max: [0, 0, 0] }
  return { centre: min.map((v, i) => (v + max[i]) / 2) as Vec3, size: min.map((v, i) => max[i] - v) as Vec3, min, max }
}

/** Face exterior onde o objeto assenta: eixo e sinal (o lado da caixa de que está mais perto). */
function mountFace(node: NodeBox, box: ReturnType<typeof boundsOf>, axis: 0 | 1 | 2): { sign: 1 | -1; gap: number } {
  const top = box.max[axis] - (node.centre[axis] + node.size[axis] / 2)
  const bottom = (node.centre[axis] - node.size[axis] / 2) - box.min[axis]
  return top <= bottom ? { sign: 1, gap: top } : { sign: -1, gap: bottom }
}

/**
 * Classifica um objeto pela forma, quando o nome não diz nada: placa fina à face → ecrã;
 * cilindro pequeno que sobressai → botão; disco maior → seletor; peça pequena emissiva → LED.
 */
export function classifyGeometry(node: NodeBox, box: ReturnType<typeof boundsOf>): { kind: InteractableKind; confidence: number; reason: string; axis: 0 | 1 | 2 } | null {
  const key = fold(node.name ?? '')
  if (BODY.test(key)) return null
  const extent = Math.max(...box.size)
  if (!(extent > 0)) return null
  const [sx, sy, sz] = node.size
  // o próprio corpo (ou quase): ocupa a maior parte da caixa em dois eixos
  const big = [sx / (box.size[0] || 1), sy / (box.size[1] || 1), sz / (box.size[2] || 1)].filter((ratio) => ratio > 0.6).length
  if (big >= 2) return null
  const axis = thinAxis(node.size)
  const t = node.size[axis]
  const others = [0, 1, 2].filter((i) => i !== axis).map((i) => node.size[i]).sort((a, b) => a - b)
  const [a, b] = others
  const face = mountFace(node, box, axis)
  // tem de estar à face (até 25 % da profundidade da caixa ou 4 mm)
  // (ecrãs atrás de uma janela/moldura podem estar mais recuados)
  if (face.gap > Math.max(4, box.size[axis] * 0.4)) return null
  const light = luminance(node.color)
  if (node.emissive && Math.max(a, b) <= 12) return { kind: 'led', confidence: 0.45, reason: 'peça pequena emissiva à face', axis }
  // ecrã: placa fina, retangular, área razoável, não cobre a face inteira
  const faceDims = [0, 1, 2].filter((i) => i !== axis).map((i) => box.size[i]).sort((x, y) => x - y)
  const printed = PRINT.test(key) || (light !== null && light > 0.97)
  if (!printed && t <= Math.max(0.8, a * 0.08) && a >= 6 && b >= 8 && a * b >= 80 && b / a <= 5 && !(a >= faceDims[0] * 0.85 && b >= faceDims[1] * 0.85)) {
    const dark = light !== null && light < 0.3
    return { kind: 'display', confidence: Math.min(0.75, 0.4 + (dark ? 0.2 : 0) + (greenish(node.color) || node.emissive ? 0.15 : 0)), reason: `placa fina ${b.toFixed(0)}×${a.toFixed(0)} mm à face${dark ? ', escura' : ''}`, axis }
  }
  // botões e seletores: secção quase redonda/quadrada, a sobressair da face
  if (face.gap > Math.max(4, box.size[axis] * 0.25)) return null
  const round = b / Math.max(a, 0.01) <= 1.35
  const small = b <= faceDims[0] * 0.6
  if (round && small && t >= 1.2 && b >= 4) {
    if (b >= 22 && b <= 70 && t <= b * 0.8) return { kind: 'selector', confidence: 0.35, reason: `disco Ø${b.toFixed(0)} mm à face`, axis }
    if (b <= 30) return { kind: 'button', confidence: 0.35, reason: `cilindro Ø${b.toFixed(0)} mm a sobressair`, axis }
  }
  return null
}

/** Equipamento de retenção (disjuntores, seccionadores) vs. botoneiras de impulso. */
const LATCHING_DEVICE = /protection|protec|breaker|disjunt|seccion|isolat|switch_?disc|interruptor|mcb|rcd|rccb|diferencial|pkz|motor_?breaker|fusivel|fuse/
const PUSH_DEVICE = /command|comando|botoneira|push|pulsador|button|botao|npb|xb[45]|xa2/

/** Retorno de um botão/manípulo: mola (impulso) ou retenção, com o motivo. */
export function inferReturnMode(name: string, kind: InteractableKind, category = ''): { mode: ControlReturnMode; reason: string; tilt: boolean } | null {
  if (kind !== 'button' && kind !== 'toggle') return null
  const key = fold(name ?? '')
  const device = fold(category)
  if (kind === 'toggle') return { mode: 'latch', reason: LATCHING_DEVICE.test(device) || /breaker|disjunt|handle|manipul|alavanca|lever/.test(key) ? 'manípulo de disjuntor: fica em ON/OFF' : 'interruptor: mantém a posição', tilt: true }
  if (/emerg|cogumelo|mushroom|e_?stop|estop|lock|trav|reten|latch|bloq|encrav|park/.test(key)) return { mode: 'latch', reason: 'emergência/encravamento: fica premido até rearmar', tilt: false }
  if (/trip|dispar|test|teste|reset|rearm/.test(key) && LATCHING_DEVICE.test(device)) return { mode: 'spring', reason: 'botão de teste/rearme do disjuntor: volta por mola', tilt: false }
  if (/on|off|liga|deslig|toggle|alterna/.test(key) && LATCHING_DEVICE.test(device)) return { mode: 'latch', reason: 'tecla ON/OFF de equipamento de retenção', tilt: false }
  if (PUSH_DEVICE.test(device) || /push|pulsador|impulso|start|stop|marcha|paragem|botao|button|btn|tecla|key/.test(key)) return { mode: 'spring', reason: 'botoneira de impulso: volta por mola ao largar', tilt: false }
  return { mode: 'spring', reason: 'botão sem retenção aparente: volta por mola', tilt: false }
}

/** Propõe controlos, indicadores, ecrãs e bornes a partir dos objetos de um GLB. */
export function suggestFromNodes(nodes: NodeBox[], context: DetectContext = {}): { suggestions: Suggestion[]; ignored: string[] } {
  const suggestions: Suggestion[] = []
  const ignored: string[] = []
  const used = new Set<string>()
  const box = boundsOf(nodes, context)
  for (const node of nodes) {
    const named = classifyNode(node.name)
    const shaped = named || context.namesOnly ? null : classifyGeometry(node, box)
    const hit = named ? { ...named, source: 'name' as const } : shaped ? { ...shaped, source: 'geometry' as const } : null
    if (!hit) { ignored.push(node.name); continue }
    const index = shaped?.axis ?? thinAxis(node.size)
    const axis: Vec3 = [0, 0, 0]
    axis[index] = 1
    const { sign } = mountFace(node, box, index)
    const normal: Vec3 = [0, 0, 0]
    normal[index] = sign
    let base = slug(node.name)
    while (used.has(base)) base = `${base}_2`
    used.add(base)
    const kind = hit.kind
    const key = fold(node.name)
    const ret = inferReturnMode(node.name, kind, context.category)
    const surface = [...node.centre] as Vec3
    surface[index] = node.centre[index] + sign * node.size[index] / 2
    const [u, v] = index === 2 ? [0, 1] : index === 0 ? [2, 1] : [0, 2]
    const round = (n: number) => Math.round(n * 100) / 100
    suggestions.push({
      node: node.name, kind, confidence: hit.confidence, reason: hit.source === 'geometry' ? `geometria: ${hit.reason}` : hit.reason, axis,
      label: `${KIND_LABEL[kind]} ${base}`,
      travelMm: kind === 'selector' || kind === 'display' || kind === 'terminal' ? 0 : Math.round(Math.min(3, Math.max(0.4, node.size[index] * 0.5)) * 10) / 10,
      angle: 35,
      color: kind === 'led' ? LED_COLORS.find(([re]) => re.test(key))?.[1] ?? '#22c55e' : '#22c55e',
      variable: kind === 'led' ? `led_${base}` : kind === 'display' ? `scr_${base}` : kind === 'terminal' ? base : `ctrl_${base}`,
      runtimeVar: kind === 'led' ? RUNTIME_LEDS.find(([re]) => re.test(key))?.[1] : undefined,
      source: hit.source,
      normal,
      ...(ret ? { returnMode: ret.mode, returnReason: ret.reason, tilt: ret.tilt } : {}),
      ...(kind === 'display' ? { screen: { position: surface.map((n, i) => round(i === index ? n + sign * 0.05 : n)) as Vec3, widthMm: round(node.size[u]), heightMm: round(node.size[v]), light: (luminance(node.color) ?? 0) > 0.55 } } : {}),
      ...(kind === 'terminal' ? { point: surface.map(round) as Vec3 } : {}),
    })
  }
  return { suggestions, ignored }
}

/** Controlo pronto a partir de uma sugestão (botão, interruptor ou seletor). */
export function controlFromSuggestion(partId: string, suggestion: Suggestion, id: string, variable = suggestion.variable): ControlDef {
  if (suggestion.kind === 'selector') {
    return {
      id, name: suggestion.label, kind: 'selector', partId, nodes: [suggestion.node], axis: suggestion.axis, travelMm: 0,
      positions: [{ id: 'off', label: '0 · Desligado', angle: -suggestion.angle }, { id: 'on', label: '1 · Ligado', angle: suggestion.angle }],
      bindVar: variable, actions: [],
    }
  }
  const toggle = suggestion.kind === 'toggle'
  return {
    id, name: suggestion.label, kind: toggle ? 'toggle' : 'button', partId, nodes: [suggestion.node],
    axis: suggestion.axis, travelMm: suggestion.travelMm, positions: [], actions: [{ type: 'toggleVar', var: variable }],
    returnMode: suggestion.returnMode ?? (toggle ? 'latch' : 'spring'),
    // manípulos de disjuntor basculam sobre um pivô (afinável em «Movimento»)
    // (eixo de rotação: ao longo da fila de polos, X; se o manípulo estiver montado na face lateral, Z)
    ...(toggle && suggestion.tilt ? { axis: (suggestion.axis[0] ? [0, 0, 1] : [1, 0, 0]) as Vec3, travelMm: 0, motion: { ...DEFAULT_TILT } } : {}),
  }
}

/** Ecrã pronto a partir de uma sugestão (placa do modelo que passa a mostrar texto/variáveis). */
export function displayFromSuggestion(suggestion: Suggestion, id: string, lineId: string): DisplayDef | null {
  if (suggestion.kind !== 'display' || !suggestion.screen) return null
  const { position, widthMm, heightMm } = suggestion.screen
  // fundo claro (LCD reflexivo, 7 segmentos) ou escuro (visor retroiluminado)
  const dark = !(suggestion.screen.light || /lcd|7seg|segment|digit/.test(fold(suggestion.node)))
  return {
    id, name: suggestion.label, position, normal: suggestion.normal ?? suggestion.axis, roll: 0,
    widthMm: Math.max(1, widthMm), heightMm: Math.max(1, heightMm), density: 20,
    background: dark ? '#101820' : '#b8c4a8', foreground: dark ? '#7dff9b' : '#1f2a1f', kind: dark ? 'text' : 'lcd',
    lines: [{ id: lineId, text: '{state}', x: 0.5, y: 0.5, size: 0.4, align: 'center' }],
  }
}

/** Zona luminosa pronta a partir de uma sugestão (LED já existente no modelo). */
export function lightFromSuggestion(partId: string, suggestion: Suggestion, id: string): LightZoneDef {
  return {
    id, name: suggestion.label, partId, nodes: [suggestion.node], color: suggestion.color, intensity: 2.4, kind: 'led',
    when: { var: suggestion.runtimeVar ?? suggestion.variable, op: 'eq', value: true },
  }
}

/** Variável do componente que acompanha uma sugestão (os indicadores de execução usam `$…`, do simulador). */
export function variableFromSuggestion(suggestion: Suggestion, variable = suggestion.variable): VarDef | null {
  if (suggestion.kind === 'led' && suggestion.runtimeVar) return null
  if (suggestion.kind === 'display' || suggestion.kind === 'terminal') return null
  return { id: variable, name: suggestion.label, type: suggestion.kind === 'selector' ? 'text' : 'bool', initial: suggestion.kind === 'selector' ? 'off' : false }
}
