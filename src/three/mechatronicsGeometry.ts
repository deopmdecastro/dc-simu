import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Geometria CAD paramétrica da maquete de estampagem (todas as cotas em mm, centradas na origem).
 * Os componentes React aplicam a escala 1 mm → PANEL_UNITS_PER_MM num único grupo exterior.
 */

const cache = new Map<string, THREE.BufferGeometry>()
/** Geometrias partilhadas por chave (perfis iguais reutilizam o mesmo buffer na GPU). */
export function cachedGeometry(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = cache.get(key)
  if (!g) {
    g = build()
    g.userData.mecShared = true
    cache.set(key, g)
  }
  return g
}

/* ---------------------------------------------------------------- perfil T */

/** Secção de perfil de alumínio com ranhura em T nas 4 faces e furo central (sistema 30/40, ranhura 8). */
export function tSlotProfileShape(section: number): THREE.Shape {
  const h = section / 2
  const a = section * 0.137 // meia abertura da ranhura (8,2 mm no perfil 30)
  const n = section * 0.075 // espessura do lábio
  const b = section * 0.27 // meia largura da câmara
  const d = section * 0.3 // profundidade total da ranhura
  const side: Array<[number, number]> = [
    [-a, h], [-a, h - n], [-b, h - n], [-b * 0.55, h - d], [b * 0.55, h - d], [b, h - n], [a, h - n], [a, h],
  ]
  const pts: THREE.Vector2[] = []
  for (let k = 0; k < 4; k += 1) {
    // Rotação horária de 90° por face: (x, y) → (y, −x)
    const rot = ([x, y]: [number, number]): [number, number] => {
      let px = x, py = y
      for (let i = 0; i < k; i += 1) [px, py] = [py, -px]
      return [px, py]
    }
    const corner = rot([-h, h])
    pts.push(new THREE.Vector2(corner[0], corner[1]))
    for (const p of side) { const r = rot(p); pts.push(new THREE.Vector2(r[0], r[1])) }
  }
  const shape = new THREE.Shape(pts)
  const bore = new THREE.Path()
  bore.absarc(0, 0, section * 0.14, 0, Math.PI * 2, true)
  shape.holes.push(bore)
  return shape
}

/** Perfil T extrudido ao longo de +Y, centrado (comprimento total `length`). */
export function tSlotProfileGeometry(section: number, length: number): THREE.BufferGeometry {
  return cachedGeometry(`tslot:${section}:${Math.round(length)}`, () => {
    const bevel = 0.45
    const g = new THREE.ExtrudeGeometry(tSlotProfileShape(section), {
      depth: Math.max(1, length - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.6, bevelSegments: 1, curveSegments: 10,
    })
    g.translate(0, 0, -length / 2 + bevel)
    g.rotateX(-Math.PI / 2)
    g.computeVertexNormals()
    return g
  })
}

/* ---------------------------------------------------------- base ranhurada */

/** Placa extrudida com ranhuras T longitudinais (ao longo de X) no topo; centrada. */
export function slotPlateGeometry(length: number, width: number, thickness: number, pitch: number): THREE.BufferGeometry {
  return cachedGeometry(`plate:${length}:${width}:${thickness}:${pitch}`, () => {
    const hw = width / 2, ht = thickness / 2
    const count = Math.max(1, Math.floor(width / pitch))
    const open = 3.2, lip = 2.6, cham = 6.2, depth = 9
    const pts: THREE.Vector2[] = [new THREE.Vector2(-hw, -ht + 1), new THREE.Vector2(-hw + 1, -ht), new THREE.Vector2(hw - 1, -ht), new THREE.Vector2(hw, -ht + 1), new THREE.Vector2(hw, ht - 0.8), new THREE.Vector2(hw - 0.8, ht)]
    // Topo da direita para a esquerda, a inserir as ranhuras.
    for (let i = count - 1; i >= 0; i -= 1) {
      const c = -hw + pitch / 2 + i * pitch
      pts.push(
        new THREE.Vector2(c + open, ht), new THREE.Vector2(c + open, ht - lip), new THREE.Vector2(c + cham, ht - lip),
        new THREE.Vector2(c + cham * 0.6, ht - depth), new THREE.Vector2(c - cham * 0.6, ht - depth), new THREE.Vector2(c - cham, ht - lip),
        new THREE.Vector2(c - open, ht - lip), new THREE.Vector2(c - open, ht),
      )
    }
    pts.push(new THREE.Vector2(-hw + 0.8, ht), new THREE.Vector2(-hw, ht - 0.8))
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: length, bevelEnabled: false })
    g.translate(0, 0, -length / 2)
    g.rotateY(Math.PI / 2)
    g.computeVertexNormals()
    return g
  })
}

