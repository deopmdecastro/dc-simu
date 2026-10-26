import * as THREE from 'three'
import {
  MOTOR_BOARD, MOTOR_BOARD_TOP, MOTOR_BOX, MOTOR_CAD, MOTOR_FLOOR_Y, MOTOR_GLAND, MOTOR_NUT_TOP, MOTOR_PE,
  MOTOR_SOCKET_DEPTH, MOTOR_STUD, MOTOR_TERMINALS_MM, MOTOR_TERMINAL_ORDER, type MotorTerminalLabel,
} from './motorTerminalLayout'

export { MOTOR_CAD, MOTOR_FLOOR_Y }

/**
 * Compartimento da caixa de bornes do DRN80 sem tampa: paredes com o mesmo
 * contorno do CAD, fundo, placa isolante de seis pernos M4 com porca-luva
 * (furo onde entra o terminal do cabo), borne PE com anilha verde/amarela e
 * bucim M20. Coordenadas do CAD convertidas com `origin` (= mínimo do volume
 * ajustado) e `units` (unidades de cena por mm).
 */
export function buildMotorTerminalBox(origin: THREE.Vector3, units: number, body: THREE.Material | null): THREE.Group {
  const group = new THREE.Group()
  group.name = 'motor-terminal-box'
  group.userData.generatedTerminalSocket = true
  const at = (x: number, y: number, z: number) => new THREE.Vector3(
    origin.x + (x - MOTOR_CAD.minX) * units,
    origin.y + (y - MOTOR_CAD.minY) * units,
    origin.z + (z - MOTOR_CAD.minZ) * units,
  )
  const add = (mesh: THREE.Mesh, name: string) => {
    mesh.name = name
    mesh.userData.generatedTerminalSocket = true
    mesh.castShadow = true; mesh.receiveShadow = true
    group.add(mesh)
    return mesh
  }
  const paint = body ? (body as THREE.Material).clone() : new THREE.MeshStandardMaterial({ color: '#b91c1c', roughness: .5, metalness: .2 })
  ;(paint as THREE.MeshStandardMaterial).side = THREE.DoubleSide
  const inner = new THREE.MeshStandardMaterial({ color: (paint as THREE.MeshStandardMaterial).color?.clone().multiplyScalar(.62) ?? '#7f1d1d', roughness: .7, metalness: .1 })
  const insulator = new THREE.MeshStandardMaterial({ color: '#2a2521', roughness: .55, metalness: 0 })
  const brass = new THREE.MeshStandardMaterial({ color: '#c8a24a', roughness: .32, metalness: .9 })
  const steel = new THREE.MeshStandardMaterial({ color: '#5b6168', roughness: .45, metalness: .8 })
  const black = new THREE.MeshStandardMaterial({ color: '#16181b', roughness: .6, metalness: 0 })

  // Paredes: contorno exterior do CAD com 5 mm de espessura, do fundo novo até ao rebordo original.
  const rounded = (path: THREE.Path, x0: number, z0: number, x1: number, z1: number, r: number) => {
    // Forma no plano (x, -z): depois de rodar −90° em X o eixo da forma "y" passa a −z.
    path.moveTo(x0 + r, -z0)
    path.lineTo(x1 - r, -z0); path.quadraticCurveTo(x1, -z0, x1, -z0 - r)
    path.lineTo(x1, -z1 + r); path.quadraticCurveTo(x1, -z1, x1 - r, -z1)
    path.lineTo(x0 + r, -z1); path.quadraticCurveTo(x0, -z1, x0, -z1 + r)
    path.lineTo(x0, -z0 - r); path.quadraticCurveTo(x0, -z0, x0 + r, -z0)
  }
  const w = MOTOR_BOX.wall
  const outline = new THREE.Shape()
  rounded(outline, MOTOR_BOX.x0, MOTOR_BOX.z0, MOTOR_BOX.x1, MOTOR_BOX.z1, MOTOR_BOX.corner)
  const hole = new THREE.Path()
  rounded(hole, MOTOR_BOX.x0 + w, MOTOR_BOX.z0 + w, MOTOR_BOX.x1 - w, MOTOR_BOX.z1 - w, MOTOR_BOX.corner - 3)
  outline.holes.push(hole)
  const wallHeight = MOTOR_BOX.top - MOTOR_FLOOR_Y
  const walls = new THREE.ExtrudeGeometry(outline, { depth: wallHeight, bevelEnabled: false, curveSegments: 6 })
  walls.rotateX(-Math.PI / 2)
  walls.scale(units, units, units)
  const wallMesh = add(new THREE.Mesh(walls, paint), 'caixa-paredes')
  const base = at(0, MOTOR_FLOOR_Y, 0)
  wallMesh.position.set(origin.x - MOTOR_CAD.minX * units, base.y, origin.z - MOTOR_CAD.minZ * units)

  // Fundo do compartimento (fecha o corte da tampa).
  const innerW = MOTOR_BOX.x1 - MOTOR_BOX.x0 - 2 * w, innerD = MOTOR_BOX.z1 - MOTOR_BOX.z0 - 2 * w
  const boxCx = (MOTOR_BOX.x0 + MOTOR_BOX.x1) / 2, boxCz = (MOTOR_BOX.z0 + MOTOR_BOX.z1) / 2
  add(new THREE.Mesh(new THREE.BoxGeometry(innerW * units, 1.5 * units, innerD * units), inner), 'caixa-fundo')
    .position.copy(at(boxCx, MOTOR_FLOOR_Y - .75, boxCz))
  // Junta da tampa (vedante preto no rebordo).
  const gasket = new THREE.Shape(); rounded(gasket, MOTOR_BOX.x0 + .6, MOTOR_BOX.z0 + .6, MOTOR_BOX.x1 - .6, MOTOR_BOX.z1 - .6, MOTOR_BOX.corner - .6)
  const gHole = new THREE.Path(); rounded(gHole, MOTOR_BOX.x0 + w - .6, MOTOR_BOX.z0 + w - .6, MOTOR_BOX.x1 - w + .6, MOTOR_BOX.z1 - w + .6, MOTOR_BOX.corner - 3)
  gasket.holes.push(gHole)
  const gasketGeo = new THREE.ExtrudeGeometry(gasket, { depth: .6, bevelEnabled: false, curveSegments: 6 })
  gasketGeo.rotateX(-Math.PI / 2); gasketGeo.scale(units, units, units)
  add(new THREE.Mesh(gasketGeo, black), 'caixa-junta').position.set(wallMesh.position.x, at(0, MOTOR_BOX.top - .6, 0).y, wallMesh.position.z)

  // Placa isolante com nervuras entre fases.
  const board = add(new THREE.Mesh(new THREE.BoxGeometry(MOTOR_BOARD.w * units, MOTOR_BOARD.h * units, MOTOR_BOARD.d * units), insulator), 'placa-bornes')
  board.position.copy(at(MOTOR_BOARD.cx, MOTOR_FLOOR_Y + MOTOR_BOARD.h / 2, MOTOR_BOARD.cz))
  for (const dx of [-1, 1]) {
    const rib = add(new THREE.Mesh(new THREE.BoxGeometry(1.6 * units, 3 * units, (MOTOR_BOARD.d - 6) * units), insulator), 'placa-nervura')
    // Nervuras longitudinais nas bordas (não atravessam as pontes).
    rib.position.copy(at(MOTOR_BOARD.cx + dx * (MOTOR_BOARD.w / 2 - 2), MOTOR_BOARD_TOP + 1.5, MOTOR_BOARD.cz))
  }
  for (const dx of [-1, 1]) {
    // Parafusos de fixação da placa.
    const screw = add(new THREE.Mesh(new THREE.CylinderGeometry(2.6 * units, 2.6 * units, 1.4 * units, 16), steel), 'placa-parafuso')
    screw.position.copy(at(MOTOR_BOARD.cx + dx * (MOTOR_BOARD.w / 2 - 6), MOTOR_BOARD_TOP + .7, MOTOR_BOARD.cz + MOTOR_BOARD.d / 2 - 5))
  }
  const labels = boardLabelPlane(units)
  if (labels) { labels.position.copy(at(MOTOR_BOARD.cx, MOTOR_BOARD_TOP + .05, MOTOR_BOARD.cz)); add(labels, 'placa-marcacao') }

  // Borne: anilha, perno M4 e porca-luva sextavada com furo Ø4,8.
  const nutShape = (bore: number) => {
    const s = new THREE.Shape(), r = MOTOR_STUD.nutAcrossFlats / Math.sqrt(3)
    for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; const x = r * Math.cos(a), y = r * Math.sin(a); if (i) s.lineTo(x, y); else s.moveTo(x, y) }
    s.closePath()
    const h = new THREE.Path(); h.absarc(0, 0, bore / 2, 0, Math.PI * 2, true); s.holes.push(h)
    const g = new THREE.ExtrudeGeometry(s, { depth: MOTOR_STUD.nutHeight, bevelEnabled: false, curveSegments: 18 })
    g.rotateX(-Math.PI / 2); g.scale(units, units, units)
    return g
  }
  const studNut = nutShape(MOTOR_STUD.bore)
  const peNut = nutShape(4.2)
  const washer = new THREE.CylinderGeometry(5 * units, 5 * units, MOTOR_STUD.washer * units, 24)
  const studTop = MOTOR_NUT_TOP - MOTOR_SOCKET_DEPTH
  const terminal = (label: MotorTerminalLabel, seat: number, washerMaterial: THREE.Material, geometry: THREE.BufferGeometry) => {
    const [x, , z] = MOTOR_TERMINALS_MM[label]
    add(new THREE.Mesh(washer, washerMaterial), `borne-${label}-anilha`).position.copy(at(x, seat + MOTOR_STUD.washer / 2, z))
    const stud = add(new THREE.Mesh(new THREE.CylinderGeometry(2 * units, 2 * units, (studTop - seat) * units, 16), steel), `borne-${label}-perno`)
    stud.position.copy(at(x, (seat + studTop) / 2, z))
    add(new THREE.Mesh(geometry, brass), `borne-${label}-porca`).position.copy(at(x, seat + MOTOR_STUD.washer, z))
  }
  for (const label of MOTOR_TERMINAL_ORDER) if (label !== 'PE') terminal(label, MOTOR_BOARD_TOP, brass, studNut)

  // PE: pedestal ligado à carcaça, anilha verde/amarela, marcação de terra no fundo.
  const pedestal = add(new THREE.Mesh(new THREE.CylinderGeometry(MOTOR_PE.pedestal / 2 * units, MOTOR_PE.pedestal / 2 * units, (MOTOR_BOARD_TOP - MOTOR_FLOOR_Y) * units, 24), steel), 'borne-PE-base')
  pedestal.position.copy(at(MOTOR_PE.x, (MOTOR_FLOOR_Y + MOTOR_BOARD_TOP) / 2, MOTOR_PE.z))
  terminal('PE', MOTOR_BOARD_TOP, new THREE.MeshStandardMaterial({ color: '#16a34a', roughness: .5 }), peNut)
  const ring = add(new THREE.Mesh(new THREE.TorusGeometry(5 * units, .7 * units, 8, 28), new THREE.MeshStandardMaterial({ color: '#facc15', roughness: .5 })), 'borne-PE-anel')
  ring.rotation.x = Math.PI / 2
  ring.position.copy(at(MOTOR_PE.x, MOTOR_BOARD_TOP + MOTOR_STUD.washer / 2, MOTOR_PE.z))
  const earth = earthPlane(units)
  if (earth) { earth.position.copy(at(MOTOR_PE.x + 14, MOTOR_FLOOR_Y + .05, MOTOR_PE.z)); add(earth, 'borne-PE-simbolo') }

  // Bucim M20 na parede da frente.
  const gland = add(new THREE.Mesh(new THREE.CylinderGeometry(MOTOR_GLAND.diameter / 2 * units, MOTOR_GLAND.diameter / 2 * units, 9 * units, 6), black), 'bucim-porca')
  gland.rotation.x = Math.PI / 2
  gland.position.copy(at(MOTOR_GLAND.x, MOTOR_GLAND.y, MOTOR_BOX.z1 + 4.5))
  const cap = add(new THREE.Mesh(new THREE.CylinderGeometry(7.5 * units, 8.5 * units, 7 * units, 24), black), 'bucim-cupula')
  cap.rotation.x = Math.PI / 2
  cap.position.copy(at(MOTOR_GLAND.x, MOTOR_GLAND.y, MOTOR_BOX.z1 + 12.5))
  return group
}

