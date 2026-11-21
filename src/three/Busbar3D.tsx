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
  acrylicBusbarWireEntryOf,
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
import {
  buildCombBusbar,
  buildCombConnector,
  COMB_CONDUCTOR_HEX,
  combBrandOf,
  combConnectorColorOf,
  combConnectorGaugeOf,
  combConnectorPhaseColorsOf,
  combConnectorPinDirectionOf,
  combConnectorPinStyleOf,
  combEndCapsOf,
  combFeedConnectorsOf,
  combModeOf,
  combNeutralSideOf,
  combRatedAOf,
  combTeethDirectionOf,
  clampCombBusbarPoles,
  type CombConductor,
} from './combBusbarParts'
import {
  brushedElectrolyticCopperMaps,
  getCombBusbarSilkscreenTexture,
  getCombConnectorStampTexture,
  serratedTinnedBladeBump,
} from './combBusbarMarkings'

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
  entryId: 'latao' | 'cobre' | 'aco-inox' | 'aco-zincado' | 'plastico-claro',
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
  const wireEntry = acrylicBusbarWireEntryOf(type, c.state)
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
    const res = buildAcrylicBusbar(dims.poles, U, materials, { wireEntryDirection: wireEntry })
    // A tampa fica numa ordem de render superior para mostrar nitidamente os parafusos e o latão por dentro.
    res.cover.traverse((node) => {
      const m = node as THREE.Mesh
      if (m.isMesh) m.renderOrder = 3
    })
    return res
  }, [dims.poles, wireEntry, materials])

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

  // body e cover são primitivas próprias (saem de built.root ao montar): libertar as três árvores.
  useEffect(() => () => {
    for (const group of [built.root, built.body, built.cover]) disposeGroupGeometries(group)
    const decal = built.cover.getObjectByName('stepped-cover-danger-decal') as THREE.Mesh | undefined
    ;(decal?.material as THREE.Material | undefined)?.dispose()
  }, [built])

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

/**
 * Barramento tipo pente 3D real (`busbarComb` — 1P, 1P+N, 3P e 3P+N) com:
 *  - pinos e barras internas em cobre eletrolítico escovado PBR (`ambientCG Metal035` + estrias de laminagem),
 *  - perfil isolante rígido em PVC RAL 7035 PBR (`ambientCG Plastic010`) + barreiras dielétricas anti-arco,
 *  - serigrafia industrial de alta definição atualizada ao vivo (Lexman, Sibratec, Schneider, Legrand + L1/L2/L3/N),
 *  - conectores de alimentação acopláveis (6–25 mm²) com pino estanhado estriado e cor PA66 personalizável.
 */
