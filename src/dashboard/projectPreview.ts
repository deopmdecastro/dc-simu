/** Resumo leve de um projeto guardado: geometria do esquema (componentes + fios)
 *  e contagens. Usado pelo cover do dashboard — no backend local e no servidor. */
export type PreviewComponent = {
  x: number
  y: number
  w: number
  h: number
  r: number
  t: string
  ref: string
  c?: string
  /** espelhado na horizontal */
  m?: 1
  /** orientação da vista (graus) escolhida no editor de componente */
  o?: [number, number, number]
  p: Array<[number, number]>
}
export type PreviewWire = { a: [number, number]; b: [number, number]; c?: string }
export type ProjectPreviewData = {
  components: PreviewComponent[]
  wires: PreviewWire[]
  /** contagens reais do projeto (o preview pode estar truncado) */
  stats?: { components: number; wires: number; rungs: number }
  /** miniatura real do painel 3D (JPEG data URL) capturada pelo editor ao guardar */
  cover?: string
}

/** Valida a miniatura guardada no conteúdo do projeto. */
export function previewCoverOf(data: unknown): string | undefined {
  const value = (data as { cover?: unknown } | null)?.cover
  return typeof value === 'string' && value.startsWith('data:image/jpeg;base64,') && value.length <= 420_000 ? value : undefined
}

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
type Json = Record<string, unknown>
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object'

export function buildProjectPreview(content: unknown): ProjectPreviewData {
  let data: unknown = content
  if (typeof content === 'string') {
    try { data = JSON.parse(content) } catch { return { components: [], wires: [] } }
  }
  if (!isObj(data)) return { components: [], wires: [] }
  const rawList = Array.isArray(data.components) ? (data.components as unknown[]) : []
  const rawWires = Array.isArray(data.wires) ? (data.wires as unknown[]) : []
  const at = new Map<string, [number, number]>()

  const components: PreviewComponent[] = []
  for (const raw of rawList.slice(0, 400)) {
    if (!isObj(raw) || !Number.isFinite(raw.schematicX) || !Number.isFinite(raw.schematicY)) continue
    const sx = raw.schematicX as number
    const sy = raw.schematicY as number
    const w = num(raw.w) || 60
    const h = num(raw.h) || 40
    const r = num(raw.rotation)
    const p: Array<[number, number]> = []
    const terminals = Array.isArray(raw.terminals) ? (raw.terminals as unknown[]).slice(0, 64) : []
    for (const t of terminals) {
      if (!isObj(t)) continue
      let lx = num(t.x) - 0.5
      let ly = num(t.y) - 0.5
      if (raw.mirrored) lx = -lx
      for (let i = 0; i < Math.round(r / 90) % 4; i++) [lx, ly] = [-ly, lx]
      const x = sx + w / 2 + lx * w
      const y = sy + h / 2 + ly * h
      if (typeof t.id === 'string') at.set(t.id, [x, y])
      p.push([Math.round(x), Math.round(y)])
    }
    const vo = isObj(raw.viewOrientation) ? raw.viewOrientation : null
    const o: [number, number, number] | undefined =
      vo && (num(vo.x) || num(vo.y) || num(vo.z)) ? [num(vo.x), num(vo.y), num(vo.z)] : undefined
    components.push({
      x: Math.round(sx), y: Math.round(sy), w: Math.round(w), h: Math.round(h), r,
      t: String(raw.type ?? ''),
      ref: String(raw.ref ?? '').slice(0, 8),
      c: typeof raw.bodyColor === 'string' ? raw.bodyColor.slice(0, 9) : undefined,
      m: raw.mirrored ? 1 : undefined,
      o,
      p,
    })
  }

  const wires: PreviewWire[] = []
  for (const raw of rawWires.slice(0, 800)) {
    if (!isObj(raw)) continue
    const pt = (id: unknown, fallback: unknown): [number, number] | undefined => {
      const hit = typeof id === 'string' ? at.get(id) : undefined
      if (hit) return hit
      return isObj(fallback) && Number.isFinite(fallback.x) && Number.isFinite(fallback.y) ? [fallback.x as number, fallback.y as number] : undefined
    }
    const a = pt(raw.fromTerminalId, raw.fromPoint)
    const b = pt(raw.toTerminalId, raw.toPoint)
    if (!a || !b) continue
    wires.push({
      a: [Math.round(a[0]), Math.round(a[1])],
      b: [Math.round(b[0]), Math.round(b[1])],
      c: typeof raw.color === 'string' ? raw.color.slice(0, 16) : undefined,
    })
  }

  const ladder = isObj(data.ladder) && Array.isArray(data.ladder.rungs) ? data.ladder.rungs.length : 0
  return { components, wires, cover: previewCoverOf(data), stats: { components: rawList.length, wires: rawWires.length, rungs: ladder } }
}
