import { useMemo, type ReactNode } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three-stdlib'

/**
 * Base de montagem BALLUFF para sensores — fiel ao render de referência (image-11.png):
 * base em liga clara com calha e abóbada, coluna em aço polido, mordente central
 * gravado BALLUFF, braço horizontal com mordente secundário e chapa de olhal para
 * fixação do sensor. Acentos em anodizado verde-água e parafusos sextavados escuros.
 *
 * Escala: milímetros reais (PANEL_UNITS_PER_MM = 0.01). Origem na face inferior da base.
 * `children` é renderizado no centro do olhal (para montar o sensor).
 */

const U = 0.01

function balluffEngravingTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 128
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, c.width, c.height)
  ctx.fillStyle = 'rgba(82, 92, 104, 0.55)'
  ctx.font = '600 58px Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // Estilo BALLUFF: texto com colchetes laterais
  ctx.fillText('| BALLUFF', c.width / 2, c.height / 2)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function SensorMountBalluff3D({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  armYawDeg = 0,
  children,
}: {
  position?: [number, number, number]
  rotation?: [number, number, number]
  armYawDeg?: number
  children?: ReactNode
}) {
  const engraveTex = useMemo(() => balluffEngravingTexture(), [])
  const baseGeom = useMemo(() => new RoundedBoxGeometry(58, 30, 44, 4, 7), [])
  const eyePlateGeom = useMemo(() => new RoundedBoxGeometry(34, 46, 9, 3, 4), [])

  const metal = '#dfe4e9'
  const steel = '#cdd5dd'
  const accent = '#57c4b8'
  const dark = '#242a31'

  // Dimensões reais (mm)
  const baseW = 58, baseH = 30, baseD = 44
  const postX = 17, postR = 7, postTop = 132
  const hubY = 143, hubR = 16.5, hubH = 23
  const armY = 154, armR = 7.5, armLeft = -78, armRight = 58
  const clampX = -42
  const eyeX = -80, eyeY = 172, eyeR = 13

  return (
    <group position={position} rotation={rotation} scale={[U, U, U]}>
      <group rotation={[0, (armYawDeg * Math.PI) / 180, 0]}>
        {/* ── Base ── */}
        <mesh position={[0, baseH / 2, 0]} castShadow receiveShadow>
          <primitive object={baseGeom} attach="geometry" />
          <meshStandardMaterial color={metal} metalness={0.5} roughness={0.38} />
        </mesh>
        {/* Calha superior + abóbada esférica */}
        <mesh position={[baseW * 0.16, baseH - 2, 0]}>
          <boxGeometry args={[baseW * 0.52, 4, baseD * 0.42]} />
          <meshStandardMaterial color="#c3cad2" metalness={0.55} roughness={0.4} />
        </mesh>
        <mesh position={[baseW * 0.16, baseH - 1, 0]}>
          <sphereGeometry args={[10.5, 22, 16]} />
          <meshStandardMaterial color={metal} metalness={0.5} roughness={0.34} />
        </mesh>
        {/* Abraçadeira de entrada da coluna (branco + anel verde-água + parafuso) */}
        <mesh position={[postX, baseH - 3, 0]}>
          <cylinderGeometry args={[11.5, 12.5, 12, 22]} />
          <meshStandardMaterial color={metal} metalness={0.5} roughness={0.36} />
        </mesh>
        <mesh position={[postX, baseH - 8, 0]}>
          <cylinderGeometry args={[12.2, 12.2, 3.4, 22]} />
          <meshStandardMaterial color={accent} metalness={0.35} roughness={0.42} />
        </mesh>
        <mesh position={[postX, baseH - 3, 11]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[2.6, 2.6, 4, 6]} />
          <meshStandardMaterial color={dark} metalness={0.6} roughness={0.5} />
        </mesh>
        {/* Gravação BALLUFF na base */}
        <mesh position={[-baseW * 0.18, baseH * 0.52, baseD / 2 + 0.15]}>
          <planeGeometry args={[24, 5.4]} />
          <meshStandardMaterial map={engraveTex} transparent opacity={0.6} roughness={0.5} />
        </mesh>
        {/* Recorte inferior + pé esférico */}
        <mesh position={[-baseW * 0.2, 3, 0]}>
          <sphereGeometry args={[5.5, 16, 12]} />
          <meshStandardMaterial color={dark} metalness={0.4} roughness={0.55} />
        </mesh>

        {/* ── Coluna ── */}
        <mesh position={[postX, (baseH + postTop) / 2, 0]} castShadow>
          <cylinderGeometry args={[postR, postR, postTop - baseH, 22]} />
          <meshStandardMaterial color={steel} metalness={0.94} roughness={0.16} />
        </mesh>

        {/* ── Mordente central (braço) ── */}
        <mesh position={[postX, hubY, 0]} castShadow>
          <cylinderGeometry args={[hubR, hubR, hubH, 26]} />
          <meshStandardMaterial color={metal} metalness={0.52} roughness={0.36} />
        </mesh>
        {/* Sela curva do braço */}
        <mesh position={[postX - 14, hubY + hubH / 2 - 3.5, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[armR + 3.4, armR + 3.4, 17, 18, 1, false, Math.PI * 0.05, Math.PI * 0.9]} />
          <meshStandardMaterial color={metal} metalness={0.52} roughness={0.36} side={THREE.DoubleSide} />
        </mesh>
        {/* Estubo lateral + acento verde-água + parafuso sextavado */}
        <mesh position={[postX + hubR + 5, hubY, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[6.5, 6.5, 12, 18]} />
          <meshStandardMaterial color={steel} metalness={0.9} roughness={0.2} />
        </mesh>
        <mesh position={[postX, hubY - hubH / 2 + 2.2, 0]}>
          <cylinderGeometry args={[hubR * 0.82, hubR * 0.82, 2.2, 24]} />
          <meshStandardMaterial color={accent} metalness={0.35} roughness={0.42} transparent opacity={0.9} />
        </mesh>
        <mesh position={[postX, hubY, hubR + 0.2]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[3, 3, 3, 6]} />
          <meshStandardMaterial color={dark} metalness={0.6} roughness={0.5} />
        </mesh>
        {/* Gravação BALLUFF no mordente */}
        <mesh position={[postX, hubY + 2, hubR + 0.35]}>
          <planeGeometry args={[15, 3.6]} />
          <meshStandardMaterial map={engraveTex} transparent opacity={0.6} roughness={0.5} />
        </mesh>

        {/* ── Braço horizontal ── */}
        <mesh position={[(armLeft + armRight) / 2, armY, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[armR, armR, armRight - armLeft, 20]} />
          <meshStandardMaterial color={steel} metalness={0.94} roughness={0.16} />
        </mesh>
        {/* Remate do braço à direita */}
        <mesh position={[armRight, armY, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[armR + 1.2, armR + 0.4, 6, 20]} />
          <meshStandardMaterial color={steel} metalness={0.92} roughness={0.18} />
        </mesh>

        {/* ── Mordente secundário ── */}
        <mesh position={[clampX, armY, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[11, 11, 18, 22]} />
          <meshStandardMaterial color={metal} metalness={0.52} roughness={0.36} />
        </mesh>
        <mesh position={[clampX, armY + 9.6, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[armR + 3.2, armR + 3.2, 19, 18, 1, false, Math.PI * 0.08, Math.PI * 0.84]} />
          <meshStandardMaterial color={metal} metalness={0.52} roughness={0.36} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[clampX, armY - 6, 0]}>
          <cylinderGeometry args={[9, 9, 2, 22]} />
          <meshStandardMaterial color={accent} metalness={0.35} roughness={0.42} transparent opacity={0.9} />
        </mesh>
        <mesh position={[clampX, armY, 11.2]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[2.6, 2.6, 3, 6]} />
          <meshStandardMaterial color={dark} metalness={0.6} roughness={0.5} />
        </mesh>

        {/* ── Chapa de olhal (fixação do sensor) ── */}
        <mesh position={[eyeX, eyeY, 0]} castShadow>
          <primitive object={eyePlateGeom} attach="geometry" />
          <meshStandardMaterial color={metal} metalness={0.5} roughness={0.38} />
        </mesh>
        {/* Olhal: reforço anelar + furo passante (eixo Z) */}
        <mesh position={[eyeX, eyeY + 12, 0]}>
          <torusGeometry args={[eyeR + 4.2, 3.4, 12, 28]} />
          <meshStandardMaterial color={metal} metalness={0.5} roughness={0.38} />
        </mesh>
        <mesh position={[eyeX, eyeY + 12, -4.6]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[eyeR - 1.4, eyeR - 1.4, 2, 22]} />
          <meshStandardMaterial color="#8d959e" metalness={0.6} roughness={0.5} />
        </mesh>

        {/* Sensor (ou outro acessório) montado no olhal — +Z do filho = eixo do olhal */}
        {children ? (
          <group position={[eyeX, eyeY + 12, 0]}>
            {children}
          </group>
        ) : null}
      </group>
    </group>
  )
}
