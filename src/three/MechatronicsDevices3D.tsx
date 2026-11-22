import { useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { ElectricalComponent } from '../types'
import { PANEL_UNITS_PER_MM } from './modelPaths'
import {
  ARM_CUP_STEM_MM,
  ARM_CYLINDER_BASE_MM,
  ARM_PIVOT_MM,
  ARM_TOTAL_HEIGHT_MM,
  ARM_TIP_MM,
  MAGAZINE_CAPACITY,
  MEC_DIMS,
  aluProfileDimsOf,
  benchDuctDimsOf,
  dragChainDimsOf,
  mechatronicsSizeMm,
  rampDimsOf,
  slotPlateDimsOf,
  MEC_LEG_MIN_MM,
  MEC_LEG_MAX_MM,
  MEC_LEG_DEFAULT_MM,
  supportBlockDimsOf,
  workpieceMaterialOf,
  type WorkpieceMaterial,
} from './mechatronicsModel'
import {
  atecProjectSheetTexture,
  bellowsCupGeometry,
  bevelGearGeometry,
  dragChainGeometry,
  gaugeDialTexture,
  ktp700BackLabelTexture,
  ktp700BezelTexture,
  ktp700ScreenTexture,
  labelTexture,
  portescapMotorLabelTexture,
  rampChannelGeometry,
  recessedBlockGeometry,
  rotaryEncoderWrapTexture,
  slotPlateGeometry,
  slottedDuctGeometry,
  slottedPanelGeometry,
  squarePocketBlockGeometry,
  taperedArmGeometry,
  tSlotProfileGeometry,
  workpieceGeometry,
} from './mechatronicsGeometry'
import { magazineColumn } from '../electrical/mechatronicsSim'

/**
 * Maquete didática de estampagem e transferência — modelos 3D procedimentais (CAD paramétrico).
 * Tudo é desenhado em milímetros dentro de um grupo com escala PANEL_UNITS_PER_MM; a origem
 * é o centro do volume declarado em `mechatronicsSizeMm` (o pivô do Painel 3D).
 */

const U = PANEL_UNITS_PER_MM

/* Acabamentos calibrados (a passagem `applyCadSurfaceTextures` junta relevo/brilho por família). */
const ALU = { color: '#e4e8ec', roughness: 0.4, metalness: 0.6 }
const ALU_MILLED = { color: '#eef1f4', roughness: 0.3, metalness: 0.62 }
const ALU_DARK = { color: '#aab3bd', roughness: 0.42, metalness: 0.6 }
const STEEL = { color: '#d2d8de', roughness: 0.3, metalness: 0.75 }
const CHROME = { color: '#f1f5f9', roughness: 0.12, metalness: 0.96 }
const BLACK_OXIDE = { color: '#23272e', roughness: 0.42, metalness: 0.7 }
const PA_BLACK = { color: '#16191e', roughness: 0.62, metalness: 0.05 }
const PA_GREY = { color: '#3b424c', roughness: 0.55, metalness: 0.08 }
const PA_LIGHT = { color: '#c8ccd2', roughness: 0.58, metalness: 0.04 }
const RUBBER = { color: '#111316', roughness: 0.82, metalness: 0.02 }
const BRASS = { color: '#c9a24b', roughness: 0.25, metalness: 0.9 }
const BLUE_RING = { color: '#1d8fd8', roughness: 0.42, metalness: 0.1 }
const PU_TUBE = { color: '#2b9be0', roughness: 0.38, metalness: 0.02 }
const PVC_DUCT = { color: '#8d8f86', roughness: 0.62, metalness: 0.02 }

const WORKPIECE_FINISH: Record<WorkpieceMaterial, { color: string; roughness: number; metalness: number }> = {
  aluminio: { color: '#d3d9df', roughness: 0.26, metalness: 0.9 },
  branco: { color: '#eef0f2', roughness: 0.48, metalness: 0.02 },
  preto: { color: '#22252b', roughness: 0.5, metalness: 0.02 },
}

type Finish = { color: string; roughness: number; metalness: number }
const Mat = ({ f, name }: { f: Finish; name?: string }) => (
  <meshStandardMaterial name={name} color={f.color} roughness={f.roughness} metalness={f.metalness} />
)

export type MechatronicsPatch = Record<string, unknown>

const textOf = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

/** Parafuso de cabeça cilíndrica com sextavado interior (Allen), eixo Y, assento em y = 0. */
function CapScrew({ position, d = 5, rotation }: { position: [number, number, number]; d?: number; rotation?: [number, number, number] }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, d * 0.5, 0]} castShadow>
        <cylinderGeometry args={[d * 0.82, d * 0.82, d, 18]} />
        <Mat f={BLACK_OXIDE} name="Parafuso Allen" />
      </mesh>
      <mesh position={[0, d + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[d * 0.42, 6]} />
        <meshStandardMaterial color="#07080a" roughness={0.9} />
      </mesh>
    </group>
  )
}

/** Racor rápido Push-In reto com anel azul (eixo Y, base em y = 0). */
function PushInFitting({ position, rotation, d = 6 }: { position: [number, number, number]; rotation?: [number, number, number]; d?: number }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, d * 0.35, 0]}>
        <cylinderGeometry args={[d * 0.72, d * 0.72, d * 0.7, 6]} />
        <Mat f={BRASS} name="Latão niquelado do racor" />
      </mesh>
      <mesh position={[0, d * 1.15, 0]}>
        <cylinderGeometry args={[d * 0.78, d * 0.78, d * 0.9, 18]} />
        <Mat f={PA_BLACK} name="Corpo PBT do racor" />
      </mesh>
      <mesh position={[0, d * 1.7, 0]}>
        <cylinderGeometry args={[d * 0.62, d * 0.66, d * 0.3, 18]} />
        <Mat f={BLUE_RING} name="Anel de libertação" />
      </mesh>
    </group>
  )
}

/** Sensor magnético (reed) de ranhura com LED e cabo; aceita a etiqueta impressa Bn da maquete. */
function ReedSensor({ position, active, rotation, label }: { position: [number, number, number]; active: boolean; rotation?: [number, number, number]; label?: string }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow>
        <boxGeometry args={[22, 4.6, 5]} />
        <Mat f={PA_GREY} name="Corpo do sensor magnético" />
      </mesh>
      <mesh position={[8, 2.4, 0]}>
        <boxGeometry args={[3, 0.6, 2.6]} />
        <meshStandardMaterial name="LED do sensor" color={active ? '#fbbf24' : '#4b3a12'} emissive={active ? '#f59e0b' : '#000000'} emissiveIntensity={active ? 1.4 : 0} />
      </mesh>
      <LabelPlate text={label} position={[-4.6, 2.32, 0]} rotation={[-Math.PI / 2, 0, 0]} w={11.5} h={3.1} />
      <mesh position={[-14, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[1.5, 1.5, 8, 10]} />
        <Mat f={PA_BLACK} name="Cabo do sensor" />
      </mesh>
    </group>
  )
}

/** Etiqueta impressa tipo fita Brother (o `map` impede o acabamento CAD procedural de a lavar). */
function LabelPlate({
  text, position, rotation, w = 30, h = 7.5, bg = '#f8fafc', fg = '#0f172a',
}: {
  text?: unknown
  position: [number, number, number]
  rotation?: [number, number, number]
  w?: number
  h?: number
  bg?: string
  fg?: string
}) {
  const label = textOf(text)
  if (!label) return null
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial name="Etiqueta impressa" map={labelTexture(label, bg, fg) ?? undefined} color="#ffffff" roughness={0.62} metalness={0} />
    </mesh>
  )
}

/** Ponto luminoso (LED de estado) com halo esbatido quando apagado. */
function StatusLed({ position, on, color = '#f59e0b', size = 2.1 }: { position: [number, number, number]; on: boolean; color?: string; size?: number }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[size, 14, 10]} />
      <meshStandardMaterial
        name="LED de estado"
        color={on ? color : '#41464f'}
        emissive={on ? color : '#000000'}
        emissiveIntensity={on ? 1.8 : 0}
        roughness={0.32}
        metalness={0.08}
      />
    </mesh>
  )
}

/** Regulador de caudal unidirecional (válvula de agulha + anel azul) montado num racor. */
function FlowRegulator({ position, rotation }: { position: [number, number, number]; rotation?: [number, number, number] }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 4, 0]}>
        <cylinderGeometry args={[4.4, 4.4, 8, 16]} />
        <Mat f={PA_BLACK} name="Corpo do regulador de caudal" />
      </mesh>
      <mesh position={[0, 9.2, 0]}>
        <cylinderGeometry args={[3.4, 3.4, 3, 6]} />
        <Mat f={BRASS} name="Porca do regulador" />
      </mesh>
      <mesh position={[0, 11.4, 0]}>
        <cylinderGeometry args={[2.6, 2.6, 2, 14]} />
        <Mat f={BLUE_RING} name="Botão do regulador" />
      </mesh>
    </group>
  )
}

/* ================================================================ estrutura */

/**
 * Pernas da mesa em perfil T 40 × 40: quatro montantes sob os cantos da base, cantoneiras no topo,
 * travessas inferiores (longitudinais e transversais) e pés niveladores M12 com base em borracha.
 * `heightMm` = da face inferior da base até ao chão.
 */
