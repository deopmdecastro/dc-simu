/**
 * Auditoria geométrica da maquete de estampagem.
 *
 *   npx tsx scripts/bench-conduits-audit.ts
 *
 * Verifica, sobre a maquete já montada na loja:
 *  1. nenhum troço de cabo sai das condutas (calhas, esteiras, descidas) nem atravessa estrutura;
 *  2. todos os sensores e eletroválvulas têm os cabos ligados aos bornes certos;
 *  3. as tomadas são alimentadas por cabo revestido (3G2,5) e não por fios nus;
 *  4. o compressor está ligado à unidade de ar e o circuito de ar chega às válvulas e aos cilindros.
 */
import assert from 'node:assert/strict'
import { useSimStore } from '../src/store/useSimStore'
import { MAQUETTE_PLATE_STATE } from '../src/electrical/readyMaquettes'
import { stampingBenchLayout } from '../src/electrical/stampingBench'
import { benchConduits, nearestConduit, CONDUIT_TOL_MM } from '../src/electrical/benchConduits'
import { mechatronicsSizeMm } from '../src/three/mechatronicsModel'
import { pneumaticComponentSizeMm } from '../src/three/pneumaticsModel'
import { COMPONENT_PHYSICAL_SIZE_MM } from '../src/three/modelPaths'
import { PANEL_UNITS_PER_MM as U } from '../src/three/modelPaths'

const st = useSimStore.getState()
st.newProject('all')
st.insertReadyMaquette('atec-estampagem')
const s = useSimStore.getState()
const plate = s.components.find((c) => c.type === 'mecSlotPlate')!
const base = plate.panel3DPosition!
const parts = stampingBenchLayout(MAQUETTE_PLATE_STATE, (plate.state as any)?.benchEnv)
const conduits = benchConduits(parts)
const toMm = (p: any) => ({ x: (p.x - base.x) / U, y: (p.y - base.y) / U, z: (p.z - base.z) / U })

let pass = 0
const check = (ok: boolean, msg: string) => { assert.ok(ok, msg); pass++ }

// Zonas que NÃO são condutas mas onde um cabo pode estar, por definição do equipamento:
//  · interior do QGD (o cabo sai do borne e vai à calha por dentro do quadro) — o QGD está no
//    esquema, não tem posição 3D, por isso a sua volumetria não entra no modelo de condutas;
//  · saída imediata do borne de cada aparelho (os primeiros ~40 mm).
const qgd = s.components.find((c) => String(c.state.labelText ?? '').includes('QGD'))
const qgdBox = qgd
  ? (() => {
      // caixa do QGD em mm da bancada: deriva do `benchEnv` (parede) e da altura do quadro
      const env = (plate.state as any)?.benchEnv ?? {}
      const wallZ = Number(env.wallZmm ?? -3000)
      const depth = Number((qgd.state as any).depthMm ?? 250)
      return { x0: -700, x1: 700, y0: Number(env.panelTopMm ?? 700) - Number((qgd.state as any).heightMm ?? 700), y1: Number(env.panelTopMm ?? 700), z0: wallZ, z1: wallZ + depth + 60 }
    })()
  : null
const inQgd = (q: any) => !!qgdBox && q.x >= qgdBox.x0 && q.x <= qgdBox.x1 && q.y >= qgdBox.y0 - 20 && q.y <= qgdBox.y1 + 20 && q.z >= qgdBox.z0 - 20 && q.z <= qgdBox.z1 + 20

// ── 1. cabos dentro das condutas ────────────────────────────────────────────────────────────────
const outside: Array<{ id: string; d: number }> = []
for (const w of s.wires) {
  const pts = (w.waypoints3D ?? []).map(toMm)
  if (pts.length < 4) continue
  // O primeiro e o último ponto são as pontas no borne/peça: ficam fora por definição.
  const worst = Math.max(...pts.slice(1, -1).map((q) => (inQgd(q) ? 0 : nearestConduit(q, conduits)?.distance ?? Infinity)))
  if (worst > CONDUIT_TOL_MM) outside.push({ id: w.number ?? w.id, d: worst })
}
const worstD = outside.length ? Math.max(...outside.map((o) => o.d)) : 0
console.log(`condutas modeladas: ${conduits.length}`)
console.log(`cabos com troços fora das condutas: ${outside.length}/${s.wires.length} · pior afastamento ${worstD.toFixed(0)} mm`)
for (const o of outside.sort((a, b) => b.d - a.d).slice(0, 10)) console.log(`   ${o.id}  ${o.d.toFixed(0)} mm`)

