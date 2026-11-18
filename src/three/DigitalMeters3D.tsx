import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { ElectricalComponent } from '../types'
import { useSimStore } from '../store/useSimStore'
import { PANEL_UNITS_PER_MM } from './modelPaths'
import { cachedCanvasTexture } from './protectionMarkings'

const U = PANEL_UNITS_PER_MM

// Materiais reutilizáveis para os medidores digitais
const housingMat = new THREE.MeshStandardMaterial({
  color: '#e2e8f0', // RAL 7035
  roughness: 0.52,
  metalness: 0.05,
})

const darkFrameMat = new THREE.MeshStandardMaterial({
  color: '#1e293b',
  roughness: 0.35,
  metalness: 0.15,
})

const screenGlassMat = new THREE.MeshPhysicalMaterial({
  color: '#0a0f1d',
  roughness: 0.12,
  metalness: 0.1,
  transmission: 0.15,
  transparent: true,
  opacity: 0.95,
})

const screwMat = new THREE.MeshStandardMaterial({
  color: '#cbd5e1',
  metalness: 0.82,
  roughness: 0.28,
})

const screwSlotMat = new THREE.MeshBasicMaterial({ color: '#1e293b' })
const darkBoreMat = new THREE.MeshBasicMaterial({ color: '#0f172a' })
const blueBtnMat = new THREE.MeshStandardMaterial({ color: '#2563eb', roughness: 0.35 })
const whiteBtnMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.4 })

/** Textura dinâmica do LCD colorido do D52-2066 */
function getD52DisplayTexture(c: ElectricalComponent): THREE.CanvasTexture | null {
  const on = c.state.on !== false
  const voltage = on ? Number(c.state.voltage ?? 223.8).toFixed(1) : '---.-'
  const current = on ? Number(c.state.current ?? 1.14).toFixed(2) : '--.--'
  const power = on ? Number(c.state.power ?? 256.3).toFixed(1) : '---.-'
  const energy = on ? Number(c.state.energy ?? 0.22).toFixed(2) : '-.--'
  const freq = on ? Number(c.state.frequency ?? 50.0).toFixed(1) : '--.-'
  const pf = on ? Number(c.state.powerFactor ?? 1.0).toFixed(2) : '-.--'

  const key = `d52:disp:${on ? 1 : 0}:${voltage}:${current}:${power}:${energy}:${freq}:${pf}`
  return cachedCanvasTexture(key, 512, 512, (ctx, w, h) => {
    // Fundo do ecrã LCD preto
    ctx.fillStyle = '#05070c'
    ctx.fillRect(0, 0, w, h)

    // Borda do display
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 4
    ctx.strokeRect(4, 4, w - 8, h - 8)

    // Cabeçalho: D52-2066
    ctx.fillStyle = on ? '#94a3b8' : '#334155'
    ctx.font = '700 24px "Inter", "Arial", sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('D52-2066', 22, 38)

    // Botão RESET e etiqueta
    ctx.fillStyle = on ? '#60a5fa' : '#1e3a8a'
    ctx.beginPath()
    ctx.arc(w - 42, 28, 11, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = on ? '#94a3b8' : '#334155'
    ctx.font = '700 13px "Inter", "Arial", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('RESET', w - 42, 52)

    if (!on) {
      // Ecrã desligado
      ctx.fillStyle = '#1e293b'
      ctx.font = '700 16px "Inter", "Arial", sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('STANDBY / OFF', w / 2, h / 2)
      return
    }

    // Linha 1: Potência ativa (W) em AMARELO VIBRANTE
    ctx.fillStyle = '#fde047'
    ctx.font = '900 64px "Courier New", monospace'
    ctx.textAlign = 'right'
    ctx.fillText(power, w - 88, 126)
    ctx.font = '700 32px "Inter", "Arial", sans-serif'
    ctx.fillText('W', w - 34, 126)

    // Linha 2: Energia acumulada (kWh) em LARANJA / ÂMBAR
    ctx.fillStyle = '#fb923c'
    ctx.font = '900 58px "Courier New", monospace'
    ctx.textAlign = 'right'
    ctx.fillText(energy, w - 105, 218)
    ctx.font = '700 28px "Inter", "Arial", sans-serif'
    ctx.fillText('kWh', w - 24, 218)

    // Linha 3: Tensão (V) em CIANO + Frequência (Hz) em BRANCO
    ctx.fillStyle = '#38bdf8'
    ctx.font = '900 54px "Courier New", monospace'
    ctx.textAlign = 'right'
    ctx.fillText(voltage, 245, 318)
    ctx.font = '700 24px "Inter", "Arial", sans-serif'
    ctx.fillText('V', 270, 318)

    ctx.fillStyle = '#f8fafc'
    ctx.font = '900 48px "Courier New", monospace'
    ctx.fillText(freq, w - 62, 318)
    ctx.font = '700 22px "Inter", "Arial", sans-serif'
    ctx.fillText('Hz', w - 24, 318)

    // Linha 4: Corrente (A) em VERMELHO + Fator de Potência (PF) em AZUL
    ctx.fillStyle = '#f87171'
    ctx.font = '900 54px "Courier New", monospace'
    ctx.textAlign = 'right'
    ctx.fillText(current, 245, 418)
    ctx.font = '700 24px "Inter", "Arial", sans-serif'
    ctx.fillText('A', 270, 418)

    ctx.fillStyle = '#60a5fa'
    ctx.font = '900 48px "Courier New", monospace'
    ctx.fillText(pf, w - 62, 418)
    ctx.font = '700 22px "Inter", "Arial", sans-serif'
    ctx.fillText('PF', w - 24, 418)

    // Rodapé
    ctx.fillStyle = '#64748b'
    ctx.font = '600 18px "Inter", "Arial", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Multi-Function Digital Meter', w / 2, 480)
  })
}