/* -------------------------------------------------------- chapas e blocos */

/** Retângulo com furos oblongos (rasgos) — extrudido em +Z com espessura `thickness`, centrado. */
export function slottedPanelGeometry(
  width: number, height: number, thickness: number,
  slots: Array<{ x: number; y: number; w: number; h: number }>,
  key: string,
): THREE.BufferGeometry {
  return cachedGeometry(`slotted:${key}`, () => {
    const shape = new THREE.Shape()
    shape.moveTo(-width / 2, -height / 2)
    shape.lineTo(width / 2, -height / 2)
    shape.lineTo(width / 2, height / 2)
    shape.lineTo(-width / 2, height / 2)
    shape.closePath()
    for (const s of slots) {
      const r = Math.min(s.w, s.h) / 2
      const p = new THREE.Path()
      if (s.h >= s.w) {
        p.absarc(s.x, s.y + s.h / 2 - r, r, 0, Math.PI, false)
        p.absarc(s.x, s.y - s.h / 2 + r, r, Math.PI, Math.PI * 2, false)
      } else {
        p.absarc(s.x - s.w / 2 + r, s.y, r, Math.PI / 2, Math.PI * 1.5, false)
        p.absarc(s.x + s.w / 2 - r, s.y, r, -Math.PI / 2, Math.PI / 2, false)
      }
      p.closePath()
      shape.holes.push(p)
    }
    const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.35, bevelSegments: 1, curveSegments: 14 })
    g.translate(0, 0, -thickness / 2)
    g.computeVertexNormals()
    return g
  })
}

/** Bloco maquinado com rebaixo circular no topo (Y), arestas chanfradas. */
export function recessedBlockGeometry(lx: number, ly: number, lz: number, recessDiameter: number, recessDepth: number): THREE.BufferGeometry {
  return cachedGeometry(`recess:${lx}:${ly}:${lz}:${recessDiameter}:${recessDepth}`, () => {
    const ch = 1.2
    const outline = new THREE.Shape()
    outline.moveTo(-lx / 2 + ch, -lz / 2)
    outline.lineTo(lx / 2 - ch, -lz / 2)
    outline.lineTo(lx / 2, -lz / 2 + ch)
    outline.lineTo(lx / 2, lz / 2 - ch)
    outline.lineTo(lx / 2 - ch, lz / 2)
    outline.lineTo(-lx / 2 + ch, lz / 2)
    outline.lineTo(-lx / 2, lz / 2 - ch)
    outline.lineTo(-lx / 2, -lz / 2 + ch)
    outline.closePath()
    const ring = outline.clone()
    const hole = new THREE.Path()
    hole.absarc(0, 0, recessDiameter / 2, 0, Math.PI * 2, true)
    ring.holes.push(hole)
    const top = new THREE.ExtrudeGeometry(ring, { depth: recessDepth, bevelEnabled: false, curveSegments: 40 })
    const body = new THREE.ExtrudeGeometry(outline, { depth: ly - recessDepth, bevelEnabled: false })
    // Extrusão em +Z → rodar para +Y (o topo do bloco fica em +ly/2).
    top.rotateX(-Math.PI / 2); top.translate(0, ly / 2 - recessDepth, 0)
    body.rotateX(-Math.PI / 2); body.translate(0, -ly / 2, 0)
    const merged = mergeGeometries([top.toNonIndexed(), body.toNonIndexed()]) ?? body
    merged.computeVertexNormals()
    return merged
  })
}

