import type { ComponentType } from '../types'

/** Deliberately narrow equivalence list. iDPN N Vigi (RCBO 1P+N), iID 4P,
 * and Hager 2P are NOT interchangeable. Never rewrite saved component types. */
export const FUNCTIONAL_DUPLICATE_REPLACEMENTS: Partial<Record<ComponentType, ComponentType>> = {
  residualBreaker: 'residualBreakerSchneiderIid4p',
}
export function blockedDuplicateReplacement(type: ComponentType, options: {
  blocked: (type: ComponentType) => boolean
  has3D: (type: ComponentType) => boolean
  available: (type: ComponentType) => boolean
}): ComponentType | null {
  const replacement=FUNCTIONAL_DUPLICATE_REPLACEMENTS[type]
  if(!replacement || (options.has3D(type)&&!options.blocked(type)))return null
  return options.has3D(replacement)&&options.available(replacement)?replacement:null
}
