import assert from 'node:assert/strict'
import * as THREE from 'three'
import {
  DisposableLruCache,
  SHARED_HEX_BOLT_GEO,
  SHARED_UNIT_BOX_GEO,
  SHARED_UNIT_CYL_10_GEO,
  SHARED_WIRE_HIT_MATERIAL,
  SHARED_WIRE_SELECT_MATERIAL,
  getSharedSheathMaterial,
  getSharedWireMaterial,
  resolveSceneQuality,
} from '../src/three/renderOptimization'
import { ductJunctionOpenings } from '../src/schematic/ductJunctions'
import { createComponent } from '../src/electrical/factory'
import { useSimStore } from '../src/store/useSimStore'
import { PANEL_UNITS_PER_MM } from '../src/three/modelPaths'

let passed = 0
function check(label: string, cond: boolean) {
  assert.ok(cond, label)
  passed += 1
  console.log(`  PASS: ${label}`)
}

console.log('=== Smoke Test: Otimização 3D, pooling, LRU GPU e junções de esteiras ===')

// 1. Perfis de qualidade adaptativos (projetos pequenos vs grandes montagens vs baixo desempenho)
{
  const smallHigh = resolveSceneQuality({ componentCount: 8, wireCount: 14, softwareGl: false, deviceTier: 'high' })
  const largeHigh = resolveSceneQuality({ componentCount: 168, wireCount: 120, softwareGl: false, deviceTier: 'high' })
  const smallLow = resolveSceneQuality({ componentCount: 8, wireCount: 14, softwareGl: false, deviceTier: 'low' })
  const sw = resolveSceneQuality({ componentCount: 40, wireCount: 40, softwareGl: true, deviceTier: 'high' })

  check('Projeto pequeno em GPU normal mantém detalhe máximo e sombras de cabos',
    smallHigh.shadowMapSize === 2048 && smallHigh.thinWireCastShadow && smallHigh.wireTubularScale === 1 && smallHigh.steadyRunFps === 30)
  check('Montagem complexa (168 peças / 120 cabos) reduz automaticamente shadowMap, detalhe tubular e desativa sombras em fios finos',
    largeHigh.shadowMapSize <= 1024 && !largeHigh.thinWireCastShadow && largeHigh.wireTubularScale < 0.9 && largeHigh.steadyRunFps <= 24)
  check('Dispositivo de baixo desempenho limita DPR a 1× e sombras a 1024',
    smallLow.dpr[1] === 1 && smallLow.shadowMapSize <= 1024 && !smallLow.thinWireCastShadow && smallLow.steadyRunFps <= 24)
  check('WebGL por software reduz DPR para ≤ 1, shadowMap ≤ 1024 e steadyRunFps ≤ 12',
    sw.dpr[0] <= 0.5 && sw.shadowMapSize <= 1024 && sw.wireRadialSegments <= 8 && sw.steadyRunFps <= 12)
}

// 2. Cache LRU com libertação explícita de GPU (.dispose())
{
  const disposed: string[] = []
  const cache = new DisposableLruCache<{ id: string; dispose: () => void }>(3, (v) => v.dispose())
  const mk = (id: string) => ({ id, dispose: () => disposed.push(id) })

  cache.set('a', mk('a'))
  cache.set('b', mk('b'))
  cache.set('c', mk('c'))
  // Refresca 'a' para que 'b' passe a ser o mais antigo
  check('LRU get() devolve entrada existente e atualiza recência', cache.get('a')?.id === 'a')
  cache.set('d', mk('d'))
  check('LRU expulsa o item menos usado recentemente (b) e liberta GPU', disposed.length === 1 && disposed[0] === 'b' && cache.size === 3)
  cache.set('e', mk('e'))
  check('LRU expulsa o seguinte (c) mantendo o limite máximo', disposed.length === 2 && disposed[1] === 'c' && cache.size === 3)
  cache.clear()
  check('LRU clear() liberta todos os recursos restantes', disposed.length === 5 && cache.size === 0)
}

