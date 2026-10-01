import * as THREE from 'three'
import type { TerminalDef, Vec3 } from '../../catalog/types'

/**
 * Traçado dos cabos de teste (em mm). Mesma lógica do Painel 3D do simulador: o cabo sai do borne pela
 * normal da face, segue os pontos largados pelo utilizador e entra no borne de destino (ou termina numa ponta livre).
 */
export type WireEnds = { a: string | null; b: string | null; start?: Vec3; end?: Vec3; points: Vec3[] }

/** Raio do cabo em mm. */
export const WIRE_RADIUS_MM = 0.7
const MIN_STUB_MM = 4

const vec = (p: Vec3) => new THREE.Vector3(p[0], p[1], p[2])

/** Posições de controlo do cabo (pontas incluídas); null se alguma ponta não existir. */
export function wireChain(terminals: TerminalDef[], wire: WireEnds, cursor?: Vec3): THREE.Vector3[] | null {
  const from = wire.a ? terminals.find((item) => item.id === wire.a) : undefined
  const to = wire.b ? terminals.find((item) => item.id === wire.b) : undefined
  const startPos = from ? vec(from.position) : wire.start ? vec(wire.start) : null
  const endPos = to ? vec(to.position) : wire.end ? vec(wire.end) : cursor ? vec(cursor) : null
  if (!startPos || !endPos) return null
  const direct = wire.points.length === 0
  const stub = direct ? Math.max(MIN_STUB_MM, startPos.distanceTo(endPos) * 0.18) : MIN_STUB_MM
  const chain: THREE.Vector3[] = [startPos]
  if (from) chain.push(startPos.clone().addScaledVector(vec(from.normal).normalize(), stub))
  for (const point of wire.points) chain.push(vec(point))
  if (to) chain.push(endPos.clone().addScaledVector(vec(to.normal).normalize(), stub))
  chain.push(endPos)
  return chain
}

/** Curva do cabo: Catmull-Rom (suave) ou segmentos retos; null se degenerar. */
export function wireCurve(chain: THREE.Vector3[] | null, smooth: boolean): THREE.Curve<THREE.Vector3> | null {
  if (!chain) return null
  const clean = chain.filter((point, index) => index === 0 || point.distanceTo(chain[index - 1]) > 1e-3)
  if (clean.length < 2) return null
  if (smooth && clean.length > 2) return new THREE.CatmullRomCurve3(clean, false, 'centripetal', 0.5)
  const path = new THREE.CurvePath<THREE.Vector3>()
  for (let index = 1; index < clean.length; index += 1) path.add(new THREE.LineCurve3(clean[index - 1], clean[index]))
  return path
}

/** Etiqueta curta de uma ponta («1» ou «livre»). */
export function endLabel(terminals: TerminalDef[], id: string | null): string {
  return id ? terminals.find((item) => item.id === id)?.label ?? '?' : 'livre'
}
