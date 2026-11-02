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
  const f1 = seed.components.find((c) => c.id === 'native-f1')!
  check(f1.mountedOn === 'native-km1' && !f1.railId, '3D: F1 encaixado por baixo do KM1 (fora da calha)')
  check(!seed.wires.some((w) => w.fromTerminalId.startsWith('native-km1-') && w.toTerminalId.startsWith('native-f1-')), '3D: sem cabos KM1 → F1 (os pinos entram nos bornes 2T1/4T2/6T3)')
  check(ends('native-f1-A2', 'native-q0-4'), '3D: retorno da bobina pela passagem A2 do F1')
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
  old.nativeFeatures = old.nativeFeatures.filter((x: string) => !x.startsWith('thermal-relay'))
  const template = old.wires.find((w: any) => w.id === 'native-wire-3')
  const oldReturn = old.wires.find((w: any) => w.fromTerminalId === 'native-f1-A2')
  oldReturn.fromTerminalId = 'native-km1-A2'
  old.wires = old.wires.filter((w: any) => !w.fromTerminalId.startsWith('native-f1-'))
  for (const w of old.wires) if (w.toTerminalId === 'native-f1-95') w.toTerminalId = 'native-km1-A1'
  ;[['native-wire-4', '2T1', 'U1'], ['native-wire-8', '4T2', 'V1'], ['native-wire-12', '6T3', 'W1']].forEach(([id, km, m]) => old.wires.push({ ...structuredClone(template), id, fromTerminalId: `native-km1-${km}`, toTerminalId: `native-m1-${m}` }))
  const upgraded = addNativeThermalRelay(old)
  // O 98 → I0.3 não vem com o F1: é da migração dos sinalizadores (cabo a cabo, ver nativeSignals).
  check(upgraded.components.find((c: any) => c.id === 'native-f1')?.mountedOn === 'native-km1' && upgraded.wires.length === seedContent.wires.length - 1 && !upgraded.wires.some((w: any) => w.fromTerminalId === 'native-f1-98'), 'projeto antigo intacto recebe o F1 encaixado e a cablagem nova (sem o 98 → I0.3)')
  {
    const { addNativeSignals, NATIVE_SIGNALS_FEATURE } = await import('../src/project/nativeSignals')
    const withSignals = addNativeSignals({ ...upgraded, nativeFeatures: upgraded.nativeFeatures.filter((x: string) => x !== NATIVE_SIGNALS_FEATURE) })
    check(withSignals.wires.length === seedContent.wires.length && withSignals.wires.some((w: any) => w.fromTerminalId === 'native-f1-98' && w.toTerminalId === 'native-plc-I0.3'), 'depois, a migração dos sinalizadores liga o 98 → I0.3')
  }
  check(upgraded.wires.every((w: any) => seedContent.wires.some((s: any) => s.id === w.id && s.fromTerminalId === w.fromTerminalId && s.toTerminalId === w.toTerminalId)), 'cablagem migrada igual à da semente')
  const touched = structuredClone(old)
  touched.wires.find((w: any) => w.toTerminalId === 'native-km1-A1').toTerminalId = 'native-km1-14'
  const kept = addNativeThermalRelay(touched)
  check(!kept.components.some((c: any) => c.id === 'native-f1') && kept.nativeFeatures.includes(NATIVE_THERMAL_FEATURE), 'projeto com a cablagem alterada não é tocado (marca a migração como feita)')
  check(addNativeThermalRelay(upgraded) === upgraded, 'migração do F1 corre uma só vez')
  // F1 na calha (versão anterior, com cabos KM1 → F1) passa a encaixado e os cabos saem.
  const railed = structuredClone(seedContent)
  railed.nativeFeatures = railed.nativeFeatures.filter((x: string) => x !== 'thermal-relay-mounted-v1')
  const rf1 = railed.components.find((c: any) => c.id === 'native-f1'); delete rf1.mountedOn; rf1.railId = 'native-rail'
  railed.wires.find((w: any) => w.fromTerminalId === 'native-f1-A2').fromTerminalId = 'native-km1-A2'
  ;[['native-wire-4', '2T1', '1L1'], ['native-wire-8', '4T2', '3L2'], ['native-wire-12', '6T3', '5L3']].forEach(([id, km, f]) => railed.wires.push({ ...structuredClone(template), id, fromTerminalId: `native-km1-${km}`, toTerminalId: `native-f1-${f}` }))
  const mounted = addNativeThermalRelay(railed)
  check(mounted.components.find((c: any) => c.id === 'native-f1').mountedOn === 'native-km1' && !mounted.wires.some((w: any) => ['native-wire-4', 'native-wire-8', 'native-wire-12'].includes(w.id)), 'F1 na calha passa a encaixado no KM1 e os cabos KM1 → F1 saem')
  check(mounted.wires.some((w: any) => w.fromTerminalId === 'native-f1-A2'), 'o retorno da bobina passa para a passagem A2 do F1')
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

