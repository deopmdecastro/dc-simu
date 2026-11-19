// Gera os GLB dos interruptores de corte Schneider Easy9 Switch (EZ9S) de 1, 2
// e 4 polos a partir do STEP oficial do fabricante (MCADFD0001285, gama iSW/SW
// modular 18 mm — o mesmo molde do Easy9 Switch, conforme IEC 60947-3).
//
//   node --import tsx scripts/build-ez9s-glb.mjs
//
// Convenção do GLB: metros, de pé (topo = +Y), frente (manípulo vermelho e
// parafusos) = +Z, traseira (entalhe da calha DIN) em z = 0 — a mesma dos
// disjuntores Easy9 (`breaker1p/2p/3p`). O manípulo vai em malhas
// `dcsimu_handle_*` sob um pivot, para o Painel 3D bascular ON/OFF.
import { source, makeRoot, addMesh, pivot, faceBounds, cavities, status, saveModel, manifest, materials as m } from './lib/schneider-building.mjs'
import { mat, box, cylinder, plane } from './lib/cad-building.mjs'

const red = mat('#c8352b', .12, .4)          // manípulo Easy9 Switch (vermelho)
const redDark = mat('#9e241c', .12, .45)

const VARIANTS = [
  { type: 'switchSchneiderEz9s1p', path: '/models/protecao/schneider-ez9s-1p.glb', poles: 1, inA: 63, code: 'EZ9S16163' },
  { type: 'switchSchneiderEz9s2p', path: '/models/protecao/schneider-ez9s-2p.glb', poles: 2, inA: 63, code: 'EZ9S16263' },
  { type: 'switchSchneiderEz9s4p', path: '/models/protecao/schneider-ez9s-4p.glb', poles: 4, inA: 100, code: 'EZ9S16491' },
]

// O STEP traz 2 módulos lado a lado (1P + 1P acopláveis). O módulo 0 cobre
// x 0..17,6 mm; o módulo 1 cobre x 16..35,2 mm (partilham a parede central).
// Para polos > 2 reutiliza-se o módulo 0 deslocado em passos de 18 mm.
function moduleFaces(mesh, mod) {
  // Seleciona faces cuja bbox completa está dentro do módulo fonte (não
  // apenas o centro), para não puxar saliências que atravessam a parede.
  const range = [[0, 17.6], [16, 35.2]][mod % 2]
  const ids = []
  mesh.brep_faces.forEach((f, i) => {
    const b = faceBounds(mesh, i)
    if (b[0][0] >= range[0] - .5 && b[0][1] <= range[1] + .5) ids.push(i)
  })
  return ids
}

function stripFaces(mesh, ids, range) {
  // Remove faces cuja bbox está totalmente fora do intervalo [x0,x1] da caixa.
  return ids.filter(i => {
    const b = faceBounds(mesh, i)
    return b[0][1] >= range[0] && b[0][0] <= range[1]
  })
}

const models = []
const s = await source('1285')
const stepMesh = s.meshes[0]

