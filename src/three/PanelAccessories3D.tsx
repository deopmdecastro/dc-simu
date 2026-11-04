/**
 * Quadro metálico com porta (dobradiças, junta, fechos ¼ de volta) e calha técnica com tampa
 * no Painel 3D. Geometria paramétrica (`enclosureParts.ts`) e texturas reais geradas em canvas
 * (pintura epóxi texturada, zinco galvanizado, PVC fosco), com UV à escala real.
 */
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { ElectricalComponent } from '../types'
import { useSimStore } from '../store/useSimStore'
import { PANEL_UNITS_PER_MM } from './modelPaths'
import { buildCableDuct, buildEnclosure, cableDuctDimsOf, ENCLOSURE, ENCLOSURE_PLATE_FRONT_MM, enclosureDimsOf, enclosureHingeOf } from './enclosureParts'
import { galvanizedSteel, powderCoat, pvcMatte } from './proceduralTextures'

const U = PANEL_UNITS_PER_MM

/** Acabamentos da chapa de montagem disponíveis no inspetor. */
export const ENCLOSURE_PLATE_FINISHES: Record<string, { color: string; metal: boolean }> = {
  'Aço galvanizado': { color: '#ffffff', metal: true },
  'Laranja RAL 2000': { color: '#e8762c', metal: false },
  'Branco RAL 9010': { color: '#f1efe6', metal: false },
}
export const ENCLOSURE_PLATE_FINISH_IDS = Object.keys(ENCLOSURE_PLATE_FINISHES)

/** Cinzento RAL 7035 (cor de série dos armários). */
export const ENCLOSURE_DEFAULT_COLOR = '#cfd1cb'
/** Cinzento RAL 7030 (calhas técnicas). */
export const CABLE_DUCT_DEFAULT_COLOR = '#a9aca8'

function powderMaterial(color: string) {
  const maps = powderCoat()
  return new THREE.MeshPhysicalMaterial({
    color, map: maps.map, bumpMap: maps.bump, bumpScale: 0.35, roughnessMap: maps.rough,
    roughness: 0.62, metalness: 0.12, clearcoat: 0.18, clearcoatRoughness: 0.55, envMapIntensity: 0.85,
  })
}

/** Liberta geometrias (os mapas são partilhados por cache e não se apagam). */
function disposeTree(root: THREE.Object3D) {
  root.traverse((node) => { const mesh = node as THREE.Mesh; if (mesh.isMesh) mesh.geometry.dispose() })
}

/** Superfícies que não devem apanhar cliques (o clique atravessa para os aparelhos e para a chapa). */
const PASS_THROUGH = new Set(['enclosure-back', 'enclosure-mounting-plate', 'enclosure-standoffs', 'enclosure-gland'])

/** Quadro: a face da chapa de montagem coincide com o plano da chapa do painel (`plateFrontZ`, relativo ao pivô). */
export function Enclosure3D({ c, interactive, plateFrontZ, label }: { c: ElectricalComponent; interactive: boolean; plateFrontZ: number; label?: ReactNode }) {
  const { invalidate } = useThree()
  const dims = enclosureDimsOf(c.state)
  const hinge = enclosureHingeOf(c.state)
  const color = c.bodyColor && c.bodyColor !== '#e2e8f0' ? c.bodyColor : ENCLOSURE_DEFAULT_COLOR
  const finishId = typeof c.state.plateFinish === 'string' && ENCLOSURE_PLATE_FINISHES[c.state.plateFinish] ? c.state.plateFinish : 'Aço galvanizado'

  const materials = useMemo(() => {
    const finish = ENCLOSURE_PLATE_FINISHES[finishId]
    const zinc = galvanizedSteel([1, 1])
    const plate = finish.metal
      ? new THREE.MeshStandardMaterial({ color: '#ffffff', map: zinc.map, bumpMap: zinc.bump, bumpScale: 0.2, roughnessMap: zinc.rough, metalness: 0.78, roughness: 0.4, envMapIntensity: 1 })
      : powderMaterial(finish.color)
    return {
      body: powderMaterial(color),
      plate,
      gasket: new THREE.MeshStandardMaterial({ color: '#1d2126', roughness: 0.92, metalness: 0 }),
      metal: new THREE.MeshStandardMaterial({ color: '#c4c9d0', metalness: 0.95, roughness: 0.24, envMapIntensity: 1.2 }),
      dark: new THREE.MeshStandardMaterial({ color: '#3a3f47', metalness: 0.45, roughness: 0.48 }),
    }
  }, [color, finishId])
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials])

  const parts = useMemo(() => {
    const built = buildEnclosure(dims, U, materials, hinge)
    for (const root of [built.body, built.door]) root.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      if (PASS_THROUGH.has(mesh.name)) mesh.raycast = () => {}
      if (mesh.name === 'enclosure-mounting-plate') mesh.userData.wireSurface = true
    })
    return built
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dims.widthMm, dims.heightMm, dims.depthMm, hinge, materials])
  useEffect(() => () => { disposeTree(parts.body); disposeTree(parts.door) }, [parts])

  // Porta: amortecimento crítico até ao ângulo pedido (abre/fecha como uma porta real, sem saltos).
  const open = c.state.doorOpen !== false
  const angle = useRef(open ? ENCLOSURE.openDeg : 0)
  const speed = useRef(0)
  useEffect(() => { invalidate() }, [open, invalidate])
  useFrame((_, delta) => {
    const target = open ? ENCLOSURE.openDeg : 0
    const dt = Math.min(delta, 1 / 30)
    const k = 38, damping = 2 * Math.sqrt(k) * 0.92
    const accel = k * (target - angle.current) - damping * speed.current
    speed.current += accel * dt
    angle.current += speed.current * dt
    if (Math.abs(target - angle.current) < 0.05 && Math.abs(speed.current) < 0.05) { angle.current = target; speed.current = 0 }
    else invalidate()
    parts.door.rotation.y = parts.openSign * THREE.MathUtils.degToRad(angle.current)
  })

  const toggleDoor = (event: ThreeEvent<MouseEvent>) => {
    if (!interactive || c.locked) return
    event.stopPropagation()
    useSimStore.getState().setComponentState(c.id, { doorOpen: !open })
  }

  return <group position={[0, 0, plateFrontZ - ENCLOSURE_PLATE_FRONT_MM * U]}>
    <primitive object={parts.body} />
    <primitive object={parts.door} onClick={toggleDoor}
      onPointerOver={() => { if (interactive && !c.locked) document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { document.body.style.cursor = '' }} />
    <group position={[0, dims.heightMm * U / 2 + 0.12, dims.depthMm * U]}>{label}</group>
  </group>
}

