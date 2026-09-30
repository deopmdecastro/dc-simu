import * as THREE from 'three'

/** Texturas PBR geradas em canvas: sem ficheiros externos, funcionam offline (PWA)
 * e mantêm o bundle leve. Cada mapa é criado uma única vez e partilhado. */

type MapSet = { map: THREE.CanvasTexture; bump: THREE.CanvasTexture; rough: THREE.CanvasTexture }

const cache = new Map<string, MapSet>()

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function canvas(size: number) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  return c
}

function toTexture(c: HTMLCanvasElement, repeat: [number, number], color = false) {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat[0], repeat[1])
  t.anisotropy = 8
  if (color) t.colorSpace = THREE.SRGBColorSpace
  t.needsUpdate = true
  return t
}

function noiseLayer(ctx: CanvasRenderingContext2D, size: number, amount: number, seed: number, light = true) {
  const rand = rng(seed)
  const img = ctx.getImageData(0, 0, size, size)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * amount
    img.data[i] = Math.max(0, Math.min(255, img.data[i] + n))
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + n))
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + (light ? n : n * 0.9)))
  }
  ctx.putImageData(img, 0, 0)
}

/** Chapa de aço galvanizado com flor de zinco, riscos de escova e pontilhado de furação. */
export function galvanizedSteel(repeat: [number, number] = [2, 2]): MapSet {
  const key = `steel-${repeat.join('x')}`
  const hit = cache.get(key)
  if (hit) return hit
  const size = 512
  const base = canvas(size), bump = canvas(size), rough = canvas(size)
  const b = base.getContext('2d')!, u = bump.getContext('2d')!, r = rough.getContext('2d')!
  const rand = rng(41)

  b.fillStyle = '#c9cfd2'; b.fillRect(0, 0, size, size)
  u.fillStyle = '#808080'; u.fillRect(0, 0, size, size)
  r.fillStyle = '#7a7a7a'; r.fillRect(0, 0, size, size)

  // flor de zinco: cristais poligonais de tom ligeiramente diferente
  for (let i = 0; i < 90; i++) {
    const x = rand() * size, y = rand() * size, rad = 18 + rand() * 46
    const tone = 188 + Math.floor(rand() * 46)
    b.fillStyle = `rgba(${tone},${tone + 3},${tone + 5},0.32)`
    b.beginPath()
    const sides = 5 + Math.floor(rand() * 3)
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2 + rand() * 0.6
      const rr = rad * (0.7 + rand() * 0.4)
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr
      k === 0 ? b.moveTo(px, py) : b.lineTo(px, py)
    }
    b.closePath(); b.fill()
  }
  // riscos de escova horizontais
  for (let i = 0; i < 620; i++) {
    const y = rand() * size, len = 40 + rand() * 220, x = rand() * size
    const a = 0.05 + rand() * 0.12
    const c = rand() > 0.5 ? 255 : 90
    b.strokeStyle = `rgba(${c},${c},${c},${a})`; b.lineWidth = 0.6 + rand() * 0.8
    b.beginPath(); b.moveTo(x, y); b.lineTo(x + len, y + (rand() - 0.5) * 1.2); b.stroke()
    u.strokeStyle = `rgba(${rand() > 0.5 ? 200 : 60},128,128,${a * 1.4})`; u.lineWidth = 0.7
    u.beginPath(); u.moveTo(x, y); u.lineTo(x + len, y); u.stroke()
    r.strokeStyle = `rgba(${rand() > 0.5 ? 200 : 70},${rand() > 0.5 ? 200 : 70},90,${a})`; r.lineWidth = 1
    r.beginPath(); r.moveTo(x, y); r.lineTo(x + len, y); r.stroke()
  }
  noiseLayer(b, size, 14, 7)
  noiseLayer(u, size, 26, 9)

  // grelha de furação da contraplaca (perfurada a cada 64px)
  for (let gx = 32; gx < size; gx += 64) {
    for (let gy = 32; gy < size; gy += 64) {
      const g = b.createRadialGradient(gx, gy, 0, gx, gy, 6)
      g.addColorStop(0, 'rgba(40,46,52,0.55)'); g.addColorStop(0.7, 'rgba(40,46,52,0.35)'); g.addColorStop(1, 'rgba(40,46,52,0)')
      b.fillStyle = g; b.beginPath(); b.arc(gx, gy, 6, 0, Math.PI * 2); b.fill()
      u.fillStyle = 'rgba(20,20,20,0.9)'; u.beginPath(); u.arc(gx, gy, 4, 0, Math.PI * 2); u.fill()
    }
  }

  const set = { map: toTexture(base, repeat, true), bump: toTexture(bump, repeat), rough: toTexture(rough, repeat) }
  cache.set(key, set)
  return set
}

