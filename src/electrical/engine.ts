import { electricalComponentView } from './builtinRuntime'
import { armAtHome, reedExtended, reedRetracted } from '../three/mechatronicsModel'
// ============================================================================
// Motor de continuidade elétrica (DC-Simu v2)
//
// Não é animação falsa: constrói um grafo borne→borne a partir de:
//   • cabos (sempre condutivos)
//   • "pontes internas" condicionais de cada componente (disjuntor fechado,
//     contator energizado, contato NA/NF, sensor acionado, drive habilitado…)
//
// A energização é propagada por BFS a partir das fontes (barras L1/L2/L3, N,
// PE, saída da fonte chaveada e do transformador). A cada varredura isso
// determina quais bornes/cabos estão realmente vivos — e portanto se bobinas,
// sinaleiros, motores e acionamentos recebem energia.
//
// Inclui injeção de falhas (falta de fase, curto-circuito, fuga à terra,
// sobretensão, sobrecarga) e medição tipo multímetro (sonda A↔B).
// ============================================================================

import type { ElectricalComponent, Wire, FaultState, ProbeResult } from '../types'
import { importedBridges } from './importedComponents'
import { industrialBridges, industrialDeviceTypeOf } from './industrialDevices'
import { mountTerminalPairs, relaySocketTerminalPairs } from './mounts'
import { breakerInputLabels, combMountPairs, isCombBusbar, isCombConnector } from '../three/combMount'
import { terminalStripJumperPairs } from './pti6Strip'
import { combTerminalConductorOf, steppedTerminalBarOf } from '../three/busbarParts'

export interface ContinuityResult {
  energizedTerminals: Set<string>
  energizedWires: Set<string>
  activeWires?: Set<string>
  /** mapa borne → lista de bornes alcançáveis (usado pela sonda e pelo alerta de curto) */
  reachable: Map<string, Set<string>>
}

const POLE_PAIRS: Record<string, Array<[string, string]>> = {
  breaker1p: [['1', '2']],
  breakerSchneiderIc60h1p: [['1', '2']],
  breakerSteckSdC25: [['1', '2']],
  breaker2p: [['1', '2'], ['3', '4']],
  breaker3p: [['1', '2'], ['3', '4'], ['5', '6']],
  breaker4p: [['1', '2'], ['3', '4'], ['5', '6'], ['7', '8']],
  // Interruptores de corte Easy9 Switch (IEC 60947-3): manobra sem proteção.
  switchSchneiderEz9s1p: [['1', '2']],
  switchSchneiderEz9s2p: [['1', '2'], ['3', '4']],
  switchSchneiderEz9s4p: [['1', '2'], ['3', '4'], ['5', '6'], ['7', '8']],
  motorBreaker: [['1', '2'], ['3', '4'], ['5', '6']],
  motorBreakerPkzmC10: [['1', '2'], ['3', '4'], ['5', '6']],
  motorBreakerSchneiderGv2me: [['1', '2'], ['3', '4'], ['5', '6']],
  residualBreaker: [['1', '2'], ['3', '4'], ['5', '6'], ['N1', 'N2']],
  residualBreakerSchneiderIid4p: [['1', '2'], ['3', '4'], ['5', '6'], ['N1', 'N2']],
  residualBreakerSchneiderIdpnVigi: [['1', '2'], ['N1', 'N2']],
  residualBreakerHagerCfc225p: [['1', '2'], ['N1', 'N2']],
  fuse: [['IN', 'OUT']],
  fuseHolder: [['1', '2']],
  fuseHolderSchneiderDf101v: [['1', '2']],
  fuseHolderSchneiderDf81n: [['N1', 'N2'], ['1', '2']],
  fuseHolderSchneiderDf103nv: [['N1', 'N2'], ['1', '2'], ['3', '4'], ['5', '6']],
  phoenixEcb3000760: [['Line+', 'LOAD+']],
  thermalRelay: [['1L1', '2T1'], ['3L2', '4T2'], ['5L3', '6T3']],
  thermalRelaySiemens3ru1116: [['1L1', '2T1'], ['3L2', '4T2'], ['5L3', '6T3']],
  contactor: [['1L1', '2T1'], ['3L2', '4T2'], ['5L3', '6T3']],
  contactor4p: [['1L1', '2T1'], ['3L2', '4T2'], ['5L3', '6T3'], ['7', '8']],
  contactorWegCWC09: [['1L1', '2T1'], ['3L2', '4T2'], ['5L3', '6T3']],
  contactorWegCwbc65: [['1L1', '2T1'], ['3L2', '4T2'], ['5L3', '6T3']],
}

/** Polos de um aparelho (entrada↔saída), independentemente de estar aberto ou fechado.
 *  A identidade de fase — «que fase é este condutor?» — é topologia de cablagem:
 *  atravessa o contactor mesmo desligado. A energização, essa, continua a depender
 *  do estado (ver `internalBridges`). */
export function poleTerminalPairs(c: ElectricalComponent): Array<[string, string]> {
  const pairs = POLE_PAIRS[electricalComponentView(c).type]
  if (!pairs) return []
  const out: Array<[string, string]> = []
  for (const [a, b] of pairs) {
    const ta = t(c, a)
    const tb = t(c, b)
    if (ta && tb) out.push([ta.id, tb.id])
  }
  return out
}

function t(c: ElectricalComponent, label: string) {
  return c.terminals.find((x) => x.label === label)
}

/** Pontes condutivas internas de um componente, dado o estado atual. */
/** Ligações internas do aparelho e, se estiver encaixado (relé térmico no contactor,
 *  relé plug-in na base undecal), também as do encaixe. */
