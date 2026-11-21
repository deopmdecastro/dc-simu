import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { ElectricalComponent } from '../types'
import { PANEL_UNITS_PER_MM } from './modelPaths'
import { cableTrayDimsOf } from './structuresModel'

const U = PANEL_UNITS_PER_MM

/** Material metálico aço eletrozincado brilhante (Cablofil / OBO GR-Magic, fiel a image-44.png) */
const WIRE_MAT = { color: '#d7dde4', metalness: 0.88, roughness: 0.24 } as const
const BRACKET_MAT = { color: '#aeb7c2', metalness: 0.78, roughness: 0.34 } as const
const CLIP_MAT = { color: '#94a3b8', metalness: 0.84, roughness: 0.28 } as const

/** Constrói um aro transversal em U com cantos inferiores arredondados e borda de segurança superior (fiel a image-44.png) */
function makeURibGeometry(width: number, sideH: number, wireR: number): THREE.TubeGeometry {
  const hw = width / 2
  const botY = -sideH / 2
  const topY = sideH / 2
  const cr = Math.min(width * 0.14, sideH * 0.26, 0.12)
  const pts = [
    new THREE.Vector3(0, topY, -hw - wireR * 1.1),
    new THREE.Vector3(0, topY, -hw),
    new THREE.Vector3(0, botY + cr, -hw),
    new THREE.Vector3(0, botY + cr * 0.28, -hw + cr * 0.28),
    new THREE.Vector3(0, botY, -hw + cr),
    new THREE.Vector3(0, botY, hw - cr),
    new THREE.Vector3(0, botY + cr * 0.28, hw - cr * 0.28),
    new THREE.Vector3(0, botY + cr, hw),
    new THREE.Vector3(0, topY, hw),
    new THREE.Vector3(0, topY, hw + wireR * 1.1),
  ]
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.18)
  return new THREE.TubeGeometry(curve, 24, wireR, 8, false)
}

/** Suporte consola de parede em L ou trapézio suspenso no teto com varões roscados M8 */
function WireTrayMountAccessory({
  mode,
  xPositions,
  width,
  sideH,
}: {
  mode: 'none' | 'wall-console' | 'ceiling-trapeze'
  xPositions: number[]
  width: number
  sideH: number
}) {
  if (mode === 'none') return null
  const botY = -sideH / 2 - 0.045
  return (
    <group>
      {xPositions.map((xp, i) =>
        mode === 'wall-console' ? (
          <group key={i} position={[xp, botY, 0]}>
            {/* Braço horizontal da consola */}
            <mesh position={[0, -0.04, 0]} castShadow>
              <boxGeometry args={[0.14, 0.08, width + 0.18]} />
              <meshStandardMaterial {...BRACKET_MAT} />
            </mesh>
            {/* Placa vertical aparafusada à parede traseira */}
            <mesh position={[0, -0.22, -width / 2 - 0.10]} castShadow>
              <boxGeometry args={[0.18, 0.56, 0.06]} />
              <meshStandardMaterial {...BRACKET_MAT} />
            </mesh>
            {/* Escora diagonal de reforço */}
            <mesh position={[0, -0.22, -width * 0.26]} rotation={[0.62, 0, 0]}>
              <boxGeometry args={[0.06, 0.06, width * 0.52]} />
              <meshStandardMaterial {...BRACKET_MAT} />
            </mesh>
          </group>
        ) : (
          <group key={i} position={[xp, botY, 0]}>
            {/* Perfil C inferior do trapézio */}
            <mesh position={[0, -0.04, 0]} castShadow>
              <boxGeometry args={[0.14, 0.09, width + 0.34]} />
              <meshStandardMaterial {...BRACKET_MAT} />
            </mesh>
            {/* 2 varões roscados M8 verticais até ao teto + porcas sextavadas */}
            {[-width / 2 - 0.12, width / 2 + 0.12].map((rz, rIdx) => (
              <group key={rIdx} position={[0, 0.72, rz]}>
                <mesh castShadow>
                  <cylinderGeometry args={[0.022, 0.022, 1.62, 10]} />
                  <meshStandardMaterial color="#cbd5e1" metalness={0.88} roughness={0.28} />
                </mesh>
                <mesh position={[0, -0.78, 0]}>
                  <cylinderGeometry args={[0.048, 0.048, 0.05, 6]} />
                  <meshStandardMaterial color="#94a3b8" metalness={0.85} roughness={0.3} />
                </mesh>
              </group>
            ))}
          </group>
        ),
      )}
    </group>
  )
}