function BenchLegs({ lengthMm, widthMm, heightMm, topY }: { lengthMm: number; widthMm: number; heightMm: number; topY: number }) {
  const S = 40
  const footH = Math.min(45, heightMm * 0.25)
  const legLen = Math.max(20, heightMm - footH)
  const legGeom = tSlotProfileGeometry(S, legLen)
  const xs = lengthMm / 2 - S / 2 - 15
  const zs = widthMm / 2 - S / 2 - 15
  const legCy = topY - legLen / 2
  const railY = topY - legLen + Math.min(160, legLen * 0.22)
  const spanX = xs * 2 - S
  const spanZ = zs * 2 - S
  const railX = spanX > 40 ? tSlotProfileGeometry(S, spanX) : null
  const railZ = spanZ > 40 ? tSlotProfileGeometry(S, spanZ) : null
  const corners: Array<[number, number]> = [[-1, -1], [1, -1], [-1, 1], [1, 1]]
  return (
    <group name="Maquete_Pes_Mesa">
      {corners.map(([sx, sz], i) => (
        <group key={i} position={[sx * xs, 0, sz * zs]}>
          <mesh geometry={legGeom} position={[0, legCy, 0]} castShadow receiveShadow>
            <Mat f={ALU} name="Perna em perfil 40 × 40" />
          </mesh>
          {/* Tampa inferior + pé nivelador (haste roscada e base articulada em borracha) */}
          <mesh position={[0, topY - legLen - 1, 0]}>
            <boxGeometry args={[S - 0.6, 2, S - 0.6]} />
            <Mat f={PA_BLACK} name="Tampa de topo" />
          </mesh>
          <mesh position={[0, topY - legLen - footH / 2, 0]} castShadow>
            <cylinderGeometry args={[6, 6, footH, 16]} />
            <Mat f={STEEL} name="Haste niveladora M12" />
          </mesh>
          <mesh position={[0, topY - legLen - footH * 0.35, 0]}>
            <cylinderGeometry args={[11, 11, 7, 6]} />
            <Mat f={STEEL} name="Porca de bloqueio" />
          </mesh>
          <mesh position={[0, topY - heightMm + 6, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[24, 28, 12, 28]} />
            <Mat f={RUBBER} name="Pé nivelador em borracha" />
          </mesh>
          {/* Cantoneiras de ligação perna ↔ base: aba encostada à face inferior da base e aba vertical
              para baixo, na face interior da perna (viradas ao centro da mesa, nos dois eixos). */}
          <group position={[-sx * S / 2, topY, 0]} rotation={[Math.PI, 0, 0]}>
            <AngleBracket size={30} position={[0, 0, 0]} rotationY={sx > 0 ? Math.PI : 0} />
          </group>
          <group position={[0, topY, -sz * S / 2]} rotation={[Math.PI, 0, 0]}>
            <AngleBracket size={30} position={[0, 0, 0]} rotationY={sz > 0 ? -Math.PI / 2 : Math.PI / 2} />
          </group>
        </group>
      ))}
      {/* Travessas inferiores: duas ao comprido (X) e duas ao largo (Z) */}
      {railX && [-1, 1].map((sz) => (
        <mesh key={`x${sz}`} geometry={railX} position={[0, railY, sz * zs]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
          <Mat f={ALU} name="Travessa longitudinal 40 × 40" />
        </mesh>
      ))}
      {railZ && [-1, 1].map((sx) => (
        <mesh key={`z${sx}`} geometry={railZ} position={[sx * xs, railY, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
          <Mat f={ALU} name="Travessa transversal 40 × 40" />
        </mesh>
      ))}
    </group>
  )
}

function SlotPlate({ c, floorY }: { c: ElectricalComponent; floorY?: number }) {
  const d = slotPlateDimsOf(c.state)
  const geom = slotPlateGeometry(d.lengthMm, d.widthMm, d.thicknessMm, d.slotPitchMm)
  // Altura automática: distância real (em mm) da face inferior da base até ao chão do pavilhão,
  // medida no mundo para seguir a posição/escala do componente. Atualiza só quando muda ≥ 2 mm.
  const ref = useRef<THREE.Group>(null)
  const [autoMm, setAutoMm] = useState<number | null>(null)
  const probe = useMemo(() => ({ p: new THREE.Vector3(), s: new THREE.Vector3() }), [])
  useFrame(() => {
    if (!d.legs || d.legHeightMm !== 'auto' || floorY === undefined || !ref.current) return
    ref.current.getWorldPosition(probe.p)
    ref.current.getWorldScale(probe.s)
    if (!probe.s.y) return
    const mm = (probe.p.y - floorY) / probe.s.y - d.thicknessMm / 2
    const next = mm >= MEC_LEG_MIN_MM && mm <= MEC_LEG_MAX_MM * 2 ? Math.round(mm) : null
    if (next !== autoMm && (next === null || autoMm === null || Math.abs(next - autoMm) >= 2)) setAutoMm(next)
  })
  const legHeight = !d.legs ? 0
    : d.legHeightMm !== 'auto' ? d.legHeightMm
    : autoMm ?? (floorY === undefined ? MEC_LEG_DEFAULT_MM : 0)
  return (
    <group name="Maquete_Base" ref={ref}>
      {legHeight > 0 && <BenchLegs lengthMm={d.lengthMm} widthMm={d.widthMm} heightMm={legHeight} topY={-d.thicknessMm / 2} />}
      <mesh geometry={geom} castShadow receiveShadow>
        <Mat f={ALU} name="Alumínio extrudido anodizado" />
      </mesh>
      {/* Tampas de topo das extremidades (perfil de fecho cinzento) */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (d.lengthMm / 2 + 1), 0, 0]}>
          <boxGeometry args={[2, d.thicknessMm * 0.96, d.widthMm * 0.995]} />
          <Mat f={PA_GREY} name="Tampa de topo" />
        </mesh>
      ))}
      {/* Pés de borracha nos cantos (só quando a base assenta diretamente, sem pernas) */}
      {legHeight <= 0 && [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <mesh key={i} position={[sx * (d.lengthMm / 2 - 30), -d.thicknessMm / 2 - 2.5, sz * (d.widthMm / 2 - 30)]}>
          <cylinderGeometry args={[11, 12, 5, 20]} />
          <Mat f={RUBBER} name="Pé de borracha" />
        </mesh>
      ))}
    </group>
  )
}

/** Cantoneira de fixação 90° em alumínio injetado com nervura (base no plano y = 0, aba para +Y, face em x = 0). */
function AngleBracket({ size, position, rotationY = 0 }: { size: number; position: [number, number, number]; rotationY?: number }) {
  const t = 3.5
  const rib = useMemo(() => {
    const s = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(size * 0.8, 0), new THREE.Vector2(0, size * 0.8)])
    const g = new THREE.ExtrudeGeometry(s, { depth: 2.4, bevelEnabled: false })
    g.translate(0, 0, -1.2)
    return g
  }, [size])
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[size / 2, t / 2, 0]} castShadow>
        <boxGeometry args={[size, t, size * 0.86]} />
        <Mat f={ALU_DARK} name="Cantoneira injetada" />
      </mesh>
      <mesh position={[t / 2, size / 2, 0]} castShadow>
        <boxGeometry args={[t, size, size * 0.86]} />
        <Mat f={ALU_DARK} name="Cantoneira injetada" />
      </mesh>
      <mesh geometry={rib} position={[t, t, 0]}>
        <Mat f={ALU_DARK} name="Nervura da cantoneira" />
      </mesh>
      <CapScrew position={[size * 0.62, t, size * 0.22]} d={3.4} />
      <CapScrew position={[t, size * 0.62, -size * 0.22]} d={3.4} rotation={[0, 0, -Math.PI / 2]} />
    </group>
  )
}

function AluProfile({ c }: { c: ElectricalComponent }) {
  const d = aluProfileDimsOf(c.state)
  const geom = tSlotProfileGeometry(d.sectionMm, d.lengthMm)
  const half = d.lengthMm / 2
  return (
    <group rotation={d.vertical ? [0, 0, 0] : [0, 0, -Math.PI / 2]}>
      <mesh geometry={geom} castShadow receiveShadow>
        <Mat f={ALU} name="Perfil de alumínio anodizado" />
      </mesh>
      {d.endCaps && [-1, 1].map((s) => (
        <mesh key={s} position={[0, s * (half + 1), 0]}>
          <boxGeometry args={[d.sectionMm - 0.6, 2, d.sectionMm - 0.6]} />
          <Mat f={PA_BLACK} name="Tampa de topo em plástico" />
        </mesh>
      ))}
      <LabelPlate text={c.state.labelText} position={[0, half - 26, d.sectionMm / 2 + 0.1]} w={44} h={11} />
      {d.brackets && d.vertical && (
        <>
          <AngleBracket size={d.sectionMm * 0.75} position={[d.sectionMm / 2, -half, 0]} />
          <AngleBracket size={d.sectionMm * 0.75} position={[-d.sectionMm / 2, -half, 0]} rotationY={Math.PI} />
        </>
      )}
    </group>
  )
}

function Workpiece({ material, position, rotation, name }: { material: WorkpieceMaterial; position?: [number, number, number]; rotation?: [number, number, number]; name?: string }) {
  const g = workpieceGeometry(MEC_DIMS.workpiece.diameterMm, MEC_DIMS.workpiece.heightMm)
  return (
    <mesh geometry={g} name={name} position={position} rotation={rotation} castShadow receiveShadow>
      <Mat f={WORKPIECE_FINISH[material]} name={material === 'aluminio' ? 'Tarugo de alumínio' : 'Tarugo de polímero'} />
    </mesh>
  )
}


function GravityMagazine({ c, onPatch }: { c: ElectricalComponent; onPatch?: (patch: MechatronicsPatch) => void }) {
  const m = MEC_DIMS.magazine
  const H = m.liftMm + m.heightMm
  const y0 = -H / 2
  const tx = m.tubeOffsetMm
  const tubeY = y0 + m.liftMm + m.heightMm / 2
  const front = slottedPanelGeometry(m.outerMm, m.heightMm, m.wallMm, [
    { x: 0, y: -m.heightMm * 0.12, w: m.slotW, h: m.slotH },
    { x: 0, y: m.heightMm * 0.27, w: m.slotW, h: m.slotH },
  ], 'magazine-front')
  const pieces = magazineColumn(c.state, MAGAZINE_CAPACITY)
  const pickup = typeof c.state.pickupMaterial === 'string' && c.state.pickupMaterial ? workpieceMaterialOf(c.state.pickupMaterial) : null
  const inner = m.outerMm - m.wallMm * 2
  const supportH = m.liftMm - 8
  return (
    <group onDoubleClick={(e) => { if (!onPatch) return; e.stopPropagation(); onPatch({ pieceCount: MAGAZINE_CAPACITY, pieceOffset: 0 }) }}>
      {/* Base fresada: assento do magazine + zona de recolha com guias laterais */}
      <mesh position={[0, y0 + 4, 0]} castShadow receiveShadow>
        <boxGeometry args={[m.baseLengthMm, 8, m.baseDepthMm]} />
        <Mat f={ALU_MILLED} name="Base fresada" />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={`guide-${s}`} position={[m.pickupOffsetMm + 5, y0 + 8 + 6, s * (MEC_DIMS.workpiece.diameterMm / 2 + 4)]} castShadow>
          <boxGeometry args={[60, 12, 4]} />
          <Mat f={ALU_DARK} name="Guia da zona de recolha" />
        </mesh>
      ))}
      <mesh position={[m.pickupOffsetMm + 37, y0 + 8 + 9, 0]} castShadow>
        <boxGeometry args={[6, 18, MEC_DIMS.workpiece.diameterMm + 12]} />
        <Mat f={ALU_DARK} name="Batente da zona de recolha" />
      </mesh>
      {[[-75, -30], [-75, 30], [75, -30], [75, 30]].map(([x, z], i) => <CapScrew key={i} position={[x, y0 + 8, z]} d={3.6} />)}
      {/* Suportes elevados à frente e atrás: a passagem do empurrador fica livre ao longo de X */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[tx, y0 + 8 + supportH / 2, s * (m.outerMm / 2 + 6)]} castShadow>
          <boxGeometry args={[m.outerMm + 14, supportH, 12]} />
          <Mat f={ALU_MILLED} name="Suporte elevado" />
        </mesh>
      ))}
      {/* Tubo quadrado oco: frente com rasgos oblongos + 3 paredes */}
      <mesh geometry={front} position={[tx, tubeY, m.outerMm / 2 - m.wallMm / 2]} castShadow receiveShadow>
        <Mat f={ALU} name="Tubo quadrado maquinado" />
      </mesh>
      <mesh position={[tx, tubeY, -m.outerMm / 2 + m.wallMm / 2]} castShadow receiveShadow>
        <boxGeometry args={[m.outerMm, m.heightMm, m.wallMm]} />
        <Mat f={ALU} name="Tubo quadrado maquinado" />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[tx + s * (m.outerMm / 2 - m.wallMm / 2), tubeY, 0]} castShadow receiveShadow>
          <boxGeometry args={[m.wallMm, m.heightMm, inner]} />
          <Mat f={ALU} name="Tubo quadrado maquinado" />
        </mesh>
      ))}
      {/* Etiqueta de identificação do alimentador no topo do tubo */}
      <LabelPlate text={c.state.labelText} position={[tx, tubeY + m.heightMm / 2 + 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} w={40} h={10} />
      {/* Placas de fixação do tubo aos suportes */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[tx, y0 + m.liftMm + 12, s * (m.outerMm / 2 + 2)]}>
            <boxGeometry args={[m.outerMm - 6, 24, 4]} />
            <Mat f={ALU_MILLED} name="Placa de fixação" />
          </mesh>
          <CapScrew position={[tx - 11, y0 + m.liftMm + 12, s * (m.outerMm / 2 + 4)]} d={4} rotation={[s * Math.PI / 2, 0, 0]} />
          <CapScrew position={[tx + 11, y0 + m.liftMm + 12, s * (m.outerMm / 2 + 4)]} d={4} rotation={[s * Math.PI / 2, 0, 0]} />
        </group>
      ))}
      {/* Coluna de tarugos por gravidade: o inferior fica na janela de expulsão, por baixo do tubo */}
      {pieces.map((mat, i) => (
        <Workpiece key={i} material={mat} position={[tx, y0 + 8 + MEC_DIMS.workpiece.heightMm / 2 + i * (MEC_DIMS.workpiece.heightMm + 0.4), 0]} />
      ))}
      {pickup && <Workpiece name="tarugo-zona-recolha" material={pickup} position={[m.pickupOffsetMm, y0 + 8 + MEC_DIMS.workpiece.heightMm / 2, 0]} />}
    </group>
  )
}

