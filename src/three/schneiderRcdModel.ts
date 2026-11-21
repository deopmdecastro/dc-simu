import { bindCachedCanvasTexture } from './canvasTextureCache'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { ComponentType, ElectricalComponent } from '../types'
import { cachedCanvasTexture } from './protectionMarkings'

export type SchneiderRcdType = 'residualBreakerSchneiderIid4p' | 'residualBreakerSchneiderIdpnVigi'
export const isSchneiderRcd = (type: ComponentType): type is SchneiderRcdType =>
  type === 'residualBreakerSchneiderIid4p' || type === 'residualBreakerSchneiderIdpnVigi'

export const SCHNEIDER_RCD_HANDLE_NODE = 'schneider_handle_pivot'
export const SCHNEIDER_RCD_TEST_NODE = 'schneider_test'
export const SCHNEIDER_RCD_THROW_DEG = 70
/** iID 4P: eixo real concêntrico com o berço circular (x −26,9, y 35,0, z 60,5 mm;
 *  relativo ao nó do GLB em y 36,5, z 61,0 mm → Δy −1,5 mm, Δz −0,5 mm) e curso simétrico de 66°. */
export const SCHNEIDER_IID_THROW_DEG = 66
export const SCHNEIDER_IID_AXIS_OFFSET_M = new THREE.Vector3(0, -0.0015, -0.0005)
const IID_AXIS_MM = { x: -26.9, y: 35.0, z: 60.5 } as const
const IID_DRUM_RADIUS_MM = 8.5
const IID_FINISH_REV = 8

export type SchneiderRcdAction = 'toggle' | 'test'
const ownedIndicators = new WeakSet<THREE.Object3D>()

/** Faixa cilíndrica curva concêntrica com o tambor da alavanca (UV 0…1 sem distorção). */
function makeCurvedVisiSafeGeometry(
  radiusMm: number,
  widthMm: number,
  angleLoDeg: number,
  angleHiDeg: number,
  unit: number,
  segments = 24,
): THREE.BufferGeometry {
  const r = radiusMm * unit
  const hw = (widthMm * unit) / 2
  const a0 = THREE.MathUtils.degToRad(angleLoDeg)
  const a1 = THREE.MathUtils.degToRad(angleHiDeg)
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (let i = 0; i <= segments; i++) {
    const v = i / segments
    const a = a0 + (a1 - a0) * v
    const ny = Math.sin(a)
    const nz = Math.cos(a)
    const y = r * ny
    const z = r * nz
    positions.push(-hw, y, z, hw, y, z)
    normals.push(0, ny, nz, 0, ny, nz)
    uvs.push(0, v, 1, v)
  }
  for (let i = 0; i < segments; i++) {
    const b = i * 2
    indices.push(b, b + 1, b + 3, b, b + 3, b + 2)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  return geometry
}

function makePolymer(name: string, color: string, roughness: number, metalness = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ name, color, roughness, metalness })
}

/** Acabamento fiel à referência Schneider Acti9 iID 4P:
 *  - tambor branco fechado concêntrico com o eixo real (R 8,5 mm — sem sobressair abaixo da frente);
 *  - faixas VisiSafe curvas coladas ao tambor (O.OFF superior, I.ON inferior);
 *  - janela VisiTrip logo acima do berço (branca em repouso, vermelha em disparo);
 *  - botão T sólido assente em cavidade fechada (sem fuga de luz ou patilha amarela);
 *  - oito poços de borne com anel chanfrado branco, túnel profundo e parafuso combo/PZ2 recuado.
 *  `unit` converte mm para o referencial local (.001 em runtime, 1 durante construção do GLB). */
