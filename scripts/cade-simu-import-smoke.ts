/**
 * Importação CADe SIMU 3.x (.cad em texto): um esquema sintético de arranque direto, escrito no
 * formato do CADe SIMU, é lido e simulado no Esquema IEC.
 *  · alimentação rodada (L1 L2 L3 PE em barramentos), disjuntor, contactor, relé térmico e motor (PE);
 *  · comando com F1 95-96, S0 (NF 1-2), S1 (NA 3-4), selo KM1 13-14 em T e bobina KM1;
 *  · texto, botão do painel do CADe e retângulo; temporizador à desoperação (9005 tipo 3) e 67-68.
 */
import assert from 'node:assert/strict'
import { parseCadeSimuText, readCadeRecords } from '../src/commands/cadeSimuText'
import { parseCadeBinary } from '../src/commands/cadeSimuImport'
import { emptyCmdRuntime, stepCommands } from '../src/commands/engine'
import { terminalLabel } from '../src/commands/model'

let checks = 0
const check = (ok: boolean, message: string) => { assert.ok(ok, message); console.log(`PASS — ${message}`); checks++ }

import { cadeDirectStartFixture } from './fixtures/cade-direct-start.mjs'

const file: string = cadeDirectStartFixture()

// —— Leitura
const { records, footer } = readCadeRecords(file)
check(records.length === 50 && footer.startsWith('$$$'), `lê os ${records.length} registos pela ordem e o rodapé da folha`)
const result = parseCadeSimuText(file, 'ensaio.cad')
const { diagram } = result
const byTag = (kind: string, tag?: string) => diagram.parts.find((p) => p.kind === kind && (tag === undefined || p.tag === tag))
check(diagram.name === 'ensaio' && !!byTag('supply') && !!byTag('breaker3', 'Q1') && !!byTag('contact3', 'KM1') && !!byTag('thermal3', 'F1') && !!byTag('motor3', 'M1'), 'potência: alimentação, Q1, KM1 (sem o «-» do CADe), F1 e M1')
check(!!byTag('thermalNC', 'F1') && !!byTag('pushNC', 'S0') && !!byTag('pushNO', 'S1') && !!byTag('contactNO', 'KM1') && !!byTag('coil', 'KM1'), 'comando: F1 95-96, S0, S1, KM1 13-14 e bobina KM1')
check(byTag('pushNC', 'S0')?.labels?.join('-') === '1-2' && byTag('pushNO', 'S1')?.labels?.join('-') === '3-4', 'marcação dos bornes do CADe mantida (S0 1-2, S1 3-4)')
check(byTag('timerOffCoil', 'TP')?.delayMs === 30000 && !!byTag('timedOffNO', 'TP'), 'temporizador 9005 tipo 3 → à desoperação de 30 s; 67-68 → NA temporizado à desoperação')
check(diagram.texts?.some((t) => t.text === 'PARTIDA DIRETA (ENSAIO)') === true, 'texto do desenho importado')
check(result.ignored.some((i) => /painel de simulação/.test(i.kind)) && result.ignored.some((i) => /Retângulo/.test(i.kind)), 'botão do painel do CADe e retângulo listados como ignorados')

// —— Ligações (refeitas pela geometria)
const ids = new Map(diagram.parts.map((p) => [p.id, p]))
const name = (e: { part: string; term: number }) => { const p = ids.get(e.part)!; return `${p.tag || p.kind}:${terminalLabel(p, e.term)}` }
// Mesma rede elétrica (os bornes de uma rede são ligados em cadeia, pela ordem do desenho).
const net = new Map<string, string>()
const root = (k: string): string => { const p = net.get(k) ?? k; return p === k ? k : root(p) }
for (const w of diagram.wires) { const a = root(name(w.a)), b = root(name(w.b)); if (a !== b) net.set(a, b) }
const linked = (a: string, b: string) => root(a) === root(b)
check(linked('supply:L1', 'Q1:1') && linked('Q1:2', 'KM1:1') && linked('KM1:2', 'F1:1') && linked('F1:2', 'M1:U1'), 'alimentação rodada: L1 → Q1:1 → KM1 → F1 → M1:U1')
check(diagram.wires.some((w) => w.color === 'green-yellow' && [name(w.a), name(w.b)].includes('supply:PE')), 'condutor PE (4010) a verde-amarelo até ao motor')
check(linked('S0:2', 'S1:3') && linked('S1:3', 'KM1:13'), 'selo: KM1 13 na rede S0:2/S1:3 (junção em T)')
check(linked('S1:4', 'KM1:14') && linked('KM1:14', 'KM1:A1'), 'selo: KM1 14 na rede S1:4/A1 (junção em T)')
check(linked('KM1:A2', 'supply:L2') && !linked('supply:L1', 'supply:L2'), 'bobina entre L1 (via F1/S0/S1) e L2; fases distintas não ficam unidas')
check(linked('supply:L1', 'F1:95') && !linked('Q1:2', 'Q1:4'), 'F1 95 ligado ao barramento L1; polos do disjuntor separados')

// —— Simulação no Esquema IEC
const motorId = byTag('motor3', 'M1')!.id
let rt = { ...emptyCmdRuntime(), running: true }
const step = (ms: number, extra: Partial<typeof rt> = {}) => { rt = { ...rt, ...extra }; for (let t = 0; t < ms; t += 100) rt = stepCommands(diagram, rt, 100) }
step(300)
check(!rt.fault && rt.motors[motorId]?.mode !== 'run' && !rt.coils.KM1, 'em repouso: motor parado, sem curto-circuitos')
step(300, { pressed: { S1: true } }); step(300, { pressed: {} })
check(!!rt.coils.KM1 && rt.motors[motorId]?.mode === 'run', 'START (S1) e largar: KM1 fica selado e o motor roda')
step(300, { pressed: { S0: true } }); step(300, { pressed: {} })
check(!rt.coils.KM1 && rt.motors[motorId]?.mode !== 'run', 'STOP (S0): KM1 cai e o motor para')
step(300, { pressed: { S1: true } }); step(300, { pressed: {}, tripped: { F1: true } })
check(!rt.coils.KM1, 'disparo do relé térmico F1: o 95-96 abre e KM1 cai')

// —— Encaminhamento a partir do importador geral (.cad)
const viaImporter = parseCadeBinary(new TextEncoder().encode(file), 'ensaio.cad')
check(viaImporter.stats.symbols === result.stats.symbols && viaImporter.stats.wires === result.stats.wires, 'o importador .cad usa o leitor completo quando o ficheiro começa por «CADe_SIMU»')

console.log(`\n${checks} verificações da importação CADe SIMU passaram`)