/** Aço inox/alumínio escovado para a calha DIN (riscos no sentido do comprimento). */
export function brushedMetal(repeat: [number, number] = [6, 1]): MapSet {
  const key = `brushed-${repeat.join('x')}`
  const hit = cache.get(key)
  if (hit) return hit
  const size = 256
  const base = canvas(size), bump = canvas(size), rough = canvas(size)
  const b = base.getContext('2d')!, u = bump.getContext('2d')!, r = rough.getContext('2d')!
  const rand = rng(77)
  b.fillStyle = '#b4bcc2'; b.fillRect(0, 0, size, size)
  u.fillStyle = '#808080'; u.fillRect(0, 0, size, size)
  r.fillStyle = '#6a6a6a'; r.fillRect(0, 0, size, size)
  for (let i = 0; i < 900; i++) {
    const y = rand() * size, x = rand() * size, len = 30 + rand() * 180
    const light = rand() > 0.5
    b.strokeStyle = light ? `rgba(255,255,255,${0.05 + rand() * 0.12})` : `rgba(70,80,90,${0.05 + rand() * 0.12})`
    b.lineWidth = 0.5 + rand()
    b.beginPath(); b.moveTo(x, y); b.lineTo(x + len, y); b.stroke()
    u.strokeStyle = light ? 'rgba(210,210,210,0.22)' : 'rgba(50,50,50,0.22)'; u.lineWidth = 0.8
    u.beginPath(); u.moveTo(x, y); u.lineTo(x + len, y); u.stroke()
  }
  noiseLayer(b, size, 10, 3)
  const set = { map: toTexture(base, repeat, true), bump: toTexture(bump, repeat), rough: toTexture(rough, repeat) }
  cache.set(key, set)
  return set
}