export function completeSchneiderIidHandle(root: THREE.Object3D, unit = .001): void {
  const pivot = root.getObjectByName(SCHNEIDER_RCD_HANDLE_NODE)
  if (!pivot?.getObjectByName('schneider_handle_grip')) return

  const whiteBodyMat = makePolymer('iID carcaça branca acetinada', '#f5f6f4', .30)
  const whiteRockerMat = makePolymer('iID alavanca branca', '#f5f6f4', .28)
  const gripMat = makePolymer('iID pega antracite', '#42474c', .38, .04)

  const body = root.getObjectByName('schneider_body') as THREE.Mesh | undefined
  if (body?.isMesh && body.userData.iidPhotoFinish !== IID_FINISH_REV) {
    // Suaviza a pequena nervura horizontal simplificada nos polos 2–4 (y 32..37,5 mm, x > −17,5 mm)
    // para que a frente inferior fique lisa e contínua como na referência Acti9 iID.
    const pos = body.geometry.getAttribute('position')
    if (pos) {
      let smoothed = false
      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i) / unit
        const vy = pos.getY(i) / unit
        const vz = pos.getZ(i) / unit
        if (vx > -17.5 && vy > 32.0 && vy < 38.0 && vz > 66.5 && vz < 68.2) {
          const targetZ = 66.88 + ((vy - 32.0) / 6.0) * (67.34 - 66.88)
          if (Math.abs(vz - targetZ) > 0.02) {
            pos.setZ(i, targetZ * unit)
            smoothed = true
          }
        }
      }
      if (smoothed) {
        pos.needsUpdate = true
        body.geometry.computeVertexNormals()
      }
    }
    body.material = whiteBodyMat
    body.userData.iidPhotoFinish = IID_FINISH_REV
  }
  const cradle = root.getObjectByName('schneider_handle_cradle') as THREE.Mesh | undefined
  if (cradle?.isMesh && cradle.userData.iidPhotoFinish !== IID_FINISH_REV) {
    // Na referência Acti9 iID o berço circular é moldado no mesmo branco da carcaça.
    cradle.material = whiteBodyMat
    cradle.userData.iidPhotoFinish = IID_FINISH_REV
  }
  // Remove a antiga lâmina horizontal saliente que cruzava a base do manípulo.
  root.getObjectByName('schneider_handle_edge')?.removeFromParent()

  const grip = pivot.getObjectByName('schneider_handle_grip') as THREE.Mesh | undefined
  const shoulder = pivot.getObjectByName('schneider_handle_white') as THREE.Mesh | undefined
  if (grip?.isMesh && grip.userData.iidPhotoFinish !== IID_FINISH_REV) {
    grip.material = gripMat
    grip.userData.iidPhotoFinish = IID_FINISH_REV
  }
  if (shoulder?.isMesh && shoulder.userData.iidPhotoFinish !== IID_FINISH_REV) {
    shoulder.material = whiteRockerMat
    shoulder.userData.iidPhotoFinish = IID_FINISH_REV
  }

  // Faixas VisiSafe curvas, concêntricas com o tambor (R = 8,60 mm, largura 9,25 mm).
  for (const [suffix, loDeg, hiDeg, rOff] of [
    ['', 16, 44, .10],
    ['_trip', 16, 44, .12],
    ['_on', -41, -13, .10],
  ] as const) {
    const indicator = root.getObjectByName('schneider_visisafe' + suffix) as THREE.Mesh | undefined
    if (!indicator?.isMesh) continue
    if (indicator.userData.iidCurvedVisiSafe !== IID_FINISH_REV) {
      indicator.geometry.dispose()
      indicator.geometry = makeCurvedVisiSafeGeometry(IID_DRUM_RADIUS_MM + rOff, 9.25, loDeg, hiDeg, unit)
      indicator.position.set(IID_AXIS_MM.x * unit, IID_AXIS_MM.y * unit, IID_AXIS_MM.z * unit)
      indicator.rotation.set(0, 0, 0)
      indicator.userData.iidCurvedVisiSafe = IID_FINISH_REV
      indicator.userData.protectionMarking = true
    }
  }

  // Tambor concêntrico (R = 8,5 mm, largura 9,5 mm) e colo sólido atrás da pega.
  const previousBarrel = pivot.getObjectByName('schneider_handle_barrel')
  if (previousBarrel?.userData.schneiderHandleClosure !== IID_FINISH_REV) {
    previousBarrel?.removeFromParent()
    pivot.getObjectByName('schneider_handle_neck')?.removeFromParent()

    const barrelGeo = new THREE.CylinderGeometry(IID_DRUM_RADIUS_MM * unit, IID_DRUM_RADIUS_MM * unit, 9.5 * unit, 64, 1, false)
    barrelGeo.rotateZ(Math.PI / 2)
    const barrel = new THREE.Mesh(barrelGeo, shoulder?.material ?? whiteRockerMat)
    barrel.name = 'schneider_handle_barrel'
    barrel.position.copy(SCHNEIDER_IID_AXIS_OFFSET_M).multiplyScalar(unit / .001)
    barrel.userData.schneiderControl = 'toggle'
    barrel.userData.schneiderHandleClosure = IID_FINISH_REV
    pivot.add(barrel)

    // Colo branco sólido que liga o tambor cilíndrico à face traseira da pega escura,
    // evitando qualquer fresta quando a alavanca é observada por baixo em posição ON.
    const neckShape = new THREE.Shape()
    neckShape.moveTo(0, -1.5)
    neckShape.lineTo(9.8, -5.8)
    neckShape.lineTo(8.2, -9.8)
    neckShape.lineTo(1.2, -7.8)
    neckShape.closePath()
    const neckGeo = new THREE.ExtrudeGeometry(neckShape, { depth: 9.1, bevelEnabled: false, steps: 1 })
    neckGeo.translate(0, 0, -4.55)
    neckGeo.rotateY(-Math.PI / 2) // shape X → +Z, shape Y → +Y, depth → X
    neckGeo.scale(unit, unit, unit)
    const neck = new THREE.Mesh(neckGeo, shoulder?.material ?? whiteRockerMat)
    neck.name = 'schneider_handle_neck'
    neck.position.copy(SCHNEIDER_IID_AXIS_OFFSET_M).multiplyScalar(unit / .001)
    neck.userData.schneiderControl = 'toggle'
    neck.userData.schneiderHandleClosure = IID_FINISH_REV
    pivot.add(neck)
  }

  completeIidPhotoDetails(root, unit, whiteBodyMat)
}