function DischargeRamp({ c }: { c: ElectricalComponent }) {
  const r = rampDimsOf(c.state)
  const size = mechatronicsSizeMm('mecDischargeRamp', c.state)!
  const y0 = -size.y / 2
  const x0 = -size.x / 2
  const channel = rampChannelGeometry(r.lengthMm, r.widthMm, r.flangeMm)
  // Extremidade alta sobre o pilar traseiro (x mínimo); desce 15° para +X.
  const highY = y0 + r.pillarMm
  const cx = x0 + 8 + r.runMm / 2
  const cy = highY - r.riseMm / 2
  const pillar = tSlotProfileGeometry(30, r.pillarMm)
  const lowPillarH = Math.max(12, r.pillarMm - r.riseMm - 4)
  const lowPillar = tSlotProfileGeometry(30, lowPillarH)
  return (
    <group>
      <mesh geometry={pillar} position={[x0 + 15, y0 + r.pillarMm / 2, 0]} castShadow>
        <Mat f={ALU} name="Pilar de perfil 30" />
      </mesh>
      <mesh geometry={lowPillar} position={[x0 + r.runMm - 10, y0 + lowPillarH / 2, 0]} castShadow>
        <Mat f={ALU} name="Pilar de perfil 30" />
      </mesh>
      <group position={[cx, cy, 0]} rotation={[0, 0, -r.slope]}>
        <mesh geometry={channel} castShadow receiveShadow>
          <Mat f={ALU_MILLED} name="Chapa de alumínio dobrada" />
        </mesh>
        {/* Batente na ponta baixa */}
        <mesh position={[r.lengthMm / 2 - 0.75, r.flangeMm * 0.45, 0]}>
          <boxGeometry args={[1.5, r.flangeMm * 0.9, r.widthMm]} />
          <Mat f={ALU_MILLED} name="Batente da rampa" />
        </mesh>
        {/* Etiqueta de destino impressa na aba da calha (METALICA / PRETA / BRANCA) */}
        <LabelPlate text={c.state.rampLabel} position={[r.lengthMm / 2 - 52, r.flangeMm + 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]} w={64} h={15} />
        {/* Esquadro de apoio + parafusos */}
        {[-r.lengthMm / 2 + 14, r.lengthMm / 2 - 30].map((x, i) => (
          <CapScrew key={i} position={[x, 1.5, 0]} d={3.6} />
        ))}
        {/* Peças triadas: deitadas e encostadas ao batente da ponta baixa */}
        {(Array.isArray(c.state.pieces) ? c.state.pieces.slice(-5) : []).map((mat: unknown, i: number) => (
          <Workpiece key={i} material={workpieceMaterialOf(mat)} position={[r.lengthMm / 2 - 2 - MEC_DIMS.workpiece.heightMm / 2 - i * (MEC_DIMS.workpiece.heightMm + 1), 1.5 + MEC_DIMS.workpiece.diameterMm / 2, 0]} rotation={[0, 0, Math.PI / 2]} />
        ))}
      </group>
    </group>
  )
}

function StampingTable({ c }: { c: ElectricalComponent }) {
  const t = MEC_DIMS.table
  const depth = 8
  // A gaveta FC 2 fotografada tem alojamento quadrado; o modo redondo mantém o assento do tarugo Ø40.
  const square = c.state.pocketShape === 'square'
  const g = square
    ? squarePocketBlockGeometry(t.lengthMm, t.heightMm, t.depthMm, t.recessDiameterMm, depth)
    : recessedBlockGeometry(t.lengthMm, t.heightMm, t.depthMm, t.recessDiameterMm, depth)
  const holding = typeof c.state.pieceMaterial === 'string' && c.state.pieceMaterial !== ''
  const floorY = t.heightMm / 2 - depth
  return (
    <group>
      <mesh geometry={g} castShadow receiveShadow>
        <Mat f={ALU_MILLED} name="Bloco maquinado" />
      </mesh>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <CapScrew key={i} position={[sx * (t.lengthMm / 2 - 10), t.heightMm / 2, sz * (t.depthMm / 2 - 10)]} d={4.2} />
      ))}
      {/* Fundo do alojamento (chanfro de entrada ligeiramente mais escuro) */}
      {square ? (
        <mesh position={[0, floorY + 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[t.recessDiameterMm, t.recessDiameterMm]} />
          <Mat f={ALU_DARK} name="Fundo do rebaixo" />
        </mesh>
      ) : (
        <mesh position={[0, floorY + 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[t.recessDiameterMm / 2, 40]} />
          <Mat f={ALU_DARK} name="Fundo do rebaixo" />
        </mesh>
      )}
      {/* Etiqueta FC 2 colada à face frontal da gaveta */}
      <LabelPlate text={c.state.labelText ?? 'FC 2'} position={[0, -3, t.depthMm / 2 + 0.1]} w={42} h={13} />
      {holding && (
        <group position={[0, floorY + MEC_DIMS.workpiece.heightMm / 2 + 0.1, 0]}>
          <Workpiece name="tarugo-gaveta" material={workpieceMaterialOf(c.state.pieceMaterial)} />
          {c.state.stamped && (
            <mesh position={[0, MEC_DIMS.workpiece.heightMm / 2 + 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[6, 12, 32]} />
              <meshStandardMaterial name="Marca de estampagem" color="#475569" roughness={0.35} metalness={0.5} />
            </mesh>
          )}
        </group>
      )}
    </group>
  )
}

/** Cilindro redondo compacto (tipo ISO 6432), eixo X: tampa traseira em x = 0, haste para +X. */
function RoundCylinderBody({ bore, length }: { bore: number; length: number }) {
  const r = bore / 2 + 1.6
  return (
    <group>
      <mesh position={[length / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[r, r, length - 16, 32]} />
        <Mat f={ALU} name="Camisa do cilindro" />
      </mesh>
      {[4, length - 4].map((x, i) => (
        <mesh key={i} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[r + 1.8, r + 1.8, 8, 32]} />
          <Mat f={ALU_DARK} name="Tampa do cilindro" />
        </mesh>
      ))}
      {/* Porca de fixação frontal */}
      <mesh position={[length + 2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[bore * 0.42, bore * 0.42, 4, 6]} />
        <Mat f={STEEL} name="Porca de fixação" />
      </mesh>
    </group>
  )
}

function useSmoothed(target: number, speed = 10) {
  const ref = useRef(target)
  const { invalidate } = useThree()
  useFrame((_, delta) => {
    const diff = target - ref.current
    if (Math.abs(diff) > 0.001) {
      ref.current += diff * Math.min(1, delta * speed)
      if (Math.abs(target - ref.current) < 0.001) ref.current = target
      invalidate()
    }
  })
  return ref
}

function FeederCylinder({ c }: { c: ElectricalComponent }) {
  const f = MEC_DIMS.feeder
  const pct = Math.max(0, Math.min(100, Number(c.state.positionPct ?? 0)))
  const pos = useSmoothed(pct / 100, 9)
  const rodRef = useRef<THREE.Group>(null)
  useFrame(() => { if (rodRef.current) rodRef.current.position.x = pos.current * f.strokeMm })
  const xBody = -118
  const axisY = -23 + 8 + MEC_DIMS.workpiece.heightMm / 2
  const r = f.boreMm / 2 + 1.6
  return (
    <group>
      <group position={[xBody, axisY, 0]}>
        <RoundCylinderBody bore={f.boreMm} length={f.bodyMm} />
        <PushInFitting position={[6, f.boreMm / 2 + 3, 0]} d={4.5} />
        <PushInFitting position={[f.bodyMm - 6, f.boreMm / 2 + 3, 0]} d={4.5} />
        <FlowRegulator position={[f.bodyMm - 6, f.boreMm / 2 + 3, 0]} />
        <FlowRegulator position={[6, -(f.boreMm / 2 + 3), 0]} rotation={[0, 0, Math.PI]} />
        {/* Etiqueta impressa CILINDRO 1 no dorso da camisa */}
        <LabelPlate text={c.state.labelText ?? 'CILINDRO 1'} position={[f.bodyMm / 2, r + 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]} w={62} h={11} />
      </group>
      {/* Pés de fixação em L aparafusados à base */}
      {[xBody + 8, xBody + f.bodyMm - 8].map((x, i) => (
        <group key={i}>
          <mesh position={[x, (-23 + axisY) / 2, 0]} castShadow>
            <boxGeometry args={[6, axisY + 23, 34]} />
            <Mat f={STEEL} name="Pé de fixação" />
          </mesh>
          <mesh position={[x + (i === 0 ? 6 : -6), -21.5, 0]} castShadow>
            <boxGeometry args={[14, 3, 34]} />
            <Mat f={STEEL} name="Pé de fixação" />
          </mesh>
        </group>
      ))}
      <ReedSensor position={[xBody + 26, axisY + 5, f.boreMm / 2 + 3.6]} active={pct <= 8} label={textOf(c.state.sensorRecLabel) || 'B8'} />
      <ReedSensor position={[xBody + f.bodyMm - 26, axisY + 5, f.boreMm / 2 + 3.6]} active={pct >= 92} label={textOf(c.state.sensorAvaLabel) || 'B9'} />
      {/* Haste cromada + empurrador */}
      <group ref={rodRef} name="Cilindro1_Haste">
        <mesh position={[xBody + f.bodyMm + 5, axisY, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[4, 4, 10, 20]} />
          <Mat f={CHROME} name="Haste cromada" />
        </mesh>
        <mesh position={[xBody + f.bodyMm + 13, axisY, 0]} castShadow>
          <boxGeometry args={[6, 26, 34]} />
          <Mat f={ALU_MILLED} name="Empurrador" />
        </mesh>
        <CapScrew position={[xBody + f.bodyMm + 16, axisY, 0]} d={3.4} rotation={[0, 0, -Math.PI / 2]} />
      </group>
    </group>
  )
}

function StampingPress({ c }: { c: ElectricalComponent }) {
  const p = MEC_DIMS.press
  const H = p.gantryHeightMm
  const W = p.gantryWidthMm
  const pct = Math.max(0, Math.min(100, Number(c.state.positionPct ?? 0)))
  const pos = useSmoothed(pct / 100, 9)
  const rodRef = useRef<THREE.Group>(null)
  const needleRef = useRef<THREE.Mesh>(null)
  const pressureBar = Math.max(0, Math.min(10, Number(c.state.pressureBar ?? 0)))
  const needleAngle = Math.PI * 0.75 + (pressureBar / 10) * Math.PI * 1.5
  useFrame(() => {
    if (rodRef.current) rodRef.current.position.y = -pos.current * p.strokeMm
    if (needleRef.current) needleRef.current.rotation.z = -(needleAngle - Math.PI * 1.5)
  })
  const y0 = -p.totalHeightMm / 2
  const postX = W / 2 - p.profileMm / 2
  const post = tSlotProfileGeometry(p.profileMm, H - p.profileMm)
  const beam = tSlotProfileGeometry(p.profileMm, W)
  const dial = gaugeDialTexture()
  const beamBottom = y0 + H - p.profileMm
  const beamY = beamBottom + p.profileMm / 2
  const beamTop = y0 + H
  const cylBottom = beamTop + 6
  const cylTop = cylBottom + p.bodyMm
  const cylR = p.boreMm / 2 + 2.5
  const plateBottom = beamBottom - p.plateDropMm
  return (
    <group>
      {/* Pórtico em perfil 30 × 30 */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh geometry={post} position={[s * postX, y0 + (H - p.profileMm) / 2, 0]} castShadow receiveShadow>
            <Mat f={ALU} name="Perfil do pórtico" />
          </mesh>
          <AngleBracket size={22} position={[s * (postX + p.profileMm / 2), y0, 0]} rotationY={s > 0 ? 0 : Math.PI} />
        </group>
      ))}
      <mesh geometry={beam} position={[0, beamY, 0]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <Mat f={ALU} name="Travessa do pórtico" />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (W / 2 + 0.6), beamY, 0]}>
          <boxGeometry args={[1, p.profileMm - 0.6, p.profileMm - 0.6]} />
          <Mat f={PA_BLACK} name="Tampa de topo" />
        </mesh>
      ))}
      {/* Flange do cilindro aparafusada sobre a travessa */}
      <mesh position={[0, beamTop + 3, 0]} castShadow>
        <boxGeometry args={[56, 6, 46]} />
        <Mat f={ALU_MILLED} name="Flange do cilindro" />
      </mesh>
      {[[-20, -15], [20, -15], [-20, 15], [20, 15]].map(([x, z], i) => <CapScrew key={i} position={[x, beamTop + 6, z]} d={3.6} />)}
      {/* Cilindro Ø32 de dupla ação (camisa perfilada com cabeças) */}
      <mesh position={[0, (cylBottom + cylTop) / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[cylR * 2, p.bodyMm - 18, cylR * 2]} />
        <Mat f={ALU} name="Camisa perfilada do cilindro" />
      </mesh>
      {[cylTop - 5, cylBottom + 5].map((y, i) => (
        <mesh key={i} position={[0, y, 0]} castShadow>
          <boxGeometry args={[cylR * 2 + 4, 10, cylR * 2 + 4]} />
          <Mat f={ALU_DARK} name="Cabeça do cilindro" />
        </mesh>
      ))}
      <PushInFitting position={[0, cylTop - 5, cylR + 2]} rotation={[Math.PI / 2, 0, 0]} d={5} />
      <PushInFitting position={[0, cylBottom + 5, cylR + 2]} rotation={[Math.PI / 2, 0, 0]} d={5} />
      <FlowRegulator position={[0, cylTop - 5, cylR + 2]} rotation={[Math.PI / 2, 0, 0]} />
      {/* Etiqueta impressa CILINDRO 4 na face frontal da camisa */}
      <LabelPlate text={textOf(c.state.labelText) || 'CILINDRO 4'} position={[0, (cylBottom + cylTop) / 2, cylR + 0.15]} w={66} h={12} />
      <ReedSensor position={[cylR + 2.4, cylTop - 22, 0]} rotation={[0, 0, Math.PI / 2]} active={pct <= 8} />
      <ReedSensor position={[cylR + 2.4, cylBottom + 22, 0]} rotation={[0, 0, Math.PI / 2]} active={pct >= 92} />
      {/* Haste (atravessa a travessa) + prato de estampagem Ø65 */}
      <group ref={rodRef} name="Prensa_Haste">
        <mesh position={[0, (plateBottom + 8 + beamBottom) / 2 + 4, 0]} castShadow>
          <cylinderGeometry args={[6, 6, beamBottom - plateBottom - 8 + 8, 20]} />
          <Mat f={CHROME} name="Haste cromada" />
        </mesh>
        <mesh position={[0, plateBottom + 11, 0]}>
          <cylinderGeometry args={[10, 10, 6, 6]} />
          <Mat f={STEEL} name="Porca da haste" />
        </mesh>
        <mesh position={[0, plateBottom + 16, 0]}>
          <cylinderGeometry args={[9.2, 9.2, 5, 6]} />
          <Mat f={STEEL} name="Porca da haste" />
        </mesh>
        <mesh position={[0, plateBottom + 4, 0]} castShadow>
          <cylinderGeometry args={[p.plateDiameterMm / 2, p.plateDiameterMm / 2, 8, 48]} />
          <Mat f={STEEL} name="Prato de estampagem" />
        </mesh>
      </group>
      {/* Manómetro Ø40 na face da travessa */}
      <group position={[W / 2 - 40, beamY, p.profileMm / 2 + 4]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[21, 21, 8, 36]} />
          <Mat f={CHROME} name="Caixa do manómetro" />
        </mesh>
        <mesh position={[0, 0, 4.1]}>
          <circleGeometry args={[19, 40]} />
          <meshStandardMaterial name="Mostrador do manómetro (ecrã)" map={dial ?? undefined} color={dial ? '#ffffff' : '#f8fafc'} roughness={0.5} metalness={0} />
        </mesh>
        <mesh ref={needleRef} position={[0, 0, 4.6]}>
          <boxGeometry args={[1.2, 15, 0.6]} />
          <meshStandardMaterial name="Ponteiro do manómetro" color="#dc2626" roughness={0.4} />
        </mesh>
        <mesh position={[0, 0, 4.8]}>
          <circleGeometry args={[18.5, 40]} />
          <meshPhysicalMaterial name="Vidro do manómetro" color="#ffffff" transparent opacity={0.12} roughness={0.05} transmission={0} userData={{ keepTransparent: true }} />
        </mesh>
      </group>
    </group>
  )
}

