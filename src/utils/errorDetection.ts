import type { ElectricalComponent, Wire, SimulationDiagnostic, FaultState } from '../types'
import { TEMPLATES } from '../electrical/factory'

let counter = 0
const id = () => `diag-${++counter}`

export function detectDiagnostics(
  components: ElectricalComponent[],
  wires: Wire[],
  energizedTerminals: Set<string>,
  faults?: FaultState,
): SimulationDiagnostic[] {
  const diags: SimulationDiagnostic[] = []

  // 1. Contatores intertravados energizados ao mesmo tempo
  const contactors = components.filter((c) => c.type === 'contactor' || c.type === 'contactor4p')
  const energizedContactors = contactors.filter((c) => c.state.energized)
  for (let i = 0; i < energizedContactors.length; i++) {
    for (let j = i + 1; j < energizedContactors.length; j++) {
      const a = energizedContactors[i]
      const b = energizedContactors[j]
      if (a.state.interlockWith === b.id || b.state.interlockWith === a.id) {
        diags.push({
          id: id(),
          level: 'error',
          message: `ERRO: ${a.ref} e ${b.ref} não podem ser energizados simultaneamente (intertravamento violado).`,
          componentId: a.id,
        })
      }
    }
  }

  // 2. Motor sem proteção térmica
  const motors = components.filter((c) => c.type === 'motor3ph' || c.type === 'motor1ph')
  const hasThermal = components.some((c) => c.type === 'thermalRelay')
  if (motors.length > 0 && !hasThermal) {
    diags.push({ id: id(), level: 'warning', message: `AVISO: motor ${motors[0].ref} sem relé térmico de proteção.` })
  }

  // 3. Térmico disparado
  components
    .filter((c) => c.type === 'thermalRelay' && c.state.tripped)
    .forEach((c) => diags.push({ id: id(), level: 'error', message: `ERRO: relé térmico ${c.ref} disparou (sobrecarga).`, componentId: c.id }))

  // 4. Bobina sem alimentação
  contactors.concat(components.filter((c) => c.type === 'auxRelay' || c.type === 'timerRelayTON' || c.type === 'timerRelayTOF')).forEach((c) => {
    const a1 = c.terminals.find((t) => t.label === 'A1')
    const a2 = c.terminals.find((t) => t.label === 'A2')
    const inA1 = wires.some((w) => w.fromTerminalId === a1?.id || w.toTerminalId === a1?.id)
    const inA2 = wires.some((w) => w.fromTerminalId === a2?.id || w.toTerminalId === a2?.id)
    if (!inA1) diags.push({ id: id(), level: 'error', message: `ERRO: A1 de ${c.ref} não possui alimentação (nenhum cabo conectado).`, componentId: c.id })
    if (!inA2) diags.push({ id: id(), level: 'warning', message: `AVISO: A2 de ${c.ref} não possui retorno (nenhum cabo conectado).`, componentId: c.id })
  })

  // 5. Cabos órfãos (borne inexistente)
  const terminalIds = new Set(components.flatMap((c) => c.terminals.map((t) => t.id)))
  wires.forEach((w) => {
    if (!terminalIds.has(w.fromTerminalId) || !terminalIds.has(w.toTerminalId)) {
      diags.push({ id: id(), level: 'error', message: `ERRO: cabo ${w.number ?? w.id} sem destino válido.` })
    }
  })

  // 6. Bornes de força desconectados em proteções/contatores
  components.forEach((c) => {
    if (c.type === 'contactor' || c.type.startsWith('breaker') || c.type === 'motorBreaker' || c.type === 'thermalRelay') {
      c.terminals.forEach((t) => {
        if (t.kind === 'power-in' || t.kind === 'power-out') {
          const connected = wires.some((w) => w.fromTerminalId === t.id || w.toTerminalId === t.id)
          if (!connected) diags.push({ id: id(), level: 'warning', message: `AVISO: terminal ${t.label} de ${c.ref} não conectado.`, componentId: c.id })
        }
      })
    }
  })

  // 7. Curto-circuito entre fases (duas fases alcançam o mesmo nó)
  const phaseCollision = new Map<string, Set<string>>()
  for (const w of wires) {
    const ph = (tid: string) => {
      for (const c of components) {
        const t = c.terminals.find((x) => x.id === tid)
        if (c.type === 'busbarPhase' && t) return t.label
        if ((c.type.startsWith('breaker') || c.type === 'motorBreaker') && t) {
          if (t.label === '1') return 'L1'
          if (t.label === '3') return 'L2'
          if (t.label === '5') return 'L3'
        }
      }
      return null
    }
    const a = ph(w.fromTerminalId)
    const b = ph(w.toTerminalId)
    if (a && b && a !== b) {
      if (!phaseCollision.has(w.id)) phaseCollision.set(w.id, new Set([a, b]))
    }
  }
  if (faults?.shortCircuit || phaseCollision.size > 0) {
    diags.push({ id: id(), level: 'error', message: `ERRO: curto-circuito entre fases detectado${phaseCollision.size ? ' em ' + [...phaseCollision.keys()].length + ' cabo(s)' : ''}.` })
  }

  // 8. Motor sem condutor de proteção (PE)
  motors.forEach((m) => {
    const pe = m.terminals.find((t) => t.label === 'PE')
    if (pe) {
      const connected = wires.some((w) => w.fromTerminalId === pe.id || w.toTerminalId === pe.id)
      if (!connected) diags.push({ id: id(), level: 'warning', message: `AVISO: motor ${m.ref} sem condutor de proteção (PE).`, componentId: m.id })
    }
  })

  // 9. Componentes sobrepostos no esquema
  for (let i = 0; i < components.length; i++) {
    for (let j = i + 1; j < components.length; j++) {
      const a = components[i]
      const b = components[j]
      const overlap =
        a.schematicX < b.schematicX + b.w &&
        a.schematicX + a.w > b.schematicX &&
        a.schematicY < b.schematicY + b.h &&
        a.schematicY + a.h > b.schematicY
      if (overlap) {
        diags.push({ id: id(), level: 'warning', message: `AVISO: ${a.ref} e ${b.ref} estão sobrepostos no esquema.`, componentId: a.id })
      }
    }
  }

  // 10. Digitação fora da faixa típica
  components.forEach((c) => {
    if (c.type === 'thermalRelay' && c.state.rangeInA && c.state.motorCv) {
      const inNom = (c.state.motorCv * 736) / (1.732 * 380 * 0.8)
      if (c.state.rangeInA < inNom * 0.9 || c.state.rangeInA > inNom * 1.15) {
        diags.push({ id: id(), level: 'info', message: `INFO: faixa do térmico ${c.ref} (${c.state.rangeInA} A) não cobre a corrente nominal do motor (${inNom.toFixed(1)} A).`, componentId: c.id })
      }
    }
  })

  // 11. Falhas injetadas
  if (faults) {
    if (faults.phaseLoss) diags.push({ id: id(), level: 'error', message: 'FALHA INJETADA: falta de fase (L2/L3 ausente).' })
    if (faults.earthLeak) diags.push({ id: id(), level: 'error', message: 'FALHA INJETADA: fuga à terra acima de 30 mA — DR atuaria.' })
    if (faults.overvoltage) diags.push({ id: id(), level: 'warning', message: 'FALHA INJETADA: sobretensão na alimentação (10% acima do nominal).' })
    if (faults.overload) diags.push({ id: id(), level: 'warning', message: 'FALHA INJETADA: sobrecarga mecânica no motor.' })
  }

  // 12. Tipos declarados mas sem implementação visual (não deve ocorrer)
  components.forEach((c) => {
    if (!TEMPLATES[c.type]) diags.push({ id: id(), level: 'error', message: `ERRO: componente ${c.ref} tem tipo desconhecido (${c.type}).`, componentId: c.id })
  })

  return diags
}
