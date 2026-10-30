import type { GrafcetAction, GrafcetProgram, GrafcetStep, GrafcetTransition, GrafcetComment } from './engine'
import { autoLayout, SPINE_X, START_Y } from './layout'
import { grafcetExamples, type ExampleTag } from '../project/grafcetExamples'
import type { CanvasNote } from '../types'

const uid = () => crypto.randomUUID()

export interface GrafcetTemplateInfo {
  id: string
  name: string
  title: string
  description: string
  program: GrafcetProgram
  /** Exemplos completos: nomes da tabela de sinais e comentários (notas) que acompanham o diagrama. */
  tags?: ExampleTag[]
  notes?: Array<Omit<CanvasNote, 'createdAt'>>
}


/* ---- Construtor para modelos IEC 60848 ---------------------------------------------------
 * Descreve etapas/ações/transições de forma compacta e posiciona com o mesmo layout do
 * botão «Organizar» (ramos paralelos lado a lado). */
type Act = [kind: GrafcetAction['kind'], address: string, label?: string, extra?: Partial<GrafcetAction>]

const act = ([kind, address, label, extra]: Act): GrafcetAction => ({
  id: uid(), address, variable: address, description: label ?? address, condition: '1', kind, displayDescription: true, ...extra,
})

const stepOf = (name: string, actions: Act[] = [], opts: Partial<GrafcetStep> = {}): GrafcetStep => ({
  id: uid(), name, initial: false, stepType: 'simple', action: '', condition: '', actions: actions.map(act), ...opts,
})

const initialOf = (name: string, actions: Act[] = [], opts: Partial<GrafcetStep> = {}) =>
  stepOf(name, actions, { initial: true, stepType: 'initial', ...opts })

const placed = (program: GrafcetProgram): GrafcetProgram => {
  const pos = autoLayout(program.steps, program.transitions ?? [])
  return { ...program, steps: program.steps.map((step) => { const at = pos.get(step.id); return at ? { ...step, x: at.x, y: at.y, pinned: true } : step }) }
}

/** Transição entre etapas; `to`/`from` aceitam várias etapas (barra dupla AND). */
const link = (name: string, from: GrafcetStep[], to: GrafcetStep[], condition: string): GrafcetTransition => ({
  id: uid(), name, from: from.map((x) => x.id), to: to.map((x) => x.id), condition,
  ...(to.length > 1 ? { branchType: 'and-divergence' as const } : from.length > 1 ? { branchType: 'and-convergence' as const } : {}),
})