export function internalBridges(c: ElectricalComponent): Array<[string, string]> {
  const own = componentBridges(electricalComponentView(c))
  if (!c.mountedOn) return own
  // Relé plug-in na base undecal: cada pino i fica no alvéolo Pi da base.
  if (industrialDeviceTypeOf(c) === 'levelRelayAvel411') return [...own, ...relaySocketTerminalPairs(c)]
  return [...own, ...mountTerminalPairs(c)]
}

function componentBridges(c: ElectricalComponent): Array<[string, string]> {
  const industrial = industrialBridges(c)
  if (industrial) return industrial
  const imported = importedBridges(c)
  if (imported) return imported
  const bridges: Array<[string, string]> = []
  const pair = (a?: string, b?: string) => {
    if (a && b) bridges.push([a, b])
  }
  const la = (label: string) => t(c, label)?.id

  // multímetro em modo de corrente: as fichas COM e mA/10 A ficam ligadas em série (shunt)
  const meterBridge = c.state?.meterBridge as unknown
  if (Array.isArray(meterBridge) && meterBridge.length === 2) pair(la(String(meterBridge[0])), la(String(meterBridge[1])))

  switch (c.type) {
    // ---- proteção: fecha os polos quando armado e não disparado ----
    case 'breaker1p':
    case 'breakerSchneiderIc60h1p':
    case 'breakerSteckSdC25':
    case 'breaker2p':
    case 'breaker3p':
    case 'breaker4p':
    case 'switchSchneiderEz9s1p':
    case 'switchSchneiderEz9s2p':
    case 'switchSchneiderEz9s4p':
    case 'motorBreaker':
    case 'motorBreakerPkzmC10':
    case 'residualBreaker':
    case 'residualBreakerSchneiderIid4p':
    case 'residualBreakerSchneiderIdpnVigi': {
      if (c.state.closed && !c.state.tripped) {
        for (const [a, b] of POLE_PAIRS[c.type] ?? []) pair(la(a), la(b))
      }
      break
    }
    case 'phoenixEcb3000760': {
      // O catálogo confirma Line+ / LOAD+ / 0V e os sinais Reset/Status.
      // A condutividade em série representa o disjuntor fechado; temporização,
      // limiar de disparo e lógica elétrica do Status não são especificados aqui.
      if (c.state.closed && !c.state.tripped) pair(la('Line+'), la('LOAD+'))
      break
    }
    case 'fuse':
    case 'fuseHolder': {
      if (c.state.closed !== false && !c.state.blown) pair(la('IN') ?? la('1'), la('OUT') ?? la('2'))
      break
    }
    case 'surgeProtector': {
      // Variante em derivação (3P+N): alta impedância em serviço normal.
      // Não criar uma ponte permanente entre fase, neutro e terra.
      if (c.state.connection === 'parallel') break
      if (!c.state.failed) {
        pair(la('1'), la('2'))
        pair(la('2'), la('3'))
      }
      break
    }
    case 'thermalRelay': {
      if (!c.state.tripped) {
        for (const [a, b] of POLE_PAIRS.thermalRelay) pair(la(a), la(b))
        pair(la('95'), la('96')) // NF abre na sobrecarga
      } else {
        pair(la('97'), la('98')) // NA fecha na sobrecarga
      }
      break
    }

    // ---- comando: contato mecânico ----
    case 'keySwitch':
    case 'footSwitch':
    case 'limitSwitch': {
      if (c.state.pressed) {
        pair(la('13'), la('14'))
        pair(la('23'), la('24'))
      }
      break
    }
    case 'emergencyButton':
    case 'emergencyButtonKeyP20ACR': {
      if (!c.state.pressed) pair(la('21'), la('22'))
      break
    }
    case 'dualPushButtonNpb22D11': {
      // O botão verde fecha 13–14; o vermelho abre o contacto 21–22.
      if (c.state.startPressed) pair(la('13'), la('14'))
      if (!c.state.stopPressed) pair(la('21'), la('22'))
      break
    }

    // ---- iluminação: interruptores e comutador de escada (Schneider Odace) ----
    case 'wallSwitchSimple': {
      if (c.state.on) pair(la('L'), la('1'))
      break
    }
    case 'wallSwitchDouble': {
      if (c.state.on1) pair(la('L'), la('1'))
      if (c.state.on2) pair(la('L'), la('2'))
      break
    }
    case 'wallSwitchStaircase': {
      // Contacto inversor SPDT real: posição 1 liga L–1; posição 2 liga L–2.
      if (c.state.on) pair(la('L'), la('2'))
      else pair(la('L'), la('1'))
      break
    }

    // ---- sensores ----
    case 'proximitySensor': {
      if (c.state.triggered && c.state.no !== false) pair(la('V+'), la('OUT'))
      break
    }
    case 'photoSensor': {
      if (c.state.triggered) pair(la('NO'), la('0V'))
      else pair(la('NC'), la('0V'))
      break
    }
    case 'pressureSwitch':
    case 'floatSwitch': {
      if (c.state.triggered) pair(la('C'), la('NA'))
      else pair(la('C'), la('NF'))
      break
    }
    case 'thermostat': {
      if (c.state.triggered) pair(la('1'), la('2'))
      break
    }

    // ---- mecatrónica: maquete de estampagem ----
    case 'mecMicroSwitchRoller': {
      if (c.state.pressed) pair(la('C'), la('NO'))
      else pair(la('C'), la('NC'))
      break
    }
    case 'mecFeederCylinder':
    case 'mecDrawerCylinder': {
      const pct = Number(c.state.positionPct ?? 0)
      if (reedRetracted(pct)) pair(la('REC+'), la('REC'))
      if (reedExtended(pct)) pair(la('AVA+'), la('AVA'))
      break
    }
    case 'mecOpticalSensor':
    case 'mecInductiveSensor': {
      if (c.state.triggered) pair(la('+24V'), la('OUT'))
      break
    }
    case 'mecOperatorBox': {
      if (!c.state.emergLatched) pair(la('+24V'), la('EMERG'))
      if (c.state.autoMode !== false) pair(la('+24V'), la('AUTO'))
      if (c.state.resetPressed) pair(la('+24V'), la('REARME'))
      if (c.state.dirRight) pair(la('+24V'), la('CICLO'))
      if (!c.state.stopPressed) pair(la('+24V'), la('STOP'))
      if (c.state.startPressed) pair(la('+24V'), la('START'))
      break
    }
    case 'mecStampingPress': {
      const pct = Number(c.state.positionPct ?? 0)
      if (reedRetracted(pct)) pair(la('SUP+'), la('SUP'))
      if (reedExtended(pct)) pair(la('INF+'), la('INF'))
      break
    }
    case 'mecRotaryArm': {
      if (armAtHome(Number(c.state.angleDeg ?? 0))) pair(la('HOME+'), la('HOME'))
      break
    }
    case 'mecDcGearmotor': {
      // Saídas push-pull do encoder alimentadas pelo +24V do próprio motor.
      if (c.state.encA) pair(la('+24V'), la('A'))
      if (c.state.encB) pair(la('+24V'), la('B'))
      break
    }

    // ---- contatores ----
    case 'contactor':
    case 'contactor4p':
    case 'contactorWegCWC09':
    case 'contactorWegCwbc65': {
      // manualLatch / testPressed: atracagem manual pelo botão de teste (didática)
      const en = !!c.state.energized || !!c.state.manualLatch || !!c.state.testPressed
      if (en) {
        for (const [a, b] of POLE_PAIRS[c.type] ?? []) pair(la(a), la(b))
        pair(la('13'), la('14'))
      } else {
        pair(la('21'), la('22'))
      }
      break
    }
    case 'auxContactBlock': {
      if (c.state.closed) pair(la('13'), la('14'))
      else pair(la('21'), la('22'))
      break
    }

    // ---- relés ----
    case 'auxRelay':
    case 'auxRelay4': {
      if (c.state.energized) {
        pair(la('13'), la('14'))
        pair(la('23'), la('24'))
      } else {
        pair(la('21'), la('22'))
        pair(la('31'), la('32'))
      }
      break
    }
    case 'timerRelayTON':
    case 'timerRelayTOF': {
      if (c.state.energized) pair(la('13'), la('14'))
      else pair(la('21'), la('22'))
      break
    }
    case 'timerRelayStarDelta': {
      // 13-14 = estrela (enquanto não completou), 23-24 = triângulo (após preset)
      if (c.state.energized && !c.state.starDone) pair(la('13'), la('14'))
      if (c.state.deltaDone) pair(la('23'), la('24'))
      if (!c.state.deltaDone) pair(la('31'), la('32'))
      break
    }
    case 'counterRelay': {
      if (c.state.done) pair(la('13'), la('14'))
      else pair(la('21'), la('22'))
      break
    }
    case 'safetyRelay': {
      if (c.state.energized && !c.state.tripped) {
        pair(la('13'), la('14'))
        pair(la('23'), la('24'))
        pair(la('33'), la('34'))
      } else {
        pair(la('41'), la('42'))
      }
      break
    }

    // ---- acionamentos ----
    case 'vfd': {
      if (c.state.enabled && c.state.running) {
        pair(la('L1'), la('U'))
        pair(la('L2'), la('V'))
        pair(la('L3'), la('W'))
      }
      break
    }
    case 'softStarter': {
      if (c.state.energized) {
        pair(la('L1'), la('U'))
        pair(la('L2'), la('V'))
        pair(la('L3'), la('W'))
      }
      break
    }

    // ---- fontes ----
    case 'powerSupplyProauto24A': {
      // Saída isolada da entrada AC; os dois V+ e os dois V− são paralelos.
      pair(la('+V1'), la('+V2'))
      pair(la('-V1'), la('-V2'))
      if (c.state.powered && c.state.powerReady) pair(la('RDY1'), la('RDY2'))
      break
    }
    case 'powerSupply': {
      if (c.state.on) pair(la('L'), la('+V'))
      break
    }
    case 'transformer': {
      if (!c.state.failed) pair(la('L1'), la('S1'))
      break
    }

    // ---- bornes DIN: passagem interna 1–2 (seccionável por `bridged === false`); em régua multi-pólo cada pólo (2k+1, 2k+2) é isolado salvo pente `combJumper === true` ----
    case 'terminalPhoenixPti6':
    case 'terminalBlock': {
      if (c.state.bridged === false) break
      const poles = Math.floor(Number(c.state.poleCount ?? 1))
      if (c.type === 'terminalPhoenixPti6' && poles > 1 && c.terminals.length === poles * 2) {
        for (let i = 0; i < poles; i++) {
          bridges.push([c.terminals[i * 2].id, c.terminals[i * 2 + 1].id])
          if (c.state.combJumper && i + 1 < poles) {
            bridges.push([c.terminals[i * 2].id, c.terminals[(i + 1) * 2].id])
          }
        }
      } else {
        for (let i = 0; i < c.terminals.length - 1; i++) bridges.push([c.terminals[i].id, c.terminals[i + 1].id])
      }
      break
    }
    case 'terminalPE': {
      // Borne de proteção PE: condutividade garantida entre os bornes (salvo seccionamento explícito de ensaio).
      if (c.state.bridged === false) break
      for (let i = 0; i < c.terminals.length - 1; i++) bridges.push([c.terminals[i].id, c.terminals[i + 1].id])
      break
    }
    // ---- barras unipolares: barra contínua de latão (todos os bornes equipotenciais) ----
    case 'busbarPhaseAcrylic':
    case 'busbarNeutral':
    case 'earthBar': {
      for (let i = 0; i < c.terminals.length - 1; i++) bridges.push([c.terminals[i].id, c.terminals[i + 1].id])
      break
    }
    // ---- conectores WAGO 221: continuidade real condicionada ao fecho de cada alavanca laranja ----
    case 'wago221_2':
    case 'wago221_3':
    case 'wago221_5':
    case 'wago221_inline': {
      const leversOpen = Array.isArray(c.state.leversOpen) ? (c.state.leversOpen as boolean[]) : []
      const closedIds = c.terminals.filter((_, i) => leversOpen[i] !== true).map((term) => term.id)
      for (let i = 0; i < closedIds.length - 1; i++) {
        bridges.push([closedIds[i], closedIds[i + 1]])
      }
      break
    }
    case 'wago221_double': {
      const leversOpen = Array.isArray(c.state.leversOpen) ? (c.state.leversOpen as boolean[]) : []
      if (c.state.commonBus === true) {
        const closedIds = c.terminals.filter((_, i) => leversOpen[i] !== true).map((term) => term.id)
        for (let i = 0; i < closedIds.length - 1; i++) bridges.push([closedIds[i], closedIds[i + 1]])
      } else {
        // 2 barramentos independentes: fila superior (A1..A5) e fila inferior (B1..B5)
        const topClosed = c.terminals.slice(0, 5).filter((_, i) => leversOpen[i] !== true).map((term) => term.id)
        const botClosed = c.terminals.slice(5, 10).filter((_, i) => leversOpen[5 + i] !== true).map((term) => term.id)
        for (let i = 0; i < topClosed.length - 1; i++) bridges.push([topClosed[i], topClosed[i + 1]])
        for (let i = 0; i < botClosed.length - 1; i++) bridges.push([botClosed[i], botClosed[i + 1]])
      }
      break
    }
    case 'triProofLedBatten': {
      if (c.state.linkable !== false) {
        for (const [aLbl, bLbl] of [['L', 'L_OUT'], ['N', 'N_OUT'], ['PE', 'PE_OUT']] as const) {
          const a = t(c, aLbl)?.id
          const b = t(c, bLbl)?.id
          if (a && b) bridges.push([a, b])
        }
      }
      break
    }
    case 'busbarPhase': {
      // L1/L2/L3 são condutores distintos; o barramento apenas os disponibiliza.
      break
    }
    case 'currentTransformerSplitCore': {
      // Só o condutor que atravessa a janela é contínuo; secundário isolado da rede.
      const a=t(c,'P1')?.id,b=t(c,'P2')?.id
      if(a&&b)bridges.push([a,b])
      break
    }
    case 'meterD522066': {
      // External CT variant: voltage terminals 1/2 sense L-N; CT secondary 3/4
      // receive the isolated secondary from a separate currentTransformerSplitCore.
      // No primary conductor bridge through the meter body.
      break
    }
    case 'meterKws306': {
      if (c.state.switchOn !== false) {
        const p1In = t(c, 'L1-IN')?.id, p1Out = t(c, 'L1-OUT')?.id
        const p2In = t(c, 'L2-IN')?.id, p2Out = t(c, 'L2-OUT')?.id
        const p3In = t(c, 'L3-IN')?.id, p3Out = t(c, 'L3-OUT')?.id
        const nIn = t(c, 'N-IN')?.id, nOut = t(c, 'N-OUT')?.id
        if (p1In && p1Out) bridges.push([p1In, p1Out])
        if (p2In && p2Out) bridges.push([p2In, p2Out])
        if (p3In && p3Out) bridges.push([p3In, p3Out])
        if (nIn && nOut) bridges.push([nIn, nOut])
      }
      break
    }
    case 'busbarPhaseStepped': {
      // Cada degrau (L1, L2, L3, N) é uma barra maciça de latão equipotencial, isolada dos outros degraus.
      const byBar = new Map<string, string[]>()
      for (const term of c.terminals) {
        const bar = steppedTerminalBarOf(term.label)
        if (!bar) continue
        const list = byBar.get(bar)
        if (list) list.push(term.id)
        else byBar.set(bar, [term.id])
      }
      for (const barIds of byBar.values()) {
        for (let i = 0; i < barIds.length - 1; i++) bridges.push([barIds[i], barIds[i + 1]])
      }
      break
    }
    case 'busbarComb': {
      // Cada barra laminada interna de cobre (L em 1P; L1/N em 1P+N; L1/L2/L3 em 3P; L1/L2/L3/N em 3P+N)
      // une todos os seus dentes e o respetivo conector acoplado IN.*, mantendo isolamento total entre barras.
      const byCond = new Map<string, string[]>()
      for (const term of c.terminals) {
        const cond = combTerminalConductorOf(term.label)
        if (!cond) continue
        const list = byCond.get(cond)
        if (list) list.push(term.id)
        else byCond.set(cond, [term.id])
      }
      for (const ids of byCond.values()) {
        for (let i = 0; i < ids.length - 1; i++) bridges.push([ids[i], ids[i + 1]])
      }
      break
    }
    case 'combBusbarConnector': {
      // Conector de alimentação 6–25 mm²: continuidade direta entre o borne tubular (IN) e o pino estanhado (PINO).
      pair(la('IN'), la('PINO'))
      break
    }
    case 'terminalSet1ph':
    case 'terminalSet3ph':
    case 'terminalSet24v': {
      const conductors = c.type === 'terminalSet1ph' ? ['L', 'N', 'PE'] : c.type === 'terminalSet24v' ? ['0V', '+24V', 'PE'] : ['L1', 'L2', 'L3', 'N', 'PE']
      for (const conductor of conductors) pair(la(`${conductor}-IN`), la(`${conductor}-OUT`))
      break
    }

    // ---- CLP: a saída Q é ponte da alimentação L enquanto o programa a energiza ----
    case 'plcSiemensLogo1224RC': {
      // As 4 saídas são contactos secos: cada Q liga APENAS os seus dois
      // parafusos quando o programa ativa o relé, sem ponte para L+.
      for (const q of Object.keys(c.state.outputs ?? {})) {
        if (c.state.powered !== false && c.state.outputs[q]) pair(la(q), la(`${q}·2`))
      }
      break
    }
    case 'plcLsXbmDn32s': {
      // O aparelho real tem saídas transistor NPN (sink). O motor atual é
      // binário e representa o estado lógico fechando cada Q à alimentação
      // de comando, mantendo a programação e a cablagem observáveis.
      const supply = la('L+')
      if (c.state.powered !== false && supply && c.state.outputs) {
        for (const q of Object.keys(c.state.outputs)) if (c.state.outputs[q]) pair(supply, la(q))
      }
      break
    }
    case 'plcLogo':
    case 'plcCompact': {
      const supply = la('L') ?? la('L+')
      if (supply && c.state.outputs) {
        for (const q of Object.keys(c.state.outputs)) {
          if (c.state.outputs[q]) pair(supply, la(q))
        }
      }
      break
    }

    // Condensador de arranque/funcionamento: caminho condutivo entre os dois terminais
    // (modelo de continuidade binária; em AC o condensador passa a corrente).
    case 'capacitorRun60uF': {
      pair(la('1'), la('1B'))
      pair(la('2'), la('2B'))
      pair(la('2'), la('2C'))
      pair(la('2'), la('2D'))
      pair(la('2B'), la('2C'))
      pair(la('2C'), la('2D'))
      if (!c.state.failed) pair(la('1'), la('2'))
      break
    }

    // Botoeiras industriais Ø22 (KEOLEA KL-XB2): instantâneas, retorno por mola.
    case 'pushButtonXb2No':
    case 'pushButtonXb2Black':
    case 'pushButtonXb2Yellow':
    case 'pushButtonXb2Blue':
    case 'pushButtonXb2White': {
      if (c.state.pressed) pair(la('3'), la('4'))
      break
    }
    case 'pushButtonXb2Nc': {
      if (!c.state.pressed) pair(la('1'), la('2'))
      break
    }

    // cargas puras (sinaleiros, motores, medidores) não são ponte de passagem
    default:
      break
  }
  return bridges
}