function SupportBlock({ c }: { c: ElectricalComponent }) {
  const d = supportBlockDimsOf(c.state)
  const g = recessedBlockGeometry(d.lengthMm, d.heightMm, d.depthMm, 0.01, 0.01)
  const sx = d.lengthMm / 2 - 10, sz = d.depthMm / 2 - 10
  return (
    <group>
      <mesh geometry={g} castShadow receiveShadow>
        <Mat f={ALU_MILLED} name="Bloco maquinado" />
      </mesh>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z], i) => <CapScrew key={i} position={[x * sx, d.heightMm / 2, z * sz]} d={4.2} />)}
    </group>
  )
}

/* ===================================================== transferência (braço) */

function RotaryArm({ c, onPatch }: { c: ElectricalComponent; onPatch?: (patch: MechatronicsPatch) => void }) {
  const a = MEC_DIMS.rotaryArm
  const angle = Number(c.state.angleDeg ?? 0)
  const down = Math.max(0, Math.min(100, Number(c.state.armDownPct ?? (c.state.armDown ? 100 : 0))))
  const vacuum = !!c.state.vacuumActive
  const held = typeof c.state.holding === 'string' && c.state.holding ? workpieceMaterialOf(c.state.holding) : null
  const rotRef = useRef<THREE.Group>(null)
  const cylinderRodRef = useRef<THREE.Group>(null)
  const angleSm = useSmoothed((angle * Math.PI) / 180, 12)
  const downSm = useSmoothed(down / 100, 10)
  useFrame(() => {
    if (rotRef.current) rotRef.current.rotation.y = -angleSm.current - Math.PI / 2
    if (cylinderRodRef.current) cylinderRodRef.current.position.y = -downSm.current * a.cylinderStrokeMm
  })
  const y0 = -ARM_TOTAL_HEIGHT_MM / 2
  const housingTop = y0 + 12
  const wheelTop = housingTop + 16
  const discY = wheelTop + a.discThicknessMm / 2
  const towerBase = wheelTop + a.discThicknessMm
  const towerTop = towerBase + a.towerMm
  const tower = tSlotProfileGeometry(30, a.towerMm)
  const wheel = bevelGearGeometry(MEC_DIMS.gearmotor.wheelDiameterMm / 2, 12, 30)
  const cup = bellowsCupGeometry(a.cupDiameterMm)
  const armLen = a.armLengthMm
  const armBack = 30
  // Braço trapezoidal aligeirado (fiel às fotos ATEC): 2 rasgos oblongos e ponta arredondada.
  const armPlate = taperedArmGeometry(armLen, 34, 20, 8, [
    { x: -armLen * 0.25, w: 58, h: 12 },
    { x: armLen * 0.04, w: 58, h: 12 },
  ])
  const tipX = ARM_TIP_MM
  const STEM = ARM_CUP_STEM_MM
  return (
    <group onDoubleClick={(e) => { if (!onPatch) return; e.stopPropagation(); onPatch({ manualVacuum: !c.state.manualVacuum }) }}>
      {/* Caixa do rolamento fixa à base + sensor de referência */}
      <mesh position={[0, y0 + 6, 0]} castShadow receiveShadow>
        <boxGeometry args={[96, 12, 96]} />
        <Mat f={ALU_MILLED} name="Caixa do rolamento" />
      </mesh>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => <CapScrew key={i} position={[sx * 38, y0 + 12, sz * 38]} d={4} />)}
      {/* Correia dentada sob o disco: veio vertical do motorredutor aciona a torre */}
      <mesh position={[0, housingTop + 4, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[26, 3.2, 10, 40]} />
        <Mat f={RUBBER} name="Correia dentada da torre" />
      </mesh>
      <group position={[0, y0 + 12, a.discDiameterMm / 2 + 14]}>
        <mesh position={[0, 14, 0]} castShadow>
          <boxGeometry args={[18, 28, 4]} />
          <Mat f={STEEL} name="Suporte do sensor de referência" />
        </mesh>
        <mesh position={[0, 24, -8]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[4, 4, 26, 16]} />
          <Mat f={BRASS} name="Corpo M8 niquelado" />
        </mesh>
        <mesh position={[0, 24, 6]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[3, 3, 6, 12]} />
          <meshStandardMaterial name="LED do sensor" color={c.state.homeActive ? '#fbbf24' : '#3f3f46'} emissive={c.state.homeActive ? '#f59e0b' : '#000000'} emissiveIntensity={c.state.homeActive ? 1.2 : 0} />
        </mesh>
      </group>
      <group ref={rotRef} name="Braco_Torre_Rotacao">
        {/* Roda cónica Ø60 solidária ao eixo da torre */}
        <mesh geometry={wheel} position={[0, housingTop, 0]} castShadow>
          <Mat f={STEEL} name="Roda cónica" />
        </mesh>
        {/* Disco rotativo Ø140 × 15 com furação */}
        <mesh position={[0, discY, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[a.discDiameterMm / 2, a.discDiameterMm / 2, a.discThicknessMm, 64]} />
          <Mat f={ALU_MILLED} name="Disco rotativo" />
        </mesh>
        {Array.from({ length: 6 }, (_, i) => {
          const t = (i / 6) * Math.PI * 2
          return <CapScrew key={i} position={[Math.cos(t) * 52, discY + a.discThicknessMm / 2, Math.sin(t) * 52]} d={3.6} />
        })}
        {/* Bandeira de referência (aciona o sensor em 0°) */}
        <mesh position={[a.discDiameterMm / 2 + 2, discY - 2, 0]} castShadow>
          <boxGeometry args={[6, 6, 10]} />
          <Mat f={STEEL} name="Bandeira de referência" />
        </mesh>
        {/* Placa quadrada + torre */}
        <mesh position={[0, towerBase + 3, 0]} castShadow>
          <boxGeometry args={[60, 6, 60]} />
          <Mat f={ALU_MILLED} name="Placa quadrada superior" />
        </mesh>
        <mesh geometry={tower} position={[0, towerBase + a.towerMm / 2, 0]} castShadow receiveShadow>
          <Mat f={ALU} name="Coluna do braço" />
        </mesh>
        {/* Estrutura rígida aparafusada à torre: não inclina durante o curso Z. */}
        <group name="Braco_Estrutura_Metalica" position={[0, y0 + ARM_PIVOT_MM, 0]}>
          {/* Braço trapezoidal aligeirado com dois rasgos oblongos */}
          <mesh geometry={armPlate} position={[armLen / 2 - armBack, 6, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
            <Mat f={ALU_MILLED} name="Braço aligeirado" />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[0, 2, s * 17]} castShadow>
              <boxGeometry args={[26, 20, 4]} />
              <Mat f={ALU_DARK} name="Esquadro de fixação do braço" />
            </mesh>
          ))}
          {/* Tubo de vácuo azul ao longo do braço */}
          <mesh position={[tipX / 2 - 10, 13, 9]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[2, 2, tipX - 14, 10]} />
            <Mat f={PU_TUBE} name="Tubo de poliuretano" />
          </mesh>
          {/* Filtro em linha ZFC do circuito de vácuo (junto à base do braço) */}
          <group position={[44, 13, 9]} rotation={[0, 0, Math.PI / 2]}>
            <mesh castShadow>
              <cylinderGeometry args={[6.2, 6.2, 26, 20]} />
              <Mat f={PA_GREY} name="Corpo do filtro ZFC" />
            </mesh>
            <mesh position={[0, 15, 0]}>
              <cylinderGeometry args={[5.4, 5.4, 5, 20]} />
              <Mat f={BLUE_RING} name="Tampa do filtro ZFC" />
            </mesh>
          </group>
          <LabelPlate text="ZFC" position={[44, 20.2, 9]} rotation={[0, 0, Math.PI / 2]} w={22} h={7} />
          {/* Corpo fixo do cilindro vertical na extremidade da estrutura metálica. */}
          <group name="Braco_Cilindro_Corpo" position={[tipX, ARM_CYLINDER_BASE_MM - ARM_PIVOT_MM, 0]}>
            <mesh position={[0, 5, 0]} castShadow>
              <boxGeometry args={[36, 6, 32]} />
              <Mat f={ALU_MILLED} name="Flange do cilindro da ventosa" />
            </mesh>
            <mesh position={[0, a.cylinderBodyMm / 2, 0]} castShadow receiveShadow>
              <boxGeometry args={[a.cylinderBoreMm + 6, a.cylinderBodyMm - 8, a.cylinderBoreMm + 6]} />
              <Mat f={ALU} name="Corpo fixo do cilindro vertical da ventosa" />
            </mesh>
            {[3, a.cylinderBodyMm - 3].map((y) => (
              <mesh key={y} position={[0, y, 0]} castShadow>
                <boxGeometry args={[a.cylinderBoreMm + 8, 6, a.cylinderBoreMm + 8]} />
                <Mat f={ALU_DARK} name="Cabeça do cilindro vertical" />
              </mesh>
            ))}
            {[-1, 1].map((s) => <CapScrew key={s} position={[s * 13, 8, 0]} d={3.2} />)}
            <PushInFitting position={[a.cylinderBoreMm / 2 + 4, a.cylinderBodyMm - 6, 0]} rotation={[0, 0, -Math.PI / 2]} d={3.6} />
            <LabelPlate text={textOf(c.state.labelText) || 'CILINDRO 2'} position={[0, a.cylinderBodyMm / 2, a.cylinderBoreMm / 2 + 3.15]} w={40} h={9} />
            <ReedSensor position={[0, 5, a.cylinderBoreMm / 2 + 3.3]} active={down <= 4} label={textOf(c.state.sensorRecLabel) || 'B6'} />
            <ReedSensor position={[0, a.cylinderBodyMm - 5, a.cylinderBoreMm / 2 + 3.3]} active={down >= 96} label={textOf(c.state.sensorAvaLabel) || 'B7'} />
            {/* Só a haste e o conjunto ventosa/peça se deslocam verticalmente. */}
            <group ref={cylinderRodRef} name="Braco_Cilindro_Z">
            <PushInFitting position={[0, 0, 15]} rotation={[Math.PI / 2, 0, 0]} d={3.6} />
            <mesh position={[0, -2, 0]}>
              <cylinderGeometry args={[4.5, 4.5, 10, 6]} />
              <Mat f={BRASS} name="Porca da haste da ventosa" />
            </mesh>
            <mesh position={[0, (a.cylinderStrokeMm - STEM) / 2, 0]} castShadow>
              <cylinderGeometry args={[3, 3, a.cylinderStrokeMm + STEM, 18]} />
              <Mat f={CHROME} name="Haste cromada do cilindro da ventosa" />
            </mesh>
            <mesh geometry={cup} position={[0, -STEM, 0]} castShadow>
              <meshStandardMaterial name="Borracha da ventosa" color={vacuum ? '#1f2937' : RUBBER.color} roughness={0.78} metalness={0.02} />
            </mesh>
            {held && <Workpiece material={held} position={[0, -STEM - 17 - MEC_DIMS.workpiece.heightMm / 2, 0]} />}
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}

