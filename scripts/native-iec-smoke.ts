/**
 * Esquema IEC do projeto nativo «Partida direta»: mesmas referências do quadro 3D, duas páginas
 * ligadas por X1/X2, símbolos sem sobreposição e simulação coerente (Q0.0 → KM1 → M1 roda).
 */
import assert from 'node:assert/strict'
import { buildNativeIecSchematic, addNativeIecSchematic, NATIVE_IEC_FEATURE } from '../src/project/nativeIec'
import { buildNativePartidaDireta, nativePartidaDiretaContent } from '../src/project/nativeProjects'
import { NATIVE_PARTIDA_ID } from '../src/project/nativeMotorMeter'
import { partBox } from '../src/commands/model'
import { emptyCmdRuntime, stepCommands } from '../src/commands/engine'

let checks = 0
const check = (ok: boolean, message: string) => { assert.ok(ok, message); console.log(`PASS — ${message}`); checks++ }

const diagram = buildNativeIecSchematic()
const tags = new Set(diagram.parts.map((p) => p.tag).filter(Boolean))
const refs3D = new Set(buildNativePartidaDireta().components.map((c) => c.ref))
for (const ref of ['QG', 'QM1', 'KM1', 'M1', 'Q0', 'PS1', 'B0', 'H1', 'H2']) check(tags.has(ref) && refs3D.has(ref), `${ref} existe no esquema IEC e no quadro 3D`)
check(diagram.pages?.map((p) => p.name).join('|') === 'Potência|Comando LOGO!', 'duas páginas: Potência e Comando LOGO!')
check(diagram.parts.some((p) => p.kind === 'motorBreaker3' && p.tag === 'QM1'), 'QM1 usa o disjuntor-motor IEC com disparadores térmico e magnético')
const ids = new Set(diagram.parts.map((p) => p.id))
check(diagram.wires.every((w) => ids.has(w.a.part) && ids.has(w.b.part)), 'todos os cabos ligam símbolos existentes')
check(new Set(diagram.parts.map((p) => p.id)).size === diagram.parts.length && new Set(diagram.wires.map((w) => w.id)).size === diagram.wires.length, 'ids únicos')

// Sem sobreposição de símbolos na mesma página (nós e alimentação ficam de fora).
const overlaps: string[] = []
const solid = diagram.parts.filter((p) => p.kind !== 'node' && p.kind !== 'supply')
for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
  const a = solid[i], b = solid[j]
  if (a.page !== b.page) continue
  const A = partBox(a), B = partBox(b)
  if (A.x < B.x + B.w && B.x < A.x + A.w && A.y < B.y + B.h && B.y < A.y + A.h) overlaps.push(`${a.tag || a.kind}/${b.tag || b.kind}`)
}
check(overlaps.length === 0, `símbolos sem sobreposição (${overlaps.join(', ') || 'nenhuma'})`)

// Simulação: em repouso o motor está parado; Q0.0 alimenta KM1, que arranca M1; Q0.1 acende H1.
const motorId = diagram.parts.find((p) => p.kind === 'motor3')!.id
const h1Id = diagram.parts.find((p) => p.tag === 'H1')!.id
const run = (toggled: Record<string, boolean>) => {
  let rt = { ...emptyCmdRuntime(), running: true, toggled }
  for (let i = 0; i < 3; i++) rt = stepCommands(diagram, rt, 100)
  return rt
}
const idle = run({})
check(!idle.fault && idle.motors[motorId]?.mode === 'stop', 'em repouso o motor está parado e sem curto-circuitos')
const on = run({ 'Q0.0': true })
check(!on.fault && !!on.coils.KM1, 'Q0.0 ligada energiza a bobina KM1 (230 V via X1/X2 entre páginas)')
check(on.motors[motorId]?.mode === 'run', 'KM1 fecha os contactos de potência e M1 roda')
check(run({ 'Q0.0': true, QM1: true }).motors[motorId]?.mode === 'stop', 'QM1 desligado corta o motor')
check(!!run({ 'Q0.1': true }).lamps[h1Id], 'Q0.1 acende H1 (24 V da PS1)')

// Projeto nativo: semente com esquema IEC; migração uma só vez e sem apagar um esquema do utilizador.
const content = nativePartidaDiretaContent() as Record<string, any>
check(content.commands?.parts?.length === diagram.parts.length && (content.nativeFeatures as string[]).includes(NATIVE_IEC_FEATURE), 'a semente nativa traz o esquema IEC')
const old = { nativeId: NATIVE_PARTIDA_ID, nativeFeatures: ['wire-curves-v2'], commands: { parts: [], wires: [] } }
const upgraded = addNativeIecSchematic(old)
check(upgraded.commands.parts.length === diagram.parts.length && upgraded.nativeFeatures.includes(NATIVE_IEC_FEATURE), 'projeto nativo antigo sem esquema IEC recebe-o')
const own = { nativeId: NATIVE_PARTIDA_ID, nativeFeatures: [], commands: { parts: [{ id: 'x' }], wires: [] } }
check(addNativeIecSchematic(own).commands.parts.length === 1, 'um esquema IEC do utilizador não é substituído')
check(addNativeIecSchematic({ ...upgraded, commands: { parts: [], wires: [] } }).commands.parts.length === 0, 'a migração corre uma só vez')
check(addNativeIecSchematic({ nativeId: 'outro', commands: { parts: [], wires: [] } }).commands.parts.length === 0, 'projetos não nativos não são tocados')

console.log(`\n${checks} verificações do esquema IEC nativo passaram`)
