/**
 * Importação de esquemas elétricos / pneumáticos FluidSIM 4 (.ct) para o
 * Esquema IEC do DC-Simu. Reutiliza o expansor CT independente (sem código
 * do fabricante). Ver docs/FLUIDSIM-IMPORT.md e docs/COMMANDS-IMPORT.md.
 */
import { expandFluidSim4 } from '../grafcet/fluidSim4'
import type { CmdKind, CmdPart, CmdRotation, CommandsDiagram, CmdWire } from './model'
import { DEFAULT_PAGE_ID } from './pages'

const MAX_OBJECTS = 8000
const fail = (message: string): never => { throw new Error(`FluidSIM circuito: ${message}`) }

/** Mapeamento de nomes de símbolo FluidSIM (DE/EN) → CmdKind DC-Simu. */
const KIND_MAP: Record<string, CmdKind> = {
  // Alimentação / pólos
  pol1: 'supply', pol2: 'supply', pol3: 'supply',
  // Contactos / botões
  schliesser: 'contactNO', oeffner: 'contactNC', oeffner1: 'contactNC',
  schalter_schliesser: 'pushNO', schalter_oeffner: 'pushNC',
  taster_schliesser: 'pushNO', taster_oeffner: 'pushNC',
  notaus: 'emergency', not_aus: 'emergency',
  // Bobinas / cargas
  magnet: 'solenoid', relais: 'coil', spule: 'coil',
  lampe: 'lamp', buzzer: 'buzzer', summer: 'buzzer',
  // Motores
  mot: 'motor3', motor: 'motor3',
  // Proteção
  fuse: 'fuse', sicherung: 'fuse',
  // Temporizadores
  zeitrelais: 'timerCoil', timer: 'timerCoil',
  // Pneumática / hidráulica
  cylh3: 'cylDE', cylh1: 'cylSE', cylinder: 'cylDE',
  hwv_4: 'valve52', hwv_5: 'valve52', ventil: 'valve52',
  tank1: 'hydTank', tank: 'hydTank',
  dbv: 'checkValve', srv: 'throttle',
  // Genéricos
  diode: 'diode', widerstand: 'resistor', kondensator: 'capacitor',
}

export interface CircuitImportResult {
  diagram: CommandsDiagram
  warnings: string[]
  ignored: Array<{ kind: string; count: number }>
  stats: { symbols: number; wires: number; texts: number }
}

interface RawObject {
  index: number
  kind: string
  box: [number, number, number, number]
  props: Map<string, string>
}

function scaleCoord(v: number): number {
  // Coordenadas FluidSIM ~ unidades 1/1024 de ecrã → grelha DC-Simu 20 px
  return Math.round((v / 1024) * 1.5 / 20) * 20
}

function mapKind(raw: string): CmdKind | null {
  const key = raw.toLowerCase().replace(/[^a-z0-9_]/g, '_')
  if (KIND_MAP[key]) return KIND_MAP[key]
  if (key.includes('schliesser') || key.includes('no_')) return 'contactNO'
  if (key.includes('oeffner') || key.includes('nc_')) return 'contactNC'
  if (key.includes('lampe') || key.includes('lamp')) return 'lamp'
  if (key.includes('motor') || key === 'mot') return 'motor3'
  if (key.includes('magnet') || key.includes('solen')) return 'solenoid'
  if (key.includes('cyl')) return 'cylDE'
  if (key.includes('ventil') || key.includes('valve')) return 'valve52'
  if (key.includes('taster') || key.includes('push')) return 'pushNO'
  if (key.includes('not') && key.includes('aus')) return 'emergency'
  if (key.includes('relais') || key.includes('coil') || key.includes('spule')) return 'coil'
  if (key.includes('sicherung') || key.includes('fuse')) return 'fuse'
  if (key.includes('pol') || key.includes('supply') || key.includes('netz')) return 'supply'
  return null
}

/** Extrai o texto CT após o preview WMF. */
export function circuitTextFromCt(bytes: Uint8Array): string {
  const expanded = expandFluidSim4(bytes)
  const text = new TextDecoder('windows-1252').decode(expanded).replace(/\r\n?/g, '\n')
  const end = text.indexOf('END_FSPREVIEW\n')
  return end >= 0 ? text.slice(end + 'END_FSPREVIEW\n'.length) : text
}

/**
 * Interpreta o texto semântico CT de um esquema de circuito (não GRAFCET).
 * Ligações EConnection/HConnection com segmentos L são aproximadas a cabos
 * entre os símbolos cujos bornes ficam mais próximos das extremidades.
 */
