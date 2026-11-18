import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { ElectricalComponent } from '../types'
import { useSimStore } from '../store/useSimStore'
import { PANEL_UNITS_PER_MM } from './modelPaths'
import { cachedCanvasTexture } from './protectionMarkings'
import { GlowHalo } from './GlowHalo'

const U = PANEL_UNITS_PER_MM

// Materiais reutilizáveis dos equipamentos Schneider Acti9
const housingMat = new THREE.MeshStandardMaterial({
  color: '#f8fafc',
  roughness: 0.45,
  metalness: 0.05,
})

const housingDarkMat = new THREE.MeshStandardMaterial({
  color: '#e2e8f0',
  roughness: 0.5,
  metalness: 0.08,
})

const handleMat = new THREE.MeshStandardMaterial({
  color: '#1e293b',
  roughness: 0.35,
  metalness: 0.15,
})

const yellowLatchMat = new THREE.MeshStandardMaterial({
  color: '#eab308',
  roughness: 0.35,
  metalness: 0.1,
})

const screwMat = new THREE.MeshStandardMaterial({
  color: '#cbd5e1',
  metalness: 0.85,
  roughness: 0.28,
})

const screwSlotMat = new THREE.MeshBasicMaterial({ color: '#1e293b' })
const darkBoreMat = new THREE.MeshBasicMaterial({ color: '#0f172a' })
const whiteBtnMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35 })

// Materiais das lentes sinalizadoras
const redLensOnMat = new THREE.MeshStandardMaterial({
  color: '#ef4444',
  emissive: '#ff2222',
  emissiveIntensity: 2.8,
  roughness: 0.15,
  metalness: 0.1,
})

const redLensOffMat = new THREE.MeshStandardMaterial({
  color: '#450a0a',
  roughness: 0.45,
  metalness: 0.2,
})

/** Poço de aperto com parafuso métrico e fenda em cruz */
function TerminalWell({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    <group position={[x, y, z]}>
      <mesh material={darkBoreMat} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.042, 0.042, 0.016, 20]} />
      </mesh>
      <mesh material={screwMat} position={[0, 0, 0.005]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.026, 0.026, 0.012, 16]} />
      </mesh>
      <mesh material={screwSlotMat} position={[0, 0, 0.011]}>
        <boxGeometry args={[0.038, 0.006, 0.003]} />
      </mesh>
      <mesh material={screwSlotMat} position={[0, 0, 0.011]}>
        <boxGeometry args={[0.006, 0.038, 0.003]} />
      </mesh>
    </group>
  )
}

/** Visor mecânico de estado da manobra I.ON (vermelho) / O.OFF (verde) */
function StatusWindow({ closed, x = 0, y = 0, z = 0 }: { closed: boolean; x?: number; y?: number; z?: number }) {
  return (
    <group position={[x, y, z]}>
      {/* Moldura do visor */}
      <mesh position={[0, 0, 0]}>
        <planeGeometry args={[14 * U, 6 * U]} />
        <meshBasicMaterial color="#0f172a" />
      </mesh>
      {/* Fita mecânica interna */}
      <mesh position={[0, 0, 0.001]}>
        <planeGeometry args={[12 * U, 4.5 * U]} />
        <meshBasicMaterial color={closed ? '#dc2626' : '#16a34a'} />
      </mesh>
    </group>
  )
}