/** Placa curva de saída de cabos (Drop-out / Cascata) protegendo o raio de curvatura */
function WireTrayDropOutPlate({ width, sideH }: { width: number; sideH: number }) {
  const dropGeom = useMemo(() => {
    const pts = [
      new THREE.Vector3(0, -sideH / 2 + 0.02, width / 2 - 0.06),
      new THREE.Vector3(0, -sideH / 2 + 0.01, width / 2 + 0.14),
      new THREE.Vector3(0, -sideH / 2 - 0.16, width / 2 + 0.28),
      new THREE.Vector3(0, -sideH / 2 - 0.42, width / 2 + 0.30),
    ]
    const shape = new THREE.Shape()
    shape.moveTo(-0.32, 0)
    shape.lineTo(0.32, 0)
    shape.lineTo(0.32, 0.04)
    shape.lineTo(-0.32, 0.04)
    shape.closePath()
    const curve = new THREE.CatmullRomCurve3(pts)
    return new THREE.TubeGeometry(curve, 16, 0.024, 6, false)
  }, [width, sideH])
  useEffect(() => () => dropGeom.dispose(), [dropGeom])

  return (
    <group>
      {[-0.22, -0.11, 0, 0.11, 0.22].map((ox, i) => (
        <mesh key={i} position={[ox, 0, 0]} geometry={dropGeom} castShadow>
          <meshStandardMaterial {...BRACKET_MAT} />
        </mesh>
      ))}
      <mesh position={[0, -sideH / 2 - 0.12, width / 2 + 0.23]} rotation={[0.55, 0, 0]} castShadow>
        <boxGeometry args={[0.64, 0.03, 0.42]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.72} roughness={0.32} />
      </mesh>
    </group>
  )
}

/** Clipes rápidos de união metálica (emenda Cablofil EDR / GR-Magic) */
function WireTrayCouplerClips({ xPos, width, sideH }: { xPos: number; width: number; sideH: number }) {
  return (
    <group position={[xPos, 0, 0]}>
      {[-width / 2, width / 2].map((zSide, idx) => (
        <mesh key={idx} position={[0, sideH * 0.12, zSide + (zSide > 0 ? 0.025 : -0.025)]} castShadow>
          <boxGeometry args={[0.24, 0.095, 0.045]} />
          <meshStandardMaterial {...CLIP_MAT} />
        </mesh>
      ))}
    </group>
  )
}

// ============================================================================
// 1. ESTEIRA ARAMADA RETA — CABLOFIL / OBO GR-MAGIC (fiel a image-44.png)
// ============================================================================