/** Calha técnica: base assente na chapa (`plateFrontZ`, relativo ao pivô); X = comprimento, Y = largura. */
export function CableDuct3D({ c, plateFrontZ, label }: { c: ElectricalComponent; plateFrontZ: number; label?: ReactNode }) {
  const dims = cableDuctDimsOf(c.state)
  const coverOn = c.state.coverOn !== false
  const color = c.bodyColor && c.bodyColor !== '#e2e8f0' ? c.bodyColor : CABLE_DUCT_DEFAULT_COLOR
  const materials = useMemo(() => {
    const pvc = pvcMatte()
    const make = (tint: string) => new THREE.MeshStandardMaterial({ color: tint, map: pvc.map, bumpMap: pvc.bump, bumpScale: 0.25, roughnessMap: pvc.rough, roughness: 0.66, metalness: 0.02, envMapIntensity: 0.7 })
    return { body: make(color), cover: make(new THREE.Color(color).offsetHSL(0, 0, 0.03).getStyle()) }
  }, [color])
  useEffect(() => () => { materials.body.dispose(); materials.cover.dispose() }, [materials])
  const group = useMemo(() => buildCableDuct(dims, U, materials, coverOn),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dims.lengthMm, dims.widthMm, dims.heightMm, coverOn, materials])
  useEffect(() => () => disposeTree(group), [group])
  return <group position={[0, 0, plateFrontZ]}>
    <primitive object={group} />
    <group position={[0, dims.widthMm * U / 2 + 0.08, dims.heightMm * U + 0.02]}>{label}</group>
  </group>
}

/** Espiral de proteção: tubo helicoidal simples (PVC preto). */
export function SpiralWrap3D({ c, plateFrontZ, label }: { c: ElectricalComponent; plateFrontZ: number; label?: ReactNode }) {
  const lengthMm = typeof c.state.lengthMm === 'number' ? c.state.lengthMm : 300
  const innerDiaMm = typeof c.state.innerDiaMm === 'number' ? c.state.innerDiaMm : 10
  const pitchMm = typeof c.state.pitchMm === 'number' ? c.state.pitchMm : 8
  const color = typeof c.state.color === 'string' ? c.state.color : (c.bodyColor && c.bodyColor !== '#e2e8f0' ? c.bodyColor : '#0a0a0a')
  const geo = useMemo(() => {
    const turns = Math.max(2, lengthMm / pitchMm)
    const path = new THREE.CurvePath<THREE.Vector3>()
    const pts: THREE.Vector3[] = []
    const steps = Math.max(24, Math.ceil(turns * 16))
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const angle = t * turns * Math.PI * 2
      const r = (innerDiaMm / 2 + 1.2) * U
      pts.push(new THREE.Vector3((t - 0.5) * lengthMm * U, Math.cos(angle) * r, Math.sin(angle) * r))
    }
    for (let i = 0; i < pts.length - 1; i++) path.add(new THREE.LineCurve3(pts[i], pts[i + 1]))
    return new THREE.TubeGeometry(path as unknown as THREE.Curve<THREE.Vector3>, steps, 1.4 * U, 6, false)
  }, [lengthMm, innerDiaMm, pitchMm])
  useEffect(() => () => geo.dispose(), [geo])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05, envMapIntensity: 0.6 }), [color])
  useEffect(() => () => mat.dispose(), [mat])
  return <group position={[0, 0, plateFrontZ + (innerDiaMm / 2 + 2) * U]}>
    <mesh geometry={geo} material={mat} castShadow receiveShadow />
    <group position={[0, (innerDiaMm / 2 + 4) * U, 0]}>{label}</group>
  </group>
}
