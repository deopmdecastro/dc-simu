import { create } from 'zustand'

/** Preferências do editor Ladder — guardadas no navegador (não fazem parte do projeto). */
export interface LadderPrefs {
  /** pedir confirmação antes de eliminar uma network (o Ctrl+Z também a repõe) */
  confirmDelete: boolean
  /** mostrar a dica "clique insere · arraste…" na barra de cada network */
  showStripHint: boolean
  /** deslocar automaticamente a vista para a network ativa ao navegar pelo teclado */
  autoScroll: boolean
  /** mostrar avisos rápidos ("Desfeito", "Network duplicada"…) */
  showToasts: boolean
}

const KEY = 'dcsimu:ladder:prefs'
const DEFAULTS: LadderPrefs = { confirmDelete: false, showStripHint: true, autoScroll: true, showToasts: true }

function load(): LadderPrefs {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } } catch { return DEFAULTS }
}

interface PrefsStore extends LadderPrefs {
  set: (patch: Partial<LadderPrefs>) => void
  reset: () => void
}

export const useLadderPrefs = create<PrefsStore>((set, get) => ({
  ...load(),
  set: (patch) => {
    set(patch)
    const { set: _s, reset: _r, ...prefs } = get()
    try { localStorage.setItem(KEY, JSON.stringify(prefs)) } catch { /* navegação privada */ }
  },
  reset: () => {
    set(DEFAULTS)
    try { localStorage.removeItem(KEY) } catch { /* navegação privada */ }
  },
}))
