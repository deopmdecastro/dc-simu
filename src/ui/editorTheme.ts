/**
 * Aspeto comum do espaço de edição: o mesmo fundo, a mesma grelha e as mesmas
 * cores de chão no esquema 2D, nas visualizações 3D e no editor de componentes
 * do Admin. Alterar aqui muda os três de uma só vez.
 */

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
  step: 20,
} as const

/** Conjunto de cores do tema claro ou escuro. */
export const editorPalette = (dark: boolean) => ({
  background: dark ? EDITOR_THEME.backgroundDark : EDITOR_THEME.background,
  dot: dark ? EDITOR_THEME.dotDark : EDITOR_THEME.dot,
  line: dark ? EDITOR_THEME.lineDark : EDITOR_THEME.line,
  floorMain: dark ? EDITOR_THEME.floorMainDark : EDITOR_THEME.floorMain,
  floorSub: dark ? EDITOR_THEME.floorSubDark : EDITOR_THEME.floorSub,
})
