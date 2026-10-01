import * as THREE from 'three'
import type { TerminalDef, Vec3 } from '../../catalog/types'
import type { WireEndType } from '../../types'
import { checkConnection, type CompatLevel } from '../../catalog/terminalCompat'
import { cableOuterDiameterMm, isFlatLug, isRoundEnd, wireEndLengthMm, wireRadiusMm } from './wireStyle'

/**
 * Traçado dos cabos de teste (em mm). Mesma lógica do Painel 3D do simulador: o cabo sai do borne pela
 * normal da face, segue os pontos largados pelo utilizador e entra no borne de destino (ou termina numa ponta livre).
 */
export type WireEnds = { a: string | null; b: string | null; start?: Vec3; end?: Vec3; points: Vec3[]; endA?: WireEndType; endB?: WireEndType; gauge?: string; flexibility?: 'rigid' | 'flexible' }

/** Raio do cabo em mm (pré-definição; cada cabo usa o raio da sua secção). */
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

/** Raio de dobra (mm) de um cabo rígido: cresce com o diâmetro, para as curvas parecerem condutores reais e não cantos vivos. */
export const rigidBendRadiusMm = (gauge?: string) => Math.max(5, cableOuterDiameterMm(gauge ?? '1.5mm²') * 3.2)

/** Poligonal com cantos arredondados (arco tangente a cada troço): rígido sem cantos vivos nem torção do tubo. */
function filletedPath(points: THREE.Vector3[], radius: number): THREE.CurvePath<THREE.Vector3> {
  const path = new THREE.CurvePath<THREE.Vector3>()
  let cursor = points[0]
  const line = (to: THREE.Vector3) => { if (to.distanceTo(cursor) > 1e-4) { path.add(new THREE.LineCurve3(cursor.clone(), to.clone())); cursor = to } }
  for (let index = 1; index < points.length; index += 1) {
    const corner = points[index]
    const next = points[index + 1]
    if (!next) { line(corner); break }
    const toPrev = points[index - 1].clone().sub(corner)
    const toNext = next.clone().sub(corner)
    const lenPrev = toPrev.length(), lenNext = toNext.length()
    const angle = toPrev.angleTo(toNext)
    if (lenPrev < 1e-4 || lenNext < 1e-4 || angle > Math.PI - 0.03) { line(corner); continue }
    // distância de corte pedida pelo raio; nunca mais de metade de cada troço vizinho
    const trim = Math.min(radius / Math.tan(angle / 2), lenPrev * 0.5, lenNext * 0.5)
    const start = corner.clone().addScaledVector(toPrev.normalize(), trim)
    const end = corner.clone().addScaledVector(toNext.normalize(), trim)
    line(start)
    path.add(new THREE.QuadraticBezierCurve3(start.clone(), corner.clone(), end.clone()))
    cursor = end
  }
  return path
}

/** Curva do cabo: Catmull-Rom (flexível), segmentos com curvas de dobra (rígido, `bendMm` > 0) ou retos; null se degenerar. */
export function wireCurve(chain: THREE.Vector3[] | null, smooth: boolean, bendMm = 0): THREE.Curve<THREE.Vector3> | null {
  if (!chain) return null
  const clean = chain.filter((point, index) => index === 0 || point.distanceTo(chain[index - 1]) > 1e-3)
  if (clean.length < 2) return null
  if (smooth && clean.length > 2) return new THREE.CatmullRomCurve3(clean, false, 'centripetal', 0.5)
  if (!smooth && bendMm > 0 && clean.length > 2) return filletedPath(clean, bendMm)
  const path = new THREE.CurvePath<THREE.Vector3>()
  for (let index = 1; index < clean.length; index += 1) path.add(new THREE.LineCurve3(clean[index - 1], clean[index]))
  return path
}

/** Etiqueta curta de uma ponta («1» ou «livre»). */
export function endLabel(terminals: TerminalDef[], id: string | null): string {
  return id ? terminals.find((item) => item.id === id)?.label ?? '?' : 'livre'
}

/* ------------------------------------------------------------ terminações das pontas */

/** Terminação de uma ponta (ponteira, olhal…): pose em mm, pronta para o desenho. */
export interface WireEndFit { type: WireEndType; origin: Vec3; axis: Vec3; normal: Vec3; embedMm: number; lengthMm: number }
export interface WireModel { chain: THREE.Vector3[]; ends: [WireEndFit, WireEndFit]; radiusMm: number; curve: THREE.Curve<THREE.Vector3> | null; endLengthMm: number }

const arr = (point: THREE.Vector3): Vec3 => [point.x, point.y, point.z]