/** Constrói anel chanfrado branco, parede interna do túnel e parafuso metálico combo/PZ2
 *  assente no fundo real do poço frontal (z ≈ 42,4 mm, sem obstruir os túneis de cabo em Y). */
function buildTerminalWellAssembly(unit: number, whiteMat: THREE.Material) {
  const steelMat = new THREE.MeshStandardMaterial({
    name: 'iID parafusos aço zincado',
    color: '#d8dde0',
    metalness: .88,
    roughness: .20,
  })
  const slotMat = new THREE.MeshStandardMaterial({
    name: 'iID ranhura combo parafuso',
    color: '#5a6168',
    metalness: .72,
    roughness: .42,
  })
  const tunnelMat = new THREE.MeshStandardMaterial({
    name: 'iID parede poço parafuso',
    color: '#d9ddda',
    roughness: .48,
    metalness: 0,
    side: THREE.BackSide,
  })

  // Colarinho branco circular chanfrado à boca do poço (z local 0 = face frontal ≈ 48,7 mm).
  const collarPoints = [
    new THREE.Vector2(3.48, -0.8),
    new THREE.Vector2(3.48, 0.15),
    new THREE.Vector2(3.72, 0.55),
    new THREE.Vector2(4.25, 0.60),
    new THREE.Vector2(4.62, 0.20),
    new THREE.Vector2(4.68, -0.35),
  ].map((p) => p.multiplyScalar(unit))
  const collarGeo = new THREE.LatheGeometry(collarPoints, 40)
  collarGeo.rotateX(Math.PI / 2)

  // Parede cilíndrica do túnel profundo (de z local −5,4 até −0,2 mm).
  const tunnelGeo = new THREE.CylinderGeometry(3.52 * unit, 3.52 * unit, 5.4 * unit, 36, 1, true)
  tunnelGeo.rotateX(Math.PI / 2)
  tunnelGeo.translate(0, 0, -2.85 * unit)

  // Cabeça do parafuso combo (fenda reta fina + cruz PZ2) assente a z local −5,2 mm (z ≈ 43,5 mm).
  const headShape = new THREE.Shape()
  headShape.absarc(0, 0, 3.24, 0, Math.PI * 2, false)
  const slot = new THREE.Path()
  const sw = 0.40, sl = 2.85, cw = 0.32, cl = 1.80
  const pts: [number, number][] = [
    [-sw, -sl], [sw, -sl], [sw, -cw], [cl, -cw], [cl, cw], [sw, cw],
    [sw, sl], [-sw, sl], [-sw, cw], [-cl, cw], [-cl, -cw], [-sw, -cw],
  ]
  pts.forEach(([x, y], i) => (i ? slot.lineTo(x, y) : slot.moveTo(x, y)))
  slot.closePath()
  headShape.holes.push(slot)

  const headGeo = new THREE.ExtrudeGeometry(headShape, {
    depth: .82,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: .18,
    bevelThickness: .18,
    curveSegments: 32,
  })
  headGeo.scale(unit, unit, unit)
  headGeo.translate(0, 0, -5.35 * unit)

  const floorGeo = new THREE.CylinderGeometry(3.34 * unit, 3.34 * unit, .42 * unit, 36)
  floorGeo.rotateX(Math.PI / 2)
  floorGeo.translate(0, 0, -5.30 * unit)

  const washerGeo = new THREE.RingGeometry(3.02 * unit, 3.46 * unit, 36)
  washerGeo.translate(0, 0, -5.22 * unit)

  return { collarGeo, tunnelGeo, headGeo, floorGeo, washerGeo, whiteMat, tunnelMat, steelMat, slotMat }
}

