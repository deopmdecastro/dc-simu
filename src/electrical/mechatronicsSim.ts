import type { ElectricalComponent } from '../types'
import { cupTouchesWorkpiece, rampBelowWorkpiece } from './mechatronicsContact'
import {
  GEARMOTOR_OUTPUT_RPM,
  MEC_DIMS,
  WORKPIECE_MATERIALS,
  armAtHome,
  encoderPhases,
  workpieceMaterialOf,
  wrapDeg,
  type WorkpieceMaterial,
} from '../three/mechatronicsModel'

/**
 * Passo de simulação da maquete de estampagem (executado depois da propagação pneumática):
 * motor M1 + encoder, rotação/elevação/vácuo do manipulador, alimentação do magazine,
 * microinterruptor FC1, estampagem e triagem pelas rampas.
 *
 * Fluxo de peças (didático): o Cilindro 1 empurra o tarugo inferior do magazine para a zona de
 * recolha → a ventosa recolhe-o → pousa-o na gaveta da prensa → depois de estampado, a ventosa
 * volta a recolhê-lo e larga-o, por gravidade, na rampa sob a ventosa. A triagem depende
 * da manobra do programa; o material não corrige uma posição de descarga errada.
 */
export interface MechatronicsStepContext {
  dtSec: number
  /** Há ar comprimido (ou vácuo do ejetor) nesta porta pneumática? */
  airAt: (terminalId: string) => boolean
  /** Carga de 2 bornes energizada (os dois bornes com potencial). */
  loadPowered: (c: ElectricalComponent, a: string, b: string) => boolean
}

const termId = (c: ElectricalComponent, label: string) => c.terminals.find((t) => t.label === label)?.id

function magazineSequence(state: Record<string, any>): WorkpieceMaterial[] {
  const seq = Array.isArray(state.pieceSequence) && state.pieceSequence.length ? state.pieceSequence : ['aluminio', 'branco', 'preto']
  return seq.map(workpieceMaterialOf)
}

/** Material do tarugo inferior do magazine (a coluna desce uma posição a cada alimentação). */
export function magazineBottomMaterial(state: Record<string, any>): WorkpieceMaterial {
  const seq = magazineSequence(state)
  const offset = Math.max(0, Math.round(Number(state.pieceOffset ?? 0)))
  return seq[offset % seq.length]
}

/** Materiais da coluna do magazine, de baixo para cima. */
export function magazineColumn(state: Record<string, any>, capacity: number): WorkpieceMaterial[] {
  const seq = magazineSequence(state)
  const offset = Math.max(0, Math.round(Number(state.pieceOffset ?? 0)))
  const count = Math.max(0, Math.min(capacity, Math.round(Number(state.pieceCount ?? capacity))))
  return Array.from({ length: count }, (_, i) => seq[(offset + i) % seq.length])
}

/** Destino recomendado para programar a triagem; a transferência efetiva depende da geometria. */
export function rampIndexFor(material: WorkpieceMaterial, rampCount: number): number {
  if (rampCount <= 0) return -1
  if (WORKPIECE_MATERIALS.find((m) => m.id === material)?.metallic) return 0
  if (material === 'branco') return Math.min(1, rampCount - 1)
  return Math.min(2, rampCount - 1)
}

