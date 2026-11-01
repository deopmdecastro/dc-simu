// Símbolos IEC 60617 / ISO 1219 — desenhos DC-Simu e variantes QElectroTech atribuídas em docs/third-party/qelectrotech.
import { fontStack } from '../ui/textStyle'
import type { ReactNode, PointerEvent as ReactPointerEvent } from 'react'
import { CMD_PARTS, partBox, partTerminals, terminalAt, terminalLabel, type CmdKind, type CmdPart } from './model'

const INK = '#0f172a'
export const PHASE_COLORS: Record<string, string> = {
  L1: '#dc2626', L2: '#ca8a04', L3: '#2563eb', N: '#64748b', PE: '#16a34a', PEN: '#0d9488', 'L+': '#dc2626', M: '#64748b',
}

export interface CmdSymbolState {
  closed?: boolean
  energized?: boolean
  lit?: boolean
  motor?: { mode: string; dir: 1 | -1; phaseLoss?: boolean }
  progress?: number
  tripped?: boolean
  idle?: boolean
  /** 0..1 posição do êmbolo (cilindros). */
  actuator?: number
  /** Carga sob tensão (buzzer, solenoide…). */
  load?: boolean
}

const contactBody = (kind: CmdKind, st: CmdSymbolState, active: string) => {
  const nc = kind === 'contactNC' || kind === 'pushNC' || kind === 'timedNC' || kind === 'thermalNC' || kind === 'limitNC' || kind === 'emergency'
  // `st.closed` é o estado de CONDUÇÃO (vem de `isClosed`). Sem estado — miniaturas
  // da paleta — desenha-se o repouso: NF a conduzir, NA aberto.
  const closed = st.closed === undefined ? nc : !!st.closed
  // Contacto fixo com gancho (IEC 60617): a linha desce do borne superior e vira
  // para o lado em y=18. No NF o gancho é o contacto fixo e está sempre desenhado;
  // no NA aparece quando conduz. A lâmina, apoiada no borne inferior (0,42), assenta
  // na ponta do gancho a conduzir e afasta-se dele quando abre — é este desenho que
  // distingue um contacto fechado de um simples troço de cabo.
  const hook = nc ? 1 : closed ? -1 : 0
  const bladeEnd: [number, number] = closed ? [10 * hook, 18] : nc ? [12, 27] : [-11, 20]
  const live = closed && !st.idle
  return (
    <>
      <line x1={0} y1={0} x2={0} y2={18} />
      <line x1={0} y1={42} x2={0} y2={60} />
      {hook !== 0 && <line x1={0} y1={18} x2={10 * hook} y2={18} />}
      <line x1={0} y1={42} x2={bladeEnd[0]} y2={bladeEnd[1]} stroke={live ? active : INK} strokeWidth={live ? 2 : 1.6} />
      {(kind === 'pushNO' || kind === 'pushNC' || kind === 'pushIllum') && <line x1={-8} y1={12} x2={8} y2={12} />}
      {kind === 'emergency' && <circle cx={0} cy={10} r={7} fill="#fee2e2" stroke="#dc2626" />}
      {kind === 'selector' && <path d="M -8 10 L 0 4 L 8 10" fill="none" />}
      {(kind === 'limitNO' || kind === 'limitNC') && <path d="M -10 8 L 0 2 L 10 8" fill="none" />}
      {kind === 'proximity' && <><circle cx={0} cy={10} r={6} fill="none" /><path d="M -4 10 h 8" /></>}
      {(kind === 'timedNO' || kind === 'timedNC') && (
        <>
          <line x1={-18} y1={18} x2={-10} y2={42} /><line x1={-10} y1={18} x2={-18} y2={42} />
          {st.progress !== undefined && st.energized && <rect x={-28} y={48} width={20 * Math.min(1, st.progress)} height={3} fill="#f59e0b" stroke="none" />}
        </>
      )}
      {(kind === 'thermalNC' || kind === 'thermalNO') && st.tripped && <circle cx={8} cy={30} r={3} fill="#dc2626" stroke="none" />}
    </>
  )
}

const threePole = (kind: CmdKind, st: CmdSymbolState, active: string) => {
  const closed = kind === 'thermal3' ? true : !!st.closed
  const contactHook = closed && kind === 'contact3'
  return (
    <>
      {[0, 20, 40].map((x) => (
        <g key={x}>
          <line x1={x} y1={0} x2={x} y2={18} />
          <line x1={x} y1={42} x2={x} y2={60} />
          {/* Contactos de potência do contactor seguem o desenho do NA: gancho à esquerda a conduzir. */}
          {contactHook && <line x1={x} y1={18} x2={x - 10} y2={18} />}
          <line x1={x} y1={42} x2={x + (closed ? (contactHook ? -10 : 0) : 8)} y2={closed ? 18 : 25} stroke={closed && !st.idle ? active : INK} strokeWidth={closed && !st.idle ? 2 : 1.6} />
        </g>
      ))}
      {kind === 'breaker3' || kind === 'breaker1' || kind === 'rcd' ? (
        <rect x={-8} y={14} width={kind === 'rcd' ? 36 : 56} height={32} fill="none" strokeDasharray="3 2" strokeWidth={1} />
      ) : null}
      {(kind === 'disconnector3' || kind === 'mainSwitch') && <path d="M -6 8 L 46 8" strokeWidth={1.2} />}
    </>
  )
}

