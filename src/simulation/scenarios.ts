// ============================================================================
// Cenários prontos — aplicações industriais completas, ligadas de verdade pelo
// mesmo modelo de dados usado pelas três vistas (esquema, 3D e ladder).
// ============================================================================

import { createComponent, terminalByLabel } from '../electrical/factory'
import type { ElectricalComponent, Wire, LadderProgram, LadderContact, LadderBranch, WireColor } from '../types'
import { nanoid } from 'nanoid'

function wire(from: { id: string }, to: { id: string }, color: WireColor, gauge = '1.5mm²', label?: string, kind: Wire['kind'] = 'control'): Wire {
  return {
    id: nanoid(8),
    fromTerminalId: from.id,
    toTerminalId: to.id,
    color,
    gauge,
    kind,
    flexibility: 'flexible',
    route: 'orthogonal',
    bend: 0.5,
    label,
    number: `W${nanoid(4)}`,
    energized: false,
  }
}

function contact(address: string, type: LadderContact['contactType'] = 'NO'): LadderContact {
  return { kind: 'contact', id: nanoid(6), address, contactType: type }
}
function branch(...elements: LadderContact[]): LadderBranch {
  return { id: nanoid(6), elements }
}

export interface Scenario {
  id: string
  name: string
  description: string
  components: ElectricalComponent[]
  wires: Wire[]
  ladder: LadderProgram
}

