// Símbolos IEC 60617 desenhados de raiz (sem cópia de bibliotecas de terceiros).
// Cada símbolo desenha-se na vertical, com o 1.º borne em (0, 0); a rotação e os
// textos (referência e marcação dos bornes) ficam a cargo de `CmdSymbol`.
import type { ReactNode } from 'react'
import { CMD_PARTS, partBox, partTerminals, terminalAt, terminalLabel, type CmdKind, type CmdPart } from './model'
import type { CmdMotorState } from './engine'

export const PHASE_COLORS: Record<string, string> = {
  L1: '#8b5a2b', L2: '#111827', L3: '#6b7280', N: '#2563eb', PE: '#16a34a', 'L+': '#dc2626', M: '#2563eb',
}
const LAMP_COLORS = { green: '#22c55e', red: '#ef4444', yellow: '#facc15', white: '#e2e8f0', blue: '#3b82f6' }
const INK = '#1e293b'

export interface CmdSymbolState {
  closed?: boolean
  /** Fora da simulação: desenho em repouso, sem cores de estado. */
  idle?: boolean
  energized?: boolean
  lit?: boolean
  motor?: CmdMotorState
  /** Temporizador: fração do atraso já decorrida (0..1). */
  progress?: number
  tripped?: boolean
}

/** Contacto (lâmina articulada em baixo); `nc`: normalmente fechado. */
function blade(x: number, closed: boolean, nc: boolean, stroke: string) {
  const end = nc ? (closed ? { x: x + 10, y: 20 } : { x: x + 17, y: 30 }) : closed ? { x: x + 1, y: 19 } : { x: x - 11, y: 21 }
  return <>
    <line x1={x} y1={0} x2={x} y2={20} />
    {nc && <line x1={x} y1={20} x2={x + 11} y2={20} />}
    <line x1={x} y1={40} x2={x} y2={60} />
    <line x1={x} y1={40} x2={end.x} y2={end.y} stroke={stroke} strokeWidth={2} />
  </>
}
/** Ponto a meio da lâmina, onde liga o comando mecânico (traço interrompido). */
const bladeMid = (x: number, closed: boolean, nc: boolean) => nc ? (closed ? { x: x + 5, y: 30 } : { x: x + 8, y: 35 }) : closed ? { x: x, y: 30 } : { x: x - 5, y: 31 }

function contactBody(kind: CmdKind, st: CmdSymbolState, active: string): ReactNode {
  const closed = !!st.closed
  const nc = kind === 'contactNC' || kind === 'timedNC' || kind === 'thermalNC' || kind === 'pushNC' || kind === 'emergency'
  const stroke = closed && !st.idle ? active : INK
  const mid = bladeMid(0, closed, nc)
  const link = (toX: number) => <line x1={mid.x} y1={mid.y} x2={toX} y2={mid.y} strokeDasharray="3 2.5" strokeWidth={1.2} />
  return <>
    {blade(0, closed, nc, stroke)}
    {(kind === 'timedNO' || kind === 'timedNC') && <>
      {link(-16)}
      <path d={`M -16 ${mid.y - 6} A 6 6 0 0 0 -16 ${mid.y + 6}`} fill="none" />
      {st.progress !== undefined && st.progress > 0 && st.progress < 1 && <circle cx={-24} cy={mid.y} r={4} fill="none" stroke="#f59e0b" strokeWidth={2} strokeDasharray={`${(st.progress * 25.1).toFixed(1)} 26`} transform={`rotate(-90 -24 ${mid.y})`} />}
    </>}
    {(kind === 'thermalNC' || kind === 'thermalNO') && <>
      {link(-14)}
      <path d={`M -26 ${mid.y + 3} h 4 v -6 h 4 v 6 h 4`} fill="none" stroke={st.tripped ? '#dc2626' : INK} />
    </>}
    {(kind === 'pushNO' || kind === 'pushNC') && <>{link(-13)}<path d={`M -13 ${mid.y - 6} h -4 v 12 h 4`} fill="none" /></>}
    {kind === 'limitNO' && <>{link(-13)}<path d={`M -13 ${mid.y} l -6 -5 v 10 z`} fill="none" /></>}
    {kind === 'emergency' && <>{link(-14)}<path d={`M -14 ${mid.y - 7} A 7 7 0 0 0 -14 ${mid.y + 7} Z`} fill={closed ? '#fff' : '#fecaca'} stroke="#dc2626" /></>}
    {kind === 'selector' && <>{link(-13)}<path d={`M -13 ${mid.y - 6} h -4 v 12 h 4 M -20 ${mid.y - 3} l 3 3 l -3 3`} fill="none" /></>}
  </>
}

/** Três polos ligados mecanicamente (contactor, disjuntor, seccionador). */
function threePole(kind: CmdKind, st: CmdSymbolState, active: string): ReactNode {
  const closed = !!st.closed
  const stroke = closed && !st.idle ? active : INK
  const mids = [0, 20, 40].map((x) => bladeMid(x, closed, false))
  return <>
    {[0, 20, 40].map((x) => <g key={x}>
      {blade(x, closed, false, stroke)}
      {kind === 'contact3' && <path d={`M ${x - 3.5} 20 A 3.5 3.5 0 0 0 ${x + 3.5} 20`} fill="none" />}
      {kind === 'breaker3' && <path d={`M ${x - 3} 17 l 6 6 M ${x + 3} 17 l -6 6`} />}
      {kind === 'disconnector3' && <line x1={x - 4} y1={20} x2={x + 4} y2={20} />}
    </g>)}
    <line x1={mids[0].x} y1={mids[0].y} x2={mids[2].x + 8} y2={mids[2].y} strokeDasharray="3 2.5" strokeWidth={1.2} />
    {kind === 'breaker3' && <path d={`M ${mids[2].x + 8} ${mids[2].y - 5} h 6 v 10 h -6`} fill="none" stroke={st.tripped ? '#dc2626' : INK} />}
  </>
}

