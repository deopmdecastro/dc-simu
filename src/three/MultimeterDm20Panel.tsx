import { useEffect, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { ElectricalComponent } from '../types'
import { triggerControl, useCatalogMeter } from '../catalog/runtimeControls'
import type { ComponentDefinition, ControlDef } from '../catalog/types'

const selector: ControlDef = {
  id: 'dm20-selector', name: 'Seletor de função', kind: 'selector', partId: 'dm20', nodes: [], axis: [0, 0, -1], travelMm: 0,
  bindVar: 'dial', actions: [], positions: [
    { id: 'off', label: 'OFF', angle: -52 }, { id: 'acv', label: 'V ~', angle: -22 }, { id: 'dcv', label: 'V ⎓', angle: 0 },
    { id: 'ma', label: 'mA', angle: 68 }, { id: 'a10', label: '10 A', angle: 93 }, { id: 'ohm', label: 'Ω', angle: -112 },
  ],
}
const button = (id: string, event: 'select' | 'power' | 'hold'): ControlDef => ({ id, name: id, kind: 'button', partId: 'dm20', nodes: [], axis: [0, 0, 1], travelMm: 1, bindVar: '', positions: [], actions: [{ type: 'behavior', event }] })
const selectButton = button('dm20-select', 'select'), powerButton = button('dm20-power', 'power'), holdButton = button('dm20-hold', 'hold')

/** Definição funcional embutida: usa os mesmos bornes estáveis da biblioteca. */
export const DM20_DEFINITION = {
  schemaVersion: 1, mount: 'machine', parts: [], materials: [], terminals: [], lights: [], states: [], initialState: 'base', interactions: [], assets: {},
  behavior: { type: 'multimeter', com: 'dm20-com', volt: 'dm20-volt', milliamp: 'dm20-ma', amp: 'dm20-amp' },
  controls: [selector, selectButton, powerButton, holdButton], vars: [], displays: [],
} as ComponentDefinition

export default function MultimeterDm20Panel({ component, model, interactive = true }: { component: ElectricalComponent; model?: THREE.Object3D; interactive?: boolean }) {
  const { vars, reading } = useCatalogMeter(component, DM20_DEFINITION)
  const [pressed, setPressed] = useState('')
  const canvas = useMemo(() => { const c = document.createElement('canvas'); c.width = 320; c.height = 150; return c }, [])
  const texture = useMemo(() => { const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; return t }, [canvas])
  useEffect(() => {
    const ctx = canvas.getContext('2d')!; const on = reading?.on ?? false
    ctx.fillStyle = on ? (reading?.backlight ? '#9fdbad' : '#bdc8b2') : '#303b32'; ctx.fillRect(0, 0, 320, 150)
    if (on) {
      ctx.fillStyle = '#172018'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.font = 'bold 72px monospace'; ctx.fillText(`${reading?.negative ? '-' : ''}${reading?.text ?? ''}`, 265, 78)
      ctx.font = 'bold 25px sans-serif'; ctx.fillText(reading?.unit ?? '', 310, 35)
      ctx.textAlign = 'left'; ctx.font = 'bold 17px sans-serif'; ctx.fillText(reading?.ac ? 'AC' : reading?.dc ? 'DC' : '', 10, 25)
      if (reading?.hold) ctx.fillText('HOLD', 10, 132)
      if (reading?.continuity) ctx.fillText('•)))', 245, 132)
    }
    texture.needsUpdate = true
  }, [canvas, texture, reading])
  useEffect(() => () => texture.dispose(), [texture])
  const dialAngle = selector.positions.find((p) => p.id === String(vars.dial ?? 'off'))?.angle ?? -52
  useEffect(() => {
    if (!model) return
    // O seletor do GLB é composto pelo corpo preto (Plane008) e pelos
    // ponteiros amarelos (Plane010). Ambos rodam juntos à volta do centro
    // mecânico real; os nós têm origem no zero do CAD, não no próprio botão.
    const angle = ((dialAngle + 52) * Math.PI) / 180
    const pivot = new THREE.Vector2(0, -0.08)
    const rotatePart = (name: string) => {
      const part = model.getObjectByName(name)
      if (!part) return
      part.userData.dm20BaseRotation ??= part.rotation.z
      part.userData.dm20BaseX ??= part.position.x
      part.userData.dm20BaseY ??= part.position.y
      const rotated = pivot.clone().rotateAround(new THREE.Vector2(0, 0), angle)
      part.position.x = Number(part.userData.dm20BaseX) + pivot.x - rotated.x
      part.position.y = Number(part.userData.dm20BaseY) + pivot.y - rotated.y
      part.rotation.z = Number(part.userData.dm20BaseRotation) + angle
      part.updateMatrixWorld(true)
    }
    rotatePart('occurrence_of_Plane008_Material004_0')
    rotatePart('occurrence_of_Plane010_Material003_0')
  }, [model, dialAngle])
  /**
   * Caixa de uma peça do GLB no referencial deste painel (o pai comum do modelo e das áreas de clique).
   * O modelo tanto é ajustado pela base (biblioteca) como pelo centro (painel 3D, pivô central): medir as
   * peças reais mantém o LCD, o seletor e as teclas alinhados nos dois casos — com posições fixas, no
   * modelo centrado as áreas ficavam 0,92 acima (o seletor caía no LCD e as teclas fora do aparelho).
   */
  const partBox = (name: string): THREE.Box3 | null => {
    const part = model?.getObjectByName(name)
    if (!model || !part) return null
    model.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(part, true)
    if (model.parent) box.applyMatrix4(model.parent.matrixWorld.clone().invert())
    return box.isEmpty() ? null : box
  }
  const lcdFit = useMemo(() => {
    const box = partBox('occurrence_of_Cube002_Material008_0')
    if (!box) return { position: [0, 1.49, 0.102] as [number, number, number], size: [0.6, 0.32] as [number, number] }
    const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3())
    // Quatro milésimos à frente do vidro: visualmente colado, sem z-fighting.
    return { position: [center.x, center.y, box.max.z + 0.004] as [number, number, number], size: [size.x, size.y] as [number, number] }
  }, [model])
  /** Áreas de clique sobre as peças reais: seletor (corpo preto) e teclas SELECT / OFF / HOLD. */
  const controlFit = useMemo(() => {
    const at = (name: string, fallback: [number, number, number], fallbackRadius: number) => {
      const box = partBox(name)
      if (!box) return { position: fallback, radius: fallbackRadius }
      const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3())
      return { position: [center.x, center.y, box.max.z + 0.01] as [number, number, number], radius: Math.max(size.x, size.y) / 2 * 1.08 }
    }
    return {
      dial: at('occurrence_of_Plane008_Material004_0', [0, 0.67, 0.18], 0.21),
      sel: at('occurrence_of_Plane004_Material003_0', [-0.22, 1.14, 0.18], 0.075),
      off: at('occurrence_of_Plane002_Material002_0', [0, 1.14, 0.18], 0.075),
      hold: at('occurrence_of_Plane003_Material007_0', [0.22, 1.14, 0.18], 0.075),
    }
  }, [model])
  const physicalButtons = useMemo(() => {
    const buttons = {
      sel: model?.getObjectByName('occurrence_of_Plane004_Material003_0'),
      off: model?.getObjectByName('occurrence_of_Plane002_Material002_0'),
      hold: model?.getObjectByName('occurrence_of_Plane003_Material007_0'),
    }
    // Teclas e seletor movem-se: ficam fora da junção estática de malhas (procuram-se pelo nome).
    for (const part of Object.values(buttons)) if (part) part.userData.dcNoMerge = true
    for (const name of ['occurrence_of_Plane008_Material004_0', 'occurrence_of_Plane010_Material003_0', 'occurrence_of_Cube002_Material008_0']) {
      const part = model?.getObjectByName(name)
      if (part) part.userData.dcNoMerge = true
    }
    return buttons
  }, [model])
  useFrame((_, delta) => {
    for (const [id, part] of Object.entries(physicalButtons)) {
      if (!part) continue
      part.userData.dm20ButtonBaseZ ??= part.position.z
      const target = Number(part.userData.dm20ButtonBaseZ) + (pressed === id ? -0.0018 : 0)
      part.position.z = THREE.MathUtils.damp(part.position.z, target, 30, delta)
      part.updateMatrixWorld(true)
    }
  })
  const act = (control: ControlDef, gesture: 'press' | { step: 1 | -1 }) => triggerControl(DM20_DEFINITION, component.id, control, gesture)
  const hit = (id: 'sel' | 'off' | 'hold', control: ControlDef) => <mesh name={`dm20-${id}-hit`} position={controlFit[id].position} userData={{ presentationOverlay: true }}
    onPointerDown={(e) => { if (!interactive) return; e.stopPropagation(); setPressed(id) }} onPointerUp={(e) => { if (!interactive) return; e.stopPropagation(); setPressed(''); act(control, 'press') }} onPointerOut={() => setPressed('')}>
    <circleGeometry args={[controlFit[id].radius, 20]} /><meshStandardMaterial transparent opacity={pressed === id ? 0.35 : 0.03} color="#94a3b8" /></mesh>
  return <group>
    {/* Tamanho e posição vêm diretamente da caixa do vidro LCD no próprio GLB. */}
    <mesh position={lcdFit.position} renderOrder={4}><planeGeometry args={lcdFit.size} /><meshBasicMaterial map={texture} toneMapped={false} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} /></mesh>
    <mesh position={controlFit.dial.position} userData={{ presentationOverlay: true }} name="dm20-dial-hit" onPointerDown={(e) => { if (!interactive) return; e.stopPropagation(); act(selector, { step: e.shiftKey ? -1 : 1 }) }}>
      <circleGeometry args={[controlFit.dial.radius, 28]} /><meshBasicMaterial transparent opacity={0.025} depthWrite={false} />
    </mesh>
    {hit('sel', selectButton)}{hit('off', powerButton)}{hit('hold', holdButton)}
  </group>
}
