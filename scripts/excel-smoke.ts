import assert from 'node:assert/strict'
import { buildWorkbookBuffer, readWorkbookBuffer } from '../src/excel/sheetIO'
import { compareTags, mergeTags, parseTagSheets, tagTemplateSheets, tagsToSheet } from '../src/excel/tagSheet'
import { componentRowsToSheets, componentTemplateSheets, componentToRow, parseComponentSheets, planComponentRows, reduceToChanges, resolveComponentType } from '../src/excel/componentSheet'
import { createComponent } from '../src/electrical/factory'
import type { LadderTag } from '../src/types'

let counter = 0
const id = () => `n${++counter}`
const tag = (address: string, name = address, dataType: LadderTag['dataType'] = 'Bool', comment = ''): LadderTag => ({ id: `t-${address}`, address, name, dataType, comment })

// --- Tags: ida e volta pelo .xlsx ------------------------------------------------------
const tags = [tag('Q2', 'Lampada'), tag('I1', 'Start', 'Bool', 'Botão NA'), tag('T1', 'Atraso', 'Time'), tag('M10')]
const roundTrip = parseTagSheets(await readWorkbookBuffer(await buildWorkbookBuffer([tagsToSheet(tags)])))
assert.deepEqual(roundTrip.tags.map((t) => t.address), ['I1', 'Q2', 'M10', 'T1'], 'ordem I, Q, M, T')
assert.equal(roundTrip.tags[0].comment, 'Botão NA')
assert.equal(roundTrip.tags[3].dataType, 'Time')
assert.equal(roundTrip.issues.filter((i) => i.level === 'error').length, 0)

// --- Tags: o modelo descarregado é importável e tem instruções ---------------------------
const template = parseTagSheets(await readWorkbookBuffer(await buildWorkbookBuffer(tagTemplateSheets())))
assert.ok(template.tags.length >= 5)
assert.ok(template.issues.every((i) => i.level !== 'error'))

// --- Tags: cabeçalhos alternativos, %, minúsculas, vírgulas e erros ------------------------
const messy = parseTagSheets([{ name: 'Folha1', rows: [['título solto'], ['Operando', 'Symbol', 'Data Type', 'Descrição'], ['%i1', 'Start', 'bool', 'x'], ['q 3', 'Motor', 'inteiro', ''], ['X9', 'mau', '', ''], ['I1', 'Start2', 'Real', ''], ['', '', '', '']] }])
assert.deepEqual(messy.tags.map((t) => t.address), ['I1', 'Q3'])
assert.equal(messy.tags[0].name, 'Start2', 'a última linha repetida prevalece')
assert.equal(messy.tags[1].dataType, 'Int')
assert.ok(messy.issues.some((i) => i.level === 'error' && i.row === 5), 'endereço inválido assinalado na linha 5')
assert.ok(messy.issues.some((i) => /repetido/.test(i.message)))
assert.equal(parseTagSheets([{ name: 'X', rows: [['a', 'b'], ['1', '2']] }]).issues.some((i) => i.level === 'error'), true)

// --- Tags: restrição do GRAFCET (só bits I/Q/M) ------------------------------------------
const restricted = parseTagSheets([{ name: 'S', rows: [['Endereço', 'Tipo'], ['I1', 'Bool'], ['T1', 'Time'], ['M5', 'Int'], ['Q100', '']] }], { restrict: (t) => (t.dataType === 'Bool' && /^[IQM]\d{1,2}$/.test(t.address) ? null : 'fora do âmbito') })
assert.deepEqual(restricted.tags.map((t) => t.address), ['I1'])