/** Textura dinâmica do LCD trifásico do KWS-306 */
function getKwsDisplayTexture(c: ElectricalComponent): THREE.CanvasTexture | null {
  const on = c.state.on !== false
  const switchOn = c.state.switchOn !== false
  const vA = on ? Number(c.state.vA ?? 211.0).toFixed(1) : '---.-'
  const vB = on ? Number(c.state.vB ?? 210.4).toFixed(1) : '---.-'
  const vC = on ? Number(c.state.vC ?? 210.4).toFixed(1) : '---.-'
  const iA = on ? Number(c.state.iA ?? 7.892).toFixed(3) : '-.---'
  const iB = on ? Number(c.state.iB ?? 0.000).toFixed(3) : '-.---'
  const iC = on ? Number(c.state.iC ?? 0.000).toFixed(3) : '-.---'
  const pA = on ? Number(c.state.pA ?? 1.665).toFixed(3) : '-.---'
  const pB = on ? Number(c.state.pB ?? 0.000).toFixed(3) : '-.---'
  const pC = on ? Number(c.state.pC ?? 0.000).toFixed(3) : '-.---'
  const energy = on ? Number(c.state.energy ?? 1.40).toFixed(2).padStart(8, '0') : '--------'
  const freq = on ? Number(c.state.frequency ?? 50) : '--'
  const temp = on ? Number(c.state.temp ?? 15) : '--'

  const key = `kws:disp:${on ? 1 : 0}:${switchOn ? 1 : 0}:${vA}:${iA}:${pA}:${energy}`
  return cachedCanvasTexture(key, 640, 420, (ctx, w, h) => {
    ctx.fillStyle = '#030712'
    ctx.fillRect(0, 0, w, h)

    // Cabeçalho das colunas: V (Azul) · A (Vermelho) · KW (Amarelo)
    ctx.font = '800 22px "Inter", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#38bdf8'
    ctx.fillText('V', 140, 42)
    ctx.fillStyle = '#ef4444'
    ctx.fillText('A', 310, 42)
    ctx.fillStyle = '#eab308'
    ctx.fillText('KW', 480, 42)

    if (!on) {
      ctx.fillStyle = '#334155'
      ctx.font = '700 24px "Inter", sans-serif'
      ctx.fillText('DESLIGADO', w / 2, h / 2)
      return
    }

    // Linhas das Fases A, B, C
    const phases = [
      { label: 'A', v: vA, i: iA, p: pA, y: 110 },
      { label: 'B', v: vB, i: iB, p: pB, y: 182 },
      { label: 'C', v: vC, i: iC, p: pC, y: 254 },
    ]

    for (const row of phases) {
      // Letra da fase
      ctx.fillStyle = '#f8fafc'
      ctx.font = '800 28px "Inter", sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(row.label, 24, row.y)

      // Tensão V (Azul)
      ctx.fillStyle = '#38bdf8'
      ctx.font = '900 40px "Courier New", monospace'
      ctx.textAlign = 'right'
      ctx.fillText(row.v, 220, row.y)

      // Corrente A (Vermelho)
      ctx.fillStyle = '#ef4444'
      ctx.fillText(row.i, 390, row.y)

      // Potência KW (Amarelo)
      ctx.fillStyle = '#eab308'
      ctx.fillText(row.p, 550, row.y)
    }

    // Linha inferior: Energia acumulada (Ciano) · 50Hz · 15°C
    ctx.fillStyle = '#22d3ee'
    ctx.font = '900 36px "Courier New", monospace'
    ctx.textAlign = 'left'
    ctx.fillText(energy, 24, 345)
    ctx.font = '700 18px "Inter", sans-serif'
    ctx.fillText('Kwh', 228, 345)

    ctx.fillStyle = '#f8fafc'
    ctx.font = '900 32px "Courier New", monospace'
    ctx.fillText(`${freq}Hz`, 340, 345)
    ctx.fillText(`${temp}℃`, 480, 345)

    // Rodapé: KWS-306 e indicador de relé
    ctx.font = '800 20px "Inter", sans-serif'
    ctx.fillStyle = '#94a3b8'
    ctx.fillText('KWS-306', 24, 396)

    ctx.textAlign = 'right'
    ctx.fillStyle = switchOn ? '#22c55e' : '#ef4444'
    ctx.fillText(switchOn ? '● SAÍDA LIGADA (NO)' : '○ SAÍDA ABERTA (OFF)', w - 24, 396)
  })
}