// Esquema v2 intacto (LOGO! de 160 px, H1 em 420,540) passa ao v3; um v3 já presente não muda.
{
  const { NATIVE_IEC_V2_FEATURE, NATIVE_IEC_V3_FEATURE } = await import('../src/project/nativeIec')
  const v2Parts = Array.from({ length: 35 }, (_, i) => ({ id: `iec-${i + 1}`, kind: i === 0 ? 'plcLogo' : i === 1 ? 'lamp' : 'node', tag: i === 1 ? 'H1' : '', x: i === 1 ? 420 : 0, y: i === 1 ? 540 : 0 }))
  const v2 = { nativeId: NATIVE_PARTIDA_ID, nativeFeatures: [NATIVE_IEC_FEATURE, NATIVE_IEC_V2_FEATURE], commands: { name: 'Partida direta com emergência (LOGO!)', parts: v2Parts, wires: [] } }
  const up = addNativeIecSchematic(v2)
  check(up.commands.parts.find((p: any) => p.tag === 'H1')?.y === 600 && up.nativeFeatures.includes(NATIVE_IEC_V3_FEATURE), 'esquema v2 intacto passa ao v3 (LOGO! com a frente do aparelho)')
  const moved = { ...v2, commands: { ...v2.commands, parts: v2Parts.map((p) => (p.tag === 'H1' ? { ...p, x: 500 } : p)) } }
  check(addNativeIecSchematic(moved).commands.parts.find((p: any) => p.tag === 'H1')?.x === 500, 'esquema v2 alterado pelo utilizador mantém-se')
}

// Bobina AC: projeto guardado antes de c3df70f (KM1:A2 → PS1:-V2 e Q0.0 alimentada a 24 V DC).
{
  const { fixNativeCoilWiring, NATIVE_COIL_AC_FEATURE } = await import('../src/project/nativeCoilFix')
  const { schematicDiagnostics } = await import('../src/diagnostics/viewDiagnostics')
  const seedContent = nativePartidaDiretaContent() as Record<string, any>
  const old = structuredClone(seedContent)
  old.nativeFeatures = old.nativeFeatures.filter((x: string) => x !== NATIVE_COIL_AC_FEATURE)
  const find = (a: string, b: string) => old.wires.find((w: any) => w.fromTerminalId === a && w.toTerminalId === b)
  Object.assign(find('native-f1-A2', 'native-q0-4'), { fromTerminalId: 'native-km1-A2', toTerminalId: 'native-psu--V2' })
  Object.assign(find('native-psu-+V1', 'native-plc-Q0.1'), { toTerminalId: 'native-plc-Q0.0' })
  Object.assign(find('native-q0-2', 'native-plc-Q0.0'), { fromTerminalId: 'native-plc-Q0.0', toTerminalId: 'native-plc-Q0.1' })
  const before = schematicDiagnostics(old.components, old.wires, [], false)
  check(before.some((d) => /KM1:A2 \(AC\) a PS1:-V2 \(DC\)/.test(d.message)), 'a cablagem antiga reproduz o erro «KM1:A2 (AC) a PS1:-V2 (DC)»')
  const fixed = fixNativeCoilWiring(old)
  const ends = (list: any[]) => list.map((w) => [w.fromTerminalId, w.toTerminalId].sort().join('>')).sort().join('|')
  check(ends(fixed.wires) === ends(seedContent.wires), 'a migração repõe a cablagem atual (fase em Q0.0, retorno ao Q0:4 pela passagem A2 do F1)')
  check(schematicDiagnostics(fixed.components, fixed.wires, [], false).length === 0, 'depois da migração o diagnóstico fica sem erros')
  check(fixNativeCoilWiring({ ...seedContent, nativeFeatures: [] }).wires === seedContent.wires, 'um projeto já correto não é alterado')
}