/** Serigrafia fotorrealista Schneider Acti9 iC60H 1P (imagem 41) */
function getIc60hTexture(closed: boolean): THREE.CanvasTexture | null {
  const key = `schneider:ic60h:${closed ? 1 : 0}`
  return cachedCanvasTexture(key, 256, 512, (ctx, w, h) => {
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, w, h)

    // Logótipo verde oficial Schneider Electric
    ctx.fillStyle = '#009530'
    ctx.fillRect(16, 18, 14, 28)
    ctx.beginPath()
    ctx.moveTo(34, 18)
    ctx.lineTo(44, 18)
    ctx.lineTo(40, 46)
    ctx.lineTo(30, 46)
    ctx.fill()

    ctx.fillStyle = '#009530'
    ctx.font = '800 24px "Inter", "Arial", sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('Schneider', 52, 34)
    ctx.font = '600 16px "Inter", "Arial", sans-serif'
    ctx.fillText('Electric', 52, 54)

    // Linha divisória verde suave
    ctx.strokeStyle = '#009530'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(16, 68)
    ctx.lineTo(w - 16, 68)
    ctx.stroke()

    // Acti9 / iC60H C20
    ctx.fillStyle = '#0f172a'
    ctx.font = '800 18px "Inter", sans-serif'
    ctx.fillText('Acti9', 18, 98)
    ctx.font = '900 22px "Inter", sans-serif'
    ctx.fillText('iC60H C20', 18, 126)

    // Referência do fabricante
    ctx.fillStyle = '#475569'
    ctx.font = '700 13px "Courier New", monospace'
    ctx.fillText('A9F07120', 18, 148)

    // QR Code realista estilizado
    ctx.fillStyle = '#0f172a'
    const qx = w - 88
    const qy = 80
    const qs = 70
    ctx.fillRect(qx, qy, qs, qs)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(qx + 4, qy + 4, qs - 8, qs - 8)
    ctx.fillStyle = '#0f172a'
    // Padrões dos cantos do QR code
    ctx.fillRect(qx + 8, qy + 8, 18, 18)
    ctx.fillRect(qx + qs - 26, qy + 8, 18, 18)
    ctx.fillRect(qx + 8, qy + qs - 26, 18, 18)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(qx + 12, qy + 12, 10, 10)
    ctx.fillRect(qx + qs - 22, qy + 12, 10, 10)
    ctx.fillRect(qx + 12, qy + qs - 22, 10, 10)
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(qx + 14, qy + 14, 6, 6)
    ctx.fillRect(qx + qs - 20, qy + 14, 6, 6)
    ctx.fillRect(qx + 14, qy + qs - 20, 6, 6)

    // Dados elétricos técnicos
    ctx.fillStyle = '#334155'
    ctx.font = '700 13px "Inter", sans-serif'
    ctx.fillText('400V~ · 10000 3', 18, 180)
    ctx.font = '600 11px "Inter", sans-serif'
    ctx.fillText('IEC/EN 60898-1 · CE', 18, 200)

    // Visor mecânico I.ON / O.OFF
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(w / 2 - 42, 280, 84, 30)
    ctx.fillStyle = closed ? '#dc2626' : '#16a34a'
    ctx.fillRect(w / 2 - 38, 284, 76, 22)
    ctx.fillStyle = '#ffffff'
    ctx.font = '900 14px "Inter", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(closed ? 'I.ON' : 'O.OFF', w / 2, 300)

    // Borne 2 na base
    ctx.fillStyle = '#64748b'
    ctx.font = '700 15px "Inter", sans-serif'
    ctx.fillText('2', w / 2, h - 24)
  })
}

/** Serigrafia fotorrealista Schneider Acti9 iID 4P (imagem 36) */
function getIid4pTexture(closed: boolean): THREE.CanvasTexture | null {
  const key = `schneider:iid4p:${closed ? 1 : 0}`
  return cachedCanvasTexture(key, 512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, w, h)

    // Logótipo verde oficial Schneider Electric
    ctx.fillStyle = '#009530'
    ctx.fillRect(28, 24, 18, 32)
    ctx.beginPath()
    ctx.moveTo(50, 24)
    ctx.lineTo(62, 24)
    ctx.lineTo(56, 56)
    ctx.lineTo(44, 56)
    ctx.fill()

    ctx.fillStyle = '#009530'
    ctx.font = '800 28px "Inter", "Arial", sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('Schneider', 72, 42)
    ctx.font = '600 18px "Inter", "Arial", sans-serif'
    ctx.fillText('Electric', 72, 64)

    // Faixa verde Schneider
    ctx.fillStyle = '#009530'
    ctx.fillRect(28, 76, w - 56, 4)

    // Modelo: iID
    ctx.fillStyle = '#0f172a'
    ctx.font = '900 30px "Inter", sans-serif'
    ctx.fillText('iID', 30, 120)

    ctx.font = '700 17px "Inter", sans-serif'
    ctx.fillStyle = '#334155'
    ctx.fillText('40A · IΔn 30mA · 400V~', 30, 148)
    ctx.font = '600 13px "Inter", sans-serif'
    ctx.fillStyle = '#64748b'
    ctx.fillText('IEC/EN 61008-1 · Tipo AC', 30, 172)

    // Botão de ensaio T
    ctx.fillStyle = '#0284c7'
    ctx.font = '800 16px "Inter", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Testar mensalmente', 120, 220)

    // Marcações azuis do Neutro N
    ctx.fillStyle = '#0284c7'
    ctx.font = '900 26px "Inter", sans-serif'
    ctx.fillText('N', 45, 260)
    ctx.fillText('N', 45, h - 35)

    // Visor mecânico central
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(w / 2 - 46, 320, 92, 34)
    ctx.fillStyle = closed ? '#dc2626' : '#16a34a'
    ctx.fillRect(w / 2 - 42, 324, 84, 26)
    ctx.fillStyle = '#ffffff'
    ctx.font = '900 16px "Inter", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(closed ? 'I.ON' : 'O.OFF', w / 2, 342)

    // Bornes superiores e inferiores
    ctx.font = '700 18px "Inter", sans-serif'
    ctx.fillStyle = '#475569'
    ctx.fillText('1', 170, 260)
    ctx.fillText('3', 295, 260)
    ctx.fillText('5', 420, 260)

    ctx.fillText('2', 170, h - 35)
    ctx.fillText('4', 295, h - 35)
    ctx.fillText('6', 420, h - 35)
  })
}

