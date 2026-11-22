import { useMemo } from 'react'
import * as THREE from 'three'
import type { ElectricalComponent } from '../types'
import { useSimStore } from '../store/useSimStore'
import { PANEL_UNITS_PER_MM } from './modelPaths'

const U = PANEL_UNITS_PER_MM

function makeSilkscreenTexture(lines: Array<{ text: string; size?: number; bold?: boolean; color?: string; y: number }>, bg = '#f1f5f9') {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const line of lines) {
    ctx.fillStyle = line.color ?? '#0f172a'
    ctx.font = `${line.bold ? 'bold ' : ''}${line.size ?? 28}px sans-serif`
    ctx.fillText(line.text, canvas.width / 2, line.y)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Bucim automático M20/M25 no topo/base da caixa quando há cabos ligados aos bornes. */
function AutoCableGland({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    <group position={[x, y, z]} name="auto-cable-gland">
      <mesh position={[0, 6 * U, 0]} castShadow>
        <cylinderGeometry args={[12 * U, 12 * U, 12 * U, 6]} />
        <meshStandardMaterial color="#64748b" roughness={0.45} metalness={0.25} />
      </mesh>
      <mesh position={[0, 16 * U, 0]} castShadow>
        <cylinderGeometry args={[10 * U, 11 * U, 10 * U, 16]} />
        <meshStandardMaterial color="#475569" roughness={0.5} metalness={0.2} />
      </mesh>
      <mesh position={[0, 23 * U, 0]} castShadow>
        <cylinderGeometry args={[7 * U, 9 * U, 6 * U, 16]} />
        <meshStandardMaterial color="#1e293b" roughness={0.7} metalness={0.05} />
      </mesh>
    </group>
  )
}

/** Régua de bornes interiores visível ao abrir a tampa da caixa estanque. */
function InteriorTerminalStrip({ poles, y, z }: { poles: Array<{ label: string; color: string }>; y: number; z: number }) {
  const step = 13 * U
  const startX = -((poles.length - 1) * step) / 2
  return (
    <group position={[0, y, z]} name="interior-terminals">
      <mesh castShadow>
        <boxGeometry args={[poles.length * step + 10 * U, 16 * U, 14 * U]} />
        <meshStandardMaterial color="#334155" roughness={0.6} metalness={0.1} />
      </mesh>
      {poles.map((p, i) => (
        <group key={p.label} position={[startX + i * step, 0, 4 * U]}>
          <mesh>
            <boxGeometry args={[9 * U, 12 * U, 8 * U]} />
            <meshStandardMaterial color={p.color} roughness={0.45} metalness={0.15} />
          </mesh>
          <mesh position={[0, 0, 4.5 * U]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[3 * U, 3 * U, 2 * U, 12]} />
            <meshStandardMaterial color="#cbd5e1" roughness={0.25} metalness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/**
 * 1. FAMATEL Caixa estanque IP44 (2P+T 16A 250V azul + 3P+N+T 16A 400V vermelho)
 * 2. FAMATEL/ROADEU Caixa estanque IP44 (2P+T 16A 250V azul + seccionador rotativo)
 * 3. EFAPEL Estanque 48 Tomada Schuko com Obturador IP65
 */
export function SocketDevice3D({
  c,
  position,
  interactive = true,
}: {
  c: ElectricalComponent
  position: [number, number, number]
  interactive?: boolean
}) {
  const updateComponent = useSimStore((s) => s.updateComponent)
  const wires = useSimStore((s) => s.wires)
  const coverOpen = Boolean(c.state?.coverOpen)
  const switchOn = c.state?.switchOn !== false

  const hasConnectedWires = useMemo(() => {
    const tIds = new Set(c.terminals.map((t) => t.id))
    return wires.some((w) => tIds.has(w.fromTerminalId) || tIds.has(w.toTerminalId))
  }, [c.terminals, wires])

  const famatelLabel = useMemo(
    () =>
      makeSilkscreenTexture([
        { text: 'Famatel', size: 42, bold: true, color: '#dc2626', y: 58 },
        { text: '16A 3P+N+T  6h  200/346 V~', size: 22, color: '#0f172a', y: 112 },
        { text: '50+60Hz IP44   Ref. 23331', size: 22, bold: true, color: '#0f172a', y: 158 },
        { text: 'Montcada i Reixac · Spain', size: 18, color: '#475569', y: 204 },
      ]),
    [],
  )

  const roadeuLabel = useMemo(
    () =>
      makeSilkscreenTexture([
        { text: 'ROADEU', size: 46, bold: true, color: '#1e293b', y: 90 },
        { text: 'ELEKTROTECHNIK · IP44', size: 24, color: '#475569', y: 155 },
      ], '#e2e8f0'),
    [],
  )

  const toggleCover = () => {
    if (!interactive) return
    updateComponent(c.id, { state: { ...c.state, coverOpen: !coverOpen } })
  }

  const toggleSwitch = () => {
    if (!interactive) return
    updateComponent(c.id, { state: { ...c.state, switchOn: !switchOn } })
  }

  if (c.type === 'socketEfapelIp65') {
    const W = 76 * U, H = 76 * U, D = 52 * U
    return (
      <group position={position} name={`socket-efapel-ip65-${c.id}`}>
        {/* Caixa estanque cinza claro */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[W, H, D]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.42} metalness={0.05} />
        </mesh>
        {/* Poço Schuko interior */}
        <mesh position={[0, -2 * U, D / 2 - 4 * U]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[22 * U, 22 * U, 10 * U, 24]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.45} metalness={0.05} />
        </mesh>
        {/* Contactos terra latão */}
        {[-18 * U, 18 * U].map((py, idx) => (
          <mesh key={idx} position={[0, py - 2 * U, D / 2 + 1 * U]}>
            <boxGeometry args={[4 * U, 5 * U, 5 * U]} />
            <meshStandardMaterial color="#d4af37" roughness={0.25} metalness={0.9} />
          </mesh>
        ))}
        {/* Bornes interiores visíveis ao abrir */}
        {coverOpen && (
          <InteriorTerminalStrip
            poles={[
              { label: 'L', color: '#171717' },
              { label: 'N', color: '#2563eb' },
              { label: 'PE', color: '#16a34a' },
            ]}
            y={22 * U}
            z={D / 2 - 2 * U}
          />
        )}
        {/* Tampa articulada superior (abre para cima ao clicar) */}
        <group
          position={[0, H / 2 - 2 * U, D / 2 + 1 * U]}
          rotation={[coverOpen ? -Math.PI * 0.48 : 0, 0, 0]}
          onClick={(e) => { e.stopPropagation(); toggleCover() }}
        >
          <mesh position={[0, -H / 2 + 2 * U, 3 * U]} castShadow>
            <boxGeometry args={[W - 2 * U, H - 2 * U, 5 * U]} />
            <meshStandardMaterial color="#f1f5f9" roughness={0.35} metalness={0.05} />
          </mesh>
        </group>
        {hasConnectedWires && <AutoCableGland x={0} y={H / 2} z={0} />}
      </group>
    )
  }

  // FAMATEL Combo (2P+T azul + 3P+N+T vermelho) ou FAMATEL/ROADEU (2P+T azul + seccionador)
  const W = 175 * U, H = 120 * U, D = 78 * U
  const isCombo = c.type === 'socketFamatelCombo'

  return (
    <group position={position} name={`socket-famatel-${c.id}`}>
      {/* Caixa principal estanque cinza claro */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[W, H, D]} />
        <meshStandardMaterial color="#e5e7eb" roughness={0.42} metalness={0.06} />
      </mesh>
      {/* 4 parafusos nos cantos */}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy], i) => (
        <mesh key={i} position={[sx * (W / 2 - 12 * U), sy * (H / 2 - 12 * U), D / 2 + 1 * U]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[5 * U, 5 * U, 3 * U, 12]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.28} metalness={0.85} />
        </mesh>
      ))}
      {/* Tomada 2P+T 16A 250V Azul (esquerda) */}
      <group position={[-W * 0.25, -4 * U, D / 2]}>
        <mesh position={[0, 0, 8 * U]} castShadow>
          <boxGeometry args={[56 * U, 64 * U, 16 * U]} />
          <meshStandardMaterial color="#1d4ed8" roughness={0.38} metalness={0.08} />
        </mesh>
        <group
          position={[0, 26 * U, 18 * U]}
          rotation={[coverOpen ? -Math.PI * 0.45 : 0, 0, 0]}
          onClick={(e) => { e.stopPropagation(); toggleCover() }}
        >
          <mesh position={[0, -26 * U, 2 * U]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[25 * U, 25 * U, 6 * U, 24]} />
            <meshStandardMaterial color="#2563eb" roughness={0.34} metalness={0.08} />
          </mesh>
        </group>
      </group>

      {isCombo ? (
        /* Tomada 3P+N+T 16A 400V Vermelha (direita) */
        <group position={[W * 0.2, -4 * U, D / 2]}>
          <mesh position={[0, 0, 10 * U]} castShadow>
            <boxGeometry args={[72 * U, 78 * U, 20 * U]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.4} metalness={0.05} />
          </mesh>
          <group
            position={[0, 32 * U, 22 * U]}
            rotation={[coverOpen ? -Math.PI * 0.45 : 0, 0, 0]}
            onClick={(e) => { e.stopPropagation(); toggleCover() }}
          >
            <mesh position={[0, -32 * U, 2 * U]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[34 * U, 34 * U, 7 * U, 28]} />
              <meshStandardMaterial color="#dc2626" roughness={0.32} metalness={0.08} />
            </mesh>
            {famatelLabel && (
              <mesh position={[0, -32 * U, 6 * U]}>
                <planeGeometry args={[40 * U, 20 * U]} />
                <meshStandardMaterial map={famatelLabel} roughness={0.5} />
              </mesh>
            )}
          </group>
        </group>
      ) : (
        /* Seccionador rotativo vermelho/amarelo (direita) + serigrafia ROADEU */
        <group position={[W * 0.2, -6 * U, D / 2]}>
          {roadeuLabel && (
            <mesh position={[0, 44 * U, 1 * U]}>
              <planeGeometry args={[52 * U, 20 * U]} />
              <meshStandardMaterial map={roadeuLabel} roughness={0.5} />
            </mesh>
          )}
          <mesh position={[0, 0, 4 * U]} castShadow>
            <boxGeometry args={[62 * U, 62 * U, 8 * U]} />
            <meshStandardMaterial color="#facc15" roughness={0.38} metalness={0.05} />
          </mesh>
          <group
            position={[0, 0, 12 * U]}
            rotation={[0, 0, switchOn ? 0 : Math.PI / 2]}
            onClick={(e) => { e.stopPropagation(); toggleSwitch() }}
          >
            <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[24 * U, 24 * U, 10 * U, 24]} />
              <meshStandardMaterial color="#dc2626" roughness={0.35} metalness={0.08} />
            </mesh>
            <mesh position={[0, 0, 8 * U]} castShadow>
              <boxGeometry args={[38 * U, 10 * U, 12 * U]} />
              <meshStandardMaterial color="#ef4444" roughness={0.35} metalness={0.08} />
            </mesh>
          </group>
        </group>
      )}

      {/* Bornes interiores visíveis quando a tampa está aberta */}
      {coverOpen && (
        <InteriorTerminalStrip
          poles={
            isCombo
              ? [
                  { label: 'L1', color: '#171717' },
                  { label: 'L2', color: '#8b4513' },
                  { label: 'L3', color: '#6b7280' },
                  { label: 'N', color: '#2563eb' },
                  { label: 'PE', color: '#16a34a' },
                ]
              : [
                  { label: 'L', color: '#171717' },
                  { label: 'N', color: '#2563eb' },
                  { label: 'PE', color: '#16a34a' },
                ]
          }
          y={H / 2 - 14 * U}
          z={D / 2 + 2 * U}
        />
      )}

      {/* Bucim automático ao ligar cabos aos bornes */}
      {hasConnectedWires && <AutoCableGland x={0} y={H / 2} z={0} />}
    </group>
  )
}