export function parseFluidSimCircuitText(text: string): CircuitImportResult {
  const warnings: string[] = []
  const ignored = new Map<string, number>()
  const objects: RawObject[] = []
  const segments = new Map<number, Array<[number, number, number, number]>>()
  let current: RawObject | undefined

  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    if (!line || line.startsWith('BEGIN') || line.startsWith('END') || line === '0 0 0 # 0 0 0 0 0 0') continue
    const obj = /^(\w+)\s+O(\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+/.exec(line)
    if (obj) {
      current = {
        index: +obj[2],
        kind: obj[1],
        box: [+obj[3], +obj[4], +obj[5], +obj[6]],
        props: new Map(),
      }
      objects.push(current)
      if (objects.length > MAX_OBJECTS) fail('demasiados elementos no CT.')
      continue
    }
    const prop = /^ S (\w+) (I|INT|S|B|V|F) ?(.*)$/.exec(line)
    if (prop && current) {
      if (!current.props.has(prop[1])) current.props.set(prop[1], prop[3] ?? '')
      continue
    }
    const seg = /^L (-?\d+) (-?\d+) (-?\d+) (-?\d+)$/.exec(line)
    if (seg && current) {
      const list = segments.get(objects.length - 1) ?? []
      list.push([+seg[1], +seg[2], +seg[3], +seg[4]])
      segments.set(objects.length - 1, list)
      continue
    }
    if (/^gate\d+|^CON |^ F /.test(line)) continue
  }

  const parts: CmdPart[] = []
  const partByIndex = new Map<number, CmdPart>()
  let n = 0
  for (const o of objects) {
    if (o.kind === 'EConnection' || o.kind === 'HConnection' || o.kind === 'GConnection') continue
    if (o.kind === 'text') continue
    const kind = mapKind(o.kind)
    if (!kind) {
      ignored.set(o.kind, (ignored.get(o.kind) ?? 0) + 1)
      continue
    }
    const cx = scaleCoord((o.box[0] + o.box[2]) / 2)
    const cy = scaleCoord((o.box[1] + o.box[3]) / 2)
    const tag = (o.props.get('label') || o.props.get('MoName') || '').trim()
    const colorRaw = o.props.get('sig_color')
    let color: CmdPart['color']
    if (colorRaw) {
      const v = Number(colorRaw)
      // FluidSIM usa cores 16-bit aprox.; heurística simples
      if (v > 40000) color = 'yellow'
      else if (v > 20000) color = 'green'
      else color = 'red'
    }
    const part: CmdPart = {
      id: `p${++n}`,
      kind,
      x: cx,
      y: cy,
      rot: 0 as CmdRotation,
      tag: tag || '',
      page: DEFAULT_PAGE_ID,
      ...(color ? { color } : {}),
    }
    parts.push(part)
    partByIndex.set(o.index, part)
  }

  // Cabos: cada EConnection/HConnection → extremos → símbolos mais próximos
  const wires: CmdWire[] = []
  let w = 0
  const terminalAt = (p: CmdPart) => ({ x: p.x, y: p.y })
  for (let i = 0; i < objects.length; i++) {
    const o = objects[i]
    if (o.kind !== 'EConnection' && o.kind !== 'HConnection') continue
    const segs = segments.get(i) ?? []
    // Extremos em coordenadas de caixa do connector
    const points: Array<{ x: number; y: number }> = []
    if (segs.length) {
      for (const [x1, y1, x2, y2] of segs) {
        points.push({ x: scaleCoord(o.box[0] + x1), y: scaleCoord(o.box[1] + y1) })
        points.push({ x: scaleCoord(o.box[0] + x2), y: scaleCoord(o.box[1] + y2) })
      }
    } else {
      points.push({ x: scaleCoord(o.box[0]), y: scaleCoord(o.box[1]) })
      points.push({ x: scaleCoord(o.box[2]), y: scaleCoord(o.box[3]) })
    }
    if (points.length < 2) continue
    const a = points[0]
    const b = points[points.length - 1]
    const nearest = (pt: { x: number; y: number }) => {
      let best: CmdPart | null = null
      let bestD = Infinity
      for (const p of parts) {
        const t = terminalAt(p)
        const d = (t.x - pt.x) ** 2 + (t.y - pt.y) ** 2
        if (d < bestD) { bestD = d; best = p }
      }
      return best
    }
    const pa = nearest(a)
    const pb = nearest(b)
    if (!pa || !pb || pa.id === pb.id) continue
    wires.push({
      id: `w${++w}`,
      a: { part: pa.id, term: 0 },
      b: { part: pb.id, term: 0 },
      page: DEFAULT_PAGE_ID,
    })
  }

  if (!parts.length) {
    fail('não foram encontrados símbolos de circuito reconhecidos neste CT. (O ficheiro pode ser só GRAFCET — use Importar no editor GRAFCET.)')
  }

  const diagram: CommandsDiagram = {
    name: 'Importado FluidSIM',
    parts,
    wires,
    texts: [],
    pages: [{ id: DEFAULT_PAGE_ID, name: 'Página 1' }],
  }
  return {
    diagram,
    warnings: warnings.length ? warnings : (wires.length ? [] : ['Símbolos importados; ligações automáticas incompletas — complete os cabos no editor.']),
    ignored: [...ignored.entries()].map(([kind, count]) => ({ kind, count })),
    stats: { symbols: parts.length, wires: wires.length, texts: 0 },
  }
}

export async function importFluidSimCircuitFile(file: File): Promise<CircuitImportResult> {
  const buffer = new Uint8Array(await file.arrayBuffer())
  const text = circuitTextFromCt(buffer)
  return parseFluidSimCircuitText(text)
}
