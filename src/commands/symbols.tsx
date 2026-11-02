// Símbolos IEC 60617 / ISO 1219 — desenhos DC-Simu e variantes QElectroTech atribuídas em docs/third-party/qelectrotech.
import { fontStack } from '../ui/textStyle'
import type { ReactNode, PointerEvent as ReactPointerEvent } from 'react'
import { CMD_PARTS, LOGO_INPUTS, partBox, partTerminals, terminalAt, terminalLabel, variantOf, type CmdKind, type CmdPart } from './model'

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
  /** LOGO!: saídas a relé Q0.0…Q0.3 fechadas. */
  outputs?: boolean[]
  tripped?: boolean
  idle?: boolean
  /** 0..1 posição do êmbolo (cilindros). */
  actuator?: number
  /** Carga sob tensão (buzzer, solenoide…). */
  load?: boolean
  /** Voltímetro em RUN: tensão lida entre os bornes (V). */
  volts?: number
  /** Voltímetro: leitura em contínua (L+/M) — senão alterna. */
  voltsDc?: boolean
}

/** Contactos normalmente fechados (em repouso conduzem). */
export const NC_KINDS = new Set<CmdKind>(['contactNC', 'pushNC', 'timedNC', 'timedOffNC', 'thermalNC', 'limitNC', 'emergency', 'pullCord', 'levelNC', 'footNC'])

type Actuator = 'push' | 'mushroom' | 'pull' | 'turn' | 'position' | 'proximity' | 'pressure' | 'level' | 'foot' | 'thermal' | 'delayOn' | 'delayOff'
/** Órgão de comando de cada contacto (IEC 60617-7), desenhado à esquerda da lâmina. */
const ACTUATOR: Partial<Record<CmdKind, Actuator>> = {
  pushNO: 'push', pushNC: 'push', pushIllum: 'push', emergency: 'mushroom', pullCord: 'pull', selector: 'turn',
  limitNO: 'position', limitNC: 'position', proximity: 'proximity', pressureSwitch: 'pressure',
  levelNO: 'level', levelNC: 'level', footNO: 'foot', footNC: 'foot', thermalNO: 'thermal', thermalNC: 'thermal',
  timedNO: 'delayOn', timedNC: 'delayOn', timedOffNO: 'delayOff', timedOffNC: 'delayOff',
}

/**
 * Órgão de comando centrado em (ax, ay), com a ligação mecânica tracejada até ao meio da
 * lâmina (mx, my). Devolve só traços em `path`, para não contarem como condutores.
 */
function actuatorAt(actuator: Actuator, ax: number, ay: number, mx: number, my: number, tripped?: boolean): ReactNode {
  const link = (fromX: number) => <path d={`M ${fromX} ${ay} L ${mx} ${my}`} strokeDasharray="2.6 2.2" strokeWidth={1.1} />
  /** Trinco (encravamento) na ligação: mantém a posição até rearmar. */
  const latch = <path d={`M ${ax + 7} ${ay - 3.5} L ${ax + 10} ${ay} L ${ax + 7} ${ay + 3.5}`} strokeWidth={1.1} />
  switch (actuator) {
    case 'push': return <>{link(ax)}<path d={`M ${ax + 4} ${ay - 7} L ${ax} ${ay - 7} L ${ax} ${ay + 7} L ${ax + 4} ${ay + 7}`} /></>
    case 'mushroom': return <>
      {link(ax)}{latch}
      <path d={`M ${ax} ${ay - 7} L ${ax} ${ay + 7}`} />
      <path d={`M ${ax} ${ay - 7} A 7 7 0 0 0 ${ax} ${ay + 7} Z`} fill="#fecaca" stroke="#b91c1c" />
    </>
    case 'pull': return <>{link(ax)}{latch}<path d={`M ${ax - 4} ${ay - 7} L ${ax} ${ay - 7} L ${ax} ${ay + 7} L ${ax - 4} ${ay + 7}`} /></>
    case 'turn': return <>{link(ax)}<path d={`M ${ax - 4} ${ay - 7} L ${ax} ${ay - 7} L ${ax} ${ay + 7} L ${ax + 4} ${ay + 7}`} /></>
    // Fim de curso: cunha (came) presa à própria lâmina.
    case 'position': return <path d={`M ${mx} ${my} L ${mx - 8} ${my - 4.5} L ${mx - 8} ${my + 4.5} Z`} fill="#fff" />
    case 'proximity': return <>{link(ax + 6)}<path d={`M ${ax} ${ay - 7} L ${ax + 6} ${ay} L ${ax} ${ay + 7} L ${ax - 6} ${ay} Z`} fill="#fff" /></>
    case 'pressure': return <>
      {link(ax + 6)}
      <rect x={ax - 6} y={ay - 6} width={12} height={12} fill="#fff" />
      <text x={ax} y={ay + 3.5} textAnchor="middle" fontSize={9} fontStyle="italic" fontWeight={700} fill={INK} stroke="none">p</text>
    </>
    case 'level': return <>
      {link(ax + 4)}
      <circle cx={ax} cy={ay} r={4} fill="#fff" />
      <path d={`M ${ax - 7} ${ay + 8} q 1.75 -2 3.5 0 t 3.5 0 t 3.5 0 t 3.5 0`} strokeWidth={1.1} />
    </>
    case 'foot': return <>
      {link(ax + 3)}
      <path d={`M ${ax - 6} ${ay + 6} L ${ax + 3} ${ay - 3} M ${ax - 7} ${ay + 6} L ${ax + 4} ${ay + 6}`} />
    </>
    case 'thermal': return <>
      {link(ax + 7)}
      <path d={`M ${ax - 7} ${ay + 3} h 3.5 v -6 h 7 v 6 h 3.5`} stroke={tripped ? '#dc2626' : INK} />
    </>
    // Temporizados: «paraquedas». À operação, a copa afasta-se do contacto; à desoperação, vira-se para ele.
    case 'delayOn': return <>
      {link(ax + 5)}
      <path d={`M ${ax - 2} ${ay - 6} A 6 6 0 0 0 ${ax - 2} ${ay + 6} M ${ax - 2} ${ay - 6} L ${ax + 5} ${ay} L ${ax - 2} ${ay + 6}`} />
    </>
    case 'delayOff': return <>
      {link(ax + 4)}
      <path d={`M ${ax + 4} ${ay - 6} A 6 6 0 0 1 ${ax + 4} ${ay + 6} M ${ax + 4} ${ay - 6} L ${ax - 3} ${ay} L ${ax + 4} ${ay + 6}`} />
    </>
  }
}

