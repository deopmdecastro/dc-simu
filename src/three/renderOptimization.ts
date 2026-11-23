import * as THREE from 'three'
import type { WireKind } from '../types'

/**
 * Infraestrutura partilhada de otimização 3D para o DC-Simu:
 * - Perfil de qualidade adaptativo (dispositivos modestos e montagens grandes com >80 peças/cabos)
 * - Cache LRU com libertação explícita de buffers GPU (evita fugas de memória em edições longas)
 * - Pool de materiais partilhados para cabos/tubos (de ~200 instâncias para ~10–15 programas/materiais)
 * - Geometrias unitárias reutilizáveis e cache de texturas PBR procedurais (sem redesenhar canvas por peça)
 */

export type DevicePerformanceTier = 'high' | 'medium' | 'low'

export interface SceneQualityProfile {
  tier: DevicePerformanceTier
  dpr: [number, number]
  shadowMapSize: 1024 | 2048
  wireRadialSegments: 8 | 10 | 14
  wireTubularScale: number
  thinWireCastShadow: boolean
  steadyRunFps: number
}

let cachedDeviceTier: DevicePerformanceTier | null = null

/** Classifica o dispositivo uma única vez (núcleos, RAM e ecrã móvel) sem tocar no DOM a cada render. */
export function detectDevicePerformanceTier(softwareGl = false): DevicePerformanceTier {
  if (softwareGl) return 'low'
  if (cachedDeviceTier) return cachedDeviceTier
  if (typeof navigator === 'undefined') return 'high'
  const cores = typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : 8
  const memGb = typeof (navigator as Navigator & { deviceMemory?: number }).deviceMemory === 'number'
    ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory!
    : 8
  const coarseSmall = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 767px) and (pointer: coarse)').matches

  if (cores <= 2 || memGb <= 2) cachedDeviceTier = 'low'
  else if (cores <= 4 || memGb <= 4 || coarseSmall) cachedDeviceTier = 'medium'
  else cachedDeviceTier = 'high'
  return cachedDeviceTier
}

/**
 * Calcula parâmetros de renderização equilibrados entre fidelidade visual e fluidez:
 * - Projetos pequenos em PC mantêm 2048×2048, DPR até 1.5 e 14 segmentos radiais nos cabos;
 * - Montagens grandes (ex.: maquete completa com 168 peças e ~200 cabos) ou máquinas modestas
 *   reduzem resolução de sombras (4× menos píxeis), segmentos radiais e sombras em fios finos.
 */
export function resolveSceneQuality(input: {
  componentCount: number
  wireCount: number
  softwareGl: boolean
  deviceTier?: DevicePerformanceTier
}): SceneQualityProfile {
  const tier = input.deviceTier ?? detectDevicePerformanceTier(input.softwareGl)
  // Limiares mais baixos: a Maquete Estampagem (~100+ cabos) deve entrar já em perfil «pesado».
  const heavyScene = input.componentCount >= 60 || input.wireCount >= 60
  const veryHeavyScene = input.componentCount >= 100 || input.wireCount >= 100

  if (input.softwareGl || (tier === 'low' && veryHeavyScene)) {
    return {
      tier: 'low',
      dpr: [0.5, 1],
      shadowMapSize: 1024,
      wireRadialSegments: 8,
      wireTubularScale: 0.72,
      thinWireCastShadow: false,
      steadyRunFps: 12,
    }
  }

  if (tier === 'low') {
    return {
      tier,
      dpr: [1, 1],
      shadowMapSize: 1024,
      wireRadialSegments: 8,
      wireTubularScale: 0.75,
      thinWireCastShadow: false,
      steadyRunFps: 18,
    }
  }

  if (tier === 'medium' || veryHeavyScene) {
    return {
      tier: tier === 'high' && veryHeavyScene ? 'medium' : tier,
      dpr: [1, heavyScene ? 1.1 : 1.25],
      shadowMapSize: 1024,
      wireRadialSegments: veryHeavyScene ? 8 : 10,
      wireTubularScale: veryHeavyScene ? 0.8 : 0.88,
      thinWireCastShadow: false,
      steadyRunFps: heavyScene ? 22 : 28,
    }
  }

  // Dispositivo 'high'
  return {
    tier,
    dpr: [1, heavyScene ? 1.25 : 1.5],
    shadowMapSize: heavyScene ? 1024 : 2048,
    wireRadialSegments: heavyScene ? 10 : 14,
    wireTubularScale: heavyScene ? 0.88 : 1,
    thinWireCastShadow: input.wireCount <= 50,
    steadyRunFps: 30,
  }
}