const IEC_TEMPLATES: GrafcetTemplateInfo[] = (() => {
  // 1) Sequência simples com ação condicionada (Q2 só com I4)
  const a0 = initialOf('0'), a1 = stepOf('1', [['N', 'Q1']]), a2 = stepOf('2', [['N', 'Q2', 'Q2', { condition: 'I4', type: 'conditional' }]])
  const simples: GrafcetProgram = placed({
    steps: [a0, a1, a2],
    transitions: [link('T1', [a0], [a1], 'I1'), link('T2', [a1], [a2], 'I2'), link('T3', [a2], [a0], 'I3')],
    comments: [],
  })

  // 2) Dois motores: ida em série, regresso em paralelo (divergência/convergência AND) e retorno ao 0
  const b0 = initialOf('0'), b1 = stepOf('1', [['N', 'MotorA_Dta', 'Motor A - Dreta']]), b2 = stepOf('2', [['N', 'MotorB_Dta', 'Motor B Dreta']])
  const b3 = stepOf('3', [['N', 'MotorA_Esq', 'Motor A Esquerda']]), b4 = stepOf('4')
  const b5 = stepOf('5', [['N', 'MotorB_Esq', 'Motor B Esquerda']]), b6 = stepOf('6')
  const motores: GrafcetProgram = placed({
    steps: [b0, b1, b2, b3, b4, b5, b6],
    transitions: [
      link('T1', [b0], [b1], 'Pm'), link('T2', [b1], [b2], 'FcAd'), link('T3', [b2], [b3, b5], 'FcBd'),
      link('T4', [b3], [b4], 'FcAe'), link('T5', [b5], [b6], 'FcBe'), link('T6', [b4, b6], [b0], '1'),
    ],
    comments: [],
  })

  // 3) Processo com 4 ramos paralelos, temporizações e etapa de falha (T11)
  const c0 = initialOf('0', [['S', 'Z1'], ['R', 'Z2'], ['R', 'PULSE_Z3', 'PULSE Z3']])
  const c1 = stepOf('1', [['S', 'NAPED'], ['S', 'Z2'], ['R', 'Z1']])
  const c2 = stepOf('2', [['R', 'NAPED'], ['R', 'PULSE_Z2', 'PULSE Z2'], ['D', 'TIMER_T0', 'TIMER T0 = 1s', { timeMs: 1000 }]])
  const c3 = stepOf('3', [['D', 'TIMER_T6', 'TIMER T6 = 6s', { timeMs: 6000 }]])
  const c4 = stepOf('4', [['S', 'Z1'], ['S', 'W1']])
  const c5 = stepOf('5', [['S', 'Z2'], ['S', 'W2']])
  const c6 = stepOf('6', [['S', 'Z3'], ['S', 'W3']])
  const c7 = stepOf('7', [['D', 'TIMER_T1', 'TIMER T1 = 3s', { timeMs: 3000 }]])
  const c8 = stepOf('8', [['D', 'TIMER_T2', 'TIMER T2 = 4s', { timeMs: 4000 }]])
  const c9 = stepOf('9', [['R', 'Z1'], ['R', 'Z2'], ['R', 'Z3'], ['D', 'TIMER_T3', 'TIMER T3 = 2s', { timeMs: 2000 }]])
  const c10 = stepOf('10', [['R', 'W1'], ['R', 'W2'], ['R', 'W3'], ['R', 'PULSE_Z2', 'PULSE Z2'], ['D', 'TIMER_T4', 'TIMER T4 = 5s', { timeMs: 5000 }]])
  const c11 = stepOf('11', [['S', 'PULSE_Z3', 'PULSE Z3'], ['R', 'Z1'], ['R', 'Z2'], ['R', 'Z3'], ['R', 'W1'], ['R', 'W2'], ['R', 'W3']], { description: 'Falha' })
  const processo: GrafcetProgram = placed({
    steps: [c0, c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11],
    transitions: [
      link('T1', [c0], [c1], 'START'),
      link('T2', [c1], [c2], 'CZ4'),
      link('T3(4,5,6)', [c2], [c3, c4, c5, c6], 'TIMER_T0'),
      link('T6', [c4], [c7], 'CZ1'),
      link('T7', [c5], [c8], 'CZ2'),
      // Sincronização das quatro sequências; a saída normal (T9) tem prioridade sobre a de falha (T11).
      link('T9', [c3, c6, c7, c8], [c9], 'TIMER_T1 * TIMER_T2 * CZ3'),
      link('T11', [c3, c6, c7, c8], [c11], 'TIMER_T1 * TIMER_T2 * TIMER_T6'),
      link('T10', [c9], [c10], 'TIMER_T3'),
      link("T'0", [c10], [c0], 'TIMER_T4'),
      link("T''0", [c11], [c0], 'CZ_LIC'),
    ],
    comments: [],
  })

  // 4) Seleção OU (ramos alternativos): E0 → E1/E2 → E3/E4 → E5, com transição em cada ramo
  const o0 = initialOf('E0'), o1 = stepOf('E1', [['N', 'ESQUERDA']]), o2 = stepOf('E2', [['N', 'DIREITA']])
  const o3 = stepOf('E3', [['N', 'INVERTE']]), o4 = stepOf('E4', [['N', 'INVERTE']]), o5 = stepOf('E5')
  const at = (step: GrafcetStep, col: number, row: number): GrafcetStep => ({ ...step, x: SPINE_X + col * 150, y: START_Y + row * 140, pinned: true })
  const selecaoOu: GrafcetProgram = {
    steps: [at(o0, 1, 0), at(o1, 0, 1), at(o2, 2, 1), at(o3, 0, 2), at(o4, 2, 2), at(o5, 1, 3)],
    transitions: [
      { ...link('T1', [o0], [o1], 'I0.1'), branchType: 'or-divergence' },
      { ...link('T2', [o0], [o2], 'I0.2'), branchType: 'or-divergence' },
      link('T3', [o1], [o3], 'I0.3'), link('T4', [o2], [o4], 'I0.4'),
      { ...link('T5', [o3], [o5], 'I0.5'), branchType: 'or-convergence' },
      { ...link('T6', [o4], [o5], 'I0.6'), branchType: 'or-convergence' },
    ],
    comments: [],
  }

  // 5) Semáforos de um cruzamento (modelo de nível 2): ações condicionadas, temporizadores e retornos à etapa 0
  const ck = { condition: 'ck', type: 'conditional' as const }
  const sm0 = initialOf('0', [['N', 'A2', 'A2 acende se ck=1', ck], ['N', 'B2', 'B2 acende se ck=1', ck]])
  const sm1 = stepOf('1', [['N', 'A2', 'A2 acende se ck=1', ck], ['N', 'B2', 'B2 acende se ck=1', ck], ['N', 'T0', 'T0 (10 s)']])
  const sm2 = stepOf('2', [['N', 'A1', 'A1'], ['N', 'B3', 'B3'], ['N', 'T1', 'T1 (30 s)']])
  const sm3 = stepOf('3', [['N', 'A1', 'A1'], ['N', 'B2', 'B2'], ['N', 'T2', 'T2 (3 s)']])
  const sm4 = stepOf('4', [['N', 'A1', 'A1'], ['N', 'B1', 'B1'], ['N', 'T3', 'T3 (2 s)']])
  const sm5 = stepOf('5', [['N', 'A3', 'A3'], ['N', 'B1', 'B1'], ['N', 'T1', 'T1 (30 s)']])
  const sm6 = stepOf('6', [['N', 'A2', 'A2'], ['N', 'B1', 'B1'], ['N', 'T2', 'T2 (3 s)']])
  const sm7 = stepOf('7', [['N', 'A1', 'A1'], ['N', 'B1', 'B1'], ['N', 'T3', 'T3 (2 s)']])
  const semaforos: GrafcetProgram = placed({
    steps: [sm0, sm1, sm2, sm3, sm4, sm5, sm6, sm7],
    transitions: [
      link('t', [sm0], [sm1], 'i1 * /m10'), link('t0', [sm1], [sm2], '10s/X1'), link('t1', [sm2], [sm3], '30s/X2'),
      link('t2', [sm3], [sm4], '3s/X3'), link('t3', [sm4], [sm5], '2s/X4'), link('t1', [sm5], [sm6], '30s/X5'),
      link('t2', [sm6], [sm7], '3s/X6'), link('t3', [sm7], [sm2], '2s/X7'),
      link('', [sm2], [sm0], '/i1 + m10'), link('', [sm3], [sm0], '/i1 + m10'), link('', [sm4], [sm0], '/i1 + m10'),
      link('', [sm5], [sm0], '/i1 + m10'), link('', [sm6], [sm0], '/i1 + m10'), link('', [sm7], [sm0], '/i1 + m10'),
    ],
    comments: [],
  })

  return [
    { id: 'iec-sequencia-simples', name: 'Sequência simples (I1→I2→I3)', title: 'Sequência simples com ação condicionada', description: 'Etapa inicial, duas etapas, retorno ao 0 e ação Q2 condicionada por I4.', program: simples },
    { id: 'iec-motores-paralelo', name: 'Dois motores (ramos paralelos)', title: 'Dois motores: ida em série, regresso em paralelo', description: 'Divergência e convergência AND com barra dupla IEC e retorno à etapa inicial.', program: motores },
    { id: 'iec-processo-timers', name: 'Processo com 4 ramos e falha', title: 'Processo com ramos paralelos, temporizadores S/R e etapa de falha', description: 'Divergência AND em 4 ramos, temporizações (TIMER), sincronização e duas saídas (normal T9 / falha T11).', program: processo },
    { id: 'iec-selecao-ou', name: 'Seleção OU (ramos alternativos)', title: 'Seleção OU: dois ramos alternativos com convergência', description: 'Divergência OU (uma só linha) com transição em cada ramo e convergência OU numa etapa final.', program: selecaoOu },
    { id: 'iec-semaforos', name: 'Semáforos (ciclo com retorno e paragem)', title: 'Semáforos de um cruzamento (nível 2)', description: 'Ações condicionadas, temporizadores nas etapas e transições de paragem que regressam à etapa 0.', program: semaforos },
  ]
})()