/** Pavimento de betão polido/epóxi com agregados, manchas e juntas de dilatação. */
export function polishedConcrete(repeat: [number, number] = [4, 4]): MapSet {
  const key = `concrete-${repeat.join('x')}`
  const hit = cache.get(key)
  if (hit) return hit
  const size = 512
  const base = canvas(size), bump = canvas(size), rough = canvas(size)
  const b = base.getContext('2d')!, u = bump.getContext('2d')!, r = rough.getContext('2d')!
  const rand = rng(1234)
  b.fillStyle = '#8f9295'; b.fillRect(0, 0, size, size)
  u.fillStyle = '#808080'; u.fillRect(0, 0, size, size)
  r.fillStyle = '#9a9a9a'; r.fillRect(0, 0, size, size)
  // manchas de nuvem (tons largos)
  for (let i = 0; i < 70; i++) {
    const x = rand() * size, y = rand() * size, rad = 40 + rand() * 120
    const g = b.createRadialGradient(x, y, 0, x, y, rad)
    const d = rand() > 0.5
    g.addColorStop(0, d ? 'rgba(60,64,68,0.16)' : 'rgba(210,214,216,0.16)'); g.addColorStop(1, 'rgba(0,0,0,0)')
    b.fillStyle = g; b.fillRect(x - rad, y - rad, rad * 2, rad * 2)
    const gr = r.createRadialGradient(x, y, 0, x, y, rad)
    gr.addColorStop(0, d ? 'rgba(200,200,200,0.25)' : 'rgba(60,60,60,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)')
    r.fillStyle = gr; r.fillRect(x - rad, y - rad, rad * 2, rad * 2)
  }
  // agregados e poros
  for (let i = 0; i < 2400; i++) {
    const x = rand() * size, y = rand() * size, rad = 0.4 + rand() * 1.8
    const tone = 110 + Math.floor(rand() * 90)
    b.fillStyle = `rgba(${tone},${tone},${tone + 2},${0.25 + rand() * 0.3})`
    b.beginPath(); b.arc(x, y, rad, 0, Math.PI * 2); b.fill()
    u.fillStyle = rand() > 0.55 ? 'rgba(25,25,25,0.7)' : 'rgba(225,225,225,0.45)'
    u.beginPath(); u.arc(x, y, rad, 0, Math.PI * 2); u.fill()
  }
  noiseLayer(b, size, 16, 5)
  noiseLayer(u, size, 30, 8)
  // junta de dilatação nas bordas (repete-se a cada tile)
  b.strokeStyle = 'rgba(40,44,48,0.55)'; b.lineWidth = 2
  b.strokeRect(1, 1, size - 2, size - 2)
  u.strokeStyle = 'rgba(10,10,10,0.9)'; u.lineWidth = 3
  u.strokeRect(1.5, 1.5, size - 3, size - 3)

  const set = { map: toTexture(base, repeat, true), bump: toTexture(bump, repeat), rough: toTexture(rough, repeat) }
  cache.set(key, set)
  return set
}

/** Parede técnica atrás do quadro: pintura fosca com granulado fino. */
export function matteWall(repeat: [number, number] = [3, 2]): MapSet {
  const key = `wall-${repeat.join('x')}`
  const hit = cache.get(key)
  if (hit) return hit
  const size = 256
  const base = canvas(size), bump = canvas(size), rough = canvas(size)
  const b = base.getContext('2d')!, u = bump.getContext('2d')!, r = rough.getContext('2d')!
  b.fillStyle = '#e4e8e6'; b.fillRect(0, 0, size, size)
  u.fillStyle = '#808080'; u.fillRect(0, 0, size, size)
  r.fillStyle = '#d8d8d8'; r.fillRect(0, 0, size, size)
  noiseLayer(b, size, 10, 21)
  noiseLayer(u, size, 40, 22)
  const set = { map: toTexture(base, repeat, true), bump: toTexture(bump, repeat), rough: toTexture(rough, repeat) }
  cache.set(key, set)
  return set
}

/** Tecido/borracha para cabos: trama fina repetida ao longo do comprimento. */
export function cableSheath(repeat: [number, number] = [40, 1]): MapSet {
  const key = `sheath-${repeat.join('x')}`
  const hit = cache.get(key)
  if (hit) return hit
  const size = 128
  const base = canvas(size), bump = canvas(size), rough = canvas(size)
  const b = base.getContext('2d')!, u = bump.getContext('2d')!, r = rough.getContext('2d')!
  b.fillStyle = '#ffffff'; b.fillRect(0, 0, size, size)
  u.fillStyle = '#808080'; u.fillRect(0, 0, size, size)
  r.fillStyle = '#b0b0b0'; r.fillRect(0, 0, size, size)
  for (let i = 0; i < size; i += 4) {
    u.fillStyle = 'rgba(235,235,235,0.55)'; u.fillRect(i, 0, 2, size)
    u.fillStyle = 'rgba(30,30,30,0.5)'; u.fillRect(i + 2, 0, 2, size)
    b.fillStyle = 'rgba(0,0,0,0.10)'; b.fillRect(i + 2, 0, 2, size)
  }
  const set = { map: toTexture(base, repeat, true), bump: toTexture(bump, repeat), rough: toTexture(rough, repeat) }
  cache.set(key, set)
  return set
}