// --- Tags: juntar vs substituir -----------------------------------------------------------
const current = [tag('I1', 'Antigo', 'Bool', 'nota'), tag('Q1'), tag('T1', 'Tempo', 'Time')]
const incoming = parseTagSheets([{ name: 'S', rows: [['Endereço', 'Nome', 'Comentário'], ['I1', 'Novo', ''], ['I2', 'Dois', 'c']] }]).tags
const merged = mergeTags(current, incoming, 'merge', id)
assert.deepEqual([merged.added, merged.updated, merged.removed], [1, 1, 0])
assert.equal(merged.tags.find((t) => t.address === 'I1')!.id, 't-I1', 'mantém o id ao atualizar')
assert.equal(merged.tags.find((t) => t.address === 'I1')!.comment, 'nota', 'comentário vazio não apaga o existente')
assert.equal(merged.tags.length, 4)
const replaced = mergeTags(current, incoming, 'replace', id)
assert.deepEqual(replaced.tags.map((t) => t.address), ['I1', 'I2'])
assert.equal(replaced.removed, 2)
assert.deepEqual([...current].sort(compareTags).map((t) => t.address), ['I1', 'Q1', 'T1'])
assert.equal(mergeTags(current, parseTagSheets(await readWorkbookBuffer(await buildWorkbookBuffer([tagsToSheet(current)]))).tags, 'merge', id).updated, 0, 'reimportar sem editar não altera nada')

// --- Componentes -----------------------------------------------------------------------------
assert.equal(resolveComponentType('contactorWegCWC09'), 'contactorWegCWC09')
assert.equal(resolveComponentType('CONTACTORWEGCWC09'), 'contactorWegCWC09')
assert.equal(resolveComponentType('tipo-inexistente'), null)

const km = createComponent('contactorWegCWC09', 'KM1', 'Principal', 0, 900, 600)
const din = createComponent('dinRail15x55', 'DIN1', 'Calha', 1, 700, 300)
const existing = [km, din]
const sheets = await readWorkbookBuffer(await buildWorkbookBuffer(componentRowsToSheets(existing.map((c) => componentToRow(c, existing)))))
const parsed = parseComponentSheets(sheets)
assert.equal(parsed.rows.length, 2)
assert.equal(parsed.issues.filter((i) => i.level === 'error').length, 0)
const unchanged = reduceToChanges(planComponentRows(parsed.rows, existing).items, existing)
assert.equal(unchanged.items.length, 0, 'exportar e reimportar sem editar não altera nenhum componente')
assert.equal(unchanged.unchanged, 2)

const edited = parseComponentSheets([{ name: 'Componentes', rows: [
  ['Ref', 'Tipo', 'Nome', 'X (mm)', 'Y (mm)', 'Rotação', 'Bloqueado', 'Calha', 'Posição na calha (mm)'],
  ['KM1', 'Contator qualquer', 'Renomeado', '10,5', '20', '90', 'sim', '', ''],
  ['', 'contactorWegCWC09', 'Novo', '', '', '', '', 'DIN1', '30'],
  ['S9', 'nao-existe', '', '', '', '', '', '', ''],
  ['KM1', 'contactorWegCWC09', 'duplicado', '', '', '', '', '', ''],
  ['QF5', 'breaker3p', '', '5', '', '45', '', 'DINX', ''],
] }])
const plan = planComponentRows(edited.rows, existing)
const created = plan.items.filter((i) => i.action === 'create')
assert.equal(plan.items.find((i) => i.ref === 'KM1')?.action, 'update')
assert.equal(created.length, 2)
assert.equal(plan.items.find((i) => i.ref === 'KM1')?.type, 'contactorWegCWC09', 'o tipo de um existente é preservado')
assert.ok(created.some((i) => /^KM\d+$/.test(i.ref) && i.ref !== 'KM1'), 'ref vazia recebe uma ref automática')
assert.ok(plan.issues.some((i) => i.level === 'error' && /repetida/.test(i.message)))
const qf = plan.items.find((i) => i.ref === 'QF5')!
assert.equal(qf.rotation, null, 'rotação inválida ignorada')
assert.equal(qf.rail, '', 'calha inexistente ignorada')
assert.equal(qf.xMm, null, 'X sem Y ignorado')
assert.equal(plan.items.find((i) => i.rail === 'DIN1')?.railOffsetMm, 30)
const reduced = reduceToChanges(plan.items, existing)
assert.equal(reduced.items.find((i) => i.ref === 'KM1')?.label, 'Renomeado')
assert.ok(componentTemplateSheets().length === 3)
console.log('excel-smoke: OK')