export function WireTrayStraight3D({
  c,
  position,
}: {
  c: ElectricalComponent
  position: [number, number, number]
}) {
  const d = cableTrayDimsOf('wireTrayStraight', c.state)
  const L = d.lengthMm * U
  const W = d.widthMm * U
  const H = d.sideHeightMm * U
  const wireR = 2.6 * U
  const mountBracket = (c.state.mountBracket === 'wall-console' || c.state.mountBracket === 'ceiling-trapeze'
    ? c.state.mountBracket
    : 'none') as 'none' | 'wall-console' | 'ceiling-trapeze'
  const dropOutPlate = Boolean(c.state.dropOutPlate)
  const couplerClips = c.state.couplerClips !== false

  const ribGeom = useMemo(() => makeURibGeometry(W, H, wireR), [W, H, wireR])
  useEffect(() => () => ribGeom.dispose(), [ribGeom])

  // Passo real de 100 mm entre aros transversais em U (malha 50×100 mm típica Cablofil)
  const ribCount = Math.max(4, Math.round(d.lengthMm / 100) + 1)
  const ribXs = useMemo(
    () => Array.from({ length: ribCount }, (_, i) => -L / 2 + (i / Math.max(1, ribCount - 1)) * L),
    [ribCount, L],
  )

  // Fios longitudinais no fundo (passo ~50 mm) + 2 fios longitudinais em cada lateral (meio + borda de segurança superior)
  const floorWireCount = Math.max(3, Math.round(d.widthMm / 50) + 1)
  const floorZs = useMemo(
    () => Array.from({ length: floorWireCount }, (_, i) => -W / 2 + 0.08 + (i / Math.max(1, floorWireCount - 1)) * Math.max(0.05, W - 0.16)),
    [floorWireCount, W],
  )
  const sideYs = H > 0.72 ? [0, H * 0.28, H / 2] : [0, H / 2]

  return (
    <group position={position} name={`wire-tray-straight-3d-${c.id}`}>
      {/* Aros transversais em U soldados */}
      {ribXs.map((rx, idx) => (
        <mesh key={idx} position={[rx, 0, 0]} geometry={ribGeom} castShadow receiveShadow>
          <meshStandardMaterial {...WIRE_MAT} />
        </mesh>
      ))}

      {/* Fios longitudinais do fundo */}
      {floorZs.map((fz, idx) => (
        <mesh key={`f-${idx}`} position={[0, -H / 2 - wireR * 0.65, fz]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[wireR, wireR, L, 8]} />
          <meshStandardMaterial {...WIRE_MAT} />
        </mesh>
      ))}

      {/* Fios longitudinais das 2 abas laterais + borda superior reforçada */}
      {[-W / 2, W / 2].map((sz, sIdx) =>
        sideYs.map((sy, yIdx) => (
          <mesh
            key={`s-${sIdx}-${yIdx}`}
            position={[0, sy, sz + (sz > 0 ? wireR * 0.65 : -wireR * 0.65)]}
            rotation={[0, 0, Math.PI / 2]}
            castShadow
          >
            <cylinderGeometry args={[wireR * (yIdx === sideYs.length - 1 ? 1.15 : 1), wireR * (yIdx === sideYs.length - 1 ? 1.15 : 1), L, 8]} />
            <meshStandardMaterial {...WIRE_MAT} />
          </mesh>
        )),
      )}

      {couplerClips && (
        <>
          <WireTrayCouplerClips xPos={-L / 2 + 0.14} width={W} sideH={H} />
          <WireTrayCouplerClips xPos={L / 2 - 0.14} width={W} sideH={H} />
        </>
      )}
      {dropOutPlate && <WireTrayDropOutPlate width={W} sideH={H} />}
      <WireTrayMountAccessory
        mode={mountBracket}
        xPositions={[-L * 0.34, L * 0.34]}
        width={W}
        sideH={H}
      />
    </group>
  )
}

// ============================================================================
// 2. CURVA HORIZONTAL 90° DE ESTEIRA ARAMADA
// ============================================================================