for (const v of VARIANTS) {
  const width = v.poles * 18
  const dims = { width, height: 81, depth: 66.5 }
  const root = makeRoot(v.type, dims)
  // map: STEP (x 0..35.2, y 0..76.8, z 0..74.7 com frente em z 0) → GLB
  // (x centrado, y 0..81, z 0 = traseira/entalhe DIN, frente em z 66.5+).
  // Inverte-se z para que a frente do STEP (manípulo/parafusos, z baixo)
  // fique em +Z alto (frente do GLB), como nos disjuntores Easy9.
  const map = (x, y, z) => [x, y + 2.1, 74.7 - z]
  const handle = []
  for (let mod = 0; mod < v.poles; mod++) {
    const mesh = s.meshes[mod % 2]
    // Cada mesh do STEP é um polo completo (largura 19.2 mm, centro em 8.0/25.6).
    const sourceCx = mod % 2 === 0 ? 8.0 : 25.6
    const targetCx = -width / 2 + 9 + mod * 18
    const dx = targetCx - sourceCx
    const body = addMesh(root, mesh, (x, y, z) => map(x + dx, y, z), m.white, `ez9s_body_${mod + 1}`)
    body.userData.module = mod + 1
  }
  // --- Manípulo vermelho -------------------------------------------------
  // O STEP do iSW/SW tem o manípulo escuro integrado no corpo; no Easy9
  // Switch o manípulo é vermelho e bascula à volta do cubo frontal. É
  // reconstruído como peça própria (declarado nas adaptações), com o mesmo
  // perfil do Acti9 iSW: alavanca central + barra de ligação entre polos.
  // A janela frontal do STEP está em y 30..55, z 0..15 (z 0 = frente).
  // O manípulo sai c. 3 mm da face frontal (z -3..6), como no aparelho real.
  const leverZ = 70.2, leverY = 42
  for (let mod = 0; mod < v.poles; mod++) {
    const cx = -width / 2 + 9 + mod * 18
    const lever = box(4.6, 15, 6.5, red, `dcsimu_handle_${mod + 1}`, [cx, leverY, leverZ])
    lever.geometry.translate(0, -2.5, 0) // ponta para baixo na pose OFF
    handle.push(lever)
    const tip = cylinder(1.6, 4.5, redDark, `dcsimu_handle_tip_${mod + 1}`, [cx, leverY - 9.5, leverZ], 'y')
    handle.push(tip)
  }
  if (v.poles > 1) {
    const bridge = box(width - 14, 3.6, 5, red, 'dcsimu_handle_bridge', [0, leverY + 4.8, leverZ])
    handle.push(bridge)
  }
  pivot(root, 'ez9s_handle_pivot', handle, [0, leverY + 6.5, leverZ + 1.5])
  // --- Janela de indicação de posição (IEC 60947-3) ----------------------
  // A tira verde/vermelha fica rente à face frontal, acima do manípulo.
  status(root, 'ez9s_pos', 0, 56.5, 74.85, Math.min(width - 4, 34))
  // Bornes (túnel PZ2, ≤ 35 mm², 3.5 N·m): entrada em cima, saída em baixo,
  // a c. 74 % da profundidade a partir da traseira (z 0), como no iC60H.
  const termZ = 66.5 * .738
  const rows = []
  for (let mod = 0; mod < v.poles; mod++) {
    const nx = v.poles === 1 ? .5 : (mod + .5) / v.poles
    rows.push([String(mod * 2 + 1), 'top', nx, .011834, termZ / 66.5, 9, 15])
    rows.push([String(mod * 2 + 2), 'bottom', nx, .95858, termZ / 66.5, 9, 15])
  }
  cavities(root, dims, rows)
  // Recolocar as cavidades na posição Z correta (a função `cavities` usa
  // `nz*dims.depth`, mas o corpo STEP tem 74.7 mm de profundidade).
  for (const [label] of rows) {
    const conn = root.getObjectByName('acti9_connection_' + label)
    if (conn) conn.position.z = termZ
  }
  // Parafusos de borne Pozidriv na face frontal, alinhados com os túneis.
  // Cabeça quase embebida na caixa; a cruz Pozidriv é subtraída visualmente
  // pela textura de serigrafia, não por geometria (evita «tampas» pretas).
  for (let mod = 0; mod < v.poles; mod++) {
    const cx = -width / 2 + 9 + mod * 18
    for (const [yy, face] of [[76.4, 'top'], [4.6, 'bottom']]) {
      const screw = cylinder(2.7, 1.8, m.steel, `ez9s_screw_${face}_${mod + 1}`, [cx, yy, 73.4])
      screw.rotation.x = Math.PI / 2
      root.add(screw)
      // Cruz Pozidriv em relevo escuro, rente à face frontal.
      const slotA = box(3.8, .7, .25, m.dark, `ez9s_screw_slot_a_${face}_${mod + 1}`, [cx, yy, 74.32])
      const slotB = box(.7, 3.8, .25, m.dark, `ez9s_screw_slot_b_${face}_${mod + 1}`, [cx, yy, 74.32])
      root.add(slotA); root.add(slotB)
    }
  }
  // --- Serigrafia frontal (planos com textura gerada offline) ------------
  const fascia = plane(width - 1.2, 30, m.white, 'industrial_fascia', [0, 58, 74.5])
  root.add(fascia)
  const label = plane(width - 2.5, 12, m.white, 'industrial_ez9s_label', [0, 22, 74.5])
  root.add(label)
  models.push(await saveModel(root, v.path, dims, s.source, [
    `STEP MCADFD0001285 (gama iSW/SW, mesmo molde modular 18 mm do Easy9 Switch) cortado/duplicado em ${v.poles} módulo(s) de 18 mm; geometria de corpo, entalhe DIN e bornes preservada.`,
    'Manípulo reconstruído em vermelho Easy9 Switch com perfil do iSW, sob pivot `ez9s_handle_pivot` (OFF = ponta para baixo); barra de ligação entre polos nos 2P/4P.',
    `Serigrafia ${v.code} · ${v.inA} A · IEC 60947-3 · AC-22A projetada em tempo de execução (protectionMarkings).`,
    'Janela de indicação de posição (verde/vermelho) conforme IEC 60947-3; cavidades de borne reabertas nos eixos documentados.',
  ]))
}
await manifest('models/protecao/schneider-ez9s-sources.json', models)
console.log(JSON.stringify(models.map(({ path, bytes, measuredSizeMm }) => ({ path, bytes, measuredSizeMm })), null, 2))
