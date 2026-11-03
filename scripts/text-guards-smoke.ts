/** Textos livres «Gk <> Xn» do projeto ATEC → condição «Só se» das transições (reconstrói o projeto antigo a partir do exemplo). */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { applyTextGuards, guardErrors, removeTextGuardComments, scanTextGuards } from '../src/grafcet/textGuards'
import { receptivityOf, validateGrafcet, type GrafcetProgram } from '../src/grafcet/engine'

let checks = 0
const check = (condition: unknown, message: string) => { assert.ok(condition, message); checks++; console.log(`PASS — ${message}`) }

const original = JSON.parse(fs.readFileSync(new URL('../examples/grafcet-atec-com-manuais.json', import.meta.url), 'utf-8')).grafcet as GrafcetProgram & { charts?: unknown }
const expected = new Map((original.transitions ?? []).filter((t) => t.guard).map((t) => [t.id, t.guard!]))
check(expected.size === 8, 'o exemplo tem 8 transições-fonte com condição de estado (3 do G0–G2 e 5 manuais)')

// Projeto «antigo»: uma só página, sem guards, com as comparações como textos livres 44 unidades acima da barra.
const old: GrafcetProgram = JSON.parse(JSON.stringify(original))
delete (old as any).charts; delete (old as any).activeChart
for (const s of old.steps) delete (s as any).chart
const oldComments = [...(old.comments ?? [])]
old.transitions = (old.transitions ?? []).map((t) => { const c = { ...t }; delete (c as any).chart; if (c.guard) { oldComments.push({ id: `txt-${t.id}`, text: c.guard.replace('<>', '<>'), x: t.x ?? 0, y: (t.y ?? 0) - 44 }); delete c.guard } return c })
old.comments = oldComments

const scan = scanTextGuards(old)
check(scan.matches.length === 8, `encontra os 8 textos de comparação (${scan.matches.length})`)
check(scan.unmatched.length === 0, 'não sobra nenhum texto sem transição')
check(scan.matches.every((m) => m.source && !m.applied), 'todos são transições-fonte e ainda não aplicados')
check(scan.matches.every((m) => expected.get(m.transitionId) === m.guard), 'cada texto aponta para a transição certa, com a condição certa (ex.: G4 <> X159 → T5 do G4)')
check(scanTextGuards({ ...old, comments: (old.comments ?? []).filter((c) => !c.id.startsWith('txt-')) }).matches.length === 0, 'títulos e legendas («G0 - Grafcet Controlo», «Maquina Parada») não são tratados como condições')

const before = validateGrafcet(old).filter((i) => i.level === 'error').length
const applied = applyTextGuards(old, scan.matches)
check([...expected].every(([id, guard]) => applied.transitions!.find((t) => t.id === id)!.guard === guard), 'fase 1: as condições ficam nas transições')
check((applied.comments ?? []).length === (old.comments ?? []).length, 'fase 1: os textos ainda não foram removidos (para conferir)')
check(guardErrors(applied) === 0, 'as condições aplicadas são válidas')
check(validateGrafcet(applied).filter((i) => i.level === 'error').length <= before, 'a validação não ganha erros')
check(receptivityOf(applied.transitions!.find((t) => t.id === 'man-G4-t5')!) === 'G0X9 * G4 <> X159', 'a receptividade avaliada é «G0X9 * G4 <> X159»')
check(scanTextGuards(applied).matches.every((m) => m.applied), 'depois de aplicar, o varrimento marca-os como aplicados')
check(applyTextGuards(applied, scanTextGuards(applied).matches).transitions!.every((t, i) => t.guard === applied.transitions![i].guard), 'aplicar duas vezes não duplica condições')

const merged = applyTextGuards({ ...old, transitions: old.transitions!.map((t) => t.id === 'man-G4-t5' ? { ...t, guard: 'G0X4' } : t) }, scan.matches.filter((m) => m.transitionId === 'man-G4-t5'))
check(merged.transitions!.find((t) => t.id === 'man-G4-t5')!.guard === 'G0X4 * G4 <> X159', 'junta com «*» a uma condição de estado já existente')

const cleaned = removeTextGuardComments(applied, scan.matches.map((m) => m.commentId))
check((cleaned.comments ?? []).length === original.comments!.length, 'fase 2: ficam só os textos originais do desenho (títulos e legendas)')
check(scanTextGuards(cleaned).matches.length === 0, 'não há mais textos de comparação')
check(JSON.stringify(cleaned.transitions) === JSON.stringify(applied.transitions), 'remover textos não altera as transições')

console.log(`\n${checks} verificações de textos → condições passaram.`)
