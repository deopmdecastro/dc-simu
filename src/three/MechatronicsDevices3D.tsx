import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { ElectricalComponent } from '../types'
import { PANEL_UNITS_PER_MM } from './modelPaths'
import {
  ARM_CUP_STEM_MM,
  ARM_TILT_RAD,
  ARM_TIP_MM,
  MAGAZINE_CAPACITY,
  MEC_DIMS,
  aluProfileDimsOf,
  dragChainDimsOf,
  mechatronicsSizeMm,
  rampDimsOf,
  slotPlateDimsOf,
  supportBlockDimsOf,
  workpieceMaterialOf,
  type WorkpieceMaterial,
} from './mechatronicsModel'
import {
  bellowsCupGeometry,
  bevelGearGeometry,
  dragChainGeometry,
  gaugeDialTexture,
  labelTexture,
  rampChannelGeometry,
  recessedBlockGeometry,
  slotPlateGeometry,
  slottedPanelGeometry,
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
const RUBBER = { color: '#111316', roughness: 0.82, metalness: 0.02 }
const BRASS = { color: '#c9a24b', roughness: 0.25, metalness: 0.9 }
const BLUE_RING = { color: '#1d8fd8', roughness: 0.42, metalness: 0.1 }
const PU_TUBE = { color: '#2b9be0', roughness: 0.38, metalness: 0.02 }

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

/** Sensor magnético (reed) de ranhura com LED e cabo. */
function ReedSensor({ position, active, rotation }: { position: [number, number, number]; active: boolean; rotation?: [number, number, number] }) {
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
      <mesh position={[-14, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[1.5, 1.5, 8, 10]} />
        <Mat f={PA_BLACK} name="Cabo do sensor" />
      </mesh>
    </group>
  )
}

/* ================================================================ estrutura */

function SlotPlate({ c }: { c: ElectricalComponent }) {
  const d = slotPlateDimsOf(c.state)
  const geom = slotPlateGeometry(d.lengthMm, d.widthMm, d.thicknessMm, d.slotPitchMm)
  return (
    <group name="Maquete_Base">
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
      {/* Pés niveladores em borracha nos cantos */}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
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
  const g = recessedBlockGeometry(t.lengthMm, t.heightMm, t.depthMm, t.recessDiameterMm, 8)
  const holding = typeof c.state.pieceMaterial === 'string' && c.state.pieceMaterial !== ''
  return (
    <group>
      <mesh geometry={g} castShadow receiveShadow>
        <Mat f={ALU_MILLED} name="Bloco maquinado" />
      </mesh>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <CapScrew key={i} position={[sx * (t.lengthMm / 2 - 10), t.heightMm / 2, sz * (t.depthMm / 2 - 10)]} d={4.2} />
      ))}
      {/* Chanfro de entrada do rebaixo (anel ligeiramente mais escuro) */}
      <mesh position={[0, t.heightMm / 2 - 8 + 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[t.recessDiameterMm / 2, 40]} />
        <Mat f={ALU_DARK} name="Fundo do rebaixo" />
      </mesh>
      {holding && (
        <group position={[0, t.heightMm / 2 - 8 + MEC_DIMS.workpiece.heightMm / 2 + 0.1, 0]}>
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
  return (
    <group>
      <group position={[xBody, axisY, 0]}>
        <RoundCylinderBody bore={f.boreMm} length={f.bodyMm} />
        <PushInFitting position={[6, f.boreMm / 2 + 3, 0]} d={4.5} />
        <PushInFitting position={[f.bodyMm - 6, f.boreMm / 2 + 3, 0]} d={4.5} />
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
      <ReedSensor position={[xBody + 26, axisY + 5, f.boreMm / 2 + 3.6]} active={pct <= 8} />
      <ReedSensor position={[xBody + f.bodyMm - 26, axisY + 5, f.boreMm / 2 + 3.6]} active={pct >= 92} />
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
  const armRef = useRef<THREE.Group>(null)
  const actRodRef = useRef<THREE.Group>(null)
  const angleSm = useSmoothed((angle * Math.PI) / 180, 12)
  const downSm = useSmoothed(down / 100, 10)
  const TILT = ARM_TILT_RAD // a ponta da ventosa desce ~18 mm até ao topo das peças nas estações
  useFrame(() => {
    if (rotRef.current) rotRef.current.rotation.y = -angleSm.current - Math.PI / 2
    if (armRef.current) armRef.current.rotation.z = -downSm.current * TILT
    if (actRodRef.current) actRodRef.current.scale.y = 1 - downSm.current * 0.35
  })
  const y0 = -205 / 2
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
  const armPlate = slottedPanelGeometry(armLen, 30, 8, [
    { x: armLen * 0.1, y: 0, w: 58, h: 12 },
    { x: armLen * 0.38, y: 0, w: 58, h: 12 },
  ], 'arm-plate')
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
        {/* Cilindro de elevação inclinado entre a coluna e o braço */}
        <mesh position={[19, towerBase + 92, 0]} castShadow>
          <boxGeometry args={[8, 16, 16]} />
          <Mat f={ALU_DARK} name="Chumaceira do cilindro de elevação" />
        </mesh>
        <group position={[22, towerBase + 92, 0]} rotation={[0, 0, -0.42]}>
          <mesh position={[0, 25, 0]} castShadow>
            <cylinderGeometry args={[8, 8, 50, 20]} />
            <Mat f={ALU} name="Cilindro de elevação" />
          </mesh>
          <group ref={actRodRef} position={[0, 50, 0]}>
            <mesh position={[0, 15, 0]}>
              <cylinderGeometry args={[2.5, 2.5, 30, 12]} />
              <Mat f={CHROME} name="Haste de elevação" />
            </mesh>
          </group>
          <PushInFitting position={[8, 6, 0]} rotation={[0, 0, -Math.PI / 2]} d={3.6} />
        </group>
        {/* Articulação (charneira) no topo da coluna */}
        <mesh position={[0, towerTop + 6, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[6, 6, 40, 20]} />
          <Mat f={STEEL} name="Eixo da articulação" />
        </mesh>
        <group ref={armRef} name="Braco_Articulacao_Z" position={[0, towerTop + 6, 0]}>
          {/* Braço aligeirado com dois rasgos oblongos */}
          <mesh geometry={armPlate} position={[armLen / 2 - armBack, 6, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
            <Mat f={ALU_MILLED} name="Braço aligeirado" />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[0, 2, s * 17]} castShadow>
              <boxGeometry args={[26, 20, 4]} />
              <Mat f={ALU_DARK} name="Garfo da articulação" />
            </mesh>
          ))}
          {/* Tubo de vácuo azul ao longo do braço */}
          <mesh position={[tipX / 2 - 10, 13, 9]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[2, 2, tipX - 14, 10]} />
            <Mat f={PU_TUBE} name="Tubo de poliuretano" />
          </mesh>
          {/* Ventosa na ponta: racor, haste roscada e fole */}
          <group position={[tipX, 2, 0]}>
            <PushInFitting position={[0, 0, 15]} rotation={[Math.PI / 2, 0, 0]} d={3.6} />
            <mesh position={[0, -2, 0]}>
              <cylinderGeometry args={[4.5, 4.5, 10, 6]} />
              <Mat f={BRASS} name="Porca da haste da ventosa" />
            </mesh>
            <mesh position={[0, -STEM / 2, 0]}>
              <cylinderGeometry args={[3, 3, STEM, 14]} />
              <Mat f={STEEL} name="Haste roscada da ventosa" />
            </mesh>
            <mesh geometry={cup} position={[0, -STEM, 0]} castShadow>
              <meshStandardMaterial name="Borracha da ventosa" color={vacuum ? '#1f2937' : RUBBER.color} roughness={0.78} metalness={0.02} />
            </mesh>
            {held && <Workpiece material={held} position={[0, -STEM - 17 - MEC_DIMS.workpiece.heightMm / 2, 0]} />}
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
      {/* Encoder incremental Ø30 com bucim de cabo */}
      <mesh position={[xEnc + 11, axisY, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[g.encoderDiameterMm / 2, g.encoderDiameterMm / 2, 22, 32]} />
        <Mat f={PA_BLACK} name="Corpo do encoder" />
      </mesh>
      <mesh position={[xEnc + 11, axisY + g.encoderDiameterMm / 2 + 3, 0]} castShadow>
        <cylinderGeometry args={[3.5, 4, 8, 12]} />
        <Mat f={PA_GREY} name="Bucim do cabo do encoder" />
      </mesh>
      <mesh position={[xEnc - 1, axisY, 0]} rotation={[0, 0, Math.PI / 2]}>
        <circleGeometry args={[g.encoderDiameterMm / 2 - 2, 32]} />
        <meshStandardMaterial name="Etiqueta do encoder" map={labelTexture('ENC A/B') ?? undefined} color="#ffffff" />
      </mesh>
      <group ref={encRef} name="Encoder_Veio" position={[xEnc + 31, axisY, 0]}>
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
      {/* Motor DC Ø36 × 95 (carcaça de aço) + redutor */}
      <mesh position={[-66 + 47.5, axisY, 0]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[r, r, 95, 40]} />
        <meshStandardMaterial name="Carcaça do motor DC" color="#2a2f36" roughness={0.38} metalness={0.72} />
      </mesh>
      <mesh position={[-66 + 3, axisY, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[r - 2, r, 6, 40]} />
        <Mat f={PA_BLACK} name="Tampa traseira do motor" />
      </mesh>
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
      {/* Terminais C / NA / NF */}
      {[-9, 0, 9].map((x) => (
        <mesh key={x} position={[x, -13.5, 0]}>
          <boxGeometry args={[3.2, 4, 0.6]} />
          <Mat f={BRASS} name="Terminal de lingueta" />
        </mesh>
      ))}
      <mesh position={[-7, 4.6, 0]}>
        <boxGeometry args={[3, 2, 3]} />
        <meshStandardMaterial name="Pino de acionamento" color="#b91c1c" roughness={0.5} />
      </mesh>
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
      <mesh position={[-14, -3.2, 7.05]}>
        <planeGeometry args={[22, 5.5]} />
        <meshStandardMaterial name="Etiqueta do ejetor" map={labelTexture('VÁCUO', '#e2e8f0', '#0f172a') ?? undefined} color="#ffffff" />
      </mesh>
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

/* ================================================================ despacho */

export function Mechatronics3D({ c, position, onPatch }: { c: ElectricalComponent; position: [number, number, number]; onPatch?: (patch: MechatronicsPatch) => void }) {
  let body: JSX.Element | null = null
  switch (c.type) {
    case 'mecSlotPlate': body = <SlotPlate c={c} />; break
    case 'mecAluProfile': body = <AluProfile c={c} />; break
    case 'mecGravityMagazine': body = <GravityMagazine c={c} onPatch={onPatch} />; break
    case 'mecWorkpiece': body = <Workpiece material={workpieceMaterialOf(c.state.material)} />; break
    case 'mecDischargeRamp': body = <DischargeRamp c={c} />; break
    case 'mecStampingTable': body = <StampingTable c={c} />; break
    case 'mecStampingPress': body = <StampingPress c={c} />; break
    case 'mecFeederCylinder': body = <FeederCylinder c={c} />; break
    case 'mecRotaryArm': body = <RotaryArm c={c} onPatch={onPatch} />; break
    case 'mecDcGearmotor': body = <DcGearmotor c={c} />; break
    case 'mecMicroSwitchRoller': body = <MicroSwitchRoller c={c} onPatch={onPatch} />; break
    case 'mecVacuumEjector': body = <VacuumEjector c={c} />; break
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
