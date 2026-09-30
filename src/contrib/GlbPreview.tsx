import { Component, Suspense, useEffect, useMemo, type ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { cloneModelScene } from '../three/modelFit'

export interface GlbDimensions {
  /** Dimensões da caixa exata (vértices) na unidade do ficheiro. */
  raw: [number, number, number]
  /** Estimativa em mm: o glTF é em metros, mas muitos CAD exportam em mm (heurística pela maior dimensão). */
  mm: [number, number, number]
  unit: 'm' | 'mm'
}

export function dimensionsOf(size: THREE.Vector3): GlbDimensions {
  const raw: [number, number, number] = [size.x, size.y, size.z]
  const unit = Math.max(size.x, size.y, size.z) < 5 ? 'm' : 'mm'
  const k = unit === 'm' ? 1000 : 1
  return { raw, mm: [size.x * k, size.y * k, size.z * k], unit }
}

function Model({ url, onDimensions }: { url: string; onDimensions?: (d: GlbDimensions) => void }) {
  const { scene } = useGLTF(url)
  const { object, dims } = useMemo(() => {
    const clone = cloneModelScene(scene)
    clone.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(clone, true)
    const size = box.getSize(new THREE.Vector3())
    const fit = 2.2 / Math.max(size.x, size.y, size.z, 1e-6)
    clone.scale.setScalar(fit)
    clone.updateMatrixWorld(true)
    const fitted = new THREE.Box3().setFromObject(clone, true)
    const center = fitted.getCenter(new THREE.Vector3())
    clone.position.set(-center.x, -fitted.min.y - 1.1, -center.z)
    return { object: clone, dims: dimensionsOf(size) }
  }, [scene])
  useEffect(() => { onDimensions?.(dims) }, [dims, onDimensions])
  return <primitive object={object} />
}

class Boundary extends Component<{ children: ReactNode; onError?: (message: string) => void }, { failed: string | null }> {
  state = { failed: null as string | null }
  static getDerivedStateFromError(error: unknown) { return { failed: error instanceof Error ? error.message : 'Falha ao carregar o modelo' } }
  componentDidCatch(error: unknown) { this.props.onError?.(error instanceof Error ? error.message : 'Falha ao carregar o modelo') }
  render() { return this.state.failed ? <div className="cb-preview-fail">Não foi possível pré-visualizar este GLB.<small>{this.state.failed}</small></div> : this.props.children }
}

/** Pré-visualização orbitável de um GLB (URL de blob) — usada ao enviar e ao rever. */
export default function GlbPreview({ url, onDimensions, height = 220 }: { url: string; onDimensions?: (d: GlbDimensions) => void; height?: number }) {
  useEffect(() => () => { try { useGLTF.clear(url) } catch { /* cache já limpa */ } }, [url])
  return <div className="cb-preview" style={{ height }}>
    <Boundary key={url}>
      <Canvas camera={{ position: [2.6, 1.6, 3], fov: 40 }} dpr={[1, 1.75]}>
        <color attach="background" args={['#eef2f8']} />
        <ambientLight intensity={0.75} />
        <directionalLight position={[3, 5, 4]} intensity={1.1} />
        <directionalLight position={[-4, 2, -3]} intensity={0.35} />
        <gridHelper args={[6, 12, '#c3cdda', '#dfe5ee']} position={[0, -1.1, 0]} />
        <Suspense fallback={null}><Model url={url} onDimensions={onDimensions} /></Suspense>
        <OrbitControls enablePan={false} autoRotate autoRotateSpeed={1.2} minDistance={1.5} maxDistance={9} />
      </Canvas>
    </Boundary>
  </div>
}
