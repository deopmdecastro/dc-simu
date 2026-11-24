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
import { BENCH_TERMINAL_STRIPS } from '../src/electrical/stampingBench'
import { s7300Sm321TerminalRows, s7300Sm322TerminalRows } from '../src/electrical/siemensPlc'
import { createComponent } from '../src/electrical/factory'

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

// 7. QE1: cada fio entra/sai da calha por uma RANHURA (vão entre dentes), não por cima de um dente.
{
  const t1 = part('terminals-X21-1'), t2 = part('terminals-X21-2')
  // Eixo do comprimento das calhas no mundo (o QE1 está rodado): sinal e eixo a partir de duas réguas.
  const lx = t2.qe1Local!.x - t1.qe1Local!.x
  const useZ = Math.abs(t2.z - t1.z) > Math.abs(t2.x - t1.x)
  const sign = ((useZ ? t2.z - t1.z : t2.x - t1.x) / lx) > 0 ? 1 : -1
  const ducts = ['cabinet-duct-top', 'cabinet-duct-midAB', 'cabinet-duct-midBC'].map(part).filter(Boolean)
  const PITCH = 12.5, SLOT = 4.5
  let entries = 0, worst = 0
  for (const id of qe1Ids) {
    const pts = wire(id).waypointsMm
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i]
      // troço que atravessa a parede da calha: só muda a altura, dentro da faixa de uma calha horizontal
      for (const d of ducts) {
        const half = (Number(d.state?.widthMm) || 40) / 2
        const crosses = Math.abs(a.y - d.y) > half && Math.abs(b.y - d.y) < half && Math.abs(a.x - b.x) < 0.01 && Math.abs(a.z - b.z) < 0.01
        if (!crosses) continue
        const along = sign * ((useZ ? b.z - d.z : b.x - d.x))
        const L = Number(d.state?.lengthMm) || 376
        const n = Math.max(1, Math.floor((L - SLOT) / PITCH))
        const first = -((n - 1) * PITCH) / 2
        if (Math.abs(along) > L / 2 - 2) continue // entra pela ponta (união com a calha vertical), não pelos dentes
        const off = (along - first) / PITCH - 0.5
        worst = Math.max(worst, Math.abs(off - Math.round(off)) * PITCH)
        entries += 1
      }
    }
  }
  ok(entries >= qe1Ids.length, `QE1: ${entries} entradas em calha analisadas`)
  ok(worst <= SLOT / 2 - 0.5, `QE1: todas as entradas na calha pelo vão entre dentes (pior desvio ao centro da ranhura ${worst.toFixed(2)} mm)`)
}

// 8. Tubo de ar a entrar/sair das descidas pela face aberta — nunca através das abas laterais.
for (const k of ['tray-drop-compressor', 'tray-drop-bench']) {
  const d = part(k)
  const halfW = Number(d.state?.widthMm) / 2, halfL = Number(d.state?.lengthMm) / 2
  const flangeTop = d.z + 30 + 6 // aba de 60 mm (fundo a d.z − 30) + rebordo
  let pierce = 0
  for (let i = 1; i < air.length; i++) {
    const a = air[i - 1], b = air[i]
    for (let t = 0; t <= 1; t += 0.02) {
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }
      if (p.y < d.y - halfL - 12 || p.y > d.y + halfL || Math.abs(p.z - d.z) > 120) continue
      const nearWall = Math.abs(Math.abs(p.x - d.x) - halfW) < 5 + 2.5 // raio do tubo + espessura da aba
      if (nearWall && p.z < flangeTop + 5) { pierce += 1; if (process.env.DBG) console.log(k, p) }
    }
  }
  ok(pierce === 0, `Tubo de ar não atravessa as abas da ${k} (sai/entra pela face aberta)`)
}

// 9. Subida do QGD: os dois 3G2,5 (maquete e compressor) sobem lado a lado, encostados mas separados.
{
  const riser = part('tray-riser-qgd')
  const axisAt = (cable: string) => {
    const pts = ['l', 'n', 'pe'].map((c) => wire(`${cable}-${c}`).waypointsMm.find((p) => p.y > 150 && p.y < 1300 && Math.abs(p.z - riser.z) < 1)!)
    return pts.reduce((a, p) => a + p.x, 0) / pts.length
  }
  const gap = Math.abs(axisAt('mq-3g25-maquete') - axisAt('mq-3g25-compressor'))
  ok(gap >= 12 && gap <= 20, `Subida do QGD: os dois cabos 3G2,5 lado a lado (eixos a ${gap.toFixed(1)} mm — Ø ≈ 11 mm, encostados sem se sobreporem)`)
}

