import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Geometria CAD paramétrica da maquete de estampagem ATEC / Guião 1185 (todas as cotas em mm, centradas na origem).
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

/** Braço trapezoidal aligeirado com 2 rasgos oblongos (fiel às fotos da maquete ATEC). */
export function taperedArmGeometry(
  length: number,
  backWidth: number,
  tipWidth: number,
  thickness: number,
  slots: Array<{ x: number; w: number; h: number }>,
): THREE.BufferGeometry {
  return cachedGeometry(`tapered-arm:${length}:${backWidth}:${tipWidth}:${thickness}`, () => {
    const hw0 = backWidth / 2
    const hw1 = tipWidth / 2
    const rTip = hw1
    const shape = new THREE.Shape()
    shape.moveTo(-length / 2, -hw0)
    shape.lineTo(length / 2 - rTip, -hw1)
    shape.absarc(length / 2 - rTip, 0, rTip, -Math.PI / 2, Math.PI / 2, false)
    shape.lineTo(-length / 2, hw0)
    shape.closePath()
    for (const s of slots) {
      const r = Math.min(s.w, s.h) / 2
      const p = new THREE.Path()
      p.absarc(s.x - s.w / 2 + r, 0, r, Math.PI / 2, Math.PI * 1.5, false)
      p.absarc(s.x + s.w / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2, false)
      p.closePath()
      shape.holes.push(p)
    }
    const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelThickness: 0.4, bevelSize: 0.4, bevelSegments: 1, curveSegments: 16 })
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
    top.rotateX(-Math.PI / 2); top.translate(0, ly / 2 - recessDepth, 0)
    body.rotateX(-Math.PI / 2); body.translate(0, -ly / 2, 0)
    const merged = mergeGeometries([top.toNonIndexed(), body.toNonIndexed()]) ?? body
    merged.computeVertexNormals()
    return merged
  })
}

/** Bloco maquinado da gaveta com cavidade quadrada fresada e cantos arredondados (fiel à foto de FC 2). */
export function squarePocketBlockGeometry(lx: number, ly: number, lz: number, pocketSize: number, pocketDepth: number): THREE.BufferGeometry {
  return cachedGeometry(`sqpocket:${lx}:${ly}:${lz}:${pocketSize}:${pocketDepth}`, () => {
    const ch = 1.4
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
    const hp = pocketSize / 2
    const cr = 4
    const hole = new THREE.Path()
    hole.moveTo(-hp + cr, -hp)
    hole.lineTo(hp - cr, -hp)
    hole.absarc(hp - cr, -hp + cr, cr, -Math.PI / 2, 0, false)
    hole.lineTo(hp, hp - cr)
    hole.absarc(hp - cr, hp - cr, cr, 0, Math.PI / 2, false)
    hole.lineTo(-hp + cr, hp)
    hole.absarc(-hp + cr, hp - cr, cr, Math.PI / 2, Math.PI, false)
    hole.lineTo(-hp, -hp + cr)
    hole.absarc(-hp + cr, -hp + cr, cr, Math.PI, Math.PI * 1.5, false)
    hole.closePath()
    ring.holes.push(hole)

    const top = new THREE.ExtrudeGeometry(ring, { depth: pocketDepth, bevelEnabled: false, curveSegments: 16 })
    const body = new THREE.ExtrudeGeometry(outline, { depth: ly - pocketDepth, bevelEnabled: false })
    top.rotateX(-Math.PI / 2); top.translate(0, ly / 2 - pocketDepth, 0)
    body.rotateX(-Math.PI / 2); body.translate(0, -ly / 2, 0)
    const merged = mergeGeometries([top.toNonIndexed(), body.toNonIndexed()]) ?? body
    merged.computeVertexNormals()
    return merged
  })
}

/** Calha em U de chapa de inox dobrada (abas para cima), extrudida ao longo de X, centrada. */
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