/** Serigrafia fotorrealista Schneider Acti9 iDPN N Vigi (imagens 37, 38, 39) */
function getIdpnVigiTexture(closed: boolean): THREE.CanvasTexture | null {
  const key = `schneider:idpn:${closed ? 1 : 0}`
  return cachedCanvasTexture(key, 384, 512, (ctx, w, h) => {
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, w, h)

    // Logótipo verde oficial
    ctx.fillStyle = '#009530'
    ctx.fillRect(20, 18, 14, 26)
    ctx.beginPath()
    ctx.moveTo(38, 18)
    ctx.lineTo(48, 18)
    ctx.lineTo(44, 44)
    ctx.lineTo(34, 44)
    ctx.fill()

    ctx.fillStyle = '#009530'
    ctx.font = '800 24px "Inter", sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('Schneider', 54, 32)
    ctx.font = '600 15px "Inter", sans-serif'
    ctx.fillText('Electric', 54, 50)

    // Faixa verde
    ctx.fillRect(20, 62, w - 40, 3)

    // Nome do modelo
    ctx.fillStyle = '#0f172a'
    ctx.font = '900 21px "Inter", sans-serif'
    ctx.fillText('iDPN N Vigi C 16A', 20, 96)

    ctx.fillStyle = '#334155'
    ctx.font = '700 14px "Inter", sans-serif'
    ctx.fillText('IΔn 30mA · Icn 6000A', 20, 122)
    ctx.font = '600 12px "Inter", sans-serif'
    ctx.fillStyle = '#64748b'
    ctx.fillText('IEC/EN 61009-2-1 · 230/240V', 20, 144)

    // Identificador azul do Neutro N
    ctx.fillStyle = '#0284c7'
    ctx.font = '900 24px "Inter", sans-serif'
    ctx.fillText('N', 32, 220)
    ctx.fillText('N', 32, h - 35)

    // Visor mecânico de manobra
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(w / 2 - 40, 270, 80, 28)
    ctx.fillStyle = closed ? '#dc2626' : '#16a34a'
    ctx.fillRect(w / 2 - 36, 274, 72, 20)
    ctx.fillStyle = '#ffffff'
    ctx.font = '900 14px "Inter", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(closed ? 'I.ON' : 'O.OFF', w / 2, 289)
  })
}

/** Serigrafia fotorrealista Schneider Acti9 iIL (imagem 40) */
function getIilTexture(type: '1p' | '3p'): THREE.CanvasTexture | null {
  const key = `schneider:iil:${type}`
  const width = type === '1p' ? 256 : 512
  return cachedCanvasTexture(key, width, 512, (ctx, w, h) => {
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, w, h)

    // Logótipo verde oficial
    ctx.fillStyle = '#009530'
    ctx.fillRect(18, 18, 14, 26)
    ctx.beginPath()
    ctx.moveTo(36, 18)
    ctx.lineTo(46, 18)
    ctx.lineTo(42, 44)
    ctx.lineTo(32, 44)
    ctx.fill()

    ctx.fillStyle = '#009530'
    ctx.font = '800 24px "Inter", sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('Schneider', 52, 32)
    ctx.font = '600 15px "Inter", sans-serif'
    ctx.fillText('Electric', 52, 50)

    // Linha verde
    ctx.fillRect(18, 62, w - 36, 3)

    // Nome: iIL
    ctx.fillStyle = '#0f172a'
    ctx.font = '900 24px "Inter", sans-serif'
    ctx.fillText(type === '1p' ? 'iIL' : 'iIL 3P', 20, 102)

    ctx.fillStyle = '#475569'
    ctx.font = '700 13px "Inter", sans-serif'
    ctx.fillText(type === '1p' ? '230V AC' : 'L1 · L2 · L3 · 400V', 20, 128)

    if (type === '3p') {
      ctx.fillStyle = '#0284c7'
      ctx.font = '800 16px "Inter", sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('L1', w * 0.22, 190)
      ctx.fillText('L2', w * 0.5, 190)
      ctx.fillText('L3', w * 0.78, 190)
      ctx.fillText('N', w * 0.5, h - 35)
    }
  })
}

