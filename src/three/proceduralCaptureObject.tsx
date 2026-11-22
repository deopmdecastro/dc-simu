import { useEffect, useRef } from 'react'
import { createRoot, extend } from '@react-three/fiber'
import * as THREE from 'three'
import { createComponent } from '../electrical/factory'
import type { ComponentType } from '../types'
import { PANEL_UNITS_PER_MM } from './modelPaths'
import { isConduitStructureType, isWireMeshTrayType } from './structuresModel'
import { hasProceduralCapture } from './proceduralKinds'
import { WireTrayStraight3D, WireTrayElbow903D, WireTrayTee3D, WireTrayRiser903D } from './WireMeshTrayDevices3D'
import { ConduitVdsStraight3D, ConduitVdsElbow903D, ConduitCorrugated3D, PipeClampStandalone3D } from './ConduitDevices3D'
import { WaterFlowMeterZjLcd3D, WaterSupplyBox3D } from './HydraulicsDevices3D'
import { AirCompressor3D, PneumaticManifold3D, PneumaticTee3D, PneumaticUnion3D, PneumaticElbow3D, PneumaticY3D } from './PneumaticsDevices3D'
import { applyCadSurfaceTextures } from './cadSurface'

export { hasProceduralCapture } from './proceduralKinds'

/** A mesma geometria e os mesmos materiais do Panel3D, em milímetros para as capturas. */
function Snapshot({ type, section, ready }: { type: ComponentType; section: boolean; ready: (object: THREE.Object3D) => void }) {
  const ref = useRef<THREE.Group>(null)
  const c = createComponent(type)
  if (section && ['wireTrayStraight', 'conduitVdsStraight', 'conduitCorrugated'].includes(type)) {
    c.state = { ...c.state, lengthMm: type === 'wireTrayStraight' ? 420 : 300, clampCount: 1 }
  }
  const position: [number, number, number] = [0, 0, 0]
  const trays = { wireTrayStraight: WireTrayStraight3D, wireTrayElbow90: WireTrayElbow903D, wireTrayTee: WireTrayTee3D, wireTrayRiser90: WireTrayRiser903D }
  const Tray = trays[type as keyof typeof trays]
  useEffect(() => {
    let active = true
    void applyCadSurfaceTextures(ref.current!, { procedural: true }).then(() => {
    if (!active || !ref.current) return
    const copy = ref.current!.clone(true)
    copy.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.geometry = mesh.geometry.clone()
      const cloneMaterial = (source: THREE.Material) => {
        const material = source.clone()
        // O unmount liberta texturas procedurais; a captura tem de possuir as suas cópias.
        for (const key of Object.keys(material)) {
          const value = (material as unknown as Record<string, unknown>)[key]
          if (value instanceof THREE.Texture) {
            const texture = value.clone()
            texture.needsUpdate = true
            const properties = material as unknown as Record<string, unknown>
            properties[key] = texture
          }
        }
        return material
      }
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(cloneMaterial) : cloneMaterial(mesh.material)
      mesh.userData.structureCapture = true
    })
    copy.scale.setScalar(1 / PANEL_UNITS_PER_MM)
    copy.updateMatrixWorld(true)
    ready(copy)
    })
    return () => { active = false }
  }, [ready])
  return <group ref={ref}>
    {type === 'waterSupplyBox' ? <WaterSupplyBox3D c={c} />
      : type === 'hydraulicFlowMeter' ? <WaterFlowMeterZjLcd3D c={c} position={position} />
      : type === 'airCompressor' ? <AirCompressor3D c={c} position={position} />
      : type === 'pneumaticManifold' ? <PneumaticManifold3D c={c} position={position} />
      : type === 'pneumaticTee' ? <PneumaticTee3D c={c} position={position} />
      : type === 'pneumaticUnion' ? <PneumaticUnion3D c={c} position={position} />
      : type === 'pneumaticElbow' ? <PneumaticElbow3D c={c} position={position} />
      : type === 'pneumaticY' ? <PneumaticY3D c={c} position={position} />
      : Tray ? <Tray c={c} position={position} />
      : type === 'conduitVdsStraight' ? <ConduitVdsStraight3D component={c} />
      : type === 'conduitVdsElbow90' ? <ConduitVdsElbow903D component={c} />
      : type === 'conduitCorrugated' ? <ConduitCorrugated3D component={c} />
      : <PipeClampStandalone3D component={c} />}
  </group>
}

let root: ReturnType<typeof createRoot> | undefined
let queue: Promise<unknown> = Promise.resolve()

/** Raiz de montagem partilhada, sem animação nem renderização por cartão. */
export function createProceduralCaptureObject(type: ComponentType, section = false): Promise<THREE.Object3D> {
  if (!hasProceduralCapture(type)) return Promise.reject(new Error(`Sem captura procedural: ${type}`))
  const job = queue.then(() => new Promise<THREE.Object3D>((resolve, reject) => {
    extend(THREE)
    root ??= createRoot(document.createElement('canvas')).configure({ frameloop: 'never', dpr: 1, size: { width: 1, height: 1, top: 0, left: 0 } })
    const timer = setTimeout(() => { root!.render(null); reject(new Error(`Tempo limite da geometria: ${type}`)) }, 10000)
    root.render(<Snapshot type={type} section={section} ready={(object) => {
      clearTimeout(timer)
      root!.render(null)
      resolve(object)
    }} />)
  }))
  queue = job.catch(() => undefined)
  return job
}
