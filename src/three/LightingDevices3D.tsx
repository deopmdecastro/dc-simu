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

function LightingCadInner({ c, x, position, interactive = true }: Props) {
  const type = c.type as LightingComponentType
  const spec = getComponentModelSpec(type)!
  const { scene } = useGLTF(spec.path)
  const { invalidate } = useThree()

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

  const rockerAngleRef = useRef(0)
  const rocker1AngleRef = useRef(0)
  const rocker2AngleRef = useRef(0)

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
      rockerAngleRef.current = c.state?.on ? -tilt : tilt
      rocker1AngleRef.current = c.state?.on1 ? -tilt : tilt
      rocker2AngleRef.current = c.state?.on2 ? -tilt : tilt
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
      const tilt = THREE.MathUtils.degToRad(SWITCH_SPECS[type].rockerTiltDeg)
      if (type === 'wallSwitchDouble') {
        const t1 = c.state?.on1 ? -tilt : tilt
        const t2 = c.state?.on2 ? -tilt : tilt
        const p1 = model.getObjectByName('lighting_rocker_1_pivot')
        const p2 = model.getObjectByName('lighting_rocker_2_pivot')
        let moved = false
        if (p1 && Math.abs(t1 - rocker1AngleRef.current) > 0.001) {
          rocker1AngleRef.current += (t1 - rocker1AngleRef.current) * Math.min(1, dt * 22)
          p1.rotation.x = rocker1AngleRef.current
          moved = true
        }
        if (p2 && Math.abs(t2 - rocker2AngleRef.current) > 0.001) {
          rocker2AngleRef.current += (t2 - rocker2AngleRef.current) * Math.min(1, dt * 22)
          p2.rotation.x = rocker2AngleRef.current
          moved = true
        }
        if (moved) invalidate()
      } else {
        const target = c.state?.on ? -tilt : tilt
        const p = model.getObjectByName('lighting_rocker_pivot')
        if (p && Math.abs(target - rockerAngleRef.current) > 0.001) {
          rockerAngleRef.current += (target - rockerAngleRef.current) * Math.min(1, dt * 22)
          p.rotation.x = rockerAngleRef.current
          invalidate()
        }
      }
    }
  })

  const handleSwitchClick = (e: ThreeEvent<MouseEvent>) => {
    if (!isLightingSwitchType(type)) return
    if (!interactive || c.locked || useSimStore.getState().tool !== 'select') return
    e.stopPropagation()
    const store = useSimStore.getState()
    if (!isManobraAllowed(store)) {
      store.selectComponents([c.id])
      return
    }
    const current = store.components.find((item) => item.id === c.id) ?? c
    if (type === 'wallSwitchDouble') {
      // Identifica tecla 1 (esquerda) vs tecla 2 (direita) pelo nó atingido ou coordenada local X
      let hitKey: 1 | 2 | null = null
      let cur: THREE.Object3D | null = e.object
      while (cur) {
        if (cur.name.includes('rocker_1')) { hitKey = 1; break }
        if (cur.name.includes('rocker_2')) { hitKey = 2; break }
        cur = cur.parent
      }
      if (!hitKey) {
        const localPt = model.worldToLocal(e.point.clone())
        hitKey = localPt.x < 0 ? 1 : 2
      }
      if (hitKey === 1) {
        const next = !current.state.on1
        store.operateComponent(c.id, { on1: next })
        store.pushEvent('info', `${c.ref} (Tecla 1): ${next ? 'Ligado (L–1)' : 'Desligado'}.`)
      } else {
        const next = !current.state.on2
        store.operateComponent(c.id, { on2: next })
        store.pushEvent('info', `${c.ref} (Tecla 2): ${next ? 'Ligado (L–2)' : 'Desligado'}.`)
      }
    } else if (type === 'wallSwitchStaircase') {
      const next = !current.state.on
      store.operateComponent(c.id, { on: next })
      store.pushEvent('info', `${c.ref} (Comutador): ${next ? 'Posição 2 (L–2)' : 'Posição 1 (L–1)'}.`)
    } else {
      const next = !current.state.on
      store.operateComponent(c.id, { on: next })
      store.pushEvent('info', `${c.ref}: ${next ? 'Ligado (ON)' : 'Desligado (OFF)'}.`)
    }
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
    <group position={position ?? [x, 0, 0]} onClick={isLightingSwitchType(type) ? handleSwitchClick : undefined}>
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