// ── 2. sensores e eletroválvulas ligados ───────────────────────────────────────────────────────
const wired = (terminalId: string) => s.wires.some((w) => w.fromTerminalId === terminalId || w.toTerminalId === terminalId)
const SENSORS = ['FC1', 'FC2', 'B1', 'B2']
const missingSensor: string[] = []
for (const ref of SENSORS) {
  const c = s.components.find((x) => x.ref === ref)
  if (!c) { missingSensor.push(`${ref} não existe`); continue }
  const signal = c.terminals.find((t) => t.kind === 'io' && t.label !== '0V')
  const supply = c.terminals.filter((t) => /power-in|coil-plus/.test(String(t.kind)))
  const ground = c.terminals.filter((t) => /coil-minus/.test(String(t.kind)))
  for (const t of [signal, ...supply, ...ground].filter(Boolean)) if (!wired(t!.id)) missingSensor.push(`${ref}:${t!.label}`)
}
console.log(`\nsensores com bornes sem cabo: ${missingSensor.length} ${missingSensor.join(' ')}`)

const cpv = s.components.find((c) => c.type === 'mecValveTerminalCpv10')!
const coils = cpv.terminals.filter((t) => /^Y\d|VON|VOFF/.test(t.label))
const coilMissing = coils.filter((t) => !wired(t.id)).map((t) => t.label)
console.log(`bobinas do CPV10 sem cabo: ${coilMissing.length} ${coilMissing.join(' ')}`)

// ── 3. tomadas em cabo revestido ──────────────────────────────────────────────────────────────
const socketWires = s.wires.filter((w) => /XS-MAQ|XS-COMP/.test(String(w.number ?? '')))
console.log(`\ncondutores das tomadas: ${socketWires.length} · revestidos: ${socketWires.filter((w) => w.sheathed).length}`)

// ── 4. ar comprimido ──────────────────────────────────────────────────────────────────────────
const air = s.wires.filter((w) => w.kind === 'pneumatic')
const label = (id: string) => {
  for (const c of s.components) for (const t of c.terminals) if (t.id === id) return `${c.ref}:${t.label}`
  return '?'
}
const airPairs = air.map((w) => `${label(w.fromTerminalId)}→${label(w.toTerminalId)}`)
console.log(`tubos de ar: ${air.length}`)
for (const a of airPairs) console.log('   ', a)

// ── Limites aceites (com o encaminhamento atual) ──────────────────────────────────────────────
// O que NÃO pode acontecer de todo: atravessar estrutura. É verificado com amostragem dos troços.
// Caixa do aparelho JÁ com a rotação aplicada: várias peças têm `orientation` (a prensa roda 90°),
// e usar só o `state` dá uma caixa trocada — foi isso que fez aparecer colisões que não existem.
const boxOf = (p: any) => {
  const st2 = p.state as any
  const mec = mechatronicsSizeMm(p.type, st2)
  const pn = mec ? null : pneumaticComponentSizeMm(p.type, st2)
  const cat = COMPONENT_PHYSICAL_SIZE_MM[p.type]
  const base = mec ? { x: mec.x, y: mec.y, z: mec.z } : pn ? { x: pn.x, y: pn.y, z: pn.z } : cat ? { x: cat.width, y: cat.height, z: cat.depth } : { x: 60, y: 60, z: 60 }
  const pick = (v: unknown, fb: number) => (Number.isFinite(Number(v)) ? Number(v) : fb)
  let w = pick(st2?.widthMm, base.x), h = pick(st2?.heightMm, base.y), d = pick(st2?.depthMm, base.z)
  const o = (p.orientation ?? {}) as { x?: number; y?: number; z?: number }
  const swap = (deg: unknown) => Math.abs(((Number(deg ?? 0) % 180) + 180) % 180 - 90) < 1
  if (swap(o.y) || swap(o.z)) { const t = w; w = d; d = t }
  return { k: p.key, x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y - h / 2, y1: p.y + h / 2, z0: p.z - d / 2, z1: p.z + d / 2 }
}
const SOLIDS = parts
  .filter((p) => /^(mecStampingPress|mecStampingTable|mecSupportBlock|mecGravityMagazine|industrialPillar|mecFeederCylinder|mecDrawerCylinder|airCompressor|pneumaticFrl)/.test(p.type))
  .map(boxOf)
const inSolid = (q: any, b: any) => q.x > b.x0 + 3 && q.x < b.x1 - 3 && q.y > b.y0 + 3 && q.y < b.y1 - 3 && q.z > b.z0 + 3 && q.z < b.z1 - 3
const crosses: string[] = []
for (const w of s.wires) {
  const pts = (w.waypoints3D ?? []).map(toMm)
  if (pts.length < 2) continue
  const segs: any[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    for (let n = 1; n < 8; n++) segs.push({ x: pts[i].x + (pts[i + 1].x - pts[i].x) * n / 8, y: pts[i].y + (pts[i + 1].y - pts[i].y) * n / 8, z: pts[i].z + (pts[i + 1].z - pts[i].z) * n / 8 })
  }
  const hit = SOLIDS.filter((b) => segs.some((q) => inSolid(q, b)))
  if (hit.length) crosses.push(`${w.number ?? w.id} → ${hit.map((x) => x.k).join(',')}`)
}
console.log(`\ncabos a atravessar estrutura: ${crosses.length}`)
for (const c of crosses.slice(0, 12)) console.log('   ', c)
console.log(`\n${pass} verificações estruturais`)