/** Pormenores visíveis reconstruídos a partir da fotografia de referência Acti9 iID 4P.
 *  Não ocupam as entradas verticais de condutores (eixo Y, z ≈ 21 mm). */
function completeIidPhotoDetails(root: THREE.Object3D, unit: number, whiteBodyMat: THREE.Material): void {
  // 1. Oito poços de parafuso profundos com anel branco chanfrado e cabeça combo/PZ2 recuada.
  const existingScrew0 = root.getObjectByName('schneider_terminal_screw_0')
  if (!existingScrew0 || existingScrew0.userData.iidScrewRev !== IID_FINISH_REV) {
    for (let i = 0; i < 8; i++) root.getObjectByName('schneider_terminal_screw_' + i)?.removeFromParent()
    const well = buildTerminalWellAssembly(unit, whiteBodyMat)
    const angles = [-22, 18, -14, 28, 15, -26, 20, -12]
    for (const [row, y] of [78.56, 9.04].entries()) {
      for (let pole = 0; pole < 4; pole++) {
        const idx = row * 4 + pole
        const group = new THREE.Group()
        group.name = 'schneider_terminal_screw_' + idx
        group.userData.iidScrewRev = IID_FINISH_REV
        group.position.set((-26.7 + pole * 17.8) * unit, y * unit, 48.72 * unit)

        const collar = new THREE.Mesh(well.collarGeo, well.whiteMat)
        collar.name = 'schneider_terminal_collar_' + idx
        const tunnel = new THREE.Mesh(well.tunnelGeo, well.tunnelMat)
        tunnel.name = 'schneider_terminal_tunnel_' + idx

        const screwSpin = new THREE.Group()
        screwSpin.rotation.z = angles[idx] * Math.PI / 180
        screwSpin.add(
          new THREE.Mesh(well.headGeo, well.steelMat),
          new THREE.Mesh(well.floorGeo, well.slotMat),
          new THREE.Mesh(well.washerGeo, well.steelMat),
        )
        group.add(collar, tunnel, screwSpin)
        root.add(group)
      }
    }
  }

  // 2. Cavidade fechada atrás do botão T (impede fuga de luz ou patilha amarela) e botão T 3D sólido.
  const existingRecess = root.getObjectByName('schneider_test_recess')
  if (!existingRecess || existingRecess.userData.iidPhotoFinish !== IID_FINISH_REV) {
    existingRecess?.removeFromParent()
    const recessMat = makePolymer('iID cavidade botão T', '#aeb3b0', .58)
    const recessGroup = new THREE.Group()
    recessGroup.name = 'schneider_test_recess'
    recessGroup.userData.iidPhotoFinish = IID_FINISH_REV
    // Placa traseira + 4 paredes perimetrais dentro da abertura real do STEP (x -31,65..-22,35, y 57,76..61,26).
    const back = new THREE.Mesh(new THREE.BoxGeometry(9.6 * unit, 3.8 * unit, .6 * unit), recessMat)
    back.position.set(-26.95 * unit, 59.51 * unit, 66.2 * unit)
    const topWall = new THREE.Mesh(new THREE.BoxGeometry(9.5 * unit, .22 * unit, 2.9 * unit), recessMat)
    topWall.position.set(-26.95 * unit, 61.26 * unit, 67.65 * unit)
    const botWall = new THREE.Mesh(new THREE.BoxGeometry(9.5 * unit, .22 * unit, 2.9 * unit), recessMat)
    botWall.position.set(-26.95 * unit, 57.76 * unit, 67.65 * unit)
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(.22 * unit, 3.65 * unit, 2.9 * unit), recessMat)
    leftWall.position.set(-31.65 * unit, 59.51 * unit, 67.65 * unit)
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(.22 * unit, 3.65 * unit, 2.9 * unit), recessMat)
    rightWall.position.set(-22.25 * unit, 59.51 * unit, 67.65 * unit)
    recessGroup.add(back, topWall, botWall, leftWall, rightWall)
    root.add(recessGroup)
  }

  const test = root.getObjectByName('schneider_test') as THREE.Mesh | undefined
  if (test?.isMesh && test.userData.iidPhotoFinish !== IID_FINISH_REV) {
    root.updateMatrixWorld(true)
    const toLocal = new THREE.Matrix4().copy(test.matrixWorld).invert().multiply(root.matrixWorld)
    // Botão 3D sólido com corpo recuado até z = 67,55 mm e face frontal a z = 71,15 mm (projeção ~2,2 mm).
    const geometry = new RoundedBoxGeometry(8.92 * unit, 3.22 * unit, 3.60 * unit, 4, .34 * unit)
    geometry.translate(-26.95 * unit, 59.51 * unit, 69.35 * unit).applyMatrix4(toLocal)
    test.geometry.dispose()
    test.geometry = geometry
    test.material = makePolymer('iID botão de ensaio branco', '#f1f3f0', .30)
    test.userData.iidPhotoFinish = IID_FINISH_REV
  }

  // 3. Janela VisiTrip (acima do manípulo, na linha do degrau frontal) e pormenores de acabamento da carcaça.
  const existingDetails = root.getObjectByName('schneider_fascia_details')
  if (!existingDetails || existingDetails.userData.iidPhotoFinish !== IID_FINISH_REV) {
    existingDetails?.removeFromParent()
    const details = new THREE.Group()
    details.name = 'schneider_fascia_details'
    details.userData.iidPhotoFinish = IID_FINISH_REV

    const seamMat = makePolymer('iID friso moldagem', '#cfd4d1', .48)
    const grooveBevelMat = makePolymer('iID degrau frontal suave', '#eff1ee', .32)
    const slotShadowMat = makePolymer('iID folga ranhura manípulo', '#bfc4c1', .55)

    // Chanfro suave inclinado a 45° no degrau horizontal (y 44,55..46,28 mm), ligeiramente à frente da aresta STEP
    // para eliminar z-fighting e reproduzir o friso duplo limpo da fotografia Acti9 iID.
    const bevelShape = new THREE.Shape()
    bevelShape.moveTo(67.58, 44.55)
    bevelShape.lineTo(69.42, 45.80)
    bevelShape.lineTo(69.42, 46.28)
    bevelShape.lineTo(67.58, 46.28)
    bevelShape.closePath()
    const bevelGeo = new THREE.ExtrudeGeometry(bevelShape, { depth: 71.55, bevelEnabled: false, steps: 1 })
    bevelGeo.translate(0, 0, -71.55 / 2)
    bevelGeo.rotateY(-Math.PI / 2)
    bevelGeo.scale(unit, unit, unit)
    details.add(new THREE.Mesh(bevelGeo, grooveBevelMat))

    // Dupla linha fina cinzento-clara de moldagem ao longo dos 4 módulos como na fotografia Acti9 iID.
    const upperLine = new THREE.Mesh(new THREE.BoxGeometry(71.55 * unit, .24 * unit, .18 * unit), seamMat)
    upperLine.position.set(0, 48.25 * unit, 69.36 * unit)
    const lowerLine = new THREE.Mesh(new THREE.BoxGeometry(71.55 * unit, .24 * unit, .20 * unit), seamMat)
    lowerLine.position.set(0, 44.55 * unit, 67.62 * unit)
    details.add(upperLine, lowerLine)

    // Janela VisiTrip visível na face frontal logo acima do degrau (x −26,9, y 47,05, z 69,34 mm):
    // branca em repouso (como na fotografia Acti9 iID) e vermelha em disparo diferencial.
    const vtFrame = new THREE.Mesh(new THREE.BoxGeometry(6.2 * unit, 1.55 * unit, .24 * unit), seamMat)
    vtFrame.position.set(-26.9 * unit, 47.05 * unit, 69.34 * unit)
    details.add(vtFrame)

    const vtFlag = new THREE.Mesh(
      new THREE.BoxGeometry(5.3 * unit, .98 * unit, .22 * unit),
      makePolymer('iID janela VisiTrip', '#ebeeeb', .32),
    )
    vtFlag.name = 'schneider_visitrip_flag'
    vtFlag.position.set(-26.9 * unit, 47.05 * unit, 69.41 * unit)
    details.add(vtFlag)

    // Paredes internas discretas da ranhura do manípulo (selam folgas laterais e dão profundidade real).
    for (const sx of [-31.55, -22.25]) {
      const cheek = new THREE.Mesh(new THREE.BoxGeometry(.24 * unit, 14.4 * unit, 3.6 * unit), slotShadowMat)
      cheek.position.set(sx * unit, 35.0 * unit, 64.4 * unit)
      details.add(cheek)
    }

    // Linhas subtis de junção entre os 4 módulos nos degraus superior e inferior.
    for (const mx of [-17.9, 0, 17.9]) {
      const topSeam = new THREE.Mesh(new THREE.BoxGeometry(.28 * unit, 18.2 * unit, .18 * unit), seamMat)
      topSeam.position.set(mx * unit, 75.5 * unit, 49.05 * unit)
      const botSeam = new THREE.Mesh(new THREE.BoxGeometry(.28 * unit, 19.4 * unit, .18 * unit), seamMat)
      botSeam.position.set(mx * unit, 10.2 * unit, 48.95 * unit)
      details.add(topSeam, botSeam)
    }

    // Moldura lateral esquerda subtil da tampa do módulo (como na fotografia Acti9 iID).
    const sideFrameTop = new THREE.Mesh(new THREE.BoxGeometry(.18 * unit, .35 * unit, 44.0 * unit), seamMat)
    sideFrameTop.position.set(-35.88 * unit, 64.0 * unit, 38.0 * unit)
    const sideFrameBot = new THREE.Mesh(new THREE.BoxGeometry(.18 * unit, .35 * unit, 44.0 * unit), seamMat)
    sideFrameBot.position.set(-35.88 * unit, 21.5 * unit, 38.0 * unit)
    const sideFrameRear = new THREE.Mesh(new THREE.BoxGeometry(.18 * unit, 42.8 * unit, .35 * unit), seamMat)
    sideFrameRear.position.set(-35.88 * unit, 42.75 * unit, 16.0 * unit)
    details.add(sideFrameTop, sideFrameBot, sideFrameRear)

    root.add(details)
  }
}