const contactBody = (kind: CmdKind, st: CmdSymbolState, active: string) => {
  const nc = NC_KINDS.has(kind)
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
  const actuator = ACTUATOR[kind]
  const mx = bladeEnd[0] / 2, my = (42 + bladeEnd[1]) / 2
  return (
    <>
      <line x1={0} y1={0} x2={0} y2={18} />
      <line x1={0} y1={42} x2={0} y2={60} />
      {hook !== 0 && <line x1={0} y1={18} x2={10 * hook} y2={18} />}
      <line x1={0} y1={42} x2={bladeEnd[0]} y2={bladeEnd[1]} stroke={live ? active : INK} strokeWidth={live ? 2 : 1.6} />
      {actuator && actuatorAt(actuator, kind === 'emergency' || kind === 'pullCord' ? -25 : -22, my, mx, my, st.tripped)}
      {(kind === 'timedNO' || kind === 'timedNC' || kind === 'timedOffNO' || kind === 'timedOffNC') && st.progress !== undefined && st.energized &&
        <rect x={-28} y={48} width={20 * Math.min(1, st.progress)} height={3} fill="#f59e0b" stroke="none" />}
    </>
  )
}

type SwitchQualifier = 'breaker' | 'disconnector' | 'switchDisconnector'

/** Qualificativo IEC 60617-7 no contacto fixo (x, 18): × disjuntor, barra seccionador,
 *  barra + círculo interruptor-seccionador. Desenhado em `path` para não se confundir com condutores. */
const qualifierAt = (x: number, q: SwitchQualifier) => q === 'breaker'
  ? <path d={`M ${x - 3.5} 14.5 L ${x + 3.5} 21.5 M ${x + 3.5} 14.5 L ${x - 3.5} 21.5`} />
  : <>
    <path d={`M ${x - 4.5} 18 L ${x + 4.5} 18`} strokeWidth={2} />
    {q === 'switchDisconnector' && <circle cx={x} cy={18} r={2.3} fill="#fff" />}
  </>

/** Ponta da lâmina: assente no contacto fixo quando fecha, afastada para a direita quando abre. */
const bladeTip = (x: number, closed: boolean): [number, number] => (closed ? [x, 18] : [x + 9, 24])

/**
 * Aparelho de manobra IEC por pólos: borne fixo em cima, lâmina articulada no borne de baixo,
 * qualificativo no contacto fixo e ligação mecânica tracejada entre lâminas (e disparadores).
 * `fuseBlade`: a lâmina é o próprio fusível (seccionador / interruptor-seccionador fusível).
 */
function switchPoles(xs: number[], st: CmdSymbolState, q: SwitchQualifier, active: string, opts: { fuseBlade?: boolean; linkTo?: number } = {}) {
  const closed = !!st.closed
  const live = closed && !st.idle
  const linkY = 31
  const atLink = (x: number) => (closed ? x : x + 9 * (42 - linkY) / 18)
  const last = xs[xs.length - 1]
  return <>
    {xs.map((x) => {
      const [tx, ty] = bladeTip(x, closed)
      const angle = Math.atan2(tx - x, 42 - ty) * 180 / Math.PI
      return <g key={x}>
        <line x1={x} y1={0} x2={x} y2={18} />
        <line x1={x} y1={42} x2={x} y2={60} />
        {qualifierAt(x, q)}
        <line x1={x} y1={42} x2={tx} y2={ty} stroke={live ? active : INK} strokeWidth={live ? 2 : 1.6} />
        {opts.fuseBlade && <rect x={x - 4} y={25} width={8} height={13} transform={`rotate(${angle} ${x} 42)`} stroke={live ? active : INK} />}
      </g>
    })}
    {(xs.length > 1 || opts.linkTo !== undefined) && <path d={`M ${atLink(xs[0])} ${linkY} L ${opts.linkTo ?? atLink(last)} ${linkY}`} strokeDasharray="3 2.5" strokeWidth={1} />}
  </>
}

/** Disparadores do disjuntor (IEC 60617-7): térmico (bimetal) em cima e magnético (I>) em baixo. */
const releases = (ax: number, tripped?: boolean) => <>
  <rect x={ax} y={14} width={16} height={16} fill="#fff" stroke={tripped ? '#dc2626' : INK} strokeWidth={1.3} />
  <path d={`M ${ax + 2.5} 26 h 3.5 v -8 h 4 v 8 h 3.5`} fill="none" strokeWidth={1.3} stroke={tripped ? '#dc2626' : INK} />
  <rect x={ax} y={30} width={16} height={16} fill="#fff" strokeWidth={1.3} />
  <text x={ax + 8} y={41.5} textAnchor="middle" fontSize={8} fontWeight={700} fill={INK} stroke="none">{'I>'}</text>