// ---------------------------------------------------------------------------
// 1 — Partida direta com selo
// ---------------------------------------------------------------------------
export function buildDirectStartScenario(): Scenario {
  const QF1 = createComponent('breaker3p', 'QF1', 'Disjuntor Geral', 0, 60, 40)
  const RT1 = createComponent('thermalRelay', 'RT1', 'Relé Térmico', 1, 220, 40)
  const KM1 = createComponent('contactor', 'KM1', 'Contator Partida', 2, 380, 40)
  const S1 = createComponent('buttonNC', 'S1', 'STOP', 3, 560, 300)
  const S2 = createComponent('buttonNO', 'S2', 'START', 4, 680, 300)
  const PLC1 = createComponent('plcLogo', 'PLC1', 'LOGO! 230RCE', 5, 560, 60, { outputs: { Q1: false, Q2: false, Q3: false, Q4: false } })
  const H1 = createComponent('ledGreen', 'H1', 'Motor Ligado', 6, 800, 60)
  const H2 = createComponent('ledRed', 'H2', 'Falha / Parado', 7, 800, 150)
  const M1 = createComponent('motor3ph', 'M1', 'Motor Trifásico', 8, 380, 460)
  const XN = createComponent('busbarNeutral', 'XN', 'Barramento Neutro', 9, 60, 300)
  const BPE = createComponent('earthBar', 'BPE', 'Barra de Terra', 10, 60, 400)
  const BR = createComponent('breaker3p', 'QF2', 'Entrada L1/L2/L3', 11, 60, 150)
  BR.state.closed = true

  const components = [QF1, RT1, KM1, S1, S2, PLC1, H1, H2, M1, XN, BPE, BR]
  const T = terminalByLabel

  const wires: Wire[] = [
    wire(T(BR, '2')!, T(QF1, '1')!, 'red', '2.5mm²', 'L1', 'power'),
    wire(T(BR, '4')!, T(QF1, '3')!, 'red', '2.5mm²', 'L2', 'power'),
    wire(T(BR, '6')!, T(QF1, '5')!, 'red', '2.5mm²', 'L3', 'power'),

    wire(T(QF1, '2')!, T(RT1, '1L1')!, 'red', '2.5mm²', undefined, 'power'),
    wire(T(QF1, '4')!, T(RT1, '3L2')!, 'red', '2.5mm²', undefined, 'power'),
    wire(T(QF1, '6')!, T(RT1, '5L3')!, 'red', '2.5mm²', undefined, 'power'),
    wire(T(RT1, '2T1')!, T(KM1, '1L1')!, 'red', '2.5mm²', undefined, 'power'),
    wire(T(RT1, '4T2')!, T(KM1, '3L2')!, 'red', '2.5mm²', undefined, 'power'),
    wire(T(RT1, '6T3')!, T(KM1, '5L3')!, 'red', '2.5mm²', undefined, 'power'),
    wire(T(KM1, '2T1')!, T(M1, 'U1')!, 'black', '2.5mm²', undefined, 'power'),
    wire(T(KM1, '4T2')!, T(M1, 'V1')!, 'black', '2.5mm²', undefined, 'power'),
    wire(T(KM1, '6T3')!, T(M1, 'W1')!, 'black', '2.5mm²', undefined, 'power'),
    wire(T(M1, 'PE')!, T(BPE, 'PE2')!, 'green-yellow', '2.5mm²', 'PE', 'earth'),

    wire(T(QF1, '2')!, T(S1, '21')!, 'orange', '1mm²', 'L-ctrl'),
    wire(T(S1, '22')!, T(PLC1, 'I1')!, 'orange', '1mm²'),
    wire(T(QF1, '2')!, T(S2, '13')!, 'orange', '1mm²'),
    wire(T(S2, '14')!, T(PLC1, 'I2')!, 'orange', '1mm²'),
    wire(T(QF1, '2')!, T(PLC1, 'L')!, 'orange', '1mm²'),
    wire(T(XN, 'N1')!, T(PLC1, 'N')!, 'blue', '1mm²', undefined, 'neutral'),

    wire(T(PLC1, 'Q1')!, T(KM1, 'A1')!, 'grey', '1mm²'),
    wire(T(KM1, 'A2')!, T(XN, 'N2')!, 'blue', '1mm²', undefined, 'neutral'),

    wire(T(PLC1, 'Q1')!, T(H1, 'X1')!, 'grey', '1mm²'),
    wire(T(H1, 'X2')!, T(XN, 'N3')!, 'blue', '1mm²', undefined, 'neutral'),
    wire(T(RT1, '97')!, T(H2, 'X1')!, 'gray' as WireColor, '1mm²'),
    wire(T(H2, 'X2')!, T(XN, 'N3')!, 'blue', '1mm²', undefined, 'neutral'),
  ]

  const ladder: LadderProgram = {
    rungs: [
      {
        id: nanoid(6), name: 'Rung 1: Partida com selo', enabled: true,
        branches: [branch(contact('I1', 'NO'), contact('I2', 'NO')), branch(contact('I1', 'NO'), contact('M1', 'NO'))],
        coils: [{ kind: 'coil', id: nanoid(6), address: 'M1', coilType: 'COIL' }],
      },
      {
        id: nanoid(6), name: 'Rung 2: Saída para KM1', enabled: true,
        branches: [branch(contact('M1', 'NO'))],
        coils: [{ kind: 'coil', id: nanoid(6), address: 'Q1', coilType: 'COIL' }],
      },
    ],
  }

  return { id: 'direct-start', name: 'Partida Direta com Selo', description: 'STOP (I1) + START (I2) com selo por M1, acionando Q1 → KM1 → Motor.', components, wires, ladder }
}

