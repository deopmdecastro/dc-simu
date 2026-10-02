import { Text } from '@react-three/drei'
import type { ElectricalComponent } from '../types'
import { useSimStore } from '../store/useSimStore'

/** Caixa de seis bornes IEC do motor: pontes reais Y/Δ selecionáveis. */
export default function MotorTerminalBoard3D({ c, position = [0, 0.51, 0.08] }: { c: ElectricalComponent; position?: [number, number, number] }) {
  const connection = String(c.state.motorConnection ?? 'star')
  const xs = [-0.18, 0, 0.18]
  const zs = [-0.09, 0.09]
  const next = connection === 'none' ? 'star' : connection === 'star' ? 'delta' : 'none'
  const stud = (x: number, z: number, label: string) => <group key={label} position={[x, 0.035, z]}>
    <mesh><cylinderGeometry args={[0.032, 0.032, 0.06, 16]} /><meshStandardMaterial color="#c79532" metalness={0.8} roughness={0.24} /></mesh>
    <mesh position={[0, 0.035, 0]}><cylinderGeometry args={[0.052, 0.052, 0.025, 6]} /><meshStandardMaterial color="#d5a743" metalness={0.84} roughness={0.2} /></mesh>
    <Text position={[0, 0.06, z < 0 ? -0.055 : 0.055]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.035} color="#111827" anchorX="center">{label}</Text>
  </group>
  const bar = (key: string, x: number, z: number, w: number, d: number) => <mesh key={key} position={[x, 0.077, z]}>
    <boxGeometry args={[w, 0.018, d]} /><meshStandardMaterial color="#d59f2a" metalness={0.9} roughness={0.2} /></mesh>
  return <group position={position} onClick={(event) => { event.stopPropagation(); useSimStore.getState().setComponentState(c.id, { motorConnection: next }) }}>
    <mesh><boxGeometry args={[0.52, 0.035, 0.31]} /><meshStandardMaterial color="#c9b99f" roughness={0.55} /></mesh>
    {stud(xs[0], zs[0], 'U1')}{stud(xs[1], zs[0], 'V1')}{stud(xs[2], zs[0], 'W1')}
    {stud(xs[0], zs[1], 'W2')}{stud(xs[1], zs[1], 'U2')}{stud(xs[2], zs[1], 'V2')}
    {connection === 'star' && <>{bar('ys1', -0.09, zs[1], 0.22, 0.052)}{bar('ys2', 0.09, zs[1], 0.22, 0.052)}</>}
    {connection === 'delta' && <>{bar('d1', xs[0], 0, 0.052, 0.22)}{bar('d2', xs[1], 0, 0.052, 0.22)}{bar('d3', xs[2], 0, 0.052, 0.22)}</>}
  </group>
}