export function symbolBody(part: Pick<CmdPart, 'kind' | 'lines' | 'color' | 'symbolStyle' | 'groundVariant'>, st: CmdSymbolState = {}): ReactNode {
  if (part.symbolStyle === 'qet') {
    // Geometria da coleção QElectroTech; transformações alinham os bornes em (0,0) e (0,60).
    switch (part.kind) {
      case 'fuse': return <g transform="translate(0 30)"><line x1={0} y1={-30} x2={0} y2={30} /><rect x={-5} y={-15} width={10} height={30} /></g>
      case 'resistor': return <g transform="translate(0 24) rotate(90) scale(1.2)"><line x1={-20} y1={0} x2={-10} y2={0} /><rect x={-10} y={-5} width={30} height={10} /><line x1={20} y1={0} x2={30} y2={0} /></g>
      case 'capacitor': return <g transform="translate(0 20) scale(.55 1.3333333333)"><line x1={-20} y1={10} x2={20} y2={10} /><line x1={-20} y1={5} x2={20} y2={5} /><line x1={0} y1={10} x2={0} y2={30} /><line x1={0} y1={5} x2={0} y2={-15} /></g>
      case 'diode': return <g transform="translate(0 60) scale(1 1.5)"><line x1={0} y1={-40} x2={0} y2={0} /><line x1={-10} y1={-10} x2={10} y2={-10} /><polygon points="-10,-30 10,-30 0,-10" /></g>
    }
  }
  const active = '#16a34a'
  const loadOn = !!(st.load || st.lit || st.energized)
  switch (part.kind) {
    case 'supply': {
      const lines = part.lines?.length ? part.lines : ['L1']
      return <>{lines.map((label, i) => <g key={i}>
        <line x1={i * 20} y1={-7} x2={i * 20} y2={0} stroke={PHASE_COLORS[label] ?? INK} strokeWidth={2.4} />
        <text x={i * 20} y={-11} textAnchor="middle" fontSize={11} fontWeight={700} fill={PHASE_COLORS[label] ?? INK} stroke="none">{label}</text>
      </g>)}</>
    }
    case 'node': return <circle cx={0} cy={0} r={3.4} fill={INK} stroke="none" />
    case 'ground': {
      // Três variantes com o mesmo borne PE: barra (por omissão), hachurada e triângulo.
      const variant = part.groundVariant ?? 'earth'
      if (variant === 'protective') return <>
        <line x1={0} y1={0} x2={0} y2={8} />
        <line x1={-11} y1={8} x2={11} y2={8} strokeWidth={2} />
        <line x1={-2} y1={9} x2={-8} y2={16} />
        <line x1={3} y1={9} x2={-3} y2={16} />
        <line x1={8} y1={9} x2={2} y2={16} />
      </>
      if (variant === 'signal') return <>
        <line x1={0} y1={0} x2={0} y2={8} />
        <path d="M -10 8 L 10 8 L 0 21 Z" fill="#fff" />
      </>
      return <>
        <line x1={0} y1={0} x2={0} y2={8} />
        <line x1={-10} y1={8} x2={10} y2={8} strokeWidth={2} />
        <line x1={-6} y1={12} x2={6} y2={12} strokeWidth={1.6} />
        <line x1={-3} y1={16} x2={3} y2={16} strokeWidth={1.2} />
      </>
    }
    case 'pageRef': {
      const live = !st.idle && st.energized
      const stroke = live ? active : INK
      return <>
        <circle cx={0} cy={0} r={3.2} fill={live ? active : INK} stroke="none" />
        <line x1={0} y1={0} x2={22} y2={0} stroke={stroke} strokeWidth={1.8} />
        <path d="M 18 -5 L 28 0 L 18 5 Z" fill={stroke} stroke="none" />
        <rect x={28} y={-10} width={14} height={20} rx={2} fill={live ? '#dcfce7' : '#fff'} stroke={stroke} strokeWidth={1.5} />
        <path d="M 35 -6 L 35 6" stroke={stroke} strokeWidth={1.2} />
      </>
    }
    case 'pageRefIn': {
      // Espelho: caixa → seta → borne (corrente a chegar de outra página).
      const live = !st.idle && st.energized
      const stroke = live ? active : INK
      return <>
        <rect x={-42} y={-10} width={14} height={20} rx={2} fill={live ? '#dcfce7' : '#fff'} stroke={stroke} strokeWidth={1.5} />
        <path d="M -35 -6 L -35 6" stroke={stroke} strokeWidth={1.2} />
        <path d="M -28 -5 L -18 0 L -28 5 Z" fill={stroke} stroke="none" />
        <line x1={-18} y1={0} x2={0} y2={0} stroke={stroke} strokeWidth={1.8} />
        <circle cx={0} cy={0} r={3.2} fill={live ? active : INK} stroke="none" />
      </>
    }
    case 'fuse': case 'fuse3': return <>{(part.kind === 'fuse' ? [0] : [0, 20, 40]).map((x) => <g key={x}>
      <line x1={x} y1={0} x2={x} y2={60} />
      <rect x={x - 5.5} y={16} width={11} height={28} fill="#fff" />
      <line x1={x} y1={16} x2={x} y2={44} />
    </g>)}</>
    case 'breaker1': {
      const closed = !!st.closed
      return <>
        <line x1={0} y1={0} x2={0} y2={18} /><line x1={0} y1={42} x2={0} y2={60} />
        <line x1={0} y1={18} x2={closed ? 0 : 8} y2={closed ? 30 : 24} stroke={closed && !st.idle ? active : INK} strokeWidth={closed && !st.idle ? 2 : 1.6} />
        <rect x={-10} y={14} width={20} height={32} fill="none" strokeDasharray="3 2" />
      </>
    }
    case 'thermal3': return <>
      {[0, 20, 40].map((x) => <g key={x}>
        <line x1={x} y1={0} x2={x} y2={22} />
        <path d={`M ${x} 22 v 4 h 5 v 8 h -5 v 4`} fill="none" stroke={st.tripped ? '#dc2626' : INK} />
        <line x1={x} y1={38} x2={x} y2={60} />
      </g>)}
      <rect x={-8} y={18} width={56} height={24} fill="none" strokeDasharray="2 2" strokeWidth={1} />
    </>
    case 'rcd': return threePole('rcd', st, active)
    case 'contact3': case 'breaker3': case 'disconnector3': case 'mainSwitch': return threePole(part.kind, st, active)
    case 'changeover': {
      const closed = !!st.closed
      return <>
        <line x1={0} y1={0} x2={0} y2={18} />
        <line x1={0} y1={42} x2={0} y2={60} />
        <line x1={20} y1={42} x2={20} y2={60} />
        <line x1={0} y1={18} x2={closed ? 0 : 20} y2={closed ? 42 : 42} stroke={closed && !st.idle ? active : INK} strokeWidth={1.8} />
      </>
    }
    case 'coil': case 'timerCoil': {
      const fill = st.energized ? '#dcfce7' : '#fff'
      return <>
        <line x1={0} y1={0} x2={0} y2={18} /><line x1={0} y1={42} x2={0} y2={60} />
        <rect x={-13} y={18} width={26} height={24} fill={fill} stroke={st.energized ? active : INK} strokeWidth={st.energized ? 2 : 1.6} />
        {part.kind === 'timerCoil' && <>
          <line x1={-13} y1={18} x2={-4} y2={42} /><line x1={-4} y1={18} x2={-13} y2={42} /><line x1={-4} y1={18} x2={-4} y2={42} />
          {st.progress !== undefined && st.energized && <rect x={-3} y={38} width={15 * Math.min(1, st.progress)} height={3} fill="#f59e0b" stroke="none" />}
        </>}
      </>
    }
    case 'lamp': {
      const glow = st.lit ? (part.color === 'red' ? '#ef4444' : part.color === 'yellow' ? '#eab308' : part.color === 'blue' ? '#3b82f6' : part.color === 'white' ? '#f8fafc' : '#22c55e') : '#fff'
      return <>
        <line x1={0} y1={0} x2={0} y2={18} /><line x1={0} y1={42} x2={0} y2={60} />
        {st.lit && <circle cx={0} cy={30} r={17} fill={glow} opacity={0.25} stroke="none" />}
        <circle cx={0} cy={30} r={12} fill={glow} />
        <path d="M -8.5 21.5 L 8.5 38.5 M 8.5 21.5 L -8.5 38.5" />
      </>
    }
    case 'buzzer': return <>
      <line x1={0} y1={0} x2={0} y2={18} /><line x1={0} y1={42} x2={0} y2={60} />
      <path d="M -10 22 L 6 22 L 12 16 L 12 44 L 6 38 L -10 38 Z" fill={loadOn ? '#fef3c7' : '#fff'} stroke={loadOn ? '#d97706' : INK} />
      {loadOn && <g className="dc-cmd-buzz"><path d="M 14 24 q 6 6 0 12" fill="none" stroke="#d97706" /><path d="M 18 20 q 10 10 0 20" fill="none" stroke="#d97706" opacity={0.6} /></g>}
    </>
    case 'solenoid': return <>
      <line x1={0} y1={0} x2={0} y2={18} /><line x1={0} y1={42} x2={0} y2={60} />
      <rect x={-12} y={18} width={24} height={24} rx={2} fill={loadOn ? '#dbeafe' : '#fff'} stroke={loadOn ? '#2563eb' : INK} strokeWidth={loadOn ? 2 : 1.6} />
      <text x={0} y={33} textAnchor="middle" fontSize={9} fontWeight={700} fill={INK} stroke="none">Y</text>
    </>
    case 'heater': return <>
      <line x1={0} y1={0} x2={0} y2={14} /><line x1={0} y1={46} x2={0} y2={60} />
      <path d="M 0 14 q 8 8 0 16 q -8 8 0 16" fill="none" stroke={loadOn ? '#ea580c' : INK} strokeWidth={2} />
    </>
    case 'motor3': case 'motor6': {
      const six = part.kind === 'motor6'
      const running = st.motor && st.motor.mode !== 'stop'
      const cy = six ? 60 : 50
      const top = (x: number) => cy - Math.sqrt(24 * 24 - (x - 20) ** 2)
      const side = (y: number) => 20 + Math.sqrt(Math.max(0, 24 * 24 - (y - cy) ** 2))
      return <>
        {[0, 20, 40].map((x) => <line key={x} x1={x} y1={0} x2={x} y2={top(x)} />)}
        {six && [40, 60, 80].map((y) => <line key={`r${y}`} x1={side(y)} y1={y} x2={80} y2={y} />)}
        <circle cx={20} cy={cy} r={24} fill={running ? '#ecfdf5' : '#fff'} stroke={running ? active : INK} strokeWidth={running ? 2.2 : 1.6} />
        <text x={20} y={cy - 2} textAnchor="middle" fontSize={15} fontWeight={700} fill={INK} stroke="none">M</text>
        <text x={20} y={cy + 13} textAnchor="middle" fontSize={10} fill={INK} stroke="none">3~</text>
        {running && <g className="dc-cmd-motor-spin" style={{ transformOrigin: `20px ${cy}px`, animationDirection: st.motor!.dir === -1 ? 'reverse' : 'normal' }}>
          <path d={`M 20 ${cy - 28} A 28 28 0 0 1 46 ${cy - 10}`} fill="none" stroke={active} strokeWidth={2} />
          <path d={`M 46 ${cy - 10} l -6 -1 l 3 -5 z`} fill={active} stroke="none" />
        </g>}
        {running && six && <text x={20} y={cy + 40} textAnchor="middle" fontSize={11} fontWeight={750} fill={active} stroke="none">{st.motor!.mode === 'star' ? 'Y' : st.motor!.mode === 'delta' ? 'Δ' : ''}</text>}
      </>
    }
    case 'diode': return <>
      <line x1={0} y1={0} x2={0} y2={22} /><line x1={0} y1={38} x2={0} y2={60} />
      <path d="M -10 22 L 10 22 L 0 38 Z" fill="#fff" />
      <line x1={-10} y1={38} x2={10} y2={38} strokeWidth={2} />
    </>
    case 'resistor': {
      // IEC 60617: retângulo. O zigzag ANSI continua disponível como variante explícita.
      if (part.symbolStyle === 'ansi') return <>
        <line x1={0} y1={0} x2={0} y2={12} /><line x1={0} y1={48} x2={0} y2={60} />
        <path d="M 0 12 l 6 6 l -12 6 l 12 6 l -12 6 l 12 6 l -6 6" fill="none" />
      </>
      return <>
        <line x1={0} y1={0} x2={0} y2={12} /><line x1={0} y1={48} x2={0} y2={60} />
        <rect x={-7} y={12} width={14} height={36} fill="#fff" />
      </>
    }
    case 'capacitor': return <>
      <line x1={0} y1={0} x2={0} y2={24} /><line x1={0} y1={36} x2={0} y2={60} />
      <line x1={-12} y1={24} x2={12} y2={24} strokeWidth={2} />
      <line x1={-12} y1={36} x2={12} y2={36} strokeWidth={2} />
    </>
    case 'transformer': return <>
      <line x1={0} y1={0} x2={0} y2={18} /><line x1={0} y1={42} x2={0} y2={60} />
      <line x1={30} y1={0} x2={30} y2={18} /><line x1={30} y1={42} x2={30} y2={60} />
      <path d="M -8 20 a 8 12 0 0 1 0 20" fill="none" /><path d="M 8 20 a 8 12 0 0 0 0 20" fill="none" />
      <path d="M 22 20 a 8 12 0 0 1 0 20" fill="none" /><path d="M 38 20 a 8 12 0 0 0 0 20" fill="none" />
      {/* Núcleo: distingue o transformador de dois indutores acoplados. */}
      <line x1={13} y1={19} x2={13} y2={41} /><line x1={17} y1={19} x2={17} y2={41} />
    </>
    case 'rectifier': return <>
      <rect x={0} y={8} width={40} height={44} fill="#fff" />
      <line x1={0} y1={0} x2={0} y2={8} /><line x1={40} y1={0} x2={40} y2={8} />
      <line x1={0} y1={52} x2={0} y2={60} /><line x1={40} y1={52} x2={40} y2={60} />
      <path d="M 8 18 L 20 30 L 8 42 Z" fill="none" /><line x1={20} y1={18} x2={20} y2={42} />
      <path d="M 32 18 L 20 30 L 32 42 Z" fill="none" /><line x1={20} y1={18} x2={20} y2={42} opacity={0} />
    </>
    case 'plcIn': return <>
      <line x1={0} y1={0} x2={0} y2={18} /><line x1={0} y1={42} x2={0} y2={60} />
      <rect x={-14} y={18} width={28} height={24} fill="#eff6ff" stroke="#2563eb" />
      <text x={0} y={33} textAnchor="middle" fontSize={10} fontWeight={700} fill="#1d4ed8" stroke="none">I</text>
    </>
    case 'plcOut': {
      const closed = !!st.closed
      return <>
        <line x1={0} y1={0} x2={0} y2={18} /><line x1={0} y1={42} x2={0} y2={60} />
        <rect x={-14} y={18} width={28} height={24} fill={closed ? '#dcfce7' : '#f0fdf4'} stroke="#16a34a" />
        <text x={0} y={28} textAnchor="middle" fontSize={9} fontWeight={700} fill="#15803d" stroke="none">Q</text>
        <line x1={-6} y1={34} x2={closed ? 0 : 6} y2={closed ? 38 : 36} stroke={closed ? active : INK} />
      </>
    }
    case 'ammeter': case 'voltmeter': {
      // Medida (IEC 60617): círculo com a grandeza, atravessado pelo condutor.
      const letter = part.kind === 'ammeter' ? 'A' : 'V'
      return <>
        <line x1={0} y1={0} x2={0} y2={18} /><line x1={0} y1={42} x2={0} y2={60} />
        <circle cx={0} cy={30} r={12} fill="#fff" />
        <text x={0} y={35} textAnchor="middle" fontSize={14} fontWeight={700} fill={INK} stroke="none">{letter}</text>
      </>
    }
    case 'currentTransformer': return <>
      {/* TA: o cabo principal atravessa o núcleo (duas barras). */}
      <line x1={0} y1={0} x2={0} y2={60} />
      <rect x={-15} y={21} width={30} height={6} fill={INK} stroke="none" />
      <rect x={-15} y={33} width={30} height={6} fill={INK} stroke="none" />
      <text x={24} y={34} textAnchor="middle" fontSize={9} fill={INK} stroke="none">TA</text>
    </>
    case 'overcurrentRelay': case 'undervoltageRelay': case 'overvoltageRelay': case 'shortCircuitRelay': {
      // Relés de medida: a caixa escreve a grandeza e o sentido (I>, U<, U>, I>>).
      const mark = part.kind === 'overcurrentRelay' ? 'I>' : part.kind === 'undervoltageRelay' ? 'U<' : part.kind === 'overvoltageRelay' ? 'U>' : 'I>>'
      return <>
        <line x1={0} y1={0} x2={0} y2={18} /><line x1={0} y1={42} x2={0} y2={60} />
        <rect x={-13} y={18} width={26} height={24} fill={st.energized ? '#dcfce7' : '#fff'} stroke={st.energized ? active : INK} strokeWidth={st.energized ? 2 : 1.6} />
        <text x={0} y={33} textAnchor="middle" fontSize={10} fontWeight={700} fill={INK} stroke="none">{mark}</text>
      </>
    }
    case 'counter': return <>
      {/* Contador de impulsos: caixa com os dígitos e o traço de pré-seleção. */}
      <line x1={0} y1={0} x2={0} y2={18} /><line x1={0} y1={42} x2={0} y2={60} />
      <rect x={-15} y={18} width={30} height={24} fill={st.load ? '#dcfce7' : '#fff'} stroke={st.load ? active : INK} strokeWidth={st.load ? 2 : 1.6} />
      <text x={0} y={31} textAnchor="middle" fontSize={11} fontWeight={700} fill={INK} stroke="none">0.0</text>
      <line x1={-7} y1={37} x2={7} y2={37} strokeWidth={1} />
    </>;
    case 'slowRelay': return <>
      {/* Bobina de operação lenta: semicírculo do atraso em série com o enrolamento. */}
      <line x1={0} y1={0} x2={0} y2={12} />
      <path d="M 0 12 a 6 6 0 0 1 0 12" fill="none" />
      <line x1={0} y1={24} x2={0} y2={30} />
      <rect x={-13} y={30} width={26} height={18} fill={st.energized ? '#dcfce7' : '#fff'} stroke={st.energized ? active : INK} strokeWidth={st.energized ? 2 : 1.6} />
      <line x1={0} y1={48} x2={0} y2={60} />
    </>;
    case 'threePhaseTransformer': return <>
      {/* Transformador trifásico: um enrolamento por fase e o núcleo comum entre fases. */}
      {[0, 20, 40].map((x) => <g key={x}>
        <line x1={x} y1={0} x2={x} y2={20} />
        <path d={`M ${x} 20 a 7 10 0 1 1 0 20`} fill="none" />
        <line x1={x} y1={40} x2={x} y2={60} />
      </g>)}
      <line x1={10} y1={16} x2={10} y2={44} /><line x1={13} y1={16} x2={13} y2={44} />
      <line x1={30} y1={16} x2={30} y2={44} /><line x1={33} y1={16} x2={33} y2={44} />
    </>;
    case 'sensor3wNO': case 'sensor3wNC': {
      // Sensor de 3 fios: contacto (NA/NF) + cabeça «Fe» + fio azul de 0 V.
      const nc = part.kind === 'sensor3wNC'
      return <>
        {contactBody(nc ? 'contactNC' : 'contactNO', st, active)}
        <rect x={10} y={20} width={22} height={20} fill="#fff" />
        <text x={21} y={34} textAnchor="middle" fontSize={8} fontWeight={700} fill={INK} stroke="none">Fe</text>
        <path d="M 21 8 L 26 13 L 21 18 L 16 13 Z" fill="#fff" />
      </>
    }
    case 'latchingRelay': return <>
      {/* Retenção: metade do enrolamento escura + barra de remanência. */}
      <line x1={0} y1={0} x2={0} y2={18} /><line x1={0} y1={42} x2={0} y2={60} />
      <rect x={-13} y={18} width={26} height={24} fill={st.energized ? '#dcfce7' : '#fff'} stroke={INK} />
      <rect x={-13} y={18} width={8} height={24} fill={INK} stroke="none" />
      <line x1={-5} y1={42} x2={11} y2={18} />
    </>
    case 'timerOffCoil': return <>
      {/* TOF: bobina com o bloco do atraso à desligar. */}
      <line x1={0} y1={0} x2={0} y2={18} /><line x1={0} y1={42} x2={0} y2={60} />
      <rect x={-13} y={18} width={26} height={24} fill={st.energized ? '#dcfce7' : '#fff'} stroke={st.energized ? active : INK} strokeWidth={st.energized ? 2 : 1.6} />
      <rect x={-13} y={34} width={9} height={8} fill={INK} stroke="none" />
    </>
    case 'fuseDisconnector': return <>
      {/* Seccionadora fusível: cartucho + lâmina de corte. */}
      <line x1={0} y1={0} x2={0} y2={16} />
      <rect x={-5} y={16} width={10} height={28} fill="#fff" />
      <line x1={0} y1={16} x2={0} y2={44} />
      <line x1={0} y1={44} x2={0} y2={60} />
      <line x1={-10} y1={52} x2={10} y2={26} strokeWidth={2} />
    </>
    case 'temperatureController': return <>
      <line x1={0} y1={0} x2={0} y2={18} /><line x1={0} y1={42} x2={0} y2={60} />
      <rect x={-15} y={18} width={30} height={24} fill="#fff" />
      <text x={0} y={33} textAnchor="middle" fontSize={10} fontWeight={700} fill={INK} stroke="none">CT</text>
    </>
    case 'pressureSwitch': return <>
      {contactBody('limitNO', st, active)}
      <circle cx={11} cy={10} r={6.5} fill="#fff" />
      <text x={11} y={13} textAnchor="middle" fontSize={8} fontWeight={700} fill={INK} stroke="none">P</text>
    </>
    case 'siren': {
      // Sirene: trombeta com duas ondas de alarme.
      return <>
        <line x1={0} y1={0} x2={0} y2={18} /><line x1={0} y1={42} x2={0} y2={60} />
        <path d="M -12 24 L 4 24 L 12 15 L 12 45 L 4 36 L -12 36 Z" fill={loadOn ? '#fef3c7' : '#fff'} stroke={loadOn ? '#d97706' : INK} />
        {loadOn && <g className="dc-cmd-buzz">
          <path d="M 14 22 q 7 8 0 16" fill="none" stroke="#d97706" />
          <path d="M 19 17 q 12 13 0 26" fill="none" stroke="#d97706" opacity={0.6} />
        </g>}
      </>
    }
    case 'valve22': {
      const on = !!st.closed
      return <>
        <rect x={4} y={12} width={32} height={36} fill={on ? '#dcfce7' : '#fff'} stroke={INK} />
        <line x1={0} y1={30} x2={4} y2={30} /><line x1={36} y1={30} x2={40} y2={30} />
        <text x={20} y={25} textAnchor="middle" fontSize={8} fill={INK} stroke="none">2/2</text>
        <line x1={12} y1={32} x2={28} y2={32} stroke={on ? active : '#cbd5e1'} strokeWidth={2} />
        <circle cx={20} cy={40} r={2.6} fill={on ? active : '#cbd5e1'} stroke="none" />
      </>
    }
    case 'valve42': return <>
      <rect x={8} y={8} width={36} height={44} fill={st.closed ? '#dcfce7' : '#fff'} stroke={INK} />
      <line x1={0} y1={30} x2={8} y2={30} />
      <line x1={44} y1={0} x2={44} y2={8} /><line x1={44} y1={52} x2={44} y2={60} />
      <line x1={44} y1={0} x2={50} y2={0} /><line x1={44} y1={60} x2={50} y2={60} />
      <line x1={0} y1={60} x2={8} y2={52} />
      <text x={26} y={34} textAnchor="middle" fontSize={8} fill={INK} stroke="none">4/2</text>
      <circle cx={26} cy={22} r={3} fill={st.closed ? active : '#cbd5e1'} stroke="none" />
    </>;
    case 'valve53c': case 'valve53p': case 'valve53e': {
      // Válvula 5/3: o centro diz o que acontece em repouso (fechado, pressurizado, escape).
      const centre = part.kind === 'valve53c' ? 'C' : part.kind === 'valve53p' ? 'P' : 'E'
      return <>
        <rect x={8} y={8} width={36} height={44} fill={st.closed ? '#dcfce7' : '#fff'} stroke={INK} />
        <line x1={0} y1={30} x2={8} y2={30} />
        <line x1={44} y1={0} x2={44} y2={8} /><line x1={44} y1={52} x2={44} y2={60} />
        <line x1={44} y1={0} x2={50} y2={0} /><line x1={44} y1={60} x2={50} y2={60} />
        <line x1={0} y1={0} x2={8} y2={8} /><line x1={0} y1={60} x2={8} y2={52} />
        <text x={26} y={28} textAnchor="middle" fontSize={8} fill={INK} stroke="none">5/3</text>
        <text x={26} y={42} textAnchor="middle" fontSize={8} fontWeight={700} fill={INK} stroke="none">{centre}</text>
      </>
    }
    case 'airFilter': case 'airLubricator': return <>
      {/* Filtro/lubrificador: losango ISO 1219 com a marca de água (tracejado) ou óleo (cheio). */}
      <line x1={0} y1={0} x2={0} y2={14} /><line x1={0} y1={46} x2={0} y2={60} />
      <path d="M 0 14 L 14 30 L 0 46 L -14 30 Z" fill="#fff" />
      {part.kind === 'airFilter'
        ? <><line x1={-8} y1={30} x2={8} y2={30} strokeDasharray="3 2" /><path d="M 0 34 l 3 5 a 3 3 0 1 1 -6 0 z" fill={INK} stroke="none" /></>
        : <><path d="M 0 22 l 3.5 5.5 a 3.5 3.5 0 1 1 -7 0 z" fill={INK} stroke="none" /><line x1={-8} y1={36} x2={8} y2={36} /></>}
    </>;
    case 'airRegulator': return <>
      {/* Regulador: losango com a seta de redução e a mola de ajuste. */}
      <line x1={0} y1={0} x2={0} y2={14} /><line x1={0} y1={46} x2={0} y2={60} />
      <path d="M 0 14 L 14 30 L 0 46 L -14 30 Z" fill="#fff" />
      <line x1={-7} y1={35} x2={5} y2={26} />
      <path d="M 8 24 l -6 1 l 2 -5 z" fill={INK} stroke="none" />
      <line x1={0} y1={14} x2={0} y2={20} strokeDasharray="2 2" />
    </>;
    case 'manometer': return <>
      <line x1={0} y1={60} x2={0} y2={44} />
      <circle cx={0} cy={28} r={14} fill="#fff" />
      <line x1={0} y1={28} x2={7} y2={19} strokeWidth={2} />
      <line x1={-9} y1={34} x2={-5} y2={32} strokeWidth={1} /><line x1={9} y1={34} x2={5} y2={32} strokeWidth={1} />
      <line x1={0} y1={16} x2={0} y2={20} strokeWidth={1} />
    </>;
    case 'silencer': return <>
      <line x1={0} y1={0} x2={0} y2={6} />
      <path d="M -9 6 L 9 6 L 0 20 Z" fill="#fff" />
      <line x1={-5} y1={13} x2={5} y2={13} strokeWidth={1} /><line x1={-3} y1={17} x2={3} y2={17} strokeWidth={1} />
    </>;
    case 'reservoir': return <>
      <line x1={0} y1={0} x2={0} y2={10} />
      <rect x={-16} y={10} width={32} height={30} rx={6} fill="#fff" />
      <line x1={-10} y1={34} x2={10} y2={34} strokeWidth={1} />
      <text x={0} y={28} textAnchor="middle" fontSize={9} fill={INK} stroke="none">P</text>
    </>;
    case 'airSource': return <>
      <circle cx={0} cy={-8} r={10} fill="#e0f2fe" stroke="#0284c7" />
      <text x={0} y={-5} textAnchor="middle" fontSize={9} fontWeight={700} fill="#0369a1" stroke="none">P</text>
      <line x1={0} y1={2} x2={0} y2={8} />
    </>
    case 'exhaust': return <>
      <line x1={0} y1={0} x2={0} y2={6} />
      <path d="M -8 6 L 8 6 L 0 16 Z" fill="#fff" />
    </>
    case 'valve32': {
      const on = !!st.closed
      return <>
        <rect x={4} y={8} width={32} height={44} fill={on ? '#dcfce7' : '#fff'} stroke={INK} />
        <line x1={0} y1={30} x2={4} y2={30} />
        <line x1={36} y1={0} x2={36} y2={8} /><line x1={36} y1={52} x2={36} y2={60} />
        <text x={20} y={34} textAnchor="middle" fontSize={9} fill={INK} stroke="none">{on ? '1→2' : '1→3'}</text>
      </>
    }
    case 'valve52': {
      const on = !!st.closed
      return <>
        <rect x={8} y={8} width={36} height={44} fill={on ? '#dcfce7' : '#fff'} stroke={INK} />
        <line x1={0} y1={30} x2={8} y2={30} />
        <line x1={44} y1={0} x2={44} y2={8} /><line x1={44} y1={52} x2={44} y2={60} />
        <line x1={44} y1={0} x2={50} y2={0} /><line x1={44} y1={60} x2={50} y2={60} />
        <line x1={0} y1={0} x2={8} y2={8} /><line x1={0} y1={60} x2={8} y2={52} />
        <text x={26} y={34} textAnchor="middle" fontSize={8} fill={INK} stroke="none">{on ? '5/2' : '5/2'}</text>
        <circle cx={26} cy={22} r={3} fill={on ? active : '#cbd5e1'} stroke="none" />
      </>
    }
    case 'cylSE': case 'cylDE': case 'hydCyl': {
      const pos = st.actuator ?? 0
      const double = part.kind !== 'cylSE'
      const w = double ? 70 : 60
      return <>
        <rect x={8} y={4} width={w} height={double ? 44 : 32} fill="#f8fafc" stroke={INK} />
        <rect x={8 + pos * (w - 14)} y={8} width={12} height={double ? 36 : 24} fill={pos > 0.05 ? '#38bdf8' : '#94a3b8'} stroke={INK} />
        <line x1={8 + pos * (w - 14) + 12} y1={double ? 26 : 20} x2={8 + w + 10} y2={double ? 26 : 20} strokeWidth={2} />
        <line x1={0} y1={double ? 10 : 20} x2={8} y2={double ? 10 : 20} />
        {double && <line x1={0} y1={40} x2={8} y2={40} />}
      </>
    }
    case 'throttle': return <>
      <line x1={0} y1={0} x2={0} y2={12} /><line x1={0} y1={28} x2={0} y2={40} />
      <path d="M -8 12 L 8 20 L -8 28 Z" fill="#fff" />
    </>
    case 'checkValve': return <>
      <line x1={0} y1={0} x2={0} y2={14} /><line x1={0} y1={26} x2={0} y2={40} />
      <path d="M -8 14 L 8 20 L -8 26 Z" fill="#fff" />
      <line x1={-8} y1={26} x2={8} y2={26} />
    </>
    case 'hydPump': return <>
      <circle cx={0} cy={20} r={16} fill="#fef3c7" stroke="#b45309" />
      <path d="M -6 20 L 6 14 L 6 26 Z" fill="#b45309" stroke="none" />
      <line x1={0} y1={0} x2={0} y2={4} /><line x1={0} y1={36} x2={0} y2={40} />
    </>
    case 'hydTank': return <>
      <line x1={-12} y1={0} x2={12} y2={0} strokeWidth={2} />
      <line x1={-8} y1={6} x2={8} y2={6} /><line x1={-4} y1={12} x2={4} y2={12} />
    </>
    case 'pushIllum':
      return <>
        {contactBody('pushNO', st, active)}
        <circle cx={20} cy={30} r={6} fill={st.load ? '#fde68a' : '#fff'} stroke={INK} />
      </>
    default: {
      const kind = part.kind
      if (CMD_PARTS[kind]?.family === 'contact' || CMD_PARTS[kind]?.family === 'button' || CMD_PARTS[kind]?.family === 'sensor') return contactBody(kind, st, active)
      return null
    }
  }
}