/** Desenho do símbolo em coordenadas locais (rotação 0). */
export function symbolBody(part: Pick<CmdPart, 'kind' | 'lines' | 'color'>, st: CmdSymbolState = {}): ReactNode {
  const active = '#16a34a'
  switch (part.kind) {
    case 'supply': {
      const lines = part.lines?.length ? part.lines : ['L1']
      return <>{lines.map((label, i) => <g key={i}>
        <line x1={i * 20} y1={-7} x2={i * 20} y2={0} stroke={PHASE_COLORS[label] ?? INK} strokeWidth={2.4} />
        <text x={i * 20} y={-11} textAnchor="middle" fontSize={11} fontWeight={700} fill={PHASE_COLORS[label] ?? INK} stroke="none">{label}</text>
      </g>)}</>
    }
    case 'node': return <circle cx={0} cy={0} r={3.4} fill={INK} stroke="none" />
    case 'pageRef': {
      // Conector entre folhas (IEC-style): seta + barra; a etiqueta (tag) é a rede.
      const live = !st.idle && st.energized
      const stroke = live ? '#16a34a' : INK
      return <>
        <circle cx={0} cy={0} r={3.2} fill={live ? '#16a34a' : INK} stroke="none" />
        <line x1={0} y1={0} x2={22} y2={0} stroke={stroke} strokeWidth={1.8} />
        <path d="M 18 -5 L 28 0 L 18 5 Z" fill={stroke} stroke="none" />
        <rect x={28} y={-10} width={14} height={20} rx={2} fill={live ? '#dcfce7' : '#fff'} stroke={stroke} strokeWidth={1.5} />
        <path d="M 35 -6 L 35 6" stroke={stroke} strokeWidth={1.2} />
      </>
    }
    case 'fuse': case 'fuse3': return <>{(part.kind === 'fuse' ? [0] : [0, 20, 40]).map((x) => <g key={x}>
      <line x1={x} y1={0} x2={x} y2={60} />
      <rect x={x - 5.5} y={16} width={11} height={28} fill="#fff" />
      <line x1={x} y1={16} x2={x} y2={44} />
    </g>)}</>
    case 'thermal3': return <>
      {[0, 20, 40].map((x) => <g key={x}>
        <line x1={x} y1={0} x2={x} y2={22} />
        <path d={`M ${x} 22 v 4 h 5 v 8 h -5 v 4`} fill="none" stroke={st.tripped ? '#dc2626' : INK} />
        <line x1={x} y1={38} x2={x} y2={60} />
      </g>)}
      <rect x={-8} y={18} width={56} height={24} fill="none" strokeDasharray="2 2" strokeWidth={1} />
    </>
    case 'contact3': case 'breaker3': case 'disconnector3': return threePole(part.kind, st, active)
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
      const glow = st.lit ? LAMP_COLORS[part.color ?? 'green'] : '#fff'
      return <>
        <line x1={0} y1={0} x2={0} y2={18} /><line x1={0} y1={42} x2={0} y2={60} />
        {st.lit && <circle cx={0} cy={30} r={17} fill={glow} opacity={0.25} stroke="none" />}
        <circle cx={0} cy={30} r={12} fill={glow} />
        <path d="M -8.5 21.5 L 8.5 38.5 M 8.5 21.5 L -8.5 38.5" />
      </>
    }
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
    default: {
      const kind = part.kind
      if (CMD_PARTS[kind].family === 'contact' || CMD_PARTS[kind].family === 'button') return contactBody(kind, st, active)
      return null
    }
  }
}

/** Símbolo completo: geometria rodada + referência e marcação dos bornes sempre legíveis. */
export function CmdSymbol({ part, state, selected, showTerminals = true }: { part: CmdPart; state?: CmdSymbolState; selected?: boolean; showTerminals?: boolean }) {
  const box = partBox(part)
  const vertical = part.rot === 0 || part.rot === 180
  const terms = partTerminals(part)
  return <g className={`dc-cmd-symbol${selected ? ' is-selected' : ''}`} data-cmd-part={part.id} data-cmd-kind={part.kind}>
    {selected && <rect className="dc-cmd-select" x={box.x - 6} y={box.y - 6} width={box.w + 12} height={box.h + 12} rx={5} />}
    <rect x={box.x - 4} y={box.y - 4} width={box.w + 8} height={box.h + 8} fill="transparent" stroke="none" />
    <g transform={`translate(${part.x} ${part.y}) rotate(${part.rot})`} fill="none" stroke={INK} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      {symbolBody(part, state)}
    </g>
    {part.tag && part.kind !== 'node' && part.kind !== 'supply' && (
      vertical
        ? <text className="dc-cmd-tag" x={box.x - 6} y={box.y + box.h / 2 + 4} textAnchor="end">{part.tag}</text>
        : <text className="dc-cmd-tag" x={box.x + box.w / 2} y={box.y - 8} textAnchor="middle">{part.tag}</text>
    )}
    {showTerminals && part.kind !== 'node' && part.kind !== 'supply' && terms.map((_, i) => {
      const at = terminalAt(part, i)
      const label = terminalLabel(part, i)
      if (!label) return null
      // Marcação do lado de dentro do símbolo: por baixo do borne de cima, por cima do borne de baixo.
      const below = at.y > box.y + box.h / 2
      return <text key={i} className="dc-cmd-term" x={at.x + (vertical ? 4 : 0)} y={vertical ? at.y + (below ? -4 : 11) : at.y - 4} textAnchor={vertical ? 'start' : 'middle'}>{label}</text>
    })}
  </g>
}