// 3. Pooling de materiais e geometrias partilhadas
{
  const m1 = getSharedWireMaterial({ color: '#dc2626', flowing: false, burnt: false, heatLevel: 0 })
  const m2 = getSharedWireMaterial({ color: '#dc2626', flowing: false, burnt: false, heatLevel: 0 })
  const mFlowing = getSharedWireMaterial({ color: '#dc2626', flowing: true, burnt: false, heatLevel: 0 })
  const s1 = getSharedSheathMaterial('#1e293b')
  const s2 = getSharedSheathMaterial('#1e293b')

  check('Pooling de materiais de cabos devolve a mesma instância para estados idênticos', m1 === m2 && m1 !== mFlowing)
  check('Pooling de mangas de cabos devolve a mesma instância para estados idênticos', s1 === s2)
  check('Materiais de hit/seleção e geometrias unitárias partilhadas estão disponíveis',
    SHARED_WIRE_HIT_MATERIAL instanceof THREE.MeshBasicMaterial
    && SHARED_WIRE_SELECT_MATERIAL instanceof THREE.MeshBasicMaterial
    && SHARED_UNIT_BOX_GEO instanceof THREE.BoxGeometry
    && SHARED_UNIT_CYL_10_GEO instanceof THREE.CylinderGeometry
    && SHARED_HEX_BOLT_GEO instanceof THREE.CylinderGeometry)
}

// 4. Junções 3D de esteiras: T horizontal limpo vs descida vertical pelo fundo
{
  const U = PANEL_UNITS_PER_MM
  const mainH = createComponent('cableTrayStraight', 'EST-H1', undefined, 0, 0, 0, { lengthMm: 2000, widthMm: 200, sideHeightMm: 60 })
  mainH.panel3DPosition = { x: 0, y: 2000 * U, z: 0 }
  mainH.viewOrientation = { x: 0, y: 0, z: 0 }

  // Ramal horizontal em T chegando exatamente à face -Z (z = -100 mm) do mainH (0 mm de penetração)
  const branchH = createComponent('cableTrayStraight', 'EST-H2', undefined, 0, 0, 0, { lengthMm: 1000, widthMm: 150, sideHeightMm: 60 })
  branchH.panel3DPosition = { x: 0, y: 2000 * U, z: -600 * U } // ponta +Z a -100 mm = face lateral de mainH
  branchH.viewOrientation = { x: 0, y: 90, z: 0 }

  // Ramal vertical descendo por baixo do fundo do mainH (y < 2000 mm, topo sobrepõe 30 mm)
  const dropV = createComponent('cableTrayStraight', 'EST-V1', undefined, 0, 0, 0, { lengthMm: 1000, widthMm: 150, sideHeightMm: 60 })
  dropV.panel3DPosition = { x: 400 * U, y: 1530 * U, z: 0 }
  dropV.viewOrientation = { x: 0, y: 90, z: 90 }

  const trays = [mainH, branchH, dropV]
  const mainOpenings = ductJunctionOpenings(mainH, trays)
  const branchOpenings = ductJunctionOpenings(branchH, trays)
  const dropOpenings = ductJunctionOpenings(dropV, trays)

  const hasWallCut = mainOpenings.some((o) => o.side === 'top' || o.side === 'bottom')
  const floorCuts = mainOpenings.filter((o) => o.side === 'floor')
  const branchEndCuts = branchOpenings.filter((o) => o.endTrim)
  const dropEndCuts = dropOpenings.filter((o) => o.endTrim)

  check('Junção em T horizontal abre a parede lateral correta sem perfurar o fundo para o ramal horizontal',
    hasWallCut && floorCuts.length === 1)
  check('Ramal horizontal em T recebe marcação endTrim na ponta encostada (≤ 2 mm) sem encurtar o troço',
    branchEndCuts.length >= 2 && branchEndCuts.every((o) => Math.abs(o.to - o.from) <= 2))
  check('Descida vertical abre janela no fundo da esteira principal e apara a ponta superior (endTrim)',
    floorCuts.length === 1 && dropEndCuts.length >= 2 && dropEndCuts.every((o) => Math.abs(o.to - o.from) >= 20))
}

// 5. Desempenho em montagem complexa real (Maquete Estampagem — 168 peças)
{
  useSimStore.getState().newProject()
  useSimStore.getState().insertReadyMaquette('atec-estampagem')
  const comps = useSimStore.getState().components
  const trays = comps.filter((c) => c.type === 'cableDuct' || c.type === 'cableTrayStraight')
  const t0 = performance.now()
  let totalOpenings = 0
  for (const item of trays) {
    totalOpenings += ductJunctionOpenings(item, trays).length
  }
  const elapsedMs = performance.now() - t0
  check(`Maquete Estampagem (${comps.length} peças, ${trays.length} calhas/esteiras): junções calculadas em ${elapsedMs.toFixed(1)} ms (${totalOpenings} aberturas)`,
    comps.length >= 160 && trays.length >= 10 && totalOpenings >= 6 && elapsedMs < 150)
}

console.log(`\n${passed} verificações · Otimização 3D e esteiras OK`)
