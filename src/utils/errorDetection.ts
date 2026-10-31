import type { ElectricalComponent, Wire, SimulationDiagnostic, FaultState, Terminal } from '../types'
import { TEMPLATES } from '../electrical/factory'
import { terminalClassesCompatible, terminalElectricalClassOf } from '../electrical/terminalClassification'

const isSupport = (type: string) => /^dinRail|rail|busbar|barra|mountingPlate|cableDuct|calha/i.test(type)

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
  // Proteção contra sobrecarga: relé térmico OU disjuntor-motor (PKZM, GV2ME…), que já tem o disparo térmico.
  const hasThermal = components.some((c) => /thermal|motorBreaker/i.test(c.type))
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
    if ((!w.fromPoint && !terminalIds.has(w.fromTerminalId)) || (!w.toPoint && !terminalIds.has(w.toTerminalId))) {
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
      // Calhas DIN e barras são suportes: os aparelhos ficam montados POR CIMA delas de propósito.
      if (isSupport(a.type) || isSupport(b.type)) continue
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

  // --- Índice borne → componente/terminal ---
  const termIndex = new Map<string, { component: ElectricalComponent; terminal: Terminal }>()
  for (const c of components) {
    for (const term of c.terminals) termIndex.set(term.id, { component: c, terminal: term })
  }
  const wireTouches = (w: Wire, terminalId: string) =>
    (!w.fromPoint && w.fromTerminalId === terminalId) || (!w.toPoint && w.toTerminalId === terminalId)
  const isConnected = (terminalId: string) => wires.some((w) => wireTouches(w, terminalId))

  // 13. Cabos soltos / ponta livre
  wires.forEach((w) => {
    const fromFree = Boolean(w.fromPoint) || !w.fromTerminalId
    const toFree = Boolean(w.toPoint) || !w.toTerminalId
    const label = w.number ?? w.id.slice(0, 6)
    if (fromFree && toFree) {
      diags.push({ id: id(), level: 'error', message: `ERRO: cabo ${label} solto nas duas pontas — sem continuidade eléctrica.` })
    } else if (fromFree || toFree) {
      const fixed = fromFree ? (termIndex.get(w.toTerminalId)?.component.ref ?? '?') : (termIndex.get(w.fromTerminalId)?.component.ref ?? '?')
      diags.push({ id: id(), level: 'warning', message: `AVISO: cabo ${label} com ponta livre (ligado só a ${fixed}).`, componentId: termIndex.get(fromFree ? w.toTerminalId : w.fromTerminalId)?.component.id })
    }
  })

  // 14. Classes eléctricas incompatíveis (AC↔DC, rede↔potência, etc.)
  wires.forEach((w) => {
    if (w.fromPoint || w.toPoint || !w.fromTerminalId || !w.toTerminalId) return
    const a = termIndex.get(w.fromTerminalId)
    const b = termIndex.get(w.toTerminalId)
    if (!a || !b) return
    const ca = terminalElectricalClassOf(a.component, a.terminal)
    const cb = terminalElectricalClassOf(b.component, b.terminal)
    if (!terminalClassesCompatible(ca, cb)) {
      diags.push({
        id: id(),
        level: 'error',
        message: `ERRO: cabo ${w.number ?? w.id.slice(0, 6)} liga ${a.component.ref}:${a.terminal.label} (${ca.toUpperCase()}) a ${b.component.ref}:${b.terminal.label} (${cb.toUpperCase()}) — classes incompatíveis.`,
        componentId: a.component.id,
      })
    }
  })

  // 15. Polaridade / função do borne vs função do cabo
  const PHASE_KIND = new Set(['power', 'control'])
  wires.forEach((w) => {
    if (w.fromPoint && w.toPoint) return
    const ends: Array<'from' | 'to'> = ['from', 'to']
    for (const side of ends) {
      const tid = side === 'from' ? w.fromTerminalId : w.toTerminalId
      const free = side === 'from' ? Boolean(w.fromPoint) : Boolean(w.toPoint)
      if (free || !tid) continue
      const hit = termIndex.get(tid)
      if (!hit) continue
      const { component: c, terminal: term } = hit
      const kind = w.kind ?? 'control'
      // Neutro do cabo em borne que não é neutro/comum
      if (kind === 'neutral' && term.kind !== 'neutral' && term.kind !== 'coil-minus' && !/^N$|^COM$|^0V$|^M$/i.test(term.label)) {
        diags.push({
          id: id(),
          level: 'error',
          message: `ERRO: cabo neutro ${w.number ?? w.id.slice(0, 6)} ligado ao borne ${term.label} de ${c.ref} (não é neutro/COM).`,
          componentId: c.id,
        })
      }
      // PE em borne que não é terra
      if (kind === 'earth' && term.kind !== 'earth' && !/^PE$|^GND$/i.test(term.label)) {
        diags.push({
          id: id(),
          level: 'error',
          message: `ERRO: cabo de proteção (PE) ${w.number ?? w.id.slice(0, 6)} ligado ao borne ${term.label} de ${c.ref}.`,
          componentId: c.id,
        })
      }
      // Fase/potência no COM da torre ou neutro
      if (PHASE_KIND.has(kind) && (term.kind === 'earth' || (term.kind === 'neutral' && kind === 'power'))) {
        diags.push({
          id: id(),
          level: 'error',
          message: `ERRO: cabo de fase/potência ${w.number ?? w.id.slice(0, 6)} ligado ao borne ${term.label} de ${c.ref} (${term.kind}).`,
          componentId: c.id,
        })
      }
    }
  })

  // 16. Torre de sinalização / sensores de cabo solto — ligações incompletas ou COM ausente
  const LEAD_DEVICES = /^(towerLight|towerLightSb23011|photoSensor|photoSensorXukt1ksml2|proximitySensor)$/
  components.filter((c) => LEAD_DEVICES.test(c.type)).forEach((c) => {
    const leads = c.terminals.filter((t) => t.contact === 'lead' || t.terminalType === 'tubular')
    const terms = leads.length ? leads : c.terminals
    const open = terms.filter((t) => !isConnected(t.id))
    const com = terms.find((t) => /^COM$|^0V$|^M$|^N$/i.test(t.label) || t.kind === 'coil-minus' || t.kind === 'neutral')
    if (com && !isConnected(com.id) && terms.some((t) => t.id !== com.id && isConnected(t.id))) {
      diags.push({
        id: id(),
        level: 'error',
        message: `ERRO: ${c.ref} tem condutor(es) ligados mas o comum (${com.label}) está solto — a torre/sensor não fecha circuito.`,
        componentId: c.id,
      })
    }
    if (open.length === terms.length) {
      diags.push({ id: id(), level: 'warning', message: `AVISO: ${c.ref} sem nenhum cabo ligado aos pigtails.`, componentId: c.id })
    } else if (open.length) {
      diags.push({
        id: id(),
        level: 'warning',
        message: `AVISO: ${c.ref} — cabo(s) solto(s): ${open.map((t) => t.label).join(', ')}.`,
        componentId: c.id,
      })
    }
  })

  // 17. Neutro (ou fase) no fio de cor errada da torre: COM deve ser o retorno comum
  components.filter((c) => /towerLight/i.test(c.type)).forEach((c) => {
    const colorLeads = c.terminals.filter((t) => /^(R|Y|G|RED|YELLOW|GREEN)$/i.test(t.label))
    const com = c.terminals.find((t) => /^COM$/i.test(t.label) || t.kind === 'coil-minus')
    for (const lead of colorLeads) {
      const attached = wires.filter((w) => wireTouches(w, lead.id))
      for (const w of attached) {
        // Neutro no fio de cor da lâmpada (deveria ir ao COM)
        if (w.kind === 'neutral') {
          diags.push({
            id: id(),
            level: 'error',
            message: `ERRO: neutro no fio ${lead.label} de ${c.ref} — o retorno comum deve ir ao borne COM.`,
            componentId: c.id,
          })
        }
        // PE no fio de cor
        if (w.kind === 'earth') {
          diags.push({
            id: id(),
            level: 'error',
            message: `ERRO: PE ligado ao fio ${lead.label} de ${c.ref}.`,
            componentId: c.id,
          })
        }
      }
    }
    if (com) {
      for (const w of wires.filter((x) => wireTouches(x, com.id))) {
        // Fase de potência trifásica no COM (sinalização costuma ser comando 24V/AC fase-neutro)
        if (w.kind === 'power') {
          diags.push({
            id: id(),
            level: 'warning',
            message: `AVISO: cabo de potência no COM de ${c.ref} — confirme se a torre não deveria usar circuito de comando.`,
            componentId: c.id,
          })
        }
      }
    }
  })

  // 18. Bornes de sinalização/comando com uma ponta só (pigtail ou borne)
  components.forEach((c) => {
    if (c.category !== 'signaling' && c.category !== 'command' && c.category !== 'sensor') return
    if (LEAD_DEVICES.test(c.type)) return // já coberto em 16
    c.terminals.forEach((t) => {
      if (t.kind === 'earth') return
      if (!isConnected(t.id)) {
        diags.push({ id: id(), level: 'info', message: `INFO: ${c.ref}:${t.label} sem cabo.`, componentId: c.id })
      }
    })
  })

  return diags
}