const HEAD_BREAKERS = new Set([
  'breaker1p', 'breakerSchneiderIc60h1p', 'breakerSteckSdC25', 'breaker2p', 'breaker3p', 'breaker4p',
  'switchSchneiderEz9s1p', 'switchSchneiderEz9s2p', 'switchSchneiderEz9s4p',
  'motorBreaker', 'motorBreakerPkzmC10', 'motorBreakerSchneiderGv2me',
  'residualBreaker', 'residualBreakerSchneiderIid4p', 'residualBreakerSchneiderIdpnVigi', 'residualBreakerHagerCfc225p',
])
/** Componentes que alimentam a rede (mesmo desligados: nesse caso o que está a jusante fica sem tensão). */
const FEEDER_TYPES = /^(powerSource|powerSupply|busbar|earthBar)/

/**
 * Entradas de disjuntor que estão A JUSANTE de outro aparelho (ligadas, por cabos e bornes passivos, à saída
 * de outro componente ou a uma fonte). Essas entradas NÃO são «a rede»: recebem a tensão pelo circuito.
 * Sem esta distinção, desligar o disjuntor geral não cortava nada — as entradas do disjuntor-motor e do
 * disjuntor do comando a jusante continuavam a contar como fonte.
 */
function fedBreakerInputs(components: ElectricalComponent[], wires: Wire[]): Set<string> {
  const parent = new Map<string, string>()
  const find = (id: string): string => {
    let root = parent.get(id) ?? id
    while (root !== (parent.get(root) ?? root)) root = parent.get(root) ?? root
    if (root !== id) parent.set(id, root)
    return root
  }
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb) }
  for (const w of wires) if (w.kind !== 'hydraulic' && w.kind !== 'pneumatic' && w.fromTerminalId && w.toTerminalId && !w.fromPoint && !w.toPoint) union(w.fromTerminalId, w.toTerminalId)
  // Bornes, réguas e barramentos repartidores: condutores passivos, sempre em continuidade por barra.
  for (const c of components) {
    if (/^(terminal|busbarPhaseAcrylic|busbarPhaseStepped|busbarComb|combBusbarConnector|busbarNeutral)/.test(c.type)) {
      for (const [a, b] of internalBridges(c)) union(a, b)
    }
  }
  for (const [a, b] of terminalStripJumperPairs(components)) union(a, b)
  for (const comb of components) {
    if (isCombBusbar(comb) && comb.mountedOn) {
      for (const { pinLabel, breakerId, socketLabel } of combMountPairs(comb, components)) {
        const pin = comb.terminals.find((t) => t.label === pinLabel)
        const br = components.find((c) => c.id === breakerId)
        const sock = br?.terminals.find((t) => t.label === socketLabel)
        if (pin && sock) union(pin.id, sock.id)
      }
    } else if (isCombConnector(comb) && comb.mountedOn) {
      const br = components.find((c) => c.id === comb.mountedOn)
      const socketLabel = (comb.state?.mountedTerminal as string) || (br ? breakerInputLabels(br)[0] : '1')
      const pino = comb.terminals.find((t) => t.label === 'PINO')
      const sock = br?.terminals.find((t) => t.label === socketLabel)
      if (pino && sock) union(pino.id, sock.id)
    }
  }
  const feeders = new Map<string, Set<string>>() // rede → componentes que a alimentam
  for (const c of components) {
    for (const term of c.terminals) {
      if (!(FEEDER_TYPES.test(c.type) || term.kind === 'power-out')) continue
      const root = find(term.id)
      if (!feeders.has(root)) feeders.set(root, new Set())
      feeders.get(root)!.add(c.id)
    }
  }
  const fed = new Set<string>()
  for (const c of components) {
    if (!HEAD_BREAKERS.has(c.type)) continue
    for (const term of c.terminals) {
      if (term.kind !== 'power-in' && term.label !== 'N1') continue
      const from = feeders.get(find(term.id))
      if (from && [...from].some((id) => id !== c.id)) fed.add(term.id)
    }
  }
  return fed
}

