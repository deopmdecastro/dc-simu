import type { ElectricalComponent, FaultState, Wire } from '../types'
import { computePhaseLabels } from './phases'
import { internalBridges } from './engine'
import { industrialDeviceTypeOf } from './industrialDevices'

export interface ShortCircuitDiagnostic {
  active: boolean
  wires: Set<string>
  components: Set<string>
  focalPoint: [number, number, number] | null
  cause: string
  trippableBreakers: ElectricalComponent[]
}

const LOAD_COMPONENT_TYPES = new Set([
  'motor3ph',
  'motor1ph',
  'contactor',
  'contactor4p',
  'contactorWegCWC09',
  'contactorWegCwbc65',
  'auxRelay',
  'auxRelay4',
  'timerRelayTON',
  'timerRelayTOF',
  'timerRelayStarDelta',
  'counterRelay',
  'safetyRelay',
  'safetyRelaySiemens3tk2840',
  'softStarter',
  'vfd',
  'ledGreen',
  'ledRed',
  'ledYellow',
  'ledWhite',
  'pilotLightAd22',
  'pilotLightSchneiderIil1p',
  'pilotLightSchneiderIil3p',
  'buzzer',
  'towerLight',
  'powerSupply',
  'powerSupplyProauto24A',
  'plcSiemensLogo1224RC',
  'plcSiemensS71500Cpu1511c',
  'plcSiemensS71500Di32',
  'plcSiemensS7300Cpu315',
  'plcLsXbmDn32s',
  'meterD522066',
  // Um TC externo não é uma carga: P1/P2 é o mesmo condutor e deve
  // continuar a denunciar um curto se for ligado entre fase e neutro.
  'meterKws306',
  'multimeterDm20',
])

const BREAKER_TYPES = new Set([
  'breaker1p',
  'breaker2p',
  'breaker3p',
  'breaker4p',
  'breakerSteckSdC25',
  'breakerSchneiderIc60h1p',
  'residualBreaker',
  'residualBreakerHagerCfc225p',
  'residualBreakerSchneiderIid4p',
  'residualBreakerSchneiderIdpnVigi',
  'motorBreaker',
  'motorBreakerPkzmC10',
  'motorBreakerSchneiderGv2me',
  'phoenixEcb3000760',
])

/**
 * Avalia curto-circuitos na montagem:
 *  1. Curto entre fases distintas (L1-L2, L2-L3, L3-L1);
 *  2. Curto direto Fase-Neutro ou Fase-PE sem carga intermediária;
 *  3. Curto direto DC (+24V com 0V / -V);
 *  4. Falha injetada no painel de monitorização (`faults.shortCircuit`).
 */