export function CombBusbar3D({
  c,
  position,
  label,
}: {
  c: ElectricalComponent
  position: [number, number, number]
  label?: ReactNode
}) {
  const invalidate = useThree((s) => s.invalidate)
  const poles = clampCombBusbarPoles(c.state.poleCount)
  const combMode = combModeOf(c.state)
  const neutralSide = combNeutralSideOf(c.state)
  const teethDirection = combTeethDirectionOf(c.state)
  const brandStyle = combBrandOf(c.state)
  const ratedA = combRatedAOf(c.state)
  const endCaps = combEndCapsOf(c.state)
  const feedConnectors = combFeedConnectorsOf(c.state)
  const connectorColor = combConnectorColorOf(c.state)
  const connectorPhaseColors = combConnectorPhaseColorsOf(c.state)

  const baseMats = useMemo(() => {
    const cu = brushedElectrolyticCopperMaps()
    const paBump = polyamideGrainBump()
    const tinBump = serratedTinnedBladeBump()

    const pvcOuter = new THREE.MeshPhysicalMaterial({
      color: '#e1e4e7',
      bumpMap: paBump,
      bumpScale: 0.0005,
      roughness: 0.42,
      metalness: 0.0,
      clearcoat: 0.14,
      clearcoatRoughness: 0.45,
      envMapIntensity: 0.9,
    })
    pvcOuter.userData.keepColor = true

    const pvcBarrier = new THREE.MeshStandardMaterial({
      color: '#9aa1aa',
      bumpMap: paBump,
      bumpScale: 0.0004,
      roughness: 0.56,
      metalness: 0.02,
      envMapIntensity: 0.78,
    })
    pvcBarrier.userData.keepColor = true

    const copper = new THREE.MeshPhysicalMaterial({
      color: '#e28c55',
      map: cu.color,
      bumpMap: cu.bump,
      bumpScale: 0.0007,
      roughnessMap: cu.rough,
      roughness: 0.23,
      metalness: 0.92,
      clearcoat: 0.12,
      clearcoatRoughness: 0.25,
      envMapIntensity: 1.45,
    })
    copper.userData.keepColor = true

    const tinned = new THREE.MeshPhysicalMaterial({
      color: '#e5e9ef',
      bumpMap: tinBump,
      bumpScale: 0.001,
      roughness: 0.19,
      metalness: 0.95,
      clearcoat: 0.1,
      clearcoatRoughness: 0.2,
      envMapIntensity: 1.5,
    })
    tinned.userData.keepColor = true

    const cage = new THREE.MeshPhysicalMaterial({
      color: '#d9be6c',
      roughness: 0.26,
      metalness: 0.9,
      envMapIntensity: 1.25,
    })
    cage.userData.keepColor = true

    const dark = new THREE.MeshStandardMaterial({
      color: '#1b2028',
      roughness: 0.8,
      metalness: 0.28,
    })
    dark.userData.keepColor = true

    const silkscreen = new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      roughness: 0.34,
      metalness: 0.01,
      clearcoat: 0.16,
      clearcoatRoughness: 0.36,
      envMapIntensity: 0.85,
    })
    silkscreen.userData.keepColor = true

    const yellowCap = new THREE.MeshPhysicalMaterial({
      color: '#eab308',
      roughness: 0.36,
      metalness: 0.08,
      clearcoat: 0.15,
      clearcoatRoughness: 0.4,
      envMapIntensity: 0.95,
    })
    yellowCap.userData.keepColor = true

    return { pvcOuter, pvcBarrier, copper, tinned, cage, dark, silkscreen, yellowCap }
  }, [])

  // Mapas PBR reais fotografados (cobre Metal035, aço inox Metal055A, latão Metal042A e plástico Plastic010)
  useEffect(() => {
    let dead = false
    const opts = { invalidate, cancelled: () => dead }
    attachScannedPbr(baseMats.copper, 'cobre', { useColor: true, normalScale: 0.42, ...opts })
    attachScannedPbr(baseMats.tinned, 'aco-inox', { normalScale: 0.32, ...opts })
    attachScannedPbr(baseMats.cage, 'latao', { normalScale: 0.3, ...opts })
    attachScannedPbr(baseMats.pvcOuter, 'plastico-claro', { normalScale: 0.32, ...opts })
    return () => {
      dead = true
      Object.values(baseMats).forEach((m) => m.dispose())
    }
  }, [baseMats, invalidate])

  // Atualiza a serigrafia frontal ao vivo sempre que muda marca, modo, polos, lado do N, direção ou calibre
  useEffect(() => {
    const tex = getCombBusbarSilkscreenTexture({
      poleCount: poles,
      combMode,
      neutralSide,
      teethDirection,
      brandStyle,
      ratedA,
    })
    baseMats.silkscreen.map = tex
    baseMats.silkscreen.needsUpdate = true
    invalidate()
  }, [baseMats, poles, combMode, neutralSide, teethDirection, brandStyle, ratedA, invalidate])

  // Materiais PA66 dos conectores de alimentação acoplados (cor escolhida ou cores IEC por fase)
  const connMats = useMemo(() => {
    const paBump = polyamideGrainBump()
    const makePa66 = (hex: string) => {
      const m = new THREE.MeshPhysicalMaterial({
        color: hex,
        bumpMap: paBump,
        bumpScale: 0.0006,
        roughness: 0.38,
        metalness: 0.0,
        clearcoat: 0.15,
        clearcoatRoughness: 0.42,
        envMapIntensity: 0.92,
      })
      m.userData.keepColor = true
      return m
    }
    if (!connectorPhaseColors) {
      const single = makePa66(connectorColor)
      return {
        list: [single],
        pick: () => single,
      }
    }
    const byCond: Record<CombConductor, THREE.MeshPhysicalMaterial> = {
      L: makePa66(COMB_CONDUCTOR_HEX.L),
      L1: makePa66(COMB_CONDUCTOR_HEX.L1),
      L2: makePa66(COMB_CONDUCTOR_HEX.L2),
      L3: makePa66(COMB_CONDUCTOR_HEX.L3),
      N: makePa66(COMB_CONDUCTOR_HEX.N),
    }
    return {
      list: Object.values(byCond),
      pick: (cond: CombConductor) => byCond[cond],
    }
  }, [connectorColor, connectorPhaseColors])

  useEffect(() => {
    let dead = false
    for (const m of connMats.list) {
      attachScannedPbr(m, 'plastico-claro', { normalScale: 0.35, invalidate, cancelled: () => dead })
    }
    return () => {
      dead = true
      connMats.list.forEach((m) => m.dispose())
    }
  }, [connMats, invalidate])

  const built = useMemo(
    () =>
      buildCombBusbar(
        { ...c.state, poleCount: poles, combMode, neutralSide, teethDirection, endCaps, feedConnectors, brandStyle },
        U,
        {
          ...baseMats,
          connectorBodyFor: (cond) => connMats.pick(cond),
        },
      ),
    [c.state, poles, combMode, neutralSide, teethDirection, endCaps, feedConnectors, brandStyle, baseMats, connMats],
  )

  useEffect(() => () => disposeGroupGeometries(built.root), [built])

  return (
    <group position={position}>
      <primitive object={built.root} />
      {label}
    </group>
  )
}