/**
 * Terminais que são fonte de energia (sempre vivos, ou vivos enquanto a fonte estiver ativa).
 * Com `wires`, as entradas de disjuntor alimentadas por outro aparelho deixam de contar como rede.
 */
export function sourceTerminalIds(components: ElectricalComponent[], faults?: FaultState, wires?: Wire[]): string[] {
  const ids: string[] = []
  const fedInputs = wires ? fedBreakerInputs(components, wires) : null
  for (const c of components) {
    const push = (label: string) => {
      const term = t(c, label)
      if (term) ids.push(term.id)
    }
    // barramentos / bornes de força
    if (c.type === 'busbarPhase' && c.state.source !== false) {
      push('L1')
      if (!faults?.phaseLoss) {
        push('L2')
        push('L3')
      }
    }
    if (c.type === 'busbarPhaseAcrylic' && c.state.source === true) {
      const ph = typeof c.state.sourcePhase === 'string' ? c.state.sourcePhase : 'L1'
      if (!(faults?.phaseLoss && ph === 'L2') && c.terminals[0]) ids.push(c.terminals[0].id)
    }
    if (c.type === 'busbarPhaseStepped' && c.state.source === true) {
      const seeded = new Set<string>()
      c.terminals.forEach((x) => {
        const bar = steppedTerminalBarOf(x.label)
        if (!bar || seeded.has(bar)) return
        seeded.add(bar)
        if (faults?.phaseLoss && bar === 'L2') return
        ids.push(x.id)
      })
    }
    if (c.type === 'busbarComb' && c.state.source === true) {
      const seeded = new Set<string>()
      const singlePhase = typeof c.state.sourcePhase === 'string' ? c.state.sourcePhase : 'L1'
      c.terminals.forEach((x) => {
        const cond = combTerminalConductorOf(x.label)
        if (!cond || seeded.has(cond)) return
        seeded.add(cond)
        const eff = cond === 'L' ? singlePhase : cond
        if (faults?.phaseLoss && eff === 'L2') return
        ids.push(x.id)
      })
    }
    if (c.type === 'busbarNeutral' && c.state.source !== false) {
      c.terminals.forEach((x) => ids.push(x.id))
    }
    if (c.type === 'earthBar') c.terminals.forEach((x) => ids.push(x.id))
    // rede entrando pelos polos de entrada dos disjuntores gerais
    if (HEAD_BREAKERS.has(c.type)) {
      c.terminals.filter((x) => x.kind === 'power-in' || (x.label === 'N1')).forEach((x) => {
        if (fedInputs?.has(x.id)) return
        if (faults?.phaseLoss && /L2|[35]/.test(x.label)) return
        ids.push(x.id)
      })
    }
    // Fontes isoladas: nunca há ponte entre a entrada AC e a saída do ATV.
    if (industrialDeviceTypeOf(c) === 'vfdSchneiderAtv320' && c.state.powered) {
      push('+24'); push('10V'); push('COM1'); push('COM2')
      if (c.state.running && c.state.stoReleased && !c.state.deviceFault) { push('U/T1'); push('V/T2'); push('W/T3') }
    }
    // fontes locais
    if (c.type === 'powerSupply' && c.state.on) push('+V')
    if (c.type === 'powerSource1ph') {
      push('PE')
      if (c.state.on !== false) { push('L'); push('N') }
    }
    if (c.type === 'powerSource24v') {
      // DC: +24 V e retorno 0 V (neutral, não contamina o positivo) só com a fonte ligada; PE sempre.
      push('PE')
      if (c.state.on !== false) { push('+24V'); push('0V') }
    }
    if (c.type === 'powerSource3ph') {
      push('PE')
      if (c.state.on !== false) {
        push('L1')
        if (!faults?.phaseLoss) { push('L2'); push('L3') }
        push('N')
      }
    }
    if (c.type === 'powerSupplyProauto24A' && c.state.powered && c.state.on) {
      push('+V1'); push('+V2')
      // O retorno 0 V também é referência do circuito: bobinas e sinaleiros só ficam
      // «energizados» quando AMBOS os bornes (A1/A2, X1/X2) estão no grafo. Os bornes
      // -V são kind 'neutral', pelo que não contaminam o positivo da alimentação do PLC.
      push('-V1'); push('-V2')
    }
    if (c.type === 'safetyRelay' && c.state.powered) push('S11')
    if (c.type === 'transformer' && !c.state.failed) push('S1')
  }
  return ids
}

