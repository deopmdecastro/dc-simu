import { validCondition, validGrafcetVariable, type GrafcetAction, type GrafcetChart, type GrafcetComment, type GrafcetProgram, type GrafcetStep, type GrafcetStepType } from './engine'

// Independent reader for the legacy FluidSIM 4 CT container. No vendor code or
// executable is loaded. See docs/FLUIDSIM-IMPORT.md for the observed wire format.
const MAX_OUTPUT = 32 * 1024 * 1024
const MAX_OBJECTS = 10000
const marker = [0x50, 0xc2, 0xe8, 0xb3, 0x55, 0x7f, 0xce, 0xce, 13, 10]
const fail = (message: string): never => { throw new Error(`FluidSIM: ${message}`) }
const GRAFCET_KINDS = new Set(['GRAPHRECT', 'GConnection', 'GTriconnection'])

export function expandFluidSim4(input: Uint8Array): Uint8Array {
  let start = -1
  const asciiMarker = Array.from('COMPRESS\r\n', c => c.charCodeAt(0))
  for (let i = 0; i < Math.min(input.length, 65536) - marker.length; i++) {
    if ([marker, asciiMarker].some(m => m.every((b, j) => input[i + j] === b))) { start = i + marker.length; break }
  }
  if (start < 0) fail('cabeçalho CT comprimido não reconhecido. Selecione um ficheiro FluidSIM 4 .ct.')
  const raw = input.subarray(start)
  if (raw.length < 6) fail('cabeçalho incompleto.')
  const mask = raw[0] === 1 && raw[1] === 0 ? 0 : 0x9a
  const data = raw.map(b => b ^ mask)
  const word = (p: number) => data[p] | data[p + 1] << 8
  if (word(0) !== 1) fail('versão de compressão não suportada.')
  const preset = word(2)
  const headerSize = preset === 0 ? word(4) : 6
  if (headerSize < 6 || headerSize > data.length || (preset === 0 && headerSize !== 14)) fail('configuração de compressão inválida.')
  const size = preset || word(6)
  const runLimit = preset ? word(4) : word(8)
  const bits = preset ? Math.log2(size) : word(10)
  if (size < 128 || size > 4096 || (size & (size - 1)) || bits !== Math.log2(size) || runLimit > 255) fail('dicionário de compressão não suportado.')
  if (!preset && data[12] !== mask) fail('codificação do bloco não suportada.')
  const dictionary = new Uint8Array(4096)
  dictionary.set(Array.from('PREVIEW', c => c.charCodeAt(0)))
  let position = 7
  let p = headerSize
  let length = 0
  let output = new Uint8Array(Math.min(65536, MAX_OUTPUT))
  const append = (chunk: Uint8Array) => {
    if (length + chunk.length > MAX_OUTPUT) fail('o conteúdo expandido excede 32 MB.')
    if (length + chunk.length > output.length) {
      const next = new Uint8Array(Math.min(MAX_OUTPUT, Math.max(output.length * 2, length + chunk.length)))
      next.set(output); output = next
    }
    output.set(chunk, length); length += chunk.length
  }
  const requireBytes = (n: number) => { if (p + n > data.length) fail('bloco comprimido truncado.') }
  while (p < data.length) {
    const command = data[p++]
    if (command & 128) {
      let count = command & 127
      if (!count) fail('bloco literal vazio.')
      requireBytes(count)
      const chunk = data.subarray(p, p + count); p += count
      append(chunk)
      let consumed = 0
      while (position + count >= size) {
        const fit = size - position - 1
        if (fit > 0) { dictionary.set(chunk.subarray(consumed, consumed + fit), position); consumed += fit; count -= fit }
        position = 0
      }
      dictionary.set(chunk.subarray(consumed, consumed + count), position); position += count
    } else {
      requireBytes(1)
      const value = command * 256 + data[p++]
      let count = (value >>> bits) + 1
      const offset = value & (size - 1)
      if (count === 1) {
        requireBytes(1)
        const byte = data[p++]
        if (!offset) fail('repetição vazia.')
        const chunk = new Uint8Array(offset).fill(byte)
        append(chunk)
        if (offset <= runLimit && position + offset < size) { dictionary.set(chunk, position); position += offset }
      } else {
        if (count === 2 && !preset) { requireBytes(1); count = data[p++] }
        if (!count || offset + count > dictionary.length) fail('referência inválida no dicionário.')
        const chunk = dictionary.slice(offset, offset + count)
        append(chunk)
        if (position + count + 1 >= size) position = 0
        if (position + count > size) fail('referência demasiado longa.')
        dictionary.set(chunk, position); position += count
      }
    }
  }
  return output.slice(0, length)
}

