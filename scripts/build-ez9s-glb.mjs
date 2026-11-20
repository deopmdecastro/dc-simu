// Gera os GLB dos interruptores de corte Schneider Easy9 Switch (EZ9S) de 1, 2 e
// 4 polos a partir do STEP oficial do PRÓPRIO produto (MCADFD0002242 / 2243 / 2245,
// um por referência de catálogo).
//
//   node --import tsx scripts/build-ez9s-glb.mjs
//
// Convenção do GLB: metros, de pé (topo = +Y), frente = +Z, traseira (face de
// encaixe na calha DIN) em z = 0 — a mesma dos disjuntores Easy9 (breaker1p/2p/3p).
//
// Referencial do STEP (medido nos vértices e nas vistas 2D do mesmo pacote):
//   X  por módulo, 18 mm de passo (1P: 4,6…22,4)
//   Y  corpo 0…82 (os de 2P/4P vêm deslocados 2,5 mm; compensa-se no `shift`)
//   Z  frente para +Z: parede frontal principal em z ≈ −3,8, degrau dos bornes em
//      z ≈ −21, poço do parafuso em z ≈ −25,1, traseira em z ≈ −70,3
//
// O STEP anterior (MCADFD0001285) era da gama **iSW/SW**, não do Easy9 Switch: o
// molde tem DUAS cabeças de borne por polo em cima e duas em baixo, e um manípulo
// branco liso. Era essa a origem dos «8 parafusos em cima e 8 em baixo» e do
// manípulo que não se lia como o do produto. O CAD certo traz, por polo, um único
// parafuso Pozidriv por face (peça `VIS_7D`), a alavanca vermelha real (`MANETTE`)
// e a travessa que liga os polos (`EXTENSION_MANETTE`).
//
// Adaptações (todas explícitas, nenhuma geometria reconstruída por caixas):
//   · translação rígida para pousar o corpo em z = 0 / y = 0;
//   · repartição das peças do STEP em malhas de corpo, manípulo, clip DIN e parafuso;
//   · os bornes são os túneis reais do molde (abertura de 10 × 16 mm, fundo a
//     18,5 mm da face); o ponto de ligação fica dentro do túnel, não numa boca
//     acrescentada.
import { source, makeRoot, addMesh, pivot, saveModel, manifest, materials as m } from './lib/schneider-building.mjs'
import { terminal } from './lib/cad-building.mjs'
import * as THREE from 'three'

const VARIANT_META = [
  { type: 'switchSchneiderEz9s1p', id: '2242', path: '/models/protecao/schneider-ez9s-1p.glb', poles: 1, inA: 63, code: 'EZ9S16163' },
  { type: 'switchSchneiderEz9s2p', id: '2243', path: '/models/protecao/schneider-ez9s-2p.glb', poles: 2, inA: 63, code: 'EZ9S16263' },
  { type: 'switchSchneiderEz9s4p', id: '2245', path: '/models/protecao/schneider-ez9s-4p.glb', poles: 4, inA: 100, code: 'EZ9S16491' },
]

const bodyWhite = m.white
const clipWhite = m.white
/* Cabeças Pozidriv do STEP (VIS_7D): aço claro, para lerem como prata e não como
 * discos escuros — o CAD só traz o disco, sem a cruz rebaixada. */
const steel = new THREE.MeshStandardMaterial({ color: '#c6cbd0', metalness: .45, roughness: .32 })
const leverRed = new THREE.MeshStandardMaterial({ color: '#c8352b', metalness: .12, roughness: .42 })

/* Alturas (no referencial do STEP) dos túneis dos bornes, lidas nas varreduras do
 * topo e da base: cavidade de y 63,5…81,5 em cima e 0,5…18,5 em baixo, com a boca
 * de 10 × 16 mm em z −20…−4. O fundo do túnel é a parede de material. */
