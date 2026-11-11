/** Estampagem do guião ATEC 1185 (feito de raiz): G0 Controlo, G1 Emergência, G2 Funcionamento, G3 Reset, G4 Manual. */
import assert from 'node:assert/strict'
import { emptyGrafcetRuntime, scanGrafcet, setGrafcetSignalAliasResolver, validateGrafcet, validCondition, type GrafcetRuntime } from '../src/grafcet/engine'
import { signalAliasMap } from '../src/grafcet/signals'
import { wordMethodBlocker } from '../src/grafcet/toLadderWord'
import { grafcetExampleContent, grafcetExamples } from '../src/project/grafcetExamples'
import { GRAFCET_TEMPLATES } from '../src/grafcet/templates'

let checks = 0
const ok = (cond: unknown, message: string) => { assert.ok(cond, message); checks += 1 }
const example = grafcetExamples().find((e) => e.id === 'grafcet-estampagem-guiao-1185')!
ok(example, 'exemplo do guião registado')
const { program } = example
const byName = new Map(example.tags.map((t) => [t.name, t.address]))
const aliases = signalAliasMap(example.tags.map((t) => ({ ...t, dataType: 'Bool' as const })) as never)
setGrafcetSignalAliasResolver((name) => aliases.get(name))

// ---- Estrutura
ok((program.charts ?? []).map((c) => c.name).join('|') === 'G0 Controlo|G1 Emergência|G2 Funcionamento|G3 Reset|G4 Manual', 'cinco GRAFCETs pela ordem pedida')
const issues = validateGrafcet(program)
ok(issues.length === 0, 'sem erros no Diagnóstico: ' + JSON.stringify(issues))
ok(program.transitions!.every((t) => validCondition(t.condition)), 'receptividades válidas')
const used = new Set(program.steps.flatMap((s) => s.actions ?? []).map((a) => a.address))
ok([...used].every((a) => example.tags.some((t) => t.address === a)), 'todas as saídas e memórias com nome')
ok(program.steps.every((s) => s.x != null && s.y != null && s.chart), 'etapas organizadas e numa página')
ok(wordMethodBlocker(program) === null, 'Gerar Ladder com MOVE disponível: ' + wordMethodBlocker(program))
ok(GRAFCET_TEMPLATES.some((t) => t.id === example.id), 'também nos Modelos GRAFCET')
const content = grafcetExampleContent(example) as any
ok(content.projectKind === 'grafcet' && content.nativeId === example.nativeId, 'conteúdo nativo pronto a semear')

// ---- Simulação
let rt: GrafcetRuntime = emptyGrafcetRuntime()
const table: Record<string, boolean> = { ...example.restInputs }
const A = (name: string) => byName.get(name) ?? name
const scan = (ms = 100) => { for (let t = 0; t < ms; t += 100) rt = scanGrafcet(program, rt, table, 100) }
const set = (values: Record<string, boolean>) => { for (const [k, v] of Object.entries(values)) table[A(k)] = v; scan(); scan() }
const pulse = (name: string) => { set({ [name]: true }); set({ [name]: false }) }
const ids = new Map(program.steps.map((s) => [s.id, s.name]))
const active = () => rt.active.map((id) => ids.get(id)!).sort((a, b) => Number(a) - Number(b)).join(',')
const on = (name: string) => !!table[A(name)]
scan()
ok(active() === '0,10,20,50,60', 'arranque: X0 (por referenciar), X10, X20, X50, X60 — ' + active())

pulse('B_Reset')
ok(active().startsWith('1,'), 'reset: G0 X1 e o G3 a referenciar — ' + active())
scan(600)
ok(active() === '2,10,20,50,60' && on('LED_Amarelo'), 'reset concluído: parada com LED amarelo')

