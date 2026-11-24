/**
 * Geometria dos PLC Siemens S7 importados — S7-1500 DI 32×24 V (6ES7521-1BL00-0AB0),
 * S7-1500 CPU 1511C-1 PN (6ES7511-1CK00-0AB0) e S7-300 CPU 315-2 DP.
 *
 * Os três CAD de `public/models/controladores` chegam em referenciais diferentes
 * dos restantes modelos do catálogo. Antes desta correção a frente ficava virada
 * para o lado: o módulo aparecia de perfil, com os bornes escondidos.
 *
 * Referencial de cada CAD (medido nos GLB; ver `docs/vistas-plc/`):
 *
 *  · S7-1500 DI 32 e CPU 1511C: topo em +Z, frente (painel com os conectores,
 *    visor e teclado) em −Y, bornes/lâmpadas em −X e perfil de calha em +X.
 *    A rotação base era só `Rx(+90)`, que punha o comprimento (147 mm) para cima
 *    e a frente virada para baixo. A pose correta é `Rx(−90)`: topo → +Y,
 *    frente → +Z, bornes → −X e perfil de calha → −Z (encostado à chapa).
 *  · S7-300 CPU 315-2 DP: o CAD já vem de face — topo +Y, frente +Z, bornes/lâmpadas
 *    em −X e perfil de calha em −Z. **Não leva rotação base**.
 *
 * Em ambos a frente é a face oposta ao perfil de encaixe, como em qualquer
 * equipamento de calha (mesma regra `FACE_OUTWARD` de `realInterfaces.ts`).
 *
 * As tabelas abaixo estão em frações da frente **contadas do topo** (y 0 = topo do
 * módulo, 1 = base), como se lê no CAD. O inspetor de bornes usa `position3D` com o
 * y ao contrário (0 = base), e a conversão é feita em `factory.ts` — uma só vez.
 */

import type { ComponentType } from '../types'

/** Os três PLC Siemens S7 importados (ver `factory.ts` e `realInterfaces.ts`). */
export const SIEMENS_S7_TYPES: ComponentType[] = ['plcSiemensS71500Di32', 'plcSiemensS71500Cpu1511c', 'plcSiemensS7300Cpu315', 'plcSiemensS7300Cpu315PnDp', 'plcSiemensS7300Sm321Di32', 'plcSiemensS7300Sm322Do32', 'plcSiemensS7300Sm334AiAo']

/** Larguras de passo do S7-1500: 25 mm (1×) e 70 mm (2×); o CAD mede 47 e 84,9 mm. */
export const S71500_DI32_WIDTH_MM = 47
export const S71500_CPU_WIDTH_MM = 85
export const S71500_HEIGHT_MM = 147
export const S71500_DEPTH_MM = 131.7
/** CPU 315-2 DP: 40 × 122,1 × 125 mm no CAD. */
export const S7300_CPU_WIDTH_MM = 40
export const S7300_CPU_HEIGHT_MM = 122.1
export const S7300_CPU_DEPTH_MM = 125.04

/**
 * Face por onde o cabo entra nos três módulos: a frente do aparelho. O CAD
 * desenha o encaixe na lateral (`left`), mas o cabo sai sempre pela frente.
 */
export const S7_FRONT_FACE = 'front' as const

/**
 * Primeira e última fila de contactos do conector frontal do S7-1500, contadas do
 * topo (0 = topo do módulo). A primeira fila fica a 10,7 % do topo e a última a 94 %.
 */
const ROW_FIRST = 0.107
const ROW_LAST = 0.94

/**
 * Colunas dos bornes, tiradas das peças do CAD que desenham os pinos dos conectores
 * (`rows.mjs`/`strips.mjs`): no DI 32 a coluna esquerda está a x 0,283 e a direita a
 * 0,974; na CPU 1511C a esquerda a 0,434 (conector X10, ao lado do visor) e a direita
 * a 0,97 (X11, encostado à borda). São os pinos reais — é aí que o borne tem de ficar.
 */
export const S71500_DI32_COLUMNS = { left: 0.283, right: 0.974 } as const
export const S71500_CPU_COLUMNS = { left: 0.434, right: 0.968 } as const

/** Distribui `count` bornes por `rows` filas igualmente espaçadas entre a primeira e a última. */
function column(count: number, from = ROW_FIRST, to = ROW_LAST): number[] {
  if (count === 1) return [(from + to) / 2]
  const step = (to - from) / (count - 1)
  return Array.from({ length: count }, (_, i) => from + i * step)
}

/**
 * S7-1500 DI 32×24 V: dois conectores frontais de 17 contactos, o que o CAD desenha
 * a toda a largura do módulo (barra `mesh_4`, 34,8 mm). A fila de cima leva a
 * alimentação — L+ à esquerda, M à direita. O X10 (coluna esquerda) leva I0.x e
 * I1.x; o X11 (coluna direita) leva I2.x e I3.x, na ordem do aparelho.
 */
