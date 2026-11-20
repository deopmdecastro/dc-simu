import { useSimStore } from './useSimStore'
import { isManobraAllowed } from './manobra'

/** Versão reativa da regra global de manobra (ver `store/manobra.ts`). */
export const useManobraAllowed = (): boolean => useSimStore(isManobraAllowed)
