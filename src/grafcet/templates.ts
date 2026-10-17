import type { GrafcetProgram, GrafcetStep, GrafcetTransition, GrafcetComment } from './engine'

const uid = () => crypto.randomUUID()

export interface GrafcetTemplateInfo {
  id: string
  name: string
  title: string
  description: string
  program: GrafcetProgram
}

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
      const t0 = uid(), t1 = uid(), t2 = uid(), t3 = uid(), t4 = uid()
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
          { id: t2, name: 'T2', from: [s2], to: [], condition: '2s/X2', x: 400, y: 290 },
          { id: t3, name: 'T3', from: [s3, s2], to: [s4], condition: '1', x: 260, y: 425, branchType: 'and-convergence' },
          { id: t4, name: 'T4', from: [s4], to: [s0], condition: '1s/X4', targetInfo: '0', x: 260, y: 565 },
        ],
        comments: [
          { id: uid(), text: 'Sincronismo Concorrente (AND)', x: 200, y: 35, fontSize: 15, fontWeight: '700' },
        ],
      }
    })(),
  },
]
