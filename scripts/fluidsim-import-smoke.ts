import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { expandFluidSim4, importFluidSim4, parseFluidSim4Text } from '../src/grafcet/fluidSim4'
import { readGrafcetFile, MAX_GRAFCET_IMPORT_BYTES } from '../src/grafcet/importFile'

const header = () => Uint8Array.from([1, 0, 0, 0, 14, 0, 0, 8, 16, 0, 11, 0, 0x9a, 0])
const container = (stream: number[]) => Buffer.concat([Buffer.from('FluidSIM CT test\r\nCOMPRESS\r\n'), Buffer.from([...header(), ...stream].map(b => b ^ 0x9a))])
const literalCt = (text: string) => {
  const data = Buffer.from(text, 'latin1')
  const stream: number[] = []
  for (let i = 0; i < data.length; i += 127) stream.push(128 + Math.min(127, data.length - i), ...data.subarray(i, i + 127))
  return container(stream)
}
// Synthetic native records, deliberately stale O labels: links use ordered
// indices. These are not copies of the user's circuit or vendor libraries.
const record = (kind: string, label: number, x: number, y: number, w = 20, h = 20) => `${kind} O${label} ${x} ${y} ${x + w} ${y + h} 0 0 3\n`
const fixture = 'BEGIN_FSPREVIEW\nEND_FSPREVIEW\n' +
  record('GRAPHRECT', 90, 0, 0) + ' S graph_type I 1\n S NAME S 0\n S mod_flag I 1\n' +
  record('GConnection', 91, 9, -1, 2, 2) + record('GConnection', 92, 9, 19, 2, 2) + record('GConnection', 93, 19, 9, 2, 2) +
  record('GRAPHRECT', 100, 0, 30) + ' S graph_type I 3\n S COND S I1\n S mod_flag I 0\n' +
  record('GConnection', 101, 9, 29, 2, 2) + record('GConnection', 102, 9, 49, 2, 2) +
  record('GRAPHRECT', 110, 0, 60) + ' S graph_type I 1\n S NAME S 10\n S mod_flag I 0\n' +
  record('GConnection', 111, 9, 59, 2, 2) + record('GConnection', 112, 9, 79, 2, 2) + record('GConnection', 113, 19, 69, 2, 2) +
  record('GRAPHRECT', 120, 40, 0) + ' S graph_type I 2\n S VAR S Q1\n S ACTION_DESCR S Saída de teste\n S mod_flag I 10240\n' +
  record('GConnection', 121, 49, 19, 2, 2) + record('GConnection', 122, 49, -1, 2, 2) + record('GConnection', 123, 59, 9, 2, 2) + record('GConnection', 124, 39, 9, 2, 2) +
  '0 0 0 # 0 0 0 0 0 0\n' +
  'gate1 # 0 1\ngate2 # 0 2\ngate3 # 0 3\n' +
  'gate1 # 4 5\ngate2 # 4 6\n' +
  'gate1 # 7 8\ngate2 # 7 9\ngate3 # 7 10\n' +
  'gate1 # 11 12\ngate2 # 11 13\ngate3 # 11 14\ngate4 # 11 15\n' +
  'CON GLine 2 5\nCON GLine 6 8\nCON GLine 3 15\nENDCT\nBEGINDSD\nENDDSD\nBEGINSYM\nENDSYM\n'
