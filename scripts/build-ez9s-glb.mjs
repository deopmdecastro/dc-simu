// Gera os GLB dos interruptores de corte Schneider Easy9 Switch (EZ9S) de 1, 2
// e 4 polos a partir do STEP oficial do fabricante (MCADFD0001285, gama iSW/SW
// modular 18 mm — o mesmo molde do Easy9 Switch, conforme IEC 60947-3).
//
//   node --import tsx scripts/build-ez9s-glb.mjs
//
// Convenção do GLB: metros, de pé (topo = +Y), frente = +Z, traseira (face de
// encaixe na calha DIN) em z = 0 — a mesma dos disjuntores Easy9 (breaker1p/2p/3p).
//
// Referencial do STEP, medido nos vértices (não deduzido):
//   X  −1,6 … 17,6 mm   módulo de 18 mm (o 2.º módulo do ficheiro: 16,0 … 35,2)
//   Y   0 … 76,8 mm     topo do aparelho
//   Z   0 … 45,5 mm     corpo; a face de encaixe na calha está em z = 0
//   Z  65,5 … 74,7 mm   moldura frontal: manípulo vermelho (y 19…32), janela de
//                       estado (y 49,9…55) e cabeças Pozidriv (y 15,9…21,8 e 66…76,8)
//
// Ou seja: a frente do STEP já é +Z, com a calha em z = 0 — a MESMA convenção do
// GLB. A versão anterior aplicava `z → (74,7 − z)` e inverteu a profundidade do
// aparelho: a moldura, o manípulo e a serigrafia passavam para a traseira e a
// face da calha ia para z = 29 mm (o aparelho flutuava 30 mm à frente da chapa).
// Era exactamente o defeito reportado («serigrafia e manípulos na parte de trás»).
// Agora só se acrescenta o deslocamento vertical que assenta o corpo na calha.
//
// O manípulo vermelho do Easy9 Switch real é uma travessa única que atravessa os
// módulos, com uma alavanca branca por polo. Na pose OFF do STEP é reconstruído
// como peça própria solidária a todos os polos, sob um pivot comum.
import { source, makeRoot, addMesh, pivot, cavities, saveModel, manifest, faceBounds, materials as m } from './lib/schneider-building.mjs'
import * as THREE from 'three'
import { mat, box, cylinder } from './lib/cad-building.mjs'

const red = mat('#c8352b', .12, .4)          // travessa/pega do Easy9 Switch
const redDark = mat('#9e241c', .12, .45)
const leverWhite = mat('#f2f1ec', .02, .46)  // alavancas brancas do molde

const VARIANTS = [
  { type: 'switchSchneiderEz9s1p', path: '/models/protecao/schneider-ez9s-1p.glb', poles: 1, inA: 63, code: 'EZ9S16163' },
  { type: 'switchSchneiderEz9s2p', path: '/models/protecao/schneider-ez9s-2p.glb', poles: 2, inA: 63, code: 'EZ9S16263' },
  { type: 'switchSchneiderEz9s4p', path: '/models/protecao/schneider-ez9s-4p.glb', poles: 4, inA: 100, code: 'EZ9S16491' },
]

// Medidas do STEP (mm).
const H = 76.8            // topo do corpo
const Y_OFFSET = 2.1      // corpo assenta 2,1 mm acima do fundo da caixa GLB
const D = 74.7            // profundidade até à frente do manípulo
const FRAME_Z = 65.5      // plano da moldura frontal
const map = (x, y, z) => [x, y + Y_OFFSET, z]   // identidade em X/Z

// Manípulo na pose OFF do STEP (ponta em baixo, como sai do CAD).
const HANDLE = { yMin: 19.0, yMax: 32.1, zMin: 65.5, zMax: 74.7 }
const HINGE_MM = { y: HANDLE.yMax + Y_OFFSET, z: (HANDLE.zMin + HANDLE.zMax) / 2 }

/* Bornes do STEP (medidos, não deduzidos): a boca do túnel está na FACE FRONTAL, a
 * z ≈ 26,5 mm — o intervalo vazio z 28,1…27,2 nas varreduras do topo e da base — e o
 * parafuso Pozidriv fica num poço recuado à frente dela, a z 16,3…21,7 mm. A versão
 * anterior abria os túneis em Y, a partir do topo, e deixava os furos visíveis como
 * cicatrizes escuras nas faces de cima e de baixo. */
