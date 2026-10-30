import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { emptyGrafcetRuntime, scanGrafcet, forceSteps, fireTransition, validateGrafcet } from '../src/grafcet/engine'
import { grafcetToLadder } from '../src/grafcet/toLadder'
import { grafcetToLadderWord } from '../src/grafcet/toLadderWord'
import { expandFluidSim4, importFluidSim4, normalizeFluidSimCondition, normalizeFluidSimVariable, parseFluidSim4Text } from '../src/grafcet/fluidSim4'
import { validCondition } from '../src/grafcet/engine'
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
  assert.equal(parseFluidSim4Text(fixture.replace(' S COND S I1', ' S COND S a+NOT b')).program.transitions![0].condition, 'a + /b')
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
check('símbolos espelhados (FLIPPED 2) mantêm o sentido de cima para baixo', () => {
  // As portas 1/2 ficam trocadas no desenho: a entrada passa a ser a porta 2 (em cima).
  const flipped = fixture
    .replace('gate1 # 0 1\ngate2 # 0 2', 'gate1 # 0 2\ngate2 # 0 1')
    .replace('gate1 # 4 5\ngate2 # 4 6', 'gate1 # 4 6\ngate2 # 4 5')
    .replace('gate1 # 7 8\ngate2 # 7 9', 'gate1 # 7 9\ngate2 # 7 8')
    .replace(/ S mod_flag I (0|1)\n/g, ' S mod_flag I $1\n S FLIPPED I 2\n')
  const t = parseFluidSim4Text(flipped).program.transitions![0]
  assert.deepEqual([t.from, t.to], [['fs4-step-0'], ['fs4-step-7']])
})
check('ficheiro misto: pré-visualização binária, circuito elétrico e símbolos são ignorados', () => {
  const extra = record('E_K001', 200, 9000, 0, 30, 30) + ' S dxf_prim_list V 0\n F label_pos x_offset I 0\n' +
    record('EConnection', 201, 9010, -5, 10, 10) + 'L 5 5 -5 -40\n S description S A1\n' +
    record('text', 202, -10, -40, 20, 16) + ' S text S Q1\n S height I 16\n S font_name S Arial Black\n' +
    record('DDEInput', 203, 9500, 0, 100, 60) + ' S OPC_ITEM S EasyPort1.InputPort1\n'
  const body = fixture.slice('BEGIN_FSPREVIEW\nEND_FSPREVIEW\n'.length)
    .replace('0 0 0 # 0 0 0 0 0 0\n', extra + '0 0 0 # 0 0 0 0 0 0\n')
    .replace('CON GLine 3 15\n', 'CON GLine 3 15\ngate1 # 16 17\nCON ELine 17 19\n S COLOR I 0\n')
    .replace('BEGINSYM\nENDSYM\n', 'BEGINSYM\nSYM 0\n1 0 0 10 10\n7 5 5 24 1 3 0 0 FluidSIM In\nENDSYM\n')
  const wmf = Buffer.from([0xd7, 0xcd, 0x0a, 0x0d, 0x00, 0x1a])
  const size = Buffer.alloc(4); size.writeUInt32LE(wmf.length)
  const text = Buffer.concat([Buffer.from(`PREVIEW ${wmf.length}\r\n`), size, wmf, Buffer.from('\r\nENDPREVIEW\r\n'), Buffer.from(body.replace(/\n/g, '\r\n'), 'latin1')])
  const data: number[] = []
  for (let i = 0; i < text.length; i += 127) data.push(128 + Math.min(127, text.length - i), ...text.subarray(i, i + 127))
  const result = importFluidSim4(container(data))
  assert.equal(result.program.steps.length, 2); assert.equal(result.program.transitions!.length, 1)
  assert.match(result.warnings.join('\n'), /não são GRAFCET \(DDEInput, E_K001\)/)
  assert.deepEqual(result.program.comments!.map(c => [c.text, c.fontWeight]), [['Q1', '700']])
  assert.ok(result.program.comments!.every(c => c.y >= 0), 'o título acima da etapa inicial não fica com y negativo')
})
check('condições: NOT → /, espaços em + e *, AND/OR → * e +', () => {
  const cases: Array<[string, string]> = [
    ['(SappelN1+SenvoiN1)*SfdcPF', '(SappelN1 + SenvoiN1) * SfdcPF'],
    ['NOT a*NOT(b+c)', '/a * /(b + c)'],
    ['a AND NOT b OR c', 'a * /b + c'],
    ['a+!b', 'a + /b'],
    ['  x  *y ', 'x * y'],
    ['5s/X3 * NOT b', '5s/X3 * /b'],
    ['a * ( b+c )', 'a * (b + c)'],
    ['', '1'],
  ]
  for (const [input, expected] of cases) { assert.equal(normalizeFluidSimCondition(input), expected); assert.ok(validCondition(expected), expected) }
})
check('variáveis de ação passam ao formato aceite pelo simulador', () => {
  assert.equal(normalizeFluidSimVariable('Q_Monter'), 'Q_Monter')
  assert.equal(normalizeFluidSimVariable('Motor Subir'), 'Motor_Subir')
  assert.equal(normalizeFluidSimVariable('Válvula-1'), 'Valvula_1')
  assert.equal(normalizeFluidSimVariable('1A+'), 'V1A+')
  const result = parseFluidSim4Text(fixture.replace(' S VAR S Q1', ' S VAR S Motor Subir'))
  assert.equal(result.program.steps[0].actions![0].variable, 'Motor_Subir')
  assert.match(result.warnings.join('\n'), /Motor Subir.*Motor_Subir/)
})
check('o retorno segue o percurso desenhado no FluidSIM (pontos de quebra)', () => {
  const U = 1024
  type P = { x: number; y: number }
  const port = (label: number, c: P) => record('GConnection', label, (c.x - 5) * U, (c.y - 5) * U, 10 * U, 10 * U)
  const L = (owner: P, a: P, b: P) => `L ${(a.x - owner.x + 5) * U} ${(a.y - owner.y + 5) * U} ${(b.x - owner.x - 5) * U} ${(b.y - owner.y - 5) * U}\n`
  const route: P[] = [{ x: 18, y: 144 }, { x: 18, y: 160 }, { x: -30, y: 160 }, { x: -30, y: -16 }, { x: 18, y: -16 }, { x: 18, y: 0 }]
  const text =
    record('GRAPHRECT', 1, 0, 0, 36 * U, 36 * U) + ' S graph_type I 1\n S NAME S 1\n S mod_flag I 1\n' + port(2, { x: 18, y: 0 }) + port(3, { x: 18, y: 36 }) +
    record('GRAPHRECT', 4, 6 * U, 36 * U, 24 * U, 36 * U) + ' S graph_type I 3\n S COND S a\n S mod_flag I 0\n' + port(5, { x: 18, y: 36 }) + port(6, { x: 18, y: 72 }) +
    record('GRAPHRECT', 7, 0, 72 * U, 36 * U, 36 * U) + ' S graph_type I 1\n S NAME S 2\n S mod_flag I 0\n' + port(8, { x: 18, y: 72 }) + port(9, { x: 18, y: 108 }) +
    record('GRAPHRECT', 10, 6 * U, 108 * U, 24 * U, 36 * U) + ' S graph_type I 3\n S COND S b\n S mod_flag I 0\n' + port(11, { x: 18, y: 108 }) +
    port(12, route[0]) + route.slice(1).map((p, i) => L(route[0], route[i], p)).join('') +
    '0 0 0 # 0 0 0 0 0 0\n' +
    'gate1 # 0 1\ngate2 # 0 2\ngate1 # 3 4\ngate2 # 3 5\ngate1 # 6 7\ngate2 # 6 8\ngate1 # 9 10\ngate2 # 9 11\nCON GLine 11 1\nENDCT\n'
  const result = parseFluidSim4Text(text)
  const back = result.program.transitions!.find(t => t.condition === 'b')!
  assert.deepEqual([result.program.steps.find(s => s.id === back.from[0])!.name, result.program.steps.find(s => s.id === back.to[0])!.name], ['2', '1'])
  assert.deepEqual(result.program.linkBends?.[back.id], [{ x: 200, y: 320 }, { x: 128, y: 320 }, { x: 128, y: 56 }, { x: 200, y: 56 }])
  assert.equal(Object.keys(result.program.linkBends ?? {}).length, 1, 'ligações diretas não recebem pontos de quebra')
})
const fakeFile = (name: string, content: Uint8Array) => ({ name, size: content.length, arrayBuffer: async () => Uint8Array.from(content).buffer })
check('desenho editável preserva ligações incompletas e referências inexistentes', () => {
  const incomplete = fixture.replace('CON GLine 2 5\n', '')
  const result = parseFluidSim4Text(incomplete, 'drawing')
  assert.equal(result.program.transitions![0].from.length, 0)
  assert.equal(result.program.transitions![0].to.length, 1)
  assert.ok(result.program.importReview)
  const missing = parseFluidSim4Text(fixture.replace(' S COND S I1', ' S LINK S 999\n S COND S I1').replace('CON GLine 6 8\n', ''), 'drawing')
  assert.equal(missing.program.transitions![0].targetInfo, '999')
  assert.deepEqual(missing.program.transitions![0].to, [])
  assert.match(missing.warnings.join(), /999/)
})
check('desenho editável mantém os gráficos lado a lado e os números originais', () => {
  const body = fixture.slice('BEGIN_FSPREVIEW\nEND_FSPREVIEW\n'.length, fixture.indexOf('ENDCT\n'))
  const twice = body + offsetDiagram(body, 400000) + 'ENDCT\n'
  const result = parseFluidSim4Text(twice, 'drawing')
  assert.equal(result.program.steps.length, 4)
  assert.ok(!result.program.charts?.length)
  assert.equal(result.program.steps.filter(s => s.name === '0').length, 2)
  assert.ok(result.program.steps[2].x! > result.program.steps[0].x! + 500)
  assert.match(result.warnings.join(), /repetido/)
})
check('todos os textos soltos viram texto livre editável, incluindo notas afastadas', () => {
  const texts = record('text', 200, 3000000, 60000) + ' S text S Nota afastada\n S font_name S Arial\n S height I 16\n S style I 1\n' + record('text', 201, 3000000, 90000) + ' S text S Titulo\n S font_name S Arial\n S height I 21\n S style I 3\n'
  const source = fixture.replace('0 0 0 #', texts + '0 0 0 #')
  assert.equal(parseFluidSim4Text(source).program.comments!.length, 0)
  const result = parseFluidSim4Text(source, 'drawing')
  assert.deepEqual(result.program.comments!.map(c => [c.text, c.fontWeight, c.fontSize]), [['Nota afastada', '400', 16], ['Titulo', '700', 21]])
  assert.ok(result.program.comments![0].x > 4000)
})
check('rascunho bloqueia execução, forçagem e geração de Ladder até concluir a revisão', () => {
  const result = parseFluidSim4Text(fixture, 'drawing')
  const runtime = { ...emptyGrafcetRuntime(), active: [result.program.steps[0].id], owned: ['Q1'] }
  const table = { Q1: true, I1: true }
  assert.deepEqual(scanGrafcet(result.program, runtime, table).active, [])
  assert.equal(table.Q1, false)
  assert.deepEqual(forceSteps(result.program, runtime, [result.program.steps[0].id]).active, [])
  assert.equal(fireTransition(result.program, runtime, result.program.transitions![0].id), null)
  assert.ok(validateGrafcet(result.program).some(i => i.id === 'import-review' && i.level === 'error'))
  assert.throws(() => grafcetToLadder(result.program), /revisão/)
  assert.throws(() => grafcetToLadderWord(result.program), /revisão/)
  const reviewed = { ...result.program, importReview: undefined }
  assert.ok(!validateGrafcet(reviewed).some(i => i.id === 'import-review'))
  assert.deepEqual(scanGrafcet(reviewed, emptyGrafcetRuntime(), { I1: true }).active, [reviewed.steps[1].id])
  assert.throws(() => parseFluidSim4Text(fixture.replace('gate1 # 0 1', 'gate1 # 999 1'), 'drawing'), /porta inválida/)
})
await assert.rejects(() => readGrafcetFile({ name: 'large.ct', size: MAX_GRAFCET_IMPORT_BYTES + 1, arrayBuffer: async () => { throw new Error('must not read') } }), /5 MB/)
await assert.rejects(() => readGrafcetFile(fakeFile('bad.json', Buffer.from('{"steps":[null]}'))), /estrutura das etapas/)
const native = await readGrafcetFile(fakeFile('teste.ct', literalCt(fixture)))
assert.equal(native.source, 'fluidsim4'); assert.equal(native.program.name, 'teste')
const json = await readGrafcetFile(fakeFile('teste.json', Buffer.from(JSON.stringify(native.program))))
assert.deepEqual(json.program, native.program)
const draft = await readGrafcetFile(fakeFile('desenho.ct', literalCt(fixture)), 'drawing')
const draftJson = await readGrafcetFile(fakeFile('desenho.grafcet', Buffer.from(JSON.stringify(draft.program))))
assert.deepEqual(draftJson.program, draft.program, 'exportar/reabrir mantém a revisão pendente')
await assert.rejects(() => readGrafcetFile(fakeFile('bad-review.json', Buffer.from(JSON.stringify({ ...draft.program, importReview: { source: 'fluidsim4', warnings: [42] } })))), /revisão da importação/)
checks += 4