/** Calha técnica ranhurada com dentes laterais em PVC (eixo X, centrada em X, Y, Z). */
export function slottedDuctGeometry(length: number, width: number, height: number, coverOn: boolean): THREE.BufferGeometry {
  return cachedGeometry(`bench-duct:${length}:${width}:${height}:${coverOn ? 1 : 0}`, () => {
    const parts: THREE.BufferGeometry[] = []
    const wall = 2
    const base = new THREE.BoxGeometry(length, wall, width)
    base.translate(0, -height / 2 + wall / 2, 0)
    parts.push(base.toNonIndexed())

    const stripH = 8
    const fingerH = Math.max(8, height - wall - stripH - (coverOn ? 2.5 : 0))
    const pitch = 12.5
    const fingerW = 7.5
    const count = Math.max(2, Math.floor((length - 8) / pitch))
    const startX = -((count - 1) * pitch) / 2

    for (const sz of [-1, 1]) {
      const z = sz * (width / 2 - wall / 2)
      const lower = new THREE.BoxGeometry(length, stripH, wall)
      lower.translate(0, -height / 2 + wall + stripH / 2, z)
      parts.push(lower.toNonIndexed())
      for (let i = 0; i < count; i += 1) {
        const fx = startX + i * pitch
        const finger = new THREE.BoxGeometry(fingerW, fingerH, wall)
        finger.translate(fx, -height / 2 + wall + stripH + fingerH / 2, z)
        parts.push(finger.toNonIndexed())
      }
    }
    if (coverOn) {
      const lid = new THREE.BoxGeometry(length, 2.6, width + 1.6)
      lid.translate(0, height / 2 - 1.3, 0)
      parts.push(lid.toNonIndexed())
      for (const sz of [-1, 1]) {
        const lip = new THREE.BoxGeometry(length, 5, 1.6)
        lip.translate(0, height / 2 - 3.6, sz * (width / 2 + 0.6))
        parts.push(lip.toNonIndexed())
      }
    }
    const merged = mergeGeometries(parts) ?? base
    merged.computeVertexNormals()
    return merged
  })
}

/* --------------------------------------------------------------- rotativos */