interface Graph {
  adjacency: Map<string, string[]>
}

function buildGraph(components: ElectricalComponent[], wires: Wire[]): Graph {
  const adjacency = new Map<string, string[]>()
  const addEdge = (a: string, b: string) => {
    if (!adjacency.has(a)) adjacency.set(a, [])
    if (!adjacency.has(b)) adjacency.set(b, [])
    adjacency.get(a)!.push(b)
    adjacency.get(b)!.push(a)
  }
  for (const w of wires) {
    if (w.kind === 'hydraulic' || w.kind === 'pneumatic') continue
    // Etiquetas de rede (comunicação entre folhas do esquema): a ponta marcada
    // liga-se ao nó virtual «net:NOME», partilhado por todos os fios com a
    // mesma etiqueta — continuidade elétrica mesmo sem fio desenhado.
    const a = w.netFrom?.trim() ? `net:${w.netFrom.trim().toUpperCase()}` : !w.fromPoint ? w.fromTerminalId : undefined
    const b = w.netTo?.trim() ? `net:${w.netTo.trim().toUpperCase()}` : !w.toPoint ? w.toTerminalId : undefined
    if (a && b) addEdge(a, b)
  }
  for (const c of components) for (const [a, b] of internalBridges(c)) addEdge(a, b)
  for (const [a, b] of terminalStripJumperPairs(components)) addEdge(a, b)
  // Encaixe pente / conector de alimentação → bornes superiores dos disjuntores (sem cabos)
  for (const comb of components) {
    if (isCombBusbar(comb) && comb.mountedOn) {
      for (const { pinLabel, breakerId, socketLabel } of combMountPairs(comb, components)) {
        const pin = comb.terminals.find((t) => t.label === pinLabel)
        const br = components.find((c) => c.id === breakerId)
        const sock = br?.terminals.find((t) => t.label === socketLabel)
        if (pin && sock) addEdge(pin.id, sock.id)
      }
    } else if (isCombConnector(comb) && comb.mountedOn) {
      const br = components.find((c) => c.id === comb.mountedOn)
      const socketLabel = (comb.state?.mountedTerminal as string) || (br ? breakerInputLabels(br)[0] : '1')
      const pino = comb.terminals.find((t) => t.label === 'PINO')
      const sock = br?.terminals.find((t) => t.label === socketLabel)
      if (pino && sock) addEdge(pino.id, sock.id)
    }
  }
  return { adjacency }
}