/** Calha em U de chapa dobrada (abas para cima), extrudida ao longo de X, centrada. */
export function rampChannelGeometry(length: number, width: number, flange: number, sheet = 1.5): THREE.BufferGeometry {
  return cachedGeometry(`ramp:${length}:${width}:${flange}`, () => {
    const hw = width / 2
    const s = new THREE.Shape([
      new THREE.Vector2(-hw, 0), new THREE.Vector2(hw, 0), new THREE.Vector2(hw, flange), new THREE.Vector2(hw - sheet, flange),
      new THREE.Vector2(hw - sheet, sheet), new THREE.Vector2(-hw + sheet, sheet), new THREE.Vector2(-hw + sheet, flange), new THREE.Vector2(-hw, flange),
    ])
    const g = new THREE.ExtrudeGeometry(s, { depth: length, bevelEnabled: false })
    g.translate(0, 0, -length / 2)
    g.rotateY(Math.PI / 2)
    g.computeVertexNormals()
    return g
  })
}

/* --------------------------------------------------------------- rotativos */

/** Roda/pinhão cónico de dentes retos (eixo Y, base em y = 0, vértice para +Y). */
export function bevelGearGeometry(radius: number, face: number, teeth: number): THREE.BufferGeometry {
  return cachedGeometry(`bevel:${radius}:${face}:${teeth}`, () => {
    const parts: THREE.BufferGeometry[] = []
    const cone = new THREE.CylinderGeometry(radius * 0.52, radius * 0.92, face, Math.max(24, teeth), 1)
    cone.translate(0, face / 2, 0)
    parts.push(cone.toNonIndexed())
    const hub = new THREE.CylinderGeometry(radius * 0.32, radius * 0.32, face * 1.6, 20)
    hub.translate(0, face * 0.8, 0)
    parts.push(hub.toNonIndexed())
    const tilt = Math.atan2(radius * 0.4, face)
    const toothH = Math.hypot(face, radius * 0.4)
    for (let i = 0; i < teeth; i += 1) {
      const ang = (i / teeth) * Math.PI * 2
      const tooth = new THREE.BoxGeometry((Math.PI * 2 * radius * 0.72) / teeth * 0.62, toothH * 0.98, radius * 0.15)
      // Dente encostado à geratriz do cone, inclinado para o vértice.
      tooth.rotateX(-tilt)
      tooth.translate(0, face / 2, radius * 0.72)
      tooth.rotateY(ang)
      parts.push(tooth.toNonIndexed())
    }
    const merged = mergeGeometries(parts) ?? cone
    merged.computeVertexNormals()
    return merged
  })
}

/** Ventosa de fole simples Ø25 em borracha (revolução; topo em y = 0, lábio em y = −height). */
export function bellowsCupGeometry(diameter: number): THREE.BufferGeometry {
  return cachedGeometry(`bellows:${diameter}`, () => {
    const r = diameter / 2
    const pts = [
      [r * 0.28, 0], [r * 0.42, -1], [r * 0.46, -3], [r * 0.82, -6.5], [r * 0.86, -8], [r * 0.5, -10.5],
      [r * 0.6, -12.5], [r * 0.98, -16], [r * 1.0, -17], [r * 0.9, -17.2], [r * 0.52, -14.2], [r * 0.4, -11], [r * 0.3, -6], [r * 0.24, -1],
    ].map(([x, y]) => new THREE.Vector2(x, y))
    const g = new THREE.LatheGeometry(pts, 36)
    g.computeVertexNormals()
    return g
  })
}

/** Tarugo Ø×h com chanfros de 0,8 mm (revolução, centrado). */
export function workpieceGeometry(diameter: number, height: number): THREE.BufferGeometry {
  return cachedGeometry(`billet:${diameter}:${height}`, () => {
    const r = diameter / 2, h = height / 2, c = 0.8
    const pts = [[0, -h], [r - c, -h], [r, -h + c], [r, h - c], [r - c, h], [0, h]].map(([x, y]) => new THREE.Vector2(x, y))
    return new THREE.LatheGeometry(pts, 48)
  })
}

/* ------------------------------------------------------------ porta-cabos */

/**
 * Corrente porta-cabos: troço inferior reto, curva em U de raio `bend` e troço superior.
 * Elos com placas laterais e travessas, num único buffer (desenho leve).
 */
