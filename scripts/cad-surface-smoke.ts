/* Superfície real dos CAD (UV em mm, famílias de material) e orientação do LS XBM-DN32S. */
import * as THREE from 'three'
import { ensureCadUvs, surfaceFamilyOf } from '../src/three/cadSurface'
import { finishCadMaterial } from '../src/three/catalogMaterials'
import { getComponentModelSpec } from '../src/three/modelPaths'
import { REAL_TERMINALS } from '../src/electrical/realInterfaces'
import { createComponent, lsXbmTerminalLayout, upgradeLsXbmFront } from '../src/electrical/factory'

let failures = 0
const check = (label: string, condition: boolean) => {
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`)
  if (!condition) failures++
}

const raw = (color: string, metalness = 0, roughness = 1, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  finishCadMaterial(new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra })) as THREE.MeshStandardMaterial

check('termoplástico branco → plástico técnico', surfaceFamilyOf(raw('#eeeeea')) === 'polymer')
check('poliamida preta → plástico preto', surfaceFamilyOf(raw('#151515')) === 'polymer-dark')
check('aço → inox acetinado', surfaceFamilyOf(raw('#c5c7c9', 0.9, 0.3)) === 'steel')
check('latão → latão', surfaceFamilyOf(raw('#d6b465', 0.9, 0.3)) === 'brass')
check('caixa azul pintada (Proauto) → pintura em pó', surfaceFamilyOf(raw('#0b5bb8')) === 'powder-paint')
check('lente transparente fica intacta', surfaceFamilyOf(raw('#ff3b3b', 0, 0.2, { transparent: true, opacity: 0.6 })) === null)
check('LED aceso (emissivo) fica intacto', surfaceFamilyOf(raw('#22c55e', 0, 0.5, { emissive: '#22c55e', emissiveIntensity: 1 })) === null)
check('material com mapa próprio fica intacto', surfaceFamilyOf(new THREE.MeshStandardMaterial({ map: new THREE.Texture() })) === null)
const blueBox = raw('#0b5bb8')
check('caixa pintada perde a metalização que a escurecia', blueBox.metalness <= 0.12)

// UV em mm no referencial do modelo ajustado (0,01 unidades por mm, como no Painel 3D).
const root = new THREE.Group()
const box = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.3), raw('#eeeeea'))
box.position.set(0.5, 0, 0)
root.add(box)
root.scale.setScalar(3) // escala de quem chama (p.ex. miniaturas) não altera o padrão em mm
ensureCadUvs(root, 0.01)
const uv = box.geometry.getAttribute('uv')
const values = Array.from(uv.array as Float32Array)
const maxAbs = Math.max(...values.map(Math.abs))
// caixa de 10 × 20 × 30 mm centrada a 50 mm: a coordenada mais afastada é x = 55 mm.
check('UV projetadas em milímetros reais, independentes da escala de quem chama', Math.abs(maxAbs - 55) < 1e-3)
check('UV sem NaN', Array.from(uv.array as Float32Array).every(Number.isFinite))
const key = box.geometry.userData.cadUvKey
ensureCadUvs(root, 0.01)
check('projeção feita uma só vez por geometria', box.geometry.userData.cadUvKey === key)

// LS XBM-DN32S: frente real (30 mm) à frente, ganchos da calha atrás.
const ls = getComponentModelSpec('plcLsXbmDn32s')!
check('LS XBM-DN32S: corpo slim de frente (30,2 mm) e 82 mm de profundidade', ls.physicalSizeMm.width === 30.2 && ls.physicalSizeMm.depth === 82.03)
check('LS XBM-DN32S: rotação base Rx 90° + Rz 90°', ls.rotation[0] === Math.PI / 2 && ls.rotation[1] === 0 && ls.rotation[2] === Math.PI / 2)
const spots = REAL_TERMINALS.plcLsXbmDn32s ?? []
check('LS XBM-DN32S: 34 ligações nas réguas de topo e base, ao centro da largura', spots.length === 34 && spots.every((spot) => spot.x === 0.5 && (spot.face === 'top' || spot.face === 'bottom')))
const inputs = spots.filter((spot) => spot.label.startsWith('I')).map((spot) => spot.z)
check('LS XBM-DN32S: entradas de trás para a frente, sem sobreposição', inputs.every((z, i) => i === 0 || z > inputs[i - 1]))
const created = createComponent('plcLsXbmDn32s')
check('LS XBM-DN32S: footprint do esquema segue a frente real (45 × 146 px)', created.w === 45 && created.h === 146)
check('LS XBM-DN32S: bornes 2D nas arestas (I0.x à esquerda, I1.x à direita)', lsXbmTerminalLayout('I0.3')!.x === 0 && lsXbmTerminalLayout('I1.3')!.x === 1 && lsXbmTerminalLayout('Q0.0')!.y > 0.5)
const legacy = { ...created, schematicX: 100, w: 123, terminals: created.terminals.map((terminal) => ({ ...terminal, x: 0.3, y: 0 })) }
const upgraded = upgradeLsXbmFront(legacy)
check('LS XBM-DN32S: projetos antigos passam para a frente real sem mudar IDs', upgraded.w === 45 && upgraded.terminals.every((terminal, index) => terminal.id === legacy.terminals[index].id)
  && upgraded.schematicX === Math.round(100 + 123 / 2 - 45 / 2) && upgradeLsXbmFront(upgraded) === upgraded)

if (failures) {
  console.error(`${failures} verificação(ões) falharam`)
  process.exit(1)
}
console.log('cad-surface: OK')
