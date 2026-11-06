import type { GrafcetAction, GrafcetComment, GrafcetProgram, GrafcetStep, GrafcetTransition } from '../grafcet/engine'
import { autoLayout, stepFootprint } from '../grafcet/layout'
import { organizeGrafcetPage } from '../grafcet/organize'
import type { CanvasNote } from '../types'

/**
 * Exemplos GRAFCET funcionais (básico, normal, avançado + Estampagem ATEC), com tabela de sinais, textos no desenho
 * e comentários (notas com conversa) a explicar como testar. São projetos só GRAFCET semeados no painel
 * (como o projeto nativo) e também aparecem nos «Modelos GRAFCET».
 *
 * As entradas usam endereços de PLC (I0.x, Q0.x, M0.x) com nomes na tabela de sinais: o simulador mostra
 * os nomes e as condições continuam válidas no Ladder gerado. IDs estáveis: os testes seguem-nos.
 */

export type ExampleTag = { id: string; address: string; name: string; dataType: 'Bool'; comment: string }
export interface GrafcetExample {
  id: string
  /** Marca do projeto semeado (muda quando o exemplo muda: o painel repõe a versão nova). */
  nativeId: string
  level: 'básico' | 'normal' | 'avançado'
  name: string
  title: string
  description: string
  program: GrafcetProgram
  tags: ExampleTag[]
  notes: Array<Omit<CanvasNote, 'createdAt'>>
  /** Entradas em repouso (sensores já atuados no arranque, ex.: cilindro em cima): o estado inicial da simulação. */
  restInputs: Record<string, boolean>
  /** Tipo de cada entrada no painel de simulação: botão (push), NF (nc) ou interruptor (latch, omissão). */
  inputModes: Record<string, 'push' | 'nc' | 'latch'>
  /** Contagens do painel virtual (omissão: 8/8/4). */
  virtualInputCount?: number
  virtualOutputCount?: number
  virtualMemoryCount?: number
}

type ManualDevice = { title: string; kind: 'Cilindro' | 'Motor' | 'Lâmpada'; address: string; out: string; button: string; first: number; position?: string }
type Act = [kind: GrafcetAction['kind'], address: string, variable: string, label?: string, extra?: Partial<GrafcetAction>]

const action = (prefix: string, index: number, [kind, address, variable, label, extra]: Act): GrafcetAction => ({
  id: `${prefix}-a${index}`, address, variable, description: label ?? variable, condition: '1', kind, displayDescription: true, ...extra,
})

function step(prefix: string, name: string, description: string, actions: Act[] = [], options: Partial<GrafcetStep> = {}): GrafcetStep {
  return {
    id: `${prefix}-s${name}`, name, initial: false, stepType: 'simple', action: '', condition: '', description,
    actions: actions.map((item, index) => action(`${prefix}-s${name}`, index, item)), ...options,
  }
}

const initial = (prefix: string, name: string, description: string, actions: Act[] = []) =>
  step(prefix, name, description, actions, { initial: true, stepType: 'initial' })

function link(prefix: string, name: string, from: GrafcetStep[], to: GrafcetStep[], condition: string, description: string, extra: Partial<GrafcetTransition> = {}): GrafcetTransition {
  return {
    id: `${prefix}-${name.toLowerCase()}`, name, from: from.map((item) => item.id), to: to.map((item) => item.id), condition, description, displayDescription: true,
    ...(to.length > 1 ? { branchType: 'and-divergence' as const } : from.length > 1 ? { branchType: 'and-convergence' as const } : {}),
    ...extra,
  }
}

/**
 * Posições: as indicadas à mão (ramos lado a lado, GRAFCET de segurança à parte) ou, na falta delas, as do
 * botão «Organizar». Devolve os limites, para colocar textos e comentários à volta.
 */