export function stepMechatronics(components: ElectricalComponent[], ctx: MechatronicsStepContext): void {
  const air = (c: ElectricalComponent, label: string) => {
    const id = termId(c, label)
    return !!id && ctx.airAt(id)
  }
  const ofType = (type: string) => components.filter((c) => c.type === type)
  const magazines = ofType('mecGravityMagazine')
  const feeders = ofType('mecFeederCylinder')
  const tables = ofType('mecStampingTable')
  const presses = ofType('mecStampingPress')
  const ramps = ofType('mecDischargeRamp')

  for (const ej of ofType('mecVacuumEjector')) ej.state.vacuumActive = air(ej, 'P')

  // Pressão no manómetro da prensa: 6 bar quando qualquer câmara recebe ar.
  for (const p of presses) p.state.pressureBar = air(p, 'A') || air(p, 'B') ? 6 : 0

  // Cilindro 1: no fim do avanço empurra o tarugo inferior para a zona de recolha da base do magazine.
  feeders.forEach((f, i) => {
    const extended = Number(f.state.positionPct ?? 0) >= 92
    if (extended && !f.state.wasExtended) {
      const mag = magazines[i] ?? magazines[0]
      const count = mag ? Math.round(Number(mag.state.pieceCount ?? 0)) : 0
      if (mag && count > 0 && !mag.state.pickupMaterial) {
        mag.state.pickupMaterial = magazineBottomMaterial(mag.state)
        mag.state.pieceCount = count - 1
        mag.state.pieceOffset = Math.round(Number(mag.state.pieceOffset ?? 0)) + 1
      }
    }
    f.state.wasExtended = extended
  })
  // Cilindro 3: a gaveta (e o FC 2 que viaja com ela) acompanha o curso da haste entre o ponto de
  // depósito do braço e o prato da prensa. Só as gavetas com eixo de deslizamento são arrastadas.
  const drawers = ofType('mecDrawerCylinder')
  const slideOf = (pct: unknown) => Math.round((Math.max(0, Math.min(100, Number(pct ?? 0))) / 100) * MEC_DIMS.drawerCylinder.strokeMm * 10) / 10
  tables.filter((t) => Array.isArray(t.state.slideAxis)).forEach((t, i) => {
    const d = drawers[i] ?? drawers[0]
    if (d) t.state.slideMm = slideOf(d.state.positionPct)
  })
  for (const sw of ofType('mecMicroSwitchRoller')) {
    if (sw.state.actuation === 'drawer' && Array.isArray(sw.state.slideAxis) && drawers[0]) sw.state.slideMm = slideOf(drawers[0].state.positionPct)
  }
  /** Com eixo de deslizamento, a gaveta só fica sob o prato no fim do curso do cilindro. */
  const underPress = (t: ElectricalComponent) => !Array.isArray(t.state.slideAxis) || Number(t.state.slideMm ?? 0) >= MEC_DIMS.drawerCylinder.strokeMm - 5
  // Prensa: o curso inferior com peça na gaveta (debaixo do prato) marca-a como estampada.
  for (const p of presses) {
    if (Number(p.state.positionPct ?? 0) >= 92) {
      const t = tables.find((tb) => typeof tb.state.pieceMaterial === 'string' && tb.state.pieceMaterial && underPress(tb))
      if (t) t.state.stamped = true
    }
  }

  // Motor M1 com encoder incremental A/B.
  const motorDelta = new Map<string, number>()
  for (const m of ofType('mecDcGearmotor')) {
    const cw = ctx.loadPowered(m, 'CW', '0V')
    const ccw = ctx.loadPowered(m, 'CCW', '0V')
    const dir = cw && !ccw ? 1 : ccw && !cw ? -1 : 0
    m.state.running = dir !== 0
    if (dir !== 0) m.state.direction = dir > 0 ? 'cw' : 'ccw'
    const dDeg = dir * GEARMOTOR_OUTPUT_RPM * 6 * ctx.dtSec
    const angle = Number(m.state.motorAngleDeg ?? 0) + dDeg
    m.state.motorAngleDeg = Math.round(angle * 100) / 100
    const ph = encoderPhases(angle)
    m.state.encA = ph.a
    m.state.encB = ph.b
    m.state.encoderCount = ph.count
    motorDelta.set(m.id, dDeg)
  }

  // Manipulador: rotação pelo par cónico 2:1, elevação pneumática Z, vácuo na porta VAC.
  const motors = ofType('mecDcGearmotor')
  for (const arm of ofType('mecRotaryArm')) {
    const motor = motors.find((m) => m.id === arm.state.driveMotorId) ?? motors[0]
    const delta = motor ? (motorDelta.get(motor.id) ?? 0) / MEC_DIMS.gearmotor.ratio : 0
    // Batentes mecânicos opcionais [mín, máx] (ex.: [180, 360]): o braço não entra no setor do
    // alimentador e da prensa; o motor fica calado contra o batente.
    const stops = Array.isArray(arm.state.rotationStops) ? arm.state.rotationStops.map(Number) : null
    const current = Number(arm.state.angleDeg ?? 0)
    const angle = stops && stops.length === 2 && delta !== 0
      ? wrapDeg(Math.min(stops[1], Math.max(stops[0], (current < stops[0] ? current + 360 : current) + delta)))
      : wrapDeg(current + delta)
    arm.state.angleDeg = Math.round(angle * 10) / 10
    arm.state.homeActive = armAtHome(angle)
    let down = Number(arm.state.armDownPct ?? 0)
    if (!Number.isFinite(down)) down = 0
    down = air(arm, 'Z') ? Math.min(100, down + ctx.dtSec * 220) : Math.max(0, down - ctx.dtSec * 220)
    arm.state.armDownPct = Math.round(down)
    const vacuum = air(arm, 'VAC') || !!arm.state.manualVacuum
    arm.state.vacuumActive = vacuum
    const holding = typeof arm.state.holding === 'string' && arm.state.holding ? workpieceMaterialOf(arm.state.holding) : null
    const atBottom = down >= 90
    if (vacuum && atBottom && !holding) {
      // Recolha apenas na estação em contacto com o lábio da ventosa.
      const src = magazines.find((m) => m.state.pickupMaterial && cupTouchesWorkpiece(arm, m))
      if (src) {
        arm.state.holding = workpieceMaterialOf(src.state.pickupMaterial)
        arm.state.holdingStamped = false
        src.state.pickupMaterial = ''
      } else {
        const t = tables.find((tb) => tb.state.pieceMaterial && cupTouchesWorkpiece(arm, tb))
        if (t) {
          arm.state.holding = workpieceMaterialOf(t.state.pieceMaterial)
          arm.state.holdingStamped = !!t.state.stamped
          t.state.pieceMaterial = ''
          t.state.stamped = false
        }
      }
    } else if (!vacuum && holding) {
      // Uma gaveta livre só recebe a peça quando esta está pousada no alojamento.
      // Fora da gaveta, a peça cai na calha que estiver por baixo ou perde-se.
      const freeTable = atBottom ? tables.find((tb) => !tb.state.pieceMaterial && cupTouchesWorkpiece(arm, tb)) : null
      if (freeTable) {
        freeTable.state.pieceMaterial = holding
        freeTable.state.stamped = !!arm.state.holdingStamped
      } else {
        const ramp = ramps.find((r) => rampBelowWorkpiece(arm, r))
        if (ramp) {
          const list = Array.isArray(ramp.state.pieces) ? ramp.state.pieces.slice(-4) : []
          ramp.state.pieces = [...list, holding]
        }
      }
      arm.state.holding = ''
      arm.state.holdingStamped = false
    }
  }

  // Refletir a recolha no mesmo passo, sem deixar FC1 / S. OTICO / S. INDUTIVO ativos por mais uma varredura.
  const activePickupMat = magazines.find((m) => !!m.state.pickupMaterial)?.state.pickupMaterial
  for (const sw of ofType('mecMicroSwitchRoller')) {
    if (sw.state.actuation === 'drawer') {
      // FC 2 no centro da gaveta: comuta só com a peça pousada no alojamento.
      sw.state.pressed = tables.some((t) => !!t.state.pieceMaterial)
    } else if (sw.state.actuation !== 'manual') {
      sw.state.pressed = Boolean(activePickupMat)
    }
  }
  for (const opt of ofType('mecOpticalSensor')) {
    if (opt.state.actuation !== 'manual') {
      const mat = activePickupMat ? workpieceMaterialOf(activePickupMat) : null
      // S. OTICO difuso: deteta peças brancas e metálicas; o polímero preto absorve o feixe.
      opt.state.triggered = mat === 'branco' || mat === 'aluminio'
    }
  }
  for (const ind of ofType('mecInductiveSensor')) {
    if (ind.state.actuation !== 'manual') {
      const mat = activePickupMat ? workpieceMaterialOf(activePickupMat) : null
      // S. INDUTIVO: responde apenas a peças metálicas (alumínio).
      ind.state.triggered = mat === 'aluminio'
    }
  }
}