// 10. Bornes do S7-300: pinagem real do conector de 40 pólos e correspondência régua ↔ endereço.
{
  const di = new Map(s7300Sm321TerminalRows().map((r) => [r.label, r.pin]))
  const dq = new Map(s7300Sm322TerminalRows().map((r) => [r.label, r.pin]))
  ok([0, 1, 2, 3].every((b) => Array.from({ length: 8 }, (_, k) => di.get(`I${b}.${k}`)).join() === Array.from({ length: 8 }, (_, k) => [2, 12, 22, 32][b] + k).join()),
    'SM321: I0.x bornes 2–9, I1.x 12–19, I2.x 22–29, I3.x 32–39')
  ok(di.get('M') === 20 && di.get('2M') === 40 && ![1, 11, 21, 31].some((p) => [...di.values()].includes(p)), 'SM321: 1M borne 20, 2M borne 40; bornes 1/11/21/31 livres (sem L+)')
  ok(dq.get('L+') === 1 && dq.get('M') === 10 && dq.get('2L+') === 11 && dq.get('2M') === 20 && dq.get('3L+') === 21 && dq.get('3M') === 30 && dq.get('4L+') === 31 && dq.get('4M') === 40,
    'SM322: grupos 1L+/1M 1/10, 2L+/2M 11/20, 3L+/3M 21/30, 4L+/4M 31/40')
  ok(dq.get('Q4.0') === 2 && dq.get('Q4.7') === 9 && dq.get('Q5.0') === 12 && dq.get('Q5.6') === 18, 'SM322: Q4.x bornes 2–9, Q5.x 12–19')
  const terms = new Set(createComponent('plcSiemensS7300Sm321Di32').terminals.map((t) => t.label))
  ok(!terms.has('L+') && terms.has('M') && terms.has('2M'), 'SM321 criado sem borne L+ (como o aparelho)')
  // Cada cabo régua → módulo: o marcador da régua é o endereço do borne do módulo.
  let mism = 0, count = 0
  for (const strip of BENCH_TERMINAL_STRIPS.filter((s) => s.strip === 'X21' || s.strip === 'X22')) {
    strip.points.forEach(({ marker }, i) => {
      const w = wires.find((x) => x.from && 'key' in x.from && x.from.key === `terminals-${strip.strip}-${i + 1}` && /^qe1-(di|do)-/.test(x.id))
      if (!w || !marker) return
      count++
      if (w.to.label !== marker) { mism++; console.error(`  ${strip.strip}.${i + 1} marcado ${marker} → módulo ${w.to.label}`) }
    })
  }
  ok(count === 31 && mism === 0, `X21/X22 → S7-300: ${count} cabos, cada borne da régua ligado ao endereço que o marca`)
  const bridges = wires.filter((w) => w.id.startsWith('qe1-sm322-ponte-'))
  ok(bridges.length === 2 && wires.some((w) => /^qe1-supply-cabinet-plc-do-Lp/.test(w.id)) && wires.some((w) => /^qe1-supply-cabinet-plc-do-M/.test(w.id)),
    'SM322: 1L+/1M alimentados por X20 e pontes para 2L+/2M (grupo de Q5.x)')
  ok(wires.some((w) => /^qe1-supply-cabinet-plc-di-M/.test(w.id)) && !wires.some((w) => /^qe1-supply-cabinet-plc-di-Lp/.test(w.id)), 'SM321: só 1M ligado a 0 V (sem L+)')
}

// 11. Composição da maquete (fotografias): rampas iguais, paralelas, alinhadas e por ordem; motor M1
//     com o pinhão apontado ao eixo do braço.
{
  const ramps = ['ramp1', 'ramp2', 'ramp3'].map(part)
  ok(new Set(ramps.map((r) => `${r.state?.lengthMm}|${r.state?.pillarMm}|${Math.round(r.x)}|${Math.round(r.y)}`)).size === 1 && ramps.every((r) => !r.orientation),
    'Rampas iguais e paralelas, com as bocas alinhadas na mesma linha e à mesma altura')
  const byZ = ramps.slice().sort((a, b) => a.z - b.z).map((r) => r.state?.rampLabel)
  ok(byZ.join() === 'METALICA,PRETA,BRANCA', `Ordem das rampas a partir da HMI: ${byZ.join(' · ')}`)
  const zs = ramps.map((r) => r.z).sort((a, b) => a - b)
  ok(zs[1] - zs[0] >= 58 + 20 && zs[2] - zs[1] >= 58 + 20, 'Rampas lado a lado sem se tocarem (≥ 20 mm entre abas)')
  const hmi = part('hmi')
  const rampEnd = ramps[0].x + 161 / 2
  ok(rampEnd < hmi.x - 43, 'Rampa METALICA termina antes do bastidor da HMI')
  const motor = part('motor'), arm = part('arm')
  ok(!motor.orientation && Math.abs(motor.z - arm.z) < 1 && motor.x < arm.x, 'Motor M1 deitado, com o eixo apontado ao eixo do braço (pinhão na roda cónica)')
}

console.log(`\n${checks} verificações · encaminhamento esteiras/QE1 OK`)
