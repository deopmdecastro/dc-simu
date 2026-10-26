/**
 * Brilho de sinalizadores e LEDs: parâmetros puros (testados em `npm run test:glow`) e a textura do halo.
 * O halo é um sprite aditivo virado para a câmara: dá o brilho que a emissão do material sozinha não consegue
 * (o ecrã não tem «bloom»), sem dependências extra nem luzes dinâmicas adicionais.
 */

export type GlowKind = 'led' | 'lamp' | 'tower'

export interface GlowSpec {
  /** Escala base do halo, em múltiplos do raio da lente. */
  scale: number
  /** Opacidade máxima do halo (0–1). */
  opacity: number
  /** Intensidade emissiva da própria lente quando acesa. */
  emissive: number
  /** Intensidade da luz projetada (0 = sem luz). */
  light: number
}

export const GLOW_SPECS: Record<GlowKind, GlowSpec> = {
  led: { scale: 5.2, opacity: 0.85, emissive: 2.4, light: 0 },
  lamp: { scale: 4.4, opacity: 0.9, emissive: 2.2, light: 0.9 },
  tower: { scale: 3.6, opacity: 0.85, emissive: 2, light: 0.6 },
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))

/** Pisca ~3 Hz: aceso a 100 %, «apagado» a 8 % para não desaparecer de vez (como o filamento/LED a arrefecer). */
export function blinkFactor(timeSeconds: number, blink: boolean): number {
  if (!blink) return 1
  return Math.sin(timeSeconds * 6) > 0 ? 1 : 0.08
}

/**
 * Nível de brilho 0–1 com atraso de subida e descida: uma lâmpada não liga nem desliga instantaneamente.
 * `rise`/`fall` em segundos até ~95 %. LEDs são rápidos; lâmpadas incandescentes mais lentas.
 */
export function stepGlow(level: number, on: boolean, dt: number, rise = 0.05, fall = 0.18): number {
  const target = on ? 1 : 0
  const time = target > level ? rise : fall
  const k = 1 - Math.exp(-clamp(dt, 0, 0.25) * (3 / Math.max(0.01, time)))
  const next = level + (target - level) * k
  return Math.abs(target - next) < 0.003 ? target : next
}

export interface GlowFrame { haloOpacity: number; haloScale: number; emissive: number; light: number }

/** Valores a aplicar num dado instante (nível já suavizado + pisca + leve cintilação de lâmpada). */
export function glowFrame(spec: GlowSpec, level: number, timeSeconds: number, blink: boolean, flicker = 0.03): GlowFrame {
  const lit = clamp(level, 0, 1) * blinkFactor(timeSeconds, blink)
  const shimmer = lit > 0 ? 1 + Math.sin(timeSeconds * 37) * flicker * lit : 1
  return {
    haloOpacity: spec.opacity * lit * shimmer,
    haloScale: spec.scale * (0.82 + 0.18 * lit) * shimmer,
    emissive: spec.emissive * lit,
    light: spec.light * lit,
  }
}

let cached: unknown = null
/** Textura radial (centro quente → bordo transparente), partilhada por todos os halos. */
export function glowTexture(THREE: typeof import('three')): import('three').Texture | null {
  if (cached) return cached as import('three').Texture
  if (typeof document === 'undefined') return null
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size; canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.18, 'rgba(255,255,255,0.75)')
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.22)')
  gradient.addColorStop(0.75, 'rgba(255,255,255,0.05)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  cached = texture
  return texture
}
