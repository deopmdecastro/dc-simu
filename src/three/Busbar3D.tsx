/**
 * Renderização 3D fotorrealista dos barramentos isolados com acrílico (Terra, Neutro e Fase)
 * e do barramento repartidor de fases em escada (4P/3P/2P) com tampa articulada.
 *
 * Combina texturas PBR reais digitalizadas da biblioteca local (`public/textures/lib/`:
 * `latao`, `aco-inox`, `plastico-claro`) com mapas de micro-relevo em canvas (escovado
 * longitudinal do latão maquinado e ondulação fina de injeção no acrílico/policarbonato),
 * mantendo fidelidade visual mesmo offline.
 */
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { ElectricalComponent } from '../types'
import { useSimStore } from '../store/useSimStore'
import { PANEL_UNITS_PER_MM } from './modelPaths'
import { textureLibraryEntry } from './textureLibrary'
import {
  acrylicBusbarColorOf,
  acrylicBusbarDimsOf,
  acrylicCoverVisibleOf,
  buildAcrylicBusbar,
  buildSteppedBusbar,
  isAcrylicBusbarType,
  STEPPED_BUSBAR,
  steppedBusbarDimsOf,
  steppedCoverOpenOf,
  steppedCoverVisibleOf,
  type AcrylicBusbarType,
} from './busbarParts'

const U = PANEL_UNITS_PER_MM

// Cache partilhada dos mapas PBR reais (carregados uma única vez para todos os barramentos)
const texLoader = new THREE.TextureLoader()
const fileTexCache = new Map<string, Promise<THREE.Texture>>()
const canvasTexCache = new Map<string, THREE.CanvasTexture>()

function loadRealMap(url: string, srgb: boolean): Promise<THREE.Texture> {
  const key = `${url}|${srgb ? 's' : 'l'}`
  let hit = fileTexCache.get(key)
  if (!hit) {
    hit = texLoader.loadAsync(url).then((tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping
      tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
      tex.anisotropy = 8
      tex.needsUpdate = true
      return tex
    })
    hit.catch(() => fileTexCache.delete(key))
    fileTexCache.set(key, hit)
  }
  return hit
}

function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** Latão maquinado escovado CuZn39Pb3 (fallback imediato antes/em complemento ao ambientCG Metal042A). */
function machinedBrassMaps(): { color: THREE.CanvasTexture; bump: THREE.CanvasTexture; rough: THREE.CanvasTexture } {
  const cachedC = canvasTexCache.get('brass-c')
  const cachedB = canvasTexCache.get('brass-b')
  const cachedR = canvasTexCache.get('brass-r')
  if (cachedC && cachedB && cachedR) return { color: cachedC, bump: cachedB, rough: cachedR }

  const size = 256
  const cc = document.createElement('canvas')
  const cb = document.createElement('canvas')
  const cr = document.createElement('canvas')
  cc.width = cc.height = cb.width = cb.height = cr.width = cr.height = size
  const gc = cc.getContext('2d')!
  const gb = cb.getContext('2d')!
  const gr = cr.getContext('2d')!
  const rand = seeded(1337)

  gc.fillStyle = '#d3a948'
  gc.fillRect(0, 0, size, size)
  gb.fillStyle = '#808080'
  gb.fillRect(0, 0, size, size)
  gr.fillStyle = '#525252'
  gr.fillRect(0, 0, size, size)

  // Estrias finas de fresagem/trefilagem longitudinal do barramento de latão
  for (let i = 0; i < 1100; i++) {
    const y = rand() * size
    const x = rand() * size
    const len = 36 + rand() * 190
    const bright = rand() > 0.46
    const a = 0.05 + rand() * 0.13
    gc.strokeStyle = bright ? `rgba(255,236,175,${a})` : `rgba(120,86,22,${a})`
    gc.lineWidth = 0.55 + rand() * 0.9
    gc.beginPath()
    gc.moveTo(x, y)
    gc.lineTo(x + len, y + (rand() - 0.5) * 0.6)
    gc.stroke()

    const bv = bright ? 175 : 85
    gb.strokeStyle = `rgba(${bv},${bv},${bv},${a * 1.35})`
    gb.lineWidth = 0.7
    gb.beginPath()
    gb.moveTo(x, y)
    gb.lineTo(x + len, y)
    gb.stroke()

    const rv = bright ? 58 : 118
    gr.strokeStyle = `rgba(${rv},${rv},${rv},${a})`
    gr.lineWidth = 0.9
    gr.beginPath()
    gr.moveTo(x, y)
    gr.lineTo(x + len, y)
    gr.stroke()
  }

  const wrap = (el: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(el)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = 8
    if (srgb) t.colorSpace = THREE.SRGBColorSpace
    t.needsUpdate = true
    return t
  }
  const color = wrap(cc, true)
  const bump = wrap(cb, false)
  const rough = wrap(cr, false)
  canvasTexCache.set('brass-c', color)
  canvasTexCache.set('brass-b', bump)
  canvasTexCache.set('brass-r', rough)
  return { color, bump, rough }
}

