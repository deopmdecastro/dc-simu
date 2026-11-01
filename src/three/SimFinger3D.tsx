/**
 * Dedo 3D da simulação: em RUN substitui o cursor sobre o painel 3D. Segue a superfície sob
 * o rato (ou um plano à profundidade do alvo da câmara, no vazio), aproxima-se do lado da
 * câmara, como uma mão a operar o quadro, e avança ao premir.
 *
 * É só visual: as malhas não intercetam raios, por isso o clique continua a chegar ao botão,
 * disjuntor ou cabo que está por baixo.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { PANEL_UNITS_PER_MM } from './modelPaths'

const U = PANEL_UNITS_PER_MM
const SKIN = '#e9b48f'
const SKIN_SHADE = '#d79c76'
const NAIL = '#f6dcd0'
/** Folga entre a ponta do dedo e a superfície, em repouso e ao premir (mm). */
const HOVER_GAP_MM = 7
const PRESS_GAP_MM = -1.5
const noRaycast = () => null
/** Comprimento do dedo + punho no modelo (mm) e tamanho mínimo no ecrã (px), como um cursor. */
const MODEL_LENGTH_MM = 92
const MIN_SCREEN_PX = 105

/** Falange como cápsula ao longo de +Z local, a começar em `z0`. */
function Phalanx({ z0, length, radius, color = SKIN }: { z0: number; length: number; radius: number; color?: string }) {
  return <mesh position={[0, 0, z0 + length / 2]} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast} castShadow>
    <capsuleGeometry args={[radius, Math.max(0.001, length - radius * 2), 8, 16]} />
    <meshStandardMaterial color={color} roughness={0.62} metalness={0} />
  </mesh>
}

/** Indicador estendido com a mão fechada atrás: ponta na origem, corpo ao longo de +Z local. */
function FingerModel() {
  const r = 7.6 * U
  return <group>
    <Phalanx z0={0} length={24 * U} radius={r} />
    <Phalanx z0={21 * U} length={26 * U} radius={r * 1.06} />
    <Phalanx z0={44 * U} length={30 * U} radius={r * 1.14} color={SKIN_SHADE} />
    {/* Unha na face de cima da falange distal. */}
    <mesh position={[0, r * 0.82, 9 * U]} rotation={[-Math.PI / 2 + 0.08, 0, 0]} scale={[1, 1.35, 0.32]} raycast={noRaycast}>
      <sphereGeometry args={[r * 0.62, 16, 10]} />
      <meshStandardMaterial color={NAIL} roughness={0.35} metalness={0} />
    </mesh>
    {/* Mão fechada atrás do indicador: palma alongada, nós dos dedos dobrados e polegar. */}
    <mesh position={[0, -8 * U, 72 * U]} scale={[1.05, 0.78, 1.3]} raycast={noRaycast} castShadow>
      <sphereGeometry args={[15 * U, 20, 14]} />
      <meshStandardMaterial color={SKIN_SHADE} roughness={0.66} metalness={0} />
    </mesh>
    {[-1, 0, 1].map((k) => <mesh key={k} position={[k * 8.5 * U, -15 * U, 58 * U]} raycast={noRaycast} castShadow>
      <sphereGeometry args={[6.4 * U, 14, 10]} />
      <meshStandardMaterial color={SKIN} roughness={0.62} metalness={0} />
    </mesh>)}
    <group position={[13 * U, -4 * U, 66 * U]} rotation={[0.25, -0.55, 0]}>
      <Phalanx z0={-20 * U} length={30 * U} radius={6.6 * U} />
    </group>
  </group>
}