/** Anota as peças móveis ANTES da junção de malhas estáticas do painel. */
export function prepareSchneiderRcdModel(root: THREE.Object3D): void {
  completeSchneiderIidHandle(root)
  root.traverse((node) => {
    if (node.name.startsWith('schneider_handle') || node.name.startsWith('schneider_visisafe')) node.userData.schneiderControl = 'toggle'
    else if (node.name.startsWith('schneider_test') && node.name !== 'schneider_test_recess') node.userData.schneiderControl = 'test'
    // As fitas têm UVs próprios 0…1. O acabamento CAD não pode reprojetá-los
    // em milímetros antes de as texturas O.OFF / I.ON serem aplicadas.
    if (node.name.startsWith('schneider_visisafe') || node.name === 'schneider_visitrip_flag') {
      node.userData.protectionMarking = true
      const mesh = node as THREE.Mesh
      if (mesh.isMesh && !ownedIndicators.has(node)) {
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(m => m.clone()) : mesh.material.clone()
        ownedIndicators.add(node)
      }
    }
    const mesh = node as THREE.Mesh
    if (mesh.isMesh) mesh.castShadow = mesh.receiveShadow = true
  })
}

export function schneiderRcdAction(object: THREE.Object3D): SchneiderRcdAction | null {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    const action = node.userData.schneiderControl
    if (action === 'test' || action === 'toggle') return action
  }
  return null
}

