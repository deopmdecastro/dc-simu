import assert from 'node:assert/strict'
import { emptyGrafcetRuntime, grafcetGraphs, scanGrafcet, setGrafcetSignalAliasResolver, validateGrafcet, validCondition, type GrafcetRuntime } from '../src/grafcet/engine'
import { isUsableSignalName, signalAliasMap } from '../src/grafcet/signals'
import { grafcetExampleContent, grafcetExamples, type GrafcetExample } from '../src/project/grafcetExamples'
import { GRAFCET_TEMPLATES } from '../src/grafcet/templates'

/** Os três exemplos GRAFCET correm de ponta a ponta no mesmo motor do simulador. */
let checks = 0
const ok = (cond: unknown, message: string) => { assert.ok(cond, message); checks += 1; console.log('PASS — ' + message) }

class Run {
  rt: GrafcetRuntime = emptyGrafcetRuntime()
  table: Record<string, boolean>
  constructor(private readonly example: GrafcetExample) { this.table = { ...example.restInputs } }
  scan(ms = 100) { this.rt = scanGrafcet(this.example.program, this.rt, this.table, 100); for (let t = 100; t < ms; t += 100) this.rt = scanGrafcet(this.example.program, this.rt, this.table, 100); return this }
  set(values: Record<string, boolean>) { Object.assign(this.table, values); return this.scan() }
  /** Impulso: liga, faz um ciclo e desliga (flanco ascendente). */
  pulse(address: string) { this.set({ [address]: true }); return this.set({ [address]: false }) }
  active() { const byId = new Map(this.example.program.steps.map((s) => [s.id, s.name])); return this.rt.active.map((id) => byId.get(id)).sort((a, b) => Number(a) - Number(b)).join(',') }
  on(address: string) { return !!this.table[address] }
}

const [basic, normal, advanced, estampagem] = grafcetExamples()
ok(grafcetExamples().length === 4 && basic.level === 'básico' && normal.level === 'normal' && advanced.level === 'avançado' && estampagem.level === 'avançado', 'quatro exemplos: básico, normal, avançado e Estampagem ATEC')

for (const example of [basic, normal, advanced, estampagem]) {
  const issues = validateGrafcet(example.program)
  // A Estampagem partilha saídas entre GRAFCETs exclusivos pela hierarquia do G0 (auto/reset/manual): o aviso estático «várias etapas» é esperado e verificado à parte.
  const relevant = example === estampagem ? issues.filter((issue) => !/^(addr|drive):/.test(issue.id)) : issues
  ok(relevant.length === 0, `${example === estampagem ? 'estampagem' : example.level}: GRAFCET sem erros nem avisos no Diagnóstico${relevant.length ? ' — ' + JSON.stringify(relevant) : ''}`)
  ok((example.program.transitions ?? []).every((t) => validCondition(t.condition)), `${example.level}: todas as receptividades são válidas`)
  ok((example.program.comments ?? []).length >= 3, `${example.level}: tem textos no desenho`)
  ok(example.notes.length >= 1 && example.notes.every((n) => (n.messages ?? []).length >= 2 && n.view === 'grafcet'), `${example.level}: tem comentários com explicação`)
  const used = new Set((example.program.steps.flatMap((s) => s.actions ?? []).map((a) => a.address)))
  ok([...used].every((address) => example.tags.some((tag) => tag.address === address)), `${example.level}: todas as saídas têm nome na tabela de sinais`)
  const content = grafcetExampleContent(example)
  ok(content.projectKind === 'grafcet' && content.nativeId === example.nativeId && Array.isArray(content.canvasNotes), `${example.level}: conteúdo de projeto GRAFCET pronto a semear`)
  ok(GRAFCET_TEMPLATES.some((template) => template.id === example.id), `${example.level}: também está nos Modelos GRAFCET`)
}

// ---- 1) Básico: prensa
{
  const r = new Run(basic).scan()
  ok(r.active() === '0' && r.on('Q0.2'), 'básico: arranca na etapa 0 com H1 pronto')
  r.set({ 'I0.0': true })
  ok(r.active() === '0', 'básico: START sem peça não arranca')
  r.set({ 'I0.1': true })
  ok(r.active() === '1' && r.on('Q0.0') && !r.on('Q0.2'), 'básico: START + peça → etapa 1, Y1 desce')
  r.set({ 'I0.0': false, 'I0.3': false, 'I0.2': true })
  ok(r.active() === '2' && r.on('Q0.3') && !r.on('Q0.0'), 'básico: fim de curso em baixo → prensa (etapa 2, válvula biestável)')
  r.scan(1500)
  ok(r.active() === '2', 'básico: ainda a prensar antes dos 2 s')
  r.scan(700)
  ok(r.active() === '3' && r.on('Q0.1') && !r.on('Q0.0'), 'básico: após 2 s sobe (Y2)')
  r.set({ 'I0.2': false, 'I0.3': true })
  ok(r.active() === '0' && r.on('Q0.2'), 'básico: cilindro em cima → repouso')
}