function placed(steps: GrafcetStep[], transitions: GrafcetTransition[], at: Record<string, [number, number]> = {}) {
  const positions = autoLayout(steps, transitions)
  const laid = steps.map((item) => {
    const manual = at[item.name]
    if (manual) return { ...item, x: manual[0], y: manual[1], pinned: true }
    const auto = positions.get(item.id)
    return auto ? { ...item, x: auto.x, y: auto.y, pinned: true } : item
  })
  const xs = laid.map((item) => item.x ?? 151)
  const ys = laid.map((item) => item.y ?? 70)
  return { steps: laid, minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
}

const text = (id: string, value: string, x: number, y: number, style: Partial<GrafcetComment> = {}): GrafcetComment => ({ id, text: value, x, y, fontSize: 12, ...style })

function note(id: string, title: string, x: number, y: number, color: string, messages: string[]): Omit<CanvasNote, 'createdAt'> {
  const at = '2026-10-30T10:00:00.000Z'
  return {
    id, text: title, view: 'grafcet', x, y, color,
    messages: messages.map((value, index) => ({ id: `${id}-m${index}`, text: value, author: 'DC-SIMU', createdAt: at })),
  }
}

const tag = (address: string, name: string, comment: string): ExampleTag => ({ id: `tag-${address}`, address, name, dataType: 'Bool', comment })

/* ------------------------------------------------------------------------------------------------
 * 1) BÁSICO — Prensa pneumática: sequência linear com temporização
 * ---------------------------------------------------------------------------------------------- */
function prensa(): GrafcetExample {
  const p = 'ex1'
  const s0 = initial(p, '0', 'Repouso — pronta', [['N', 'Q0.2', 'H_PRONTO', 'H1 Pronto']])
  const s1 = step(p, '1', 'Descer o cilindro', [['N', 'Q0.0', 'Y_DESCER', 'Y1 Descer']])
  // Válvula 5/2 biestável: o cilindro fica em baixo sem manter Y1 — a etapa 2 só sinaliza a prensagem.
  const s2 = step(p, '2', 'Prensar 2 s', [['N', 'Q0.3', 'H_PRENSA', 'H2 A prensar']])
  const s3 = step(p, '3', 'Subir o cilindro', [['N', 'Q0.1', 'Y_SUBIR', 'Y2 Subir']])
  const transitions = [
    link(p, 'T1', [s0], [s1], 'I0.0*I0.1*I0.3', 'START · peça presente · cilindro em cima'),
    link(p, 'T2', [s1], [s2], 'I0.2', 'Fim de curso em baixo (b1)'),
    link(p, 'T3', [s2], [s3], '2s/X2', 'Passaram 2 s na etapa 2'),
    link(p, 'T4', [s3], [s0], 'I0.3', 'Fim de curso em cima (b0)', { targetInfo: '0' }),
  ]
  const layout = placed([s0, s1, s2, s3], transitions, { 0: [151, 80], 1: [151, 210], 2: [151, 340], 3: [151, 470] })
  const right = layout.maxX + 330
  return {
    id: 'grafcet-exemplo-basico', nativeId: 'grafcet-exemplo-basico-v1', level: 'básico',
    name: 'Exemplo GRAFCET 1 · Básico — Prensa pneumática',
    title: 'Prensa pneumática (sequência linear + temporização)',
    description: 'Quatro etapas em sequência: descer, prensar 2 s, subir e voltar ao repouso. Introduz etapa inicial, ações N, receptividades com E lógico e temporização 2s/X2.',
    program: {
      name: 'Prensa pneumática',
      steps: layout.steps,
      transitions,
      comments: [
        text(`${p}-c-title`, 'Prensa pneumática — exemplo básico', layout.minX - 60, layout.minY - 46, { fontSize: 16, fontWeight: '700', color: '#0f172a' }),
        text(`${p}-c-how`, 'Ciclo: START com peça → desce → prensa 2 s → sobe → repouso.', right, layout.minY, { color: '#334155' }),
        text(`${p}-c-io`, 'Entradas: I0.0 START · I0.1 peça · I0.2 b1 (baixo) · I0.3 b0 (cima)', right, layout.minY + 24, { font: 'mono', fontSize: 11, color: '#475569' }),
        text(`${p}-c-out`, 'Saídas: Q0.0 Y1 descer · Q0.1 Y2 subir · Q0.2 H1 pronto · Q0.3 H2 a prensar', right, layout.minY + 44, { font: 'mono', fontSize: 11, color: '#475569' }),
        text(`${p}-c-valve`, 'Válvula biestável: o cilindro mantém a posição sem sinal.', right, layout.minY + 72, { italic: true, color: '#0369a1' }),
        text(`${p}-c-timer`, '«2s/X2»: verdadeira 2 s depois de a etapa 2 ficar ativa.', right, layout.minY + 94, { italic: true, color: '#7c3aed' }),
      ],
    },
    tags: [
      tag('I0.0', 'START', 'Botão de arranque (NA)'), tag('I0.1', 'PECA', 'Sensor de peça presente'),
      tag('I0.2', 'B1_BAIXO', 'Fim de curso: cilindro em baixo'), tag('I0.3', 'B0_CIMA', 'Fim de curso: cilindro em cima'),
      tag('Q0.0', 'Y_DESCER', 'Eletroválvula Y1 — descer (5/2 biestável)'), tag('Q0.1', 'Y_SUBIR', 'Eletroválvula Y2 — subir'), tag('Q0.2', 'H_PRONTO', 'Lâmpada pronta'),
      tag('Q0.3', 'H_PRENSA', 'Lâmpada a prensar'),
    ],
    notes: [
      note(`${p}-n-test`, 'Como testar', right, layout.minY + 200, '#fde68a', [
        'Em Simulação, ligue I0.3 (cilindro em cima) e I0.1 (peça) — H1 acende na etapa 0.',
        'Carregue em I0.0 (START): a etapa 1 ativa Y1. Ligue I0.2 e desligue I0.3 (o cilindro chegou abaixo).',
        'Espere 2 s na etapa 2; na etapa 3 sai Y2. Volte a ligar I0.3 (e desligue I0.2): regressa à etapa 0.',
      ]),
    ],
    restInputs: { 'I0.3': true },
    inputModes: { 'I0.0': 'push' },
  }
}

/* ------------------------------------------------------------------------------------------------
 * 2) NORMAL — Portão automático: seleção OU (reabrir), temporização e ação condicionada
 * ---------------------------------------------------------------------------------------------- */
function portao(): GrafcetExample {
  const p = 'ex2'
  const s0 = initial(p, '0', 'Portão fechado')
  const s1 = step(p, '1', 'A abrir', [['N', 'Q0.0', 'KM_ABRIR', 'KM1 Abrir'], ['N', 'Q0.4', 'H_ABRIR', 'H3 A abrir']])
  const s2 = step(p, '2', 'Aberto — espera 5 s', [['N', 'Q0.3', 'H_LIVRE', 'H2 Passagem livre']])
  // Ação condicionada: o pirilampo pisca a 1 Hz só durante o fecho (é aí que há risco para quem passa).
  const s3 = step(p, '3', 'A fechar', [['N', 'Q0.1', 'KM_FECHAR', 'KM2 Fechar'], ['N', 'Q0.2', 'H_PISCA', 'H1 Pirilampo', { condition: '1HZ', type: 'conditional' }]])
  const transitions = [
    link(p, 'T1', [s0], [s1], '^I0.0', 'Impulso do comando (flanco ↑)'),
    link(p, 'T2', [s1], [s2], 'I0.1', 'Fim de curso aberto'),
    link(p, 'T3', [s2], [s3], '5s/X2+^I0.0', '5 s ou novo impulso'),
    // Seleção OU à saída da etapa 3: fecha (volta a 0) OU reabre por segurança (volta a 1).
    link(p, 'T4', [s3], [s0], 'I0.2*I0.3', 'Fim de curso fechado (fotocélula livre)', { targetInfo: '0' }),
    link(p, 'T5', [s3], [s1], '!I0.3+^I0.0', 'Fotocélula interrompida ou comando: reabrir', { targetInfo: '1' }),
  ]
  const layout = placed([s0, s1, s2, s3], transitions, { 0: [151, 80], 1: [151, 210], 2: [151, 340], 3: [151, 470] })
  const right = layout.maxX + 500
  return {
    id: 'grafcet-exemplo-normal', nativeId: 'grafcet-exemplo-normal-v1', level: 'normal',
    name: 'Exemplo GRAFCET 2 · Normal — Portão automático',
    title: 'Portão automático (seleção OU, flancos e ações condicionadas)',
    description: 'Abre com um impulso, espera 5 s aberto e fecha. A fotocélula reabre o portão (divergência OU), o pirilampo pisca a 1 Hz enquanto se move e o comando usa flanco ascendente.',
    program: {
      name: 'Portão automático',
      steps: layout.steps,
      transitions,
      // Duas saídas da etapa 3 (seleção OU): T4 regressa pela esquerda (traçado automático) e T5 sobe pela
      // direita — sem isto as duas barras ficavam uma em cima da outra.
      linkBends: { [`${p}-t5`]: [{ x: 151, y: 542 }, { x: 571, y: 542 }, { x: 571, y: 186 }, { x: 151, y: 186 }] },
      comments: [
        text(`${p}-c-title`, 'Portão automático — exemplo normal', layout.minX - 60, layout.minY - 46, { fontSize: 16, fontWeight: '700', color: '#0f172a' }),
        text(`${p}-c-or`, 'Divergência OU na etapa 3: só uma das saídas dispara.', right, layout.minY, { color: '#334155' }),
        text(`${p}-c-safety`, 'Segurança: fotocélula (I0.3, NF) interrompida → reabrir.', right, layout.minY + 22, { color: '#b91c1c', fontWeight: '600' }),
        text(`${p}-c-edge`, '«^I0.0» = flanco ascendente: manter o botão premido não repete o ciclo.', right, layout.minY + 44, { italic: true, color: '#7c3aed' }),
        text(`${p}-c-io`, 'I0.0 comando · I0.1 fc aberto · I0.2 fc fechado · I0.3 fotocélula', right, layout.minY + 70, { font: 'mono', fontSize: 11, color: '#475569' }),
        text(`${p}-c-out`, 'Q0.0 KM1 abrir · Q0.1 KM2 fechar · Q0.2 pirilampo · Q0.3 livre · Q0.4 a abrir', right, layout.minY + 90, { font: 'mono', fontSize: 11, color: '#475569' }),
      ],
    },
    tags: [
      tag('I0.0', 'COMANDO', 'Comando / botão de impulso'), tag('I0.1', 'FC_ABERTO', 'Fim de curso: portão aberto'),
      tag('I0.2', 'FC_FECHADO', 'Fim de curso: portão fechado'), tag('I0.3', 'FOTOCELULA', 'Fotocélula (NF: 1 = livre)'),
      tag('Q0.0', 'KM_ABRIR', 'Contactor KM1 — abrir'), tag('Q0.1', 'KM_FECHAR', 'Contactor KM2 — fechar'),
      tag('Q0.2', 'H_PISCA', 'Pirilampo (pisca a 1 Hz no fecho)'), tag('Q0.3', 'H_LIVRE', 'Sinal verde de passagem'), tag('Q0.4', 'H_ABRIR', 'Sinal âmbar: a abrir'),
    ],
    notes: [
      note(`${p}-n-test`, 'Como testar', right + 160, layout.minY + 200, '#bbf7d0', [
        'Comece com I0.2 (fechado) e I0.3 (fotocélula livre) ligados. Dê um impulso em I0.0: KM1 abre e acende H3 (âmbar).',
        'Ligue I0.1 (aberto) e desligue I0.2: etapa 2, sinal verde. Após 5 s começa a fechar (KM2) e o pirilampo pisca.',
        'Durante o fecho, desligue I0.3 (alguém passou): o portão reabre. Volte a ligar I0.3 e deixe chegar a I0.2 para terminar.',
      ]),
      note(`${p}-n-interlock`, 'Encravamento', right + 160, layout.minY + 380, '#fecaca', [
        'KM1 e KM2 nunca estão ativos ao mesmo tempo: estão em etapas diferentes e as etapas 1 e 3 excluem-se.',
        'No quadro real acrescente o encravamento elétrico (contacto NF de KM2 na bobina de KM1 e vice-versa).',
      ]),
    ],
    restInputs: { 'I0.2': true, 'I0.3': true },
    inputModes: { 'I0.0': 'push', 'I0.3': 'nc' },
  }
}

/* ------------------------------------------------------------------------------------------------
 * 3) AVANÇADO — Enchimento e tampagem: paralelismo E, memória S/R, ciclo contínuo e emergência
 * ---------------------------------------------------------------------------------------------- */
function enchimento(): GrafcetExample {
  const p = 'ex3'
  // Todas as saídas de produção só atuam com o GRAFCET de segurança em X10 (emergência libertada e rearmada).
  const safe = (extra: Partial<GrafcetAction> = {}): Partial<GrafcetAction> => ({ condition: 'X10', type: 'conditional', ...extra })
  const s0 = initial(p, '0', 'Repouso / reset', [['N', 'Q0.5', 'H_PRONTO', 'H1 Pronto', safe()], ['R', 'M0.0', 'CICLO', 'Repor ciclo contínuo']])
  const s1 = step(p, '1', 'Transportar garrafa', [['N', 'Q0.0', 'KM_TAPETE', 'KM1 Tapete de entrada', safe()], ['S', 'M0.0', 'CICLO', 'Memorizar ciclo contínuo', { condition: 'I0.6', type: 'conditional' }]])
  const s2 = step(p, '2', 'Encher', [['N', 'Q0.1', 'Y_VALVULA', 'Y1 Válvula de enchimento', safe()]])
  const s3 = step(p, '3', 'Garrafa cheia')
  const s4 = step(p, '4', 'Preparar tampa', [['N', 'Q0.2', 'Y_TAMPA', 'Y2 Alimentador de tampas', safe()]])
  const s5 = step(p, '5', 'Tampa pronta')
  const s6 = step(p, '6', 'Tampar 1,5 s', [['N', 'Q0.3', 'Y_ROSCAR', 'Y3 Roscar tampa', safe()]])
  const s7 = step(p, '7', 'Evacuar garrafa', [['N', 'Q0.7', 'KM_SAIDA', 'KM2 Tapete de saída', safe()], ['N', 'Q0.4', 'H_CICLO', 'H2 Ciclo contínuo', { condition: 'M0.0', type: 'conditional' }]])
  // GRAFCET de segurança (corre em paralelo com o de produção: tem a sua própria etapa inicial).
  const s10 = initial(p, '10', 'Segurança OK')
  const s11 = step(p, '11', 'Emergência', [['N', 'Q0.6', 'H_ALARME', 'H3 Alarme', { condition: '2HZ', type: 'conditional' }], ['R', 'M0.0', 'CICLO', 'Repor ciclo contínuo']])
  const transitions = [
    link(p, 'T1', [s0], [s1, s4], 'I0.0*X10', 'START com segurança OK'),
    link(p, 'T2', [s1], [s2], 'I0.1', 'Garrafa na posição de enchimento'),
    link(p, 'T3', [s2], [s3], 'I0.2', 'Nível atingido'),
    link(p, 'T4', [s4], [s5], 'I0.3', 'Tampa no alimentador'),
    link(p, 'T5', [s3, s5], [s6], 'X10', 'Sincronização: garrafa cheia E tampa pronta'),
    link(p, 'T6', [s6], [s7], '1.5s/X6', 'Passou 1,5 s a roscar'),
    // Seleção OU no fim: ciclo contínuo reabre os dois ramos; ciclo único regressa ao repouso.
    link(p, 'T7', [s7], [s1, s4], 'I0.4*M0.0*X10', 'Garrafa saiu · ciclo contínuo', { targetInfo: '1, 4' }),
    link(p, 'T8', [s7], [s0], 'I0.4*!M0.0', 'Garrafa saiu · ciclo único', { targetInfo: '0' }),
    link(p, 'T10', [s10], [s11], '!I0.7', 'Emergência premida'),
    link(p, 'T11', [s11], [s10], 'I0.7*^I0.5', 'Emergência libertada + rearme (flanco)', { targetInfo: '10' }),
  ]
  const layout = placed([s0, s1, s2, s3, s4, s5, s6, s7, s10, s11], transitions, {
    0: [151, 80], 1: [151, 230], 2: [151, 360], 3: [151, 490], 4: [521, 230], 5: [521, 490], 6: [151, 640], 7: [151, 770],
    10: [941, 80], 11: [941, 230],
  })
  const right = layout.maxX + 430
  return {
    id: 'grafcet-exemplo-avancado', nativeId: 'grafcet-exemplo-avancado-v1', level: 'avançado',
    name: 'Exemplo GRAFCET 3 · Avançado — Enchimento e tampagem',
    title: 'Enchimento e tampagem (paralelismo E, memória S/R, ciclo contínuo e GRAFCET de segurança)',
    description: 'Dois ramos em paralelo (garrafa e tampa) sincronizados por convergência E, tampagem temporizada, ciclo único ou contínuo memorizado em M0.0 (S/R), seleção OU no fim e um segundo GRAFCET de segurança que corta as saídas na emergência.',
    program: {
      name: 'Enchimento e tampagem',
      steps: layout.steps,
      transitions,
      // Fim do ciclo (seleção OU na etapa 7): T7 reabre os ramos pela esquerda; T8 (ciclo único) volta à 0 pela direita.
      linkBends: { [`${p}-t8`]: [{ x: 151, y: 842 }, { x: 860, y: 842 }, { x: 860, y: 56 }, { x: 151, y: 56 }] },
      comments: [
        text(`${p}-c-title`, 'Enchimento e tampagem — exemplo avançado', layout.minX - 60, layout.minY - 46, { fontSize: 16, fontWeight: '700', color: '#0f172a' }),
        text(`${p}-c-safety-title`, 'GRAFCET de segurança', 891, layout.minY - 46, { fontSize: 13, fontWeight: '700', color: '#b91c1c' }),
        text(`${p}-c-and`, 'Divergência E (T1): garrafa e tampa preparam-se ao mesmo tempo.', right, layout.minY, { color: '#334155' }),
        text(`${p}-c-sync`, 'Convergência E (T5): só tampa quando 3 E 5 estão ativas.', right, layout.minY + 22, { color: '#334155' }),
        text(`${p}-c-mem`, 'M0.0 = ciclo contínuo: S na etapa 1 (com I0.6), R nas etapas 0 e 11.', right, layout.minY + 44, { color: '#7c3aed', fontWeight: '600' }),
        text(`${p}-c-emg`, 'Etapas 10/11: GRAFCET de segurança. Saídas só atuam com X10 ativa.', right, layout.minY + 66, { color: '#b91c1c', fontWeight: '600' }),
        text(`${p}-c-io`, 'I0.0 START · I0.1 posição · I0.2 nível · I0.3 tampa · I0.4 saída · I0.5 rearme · I0.6 ciclo · I0.7 emergência', right, layout.minY + 92, { font: 'mono', fontSize: 10.5, color: '#475569' }),
        text(`${p}-c-out`, 'Q0.0 tapete entrada · Q0.1 válvula · Q0.2 alimentador · Q0.3 roscar · Q0.4 H2 ciclo · Q0.5 H1 pronto · Q0.6 H3 alarme · Q0.7 tapete saída', right, layout.minY + 110, { font: 'mono', fontSize: 10.5, color: '#475569' }),
      ],
    },
    tags: [
      tag('I0.0', 'START', 'Arranque (NA)'), tag('I0.1', 'S_POSICAO', 'Garrafa na posição de enchimento'), tag('I0.2', 'S_NIVEL', 'Nível de enchimento atingido'),
      tag('I0.3', 'S_TAMPA', 'Tampa no alimentador'), tag('I0.4', 'S_SAIDA', 'Garrafa à saída do tapete'), tag('I0.5', 'REARME', 'Rearme após emergência'),
      tag('I0.6', 'SEL_CICLO', 'Seletor ciclo contínuo'), tag('I0.7', 'EMERG', 'Emergência (NF: 1 = libertada)'),
      tag('Q0.0', 'KM_TAPETE', 'Motor do tapete de entrada'), tag('Q0.7', 'KM_SAIDA', 'Motor do tapete de saída'), tag('Q0.1', 'Y_VALVULA', 'Válvula de enchimento'), tag('Q0.2', 'Y_TAMPA', 'Alimentador de tampas'),
      tag('Q0.3', 'Y_ROSCAR', 'Cabeça de roscar'), tag('Q0.4', 'H_CICLO', 'Lâmpada ciclo contínuo'), tag('Q0.5', 'H_PRONTO', 'Lâmpada pronto'), tag('Q0.6', 'H_ALARME', 'Lâmpada de alarme'),
      tag('M0.0', 'CICLO', 'Memória: ciclo contínuo'),
    ],
    notes: [
      note(`${p}-n-test`, 'Como testar (ciclo único)', right, layout.minY + 280, '#bfdbfe', [
        'Com I0.7 ligado (emergência libertada) carregue em I0.0: ficam ativas as etapas 1 e 4 (tapete + alimentador).',
        'Ligue I0.1 → enche (Y1); ligue I0.2 → etapa 3. Ligue I0.3 → etapa 5. Com 3 e 5 ativas, tampa durante 1,5 s.',
        'Na etapa 7 o tapete de saída evacua; ligue I0.4 (garrafa saiu): volta à etapa 0. Desligue os sensores antes do ciclo seguinte.',
      ]),
      note(`${p}-n-cycle`, 'Ciclo contínuo e emergência', right, layout.minY + 520, '#e9d5ff', [
        'Mantenha I0.6 ligado durante a etapa 1: M0.0 fica memorizado (S) e, no fim, T7 reabre os dois ramos sozinho.',
        'Desligue I0.7 a meio do ciclo: o GRAFCET de segurança passa à etapa 11, o alarme pisca e todas as saídas param.',
        'Volte a ligar I0.7 e dê um impulso em I0.5 (rearme): X10 volta e a produção retoma onde estava (M0.0 foi reposto).',
      ]),
    ],
    restInputs: { 'I0.7': true },
    inputModes: { 'I0.0': 'push', 'I0.5': 'push', 'I0.7': 'nc' },
  }
}


/* ------------------------------------------------------------------------------------------------
 * 4) AVANÇADO — Estampagem Industrial (ATEC): 5 GRAFCETs (controlo, emergência, automático, reset, manual)
 * ---------------------------------------------------------------------------------------------- */
function estampagem(): GrafcetExample {
  const p = 'est'
  // Quatro GRAFCETs de funcionamento (G0 controlo, G1 emergência, G2 automático, G3 reset) + um GRAFCET MANUAL por atuador
  // (G4–G10: cilindros, motor e retorno) e por lâmpada (G11–G15), como no exemplo ATEC de referência. Etapas com numeração
  // própria por GRAFCET (G0: 0–5 · G1: 10–11 · G2: 20–31 · G3: 40–45 reset completo · manuais: 50–63 e 70–79, par = repouso, ímpar = ligado)
  // e receptividades com o NOME das tags (B_Start, Emergencia, Man_Estampa…), nunca o endereço. A hierarquia é a da IEC 60848: o G0 comanda os outros por comparações de estado (`G0 <=> X1`).

  // ---- G0 · Controlo (modos de marcha)
  const c0 = initial(p, '0', 'Máquina parada', [])
  const c1 = step(p, '1', 'Modo automático', [['N', 'Q1.2', 'L_Branca', 'Lâmpada branca — AUTO']])
  const c2 = step(p, '2', 'A terminar ciclo', [['N', 'Q1.2', 'L_Branca', 'AUTO a piscar', { type: 'conditional', condition: '1HZ' }]])
  const c3 = step(p, '3', 'Modo manual', [['N', 'Q1.1', 'L_Azul', 'Lâmpada azul — MANUAL']])
  const c4 = step(p, '4', 'Máquina em reset', [])
  const c5 = step(p, '5', 'Máquina em emergência', [])
  // Pausa (guião ATEC: Iniciar / Parar / Pausar no automático)
  const c6 = step(p, '6', 'Pausa', [['N', 'Q1.2', 'L_Branca', 'AUTO em pausa', { type: 'conditional', condition: '2HZ' }]])
  // ---- G1 · Emergência
  const e10 = initial(p, '10', 'Segurança OK', [])
  const e11 = step(p, '11', 'Emergência', [
    ['N', 'Q1.0', 'L_Alarme', 'Alarme a 2 Hz', { type: 'conditional', condition: '2HZ' }],
    ['N', 'Q1.3', 'L_Vermelha', 'Luz vermelha emergência'],
  ], { actionLayout: 'column' })
  // ---- G2 · Automático (ciclo de estampagem)
  const a20 = initial(p, '20', 'Pronto — espera peça', [['N', 'Q0.7', 'L_Verde', 'Pronto']])
  const a21 = step(p, '21', 'Alimentar peça', [['N', 'Q0.0', 'Cil_Alimenta', 'Alimentar peça']])
  const a22 = step(p, '22', 'Deteção do tipo', [['N', 'M0.0', 'Detetar', 'Deteção tipo']])
  const a23 = step(p, '23', 'Transportar → estampa', [['N', 'Q0.4', 'Motor_Rotativo', 'Transportar → estampa']])
  const a24 = step(p, '24', 'Estampar Preta 5 s', [['N', 'Q0.6', 'Cil_Estampa', 'Estampar Preta 5s']])
  const a25 = step(p, '25', 'Estampar Branca 6 s', [['N', 'Q0.6', 'Cil_Estampa', 'Estampar Branca 6s']])
  const a26 = step(p, '26', 'Estampar Metálica 8 s', [['N', 'Q0.6', 'Cil_Estampa', 'Estampar Metálica 8s']])
  const a27 = step(p, '27', 'Transportar → depósito', [['N', 'Q0.4', 'Motor_Rotativo', 'Transportar → depósito']])
  // Contagem 2 peças (guião): 1.ª → Cnt_*; 2.ª (Cnt já a 1) → Rampa_*_Cheia
  const a28 = step(p, '28', 'Depositar Preta', [
    ['N', 'Q0.1', 'Gaveta_Preta', 'Depositar Preta'],
    ['S', 'M0.1', 'Cnt_Preta', '1.ª peça Preta', { type: 'conditional', condition: '!Cnt_Preta * !Rampa_Preta_Cheia' }],
    ['S', 'M0.4', 'Rampa_Preta_Cheia', 'Rampa Preta cheia (2)', { type: 'conditional', condition: 'Cnt_Preta' }],
  ], { actionLayout: 'column' })
  const a29 = step(p, '29', 'Depositar Branca', [
    ['N', 'Q0.2', 'Gaveta_Branca', 'Depositar Branca'],
    ['S', 'M0.2', 'Cnt_Branca', '1.ª peça Branca', { type: 'conditional', condition: '!Cnt_Branca * !Rampa_Branca_Cheia' }],
    ['S', 'M0.5', 'Rampa_Branca_Cheia', 'Rampa Branca cheia (2)', { type: 'conditional', condition: 'Cnt_Branca' }],
  ], { actionLayout: 'column' })
  const a30 = step(p, '30', 'Depositar Metálica', [
    ['N', 'Q0.3', 'Gaveta_Metal', 'Depositar Metálica'],
    ['S', 'M0.3', 'Cnt_Metal', '1.ª peça Metálica', { type: 'conditional', condition: '!Cnt_Metal * !Rampa_Metal_Cheia' }],
    ['S', 'M0.6', 'Rampa_Metal_Cheia', 'Rampa Metálica cheia (2)', { type: 'conditional', condition: 'Cnt_Metal' }],
  ], { actionLayout: 'column' })
  const a31 = step(p, '31', 'Retorno à origem', [['N', 'Q0.5', 'Retorno', 'Retorno origem']])
  // ---- G3 · Reset completo (etapa a etapa: gavetas → estampa/alimentador → retorno → zerar)
  const r40 = initial(p, '40', 'Reset em repouso', [])
  const r41 = step(p, '41', 'Recolher gavetas', [])
  const r42 = step(p, '42', 'Recolher estampa e alimentador', [])
  const r43 = step(p, '43', 'Retorno do transportador', [['N', 'Q0.5', 'Retorno', 'Retorno origem']])
  const r44 = step(p, '44', 'Zerar contadores e flags', [
    ['R', 'M0.1', 'Cnt_Preta', 'Zerar contador Preta'],
    ['R', 'M0.2', 'Cnt_Branca', 'Zerar contador Branca'],
    ['R', 'M0.3', 'Cnt_Metal', 'Zerar contador Metal'],
    ['R', 'M0.4', 'Rampa_Preta_Cheia', 'Limpar rampa Preta'],
    ['R', 'M0.5', 'Rampa_Branca_Cheia', 'Limpar rampa Branca'],
    ['R', 'M0.6', 'Rampa_Metal_Cheia', 'Limpar rampa Metal'],
  ], { actionLayout: 'column' })
  const r45 = step(p, '45', 'Fim do reset', [])
  // ---- G4…G15 · Manual: um GRAFCET por atuador e por lâmpada. Toque no botão Man_* liga (G0 em X3), novo toque desliga.
  // Estampa e gavetas só ligam na posição certa e desligam se a perderem. Sair do manual (G0 ≠ X3, inclui emergência) desliga tudo.
  const manualDevices: ManualDevice[] = [
    { title: 'Alimentador', kind: 'Cilindro', address: 'Q0.0', out: 'Cil_Alimenta', button: 'Man_Alimenta', first: 50 },
    { title: 'Transportador rotativo', kind: 'Motor', address: 'Q0.4', out: 'Motor_Rotativo', button: 'Man_Transporte', first: 52 },
    { title: 'Cilindro de estampa', kind: 'Cilindro', address: 'Q0.6', out: 'Cil_Estampa', button: 'Man_Estampa', first: 54, position: 'Pos_Estampa' },
    { title: 'Gaveta Preta', kind: 'Cilindro', address: 'Q0.1', out: 'Gaveta_Preta', button: 'Man_Gaveta_Preta', first: 56, position: 'Pos_Deposito' },
    { title: 'Gaveta Branca', kind: 'Cilindro', address: 'Q0.2', out: 'Gaveta_Branca', button: 'Man_Gaveta_Branca', first: 58, position: 'Pos_Deposito' },
    { title: 'Gaveta Metálica', kind: 'Cilindro', address: 'Q0.3', out: 'Gaveta_Metal', button: 'Man_Gaveta_Metal', first: 60, position: 'Pos_Deposito' },
    { title: 'Retorno à origem', kind: 'Motor', address: 'Q0.5', out: 'Retorno', button: 'Man_Retorno', first: 62 },
    { title: 'Lâmpada verde', kind: 'Lâmpada', address: 'Q0.7', out: 'L_Verde', button: 'Man_L_Verde', first: 70 },
    { title: 'Lâmpada de alarme', kind: 'Lâmpada', address: 'Q1.0', out: 'L_Alarme', button: 'Man_L_Alarme', first: 72 },
    { title: 'Lâmpada azul', kind: 'Lâmpada', address: 'Q1.1', out: 'L_Azul', button: 'Man_L_Azul', first: 74 },
    { title: 'Lâmpada branca', kind: 'Lâmpada', address: 'Q1.2', out: 'L_Branca', button: 'Man_L_Branca', first: 76 },
    { title: 'Lâmpada vermelha', kind: 'Lâmpada', address: 'Q1.3', out: 'L_Vermelha', button: 'Man_L_Vermelha', first: 78 },
  ]
  const manualSteps = manualDevices.map((device) => ({
    device,
    off: initial(p, String(device.first), `${device.title} — repouso`, []),
    on: step(p, String(device.first + 1), `${device.title} — ligado`, [['N', device.address, device.out, `${device.title} (manual)`]]),
  }))

  // G16 · Reset independente das rampas (guião ATEC: reset por rampa)
  const rr80 = initial(p, '80', 'Esperar pedido de reset da rampa', [])
  const rr81 = step(p, '81', 'Repor apenas as rampas pedidas', [
    ['R', 'M0.1', 'Cnt_Preta', 'Zerar Cnt Preta', { type: 'conditional', condition: 'Reset_Rampa_Preta' }],
    ['R', 'M0.4', 'Rampa_Preta_Cheia', 'Reset rampa Preta', { type: 'conditional', condition: 'Reset_Rampa_Preta' }],
    ['R', 'M0.2', 'Cnt_Branca', 'Zerar Cnt Branca', { type: 'conditional', condition: 'Reset_Rampa_Branca' }],
    ['R', 'M0.5', 'Rampa_Branca_Cheia', 'Reset rampa Branca', { type: 'conditional', condition: 'Reset_Rampa_Branca' }],
    ['R', 'M0.3', 'Cnt_Metal', 'Zerar Cnt Metal', { type: 'conditional', condition: 'Reset_Rampa_Metal' }],
    ['R', 'M0.6', 'Rampa_Metal_Cheia', 'Reset rampa Metálica', { type: 'conditional', condition: 'Reset_Rampa_Metal' }],
  ], { actionLayout: 'column' })

  const quiet = { displayDescription: false } as const
  // Ligações por referência (sem linha desenhada): voltas ao repouso, emergência e abortos entre GRAFCETs.
  const ref = (to: GrafcetStep): Partial<GrafcetTransition> => ({ wireless: true, targetInfo: to.name, ...quiet })
  const free = '!Rampa_Preta_Cheia * !Rampa_Branca_Cheia * !Rampa_Metal_Cheia'
  const g0 = `${p}-g0`, g1 = `${p}-g1`, g2 = `${p}-g2`, g3 = `${p}-g3`, g4 = `${p}-g4`

  const control: GrafcetTransition[] = [
    // emergência tem prioridade: qualquer estado do G0 (incl. pausa) passa à 5
    link(g0, 'E0', [c0], [c5], 'G1 <=> X11', 'Emergência', ref(c5)),
    link(g0, 'E1', [c1], [c5], 'G1 <=> X11', 'Emergência', ref(c5)),
    link(g0, 'E2', [c2], [c5], 'G1 <=> X11', 'Emergência', ref(c5)),
    link(g0, 'E3', [c3], [c5], 'G1 <=> X11', 'Emergência', ref(c5)),
    link(g0, 'E4', [c4], [c5], 'G1 <=> X11', 'Emergência', ref(c5)),
    link(g0, 'E6', [c6], [c5], 'G1 <=> X11', 'Emergência', ref(c5)),
    link(g0, 'T1', [c0], [c1], 'B_Start * Modo_Auto * Emergencia * !B_Stop * !B_Pause * !Modo_Manual', '→ Auto'),
    link(g0, 'T2', [c0], [c3], 'Modo_Manual * Emergencia', '→ Manual'),
    link(g0, 'T3', [c0], [c4], 'B_Reset * Emergencia', '→ Reset'),
    link(g0, 'T4', [c1], [c2], '!Modo_Auto * !B_Stop', 'Parar suave: acabar o ciclo'),
    link(g0, 'T5', [c2], [c0], 'G2 <=> X20', 'G2 já em repouso', ref(c0)),
    link(g0, 'T6', [c3], [c0], '!Modo_Manual', 'Modo manual desligado', ref(c0)),
    link(g0, 'T7', [c4], [c0], 'G3 <=> X45', 'G3 terminou o reset', ref(c0)),
    link(g0, 'T8', [c5], [c4], 'G1 <=> X10', 'Rearmada → reset', ref(c4)),
    // Pausa / retoma (B_Pause em latch no HMI)
    link(g0, 'T9', [c1], [c6], 'B_Pause * Modo_Auto', 'Pausa'),
    link(g0, 'T10', [c6], [c1], '!B_Pause * Modo_Auto', 'Retomar automático'),
    // STOP imediato (aborta G2 via condição de aborto)
    link(g0, 'T11', [c1], [c0], 'B_Stop', 'STOP imediato', ref(c0)),
    link(g0, 'T12', [c6], [c0], 'B_Stop', 'STOP imediato (em pausa)', ref(c0)),
    link(g0, 'T13', [c2], [c0], 'B_Stop', 'STOP imediato (a terminar)', ref(c0)),
  ]
  const safety: GrafcetTransition[] = [
    link(g1, 'T1', [e10], [e11], '!Emergencia', 'Emergência premida'),
    link(g1, 'T2', [e11], [e10], 'Emergencia * Rearme', 'Libertada + rearme', ref(e10)),
  ]
  const auto: GrafcetTransition[] = [
    link(g2, 'T1', [a20], [a21], free, 'Rampas livres', { guard: 'G0 <=> X1' }),
    // * (G0 <> X6) na receptividade: em pausa o ciclo congela (um só rótulo, sem guard extra)
    link(g2, 'T2', [a21], [a22], 'Peca_Presente * (G0 <> X6)', 'Peça no alimentador'),
    link(g2, 'T3', [a22], [a23], '(Tipo_Preta + Tipo_Branca + Tipo_Metal) * (G0 <> X6)', 'Tipo detetado'),
    link(g2, 'T4', [a23], [a24], 'Pos_Estampa * Tipo_Preta * (G0 <> X6)', 'Posição estampa · Preta'),
    link(g2, 'T5', [a23], [a25], 'Pos_Estampa * Tipo_Branca * (G0 <> X6)', 'Posição estampa · Branca'),
    link(g2, 'T6', [a23], [a26], 'Pos_Estampa * Tipo_Metal * (G0 <> X6)', 'Posição estampa · Metálica'),
    link(g2, 'T7', [a24], [a27], '5s/X24 * (G0 <> X6)', 'Preta: 5 s'),
    link(g2, 'T8', [a25], [a27], '6s/X25 * (G0 <> X6)', 'Branca: 6 s'),
    link(g2, 'T9', [a26], [a27], '8s/X26 * (G0 <> X6)', 'Metálica: 8 s'),
    link(g2, 'T10', [a27], [a28], 'Pos_Deposito * Tipo_Preta * (G0 <> X6)', 'Depósito · Preta'),
    link(g2, 'T11', [a27], [a29], 'Pos_Deposito * Tipo_Branca * (G0 <> X6)', 'Depósito · Branca'),
    link(g2, 'T12', [a27], [a30], 'Pos_Deposito * Tipo_Metal * (G0 <> X6)', 'Depósito · Metálica'),
    link(g2, 'T13', [a28], [a31], 'FC_Gaveta_Preta * (G0 <> X6)', 'Gaveta Preta recuada'),
    link(g2, 'T14', [a29], [a31], 'FC_Gaveta_Branca * (G0 <> X6)', 'Gaveta Branca recuada'),
    link(g2, 'T15', [a30], [a31], 'FC_Gaveta_Metal * (G0 <> X6)', 'Gaveta Metálica recuada'),
    link(g2, 'T16', [a31], [a20], 'FC_Origem * (G0 <> X6)', 'Origem', ref(a20)),
    // a terminar ciclo (G0 em X2): ainda sem peça no alimentador, não há ciclo para acabar
    link(g2, 'T17', [a21], [a20], 'G0 <=> X2 * !Peca_Presente', 'Sem peça: nada a terminar', ref(a20)),
    // Congelar em pausa (G0 X6): transições de processo não disparam
    // Abortos: G0 fora de Auto (1), a terminar (2) e Pausa (6) — STOP/manual/reset/emergência
    ...[a21, a22, a23, a24, a25, a26, a27, a28, a29, a30, a31].map((from, index) =>
      link(g2, `A${index + 1}`, [from], [a20], 'G0 <> X1 * G0 <> X2 * G0 <> X6', 'Abortar', {
        ...ref(a20),
        displayCondition: false, // evita sobrepor condições longas às etapas/ações
      })),
  ]
  const reset: GrafcetTransition[] = [
    ...[r41, r42, r43, r44].map((from, index) => link(g3, `A${index + 1}`, [from], [r40], 'G0 <> X4', 'Interromper reset', { ...ref(r40), displayCondition: false })),
    link(g3, 'T1', [r40], [r41], 'G0 <=> X4', 'G0 pediu reset'),
    link(g3, 'T2', [r41], [r42], 'FC_Gaveta_Preta * FC_Gaveta_Branca * FC_Gaveta_Metal', 'Gavetas recolhidas'),
    link(g3, 'T3', [r42], [r43], '1s/X42', 'Estampa e alimentador em repouso'),
    link(g3, 'T4', [r43], [r44], 'FC_Origem', 'Transportador na origem'),
    link(g3, 'T5', [r44], [r45], '1', 'Contadores e flags zerados'),
    link(g3, 'T6', [r45], [r40], 'G0 <> X4', 'G0 saiu do reset', ref(r40)),
  ]
  const manual: GrafcetTransition[] = manualDevices.flatMap((device, index) => {
    const { off, on } = manualSteps[index]
    const graph = `${p}-g${index + 4}`
    const lock = device.position ? ` * ${device.position}` : ''
    const lost = device.position ? ` + !${device.position}` : ''
    return [
      link(graph, 'T1', [off], [on], `^${device.button}${lock}`, `Toque em ${device.button}${device.position ? ` com ${device.position}` : ''}: liga`, { guard: 'G0 <=> X3' }),
      link(graph, 'T2', [on], [off], `^${device.button} + G0 <> X3${lost}`, `Novo toque, saída do manual${device.position ? ` ou ${device.position} perdido` : ''}: desliga`, ref(off)),
    ]
  })
  const rampReset = [
    link(`${p}-g16`, 'T1', [rr80], [rr81], '^Reset_Rampa_Preta + ^Reset_Rampa_Branca + ^Reset_Rampa_Metal', 'Pedido de reset individual'),
    link(`${p}-g16`, 'T2', [rr81], [rr80], '1', 'Voltar a esperar', ref(rr80)),
  ]
  const transitions = [...control, ...safety, ...auto, ...reset, ...manual, ...rampReset]

  // ---- Páginas: um GRAFCET por chart (IEC 60848). Todas correm em simultâneo.
  const chartMeta: Array<{ id: string; name: string; title: string }> = [
    { id: `${p}-g0`, name: 'G0 Controlo', title: 'G0 - Controlo' },
    { id: `${p}-g1`, name: 'G1 Emergência', title: 'G1 - Emergência' },
    { id: `${p}-g2`, name: 'G2 Automático', title: 'G2 - Automático' },
    { id: `${p}-g3`, name: 'G3 Reset', title: 'G3 - Reset' },
    ...manualDevices.map((device, index) => ({
      id: `${p}-g${index + 4}`,
      name: `G${index + 4} ${device.title}`,
      title: `G${index + 4} - ${device.kind} · ${device.title}`,
    })),
    { id: `${p}-g16`, name: 'G16 Reset rampas', title: 'G16 - Reset rampas' },
  ]
  const chartByStepName = (name: string): string => {
    const n = Number(name)
    if (n <= 6) return `${p}-g0`
    if (n <= 11) return `${p}-g1`
    if (n <= 31) return `${p}-g2`
    if (n <= 45) return `${p}-g3`
    if (n >= 80) return `${p}-g16`
    if (n >= 70) return `${p}-g${11 + Math.floor((n - 70) / 2)}`
    if (n >= 50) return `${p}-g${4 + Math.floor((n - 50) / 2)}`
    return `${p}-g0`
  }
  // Atribuir página a cada etapa e transição (ligações cross-page continuam wireless).
  const allRawSteps = [c0, c1, c2, c3, c4, c5, c6, e10, e11, a20, a21, a22, a23, a24, a25, a26, a27, a28, a29, a30, a31, r40, r41, r42, r43, r44, r45, rr80, rr81, ...manualSteps.flatMap((item) => [item.off, item.on])]
  const stepped = allRawSteps.map((s) => ({ ...s, chart: chartByStepName(s.name), actions: s.actions?.map(a => /^Q0\.[0-6]$/.test(a.address) ? { ...a, type: 'conditional' as const, condition: `(${a.condition || '1'}) * Emergencia * (G1 <=> X10)` } : a) }))
  const transitioned = transitions.map((t) => {
    const fromStep = stepped.find((s) => s.id === t.from[0])
    return { ...t, chart: fromStep?.chart ?? `${p}-g0` }
  })

  const pageComments = chartMeta.map((c, index) => {
    const isManual = index >= 4
    return text(`${p}-c-${c.id}`, c.title, 60, 24, {
      fontSize: isManual ? 15 : 16,
      fontWeight: '700',
      color: c.id.endsWith('-g1') ? '#b91c1c' : '#0f172a',
      chart: c.id,
    })
  })
  // Notas auxiliares só nas páginas principais
  const pageExtras = [
    text(`${p}-c-g0-hint`, 'Auto (X1) · Pausa (X6) · Terminar ciclo (X2) · Manual (X3) · Reset (X4) · Emergência (X5) · STOP (B_Stop)', 60, 960, { fontSize: 11, color: '#475569', chart: `${p}-g0` }),
    text(`${p}-c-g16-hint`, 'Impulso em Reset_Rampa_*: limpa Cnt e flag de cheia dessa rampa (independente do reset máquina).', 60, 420, { fontSize: 11, color: '#475569', chart: `${p}-g16` }),
    text(`${p}-c-g2-times`, 'Tempos: Preta 5 s · Branca 6 s · Metálica 8 s', 60, 1500, { fontSize: 12, color: '#7c3aed', fontWeight: '600', chart: `${p}-g2` }),
    text(`${p}-c-g3-hint`, 'Sequência: gavetas → estampa/alimentador → retorno → zerar → fim', 60, 1160, { fontSize: 11, color: '#475569', chart: `${p}-g3` }),
  ]

  let program: GrafcetProgram = {
    name: 'Estampagem Industrial (ATEC)', charts: chartMeta, activeChart: `${p}-g0`,
    steps: stepped, transitions: transitioned, comments: pageComments,
  }
  // O nativo usa o mesmo organizador do editor: tamanhos reais, ramos centrados e margens comuns.
  for (const chart of chartMeta) program = organizeGrafcetPage(program, chart.id)
  const chartBottom = (chart: string) => Math.max(0, ...program.steps.filter(s => s.chart === chart).map(s => s.y! + stepFootprint(s).bottom))
  const chartRight = (chart: string) => Math.max(0, ...program.steps.filter(s => s.chart === chart).map(s => s.x! + stepFootprint(s).right))
  program.comments = [...pageComments, ...pageExtras.map(c => ({ ...c, y: chartBottom(c.chart!) + 150 }))]

  return {
    id: 'grafcet-estampagem-industrial',
    nativeId: 'grafcet-estampagem-industrial-v19',
    level: 'avançado',
    name: 'Estampagem Industrial — ATEC',
    title: 'Estampagem industrial (uma página por GRAFCET: controlo, emergência, automático, reset e manuais)',
    description:
      'Guião ATEC: G0 (Auto/Manual/Pausa/STOP/Reset), G1 Emergência, G2 ciclo 5/6/8 s, G3 reset máquina, G4–G15 manuais, G16 reset independente das rampas (2 peças = cheio).',
    program,
    tags: [
      tag('I0.0', 'B_Start', 'Botão Iniciar ciclo (HMI). Física: C1_FC_0 → %I0.0'),
      tag('I0.1', 'Peca_Presente', 'Sensor peça no alimentador. Física: C1_FC_1 → %I0.1'),
      tag('I0.2', 'Tipo_Preta', 'Deteção peça plástica preta. Física: C1_FC_2 → %I0.2'),
      tag('I0.3', 'Tipo_Branca', 'Deteção peça plástica branca. Física: C1_FC_3 → %I0.3'),
      tag('I0.4', 'Tipo_Metal', 'Deteção peça metálica. Física: C1_FC_4 → %I0.4'),
      tag('I0.5', 'Pos_Estampa', 'Transportador na posição de estampagem. Física: C1_FC_5 → %I0.5'),
      tag('I0.6', 'Pos_Deposito', 'Transportador na posição de depósito. Física: C1_FC_6 → %I0.6'),
      tag('I0.7', 'FC_Gaveta_Preta', 'Fim de curso gaveta / rampa preta. Física: C1_FC_7 → %I0.7'),
      tag('I1.0', 'FC_Gaveta_Branca', 'Fim de curso gaveta / rampa branca. Física: C1_FC_8 → %I0.8'),
      tag('I1.1', 'FC_Gaveta_Metal', 'Fim de curso gaveta / rampa metálica. Física: C1_FC_9 → %I0.9'),
      tag('I1.2', 'FC_Origem', 'Transportador / braço na origem. Física: C1_FC_10 → %I0.10'),
      tag('I1.3', 'B_Reset', 'Botão de reset (HMI). Física: C1_FC_11 → %I0.11'),
      tag('I1.4', 'Modo_Manual', 'Seleção modo MANUAL (HMI). Física: C1_FC_12 → %I0.12'),
      tag('I1.5', 'Modo_Auto', 'Seleção modo AUTOMÁTICO (HMI). Física: C1_FC_13 → %I0.13'),
      tag('I1.6', 'Rearme', 'Botão rearme segurança. Física: C1_FC_14 → %I0.14'),
      tag('I1.7', 'Emergencia', 'Botão emergência NC (1 = libertada). Física: C1_FC_15 → %I0.15'),
      tag('I2.0', 'Man_Alimenta', 'Manual (HMI): alimentador — toque liga, novo toque desliga'),
      tag('I2.1', 'Man_Transporte', 'Manual (HMI): transportador rotativo'),
      tag('I2.2', 'Man_Estampa', 'Manual (HMI): cilindro de estampagem'),
      tag('I2.3', 'Man_Gaveta_Preta', 'Manual (HMI): gaveta preta'),
      tag('I2.4', 'Man_Gaveta_Branca', 'Manual (HMI): gaveta branca'),
      tag('I2.5', 'Man_Gaveta_Metal', 'Manual (HMI): gaveta metálica'),
      tag('I2.6', 'Man_Retorno', 'Manual (HMI): retorno à origem'),
      tag('I2.7', 'Man_L_Verde', 'Manual (HMI): teste lâmpada verde'),
      tag('I3.0', 'Man_L_Alarme', 'Manual (HMI): teste lâmpada de alarme'),
      tag('I3.1', 'Man_L_Azul', 'Manual (HMI): teste lâmpada azul'),
      tag('I3.2', 'Man_L_Branca', 'Manual (HMI): teste lâmpada branca'),
      tag('I3.3', 'Man_L_Vermelha', 'Manual (HMI): teste lâmpada vermelha'),
      tag('Q0.0', 'Cil_Alimenta', 'Cilindro alimentador +. Física: %Q0.0'),
      tag('Q0.1', 'Gaveta_Preta', 'Atuador depósito / rampa preta (lógico)'),
      tag('Q0.2', 'Gaveta_Branca', 'Atuador depósito / rampa branca (lógico)'),
      tag('Q0.3', 'Gaveta_Metal', 'Atuador depósito / rampa metálica (lógico)'),
      tag('Q0.4', 'Motor_Rotativo', 'Motor do transportador rotativo'),
      tag('Q0.5', 'Retorno', 'Comando retorno à origem'),
      tag('Q0.6', 'Cil_Estampa', 'Cilindro de estampagem +. Física tabela: %Q0.8'),
      tag('Q0.7', 'L_Verde', 'Lâmpada verde — Pronto'),
      tag('Q1.0', 'L_Alarme', 'Lâmpada alarme / emergência'),
      tag('Q1.1', 'L_Azul', 'Lâmpada azul — modo MANUAL'),
      tag('Q1.2', 'L_Branca', 'Lâmpada branca — modo AUTOMÁTICO'),
      tag('Q1.3', 'L_Vermelha', 'Lâmpada vermelha — emergência'),
      tag('M0.0', 'Detetar', 'Memória fase de deteção'),
      tag('I3.4', 'B_Pause', 'HMI: pausa / retoma do automático (latch)'),
      tag('I3.5', 'B_Stop', 'HMI: STOP imediato (aborta o ciclo)'),
      tag('I3.6', 'Reset_Rampa_Preta', 'HMI: reset independente rampa Preta'),
      tag('I3.7', 'Reset_Rampa_Branca', 'HMI: reset independente rampa Branca'),
      tag('I4.0', 'Reset_Rampa_Metal', 'HMI: reset independente rampa Metálica'),
      tag('M0.1', 'Cnt_Preta', 'Memória 1.ª peça Preta (2.ª → Rampa cheia)'),
      tag('M0.2', 'Cnt_Branca', 'Memória 1.ª peça Branca'),
      tag('M0.3', 'Cnt_Metal', 'Memória 1.ª peça Metálica'),
      tag('M0.4', 'Rampa_Preta_Cheia', 'Rampa preta com 2 peças — bloqueia o ciclo'),
      tag('M0.5', 'Rampa_Branca_Cheia', 'Rampa branca com 2 peças — bloqueia o ciclo'),
      tag('M0.6', 'Rampa_Metal_Cheia', 'Rampa metálica com 2 peças — bloqueia o ciclo'),
    ],
    notes: [
      { ...note(`${p}-n-auto`, 'Como testar — automático', chartRight(`${p}-g0`) + 320, 70, '#bfdbfe', [
        'Emergencia e Modo_Auto ligados (já no arranque). Impulso em B_Start: G0 passa a X1 e o G2 arranca.',
        'Peca_Presente → deteção. Escolha o tipo: Tipo_Preta / Tipo_Branca / Tipo_Metal e mantenha-o durante o ciclo.',
        'Pos_Estampa → estampagem 5/6/8 s. Depois Pos_Deposito → gaveta e contagem; FC_Gaveta_* e FC_Origem fecham o ciclo.',
        'Desligar Modo_Auto: G0 → X2 (terminar ciclo). B_Stop: STOP imediato (aborta G2).',
        'B_Pause (latch): G0 → X6 mantém a etapa e os comandos do G2; os tempos continuam a contar. Ao retomar, uma temporização já cumprida permite avançar. B_Stop aborta. Página G16: reset por rampa.',
      ]), chart: `${p}-g0` },
      { ...note(`${p}-n-manual`, 'Como testar — manual e reset', chartRight(`${p}-g3`) + 320, 70, '#bbf7d0', [
        'Com o G0 parado, ligue Modo_Manual: G0 → X3. Cada atuador/lâmpada tem a sua página (G4–G15) e o botão Man_*.',
        'Um toque em Man_* liga (etapa ímpar); novo toque desliga. Sair do manual ou emergência desliga tudo.',
        'B_Reset com G0 parado: página G3 corre o reset completo etapa a etapa até X45.',
      ]), chart: `${p}-g3` },
      { ...note(`${p}-n-safety`, 'Emergência', chartRight(`${p}-g1`) + 320, 70, '#fecaca', [
        'Desligue Emergencia: G1 → X11 (alarme 2 Hz + luz vermelha), G0 → X5 e o automático/manuais abortam.',
        'Para sair: ligue Emergencia + impulso em Rearme → G1 X10 → G0 faz reset (X4) → paragem.',
      ]), chart: `${p}-g1` },
    ],
    restInputs: { 'I1.7': true, 'I1.5': true },
    inputModes: {
      'I0.0': 'push', 'I1.3': 'push', 'I1.6': 'push', 'I1.7': 'nc', 'I1.4': 'latch', 'I1.5': 'latch',
      'I2.0': 'push', 'I2.1': 'push', 'I2.2': 'push', 'I2.3': 'push', 'I2.4': 'push', 'I2.5': 'push', 'I2.6': 'push', 'I2.7': 'push',
      'I3.0': 'push', 'I3.1': 'push', 'I3.2': 'push', 'I3.3': 'push',
      'I3.4': 'latch', 'I3.5': 'push', 'I3.6': 'push', 'I3.7': 'push', 'I4.0': 'push',
    },
    virtualInputCount: 40,
    virtualOutputCount: 16,
    virtualMemoryCount: 8,
  }
}

export function grafcetExamples(): GrafcetExample[] {
  return [prensa(), portao(), enchimento(), estampagem()]
}

/** Conteúdo de projeto (o mesmo formato que «Guardar») de um exemplo GRAFCET. */
export function grafcetExampleContent(example: GrafcetExample): Record<string, unknown> {
  return {
    app: 'dc-simu',
    version: 7,
    projectKind: 'grafcet',
    nativeId: example.nativeId,
    savedAt: '2026-11-06T00:00:00.000Z',
    components: [],
    wires: [],
    ladder: { rungs: [] },
    grafcet: example.program,
    tags: example.tags,
    canvasNotes: example.notes.map((item) => ({ ...item, createdAt: '2026-11-06T00:00:00.000Z' })),
    virtualInputs: example.restInputs,
    virtualInputModes: example.inputModes,
    virtualInputCount: example.virtualInputCount ?? 8,
    virtualOutputCount: example.virtualOutputCount ?? 8,
    virtualMemoryCount: example.virtualMemoryCount ?? 4,
  }
}
