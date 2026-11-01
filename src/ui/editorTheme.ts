/**
 * Aspeto comum do espaço de edição: o mesmo fundo, passo, pontos e linhas no
 * Esquema, Painel 3D, GRAFCET, Ladder e editor de componentes do Admin.
 * Alterar aqui mantém os canvases e simuladores visualmente consistentes.
 */

/** Passo comum da grelha dos editores (px no Esquema/GRAFCET; mm no editor 3D). */
export const EDITOR_GRID_STEP = 20

/** Raio dos pontos da grelha e espessura das linhas: sempre em píxeis do ecrã, qualquer zoom ou dispositivo. */
export const EDITOR_GRID_DOT_RADIUS = 1
/** Distância mínima entre pontos no ecrã; abaixo disto o passo duplica (nunca se subdivide, para os pontos coincidirem com o íman). */
export const EDITOR_GRID_MIN_PITCH = 16

/**
 * Passo visual da grelha, em píxeis do ecrã, para um dado zoom.
 * É a ÚNICA regra usada por todos os canvas (Esquema, Esquema IEC, GRAFCET, Ladder, 3D e editor de componentes):
 * com o mesmo zoom o passo é igual em todos, e a baixa ampliação (ex.: ecrã de telemóvel) nunca comprime os pontos
 * até desaparecerem — o passo duplica até ≥ 16 px, mantendo cada ponto sobre um ponto do íman.
 */
export function editorGridPitch(scale = 1, step: number = EDITOR_GRID_STEP): number {
  const base = Number.isFinite(step) && step > 0 ? step : EDITOR_GRID_STEP
  const raw = base * (Number.isFinite(scale) && scale > 0 ? scale : 1)
  return raw * 2 ** Math.max(0, Math.ceil(Math.log2(EDITOR_GRID_MIN_PITCH / raw)))
}

export const EDITOR_THEME = {
  /** Fundo da área de trabalho. */
  background: '#f7f9fc',
  backgroundDark: '#111827',
  /** Pontos da grelha (passo de 20 px / 20 mm). */
  dot: '#c9d3e3',
  dotDark: '#334155',
  /** Linhas da grelha, quando o utilizador escolhe o estilo em linhas. */
  line: '#e4eaf2',
  lineDark: '#273244',
  /** Grelha de chão 3D: linhas principais e secundárias. */
  floorMain: '#b4c0d2',
  floorSub: '#d5dce8',
  floorMainDark: '#475569',
  floorSubDark: '#273244',
  /** Passo da grelha, em pixels do esquema (1 px = 1 mm no 3D). */
  step: EDITOR_GRID_STEP,
} as const

/** Conjunto de cores do tema claro ou escuro. */
export const editorPalette = (dark: boolean) => ({
  background: dark ? EDITOR_THEME.backgroundDark : EDITOR_THEME.background,
  dot: dark ? EDITOR_THEME.dotDark : EDITOR_THEME.dot,
  line: dark ? EDITOR_THEME.lineDark : EDITOR_THEME.line,
  floorMain: dark ? EDITOR_THEME.floorMainDark : EDITOR_THEME.floorMain,
  floorSub: dark ? EDITOR_THEME.floorSubDark : EDITOR_THEME.floorSub,
})

/** Fundo comum; o passo visual pode ser reduzido pelo zoom sem alterar o snap. */
export function editorGridBackground({ enabled = true, style = 'dots', spacing = EDITOR_GRID_STEP, dark = false, x = 0, y = 0 }: {
  enabled?: boolean; style?: 'dots' | 'lines'; spacing?: number; dark?: boolean; x?: number; y?: number
} = {}) {
  const palette = editorPalette(dark)
  const step = Number.isFinite(spacing) && spacing > 0 ? spacing : EDITOR_GRID_STEP
  return {
    backgroundColor: palette.background,
    backgroundImage: !enabled ? 'none' : style === 'lines'
      ? `linear-gradient(to right, ${palette.line} 1px, transparent 1px), linear-gradient(to bottom, ${palette.line} 1px, transparent 1px)`
      : `radial-gradient(circle at 1px 1px, ${palette.dot} 1px, transparent 1px)`,
    backgroundSize: `${step}px ${step}px`,
    backgroundPosition: `${x}px ${y}px`,
  }
}