</>

/** Corrente alternada (~) ou contínua (—) centrada em (cx, cy). */
const currentMark = (kind: 'ac' | 'dc', cx: number, cy: number) => kind === 'ac'
  ? <path d={`M ${cx - 5.5} ${cy} q 2.75 -4.5 5.5 0 t 5.5 0`} fill="none" />
  : <path d={`M ${cx - 5.5} ${cy} L ${cx + 5.5} ${cy}`} />

/** Marca de ligação do enrolamento: estrela (Y), triângulo (Δ) ou ziguezague (Z), centrada em (0, cy). */
const windingMark = (letter: string, cy: number) => {
  const l = letter.toLowerCase()
  if (l === 'd') return <path d={`M -4.5 ${cy + 3.5} L 4.5 ${cy + 3.5} L 0 ${cy - 4} Z`} fill="none" strokeWidth={1.2} />
  if (l === 'z') return <path d={`M -4 ${cy - 3.5} L 4 ${cy - 3.5} L -4 ${cy + 3.5} L 4 ${cy + 3.5}`} fill="none" strokeWidth={1.2} />
  return <path d={`M -4 ${cy - 4} L 0 ${cy} L 4 ${cy - 4} M 0 ${cy} L 0 ${cy + 4.5}`} fill="none" strokeWidth={1.2} />
}

/** Motor (IEC 60617-6): círculo com M e o tipo de corrente; seta de rotação em marcha. */
function motorBody(xs: number[], cx: number, cy: number, r: number, kindLabel: ReactNode, st: CmdSymbolState, active: string, extra?: ReactNode) {
  const running = !!st.motor && st.motor.mode !== 'stop'
  const top = (x: number) => cy - Math.sqrt(Math.max(0, r * r - (x - cx) ** 2))
  return <>
    {xs.map((x) => <line key={x} x1={x} y1={0} x2={x} y2={top(x)} />)}
    <circle cx={cx} cy={cy} r={r} fill={running ? '#ecfdf5' : '#fff'} stroke={running ? active : INK} strokeWidth={running ? 2.2 : 1.6} />
    {extra}
    <text x={cx} y={cy - 2} textAnchor="middle" fontSize={15} fontWeight={700} fill={INK} stroke="none">M</text>
    {kindLabel}
    {running && <g className="dc-cmd-motor-spin" style={{ transformOrigin: `${cx}px ${cy}px`, animationDirection: st.motor!.dir === -1 ? 'reverse' : 'normal' }}>
      <path d={`M ${cx} ${cy - r - 4} A ${r + 4} ${r + 4} 0 0 1 ${cx + r + 2} ${cy - 10}`} fill="none" stroke={active} strokeWidth={2} />
      <path d={`M ${cx + r + 2} ${cy - 10} l -6 -1 l 3 -5 z`} fill={active} stroke="none" />
    </g>}
  </>
}

/** Contactos principais do contactor (3P): seguem o desenho do NA, com gancho à esquerda a conduzir. */
const threePole = (_kind: CmdKind, st: CmdSymbolState, active: string) => {
  const closed = !!st.closed
  const contactHook = closed
  return (
    <>
      {[0, 20, 40].map((x) => (
        <g key={x}>
          <line x1={x} y1={0} x2={x} y2={18} />
          <line x1={x} y1={42} x2={x} y2={60} />
          {/* Contactos de potência do contactor seguem o desenho do NA: gancho à esquerda a conduzir. */}
          {contactHook && <line x1={x} y1={18} x2={x - 10} y2={18} />}
          <path d={`M ${x - 3.4} 18 a 3.4 3.4 0 0 0 6.8 0`} strokeWidth={1.2} />
          <line x1={x} y1={42} x2={x + (closed ? (contactHook ? -10 : 0) : 8)} y2={closed ? 18 : 25} stroke={closed && !st.idle ? active : INK} strokeWidth={closed && !st.idle ? 2 : 1.6} />
        </g>
      ))}
    </>
  )
}

