/**
 * Verificações do disjuntor do catálogo oficial no motor elétrico e da descoberta
 * geométrica do manípulo. Corre sem navegador: `npm run test:catalog`.
 *
 * Cobre a ligação que faltava entre o manípulo 3D (variáveis do componente) e o
 * motor de continuidade: um disjuntor publicado no Editor 3D não abria nem
 * fechava o circuito porque o motor só conhecia os tipos integrados.
 */
import * as THREE from 'three'
import { catalogClosed, catalogPolePairs, internalBridges, sourceTerminalIds } from '../src/electrical/engine'
import { guessHandleNodes } from '../src/catalog/componentRig'
import type { ElectricalComponent, Terminal, TerminalKind } from '../src/types'

let failures = 0
function check(label: string, ok: boolean, extra = '') {
  console.log(`${ok ? 'ok   ' : 'FALHA'} · ${label}${extra ? ` — ${extra}` : ''}`)
  if (!ok) failures += 1
}

function terminal(id: string, label: string, kind: TerminalKind, direction: 'in' | 'out'): Terminal {
  return { id, componentId: 'c1', label, kind, terminalType: 'screw', color: '#cbd5e1', x: 0.5, y: 0.5, energized: false, catalogRules: { polarity: 'ac', direction, accepts: '' } }
}

/** Disjuntor tripolar do catálogo, com um contacto auxiliar NA (13-14) que não pode virar polo. */
function catalogBreaker(vars: Record<string, unknown>, tripped = false): ElectricalComponent {
  return {
    id: 'c1',
    type: 'cat:disjuntor-tripolar:v1',
    ref: 'Q1',
    label: 'Disjuntor',
    terminals: [
      terminal('t1', '1', 'power-in', 'in'), terminal('t2', '2', 'power-out', 'out'),
      terminal('t3', '3', 'power-in', 'in'), terminal('t4', '4', 'power-out', 'out'),
      terminal('t5', '5', 'power-in', 'in'), terminal('t6', '6', 'power-out', 'out'),
      terminal('t13', '13', 'aux-no', 'in'), terminal('t14', '14', 'aux-no', 'out'),
    ],
    state: { catalogVars: vars, tripped },
  } as unknown as ElectricalComponent
}

/* ------------------------------------------------------------------ polos */
const pairs = catalogPolePairs(catalogBreaker({ closed: true }))
check('catálogo: exatamente três polos', pairs.length === 3, JSON.stringify(pairs))
check('catálogo: par 1→2', pairs.some(([a, b]) => a === 't1' && b === 't2'))
check('catálogo: par 3→4', pairs.some(([a, b]) => a === 't3' && b === 't4'))
check('catálogo: par 5→6', pairs.some(([a, b]) => a === 't5' && b === 't6'))
check('catálogo: contacto auxiliar 13-14 não é polo', !pairs.some(([a, b]) => a === 't13' || b === 't14'))
check('integrado: sem polos de catálogo (não mexe no que já funcionava)', catalogPolePairs({ ...catalogBreaker({ closed: true }), type: 'breaker3p' } as ElectricalComponent).length === 0)

/* --------------------------------------------------------------- ligado/desligado */
check('fechado: os três polos conduzem', internalBridges(catalogBreaker({ closed: true })).length === 3, `${internalBridges(catalogBreaker({ closed: true })).length} pontes`)
check('desligado: o circuito abre mesmo', internalBridges(catalogBreaker({ closed: false })).length === 0)
check('disparado: abre mesmo com o manípulo ligado', internalBridges(catalogBreaker({ closed: true }, true)).length === 0)
check('variável ausente: fecha por omissão (como os integrados)', internalBridges(catalogBreaker({})).length === 3)
check('variável de nome diferente: usa o primeiro booleano', catalogClosed(catalogBreaker({ on: false })) === false)
check('disjuntor do catálogo alimenta a instalação pelos bornes de entrada', ['t1', 't3', 't5'].every((id) => sourceTerminalIds([catalogBreaker({ closed: true })]).includes(id)))
check('falta de fase tira o polo 3 da alimentação', !sourceTerminalIds([catalogBreaker({ closed: true })], { phaseLoss: true } as never).includes('t3'))

/* --------------------------------------------------- manípulo descoberto pela geometria */
function glbPart(): THREE.Object3D {
  const part = new THREE.Group(); part.name = 'p'
  const rootNode = new THREE.Group(); rootNode.name = 'RootNode'
  const body = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100), new THREE.MeshBasicMaterial()); body.name = 'Body'
  const handle = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 6), new THREE.MeshBasicMaterial()); handle.name = 'Handle'
  handle.position.set(0, 40, 55)
  rootNode.add(body, handle)
  part.add(rootNode)
  part.updateMatrixWorld(true)
  return part
}
check('manípulo: encontrado pela geometria (o que sai à frente e é pequeno)', guessHandleNodes(glbPart()).join() === 'Handle', guessHandleNodes(glbPart()).join())
const noHandle = new THREE.Group(); noHandle.name = 'p'
const flat = new THREE.Group(); flat.name = 'RootNode'
const onlyBody = new THREE.Mesh(new THREE.BoxGeometry(50, 50, 50), new THREE.MeshBasicMaterial()); onlyBody.name = 'Body'
flat.add(onlyBody); noHandle.add(flat); noHandle.updateMatrixWorld(true)
check('manípulo: sem peça saliente não inventa (não mexe o aparelho todo)', guessHandleNodes(noHandle).length === 0)

if (failures) throw new Error(`${failures} verificação(ões) falharam`)
console.log('\nDisjuntor do catálogo: todas as verificações passaram.')
