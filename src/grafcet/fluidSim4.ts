import { validCondition, validGrafcetVariable, type GrafcetAction, type GrafcetProgram, type GrafcetStep } from './engine'

// Independent reader for the legacy FluidSIM 4 CT container. No vendor code or
// executable is loaded. See docs/FLUIDSIM-IMPORT.md for the observed wire format.
const MAX_OUTPUT = 32 * 1024 * 1024
const MAX_OBJECTS = 10000
const marker = [0x50, 0xc2, 0xe8, 0xb3, 0x55, 0x7f, 0xce, 0xce, 13, 10]
const fail = (message: string): never => { throw new Error(`FluidSIM: ${message}`) }

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

type NativeObject = { kind: string; box: number[]; props: Map<string, string> }
type Gate = { number: number; owner: number; port: number }
export interface FluidSimImport { program: GrafcetProgram; warnings: string[] }

/** Parse the semantic CT records. O<n> labels can be stale after deletion:
 * gate/CON references address the ordered record table, not those labels. */
export function parseFluidSim4Text(text: string): FluidSimImport {
  const previewEnd = text.indexOf('END_FSPREVIEW\n')
  if (previewEnd >= 0) text = text.slice(previewEnd + 'END_FSPREVIEW\n'.length)
  const end = text.indexOf('\nENDCT\n')
  if (end < 0) fail('estrutura CT incompleta.')
  const suffix = text.slice(end)
  if (!/^\nENDCT\n(?:BEGINDSD\nENDDSD\n)?(?:BEGINSYM\nENDSYM\n)?\s*$/.test(suffix)) fail('o ficheiro contém submodelos ainda não suportados.')
  text = text.slice(0, end)
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) fail('registos CT corrompidos.')
  const objects: NativeObject[] = []
  const gates: Gate[] = []
  const connections: Array<[number, number]> = []
  let current: NativeObject | undefined
  for (const line of text.split('\n')) {
    if (line.length > 8192) fail('registo demasiado longo.')
    if (!line.trim()) continue
    const record = /^(\w+) O\d+ ((?:-?\d+\s+){6}-?\d+)\s*$/.exec(line)
    if (record) {
      if (!['GRAPHRECT', 'GConnection', 'GTriconnection'].includes(record[1])) fail(`elemento ${record[1]} ainda não suportado.`)
      current = { kind: record[1], box: record[2].trim().split(/\s+/).map(Number), props: new Map() }
      if (current.box.some(n => !Number.isSafeInteger(n))) fail('coordenadas inválidas.')
      objects.push(current)
      if (objects.length > MAX_OBJECTS) fail('demasiados elementos.')
      continue
    }
    const prop = /^ S (\w+) (I|INT|S|B) ?(.*)$/.exec(line)
    if (prop && current) { if (current.props.has(prop[1])) fail(`propriedade repetida: ${prop[1]}.`); current.props.set(prop[1], prop[3]); continue }
    const gate = /^gate(\d+) # (\d+) (\d+)$/.exec(line)
    if (gate) { gates.push({ number: +gate[1], owner: +gate[2], port: +gate[3] }); continue }
    const con = /^CON GLine (\d+) (\d+)$/.exec(line)
    if (con) { connections.push([+con[1], +con[2]]); continue }
    if (/^ F con_descr\d+ [xy]_offset I -?\d+$/.test(line) || /^L (?:-?\d+ ){3}-?\d+$/.test(line) || line === '0 0 0 # 0 0 0 0 0 0') continue
    fail(`registo não suportado: ${line.slice(0, 70)}`)
  }
  if (!objects.length) fail('não foram encontrados elementos GRAFCET.')
  const typeOf = (index: number) => Number(objects[index]?.props.get('graph_type') ?? -1)
  const parent = objects.map((_, i) => i)
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] } return i }
  const union = (a: number, b: number) => { parent[find(a)] = find(b) }
  const portOf = new Map<string, number>()
  const ownerOf = new Map<number, Gate>()
  for (const gate of gates) {
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
  const rects = objects.map((o, index) => ({ o, index })).filter(({ o }) => o.kind === 'GRAPHRECT')
  const nativeSteps = rects.filter(({ index }) => typeOf(index) === 1)
  if (!nativeSteps.length) fail('não foram encontradas etapas.')
  const minX = Math.min(...nativeSteps.map(({ o }) => (o.box[0] + o.box[2]) / 2))
  const minY = Math.min(...nativeSteps.map(({ o }) => o.box[1]))
  const point = (o: NativeObject) => ({ x: 200 + ((o.box[0] + o.box[2]) / 2 - minX) * 1.5 / 1024, y: 80 + (o.box[1] - minY) * 1.5 / 1024 })
  const warnings: string[] = []
  const stepByIndex = new Map<number, GrafcetStep>()
  const stepByName = new Map<string, GrafcetStep>()
  for (const { o, index } of nativeSteps) {
    const name = o.props.get('NAME')?.trim() || String(stepByIndex.size)
    if (stepByName.has(name)) fail(`identificador de etapa repetido: ${name}.`)
    const flags = Number(o.props.get('mod_flag') || 0)
    if (flags & ~1) fail(`a etapa ${name} usa uma notação ainda não suportada.`)
    const initial = !!(flags & 1)
    const step: GrafcetStep = { id: `fs4-step-${index}`, name, initial, stepType: initial ? 'initial' : 'simple', action: '', condition: '', actions: [], pinned: true, ...point(o) }
    stepByIndex.set(index, step); stepByName.set(name, step)
  }
  const external = new Set<string>()
  const condition = (value: string | undefined, context: string) => {
    // FluidSIM permits adjacent symbolic operands such as a+NOT b. In the
    // current engine a trailing '+' can also be part of a pneumatic variable;
    // separating the boolean operator removes that lexical ambiguity.
    const result = (value?.trim() || '1').replace(/\s*\+(?=\s*(?:NOT\b|[A-Za-z_(01]))\s*/gi, ' + ')
    if (!validCondition(result)) fail(`condição não suportada em ${context}: ${result}.`)
    for (const match of result.matchAll(/\bG\d+\s*(?:<=>\s*)?X\d+\b/gi)) external.add(match[0])
    return result
  }
  const nativeTransitions = rects.filter(({ index }) => typeOf(index) === 3)
  const transitions = nativeTransitions.map(({ o, index }, ordinal) => {
    const fromGroup = find(port(index, 1)), toGroup = find(port(index, 2))
    const from = nativeSteps.filter(s => find(port(s.index, 2)) === fromGroup).map(s => stepByIndex.get(s.index)!.id)
    let to = nativeSteps.filter(s => find(port(s.index, 1)) === toGroup).map(s => stepByIndex.get(s.index)!.id)
    const link = o.props.get('LINK')?.trim()
    if (link) {
      const targetId = stepByName.get(link)?.id ?? fail(`destino por referência inválido: ${link}.`)
      if (to.some(id => id !== targetId)) fail(`destino por referência inválido: ${link}.`)
      to = [targetId]
    }
    if (from.length !== 1 || to.length !== 1) fail(`a transição ${ordinal + 1} tem ligações incompletas ou uma sincronização ainda não suportada.`)
    return { id: `fs4-transition-${index}`, name: `T${ordinal + 1}`, from, to, condition: condition(o.props.get('COND'), `T${ordinal + 1}`), wireless: !!link, ...point(o) }
  })
  const freeActions: GrafcetAction[] = []
  for (const { o, index } of rects.filter(r => typeOf(r.index) === 2)) {
    const flags = Number(o.props.get('mod_flag') || 0)
    if (![0x800, 0x840, 0x2800, 0x2840].includes(flags) || o.props.get('ACTION')?.trim() || o.props.get('ACTION_SUB_GRAPH')?.trim() || o.props.get('ACTION_STEPS')?.trim()) fail('ação memorizada, de evento ou de forçagem ainda não suportada.')
    const variable = (o.props.get('VAR') || o.props.get('ACTION_DESCR') || '').trim()
    if (!validGrafcetVariable(variable)) fail(`variável de ação inválida: ${variable || '(vazia)'}.`)
    const conditional = !!(flags & 0x40)
    const action: GrafcetAction = { id: `fs4-action-${index}`, address: variable, variable, description: o.props.get('ACTION_DESCR')?.trim() || '', kind: 'N', allocation: 'continuous', type: conditional ? 'conditional' : 'simple', condition: conditional ? condition(o.props.get('COND'), variable) : '1', ...point(o) }
    const group = find(port(index, 4))
    const owners = nativeSteps.filter(s => find(port(s.index, 3)) === group)
    if (owners.length > 1) fail(`a ação ${variable} está ligada a várias etapas.`)
    if (owners.length) stepByIndex.get(owners[0].index)!.actions!.push(action)
    else { freeActions.push(action); warnings.push(`A ação ${variable} ficou solta: não tem ligação a uma etapa.`) }
  }
  // The engine currently evaluates G<n>X<m> in the current chart. Retain the
  // source expression and explicitly report that external charts need review.
  if (external.size) warnings.push(`Referências a outros GRAFCETs preservadas: ${[...external].join(', ')}. O simulador atual interpreta X no gráfico atual; reveja estas condições antes de simular.`)
  for (const step of stepByIndex.values()) step.actions!.sort((a, b) => (a.x || 0) - (b.x || 0))
  return { program: { steps: [...stepByIndex.values()], transitions, freeActions, comments: [] }, warnings }
}

export function importFluidSim4(input: Uint8Array): FluidSimImport {
  const expanded = expandFluidSim4(input)
  // Windows-1252 is the native text encoding; the WMF preview is skipped before
  // any records are interpreted. It is never rendered or executed.
  const text = new TextDecoder('windows-1252').decode(expanded).replace(/\r\n?/g, '\n')
  return parseFluidSim4Text(text)
}