if (process.argv[2]) {
  const result = importFluidSim4(readFileSync(process.argv[2]))
  const names = new Map(result.program.steps.map(s => [s.id, s.name]))
  assert.deepEqual(result.program.steps.map(s => s.name), ['1', '5', '7', '3', '6'])
  assert.equal(result.program.steps.filter(s => s.initial).length, 1)
  assert.equal(result.program.steps.flatMap(s => s.actions ?? []).length, 7)
  assert.deepEqual(result.program.transitions?.map(t => [names.get(t.from[0]), names.get(t.to[0])]), [['1','5'],['5','6'],['5','7'],['7','5'],['1','3'],['3','1'],['6','1']])
  assert.match(result.program.transitions![4].condition, /\/fc_ao \+ \/fc_bo/)
  assert.equal(result.program.steps.find(s => s.name === '6')!.actions![0].condition, '/1Hz')
  assert.match(result.warnings.join('\n'), /G2X125/)
  console.log('PASS — exemplo fornecido: 5 etapas, 7 transições, 7 ações, ligações e condições recuperadas')
  checks++
}
if (process.env.FLUIDSIM_MONTA_CARGA) {
  // Amostra real (GRAFCET + circuito elétrico EasyPort), mantida fora do repositório.
  const result = importFluidSim4(readFileSync(process.env.FLUIDSIM_MONTA_CARGA))
  const names = new Map(result.program.steps.map(s => [s.id, s.name]))
  assert.deepEqual(result.program.transitions?.map(t => [names.get(t.from[0]), names.get(t.to[0]), t.condition]), [
    ['1', '5', '(SappelN1 + SenvoiN1) * SfdcPF'], ['5', '10', 'FdcN2'], ['10', '15', '(SappelN1 + SenvoiN1) * SfdcPF'], ['15', '1', 'FdcN1']])
  assert.deepEqual(result.program.steps.map(s => [s.name, s.initial, s.actions!.map(a => a.variable).join()]), [['1', true, ''], ['5', false, 'Q_Monter'], ['10', false, ''], ['15', false, 'Q_Descendre']])
  const back = result.program.transitions![3]
  const bends = result.program.linkBends?.[back.id] ?? []
  const s15 = result.program.steps[3], s1 = result.program.steps[0]
  assert.equal(bends.length, 4); assert.ok(bends[1].x < s1.x! - 50 && bends[0].y > s15.y! + 54 && bends[3].y < s1.y!, 'retorno pela esquerda, por baixo de 15 e por cima de 1')
  assert.deepEqual(result.program.comments?.map(c => c.text), ['Q1'])
  assert.match(result.warnings.join('\n'), /não são GRAFCET/)
  console.log('PASS — Monta-Carga: 1→5→10→15→1, ações Q_Monter/Q_Descendre, retorno desenhado e título Q1')
  checks++
}
if (process.env.FLUIDSIM_ATEC_SAMPLE) {
  const result = importFluidSim4(readFileSync(process.env.FLUIDSIM_ATEC_SAMPLE), 'drawing')
  assert.equal(result.program.steps.length, 34)
  assert.equal(result.program.transitions!.length, 40)
  assert.equal(result.program.steps.flatMap(s => s.actions ?? []).length + result.program.freeActions!.length, 30)
  assert.equal(result.program.comments!.length, 16)
  assert.equal(result.program.steps.filter(s => s.name === '135').length, 2)
  assert.ok(result.program.transitions!.some(t => t.targetInfo === '51' && !t.to.length))
  assert.ok(result.program.comments!.some(c => c.text === 'G0 - Grafcet Controlo'))
  assert.ok(result.program.comments!.some(c => c.text === 'G1 - Grafcet Funcionamento'))
  assert.ok(result.program.comments!.some(c => c.text === 'G2 - Grafcet Reset'))
  assert.ok(result.program.comments!.some(c => c.text === '"Fim do Reset"'))
  assert.ok(result.program.steps.flatMap(s => s.actions ?? []).some(a => a.variable === 'Y7_E+_Vacuo_On'))
  assert.ok(result.program.importReview)
  console.log('PASS — ATEC: 34 etapas, 40 transições, 30 ações e 16 textos; números e referências por completar preservados')
  checks++
}
if (process.env.FLUIDSIM_EXTRA_SAMPLE) {
  const samplePath = process.env.FLUIDSIM_EXTRA_SAMPLE
  const sample = readFileSync(samplePath)
  const expectedError = process.env.FLUIDSIM_EXTRA_EXPECT_ERROR
  if (expectedError) {
    assert.throws(() => importFluidSim4(sample), new RegExp(expectedError))
    console.log('PASS — ' + samplePath + ': recusa explícita esperada (' + expectedError + ')')
  } else {
    const result = importFluidSim4(sample)
    const counts = {
      steps: result.program.steps.length,
      transitions: result.program.transitions?.length ?? 0,
      actions: result.program.steps.flatMap(step => step.actions ?? []).length,
      charts: result.program.charts?.length ?? 1,
    }
    for (const [key, value] of Object.entries(counts)) {
      const expected = process.env['FLUIDSIM_EXTRA_EXPECT_' + key.toUpperCase()]
      if (expected) assert.equal(value, Number(expected), 'contagem de ' + key)
    }
    console.log('PASS — ' + samplePath + ': ' + counts.steps + ' etapas, ' + counts.transitions + ' transições, ' + counts.actions + ' ações, ' + counts.charts + ' páginas')
  }
  checks++
}

console.log(`${checks} verificações de importação FluidSIM passaram.`)