function bfs(graph: Graph, sources: string[]): Set<string> {
  const visited = new Set<string>()
  const queue: string[] = []
  for (const s of sources) {
    if (!visited.has(s)) {
      visited.add(s)
      queue.push(s)
    }
  }
  while (queue.length) {
    const cur = queue.shift()!
    for (const nb of graph.adjacency.get(cur) ?? []) {
      if (!visited.has(nb)) {
        visited.add(nb)
        queue.push(nb)
      }
    }
  }
  return visited
}

export function computeCurrentFlow(
  components: ElectricalComponent[],
  wires: Wire[],
  energizedTerminals: Set<string>,
  graph: Graph,
): Set<string> {
  const activeWires = new Set<string>()

  // 1. Identificar bornes de carga em funcionamento
  const activeTerminalPairs: Array<[string, string]> = []
  const activeSingleTerminals: string[] = []

  for (const c of components) {
    // Bobinas (contactor, relé auxiliar, temporizador, soft-starter)
    const a1 = t(c, 'A1')?.id
    const a2 = t(c, 'A2')?.id
    if (a1 && a2 && energizedTerminals.has(a1) && energizedTerminals.has(a2)) {
      activeTerminalPairs.push([a1, a2])
    }
    // Cargas monofásicas / sinalizadores (X1-X2)
    const x1 = t(c, 'X1')?.id
    const x2 = t(c, 'X2')?.id
    if (x1 && x2 && energizedTerminals.has(x1) && energizedTerminals.has(x2)) {
      activeTerminalPairs.push([x1, x2])
    }
    // Motores trifásicos (U1, V1, W1 energizados)
    const u1 = (t(c, 'U1') || t(c, 'U'))?.id
    const v1 = (t(c, 'V1') || t(c, 'V'))?.id
    const w1 = (t(c, 'W1') || t(c, 'W'))?.id
    if (u1 && v1 && w1 && energizedTerminals.has(u1) && energizedTerminals.has(v1) && energizedTerminals.has(w1)) {
      activeSingleTerminals.push(u1, v1, w1)
    }
    // Eletrobomba periférica monofásica (L1 + N)
    if (c.type === 'waterPump' && c.state.running) {
      const l1 = t(c, 'L1')?.id
      const n = t(c, 'N')?.id
      if (l1 && n && energizedTerminals.has(l1) && energizedTerminals.has(n)) {
        activeTerminalPairs.push([l1, n])
      }
    }
    // Fontes DC / PLCs com alimentação ligada
    if (c.type === 'powerSupplyProauto24A' && c.state.powered) {
      const l = t(c, 'L')?.id
      const n = t(c, 'N')?.id
      if (l && n && energizedTerminals.has(l) && energizedTerminals.has(n)) {
        activeTerminalPairs.push([l, n])
      }
    }
    if (c.type === 'plcSiemensLogo1224RC' && c.state.powered) {
      const lp = t(c, 'L+')?.id
      const m = t(c, 'M')?.id
      if (lp && m && energizedTerminals.has(lp) && energizedTerminals.has(m)) {
        activeTerminalPairs.push([lp, m])
      }
    }
    // Condensadores
    if (c.type === 'capacitorRun60uF') {
      const u = (t(c, 'U') || t(c, '1'))?.id
      const v = (t(c, 'V') || t(c, '2'))?.id
      if (u && v && energizedTerminals.has(u) && energizedTerminals.has(v)) {
        activeSingleTerminals.push(u, v)
      }
    }
  }

  if (activeTerminalPairs.length === 0 && activeSingleTerminals.length === 0) {
    return activeWires
  }

  const wireByEdge = new Map<string, string>()
  for (const w of wires) {
    if (w.kind === 'hydraulic' || w.kind === 'pneumatic') continue
    if (energizedTerminals.has(w.fromTerminalId) && energizedTerminals.has(w.toTerminalId)) {
      wireByEdge.set(`${w.fromTerminalId}|${w.toTerminalId}`, w.id)
      wireByEdge.set(`${w.toTerminalId}|${w.fromTerminalId}`, w.id)
    }
  }

  const visited = new Set<string>()
  const queue: string[] = []

  for (const [a, b] of activeTerminalPairs) {
    queue.push(a, b)
    visited.add(a)
    visited.add(b)
  }
  for (const term of activeSingleTerminals) {
    queue.push(term)
    visited.add(term)
  }

  while (queue.length > 0) {
    const cur = queue.shift()!
    for (const nb of graph.adjacency.get(cur) ?? []) {
      const wireId = wireByEdge.get(`${cur}|${nb}`)
      if (wireId) activeWires.add(wireId)
      if (!visited.has(nb)) {
        visited.add(nb)
        queue.push(nb)
      }
    }
  }

  return activeWires
}

