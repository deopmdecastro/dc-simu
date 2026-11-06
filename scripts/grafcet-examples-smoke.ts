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
  /** Etapas ativas dos GRAFCETs de funcionamento (G0–G3, numeração < 50). */
  core() { return this.active().split(',').filter((n) => Number(n) < 50).join(',') }
  /** Etapas ativas dos GRAFCETs manuais (G4–G15, numeração ≥ 50). */
  manual() { return this.active().split(',').filter((n) => Number(n) >= 50).join(',') }
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
  ok(graphs.map((g) => g.key).join(',') === Array.from({ length: 16 }, (_, i) => `G${i}`).join(','), 'estampagem: 16 GRAFCETs (G0 controlo, G1 emergência, G2 automático, G3 reset, G4–G15 manuais)')
  ok(graphs.map((g) => g.steps.length).join(',') === '6,2,12,3,' + Array(12).fill(2).join(','), 'estampagem: etapas por GRAFCET (6, 2, 12, 3 e 2 em cada manual)')
  const titles = (estampagem.program.comments ?? []).map((c) => c.text)
  ok(['Alimentador', 'Transportador rotativo', 'Cilindro de estampa', 'Gaveta Preta', 'Gaveta Branca', 'Gaveta Metálica', 'Retorno à origem', 'Lâmpada verde', 'Lâmpada de alarme', 'Lâmpada azul', 'Lâmpada branca', 'Lâmpada vermelha']
    .every((name) => titles.some((t) => /^G\d+ - (Cilindro|Motor|Lâmpada) · /.test(t) && t.endsWith(name))), 'estampagem: um título «G<n> - …» por cada atuador e lâmpada')
  const outputs = new Set(estampagem.program.steps.flatMap((s) => (s.actions ?? []).map((a) => a.address)).filter((a) => a.startsWith('Q')))
  const manualOutputs = new Set(estampagem.program.steps.filter((s) => Number(s.name) >= 50).flatMap((s) => (s.actions ?? []).map((a) => a.address)))
  ok([...outputs].every((address) => manualOutputs.has(address)) && manualOutputs.size === 12, 'estampagem: todas as saídas Q (cilindros, motores e lâmpadas) têm o seu manual')
  ok(['Man_Alimenta', 'Man_Transporte', 'Man_Estampa', 'Man_Gaveta_Preta', 'Man_Gaveta_Branca', 'Man_Gaveta_Metal', 'Man_Retorno', 'Man_L_Verde', 'Man_L_Alarme', 'Man_L_Azul', 'Man_L_Branca', 'Man_L_Vermelha'].every((n) => estampagem.tags.some((t) => t.name === n)), 'estampagem: um botão Man_* por atuador e lâmpada')
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
  ok(r.core() === '0,10,20,40', 'estampagem: cada GRAFCET arranca na sua etapa inicial (0, 10, 20, 40) e cada manual no repouso')
  ok(r.on('Q0.7') && !r.on('Q1.2'), 'estampagem: pronto (L_Verde) em repouso')
  // automático
  r.pulse('I0.0')
  r.scan(300)
  ok(r.core() === '1,10,21,40' && r.on('Q1.2') && r.on('Q0.0'), 'estampagem: B_Start → G0 em X1 e o G2 arranca (alimenta)')
  r.set({ 'I0.1': true, 'I0.2': true }); r.scan(200)
  ok(r.core() === '1,10,23,40' && r.on('Q0.4'), 'estampagem: peça + tipo preta → transporta para a estampa')
  r.set({ 'I0.5': true }); r.scan(200)
  ok(r.core() === '1,10,24,40' && r.on('Q0.6'), 'estampagem: posição estampa + Preta → estampa')
  r.scan(4500)
  ok(r.core() === '1,10,24,40', 'estampagem: Preta ainda a estampar antes dos 5 s')
  r.scan(800)
  ok(r.core() === '1,10,27,40' && r.on('Q0.4') && !r.on('Q0.6'), 'estampagem: após 5 s transporta para o depósito')
  r.set({ 'I0.5': false, 'I0.6': true }); r.scan(200)
  ok(r.core() === '1,10,28,40' && r.on('Q0.1') && r.on('M0.1'), 'estampagem: deposita a Preta e conta')
  r.set({ 'I0.7': true }); r.scan(300)
  ok(r.on('Q0.5') || r.core().includes('31') || r.core().includes('20'), 'estampagem: gaveta recuada → retorno')
  r.set({ 'I1.2': true }); r.scan(300)
  ok(/^1,10,2[0-3],/.test(r.core()), 'estampagem: origem → ciclo fecha e recomeça (automático contínuo)')
  r.set({ 'I0.1': false, 'I0.2': false, 'I0.6': false, 'I0.7': false })
  // sair do automático a meio de um ciclo: o G0 fica em X2 (a terminar ciclo) até o G2 chegar ao repouso
  r.set({ 'I1.5': false }); r.scan(300)
  ok(r.core().startsWith('2,') && !r.core().includes(',20,'), 'estampagem: sair do automático a meio do ciclo → G0 em X2 (a terminar ciclo)')
  r.set({ 'I0.2': true, 'I0.5': true }); r.scan(6000)
  r.set({ 'I0.5': false, 'I0.6': true }); r.scan(300)
  r.set({ 'I0.7': true }); r.scan(300)
  r.set({ 'I0.6': false, 'I0.7': false, 'I1.2': true }); r.scan(500)
  ok(r.core() === '0,10,20,40', 'estampagem: ciclo terminado → G2 repousa → G0 volta à paragem')
  r.set({ 'I0.2': false, 'I0.1': false, 'I1.2': false })
  // manual: um GRAFCET por atuador/lâmpada, toque liga e novo toque desliga
  r.set({ 'I1.4': true }); r.scan(500)
  ok(r.core() === '3,10,20,40' && r.on('Q1.1') && r.manual() === '50,52,54,56,58,60,62,70,72,74,76,78', 'estampagem: modo manual → G0 X3, L_Azul, todos os manuais ainda em repouso')
  const devices: Array<[string, string, string, string?]> = [
    ['Alimentador', 'I2.0', 'Q0.0'], ['Transportador', 'I2.1', 'Q0.4'], ['Retorno', 'I2.6', 'Q0.5'],
    ['Lâmpada alarme', 'I3.0', 'Q1.0'], ['Lâmpada branca', 'I3.2', 'Q1.2'], ['Lâmpada vermelha', 'I3.3', 'Q1.3'],
  ]
  for (const [label, button, out] of devices) {
    r.pulse(button); r.scan(200)
    ok(r.on(out), `estampagem: manual ${label} — 1.º toque liga ${out}`)
    r.scan(500)
    ok(r.on(out), `estampagem: manual ${label} — mantém ligado sem novo toque`)
    r.pulse(button); r.scan(200)
    ok(!r.on(out), `estampagem: manual ${label} — novo toque desliga ${out}`)
  }
  // L_Verde (Pronto, G2 em repouso) e L_Azul (G0 em X3) já estão ligadas por outro GRAFCET: o manual vê-se na etapa, a saída mantém-se
  for (const [label, button, out, stepOn] of [['verde', 'I2.7', 'Q0.7', '71'], ['azul', 'I3.1', 'Q1.1', '75']]) {
    r.pulse(button); r.scan(200)
    ok(r.manual().split(',').includes(stepOn) && r.on(out), `estampagem: manual lâmpada ${label} — etapa ${stepOn} ativa (${out} já acesa por outro GRAFCET)`)
    r.pulse(button); r.scan(200)
    ok(!r.manual().split(',').includes(stepOn) && r.on(out), `estampagem: manual lâmpada ${label} — novo toque volta ao repouso`)
  }
  r.pulse('I2.2'); r.scan(200)
  ok(!r.on('Q0.6') && r.manual().includes('54'), 'estampagem: estampa manual bloqueada fora de Pos_Estampa')
  r.set({ 'I0.5': true }); r.pulse('I2.2'); r.scan(200)
  ok(r.on('Q0.6') && r.manual().includes('55'), 'estampagem: estampa manual com Pos_Estampa liga')
  r.set({ 'I0.5': false }); r.scan(200)
  ok(!r.on('Q0.6') && r.manual().includes('54'), 'estampagem: estampa manual desliga se Pos_Estampa se perder')
  for (const [label, button, out] of [['Preta', 'I2.3', 'Q0.1'], ['Branca', 'I2.4', 'Q0.2'], ['Metálica', 'I2.5', 'Q0.3']]) {
    r.pulse(button); r.scan(200)
    ok(!r.on(out), `estampagem: gaveta ${label} manual bloqueada fora de Pos_Deposito`)
    r.set({ 'I0.6': true }); r.pulse(button); r.scan(200)
    ok(r.on(out), `estampagem: gaveta ${label} manual com Pos_Deposito liga ${out}`)
    r.pulse(button); r.scan(200)
    ok(!r.on(out), `estampagem: gaveta ${label} manual — novo toque desliga`)
    r.set({ 'I0.6': false })
  }
  // vários ao mesmo tempo e saída do manual desliga tudo
  r.pulse('I2.0'); r.pulse('I2.1'); r.pulse('I2.7'); r.scan(200)
  ok(r.on('Q0.0') && r.on('Q0.4') && r.on('Q0.7'), 'estampagem: vários manuais ligados em simultâneo (alimentador, transportador, lâmpada verde)')
  r.set({ 'I1.4': false }); r.scan(500)
  ok(r.core() === '0,10,20,40' && !r.on('Q0.0') && !r.on('Q0.4') && r.manual() === '50,52,54,56,58,60,62,70,72,74,76,78', 'estampagem: sair do manual → tudo em repouso e saídas desligadas')
  // toques em Man_* fora do modo manual não fazem nada
  r.pulse('I2.0'); r.scan(200)
  ok(!r.on('Q0.0') && r.manual().includes('50'), 'estampagem: Man_* ignorado com o G0 fora do manual')
  // emergência em manual desliga os atuadores
  r.set({ 'I1.4': true }); r.scan(500); r.pulse('I2.1'); r.scan(200)
  ok(r.on('Q0.4'), 'estampagem: manual ligado antes da emergência')
  r.set({ 'I1.7': false }); r.scan(500)
  ok(r.core().startsWith('5,11') && !r.on('Q0.4') && r.manual() === '50,52,54,56,58,60,62,70,72,74,76,78', 'estampagem: emergência em manual desliga o atuador e repõe o manual')
  r.set({ 'I1.7': true, 'I1.4': false }); r.pulse('I1.6'); r.set({ 'I1.2': true }); r.scan(800); r.set({ 'I1.2': false }); r.scan(300)
  ok(r.core() === '0,10,20,40', 'estampagem: rearme + reset → paragem')
  // emergência e reset
  r.set({ 'I1.5': true }); r.pulse('I0.0'); r.scan(300)
  ok(r.core().startsWith('1,'), 'estampagem: automático novamente')
  r.set({ 'I1.7': false }); r.scan(500)
  ok(r.core() === '5,11,20,40' && r.on('Q1.3') && !r.on('Q0.0'), 'estampagem: emergência → G1 X11, G0 X5, G2 aborta, saídas cortadas')
  r.set({ 'I1.7': true }); r.scan(300)
  ok(r.core().startsWith('5,11'), 'estampagem: libertar a emergência não chega — falta o rearme')
  r.pulse('I1.6'); r.scan(500)
  ok(r.core() === '4,10,20,41' && r.on('Q0.5'), 'estampagem: rearme → G1 X10, G0 X4 e o G3 repõe a origem')
  r.set({ 'I1.2': true }); r.scan(600)
  ok(r.core() === '0,10,20,40', 'estampagem: origem → fim do reset → G0 em paragem')
  setGrafcetSignalAliasResolver(() => undefined)
}

console.log(`${checks} verificações dos exemplos GRAFCET passaram.`)