export function s71500Di32TerminalRows(): Array<{ label: string; x: number; y: number }> {
  const rows = column(17) // 1 fila de alimentação + 16 filas de E/S
  const out: Array<{ label: string; x: number; y: number }> = [
    { label: 'L+', x: S71500_DI32_COLUMNS.left, y: rows[0] },
    { label: 'M', x: S71500_DI32_COLUMNS.right, y: rows[0] },
  ]
  for (let i = 0; i < 32; i++) {
    const byte = Math.floor(i / 8)
    out.push({
      label: `I${byte}.${i % 8}`,
      x: byte < 2 ? S71500_DI32_COLUMNS.left : S71500_DI32_COLUMNS.right,
      y: rows[(i % 16) + 1],
    })
  }
  return out
}

/**
 * CPU 1511C-1 PN: 16 DI no conector X10 (coluna esquerda) e 16 DQ no X11 (coluna
 * direita), mais L+/M na fila de cima e o port PROFINET (X1 P1/P2) no canto
 * inferior esquerdo da frente. A faixa da esquerda é o visor — não tem bornes.
 */
export function s71500Cpu1511cTerminalRows(): Array<{ label: string; x: number; y: number }> {
  const rows = column(17)
  const out: Array<{ label: string; x: number; y: number }> = [
    { label: 'L+', x: S71500_CPU_COLUMNS.left, y: rows[0] },
    { label: 'M', x: S71500_CPU_COLUMNS.right, y: rows[0] },
    { label: 'PN', x: 0.10, y: 0.955 },
  ]
  for (let i = 0; i < 16; i++) {
    const byte = Math.floor(i / 8)
    out.push({ label: `I${byte}.${i % 8}`, x: S71500_CPU_COLUMNS.left, y: rows[i + 1] })
    out.push({ label: `Q${byte}.${i % 8}`, x: S71500_CPU_COLUMNS.right, y: rows[i + 1] })
  }
  return out
}

/**
 * CPU 315-2 DP: L+/M e as interfaces MPI/DP ficam na metade inferior da frente, por
 * baixo da tampa do compartimento. O CAD só desenha a carcaça e a tampa, por isso o
 * ponto é a boca da tampa onde os bornes assentam.
 */
export function s7300Cpu315TerminalRows(): Array<{ label: string; x: number; y: number }> {
  return [
    { label: 'L+', x: 0.18, y: 0.62 },
    { label: 'M', x: 0.18, y: 0.70 },
    { label: 'MPI', x: 0.18, y: 0.86 },
    { label: 'DP', x: 0.18, y: 0.94 },
  ]
}

/* ==========================================================================
 * S7-300 modules — CPU 315-2 PN/DP + SM321 / SM322 / SM334
 * Cotas oficiais Siemens (mm): largura de passo 40 mm, altura ~125 mm, profundidade ~120 mm.
 * ========================================================================== */

export const S7300_SM_WIDTH_MM = 40
export const S7300_SM_HEIGHT_MM = 125
export const S7300_SM_DEPTH_MM = 120

/** CPU 315-2 PN/DP 6ES7315-2EH14-0AB0 — mesma envolvente da 315-2 DP + portas PN. */
export const S7300_CPU_PN_ORDER = '6ES7315-2EH14-0AB0'
export const S7300_SM321_ORDER = '6ES7321-1BL00-0AA0'
export const S7300_SM322_ORDER = '6ES7322-1BL00-0AA0'
export const S7300_SM334_ORDER = '6ES7334-0CE01-0AA0'

export const SIEMENS_S7300_MODULE_TYPES: ComponentType[] = [
  'plcSiemensS7300Cpu315PnDp',
  'plcSiemensS7300Sm321Di32',
  'plcSiemensS7300Sm322Do32',
  'plcSiemensS7300Sm334AiAo',
]

/** Bornes da CPU 315-2 PN/DP: alimentação + MPI + DP + 2× PN. */
export function s7300Cpu315PnDpTerminalRows(): Array<{ label: string; x: number; y: number }> {
  return [
    { label: 'L+', x: 0.18, y: 0.58 },
    { label: 'M', x: 0.18, y: 0.66 },
    { label: 'MPI', x: 0.18, y: 0.78 },
    { label: 'DP', x: 0.18, y: 0.86 },
    { label: 'PN1', x: 0.55, y: 0.90 },
    { label: 'PN2', x: 0.78, y: 0.90 },
  ]
}

/**
 * Conector frontal de 40 pólos do S7-300 (6ES7392-1AM00-0AA0, parafuso): duas colunas de 20 bornes,
 * **1–20 à esquerda e 21–40 à direita, numerados de cima para baixo**. As cotas (fração da largura e
 * da altura do módulo, a partir do topo) coincidem com o desenho 3D (`siemensS7300Model.ts`): por
 * baixo da faixa de LEDs, passo ≈ 5 mm.
 */