function DcGearmotor({ c }: { c: ElectricalComponent }) {
  const g = MEC_DIMS.gearmotor
  const running = c.state.running === true
  const dir = c.state.direction === 'ccw' ? -1 : 1
  const spinRef = useRef<THREE.Group>(null)
  const encRef = useRef<THREE.Group>(null)
  const { invalidate } = useThree()
  const pinion = bevelGearGeometry(g.pinionDiameterMm / 2, 9, 15)
  useFrame((_, delta) => {
    if (!running) return
    if (spinRef.current) spinRef.current.rotation.x += dir * delta * 3.1
    if (encRef.current) encRef.current.rotation.x += dir * delta * 6.2
    invalidate()
  })
  const axisY = 8
  const r = g.motorDiameterMm / 2
  const xEnc = -106
  return (
    <group>
      {/* Suporte em L aparafusado à base */}
      <mesh position={[38, -31 + 2.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[60, 5, 56]} />
        <Mat f={ALU_MILLED} name="Suporte do motor" />
      </mesh>
      <mesh position={[64, axisY - 10, 0]} castShadow>
        <boxGeometry args={[6, 46, 56]} />
        <Mat f={ALU_MILLED} name="Flange do motor" />
      </mesh>
      {[[-18, -18], [18, -18], [-18, 18], [18, 18]].map(([x, z], i) => <CapScrew key={i} position={[38 + x, -26, z]} d={3.4} />)}
      {/* Encoder incremental Ø38 RT3806-AB-400N com bucim de cabo */}
      <mesh position={[xEnc + 11, axisY, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[g.encoderDiameterMm / 2, g.encoderDiameterMm / 2, 22, 32]} />
        <Mat f={PA_BLACK} name="Corpo do encoder" />
      </mesh>
      {/* Manga impressa do encoder (RT3806) por cima do corpo */}
      <mesh position={[xEnc + 11, axisY, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[g.encoderDiameterMm / 2 + 0.25, g.encoderDiameterMm / 2 + 0.25, 13, 32, 1, true]} />
        <meshStandardMaterial name="Etiqueta do encoder" map={rotaryEncoderWrapTexture() ?? undefined} color="#ffffff" roughness={0.62} metalness={0.05} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[xEnc + 11, axisY + g.encoderDiameterMm / 2 + 3, 0]} castShadow>
        <cylinderGeometry args={[3.5, 4, 8, 12]} />
        <Mat f={PA_GREY} name="Bucim do cabo do encoder" />
      </mesh>
      <group ref={encRef} name="Encoder_Veio" position={[xEnc + 31, axisY, 0]}>
        {/* Disco ótico de 4 pás do encoder (roda com o veio) */}
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} position={[0, 0, 0]} rotation={[0, 0, (i * Math.PI) / 2]}>
            <boxGeometry args={[0.8, 16, 12]} />
            <Mat f={ALU_DARK} name="Disco ótico de pás" />
          </mesh>
        ))}
        {/* Acoplamento flexível de hélice */}
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[8, 8, 18, 24]} />
          <Mat f={ALU_MILLED} name="Acoplamento flexível" />
        </mesh>
        {[-4, 0, 4].map((x) => (
          <mesh key={x} position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[8.05, 0.5, 6, 24]} />
            <meshStandardMaterial color="#5b6470" roughness={0.6} metalness={0.6} />
          </mesh>
        ))}
      </group>
      {/* Motor DC Ø36 × 95 (carcaça de aço) + manga impressa Portescap */}
      <mesh position={[-66 + 47.5, axisY, 0]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[r, r, 95, 40]} />
        <meshStandardMaterial name="Carcaça do motor DC" color="#2a2f36" roughness={0.38} metalness={0.72} />
      </mesh>
      <mesh position={[-66 + 47.5, axisY, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[r + 0.22, r + 0.22, 44, 40, 1, true]} />
        <meshStandardMaterial name="Etiqueta do motor Portescap" map={portescapMotorLabelTexture() ?? undefined} color="#ffffff" roughness={0.6} metalness={0.05} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[-66 + 3, axisY, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[r - 2, r, 6, 40]} />
        <Mat f={PA_BLACK} name="Tampa traseira do motor" />
      </mesh>
      {/* Borne branco de 2 polos com parafusos de ligação */}
      <mesh position={[-66 + 4, axisY + 4, 15]} castShadow>
        <boxGeometry args={[16, 13, 7]} />
        <Mat f={PA_LIGHT} name="Borne branco de 2 polos" />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[-66 + 4 + s * 4.2, axisY + 4.5, 18.7]}>
          <boxGeometry args={[4.4, 4.4, 0.6]} />
          <Mat f={BRASS} name="Parafuso do borne" />
        </mesh>
      ))}
      {[1, -1].map((s) => (
        <mesh key={s} position={[-66, axisY + s * 7, 8]}>
          <boxGeometry args={[4, 2.4, 1]} />
          <Mat f={BRASS} name="Terminal do motor" />
        </mesh>
      ))}
      <mesh position={[-66 - 6, axisY + 7, 8]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[1.2, 1.2, 10, 8]} />
        <meshStandardMaterial color="#dc2626" roughness={0.5} />
      </mesh>
      <mesh position={[-66 - 6, axisY - 7, 8]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[1.2, 1.2, 10, 8]} />
        <meshStandardMaterial color="#111827" roughness={0.5} />
      </mesh>
      <mesh position={[29 + 17.5, axisY, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[r, r, 35, 40]} />
        <Mat f={STEEL} name="Redutor planetário" />
      </mesh>
      {[34, 46, 58].map((x) => (
        <mesh key={x} position={[x, axisY, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[r + 0.2, 0.6, 6, 40]} />
          <Mat f={ALU_DARK} name="Junta do redutor" />
        </mesh>
      ))}
      <group ref={spinRef} name="Motor_Pinhao" position={[67, axisY, 0]}>
        <mesh position={[8, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[3, 3, 16, 14]} />
          <Mat f={CHROME} name="Veio de saída" />
        </mesh>
        {/* Pinhão cónico Ø30 (vértice para +X, engrena na roda Ø60 da torre) */}
        <mesh geometry={pinion} position={[16, 0, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
          <Mat f={STEEL} name="Pinhão cónico" />
        </mesh>
      </group>
      <LabelPlate text={textOf(c.state.labelText) || 'M1'} position={[-66 + 47.5, axisY + r + 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]} w={30} h={9} />
    </group>
  )
}

function MicroSwitchRoller({ c, onPatch }: { c: ElectricalComponent; onPatch?: (patch: MechatronicsPatch) => void }) {
  const pressed = !!c.state.pressed
  const leverRef = useRef<THREE.Group>(null)
  const sm = useSmoothed(pressed ? 1 : 0, 16)
  useFrame(() => { if (leverRef.current) leverRef.current.rotation.z = -0.13 + sm.current * 0.12 })
  return (
    // Em «alimentador» o rolete segue a peça (motor da mecatrónica); só o modo manual aceita o clique.
    <group onClick={(e) => { if (!onPatch || c.state.actuation !== 'manual') return; e.stopPropagation(); onPatch({ pressed: !pressed }) }}>
      {/* Chapa de montagem traseira (fixada à lateral da gaveta) */}
      <mesh position={[0, -2, -6.4]} castShadow>
        <boxGeometry args={[40, 26, 2]} />
        <Mat f={STEEL} name="Chapa do microinterruptor" />
      </mesh>
      {/* Corpo tipo V em termoplástico preto */}
      <mesh position={[0, -4, 0]} castShadow receiveShadow>
        <boxGeometry args={[28, 15.9, 10.3]} />
        <meshStandardMaterial name="Corpo do microinterruptor" color="#1b1e23" roughness={0.45} metalness={0.05} />
      </mesh>
      {[-9.5, 9.5].map((x) => (
        <mesh key={x} position={[x, -6, 5.2]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[1.6, 1.6, 0.5, 14]} />
          <meshStandardMaterial color="#050607" roughness={0.9} />
        </mesh>
      ))}
      {/* Terminais C / NA / NF isolados a vermelho (Faston) */}
      {[-9, 0, 9].map((x) => (
        <group key={x}>
          <mesh position={[x, -13.5, 0]}>
            <boxGeometry args={[3.2, 4, 0.6]} />
            <Mat f={BRASS} name="Terminal de lingueta" />
          </mesh>
          <mesh position={[x, -15.8, 0]}>
            <cylinderGeometry args={[1.8, 1.8, 4, 10]} />
            <meshStandardMaterial name="Isolador do terminal" color="#b91c1c" roughness={0.55} />
          </mesh>
        </group>
      ))}
      <mesh position={[-7, 4.6, 0]}>
        <boxGeometry args={[3, 2, 3]} />
        <meshStandardMaterial name="Pino de acionamento" color="#b91c1c" roughness={0.5} />
      </mesh>
      {/* Etiqueta FC 1 / FC 2 na face do corpo */}
      <LabelPlate text={textOf(c.state.labelText)} position={[0, -4, 5.25]} w={24} h={7} />
      {/* Alavanca de aço com rolete */}
      <group ref={leverRef} position={[11.5, 4.2, 0]}>
        <mesh position={[-14, 0.4, 0]} castShadow>
          <boxGeometry args={[28, 0.8, 4.2]} />
          <Mat f={STEEL} name="Alavanca de aço" />
        </mesh>
        <mesh position={[-28, 2.8, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[2.6, 2.6, 3.6, 18]} />
          <meshStandardMaterial name="Rolete" color="#e5e7eb" roughness={0.35} metalness={0.2} />
        </mesh>
      </group>
    </group>
  )
}

function VacuumEjector({ c }: { c: ElectricalComponent }) {
  const active = !!c.state.vacuumActive
  return (
    <group>
      <mesh position={[-14, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[52, 20, 14]} />
        <meshStandardMaterial name="Corpo do ejetor" color="#1f4f8f" roughness={0.36} metalness={0.55} />
      </mesh>
      <LabelPlate text={textOf(c.state.labelText) || 'C4A'} position={[-14, -3.2, 7.05]} w={24} h={6} bg="#e2e8f0" />
      {[-33, 5].map((x) => (
        <mesh key={x} position={[x, 2, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[1.8, 1.8, 14.4, 12]} />
          <meshStandardMaterial color="#060708" roughness={0.9} />
        </mesh>
      ))}
      {/* Silenciador de escape em polietileno sinterizado */}
      <mesh position={[28, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[7, 7, 30, 24]} />
        <meshStandardMaterial name="Silenciador PE sinterizado" color={active ? '#f8fafc' : '#e5e7eb'} roughness={0.92} metalness={0} />
      </mesh>
      <mesh position={[14, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[4.6, 4.6, 6, 6]} />
        <Mat f={BRASS} name="Rosca do silenciador" />
      </mesh>
      <PushInFitting position={[-26, 10, 0]} d={4.2} />
      <PushInFitting position={[-40, 0, 0]} rotation={[0, 0, Math.PI / 2]} d={4.2} />
      <mesh position={[-2, 10.6, 0]}>
        <sphereGeometry args={[2.2, 12, 10]} />
        <meshStandardMaterial name="Indicador de vácuo" color={active ? '#22c55e' : '#334155'} emissive={active ? '#16a34a' : '#000000'} emissiveIntensity={active ? 1 : 0} />
      </mesh>
    </group>
  )
}

function DragChain({ c }: { c: ElectricalComponent }) {
  const d = dragChainDimsOf(c.state)
  const g = dragChainGeometry(d.lengthMm, d.widthMm, d.linkHeightMm, d.bendRadiusMm)
  return (
    <mesh geometry={g} castShadow receiveShadow>
      <meshStandardMaterial name="Poliamida preta da esteira" color="#15181d" roughness={0.6} metalness={0.04} />
    </mesh>
  )
}

/* ============================================ gaveta, válvulas, sensores, HMI */

/** Cilindro 3 da gaveta de estampagem: corpo horizontal em Z, haste com forquilha e reed B2/B1. */
function DrawerCylinder({ c }: { c: ElectricalComponent }) {
  const d = MEC_DIMS.drawerCylinder
  const size = mechatronicsSizeMm('mecDrawerCylinder', c.state)!
  const pct = Math.max(0, Math.min(100, Number(c.state.positionPct ?? 0)))
  const pos = useSmoothed(pct / 100, 9)
  const rodRef = useRef<THREE.Group>(null)
  useFrame(() => { if (rodRef.current) rodRef.current.position.z = pos.current * d.strokeMm })
  const r = d.boreMm / 2 + 1.6
  const axisY = 4
  const zRear = -size.z / 2 + 6
  const bodyFront = zRear + d.bodyMm
  const footY = (-size.y / 2 + axisY - r) / 2
  const footH = axisY - r + size.y / 2
  return (
    <group rotation={c.state.facing === 'z-' ? [0, Math.PI, 0] : [0, 0, 0]}>
      {/* Pés em L de fixação aparafusados à base */}
      {[zRear + 22, zRear + 92].map((z, i) => (
        <group key={i}>
          <mesh position={[0, footY, z]} castShadow>
            <boxGeometry args={[40, footH, 8]} />
            <Mat f={STEEL} name="Pé de fixação" />
          </mesh>
          <mesh position={[0, -size.y / 2 + 1.4, z]} castShadow>
            <boxGeometry args={[46, 2.8, 16]} />
            <Mat f={STEEL} name="Pé de fixação" />
          </mesh>
          <CapScrew position={[-15, -size.y / 2 + 2.8, z]} d={3.2} />
          <CapScrew position={[15, -size.y / 2 + 2.8, z]} d={3.2} />
        </group>
      ))}
      {/* Corpo ISO 6432 ao longo de +Z (a tampa traseira fica do lado do pórtico) */}
      <group position={[0, axisY, zRear]} rotation={[0, -Math.PI / 2, 0]}>
        <RoundCylinderBody bore={d.boreMm} length={d.bodyMm} />
        <PushInFitting position={[7, r + 3, 0]} d={4.4} />
        <PushInFitting position={[d.bodyMm - 7, r + 3, 0]} d={4.4} />
        <FlowRegulator position={[d.bodyMm - 7, -(r + 3), 0]} rotation={[0, 0, Math.PI]} />
        <LabelPlate text={textOf(c.state.labelText) || 'CILINDRO 3'} position={[d.bodyMm / 2, r + 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]} w={58} h={10} />
        <ReedSensor position={[24, r + 3.4, 0]} active={pct <= 8} label={textOf(c.state.sensorRecLabel) || 'B2'} />
        <ReedSensor position={[d.bodyMm - 24, r + 3.4, 0]} active={pct >= 92} label={textOf(c.state.sensorAvaLabel) || 'B1'} />
      </group>
      {/* Haste cromada + forquilha de arrasto da gaveta FC 2 */}
      <group ref={rodRef} name="CILINDRO3_Haste">
        <mesh position={[0, axisY, bodyFront + 6]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[4, 4, 18, 20]} />
          <Mat f={CHROME} name="Haste cromada" />
        </mesh>
        <mesh position={[0, axisY, bodyFront + 17]} castShadow>
          <boxGeometry args={[20, 16, 6]} />
          <Mat f={ALU_MILLED} name="Forquilha de arrasto" />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 8, axisY, bodyFront + 23]} castShadow>
            <boxGeometry args={[4, 16, 12]} />
            <Mat f={ALU_MILLED} name="Forquilha de arrasto" />
          </mesh>
        ))}
        <mesh position={[0, axisY, bodyFront + 23]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[2.4, 2.4, 20, 12]} />
          <Mat f={STEEL} name="Perno da forquilha" />
        </mesh>
      </group>
    </group>
  )
}

/** Ilha de eletroválvulas Festo 2 × 5/2 (C1A / C2A) com bobinas 24 V DC e comandos manuais azuis. */
function ValveIsland({ c }: { c: ElectricalComponent }) {
  const v = MEC_DIMS.valveIsland
  const halfL = v.lengthMm / 2
  const halfD = v.depthMm / 2
  const stationOn = (n: number) => Boolean(c.state[`station${n}On`])
  return (
    <group>
      {/* Sub-base coletora em alumínio com rasgos T laterais */}
      <mesh position={[0, -v.heightMm / 2 + 7, 0]} castShadow receiveShadow>
        <boxGeometry args={[v.lengthMm, 14, v.depthMm]} />
        <Mat f={ALU_MILLED} name="Sub-base coletora" />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (halfL - 2), -v.heightMm / 2 + 16, 0]} castShadow>
          <boxGeometry args={[4, 22, v.depthMm - 4]} />
          <Mat f={ALU_DARK} name="Tampa lateral da sub-base" />
        </mesh>
      ))}
      {/* Duas eletroválvulas 5/2 com bobina, LED e comando manual azul */}
      {[-1, 1].map((s, idx) => {
        const on = stationOn(idx + 1)
        const cx = s * 22
        return (
          <group key={s} position={[cx, 0, 0]}>
            <mesh position={[0, 2.5, 0]} castShadow receiveShadow>
              <boxGeometry args={[34, 21, v.depthMm - 12]} />
              <Mat f={PA_GREY} name="Corpo da eletroválvula 5/2" />
            </mesh>
            <mesh position={[0, 2.5, halfD - 5.9]}>
              <boxGeometry args={[30, 17, 0.6]} />
              <Mat f={PA_BLACK} name="Face frontal da eletroválvula" />
            </mesh>
            {s > 0 && (
              <mesh position={[17, 2.5, 0]} castShadow>
                <boxGeometry args={[9, 18, v.depthMm - 16]} />
                <Mat f={BLACK_OXIDE} name="Bobina 24 V DC" />
              </mesh>
            )}
            {s < 0 && (
              <mesh position={[-17, 2.5, 0]} castShadow>
                <boxGeometry args={[9, 18, v.depthMm - 16]} />
                <Mat f={BLACK_OXIDE} name="Bobina 24 V DC" />
              </mesh>
            )}
            <StatusLed position={[s * 8, 8.5, halfD - 5.4]} on={on} color="#fbbf24" size={1.8} />
            {/* Comando manual auxiliar (botão azul) */}
            <mesh position={[-s * 7, 8.5, halfD - 5.2]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[2.6, 2.6, 3.2, 12]} />
              <Mat f={BLUE_RING} name="Comando manual azul" />
            </mesh>
            {/* Racores Push-In das ligações A / B */}
            <PushInFitting position={[-6, 13, -12]} d={4.4} />
            <PushInFitting position={[6, 13, 12]} d={4.4} />
            <LabelPlate text={`${idx + 1}`} position={[0, -3, halfD - 5.7]} w={8} h={6} />
          </group>
        )
      })}
      {/* Alimentação P à esquerda e retorno 0V à direita */}
      <PushInFitting position={[-halfL + 0.5, -8, 0]} rotation={[0, 0, Math.PI / 2]} d={5} />
      <mesh position={[halfL - 0.5, -8, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[3.4, 3.4, 4, 6]} />
        <Mat f={BRASS} name="Conector de alimentação" />
      </mesh>
      {/* Etiqueta C1A / C2A na face frontal da sub-base */}
      <LabelPlate text={textOf(c.state.islandTag) || 'C1A'} position={[0, -v.heightMm / 2 + 7, halfD + 0.15]} w={30} h={10} />
    </group>
  )
}