export function WireTrayElbow903D({
  c,
  position,
}: {
  c: ElectricalComponent
  position: [number, number, number]
}) {
  const d = cableTrayDimsOf('wireTrayElbow90', c.state)
  const W = d.widthMm * U
  const H = d.sideHeightMm * U
  const R = Math.max(W * 0.65, d.radiusMm * U)
  const wireR = 2.6 * U
  const ribGeom = useMemo(() => makeURibGeometry(W, H, wireR), [W, H, wireR])

  const arcGeoms = useMemo(() => {
    const out: THREE.TubeGeometry[] = []
    const floorWireCount = Math.max(3, Math.round(d.widthMm / 50) + 1)
    const makeArc = (radius: number, y: number) => {
      const pts: THREE.Vector3[] = []
      for (let i = 0; i <= 14; i++) {
        const a = (i / 14) * (Math.PI / 2)
        pts.push(new THREE.Vector3(Math.cos(a) * radius - R * 0.5, y, Math.sin(a) * radius - R * 0.5))
      }
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, wireR, 8, false)
    }
    for (let i = 0; i < floorWireCount; i++) {
      const r = R - W / 2 + 0.08 + (i / Math.max(1, floorWireCount - 1)) * Math.max(0.05, W - 0.16)
      out.push(makeArc(r, -H / 2 - wireR * 0.6))
    }
    for (const r of [R - W / 2, R + W / 2]) {
      out.push(makeArc(r, 0))
      out.push(makeArc(r, H / 2))
    }
    return out
  }, [W, H, R, d.widthMm, wireR])

  useEffect(() => () => {
    ribGeom.dispose()
    arcGeoms.forEach((g) => g.dispose())
  }, [ribGeom, arcGeoms])

  const ribAngles = [0, 0.25, 0.5, 0.75, 1].map((t) => t * (Math.PI / 2))

  return (
    <group position={position} name={`wire-tray-elbow90-3d-${c.id}`}>
      {arcGeoms.map((g, idx) => (
        <mesh key={idx} geometry={g} castShadow>
          <meshStandardMaterial {...WIRE_MAT} />
        </mesh>
      ))}
      {ribAngles.map((ang, idx) => (
        <mesh
          key={idx}
          position={[Math.cos(ang) * R - R * 0.5, 0, Math.sin(ang) * R - R * 0.5]}
          rotation={[0, -ang + Math.PI / 2, 0]}
          geometry={ribGeom}
          castShadow
        >
          <meshStandardMaterial {...WIRE_MAT} />
        </mesh>
      ))}
    </group>
  )
}

// ============================================================================
// 3. DERIVAÇÃO TÊ / CRUZ X DE ESTEIRA ARAMADA
// ============================================================================

