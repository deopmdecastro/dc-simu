/**
 * Caixa de bornes do SEW DRN80MK4/B3 medida no CAD partilhado
 * (`public/models/motores/DRN80MK4-B3.glb`, mm, Y para cima, veio em +X).
 *
 * Um único sítio para as medidas: a geometria gerada (caixa aberta, placa
 * isolante, bornes M4 com porca-luva, PE), os pontos de ligação
 * (`REAL_TERMINALS.motor3ph`), as pontes Y/Δ e a pá do veio usam todos estes
 * valores — antes, a placa era desenhada no centro do motor (x = 132 mm) e a
 * caixa do CAD está em x ≈ 101 mm, por isso bornes e placa ficavam desalinhados.
 *
 * Sem dependências (é importado pelas tabelas elétricas e pelos testes).
 */

/** Volume do CAD (mm). */
export const MOTOR_CAD = { minX: 0, maxX: 264, minY: -80, maxY: 128, minZ: -78, maxZ: 78 } as const
export const MOTOR_SIZE = { width: 264, height: 208, depth: 156 } as const

/** Caixa de bornes do CAD: contorno exterior e topo. */
export const MOTOR_BOX = { x0: 46, x1: 156, z0: -56.5, z1: 56.5, base: 98, top: 128, wall: 5, corner: 8 } as const

/** Fundo do compartimento depois de retirar a tampa (mm, referencial do CAD). */
export const MOTOR_FLOOR_Y = 104
/** Placa isolante de seis bornes (topo e dimensões). */
export const MOTOR_BOARD = { cx: 101, cz: -7, w: 62, d: 46, h: 8 } as const
export const MOTOR_BOARD_TOP = MOTOR_FLOOR_Y + MOTOR_BOARD.h
/** Anilha/pontes, porca-luva M4 (sextavado 7 mm) e furo onde aperta o terminal do cabo. */
export const MOTOR_STUD = { washer: 2, nutHeight: 6.4, nutAcrossFlats: 7, bore: 4.8, pitchX: 18 } as const
export const MOTOR_NUT_TOP = MOTOR_BOARD_TOP + MOTOR_STUD.washer + MOTOR_STUD.nutHeight
/** Profundidade do furo (topo da porca até ao topo do perno). */
export const MOTOR_SOCKET_DEPTH = MOTOR_STUD.nutHeight - 1

/** Fila de trás W2 U2 V2 e fila da frente U1 V1 W1 (IEC 60034-8, vista de frente). */
export const MOTOR_ROW_Z = { back: MOTOR_BOARD.cz - 10, front: MOTOR_BOARD.cz + 10 } as const
const COLS = [MOTOR_BOARD.cx - MOTOR_STUD.pitchX, MOTOR_BOARD.cx, MOTOR_BOARD.cx + MOTOR_STUD.pitchX]

/** Borne de terra: grampo próprio no fundo da caixa, junto à entrada de cabos. */
export const MOTOR_PE = { x: MOTOR_BOARD.cx, z: 36, pedestal: 12 } as const
/** Bucim M20 na parede da frente da caixa. */
export const MOTOR_GLAND = { x: 128, y: 114, diameter: 20 } as const

export type MotorTerminalLabel = 'U1' | 'V1' | 'W1' | 'W2' | 'U2' | 'V2' | 'PE'

/** Centro de cada borne no referencial do CAD (mm): x, topo da porca, z. */
export const MOTOR_TERMINALS_MM: Record<MotorTerminalLabel, [number, number, number]> = {
  W2: [COLS[0], MOTOR_NUT_TOP, MOTOR_ROW_Z.back],
  U2: [COLS[1], MOTOR_NUT_TOP, MOTOR_ROW_Z.back],
  V2: [COLS[2], MOTOR_NUT_TOP, MOTOR_ROW_Z.back],
  U1: [COLS[0], MOTOR_NUT_TOP, MOTOR_ROW_Z.front],
  V1: [COLS[1], MOTOR_NUT_TOP, MOTOR_ROW_Z.front],
  W1: [COLS[2], MOTOR_NUT_TOP, MOTOR_ROW_Z.front],
  PE: [MOTOR_PE.x, MOTOR_NUT_TOP, MOTOR_PE.z],
}

/** Ordem de leitura dos bornes (tabela de ligações). */
export const MOTOR_TERMINAL_ORDER: MotorTerminalLabel[] = ['W2', 'U2', 'V2', 'U1', 'V1', 'W1', 'PE']

/** Frações do volume (convenção de `REAL_TERMINALS`: y = 0 no topo, z = 1 à frente). */
export function motorTerminalFraction(label: MotorTerminalLabel): { x: number; y: number; z: number } {
  const [x, y, z] = MOTOR_TERMINALS_MM[label]
  return {
    x: (x - MOTOR_CAD.minX) / MOTOR_SIZE.width,
    y: (MOTOR_CAD.maxY - y) / MOTOR_SIZE.height,
    z: (z - MOTOR_CAD.minZ) / MOTOR_SIZE.depth,
  }
}

/** Do referencial do CAD para o do editor / componente (centrado em X e Z, base em Y = 0). */
export function motorCadToCentered([x, y, z]: [number, number, number]): [number, number, number] {
  return [x - (MOTOR_CAD.minX + MOTOR_CAD.maxX) / 2, y - MOTOR_CAD.minY, z - (MOTOR_CAD.minZ + MOTOR_CAD.maxZ) / 2]
}

/** Pontes de latão (centro, comprimento ao longo de X ou Z) por tipo de ligação. */
export function motorBridges(connection: 'star' | 'delta' | 'none'): Array<{ key: string; name: string; center: [number, number, number]; along: 'x' | 'z'; length: number }> {
  // ligeiramente mais alta do que as anilhas (evita faces coplanares); a porca aperta por cima
  const y = MOTOR_BOARD_TOP + MOTOR_STUD.washer / 2 + .1
  const t = MOTOR_TERMINALS_MM
  const mid = (a: MotorTerminalLabel, b: MotorTerminalLabel): [number, number, number] => [(t[a][0] + t[b][0]) / 2, y, (t[a][2] + t[b][2]) / 2]
  if (connection === 'star') return [
    { key: 'ys1', name: 'Ponte estrela W2-U2', center: mid('W2', 'U2'), along: 'x', length: MOTOR_STUD.pitchX + 8 },
    { key: 'ys2', name: 'Ponte estrela U2-V2', center: mid('U2', 'V2'), along: 'x', length: MOTOR_STUD.pitchX + 8 },
  ]
  if (connection === 'delta') return [
    { key: 'd1', name: 'Ponte triângulo W2-U1', center: mid('W2', 'U1'), along: 'z', length: MOTOR_ROW_Z.front - MOTOR_ROW_Z.back + 8 },
    { key: 'd2', name: 'Ponte triângulo U2-V1', center: mid('U2', 'V1'), along: 'z', length: MOTOR_ROW_Z.front - MOTOR_ROW_Z.back + 8 },
    { key: 'd3', name: 'Ponte triângulo V2-W1', center: mid('V2', 'W1'), along: 'z', length: MOTOR_ROW_Z.front - MOTOR_ROW_Z.back + 8 },
  ]
  return []
}

/** Pá de três pás no veio (veio Ø19 de x = 241 a 264 mm, eixo em y = z = 0). */
export const MOTOR_FAN = { hubX: 256, hubLength: 14, hubDiameter: 30, diameter: 110, blades: 3, pitchDeg: 28, bladeWidth: 32 } as const