// Sinalização (signals-v1): F1 97-98 → I0.3, H3 EMERGÊNCIA em Q0.3, H2 laranja, voltímetro MM1 no motor e GRAFCET com o F1.
{
  const { evalCondition, actionsOfStep } = await import('../src/grafcet/engine')
  const { addNativeSignals, NATIVE_SIGNALS_FEATURE } = await import('../src/project/nativeSignals')
  const { schematicDiagnostics } = await import('../src/diagnostics/viewDiagnostics')
  const { NATIVE_IEC_V3_FEATURE, NATIVE_IEC_V4_FEATURE } = await import('../src/project/nativeIec')
  const { voltmeterReading, voltmeterIsDc } = await import('../src/commands/engine')
  const seed = buildNativePartidaDireta()
  const ends = (a: string, b: string) => seed.wires.some((w) => (w.fromTerminalId === a && w.toTerminalId === b) || (w.fromTerminalId === b && w.toTerminalId === a))
  const color = (id: string) => seed.components.find((c) => c.id === id)?.state.color
  check(ends('native-psu-+V2', 'native-f1-97') && ends('native-f1-98', 'native-plc-I0.3'), '3D: +24 V → 97-98 do F1 → I0.3 do LOGO!')
  check(ends('native-plc-Q0.2', 'native-plc-Q0.3') && ends('native-plc-Q0.3·2', 'native-h3-X1') && ends('native-h3-X2', 'native-h2-X2'), '3D: Q0.3 → H3 e retorno pelo H2')
  check(color('native-h1') === '#22c55e' && color('native-h2') === '#f97316' && color('native-h3') === '#ef4444', '3D: H1 verde (marcha), H2 laranja (parado), H3 vermelho (emergência)')
  check(schematicDiagnostics(seed.components, seed.wires, [], false).length === 0, '3D: quadro com o sinal do F1 e o H3 sem avisos')
  check(seed.tags.some((t) => t.address === 'I0.3' && t.name === 'F1') && seed.tags.some((t) => t.address === 'Q0.3' && t.name === 'H3'), 'tags I0.3 F1 e Q0.3 H3')

  // GRAFCET: arranque só com F1 armado; disparo devolve a X0; H2/H3 em X0.
  const g = seed.grafcet
  const t1 = g.transitions.find((t) => t.id === 'native-t1')!.condition
  const t2 = g.transitions.find((t) => t.id === 'native-t2')!.condition
  const ok = { 'I0.0': true, 'I0.1': true, 'I0.2': true, 'I0.3': false }
  check(evalCondition(t1, ok) && !evalCondition(t1, { ...ok, 'I0.3': true }), 'GRAFCET: START arranca só com o F1 armado (I0.3 = 0)')
  check(evalCondition(t2, { ...ok, 'I0.3': true }) && !evalCondition(t2, ok), 'GRAFCET: o disparo do F1 (I0.3) devolve a X0 como a emergência e o STOP')
  const x0 = actionsOfStep(g.steps.find((st) => st.id === 'native-s0')!)
  const lit = (address: string, table: Record<string, boolean>) => x0.some((a) => a.address === address && evalCondition(a.condition || '1', table))
  check(lit('Q0.2', ok) && !lit('Q0.3', ok), 'X0 sem falha: H2 PARADO (laranja) aceso, H3 apagado')
  check(lit('Q0.3', { ...ok, 'I0.0': false }) && !lit('Q0.2', { ...ok, 'I0.0': false }), 'X0 com emergência premida: H3 EMERGÊNCIA aceso, H2 apagado')
  check(lit('Q0.3', { ...ok, 'I0.3': true }) && !lit('Q0.2', { ...ok, 'I0.3': true }), 'X0 com o F1 disparado: H3 aceso, H2 apagado')

  // IEC v4: F1 97-98 → I0.3, H3 em Q0.3, voltímetro nos 24 V.
  const plcPart = diagram.parts.find((p) => p.kind === 'plcLogo')!
  const f1no = diagram.parts.find((p) => p.kind === 'thermalNO' && p.tag === 'F1')
  check(!!f1no && diagram.wires.some((w) => w.a.part === f1no.id && w.a.term === 1 && w.b.part === plcPart.id && w.b.term === 5), 'IEC: 97-98 do F1 ligado a I0.3')
  const h3 = diagram.parts.find((p) => p.tag === 'H3')!
  check(h3?.color === 'red' && diagram.parts.find((p) => p.tag === 'H2')?.color === 'orange', 'IEC: H3 vermelho e H2 laranja')
  const tripRt = (() => { let rt = { ...emptyCmdRuntime(), running: true, tripped: { F1: true } }; for (let i = 0; i < 3; i++) rt = stepCommands(diagram, rt, 100); return rt })()
  check(tripRt.plcInputs?.['I0.3'] === true && rest.plcInputs?.['I0.3'] === false, 'IEC: F1 disparado dá sinal em I0.3 (em repouso 0)')
  check(!!linked({ 'Q0.3': true }).lamps[h3.id], 'IEC: Q0.3 acende H3')
  // Voltímetro MM1 no motor (U1–V1), sincronizado com o multímetro MM1 do quadro 3D.
  const mm1 = diagram.parts.find((p) => p.kind === 'voltmeter' && p.tag === 'MM1')!
  const meter3D = seed.components.find((c) => c.id === 'native-mm1')!
  const leads3D = seed.wires.filter((w) => w.fromTerminalId.startsWith('native-mm1-')).map((w) => w.toTerminalId).sort().join(',')
  check(!!mm1 && mm1.page === 'page-1' && meter3D.ref === 'MM1' && leads3D === 'native-m1-U1,native-m1-V1', 'IEC: voltímetro MM1 na página Potência, como o MM1 do 3D (U1–V1 do motor)')
  check(!diagram.parts.some((p) => p.kind === 'voltmeter' && p.page === 'page-2'), 'IEC: sem voltímetro nos 24 V (passou para o motor)')
  const reads = (rt: typeof rest) => ({ v: voltmeterReading(rt.live[`${mm1.id}:0`], rt.live[`${mm1.id}:1`]), dc: voltmeterIsDc(rt.live[`${mm1.id}:0`], rt.live[`${mm1.id}:1`]) })
  const running = reads(run({ 'Q0.0': true }))
  check(running.v === 400 && !running.dc, 'IEC: motor em marcha → MM1 lê 400 V AC (U1–V1)')
  check(reads(run({})).v === 0, 'IEC: motor parado (KM1 aberto) → MM1 lê 0 V')
  check(reads(run({ 'Q0.0': true, QM1: true })).v === 0, 'IEC: QM1 desligado → MM1 lê 0 V')
  check(voltmeterReading('L1', 'N') === 230 && voltmeterReading('L1', 'L2') === 400 && voltmeterReading('L+', undefined) === 0, 'voltímetro: 230 V fase-neutro, 400 V entre fases, 0 V sem tensão')

  // Migração do IEC: v3 intacto → v4; v3 alterado mantém-se.
  const v3Parts = Array.from({ length: 35 }, (_, i) => ({ id: `iec-${i + 1}`, kind: i === 0 ? 'plcLogo' : i === 1 ? 'lamp' : 'node', tag: i === 1 ? 'H1' : '', x: i === 1 ? 420 : 0, y: i === 1 ? 600 : 0 }))
  const v3 = { nativeId: NATIVE_PARTIDA_ID, nativeFeatures: [NATIVE_IEC_FEATURE, NATIVE_IEC_V3_FEATURE], commands: { name: 'Partida direta com emergência (LOGO!)', parts: v3Parts, wires: [] } }
  const upV3 = addNativeIecSchematic(v3)
  check(upV3.commands.parts.some((p: any) => p.tag === 'H3') && upV3.nativeFeatures.includes(NATIVE_IEC_V4_FEATURE), 'esquema v3 intacto passa ao v4 (F1 em I0.3, H3, voltímetro)')
  const editedV3 = { ...v3, commands: { ...v3.commands, parts: [...v3Parts.slice(0, 34), { id: 'meu', kind: 'lamp' }] } }
  check(!addNativeIecSchematic(editedV3).commands.parts.some((p: any) => p.tag === 'H3'), 'esquema v3 alterado pelo utilizador mantém-se')
  // v4 intacto (voltímetro P1 nos 24 V) → v5 (MM1 no motor); v4 alterado mantém-se.
  const { NATIVE_IEC_V5_FEATURE } = await import('../src/project/nativeIec')
  const v4Parts = Array.from({ length: 42 }, (_, i) => ({ id: `iec-${i + 1}`, kind: i === 0 ? 'voltmeter' : 'node', tag: i === 0 ? 'P1' : '' }))
  const v4 = { nativeId: NATIVE_PARTIDA_ID, nativeFeatures: [NATIVE_IEC_FEATURE, NATIVE_IEC_V3_FEATURE, NATIVE_IEC_V4_FEATURE], commands: { name: 'Partida direta com emergência (LOGO!)', parts: v4Parts, wires: [] } }
  const upV4 = addNativeIecSchematic(v4)
  check(upV4.commands.parts.some((p: any) => p.tag === 'MM1') && !upV4.commands.parts.some((p: any) => p.tag === 'P1') && upV4.nativeFeatures.includes(NATIVE_IEC_V5_FEATURE), 'esquema v4 intacto passa ao v5 (voltímetro MM1 no motor)')
  check(addNativeIecSchematic({ ...v4, commands: { ...v4.commands, parts: [...v4Parts, { id: 'meu', kind: 'lamp' }] } }).commands.parts.some((p: any) => p.tag === 'P1'), 'esquema v4 alterado pelo utilizador mantém-se')

  // Migração do quadro/GRAFCET: um projeto anterior recebe tudo; com I0.3 ocupado não recebe os cabos.
  const fresh = nativePartidaDiretaContent() as any
  const newWire = (w: any) => ['native-f1-97', 'native-f1-98', 'native-plc-I0.3', 'native-plc-Q0.3', 'native-plc-Q0.3·2'].some((t) => w.fromTerminalId === t || w.toTerminalId === t)
    || w.fromTerminalId.startsWith('native-h3-') || w.toTerminalId.startsWith('native-h3-')
  const oldGrafcet = structuredClone(fresh.grafcet)
  oldGrafcet.transitions.find((t: any) => t.id === 'native-t1').condition = 'I0.0*I0.2*I0.1'
  oldGrafcet.transitions.find((t: any) => t.id === 'native-t2').condition = '!I0.0+!I0.2'
  const s0 = oldGrafcet.steps.find((st: any) => st.id === 'native-s0')
  s0.actions = [{ ...s0.actions[0], condition: '1' }]
  const old = {
    ...fresh,
    nativeFeatures: fresh.nativeFeatures.filter((f: string) => f !== NATIVE_SIGNALS_FEATURE),
    components: fresh.components.filter((c: any) => c.id !== 'native-h3').map((c: any) => (c.id === 'native-h2' ? { ...c, state: { ...c.state, color: '#ef4444' } } : c)),
    wires: fresh.wires.filter((w: any) => !newWire(w)),
    grafcet: oldGrafcet,
    tags: fresh.tags.filter((t: any) => t.address !== 'I0.3' && t.address !== 'Q0.3'),
  }
  const up = addNativeSignals(old)
  check(up.components.some((c: any) => c.id === 'native-h3') && up.components.find((c: any) => c.id === 'native-h2').state.color === '#f97316', 'migração: entra o H3 e o H2 passa a laranja')
  check(fresh.wires.filter(newWire).every((w: any) => up.wires.some((x: any) => x.fromTerminalId === w.fromTerminalId && x.toTerminalId === w.toTerminalId)), 'migração: entram os cabos F1 → I0.3 e Q0.3 → H3')
  check(up.grafcet.transitions.find((t: any) => t.id === 'native-t2').condition.includes('I0.3') && up.tags.some((t: any) => t.address === 'I0.3'), 'migração: GRAFCET, programa e tags com o F1 e o H3')
  check(schematicDiagnostics(up.components, up.wires, [], false).length === 0, 'migração: quadro sem avisos')
  check(addNativeSignals(up) === up, 'migração dos sinais corre uma só vez')
  const busy = { ...old, wires: [...old.wires, { ...old.wires[0], id: 'meu', fromTerminalId: 'native-psu-+V1', toTerminalId: 'native-plc-I0.3' }] }
  const kept = addNativeSignals(busy)
  check(!kept.wires.some((w: any) => w.fromTerminalId === 'native-f1-98') && kept.wires.length === busy.wires.length + 4 && kept.wires.some((w: any) => w.fromTerminalId === 'native-plc-Q0.3·2' && w.toTerminalId === 'native-h3-X1'), 'migração: com I0.3 já usado pelo utilizador só o 98 → I0.3 fica de fora; o H3 é ligado')
  // Projeto gravado com a v1 (tudo-ou-nada, só em ladder/tags): H3 sem cabos, só o 98 → I0.3 e tags efetivas
  // (plcTags/plcPrograms) sem I0.3/Q0.3 — a v2 repara.
  {
    const { syncNativeLadder } = await import('../src/project/nativeLadderSync')
    const { nativeProgramOf } = await import('../src/project/nativeProjects')
    const fresh2 = nativePartidaDiretaContent() as any
    const oldTags = fresh2.tags.filter((t: any) => t.address !== 'I0.3' && t.address !== 'Q0.3')
    const userState = {
      ...fresh2,
      nativeFeatures: [...fresh2.nativeFeatures.filter((x: string) => x !== 'signals-v2' && !x.startsWith('ladder-sync-')), 'signals-v1', 'ladder-sync-v1'],
      wires: fresh2.wires.filter((w: any) => !newWire(w) || (w.fromTerminalId === 'native-f1-98' && w.toTerminalId === 'native-plc-I0.3')),
      plcTags: { 'native-plc': oldTags },
      plcPrograms: { 'native-plc': { rungs: [{ id: 'old-a', name: 'GRAFCET · Chamar Grafcet', branches: [], coils: [], enabled: true, comment: 'CALL' }, { id: 'old-b', name: 'GRAFCET · Chamar Outputs', branches: [], coils: [], enabled: true, comment: 'CALL' }], fc1: [], fc2: [] } },
    }
    const repaired = syncNativeLadder(addNativeSignals(userState))
    const signal = repaired.wires.filter(newWire).map((w: any) => `${w.fromTerminalId}>${w.toTerminalId}`).sort().join(',')
    check(signal === fresh2.wires.filter(newWire).map((w: any) => `${w.fromTerminalId}>${w.toTerminalId}`).sort().join(','), 'reparação v2: H3 ligado a Q0.3 e 97 aos +24 V (os 5 cabos de sinal)')
    const eff = nativeProgramOf(repaired)
    check(eff.tags.some((t: any) => t.address === 'I0.3' && t.name === 'F1') && eff.tags.some((t: any) => t.address === 'Q0.3' && t.name === 'H3'), 'reparação v2: variáveis I0.3 F1 e Q0.3 H3 nas tags efetivas do LOGO! (plcTags)')
    const outputs = (repaired.projectFiles['native-plc'] as any[]).find((x) => x.name === 'Outputs [FC 2]')
    check(JSON.stringify(outputs?.rungs ?? []).includes('Q0.3') && eff.rungs.every((r: any) => !r.comment), 'reparação v2: FC Outputs com a saída Q0.3 (H3) e Main refeito no programa efetivo (plcPrograms)')
    check(schematicDiagnostics(repaired.components, repaired.wires, [], false).length === 0, 'reparação v2: quadro sem avisos')
  }
  const myGrafcet = { ...old, grafcet: { ...oldGrafcet, transitions: oldGrafcet.transitions.map((t: any) => (t.id === 'native-t1' ? { ...t, condition: 'I0.1' } : t)) } }
  check(addNativeSignals(myGrafcet).grafcet.transitions.find((t: any) => t.id === 'native-t1').condition === 'I0.1', 'migração: GRAFCET alterado pelo utilizador mantém-se')
}

