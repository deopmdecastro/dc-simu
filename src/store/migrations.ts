/**
 * Migração de gravações antigas: bits de E/S/memórias passam de «I1», «Q2»,
 * «M3»… para a forma Siemens byte.bit («I0.0», «Q0.1», «M0.2»…). Palavras
 * MWn/MBn/MDn, temporizadores Tn e contadores Cn ficam intactos. É idempotente
 * — endereços já no formato novo são devolvidos tal como estão.
 */
import { migrateBitAddress } from '../ladder/addresses'

type AnyRecord = Record<string, unknown>

const fix = (raw: unknown): string | unknown => (typeof raw === 'string' ? migrateBitAddress(raw) : raw)

const fixElement = (el: unknown): unknown => {
  if (!el || typeof el !== 'object') return el
  const e = { ...(el as AnyRecord) }
  if (typeof e.address === 'string') e.address = migrateBitAddress(e.address)
  if (typeof e.compareValue === 'string') e.compareValue = migrateBitAddress(e.compareValue)
  return e
}

const fixRung = (rung: unknown): unknown => {
  if (!rung || typeof rung !== 'object') return rung
  const r = { ...(rung as AnyRecord) }
  if (Array.isArray(r.branches)) r.branches = r.branches.map((b) => (b && typeof b === 'object' ? { ...(b as AnyRecord), elements: Array.isArray((b as AnyRecord).elements) ? ((b as AnyRecord).elements as unknown[]).map(fixElement) : (b as AnyRecord).elements } : b))
  if (Array.isArray(r.coils)) r.coils = r.coils.map((c) => (c && typeof c === 'object' ? { ...(c as AnyRecord), address: fix((c as AnyRecord).address) } : c))
  if (r.timer && typeof r.timer === 'object') r.timer = { ...(r.timer as AnyRecord), address: fix((r.timer as AnyRecord).address), resetAddress: (r.timer as AnyRecord).resetAddress ? fix((r.timer as AnyRecord).resetAddress) : undefined }
  if (r.counter && typeof r.counter === 'object') r.counter = { ...(r.counter as AnyRecord), address: fix((r.counter as AnyRecord).address), resetAddress: (r.counter as AnyRecord).resetAddress ? fix((r.counter as AnyRecord).resetAddress) : undefined }
  if (r.move && typeof r.move === 'object') r.move = { ...(r.move as AnyRecord), source: fix((r.move as AnyRecord).source), target: fix((r.move as AnyRecord).target) }
  if (r.math && typeof r.math === 'object') r.math = { ...(r.math as AnyRecord), in1: fix((r.math as AnyRecord).in1), in2: fix((r.math as AnyRecord).in2), out: fix((r.math as AnyRecord).out) }
  return r
}

const fixRungList = (list: unknown): unknown => (Array.isArray(list) ? list.map(fixRung) : list)

const fixTableKeys = (table: unknown): unknown => {
  if (!table || typeof table !== 'object' || Array.isArray(table)) return table
  return Object.fromEntries(Object.entries(table as AnyRecord).map(([key, value]) => [migrateBitAddress(key), value]))
}

export function migrateLegacyAddresses(parsed: AnyRecord): AnyRecord {
  const out = { ...parsed }
  // Ladder principal e legado
  if (out.ladder && typeof out.ladder === 'object') out.ladder = { ...(out.ladder as AnyRecord), rungs: fixRungList((out.ladder as AnyRecord).rungs) }
  out.ladderLegacy = fixRungList(out.ladderLegacy)
  // FCs fixos e programas por PLC
  for (const key of ['fcBlocks']) {
    const v = out[key]
    if (v && typeof v === 'object') out[key] = Object.fromEntries(Object.entries(v as AnyRecord).map(([k, rungs]) => [k, fixRungList(rungs)]))
  }
  if (out.plcPrograms && typeof out.plcPrograms === 'object') {
    out.plcPrograms = Object.fromEntries(Object.entries(out.plcPrograms as AnyRecord).map(([plcId, prog]) => {
      if (!prog || typeof prog !== 'object') return [plcId, prog]
      const p: AnyRecord = { ...(prog as AnyRecord), rungs: fixRungList((prog as AnyRecord).rungs) }
      if ((prog as AnyRecord).fc1) p.fc1 = fixRungList((prog as AnyRecord).fc1)
      if ((prog as AnyRecord).fc2) p.fc2 = fixRungList((prog as AnyRecord).fc2)
      return [plcId, p]
    }))
  }
  // Ficheiros de projeto (blocos com networks ladder)
  if (out.projectFiles && typeof out.projectFiles === 'object') {
    out.projectFiles = Object.fromEntries(Object.entries(out.projectFiles as AnyRecord).map(([bucket, files]) => [
      bucket,
      Array.isArray(files) ? files.map((f) => (f && typeof f === 'object' ? { ...(f as AnyRecord), rungs: fixRungList((f as AnyRecord).rungs) } : f)) : files,
    ]))
  }
  // Entradas virtuais e a tabela de execução guardada
  out.virtualInputs = fixTableKeys(out.virtualInputs)
  if (out.runtime && typeof out.runtime === 'object') {
    const rt = { ...(out.runtime as AnyRecord) }
    rt.table = fixTableKeys(rt.table)
    if (rt.plcRuntime && typeof rt.plcRuntime === 'object') {
      rt.plcRuntime = Object.fromEntries(Object.entries(rt.plcRuntime as AnyRecord).map(([plcId, pr]) => (pr && typeof pr === 'object' ? [plcId, { ...(pr as AnyRecord), table: fixTableKeys((pr as AnyRecord).table) }] : [plcId, pr])))
    }
    out.runtime = rt
  }
  // Tabela de variáveis
  if (Array.isArray(out.tags)) out.tags = (out.tags as AnyRecord[]).map((t) => (t && typeof t === 'object' ? { ...t, address: fix(t.address) } : t))
  if (out.plcTags && typeof out.plcTags === 'object') {
    out.plcTags = Object.fromEntries(Object.entries(out.plcTags as AnyRecord).map(([plcId, tags]) => [
      plcId,
      Array.isArray(tags) ? tags.map((t) => (t && typeof t === 'object' ? { ...(t as AnyRecord), address: fix((t as AnyRecord).address) } : t)) : tags,
    ]))
  }
  // Bornes dos PLCs: rótulos antigos I1.. → I0.x… (no LOGO!, o parafuso «Qn.2»
  // do relé vira «Q0.n·2» para não colidir com a numeração Siemens).
  if (Array.isArray(out.components)) {
    out.components = (out.components as AnyRecord[]).map((c) => {
      if (!c || typeof c !== 'object' || !Array.isArray(c.terminals)) return c
      const comp = { ...c }
      comp.terminals = (c.terminals as AnyRecord[]).map((t) => {
        if (!t || typeof t !== 'object' || typeof t.label !== 'string') return t
        const label = t.label as string
        const relay2 = label.match(/^Q(\d+)\.2$/)
        const next = relay2 ? `${migrateBitAddress(`Q${Number(relay2[1])}`)}·2` : migrateBitAddress(label)
        return next !== label ? { ...t, label: next } : t
      })
      if (comp.state && typeof comp.state === 'object' && (comp.state as AnyRecord).outputs) comp.state = { ...(comp.state as AnyRecord), outputs: fixTableKeys((comp.state as AnyRecord).outputs) }
      return comp
    })
  }
  return out
}
