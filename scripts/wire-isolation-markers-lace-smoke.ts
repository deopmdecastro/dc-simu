/** Isolamento, marcadores, filaçar e espiral de proteção. */
import assert from 'node:assert/strict'
import {
  isPanelAccessoryType, isSpiralWrapType, panelAccessorySizeMm, spiralWrapDimsOf, SPIRAL_WRAP_TYPE,
} from '../src/three/enclosureParts'
import { createComponent, TEMPLATES } from '../src/electrical/factory'
import { pointAtFraction, polylineLength, subpathBetween, tangentAtFraction } from '../src/schematic/wireGeometry'
import type { Wire } from '../src/types'

let n = 0
const check = (name: string, ok: boolean) => { assert.ok(ok, name); n++ }

// --- Espiral no catálogo ---
check('spiralWrap no TEMPLATES', !!TEMPLATES.spiralWrap)
check('spiralWrap é acessório de painel', isPanelAccessoryType('spiralWrap') && isSpiralWrapType(SPIRAL_WRAP_TYPE))
check('medidas espiral por omissão', JSON.stringify(spiralWrapDimsOf({})) === JSON.stringify({ lengthMm: 300, innerDiaMm: 10, pitchMm: 8 }))
check('tamanho acessório espiral', (() => {
  const s = panelAccessorySizeMm('spiralWrap', { lengthMm: 200, innerDiaMm: 12 })
  return !!s && s.x === 200 && s.y === 16 && s.z === 16
})())
{
  const c = createComponent('spiralWrap', 0, 0)
  check('createComponent spiralWrap', c.type === 'spiralWrap' && c.terminals.length === 0)
  check('estado default espiral', c.state.lengthMm === 300 && c.state.innerDiaMm === 10)
}

// --- Geometria 2D: amostragem e subpath ---
{
  const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }]
  check('polylineLength', Math.abs(polylineLength(pts) - 150) < 1e-6)
  const mid = pointAtFraction(pts, 0.5)
  check('pointAtFraction meio do 1.º segmento', Math.abs(mid.x - 75) < 1e-6 && Math.abs(mid.y) < 1e-6)
  const end = pointAtFraction(pts, 1)
  check('pointAtFraction fim', Math.abs(end.x - 100) < 1e-6 && Math.abs(end.y - 50) < 1e-6)
  const tan = tangentAtFraction(pts, 0.1)
  check('tangent horizontal no início', Math.abs(tan.x - 1) < 1e-6 && Math.abs(tan.y) < 1e-6)
  const d = subpathBetween(pts, 0.2, 0.8)
  check('subpathBetween gera path', d.startsWith('M ') && d.includes(' L '))
  check('subpathBetween vazio se start≈end', subpathBetween(pts, 0.5, 0.5) === '')
}

// --- Modelo Wire: isolation, markers, bundleId ---
{
  const wire: Wire = {
    id: 'w1',
    fromTerminalId: 't1',
    toTerminalId: 't2',
    color: 'black',
    gauge: '1.5mm²',
    kind: 'control',
    flexibility: 'flexible',
    route: 'orthogonal',
    bend: 0.5,
    energized: false,
    isolation: [{ start: 0.2, end: 0.6, color: '#1e293b' }],
    markers: [{ t: 0.4, text: '3', color: '#0a0a0a', bg: '#fbbf24' }],
    bundleId: 'bundle-test',
  }
  check('wire.isolation presente', wire.isolation!.length === 1 && wire.isolation![0].color === '#1e293b')
  check('wire.markers presente', wire.markers![0].text === '3')
  check('wire.bundleId presente', wire.bundleId === 'bundle-test')
}

// --- enclosureId no componente ---
{
  const qe = createComponent('panelEnclosure', 0, 0)
  const km = createComponent('contactor', 10, 10)
  km.enclosureId = qe.id
  check('enclosureId atribuível', km.enclosureId === qe.id)
}


// --- Quadro e calha: corpos sólidos (obstáculos 3D) ---
{
  const qe = createComponent('panelEnclosure', 0, 0)
  const ct = createComponent('cableDuct', 100, 0)
  const piv = {
    [qe.id]: new THREE.Vector3(0, 0, 0),
    [ct.id]: new THREE.Vector3(2, 0, 0.3),
  }
  const boxes = componentObstacles([qe, ct], piv)
  const wallCount = boxes.filter((b) => b.componentId === qe.id && b.hard).length
  check('quadro gera paredes sólidas (hard)', wallCount >= 5)
  const duct = boxes.find((b) => b.componentId === ct.id)
  check('calha técnica é obstáculo hard (não rail)', !!duct && duct.hard === true && !duct.rail)
}

console.log(`wire-isolation-markers-lace-smoke: ${n} verificações OK`)