/** Cache LRU limitada que chama `onEvict` ao despejar entradas antigas (libertação determinística de GPU). */
export class DisposableLruCache<V> {
  private readonly map = new Map<string, V>()
  constructor(
    private readonly maxEntries: number,
    private readonly onEvict: (value: V) => void,
  ) {}

  get(key: string): V | undefined {
    const hit = this.map.get(key)
    if (hit === undefined) return undefined
    // Promove para mais recente
    this.map.delete(key)
    this.map.set(key, hit)
    return hit
  }

  set(key: string, value: V): void {
    const existing = this.map.get(key)
    if (existing !== undefined) {
      if (existing !== value) this.onEvict(existing)
      this.map.delete(key)
    }
    this.map.set(key, value)
    while (this.map.size > this.maxEntries) {
      const oldestKey = this.map.keys().next().value
      if (oldestKey === undefined) break
      const oldest = this.map.get(oldestKey)!
      this.map.delete(oldestKey)
      this.onEvict(oldest)
    }
  }

  clear(): void {
    for (const v of this.map.values()) this.onEvict(v)
    this.map.clear()
  }

  get size(): number {
    return this.map.size
  }
}

// ---------------------------------------------------------------------------
// Pool de materiais partilhados para cabos e tubos 3D
// ---------------------------------------------------------------------------

/** Material invisível único para volumes de picking dos cabos (colorWrite=false evita overdraw no fragment shader). */
export const SHARED_WIRE_HIT_MATERIAL = new THREE.MeshBasicMaterial({
  transparent: true,
  opacity: 0,
  depthWrite: false,
  colorWrite: false,
})

/** Material partilhado do halo azul de cabo selecionado. */
export const SHARED_WIRE_SELECT_MATERIAL = new THREE.MeshBasicMaterial({
  color: '#60a5fa',
  transparent: true,
  opacity: 0.34,
  depthWrite: false,
})

const wireMaterialPool = new Map<string, THREE.MeshPhysicalMaterial>()
const sheathMaterialPool = new Map<string, THREE.MeshPhysicalMaterial>()

export interface WireMaterialKeyOpts {
  color: string
  kind?: WireKind
  flowing: boolean
  burnt: boolean
  heatLevel: number
}

/**
 * Reutiliza `MeshPhysicalMaterial` por combinação visual (cor + meio + estado energético/térmico).
 * Numa maquete com ~200 cabos, em vez de 200 shaders físicos independentes, partilha ~10–15 instâncias.
 */
export function getSharedWireMaterial(opts: WireMaterialKeyOpts): THREE.MeshPhysicalMaterial {
  const heatBucket = opts.heatLevel > 0.05 ? Math.min(20, Math.round(opts.heatLevel * 20)) : 0
  const kind = opts.kind ?? 'control'
  const key = `${opts.color}|${kind}|${opts.flowing ? 1 : 0}|${opts.burnt ? 1 : 0}|${heatBucket}`
  const hit = wireMaterialPool.get(key)
  if (hit) return hit

  const isHot = heatBucket > 0
  const displayColor = opts.burnt ? '#18181b' : opts.color
  const emissiveColor = isHot
    ? '#ff3b00'
    : kind === 'hydraulic' && opts.flowing
      ? '#0284c7'
      : kind === 'pneumatic' && opts.flowing
        ? '#bae6fd'
        : opts.flowing
          ? opts.color
          : '#000000'
  const emissiveIntensity = isHot
    ? Math.min(2.5, (heatBucket / 20) * 2.2)
    : kind === 'hydraulic' && opts.flowing
      ? 0.32
      : kind === 'pneumatic' && opts.flowing
        ? 0.18
        : opts.flowing
          ? 0.07
          : 0

  const mat = new THREE.MeshPhysicalMaterial({
    color: displayColor,
    roughness: kind === 'hydraulic' ? 0.30 : kind === 'pneumatic' ? 0.16 : opts.burnt ? 0.92 : 0.32,
    metalness: kind === 'hydraulic' ? 0.54 : kind === 'pneumatic' ? 0.08 : 0.03,
    clearcoat: kind === 'pneumatic' ? 0.9 : kind === 'hydraulic' ? 0.45 : opts.burnt ? 0.0 : 0.55,
    clearcoatRoughness: kind === 'pneumatic' ? 0.12 : 0.24,
    envMapIntensity: kind === 'hydraulic' ? 1.45 : 1.15,
    emissive: emissiveColor,
    emissiveIntensity,
  })
  if (wireMaterialPool.size > 160) {
    // Limite conservador para cenários longos de aquecimento térmico contínuo
    const first = wireMaterialPool.keys().next().value
    if (first !== undefined) {
      wireMaterialPool.get(first)?.dispose()
      wireMaterialPool.delete(first)
    }
  }
  wireMaterialPool.set(key, mat)
  return mat
}

