import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { ElectricalComponent } from '../types'
import { PANEL_UNITS_PER_MM } from './modelPaths'

const U = PANEL_UNITS_PER_MM

export type PipeClampStyle = 'pvc-clip' | 'metal-epdm' | 'metal-screw'

export function conduitDimsOf(state: Record<string, unknown> | undefined) {
  const s = state ?? {}
  const diameterMm = Math.max(16, Math.min(63, Number(s.diameterMm ?? 25)))
  const lengthMm = Math.max(250, Math.min(3000, Number(s.lengthMm ?? 1000)))
  const clampCount = Math.max(0, Math.min(10, Math.round(Number(s.clampCount ?? 2))))
  const clampStyleRaw = String(s.clampStyle ?? 'pvc-clip')
  const clampStyle: PipeClampStyle =
    clampStyleRaw === 'metal-epdm' || clampStyleRaw === 'metal-screw' ? clampStyleRaw : 'pvc-clip'
  const autoCouplers = s.autoCouplers !== false
  const bendAngleDeg = Math.max(0, Math.min(180, Number(s.bendAngleDeg ?? 0)))
  const clampRollDeg = (((Number(s.clampRollDeg ?? 0) || 0) % 360) + 360) % 360
  const rawColor = typeof s.corrugatedColor === 'string' && s.corrugatedColor ? s.corrugatedColor : (typeof s.color === 'string' && s.color ? s.color : '')
  const corrugatedColor = rawColor || '#1b1f26'
  return { diameterMm, lengthMm, clampCount, clampStyle, autoCouplers, bendAngleDeg, clampRollDeg, corrugatedColor }
}

/** Textura realista de serigrafia técnica branca impressa no tubo VDS cinza PVC-U (fiel a image-54.png) */
function createVdsSerigraphyTexture(diameterMm: number): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 256
  const ctx = c.getContext('2d')
  if (!ctx) return null

  // Gradiente sutil de PVC-U rígido cinzento industrial (#6a7078)
  const g = ctx.createLinearGradient(0, 0, 0, c.height)
  g.addColorStop(0, '#727880')
  g.addColorStop(0.5, '#666c74')
  g.addColorStop(1, '#5e646c')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, c.width, c.height)

  // Micro-estrias longitudinais discretas de extrusão PVC
  ctx.fillStyle = 'rgba(255,255,255,0.03)'
  for (let y = 0; y < c.height; y += 6) {
    ctx.fillRect(0, y, c.width, 1)
  }

  // Serigrafia técnica branca nítida repetida ao longo da circunferência/comprimento
  ctx.fillStyle = 'rgba(245, 248, 252, 0.88)'
  ctx.font = '700 22px "JetBrains Mono", Consolas, monospace'
  ctx.textBaseline = 'middle'
  const stamp = `VDS  Ø${diameterMm} mm  EN 61386-21  750N  PVC-U  3321  CE  •  `
  for (let row = 0; row < 2; row++) {
    const y = row === 0 ? 74 : 186
    ctx.fillText(stamp + stamp, 24, y)
  }

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 4
  tex.needsUpdate = true
  return tex
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. ABRAÇADEIRAS REALISTAS (PVC VDS · METÁLICA C/ BORRACHA EPDM · METÁLICA ESPIGÃO)
   (Fiel a image-55.png, image-57.png e image-58.png)
   ═══════════════════════════════════════════════════════════════════════════ */