// ---- 2) Normal: portão
{
  const r = new Run(normal).scan()
  ok(r.active() === '0' && !r.on('Q0.0') && !r.on('Q0.1'), 'normal: começa fechado e parado')
  r.pulse('I0.0')
  ok(r.active() === '1' && r.on('Q0.0') && r.on('Q0.4') && !r.on('Q0.2'), 'normal: impulso → abre (KM1 + H3 âmbar)')
  let blinks = new Set<boolean>()
  r.set({ 'I0.2': false, 'I0.1': true })
  ok(r.active() === '2' && r.on('Q0.3') && !r.on('Q0.0'), 'normal: aberto → espera com sinal verde')
  r.scan(5200)
  ok(r.active() === '3' && r.on('Q0.1'), 'normal: após 5 s fecha (KM2)')
  for (let i = 0; i < 12; i += 1) { r.scan(); blinks.add(r.on('Q0.2')) }
  ok(blinks.size === 2, 'normal: pirilampo pisca a 1 Hz durante o fecho')
  r.set({ 'I0.1': false, 'I0.3': false })
  ok(r.active() === '1' && r.on('Q0.0') && !r.on('Q0.1'), 'normal: fotocélula interrompida → reabre (seleção OU)')
  r.set({ 'I0.3': true, 'I0.1': true })
  r.scan(5200)
  ok(r.active() === '3', 'normal: volta a fechar depois da espera')
  r.set({ 'I0.1': false, 'I0.2': true })
  ok(r.active() === '0' && !r.on('Q0.1'), 'normal: fim de curso fechado → etapa 0')
  blinks = new Set(); r.set({ 'I0.0': true }); r.scan(); r.set({ 'I0.0': true })
  ok(r.active() === '1', 'normal: só o flanco conta (botão mantido não repete)')
}

// ---- 3) Avançado: enchimento e tampagem
{
  const r = new Run(advanced).scan()
  ok(r.active() === '0,10' && r.on('Q0.5'), 'avançado: produção na 0 e segurança na 10 (dois GRAFCET)')
  r.set({ 'I0.0': true }); r.set({ 'I0.0': false })
  ok(r.active() === '1,4,10' && r.on('Q0.0') && r.on('Q0.2'), 'avançado: START → divergência E (etapas 1 e 4)')
  r.set({ 'I0.1': true })
  ok(r.active() === '2,4,10' && r.on('Q0.1'), 'avançado: garrafa em posição → enche')
  r.set({ 'I0.2': true })
  ok(r.active() === '3,4,10', 'avançado: garrafa cheia espera pela tampa')
  r.set({ 'I0.3': true }).scan() // a etapa 5 ativa-se e, no ciclo seguinte, a convergência dispara (evolução por ciclos)
  ok(r.active() === '6,10' && r.on('Q0.3'), 'avançado: convergência E → tampa')
  r.scan(1600)
  ok(r.active() === '7,10' && r.on('Q0.7') && !r.on('Q0.0') && !r.on('Q0.4'), 'avançado: após 1,5 s evacua pelo tapete de saída (ciclo único: H2 apagada)')
  r.set({ 'I0.1': false, 'I0.2': false, 'I0.3': false, 'I0.4': true })
  ok(r.active() === '0,10', 'avançado: garrafa saiu, ciclo único → repouso')
  r.set({ 'I0.4': false })

  // ciclo contínuo memorizado
  r.set({ 'I0.6': true, 'I0.0': true }); r.set({ 'I0.0': false })
  ok(r.on('M0.0'), 'avançado: seletor de ciclo memoriza M0.0 (ação S)')
  r.set({ 'I0.6': false, 'I0.1': true }); r.set({ 'I0.2': true }); r.set({ 'I0.3': true }); r.scan(1600)
  ok(r.active() === '7,10' && r.on('Q0.4'), 'avançado: ciclo contínuo acende H2 na evacuação')
  r.set({ 'I0.1': false, 'I0.2': false, 'I0.3': false, 'I0.4': true })
  ok(r.active() === '1,4,10' && r.on('M0.0'), 'avançado: ciclo contínuo reabre os dois ramos (seleção OU)')
  r.set({ 'I0.4': false })

  // emergência
  r.set({ 'I0.7': false })
  ok(r.active() === '1,4,11' && !r.on('Q0.0') && !r.on('Q0.2') && !r.on('M0.0'), 'avançado: emergência corta as saídas e repõe M0.0')
  const alarm = new Set<boolean>(); for (let i = 0; i < 8; i += 1) { r.scan(); alarm.add(r.on('Q0.6')) }
  ok(alarm.size === 2, 'avançado: alarme pisca a 2 Hz')
  r.set({ 'I0.7': true })
  ok(r.active() === '1,4,11', 'avançado: libertar a emergência não chega — falta o rearme')
  r.pulse('I0.5')
  ok(r.active() === '1,4,10' && r.on('Q0.0') && r.on('Q0.2'), 'avançado: rearme → retoma onde estava')
}