/** Calcula a pose da terminação e o ponto onde o cabo isolado começa. */
function fitEnd(tip: THREE.Vector3, normal: THREE.Vector3 | null, type: WireEndType, toward: THREE.Vector3): { fit: WireEndFit; head: THREE.Vector3; axis: THREE.Vector3 } {
  const toWire = toward.clone().sub(tip)
  const dir = toWire.lengthSq() > 1e-8 ? toWire.clone().normalize() : new THREE.Vector3(0, 1, 0)
  const flat = isFlatLug(type)
  let axis = dir.clone()
  if (normal) {
    if (flat) {
      const projected = dir.clone().addScaledVector(normal, -dir.dot(normal))
      axis = projected.lengthSq() > 1e-6 ? projected.normalize() : new THREE.Vector3().crossVectors(normal, new THREE.Vector3(0, 1, 0))
      if (axis.lengthSq() < 0.5) axis = new THREE.Vector3(1, 0, 0)
      axis.normalize()
    } else axis = normal.clone()
  }
  const thick = normal && flat ? normal.clone() : new THREE.Vector3(0, 0, 1).addScaledVector(axis, -axis.z)
  if (thick.lengthSq() < 1e-6) thick.set(0, 1, 0).addScaledVector(axis, -axis.y)
  thick.normalize()
  const embedMm = normal && !flat && isRoundEnd(type) ? 3 : 0
  const lengthMm = Math.max(0.1, wireEndLengthMm(type) - embedMm)
  const origin = tip.clone().addScaledVector(normal && flat ? normal : new THREE.Vector3(), 0.4)
  const head = origin.clone().addScaledVector(axis, lengthMm)
  return { fit: { type, origin: arr(origin), axis: arr(axis), normal: arr(thick), embedMm, lengthMm }, head, axis }
}

/** Traçado completo do cabo: terminações nas pontas, saída pela normal, pontos do utilizador e curva. */
export function wireModel(terminals: TerminalDef[], wire: WireEnds, cursor?: Vec3): WireModel | null {
  const from = wire.a ? terminals.find((item) => item.id === wire.a) : undefined
  const to = wire.b ? terminals.find((item) => item.id === wire.b) : undefined
  const startPos = from ? vec(from.position) : wire.start ? vec(wire.start) : null
  const endPos = to ? vec(to.position) : wire.end ? vec(wire.end) : cursor ? vec(cursor) : null
  if (!startPos || !endPos) return null
  const points = wire.points.map(vec)
  const direct = points.length === 0
  const stub = direct ? Math.max(MIN_STUB_MM, startPos.distanceTo(endPos) * 0.18) : MIN_STUB_MM
  const fromNormal = from ? vec(from.normal).normalize() : null
  const toNormal = to ? vec(to.normal).normalize() : null
  const a = fitEnd(startPos, fromNormal, wire.endA ?? 'none', points[0] ?? (toNormal ? endPos.clone().addScaledVector(toNormal, stub) : endPos))
  const b = fitEnd(endPos, toNormal, wire.endB ?? 'none', points[points.length - 1] ?? (fromNormal ? startPos.clone().addScaledVector(fromNormal, stub) : startPos))
  const chain = [a.head, a.head.clone().addScaledVector(a.axis, stub), ...points, b.head.clone().addScaledVector(b.axis, stub), b.head]
  const radiusMm = wireRadiusMm(wire.gauge ?? '1.5mm²')
  return { chain, ends: [a.fit, b.fit], radiusMm, curve: wireCurve(chain, wire.flexibility !== 'rigid', rigidBendRadiusMm(wire.gauge)), endLengthMm: a.fit.lengthMm + a.fit.embedMm + b.fit.lengthMm + b.fit.embedMm }
}

export interface WireVerdict { lengthMm: number; level: CompatLevel; messages: string[] }
/** Comprimento total (pontas incluídas) e veredicto de compatibilidade, sempre calculados a partir dos bornes atuais. */
export function evaluateWire(terminals: TerminalDef[], wire: WireEnds): WireVerdict {
  const model = wireModel(terminals, wire)
  const lengthMm = model?.curve ? Math.round(model.curve.getLength() + model.endLengthMm) : 0
  const a = wire.a ? terminals.find((item) => item.id === wire.a) : undefined
  const b = wire.b ? terminals.find((item) => item.id === wire.b) : undefined
  if (a && b) { const result = checkConnection(a, b); return { lengthMm, level: result.level, messages: result.messages } }
  if (wire.a && !a || wire.b && !b) return { lengthMm, level: 'error', messages: ['Borne removido: religue este cabo'] }
  return { lengthMm, level: 'warn', messages: ['Ponta livre: sem validação de compatibilidade'] }
}

/** Posição (na lista de pontos do utilizador) onde um novo ponto deve entrar para o ponto dado do traçado. */
export function insertIndexFor(chain: THREE.Vector3[], pointCount: number, point: THREE.Vector3): number {
  let best = 0
  let bestDistance = Infinity
  for (let index = 0; index < chain.length - 1; index += 1) {
    const closest = new THREE.Line3(chain[index], chain[index + 1]).closestPointToPoint(point, true, new THREE.Vector3())
    const distance = closest.distanceTo(point)
    if (distance < bestDistance) { bestDistance = distance; best = index }
  }
  return Math.max(0, Math.min(pointCount, best - 1))
}