/** Abraçadeira Clip PVC cinzento modular de encaixe rápido (fiel a image-55.png) */
export function PipeClampPvcMesh({ diameterMm = 25 }: { diameterMm?: number }) {
  const r = (diameterMm * 0.5) * U
  const clipW = Math.max(r * 1.15, 14 * U)
  const wallT = Math.max(r * 0.28, 3.6 * U)
  const outerR = r + wallT
  // Arco em U aberto ~235° para encaixe elástico do tubo VDS
  const arcSpan = Math.PI * 1.32
  const arcStart = -Math.PI * 0.5 - arcSpan * 0.5

  const archGeom = useMemo(() => {
    const shape = new THREE.Shape()
    const steps = 28
    for (let i = 0; i <= steps; i++) {
      const a = arcStart + (arcSpan * i) / steps
      const x = Math.cos(a) * outerR
      const y = Math.sin(a) * outerR
      if (i === 0) shape.moveTo(x, y)
      else shape.lineTo(x, y)
    }
    for (let i = steps; i >= 0; i--) {
      const a = arcStart + (arcSpan * i) / steps
      shape.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    }
    shape.closePath()
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: clipW,
      bevelEnabled: true,
      bevelThickness: 0.8 * U,
      bevelSize: 0.7 * U,
      bevelSegments: 2,
    })
    g.translate(0, 0, -clipW / 2)
    return g
  }, [r, outerR, clipW, arcStart, arcSpan])

  useEffect(() => () => archGeom.dispose(), [archGeom])

  return (
    <group rotation={[0, Math.PI / 2, 0]}>
      {/* Base retangular traseira de fixação à parede com encaixes laterais "rabo de andorinha" */}
      <mesh position={[0, -outerR - 2.2 * U, 0]} castShadow receiveShadow>
        <boxGeometry args={[outerR * 1.95, 6.2 * U, clipW * 1.06]} />
        <meshStandardMaterial color="#b4bcc4" roughness={0.46} metalness={0.04} />
      </mesh>
      {/* Guias laterais de acoplamento modular entre abraçadeiras (fiel a image-55.png) */}
      <mesh position={[outerR * 1.04, -outerR - 1.2 * U, 0]} castShadow>
        <boxGeometry args={[3.4 * U, 5.2 * U, clipW * 0.72]} />
        <meshStandardMaterial color="#a6afb8" roughness={0.48} />
      </mesh>
      <mesh position={[-outerR * 1.04, -outerR - 1.2 * U, 0]} castShadow>
        <boxGeometry args={[3.4 * U, 5.2 * U, clipW * 0.72]} />
        <meshStandardMaterial color="#a6afb8" roughness={0.48} />
      </mesh>
      {/* Furo central de fixação por parafuso */}
      <mesh position={[0, -r - 0.5 * U, 0]}>
        <cylinderGeometry args={[2.8 * U, 2.8 * U, 7 * U, 12]} />
        <meshStandardMaterial color="#475569" roughness={0.65} />
      </mesh>
      {/* Corpo em U cinza PVC-U */}
      <mesh geometry={archGeom} castShadow receiveShadow>
        <meshStandardMaterial color="#bcc4cc" roughness={0.42} metalness={0.04} />
      </mesh>
    </group>
  )
}