function canvasPlane(widthMm: number, depthMm: number, units: number, draw: (ctx: CanvasRenderingContext2D, px: number) => void): THREE.Mesh | null {
  if (typeof document === 'undefined') return null
  const px = 12 // píxeis por mm
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(widthMm * px); canvas.height = Math.round(depthMm * px)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  draw(ctx, px)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  const geometry = new THREE.PlaneGeometry(widthMm * units, depthMm * units)
  geometry.rotateX(-Math.PI / 2)
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: .6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }))
  mesh.raycast = () => {}
  return mesh
}

/** Marcação serigrafada da placa (U1 V1 W1 / W2 U2 V2), como nas placas reais. */
function boardLabelPlane(units: number): THREE.Mesh | null {
  return canvasPlane(MOTOR_BOARD.w, MOTOR_BOARD.d, units, (ctx, px) => {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    ctx.fillStyle = '#e7e2d6'
    ctx.font = `700 ${4.2 * px}px Inter, Arial, sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (const label of MOTOR_TERMINAL_ORDER) {
      if (label === 'PE') continue
      const [x, , z] = MOTOR_TERMINALS_MM[label]
      const u = (x - MOTOR_BOARD.cx + MOTOR_BOARD.w / 2) * px
      const back = label.endsWith('2')
      const v = (z - MOTOR_BOARD.cz + MOTOR_BOARD.d / 2 + (back ? -8.6 : 8.6)) * px
      ctx.fillText(label, u, v)
    }
    ctx.strokeStyle = 'rgba(231,226,214,.35)'; ctx.lineWidth = .35 * px
    ctx.strokeRect(1.2 * px, 1.2 * px, (MOTOR_BOARD.w - 2.4) * px, (MOTOR_BOARD.d - 2.4) * px)
  })
}

/** Símbolo de terra (IEC 60417-5019) junto ao PE. */
function earthPlane(units: number): THREE.Mesh | null {
  return canvasPlane(14, 12, units, (ctx, px) => {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    ctx.strokeStyle = '#facc15'; ctx.lineWidth = .9 * px; ctx.lineCap = 'round'
    const cx = 7 * px
    ctx.beginPath(); ctx.moveTo(cx, 1.5 * px); ctx.lineTo(cx, 5.5 * px)
    for (const [y, half] of [[5.5, 4.5], [7.6, 3], [9.7, 1.5]] as const) { ctx.moveTo(cx - half * px, y * px); ctx.lineTo(cx + half * px, y * px) }
    ctx.stroke()
  })
}