export function dragChainGeometry(length: number, width: number, linkH: number, bend: number, pitch = 18): THREE.BufferGeometry {
  return cachedGeometry(`chain:${length}:${width}:${linkH}:${bend}`, () => {
    const parts: THREE.BufferGeometry[] = []
    const path: Array<{ p: THREE.Vector3; ang: number }> = []
    const x0 = -length / 2 - (bend + linkH) / 2
    const lowY = -bend
    // Troço inferior (fixo) da esquerda para a direita.
    const nLow = Math.max(1, Math.round(length / pitch))
    for (let i = 0; i <= nLow; i += 1) path.push({ p: new THREE.Vector3(x0 + (i * length) / nLow, lowY, 0), ang: 0 })
    const cx = x0 + length
    const arcSteps = Math.max(4, Math.round((Math.PI * bend) / pitch))
    for (let i = 1; i < arcSteps; i += 1) {
      const t = -Math.PI / 2 + (i / arcSteps) * Math.PI
      path.push({ p: new THREE.Vector3(cx + Math.cos(t) * bend, Math.sin(t) * bend, 0), ang: t + Math.PI / 2 })
    }
    const nTop = Math.max(1, Math.round((length * 0.62) / pitch))
    for (let i = 0; i <= nTop; i += 1) path.push({ p: new THREE.Vector3(cx - (i * length * 0.62) / nTop, bend, 0), ang: Math.PI })
    const plate = new THREE.BoxGeometry(pitch * 0.94, linkH, 2.2)
    const bar = new THREE.BoxGeometry(3.2, 2.4, width - 2)
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1)
    for (const { p, ang } of path) {
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), ang)
      for (const side of [-1, 1]) {
        m.compose(p.clone().add(new THREE.Vector3(0, 0, side * (width / 2 - 1.1))), q, s)
        parts.push(plate.clone().applyMatrix4(m).toNonIndexed())
      }
      for (const yy of [-1, 1]) {
        const off = new THREE.Vector3(0, yy * (linkH / 2 - 1.2), 0).applyQuaternion(q)
        m.compose(p.clone().add(off), q, s)
        parts.push(bar.clone().applyMatrix4(m).toNonIndexed())
      }
    }
    const merged = mergeGeometries(parts) ?? plate
    merged.computeVertexNormals()
    return merged
  })
}

/* -------------------------------------------------------------- texturas */

const texCache = new Map<string, THREE.CanvasTexture | null>()
function canvasTexture(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture | null {
  if (texCache.has(key)) return texCache.get(key) ?? null
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) { texCache.set(key, null); return null }
  draw(ctx)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  texCache.set(key, tex)
  return tex
}

/** Mostrador de manómetro 0–10 bar (o ponteiro é uma malha animada à parte). */
export function gaugeDialTexture(): THREE.CanvasTexture | null {
  return canvasTexture('gauge-dial', 256, 256, (ctx) => {
    ctx.fillStyle = '#f8fafc'; ctx.beginPath(); ctx.arc(128, 128, 126, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 3
    for (let i = 0; i <= 50; i += 1) {
      const a = Math.PI * 0.75 + (i / 50) * Math.PI * 1.5
      const major = i % 5 === 0
      const r0 = major ? 92 : 102
      ctx.lineWidth = major ? 3.2 : 1.4
      ctx.beginPath(); ctx.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0); ctx.lineTo(128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112); ctx.stroke()
      if (major) {
        ctx.fillStyle = '#0f172a'; ctx.font = 'bold 20px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(String(i / 5), 128 + Math.cos(a) * 74, 128 + Math.sin(a) * 74)
      }
    }
    ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 6
    ctx.beginPath(); ctx.arc(128, 128, 116, Math.PI * 0.75 + Math.PI * 1.5 * 0.8, Math.PI * 2.25); ctx.stroke()
    ctx.fillStyle = '#334155'; ctx.font = 'bold 22px Arial'; ctx.textAlign = 'center'; ctx.fillText('bar', 128, 176)
  })
}

/** Etiqueta impressa genérica (fundo + texto) para placas de identificação. */
export function labelTexture(text: string, bg = '#e2e8f0', fg = '#0f172a'): THREE.CanvasTexture | null {
  return canvasTexture(`label:${text}:${bg}:${fg}`, 256, 64, (ctx) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 256, 64)
    ctx.fillStyle = fg; ctx.font = 'bold 30px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(text, 128, 34)
  })
}