// Um ciclo completo com uma peça de um tipo
function cycle(type: 'Preta' | 'Branca' | 'Metal', seconds: number) {
  if (!active().split(',').includes('3')) pulse('B_Start')
  ok(active().includes('21') && on('Cil1_Avanco') && on('LED_Verde'), `${type}: Start → alimentar`)
  set({ C1_Recuado: false, C1_Avancado: true })
  set({ Sensor_Metal: type === 'Metal', Sensor_Cor: type === 'Branca' })
  scan(1200)
  ok(active().includes('26') && on(`Peca_${type}`) && on('Cil1_Recuo'), `${type}: tipo memorizado, alimentador a recuar`)
  set({ Sensor_Metal: false, Sensor_Cor: false, C1_Avancado: false, C1_Recuado: true })
  ok(active().includes('27') && on('Cil2_Avanco'), `${type}: ventosa desce`)
  set({ C2_Recuado: false, C2_Avancado: true }); scan(1100)
  ok(active().includes('29') && on('Cil2_Recuo'), `${type}: pegou e sobe`)
  set({ C2_Avancado: false, C2_Recuado: true })
  ok(active().includes('30') && on('M1_Direita'), `${type}: M1 roda para a estampagem`)
  set({ FC_Alimentador: false, FC_Estampagem: true })
  set({ C2_Recuado: false, C2_Avancado: true }); scan(1100)
  set({ C2_Avancado: false, C2_Recuado: true })
  ok(active().includes('34') && on('Cil3_Avanco'), `${type}: Cil3 posiciona a peça`)
  set({ C3_Recuado: false, C3_Avancado: true })
  ok(active().includes('35') && on('Cil4_Avanco'), `${type}: estampa`)
  set({ C4_Recuado: false, C4_Avancado: true })
  scan(seconds * 1000 - 600)
  ok(active().includes('35'), `${type}: ainda a estampar antes dos ${seconds} s`)
  scan(700)
  ok(active().includes('36') && !on('Cil4_Avanco') && on('Cil3_Recuo'), `${type}: ${seconds} s cumpridos, recua`)
  set({ C4_Avancado: false, C4_Recuado: true, C3_Avancado: false, C3_Recuado: true })
  set({ C2_Recuado: false, C2_Avancado: true }); scan(1100)
  set({ C2_Avancado: false, C2_Recuado: true })
  ok(active().includes('40') && on('M1_Esquerda'), `${type}: M1 volta`)
  set({ FC_Estampagem: false, FC_Alimentador: true })
  ok(active().includes('41') && on('Ventosa_Off'), `${type}: larga na rampa`)
  scan(1200)
}
cycle('Preta', 5)
ok(on('Cnt_Preta') && !on('Rampa_Preta_Cheia') && !on('Peca_Preta'), '1.ª preta contada, rampa ainda livre')
ok(active().includes('3') && active().includes('21'), 'ciclo contínuo: novo ciclo em automático — ' + active())
cycle('Branca', 6)
cycle('Metal', 8)
cycle('Preta', 5)
ok(on('Rampa_Preta_Cheia'), '2.ª preta: rampa preta cheia')
ok(active().startsWith('2,') && active().includes('20'), 'rampa cheia: acaba o ciclo e para — ' + active())
pulse('B_Start')
ok(active().startsWith('2,'), 'rampa cheia: Start não arranca')
set({ Reset_Rampas: true })
ok(active().includes('56') && !on('Rampa_Preta_Cheia') && !on('Cnt_Branca'), 'Reset_Rampas esvazia os contadores')
set({ Reset_Rampas: false })

// Pausa: congela e para o motor
pulse('B_Start')
set({ C1_Recuado: false, C1_Avancado: true }); scan(1200)
set({ C1_Avancado: false, C1_Recuado: true })
set({ C2_Recuado: false, C2_Avancado: true }); scan(1100)
set({ C2_Avancado: false, C2_Recuado: true })
ok(active().includes('30') && on('M1_Direita'), 'pausa: braço a rodar')
set({ B_Pausa: true })
ok(active().startsWith('5,') && !on('M1_Direita'), 'pausa: G0 X5 e M1 parado')
set({ FC_Alimentador: false, FC_Estampagem: true })
ok(active().includes('30'), 'pausa: o ciclo não avança')
set({ B_Pausa: false })
ok(active().includes('31'), 'retoma: o ciclo continua')

// Emergência
set({ Seguranca_OK: false }); scan()
ok(active() === '7,11,20,50,60' && on('LED_Vermelho'), 'emergência: G0 X7, G1 X11, ciclo abortado — ' + active())
set({ Seguranca_OK: true }); scan()
ok(active() === '0,10,20,50,60', 'rearme: pede reset (X0)')
set({ C2_Avancado: false, C2_Recuado: true })
pulse('B_Reset')
ok(on('M1_Esquerda') && active().includes('53'), 'reset: braço volta ao alimentador')
set({ FC_Estampagem: false, FC_Alimentador: true }); scan(600)
ok(active() === '2,10,20,50,60', 'reset concluído após emergência — ' + active())

// Manual
set({ Sel_Auto: false })
ok(active() === '6,10,20,50,61', 'manual: G0 X6 e G4 X61')
set({ Man_Cil1_Av: true })
ok(on('Cil1_Avanco') && !on('Cil1_Recuo'), 'manual: Cil1 +')
set({ Man_Cil1_Rec: true })
ok(!on('Cil1_Avanco') && !on('Cil1_Recuo'), 'manual: avanço e recuo juntos não atuam')
set({ Man_Cil1_Av: false, Man_Cil1_Rec: false, Man_M1_Dir: true })
ok(on('M1_Direita'), 'manual: M1 roda com a ventosa em cima')
set({ C2_Recuado: false })
ok(!on('M1_Direita'), 'manual: M1 bloqueado com a ventosa em baixo')
set({ C2_Recuado: true, Man_M1_Dir: false, Sel_Auto: true })
ok(active() === '0,10,20,50,60' && !on('M1_Direita'), 'saída do manual: pede novo reset')

setGrafcetSignalAliasResolver(() => undefined)
console.log(`[estampagem-guiao] OK — ${checks} verificações`)