/** Posição da referência, em relação à origem do símbolo; conectores de página conservam a posição original. */
export function cmdTagPosition(part: CmdPart) {
  const box = partBox(part)
  const link = part.kind === 'pageRef' || part.kind === 'pageRefIn'
  return {
    x: part.tagStyle?.x ?? (link ? box.x - part.x + box.w / 2 : box.x - part.x - 8),
    y: part.tagStyle?.y ?? (link ? box.y - part.y - 5 : box.y - part.y + 12),
    anchor: link ? 'middle' as const : 'end' as const,
  }
}


/** Predefinições de posição da referência relativamente à caixa do símbolo (coords locais). */
export function cmdTagPreset(part: CmdPart, side: "top" | "bottom" | "left" | "right"): { x: number; y: number; rotation?: number } {
  const box = partBox(part)
  const local = { x: box.x - part.x, y: box.y - part.y, w: box.w, h: box.h }
  const size = part.tagStyle?.fontSize ?? 12
  switch (side) {
    case "top": return { x: local.x + local.w / 2, y: local.y - 4, rotation: 0 }
    case "bottom": return { x: local.x + local.w / 2, y: local.y + local.h + size * 0.85, rotation: 0 }
    case "left": return { x: local.x - 6, y: local.y + local.h / 2 + size * 0.35, rotation: -90 }
    case "right": return { x: local.x + local.w + 6, y: local.y + local.h / 2 + size * 0.35, rotation: 90 }
  }
}