const TERMINAL = { z: 25, depth: 14, diameter: 9 }        // túnel do STEP, a 25 mm da traseira
/* O degrau dos bornes tem a face a z ≈ 45,5 mm (medido: y 60…70 em cima e y 9,5…13 em
 * baixo); é aí que abre o poço do parafuso. A versão anterior punha-o a z 19 mm — dentro
 * do corpo, e por isso invisível. */
/* O STEP já traz o poço do parafuso escavado no degrau: a face vale 45,5 mm no rebordo e
 * desce a ≈40 mm no fundo do poço (medido na grelha de z frontal). O parafuso assenta aí. */
const SCREW = { z: 38.6, radius: 2.1 }
/* Alturas dos bornes no STEP: a face frontal dos degraus vale 45,5 mm entre y 66…70 (topo)
 * e y 9,5…13 (base). É aí que o parafuso Pozidriv fica visível, como no produto. */
const TERMINAL_ROW = { top: 66.4, bottom: 11.4 }
/* Tampa/quadro branco à volta da travessa vermelha: moldura de 1,5 mm, a z 62,4…65,5. */
const SHROUD = { yMin: 24.4, yMax: 35.4, xMin: 3.3, xMax: 14.3 }

const MODULE_CX = [-1.6 + 9.6, 16.0 + 9.6]      // centros físicos ≈ 8,0 e 25,6 mm
const models = []
const s = await source('1285')