/** Adesivo QR Code do KWS-306 */
function getKwsQrTexture(): THREE.CanvasTexture | null {
  return cachedCanvasTexture('kws:qr:v1', 128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#0f172a'
    ctx.strokeRect(4, 4, w - 8, h - 8)

    // Simulação do padrão QR Code
    const s = 10
    const ox = 18, oy = 24
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if ((r + c * 3 + (r * c)) % 2 === 0 || (r < 3 && c < 3) || (r > 5 && c < 3) || (r < 3 && c > 5)) {
          ctx.fillRect(ox + c * s, oy + r * s, s - 1, s - 1)
        }
      }
    }

    ctx.font = '700 12px "Inter", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#1e293b'
    ctx.fillText('306 User Manual', w / 2, 148)
    ctx.font = '600 10px "Inter", sans-serif'
    ctx.fillText('WiFi / App Pairing', w / 2, 168)
  })
}

/** Parafuso zincado em rebaixo */
function ScrewWell({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    <group position={[x, y, z]}>
      {/* Rebaixo cilíndrico escuro */}
      <mesh material={darkBoreMat} position={[0, 0, -0.015]}>
        <cylinderGeometry args={[0.024, 0.024, 0.03, 16]} />
      </mesh>
      {/* Cabeça do parafuso zincado */}
      <mesh material={screwMat} position={[0, 0, 0.005]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.01, 16]} />
      </mesh>
      {/* Fenda em cruz */}
      <mesh material={screwSlotMat} position={[0, 0, 0.011]}>
        <boxGeometry args={[0.03, 0.005, 0.003]} />
      </mesh>
      <mesh material={screwSlotMat} position={[0, 0, 0.011]}>
        <boxGeometry args={[0.005, 0.03, 0.003]} />
      </mesh>
    </group>
  )
}

/**
 * Componente 3D Fotorrealista: Medidor Multifuncional D52-2066 (54 × 80 × 64 mm)
 * Monofásico com TC integrado, LCD a cores e botão Reset.
 */
