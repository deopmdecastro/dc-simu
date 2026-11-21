import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard } from '@react-three/drei'
import * as THREE from 'three'
import { Text } from './SceneText'

/** Marcador com tamanho constante no ecrã: continua visível na vista geral da fábrica. */
export default function FluidConnectionMarker3D({ active, hover, label }: { active: boolean; hover: boolean; label: string }) {
  const visual = useRef<THREE.Group>(null)
  const world = useRef(new THREE.Vector3())
  const parentScale = useRef(new THREE.Vector3())
  useFrame(({ camera, viewport, size }) => {
    const node = visual.current
    if (!node?.parent || !size.height) return
    node.parent.getWorldPosition(world.current)
    node.parent.getWorldScale(parentScale.current)
    const radius = viewport.getCurrentViewport(camera, world.current).height / size.height * (active ? 8 : hover ? 7 : 6)
    node.scale.set(radius / Math.max(Math.abs(parentScale.current.x), 1e-6), radius / Math.max(Math.abs(parentScale.current.y), 1e-6), radius / Math.max(Math.abs(parentScale.current.z), 1e-6))
  })
  return <group ref={visual}>
    <mesh renderOrder={35}>
      <sphereGeometry args={[1, 16, 16]} />
      <meshBasicMaterial color={active ? '#16a34a' : hover ? '#38bdf8' : '#0284c7'} depthTest={false} depthWrite={false} />
    </mesh>
    <Billboard>
      <mesh renderOrder={36} raycast={() => null}>
        <torusGeometry args={[1.15, 0.16, 8, 24]} />
        <meshBasicMaterial color="#ffffff" depthTest={false} depthWrite={false} />
      </mesh>
      {(active || hover) && <Text position={[0, 2, 0]} fontSize={2} color="#0f172a" anchorX="center" anchorY="bottom" outlineWidth={0.14} outlineColor="#ffffff" depthOffset={-4}>{label}</Text>}
    </Billboard>
    <mesh><sphereGeometry args={[1.8, 10, 10]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
  </group>
}