// ---- 4) Estampagem ATEC: 5 GRAFCETs, nomes das tags nas transições e comparações entre GRAFCETs
{
  const aliases = signalAliasMap(estampagem.tags.map((t) => ({ ...t, dataType: 'Bool' as const })) as never)
  setGrafcetSignalAliasResolver((name) => aliases.get(name))
  const graphs = grafcetGraphs(estampagem.program)
  ok(graphs.map((g) => g.key).join(',') === 'G0,G1,G2,G3,G4', 'estampagem: cinco GRAFCETs (G0 controlo, G1 emergência, G2 automático, G3 reset, G4 manual)')
  ok(graphs.map((g) => g.steps.length).join(',') === '6,2,12,3,2', 'estampagem: etapas por GRAFCET (6, 2, 12, 3, 2)')
  const transitions = estampagem.program.transitions ?? []
  ok(transitions.every((t) => !/(^|[^A-Za-z0-9_])[IQM]\d{1,2}\.\d(?![0-9])/.test(`${t.condition} ${t.guard ?? ''}`)), 'estampagem: nenhuma transição usa endereços — só nomes de tags')
  ok(transitions.some((t) => /G\d <> X\d/.test(t.condition)) && transitions.some((t) => /G\d <=> X\d/.test(t.condition)), 'estampagem: comparações entre GRAFCETs (<=> e <>)')
  ok(transitions.filter((t) => t.wireless).length >= 25, 'estampagem: voltas, emergência e abortos como transições sem linha (wireless)')
  const names = new Set(estampagem.tags.map((t) => t.name))
  const words = new Set(transitions.flatMap((t) => (`${t.condition} ${t.guard ?? ''}`.match(/[A-Za-z][A-Za-z0-9_]*/g) ?? [])))
  const unknown = [...words].filter((w) => !names.has(w) && !/^(G\d*|X\d+|[sS]|HZ)$/.test(w) && !/^\d/.test(w))
  ok(!unknown.length, `estampagem: todos os nomes usados existem na tabela de variáveis${unknown.length ? ' — ' + unknown.join(',') : ''}`)
  ok(estampagem.tags.every((t) => isUsableSignalName(t.name)), 'estampagem: todos os nomes de tags são utilizáveis nas condições')
  const issues = validateGrafcet(estampagem.program)
  ok(issues.every((issue) => issue.level === 'warning' && /^(addr|drive):Q\d\.\d+$/.test(issue.id)), 'estampagem: Diagnóstico só tem avisos de saídas partilhadas entre GRAFCETs exclusivos (auto/reset/manual)')

  const r = new Run(estampagem).scan()
  ok(r.active() === '0,10,20,40,50', 'estampagem: cada GRAFCET arranca na sua etapa inicial (0, 10, 20, 40, 50)')
  ok(r.on('Q0.7') && !r.on('Q1.2'), 'estampagem: pronto (L_Verde) em repouso')
  // automático
  r.pulse('I0.0')
  r.scan(300)
  ok(r.active() === '1,10,21,40,50' && r.on('Q1.2') && r.on('Q0.0'), 'estampagem: B_Start → G0 em X1 e o G2 arranca (alimenta)')
  r.set({ 'I0.1': true, 'I0.2': true }); r.scan(200)
  ok(r.active() === '1,10,23,40,50' && r.on('Q0.4'), 'estampagem: peça + tipo preta → transporta para a estampa')
  r.set({ 'I0.5': true }); r.scan(200)
  ok(r.active() === '1,10,24,40,50' && r.on('Q0.6'), 'estampagem: posição estampa + Preta → estampa')
  r.scan(4500)
  ok(r.active() === '1,10,24,40,50', 'estampagem: Preta ainda a estampar antes dos 5 s')
  r.scan(800)
  ok(r.active() === '1,10,27,40,50' && r.on('Q0.4') && !r.on('Q0.6'), 'estampagem: após 5 s transporta para o depósito')
  r.set({ 'I0.5': false, 'I0.6': true }); r.scan(200)
  ok(r.active() === '1,10,28,40,50' && r.on('Q0.1') && r.on('M0.1'), 'estampagem: deposita a Preta e conta')
  r.set({ 'I0.7': true }); r.scan(300)
  ok(r.on('Q0.5') || r.active().includes('31') || r.active().includes('20'), 'estampagem: gaveta recuada → retorno')
  r.set({ 'I1.2': true }); r.scan(300)
  ok(/^1,10,2[0-3],/.test(r.active()), 'estampagem: origem → ciclo fecha e recomeça (automático contínuo)')
  r.set({ 'I0.1': false, 'I0.2': false, 'I0.6': false, 'I0.7': false })
  // sair do automático a meio de um ciclo: o G0 fica em X2 (a terminar ciclo) até o G2 chegar ao repouso
  r.set({ 'I1.5': false }); r.scan(300)
  ok(r.active().startsWith('2,') && !r.active().includes(',20,'), 'estampagem: sair do automático a meio do ciclo → G0 em X2 (a terminar ciclo)')
  r.set({ 'I0.2': true, 'I0.5': true }); r.scan(6000)
  r.set({ 'I0.5': false, 'I0.6': true }); r.scan(300)
  r.set({ 'I0.7': true }); r.scan(300)
  r.set({ 'I0.6': false, 'I0.7': false, 'I1.2': true }); r.scan(500)
  ok(r.active() === '0,10,20,40,50', 'estampagem: ciclo terminado → G2 repousa → G0 volta à paragem')
  r.set({ 'I0.2': false, 'I0.1': false, 'I1.2': false })
  // manual
  r.set({ 'I1.4': true }); r.scan(500)
  ok(r.active() === '3,10,20,40,51' && r.on('Q1.1'), 'estampagem: modo manual → G0 X3, G4 X51, L_Azul')
  r.set({ 'I2.0': true }); r.scan(200)
  ok(r.on('Q0.0'), 'estampagem: Man_Alimenta aciona o alimentador')
  r.set({ 'I2.2': true }); r.scan(200)
  ok(!r.on('Q0.6'), 'estampagem: estampa manual bloqueada fora de Pos_Estampa')
  r.set({ 'I0.5': true }); r.scan(200)
  ok(r.on('Q0.6'), 'estampagem: estampa manual com Pos_Estampa')
  r.set({ 'I2.0': false, 'I2.2': false, 'I0.5': false, 'I1.4': false }); r.scan(500)
  ok(r.active() === '0,10,20,40,50', 'estampagem: sair do manual → tudo em repouso')
  // emergência e reset
  r.set({ 'I1.5': true }); r.pulse('I0.0'); r.scan(300)
  ok(r.active().startsWith('1,'), 'estampagem: automático novamente')
  r.set({ 'I1.7': false }); r.scan(500)
  ok(r.active() === '5,11,20,40,50' && r.on('Q1.3') && !r.on('Q0.0'), 'estampagem: emergência → G1 X11, G0 X5, G2 aborta, saídas cortadas')
  r.set({ 'I1.7': true }); r.scan(300)
  ok(r.active().startsWith('5,11'), 'estampagem: libertar a emergência não chega — falta o rearme')
  r.pulse('I1.6'); r.scan(500)
  ok(r.active() === '4,10,20,41,50' && r.on('Q0.5'), 'estampagem: rearme → G1 X10, G0 X4 e o G3 repõe a origem')
  r.set({ 'I1.2': true }); r.scan(600)
  ok(r.active() === '0,10,20,40,50', 'estampagem: origem → fim do reset → G0 em paragem')
  setGrafcetSignalAliasResolver(() => undefined)
}

console.log(`${checks} verificações dos exemplos GRAFCET passaram.`)