/** Visível só com `active` (simulação em RUN/pausa) e com o rato sobre o painel 3D. */
export default function SimFinger3D({ active }: { active: boolean }) {
  const { camera, scene, gl, raycaster, invalidate, controls, size } = useThree()
  const group = useRef<THREE.Group>(null)
  const state = useRef({ visible: false, pressed: false, gap: HOVER_GAP_MM, hit: new THREE.Vector3(), normal: new THREE.Vector3(0, 0, 1), frame: 0 })
  const tmp = useMemo(() => ({ ndc: new THREE.Vector2(), plane: new THREE.Plane(), dir: new THREE.Vector3(), x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3(), up: new THREE.Vector3(), basis: new THREE.Matrix4() }), [])

  useEffect(() => {
    const dom = gl.domElement
    const st = state.current
    if (!active) { st.visible = false; if (group.current) group.current.visible = false; invalidate(); return }
    const ownedByFinger = (object: THREE.Object3D) => { for (let o: THREE.Object3D | null = object; o; o = o.parent) if (o === group.current) return true; return false }
    const shown = (object: THREE.Object3D) => {
      for (let o: THREE.Object3D | null = object; o; o = o.parent) if (!o.visible) return false
      const material = (object as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
      const first = Array.isArray(material) ? material[0] : material
      return !!first && first.visible !== false && !(first.transparent && first.opacity < 0.08)
    }
    const locate = (event: PointerEvent) => {
      const rect = dom.getBoundingClientRect()
      tmp.ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(tmp.ndc, camera)
      const hit = raycaster.intersectObjects(scene.children, true)
        .find((h) => (h.object as THREE.Mesh).isMesh && !ownedByFinger(h.object) && shown(h.object))
      if (hit) {
        st.hit.copy(hit.point)
        if (hit.face) st.normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld)
        else st.normal.copy(raycaster.ray.direction).negate()
      } else {
        // No vazio: plano perpendicular à vista à profundidade do alvo da câmara.
        const target = (controls as unknown as { target?: THREE.Vector3 } | null)?.target ?? new THREE.Vector3()
        tmp.plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(tmp.dir).negate(), target)
        if (!raycaster.ray.intersectPlane(tmp.plane, st.hit)) return
        st.normal.copy(raycaster.ray.direction).negate()
      }
      // A normal tem de olhar para a câmara (faces de trás, malhas abertas).
      if (st.normal.dot(raycaster.ray.direction) > 0) st.normal.negate()
      st.visible = true
      invalidate()
    }
    const move = (event: PointerEvent) => {
      cancelAnimationFrame(st.frame)
      st.frame = requestAnimationFrame(() => locate(event))
    }
    const down = (event: PointerEvent) => { if (event.button === 0) { st.pressed = true; locate(event) } }
    const up = () => { st.pressed = false; invalidate() }
    const leave = () => { st.visible = false; st.pressed = false; invalidate() }
    dom.addEventListener('pointermove', move)
    dom.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    dom.addEventListener('pointerleave', leave)
    return () => {
      cancelAnimationFrame(st.frame)
      dom.removeEventListener('pointermove', move)
      dom.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
      dom.removeEventListener('pointerleave', leave)
    }
  }, [active, camera, controls, gl, invalidate, raycaster, scene, tmp])

  useFrame(() => {
    const g = group.current
    const st = state.current
    if (!g) return
    g.visible = active && st.visible
    if (!g.visible) return
    // Avança/recua com suavidade; enquanto se move pede mais quadros (frameloop «demand»).
    const target = st.pressed ? PRESS_GAP_MM : HOVER_GAP_MM
    st.gap += (target - st.gap) * 0.45
    if (Math.abs(target - st.gap) > 0.05) invalidate()
    // Corpo do dedo: do ponto para a câmara, inclinado para baixo/direita como uma mão direita.
    tmp.up.set(0, 1, 0).applyQuaternion(camera.quaternion)
    tmp.x.set(1, 0, 0).applyQuaternion(camera.quaternion)
    tmp.z.copy(camera.position).sub(st.hit).normalize().multiplyScalar(0.55).add(st.normal.clone().multiplyScalar(0.45))
      .addScaledVector(tmp.x, 0.32).addScaledVector(tmp.up, -0.38).normalize()
    tmp.x.crossVectors(tmp.up, tmp.z).normalize()
    tmp.y.crossVectors(tmp.z, tmp.x).normalize()
    tmp.basis.makeBasis(tmp.x, tmp.y, tmp.z)
    g.quaternion.setFromRotationMatrix(tmp.basis)
    // Escala real de perto; de longe nunca fica menor do que um cursor (MIN_SCREEN_PX).
    const persp = camera as THREE.PerspectiveCamera
    const worldPerPx = persp.isPerspectiveCamera
      ? 2 * camera.position.distanceTo(st.hit) * Math.tan(THREE.MathUtils.degToRad(persp.fov) / 2) / (persp.zoom * size.height)
      : (((camera as THREE.OrthographicCamera).top - (camera as THREE.OrthographicCamera).bottom) / (camera as THREE.OrthographicCamera).zoom) / size.height
    const scale = Math.max(1, (MIN_SCREEN_PX * worldPerPx) / (MODEL_LENGTH_MM * U))
    g.scale.setScalar(scale)
    g.position.copy(st.hit).addScaledVector(tmp.z, st.gap * U * scale)
  })

  return <group ref={group} visible={false} name="sim-finger" userData={{ noSnapshot: true }}>
    <FingerModel />
  </group>
}