export function MeterD522066_3D({ c, x }: { c: ElectricalComponent; x: number }) {
  const dispTex = getD52DisplayTexture(c)

  const handleReset = (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    useSimStore.getState().setComponentState(c.id, { energy: 0.00 })
    useSimStore.getState().pushEvent('info', `${c.ref}: Contador de energia reposto a 0.00 kWh.`)
  }

  return (
    <group position={[x, 0, 0]}>
      {/* 1. Corpo base do módulo DIN (54 × 80 × 50 mm) */}
      <mesh material={housingMat} position={[0, 0, -0.07]} castShadow receiveShadow>
        <boxGeometry args={[54 * U, 80 * U, 50 * U]} />
      </mesh>

      {/* Ranhura traseira da calha DIN 35mm */}
      <mesh material={darkFrameMat} position={[0, 0, -0.31]}>
        <boxGeometry args={[54 * U, 36 * U, 8 * U]} />
      </mesh>

      {/* 2. Saliente frontal padrão DIN 45mm (54 × 48 × 22 mm) */}
      <mesh material={housingMat} position={[0, 16 * U, 0.21]} castShadow receiveShadow>
        <boxGeometry args={[50 * U, 48 * U, 22 * U]} />
      </mesh>

      {/* Moldura frontal do LCD */}
      <mesh material={darkFrameMat} position={[0, 16 * U, 0.325]}>
        <boxGeometry args={[46 * U, 44 * U, 2 * U]} />
      </mesh>

      {/* Ecrã LCD digital colorido */}
      {dispTex && (
        <mesh position={[0, 16 * U, 0.338]}>
          <planeGeometry args={[44 * U, 42 * U]} />
          <meshBasicMaterial map={dispTex} toneMapped={false} />
        </mesh>
      )}

      {/* Vidro protetor transparente do display */}
      <mesh material={screenGlassMat} position={[0, 16 * U, 0.342]}>
        <planeGeometry args={[44 * U, 42 * U]} />
      </mesh>

      {/* Botão de RESET físico (azul, no topo direito) */}
      <mesh
        material={blueBtnMat}
        position={[18 * U, 34 * U, 0.345]}
        rotation={[Math.PI / 2, 0, 0]}
        onClick={handleReset}
      >
        <cylinderGeometry args={[2.2 * U, 2.2 * U, 2.5 * U, 16]} />
      </mesh>

      {/* 3. Patamar inferior com bornes 1 e 2 e túnel de passagem do TC */}
      {/* Poços dos parafusos dos bornes 1 e 2 */}
      <ScrewWell x={-14 * U} y={-24 * U} z={0.16} />
      <ScrewWell x={-3 * U} y={-24 * U} z={0.16} />

      {/* Orifício circular atravessante do TC (Ø 11 mm) na direita */}
      <mesh material={darkBoreMat} position={[14 * U, -24 * U, 0.14]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[5.8 * U, 5.8 * U, 36 * U, 24]} />
      </mesh>
      {/* Chanfro da boca do furo do TC */}
      <mesh material={housingMat} position={[14 * U, -24 * U, 0.20]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[6.8 * U, 5.8 * U, 2 * U, 24]} />
      </mesh>

      {/* Patamar superior com furos auxiliares 3 e 4 */}
      <ScrewWell x={-8 * U} y={32 * U} z={0.12} />
      <ScrewWell x={6 * U} y={32 * U} z={0.12} />
    </group>
  )
}

/**
 * Componente 3D Fotorrealista: Medidor Trifásico KWS-306 (74 × 86.5 × 65 mm)
 * Mede 3 fases V, A, kW, kWh, Hz, °C com display LCD panorâmico e 4 botões.
 */