/**
 * Conector genérico de alimentação tipo pino 3D real (`combBusbarConnector` · 6–25 mm² · 80 A):
 * corpo PA66 com cor editável no Inspetor, bocal tubular saliente IP20, parafuso Pozidriv M6
 * visível no interior, gravação de calibre no capuz e pino chato de cobre estanhado estriado.
 */
export function CombConnector3D({
  c,
  position,
  label,
}: {
  c: ElectricalComponent
  position: [number, number, number]
  label?: ReactNode
}) {
  const invalidate = useThree((s) => s.invalidate)
  const color = combConnectorColorOf(c.state)
  const pinDirection = combConnectorPinDirectionOf(c.state)
  const pinStyle = combConnectorPinStyleOf(c.state)
  const gaugeRange = combConnectorGaugeOf(c.state)

  const mats = useMemo(() => {
    const paBump = polyamideGrainBump()
    const tinBump = serratedTinnedBladeBump()

    const housing = new THREE.MeshPhysicalMaterial({
      color,
      bumpMap: paBump,
      bumpScale: 0.00065,
      roughness: 0.37,
      metalness: 0.0,
      clearcoat: 0.16,
      clearcoatRoughness: 0.4,
      envMapIntensity: 0.95,
    })
    housing.userData.keepColor = true

    const tinned = new THREE.MeshPhysicalMaterial({
      color: '#e6eaf0',
      bumpMap: tinBump,
      bumpScale: 0.0011,
      roughness: 0.18,
      metalness: 0.95,
      clearcoat: 0.12,
      clearcoatRoughness: 0.18,
      envMapIntensity: 1.52,
    })
    tinned.userData.keepColor = true

    const cage = new THREE.MeshPhysicalMaterial({
      color: '#d9be6c',
      roughness: 0.25,
      metalness: 0.9,
      envMapIntensity: 1.25,
    })
    cage.userData.keepColor = true

    const dark = new THREE.MeshStandardMaterial({
      color: '#181d25',
      roughness: 0.82,
      metalness: 0.3,
    })
    dark.userData.keepColor = true

    const stamp = new THREE.MeshStandardMaterial({
      transparent: true,
      roughness: 0.44,
      metalness: 0.0,
      depthWrite: false,
    })
    stamp.userData.keepColor = true
    stamp.userData.keepTransparent = true

    return { housing, tinned, cage, dark, stamp }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let dead = false
    const opts = { invalidate, cancelled: () => dead }
    attachScannedPbr(mats.housing, 'plastico-claro', { normalScale: 0.38, ...opts })
    attachScannedPbr(mats.tinned, 'aco-inox', { normalScale: 0.34, ...opts })
    attachScannedPbr(mats.cage, 'latao', { normalScale: 0.3, ...opts })
    return () => {
      dead = true
      Object.values(mats).forEach((m) => m.dispose())
    }
  }, [mats, invalidate])

  // Cor PA66 + gravação de calibre atualizadas ao vivo sem recriar malhas
  useEffect(() => {
    mats.housing.color.set(color)
    delete mats.housing.userData.dcSimuPresentationBase
    delete mats.housing.userData.dcSimuRenderKey
    mats.housing.needsUpdate = true
    mats.stamp.map = getCombConnectorStampTexture({ connectorColor: color, gaugeRange })
    mats.stamp.needsUpdate = true
    invalidate()
  }, [mats, color, gaugeRange, invalidate])

  const built = useMemo(
    () => buildCombConnector({ pinDirection, pinStyle, gaugeRange, connectorColor: color }, U, mats),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pinDirection, pinStyle, mats],
  )

  useEffect(() => () => disposeGroupGeometries(built.root), [built])

  return (
    <group position={position}>
      <primitive object={built.root} />
      {label}
    </group>
  )
}
