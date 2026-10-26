import { Text } from '@react-three/drei'
import type { ElectricalComponent } from '../types'
import { useSimStore } from '../store/useSimStore'
import { getComponentModelSpec } from './modelPaths'

/** Caixa de seis bornes IEC do motor: pontes reais Y/Δ selecionáveis. */
export default function MotorTerminalBoard3D({ c, position = [0, getComponentModelSpec('motor3ph')!.targetHeight, 0] }: { c: ElectricalComponent; position?: [number, number, number] }) {
  const connection = String(c.state.motorConnection ?? 'star')
  const xs = [-0.18, 0, 0.18]
  const zs = [-0.09, 0.09]
  const next = connection === 'none' ? 'star' : connection === 'star' ? 'delta' : 'none'
  const stud = (x: number, z: number, label: string) => <group key={label} position={[x, 0.004, z]}>
    <Text position={[0, 0, z < 0 ? -0.055 : 0.055]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.035} color="#f1f5f9" anchorX="center">{label}</Text>
  </group>
  const bar = (key: string, x: number, z: number, w: number, d: number) => <mesh key={key} position={[x, 0.008, z]}>
    <boxGeometry args={[w, 0.018, d]} /><meshStandardMaterial color="#d59f2a" metalness={0.9} roughness={0.2} /></mesh>
  return <group position={position} onClick={(event) => { event.stopPropagation(); useSimStore.getState().setComponentState(c.id, { motorConnection: next }) }}>
    {/* Os encaixes vazados pertencem à geometria comum do modelo. */}
    <mesh><boxGeometry args={[0.70, 0.002, 0.65]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
    {stud(xs[0], zs[0], 'U1')}{stud(xs[1], zs[0], 'V1')}{stud(xs[2], zs[0], 'W1')}
    {stud(xs[0], zs[1], 'W2')}{stud(xs[1], zs[1], 'U2')}{stud(xs[2], zs[1], 'V2')}
    {connection === 'star' && <>{bar('ys1', -0.09, zs[1], 0.22, 0.052)}{bar('ys2', 0.09, zs[1], 0.22, 0.052)}</>}
    {connection === 'delta' && <>{bar('d1', xs[0], 0, 0.052, 0.22)}{bar('d2', xs[1], 0, 0.052, 0.22)}{bar('d3', xs[2], 0, 0.052, 0.22)}</>}
  </group>
}