export function computeContinuity(components: ElectricalComponent[], wires: Wire[], sourceTerminalIds: string[]): ContinuityResult {
  const graph = buildGraph(components, wires)
  const energizedTerminals = bfs(graph, sourceTerminalIds)
  const energizedWires = new Set<string>()
  for (const w of wires) {
    if (energizedTerminals.has(w.fromTerminalId) && energizedTerminals.has(w.toTerminalId)) energizedWires.add(w.id)
  }
  const activeWires = computeCurrentFlow(components, wires, energizedTerminals, graph)
  return { energizedTerminals, energizedWires, activeWires, reachable: graph.adjacency as unknown as Map<string, Set<string>> }
}

/** Bobina (A1/A2) recebendo energia. */
export function isCoilPowered(c: ElectricalComponent, energizedTerminals: Set<string>): boolean {
  const a1 = t(c, 'A1')?.id
  const a2 = t(c, 'A2')?.id
  if (!a1 || !a2) return false
  return energizedTerminals.has(a1) && energizedTerminals.has(a2)
}

/** Carga de 2 bornes (sinaleiro, buzzer) energizada. */
export function isLoadPowered(c: ElectricalComponent, energizedTerminals: Set<string>, aLabel = 'X1', bLabel = 'X2'): boolean {
  const a = t(c, aLabel)?.id
  const b = t(c, bLabel)?.id
  if (!a || !b) return false
  return energizedTerminals.has(a) && energizedTerminals.has(b)
}