export const GRAFCET_TEMPLATES: GrafcetTemplateInfo[] = [
  // 1. G0 - Grafcet Controlo (conforme captura FluidSIM 6)
  {
    id: 'g0-controlo',
    name: 'G0 - Grafcet Controlo',
    title: 'G0 - Grafcet Controlo (Modos de Marcha e Paragem)',
    description: 'Gestão de modos Auto, Manual, Reset e Paragem de Emergência com divergência OU.',
    program: (() => {
      const s1 = uid(), s3 = uid(), s4 = uid(), s5 = uid(), s6 = uid(), sEmerg = uid()
      const tAuto = uid(), tAutoStop = uid(), tAutoReturn = uid()
      const tMan = uid(), tManReturn = uid()
      const tReset = uid(), tResetReturn = uid()
      const tEmergIn = uid(), tEmergOut = uid()

      const steps: GrafcetStep[] = [
        {
          id: s1,
          name: '1',
          initial: true,
          stepType: 'initial',
          action: '',
          condition: '',
          description: 'Maquina Parada',
          x: 100,
          y: 70,
          chart: 'G0',
          actions: [{ id: uid(), address: 'L_Verde', variable: 'L_Verde', description: 'L_Verde', condition: '1', kind: 'N', displayDescription: true }],
        },
        {
          id: s5,
          name: '5',
          initial: false,
          stepType: 'simple',
          action: '',
          condition: '',
          description: 'Maquina Auto',
          x: 100,
          y: 220,
          chart: 'G0',
          actions: [
            { id: uid(), address: 'L_Verde', variable: 'L_Verde', description: 'L_Verde', condition: '1', kind: 'N', displayDescription: true },
            { id: uid(), address: 'L_Amarela', variable: 'L_Amarela', description: 'L_Amarela', condition: '1HZ', kind: 'N', type: 'conditional', displayDescription: true },
          ],
        },
        {
          id: s6,
          name: '6',
          initial: false,
          stepType: 'simple',
          action: '',
          condition: '',
          description: 'Maquina A Terminar Ciclo',
          x: 100,
          y: 370,
          chart: 'G0',
          actions: [
            { id: uid(), address: 'L_Verde', variable: 'L_Verde', description: 'L_Verde', condition: '1HZ', kind: 'N', type: 'conditional', displayDescription: true },
            { id: uid(), address: 'L_Amarela', variable: 'L_Amarela', description: 'L_Amarela', condition: '1HZ', kind: 'N', type: 'conditional', displayDescription: true },
          ],
        },
        {
          id: s4,
          name: '4',
          initial: false,
          stepType: 'simple',
          action: '',
          condition: '',
          description: 'Maquina Manual',
          x: 440,
          y: 240,
          chart: 'G0',
          actions: [
            { id: uid(), address: 'L_Amarela', variable: 'L_Amarela', description: 'L_Amarela', condition: '0.5 HZ', kind: 'N', type: 'conditional', displayDescription: true },
          ],
        },
        {
          id: s3,
          name: '3',
          initial: false,
          stepType: 'simple',
          action: '',
          condition: '',
          description: 'Maquina Reset',
          x: 740,
          y: 240,
          chart: 'G0',
          actions: [
            { id: uid(), address: 'L_Amarela', variable: 'L_Amarela', description: 'L_Amarela', condition: '2 HZ', kind: 'N', type: 'conditional', displayDescription: true },
          ],
        },
        {
          id: sEmerg,
          name: '9',
          initial: false,
          stepType: 'simple',
          action: '',
          condition: '',
          description: 'Maquina em Emergencia',
          x: 100,
          y: 560,
          chart: 'G0',
          actions: [
            { id: uid(), address: 'L_Vermelha', variable: 'L_Vermelha', description: 'L_Vermelha', condition: '2 HZ', kind: 'N', type: 'conditional', displayDescription: true },
          ],
        },
      ]

      const transitions: GrafcetTransition[] = [
        {
          id: tAuto,
          name: 'T_Auto',
          from: [s1],
          to: [s5],
          condition: 'B_Start * B_Stop_NF * fc_a0 * fc_b0 * /In_Man',
          x: 100,
          y: 155,
          chart: 'G0',
          branchType: 'or-divergence',
        },
        {
          id: tAutoStop,
          name: 'T_AutoStop',
          from: [s5],
          to: [s6],
          condition: '_B_Stop_NF + G1X75',
          x: 100,
          y: 305,
          chart: 'G0',
        },
        {
          id: tAutoReturn,
          name: 'T_AutoEnd',
          from: [s6],
          to: [s1],
          condition: 'G1X11',
          targetInfo: '1',
          x: 100,
          y: 455,
          chart: 'G0',
        },
        {
          id: tMan,
          name: 'T_Man',
          from: [s1],
          to: [s4],
          condition: 'B_Stop_NF * In_Man',
          x: 440,
          y: 165,
          chart: 'G0',
          branchType: 'or-divergence',
        },
        {
          id: tManReturn,
          name: 'T_ManEnd',
          from: [s4],
          to: [s1],
          condition: '_In_Man',
          targetInfo: '1',
          x: 440,
          y: 335,
          chart: 'G0',
        },
        {
          id: tReset,
          name: 'T_Reset',
          from: [s1],
          to: [s3],
          condition: 'B_Reset * B_Stop_NF',
          x: 740,
          y: 165,
          chart: 'G0',
          branchType: 'or-divergence',
        },
        {
          id: tResetReturn,
          name: 'T_ResetEnd',
          from: [s3],
          to: [s1],
          condition: 'G2X135',
          targetInfo: '1',
          x: 740,
          y: 335,
          chart: 'G0',
        },
        {
          id: tEmergIn,
          name: 'T_EmergIn',
          from: [s1],
          to: [sEmerg],
          condition: '_Int_Emerg_NF',
          x: 100,
          y: 500,
          chart: 'G0',
        },
        {
          id: tEmergOut,
          name: 'T_EmergOut',
          from: [sEmerg],
          to: [s1],
          condition: '_Emerg_NF',
          targetInfo: '1',
          x: 100,
          y: 645,
          chart: 'G0',
        },
      ]

      const comments: GrafcetComment[] = [
        { id: uid(), text: 'G0 - Grafcet Controlo', x: 80, y: 30, fontSize: 16, fontWeight: '700', chart: 'G0' },
        { id: uid(), text: 'G0 <=> X9 (Bloco de Emergência)', x: 80, y: 485, fontSize: 14, fontWeight: '700', chart: 'G0' },
      ]

      return { steps, transitions, comments, activeChart: 'G0' }
    })(),
  },

  // 2. G1 - Grafcet Funcionamento (conforme captura FluidSIM 7)
  {
    id: 'g1-funcionamento',
    name: 'G1 - Grafcet Funcionamento',
    title: 'G1 - Grafcet Funcionamento (Sequência de Produção e Triagem)',
    description: 'Sequência eletropneumática completa (A, B, vácuo E) com triagem por sensor de rolamento (C ou D).',
    program: (() => {
      const s11 = uid(), s15 = uid(), s20 = uid(), s25 = uid(), s30 = uid(), s35 = uid(), s40 = uid(), s45 = uid(), s50 = uid()
      const s55 = uid(), s60 = uid(), s65 = uid(), s70 = uid(), s75 = uid(), s79 = uid()

      const steps: GrafcetStep[] = [
        { id: s11, name: '11', initial: true, stepType: 'initial', action: '', condition: '', x: 100, y: 60, chart: 'G1' },
        { id: s15, name: '15', initial: false, stepType: 'simple', action: '', condition: '', x: 100, y: 135, chart: 'G1', actions: [{ id: uid(), address: 'Y0_A+', variable: 'Y0_A+', description: 'Y0_A+', condition: '1', kind: 'N', displayDescription: true }] },
        { id: s20, name: '20', initial: false, stepType: 'simple', action: '', condition: '', x: 100, y: 215, chart: 'G1', actions: [{ id: uid(), address: 'Y2_B+', variable: 'Y2_B+', description: 'Y2_B+', condition: '1', kind: 'N', displayDescription: true }] },
        { id: s25, name: '25', initial: false, stepType: 'simple', action: '', condition: '', x: 100, y: 295, chart: 'G1', actions: [{ id: uid(), address: 'Y7_E+_Vacuo_On', variable: 'Y7_E+_Vacuo_On', description: 'Y7_E+_Vacuo_On', condition: '1', kind: 'N', displayDescription: true }] },
        { id: s30, name: '30', initial: false, stepType: 'simple', action: '', condition: '', x: 100, y: 375, chart: 'G1', actions: [{ id: uid(), address: 'Y3_B-', variable: 'Y3_B-', description: 'Y3_B-', condition: '1', kind: 'N', displayDescription: true }] },
        { id: s35, name: '35', initial: false, stepType: 'simple', action: '', condition: '', x: 100, y: 455, chart: 'G1', actions: [{ id: uid(), address: 'Y1_A-', variable: 'Y1_A-', description: 'Y1_A-', condition: '1', kind: 'N', displayDescription: true }] },
        { id: s40, name: '40', initial: false, stepType: 'simple', action: '', condition: '', x: 100, y: 535, chart: 'G1', actions: [{ id: uid(), address: 'Y2_B+', variable: 'Y2_B+', description: 'Y2_B+', condition: '1', kind: 'N', displayDescription: true }] },
        { id: s45, name: '45', initial: false, stepType: 'simple', action: '', condition: '', x: 100, y: 615, chart: 'G1', actions: [{ id: uid(), address: 'Y8_E-_Vacuo_Off', variable: 'Y8_E-_Vacuo_Off', description: 'Y8_E-_Vacuo_Off', condition: '1', kind: 'N', displayDescription: true }] },
        { id: s50, name: '50', initial: false, stepType: 'simple', action: '', condition: '', x: 100, y: 695, chart: 'G1', actions: [{ id: uid(), address: 'Y3_B+', variable: 'Y3_B+', description: 'Y3_B+', condition: '1', kind: 'N', displayDescription: true }] },

        // Ramo esquerdo: sem rolamento
        { id: s55, name: '55', initial: false, stepType: 'simple', action: '', condition: '', x: 100, y: 805, chart: 'G1', actions: [{ id: uid(), address: 'Y4_C+', variable: 'Y4_C+', description: 'Y4_C+', condition: '1', kind: 'N', displayDescription: true }] },
        { id: s60, name: '60', initial: false, stepType: 'simple', action: '', condition: '', x: 100, y: 885, chart: 'G1', actions: [{ id: uid(), address: 'C-', variable: 'C-', description: 'C-', condition: '1', kind: 'N', displayDescription: true }] },

        // Ramo direito: com rolamento
        { id: s65, name: '65', initial: false, stepType: 'simple', action: '', condition: '', x: 420, y: 805, chart: 'G1', actions: [{ id: uid(), address: 'Y5_D+', variable: 'Y5_D+', description: 'Y5_D+', condition: '1', kind: 'N', displayDescription: true }] },
        { id: s70, name: '70', initial: false, stepType: 'simple', action: '', condition: '', x: 420, y: 885, chart: 'G1', actions: [{ id: uid(), address: 'Y6_D-', variable: 'Y6_D-', description: 'Y6_D-', condition: '1', kind: 'N', displayDescription: true }] },

        // Convergência
        { id: s75, name: '75', initial: false, stepType: 'simple', action: '', condition: '', description: 'Fim do Ciclo', x: 100, y: 995, chart: 'G1' },

        // Trap de emergência G1 <=> X9
        { id: s79, name: '79', initial: false, stepType: 'simple', action: '', condition: '', description: 'Maquina em Emergencia', x: 560, y: 460, chart: 'G1' },
      ]

      const transitions: GrafcetTransition[] = [
        { id: uid(), name: 'T11', from: [s11], to: [s15], condition: 'G0X5', x: 100, y: 100, chart: 'G1' },
        { id: uid(), name: 'T15', from: [s15], to: [s20], condition: 'fc_a1', x: 100, y: 180, chart: 'G1' },
        { id: uid(), name: 'T20', from: [s20], to: [s25], condition: 'b1', x: 100, y: 260, chart: 'G1' },
        { id: uid(), name: 'T25', from: [s25], to: [s30], condition: '1s/X25', x: 100, y: 340, chart: 'G1' },
        { id: uid(), name: 'T30', from: [s30], to: [s35], condition: 'fc_b0', x: 100, y: 420, chart: 'G1' },
        { id: uid(), name: 'T35', from: [s35], to: [s40], condition: 'fc_a0', x: 100, y: 500, chart: 'G1' },
        { id: uid(), name: 'T40', from: [s40], to: [s45], condition: 'fc_b1', x: 100, y: 580, chart: 'G1' },
        { id: uid(), name: 'T45', from: [s45], to: [s50], condition: '1s/X45', x: 100, y: 660, chart: 'G1' },

        // Divergência OU
        { id: uid(), name: 'T50_L', from: [s50], to: [s55], condition: 'b0 * /S_Rolamento', x: 100, y: 755, chart: 'G1', branchType: 'or-divergence' },
        { id: uid(), name: 'T55', from: [s55], to: [s60], condition: '1s/X55', x: 100, y: 850, chart: 'G1' },
        { id: uid(), name: 'T60', from: [s60], to: [s75], condition: '1s/X60', x: 100, y: 940, chart: 'G1', branchType: 'or-convergence' },

        { id: uid(), name: 'T50_R', from: [s50], to: [s65], condition: 'b0 * S_Rolamento', x: 420, y: 755, chart: 'G1', branchType: 'or-divergence' },
        { id: uid(), name: 'T65', from: [s65], to: [s70], condition: '1s/X65', x: 420, y: 850, chart: 'G1' },
        { id: uid(), name: 'T70', from: [s70], to: [s75], condition: '1s/X70', x: 420, y: 940, chart: 'G1', branchType: 'or-convergence' },

        // Retorno
        { id: uid(), name: 'T75', from: [s75], to: [s11], condition: 'G0 <=> X5', targetInfo: '11', x: 100, y: 1055, chart: 'G1' },

        // Emergência
        { id: uid(), name: 'T_EmG1', from: [s11], to: [s79], condition: '_G0X9', x: 560, y: 410, chart: 'G1' },
        { id: uid(), name: 'T_EmG1_End', from: [s79], to: [s11], condition: '_Emerg_NF', targetInfo: '11', x: 560, y: 520, chart: 'G1' },
      ]

      const comments: GrafcetComment[] = [
        { id: uid(), text: 'G1 - Grafcet Funcionamento', x: 80, y: 25, fontSize: 16, fontWeight: '700', chart: 'G1' },
        { id: uid(), text: 'G1 <=> X9', x: 530, y: 380, fontSize: 14, fontWeight: '700', chart: 'G1' },
      ]

      return { steps, transitions, comments, activeChart: 'G1' }
    })(),
  },

  // 3. G2 - Grafcet Reset G2 (conforme captura FluidSIM 1)
  {
    id: 'g2-reset',
    name: 'Grafcet Reset G2',
    title: 'Grafcet Reset G2 (Sequência de Reposição na Posição Inicial)',
    description: 'Sequência de reposição dos atuadores D, C, B, A e desativação do vácuo.',
    program: (() => {
      const s81 = uid(), s85 = uid(), s90 = uid(), s95 = uid(), s100 = uid(), s105 = uid()
      const s110 = uid(), s115 = uid(), s120 = uid(), s125 = uid(), s135a = uid(), s135b = uid()

      const steps: GrafcetStep[] = [
        { id: s81, name: '81', initial: true, stepType: 'initial', action: '', condition: '', x: 100, y: 60, chart: 'G2' },
        { id: s85, name: '85', initial: false, stepType: 'simple', action: '', condition: '', x: 100, y: 135, chart: 'G2', actions: [{ id: uid(), address: 'Y6_D-', variable: 'Y6_D-', description: 'Y6_D-', condition: '1', kind: 'N', displayDescription: true }] },
        { id: s90, name: '90', initial: false, stepType: 'simple', action: '', condition: '', x: 100, y: 215, chart: 'G2', actions: [{ id: uid(), address: 'Y4_C+', variable: 'Y4_C+', description: 'Y4_C+', condition: '1', kind: 'N', displayDescription: true }] },
        { id: s95, name: '95', initial: false, stepType: 'simple', action: '', condition: '', x: 100, y: 295, chart: 'G2', actions: [{ id: uid(), address: 'C-', variable: 'C-', description: 'C-', condition: '1', kind: 'N', displayDescription: true }] },
        { id: s100, name: '100', initial: false, stepType: 'simple', action: '', condition: '', x: 100, y: 375, chart: 'G2', actions: [{ id: uid(), address: 'Y3_B-', variable: 'Y3_B-', description: 'Y3_B-', condition: '1', kind: 'N', displayDescription: true }] },
        { id: s105, name: '105', initial: false, stepType: 'simple', action: '', condition: '', x: 100, y: 455, chart: 'G2', actions: [{ id: uid(), address: 'Y1_A-', variable: 'Y1_A-', description: 'Y1_A-', condition: '1', kind: 'N', displayDescription: true }] },
        { id: s110, name: '110', initial: false, stepType: 'simple', action: '', condition: '', x: 100, y: 535, chart: 'G2', actions: [{ id: uid(), address: 'Y2_B+', variable: 'Y2_B+', description: 'Y2_B+', condition: '1', kind: 'N', displayDescription: true }] },
        { id: s115, name: '115', initial: false, stepType: 'simple', action: '', condition: '', x: 100, y: 615, chart: 'G2', actions: [{ id: uid(), address: 'Y8_E-_VACUO_OFF', variable: 'Y8_E-_VACUO_OFF', description: 'Y8_E-_VACUO_OFF', condition: '1', kind: 'N', displayDescription: true }] },
        { id: s120, name: '120', initial: false, stepType: 'simple', action: '', condition: '', x: 100, y: 695, chart: 'G2', actions: [{ id: uid(), address: 'Y3_B-', variable: 'Y3_B-', description: 'Y3_B-', condition: '1', kind: 'N', displayDescription: true }] },
        { id: s125, name: '125', initial: false, stepType: 'simple', action: '', condition: '', x: 100, y: 775, chart: 'G2', actions: [{ id: uid(), address: 'Y4_C+', variable: 'Y4_C+', description: 'Y4_C+', condition: '1', kind: 'N', displayDescription: true }] },
        { id: s135a, name: '135', initial: false, stepType: 'simple', action: '', condition: '', x: 100, y: 855, chart: 'G2', actions: [{ id: uid(), address: 'C-', variable: 'C-', description: 'C-', condition: '1', kind: 'N', displayDescription: true }] },
        { id: s135b, name: '135', initial: false, stepType: 'simple', action: '', condition: '', description: 'Fim do Reset', x: 100, y: 935, chart: 'G2' },
      ]

      const transitions: GrafcetTransition[] = [
        { id: uid(), from: [s81], to: [s85], condition: 'G0X3', x: 100, y: 100, chart: 'G2' },
        { id: uid(), from: [s85], to: [s90], condition: '10s/X85', x: 100, y: 180, chart: 'G2' },
        { id: uid(), from: [s90], to: [s95], condition: '5s/X90', x: 100, y: 260, chart: 'G2' },
        { id: uid(), from: [s95], to: [s100], condition: '5s/X95', x: 100, y: 340, chart: 'G2' },
        { id: uid(), from: [s100], to: [s105], condition: 'b0', x: 100, y: 420, chart: 'G2' },
        { id: uid(), from: [s105], to: [s110], condition: 'a0', x: 100, y: 500, chart: 'G2' },
        { id: uid(), from: [s110], to: [s115], condition: 'b1', x: 100, y: 580, chart: 'G2' },
        { id: uid(), from: [s115], to: [s120], condition: '20s/X15', x: 100, y: 660, chart: 'G2' },
        { id: uid(), from: [s120], to: [s125], condition: 'b0', x: 100, y: 740, chart: 'G2' },
        { id: uid(), from: [s125], to: [s135a], condition: '5s/X125', x: 100, y: 820, chart: 'G2' },
        { id: uid(), from: [s135a], to: [s135b], condition: '5s/X135', x: 100, y: 900, chart: 'G2' },
        { id: uid(), from: [s135b], to: [s81], condition: 'G0X1', targetInfo: '51', x: 100, y: 980, chart: 'G2' },
      ]

      const comments: GrafcetComment[] = [
        { id: uid(), text: 'Grafcet Reset G2', x: 80, y: 25, fontSize: 16, fontWeight: '700', chart: 'G2' },
      ]

      return { steps, transitions, comments, activeChart: 'G2' }
    })(),
  },

  // 4. Partida Direta com Selo
  {
    id: 'partida-direta',
    name: 'Partida Direta de Motor',
    title: 'Partida Direta com Contacto de Selo',
    description: 'Sequência básica industrial de arranque e paragem de motor elétrico com sinalização.',
    program: (() => {
      const s0 = uid(), s1 = uid()
      const t1 = uid(), t2 = uid()
      return {
        steps: [
          {
            id: s0,
            name: '0',
            initial: true,
            stepType: 'initial',
            action: '',
            condition: '',
            description: 'Motor Parado',
            x: 120,
            y: 80,
            actions: [{ id: uid(), address: 'L_Verde', variable: 'L_Verde', description: 'L_Verde', condition: '1', kind: 'N', displayDescription: true }],
          },
          {
            id: s1,
            name: '1',
            initial: false,
            stepType: 'simple',
            action: '',
            condition: '',
            description: 'Motor em Marcha',
            x: 120,
            y: 240,
            actions: [
              { id: uid(), address: 'Q1', variable: 'KM1', description: 'KM1 (Motor)', condition: '1', kind: 'N', displayDescription: true },
              { id: uid(), address: 'L_Amarela', variable: 'L_Amarela', description: 'L_Amarela', condition: '1', kind: 'N', displayDescription: true },
            ],
          },
        ],
        transitions: [
          { id: t1, name: 'T1', from: [s0], to: [s1], condition: 'B_Start * B_Stop_NF', x: 120, y: 160 },
          { id: t2, name: 'T2', from: [s1], to: [s0], condition: '_B_Stop_NF', targetInfo: '0', x: 120, y: 320 },
        ],
        comments: [
          { id: uid(), text: 'Partida Direta - KM1', x: 100, y: 35, fontSize: 15, fontWeight: '700' },
        ],
      }
    })(),
  },

  // 5. Partida Estrela-Triângulo
  {
    id: 'estrela-triangulo',
    name: 'Partida Estrela-Triângulo',
    title: 'Partida Estrela-Triângulo com Temporização (Y-Δ)',
    description: 'Arranque em Estrela (KM1+KM2), transição temporizada de 4s e comutação para Triângulo (KM1+KM3).',
    program: (() => {
      const s0 = uid(), s1 = uid(), s2 = uid()
      const t1 = uid(), t2 = uid(), t3 = uid()
      return {
        steps: [
          {
            id: s0,
            name: '0',
            initial: true,
            stepType: 'initial',
            action: '',
            condition: '',
            description: 'Repouso',
            x: 120,
            y: 80,
          },
          {
            id: s1,
            name: '1',
            initial: false,
            stepType: 'simple',
            action: '',
            condition: '',
            description: 'Ligação Estrela (Y)',
            x: 120,
            y: 220,
            actions: [
              { id: uid(), address: 'Q1', variable: 'KM1', description: 'KM1 (Rede)', condition: '1', kind: 'N', displayDescription: true },
              { id: uid(), address: 'Q2', variable: 'KM2', description: 'KM2 (Estrela)', condition: '1', kind: 'N', displayDescription: true },
            ],
          },
          {
            id: s2,
            name: '2',
            initial: false,
            stepType: 'simple',
            action: '',
            condition: '',
            description: 'Ligação Triângulo (Δ)',
            x: 120,
            y: 360,
            actions: [
              { id: uid(), address: 'Q1', variable: 'KM1', description: 'KM1 (Rede)', condition: '1', kind: 'N', displayDescription: true },
              { id: uid(), address: 'Q3', variable: 'KM3', description: 'KM3 (Triângulo)', condition: '1', kind: 'N', displayDescription: true },
            ],
          },
        ],
        transitions: [
          { id: t1, name: 'T1', from: [s0], to: [s1], condition: 'B_Start * B_Stop_NF', x: 120, y: 150 },
          { id: t2, name: 'T2', from: [s1], to: [s2], condition: '4s/X1', x: 120, y: 290 },
          { id: t3, name: 'T3', from: [s2], to: [s0], condition: '_B_Stop_NF', targetInfo: '0', x: 120, y: 430 },
        ],
        comments: [
          { id: uid(), text: 'Partida Estrela-Triângulo (Y-Δ)', x: 100, y: 35, fontSize: 15, fontWeight: '700' },
        ],
      }
    })(),
  },

  // 6. Divergência e Convergência Simultânea (AND)
  {
    id: 'concorrente-and',
    name: 'Processo Concorrente (AND)',
    title: 'Divergência e Convergência Simultânea (AND)',
    description: 'Etapa inicial dispara dois ramos em simultâneo (AND), que progridem independentemente e sincronizam no final.',
    program: (() => {
      const s0 = uid(), s1 = uid(), s2 = uid(), s3 = uid(), s4 = uid()
      const t0 = uid(), t1 = uid(), t3 = uid(), t4 = uid()
      return {
        steps: [
          { id: s0, name: '0', initial: true, stepType: 'initial', action: '', condition: '', description: 'Início', x: 260, y: 80 },
          { id: s1, name: '1', initial: false, stepType: 'simple', action: '', condition: '', description: 'Ramo A', x: 120, y: 220, actions: [{ id: uid(), address: 'Q1', variable: 'Atuador_A', description: 'Atuador A', condition: '1', kind: 'N', displayDescription: true }] },
          { id: s2, name: '2', initial: false, stepType: 'simple', action: '', condition: '', description: 'Ramo B', x: 400, y: 220, actions: [{ id: uid(), address: 'Q2', variable: 'Atuador_B', description: 'Atuador B', condition: '1', kind: 'N', displayDescription: true }] },
          { id: s3, name: '3', initial: false, stepType: 'simple', action: '', condition: '', description: 'Avanço Ramo A', x: 120, y: 360 },
          { id: s4, name: '4', initial: false, stepType: 'simple', action: '', condition: '', description: 'Sincronizado', x: 260, y: 490, actions: [{ id: uid(), address: 'Q3', variable: 'Conclusão', description: 'Sinal Conclusão', condition: '1', kind: 'N', displayDescription: true }] },
        ],
        transitions: [
          { id: t0, name: 'T0', from: [s0], to: [s1, s2], condition: 'B_Start', x: 260, y: 150, branchType: 'and-divergence' },
          { id: t1, name: 'T1', from: [s1], to: [s3], condition: '1s/X1', x: 120, y: 290 },
          { id: t3, name: 'T3', from: [s3, s2], to: [s4], condition: '1', x: 260, y: 425, branchType: 'and-convergence' },
          { id: t4, name: 'T4', from: [s4], to: [s0], condition: '1s/X4', targetInfo: '0', x: 260, y: 565 },
        ],
        comments: [
          { id: uid(), text: 'Sincronismo Concorrente (AND)', x: 200, y: 35, fontSize: 15, fontWeight: '700' },
        ],
      }
    })(),
  },
  ...IEC_TEMPLATES,
]

// Exemplos completos e funcionais (básico, normal, avançado) à cabeça da lista.
GRAFCET_TEMPLATES.unshift(...grafcetExamples().map((example): GrafcetTemplateInfo => ({
  id: example.id, name: example.name.replace(/^Exemplo GRAFCET \d · /, ''), title: example.title, description: example.description,
  program: example.program, tags: example.tags, notes: example.notes,
})))

/** Os modelos foram desenhados com as ações empilhadas: mantém essa disposição nas etapas com várias ações
 *  (as etapas novas criadas no editor usam ações em linha, lado a lado). */
GRAFCET_TEMPLATES.forEach((template) => {
  template.program.steps.forEach((step) => {
    if ((step.actions?.length ?? 0) >= 2 && !step.actionLayout) step.actionLayout = 'column'
  })
})
