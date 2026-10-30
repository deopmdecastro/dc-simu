import assert from 'node:assert/strict'
import { emptyGrafcetRuntime, scanGrafcet, validateGrafcet, validCondition, type GrafcetRuntime } from '../src/grafcet/engine'
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

const [basic, normal, advanced] = grafcetExamples()
ok(grafcetExamples().length === 3 && basic.level === 'básico' && normal.level === 'normal' && advanced.level === 'avançado', 'três exemplos: básico, normal e avançado')

for (const example of [basic, normal, advanced]) {
  const issues = validateGrafcet(example.program)
  ok(issues.length === 0, `${example.level}: GRAFCET sem erros nem avisos no Diagnóstico${issues.length ? ' — ' + JSON.stringify(issues) : ''}`)
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

console.log(`${checks} verificações dos exemplos GRAFCET passaram.`)