for (const v of VARIANTS) {
  const width = v.poles * 18
  // Arredondado a 3 casas: `76.8 + 2.1` dá 78,89999999999999 em vírgula flutuante e o
  // referencial gravado no GLB tem de coincidir exactamente com o de `modelPaths.ts`.
  const height = Math.round((H + Y_OFFSET) * 1000) / 1000
  const dims = { width, height, depth: D }
  const root = makeRoot(v.type, dims)
  const centres = []

  const handle = []
  for (let mod = 0; mod < v.poles; mod++) {
    const mesh = s.meshes[mod % 2]
    const dx = -width / 2 + 9 + mod * 18 - MODULE_CX[mod % 2]
    const shift = (x, y, z) => map(x + dx, y, z)
    /* Separa o manípulo do molde: as faces da janela frontal (y 21…32, z > 65) são a
     * peça vermelha; o resto é o corpo branco. Nada é reconstruído por cima do CAD. */
    /* Três grupos, medidos nas faces do STEP:
     *  · travessa vermelha — faces cujo plano frontal chega a z > 70 mm (a barra e o seu
     *    lábio inferior). O que estava a apanhar antes era o recesso branco do molde
     *    (z 62,4…65,5), que ficava vermelho e fazia a peça parecer um bloco liso;
     *  · alavancas e quadro brancos — faces da janela do manípulo (y 24,4…35,4) que não
     *    chegam à frente;
     *  · corpo — tudo o resto. */
    const handleFaces = []
    const shroudFaces = []
    const bodyFaces = []
    mesh.brep_faces.forEach((_, i) => {
      const b = faceBounds(mesh, i)
      const inWindow = b[1][0] > 20.5 && b[1][1] < 35.8 && b[2][0] > 62.0
      /* Só é travessa vermelha o que chega à frente do molde (z > 71 mm, medido nas faces
       * do STEP: a barra ocupa z 68,9…74,7). Com o limite em 68 mm o leque branco do molde
       * (z até 69,6) também ficava vermelho e o manípulo lia-se como um bloco liso. */
      if (inWindow && b[2][1] > 71.0) handleFaces.push(i)
      else if (inWindow) shroudFaces.push(i)
      else bodyFaces.push(i)
    })
    const body = addMesh(root, mesh, shift, m.white, `ez9s_body_${mod + 1}`, bodyFaces)
    body.userData.module = mod + 1
    if (shroudFaces.length) {
      const sh = addMesh(root, mesh, shift, m.white, `ez9s_lever_${mod + 1}`, shroudFaces)
      sh.userData.module = mod + 1
    }
    if (handleFaces.length) {
      const h = addMesh(root, mesh, shift, red, `dcsimu_handle_${mod + 1}`, handleFaces)
      h.userData.module = mod + 1
      handle.push(h)
    }
    centres.push(-width / 2 + 9 + mod * 18)
  }

  /* --- Pivot do manípulo ------------------------------------------------
   * Um único pivot para as peças de todos os polos: o Easy9 Switch real tem uma travessa
   * vermelha solidária, não manípulos independentes. A charneira é a aresta de topo do
   * manípulo (y 34,2 mm sobre a calha, z 70,1 mm da traseira), medida no STEP. */
  pivot(root, 'ez9s_handle_pivot', handle, [0, HANDLE.yMax + Y_OFFSET, (HANDLE.zMin + HANDLE.zMax) / 2])

  // --- Janela de indicação de posição (IEC 60947-3) ----------------------
  // Recesso do molde a y 49,9…55 mm, ligeiramente atrás do plano da moldura.
  const statusWidth = Math.min(width - 4, 34)
  for (const [suffix, dz] of [['', 0], ['_trip', .008], ['_on', .016]]) {
    const mesh = box(statusWidth, 3.4, .06, m.white, 'ez9s_pos' + suffix, [0, 52.5 + Y_OFFSET, FRAME_Z + 0.1 + dz])
    mesh.userData.protectionMarking = true
    root.add(mesh)
  }

  /* --- Bocas dos bornes (túneis PZ2 reais, ≤ 35 mm², 3,5 N·m) ------------
   * O encaixe elétrico é o túnel do STEP que corre em Z a ≈25 mm da traseira; o fio entra
   * pelo topo e pela base. O parafuso Pozidriv do produto fica à frente, no degrau — mas
   * é só hardware visível, não desloca o ponto de ligação. */
  const rows = []
  for (let mod = 0; mod < v.poles; mod++) {
    const nx = (mod + 0.5) / v.poles
    rows.push([String(mod * 2 + 1), 'top', nx, .011834, TERMINAL.z / dims.depth, TERMINAL.diameter, TERMINAL.depth])
    rows.push([String(mod * 2 + 2), 'bottom', nx, .95858, TERMINAL.z / dims.depth, TERMINAL.diameter, TERMINAL.depth])
  }
  cavities(root, dims, rows)
  for (const [label] of rows) {
    const conn = root.getObjectByName('acti9_connection_' + label)
    if (conn) conn.position.z = TERMINAL.z
  }

  // Parafuso Pozidriv no fundo do poço que o próprio STEP escava no degrau.
  for (let mod = 0; mod < v.poles; mod++) {
    const cx = centres[mod]
    for (const [yy, face] of [[TERMINAL_ROW.top + Y_OFFSET, 'top'], [TERMINAL_ROW.bottom + Y_OFFSET, 'bottom']]) {
      const screw = cylinder(SCREW.radius, 1.2, m.steel, `ez9s_screw_${face}_${mod + 1}`, [cx, yy, SCREW.z])
      screw.rotation.x = Math.PI / 2
      root.add(screw)
      for (const [w, h] of [[SCREW.radius * 1.5, .45], [.45, SCREW.radius * 1.5]]) {
        const slot = box(w, h, .3, m.dark, `ez9s_screw_slot_${face}_${mod + 1}`, [cx, yy, SCREW.z + .35])
        root.add(slot)
      }
    }
  }

  models.push(await saveModel(root, v.path, dims, s.source, [
    `STEP MCADFD0001285 (gama iSW/SW, mesmo molde modular 18 mm do Easy9 Switch) cortado/duplicado em ${v.poles} módulo(s) de 18 mm; geometria de corpo, entalhe DIN e túneis de borne preservados.`,
    'Orientação medida nos vértices do STEP: frente (manípulo, janela de estado e cabeças Pozidriv) em z = 65,5…74,7 mm e face de encaixe na calha em z = 0. O STEP usa já a convenção do GLB (frente = +Z), pelo que só se acrescenta o deslocamento vertical de 2,1 mm que assenta o corpo na calha.',
    'Corrige o mapeamento anterior (z → 74,7 − z), que invertia a profundidade: a moldura, o manípulo e a serigrafia ficavam na traseira do aparelho e a face da calha saía para z = 29 mm, deixando o interruptor a flutuar à frente da chapa.',
    'Manípulo vermelho é geometria do próprio STEP: as 9 faces do molde na janela frontal (x 3,5…14,1 · y 21,1…32,1 · z 65,5…74,7 mm) são separadas do corpo em malhas `dcsimu_handle_<n>` e pintadas de vermelho, sem reconstrução por caixas nem sobreposição. A travessa é solidária aos polos sob um único pivot `ez9s_handle_pivot` (OFF = pose do STEP, ponta para baixo).',
    `Serigrafia ${v.code} · ${v.inA} A · IEC 60947-3 · AC-22A projetada em tempo de execução (protectionMarkings), assente na parede frontal do molde (z = 65,5 mm) e nas laterais.`,
    'Janela de indicação de posição (verde/vermelho) conforme IEC 60947-3.',
  ]))
}
await manifest('models/protecao/schneider-ez9s-sources.json', models)
console.log(JSON.stringify(models.map(({ path, bytes, measuredSizeMm }) => ({ path, bytes, measuredSizeMm })), null, 2))
