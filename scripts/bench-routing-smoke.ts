// Regras de encaminhamento da maquete de estampagem (esteiras + QE1).
//   npx tsx scripts/bench-routing-smoke.ts
// 1. Cabos 3G2,5 e tubo de ar DENTRO das esteiras (pista dentro das abas).
// 2. Tubo de ar afastado ≥ 50 mm dos cabos nos troços partilhados e sem recuos (A→B→A).
// 3. Tubo de ar não atravessa as caixas das tomadas XS-COMP / XS-MAQ.
// 4. Cablagem interior do QE1 sem diagonais: cada troço muda um só eixo (tolerância 3 mm).
// 5. Bundles do QE1 coerentes: o cabo da ficha F-MAQ tem bundle próprio (bainha/aperto por bundle).
import { readyMaquetteById, readyMaquetteParts } from '../src/electrical/readyMaquettes'
import { stampingBenchWiring } from '../src/electrical/stampingBenchWiring'
import { SOCKET_DEVICES } from '../src/electrical/socketDevices'

type P = { x: number; y: number; z: number }
let checks = 0
const ok = (cond: unknown, name: string) => {
  if (!cond) { console.error(`FAIL: ${name}`); process.exit(1) }
  checks += 1
  console.log(`  PASS: ${name}`)
}

const mq = readyMaquetteById('atec-estampagem')!
const parts = readyMaquetteParts(mq.id, mq.plateState, { wallZmm: -3000, panelXmm: 0, panelTopMm: 50 } as never)
const part = (k: string) => parts.find((p) => p.key === k)!
const wires = stampingBenchWiring(parts, mq.plateState)
const wire = (id: string) => wires.find((w) => w.id === id)!

// Segmentos de um percurso que correm DENTRO de uma esteira horizontal (à cota do fundo).
const wall = part('tray-wall'), toBench = part('tray-to-bench')
const half = (t: typeof wall) => Number(t.state?.widthMm) / 2
const onWallTray = (p: P) => Math.abs(p.y - wall.y) < 40 && Math.abs(p.x - wall.x) <= Number(wall.state?.lengthMm) / 2
const onBranch = (p: P) => Math.abs(p.y - toBench.y) < 40 && p.z > wall.z + half(wall) - 1

// 1. Pistas dentro das abas (folga ≥ 15 mm à aba).
for (const id of ['mq-3g25-maquete-l', 'mq-3g25-maquete-pe', 'mq-3g25-compressor-l', 'mq-3g25-compressor-pe', 'ar-cmp-frl']) {
  const pts = wire(id).waypointsMm
  const wallPts = pts.filter((p) => onWallTray(p) && Math.abs(p.z - wall.z) < 200 && Math.abs(p.x - toBench.x) > half(toBench) + 1)
  ok(wallPts.every((p) => Math.abs(p.z - wall.z) <= half(wall) - 15), `${id}: pista na esteira de parede dentro das abas (|dz| ≤ ${half(wall) - 15} mm)`)
  const branchPts = pts.filter(onBranch)
  ok(branchPts.every((p) => Math.abs(p.x - toBench.x) <= half(toBench) - 15), `${id}: pista no ramal QGD → BANCADA dentro das abas`)
}

// 2. Separação tubo ↔ cabos no ramal e na esteira de parede; sem recuos.
const air = wire('ar-cmp-frl').waypointsMm
const airBranchX = air.filter(onBranch).map((p) => p.x)
const cableBranchX = wire('mq-3g25-maquete-l').waypointsMm.filter(onBranch).map((p) => p.x)
ok(airBranchX.length > 0 && cableBranchX.length > 0 && Math.min(...cableBranchX) - Math.max(...airBranchX) >= 50,
  'Ramal QGD → BANCADA: tubo de ar e 3G2,5 da maquete em metades opostas (≥ 50 mm)')
const airWallZ = air.filter((p) => onWallTray(p) && Math.abs(p.z - wall.z) < half(wall)).map((p) => p.z)
const cmpWallZ = wire('mq-3g25-compressor-l').waypointsMm.filter((p) => onWallTray(p) && Math.abs(p.z - wall.z) < half(wall)).map((p) => p.z)
ok(Math.min(...airWallZ) - Math.max(...cmpWallZ) >= 90, 'Esteira de parede: tubo de ar (lado da nave) a ≥ 90 mm do 3G2,5 do compressor (lado da parede)')
const backtrack = air.some((p, i) => {
  if (i < 2) return false
  const a = air[i - 2], b = air[i - 1]
  const d1 = [b.x - a.x, b.y - a.y, b.z - a.z], d2 = [p.x - b.x, p.y - b.y, p.z - b.z]
  const dot = d1[0] * d2[0] + d1[1] * d2[1] + d1[2] * d2[2]
  return dot < -1e-6 && Math.hypot(...d1) > 1 && Math.hypot(...d2) > 1 && Math.abs(dot / (Math.hypot(...d1) * Math.hypot(...d2)) + 1) < 1e-3
})
ok(!backtrack, 'Tubo de ar sem recuos (antes passava 40 mm do T e voltava atrás — gancho na junção)')

