import type { ControlDef, LightZoneDef, VarDef, Vec3 } from './types'

/**
 * Deteção automática de objetos interativos dentro de um modelo GLB.
 *
 * O editor 3D liga botões, manípulos, seletores e LEDs a objetos do modelo pelo **nome do nó**.
 * Este módulo olha para os nomes (e para a geometria: centro e tamanho de cada objeto) e propõe
 * controlos já configurados — eixo, curso/ângulo, variável e ação — que o administrador depois
 * ajusta em «Controlo › Movimento». É só heurística: nada é aplicado sem o utilizador confirmar.
 *
 * Módulo puro (sem Three.js) para poder ser testado com `npm run test:interactables`.
 */

/** Objeto de um GLB como o editor o vê: nome, nº de malhas, centro e tamanho em mm. */
export interface NodeBox { name: string; meshes: number; centre: Vec3; size: Vec3 }

export type InteractableKind = 'button' | 'toggle' | 'selector' | 'led'

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
}

/** Normaliza para comparar: minúsculas e sem acentos. */
const fold = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

const RULES: Array<{ kind: InteractableKind; patterns: RegExp[]; reason: string }> = [
  { kind: 'led', patterns: [/led/, /lamp/, /luz/, /light/, /indicador/, /indicator/, /sinal/, /signal/, /neon/, /glow/, /ilumin/], reason: 'nome sugere indicador luminoso' },
  { kind: 'selector', patterns: [/selector/, /seletor/, /dial/, /knob/, /rotary/, /rotativ/, /commut/, /chave/, /posicao/, /position/, /escala/, /scale/], reason: 'nome sugere seletor rotativo' },
  { kind: 'button', patterns: [/button/, /botao/, /btn/, /tecla/, /key/, /push/, /emerg/, /cogumelo/, /reset/, /start/, /stop/, /test/, /trip/, /dispar/], reason: 'nome sugere botão' },
  { kind: 'toggle', patterns: [/handle/, /manipul/, /alavanca/, /lever/, /toggle/, /interruptor/, /breaker/, /disjuntor/, /rocker/, /sw/], reason: 'nome sugere manípulo/interruptor' },
]

/** Nomes genéricos ou de estrutura: não valem um controlo (corpo, chapa, parafusos, grupos do exportador). */
const STRUCTURE = [
  /^root/, /^scene/, /^sketchfab/, /^osg/, /^node\d*$/, /^mesh\d*$/, /^group\d*$/, /^object\d*$/, /^part\d*$/, /^solid\d*$/, /^poly/i,
  /corpo|body|carcac|housing|shell|chassis|chapa|placa|pcb|board|etiqueta|label|text\d|logo|screw|parafuso|borne|terminal|rail|calha|moldura|frame/,
]

/** Classifica um nome de nó. Devolve `null` quando o nome é genérico/estrutural. */
export function classifyNode(name: string): { kind: InteractableKind; confidence: number; reason: string } | null {
  const key = fold(name ?? '')
  if (!key) return null
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

const KIND_LABEL: Record<InteractableKind, string> = { button: 'Botão', toggle: 'Manípulo', selector: 'Seletor', led: 'Indicador' }
export const kindLabel = (kind: InteractableKind) => KIND_LABEL[kind]

/** Propõe controlos e indicadores a partir dos objetos de um GLB. */
export function suggestFromNodes(nodes: NodeBox[]): { suggestions: Suggestion[]; ignored: string[] } {
  const suggestions: Suggestion[] = []
  const ignored: string[] = []
  const used = new Set<string>()
  for (const node of nodes) {
    const hit = classifyNode(node.name)
    if (!hit) { ignored.push(node.name); continue }
    const index = thinAxis(node.size)
    const axis: Vec3 = [0, 0, 0]
    axis[index] = 1
    let base = slug(node.name)
    while (used.has(base)) base = `${base}_2`
    used.add(base)
    const kind = hit.kind
    const key = fold(node.name)
    suggestions.push({
      node: node.name, kind, confidence: hit.confidence, reason: hit.reason, axis,
      label: `${KIND_LABEL[kind]} ${base}`,
      travelMm: kind === 'selector' ? 0 : Math.round(Math.min(3, Math.max(0.4, node.size[index] * 0.5)) * 10) / 10,
      angle: 35,
      color: kind === 'led' ? LED_COLORS.find(([re]) => re.test(key))?.[1] ?? '#22c55e' : '#22c55e',
      variable: kind === 'led' ? `led_${base}` : `ctrl_${base}`,
      runtimeVar: kind === 'led' ? RUNTIME_LEDS.find(([re]) => re.test(key))?.[1] : undefined,
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
  return {
    id, name: suggestion.label, kind: suggestion.kind === 'button' ? 'button' : 'toggle', partId, nodes: [suggestion.node],
    axis: suggestion.axis, travelMm: suggestion.travelMm, positions: [], actions: [{ type: 'toggleVar', var: variable }],
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
  return { id: variable, name: suggestion.label, type: suggestion.kind === 'selector' ? 'text' : 'bool', initial: suggestion.kind === 'selector' ? 'off' : false }
}