/** Converte uma condição FluidSIM para a sintaxe aceite pelo DC-Simu:
 *  NOT → «/», AND/OR → «*»/«+», um espaço de cada lado de «+» e «*», sem espaços
 *  depois de «/» ou junto aos parênteses. Um «+» colado ao fim de uma variável
 *  pneumática (ex.: «1A+») não é operador e mantém-se. */
export function normalizeFluidSimCondition(value: string | undefined): string {
  let result = (value ?? '').replace(/\s+/g, ' ').trim()
  if (!result) return '1'
  result = result
    .replace(/\bNOT\b\s*/gi, '/')
    .replace(/!\s*/g, '/')
    .replace(/\s+\bAND\b\s+/gi, ' * ')
    .replace(/\s+\bOR\b\s+/gi, ' + ')
    .replace(/\s*\*\s*/g, ' * ')
    .replace(/\s*\+(?=\s*(?:[/(^\\↑↓01]|[A-Za-z_%]))\s*/g, ' + ')
    .replace(/\/\s+/g, '/')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return result
}

/** Nome de variável de ação aceite pelo simulador: letras sem acentos, dígitos e «_»,
 *  a começar por letra; «+»/«-» final (pneumática) preservado. */
export function normalizeFluidSimVariable(value: string): string {
  let name = value.trim().replace(/^%/, '')
  if (!name) return ''
  if (validGrafcetVariable(name)) return name
  const suffix = /[+-]$/.test(name) ? name.slice(-1) : ''
  if (suffix) name = name.slice(0, -1)
  name = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
  if (!name) return ''
  if (!/^[A-Za-z]/.test(name)) name = `V${name}`
  return name + suffix
}

type NativeObject = { kind: string; box: number[]; props: Map<string, string> }
type Gate = { number: number; owner: number; port: number }
export interface FluidSimImport { program: GrafcetProgram; warnings: string[] }
export type FluidSimImportMode = 'strict' | 'drawing'

/** Parse the semantic CT records. O<n> labels can be stale after deletion:
 * gate/CON references address the ordered record table, not those labels. */
export function parseFluidSim4Text(text: string, mode: FluidSimImportMode = 'strict'): FluidSimImport {
  const drawing = mode === 'drawing'
  const warnings: string[] = []
  const review = (message: string) => { if (!drawing) fail(message); warnings.push(message) }
  const previewEnd = text.indexOf('END_FSPREVIEW\n')
  if (previewEnd >= 0) text = text.slice(previewEnd + 'END_FSPREVIEW\n'.length)
  text = text.replace(/^\n*ENDPREVIEW\n/, '')
  const end = text.indexOf('\nENDCT\n')
  if (end < 0) fail('estrutura CT incompleta.')
  const suffix = text.slice(end)
  // Depois de ENDCT o FluidSIM guarda as definições DDE e os símbolos desenhados
  // dos componentes elétricos/pneumáticos (BEGINSYM … ENDSYM). Não pertencem ao GRAFCET.
  if (!/^\nENDCT\n(?:BEGINDSD\n[\s\S]*?ENDDSD\n)?(?:BEGINSYM\n[\s\S]*?ENDSYM\n?)?\s*$/.test(suffix)) fail('o ficheiro contém submodelos ainda não suportados.')
  text = text.slice(0, end)
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) fail('registos CT corrompidos.')
  const objects: NativeObject[] = []
  const gates: Gate[] = []
  const connections: Array<[number, number]> = []
  /** Percurso desenhado de cada ligação, guardado depois da porta de origem (registos L). */
  const segments = new Map<number, number[][]>()
  const ignored = new Map<string, number>()
  let current: NativeObject | undefined
  let inLine = false
  for (const line of text.split('\n')) {
    if (line.length > 8192) fail('registo demasiado longo.')
    if (!line.trim()) continue
    const record = /^(\w+) O\d+ ((?:-?\d+\s+){6}-?\d+)\s*$/.exec(line)
    if (record) {
      current = { kind: record[1], box: record[2].trim().split(/\s+/).map(Number), props: new Map() }
      if (current.box.some(n => !Number.isSafeInteger(n))) fail('coordenadas inválidas.')
      // Elementos que não são GRAFCET (circuito elétrico, EasyPort/OPC, texto…) ficam na
      // tabela para os índices das portas continuarem certos, mas não são interpretados.
      if (!GRAFCET_KINDS.has(record[1]) && !/^E(?:Tri)?[Cc]onnection$/.test(record[1]) && record[1] !== 'text') ignored.set(record[1], (ignored.get(record[1]) ?? 0) + 1)
      objects.push(current)
      inLine = false
      if (objects.length > MAX_OBJECTS) fail('demasiados elementos.')
      continue
    }
    const prop = /^ S (\w+) (I|INT|S|B|V) ?(.*)$/.exec(line)
    if (prop && (current || inLine)) {
      if (inLine || (!GRAFCET_KINDS.has(current!.kind) && current!.kind !== 'text')) continue
      if (current!.props.has(prop[1])) fail(`propriedade repetida: ${prop[1]}.`)
      current!.props.set(prop[1], prop[3]); continue
    }
    const gate = /^gate(\d+) # (\d+) (\d+)$/.exec(line)
    if (gate) { gates.push({ number: +gate[1], owner: +gate[2], port: +gate[3] }); current = undefined; continue }
    const con = /^CON GLine (\d+) (\d+)$/.exec(line)
    if (con) { connections.push([+con[1], +con[2]]); current = undefined; continue }
    if (/^CON [A-Z]\w* \d+ \d+$/.test(line)) { current = undefined; inLine = true; continue }
    const seg = /^L (-?\d+) (-?\d+) (-?\d+) (-?\d+)$/.exec(line)
    if (seg) { if (current) { const list = segments.get(objects.length - 1) ?? []; list.push(seg.slice(1).map(Number)); segments.set(objects.length - 1, list) } continue }
    if (/^ F \w+ [xy]_offset I -?\d+$/.test(line) || line === '0 0 0 # 0 0 0 0 0 0') continue
    fail(`registo não suportado: ${line.slice(0, 70)}`)
  }
  const isGrafcet = (index: number) => GRAFCET_KINDS.has(objects[index]?.kind)
  if (!objects.length) fail('não foram encontrados elementos GRAFCET.')
  const typeOf = (index: number) => Number(objects[index]?.props.get('graph_type') ?? -1)
  const parent = objects.map((_, i) => i)
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] } return i }
  const union = (a: number, b: number) => { parent[find(a)] = find(b) }
  const portOf = new Map<string, number>()
  const ownerOf = new Map<number, Gate>()
  for (const gate of gates) {
    if (!isGrafcet(gate.owner) && objects[gate.owner]) continue
    if (!objects[gate.owner] || objects[gate.port]?.kind !== 'GConnection' || ownerOf.has(gate.port) || portOf.has(`${gate.owner}:${gate.number}`)) fail('referência de porta inválida ou repetida.')
    portOf.set(`${gate.owner}:${gate.number}`, gate.port); ownerOf.set(gate.port, gate)
  }
  const port = (owner: number, number: number) => {
    const result = portOf.get(`${owner}:${number}`)
    if (result === undefined) fail(`falta a porta ${number} do elemento ${owner}.`)
    return result!
  }
  const coordinates = new Map<string, number>()
  objects.forEach((o, index) => {
    if (!isGrafcet(index)) return
    if (o.kind === 'GConnection') {
      if (!ownerOf.has(index)) fail('porta sem elemento associado.')
      const key = `${o.box[0] + o.box[2]},${o.box[1] + o.box[3]}`
      const other = coordinates.get(key)
      if (other !== undefined) union(index, other)
      else coordinates.set(key, index)
    } else if (o.kind === 'GTriconnection') {
      union(port(index, 1), port(index, 2)); union(port(index, 2), port(index, 3))
    } else {
      if (![1, 2, 3].includes(typeOf(index))) fail(`tipo GRAFCET ${typeOf(index)} ainda não suportado (macroetapas/sincronizações).`)
      if (typeOf(index) === 2) union(port(index, 3), port(index, 4))
    }
  })
  for (const [a, b] of connections) {
    if (!ownerOf.has(a) || !ownerOf.has(b)) fail('ligação com porta inexistente.')
    union(a, b)
  }
  // Entrada/saída de etapas e transições: a porta de cima recebe, a de baixo envia.
  // Símbolos espelhados na vertical (FLIPPED com o bit 2) trocam a posição das portas 1 e 2;
  // ler só o número inverteria o sentido do GRAFCET (ex.: 5→1 em vez de 1→5).
  const centerY = (index: number) => { const b = objects[index].box; return (b[1] + b[3]) / 2 }
  const flowPorts = (index: number) => {
    const one = port(index, 1), two = port(index, 2)
    const dy = centerY(one) - centerY(two)
    const flipped = (Number(objects[index].props.get('FLIPPED') || 0) & 2) !== 0
    const swap = dy !== 0 ? dy > 0 : flipped
    return swap ? { input: two, output: one } : { input: one, output: two }
  }
  const inputOf = (index: number) => flowPorts(index).input
  const outputOf = (index: number) => flowPorts(index).output
  const rects = objects.map((o, index) => ({ o, index })).filter(({ o }) => o.kind === 'GRAPHRECT')
  const nativeSteps = rects.filter(({ index }) => typeOf(index) === 1)
  if (!nativeSteps.length) fail('não foram encontradas etapas.')
  const nativeTransitions = rects.filter(({ index }) => typeOf(index) === 3)
  const links = nativeTransitions.map(({ o, index }) => ({
    o, index,
    from: nativeSteps.filter(s => find(outputOf(s.index)) === find(inputOf(index))),
    to: nativeSteps.filter(s => find(inputOf(s.index)) === find(outputOf(index))),
    link: o.props.get('LINK')?.trim(),
  }))
  const stepParent = new Map(nativeSteps.map(({ index }) => [index, index]))
  const stepRoot = (index: number): number => {
    const parentIndex = stepParent.get(index)
    if (parentIndex === undefined) fail('referência a etapa inexistente.')
    if (parentIndex === index) return index
    const root = stepRoot(parentIndex!); stepParent.set(index, root); return root
  }
  const joinSteps = (a: number, b: number) => { stepParent.set(stepRoot(a), stepRoot(b)) }
  const nameOfStep = (index: number) => objects[index].props.get('NAME')?.trim() || String(index)
  for (const link of links) {
    if (link.link) {
      const candidates = nativeSteps.filter(s => nameOfStep(s.index) === link.link)
      if (!candidates.length || (drawing && candidates.length > 1 && !link.to.length)) {
        review(`Destino por referência ${link.link} ${candidates.length ? 'ambíguo' : 'inexistente'}; ligação por completar.`)
        continue
      }
      const x = (link.o.box[0] + link.o.box[2]) / 2
      const target = candidates.sort((a, b) => Math.abs((a.o.box[0] + a.o.box[2]) / 2 - x) - Math.abs((b.o.box[0] + b.o.box[2]) / 2 - x))[0]
      if (link.to.length && !link.to.some(s => s.index === target.index)) {
        review(`Destino por referência inválido: ${link.link}. A ligação explícita foi preservada.`)
        continue
      }
      link.to = [target]
    }
    if (link.from.length !== 1 || link.to.length !== 1) review(`a transição ${links.indexOf(link) + 1} tem ligações incompletas ou uma sincronização ainda não suportada.`)
    if (link.from.length === 1 && link.to.length === 1) joinSteps(link.from[0].index, link.to[0].index)
  }
  const chartGroups = (drawing ? [0] : [...new Set(nativeSteps.map(({ index }) => stepRoot(index)))]).map(root => {
    const steps = drawing ? nativeSteps : nativeSteps.filter(s => stepRoot(s.index) === root)
    return { steps, minX: Math.min(...steps.map(s => (s.o.box[0] + s.o.box[2]) / 2)), minY: Math.min(...steps.map(s => s.o.box[1])) }
  }).sort((a, b) => a.minX - b.minX)
  const multiChart = chartGroups.length > 1
  const charts: GrafcetChart[] = chartGroups.map((_, i) => ({ id: `fs4-chart-${i + 1}`, name: `GRAFCET ${i + 1}`, title: `GRAFCET ${i + 1}` }))
  const chartForStep = new Map<number, string>()
  chartGroups.forEach((group, i) => group.steps.forEach(({ index }) => chartForStep.set(index, charts[i].id)))
  const point = (o: NativeObject, chartId?: string) => {
    const groupIndex = charts.findIndex(chart => chart.id === chartId)
    const group = chartGroups[groupIndex >= 0 ? groupIndex : 0]
    return { x: 200 + ((o.box[0] + o.box[2]) / 2 - group.minX) * 1.5 / 1024, y: 80 + (o.box[1] - group.minY) * 1.5 / 1024 }
  }
  chartGroups.forEach((group, i) => {
    const initialCount = group.steps.filter(({ index }) => [1, 17].includes(Number(objects[index].props.get('mod_flag') || 0))).length
    if (!initialCount)
      warnings.push(`${charts[i].name} não tem etapa inicial; pode ser um GRAFCET parcial dependente de uma etapa encapsulante.`)
    else if (initialCount > 1) warnings.push(`${charts[i].name} tem ${initialCount} etapas iniciais; confirme se a ativação simultânea corresponde ao original.`)
  })
  const stepByIndex = new Map<number, GrafcetStep>()
  const stepNamesByChart = new Set<string>()
  for (const { o, index } of nativeSteps) {
    const name = nameOfStep(index)
    const flags = Number(o.props.get('mod_flag') || 0)
    const stepTypes: Record<number, GrafcetStepType> = { 0: 'simple', 1: 'initial', 16: 'enclosing', 17: 'initial-enclosing', 32: 'macro', 256: 'macro-input', 512: 'macro-output' }
    const stepType = stepTypes[flags]
    if (!stepType) fail(`a etapa ${name} usa uma notação ainda não suportada (0x${flags.toString(16)}).`)
    const chart = chartForStep.get(index)!
    const scopedName = `${chart}:${name}`
    if (stepNamesByChart.has(scopedName)) review(`identificador de etapa repetido no mesmo GRAFCET: ${name}.`)
    stepNamesByChart.add(scopedName)
    const initial = stepType === 'initial' || stepType === 'initial-enclosing'
    const step: GrafcetStep = { id: `fs4-step-${index}`, name, initial, stepType, action: '', condition: '', actions: [], pinned: true, ...(multiChart ? { chart } : {}), ...point(o, chart) }
    if (drawing) { step.w = (o.box[2] - o.box[0]) * 1.5 / 1024; step.h = (o.box[3] - o.box[1]) * 1.5 / 1024 }
    stepByIndex.set(index, step)
  }
  const external = new Set<string>()
  const condition = (value: string | undefined, context: string) => {
    // FluidSIM permits adjacent symbolic operands such as a+NOT b. In the
    // current engine a trailing '+' can also be part of a pneumatic variable;
    // separating the boolean operator removes that lexical ambiguity.
    const result = normalizeFluidSimCondition(value)
    if (!validCondition(result)) review(`condição não suportada em ${context}: ${result}.`)
    for (const match of result.matchAll(/\bG\d+\s*(?:<=>\s*)?X\d+\b/gi)) external.add(match[0])
    return result
  }
  const transitionOrdinals = new Map<string, number>()
  const transitions = links.map(({ o, index, from, to, link }) => {
    const owner = from[0] ?? to[0]
    const chart = (owner ? chartForStep.get(owner.index) : undefined) ?? charts[0].id
    if (!drawing && chart !== chartForStep.get(to[0].index)) fail('uma ligação entre GRAFCETs diferentes não pode ser importada como transição local.')
    const ordinal = (transitionOrdinals.get(chart) ?? 0) + 1
    transitionOrdinals.set(chart, ordinal)
    const position = point(o, chart)
    if (drawing) position.y += (o.box[3] - o.box[1]) * 0.75 / 1024
    return { id: `fs4-transition-${index}`, name: `T${ordinal}`, from: from.map(s => stepByIndex.get(s.index)!.id), to: to.map(s => stepByIndex.get(s.index)!.id), condition: condition(o.props.get('COND'), `T${ordinal}`), wireless: !!link, ...(link ? { targetInfo: link } : {}), ...(multiChart ? { chart } : {}), ...position }
  })
  // Percurso desenhado no FluidSIM para os retornos (etapa de destino acima da origem):
  // os registos L de cada ligação dão os cotovelos, que passam a pontos de quebra.
  const toPx = (x: number, y: number, chartId?: string) => {
    const groupIndex = charts.findIndex(chart => chart.id === chartId)
    const group = chartGroups[groupIndex >= 0 ? groupIndex : 0]
    return { x: Math.round(200 + (x - group.minX) * 1.5 / 1024), y: Math.round(80 + (y - group.minY) * 1.5 / 1024) }
  }
  const centre = (index: number) => { const b = objects[index].box; return { x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2 } }
  const conPath = (a: number, b: number): Array<{ x: number; y: number }> | null => {
    const owner = segments.has(a) ? a : segments.has(b) ? b : -1
    if (owner < 0) return [centre(a), centre(b)]
    const box = objects[owner].box
    const points: Array<{ x: number; y: number }> = []
    for (const [sx, sy, ex, ey] of segments.get(owner)!) {
      const start = { x: box[0] + sx, y: box[1] + sy }, end = { x: box[2] + ex, y: box[3] + ey }
      if (start.x !== end.x && start.y !== end.y) return null
      const last = points[points.length - 1]
      if (!last) points.push(start)
      else if (last.x !== start.x || last.y !== start.y) return null
      points.push(end)
    }
    const from = owner === a ? a : b
    const ca = centre(from)
    if (points[0].x !== ca.x || points[0].y !== ca.y) return null
    return owner === a ? points : points.reverse()
  }
  /** Caminho nativo entre duas portas do mesmo grupo (só ligações explícitas CON). */
  const legBetween = (fromPort: number, toPort: number) => {
    if (find(fromPort) !== find(toPort) || fromPort === toPort) return [] as Array<{ x: number; y: number }>
    const edges = connections.filter(([a, b]) => find(a) === find(fromPort) && find(b) === find(fromPort))
    if (edges.length !== 1) {
      const a = centre(fromPort), b = centre(toPort)
      return a.x === b.x && a.y === b.y ? [] : null
    }
    const [a, b] = edges[0]
    const coincide = (p: number, q: number) => { const m = centre(p), n = centre(q); return m.x === n.x && m.y === n.y }
    const path = conPath(a, b)
    if (!path) return null
    if (coincide(a, fromPort) && coincide(b, toPort)) return path
    if (coincide(b, fromPort) && coincide(a, toPort)) return path.slice().reverse()
    return null
  }
  const linkBends: Record<string, Array<{ x: number; y: number }>> = {}
  links.forEach((link, i) => {
    const source = link.from[0], target = link.to[0]
    if (!source || !target || link.link || target.o.box[1] > source.o.box[1]) return
    const legA = legBetween(outputOf(source.index), inputOf(link.index))
    const legB = legBetween(outputOf(link.index), inputOf(target.index))
    if (!legA || !legB) return
    const native = [centre(outputOf(source.index)), ...legA, ...legB, centre(inputOf(target.index))]
    const chart = chartForStep.get(source.index)
    const pts = native.map(p => toPx(p.x, p.y, chart))
    // Tira pontos repetidos e colineares; ficam só os cotovelos.
    const clean: Array<{ x: number; y: number }> = []
    for (const p of pts) {
      const last = clean[clean.length - 1]
      if (last && last.x === p.x && last.y === p.y) continue
      const prev = clean[clean.length - 2]
      if (prev && last && ((prev.x === last.x && last.x === p.x) || (prev.y === last.y && last.y === p.y))) clean[clean.length - 1] = p
      else clean.push(p)
    }
    if (clean.length < 3 || clean.some((p, k) => k > 0 && p.x !== clean[k - 1].x && p.y !== clean[k - 1].y)) return
    linkBends[transitions[i].id] = clean.slice(1, -1)
  })
  const freeActions: GrafcetAction[] = []
  for (const { o, index } of rects.filter(r => typeOf(r.index) === 2)) {
    const flags = Number(o.props.get('mod_flag') || 0)
    const actionFlags = [0x800, 0x840, 0x2800, 0x2840, 0x2008, 0x2004, 0x2001]
    if (!actionFlags.includes(flags)) review('ação memorizada, de evento ou de forçagem ainda não suportada.')
    if (o.props.get('ACTION')?.trim() || o.props.get('ACTION_SUB_GRAPH')?.trim() || o.props.get('ACTION_STEPS')?.trim()) review('ação memorizada, de evento ou de forçagem ainda não suportada.')
    const original = (o.props.get('VAR') || o.props.get('ACTION_DESCR') || '').trim()
    const variable = drawing ? original : normalizeFluidSimVariable(original)
    if (!validGrafcetVariable(variable)) review(`variável de ação inválida: ${original || '(vazia)'}.`)
    if (variable !== original.replace(/^%/, '')) warnings.push(`A variável de ação «${original}» foi convertida para «${variable}» (formato aceite pelo simulador).`)
    const conditional = !!(flags & 0x40)
    const group = find(port(index, 4))
    const owners = nativeSteps.filter(s => find(port(s.index, 3)) === group)
    if (owners.length > 1) review(`a ação ${variable} está ligada a várias etapas.`)
    const chart = owners.length ? chartForStep.get(owners[0].index) : undefined
    if (![0x800, 0x840, 0x2800, 0x2840].includes(flags)) warnings.push(`A ação ${variable} foi importada como contínua; o qualificador original (0x${flags.toString(16)}) precisa de revisão.`)
    const action: GrafcetAction = { id: `fs4-action-${index}`, address: variable, variable, description: o.props.get('VAR')?.trim() ? o.props.get('ACTION_DESCR')?.trim() || '' : '', kind: 'N', allocation: 'continuous', type: conditional ? 'conditional' : 'simple', condition: conditional ? condition(o.props.get('COND'), variable) : '1', ...point(o, chart) }
    if (drawing) {
      action.w = (o.box[2] - o.box[0]) * 1.5 / 1024
      action.h = (o.box[3] - o.box[1]) * 1.5 / 1024
      action.x! -= action.w / 2
      if (owners.length) {
        const step = stepByIndex.get(owners[0].index)!
        action.dx = action.x! - step.x!
        action.dy = action.y! - step.y!
      }
    }
    if (owners.length) stepByIndex.get(owners[0].index)!.actions!.push(action)
    else { freeActions.push(action); warnings.push(`A ação ${variable} ficou solta: não tem ligação a uma etapa.`) }
  }
  // The engine currently evaluates G<n>X<m> in the current chart. Retain the
  // source expression and explicitly report that external charts need review.
  if (external.size) warnings.push(`Referências a outros GRAFCETs preservadas: ${[...external].join(', ')}. O simulador atual interpreta X no gráfico atual; reveja estas condições antes de simular.`)
  for (const step of stepByIndex.values()) step.actions!.sort((a, b) => (a.x || 0) - (b.x || 0))
  // Legendas de texto junto ao GRAFCET (título, notas) passam a comentários; texto
  // afastado pertence ao circuito elétrico/pneumático e não é importado.
  const comments: GrafcetComment[] = []
  const stepBoxes = nativeSteps.map(s => s.o.box)
  const margin = 65536
  const area = { x0: Math.min(...stepBoxes.map(b => b[0])) - margin, y0: Math.min(...stepBoxes.map(b => b[1])) - margin, x1: Math.max(...rects.map(r => r.o.box[2])) + margin, y1: Math.max(...rects.map(r => r.o.box[3])) + margin }
  objects.forEach((o, index) => {
    if (o.kind !== 'text') return
    const value = o.props.get('text')?.trim()
    if (!value) return
    const [x0, y0, x1, y1] = o.box
    if (!drawing && (x1 < area.x0 || x0 > area.x1 || y1 < area.y0 || y0 > area.y1)) { ignored.set('text', (ignored.get('text') ?? 0) + 1); return }
    const at = point(o, multiChart ? charts[0].id : undefined)
    const height = Number(o.props.get('height') || 0)
    const bold = /black|bold/i.test(o.props.get('font_name') || '') || (Number(o.props.get('style') || 0) & 2) === 2
    comments.push({ id: `fs4-text-${index}`, text: value, x: Math.round(200 + (x0 - chartGroups[0].minX) * 1.5 / 1024), y: Math.round(at.y), ...(height > 0 ? { fontSize: Math.min(32, Math.max(10, Math.round(height))) } : {}), fontWeight: bold ? '700' : '400', ...(multiChart ? { chart: charts[0].id } : {}) })
  })
  // O texto acima da etapa inicial (título) não pode ficar com y negativo: desce o desenho todo.
  const top = Math.min(...comments.map(c => c.y))
  if (comments.length && top < 24) {
    const dy = 24 - top
    for (const c of comments) c.y += dy
    for (const step of stepByIndex.values()) { step.y = (step.y ?? 0) + dy; for (const a of step.actions ?? []) if (a.y !== undefined) a.y += dy }
    for (const t of transitions) t.y = (t.y ?? 0) + dy
    for (const a of freeActions) if (a.y !== undefined) a.y += dy
    for (const points of Object.values(linkBends)) for (const p of points) p.y += dy
  }
  if (ignored.size) {
    const total = [...ignored.values()].reduce((a, b) => a + b, 0)
    warnings.push(`O ficheiro também tem ${total} elemento(s) que não são GRAFCET (${[...ignored.keys()].sort().join(', ')}): circuito elétrico/pneumático e EasyPort/OPC. Só o GRAFCET foi importado; desenhe esse circuito no Esquema.`)
  }
  const program: GrafcetProgram = { steps: [...stepByIndex.values()], transitions, freeActions, comments, ...(Object.keys(linkBends).length ? { linkBends } : {}), ...(multiChart ? { charts, activeChart: charts[0].id } : {}) }
  if (drawing) program.importReview = { source: 'fluidsim4', warnings: [...warnings] }
  return { program, warnings }
}

export function importFluidSim4(input: Uint8Array, mode: FluidSimImportMode = 'strict'): FluidSimImport {
  let expanded = expandFluidSim4(input)
  // Algumas gravações começam por «PREVIEW <n>» seguido de 4 bytes de tamanho e do
  // metaficheiro WMF binário. Esse bloco é saltado pelo tamanho, sem ser interpretado.
  const head = new TextDecoder('latin1').decode(expanded.subarray(0, 32))
  const preview = /^PREVIEW (\d+)\r?\n/.exec(head)
  if (preview) {
    const at = preview[0].length
    const size = Number(preview[1])
    const stored = at + 4 <= expanded.length ? (expanded[at] | expanded[at + 1] << 8 | expanded[at + 2] << 16 | expanded[at + 3] << 24) >>> 0 : -1
    if (stored !== size || at + 4 + size > expanded.length) fail('pré-visualização CT inválida.')
    expanded = expanded.subarray(at + 4 + size)
  }
  // Windows-1252 is the native text encoding; the WMF preview is skipped before
  // any records are interpreted. It is never rendered or executed.
  const text = new TextDecoder('windows-1252').decode(expanded).replace(/\r\n?/g, '\n')
  return parseFluidSim4Text(text, mode)
}