/** Abraçadeira metálica zincada bipartida com borracha preta EPDM e porca M8/M10 (fiel a image-57.png) */
export function PipeClampMetalEpdmMesh({ diameterMm = 25 }: { diameterMm?: number }) {
  const r = (diameterMm * 0.5) * U
  const bandW = Math.max(r * 1.05, 16 * U)
  const rubberT = Math.max(r * 0.16, 3.2 * U)
  const steelR = r + rubberT

  return (
    <group rotation={[0, Math.PI / 2, 0]}>
      {/* Revestimento interior de borracha preta EPDM antivibração (com abas salientes laterais) */}
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[steelR, steelR, bandW * 1.18, 28, 1, true]} />
        <meshStandardMaterial color="#181b20" roughness={0.86} metalness={0.04} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0, bandW * 0.54]}>
        <torusGeometry args={[steelR - rubberT * 0.35, rubberT * 0.55, 8, 26]} />
        <meshStandardMaterial color="#15181d" roughness={0.88} />
      </mesh>
      <mesh position={[0, 0, -bandW * 0.54]}>
        <torusGeometry args={[steelR - rubberT * 0.35, rubberT * 0.55, 8, 26]} />
        <meshStandardMaterial color="#15181d" roughness={0.88} />
      </mesh>

      {/* Cinta metálica galvanizada bipartida com nervura central de reforço */}
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[steelR + 2.2 * U, steelR + 2.2 * U, bandW * 0.88, 28, 1, true]} />
        <meshStandardMaterial color="#cfd7e0" metalness={0.88} roughness={0.24} side={THREE.DoubleSide} />
      </mesh>

      {/* Abas laterais de aperto + 2 parafusos zincados esquerda/direita */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * (steelR + 8.5 * U), 0, 0]}>
          <mesh position={[0, 2.2 * U, 0]} castShadow>
            <boxGeometry args={[14 * U, 2.6 * U, bandW * 0.86]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.88} roughness={0.25} />
          </mesh>
          <mesh position={[0, -2.2 * U, 0]} castShadow>
            <boxGeometry args={[14 * U, 2.6 * U, bandW * 0.86]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.88} roughness={0.25} />
          </mesh>
          {/* Parafuso vertical de aperto M6 */}
          <mesh position={[side * 2.0 * U, 0, 0]} castShadow>
            <cylinderGeometry args={[2.5 * U, 2.5 * U, 15 * U, 12]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.2} />
          </mesh>
          <mesh position={[side * 2.0 * U, -7.8 * U, 0]} castShadow>
            <cylinderGeometry args={[4.4 * U, 4.4 * U, 3.2 * U, 12]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.92} roughness={0.18} />
          </mesh>
        </group>
      ))}

      {/* Porca hexagonal soldada M8/M10 no verso para vareta roscada / parede */}
      <mesh position={[0, -(steelR + 7.5 * U), 0]} castShadow>
        <cylinderGeometry args={[6.8 * U, 6.8 * U, 13 * U, 6]} />
        <meshStandardMaterial color="#d4dce5" metalness={0.9} roughness={0.22} />
      </mesh>
    </group>
  )
}

/** Abraçadeira metálica galvanizada simples de 2 parafusos com espigão roscado (fiel a image-58.png) */
export function PipeClampMetalScrewMesh({ diameterMm = 25 }: { diameterMm?: number }) {
  const r = (diameterMm * 0.5) * U
  const bandW = Math.max(r * 0.9, 13 * U)
  const steelR = r + 2.0 * U

  return (
    <group rotation={[0, Math.PI / 2, 0]}>
      {/* Aro metálico galvanizado */}
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[steelR, steelR, bandW, 28, 1, true]} />
        <meshStandardMaterial color="#c8d1db" metalness={0.88} roughness={0.26} side={THREE.DoubleSide} />
      </mesh>
      {/* Abas de aperto com 2 parafusos fenda */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * (steelR + 7.5 * U), 0, 0]}>
          <mesh position={[0, 1.8 * U, 0]} castShadow>
            <boxGeometry args={[13 * U, 2.2 * U, bandW]} />
            <meshStandardMaterial color="#c8d1db" metalness={0.88} roughness={0.26} />
          </mesh>
          <mesh position={[0, -1.8 * U, 0]} castShadow>
            <boxGeometry args={[13 * U, 2.2 * U, bandW]} />
            <meshStandardMaterial color="#c8d1db" metalness={0.88} roughness={0.26} />
          </mesh>
          <mesh position={[side * 1.5 * U, 0, 0]} castShadow>
            <cylinderGeometry args={[2.3 * U, 2.3 * U, 14 * U, 10]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.22} />
          </mesh>
          <mesh position={[side * 1.5 * U, 6.8 * U, 0]} castShadow>
            <cylinderGeometry args={[4.2 * U, 4.2 * U, 2.8 * U, 12]} />
            <meshStandardMaterial color="#dce3ec" metalness={0.92} roughness={0.18} />
          </mesh>
        </group>
      ))}
      {/* Espigão metálico roscado para bucha/parede */}
      <mesh position={[0, -(steelR + 15 * U), 0]} castShadow>
        <cylinderGeometry args={[2.8 * U, 2.4 * U, 30 * U, 12]} />
        <meshStandardMaterial color="#b8c2ce" metalness={0.9} roughness={0.25} />
      </mesh>
    </group>
  )
}