export function evaluateShortCircuits(
  components: ElectricalComponent[],
  wires: Wire[],
  energizedTerminals: Set<string>,
  faults?: FaultState,
): ShortCircuitDiagnostic {
  const shortedWires = new Set<string>()
  const shortedComponents = new Set<string>()
  const trippableBreakers: ElectricalComponent[] = []
  let focalPoint: [number, number, number] | null = null
  let cause = ''

  // 1. Identificação de fases em cada terminal
  const phaseMap = computePhaseLabels(components, wires)

  // Mapa de terminais a componentes
  const termToComp = new Map<string, ElectricalComponent>()
  for (const c of components) {
    for (const t of c.terminals) termToComp.set(t.id, c)
  }

  // A) Identifica colisões de fase diretas através de cabos condutores
  for (const w of wires) {
    if (!w.fromTerminalId || !w.toTerminalId || w.fromPoint || w.toPoint) continue
    const tA = energizedTerminals.has(w.fromTerminalId)
    const tB = energizedTerminals.has(w.toTerminalId)
    if (!tA && !tB) continue

    const phA = phaseMap.get(w.fromTerminalId)
    const phB = phaseMap.get(w.toTerminalId)

    if (phA && phB && phA !== phB) {
      const isPhaseCollision =
        (phA === 'L1' && (phB === 'L2' || phB === 'L3')) ||
        (phA === 'L2' && (phB === 'L1' || phB === 'L3')) ||
        (phA === 'L3' && (phB === 'L1' || phB === 'L2'))

      const isPhaseToNeutralOrPE =
        ((phA === 'L1' || phA === 'L2' || phA === 'L3') && (phB === 'N' || phB === 'PE')) ||
        ((phB === 'L1' || phB === 'L2' || phB === 'L3') && (phA === 'N' || phA === 'PE'))

      const isDcShort =
        (phA === 'DC+' && phB === 'N') || (phB === 'DC+' && phA === 'N')

      if (isPhaseCollision || isPhaseToNeutralOrPE || isDcShort) {
        shortedWires.add(w.id)
        const cA = termToComp.get(w.fromTerminalId)
        const cB = termToComp.get(w.toTerminalId)
        if (cA) shortedComponents.add(cA.id)
        if (cB) shortedComponents.add(cB.id)

        if (!cause) {
          cause = isPhaseCollision
            ? `Curto-circuito entre fases (${phA} e ${phB})`
            : isPhaseToNeutralOrPE
            ? `Curto-circuito fase-neutro/terra (${phA} e ${phB})`
            : `Curto-circuito de alimentação DC`
        }

        if (!focalPoint && cA) {
          const tObj = cA.terminals.find((x) => x.id === w.fromTerminalId)
          if (tObj?.position3D) {
            focalPoint = [
              cA.schematicX * 0.01 + (tObj.position3D.x - 0.5) * 0.4,
              cA.schematicY * -0.01 + (tObj.position3D.y - 0.5) * 0.4,
              0.22,
            ]
          }
        }
      }
    }
  }

  // B) Identifica curto através de pontes/polos de dispositivos não-carga (ex.: polos de disjuntor fechando fase sobre neutro)
  for (const c of components) {
    if (LOAD_COMPONENT_TYPES.has(c.type) && !industrialDeviceTypeOf(c)) continue
    for (const [tAId, tBId] of internalBridges(c)) {
      if (!energizedTerminals.has(tAId) && !energizedTerminals.has(tBId)) continue
      const phA = phaseMap.get(tAId)
      const phB = phaseMap.get(tBId)
      if (phA && phB && phA !== phB) {
        const isPhaseCollision =
          (phA === 'L1' && (phB === 'L2' || phB === 'L3')) ||
          (phA === 'L2' && (phB === 'L1' || phB === 'L3')) ||
          (phA === 'L3' && (phB === 'L1' || phB === 'L2'))

        const isPhaseToNeutralOrPE =
          ((phA === 'L1' || phA === 'L2' || phA === 'L3') && (phB === 'N' || phB === 'PE')) ||
          ((phB === 'L1' || phB === 'L2' || phB === 'L3') && (phA === 'N' || phA === 'PE'))

        const isDcShort =
          (phA === 'DC+' && phB === 'N') || (phB === 'DC+' && phA === 'N')

        if (isPhaseCollision || isPhaseToNeutralOrPE || isDcShort) {
          shortedComponents.add(c.id)
          if (BREAKER_TYPES.has(c.type) && !trippableBreakers.some((b) => b.id === c.id)) {
            trippableBreakers.push(c)
          }

          if (!cause) {
            cause = isPhaseCollision
              ? `Curto-circuito entre fases (${phA} e ${phB})`
              : isPhaseToNeutralOrPE
              ? `Curto-circuito fase-neutro/terra (${phA} e ${phB})`
              : `Curto-circuito de alimentação DC`
          }

          if (!focalPoint) {
            focalPoint = [c.schematicX * 0.01, c.schematicY * -0.01, 0.22]
          }

          // Todos os cabos ligados a estes terminais estão sob sobrecorrente de curto
          for (const w of wires) {
            if (
              w.fromTerminalId === tAId ||
              w.toTerminalId === tAId ||
              w.fromTerminalId === tBId ||
              w.toTerminalId === tBId
            ) {
              shortedWires.add(w.id)
            }
          }
        }
      }
    }
  }

  // C) Falha injetada manualmente no painel de diagnóstico
  if (faults?.shortCircuit && shortedWires.size === 0) {
    const liveWire = wires.find((w) => w.energized && w.carryingCurrent) || wires.find((w) => w.energized)
    if (liveWire) {
      shortedWires.add(liveWire.id)
      const cA = termToComp.get(liveWire.fromTerminalId)
      if (cA) {
        shortedComponents.add(cA.id)
        focalPoint = [cA.schematicX * 0.01, cA.schematicY * -0.01, 0.22]
      }
      cause = 'Curto-circuito forçado por injeção de falha'
    } else {
      const liveBreaker = components.find((c) => BREAKER_TYPES.has(c.type) && c.state.closed && !c.state.tripped)
      if (liveBreaker) {
        shortedComponents.add(liveBreaker.id)
        focalPoint = [liveBreaker.schematicX * 0.01, liveBreaker.schematicY * -0.01, 0.22]
        cause = 'Curto-circuito forçado por injeção de falha'
      }
    }
  }

  // D) Procura disjuntores no trajeto que possam atuar/desarmar magneticamente
  for (const c of components) {
    if (BREAKER_TYPES.has(c.type) && c.state.closed && !c.state.tripped) {
      const protectsLoop = c.terminals.some((t) => {
        return (
          wires.some(
            (w) => shortedWires.has(w.id) && (w.fromTerminalId === t.id || w.toTerminalId === t.id),
          ) || shortedComponents.has(c.id)
        )
      })
      if (
        (protectsLoop || (faults?.shortCircuit && c.terminals.some((t) => energizedTerminals.has(t.id)))) &&
        !trippableBreakers.some((b) => b.id === c.id)
      ) {
        trippableBreakers.push(c)
        shortedComponents.add(c.id)
      }
    }
  }

  const active = shortedWires.size > 0 || (faults?.shortCircuit ?? false)

  return {
    active,
    wires: shortedWires,
    components: shortedComponents,
    focalPoint: focalPoint ?? (active ? [0, 0, 0.22] : null),
    cause: cause || (active ? 'Curto-circuito detetado no circuito' : ''),
    trippableBreakers,
  }
}
