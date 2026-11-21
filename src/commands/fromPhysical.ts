/**
 * Geração automática de Esquema IEC 60617 (Comandos) a partir do layout e ligações 3D reais.
 *
 * Mapeia os componentes físicos (disjuntores, contatores, relés térmicos, botoneiras,
 * motores, condensadores, sinalizadores e fontes) e respetivas ligações de cabos
 * numa representação lógica padronizada com circuito de potência (força) e circuito
 * de comando.
 */

import type { ElectricalComponent, Wire } from '../types'
import type { CmdKind, CmdPart, CmdRotation, CmdWire, CommandsDiagram } from './model'
import { DEFAULT_PAGE_ID } from './pages'
import { iecAssociationOf } from '../electrical/iecAssociation'

export function generateIecDiagramFromPhysical(
  components: ElectricalComponent[],
  wires: Wire[],
): CommandsDiagram {
  const page = DEFAULT_PAGE_ID
  const diagram: CommandsDiagram = {
    name: 'Esquema IEC gerado do 3D',
    parts: [],
    wires: [],
    texts: [],
    pages: [{ id: page, name: 'Comandos e Força' }],
  }

  let nextPartId = 0
  const addPart = (kind: CmdKind, x: number, y: number, tag = '', extra: Partial<CmdPart> = {}, rot: CmdRotation = 0): CmdPart => {
    const p: CmdPart = { id: `iec_p${++nextPartId}`, kind, x, y, rot, tag, page, ...extra }
    diagram.parts.push(p)
    return p
  }

  const addWire = (partA: string, termA: number, partB: string, termB: number) => {
    diagram.wires.push({
      id: `iec_w${diagram.wires.length + 1}`,
      a: { part: partA, term: termA },
      b: { part: partB, term: termB },
      page,
    })
  }

  // Filtrar acessórios mecânicos que não pertencem ao esquema elétrico
  const electricalComps = components.filter((c) =>
    c.type !== 'panelEnclosure' && c.type !== 'cableDuct' && c.type !== 'spiralWrap' && c.type !== 'dinRail15x55'
  )

  if (electricalComps.length === 0) {
    diagram.texts!.push({ id: 't0', x: 80, y: 80, text: 'Nenhum equipamento elétrico no painel 3D para gerar esquema.', page })
    return diagram
  }

  // Mapeamento: componentId:terminalLabel -> { partId: string, termIdx: number }
  const terminalMap = new Map<string, { partId: string; termIdx: number }>()

  // Separação de ramos funcionais
  const powerSources = electricalComps.filter((c) => c.type.startsWith('powerSource') || c.type.startsWith('terminalSet'))
  const breakers = electricalComps.filter((c) => c.type.startsWith('breaker') || c.type.startsWith('motorBreaker') || c.type.startsWith('residualBreaker') || c.type.startsWith('fuse'))
  const contactors = electricalComps.filter((c) => c.type.startsWith('contactor') || c.type.startsWith('auxRelay'))
  const thermalRelays = electricalComps.filter((c) => c.type.startsWith('thermalRelay'))
  const motors = electricalComps.filter((c) => c.type.startsWith('motor'))
  const capacitors = electricalComps.filter((c) => c.type.startsWith('capacitor'))
  const buttons = electricalComps.filter((c) => c.type.startsWith('emergency') || c.type.startsWith('push') || c.type.startsWith('dualPush') || c.type.startsWith('key') || c.type.startsWith('selector'))
  const wallSwitches = electricalComps.filter((c) => c.type === 'wallSwitchSimple' || c.type === 'wallSwitchDouble' || c.type === 'wallSwitchStaircase')
  const lamps = electricalComps.filter((c) => c.type.startsWith('pilot') || c.type.startsWith('led') || c.type.startsWith('tower') || c.type === 'buzzer' || c.type === 'lampIncandescentE27' || c.type === 'lampFluorescentE27' || c.type === 'lampLedE27')

  // 1. Títulos de secção
  diagram.texts!.push({ id: 't_power', x: 80, y: 16, text: 'CIRCUITO DE POTÊNCIA (FORÇA)', page })
  diagram.texts!.push({ id: 't_ctrl', x: 380, y: 16, text: 'CIRCUITO DE COMANDO', page })

  // 2. Coluna de Potência (X = 80, 160, ...)
  let pX = 100
  let pY = 40

  // Alimentação de força
  const is3ph = powerSources.some((s) => s.type.includes('3ph')) || motors.some((m) => m.type.includes('3ph'))
  const mainSupply = addPart('supply', pX, pY, '', { lines: is3ph ? ['L1', 'L2', 'L3', 'PE'] : ['L', 'N', 'PE'] })
  pY += 40

  // Se houver disjuntores de potência
  for (const b of breakers) {
    const isMotor = b.type.includes('motorBreaker')
    const kind: CmdKind = isMotor ? 'motorBreaker3' : is3ph ? 'breaker3' : 'breaker1'
    const part = addPart(kind, pX, pY, b.ref)
    // mapeia bornes 1, 3, 5 e 2, 4, 6
    terminalMap.set(`${b.id}:1`, { partId: part.id, termIdx: 0 })
    terminalMap.set(`${b.id}:2`, { partId: part.id, termIdx: 1 })
    if (is3ph) {
      terminalMap.set(`${b.id}:3`, { partId: part.id, termIdx: 2 })
      terminalMap.set(`${b.id}:4`, { partId: part.id, termIdx: 3 })
      terminalMap.set(`${b.id}:5`, { partId: part.id, termIdx: 4 })
      terminalMap.set(`${b.id}:6`, { partId: part.id, termIdx: 5 })
    }
    pY += 80
  }

  // Contatores (polos de potência 1-2, 3-4, 5-6)
  for (const k of contactors) {
    const part = addPart(is3ph ? 'contact3' : 'contactNO', pX, pY, k.ref)
    terminalMap.set(`${k.id}:1`, { partId: part.id, termIdx: 0 })
    terminalMap.set(`${k.id}:2`, { partId: part.id, termIdx: 1 })
    terminalMap.set(`${k.id}:1L1`, { partId: part.id, termIdx: 0 })
    terminalMap.set(`${k.id}:2T1`, { partId: part.id, termIdx: 1 })
    if (is3ph) {
      terminalMap.set(`${k.id}:3`, { partId: part.id, termIdx: 2 })
      terminalMap.set(`${k.id}:4`, { partId: part.id, termIdx: 3 })
      terminalMap.set(`${k.id}:3L2`, { partId: part.id, termIdx: 2 })
      terminalMap.set(`${k.id}:4T2`, { partId: part.id, termIdx: 3 })
      terminalMap.set(`${k.id}:5`, { partId: part.id, termIdx: 4 })
      terminalMap.set(`${k.id}:6`, { partId: part.id, termIdx: 5 })
      terminalMap.set(`${k.id}:5L3`, { partId: part.id, termIdx: 4 })
      terminalMap.set(`${k.id}:6T3`, { partId: part.id, termIdx: 5 })
    }
    pY += 80
  }

  // Relé térmico (polos de potência 1-2, 3-4, 5-6)
  for (const f of thermalRelays) {
    const part = addPart('thermal3', pX, pY, f.ref)
    terminalMap.set(`${f.id}:1`, { partId: part.id, termIdx: 0 })
    terminalMap.set(`${f.id}:2`, { partId: part.id, termIdx: 1 })
    terminalMap.set(`${f.id}:1L1`, { partId: part.id, termIdx: 0 })
    terminalMap.set(`${f.id}:2T1`, { partId: part.id, termIdx: 1 })
    terminalMap.set(`${f.id}:3`, { partId: part.id, termIdx: 2 })
    terminalMap.set(`${f.id}:4`, { partId: part.id, termIdx: 3 })
    terminalMap.set(`${f.id}:3L2`, { partId: part.id, termIdx: 2 })
    terminalMap.set(`${f.id}:4T2`, { partId: part.id, termIdx: 3 })
    terminalMap.set(`${f.id}:5`, { partId: part.id, termIdx: 4 })
    terminalMap.set(`${f.id}:6`, { partId: part.id, termIdx: 5 })
    terminalMap.set(`${f.id}:5L3`, { partId: part.id, termIdx: 4 })
    terminalMap.set(`${f.id}:6T3`, { partId: part.id, termIdx: 5 })
    pY += 80
  }

  // Motores
  for (const m of motors) {
    const isMono = m.type === 'motor1ph'
    const part = addPart(isMono ? 'motor1' : 'motor3', pX, pY, m.ref)
    if (isMono) {
      terminalMap.set(`${m.id}:U`, { partId: part.id, termIdx: 0 })
      terminalMap.set(`${m.id}:V`, { partId: part.id, termIdx: 1 })
      terminalMap.set(`${m.id}:PE`, { partId: part.id, termIdx: 2 })
    } else {
      terminalMap.set(`${m.id}:U1`, { partId: part.id, termIdx: 0 })
      terminalMap.set(`${m.id}:V1`, { partId: part.id, termIdx: 1 })
      terminalMap.set(`${m.id}:W1`, { partId: part.id, termIdx: 2 })
      terminalMap.set(`${m.id}:PE`, { partId: part.id, termIdx: 3 })
    }
    pY += 80
  }

  // Condensador
  for (const c of capacitors) {
    const part = addPart('capacitor', pX + 80, pY - 80, c.ref)
    terminalMap.set(`${c.id}:1`, { partId: part.id, termIdx: 0 })
    terminalMap.set(`${c.id}:1B`, { partId: part.id, termIdx: 0 })
    terminalMap.set(`${c.id}:2`, { partId: part.id, termIdx: 1 })
    terminalMap.set(`${c.id}:2B`, { partId: part.id, termIdx: 1 })
    terminalMap.set(`${c.id}:2C`, { partId: part.id, termIdx: 1 })
    terminalMap.set(`${c.id}:2D`, { partId: part.id, termIdx: 1 })
  }

  // 3. Circuito de Comando (X = 380, 460, 540...)
  let cX = 380
  let cY = 40

  // Barra de fase superior
  const ctrlSupply = addPart('supply', cX, cY, '', { lines: ['L1'] })
  cY += 40

  // Paragem de emergência
  const emg = buttons.find((b) => b.type.includes('emergency'))
  if (emg) {
    const part = addPart('emergency', cX, cY, emg.ref)
    terminalMap.set(`${emg.id}:11`, { partId: part.id, termIdx: 0 })
    terminalMap.set(`${emg.id}:12`, { partId: part.id, termIdx: 1 })
    terminalMap.set(`${emg.id}:21`, { partId: part.id, termIdx: 0 })
    terminalMap.set(`${emg.id}:22`, { partId: part.id, termIdx: 1 })
    cY += 70
  }

  // Contacto NF do relé térmico 95-96
  for (const f of thermalRelays) {
    const part = addPart('thermalNC', cX, cY, f.ref)
    terminalMap.set(`${f.id}:95`, { partId: part.id, termIdx: 0 })
    terminalMap.set(`${f.id}:96`, { partId: part.id, termIdx: 1 })
    cY += 70
  }

  // Botões de paragem STOP (NC)
  const stopButtons = buttons.filter((b) => b !== emg && (b.ref.toUpperCase().includes('STOP') || b.ref.toUpperCase().includes('DESL') || b.ref === 'S1'))
  for (const s of stopButtons) {
    const part = addPart('pushNC', cX, cY, s.ref)
    terminalMap.set(`${s.id}:1`, { partId: part.id, termIdx: 0 })
    terminalMap.set(`${s.id}:2`, { partId: part.id, termIdx: 1 })
    terminalMap.set(`${s.id}:11`, { partId: part.id, termIdx: 0 })
    terminalMap.set(`${s.id}:12`, { partId: part.id, termIdx: 1 })
    cY += 70
  }

  // Ramo de arranque: START (NO) em paralelo com selo NO do contactor
  const startButtons = buttons.filter((b) => !stopButtons.includes(b) && b !== emg)
  for (const s of startButtons) {
    const startPart = addPart('pushNO', cX, cY, s.ref)
    terminalMap.set(`${s.id}:3`, { partId: startPart.id, termIdx: 0 })
    terminalMap.set(`${s.id}:4`, { partId: startPart.id, termIdx: 1 })
    terminalMap.set(`${s.id}:13`, { partId: startPart.id, termIdx: 0 })
    terminalMap.set(`${s.id}:14`, { partId: startPart.id, termIdx: 1 })

    // Contacto de selo 13-14 do primeiro contactor
    if (contactors[0]) {
      const sealPart = addPart('contactNO', cX + 60, cY, contactors[0].ref)
      terminalMap.set(`${contactors[0].id}:13`, { partId: sealPart.id, termIdx: 0 })
      terminalMap.set(`${contactors[0].id}:14`, { partId: sealPart.id, termIdx: 1 })
      terminalMap.set(`${contactors[0].id}:13NO`, { partId: sealPart.id, termIdx: 0 })
      terminalMap.set(`${contactors[0].id}:14NO`, { partId: sealPart.id, termIdx: 1 })
    }
    cY += 80
  }

  // Bobinas de contatores (A1-A2)
  for (const k of contactors) {
    const coilPart = addPart('coil', cX, cY, k.ref)
    terminalMap.set(`${k.id}:A1`, { partId: coilPart.id, termIdx: 0 })
    terminalMap.set(`${k.id}:A2`, { partId: coilPart.id, termIdx: 1 })
    cY += 80
  }

  // Interruptores de iluminação (Odace)
  for (let i = 0; i < wallSwitches.length; i++) {
    const sw = wallSwitches[i]
    const kind: CmdKind = sw.type === 'wallSwitchDouble'
      ? 'wallSwitchDouble'
      : sw.type === 'wallSwitchStaircase'
        ? 'wallSwitchStaircase'
        : 'wallSwitchSimple'
    const swPart = addPart(kind, cX + 80 * i, cY, sw.ref)
    terminalMap.set(`${sw.id}:L`, { partId: swPart.id, termIdx: 0 })
    terminalMap.set(`${sw.id}:1`, { partId: swPart.id, termIdx: 1 })
    if (kind !== 'wallSwitchSimple') terminalMap.set(`${sw.id}:2`, { partId: swPart.id, termIdx: 2 })
  }
  if (wallSwitches.length) cY += 80

  // Sinalizadores e lâmpadas de iluminação
  for (let i = 0; i < lamps.length; i++) {
    const lamp = lamps[i]
    const kind: CmdKind = lamp.type === 'lampIncandescentE27'
      ? 'lampIncandescent'
      : lamp.type === 'lampFluorescentE27'
        ? 'lampFluorescent'
        : lamp.type === 'lampLedE27'
          ? 'lampLed'
          : 'lamp'
    const lampPart = addPart(kind, cX + 80 * (i + 1), cY - 80, lamp.ref, kind === 'lamp' ? { color: lamp.state.color as any || 'green' } : {})
    terminalMap.set(`${lamp.id}:X1`, { partId: lampPart.id, termIdx: 0 })
    terminalMap.set(`${lamp.id}:X2`, { partId: lampPart.id, termIdx: 1 })
    terminalMap.set(`${lamp.id}:L`, { partId: lampPart.id, termIdx: 0 })
    terminalMap.set(`${lamp.id}:N`, { partId: lampPart.id, termIdx: 1 })
    terminalMap.set(`${lamp.id}:1`, { partId: lampPart.id, termIdx: 0 })
    terminalMap.set(`${lamp.id}:2`, { partId: lampPart.id, termIdx: 1 })
  }

  // Barra de Neutro inferior
  const neutralSupply = addPart('supply', cX, cY + 20, '', { lines: ['N'] })

  // 4. Mapear e converter cabos físicos para CmdWires
  const connectedPairs = new Set<string>()
  for (const w of wires) {
    if (!w.fromTerminalId || !w.toTerminalId || w.fromPoint || w.toPoint) continue
    // Acha os dois terminais
    let termA = null as { compId: string; label: string } | null
    let termB = null as { compId: string; label: string } | null
    for (const c of electricalComps) {
      for (const t of c.terminals) {
        if (t.id === w.fromTerminalId) termA = { compId: c.id, label: t.label }
        if (t.id === w.toTerminalId) termB = { compId: c.id, label: t.label }
      }
    }
    if (!termA || !termB) continue

    const endA = terminalMap.get(`${termA.compId}:${termA.label}`)
    const endB = terminalMap.get(`${termB.compId}:${termB.label}`)
    if (!endA || !endB || endA.partId === endB.partId) continue

    const key = [endA.partId, endA.termIdx, endB.partId, endB.termIdx].sort().join('-')
    if (connectedPairs.has(key)) continue
    connectedPairs.add(key)

    addWire(endA.partId, endA.termIdx, endB.partId, endB.termIdx)
  }

  return diagram
}