export function WireTrayTee3D({
  c,
  position,
}: {
  c: ElectricalComponent
  position: [number, number, number]
}) {
  const d = cableTrayDimsOf('wireTrayTee', c.state)
  const W = d.widthMm * U
  const H = d.sideHeightMm * U
  const span = (d.widthMm + 280) * U
  const wireR = 2.6 * U
  const isCross = c.state.variant === 'cross'
  const ribGeom = useMemo(() => makeURibGeometry(W, H, wireR), [W, H, wireR])
  useEffect(() => () => ribGeom.dispose(), [ribGeom])

  const floorWireCount = Math.max(3, Math.round(d.widthMm / 50) + 1)
  const offsets = Array.from({ length: floorWireCount }, (_, i) => -W / 2 + 0.08 + (i / Math.max(1, floorWireCount - 1)) * Math.max(0.05, W - 0.16))
  const armLen = (span - W) / 2

  return (
    <group position={position} name={`wire-tray-tee-3d-${c.id}`}>
      {/* Tronco principal ao longo de X */}
      {offsets.map((oz, i) => (
        <mesh key={`mx-${i}`} position={[0, -H / 2 - wireR * 0.6, oz]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[wireR, wireR, span, 8]} />
          <meshStandardMaterial {...WIRE_MAT} />
        </mesh>
      ))}
      {/* Lateral traseira contínua (se Tê) ou dividida (se Cruz) */}
      {!isCross && [0, H / 2].map((sy, i) => (
        <mesh key={`bk-${i}`} position={[0, sy, -W / 2 - wireR * 0.6]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[wireR, wireR, span, 8]} />
          <meshStandardMaterial {...WIRE_MAT} />
        </mesh>
      ))}
      {/* Aros transversais nas extremidades do tronco X */}
      {[-span / 2 + 0.18, -W / 2 - 0.22, W / 2 + 0.22, span / 2 - 0.18].map((rx, i) => (
        <mesh key={`rx-${i}`} position={[rx, 0, 0]} geometry={ribGeom} castShadow>
          <meshStandardMaterial {...WIRE_MAT} />
        </mesh>
      ))}

      {/* Ramal frontal (+Z) e opcional traseiro (-Z se Cruz X) */}
      {(isCross ? [-1, 1] : [1]).map((dir) => (
        <group key={dir}>
          {offsets.map((ox, i) => (
            <mesh key={`bz-${i}`} position={[ox, -H / 2 - wireR * 0.6, dir * (W / 2 + armLen / 2)]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[wireR, wireR, armLen + W * 0.4, 8]} />
              <meshStandardMaterial {...WIRE_MAT} />
            </mesh>
          ))}
          {[-W / 2, W / 2].map((sx, sIdx) =>
            [0, H / 2].map((sy, yIdx) => (
              <mesh key={`bs-${sIdx}-${yIdx}`} position={[sx, sy, dir * (W / 2 + armLen / 2)]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                <cylinderGeometry args={[wireR, wireR, armLen, 8]} />
                <meshStandardMaterial {...WIRE_MAT} />
              </mesh>
            )),
          )}
          <mesh position={[0, 0, dir * (span / 2 - 0.18)]} rotation={[0, Math.PI / 2, 0]} geometry={ribGeom} castShadow>
            <meshStandardMaterial {...WIRE_MAT} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// ============================================================================
// 4. CURVA VERTICAL / SUBIDA 90° DE ESTEIRA ARAMADA (RISER)
// ============================================================================

export function WireTrayRiser903D({
  c,
  position,
}: {
  c: ElectricalComponent
  position: [number, number, number]
}) {
  const d = cableTrayDimsOf('wireTrayRiser90', c.state)
  const W = d.widthMm * U
  const H = d.sideHeightMm * U
  const R = Math.max(0.85, d.radiusMm * U)
  const wireR = 2.6 * U
  const isInterior = d.riserKind === 'interior'
  const ribGeom = useMemo(() => makeURibGeometry(W, H, wireR), [W, H, wireR])

  const arcGeoms = useMemo(() => {
    const out: THREE.TubeGeometry[] = []
    const floorWireCount = Math.max(3, Math.round(d.widthMm / 50) + 1)
    const makeVertArc = (rOff: number, z: number) => {
      const rr = Math.max(0.18, R + rOff)
      const pts: THREE.Vector3[] = []
      for (let i = 0; i <= 14; i++) {
        const a = (i / 14) * (Math.PI / 2)
        const x = Math.cos(a) * rr - R * 0.5
        const y = (isInterior ? 1 : -1) * (Math.sin(a) * rr - R * 0.5)
        pts.push(new THREE.Vector3(x, y, z))
      }
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, wireR, 8, false)
    }
    for (let i = 0; i < floorWireCount; i++) {
      const z = -W / 2 + 0.08 + (i / Math.max(1, floorWireCount - 1)) * Math.max(0.05, W - 0.16)
      out.push(makeVertArc(0, z))
    }
    const wallSign = isInterior ? -1 : 1
    for (const z of [-W / 2, W / 2]) {
      out.push(makeVertArc(wallSign * (H * 0.5), z))
      out.push(makeVertArc(wallSign * H, z))
    }
    return out
  }, [W, H, R, d.widthMm, wireR, isInterior])

  useEffect(() => () => {
    ribGeom.dispose()
    arcGeoms.forEach((g) => g.dispose())
  }, [ribGeom, arcGeoms])

  const angles = [0, 0.25, 0.5, 0.75, 1].map((t) => t * (Math.PI / 2))

  return (
    <group position={position} name={`wire-tray-riser90-3d-${c.id}`}>
      {arcGeoms.map((g, idx) => (
        <mesh key={idx} geometry={g} castShadow>
          <meshStandardMaterial {...WIRE_MAT} />
        </mesh>
      ))}
      {angles.map((ang, idx) => {
        const x = Math.cos(ang) * R - R * 0.5
        const y = (isInterior ? 1 : -1) * (Math.sin(ang) * R - R * 0.5)
        return (
          <mesh
            key={idx}
            position={[x, y, 0]}
            rotation={[0, 0, isInterior ? ang + Math.PI / 2 : -ang - Math.PI / 2]}
            geometry={ribGeom}
            castShadow
          >
            <meshStandardMaterial {...WIRE_MAT} />
          </mesh>
        )
      })}
    </group>
  )
}