/** Roda/pinhão cónico de dentes retos (eixo Y, base em y = 0, vértice para +Y). */
export function bevelGearGeometry(radius: number, face: number, teeth: number): THREE.BufferGeometry {
  return cachedGeometry(`bevel:${radius}:${face}:${teeth}`, () => {
    const parts: THREE.BufferGeometry[] = []
    const cone = new THREE.CylinderGeometry(radius * 0.52, radius * 0.96, face, Math.max(28, teeth), 1)
    cone.translate(0, face / 2, 0)
    parts.push(cone.toNonIndexed())
    const hub = new THREE.CylinderGeometry(radius * 0.34, radius * 0.34, face * 1.55, 22)
    hub.translate(0, face * 0.77, 0)
    parts.push(hub.toNonIndexed())
    const tilt = Math.atan2(radius * 0.44, face)
    const toothH = Math.hypot(face, radius * 0.44)
    for (let i = 0; i < teeth; i += 1) {
      const ang = (i / teeth) * Math.PI * 2
      const tooth = new THREE.BoxGeometry((Math.PI * 2 * radius * 0.74) / teeth * 0.56, toothH * 0.98, radius * 0.16)
      tooth.rotateX(-tilt)
      tooth.translate(0, face / 2, radius * 0.74)
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

/** Tarugo Ø×h com chanfros de 0,8 mm e furo central de maquinagem no topo (revolução, centrado). */
export function workpieceGeometry(diameter: number, height: number): THREE.BufferGeometry {
  return cachedGeometry(`billet:${diameter}:${height}`, () => {
    const r = diameter / 2, h = height / 2, c = 0.8
    const pts = [[0, -h], [r - c, -h], [r, -h + c], [r, h - c], [r - c, h], [2.2, h], [1.2, h - 1.2], [0, h - 1.2]].map(([x, y]) => new THREE.Vector2(x, y))
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
function canvasTexture(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture | null {
  if (texCache.has(key)) return texCache.get(key) ?? null
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) { texCache.set(key, null); return null }
  draw(ctx, w, h)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  texCache.set(key, tex)
  return tex
}

/** Mostrador de manómetro 0–10 bar WIKA/Festo (caixa preta na coluna esquerda da prensa). */
export function gaugeDialTexture(): THREE.CanvasTexture | null {
  return canvasTexture('gauge-dial-v2', 256, 256, (ctx) => {
    ctx.fillStyle = '#f8fafc'; ctx.beginPath(); ctx.arc(128, 128, 126, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 3; ctx.stroke()
    ctx.strokeStyle = '#0f172a'
    for (let i = 0; i <= 50; i += 1) {
      const a = Math.PI * 0.75 + (i / 50) * Math.PI * 1.5
      const major = i % 5 === 0
      const r0 = major ? 90 : 101
      ctx.lineWidth = major ? 3.2 : 1.4
      ctx.beginPath(); ctx.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0); ctx.lineTo(128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112); ctx.stroke()
      if (major) {
        ctx.fillStyle = '#0f172a'; ctx.font = 'bold 19px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(String(i / 5), 128 + Math.cos(a) * 72, 128 + Math.sin(a) * 72)
      }
    }
    ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 5
    ctx.beginPath(); ctx.arc(128, 128, 115, Math.PI * 0.75 + Math.PI * 1.5 * 0.6, Math.PI * 2.25); ctx.stroke()
    ctx.fillStyle = '#0284c7'; ctx.font = 'bold 15px Arial'; ctx.textAlign = 'center'; ctx.fillText('psi', 128, 96)
    ctx.fillStyle = '#0f172a'; ctx.font = 'bold 21px Arial'; ctx.fillText('bar', 128, 178)
  })
}

/** Etiqueta impressa tipo fita Brother P-Touch branca/preta fiel às etiquetas da maquete ATEC. */
export function labelTexture(text: string, bg = '#f8fafc', fg = '#0f172a'): THREE.CanvasTexture | null {
  return canvasTexture(`label:${text}:${bg}:${fg}`, 320, 80, (ctx, w, h) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(15,23,42,0.18)'; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, w - 3, h - 3)
    ctx.fillStyle = fg
    const fontPx = text.length > 12 ? 30 : text.length > 8 ? 36 : 42
    ctx.font = `bold ${fontPx}px Arial, sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(text, w / 2, h / 2 + 2)
  })
}

/** Rótulo cilíndrico azul/prata do encoder RT3806-AB-400N fotografado na maquete (20261104_220100.jpg). */
export function rotaryEncoderWrapTexture(): THREE.CanvasTexture | null {
  return canvasTexture('encoder-rt3806-wrap', 512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#e2e8f0'
    ctx.fillRect(0, 0, w, h)
    // Faixa azul superior «ROTARYENCODER»
    ctx.fillStyle = '#0369a1'
    ctx.fillRect(0, 0, w, 64)
    ctx.fillStyle = '#f8fafc'
    ctx.font = '900 36px Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('ROTARYENCODER', w / 2, 34)

    ctx.fillStyle = '#0f172a'
    ctx.textAlign = 'left'
    ctx.font = 'bold 25px Arial, sans-serif'
    ctx.fillText('Model: RT3806-AB-400N', 24, 102)
    ctx.fillText('DC: 5V-24V', 24, 140)
    ctx.font = 'bold 21px monospace'
    ctx.fillText('NO: 2025021101', 24, 174)
    ctx.strokeStyle = '#64748b'
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(20, 194); ctx.lineTo(w - 20, 194); ctx.stroke()
    ctx.font = 'bold 18px Arial, sans-serif'
    ctx.fillStyle = '#1e293b'
    ctx.fillText('RD:+5-24V  BK:0V  GN:A  WH:B', 24, 224)
  })
}

/** Rótulo cilíndrico azul/branco do motor DC Portescap M1 fotografado na maquete. */
export function portescapMotorLabelTexture(): THREE.CanvasTexture | null {
  return canvasTexture('portescap-m1-wrap', 512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#0284c7'
    ctx.lineWidth = 8
    ctx.strokeRect(8, 8, w - 16, h - 16)
    ctx.fillStyle = '#0284c7'
    ctx.font = '900 38px Arial, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('Portescap', 28, 62)
    ctx.fillStyle = '#1e293b'
    ctx.font = 'bold 22px Arial, sans-serif'
    ctx.fillText('ESCAP 28L28 · 24 V DC', 28, 104)
    ctx.fillText('Gearhead R32 · 19.5:1', 28, 138)
    ctx.font = 'bold 20px monospace'
    ctx.fillText('24.08.01  SWISS MADE', 28, 178)
    // Etiqueta vermelha [1] e preta [2] dos terminais
    ctx.fillStyle = '#dc2626'
    ctx.fillRect(w - 92, 26, 62, 42)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 28px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('1', w - 61, 56)
    ctx.fillStyle = '#1e293b'
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 3
    ctx.strokeRect(w - 92, 180, 62, 42)
    ctx.fillText('2', w - 61, 210)
  })
}

/** Ecrã LCD da consola Siemens SIMATIC HMI KTP700 Basic (apagado quando sem alimentação, conforme LCD-FIDELIDADE). */
export function ktp700ScreenTexture(powered: boolean, page: string, selectedRow: number): THREE.CanvasTexture | null {
  const row = Math.max(0, Math.min(2, Math.round(selectedRow)))
  return canvasTexture(`ktp700:${powered ? 1 : 0}:${page}:${row}`, 640, 400, (ctx, w, h) => {
    if (!powered) {
      ctx.fillStyle = '#070a0e'
      ctx.fillRect(0, 0, w, h)
      return
    }
    if (page === 'process') {
      // Página sinóptica didática da Estampagem ATEC 1185
      ctx.fillStyle = '#dce6f2'
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#1e3a5f'
      ctx.fillRect(0, 0, w, 46)
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 21px Arial, sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText('ATEC · Estação de Estampagem 1185', 18, 30)
      ctx.textAlign = 'right'
      ctx.font = 'bold 16px monospace'
      ctx.fillText('RUN · PN/IE', w - 18, 29)

      const cards = [
        { t: 'CIL 1 · Alimentador', s: 'B8 / B9 · Y6 / Y7', x: 24, y: 68 },
        { t: 'CIL 2 · Ventosa Z', s: 'B6 / B7 · Y4 / Y5', x: 330, y: 68 },
        { t: 'CIL 3 · Gaveta FC 2', s: 'B2 / B1 · Y1 / Y2', x: 24, y: 174 },
        { t: 'CIL 4 · Prensa', s: 'B3 / B4 · Y3 (5/6/8s)', x: 330, y: 174 },
      ]
      for (const c of cards) {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(c.x, c.y, 286, 88)
        ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2; ctx.strokeRect(c.x, c.y, 286, 88)
        ctx.fillStyle = '#0f172a'; ctx.font = 'bold 18px Arial'; ctx.textAlign = 'left'
        ctx.fillText(c.t, c.x + 14, c.y + 34)
        ctx.fillStyle = '#475569'; ctx.font = '15px monospace'
        ctx.fillText(c.s, c.x + 14, c.y + 64)
      }
      // Barra de teclas F1..F8
      ctx.fillStyle = '#cbd5e1'
      ctx.fillRect(0, h - 46, w, 46)
      for (let i = 0; i < 8; i += 1) {
        ctx.strokeStyle = '#64748b'; ctx.strokeRect(i * 80 + 2, h - 44, 76, 42)
        ctx.fillStyle = '#1e293b'; ctx.font = 'bold 13px Arial'; ctx.textAlign = 'center'
        ctx.fillText(['START', 'STOP', 'RESET', 'MAN', 'AUTO', 'CIL+', 'VAC', 'HOME'][i], i * 80 + 40, h - 18)
      }
      return
    }

    // Ecrã «Start Center» autêntico fotografado na consola Siemens SIMATIC HMI (20261104_220115.jpg)
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, '#d8e4f0')
    grad.addColorStop(1, '#c3d4e6')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)

    const bx = 190, by = 82, bw = 260, bh = 236
    ctx.fillStyle = '#5b7fa6'
    ctx.fillRect(bx, by, bw, bh)
    ctx.strokeStyle = '#3b5bdb'
    ctx.lineWidth = 2
    ctx.strokeRect(bx, by, bw, bh)

    ctx.fillStyle = '#f8fafc'
    ctx.font = 'bold 19px Arial, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('Start Center', bx + 16, by + 30)

    const items = ['Transfer', 'Start', 'Settings']
    items.forEach((label, idx) => {
      const ry = by + 50 + idx * 56
      ctx.fillStyle = idx === row ? '#f8fafc' : '#e2e8f0'
      ctx.fillRect(bx + 16, ry, bw - 32, 42)
      ctx.strokeStyle = idx === row ? '#1d4ed8' : '#64748b'
      ctx.lineWidth = idx === row ? 2.5 : 1.5
      ctx.strokeRect(bx + 16, ry, bw - 32, 42)
      ctx.fillStyle = '#1e293b'
      ctx.font = 'bold 17px Arial, sans-serif'
      ctx.textAlign = 'left'
      const icon = idx === 0 ? '⇄' : idx === 1 ? '▶' : '⚙'
      ctx.fillText(`${icon}   ${label}`, bx + 32, ry + 27)
      if (idx !== 1) {
        ctx.textAlign = 'right'
        ctx.fillText('▸', bx + bw - 28, ry + 27)
      }
    })
  })
}

/** Moldura frontal cinzento-ardósia da consola Siemens SIMATIC HMI KTP700 Basic. */
export function ktp700BezelTexture(): THREE.CanvasTexture | null {
  return canvasTexture('ktp700-bezel', 640, 480, (ctx, w, h) => {
    ctx.fillStyle = '#43505c'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#2c3640'
    ctx.lineWidth = 6
    ctx.strokeRect(3, 3, w - 6, h - 6)
    // Logótipo SIEMENS verde-petróleo à esquerda e SIMATIC HMI prateado à direita
    ctx.fillStyle = '#009999'
    ctx.font = '900 24px Arial, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('SIEMENS', 34, 42)
    ctx.fillStyle = '#cbd5e1'
    ctx.font = '300 23px Arial, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText('SIMATIC HMI', w - 34, 42)
  })
}

/** Etiqueta traseira branca Siemens KTP700 Basic (6AV2 123-2GB03-0AX0 · CE / EAC / UKCA). */
export function ktp700BackLabelTexture(): THREE.CanvasTexture | null {
  return canvasTexture('ktp700-back-label', 512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 3; ctx.strokeRect(2, 2, w - 4, h - 4)
    ctx.fillStyle = '#0f172a'
    ctx.font = '900 28px Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('SIEMENS', w / 2, 34)
    ctx.textAlign = 'left'
    ctx.font = 'bold 20px Arial, sans-serif'
    ctx.fillText('SIMATIC HMI · KTP700 Basic', 22, 74)
    ctx.font = 'bold 18px monospace'
    ctx.fillText('6AV2 123-2GB03-0AX0', 22, 104)
    ctx.fillText('DC 24V · 230 mA · NEC Class 2', 22, 132)
    // Matriz QR simulada à esquerda
    ctx.fillStyle = '#0f172a'
    for (let r = 0; r < 7; r += 1) {
      for (let c = 0; c < 7; c += 1) {
        if ((r + c) % 2 === 0 || r === 0 || r === 6 || c === 0 || c === 6) {
          ctx.fillRect(22 + c * 8, 154 + r * 8, 6, 6)
        }
      }
    }
    ctx.font = 'bold 30px Arial, sans-serif'
    ctx.fillText('CE   UKCA   EAC', 110, 198)
  })
}

/** Folha frontal da bancada ATEC: «PROJETO DESENVOLVIDO PELA TURMA ARMI 01.26-A M». */
export function atecProjectSheetTexture(): THREE.CanvasTexture | null {
  return canvasTexture('atec-sheet-armi', 512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#0369a1'
    ctx.font = '900 28px Arial, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText('atec', w - 34, 42)
    ctx.fillStyle = '#0f172a'
    ctx.textAlign = 'center'
    ctx.font = 'bold 20px Arial, sans-serif'
    ctx.fillText('PROJETO DESENVOLVIDO PELA', w / 2, 96)
    ctx.fillText('TURMA ARMI 01.26-A M', w / 2, 124)
    ctx.fillStyle = '#475569'
    ctx.font = 'bold 15px Arial, sans-serif'
    ctx.fillText('ESTAÇÃO DE ESTAMPAGEM E TRIAGEM', w / 2, 168)
    // Triângulo de aviso amarelo
    ctx.fillStyle = '#facc15'
    ctx.beginPath(); ctx.moveTo(w / 2, 188); ctx.lineTo(w / 2 - 26, 234); ctx.lineTo(w / 2 + 26, 234); ctx.closePath(); ctx.fill()
    ctx.strokeStyle = '#b45309'; ctx.lineWidth = 3; ctx.stroke()
    ctx.fillStyle = '#0f172a'; ctx.font = 'bold 24px Arial'; ctx.fillText('!', w / 2, 226)
  })
}