/** Fotocélula difusa M18 (S. OTICO · B11) em suporte L vertical de alumínio. */
function OpticalSensor({ c }: { c: ElectricalComponent }) {
  const s = MEC_DIMS.opticalSensor
  const triggered = !!c.state.triggered
  const halfY = s.heightMm / 2
  const barrelY = 18
  const lensX = 17
  return (
    <group rotation={c.state.facing === 'x-' ? [0, Math.PI, 0] : [0, 0, 0]}>
      {/* Suporte L: prumo vertical + base aparafusada */}
      <mesh position={[-26, -1.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[4, 63, 30]} />
        <Mat f={ALU_MILLED} name="Suporte em L do sensor" />
      </mesh>
      <mesh position={[-17, -halfY + 2.5, 0]} castShadow>
        <boxGeometry args={[46, 5, 30]} />
        <Mat f={ALU_MILLED} name="Suporte em L do sensor" />
      </mesh>
      {[[-34, -11], [-34, 11], [-6, -11], [-6, 11]].map(([x, z], i) => (
        <CapScrew key={i} position={[x, -halfY + 5, z]} d={3.2} />
      ))}
      {/* Corpo cilíndrico M18 roscado, eixo +X */}
      <mesh position={[-4, barrelY, 0]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[9, 9, 42, 32]} />
        <Mat f={STEEL} name="Corpo M18 niquelado" />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[-20 + i * 0.9, barrelY, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[9.05, 0.35, 6, 32]} />
          <Mat f={ALU_DARK} name="Rosca M18" />
        </mesh>
      ))}
      {/* Porcas sextavadas de fixação ao suporte */}
      {[-16.6, -12.4].map((x) => (
        <mesh key={x} position={[x, barrelY, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[11, 11, 3.2, 6]} />
          <Mat f={STEEL} name="Porca sextavada M18" />
        </mesh>
      ))}
      {/* Tampa traseira com bucim e cabo */}
      <mesh position={[-27, barrelY, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[8.4, 8.4, 6, 24]} />
        <Mat f={PA_BLACK} name="Tampa traseira do sensor" />
      </mesh>
      <mesh position={[-27, barrelY - 10, 0]}>
        <cylinderGeometry args={[2.4, 2.4, 18, 10]} />
        <Mat f={PA_BLACK} name="Cabo do sensor ótico" />
      </mesh>
      {/* Ótica frontal e anel de LED de comutação */}
      <mesh position={[lensX, barrelY, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[8.8, 9, 3, 32]} />
        <Mat f={PA_BLACK} name="Aro da ótica" />
      </mesh>
      <mesh position={[lensX + 1.8, barrelY, 0]} rotation={[0, Math.PI / 2, 0]}>
        <circleGeometry args={[6.4, 28]} />
        <meshStandardMaterial
          name="Lente do sensor ótico"
          color={triggered ? '#fca5a5' : '#1e2430'}
          emissive={triggered ? '#dc2626' : '#000000'}
          emissiveIntensity={triggered ? 1.3 : 0}
          roughness={0.12}
          metalness={0.35}
        />
      </mesh>
      <StatusLed position={[lensX - 6, barrelY + 8.2, 0]} on={triggered} color="#f97316" size={1.6} />
      <LabelPlate text={textOf(c.state.labelText) || 'S. OTICO'} position={[-28.15, 24, 0]} rotation={[0, -Math.PI / 2, 0]} w={26} h={8.5} />
    </group>
  )
}

/** Sensor indutivo faceado M12 (S. INDUTIVO) embutido na zona de recolha. */
function InductiveSensor({ c }: { c: ElectricalComponent }) {
  const s = MEC_DIMS.inductiveSensor
  const triggered = !!c.state.triggered
  const topY = s.heightMm / 2
  const bodyTop = topY - 6
  return (
    <group>
      {/* Corpo roscado M12 com face de deteção no topo */}
      <mesh position={[0, (bodyTop - topY) / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[6, 6, bodyTop + topY, 28]} />
        <Mat f={STEEL} name="Corpo M12 niquelado" />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[0, -topY + 5 + i * 6, 0]}>
          <torusGeometry args={[6.05, 0.3, 6, 28]} />
          <Mat f={ALU_DARK} name="Rosca M12" />
        </mesh>
      ))}
      {/* Porcas de fixação faceadas */}
      <mesh position={[0, topY - 13, 0]}>
        <cylinderGeometry args={[8.4, 8.4, 3, 6]} />
        <Mat f={STEEL} name="Porca sextavada M12" />
      </mesh>
      <mesh position={[0, topY - 9.4, 0]}>
        <cylinderGeometry args={[8.4, 8.4, 3, 6]} />
        <Mat f={STEEL} name="Porca sextavada M12" />
      </mesh>
      {/* Face de deteção em policarbonato e anel de LED */}
      <mesh position={[0, topY - 3, 0]}>
        <cylinderGeometry args={[6.2, 6.2, 6, 28]} />
        <Mat f={PA_BLACK} name="Aro da face de deteção" />
      </mesh>
      <mesh position={[0, topY + 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[5.4, 24]} />
        <meshStandardMaterial
          name="Lente do sensor indutivo"
          color={triggered ? '#fde68a' : '#cbd5e1'}
          emissive={triggered ? '#f59e0b' : '#000000'}
          emissiveIntensity={triggered ? 1.1 : 0}
          roughness={0.3}
          metalness={0.1}
        />
      </mesh>
      <StatusLed position={[6.6, topY - 5, 0]} on={triggered} color="#22c55e" size={1.5} />
      {/* Cabo de ligação no fundo do corpo */}
      <mesh position={[0, -topY + 1, 0]}>
        <cylinderGeometry args={[2.6, 3, 9, 10]} />
        <Mat f={PA_BLACK} name="Bucim do cabo do sensor" />
      </mesh>
      <mesh position={[6, -topY + 1, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[2.2, 2.2, 14, 10]} />
        <Mat f={PA_BLACK} name="Cabo do sensor indutivo" />
      </mesh>
    </group>
  )
}

