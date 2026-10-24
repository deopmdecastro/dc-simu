import { foldText } from '../utils/text'

/** Nome limpo: sem margens e com um só espaço entre palavras. */
export const normalizeProjectName = (raw: string) => raw.trim().replace(/\s+/g, ' ')

/**
 * Nome de projeto sem repetidos: devolve `base` limpo; se já existir outro
 * projeto com esse nome (ignorando maiúsculas e acentos), acrescenta-lhe o
 * sufixo _coppy, _coppy2, _coppy3… até ficar único. Devolve '' quando vazio.
 */
export function uniqueProjectName(base: string, existing: readonly string[]): string {
  const trimmed = normalizeProjectName(base)
  if (!trimmed) return ''
  const taken = new Set(existing.map((name) => foldText(normalizeProjectName(name))).filter(Boolean))
  if (!taken.has(foldText(trimmed))) return trimmed
  let index = 1
  let candidate = `${trimmed}_coppy`
  while (taken.has(foldText(candidate))) candidate = `${trimmed}_coppy${++index}`
  return candidate
}