// ---------------------------------------------------------------------------
// 2 — Reversão com intertravamento elétrico + lógico
// ---------------------------------------------------------------------------
export function buildReversalScenario(): Scenario {
  const BR = createComponent('breaker3p', 'QF1', 'Entrada L1/L2/L3', 0, 60, 40)
  const RT1 = createComponent('thermalRelay', 'RT1', 'Relé Térmico', 1, 220, 40)
  const KM1 = createComponent('contactor', 'KM1', 'Contator Avanço', 2, 380, 40)
  const KM2 = createComponent('contactor', 'KM2', 'Contator Reversão', 3, 540, 40)
  const S0 = createComponent('emergencyButton', 'S0', 'Emergência', 4, 120, 340)
  const S1 = createComponent('buttonNC', 'S1', 'STOP', 5, 240, 340)
  const S2 = createComponent('buttonNO', 'S2', 'AVANÇO', 6, 360, 340)
  const S3 = createComponent('buttonNO', 'S3', 'REVERSÃO', 7, 480, 340)
  const PLC1 = createComponent('plcLogo', 'PLC1', 'LOGO! 230RCE', 8, 640, 40, { outputs: { Q1: false, Q2: false, Q3: false, Q4: false } })
  const H1 = createComponent('ledGreen', 'H1', 'Avanço', 9, 880, 40)
  const H2 = createComponent('ledYellow', 'H2', 'Reversão', 10, 880, 130)
  const H3 = createComponent('ledRed', 'H3', 'Emergência', 11, 880, 220)
  const M1 = createComponent('motor3ph', 'M1', 'Motor Trifásico', 12, 380, 500)
  const XN = createComponent('busbarNeutral', 'XN', 'Barramento Neutro', 13, 60, 440)
  const BPE = createComponent('earthBar', 'BPE', 'Barra de Terra', 14, 60, 520)

  KM1.state.interlockWith = KM2.id
  KM2.state.interlockWith = KM1.id

  const components = [BR, RT1, KM1, KM2, S0, S1, S2, S3, PLC1, H1, H2, H3, M1, XN, BPE]
  const T = terminalByLabel

  const wires: Wire[] = [
    wire(T(BR, '2')!, T(RT1, '1L1')!, 'red', '2.5mm²', 'L1', 'power'),
    wire(T(BR, '4')!, T(RT1, '3L2')!, 'red', '2.5mm²', 'L2', 'power'),
    wire(T(BR, '6')!, T(RT1, '5L3')!, 'red', '2.5mm²', 'L3', 'power'),
    wire(T(RT1, '2T1')!, T(KM1, '1L1')!, 'red', '2.5mm²', undefined, 'power'),
    wire(T(RT1, '4T2')!, T(KM1, '3L2')!, 'red', '2.5mm²', undefined, 'power'),
    wire(T(RT1, '6T3')!, T(KM1, '5L3')!, 'red', '2.5mm²', undefined, 'power'),
    // KM2 alimentado com L1/L3 trocados → inversão do campo girante
    wire(T(RT1, '2T1')!, T(KM2, '5L3')!, 'red', '2.5mm²', 'L1↔L3', 'power'),
    wire(T(RT1, '4T2')!, T(KM2, '3L2')!, 'red', '2.5mm²', undefined, 'power'),
    wire(T(RT1, '6T3')!, T(KM2, '1L1')!, 'red', '2.5mm²', 'L3↔L1', 'power'),
    wire(T(KM1, '2T1')!, T(M1, 'U1')!, 'black', '2.5mm²', undefined, 'power'),
    wire(T(KM1, '4T2')!, T(M1, 'V1')!, 'black', '2.5mm²', undefined, 'power'),
    wire(T(KM1, '6T3')!, T(M1, 'W1')!, 'black', '2.5mm²', undefined, 'power'),
    wire(T(KM2, '2T1')!, T(M1, 'U1')!, 'black', '2.5mm²', undefined, 'power'),
    wire(T(KM2, '4T2')!, T(M1, 'V1')!, 'black', '2.5mm²', undefined, 'power'),
    wire(T(KM2, '6T3')!, T(M1, 'W1')!, 'black', '2.5mm²', undefined, 'power'),
    wire(T(M1, 'PE')!, T(BPE, 'PE2')!, 'green-yellow', '2.5mm²', 'PE', 'earth'),

    wire(T(BR, '2')!, T(S0, '21')!, 'orange', '1mm²'),
    wire(T(S0, '22')!, T(S1, '21')!, 'orange', '1mm²'),
    wire(T(S1, '22')!, T(PLC1, 'I1')!, 'orange', '1mm²'),
    wire(T(BR, '2')!, T(S2, '13')!, 'orange', '1mm²'),
    wire(T(S2, '14')!, T(PLC1, 'I2')!, 'orange', '1mm²'),
    wire(T(BR, '2')!, T(S3, '13')!, 'orange', '1mm²'),
    wire(T(S3, '14')!, T(PLC1, 'I3')!, 'orange', '1mm²'),
    wire(T(BR, '2')!, T(PLC1, 'L')!, 'orange', '1mm²'),
    wire(T(XN, 'N1')!, T(PLC1, 'N')!, 'blue', '1mm²', undefined, 'neutral'),

    wire(T(PLC1, 'Q1')!, T(KM1, 'A1')!, 'grey', '1mm²'),
    wire(T(KM1, 'A2')!, T(XN, 'N2')!, 'blue', '1mm²', undefined, 'neutral'),
    wire(T(PLC1, 'Q2')!, T(KM2, 'A1')!, 'grey', '1mm²'),
    wire(T(KM2, 'A2')!, T(XN, 'N2')!, 'blue', '1mm²', undefined, 'neutral'),

    wire(T(PLC1, 'Q1')!, T(H1, 'X1')!, 'grey', '1mm²'),
    wire(T(H1, 'X2')!, T(XN, 'N3')!, 'blue', '1mm²', undefined, 'neutral'),
    wire(T(PLC1, 'Q2')!, T(H2, 'X1')!, 'grey', '1mm²'),
    wire(T(H2, 'X2')!, T(XN, 'N3')!, 'blue', '1mm²', undefined, 'neutral'),
    wire(T(S0, '22')!, T(H3, 'X1')!, 'grey', '1mm²'),
    wire(T(H3, 'X2')!, T(XN, 'N3')!, 'blue', '1mm²', undefined, 'neutral'),
  ]

  const ladder: LadderProgram = {
    rungs: [
      {
        id: nanoid(6), name: 'Rung 1: Avanço (selo)', enabled: true,
        branches: [branch(contact('I1', 'NO'), contact('I2', 'NO'), contact('Q2', 'NC')), branch(contact('I1', 'NO'), contact('M1', 'NO'), contact('Q2', 'NC'))],
        coils: [{ kind: 'coil', id: nanoid(6), address: 'M1', coilType: 'COIL' }],
      },
      {
        id: nanoid(6), name: 'Rung 2: Saída KM1', enabled: true,
        branches: [branch(contact('M1', 'NO'))],
        coils: [{ kind: 'coil', id: nanoid(6), address: 'Q1', coilType: 'COIL' }],
      },
      {
        id: nanoid(6), name: 'Rung 3: Reversão (selo)', enabled: true,
        branches: [branch(contact('I1', 'NO'), contact('I3', 'NO'), contact('Q1', 'NC')), branch(contact('I1', 'NO'), contact('M2', 'NO'), contact('Q1', 'NC'))],
        coils: [{ kind: 'coil', id: nanoid(6), address: 'M2', coilType: 'COIL' }],
      },
      {
        id: nanoid(6), name: 'Rung 4: Saída KM2', enabled: true,
        branches: [branch(contact('M2', 'NO'))],
        coils: [{ kind: 'coil', id: nanoid(6), address: 'Q2', coilType: 'COIL' }],
      },
    ],
  }

  return { id: 'reversal', name: 'Reversão de Motor (Avanço/Reversão)', description: 'KM1/KM2 com intertravamento elétrico e lógico por contatos NF cruzados; troca de duas fases inverte o campo girante.', components, wires, ladder }
}