/** Consola Siemens SIMATIC HMI KTP700 Basic em bastidor de perfil 30 × 30 (ecrã, F1–F8, caixa ventilada). */
function HmiKtp700({ c }: { c: ElectricalComponent }) {
  const h = MEC_DIMS.hmiKtp700
  const halfW = h.widthMm / 2
  const halfY = h.heightMm / 2
  const halfD = h.depthMm / 2
  const powered = c.state.powered !== false && c.state.on !== false
  const page = textOf(c.state.screenPage) || 'start-center'
  const row = Number(c.state.selectedRow ?? 1)
  const bezelW = h.bezelWidthMm
  const bezelH = h.bezelHeightMm
  const bezelY = 30
  const bezelTop = bezelY + bezelH / 2
  const bezelBottom = bezelY - bezelH / 2
  const frontZ = halfD - 3
  const screenW = 154
  const screenH = (screenW * 9) / 16
  const screenY = bezelTop - 26 - screenH / 2
  const keyY = bezelBottom + 17
  const keyW = 20
  const keyGap = 4
  const screen = ktp700ScreenTexture(powered, page, row)
  const bezel = ktp700BezelTexture()
  const backLabel = ktp700BackLabelTexture()
  const keys = Array.from({ length: 8 }, (_, i) => i + 1)
  const keyStart = -(((keyW + keyGap) * keys.length) - keyGap) / 2 + keyW / 2
  return (
    <group>
      {/* Bastidor de perfil 30 × 30: 2 montantes + 3 travessas */}
      {[-1, 1].map((s) => (
        <mesh key={`post-${s}`} geometry={tSlotProfileGeometry(30, h.heightMm)} position={[s * (halfW - 15), 0, 0]} castShadow receiveShadow>
          <Mat f={ALU} name="Perfil do bastidor HMI" />
        </mesh>
      ))}
      {[128, -64, -128].map((y) => (
        <mesh key={`beam-${y}`} geometry={tSlotProfileGeometry(30, halfW * 2 - 60)} position={[0, y, 0]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
          <Mat f={ALU} name="Perfil do bastidor HMI" />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <AngleBracket key={`brk-${s}`} size={24} position={[s * (halfW - 30), -halfY, 0]} rotationY={s > 0 ? Math.PI : 0} />
      ))}
      {/* Caixa traseira ventilada com etiqueta Siemens e ligações 24 V / PROFINET */}
      <mesh position={[0, bezelY, -13.5]} castShadow receiveShadow>
        <boxGeometry args={[200, 150, 59]} />
        <Mat f={PA_GREY} name="Caixa traseira da consola" />
      </mesh>
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={`vent-${i}`} position={[-64 + i * 16, bezelY + 58, -halfD + 1]}>
          <boxGeometry args={[3.4, 18, 3]} />
          <Mat f={PA_BLACK} name="Grelha de ventilação" />
        </mesh>
      ))}
      <mesh position={[24, bezelY - 30, -halfD + 0.1]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[86, 43]} />
        <meshStandardMaterial name="Etiqueta traseira Siemens" map={backLabel ?? undefined} color="#ffffff" roughness={0.7} metalness={0} />
      </mesh>
      {/* Ficha 24 V DC laranja + cabo PROFINET vermelho */}
      <mesh position={[52, -52, -18]} castShadow>
        <boxGeometry args={[17, 11, 15]} />
        <meshStandardMaterial name="Ficha 24 V da consola" color="#ea580c" roughness={0.5} metalness={0.05} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[52 + s * 4.4, -52, -10.2]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[1.6, 1.6, 3, 8]} />
          <Mat f={BRASS} name="Terminal da ficha 24 V" />
        </mesh>
      ))}
      <mesh position={[52, -60, -14]} rotation={[0.35, 0, 0]}>
        <cylinderGeometry args={[2.6, 2.6, 26, 10]} />
        <meshStandardMaterial name="Cabo PROFINET" color="#b91c1c" roughness={0.6} metalness={0.02} />
      </mesh>
      <mesh position={[70, -52, -34]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[4.4, 4.4, 10, 14]} />
        <Mat f={PA_GREY} name="Conector PROFINET" />
      </mesh>
      {/* Painel frontal: moldura impressa, ecrã LCD e teclas F1–F8 */}
      <mesh position={[0, bezelY, frontZ - 12]} castShadow receiveShadow>
        <boxGeometry args={[bezelW, bezelH, 24]} />
        <Mat f={PA_GREY} name="Corpo do painel operador" />
      </mesh>
      <mesh position={[0, bezelY, frontZ + 0.1]}>
        <planeGeometry args={[bezelW, bezelH]} />
        <meshStandardMaterial name="Moldura do painel SIMATIC" map={bezel ?? undefined} color="#ffffff" roughness={0.62} metalness={0.05} />
      </mesh>
      <mesh position={[0, screenY, frontZ + 0.2]}>
        <planeGeometry args={[screenW, screenH]} />
        <meshStandardMaterial
          name="Ecrã do painel SIMATIC (LCD)"
          map={screen ?? undefined}
          emissiveMap={powered ? screen ?? undefined : undefined}
          emissive={powered ? '#ffffff' : '#000000'}
          emissiveIntensity={powered ? 0.28 : 0}
          color="#ffffff"
          roughness={0.16}
          metalness={0.05}
        />
      </mesh>
      {keys.map((n, i) => {
        const x = keyStart + i * (keyW + keyGap)
        return (
          <group key={n} position={[x, keyY, frontZ + 1.3]}>
            <mesh castShadow>
              <boxGeometry args={[keyW, 14, 2.6]} />
              <Mat f={PA_LIGHT} name="Tecla de função" />
            </mesh>
            <LabelPlate text={`F${n}`} position={[0, 0, 1.35]} w={keyW - 2} h={11} bg="#e2e8f0" />
          </group>
        )
      })}
    </group>
  )
}