/** Mede continuidade entre dois bornes (função "multímetro" / sonda). */
export function probe(
  components: ElectricalComponent[],
  wires: Wire[],
  a: string,
  b: string,
  energizedTerminals: Set<string>,
): ProbeResult {
  const graph = buildGraph(components, wires)
  const visited = new Map<string, number>([[a, 0]])
  const queue = [a]
  let connected = false
  while (queue.length) {
    const cur = queue.shift()!
    for (const nb of graph.adjacency.get(cur) ?? []) {
      if (!visited.has(nb)) {
        visited.set(nb, (visited.get(cur) ?? 0) + 1)
        if (nb === b) connected = true
        queue.push(nb)
      }
    }
  }
  const hops = visited.get(b) ?? -1
  const liveA = energizedTerminals.has(a)
  const liveB = energizedTerminals.has(b)
  const voltage = liveA && liveB ? '0 V (mesmo potencial)' : liveA !== liveB ? '≈ tensão da fonte' : '0 V'
  const note = connected
    ? hops === 1
      ? 'Continuidade direta (mesmo nó elétrico).'
      : `Caminho condutivo com ${hops} elementos em série.`
    : 'Circuito aberto entre os pontos medidos.'
  return {
    a,
    b,
    connected,
    hops,
    resistanceOhm: connected ? (hops <= 1 ? 0.1 : hops * 0.8) : null,
    voltage,
    note,
  }
}

/** Comprimento estimado do cabo (mm) a partir da distância do roteamento no esquema. */
export function estimateWireLength(from: { x: number; y: number }, to: { x: number; y: number }, scaleMmPerUnit = 4): number {
  const dx = Math.abs(to.x - from.x) + Math.abs(to.y - from.y)
  return Math.round((dx * scaleMmPerUnit + 150) / 10) * 10
}