/** Material partilhado para bainhas exteriores (cabos revestidos, capas de isolamento, espirais). */
export function getSharedSheathMaterial(
  color: string,
  variant: 'sheath' | 'isolation' | 'spiral',
): THREE.MeshPhysicalMaterial {
  const key = `${variant}|${color}`
  const hit = sheathMaterialPool.get(key)
  if (hit) return hit
  const mat = variant === 'sheath'
    ? new THREE.MeshPhysicalMaterial({ color, roughness: 0.6, metalness: 0.04, clearcoat: 0.18, clearcoatRoughness: 0.55, envMapIntensity: 0.75 })
    : variant === 'isolation'
      ? new THREE.MeshPhysicalMaterial({ color, roughness: 0.55, metalness: 0.02, clearcoat: 0.2, clearcoatRoughness: 0.5, envMapIntensity: 0.8 })
      : new THREE.MeshPhysicalMaterial({ color, roughness: 0.65, metalness: 0.05, clearcoat: 0.15, clearcoatRoughness: 0.6, envMapIntensity: 0.7 })
  if (sheathMaterialPool.size > 64) {
    const first = sheathMaterialPool.keys().next().value
    if (first !== undefined) {
      sheathMaterialPool.get(first)?.dispose()
      sheathMaterialPool.delete(first)
    }
  }
  sheathMaterialPool.set(key, mat)
  return mat
}

// ---------------------------------------------------------------------------
// Geometrias unitárias partilhadas (reduzem alocações GPU em estruturas/ferragens)
// ---------------------------------------------------------------------------

export const SHARED_UNIT_BOX_GEO = new THREE.BoxGeometry(1, 1, 1)
export const SHARED_UNIT_CYL_10_GEO = new THREE.CylinderGeometry(0.5, 0.5, 1, 10)
export const SHARED_HEX_BOLT_GEO = new THREE.CylinderGeometry(0.5, 0.5, 1, 6)

// ---------------------------------------------------------------------------
// Cache partilhada de canvases PBR (evita regenerar texturas procedurais por instância)
// ---------------------------------------------------------------------------

export interface PbrCanvasSources {
  map: HTMLCanvasElement
  bumpMap: HTMLCanvasElement
  roughnessMap: HTMLCanvasElement
}

export interface PbrTextureTriplet {
  map: THREE.CanvasTexture
  bumpMap: THREE.CanvasTexture
  roughnessMap: THREE.CanvasTexture
}

const pbrSourceCache = new Map<string, PbrCanvasSources>()
const pbrVariantCache = new Map<string, PbrTextureTriplet>()

/**
 * Gera os canvases PBR uma única vez por chave base (`key`) e devolve um trio de `CanvasTexture`
 * em cache para a repetição `(repX, repY)` arredondada. Múltiplas esteiras/paredes/pilares
 * partilham os mesmos canvases e texturas GPU sem trabalho repetido na thread principal.
 */
export function getSharedPbrTextures(
  baseKey: string,
  repX: number,
  repY: number,
  buildSources: () => PbrCanvasSources | null,
  anisotropy = 4,
): PbrTextureTriplet | null {
  if (typeof document === 'undefined') return null
  const rx = Math.max(0.5, Math.round(repX * 4) / 4)
  const ry = Math.max(0.5, Math.round(repY * 4) / 4)
  const variantKey = `${baseKey}|${rx.toFixed(2)}x${ry.toFixed(2)}`
  const cached = pbrVariantCache.get(variantKey)
  if (cached) return cached

  let sources = pbrSourceCache.get(baseKey)
  if (!sources) {
    const built = buildSources()
    if (!built) return null
    sources = built
    pbrSourceCache.set(baseKey, sources)
  }

  const wrap = (canvas: HTMLCanvasElement, isSrgb: boolean) => {
    const tex = new THREE.CanvasTexture(canvas)
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(rx, ry)
    tex.anisotropy = anisotropy
    if (isSrgb) tex.colorSpace = THREE.SRGBColorSpace
    tex.needsUpdate = true
    return tex
  }

  const triplet: PbrTextureTriplet = {
    map: wrap(sources.map, true),
    bumpMap: wrap(sources.bumpMap, false),
    roughnessMap: wrap(sources.roughnessMap, false),
  }
  if (pbrVariantCache.size > 48) {
    const oldestKey = pbrVariantCache.keys().next().value
    if (oldestKey !== undefined) {
      const old = pbrVariantCache.get(oldestKey)
      old?.map.dispose()
      old?.bumpMap.dispose()
      old?.roughnessMap.dispose()
      pbrVariantCache.delete(oldestKey)
    }
  }
  pbrVariantCache.set(variantKey, triplet)
  return triplet
}