/** Grão fino de poliamida PA66 injetada (relevo micro-texturado mate/acetinado). */
function polyamideGrainBump(): THREE.CanvasTexture {
  const hit = canvasTexCache.get('pa66-bump')
  if (hit) return hit
  const size = 256
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(size, size)
  const rand = seeded(9021)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.max(0, Math.min(255, Math.round(128 + (rand() - 0.5) * 56)))
    img.data[i] = v
    img.data[i + 1] = v
    img.data[i + 2] = v
    img.data[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(3, 3)
  tex.anisotropy = 4
  tex.needsUpdate = true
  canvasTexCache.set('pa66-bump', tex)
  return tex
}

/** Micro-variação ótica suave de acrílico/policarbonato moldado por injeção. */
function acrylicMicroRough(): THREE.CanvasTexture {
  const hit = canvasTexCache.get('pmma-rough')
  if (hit) return hit
  const size = 128
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#181818'
  ctx.fillRect(0, 0, size, size)
  const rand = seeded(551)
  for (let i = 0; i < 180; i++) {
    const x = rand() * size
    const y = rand() * size
    const r = 6 + rand() * 20
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(55,55,55,0.16)')
    g.addColorStop(1, 'rgba(20,20,20,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 4
  tex.needsUpdate = true
  canvasTexCache.set('pmma-rough', tex)
  return tex
}

/** Liga assincronamente os mapas PBR fotografados (ambientCG CC0) ao material e redesenha a cena. */
function attachScannedPbr(
  material: THREE.MeshPhysicalMaterial | THREE.MeshStandardMaterial,
  entryId: 'latao' | 'aco-inox' | 'aco-zincado' | 'plastico-claro',
  opts: { useColor?: boolean; normalScale?: number; invalidate: () => void; cancelled: () => boolean },
) {
  const entry = textureLibraryEntry(entryId)
  if (!entry) return
  const jobs: Promise<void>[] = [
    loadRealMap(entry.maps.normal, false).then((t) => {
      if (opts.cancelled()) return
      material.normalMap = t
      const ns = opts.normalScale ?? 0.45
      material.normalScale = new THREE.Vector2(ns, ns)
    }),
    loadRealMap(entry.maps.roughness, false).then((t) => {
      if (opts.cancelled()) return
      material.roughnessMap = t
    }),
  ]
  if (opts.useColor) {
    jobs.push(
      loadRealMap(entry.maps.color, true).then((t) => {
        if (opts.cancelled()) return
        material.map = t
      }),
    )
  }
  if (entry.maps.metalness) {
    jobs.push(
      loadRealMap(entry.maps.metalness, false).then((t) => {
        if (opts.cancelled()) return
        material.metalnessMap = t
      }),
    )
  }
  Promise.all(jobs)
    .then(() => {
      if (opts.cancelled()) return
      material.needsUpdate = true
      opts.invalidate()
    })
    .catch(() => { /* fallback procedimental já ativo */ })
}

/** Cria material ótico realista de acrílico PMMA colorido translúcido. */
function createTintedAcrylicMaterial(hexColor: string): THREE.MeshPhysicalMaterial {
  const base = new THREE.Color(hexColor)
  const hsl = { h: 0, s: 0, l: 0 }
  base.getHSL(hsl)
  const isClear = hsl.s < 0.22 && hsl.l > 0.78
  const isDark = hsl.l < 0.25
  // Satura ligeiramente a cor para reproduzir o brilho vítreo do acrílico verde/azul/vermelho/amarelo real
  const jewel = base.clone().setHSL(hsl.h, isClear ? hsl.s * 0.5 : Math.min(1, hsl.s * 1.12), isClear ? 0.92 : Math.max(0.18, Math.min(0.54, hsl.l)))
  const mat = new THREE.MeshPhysicalMaterial({
    color: jewel,
    roughnessMap: acrylicMicroRough(),
    roughness: isClear ? 0.08 : 0.085,
    metalness: 0.02,
    ior: 1.495,
    reflectivity: 0.9,
    clearcoat: 0.92,
    clearcoatRoughness: 0.04,
    attenuationColor: jewel,
    attenuationDistance: 0.09,
    transparent: true,
    opacity: isClear ? 0.24 : isDark ? 0.62 : 0.54,
    depthWrite: false,
    side: THREE.DoubleSide,
    envMapIntensity: 1.35,
  })
  mat.userData.keepTransparent = true
  return mat
}

function disposeGroupGeometries(group: THREE.Object3D) {
  group.traverse((node) => {
    const m = node as THREE.Mesh
    if (m.isMesh) m.geometry.dispose()
  })
}

/**
 * Barramento unipolar isolado com acrílico colorido:
 *  - `earthBar`           → acrílico verde (PE)
 *  - `busbarNeutral`      → acrílico azul (N)
 *  - `busbarPhaseAcrylic` → acrílico com cor editável no Inspetor
 */
export function AcrylicBusbar3D({
  c,
  position,
  wireMode,
  label,
}: {
  c: ElectricalComponent
  position: [number, number, number]
  wireMode?: boolean
  label?: ReactNode
}) {
  const { invalidate } = useThree()
  const type: AcrylicBusbarType = isAcrylicBusbarType(c.type) ? c.type : 'busbarPhaseAcrylic'
  const dims = acrylicBusbarDimsOf(c.state)
  const acrylicColor = acrylicBusbarColorOf(type, c.state)
  const coverVisible = acrylicCoverVisibleOf(c.state)
  const insulatorHex = c.bodyColor && c.bodyColor !== '#e2e8f0' ? c.bodyColor : '#ddd7cb'

  const materials = useMemo(() => {
    const brassProc = machinedBrassMaps()
    const pa66Bump = polyamideGrainBump()
    return {
      body: new THREE.MeshPhysicalMaterial({
        color: insulatorHex,
        bumpMap: pa66Bump,
        bumpScale: 0.0018,
        roughness: 0.48,
        metalness: 0.0,
        clearcoat: 0.14,
        clearcoatRoughness: 0.52,
        envMapIntensity: 0.95,
      }),
      brass: new THREE.MeshStandardMaterial({
        color: '#dfc06a',
        map: brassProc.color,
        bumpMap: brassProc.bump,
        bumpScale: 0.0022,
        roughnessMap: brassProc.rough,
        metalness: 0.91,
        roughness: 0.26,
        envMapIntensity: 1.4,
      }),
      screw: new THREE.MeshStandardMaterial({
        color: '#e5cb78',
        map: brassProc.color,
        bumpMap: brassProc.bump,
        bumpScale: 0.0016,
        metalness: 0.92,
        roughness: 0.22,
        envMapIntensity: 1.45,
      }),
      bore: new THREE.MeshStandardMaterial({
        color: '#231b0d',
        metalness: 0.45,
        roughness: 0.72,
        envMapIntensity: 0.35,
      }),
      cover: createTintedAcrylicMaterial(acrylicColor),
    }
  }, [insulatorHex, acrylicColor])

  useEffect(() => {
    let dead = false
    const cancelled = () => dead
    attachScannedPbr(materials.body, 'plastico-claro', { normalScale: 0.36, invalidate, cancelled })
    attachScannedPbr(materials.brass, 'latao', { useColor: true, normalScale: 0.48, invalidate, cancelled })
    attachScannedPbr(materials.screw, 'aco-inox', { normalScale: 0.3, invalidate, cancelled })
    return () => {
      dead = true
      Object.values(materials).forEach((m) => m.dispose())
    }
  }, [materials, invalidate])

  const built = useMemo(() => {
    const res = buildAcrylicBusbar(dims.poles, U, materials)
    // A tampa fica numa ordem de render superior para mostrar nitidamente os parafusos e o latão por dentro.
    res.cover.traverse((node) => {
      const m = node as THREE.Mesh
      if (m.isMesh) m.renderOrder = 3
    })
    return res
  }, [dims.poles, materials])

  useEffect(() => () => disposeGroupGeometries(built.root), [built])

  useEffect(() => {
    built.cover.visible = coverVisible
    built.cover.traverse((node) => {
      const m = node as THREE.Mesh
      if (!m.isMesh) return
      m.raycast = wireMode ? () => {} : THREE.Mesh.prototype.raycast
    })
    invalidate()
  }, [built, coverVisible, wireMode, invalidate])

  return (
    <group position={position}>
      <primitive object={built.root} />
      {label}
    </group>
  )
}

/**
 * Barramento repartidor de fases em escada (4P / 3P / 2P) com barras maciças de latão
 * e tampa articulada em policarbonato transparente (abre/fecha + ocultar/mostrar).
 */
export function SteppedBusbar3D({
  c,
  position,
  interactive,
  wireMode,
  label,
}: {
  c: ElectricalComponent
  position: [number, number, number]
  interactive: boolean
  wireMode?: boolean
  label?: ReactNode
}) {
  const { invalidate, gl } = useThree()
  const dims = steppedBusbarDimsOf(c.state)
  const coverVisible = steppedCoverVisibleOf(c.state)
  const coverOpen = steppedCoverOpenOf(c.state)
  const frameHex = c.bodyColor && c.bodyColor !== '#e2e8f0' ? c.bodyColor : '#d5d8dc'

  const materials = useMemo(() => {
    const brassProc = machinedBrassMaps()
    const pa66Bump = polyamideGrainBump()
    return {
      body: new THREE.MeshPhysicalMaterial({
        color: frameHex,
        bumpMap: pa66Bump,
        bumpScale: 0.0018,
        roughness: 0.46,
        metalness: 0.0,
        clearcoat: 0.16,
        clearcoatRoughness: 0.48,
        envMapIntensity: 0.95,
      }),
      dark: new THREE.MeshStandardMaterial({
        color: '#464d56',
        metalness: 0.15,
        roughness: 0.62,
      }),
      brass: new THREE.MeshStandardMaterial({
        color: '#dbb95e',
        map: brassProc.color,
        bumpMap: brassProc.bump,
        bumpScale: 0.0024,
        roughnessMap: brassProc.rough,
        metalness: 0.91,
        roughness: 0.27,
        envMapIntensity: 1.38,
      }),
      screw: new THREE.MeshStandardMaterial({
        color: '#dde2e8',
        bumpMap: brassProc.bump,
        bumpScale: 0.0015,
        metalness: 0.93,
        roughness: 0.2,
        envMapIntensity: 1.45,
      }),
      bore: new THREE.MeshStandardMaterial({
        color: '#1e1910',
        metalness: 0.4,
        roughness: 0.76,
        envMapIntensity: 0.3,
      }),
      cover: Object.assign(
        new THREE.MeshPhysicalMaterial({
          color: '#e8f2fa',
          roughnessMap: acrylicMicroRough(),
          roughness: 0.06,
          metalness: 0.02,
          ior: 1.585,
          reflectivity: 0.85,
          clearcoat: 0.85,
          clearcoatRoughness: 0.04,
          transparent: true,
          opacity: 0.2,
          depthWrite: false,
          side: THREE.DoubleSide,
          envMapIntensity: 1.15,
        }),
        { userData: { keepTransparent: true } },
      ),
      coverEdge: Object.assign(
        new THREE.MeshPhysicalMaterial({
          color: '#222d3a',
          roughness: 0.14,
          metalness: 0.08,
          clearcoat: 0.9,
          clearcoatRoughness: 0.05,
          transparent: true,
          opacity: 0.68,
          depthWrite: false,
          envMapIntensity: 1.2,
        }),
        { userData: { keepTransparent: true } },
      ),
    }
  }, [frameHex])

  useEffect(() => {
    let dead = false
    const cancelled = () => dead
    attachScannedPbr(materials.body, 'plastico-claro', { normalScale: 0.35, invalidate, cancelled })
    attachScannedPbr(materials.brass, 'latao', { useColor: true, normalScale: 0.5, invalidate, cancelled })
    attachScannedPbr(materials.screw, 'aco-inox', { normalScale: 0.32, invalidate, cancelled })
    return () => {
      dead = true
      Object.values(materials).forEach((m) => m.dispose())
    }
  }, [materials, invalidate])

  const built = useMemo(() => {
    const res = buildSteppedBusbar({ poleCount: dims.holesPerBar, barsMode: dims.barsMode }, U, materials)
    res.cover.traverse((node) => {
      const m = node as THREE.Mesh
      if (m.isMesh) m.renderOrder = 3
    })
    return res
  }, [dims.holesPerBar, dims.barsMode, materials])

  useEffect(() => () => disposeGroupGeometries(built.root), [built])

  // Animação suave com amortecimento crítico da tampa articulada (0° fechada ↔ 92° aberta)
  const angleRef = useRef(coverOpen ? STEPPED_BUSBAR.openDeg : 0)
  const velRef = useRef(0)

  useEffect(() => {
    built.cover.visible = coverVisible
    built.cover.rotation.x = -THREE.MathUtils.degToRad(angleRef.current)
    built.cover.traverse((node) => {
      const m = node as THREE.Mesh
      if (!m.isMesh) return
      // Em modo de cablagem/sonda os cliques atravessam sempre a tampa direto aos bornes das barras
      m.raycast = !coverVisible || wireMode ? () => {} : THREE.Mesh.prototype.raycast
    })
    gl.shadowMap.needsUpdate = true
    invalidate()
  }, [built, coverVisible, wireMode, invalidate, gl])

  useEffect(() => {
    invalidate()
  }, [coverOpen, invalidate])

  useFrame((_, delta) => {
    const target = coverOpen ? STEPPED_BUSBAR.openDeg : 0
    if (Math.abs(target - angleRef.current) < 0.04 && Math.abs(velRef.current) < 0.04) {
      if (angleRef.current !== target) {
        angleRef.current = target
        velRef.current = 0
        built.cover.rotation.x = -THREE.MathUtils.degToRad(target)
      }
      return
    }
    const dt = Math.min(delta, 1 / 30)
    const k = 48
    const damping = 2 * Math.sqrt(k) * 0.92
    const accel = k * (target - angleRef.current) - damping * velRef.current
    velRef.current += accel * dt
    angleRef.current += velRef.current * dt
    built.cover.rotation.x = -THREE.MathUtils.degToRad(angleRef.current)
    invalidate()
  })

  // Duplo clique na tampa articulada abre/fecha sem interferir com a seleção simples do barramento
  const onCoverDoubleClick = (event: ThreeEvent<MouseEvent>) => {
    if (!interactive || c.locked || wireMode || !coverVisible) return
    event.stopPropagation()
    useSimStore.getState().setComponentState(c.id, { coverOpen: !coverOpen })
  }

  return (
    <group position={position}>
      <primitive object={built.body} />
      <primitive
        object={built.cover}
        onDoubleClick={onCoverDoubleClick}
      />
      {label}
    </group>
  )
}