/** A geometria não altera IDs, bornes nem a lógica RCCB/RCBO dos projetos. */
export function schneiderRcdActionPatch(component: Pick<ElectricalComponent, 'state' | 'locked'>, action: SchneiderRcdAction): Record<string, unknown> | null {
  if (component.locked) return null
  return action === 'test'
    ? { closed: false, tripped: true, tripReason: 'test', testPressed: false }
    : { closed: component.state.tripped ? true : !component.state.closed, tripped: false, tripReason: '', testPressed: false }
}

/** Mesma pose/VisiSafe no painel, na vista frontal e na capa da biblioteca. */
export function applySchneiderRcdState(root: THREE.Object3D, state: Record<string, unknown>): void {
  const tripped = !!state.tripped
  const closed = !!state.closed && !tripped
  const pivot = root.getObjectByName(SCHNEIDER_RCD_HANDLE_NODE)
  if (pivot && pivot.getObjectByName('schneider_handle_grip')) {
    // iID 4P: roda em torno do eixo concêntrico do berço circular (x -26,9, y 35,0, z 60,5 mm),
    // com curso simétrico de 66° entre OFF (baixo) e ON (cima) e ponto intermédio em disparo.
    const restPosition = (pivot.userData.schneiderRestPosition ??= pivot.position.clone()) as THREE.Vector3
    const angle = -THREE.MathUtils.degToRad(SCHNEIDER_IID_THROW_DEG) * (closed ? 1 : tripped ? 0.5 : 0)
    const toAxis = SCHNEIDER_IID_AXIS_OFFSET_M.clone()
    pivot.rotation.x = angle
    pivot.position.copy(restPosition).add(toAxis).add(toAxis.clone().negate().applyAxisAngle(new THREE.Vector3(1, 0, 0), angle))
  } else if (pivot) pivot.rotation.x = -THREE.MathUtils.degToRad(SCHNEIDER_RCD_THROW_DEG) * (closed ? 1 : tripped ? 0.48 : 0)
  root.traverse((node) => {
    if (node.name === SCHNEIDER_RCD_TEST_NODE || node.name === 'schneider_test_letter') {
      node.userData.schneiderRestZ ??= node.position.z
      node.position.z = Number(node.userData.schneiderRestZ) - (state.testPressed ? 0.0012 : 0)
    }
  })
  applySchneiderRcdIndicator(root, state)
  root.updateMatrixWorld(true)
}

