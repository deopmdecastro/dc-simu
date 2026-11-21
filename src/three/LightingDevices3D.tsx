import { Suspense, useEffect, useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { ElectricalComponent } from '../types'
import { useSimStore } from '../store/useSimStore'
import { isManobraAllowed } from '../store/manobra'
import { cloneModelScene, disposeModelClone, fitComponentModel } from './modelFit'
import { getComponentModelSpec, PANEL_UNITS_PER_MM } from './modelPaths'
import { finishCadMaterial } from './catalogMaterials'
import { playClick } from '../audio/sfx'
import GlowHalo from './GlowHalo'
import {
  applyLightingMarkings,
  applyLightingVisualState,
  cctLightPalette,
  isLightingLampType,
  isLightingSwitchType,
  LAMP_SPECS,
  lampPhotometrics,
  SWITCH_SPECS,
  type LightingComponentType,
} from './lightingModel'

type Props = {
  c: ElectricalComponent
  x: number
  position?: [number, number, number]
  interactive?: boolean
}

/** 0 = tecla única (simples/escada); 1 e 2 = teclas do interruptor duplo. */
type RockerKey = 0 | 1 | 2
const ROCKER_PIVOTS: Record<RockerKey, string> = { 0: 'lighting_rocker_pivot', 1: 'lighting_rocker_1_pivot', 2: 'lighting_rocker_2_pivot' }
/** Curso da tecla ao premir (GLB em metros). */
const ROCKER_TRAVEL_M = 0.0008

const switchKeysOf = (type: LightingComponentType): RockerKey[] => (type === 'wallSwitchDouble' ? [1, 2] : [0])
const switchKeyOn = (type: LightingComponentType, state: Record<string, unknown> | undefined, key: RockerKey) =>
  Boolean(type === 'wallSwitchDouble' ? state?.[key === 2 ? 'on2' : 'on1'] : state?.on)

/** Tecla atingida pelo raio, ou null se o toque foi na moldura, caixa ou bornes. */
export function rockerKeyOf(object: THREE.Object3D | null): RockerKey | null {
  for (let node = object; node; node = node.parent) {
    if (/^lighting_rocker_1(?:_|$)/.test(node.name)) return 1
    if (/^lighting_rocker_2(?:_|$)/.test(node.name)) return 2
    if (/^lighting_rocker(?:_pivot|_decal)?$/.test(node.name)) return 0
  }
  return null
}

/** O R3F chama o handler do grupo uma vez por interseção (da mais próxima à mais distante):
 *  decide-se sempre pela peça à frente, para a moldura por trás não desfazer o que a tecla fez. */
const nearestHit = (e: ThreeEvent<PointerEvent | MouseEvent>): THREE.Object3D => e.intersections[0]?.object ?? e.object

function switchTogglePatch(type: LightingComponentType, state: Record<string, unknown>, key: RockerKey): Record<string, boolean> {
  if (type === 'wallSwitchDouble') {
    const field = key === 2 ? 'on2' : 'on1'
    return { [field]: !state[field] }
  }
  return { on: !state.on }
}

function switchEventMessage(type: LightingComponentType, ref: string, key: RockerKey, patch: Record<string, boolean>): string {
  if (type === 'wallSwitchDouble') {
    const on = key === 2 ? patch.on2 : patch.on1
    return `${ref} (Tecla ${key}): ${on ? `Ligado (L–${key})` : 'Desligado'}.`
  }
  if (type === 'wallSwitchStaircase') return `${ref} (Comutador): ${patch.on ? 'Posição 2 (L–2)' : 'Posição 1 (L–1)'}.`
  return `${ref}: ${patch.on ? 'Ligado (ON)' : 'Desligado (OFF)'}.`
}

function LightingCadInner({ c, x, position, interactive = true }: Props) {
  const type = c.type as LightingComponentType
  const spec = getComponentModelSpec(type)!
  const { scene } = useGLTF(spec.path)
  const { invalidate, controls, gl } = useThree()

  const model = useMemo(() => {
    const raw = cloneModelScene(scene)
    raw.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      const finish = (m: THREE.Material) => {
        // Preserva transparência da ampola de vidro da incandescente e do núcleo luminoso
        if (mesh.name === 'lighting_bulb_glass' || mesh.name === 'lamp_glow_core' || m.transparent) {
          return m.clone()
        }
        return finishCadMaterial(m)
      }
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(finish) : finish(mesh.material)
    })
    return fitComponentModel(raw, spec, PANEL_UNITS_PER_MM, 'center')
  }, [scene, spec])

  useEffect(() => () => disposeModelClone(model), [model])

  const powerW = c.state?.powerW
  const cctK = c.state?.cctK
  useEffect(() => {
    applyLightingMarkings(model, type, c.state)
    invalidate()
  }, [model, type, powerW, cctK, invalidate])

  // Animação suave da iluminação (incandescente, CFL com arranque realista, LED instantâneo)
  // e das teclas basculantes dos interruptores Schneider Odace.
  const glowLevelRef = useRef(c.state?.on ? 1 : 0)
  const cflAgeRef = useRef(c.state?.on ? 1 : 0)
  const prevOnRef = useRef(Boolean(c.state?.on))
  const lampPointLightRef = useRef<THREE.PointLight>(null)

  const anglesRef = useRef<Partial<Record<RockerKey, number>>>({})
  const depthRef = useRef<Partial<Record<RockerKey, number>>>({})
  const pressedKeyRef = useRef<RockerKey | null>(null)
  const orbitRef = useRef<{ target: { enabled: boolean }; enabled: boolean } | null>(null)

  // Atualiza imediatamente em montagens estáticas / snapshots sem depender só do próximo frame
  useEffect(() => {
    if (isLightingLampType(type)) {
      const isOn = Boolean(c.state?.on)
      glowLevelRef.current = isOn ? 1 : 0
      cflAgeRef.current = isOn ? 1 : 0
      prevOnRef.current = isOn
      applyLightingVisualState(model, type, c.state, isOn ? 1 : 0)
    } else if (isLightingSwitchType(type)) {
      applyLightingVisualState(model, type, c.state)
      const tilt = THREE.MathUtils.degToRad(SWITCH_SPECS[type].rockerTiltDeg)
      for (const key of switchKeysOf(type)) anglesRef.current[key] = switchKeyOn(type, c.state, key) ? -tilt : tilt
    }
    invalidate()
  }, [model, type, c.state?.on, c.state?.on1, c.state?.on2, powerW, cctK, invalidate])

  useFrame((_, delta) => {
    const dt = Math.min(0.05, Math.max(0.001, delta))
    if (isLightingLampType(type)) {
      const targetOn = Boolean(c.state?.on)
      if (targetOn && !prevOnRef.current) {
        cflAgeRef.current = 0
      }
      prevOnRef.current = targetOn

      let visualLevel = glowLevelRef.current
      if (type === 'lampFluorescentE27' && targetOn) {
        cflAgeRef.current += dt
        const age = cflAgeRef.current
        // Pulso breve de ignição do balastro CFL nos primeiros 0,24 s + subida suave
        if (age < 0.08) visualLevel = 0.25
        else if (age < 0.14) visualLevel = 0.85
        else if (age < 0.19) visualLevel = 0.35
        else {
          const ramp = Math.min(1, 0.52 + (age - 0.19) * 1.45)
          visualLevel += (ramp - visualLevel) * Math.min(1, dt * 14)
        }
      } else {
        const speed = targetOn
          ? type === 'lampLedE27' ? 28 : 13
          : type === 'lampLedE27' ? 16 : 6.5
        visualLevel += ((targetOn ? 1 : 0) - visualLevel) * Math.min(1, dt * speed)
      }

      if (Math.abs(visualLevel - glowLevelRef.current) > 0.002 || (targetOn && type === 'lampFluorescentE27' && cflAgeRef.current < 0.65)) {
        glowLevelRef.current = visualLevel
        applyLightingVisualState(model, type, c.state, visualLevel)
        if (lampPointLightRef.current) {
          const { intensityScale } = lampPhotometrics(type, c.state?.powerW)
          lampPointLightRef.current.intensity = visualLevel * 0.68 * intensityScale
        }
        invalidate()
      }
      return
    }

    if (isLightingSwitchType(type)) {
      // Tecla basculante: rotação até ao novo batente e afundamento de 0,8 mm enquanto está premida.
      const tilt = THREE.MathUtils.degToRad(SWITCH_SPECS[type].rockerTiltDeg)
      let moved = false
      for (const key of switchKeysOf(type)) {
        const pivot = model.getObjectByName(ROCKER_PIVOTS[key])
        if (!pivot) continue
        const target = switchKeyOn(type, c.state, key) ? -tilt : tilt
        const angle = anglesRef.current[key] ?? target
        if (Math.abs(target - angle) > 0.0005) {
          anglesRef.current[key] = angle + (target - angle) * Math.min(1, dt * 30)
          pivot.rotation.x = anglesRef.current[key]!
          moved = true
        }
        if (typeof pivot.userData.restZ !== 'number') pivot.userData.restZ = pivot.position.z
        const depthTarget = pressedKeyRef.current === key ? 1 : 0
        const depth = depthRef.current[key] ?? 0
        if (depth !== depthTarget) {
          const next = Math.abs(depthTarget - depth) > 0.01 ? depth + (depthTarget - depth) * Math.min(1, dt * 40) : depthTarget
          depthRef.current[key] = next
          pivot.position.z = pivot.userData.restZ - next * ROCKER_TRAVEL_M
          moved = true
        }
      }
      if (moved) invalidate()
    }
  })

  // Só as teclas acionam o interruptor: moldura, caixa e bornes continuam a selecionar/arrastar
  // o aparelho. A tecla atua ao premir (como no aparelho real) e a câmara não roda durante o toque.
  const mayActuate = () => isLightingSwitchType(type) && interactive && !c.locked && useSimStore.getState().tool === 'select'

  useEffect(() => {
    const release = () => {
      if (orbitRef.current) { orbitRef.current.target.enabled = orbitRef.current.enabled; orbitRef.current = null }
      if (pressedKeyRef.current !== null) { pressedKeyRef.current = null; invalidate() }
    }
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
      window.removeEventListener('blur', release)
      release()
    }
  }, [invalidate])

  const handleSwitchDown = (e: ThreeEvent<PointerEvent>) => {
    if (!isLightingSwitchType(type) || e.button !== 0 || !mayActuate()) return
    const key = rockerKeyOf(nearestHit(e))
    if (key === null) return
    e.stopPropagation()
    const store = useSimStore.getState()
    if (!isManobraAllowed(store)) {
      store.selectComponents([c.id])
      return
    }
    const target = controls as unknown as { enabled: boolean } | null
    if (target && !orbitRef.current) { orbitRef.current = { target, enabled: target.enabled }; target.enabled = false }
    pressedKeyRef.current = key
    const current = store.components.find((item) => item.id === c.id) ?? c
    const patch = switchTogglePatch(type, current.state, key)
    store.operateComponent(c.id, patch)
    playClick('selector')
    store.pushEvent('info', switchEventMessage(type, c.ref, key, patch))
    invalidate()
  }

  // O clique que se segue ao premir não deve chegar à seleção nem a outros aparelhos.
  const handleSwitchClick = (e: ThreeEvent<MouseEvent>) => {
    if (mayActuate() && rockerKeyOf(nearestHit(e)) !== null) e.stopPropagation()
  }

  const handleSwitchMove = (e: ThreeEvent<PointerEvent>) => {
    if (!mayActuate()) return
    const overKey = rockerKeyOf(nearestHit(e)) !== null && isManobraAllowed(useSimStore.getState())
    if (overKey) { e.stopPropagation(); gl.domElement.style.cursor = 'pointer' }
    else if (gl.domElement.style.cursor === 'pointer') gl.domElement.style.cursor = ''
  }
  const handleSwitchOut = () => {
    if (gl.domElement.style.cursor === 'pointer') gl.domElement.style.cursor = ''
  }

  const lampVisual = useMemo(() => {
    if (!isLightingLampType(type)) return null
    const lSpec = LAMP_SPECS[type]
    const { intensityScale } = lampPhotometrics(type, c.state?.powerW)
    const cct = Number(c.state?.cctK) || lSpec.defaultCctK
    const pal = cctLightPalette(cct, type === 'lampIncandescentE27')
    const glowPos: [number, number, number] = [
      lSpec.glowCenterMm[0] * PANEL_UNITS_PER_MM,
      (lSpec.glowCenterMm[1] - lSpec.sizeMm.height / 2) * PANEL_UNITS_PER_MM,
      lSpec.glowCenterMm[2] * PANEL_UNITS_PER_MM,
    ]
    const glowColor =
      type === 'lampIncandescentE27'
        ? '#ffb338'
        : type === 'lampFluorescentE27'
          ? (cct <= 3000 ? '#ffc966' : cct >= 6000 ? '#8cd0ff' : '#a8dcff')
          : (cct <= 3000 ? '#ffc24f' : cct >= 6000 ? '#96d4ff' : '#ffe082')
    return {
      color: glowColor,
      glowPos,
      radius: lSpec.glowRadiusMm * PANEL_UNITS_PER_MM * (0.56 + intensityScale * 0.14),
      intensityScale,
    }
  }, [type, c.state?.powerW, c.state?.cctK])

  return (
    <group position={position ?? [x, 0, 0]} {...(isLightingSwitchType(type) ? { onPointerDown: handleSwitchDown, onClick: handleSwitchClick, onPointerMove: handleSwitchMove, onPointerOut: handleSwitchOut } : {})}>
      <primitive object={model} />
      {lampVisual && (
        <>
          <GlowHalo
            color={lampVisual.color}
            on={Boolean(c.state?.on)}
            radius={lampVisual.radius}
            position={lampVisual.glowPos}
            kind="lamp"
            rise={type === 'lampLedE27' ? 0.03 : type === 'lampFluorescentE27' ? 0.22 : 0.08}
            fall={type === 'lampLedE27' ? 0.09 : 0.24}
            castLight={false}
          />
          <pointLight
            ref={lampPointLightRef}
            color={lampVisual.color}
            intensity={c.state?.on ? 0.68 * lampVisual.intensityScale : 0}
            distance={3.2 * lampVisual.intensityScale}
            decay={2}
            position={[lampVisual.glowPos[0], lampVisual.glowPos[1], lampVisual.glowPos[2] + 0.12]}
          />
        </>
      )}
    </group>
  )
}

export function LightingDevice3D(props: Props) {
  return (
    <Suspense fallback={null}>
      <LightingCadInner {...props} />
    </Suspense>
  )
}

export default LightingDevice3D