// 3. Tubo fora das caixas das tomadas.
const box = (k: string) => {
  const s = part(k), d = SOCKET_DEVICES.socketFamatelSwitch
  return { min: { x: s.x - d.width / 2, y: s.y - d.height / 2, z: s.z - d.depth / 2 }, max: { x: s.x + d.width / 2, y: s.y + d.height / 2, z: s.z + d.depth / 2 } }
}
const segHitsBox = (a: P, b: P, bx: ReturnType<typeof box>, r = 5) => {
  for (let t = 0; t <= 1; t += 0.01) {
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }
    if (p.x > bx.min.x - r && p.x < bx.max.x + r && p.y > bx.min.y - r && p.y < bx.max.y + r && p.z > bx.min.z - r && p.z < bx.max.z + r) return true
  }
  return false
}
for (const k of ['socket-compressor', 'socket-bench']) {
  const bx = box(k)
  ok(!air.some((p, i) => i > 0 && segHitsBox(air[i - 1], p, bx)), `Tubo de ar não atravessa a caixa da tomada ${k}`)
}

// 4. QE1 sem diagonais (troços interiores, em coordenadas do mundo).
const qe1Ids = wires.filter((w) => /^qe1-(di|do|supply|x1-ps1|ps1-out)-/.test(w.id)).map((w) => w.id)
ok(qe1Ids.length > 30, `QE1: ${qe1Ids.length} fios interiores analisados`)
const diag = (pts: P[]) => pts.reduce((worst, p, i) => {
  if (i === 0) return worst
  const d = [p.x - pts[i - 1].x, p.y - pts[i - 1].y, p.z - pts[i - 1].z].map(Math.abs).sort((a, b) => b - a)
  return Math.max(worst, d[1]) // 2.º maior eixo do troço = componente diagonal
}, 0)
const worst = qe1Ids.map((id) => ({ id, d: diag(wire(id).waypointsMm) })).sort((a, b) => b.d - a.d)[0]
ok(worst.d <= 3, `QE1: nenhum troço em diagonal (pior ${worst.id}: ${worst.d.toFixed(1)} mm fora de eixo)`)

// 5. Bundles.
const bundleOf = (prefix: string) => new Set(wires.filter((w) => w.id.startsWith(prefix)).map((w) => w.bundleId))
const plugCable = bundleOf('qe1-maq-x1-')
ok(plugCable.size === 1 && !bundleOf('qe1-supply-').has([...plugCable][0]) && !bundleOf('qe1-ps1-out-').has([...plugCable][0]),
  'Cabo da ficha F-MAQ → X1 com bundle exclusivo (não puxa X20 → S7-300 nem PS1 → X20 para o seu eixo)')

// 6. Cabo 3G2,5 QGD → tomadas: L, N e PE num só cabo, a sair pelo bucim do QGD e a entrar pelo bucim
//    (bico) da tomada a direito, sem gancho (descer e voltar a subir).
for (const cable of ['mq-3g25-maquete', 'mq-3g25-compressor']) {
  const cores = ['l', 'n', 'pe'].map((c) => wire(`${cable}-${c}`))
  ok(new Set(cores.map((w) => w.bundleId)).size === 1 && cores.every((w) => w.sheathed && w.conductorCount === 3),
    `${cable}: L, N e PE no mesmo cabo revestido 3G (um bundle, bainha comum)`)
  ok(cores.every((w) => 'ref' in w.from) && cores[2].to.label === 'PE' && cores[2].color === 'green-yellow',
    `${cable}: terra verde-amarela da barra PE do QGD ao borne PE da tomada`)
  for (const w of cores) {
    const pts = w.waypointsMm
    const firstUp = pts.findIndex((p, i) => i > 0 && p.y < pts[i - 1].y - 1)
    ok(firstUp > 0 && pts.slice(0, firstUp).every((p, i) => i === 0 || p.y >= pts[i - 1].y - 0.01),
      `${w.id}: sai do QGD sempre a subir pelo bucim (sem gancho por baixo dele)`)
    const tail = pts.slice(-4)
    ok(tail.every((p) => Math.abs(p.x - tail[0].x) < 0.01 && Math.abs(p.z - tail[0].z) < 0.01) && tail.every((p, i) => i === 0 || p.y < tail[i - 1].y),
      `${w.id}: entra na tomada a descer a direito pelo eixo do bucim`)
    const s = w.sheathToMm!
    ok(Math.abs(s.x - tail[0].x) < 0.01 && Math.abs(s.z - tail[0].z) < 0.01 && s.y < tail[0].y && s.y > tail[tail.length - 1].y,
      `${w.id}: bainha termina na boca do bucim da tomada, no eixo das veias`)
    const fromDrop = pts.findIndex((p) => p.y < 1400 && p.z > wall.z + 200 || (cable.endsWith('compressor') && p.y < 1400 && p.x < -1000))
    const after = pts.slice(Math.max(1, fromDrop))
    ok(fromDrop > 0 && after.every((p, i) => i === 0 || p.y <= after[i - 1].y + 0.01),
      `${w.id}: da esteira à tomada só desce (sem voltar a subir antes do bucim)`)
  }
}

console.log(`\n${checks} verificações · encaminhamento esteiras/QE1 OK`)