/** Só a sinalização: a rig genérica do Admin já é responsável pela cinemática. */
export function applySchneiderRcdIndicator(root: THREE.Object3D, state: Record<string, unknown>): void {
  const tripped = !!state.tripped, closed = !!state.closed && !tripped
  const pose = closed ? '_on' : tripped ? '_trip' : ''
  for (const suffix of ['', '_on', '_trip']) {
    const status = root.getObjectByName(`schneider_visisafe${suffix}`) as THREE.Mesh | undefined
    if (!status) continue
    const active = suffix === pose
    status.visible = true
    status.raycast = active ? THREE.Mesh.prototype.raycast : () => {}
    const on = suffix === '_on'
    const curved = status.userData.iidCurvedVisiSafe === IID_FINISH_REV || (status.geometry.attributes.position?.count ?? 0) > 4
    const texture = cachedCanvasTexture(
      `acti9:visisafe:v2:${curved ? 'curved' : 'flat'}:${on ? 'on' : 'off'}`,
      curved ? 512 : 360,
      curved ? 220 : 100,
      (ctx, w, h) => {
        ctx.fillStyle = on ? '#c92228' : '#0e7d40'
        ctx.fillRect(0, 0, w, h)
        ctx.fillStyle = '#f5f7f2'
        ctx.font = curved ? '700 108px "Inter", Arial, sans-serif' : '600 72px Arial, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(on ? 'I.ON' : 'O.OFF', w / 2, h * 0.53)
      },
    )
    const material = status.material as THREE.MeshStandardMaterial
    material.visible = active
    material.roughness = .34
    material.metalness = 0
    material.color.set(texture ? '#ffffff' : on ? '#c92228' : '#0e7d40')
    if (material.map !== texture) { bindCachedCanvasTexture(material, texture); material.map = texture; material.needsUpdate = true }
  }

  // Janela VisiTrip (branca em serviço normal, vermelha em disparo diferencial).
  const visitrip = root.getObjectByName('schneider_visitrip_flag') as THREE.Mesh | undefined
  if (visitrip?.isMesh) {
    const mat = visitrip.material as THREE.MeshStandardMaterial
    mat.color.set(tripped ? '#d92027' : '#ebeeeb')
    mat.emissive?.set(tripped ? '#6b0b0e' : '#000000')
    mat.emissiveIntensity = tripped ? .35 : 0
    mat.needsUpdate = true
  }
}