/**
 * Disjuntor Monopolar Schneider Acti9 iC60H 1P (imagem 41)
 * 18 × 85 × 74 mm
 */
export function SchneiderBreaker1P_3D({ c, x, interactive = true }: { c: ElectricalComponent; x: number; interactive?: boolean }) {
  const closed = Boolean(c.state.closed && !c.state.tripped)
  const tex = getIc60hTexture(closed)

  const handleToggle = (e: { stopPropagation: () => void }) => {
    if (!interactive || c.locked) return
    e.stopPropagation()
    const nextClosed = !c.state.closed
    useSimStore.getState().setComponentState(c.id, { closed: nextClosed, tripped: false })
    useSimStore.getState().pushEvent('info', `${c.ref}: ${nextClosed ? 'Ligado (I.ON)' : 'Desligado (O.OFF)'}`)
  }

  return (
    <group position={[x, 0, 0]}>
      {/* Corpo modular DIN (18 × 85 × 52 mm) */}
      <mesh material={housingMat} position={[0, 0, -0.06]} castShadow receiveShadow>
        <boxGeometry args={[18 * U, 85 * U, 52 * U]} />
      </mesh>

      {/* Ranhura e trinco DIN amarelo na base traseira */}
      <mesh material={yellowLatchMat} position={[0, -36 * U, -0.31]}>
        <boxGeometry args={[14 * U, 12 * U, 6 * U]} />
      </mesh>
      <mesh material={yellowLatchMat} position={[0, 36 * U, -0.31]}>
        <boxGeometry args={[14 * U, 12 * U, 6 * U]} />
      </mesh>

      {/* Saliente frontal DIN 45mm com serigrafia (18 × 45 × 22 mm) */}
      <mesh material={housingMat} position={[0, 4 * U, 0.2]}>
        <boxGeometry args={[17.6 * U, 45 * U, 22 * U]} />
      </mesh>
      {tex && (
        <mesh position={[0, 4 * U, 0.312]}>
          <planeGeometry args={[17.2 * U, 44 * U]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
      )}

      {/* Alavanca de manobra preta basculante com visor mecânico */}
      <group
        position={[0, -2 * U, 0.31]}
        rotation={[closed ? -0.32 : 0.42, 0, 0]}
        onClick={handleToggle}
      >
        <mesh material={handleMat} castShadow>
          <boxGeometry args={[13 * U, 14 * U, 18 * U]} />
        </mesh>
        <mesh material={handleMat} position={[0, -7 * U, 7 * U]} rotation={[0.4, 0, 0]}>
          <boxGeometry args={[14 * U, 7 * U, 12 * U]} />
        </mesh>
      </group>

      {/* Bornes de parafuso superior (1) e inferior (2) */}
      <TerminalWell x={0} y={32 * U} z={0.16} />
      <TerminalWell x={0} y={-32 * U} z={0.16} />
    </group>
  )
}

/**
 * Interruptor Diferencial Schneider Acti9 iID 4P (imagem 36)
 * 72 × 85 × 74 mm com botão de ensaio T e manípulo com visor
 */
export function SchneiderRcd4P_3D({ c, x, interactive = true }: { c: ElectricalComponent; x: number; interactive?: boolean }) {
  const closed = Boolean(c.state.closed && !c.state.tripped)
  const tex = getIid4pTexture(closed)

  const handleToggle = (e: { stopPropagation: () => void }) => {
    if (!interactive || c.locked) return
    e.stopPropagation()
    const nextClosed = !c.state.closed
    useSimStore.getState().setComponentState(c.id, { closed: nextClosed, tripped: false })
    useSimStore.getState().pushEvent('info', `${c.ref}: ${nextClosed ? 'Rearmado (I.ON)' : 'Desligado (O.OFF)'}`)
  }

  const handleTestButton = (e: { stopPropagation: () => void }) => {
    if (!interactive || c.locked) return
    e.stopPropagation()
    useSimStore.getState().setComponentState(c.id, { closed: false, tripped: true })
    useSimStore.getState().pushEvent('warning', `${c.ref}: Disparo diferencial residual de ensaio (Botão T acionado).`)
  }

  return (
    <group position={[x, 0, 0]}>
      {/* Corpo modular tetrapolar (72 × 85 × 52 mm) */}
      <mesh material={housingMat} position={[0, 0, -0.06]} castShadow receiveShadow>
        <boxGeometry args={[72 * U, 85 * U, 52 * U]} />
      </mesh>

      {/* Trincos DIN amarelos traseiros */}
      <mesh material={yellowLatchMat} position={[-18 * U, -36 * U, -0.31]}>
        <boxGeometry args={[14 * U, 12 * U, 6 * U]} />
      </mesh>
      <mesh material={yellowLatchMat} position={[18 * U, -36 * U, -0.31]}>
        <boxGeometry args={[14 * U, 12 * U, 6 * U]} />
      </mesh>

      {/* Saliente frontal DIN 45mm com serigrafia (72 × 45 × 22 mm) */}
      <mesh material={housingMat} position={[0, 4 * U, 0.2]}>
        <boxGeometry args={[71 * U, 45 * U, 22 * U]} />
      </mesh>
      {tex && (
        <mesh position={[0, 4 * U, 0.312]}>
          <planeGeometry args={[70 * U, 44 * U]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
      )}

      {/* Botão de ensaio «T» físico clicável (retangular branco, topo esquerdo) */}
      <group
        position={[-18 * U, 18 * U, 0.32]}
        onClick={handleTestButton}
      >
        <mesh material={whiteBtnMat} castShadow>
          <boxGeometry args={[12 * U, 7 * U, 5 * U]} />
        </mesh>
        <mesh position={[0, 0, 2.6 * U]}>
          <planeGeometry args={[7 * U, 5 * U]} />
          <meshBasicMaterial color="#0284c7" />
        </mesh>
      </group>

      {/* Manípulo basculante com visor mecânico */}
      <group
        position={[-18 * U, -4 * U, 0.31]}
        rotation={[closed ? -0.32 : 0.42, 0, 0]}
        onClick={handleToggle}
      >
        <mesh material={handleMat} castShadow>
          <boxGeometry args={[15 * U, 14 * U, 18 * U]} />
        </mesh>
        <mesh material={handleMat} position={[0, -7 * U, 7 * U]} rotation={[0.4, 0, 0]}>
          <boxGeometry args={[16 * U, 7 * U, 12 * U]} />
        </mesh>
      </group>

      {/* Bornes superiores: N1, 1, 3, 5 */}
      <TerminalWell x={-27 * U} y={32 * U} z={0.16} />
      <TerminalWell x={-9 * U} y={32 * U} z={0.16} />
      <TerminalWell x={9 * U} y={32 * U} z={0.16} />
      <TerminalWell x={27 * U} y={32 * U} z={0.16} />

      {/* Bornes inferiores: N2, 2, 4, 6 */}
      <TerminalWell x={-27 * U} y={-32 * U} z={0.16} />
      <TerminalWell x={-9 * U} y={-32 * U} z={0.16} />
      <TerminalWell x={9 * U} y={-32 * U} z={0.16} />
      <TerminalWell x={27 * U} y={-32 * U} z={0.16} />
    </group>
  )
}

/**
 * Disjuntor Diferencial Schneider Acti9 iDPN N Vigi 1P+N (imagens 37, 38, 39)
 * 36 × 85 × 74 mm com botão T e alavanca articulada
 */
export function SchneiderRcd1PN_3D({ c, x, interactive = true }: { c: ElectricalComponent; x: number; interactive?: boolean }) {
  const closed = Boolean(c.state.closed && !c.state.tripped)
  const tex = getIdpnVigiTexture(closed)

  const handleToggle = (e: { stopPropagation: () => void }) => {
    if (!interactive || c.locked) return
    e.stopPropagation()
    const nextClosed = !c.state.closed
    useSimStore.getState().setComponentState(c.id, { closed: nextClosed, tripped: false })
    useSimStore.getState().pushEvent('info', `${c.ref}: ${nextClosed ? 'Ligado (I.ON)' : 'Desligado (O.OFF)'}`)
  }

  const handleTestButton = (e: { stopPropagation: () => void }) => {
    if (!interactive || c.locked) return
    e.stopPropagation()
    useSimStore.getState().setComponentState(c.id, { closed: false, tripped: true })
    useSimStore.getState().pushEvent('warning', `${c.ref}: Disparo diferencial residual de ensaio (Botão T acionado).`)
  }

  return (
    <group position={[x, 0, 0]}>
      {/* Corpo modular 2P (36 × 85 × 52 mm) */}
      <mesh material={housingMat} position={[0, 0, -0.06]} castShadow receiveShadow>
        <boxGeometry args={[36 * U, 85 * U, 52 * U]} />
      </mesh>

      {/* Trinco DIN amarelo */}
      <mesh material={yellowLatchMat} position={[0, -36 * U, -0.31]}>
        <boxGeometry args={[16 * U, 12 * U, 6 * U]} />
      </mesh>

      {/* Saliente frontal DIN 45mm com serigrafia (36 × 45 × 22 mm) */}
      <mesh material={housingMat} position={[0, 4 * U, 0.2]}>
        <boxGeometry args={[35.2 * U, 45 * U, 22 * U]} />
      </mesh>
      {tex && (
        <mesh position={[0, 4 * U, 0.312]}>
          <planeGeometry args={[34.5 * U, 44 * U]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
      )}

      {/* Botão de teste T */}
      <group
        position={[6 * U, 18 * U, 0.32]}
        onClick={handleTestButton}
      >
        <mesh material={whiteBtnMat} castShadow>
          <boxGeometry args={[11 * U, 6.5 * U, 5 * U]} />
        </mesh>
      </group>

      {/* Manípulo de manobra duplo articulado */}
      <group
        position={[-4 * U, -4 * U, 0.31]}
        rotation={[closed ? -0.32 : 0.42, 0, 0]}
        onClick={handleToggle}
      >
        <mesh material={handleMat} position={[-5 * U, 0, 0]} castShadow>
          <boxGeometry args={[10 * U, 14 * U, 18 * U]} />
        </mesh>
        <mesh material={handleMat} position={[5 * U, 0, 0]} castShadow>
          <boxGeometry args={[10 * U, 14 * U, 18 * U]} />
        </mesh>
        <mesh material={handleMat} position={[0, -7 * U, 7 * U]} rotation={[0.4, 0, 0]}>
          <boxGeometry args={[22 * U, 7 * U, 12 * U]} />
        </mesh>
      </group>

      {/* Bornes superiores: N1 (esquerda), 1 (direita) */}
      <TerminalWell x={-9 * U} y={32 * U} z={0.16} />
      <TerminalWell x={9 * U} y={32 * U} z={0.16} />

      {/* Bornes inferiores: N2 (esquerda), 2 (direita) */}
      <TerminalWell x={-9 * U} y={-32 * U} z={0.16} />
      <TerminalWell x={9 * U} y={-32 * U} z={0.16} />
    </group>
  )
}

/**
 * Sinalizador Modular Schneider Acti9 iIL 1P (imagem 40)
 * 18 × 85 × 74 mm com lente luminosa triangular/oval
 */
export function SchneiderPilotLight1P_3D({ c, x }: { c: ElectricalComponent; x: number }) {
  const lit = Boolean(c.state.on)
  const tex = getIilTexture('1p')
  const lensColor = (c.state.color as string) || '#ef4444'

  return (
    <group position={[x, 0, 0]}>
      {/* Corpo modular 1P (18 × 85 × 52 mm) */}
      <mesh material={housingMat} position={[0, 0, -0.06]} castShadow receiveShadow>
        <boxGeometry args={[18 * U, 85 * U, 52 * U]} />
      </mesh>

      {/* Trincos DIN traseiros */}
      <mesh material={yellowLatchMat} position={[0, -36 * U, -0.31]}>
        <boxGeometry args={[14 * U, 12 * U, 6 * U]} />
      </mesh>

      {/* Saliente frontal DIN 45mm (18 × 45 × 22 mm) */}
      <mesh material={housingMat} position={[0, 4 * U, 0.2]}>
        <boxGeometry args={[17.6 * U, 45 * U, 22 * U]} />
      </mesh>
      {tex && (
        <mesh position={[0, 4 * U, 0.312]}>
          <planeGeometry args={[17.2 * U, 44 * U]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
      )}

      {/* Lente luminosa triangular/oval fotorrealista */}
      <group position={[0, -6 * U, 0.315]}>
        <mesh material={lit ? redLensOnMat : redLensOffMat} castShadow>
          <coneGeometry args={[5.2 * U, 8.5 * U, 3]} />
        </mesh>
        {/* GlowHalo tridimensional quando a lâmpada está acesa */}
        <GlowHalo color={lensColor} on={lit} radius={0.065} kind="lamp" position={[0, 0, 0.015]} />
      </group>

      {/* Bornes: X1 no topo e X2 na base */}
      <TerminalWell x={0} y={32 * U} z={0.16} />
      <TerminalWell x={0} y={-32 * U} z={0.16} />
    </group>
  )
}

/**
 * Sinalizador Modular Trifásico Schneider Acti9 iIL 3P (L1, L2, L3 + Neutro)
 * 54 × 85 × 74 mm com 3 lentes luminosas independentes para monitorização e falha de fase
 */
export function SchneiderPilotLight3P_3D({ c, x }: { c: ElectricalComponent; x: number }) {
  const l1Lit = Boolean(c.state.l1On ?? c.state.on)
  const l2Lit = Boolean(c.state.l2On ?? c.state.on)
  const l3Lit = Boolean(c.state.l3On ?? c.state.on)
  const tex = getIilTexture('3p')
  const lensColor = (c.state.color as string) || '#ef4444'

  return (
    <group position={[x, 0, 0]}>
      {/* Corpo modular 3P (54 × 85 × 52 mm) */}
      <mesh material={housingMat} position={[0, 0, -0.06]} castShadow receiveShadow>
        <boxGeometry args={[54 * U, 85 * U, 52 * U]} />
      </mesh>

      {/* Trincos DIN amarelos traseiros */}
      <mesh material={yellowLatchMat} position={[-14 * U, -36 * U, -0.31]}>
        <boxGeometry args={[12 * U, 12 * U, 6 * U]} />
      </mesh>
      <mesh material={yellowLatchMat} position={[14 * U, -36 * U, -0.31]}>
        <boxGeometry args={[12 * U, 12 * U, 6 * U]} />
      </mesh>

      {/* Saliente frontal DIN 45mm com serigrafia (54 × 45 × 22 mm) */}
      <mesh material={housingMat} position={[0, 4 * U, 0.2]}>
        <boxGeometry args={[53 * U, 45 * U, 22 * U]} />
      </mesh>
      {tex && (
        <mesh position={[0, 4 * U, 0.312]}>
          <planeGeometry args={[52 * U, 44 * U]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
      )}

      {/* 3 Lentes luminosas independentes para L1, L2, L3 */}
      {/* Lente L1 */}
      <group position={[-15 * U, -6 * U, 0.315]}>
        <mesh material={l1Lit ? redLensOnMat : redLensOffMat} castShadow>
          <coneGeometry args={[4.5 * U, 7.8 * U, 3]} />
        </mesh>
        <GlowHalo color={lensColor} on={l1Lit} radius={0.055} kind="lamp" position={[0, 0, 0.015]} />
      </group>

      {/* Lente L2 */}
      <group position={[0, -6 * U, 0.315]}>
        <mesh material={l2Lit ? redLensOnMat : redLensOffMat} castShadow>
          <coneGeometry args={[4.5 * U, 7.8 * U, 3]} />
        </mesh>
        <GlowHalo color={lensColor} on={l2Lit} radius={0.055} kind="lamp" position={[0, 0, 0.015]} />
      </group>

      {/* Lente L3 */}
      <group position={[15 * U, -6 * U, 0.315]}>
        <mesh material={l3Lit ? redLensOnMat : redLensOffMat} castShadow>
          <coneGeometry args={[4.5 * U, 7.8 * U, 3]} />
        </mesh>
        <GlowHalo color={lensColor} on={l3Lit} radius={0.055} kind="lamp" position={[0, 0, 0.015]} />
      </group>

      {/* Bornes superiores: L1, L2, L3 */}
      <TerminalWell x={-18 * U} y={32 * U} z={0.16} />
      <TerminalWell x={0} y={32 * U} z={0.16} />
      <TerminalWell x={18 * U} y={32 * U} z={0.16} />

      {/* Borne inferior: Neutro (N) */}
      <TerminalWell x={0} y={-32 * U} z={0.16} />
    </group>
  )
}
