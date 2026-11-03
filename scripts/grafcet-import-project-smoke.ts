/** Importar no editor GRAFCET: aceita o programa GRAFCET e também um projeto completo (com `grafcet` dentro). */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { readGrafcetFile } from '../src/grafcet/importFile'

let checks = 0
const check = (c: unknown, m: string) => { assert.ok(c, m); checks++; console.log(`PASS — ${m}`) }
const asFile = (name: string, text: string) => { const buf = new TextEncoder().encode(text); return { name, size: buf.length, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer } }

const program = { name: 'T', steps: [{ id: 's1', name: '1', initial: true, action: '', condition: '', x: 0, y: 0 }], transitions: [] }
const direct = await readGrafcetFile(asFile('a.json', JSON.stringify(program)))
check(direct.program.steps.length === 1, 'programa GRAFCET direto importa')
const wrapped = await readGrafcetFile(asFile('proj.json', JSON.stringify({ app: 'dc-simu', components: [], grafcet: program })))
check(wrapped.program.steps.length === 1 && wrapped.source === 'json', 'projeto completo importa o GRAFCET que traz dentro')
await assert.rejects(() => readGrafcetFile(asFile('x.json', JSON.stringify({ app: 'dc-simu', components: [] }))), /faltam as etapas/)
check(true, 'ficheiro sem GRAFCET continua a ser recusado')

const user = '/mnt/user-data/uploads/dc-simu-atec.json'
if (fs.existsSync(user)) {
  const full = await readGrafcetFile(asFile('dc-simu-atec.json', fs.readFileSync(user, 'utf8')))
  check(full.program.steps.length === 54, 'projeto ATEC completo: 54 etapas')
}
const only = '/home/claude/out/dc-simu-atec-grafcet.json'
if (fs.existsSync(only)) {
  const r = await readGrafcetFile(asFile('dc-simu-atec-grafcet.json', fs.readFileSync(only, 'utf8')))
  check(r.program.steps.length === 54 && (r.program.transitions ?? []).filter((t: any) => t.guard).length === 8, 'ATEC corrigido: 54 etapas e 8 condições «Só se»')
}
console.log(`\n${checks} verificações da importação passaram.`)