export function symbolBody(part: Pick<CmdPart, 'kind' | 'lines' | 'color' | 'symbolStyle' | 'groundVariant' | 'variant'>, st: CmdSymbolState = {}): ReactNode {
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
    case 'breaker1': return switchPoles([0], st, 'breaker', active)
    case 'breaker2': return switchPoles([0, 20], st, 'breaker', active)
    case 'breaker3': return switchPoles([0, 20, 40], st, 'breaker', active)
    case 'breakerTM1': return <>{switchPoles([0], st, 'breaker', active, { linkTo: 14 })}{releases(14, st.tripped)}</>
    case 'motorBreaker3': return <>{switchPoles([0, 20, 40], st, 'breaker', active, { linkTo: 58 })}{releases(58, st.tripped)}</>
    case 'disconnector1': return switchPoles([0], st, 'disconnector', active)
    case 'disconnector2': return switchPoles([0, 20], st, 'disconnector', active)
    case 'disconnector3': case 'mainSwitch': return <>
      {switchPoles([0, 20, 40], st, 'disconnector', active)}
      {/* Comando manual comum aos três pólos. */}
      <path d="M -6 8 L 46 8" strokeWidth={1.2} />
    </>
    case 'switchDisconnector1': return switchPoles([0], st, 'switchDisconnector', active)
    case 'switchDisconnector3': return switchPoles([0, 20, 40], st, 'switchDisconnector', active)
    case 'fuseDisconnector3': return switchPoles([0, 20, 40], st, 'disconnector', active, { fuseBlade: true })
    case 'fuseSwitchDisconnector3': return switchPoles([0, 20, 40], st, 'switchDisconnector', active, { fuseBlade: true })
    case 'fuse2': return <>{[0, 20].map((x) => <g key={x}>
      <line x1={x} y1={0} x2={x} y2={60} />
      <rect x={x - 5.5} y={16} width={11} height={28} fill="#fff" />
      <line x1={x} y1={16} x2={x} y2={44} />
    </g>)}</>
    case 'meter': {
      // Instrumento indicador (IEC 60617-8): círculo com a grandeza.
      const q = variantOf(part) ?? 'W'
      return <>
        <line x1={0} y1={0} x2={0} y2={17} /><line x1={0} y1={43} x2={0} y2={60} />
        <circle cx={0} cy={30} r={13} fill="#fff" />
        <text x={0} y={q.length > 2 ? 33.5 : 34.5} textAnchor="middle" fontSize={q.length > 2 ? 9.5 : 12} fontWeight={700} fill={INK} stroke="none">{q}</text>
      </>
    }
    case 'energyMeter': {
      // Instrumento integrador (IEC 60617-8): retângulo com a faixa superior.
      const q = variantOf(part) ?? 'Wh'
      return <>
        <line x1={0} y1={0} x2={0} y2={16} /><line x1={0} y1={44} x2={0} y2={60} />
        <rect x={-15} y={16} width={30} height={28} fill="#fff" />
        <path d="M -15 23 L 15 23" />
        <text x={0} y={37.5} textAnchor="middle" fontSize={q.length > 2 ? 9 : 11} fontWeight={700} fill={INK} stroke="none">{q}</text>
      </>
    }
    case 'plcLogo': {
      // LOGO! 12/24RC — frente do aparelho (desenho DC-Simu): faixa X10 com os bornes de entrada,
      // visor e teclado ao centro e faixa X11 com as quatro saídas a relé (contacto 1-2 por saída).
      const on = !!(st.load && !st.idle)
      const outputs = st.outputs ?? [false, false, false, false]
      const top = [['L+', 0], ['M', 20], ...LOGO_INPUTS.map((label, i) => [label, 60 + i * 20] as const)] as Array<readonly [string, number]>
      return <>
        <rect x={-14} y={0} width={268} height={220} fill="#fbfcfd" strokeWidth={1.4} />
        {/* X10: bornes de alimentação e entradas. */}
        <path d="M -14 44 L 254 44 M -14 47 L 254 47" strokeWidth={0.9} />
        {top.map(([label, x]) => <g key={'i' + label}>
          <text x={x} y={12} textAnchor="middle" fontSize={6.6} fontWeight={700} fill={INK} stroke="none">{label}</text>
          <line x1={x} y1={0} x2={x} y2={4} />
          <circle cx={x} cy={28} r={7.5} fill="#fff" strokeWidth={1.1} />
        </g>)}
        <text x={250} y={58} textAnchor="end" fontSize={7} fontWeight={700} fill={INK} stroke="none">DC 24V  INPUT 8×DC</text>
        <rect x={150} y={62} width={100} height={12} fill="none" strokeWidth={0.9} />
        <path d="M -14 78 L 254 78" strokeWidth={0.9} />
        {/* Centro: marca, visor (verde em RUN) e teclado. */}
        <rect x={-6} y={84} width={50} height={13} fill="none" strokeWidth={0.9} />
        <text x={19} y={93.6} textAnchor="middle" fontSize={8} fontWeight={800} letterSpacing={0.4} fill={INK} stroke="none">SIEMENS</text>
        <text x={136} y={95} textAnchor="end" fontSize={14} fill="#334155" stroke="none">LOGO!</text>
        <rect x={10} y={104} width={96} height={58} fill={on ? '#d9f99d' : '#fff'} strokeWidth={1.1} />
        <text x={58} y={137} textAnchor="middle" fontSize={11} fontWeight={700} fontFamily="ui-monospace, monospace" fill={on ? '#365314' : '#94a3b8'} stroke="none">{on ? 'RUN' : 'STOP'}</text>
        <path d="M 144 78 L 144 176" strokeWidth={0.9} />
        <text x={250} y={96} textAnchor="end" fontSize={8} fontWeight={700} fill={INK} stroke="none">12/24RC</text>
        {[[194, 100, 'M 0 4 L 4 -3 L -4 -3 Z', 180], [176, 118, 'M -4 0 L 3 -4 L 3 4 Z', 0], [212, 118, 'M 4 0 L -3 -4 L -3 4 Z', 0], [194, 136, 'M 0 4 L 4 -3 L -4 -3 Z', 0]].map(([x, y, d, r]) => <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}>
          <rect x={-7} y={-7} width={14} height={14} rx={1.5} fill="#fff" strokeWidth={0.9} />
          <path d={d as string} transform={`rotate(${r})`} fill="none" strokeWidth={0.9} />
        </g>)}
        {[['ESC', 168], ['OK', 220]].map(([label, x]) => <g key={label as string}>
          <rect x={(x as number) - 9} y={152} width={18} height={16} rx={1.5} fill="#fff" strokeWidth={0.9} />
          <text x={x as number} y={163} textAnchor="middle" fontSize={6.5} fontWeight={700} fill={INK} stroke="none">{label}</text>
        </g>)}
        <path d="M -14 176 L 254 176 M -14 179 L 254 179" strokeWidth={0.9} />
        <text x={-6} y={172} fontSize={6.8} fontWeight={700} fill={INK} stroke="none">OUTPUT 4×RELAY/10A</text>
        <text x={-9} y={208} fontSize={7.5} fontWeight={700} fill={INK} stroke="none">X11</text>
        {/* X11: saídas a relé — dois bornes por saída e o contacto NA entre eles (1-2). */}
        {outputs.map((closed, i) => {
          const a = 40 + i * 60, b = a + 20
          const live = closed && !st.idle
          return <g key={'q' + i}>
            <text x={a + 10} y={190} textAnchor="middle" fontSize={7} fontWeight={700} fill={INK} stroke="none">{`Q0.${i}`}</text>
            <circle cx={a} cy={200} r={6.5} fill="#fff" strokeWidth={1.1} />
            <circle cx={b} cy={200} r={6.5} fill="#fff" strokeWidth={1.1} />
            <line x1={a} y1={206.5} x2={a} y2={220} /><line x1={b} y1={206.5} x2={b} y2={220} />
            <line x1={a} y1={213} x2={a + 4} y2={213} /><line x1={b - 4} y1={213} x2={b} y2={213} />
            <line x1={a + 4} y1={213} x2={b - 4} y2={closed ? 213 : 207} stroke={live ? active : INK} strokeWidth={live ? 1.8 : 1.3} />
            <text x={a - 8} y={216} textAnchor="middle" fontSize={6} fill={INK} stroke="none">1</text>
            <text x={b + 8} y={216} textAnchor="middle" fontSize={6} fill={INK} stroke="none">2</text>
          </g>
        })}
      </>
    }
    case 'plcS71500Di32': {
      // Módulo DI 32×24 V — caixa com L+/M e 32 entradas (4 grupos de 8).
      const on = !!(st.load && !st.idle)
      return <>
        <rect x={-14} y={-6} width={276} height={196} fill="#fbfcfd" strokeWidth={1.4} />
        <text x={8} y={12} fontSize={8} fontWeight={800} fill={INK} stroke="none">SIEMENS</text>
        <text x={250} y={12} textAnchor="end" fontSize={9} fontWeight={700} fill="#334155" stroke="none">DI 32×24V</text>
        <text x={250} y={24} textAnchor="end" fontSize={6.5} fill="#64748b" stroke="none">6ES7521-1BL00-0AB0</text>
        <circle cx={0} cy={0} r={5} fill="#fff" strokeWidth={1} /><text x={0} y={-8} textAnchor="middle" fontSize={6} fontWeight={700} fill={INK} stroke="none">L+</text>
        <circle cx={20} cy={0} r={5} fill="#fff" strokeWidth={1} /><text x={20} y={-8} textAnchor="middle" fontSize={6} fontWeight={700} fill={INK} stroke="none">M</text>
        <rect x={200} y={4} width={44} height={16} fill={on ? '#d9f99d' : '#fff'} strokeWidth={0.9} />
        <text x={222} y={15} textAnchor="middle" fontSize={7} fontWeight={700} fill={on ? '#365314' : '#94a3b8'} stroke="none">{on ? 'ON' : 'OFF'}</text>
        {Array.from({ length: 32 }, (_, i) => {
          const x = 40 + (i % 8) * 28, y = 40 + Math.floor(i / 8) * 36
          const label = `I${Math.floor(i / 8)}.${i % 8}`
          return <g key={label}>
            <text x={x} y={y - 8} textAnchor="middle" fontSize={5.5} fontWeight={700} fill={INK} stroke="none">{label}</text>
            <circle cx={x} cy={y} r={5.5} fill="#fff" strokeWidth={1} />
          </g>
        })}
      </>
    }
    case 'plcS71500Cpu1511c': {
      // CPU 1511C-1 PN — visor, 16 entradas e 16 saídas (pares 1-2).
      const on = !!(st.load && !st.idle)
      const outputs = st.outputs ?? Array(16).fill(false)
      return <>
        <rect x={-14} y={-6} width={316} height={246} fill="#fbfcfd" strokeWidth={1.4} />
        <text x={8} y={10} fontSize={8} fontWeight={800} fill={INK} stroke="none">SIEMENS</text>
        <text x={290} y={10} textAnchor="end" fontSize={9} fontWeight={700} fill="#334155" stroke="none">CPU 1511C</text>
        <text x={290} y={22} textAnchor="end" fontSize={6} fill="#64748b" stroke="none">6ES7511-1CK00-0AB0</text>
        {[['L+', 0], ['M', 24], ['PN', 48]].map(([label, x]) => <g key={label as string}>
          <text x={x as number} y={-8} textAnchor="middle" fontSize={6} fontWeight={700} fill={INK} stroke="none">{label}</text>
          <circle cx={x as number} cy={0} r={5} fill="#fff" strokeWidth={1} />
        </g>)}
        <rect x={200} y={28} width={80} height={36} fill={on ? '#d9f99d' : '#fff'} strokeWidth={1.1} />
        <text x={240} y={50} textAnchor="middle" fontSize={10} fontWeight={700} fontFamily="ui-monospace, monospace" fill={on ? '#365314' : '#94a3b8'} stroke="none">{on ? 'RUN' : 'STOP'}</text>
        <path d="M -14 92 L 300 92" strokeWidth={0.8} />
        <text x={0} y={88} fontSize={6.5} fontWeight={700} fill={INK} stroke="none">INPUT 16×DC</text>
        {Array.from({ length: 16 }, (_, i) => {
          const x = 20 + (i % 8) * 36, y = 36 + Math.floor(i / 8) * 28
          const label = `I${Math.floor(i / 8)}.${i % 8}`
          return <g key={label}>
            <text x={x} y={y - 7} textAnchor="middle" fontSize={5.5} fontWeight={700} fill={INK} stroke="none">{label}</text>
            <circle cx={x} cy={y} r={5} fill="#fff" strokeWidth={1} />
          </g>
        })}
        <path d="M -14 188 L 300 188" strokeWidth={0.8} />
        <text x={0} y={184} fontSize={6.5} fontWeight={700} fill={INK} stroke="none">OUTPUT 16×</text>
        {outputs.map((closed, i) => {
          const row = Math.floor(i / 8), col = i % 8
          const a = 16 + col * 36, b = a + 12, y = 200 + row * 28
          const live = closed && !st.idle
          return <g key={'q' + i}>
            <text x={a + 6} y={y - 8} textAnchor="middle" fontSize={5.5} fontWeight={700} fill={INK} stroke="none">{`Q${Math.floor(i / 8)}.${i % 8}`}</text>
            <circle cx={a} cy={y} r={4.5} fill="#fff" strokeWidth={1} />
            <circle cx={b} cy={y} r={4.5} fill="#fff" strokeWidth={1} />
            <line x1={a} y1={y + 4.5} x2={a} y2={y + 10} /><line x1={b} y1={y + 4.5} x2={b} y2={y + 10} />
            <line x1={a} y1={y + 8} x2={b} y2={closed ? y + 8 : y + 4} stroke={live ? active : INK} strokeWidth={live ? 1.6 : 1.1} />
          </g>
        })}
      </>
    }
    case 'plcS7300Cpu315': {
      // CPU 315-2 DP — painel frontal com LEDs e interfaces MPI/DP.
      const on = !!(st.load && !st.idle)
      const leds = [
        { label: 'SF', on: !!st.tripped, color: '#ef4444' },
        { label: 'BATF', on: false, color: '#f59e0b' },
        { label: 'DC5V', on, color: '#22c55e' },
        { label: 'FRCE', on: false, color: '#3b82f6' },
        { label: 'RUN', on, color: '#22c55e' },
        { label: 'STOP', on: !on, color: '#f97316' },
      ]
      return <>
        <rect x={-8} y={-6} width={156} height={176} fill="#fbfcfd" strokeWidth={1.4} />
        <text x={8} y={12} fontSize={8} fontWeight={800} fill={INK} stroke="none">SIEMENS</text>
        <text x={140} y={12} textAnchor="end" fontSize={8} fontWeight={700} fill="#334155" stroke="none">CPU 315-2 DP</text>
        <rect x={20} y={28} width={100} height={28} fill={on ? '#d9f99d' : '#fff'} strokeWidth={1} />
        <text x={70} y={46} textAnchor="middle" fontSize={11} fontWeight={700} fontFamily="ui-monospace, monospace" fill={on ? '#365314' : '#94a3b8'} stroke="none">{on ? 'RUN' : 'STOP'}</text>
        {leds.map((led, i) => {
          const x = 16 + (i % 3) * 42, y = 72 + Math.floor(i / 3) * 28
          return <g key={led.label}>
            <circle cx={x} cy={y} r={6} fill={led.on ? led.color : '#fff'} strokeWidth={1} opacity={led.on ? 1 : 0.9} />
            <text x={x + 12} y={y + 3} fontSize={7} fontWeight={700} fill={INK} stroke="none">{led.label}</text>
          </g>
        })}
        <path d="M -8 130 L 146 130" strokeWidth={0.8} />
        {[['L+', 20], ['M', 50], ['MPI', 90], ['DP', 130]].map(([label, x]) => <g key={label as string}>
          <text x={x as number} y={148} textAnchor="middle" fontSize={6.5} fontWeight={700} fill={INK} stroke="none">{label}</text>
          <circle cx={x as number} cy={160} r={5.5} fill="#fff" strokeWidth={1} />
        </g>)}
      </>
    }
    case 'converter': {
      // Conversor (IEC 60617-6): quadrado com diagonal; entrada em cima à esquerda, saída em baixo à direita.
      const v = variantOf(part) ?? 'acdc'
      const [input, output] = (v === 'acdc' ? ['ac', 'dc'] : v === 'dcac' ? ['dc', 'ac'] : v === 'dcdc' ? ['dc', 'dc'] : ['ac', 'ac']) as Array<'ac' | 'dc'>
      return <>
        {[0, 20].map((x) => <g key={x}><line x1={x} y1={0} x2={x} y2={14} /><line x1={x} y1={46} x2={x} y2={60} /></g>)}
        <rect x={-4} y={14} width={28} height={32} fill="#fff" />
        <path d="M -4 46 L 24 14" />
        {currentMark(input, 4.5, 22.5)}
        {currentMark(output, 15.5, 38)}
      </>
    }
    case 'transformerCT': return <>
      {/* Primário 1-2, secundário 3-5 com tomada média 4 (IEC 60617-6). */}
      <line x1={0} y1={0} x2={0} y2={14} /><line x1={0} y1={46} x2={0} y2={60} />
      <path d="M 0 14 a 6 4 0 0 1 0 8 a 6 4 0 0 1 0 8 a 6 4 0 0 1 0 8 a 6 4 0 0 1 0 8" fill="none" />
      <line x1={13} y1={12} x2={13} y2={48} /><line x1={17} y1={12} x2={17} y2={48} />
      <line x1={30} y1={0} x2={30} y2={14} /><line x1={30} y1={46} x2={30} y2={60} />
      <path d="M 30 14 a 6 4 0 0 0 0 8 a 6 4 0 0 0 0 8 a 6 4 0 0 0 0 8 a 6 4 0 0 0 0 8" fill="none" />
      <line x1={30} y1={30} x2={50} y2={30} />
      <circle cx={30} cy={30} r={1.8} fill={INK} stroke="none" />
    </>
    case 'autotransformer': return <>
      {/* Autotransformador: um só enrolamento, com a tomada intermédia ligada ao borne 3. */}
      <line x1={0} y1={0} x2={0} y2={12} /><line x1={0} y1={48} x2={0} y2={60} />
      <path d="M 0 12 a 6 4.5 0 0 0 0 9 a 6 4.5 0 0 0 0 9 a 6 4.5 0 0 0 0 9 a 6 4.5 0 0 0 0 9" fill="none" />
      <line x1={0} y1={30} x2={20} y2={30} /><line x1={20} y1={30} x2={20} y2={60} />
      <circle cx={0} cy={30} r={1.8} fill={INK} stroke="none" />
    </>
    case 'transformer3Line': {
      // Transformador trifásico, representação unifilar: dois círculos e o grupo de ligações.
      const group = variantOf(part) ?? 'Dyn11'
      return <>
        <line x1={0} y1={0} x2={0} y2={11} /><line x1={0} y1={49} x2={0} y2={60} />
        <circle cx={0} cy={22} r={11} fill="none" />
        <circle cx={0} cy={38} r={11} fill="none" />
        {windingMark(group[0], 19)}
        {windingMark(group[1], 41)}
        <text x={14} y={33} fontSize={8} fontWeight={700} fill={INK} stroke="none">{group}</text>
      </>
    }
    case 'motor1': return motorBody([0, 20], 10, 48, 22, <text x={10} y={61} textAnchor="middle" fontSize={10} fill={INK} stroke="none">1~</text>, st, active)
    case 'motorDC': return motorBody([0, 20], 10, 48, 22, <path d="M 3 58 L 17 58" />, st, active)
    case 'motorSlipRing': {
      const bottom = (x: number) => 50 + Math.sqrt(24 * 24 - (x - 20) ** 2)
      return motorBody([0, 20, 40], 20, 50, 24, <text x={20} y={63} textAnchor="middle" fontSize={10} fill={INK} stroke="none">3~</text>, st, active, <>
        {/* Rotor bobinado: círculo interior e saída dos anéis K L M. */}
        <circle cx={20} cy={50} r={18.5} fill="none" strokeWidth={1.2} />
        {[0, 20, 40].map((x) => <line key={x} x1={x} y1={bottom(x)} x2={x} y2={100} />)}
      </>)
    }
    case 'thermal3': return <>
      {[0, 20, 40].map((x) => <g key={x}>
        <line x1={x} y1={0} x2={x} y2={22} />
        <path d={`M ${x} 22 v 4 h 5 v 8 h -5 v 4`} fill="none" stroke={st.tripped ? '#dc2626' : INK} />
        <line x1={x} y1={38} x2={x} y2={60} />
      </g>)}
      <path d="M 5 30 L 52 30" strokeDasharray="2.6 2.2" strokeWidth={1.1} />
    </>
    case 'rcd': return <>
      {/* Diferencial: disjuntor bipolar com o disparador de corrente diferencial (IΔ). */}
      {switchPoles([0, 20], st, 'breaker', active, { linkTo: 34 })}
      <rect x={34} y={22} width={18} height={18} fill="#fff" stroke={st.tripped ? '#dc2626' : INK} strokeWidth={1.3} />
      <text x={43} y={34.5} textAnchor="middle" fontSize={8} fontWeight={700} fill={INK} stroke="none">IΔ</text>
    </>
    case 'contact3': return threePole(part.kind, st, active)
    case 'changeover': {
      const closed = !!st.closed
      return <>
        {/* Comum 11 em cima; NA 14 com gancho à esquerda e NF 12 com gancho à direita (IEC 60617). */}
        <line x1={0} y1={0} x2={0} y2={18} />
        <line x1={0} y1={42} x2={0} y2={60} /><line x1={0} y1={42} x2={-9} y2={42} />
        <line x1={20} y1={42} x2={20} y2={60} /><line x1={20} y1={42} x2={11} y2={42} />
        <line x1={0} y1={18} x2={closed ? -9 : 11} y2={42} stroke={!st.idle ? active : INK} strokeWidth={!st.idle ? 2 : 1.6} />
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
      const glow = st.lit ? (part.color === 'red' ? '#ef4444' : part.color === 'yellow' ? '#eab308' : part.color === 'orange' ? '#f97316' : part.color === 'blue' ? '#3b82f6' : part.color === 'white' ? '#f8fafc' : '#22c55e') : '#fff'
      return <>
        <line x1={0} y1={0} x2={0} y2={18} /><line x1={0} y1={42} x2={0} y2={60} />
        {st.lit && <circle cx={0} cy={30} r={17} fill={glow} opacity={0.25} stroke="none" />}
        <circle cx={0} cy={30} r={12} fill={glow} />
        <path d="M -8.5 21.5 L 8.5 38.5 M 8.5 21.5 L -8.5 38.5" />
      </>
    }
    case 'buzzer': return <>
      <line x1={0} y1={0} x2={0} y2={18} /><line x1={0} y1={42} x2={0} y2={60} />
      <path d="M -13 36 A 13 13 0 0 1 13 36 Z" transform="translate(0 6)" fill={loadOn ? '#fef3c7' : '#fff'} stroke={loadOn ? '#d97706' : INK} />
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
      <line x1={0} y1={0} x2={0} y2={14} /><line x1={0} y1={46} x2={0} y2={60} />
      <line x1={30} y1={0} x2={30} y2={14} /><line x1={30} y1={46} x2={30} y2={60} />
      <path d="M 0 14 a 6 4 0 0 1 0 8 a 6 4 0 0 1 0 8 a 6 4 0 0 1 0 8 a 6 4 0 0 1 0 8" fill="none" />
      <path d="M 30 14 a 6 4 0 0 0 0 8 a 6 4 0 0 0 0 8 a 6 4 0 0 0 0 8 a 6 4 0 0 0 0 8" fill="none" />
      {/* Núcleo: distingue o transformador de dois indutores acoplados. */}
      <line x1={13} y1={19} x2={13} y2={41} /><line x1={17} y1={19} x2={17} y2={41} />
    </>
    case 'rectifier': return <>
      <rect x={0} y={8} width={40} height={44} fill="#fff" />
      <line x1={0} y1={0} x2={0} y2={8} /><line x1={40} y1={0} x2={40} y2={8} />
      <line x1={0} y1={52} x2={0} y2={60} /><line x1={40} y1={52} x2={40} y2={60} />
      <path d="M 13 21 L 13 39 L 26 30 Z" fill="#fff" /><path d="M 26 21 L 26 39" strokeWidth={2} />
      <path d="M 4 15 q 2.5 -4 5 0 t 5 0 M 26 15 q 2.5 -4 5 0 t 5 0" fill="none" strokeWidth={1.1} />
      <text x={7} y={49} textAnchor="middle" fontSize={9} fontWeight={700} fill={INK} stroke="none">+</text>
      <text x={33} y={49} textAnchor="middle" fontSize={9} fontWeight={700} fill={INK} stroke="none">−</text>
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
      // Em RUN, o voltímetro mostra a leitura num visor ao lado (como o multímetro do quadro 3D):
      // grandeza AC/DC em cima, valor em destaque; verde com tensão, cinzento a 0 V.
      const reading = part.kind === 'voltmeter' && st.volts !== undefined
      const live = reading && st.volts! > 0
      return <>
        <line x1={0} y1={0} x2={0} y2={18} /><line x1={0} y1={42} x2={0} y2={60} />
        <circle cx={0} cy={30} r={12} fill={live ? '#ecfdf5' : '#fff'} stroke={live ? active : INK} />
        <text x={0} y={35} textAnchor="middle" fontSize={14} fontWeight={700} fill={INK} stroke="none">{letter}</text>
        {reading && <g data-voltmeter-reading={st.volts} data-voltmeter-kind={st.voltsDc ? 'dc' : 'ac'} stroke="none">
          <line x1={12} y1={30} x2={18} y2={30} stroke={live ? active : '#94a3b8'} strokeWidth={1.2} />
          <rect x={18} y={13} width={74} height={34} rx={5} fill="#0f172a" stroke={live ? '#22c55e' : '#475569'} strokeWidth={1.4} />
          <rect x={22} y={17} width={66} height={26} rx={3} fill={live ? '#052e16' : '#111827'} />
          <text x={26} y={25} fontSize={6.5} fontWeight={700} letterSpacing={0.4} fill={live ? '#86efac' : '#64748b'}>{st.voltsDc ? 'V DC' : 'V AC'}</text>
          <text x={84} y={39} textAnchor="end" fontSize={15} fontWeight={700} fontFamily="ui-monospace, monospace" fill={live ? '#4ade80' : '#64748b'}>{st.volts}</text>
          <text x={84} y={25} textAnchor="end" fontSize={6.5} fontWeight={700} fill={live ? '#86efac' : '#64748b'}>{st.voltsDc ? '⎓' : '~'}</text>
        </g>}
      </>
    }
    case 'currentTransformer': return <>
      {/* TA: o cabo principal atravessa o núcleo (duas barras). */}
      <line x1={0} y1={0} x2={0} y2={60} />
      <circle cx={0} cy={30} r={9} fill="none" strokeWidth={1.8} />
      <path d="M 9 30 L 18 30" strokeWidth={1.2} />
      <text x={24} y={33.5} textAnchor="start" fontSize={9} fill={INK} stroke="none">TA</text>
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
        <path d={`M 10 30 L ${nc ? 6 : -5} 30`} strokeDasharray="2.6 2.2" strokeWidth={1.1} />
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
      <text x={0} y={34.5} textAnchor="middle" fontSize={13} fontWeight={700} fill={INK} stroke="none">θ</text>
    </>
    case 'pressureSwitch': return <>
      {contactBody('pressureSwitch', st, active)}
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
        <line x1={20} y1={0} x2={20} y2={22} /><line x1={20} y1={38} x2={20} y2={60} />
        <circle cx={20} cy={30} r={8} fill={st.load ? '#fde68a' : '#fff'} stroke={INK} />
        <path d="M 14.3 24.3 L 25.7 35.7 M 25.7 24.3 L 14.3 35.7" strokeWidth={1.2} />
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
      {/* O LOGO! escreve os nomes dos bornes no próprio desenho (faixas X10/X11). */}
      {showTerminals && part.kind !== 'plcLogo' && part.kind !== 'plcS71500Di32' && part.kind !== 'plcS71500Cpu1511c' && part.kind !== 'plcS7300Cpu315' && partTerminals(part).map((t, i) => {
        const at = terminalAt({ ...part, x: 0, y: 0 }, i)
        const label = terminalLabel(part, i)
        if (!label) return null
        return <text key={i} className="dc-cmd-term-label" x={at.x + 4} y={at.y - 4} fontSize={9} fill="#64748b" stroke="none">{label}</text>
      })}
    </g>
  )
}