function ClampByStyle({ style, diameterMm }: { style: PipeClampStyle; diameterMm: number }) {
  if (style === 'metal-epdm') return <PipeClampMetalEpdmMesh diameterMm={diameterMm} />
  if (style === 'metal-screw') return <PipeClampMetalScrewMesh diameterMm={diameterMm} />
  return <PipeClampPvcMesh diameterMm={diameterMm} />
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. TUBO VDS RÍGIDO PVC COM SERIGRAFIA, ENCAIXES AUTOMÁTICOS & ABRAÇADEIRAS
   (Fiel a image-54.png)
   ═══════════════════════════════════════════════════════════════════════════ */

export function ConduitVdsStraight3D({
  component,
  position = [0, 0, 0],
}: {
  component: ElectricalComponent
  position?: [number, number, number]
}) {
  const { diameterMm, lengthMm, clampCount, clampStyle, autoCouplers, clampRollDeg } = conduitDimsOf(component.state)
  const clampRollRad = (clampRollDeg * Math.PI) / 180
  const L = lengthMm * U
  const r = (diameterMm * 0.5) * U
  const couplerLen = Math.max(26 * U, diameterMm * 1.25 * U)
  const couplerR = r * 1.18

  const pipeTex = useMemo(() => createVdsSerigraphyTexture(diameterMm), [diameterMm])
  useEffect(() => () => { pipeTex?.dispose() }, [pipeTex])

  const clampXs = useMemo(() => {
    if (clampCount <= 0) return []
    if (clampCount === 1) return [0]
    const margin = Math.min(L * 0.14, 140 * U)
    const usable = Math.max(0.1, L - margin * 2)
    return Array.from({ length: clampCount }, (_, i) => -usable / 2 + (usable * i) / (clampCount - 1))
  }, [clampCount, L])

  return (
    <group position={position} name={`conduit-vds-straight-${component.id}`}>
      {/* Corpo principal cilíndrico PVC-U cinza com serigrafia técnica branca */}
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[r, r, L, 28]} />
        <meshStandardMaterial map={pipeTex} roughness={0.34} metalness={0.06} />
      </mesh>
      {/* Interior escuro nas extremidades (dá sensação realista de tubo oco!) */}
      {[-L / 2 - 0.002, L / 2 + 0.002].map((ex, i) => (
        <mesh key={i} position={[ex, 0, 0]} rotation={[0, i === 0 ? -Math.PI / 2 : Math.PI / 2, 0]}>
          <circleGeometry args={[r * 0.84, 22]} />
          <meshStandardMaterial color="#181c22" roughness={0.85} />
        </mesh>
      ))}

      {/* Uniões / mangas de encaixe VDS automáticas nas extremidades */}
      {autoCouplers && [-L / 2, L / 2].map((cx, i) => (
        <group key={i} position={[cx, 0, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
            <cylinderGeometry args={[couplerR, couplerR, couplerLen, 24]} />
            <meshStandardMaterial color="#5c626a" roughness={0.36} metalness={0.08} />
          </mesh>
          {/* Batente central da união VDS */}
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[couplerR * 1.05, couplerR * 1.05, 4.5 * U, 24]} />
            <meshStandardMaterial color="#4e545c" roughness={0.42} />
          </mesh>
        </group>
      ))}

      {/* Abraçadeiras distribuídas automaticamente e orientáveis em 360° à volta do tubo (`clampRollDeg`) */}
      {clampXs.map((xPos, idx) => (
        <group key={idx} position={[xPos, 0, 0]} rotation={[clampRollRad, 0, 0]}>
          <ClampByStyle style={clampStyle} diameterMm={diameterMm} />
        </group>
      ))}
    </group>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. CURVA TUBO VDS 90° COM ENCAIXES FÊMEA AUTOMÁTICOS NAS DUAS PONTAS
   ═══════════════════════════════════════════════════════════════════════════ */

export function ConduitVdsElbow903D({
  component,
  position = [0, 0, 0],
}: {
  component: ElectricalComponent
  position?: [number, number, number]
}) {
  const { diameterMm, autoCouplers } = conduitDimsOf(component.state)
  const r = (diameterMm * 0.5) * U
  const bendR = Math.max(diameterMm * 3.8 * U, 95 * U)
  const stub = Math.max(32 * U, diameterMm * 1.3 * U)
  const couplerR = r * 1.18

  const bendGeom = useMemo(() => {
    const pts: THREE.Vector3[] = []
    // Troço reto de entrada ao longo de +X
    pts.push(new THREE.Vector3(-stub, 0, 0))
    pts.push(new THREE.Vector3(-stub * 0.45, 0, 0))
    // Arco circular perfeito de 90° tangente a +X em (0,0,0) e tangente a +Z em (bendR,0,bendR)
    const steps = 20
    for (let i = 0; i <= steps; i++) {
      const a = (Math.PI / 2) * (i / steps)
      pts.push(new THREE.Vector3(bendR * Math.sin(a), 0, bendR * (1 - Math.cos(a))))
    }
    // Troço reto de saída ao longo de +Z
    pts.push(new THREE.Vector3(bendR, 0, bendR + stub * 0.45))
    pts.push(new THREE.Vector3(bendR, 0, bendR + stub))
    // Centrar visualmente no pivot
    const offsetX = -bendR * 0.5
    const offsetZ = -bendR * 0.5
    const centered = pts.map((p) => new THREE.Vector3(p.x + offsetX, p.y, p.z + offsetZ))
    const curve = new THREE.CatmullRomCurve3(centered)
    return {
      geom: new THREE.TubeGeometry(curve, 40, r, 22, false),
      start: centered[0],
      end: centered[centered.length - 1],
    }
  }, [r, bendR, stub])

  useEffect(() => () => bendGeom.geom.dispose(), [bendGeom])

  return (
    <group position={position} name={`conduit-vds-elbow90-${component.id}`}>
      <mesh geometry={bendGeom.geom} castShadow receiveShadow>
        <meshStandardMaterial color="#676d75" roughness={0.34} metalness={0.07} />
      </mesh>
      {/* Encaixes fêmea (bolsas moldadas) automáticos nas duas extremidades da curva VDS */}
      {autoCouplers && (
        <>
          <group position={bendGeom.start}>
            <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[couplerR, couplerR, stub * 0.92, 24]} />
              <meshStandardMaterial color="#5b6169" roughness={0.36} metalness={0.08} />
            </mesh>
          </group>
          <group position={bendGeom.end}>
            <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[couplerR, couplerR, stub * 0.92, 24]} />
              <meshStandardMaterial color="#5b6169" roughness={0.36} metalness={0.08} />
            </mesh>
          </group>
        </>
      )}
    </group>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. TUBO CORRUGADO FLEXÍVEL REALISTA (RETO OU CURVO, COM ABRAÇADEIRAS)
   (Fiel a image-56.png)
   ═══════════════════════════════════════════════════════════════════════════ */

export function ConduitCorrugated3D({
  component,
  position = [0, 0, 0],
}: {
  component: ElectricalComponent
  position?: [number, number, number]
}) {
  const { diameterMm, lengthMm, clampCount, clampStyle, bendAngleDeg, clampRollDeg, corrugatedColor } = conduitDimsOf(component.state)
  const clampRollRad = (clampRollDeg * Math.PI) / 180
  const L = lengthMm * U
  const r = (diameterMm * 0.5) * U

  const built = useMemo(() => {
    const pts: THREE.Vector3[] = []
    if (bendAngleDeg < 4) {
      pts.push(new THREE.Vector3(-L / 2, 0, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(L / 2, 0, 0))
    } else {
      const angRad = (bendAngleDeg * Math.PI) / 180
      const arcR = L / angRad
      const steps = 24
      for (let i = 0; i <= steps; i++) {
        const a = -angRad / 2 + (angRad * i) / steps
        pts.push(new THREE.Vector3(Math.sin(a) * arcR, 0, arcR * (1 - Math.cos(a)) - arcR * (1 - Math.cos(angRad / 2)) * 0.5))
      }
    }
    const curve = new THREE.CatmullRomCurve3(pts)
    const coreGeom = new THREE.TubeGeometry(curve, 44, r * 0.86, 18, false)

    // Anéis periódicos de corrugação realista (como em image-56.png)
    const ribCount = Math.max(18, Math.min(110, Math.round(L / Math.max(0.055, r * 0.65))))
    const up = new THREE.Vector3(0, 1, 0)
    const ribs: Array<{ pos: THREE.Vector3; quat: THREE.Quaternion }> = []
    for (let i = 0; i <= ribCount; i++) {
      const t = i / ribCount
      const pos = curve.getPointAt(t)
      const tan = curve.getTangentAt(t).normalize()
      const quat = new THREE.Quaternion().setFromUnitVectors(up, tan)
      ribs.push({ pos, quat })
    }

    const clamps: Array<{ pos: THREE.Vector3; quat: THREE.Quaternion }> = []
    if (clampCount > 0) {
      const xAxis = new THREE.Vector3(1, 0, 0)
      for (let i = 0; i < clampCount; i++) {
        const t = clampCount === 1 ? 0.5 : 0.14 + (0.72 * i) / (clampCount - 1)
        const pos = curve.getPointAt(t)
        const tan = curve.getTangentAt(t).normalize()
        const quat = new THREE.Quaternion().setFromUnitVectors(xAxis, tan)
        clamps.push({ pos, quat })
      }
    }

    return { coreGeom, ribs, clamps }
  }, [L, r, bendAngleDeg, clampCount])

  useEffect(() => () => built.coreGeom.dispose(), [built])

  return (
    <group position={position} name={`conduit-corrugated-${component.id}`}>
      {/* Núcleo interno escuro do tubo corrugado */}
      <mesh geometry={built.coreGeom} castShadow receiveShadow>
        <meshStandardMaterial color={corrugatedColor} roughness={0.62} metalness={0.08} />
      </mesh>
      {/* Anéis anulares de corrugação */}
      {built.ribs.map((rb, idx) => (
        <mesh key={idx} position={rb.pos} quaternion={rb.quat} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[r * 0.94, r * 0.16, 7, 16]} />
          <meshStandardMaterial color={corrugatedColor} roughness={0.44} metalness={0.14} />
        </mesh>
      ))}
      {/* Abraçadeiras opcionais ao longo do tubo corrugado, orientáveis em 360° (`clampRollDeg`) */}
      {built.clamps.map((cl, idx) => (
        <group key={idx} position={cl.pos} quaternion={cl.quat}>
          <group rotation={[clampRollRad, 0, 0]}>
            <ClampByStyle style={clampStyle} diameterMm={diameterMm} />
          </group>
        </group>
      ))}
    </group>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. COMPONENTES AUTÓNOMOS DE ABRAÇADEIRAS (PARA POSICIONAR LIVREMENTE)
   ═══════════════════════════════════════════════════════════════════════════ */

export function PipeClampStandalone3D({
  component,
  position = [0, 0, 0],
}: {
  component: ElectricalComponent
  position?: [number, number, number]
}) {
  const diameterMm = Math.max(16, Math.min(63, Number(component.state.diameterMm ?? 25)))
  const clampRollDeg = (((Number(component.state.clampRollDeg ?? 0) || 0) % 360) + 360) % 360
  const clampRollRad = (clampRollDeg * Math.PI) / 180
  const style: PipeClampStyle =
    component.type === 'pipeClampMetalEpdm'
      ? 'metal-epdm'
      : component.type === 'pipeClampMetalScrew'
        ? 'metal-screw'
        : 'pvc-clip'
  return (
    <group position={position} rotation={[clampRollRad, 0, 0]} name={`pipe-clamp-${component.id}`}>
      <ClampByStyle style={style} diameterMm={diameterMm} />
    </group>
  )
}
