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

// Ligação ao PLC: as saídas vêm do programa (rt.plc) e as entradas com tensão seguem para o PLC.
const linked = (plc: Record<string, boolean>, pressed: Record<string, boolean> = {}) => {
  let rt = { ...emptyCmdRuntime(), running: true, plc, pressed }
  for (let i = 0; i < 3; i++) rt = stepCommands(diagram, rt, 100)
  return rt
}
const rest = linked({})
check(rest.plcInputs?.['I0.0'] === true && rest.plcInputs?.['I0.2'] === true && rest.plcInputs?.['I0.1'] === false, 'em repouso: EMERG e STOP (NF) dão sinal ao PLC, START não')
check(linked({}, { 'B1.1': true }).plcInputs?.['I0.1'] === true, 'premir START (B1.1) dá sinal em I0.1')
check(linked({}, { 'B1.2': true }).plcInputs?.['I0.2'] === false, 'premir STOP (B1.2) corta o sinal em I0.2')
const byProgram = linked({ 'Q0.0': true, 'Q0.1': true })
check(!!byProgram.coils.KM1 && byProgram.motors[motorId]?.mode === 'run' && !!byProgram.lamps[h1Id], 'Q0.0/Q0.1 ligadas pelo programa: KM1 arranca M1 e H1 acende')

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

// —— LOGO! em bloco e relé térmico F1 ——
check(diagram.parts.some((p) => p.kind === 'plcLogo' && p.tag === 'PLC1'), 'o LOGO! aparece em bloco (L+ M I0.x / saídas a relé Q0.x)')
check(diagram.parts.some((p) => p.kind === 'thermal3' && p.tag === 'F1') && diagram.parts.some((p) => p.kind === 'thermalNC' && p.tag === 'F1'), 'F1: elementos térmicos na potência e 95-96 no comando')
check(refs3D.has('F1') && refs3D.has('PLC1'), 'F1 e PLC1 existem no quadro 3D')
const tripped = (() => { let rt = { ...emptyCmdRuntime(), running: true, toggled: { 'Q0.0': true }, tripped: { F1: true } }; for (let i = 0; i < 3; i++) rt = stepCommands(diagram, rt, 100); return rt })()
check(!tripped.coils.KM1 && tripped.motors[motorId]?.mode !== 'run', 'F1 disparado: o 95-96 abre, KM1 cai e o motor para')

// 3D: KM1 → F1 → M1 e 95-96 em série com a bobina.
{
  const seed = buildNativePartidaDireta()
  const ends = (from: string, to: string) => seed.wires.some((w) => w.fromTerminalId === from && w.toTerminalId === to)
  check(['1L1', '3L2', '5L3'].every((t, i) => ends(`native-km1-${['2T1', '4T2', '6T3'][i]}`, `native-f1-${t}`)), '3D: KM1 2T1/4T2/6T3 → F1 1L1/3L2/5L3')
  check(['U1', 'V1', 'W1'].every((t, i) => ends(`native-f1-${['2T1', '4T2', '6T3'][i]}`, `native-m1-${t}`)), '3D: F1 2T1/4T2/6T3 → motor U1/V1/W1')
  check(ends('native-plc-Q0.0·2', 'native-f1-95') && ends('native-f1-96', 'native-km1-A1'), '3D: Q0.0 → 95-96 do F1 → bobina KM1 (A1)')
}

// Migração do relé térmico: projeto nativo guardado antes do F1.
{
  const { addNativeThermalRelay, NATIVE_THERMAL_FEATURE } = await import('../src/project/nativeThermalRelay')
  const seedContent = nativePartidaDiretaContent() as Record<string, any>
  const old = structuredClone(seedContent)
  old.nativeFeatures = old.nativeFeatures.filter((x: string) => x !== NATIVE_THERMAL_FEATURE)
  old.components = old.components.filter((c: any) => c.id !== 'native-f1')
  old.wires = old.wires.filter((w: any) => !w.fromTerminalId.startsWith('native-f1-'))
  const back: Record<string, string> = { 'native-f1-1L1': 'native-m1-U1', 'native-f1-3L2': 'native-m1-V1', 'native-f1-5L3': 'native-m1-W1', 'native-f1-95': 'native-km1-A1' }
  for (const w of old.wires) if (back[w.toTerminalId]) w.toTerminalId = back[w.toTerminalId]
  const upgraded = addNativeThermalRelay(old)
  check(upgraded.components.some((c: any) => c.id === 'native-f1') && upgraded.wires.length === seedContent.wires.length, 'projeto antigo intacto recebe o F1 e a cablagem nova')
  check(upgraded.wires.every((w: any) => seedContent.wires.some((s: any) => s.id === w.id && s.fromTerminalId === w.fromTerminalId && s.toTerminalId === w.toTerminalId)), 'cablagem migrada igual à da semente')
  const touched = structuredClone(old)
  touched.wires.find((w: any) => w.toTerminalId === 'native-km1-A1').toTerminalId = 'native-km1-A2'
  const kept = addNativeThermalRelay(touched)
  check(!kept.components.some((c: any) => c.id === 'native-f1') && kept.nativeFeatures.includes(NATIVE_THERMAL_FEATURE), 'projeto com a cablagem alterada não é tocado (marca a migração como feita)')
  check(addNativeThermalRelay(upgraded) === upgraded, 'migração do F1 corre uma só vez')
}

// Esquema IEC v1 (entradas/saídas soltas) intacto passa ao v2; um esquema alterado mantém-se.
{
  const { NATIVE_IEC_V2_FEATURE } = await import('../src/project/nativeIec')
  const v1Parts = Array.from({ length: 39 }, (_, i) => ({ id: `iec-${i + 1}`, kind: i === 0 ? 'plcOut' : 'node' }))
  const v1 = { nativeId: NATIVE_PARTIDA_ID, nativeFeatures: [NATIVE_IEC_FEATURE], commands: { name: 'Partida direta com emergência (LOGO!)', parts: v1Parts, wires: [{ id: 'iec-w1' }] } }
  const up = addNativeIecSchematic(v1)
  check(up.commands.parts.some((p: any) => p.kind === 'plcLogo') && up.nativeFeatures.includes(NATIVE_IEC_V2_FEATURE), 'esquema IEC v1 intacto passa ao v2 (LOGO! em bloco e F1)')
  const edited = { ...v1, commands: { ...v1.commands, parts: [...v1Parts, { id: 'meu', kind: 'lamp' }] } }
  check(addNativeIecSchematic(edited).commands.parts.length === 40, 'esquema IEC alterado pelo utilizador não é substituído')
}

console.log(`\n${checks} verificações do esquema IEC nativo passaram`)