/** Cabeça de cada operador Ø22 do pupitre de comando. */
function OperatorHead({ kind, active }: { kind: string; active: boolean }) {
  if (kind === 'emerg') {
    return (
      <group>
        <mesh position={[0, 0, 1.6]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[15, 15, 3.2, 28]} />
          <meshStandardMaterial name="Colarinho amarelo da emergência" color="#facc15" roughness={0.45} metalness={0.05} />
        </mesh>
        <mesh position={[0, 0, 7]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[12, 13.5, 7, 28]} />
          <meshStandardMaterial name="Cogumelo de emergência" color={active ? '#7f1d1d' : '#dc2626'} roughness={0.42} metalness={0.05} />
        </mesh>
        <mesh position={[0, 0, 10.6]}>
          <sphereGeometry args={[12, 26, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial name="Cogumelo de emergência" color={active ? '#7f1d1d' : '#dc2626'} roughness={0.42} metalness={0.05} />
        </mesh>
      </group>
    )
  }
  if (kind === 'selector') {
    return (
      <group>
        <mesh position={[0, 0, 1.4]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[13, 13, 2.8, 26]} />
          <Mat f={PA_BLACK} name="Colarinho do seletor" />
        </mesh>
        <mesh position={[0, 0, 7]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[9.6, 10.4, 10, 26]} />
          <meshStandardMaterial name="Manípulo do seletor" color={active ? '#3f3f46' : '#18181b'} roughness={0.5} metalness={0.06} />
        </mesh>
        <mesh position={[0, 0, 12.3]} rotation={[0, 0, active ? Math.PI / 4 : -Math.PI / 4]}>
          <boxGeometry args={[2, 12, 1.2]} />
          <meshStandardMaterial name="Marca do seletor" color="#f8fafc" roughness={0.6} />
        </mesh>
      </group>
    )
  }
  const color = kind === 'start' ? '#16a34a' : kind === 'stop' ? '#dc2626' : kind === 'reset' ? '#2563eb' : '#6b7280'
  return (
    <group>
      <mesh position={[0, 0, 1.4]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[13, 13, 2.8, 26]} />
        <Mat f={PA_BLACK} name="Colarinho do botão" />
      </mesh>
      <mesh position={[0, 0, active ? 4 : 6]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[11, 11.6, active ? 5 : 8, 26]} />
        <meshStandardMaterial name="Botão de comando" color={color} roughness={0.44} metalness={0.04} />
      </mesh>
    </group>
  )
}

/** Pupitre de 6 operadores Ø22 (EMERG · MAN/AUTO · REARME · CICLO · STOP · START). */
function OperatorBox({ c, onPatch }: { c: ElectricalComponent; onPatch?: (patch: MechatronicsPatch) => void }) {
  const o = MEC_DIMS.operatorBox
  const halfD = o.depthMm / 2
  const frontZ = halfD - 14
  const ops = [
    { kind: 'emerg', x: -65, label: 'EMERG', active: !!c.state.emergLatched, patch: { emergLatched: !c.state.emergLatched } },
    { kind: 'selector', x: -39, label: 'MAN/AUTO', active: c.state.autoMode !== false, patch: { autoMode: c.state.autoMode === false } },
    { kind: 'reset', x: -13, label: 'REARME', active: !!c.state.resetPressed, patch: { resetPressed: !c.state.resetPressed } },
    { kind: 'selector', x: 13, label: 'CICLO', active: !!c.state.dirRight, patch: { dirRight: !c.state.dirRight } },
    { kind: 'stop', x: 39, label: 'STOP', active: !!c.state.stopPressed, patch: { stopPressed: !c.state.stopPressed } },
    { kind: 'start', x: 65, label: 'START', active: !!c.state.startPressed, patch: { startPressed: !c.state.startPressed } },
  ]
  return (
    <group>
      {/* Caixa cinzenta com tampa frontal e prensa-cabos traseiro */}
      <mesh position={[0, 0, -10]} castShadow receiveShadow>
        <boxGeometry args={[o.widthMm, o.heightMm, 94]} />
        <meshStandardMaterial name="Caixa do pupitre" color="#9aa0a6" roughness={0.55} metalness={0.06} />
      </mesh>
      <mesh position={[0, 0, frontZ + 3]} castShadow>
        <boxGeometry args={[o.widthMm, o.heightMm, 6]} />
        <meshStandardMaterial name="Tampa frontal do pupitre" color="#b3b8bd" roughness={0.5} metalness={0.05} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (o.widthMm / 2 - 6), -o.heightMm / 2 + 2, -10]}>
          <cylinderGeometry args={[3.4, 3.4, 5, 14]} />
          <Mat f={PA_BLACK} name="Prensa-cabos do pupitre" />
        </mesh>
      ))}
      {ops.map((op) => (
        <group
          key={op.label}
          position={[op.x, 2, frontZ + 6]}
          onClick={(e) => { if (!onPatch) return; e.stopPropagation(); onPatch(op.patch) }}
        >
          <OperatorHead kind={op.kind} active={op.active} />
        </group>
      ))}
      {ops.map((op) => (
        <LabelPlate key={`lbl-${op.label}`} text={op.label} position={[op.x, -20, frontZ + 6.15]} w={25} h={7.5} bg="#e2e8f0" />
      ))}
    </group>
  )
}

/** Coluna luminosa de 3 níveis (verde / amarelo / vermelho) sobre tubo e base quadrada fundida. */
function SignalTower({ c }: { c: ElectricalComponent }) {
  const t = MEC_DIMS.signalTower
  const halfY = t.heightMm / 2
  const baseTop = -halfY + 13
  const poleTop = -9
  const poleLen = poleTop - baseTop
  const tierH = 48
  const lensR = t.lensDiameterMm / 2
  const tiers = [
    { key: 'green', on: !!c.state.green, color: '#22c55e', dark: '#14532d', name: 'Lente verde da torre', y: poleTop + tierH / 2 },
    { key: 'yellow', on: !!c.state.yellow, color: '#facc15', dark: '#78350f', name: 'Lente amarela da torre', y: poleTop + tierH * 1.5 },
    { key: 'red', on: !!c.state.red, color: '#ef4444', dark: '#7f1d1d', name: 'Lente vermelha da torre', y: poleTop + tierH * 2.5 },
  ]
  const lensTop = poleTop + tierH * 3
  return (
    <group>
      {/* Base quadrada fundida com parafusos e bucim de cabo */}
      <mesh position={[0, -halfY + 6.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[t.baseMm, 13, t.baseMm]} />
        <Mat f={PA_BLACK} name="Base da coluna luminosa" />
      </mesh>
      <mesh position={[0, baseTop - 1, 0]}>
        <cylinderGeometry args={[17, 19, 5, 24]} />
        <Mat f={PA_GREY} name="Aro da base da coluna" />
      </mesh>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <CapScrew key={i} position={[sx * (t.baseMm / 2 - 7), -halfY + 13, sz * (t.baseMm / 2 - 7)]} d={3.4} />
      ))}
      <mesh position={[0, -halfY + 1, t.baseMm / 2 - 4]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[2.4, 2.4, 16, 10]} />
        <Mat f={PA_BLACK} name="Cabo da coluna luminosa" />
      </mesh>
      {/* Tubo de alumínio de suporte */}
      <mesh position={[0, baseTop + poleLen / 2, 0]} castShadow>
        <cylinderGeometry args={[8, 8, poleLen, 24]} />
        <Mat f={ALU} name="Tubo da coluna luminosa" />
      </mesh>
      {/* Três níveis óticos empilhados (verde, amarelo, vermelho) */}
      {tiers.map((tier, i) => (
        <group key={tier.key}>
          <mesh position={[0, tier.y, 0]} castShadow>
            <cylinderGeometry args={[lensR, lensR, tierH - 2, 32]} />
            <meshStandardMaterial
              name={tier.name}
              color={tier.on ? tier.color : tier.dark}
              emissive={tier.on ? tier.color : '#000000'}
              emissiveIntensity={tier.on ? 1.35 : 0}
              roughness={0.22}
              metalness={0.05}
              transparent={tier.on}
              opacity={tier.on ? 0.94 : 1}
            />
          </mesh>
          {[0, 1, 2].map((r) => (
            <mesh key={r} position={[0, tier.y - (tierH - 2) / 2 + 8 + r * 14, 0]}>
              <torusGeometry args={[lensR + 0.3, 0.7, 6, 32]} />
              <Mat f={PA_BLACK} name="Nervura da lente" />
            </mesh>
          ))}
          {i < tiers.length - 1 && (
            <mesh position={[0, tier.y + tierH / 2, 0]}>
              <cylinderGeometry args={[lensR * 0.62, lensR * 0.62, 2, 24]} />
              <Mat f={PA_GREY} name="Separador dos níveis" />
            </mesh>
          )}
        </group>
      ))}
      {/* Tampa superior preta abaulada */}
      <mesh position={[0, lensTop + 2.5, 0]} castShadow>
        <cylinderGeometry args={[lensR + 1, lensR + 1, 5, 32]} />
        <Mat f={PA_BLACK} name="Tampa da coluna luminosa" />
      </mesh>
      <mesh position={[0, lensTop + 5, 0]}>
        <sphereGeometry args={[lensR + 0.6, 26, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <Mat f={PA_BLACK} name="Tampa da coluna luminosa" />
      </mesh>
    </group>
  )
}

/** Calha técnica ranhurada em PVC cinzento, com dentes e tampa opcional. */
function BenchDuct({ c }: { c: ElectricalComponent }) {
  const d = benchDuctDimsOf(c.state)
  const geo = slottedDuctGeometry(d.lengthMm, d.widthMm, d.heightMm, d.coverOn)
  const plaque = c.state.plaque === 'atec' ? atecProjectSheetTexture() : null
  return (
    <group rotation={d.alongZ ? [0, Math.PI / 2, 0] : [0, 0, 0]}>
      <mesh geometry={geo} castShadow receiveShadow>
        <Mat f={PVC_DUCT} name="PVC cinzento RAL 7030" />
      </mesh>
      {/* Boca de entrada de cabos nas pontas */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (d.lengthMm / 2 - 0.5), 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[d.heightMm * 0.3, d.heightMm * 0.34, 1.4, 16]} />
          <Mat f={PA_BLACK} name="Tampa de topo da calha" />
        </mesh>
      ))}
      {/* Folha do projeto ATEC pregada na face exterior da calha frontal */}
      {plaque && (
        <mesh position={[-40, 0, d.widthMm / 2 + 0.2]}>
          <planeGeometry args={[68, 34]} />
          <meshStandardMaterial name="Folha do projeto ATEC" map={plaque} color="#ffffff" roughness={0.85} metalness={0} />
        </mesh>
      )}
      <LabelPlate text={c.state.labelText} position={[d.lengthMm / 2 - 90, 4, d.widthMm / 2 + 0.2]} w={60} h={11} />
    </group>
  )
}

/* ================================================================ despacho */

export function Mechatronics3D({ c, position, onPatch, floorY }: { c: ElectricalComponent; position: [number, number, number]; onPatch?: (patch: MechatronicsPatch) => void; /** Chão do pavilhão (coordenadas do mundo) para as pernas da mesa irem até ao chão. */ floorY?: number }) {
  let body: JSX.Element | null = null
  switch (c.type) {
    case 'mecSlotPlate': body = <SlotPlate c={c} floorY={floorY} />; break
    case 'mecAluProfile': body = <AluProfile c={c} />; break
    case 'mecGravityMagazine': body = <GravityMagazine c={c} onPatch={onPatch} />; break
    case 'mecWorkpiece': body = <Workpiece material={workpieceMaterialOf(c.state.material)} />; break
    case 'mecDischargeRamp': body = <DischargeRamp c={c} />; break
    case 'mecStampingTable': body = <StampingTable c={c} />; break
    case 'mecStampingPress': body = <StampingPress c={c} />; break
    case 'mecFeederCylinder': body = <FeederCylinder c={c} />; break
    case 'mecDrawerCylinder': body = <DrawerCylinder c={c} />; break
    case 'mecRotaryArm': body = <RotaryArm c={c} onPatch={onPatch} />; break
    case 'mecDcGearmotor': body = <DcGearmotor c={c} />; break
    case 'mecMicroSwitchRoller': body = <MicroSwitchRoller c={c} onPatch={onPatch} />; break
    case 'mecVacuumEjector': body = <VacuumEjector c={c} />; break
    case 'mecValveIsland': body = <ValveIsland c={c} />; break
    case 'mecOpticalSensor': body = <OpticalSensor c={c} />; break
    case 'mecInductiveSensor': body = <InductiveSensor c={c} />; break
    case 'mecHmiKtp700': body = <HmiKtp700 c={c} />; break
    case 'mecOperatorBox': body = <OperatorBox c={c} onPatch={onPatch} />; break
    case 'mecSignalTower': body = <SignalTower c={c} />; break
    case 'mecBenchDuct': body = <BenchDuct c={c} />; break
    case 'mecDragChain': body = <DragChain c={c} />; break
    case 'mecSupportBlock': body = <SupportBlock c={c} />; break
    default: return null
  }
  return (
    <group position={position} name={`mec-${c.type}-3d-${c.id}`}>
      <group scale={U}>{body}</group>
    </group>
  )
}
