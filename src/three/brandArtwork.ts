import artwork from '../data/brand-vector-paths.json'

/** Exact path artwork from public/brands, synchronously usable by CAD decals.
 * No font approximation, fetch, bitmap race or dependency on an installed font.
 * SHA-256/source links are retained in the generated data and brands/sources.json.
 */
export function drawBrandArtwork(ctx: CanvasRenderingContext2D, brand: keyof typeof artwork, x: number, y: number, width: number, height: number, color?: string): void {
  if (typeof Path2D === 'undefined') return
  const data = artwork[brand], [vx, vy, vw, vh] = data.viewBox
  const scale = Math.min(width / vw, height / vh)
  ctx.save()
  ctx.translate(x + (width - vw * scale) / 2, y + (height - vh * scale) / 2)
  ctx.scale(scale, scale)
  ctx.translate(-vx, -vy)
  for (const path of data.paths) {
    ctx.save()
    const [a, b, c, d, e, f] = path.matrix
    ctx.transform(a, b, c, d, e, f)
    for (const clip of path.clip) ctx.clip(new Path2D(clip), 'evenodd')
    ctx.fillStyle = color ?? path.fill
    ctx.fill(new Path2D(path.d), path.rule === 'evenodd' ? 'evenodd' : 'nonzero')
    ctx.restore()
  }
  ctx.restore()
}
