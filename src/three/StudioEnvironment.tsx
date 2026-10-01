import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/** Ambiente de estúdio local (sem pedidos de rede): dá reflexos reais aos metais e
 * plásticos dos CAD, em vez do aspeto baço de uma cena só com luzes diretas. */
export function StudioEnvironment({ intensity = 1 }: { intensity?: number }) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const invalidate = useThree((state) => state.invalidate)
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const room = new RoomEnvironment()
    const target = pmrem.fromScene(room, 0.04)
    const previous = scene.environment
    scene.environment = target.texture
    ;(scene as THREE.Scene & { environmentIntensity?: number }).environmentIntensity = intensity
    invalidate()
    return () => {
      scene.environment = previous
      target.dispose()
      room.dispose()
      pmrem.dispose()
    }
  }, [gl, scene, intensity, invalidate])
  return null
}