export const S7300_FC40 = { xLeft: 0.3, xRight: 0.7, yTop: 0.215, yBottom: 0.955 } as const
export function s7300Fc40Pin(pin: number): { x: number; y: number } {
  const col = pin <= 20 ? 0 : 1
  const row = (pin - 1) % 20
  return {
    x: col === 0 ? S7300_FC40.xLeft : S7300_FC40.xRight,
    y: S7300_FC40.yTop + (row * (S7300_FC40.yBottom - S7300_FC40.yTop)) / 19,
  }
}
const pinRow = (label: string, pin: number) => ({ label, pin, ...s7300Fc40Pin(pin) })

/**
 * SM321 DI 32×DC24V (6ES7321-1BL00-0AA0), conector de 40 pólos — atribuição Siemens:
 *  - entradas: byte x nos bornes 2–9, x+1 em 12–19, x+2 em 22–29, x+3 em 32–39;
 *  - 1M no borne 20 (grupo dos bytes x/x+1) e 2M no 40 (bytes x+2/x+3);
 *  - bornes 1, 11, 21 e 31 **não são usados** no módulo de entradas (o mesmo conector serve o SM322,
 *    onde são as alimentações L+ dos grupos) — por isso não há borne L+ no SM321.
 * O rótulo «M» é o 1M (compatível com projetos antigos).
 */
export function s7300Sm321TerminalRows(firstByte = 0): Array<{ label: string; x: number; y: number; pin: number }> {
  const out = [pinRow('M', 20), pinRow('2M', 40)]
  for (let i = 0; i < 32; i++) {
    const byte = Math.floor(i / 8), bit = i % 8
    out.push(pinRow(`I${firstByte + byte}.${bit}`, [2, 12, 22, 32][byte] + bit))
  }
  return out
}

/** Byte de saída onde começa o SM322 nesta bancada (o guião 1185 usa Q4.0…Q5.6). */
export const S7300_SM322_FIRST_BYTE = 4

/**
 * SM322 DO 32×DC24V/0.5A (6ES7322-1BL00-0AA0), conector de 40 pólos — atribuição Siemens, saídas
 * isoladas em 4 grupos de 8, cada um com a sua alimentação:
 *  - 1L+ borne 1, Q x.0–x.7 bornes 2–9, 1M borne 10;
 *  - 2L+ borne 11, Q x+1 bornes 12–19, 2M borne 20;
 *  - 3L+ borne 21, Q x+2 bornes 22–29, 3M borne 30;
 *  - 4L+ borne 31, Q x+3 bornes 32–39, 4M borne 40.
 * O endereço físico define o byte inicial; no guião 1185 as saídas estão em Q4.x/Q5.x. «L+»/«M» são
 * o 1L+/1M (compatível com projetos antigos).
 */
export function s7300Sm322TerminalRows(firstByte = S7300_SM322_FIRST_BYTE): Array<{ label: string; x: number; y: number; pin: number }> {
  const out = [
    pinRow('L+', 1), pinRow('M', 10), pinRow('2L+', 11), pinRow('2M', 20),
    pinRow('3L+', 21), pinRow('3M', 30), pinRow('4L+', 31), pinRow('4M', 40),
  ]
  for (let i = 0; i < 32; i++) {
    const byte = Math.floor(i / 8), bit = i % 8
    out.push(pinRow(`Q${firstByte + byte}.${bit}`, [2, 12, 22, 32][byte] + bit))
  }
  return out
}

/** SM334 AI 4 / AO 2 — 4 entradas analógicas + 2 saídas + alimentação. */
export function s7300Sm334TerminalRows(): Array<{ label: string; x: number; y: number }> {
  return [
    { label: 'L+', x: 0.20, y: 0.10 },
    { label: 'M', x: 0.80, y: 0.10 },
    { label: 'AI0+', x: 0.20, y: 0.22 },
    { label: 'AI0-', x: 0.80, y: 0.22 },
    { label: 'AI1+', x: 0.20, y: 0.34 },
    { label: 'AI1-', x: 0.80, y: 0.34 },
    { label: 'AI2+', x: 0.20, y: 0.46 },
    { label: 'AI2-', x: 0.80, y: 0.46 },
    { label: 'AI3+', x: 0.20, y: 0.58 },
    { label: 'AI3-', x: 0.80, y: 0.58 },
    { label: 'AO0+', x: 0.20, y: 0.72 },
    { label: 'AO0-', x: 0.80, y: 0.72 },
    { label: 'AO1+', x: 0.20, y: 0.84 },
    { label: 'AO1-', x: 0.80, y: 0.84 },
  ]
}