// Ladder nativo com as convenções do gerador do GRAFCET (ladder-sync-v1).
{
  const { syncNativeLadder, NATIVE_LADDER_SYNC_FEATURE } = await import('../src/project/nativeLadderSync')
  const fresh = nativePartidaDiretaContent() as any
  const plcFiles = (c: any) => (c.projectFiles['native-plc'] as any[]).map((f) => f.name).sort().join(' | ')
  check(plcFiles(fresh) === 'Complete restart [OB 100] | Grafcet [FC 1] | Outputs [FC 2]' && fresh.ladder.rungs.map((r: any) => r.name).join('|') === 'GRAFCET · Chamar Grafcet|GRAFCET · Chamar Outputs', 'semente: blocos com os nomes do gerador do GRAFCET e Main a chamar FC Grafcet/Outputs')
  check(fresh.tags.filter((t: any) => /^M\d+$/.test(t.address)).length === 0, 'semente: memórias geradas em byte.bit (sem «M1» que a app converte ao abrir)')
  const unmark = (c: any) => ({ ...c, nativeFeatures: c.nativeFeatures.filter((f: string) => f !== NATIVE_LADDER_SYNC_FEATURE) })
  // 1) Nomes antigos do nativo (FC1 [Grafcet], OB100 [Complete restart]) e networks com comentário.
  const oldNames: Record<string, string> = { 'native-fc-grafcet': 'FC1 [Grafcet]', 'native-fc-outputs': 'FC2 [Outputs]', 'native-ob100': 'OB100 [Complete restart]' }
  const oldStyle = unmark({ ...fresh, projectFiles: { 'native-plc': fresh.projectFiles['native-plc'].map((f: any) => ({ ...f, name: oldNames[f.id] })) }, ladder: { rungs: fresh.ladder.rungs.map((r: any) => ({ ...r, comment: 'CALL' })) } })
  const fixed = syncNativeLadder(oldStyle)
  check(plcFiles(fixed) === plcFiles(fresh) && JSON.stringify(fixed.ladder.rungs.map((r: any) => r.name)) === JSON.stringify(fresh.ladder.rungs.map((r: any) => r.name)), 'migração: Ladder com os nomes antigos passa às convenções do gerador')
  // 2) Já trocado pela atualização automática (bits de etapa) com um segundo OB100.
  const broken = unmark({
    ...fresh,
    ladder: { rungs: [{ id: 'x', name: 'GRAFCET · T1: 0 → 1', branches: [], coils: [], enabled: true }] },
    projectFiles: { 'native-plc': [...fresh.projectFiles['native-plc'].map((f: any) => ({ ...f, name: oldNames[f.id] })), { id: 'dup', folder: 'programBlocks', name: 'Complete restart [OB 100]', exec: 'obStartup', rungs: [{ id: 'y', name: 'Complete restart · Etapa inicial X0', branches: [], coils: [], enabled: true }] }, { id: 'meu', folder: 'programBlocks', name: 'Meu bloco [FC 9]', rungs: [] }] },
    tags: [...fresh.tags, { id: 'tb', address: 'M0.1', name: 'Etapa_0', dataType: 'Bool', comment: 'Bit da etapa 0' }],
  })
  const repaired = syncNativeLadder(broken)
  check(repaired.projectFiles['native-plc'].filter((f: any) => f.exec === 'obStartup').length === 1 && repaired.ladder.rungs.length === 2, 'migração: Ladder trocado pelos bits de etapa volta ao registo de etapa, com um só OB100')
  check(repaired.projectFiles['native-plc'].some((f: any) => f.id === 'meu') && !repaired.tags.some((t: any) => t.name === 'Etapa_0'), 'migração: blocos do utilizador ficam; bits de etapa gerados saem')
  // 3) Main com uma network do utilizador: nada muda.
  const withUser = unmark({ ...oldStyle, ladder: { rungs: [...oldStyle.ladder.rungs, { id: 'u', name: 'A minha network', branches: [], coils: [], enabled: true }] } })
  const kept = syncNativeLadder(withUser)
  check(kept.ladder === withUser.ladder && kept.projectFiles === withUser.projectFiles, 'migração: Main com networks do utilizador não é tocado')
  check(syncNativeLadder(fixed) === fixed, 'migração do Ladder corre uma só vez')
}

console.log(`\n${checks} verificações do esquema IEC nativo passaram`)