/** Limites aproximados da referência para ajustar a vista, incluindo rotação e tamanho. */
export function cmdTagBounds(part: CmdPart) {
  if (!part.tag || part.kind === 'node' || part.kind === 'supply') return null
  const pos = cmdTagPosition(part)
  const size = part.tagStyle?.fontSize ?? (pos.anchor === 'middle' ? 10.5 : 12)
  const width = Math.max(size, part.tag.length * size * 0.8)
  const left = pos.anchor === 'middle' ? -width / 2 : -width
  const right = pos.anchor === 'middle' ? width / 2 : 0
  const angle = (part.tagStyle?.rotation ?? 0) * Math.PI / 180
  const cos = Math.cos(angle), sin = Math.sin(angle)
  const points = [[left, -size], [right, -size], [left, size * 0.3], [right, size * 0.3]].map(([x, y]) => ({
    x: part.x + pos.x + x * cos - y * sin, y: part.y + pos.y + x * sin + y * cos,
  }))
  const minX = Math.min(...points.map(p => p.x)), minY = Math.min(...points.map(p => p.y))
  return { x: minX, y: minY, w: Math.max(...points.map(p => p.x)) - minX, h: Math.max(...points.map(p => p.y)) - minY }
}

/** Símbolo completo: geometria rodada, referência e marcação dos bornes. */
export function CmdSymbol({ part, state, selected, showTerminals = true, onTagPointerDown }: { part: CmdPart; state?: CmdSymbolState; selected?: boolean; showTerminals?: boolean; onTagPointerDown?: (event: ReactPointerEvent<SVGTextElement>) => void }) {
  const box = partBox(part)
  const st = state ?? {}
  return (
    <g className={`dc-cmd-symbol${selected ? ' is-selected' : ''}${st.idle ? '' : ' is-live'}`} data-cmd-part={part.id} data-cmd-kind={part.kind} transform={`translate(${part.x} ${part.y})`}>
      {/* Halo de hover/seleção — mesmo padrão do GRAFCET (sem tooltip nativo preto). */}
      <rect
        className="dc-cmd-hover-halo"
        x={box.x - part.x - 6}
        y={box.y - part.y - 6}
        width={box.w + 12}
        height={box.h + 12}
        rx={4}
        ry={4}
      />
      {/* Seleção como no GRAFCET: fundo azul leve + pegas nos cantos (sem caixa preta). */}
      {selected && (() => {
        const x0 = box.x - part.x - 6, y0 = box.y - part.y - 6, x1 = x0 + box.w + 12, y1 = y0 + box.h + 12
        return <g className="dc-cmd-symbol-sel" pointerEvents="none">
          <rect className="dc-cmd-symbol-sel-fill" x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={4} />
          {[[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([cx, cy], i) => <rect key={i} className="dc-cmd-symbol-sel-handle" x={cx - 3} y={cy - 3} width={6} height={6} rx={1.2} />)}
        </g>
      })()}
      {/* Área de clique invisível: o símbolo inteiro responde (não só os traços) — premir botões, selecionar, arrastar. */}
      <rect className="dc-cmd-symbol-hit" x={box.x - part.x - 4} y={box.y - part.y - 4} width={box.w + 8} height={box.h + 8} fill="transparent" stroke="none" />
      <g transform={`rotate(${part.rot})`} stroke={INK} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round">
        {symbolBody(part, st)}
      </g>
      {part.tag && part.kind !== 'node' && part.kind !== 'supply' && (() => {
        const link = part.kind === 'pageRef' || part.kind === 'pageRefIn'
        const { x, y, anchor } = cmdTagPosition(part)
        const size = part.tagStyle?.fontSize ?? (link ? 10.5 : 12)
        const rotation = part.tagStyle?.rotation ?? 0
        return <text className={`dc-cmd-tag${link ? ' is-link' : ''}${onTagPointerDown ? ' is-draggable' : ''}`} data-cmd-tag={part.id}
          x={x} y={y} textAnchor={anchor} transform={`rotate(${rotation} ${x} ${y})`}
          style={{ fontSize: size, fill: part.tagStyle?.color ?? INK, ...(part.tagStyle?.font ? { fontFamily: fontStack(part.tagStyle.font) } : null), ...(part.tagStyle?.bold === false ? { fontWeight: 400 } : null), ...(part.tagStyle?.italic ? { fontStyle: 'italic' } : null), ...(part.tagStyle?.underline ? { textDecoration: 'underline' } : null) }} stroke="none" onPointerDown={onTagPointerDown}>{part.tag}</text>
      })()}
      {showTerminals && partTerminals(part).map((t, i) => {
        const at = terminalAt({ ...part, x: 0, y: 0 }, i)
        const label = terminalLabel(part, i)
        if (!label) return null
        return <text key={i} className="dc-cmd-term-label" x={at.x + 4} y={at.y - 4} fontSize={9} fill="#64748b" stroke="none">{label}</text>
      })}
    </g>
  )
}