const offsetDiagram = (text: string, dx: number) => {
  const indexOffset = (text.match(/^\w+ O\d+ /gm) ?? []).length
  return text
    .replace(/^(\w+ O)(\d+ )(-?\d+) (-?\d+) (-?\d+) (-?\d+)(.*)$/gm,
      (_, prefix: string, label: string, x1: string, y1: string, x2: string, y2: string, suffix: string) => `${prefix}${+label.trim() + indexOffset} ${+x1 + dx} ${y1} ${+x2 + dx} ${y2}${suffix}`)
    .replace(/^(gate\d+ # )(\d+) (\d+)$/gm, (_, prefix: string, owner: string, port: string) => `${prefix}${+owner + indexOffset} ${+port + indexOffset}`)
    .replace(/^(CON GLine )(\d+) (\d+)$/gm, (_, prefix: string, a: string, b: string) => `${prefix}${+a + indexOffset} ${+b + indexOffset}`)
}

let checks = 0
const check = (name: string, action: () => void) => { action(); checks++; console.log(`PASS — ${name}`) }
check('literal, cópia do dicionário e repetição RLE', () => {
  const stream = [0x83, 97, 98, 99, 0x08, 0x07, 3, 0, 3, 120]
  assert.equal(Buffer.from(expandFluidSim4(container(stream))).toString(), 'abcabcxxx')
})
check('semente PREVIEW', () => assert.equal(Buffer.from(expandFluidSim4(container([0x30, 0]))).toString(), 'PREVIEW'))
check('registos nativos, nomes, topologia e ação associada', () => {
  const result = importFluidSim4(literalCt(fixture))
  assert.deepEqual(result.program.steps.map(s => [s.name, s.initial]), [['0', true], ['10', false]])
  assert.deepEqual(result.program.transitions?.map(t => [t.from, t.to, t.condition]), [[['fs4-step-0'], ['fs4-step-7'], 'I1']])
  assert.equal(result.program.steps[0].actions?.[0].variable, 'Q1')
  assert.equal(result.program.steps[0].actions?.[0].description, 'Saída de teste')
  assert.equal(result.warnings.length, 0)
})
check('ligação por referência ao número original', () => {
  const text = fixture.replace(' S COND S I1', ' S COND S I1\n S LINK S 10').replace('CON GLine 6 8\n', '')
  const t = parseFluidSim4Text(text).program.transitions![0]
  assert.deepEqual(t.to, ['fs4-step-7']); assert.equal(t.wireless, true)
})
check('condição OR simbólica sem espaços é normalizada', () => {
  assert.equal(parseFluidSim4Text(fixture.replace(' S COND S I1', ' S COND S a+NOT b')).program.transitions![0].condition, 'a + NOT b')
})
check('espaços repetidos em torno do OR são normalizados', () => {
  assert.equal(parseFluidSim4Text(fixture.replace(' S COND S I1', ' S COND S a  +   b')).program.transitions![0].condition, 'a + b')
})
check('referências externas são preservadas e reportadas', () => {
  const result = parseFluidSim4Text(fixture.replace(' S COND S I1', ' S COND S G2X125'))
  assert.equal(result.program.transitions![0].condition, 'G2X125'); assert.match(result.warnings[0], /G2X125/)
})
check('destino inexistente é rejeitado', () => assert.throws(() => parseFluidSim4Text(fixture.replace('CON GLine 6 8', 'CON GLine 6 999')), /inexistente/))
check('ligação incompleta é rejeitada', () => assert.throws(() => parseFluidSim4Text(fixture.replace('CON GLine 6 8\n', '')), /incompletas/))
check('nomes repetidos no mesmo GRAFCET são rejeitados', () => assert.throws(() => parseFluidSim4Text(fixture.replace(' S NAME S 10', ' S NAME S 0')), /repetido/))
check('diagramas separados com etapas de mesmo nome são importados em páginas distintas', () => {
  const body = fixture.slice('BEGIN_FSPREVIEW\nEND_FSPREVIEW\n'.length, fixture.indexOf('ENDCT\n'))
  const result = parseFluidSim4Text(`${body}${offsetDiagram(body, 50000)}ENDCT\nBEGINDSD\nENDDSD\nBEGINSYM\nENDSYM\n`)
  assert.equal(result.program.charts?.length, 2)
  assert.equal(result.program.steps.length, 4)
  assert.equal(new Set(result.program.steps.map(s => s.chart)).size, 2)
  assert.equal(result.program.transitions?.length, 2)
  assert.equal(result.warnings.length, 0)
})
check('sincronização desconhecida não é convertida em sequência', () => assert.throws(() => parseFluidSim4Text(fixture.replace(' S graph_type I 3', ' S graph_type I 4')), /não suportado/))
check('ação memorizada não é convertida em ação contínua', () => assert.throws(() => parseFluidSim4Text(fixture.replace(' S mod_flag I 10240', ' S mod_flag I 10368')), /memorizada/))
check('dados truncados e parâmetros inválidos são rejeitados', () => {
  assert.throws(() => expandFluidSim4(container([0x85, 65])), /truncado/)
  assert.throws(() => expandFluidSim4(container([0])), /truncado/)
  assert.throws(() => importFluidSim4(literalCt(fixture.slice(0, -60))), /incompleta/)
  assert.throws(() => expandFluidSim4(Uint8Array.of(0, 1, 2)), /não reconhecido/)
})
const fakeFile = (name: string, content: Uint8Array) => ({ name, size: content.length, arrayBuffer: async () => Uint8Array.from(content).buffer })
await assert.rejects(() => readGrafcetFile({ name: 'large.ct', size: MAX_GRAFCET_IMPORT_BYTES + 1, arrayBuffer: async () => { throw new Error('must not read') } }), /5 MB/)
await assert.rejects(() => readGrafcetFile(fakeFile('bad.json', Buffer.from('{"steps":[null]}'))), /estrutura das etapas/)
const native = await readGrafcetFile(fakeFile('teste.ct', literalCt(fixture)))
assert.equal(native.source, 'fluidsim4'); assert.equal(native.program.name, 'teste')
const json = await readGrafcetFile(fakeFile('teste.json', Buffer.from(JSON.stringify(native.program))))
assert.deepEqual(json.program, native.program)
checks += 4

if (process.argv[2]) {
  const result = importFluidSim4(readFileSync(process.argv[2]))
  const names = new Map(result.program.steps.map(s => [s.id, s.name]))
  assert.deepEqual(result.program.steps.map(s => s.name), ['1', '5', '7', '3', '6'])
  assert.equal(result.program.steps.filter(s => s.initial).length, 1)
  assert.equal(result.program.steps.flatMap(s => s.actions ?? []).length, 7)
  assert.deepEqual(result.program.transitions?.map(t => [names.get(t.from[0]), names.get(t.to[0])]), [['1','5'],['5','6'],['5','7'],['7','5'],['1','3'],['3','1'],['6','1']])
  assert.match(result.program.transitions![4].condition, /NOT fc_ao \+ NOT fc_bo/)
  assert.equal(result.program.steps.find(s => s.name === '6')!.actions![0].condition, 'NOT 1Hz')
  assert.match(result.warnings.join('\n'), /G2X125/)
  console.log('PASS — exemplo fornecido: 5 etapas, 7 transições, 7 ações, ligações e condições recuperadas')
  checks++
}
console.log(`${checks} verificações de importação FluidSIM passaram.`)
