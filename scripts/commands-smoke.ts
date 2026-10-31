// Simulador de comandos elétricos: modelo e motor de simulação (sem browser).
import { emptyCmdRuntime, stepCommands, type CmdRuntime } from '../src/commands/engine'
import { directStartExample, starDeltaExample } from '../src/commands/examples'
import { nextTag, terminalAt, wirePoints, type CommandsDiagram } from '../src/commands/model'

let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${!ok && detail ? ` :: ${detail}` : ''}`)
  if (!ok) failures++
}
const run = (diagram: CommandsDiagram) => {
  let rt: CmdRuntime = stepCommands(diagram, { ...emptyCmdRuntime(), running: true }, 0)
  return {
    get rt() { return rt },
    step(ms = 50) { rt = stepCommands(diagram, rt, ms); return rt },
    wait(ms: number) { for (let t = 0; t < ms; t += 50) rt = stepCommands(diagram, rt, 50); return rt },
    tap(tag: string) { rt = stepCommands(diagram, { ...rt, pressed: { ...rt.pressed, [tag]: true } }, 50); rt = stepCommands(diagram, { ...rt, pressed: { ...rt.pressed, [tag]: false } }, 50); return rt },
    set(patch: Partial<CmdRuntime>) { rt = stepCommands(diagram, { ...rt, ...patch }, 0); return rt },
  }
}
const motorOf = (d: CommandsDiagram, rt: CmdRuntime) => rt.motors[d.parts.find((p) => p.kind === 'motor3' || p.kind === 'motor6')!.id]

// --- Modelo
{
  const p = { id: 'k', kind: 'contactNO' as const, x: 100, y: 100, rot: 90 as const, tag: 'K1' }
  const t = terminalAt(p, 1)
  check('Modelo: rodar 90° leva o 2.º borne para a esquerda do 1.º', t.x === 40 && t.y === 100, JSON.stringify(t))
  const pts = wirePoints({ x: 0, y: 0 }, { x: 60, y: 100 })
  check('Modelo: os cabos são ortogonais', pts.slice(1).every((q, i) => q.x === pts[i].x || q.y === pts[i].y))
  check('Modelo: a próxima referência livre segue o prefixo IEC 81346', nextTag(starDeltaExample(), 'coil') === 'K4' && nextTag(starDeltaExample(), 'pushNO') === 'S2')
}

// --- Arranque direto
{
  const d = directStartExample()
  const s = run(d)
  check('Arranque direto: em repouso nada liga', !s.rt.coils.K1 && motorOf(d, s.rt).mode === 'stop')
  s.tap('S2')
  check('Arranque direto: S2 liga K1 e o motor roda no sentido horário', !!s.rt.coils.K1 && motorOf(d, s.rt).mode === 'run' && motorOf(d, s.rt).dir === 1)
  s.wait(1000)
  check('Arranque direto: a retenção K1 13-14 mantém o motor depois de largar S2', !!s.rt.coils.K1 && Object.values(s.rt.lamps).some(Boolean))
  s.tap('S1')
  check('Arranque direto: S1 (NF) para o motor', !s.rt.coils.K1 && motorOf(d, s.rt).mode === 'stop')
  s.tap('S2'); s.set({ tripped: { F1: true } })
  check('Arranque direto: o disparo do térmico F1 abre o 95-96 e para o motor', !s.rt.coils.K1)
  s.set({ tripped: {} })
  check('Arranque direto: rearmar o térmico não volta a arrancar sozinho', !s.rt.coils.K1)
  s.set({ toggled: { Q1: true } }); s.tap('S2')
  check('Arranque direto: com o disjuntor Q1 aberto o motor fica sem tensão', !!s.rt.coils.K1 && motorOf(d, s.rt).mode === 'stop')
}

// --- Inversão de fases e falta de fase
{
  const d = directStartExample()
  const motor = d.parts.find((p) => p.kind === 'motor3')!
  const toMotor = d.wires.filter((w) => w.b.part === motor.id)
  const [w0, w1] = toMotor
  ;[w0.b.term, w1.b.term] = [w1.b.term, w0.b.term]
  const s = run(d); s.tap('S2')
  check('Trocar duas fases inverte o sentido de rotação', motorOf(d, s.rt).mode === 'run' && motorOf(d, s.rt).dir === -1)
  const lost = directStartExample()
  const m = lost.parts.find((p) => p.kind === 'motor3')!
  lost.wires = lost.wires.filter((w) => !(w.b.part === m.id && w.b.term === 2))
  const s2 = run(lost); s2.tap('S2')
  check('Sem uma fase o motor não arranca e o estado indica falta de fase', motorOf(lost, s2.rt).mode === 'stop' && !!motorOf(lost, s2.rt).phaseLoss)
}

// --- Estrela-triângulo
{
  const d = starDeltaExample()
  const s = run(d)
  s.tap('S1')
  check('Estrela-triângulo: S1 liga K1, K6 e K3 — motor em estrela', !!s.rt.coils.K1 && !!s.rt.coils.K6 && !!s.rt.coils.K3 && !s.rt.coils.K2 && motorOf(d, s.rt).mode === 'star')
  let overlap = false
  for (let t = 0; t < 6000; t += 50) { s.step(); if (s.rt.coils.K2 && s.rt.coils.K3) overlap = true }
  check('Estrela-triângulo: após 5 s de K6 passa a triângulo (K3 desliga, K2 liga)', !s.rt.coils.K3 && !!s.rt.coils.K2 && motorOf(d, s.rt).mode === 'delta')
  check('Estrela-triângulo: K2 e K3 nunca ficam ligados ao mesmo tempo (encravamento)', !overlap && !s.rt.fault)
  s.tap('S0')
  check('Estrela-triângulo: S0 desliga tudo', !Object.values(s.rt.coils).some(Boolean) && motorOf(d, s.rt).mode === 'stop')
}

// --- Curto-circuito e oscilação
{
  const d = starDeltaExample()
  for (const p of d.parts) if (p.kind === 'contactNC' || p.kind === 'timedNC') p.kind = 'fuse'
  const s = run(d); s.tap('S1'); s.wait(5200)
  check('Sem encravamento, K2 com K3 é detetado como curto-circuito e a simulação para', !!s.rt.fault?.includes('Curto-circuito') && !s.rt.running, s.rt.fault)
  s.step()
  check('A mensagem do curto-circuito mantém-se enquanto a simulação está parada', !!s.rt.fault)
  const osc = directStartExample()
  const seal = osc.parts.find((p) => p.kind === 'pushNC')!
  seal.kind = 'contactNC'; seal.tag = 'K1'
  const s2 = run(osc); s2.tap('S2')
  check('Uma bobina que se desliga a si própria é detetada como oscilação', !!s2.rt.fault?.includes('oscila'), s2.rt.fault)
}

// --- Gravação: o esquema de comandos vai no ficheiro do projeto e volta ao reabrir
{
  const { useSimStore } = await import('../src/store/useSimStore')
  const store = useSimStore.getState()
  store.newProject('commands')
  useSimStore.getState().setCommands(starDeltaExample())
  const json = useSimStore.getState().saveJSON() as unknown as string
  useSimStore.getState().newProject('commands')
  const cleared = useSimStore.getState().commands.parts.length === 0
  useSimStore.getState().loadJSON(typeof json === 'string' ? json : JSON.stringify(json))
  const back = useSimStore.getState()
  check('Gravação: guardar e reabrir conserva o esquema e o tipo «Comandos elétricos»', cleared && back.commands.parts.length === starDeltaExample().parts.length && back.commands.wires.length === starDeltaExample().wires.length && back.projectKind === 'commands')
  useSimStore.getState().setCommands({ ...back.commands, parts: [] })
  useSimStore.getState().undo()
  check('Gravação: Desfazer também repõe o esquema de comandos', useSimStore.getState().commands.parts.length === starDeltaExample().parts.length)
}

console.log(`\n${failures === 0 ? '✅ TODOS OS TESTES PASSARAM' : '❌ ' + failures + ' TESTE(S) FALHARAM'}`)
process.exit(failures === 0 ? 0 : 1)
