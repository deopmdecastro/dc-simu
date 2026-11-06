import type { GrafcetAction, GrafcetComment, GrafcetProgram, GrafcetStep, GrafcetTransition } from '../grafcet/engine'
import { autoLayout } from '../grafcet/layout'
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
 * 4) AVANÇADO — Estampagem Industrial (ATEC): tipos de peça, tempos, rampas e segurança
 * ---------------------------------------------------------------------------------------------- */
function estampagem(): GrafcetExample {
  const p = 'est'
  const s0 = initial(p, '0', 'Pronto — espera START', [['N', 'Q0.7', 'L_Verde', 'Pronto']])
  const s1 = step(p, '1', 'Alimentar peça', [['N', 'Q0.0', 'Cil_Alimenta', 'Alimentar peça']])
  const s2 = step(p, '2', 'Deteção do tipo', [['N', 'M0.0', 'Detetar', 'Deteção tipo']])
  const s3 = step(p, '3', 'Transportar → estampa', [['N', 'Q0.4', 'Motor_Rotativo', 'Transportar → estampa']])
  const s4p = step(p, '4P', 'Estampar Preta 5 s', [['N', 'Q0.6', 'Cil_Estampa', 'Estampar Preta 5s']])
  const s4b = step(p, '4B', 'Estampar Branca 6 s', [['N', 'Q0.6', 'Cil_Estampa', 'Estampar Branca 6s']])
  const s4m = step(p, '4M', 'Estampar Metálica 8 s', [['N', 'Q0.6', 'Cil_Estampa', 'Estampar Metálica 8s']])
  const s5 = step(p, '5', 'Transportar → depósito', [['N', 'Q0.4', 'Motor_Rotativo', 'Transportar → depósito']])
  const s6p = step(p, '6P', 'Depositar Preta', [
    ['N', 'Q0.1', 'Gaveta_Preta', 'Depositar Preta'],
    ['S', 'M0.1', 'Cnt_Preta', 'Inc. contador Preta'],
  ])
  const s6b = step(p, '6B', 'Depositar Branca', [
    ['N', 'Q0.2', 'Gaveta_Branca', 'Depositar Branca'],
    ['S', 'M0.2', 'Cnt_Branca', 'Inc. contador Branca'],
  ])
  const s6m = step(p, '6M', 'Depositar Metálica', [
    ['N', 'Q0.3', 'Gaveta_Metal', 'Depositar Metálica'],
    ['S', 'M0.3', 'Cnt_Metal', 'Inc. contador Metal'],
  ])
  const s7 = step(p, '7', 'Retorno à origem', [['N', 'Q0.5', 'Retorno', 'Retorno origem']])
  const s10 = initial(p, '10', 'Segurança OK', [])
  const s11 = step(p, '11', 'Emergência', [
    ['N', 'Q0.8', 'L_Alarme', 'Alarme emergência', { type: 'conditional', condition: '2HZ' }],
    ['N', 'Q0.11', 'L_Vermelha', 'Luz vermelha emergência'],
  ])
  const transitions = [
    link(p, 'T01', [s0], [s1], 'I0.0*I0.13*I0.15*X10*!M0.4*!M0.5*!M0.6', 'START + modo automático + emergência OK + rampas livres'),
    link(p, 'T12', [s1], [s2], 'I0.1', 'Peça presente / FC alimentador'),
    link(p, 'T23', [s2], [s3], 'I0.2|I0.3|I0.4', 'Tipo detetado (Preta | Branca | Metálica)'),
    link(p, 'T3P', [s3], [s4p], 'I0.5*I0.2', 'Posição estampa + Preta'),
    link(p, 'T3B', [s3], [s4b], 'I0.5*I0.3', 'Posição estampa + Branca'),
    link(p, 'T3M', [s3], [s4m], 'I0.5*I0.4', 'Posição estampa + Metálica'),
    link(p, 'T4P5', [s4p], [s5], '5s/X4P', 'Tempo estampagem Preta 5 s'),
    link(p, 'T4B5', [s4b], [s5], '6s/X4B', 'Tempo estampagem Branca 6 s'),
    link(p, 'T4M5', [s4m], [s5], '8s/X4M', 'Tempo estampagem Metálica 8 s'),
    link(p, 'T5P', [s5], [s6p], 'I0.6*I0.2', 'Posição depósito + Preta'),
    link(p, 'T5B', [s5], [s6b], 'I0.6*I0.3', 'Posição depósito + Branca'),
    link(p, 'T5M', [s5], [s6m], 'I0.6*I0.4', 'Posição depósito + Metálica'),
    link(p, 'T6P7', [s6p], [s7], 'I0.7', 'Peça depositada (FC gaveta Preta)'),
    link(p, 'T6B7', [s6b], [s7], 'I0.8', 'Peça depositada (FC gaveta Branca)'),
    link(p, 'T6M7', [s6m], [s7], 'I0.9', 'Peça depositada (FC gaveta Metal)'),
    link(p, 'T70', [s7], [s0], 'I0.10', 'Retorno concluído (origem)', { targetInfo: '0' }),
    link(p, 'T10-11', [s10], [s11], '!I0.15', 'Emergência premida'),
    link(p, 'T11-10', [s11], [s10], 'I0.15*I0.14', 'Emergência libertada + rearme', { targetInfo: '10' }),
  ]
  const layout = placed(
    [s0, s1, s2, s3, s4p, s4b, s4m, s5, s6p, s6b, s6m, s7, s10, s11],
    transitions,
    {
      0: [280, 80], 1: [280, 220], 2: [280, 360], 3: [280, 500],
      '4P': [120, 660], '4B': [280, 660], '4M': [440, 660],
      5: [280, 820],
      '6P': [120, 960], '6B': [280, 960], '6M': [440, 960],
      7: [280, 1100],
      10: [700, 80], 11: [700, 220],
    },
  )
  const right = layout.maxX + 280
  return {
    id: 'grafcet-estampagem-industrial',
    nativeId: 'grafcet-estampagem-industrial-v8',
    level: 'avançado',
    name: 'Estampagem Industrial — ATEC',
    title: 'Estampagem industrial (tipos de peça, tempos 5/6/8 s, rampas e segurança)',
    description:
      'Ciclo automático ATEC: alimentar, detetar tipo (preta/branca/metálica), transportar, estampar com tempo por tipo, depositar na rampa (máx. 2 peças) e retornar. GRAFCET de segurança separado para emergência. Alinhado ao guião e à tabela I/O do PLC.',
    program: {
      name: 'Estampagem Industrial — Automático (ATEC)',
      steps: layout.steps,
      transitions,
      comments: [
        text(`${p}-c-title`, 'Estampagem Industrial — ATEC (automático)', layout.minX - 40, layout.minY - 46, { fontSize: 16, fontWeight: '700', color: '#0f172a' }),
        text(`${p}-c-times`, 'Tempos de estampagem: Preta 5 s · Branca 6 s · Metálica 8 s', right, layout.minY, { color: '#7c3aed', fontWeight: '600' }),
        text(`${p}-c-ramp`, 'Rampas: M0.4–M0.6 cheias bloqueiam START; reset independente no HMI.', right, layout.minY + 22, { color: '#b45309' }),
        text(`${p}-c-mode`, 'T0→1 exige I0.13 (modo AUTO) e I0.15 (emergência libertada) e X10.', right, layout.minY + 44, { color: '#334155' }),
        text(`${p}-c-io`, 'I0.0 START · I0.1 peça · I0.2/3/4 tipo · I0.5 pos.estampa · I0.6 pos.depósito', right, layout.minY + 70, { font: 'mono', fontSize: 11, color: '#475569' }),
        text(`${p}-c-out`, 'Q0.0 alimenta · Q0.1–3 gavetas · Q0.4 motor · Q0.5 retorno · Q0.6 estampa · Q0.7–11 lâmpadas', right, layout.minY + 90, { font: 'mono', fontSize: 11, color: '#475569' }),
        text(`${p}-c-safety-title`, 'GRAFCET de segurança', 640, layout.minY - 46, { fontSize: 13, fontWeight: '700', color: '#b91c1c' }),
      ],
    },
    tags: [
      tag('I0.0', 'START', 'Botão Iniciar ciclo (HMI). Física: C1_FC_0 → %I0.0'),
      tag('I0.1', 'Peca_Presente', 'Sensor peça no alimentador. Física: C1_FC_1 → %I0.1'),
      tag('I0.2', 'Tipo_Preta', 'Deteção peça plástica preta. Física: C1_FC_2 → %I0.2'),
      tag('I0.3', 'Tipo_Branca', 'Deteção peça plástica branca. Física: C1_FC_3 → %I0.3'),
      tag('I0.4', 'Tipo_Metal', 'Deteção peça metálica. Física: C1_FC_4 → %I0.4'),
      tag('I0.5', 'Pos_Estampa', 'Transportador na posição de estampagem. Física: C1_FC_5 → %I0.5'),
      tag('I0.6', 'Pos_Deposito', 'Transportador na posição de depósito. Física: C1_FC_6 → %I0.6'),
      tag('I0.7', 'FC_Gaveta_Preta', 'Fim de curso gaveta / rampa preta. Física: C1_FC_7 → %I0.7'),
      tag('I0.8', 'FC_Gaveta_Branca', 'Fim de curso gaveta / rampa branca. Física: C1_FC_8 → %I0.8'),
      tag('I0.9', 'FC_Gaveta_Metal', 'Fim de curso gaveta / rampa metálica. Física: C1_FC_9 → %I0.9'),
      tag('I0.10', 'FC_Origem', 'Transportador / braço na origem. Física: C1_FC_10 → %I0.10'),
      tag('I0.12', 'Modo_Manual', 'Seleção modo MANUAL (HMI). Física: C1_FC_12 → %I0.12'),
      tag('I0.13', 'Modo_Auto', 'Seleção modo AUTOMÁTICO (HMI). Física: C1_FC_13 → %I0.13'),
      tag('I0.14', 'Rearme', 'Botão rearme segurança. Física: C1_FC_14 → %I0.14'),
      tag('I0.15', 'Emergencia', 'Botão emergência NC (1 = libertada). Física: C1_FC_15 → %I0.15'),
      tag('Q0.0', 'Cil_Alimenta', 'Cilindro alimentador +. Física: %Q0.0'),
      tag('Q0.1', 'Gaveta_Preta', 'Atuador depósito / rampa preta (lógico)'),
      tag('Q0.2', 'Gaveta_Branca', 'Atuador depósito / rampa branca (lógico)'),
      tag('Q0.3', 'Gaveta_Metal', 'Atuador depósito / rampa metálica (lógico)'),
      tag('Q0.4', 'Motor_Rotativo', 'Motor do transportador rotativo'),
      tag('Q0.5', 'Retorno', 'Comando retorno à origem'),
      tag('Q0.6', 'Cil_Estampa', 'Cilindro de estampagem +. Física tabela: %Q0.8'),
      tag('Q0.7', 'L_Verde', 'Lâmpada verde — Pronto'),
      tag('Q0.8', 'L_Alarme', 'Lâmpada alarme / emergência'),
      tag('Q0.9', 'L_Azul', 'Lâmpada azul — modo MANUAL'),
      tag('Q0.10', 'L_Branca', 'Lâmpada branca — modo AUTOMÁTICO'),
      tag('Q0.11', 'L_Vermelha', 'Lâmpada vermelha — emergência'),
      tag('M0.0', 'Detetar', 'Memória fase de deteção'),
      tag('M0.1', 'Cnt_Preta', 'Impulso contagem peça preta'),
      tag('M0.2', 'Cnt_Branca', 'Impulso contagem peça branca'),
      tag('M0.3', 'Cnt_Metal', 'Impulso contagem peça metálica'),
      tag('M0.4', 'Rampa_Preta_Cheia', 'Rampa preta com 2 peças — bloqueia START'),
      tag('M0.5', 'Rampa_Branca_Cheia', 'Rampa branca com 2 peças — bloqueia START'),
      tag('M0.6', 'Rampa_Metal_Cheia', 'Rampa metálica com 2 peças — bloqueia START'),
    ],
    notes: [
      note(`${p}-n-test`, 'Como testar (ciclo único)', right, layout.minY + 200, '#bfdbfe', [
        'I0.15 ligado (emergência libertada) e I0.13 (modo AUTOMÁTICO). Impulso em I0.0 (START).',
        'Ligue I0.1 (peça) → deteção. Escolha o tipo: I0.2 Preta / I0.3 Branca / I0.4 Metal.',
        'I0.5 (posição estampa) → estampagem 5/6/8 s. Depois I0.6 + o mesmo tipo → deposita e conta.',
        'FC da gaveta (I0.7/8/9) → retorno. I0.10 (origem) → volta à etapa 0.',
      ]),
      note(`${p}-n-safety`, 'Emergência e rampas', right, layout.minY + 480, '#fecaca', [
        'Desligue I0.15: o GRAFCET de segurança passa à etapa 11; alarme a 2 Hz e luz vermelha.',
        'Rearme: ligue I0.15 e dê impulso em I0.14 para voltar à etapa 10.',
        'M0.4 / M0.5 / M0.6 = rampa cheia (2 peças). Enquanto algum estiver a 1, o START fica bloqueado.',
      ]),
      note(`${p}-n-guia`, 'Guião ATEC', right, layout.minY + 720, '#fef3c7', [
        'HMI: modos Manual e Automático; Iniciar / Parar / Pausar; feedback de sensores e atuadores.',
        'Registo de peças processadas (M0.1–M0.3 ou contadores reais) e reset independente de cada rampa.',
        'I/O físico: entradas C1_FC_0…15; saídas alimenta, braço, gaveta e estampa conforme tabela do PLC.',
      ]),
    ],
    restInputs: { 'I0.15': true, 'I0.13': true },
    inputModes: { 'I0.0': 'push', 'I0.14': 'push', 'I0.15': 'nc', 'I0.12': 'latch', 'I0.13': 'latch' },
    virtualInputCount: 16,
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