export function MeterKws306_3D({ c, x }: { c: ElectricalComponent; x: number }) {
  const dispTex = getKwsDisplayTexture(c)
  const qrTex = getKwsQrTexture()

  const handleToggleSwitch = (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    const current = c.state.switchOn !== false
    useSimStore.getState().setComponentState(c.id, { switchOn: !current })
    useSimStore.getState().pushEvent('info', `${c.ref}: Saída do relé ${!current ? 'LIGADA (fechada)' : 'ABERTA (desligada)'}.`)
  }

  const handleMenu = (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    const mode = (Number(c.state.screenMode ?? 0) + 1) % 3
    useSimStore.getState().setComponentState(c.id, { screenMode: mode })
  }

  return (
    <group position={[x, 0, 0]}>
      {/* 1. Corpo principal em caixa modular DIN (74 × 86.5 × 50 mm) */}
      <mesh material={housingMat} position={[0, 0, -0.075]} castShadow receiveShadow>
        <boxGeometry args={[74 * U, 86.5 * U, 50 * U]} />
      </mesh>

      {/* Encaixe de calha DIN 35mm traseiro */}
      <mesh material={darkFrameMat} position={[0, 0, -0.32]}>
        <boxGeometry args={[74 * U, 36 * U, 8 * U]} />
      </mesh>

      {/* 2. Frente padrão DIN 45mm saliente (74 × 52 × 16 mm) */}
      <mesh material={housingMat} position={[0, 0, 0.22]} castShadow receiveShadow>
        <boxGeometry args={[70 * U, 52 * U, 18 * U]} />
      </mesh>

      {/* Moldura frontal preta do display amplo */}
      <mesh material={darkFrameMat} position={[-5 * U, 0, 0.315]}>
        <boxGeometry args={[56 * U, 46 * U, 2.5 * U]} />
      </mesh>

      {/* Ecrã panorâmico multicolor LCD */}
      {dispTex && (
        <mesh position={[-5 * U, 0, 0.33]}>
          <planeGeometry args={[54 * U, 44 * U]} />
          <meshBasicMaterial map={dispTex} toneMapped={false} />
        </mesh>
      )}

      {/* Vidro protetor transparente */}
      <mesh material={screenGlassMat} position={[-5 * U, 0, 0.334]}>
        <planeGeometry args={[54 * U, 44 * U]} />
      </mesh>

      {/* 3. Coluna de 4 botões na direita: M, +, -, NO/OFF */}
      {(['M', '+', '-', 'NO/OFF'] as const).map((btn, idx) => {
        const by = (1.5 - idx) * 10 * U
        const isSwitch = btn === 'NO/OFF'
        return (
          <mesh
            key={btn}
            material={whiteBtnMat}
            position={[27 * U, by, 0.325]}
            rotation={[Math.PI / 2, 0, 0]}
            onClick={isSwitch ? handleToggleSwitch : handleMenu}
          >
            <cylinderGeometry args={[2.5 * U, 2.5 * U, 2.2 * U, 16]} />
          </mesh>
        )
      })}

      {/* 4. Adesivo QR Code na lateral direita do painel */}
      {qrTex && (
        <mesh position={[33.5 * U, -2 * U, 0.312]}>
          <planeGeometry args={[5 * U, 16 * U]} />
          <meshBasicMaterial map={qrTex} toneMapped={false} />
        </mesh>
      )}

      {/* 5. Bornes de Entrada Superiores: A (L1), B (L2), C (L3), N */}
      <ScrewWell x={-26 * U} y={32 * U} z={0.14} />
      <ScrewWell x={-9 * U} y={32 * U} z={0.14} />
      <ScrewWell x={9 * U} y={32 * U} z={0.14} />
      <ScrewWell x={26 * U} y={32 * U} z={0.14} />

      {/* 6. Bornes de Saída Inferiores: A, B, C, N + Porta NTC central */}
      <ScrewWell x={-26 * U} y={-32 * U} z={0.14} />
      <ScrewWell x={-9 * U} y={-32 * U} z={0.14} />
      <ScrewWell x={9 * U} y={-32 * U} z={0.14} />
      <ScrewWell x={26 * U} y={-32 * U} z={0.14} />

      {/* Entrada da sonda de temperatura NTC */}
      <mesh material={darkBoreMat} position={[0, -28 * U, 0.16]}>
        <boxGeometry args={[6 * U, 4 * U, 8 * U]} />
      </mesh>
    </group>
  )
}