// ---------------------------------------------------------------------------
// 3 — Partida estrela-triângulo (com temporizador dedicado)
// ---------------------------------------------------------------------------
export function buildStarDeltaScenario(): Scenario {
  const BR = createComponent('breaker3p', 'QF1', 'Entrada L1/L2/L3', 0, 60, 40)
  const RT1 = createComponent('thermalRelay', 'RT1', 'Relé Térmico', 1, 220, 40)
  const KM1 = createComponent('contactor', 'KM1', 'Contator Principal', 2, 380, 40)
  const KM2 = createComponent('contactor', 'KM2', 'Contator Estrela', 3, 540, 40)
  const KM3 = createComponent('contactor', 'KM3', 'Contator Triângulo', 4, 700, 40)
  const KT1 = createComponent('timerRelayStarDelta', 'KT1', 'Temporizador Y-Δ', 5, 380, 220)
  KT1.state.presetMs = 4000
  KT1.state.transitionMs = 80
  const S1 = createComponent('buttonNC', 'S1', 'STOP', 6, 240, 400)
  const S2 = createComponent('buttonNO', 'S2', 'START', 7, 380, 400)
  const PLC1 = createComponent('plcLogo', 'PLC1', 'LOGO! 230RCE', 8, 620, 220, { outputs: { Q1: false, Q2: false, Q3: false, Q4: false } })
  const H1 = createComponent('ledGreen', 'H1', 'Estrela', 9, 880, 220)
  const H2 = createComponent('ledYellow', 'H2', 'Triângulo', 10, 880, 300)
  const H3 = createComponent('ledRed', 'H3', 'Falha', 11, 880, 380)
  const M1 = createComponent('motor3ph', 'M1', 'Motor Trifásico', 12, 620, 520)
  const XN = createComponent('busbarNeutral', 'XN', 'Barramento Neutro', 13, 60, 480)
  const BPE = createComponent('earthBar', 'BPE', 'Barra de Terra', 14, 60, 560)

  KM1.state.interlockWith = null
  const components = [BR, RT1, KM1, KM2, KM3, KT1, S1, S2, PLC1, H1, H2, H3, M1, XN, BPE]
  const T = terminalByLabel

  const wires: Wire[] = [
    wire(T(BR, '2')!, T(RT1, '1L1')!, 'red', '4mm²', 'L1', 'power'),
    wire(T(BR, '4')!, T(RT1, '3L2')!, 'red', '4mm²', 'L2', 'power'),
    wire(T(BR, '6')!, T(RT1, '5L3')!, 'red', '4mm²', 'L3', 'power'),
    wire(T(RT1, '2T1')!, T(KM1, '1L1')!, 'red', '4mm²', undefined, 'power'),
    wire(T(RT1, '4T2')!, T(KM1, '3L2')!, 'red', '4mm²', undefined, 'power'),
    wire(T(RT1, '6T3')!, T(KM1, '5L3')!, 'red', '4mm²', undefined, 'power'),
    wire(T(KM1, '2T1')!, T(M1, 'U1')!, 'black', '4mm²', undefined, 'power'),
    wire(T(KM1, '4T2')!, T(M1, 'V1')!, 'black', '4mm²', undefined, 'power'),
    wire(T(KM1, '6T3')!, T(M1, 'W1')!, 'black', '4mm²', undefined, 'power'),
    // estrela curto-circuita U/V/W (via KM2)
    wire(T(KM1, '2T1')!, T(KM2, '1L1')!, 'black', '2.5mm²', undefined, 'power'),
    wire(T(KM1, '4T2')!, T(KM2, '3L2')!, 'black', '2.5mm²', undefined, 'power'),
    wire(T(KM1, '6T3')!, T(KM2, '5L3')!, 'black', '2.5mm²', undefined, 'power'),
    // triângulo (via KM3)
    wire(T(KM1, '2T1')!, T(KM3, '1L1')!, 'black', '2.5mm²', undefined, 'power'),
    wire(T(KM1, '4T2')!, T(KM3, '5L3')!, 'black', '2.5mm²', undefined, 'power'),
    wire(T(KM1, '6T3')!, T(KM3, '3L2')!, 'black', '2.5mm²', undefined, 'power'),
    wire(T(M1, 'PE')!, T(BPE, 'PE2')!, 'green-yellow', '2.5mm²', 'PE', 'earth'),

    wire(T(BR, '2')!, T(S1, '21')!, 'orange', '1mm²'),
    wire(T(S1, '22')!, T(PLC1, 'I1')!, 'orange', '1mm²'),
    wire(T(BR, '2')!, T(S2, '13')!, 'orange', '1mm²'),
    wire(T(S2, '14')!, T(PLC1, 'I2')!, 'orange', '1mm²'),
    wire(T(BR, '2')!, T(PLC1, 'L')!, 'orange', '1mm²'),
    wire(T(XN, 'N1')!, T(PLC1, 'N')!, 'blue', '1mm²', undefined, 'neutral'),

    wire(T(PLC1, 'Q1')!, T(KM1, 'A1')!, 'grey', '1mm²'),
    wire(T(KM1, 'A2')!, T(XN, 'N2')!, 'blue', '1mm²', undefined, 'neutral'),
    wire(T(PLC1, 'Q2')!, T(KM2, 'A1')!, 'grey', '1mm²'),
    wire(T(KM2, 'A2')!, T(XN, 'N2')!, 'blue', '1mm²', undefined, 'neutral'),
    wire(T(PLC1, 'Q3')!, T(KM3, 'A1')!, 'grey', '1mm²'),
    wire(T(KM3, 'A2')!, T(XN, 'N2')!, 'blue', '1mm²', undefined, 'neutral'),

    wire(T(PLC1, 'Q1')!, T(H1, 'X1')!, 'grey', '1mm²'),
    wire(T(H1, 'X2')!, T(XN, 'N3')!, 'blue', '1mm²', undefined, 'neutral'),
    wire(T(PLC1, 'Q3')!, T(H2, 'X1')!, 'grey', '1mm²'),
    wire(T(H2, 'X2')!, T(XN, 'N3')!, 'blue', '1mm²', undefined, 'neutral'),
    wire(T(RT1, '97')!, T(H3, 'X1')!, 'gray' as WireColor, '1mm²'),
    wire(T(H3, 'X2')!, T(XN, 'N3')!, 'blue', '1mm²', undefined, 'neutral'),
  ]

  const ladder: LadderProgram = {
    rungs: [
      {
        id: nanoid(6), name: 'Rung 1: Selo de partida', enabled: true,
        branches: [branch(contact('I1', 'NO'), contact('I2', 'NO')), branch(contact('I1', 'NO'), contact('M1', 'NO'))],
        coils: [{ kind: 'coil', id: nanoid(6), address: 'M1', coilType: 'COIL' }],
      },
      {
        id: nanoid(6), name: 'Rung 2: Principal KM1', enabled: true,
        branches: [branch(contact('M1', 'NO'))],
        coils: [{ kind: 'coil', id: nanoid(6), address: 'Q1', coilType: 'COIL' }],
      },
      {
        id: nanoid(6), name: 'Rung 3: Estrela (temporizada)', enabled: true,
        branches: [branch(contact('M1', 'NO'))],
        // o rung do temporizador não usa bobina com o MESMO endereço do timer:
        // o próprio bloco escreve o bit T1 (Done), e uma bobina T1 o sobrescreveria.
        coils: [],
        timer: { kind: 'timer', id: nanoid(6), address: 'T1', timerType: 'TON', presetMs: 4000 },
      },
      {
        id: nanoid(6), name: 'Rung 4: KM2 estrela enquanto T1 não fechar', enabled: true,
        branches: [branch(contact('M1', 'NO'), contact('T1', 'NC'))],
        coils: [{ kind: 'coil', id: nanoid(6), address: 'Q2', coilType: 'COIL' }],
      },
      {
        id: nanoid(6), name: 'Rung 5: KM3 triângulo após T1', enabled: true,
        branches: [branch(contact('M1', 'NO'), contact('T1', 'NO'))],
        coils: [{ kind: 'coil', id: nanoid(6), address: 'Q3', coilType: 'COIL' }],
      },
    ],
  }

  return { id: 'star-delta', name: 'Partida Estrela-Triângulo', description: 'KM1 principal + KM2 estrela + KM3 triângulo, comutados pelo temporizador KT1 (4 s) e trava Ladder T1.', components, wires, ladder }
}