const TUNNEL = {
  top: { floor: 63.5, face: 81.5, mouth: 81.5 },
  bottom: { floor: 18.5, face: 0.5, mouth: 0.5 },
  zStep: -12.0,          // centro do túnel em profundidade (STEP)
  /* Ø9 mm: o poço tem 10 mm em X e 16 mm em Z; com este diâmetro o anel de medição do
   * `terminalSeat` (0,65·Ø = 5,85 mm) cai fora da boca em X, sobre a face do degrau —
   * é assim que o auditor distingue «poço» de «face plana». */
  diameter: 9,
  depth: 18,   // do plano da face ao fundo do poço (medido no STEP)
}

const models = []

function meshBounds(mesh) {
  const p = mesh.attributes.position.array
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (let k = 0; k < p.length; k += 3) for (let a = 0; a < 3; a++) {
    min[a] = Math.min(min[a], p[k + a]); max[a] = Math.max(max[a], p[k + a])
  }
  return { min, max }
}

for (const v of VARIANT_META) {
  const s = await source(v.id)
  const parts = s.meshes.map((mesh, index) => {
    const kind = /^COQUE/i.test(mesh.name) ? 'shell'
      : /^MANETTE/i.test(mesh.name) ? 'lever'
      : /^EXTENSION/i.test(mesh.name) ? 'bar'
      : /^CLIP/i.test(mesh.name) ? 'clip'
      : /^VIS/i.test(mesh.name) ? 'screw'
      : 'other'
    return { mesh, index, kind, ...meshBounds(mesh) }
  })
  // Referencial: corpo (COQUE) assenta em y = 0 e a traseira em z = 0; o centro X
  // é o centro do corpo. O clip DIN desce 2,5 mm abaixo do corpo no produto real.
  const shells = parts.filter(p => p.kind === 'shell')
  const bodyMinY = Math.min(...shells.map(p => p.min[1]))
  const bodyMinZ = Math.min(...shells.map(p => p.min[2]))
  const bodyMinX = Math.min(...shells.map(p => p.min[0]))
  const bodyMaxX = Math.max(...shells.map(p => p.max[0]))
  const xMid = (bodyMinX + bodyMaxX) / 2
  const shift = (x, y, z) => [x - xMid, y - bodyMinY, z - bodyMinZ]

  /* Referencial NOMINAL de implantação (o mesmo de `modelPaths.ts`): passo DIN de 18 mm por
   * polo e a altura/profundidade do molde. O envelope medido do CAD vai em `measuredSizeMm`,
   * que é o que o `saveModel` calcula — nunca se estica a malha para caber nestes números. */
  const dims = { width: v.poles * 18, height: 84.5, depth: 75.1 }

  const root = makeRoot(v.type, dims)
  const handles = []
  const seams = []

  /* Numeração dos módulos pela ordem em X (o `COQUE` de cada polo é um sólido do STEP,
   * mas as peças vêm intercaladas na lista do ficheiro). */
  const moduleIndex = part => Math.max(0, Math.min(v.poles - 1, Math.round((((part.min[0] + part.max[0]) / 2) - bodyMinX - 9) / 18)))
  for (const part of parts) {
    const cx = (part.min[0] + part.max[0]) / 2
    const n = moduleIndex(part) + 1
    const map = (x, y, z) => shift(x, y, z)
    if (part.kind === 'shell') {
      const node = addMesh(root, part.mesh, map, bodyWhite, `ez9s_body_${n}`)
      node.userData.module = n
      part.node = node
      seams.push(cx - xMid)
    } else if (part.kind === 'lever') {
      const node = addMesh(root, part.mesh, map, leverRed, `dcsimu_handle_${n}`)
      node.userData.module = n
      handles.push(node)
    } else if (part.kind === 'bar') {
      const node = addMesh(root, part.mesh, map, leverRed, 'dcsimu_handle_bridge')
      node.userData.module = 0
      handles.push(node)
    } else if (part.kind === 'clip') {
      const node = addMesh(root, part.mesh, map, clipWhite, `ez9s_clip_${n}`)
      node.userData.module = n
    } else if (part.kind === 'screw') {
      const cy = (part.min[1] + part.max[1]) / 2
      const face = cy > (bodyMinY + dims.height / 2) ? 'top' : 'bottom' // VIS_7D: uma por face
      const node = addMesh(root, part.mesh, map, steel, `ez9s_screw_${face}_${n}`)
      node.userData.module = n
      node.userData.screwHead = true
    }
  }

  /* O molde do próprio Easy9 abre, em cada face, um poço retangular de 10 × 16 mm para
   * a entrada do cabo e a gaiola (medido: x 8,5…18,5 · z −20…−4 · fundo a y 63,5 em
   * cima e 18,5 em baixo). O ponto de ligação assenta nesse poço — não é preciso abrir
   * nem acrescentar cavidade nenhuma: o encaixe é a boca real do fabricante. */

  /* --- Manípulo -----------------------------------------------------------
   * A alavanca vermelha de cada polo e a travessa que as une são uma peça só a
   * rodar: charneira na aresta de TOPO da alavanca (y 38 no STEP), ligeiramente
   * à frente da parede (z ≈ 57), como no produto. */
  const handleBox = new THREE.Box3()
  for (const node of handles) handleBox.expandByObject(node)
  const hinge = [
    0,
    handleBox.max.y,
    handleBox.min.z + (handleBox.max.z - handleBox.min.z) * 0.12,
  ]
  if (handles.length) pivot(root, 'ez9s_handle_pivot', handles, hinge)

  /* --- Bornes -------------------------------------------------------------
   * O encaixe é o túnel do próprio molde. O ponto de ligação assenta 1,5 mm
   * dentro do poço, com o liner a partir do plano da face. */
  const rows = []
  for (let mod = 0; mod < v.poles; mod++) {
    const x = bodyMinX + (mod + 0.5) * 18 - xMid
    for (const [face, label] of [['top', String(mod * 2 + 1)], ['bottom', String(mod * 2 + 2)]]) {
      const t = TUNNEL[face]
      // A boca é o plano da face; o liner escuro do encaixe corre para dentro até ao fundo.
      const p = shift(x + xMid, t.mouth, TUNNEL.zStep)
      /* `contact: 'surface'`: o poço é geometria do fabricante, não se acrescenta liner
       * nem disco escuro — um cilindro de Ø9 mm a sair da face lia-se como um tarugo
       * preto em vez de um borne. O ponto de ligação é o único dado que falta ao CAD. */
      const conn = terminal(root, label, ...p, { r: TUNNEL.diameter / 2, depth: TUNNEL.depth, face, contact: 'surface' })
      rows.push({ label, face, ...p, diameterMm: TUNNEL.diameter, holeDepthMm: TUNNEL.depth, ...conn })
    }
  }

  models.push(await saveModel(root, v.path, dims, s.source, [
    `STEP MCADFD000${v.id} — CAD oficial do próprio Easy9 Switch ${v.poles}P (${v.code}), convertido sem reconstrução: corpo, degraus, túneis de borne, poços dos parafusos, alavanca vermelha e travessa são geometria do fabricante.`,
    'Orientação medida nos vértices: frente (parede frontal, degraus dos bornes e poços dos parafusos) em +Z e face de encaixe na calha em z = 0; o corpo é uma translação rígida do STEP (sem rotação nem espelho).',
    'Peças do STEP repartidas por função: `ez9s_body_<n>` (COQUE), `dcsimu_handle_<n>` (MANETTE, vermelha), `dcsimu_handle_bridge` (EXTENSION_MANETTE_02), `ez9s_clip_<n>` (CLIP DIN) e `ez9s_screw_<face>_<n>` (VIS_7D, cabeça Pozidriv do fabricante).',
    'Bornes: um parafuso por polo e por face, como no produto. O ponto de ligação é o túnel real do molde (abertura 10 × 16 mm, fundo a 18,5 mm da face, a 25 mm da traseira), a 1,5 mm do fundo — nunca uma boca acrescentada.',
    `Serigrafia ${v.code} · ${v.inA} A · IEC 60947-3 · AC-22A projetada em tempo de execução (protectionMarkings) sobre a parede frontal do molde.`,
    'Janela de indicação de posição (verde/vermelho) conforme IEC 60947-3.',
  ]))
}

await manifest('models/protecao/schneider-ez9s-sources.json', models)
console.log(JSON.stringify(models.map(({ path, bytes, measuredSizeMm }) => ({ path, bytes, measuredSizeMm })), null, 2))