// ---------------------------------------------------------------------------
// 4 — Partida sequencial de dois motores com contador/sensor
// ---------------------------------------------------------------------------
export function buildSequentialScenario(): Scenario {
  const BR = createComponent('breaker3p', 'QF1', 'Entrada L1/L2/L3', 0, 60, 40)
  const RT1 = createComponent('thermalRelay', 'RT1', 'Térmico M1', 1, 200, 40)
  const RT2 = createComponent('thermalRelay', 'RT2', 'Térmico M2', 2, 340, 40)
  const KM1 = createComponent('contactor', 'KM1', 'Contator M1', 3, 480, 40)
  const KM2 = createComponent('contactor', 'KM2', 'Contator M2', 4, 620, 40)
  const S1 = createComponent('buttonNC', 'S1', 'STOP', 5, 120, 400)
  const S2 = createComponent('buttonNO', 'S2', 'START', 6, 240, 400)
  const B1 = createComponent('proximitySensor', 'B1', 'Sensor indutivo (peças)', 7, 360, 400)
  const PLC1 = createComponent('plcCompact', 'PLC1', 'CLP 12I/8Q', 8, 560, 220, { outputs: { Q1: false, Q2: false, Q3: false, Q4: false, Q5: false, Q6: false, Q7: false, Q8: false } })
  const H1 = createComponent('ledGreen', 'H1', 'M1 ligado', 9, 880, 200)
  const H2 = createComponent('ledYellow', 'H2', 'M2 ligado', 10, 880, 280)
  const T1 = createComponent('timerRelayTON', 'KT1', 'Atraso 3 s', 11, 360, 260)
  T1.state.presetMs = 3000
  const M1 = createComponent('motor3ph', 'M1', 'Motor 1', 12, 380, 560)
  const M2 = createComponent('motor3ph', 'M2', 'Motor 2', 13, 820, 560)
  const XN = createComponent('busbarNeutral', 'XN', 'Barramento Neutro', 14, 60, 480)

  const components = [BR, RT1, RT2, KM1, KM2, S1, S2, B1, PLC1, H1, H2, T1, M1, M2, XN]
  const T = terminalByLabel

  const wires: Wire[] = [
    wire(T(BR, '2')!, T(RT1, '1L1')!, 'red', '2.5mm²', 'L1', 'power'),
    wire(T(BR, '4')!, T(RT1, '3L2')!, 'red', '2.5mm²', 'L2', 'power'),
    wire(T(BR, '6')!, T(RT1, '5L3')!, 'red', '2.5mm²', 'L3', 'power'),
    wire(T(RT1, '2T1')!, T(RT2, '1L1')!, 'red', '2.5mm²', undefined, 'power'),
    wire(T(RT1, '4T2')!, T(RT2, '3L2')!, 'red', '2.5mm²', undefined, 'power'),
    wire(T(RT1, '6T3')!, T(RT2, '5L3')!, 'red', '2.5mm²', undefined, 'power'),
    wire(T(RT1, '2T1')!, T(KM1, '1L1')!, 'red', '2.5mm²', undefined, 'power'),
    wire(T(RT1, '4T2')!, T(KM1, '3L2')!, 'red', '2.5mm²', undefined, 'power'),
    wire(T(RT1, '6T3')!, T(KM1, '5L3')!, 'red', '2.5mm²', undefined, 'power'),
    wire(T(RT2, '2T1')!, T(KM2, '1L1')!, 'red', '2.5mm²', undefined, 'power'),
    wire(T(RT2, '4T2')!, T(KM2, '3L2')!, 'red', '2.5mm²', undefined, 'power'),
    wire(T(RT2, '6T3')!, T(KM2, '5L3')!, 'red', '2.5mm²', undefined, 'power'),
    wire(T(KM1, '2T1')!, T(M1, 'U1')!, 'black', '2.5mm²', undefined, 'power'),
    wire(T(KM1, '4T2')!, T(M1, 'V1')!, 'black', '2.5mm²', undefined, 'power'),
    wire(T(KM1, '6T3')!, T(M1, 'W1')!, 'black', '2.5mm²', undefined, 'power'),
    wire(T(KM2, '2T1')!, T(M2, 'U1')!, 'black', '2.5mm²', undefined, 'power'),
    wire(T(KM2, '4T2')!, T(M2, 'V1')!, 'black', '2.5mm²', undefined, 'power'),
    wire(T(KM2, '6T3')!, T(M2, 'W1')!, 'black', '2.5mm²', undefined, 'power'),

    wire(T(BR, '2')!, T(S1, '21')!, 'orange', '1mm²'),
    wire(T(S1, '22')!, T(PLC1, 'I1')!, 'orange', '1mm²'),
    wire(T(BR, '2')!, T(S2, '13')!, 'orange', '1mm²'),
    wire(T(S2, '14')!, T(PLC1, 'I2')!, 'orange', '1mm²'),
    wire(T(BR, '2')!, T(PLC1, 'L')!, 'orange', '1mm²'),
    wire(T(XN, 'N1')!, T(PLC1, 'N')!, 'blue', '1mm²', undefined, 'neutral'),
    wire(T(BR, '2')!, T(B1, 'V+')!, 'brown' as WireColor, '0.5mm²'),
    wire(T(XN, 'N2')!, T(B1, '0V')!, 'blue', '0.5mm²', undefined, 'neutral'),
    wire(T(B1, 'OUT')!, T(PLC1, 'I3')!, 'black', '0.5mm²', undefined, 'signal'),

    wire(T(PLC1, 'Q1')!, T(KM1, 'A1')!, 'grey', '1mm²'),
    wire(T(KM1, 'A2')!, T(XN, 'N3')!, 'blue', '1mm²', undefined, 'neutral'),
    wire(T(PLC1, 'Q2')!, T(KM2, 'A1')!, 'grey', '1mm²'),
    wire(T(KM2, 'A2')!, T(XN, 'N3')!, 'blue', '1mm²', undefined, 'neutral'),
    wire(T(PLC1, 'Q3')!, T(T1, 'A1')!, 'grey', '1mm²'),
    wire(T(T1, 'A2')!, T(XN, 'N3')!, 'blue', '1mm²', undefined, 'neutral'),

    wire(T(PLC1, 'Q1')!, T(H1, 'X1')!, 'grey', '1mm²'),
    wire(T(H1, 'X2')!, T(XN, 'N3')!, 'blue', '1mm²', undefined, 'neutral'),
    wire(T(PLC1, 'Q2')!, T(H2, 'X1')!, 'grey', '1mm²'),
    wire(T(H2, 'X2')!, T(XN, 'N3')!, 'blue', '1mm²', undefined, 'neutral'),
  ]

  const ladder: LadderProgram = {
    rungs: [
      {
        id: nanoid(6), name: 'Rung 1: Habilita ciclo', enabled: true,
        branches: [branch(contact('I1', 'NO'), contact('I2', 'NO')), branch(contact('I1', 'NO'), contact('M1', 'NO'))],
        coils: [{ kind: 'coil', id: nanoid(6), address: 'M1', coilType: 'COIL' }],
      },
      {
        id: nanoid(6), name: 'Rung 2: M1 imediato', enabled: true,
        branches: [branch(contact('M1', 'NO'))],
        coils: [{ kind: 'coil', id: nanoid(6), address: 'Q1', coilType: 'COIL' }],
      },
      {
        // o rung do temporizador depende apenas do ciclo habilitado (I1 + M1):
        // o bloco escreve o bit T1, e o rung seguinte usa T1 para dar a partida em M2.
        id: nanoid(6), name: 'Rung 3: Temporiza M2 (TON 3 s)', enabled: true,
        branches: [branch(contact('I1', 'NO'), contact('M1', 'NO'))],
        coils: [],
        timer: { kind: 'timer', id: nanoid(6), address: 'T1', timerType: 'TON', presetMs: 3000 },
      },
      {
        id: nanoid(6), name: 'Rung 4: M2 após 3 s', enabled: true,
        branches: [branch(contact('M1', 'NO'), contact('T1', 'NO'))],
        coils: [{ kind: 'coil', id: nanoid(6), address: 'Q2', coilType: 'COIL' }],
      },
      {
        id: nanoid(6), name: 'Rung 5: Contagem de peças (CTU 5)', enabled: true,
        branches: [branch(contact('I3', 'RISING'))],
        coils: [],
        counter: { kind: 'counter', id: nanoid(6), address: 'C1', counterType: 'CTU', preset: 5, resetAddress: 'M9' },
      },
    ],
  }

  return { id: 'sequential', name: 'Partida Sequencial + Contagem', description: 'CLP compacto: M1 parte imediatamente, M2 após 3 s e sensor indutivo dispara um contador CTU (5 peças).', components, wires, ladder }
}

export const SCENARIOS = [
  { id: 'direct-start', name: 'Partida Direta com Selo' },
  { id: 'reversal', name: 'Reversão de Motor (Avanço/Reversão)' },
  { id: 'star-delta', name: 'Partida Estrela-Triângulo' },
  { id: 'sequential', name: 'Partida Sequencial + Contagem' },
]

export const SCENARIO_BUILDERS: Record<string, () => Scenario> = {
  'direct-start': buildDirectStartScenario,
  reversal: buildReversalScenario,
  'star-delta': buildStarDeltaScenario,
  sequential: buildSequentialScenario,
}
