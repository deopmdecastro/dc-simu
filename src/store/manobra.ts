/**
 * Regra ÚNICA de manobra (global, não por componente): nenhum aparelho é
 * manobrado — ligar/desligar, premir botões, rodar seletores, abrir o
 * porta-fusível, TEST/RESET, teclas de medidores, comandos do catálogo — antes
 * de ▶ (simulação em RUN ou PAUSA). Vale também na demonstração.
 *
 * Em STOP continuam livres a montagem e a configuração: parâmetros nominais,
 * cores, pontes, porta do quadro e tampas de barramento.
 * Os gestos do utilizador passam por `operateComponent`/`actuateImported`/
 * `pressButton` no store, que aplicam esta regra; a interface usa
 * `useManobraAllowed` só para desativar botões e mostrar o aviso.
 */
export type ManobraState = { sim: { runState: string } }

export const isManobraAllowed = (state: ManobraState): boolean => state.sim.runState !== 'stopped'

export const MANOBRA_BLOCKED_TITLE = 'Inicie a simulação (▶) para manobrar o aparelho'

/**
 * Chaves de estado que representam a posição de manobra de um aparelho.
 * Usadas para bloquear a edição direta destes campos no inspetor em STOP.
 */
export const MANOBRA_STATE_KEYS: ReadonlySet<string> = new Set([
  'closed', 'tripped', 'tripReason', 'blown',
  'pressed', 'startPressed', 'stopPressed', 'testPressed', 'resetPressed', 'pressedButton',
  'position', 'triggered', 'switchOn', 'screenMode', 'energy',
  'catalogState', 'catalogVars', 'channels', 'controlCoverOpen', 'editing', 'menu',
])

/** Largar um comando de mola é sempre permitido, para nada ficar «premido» ao parar. */
const RELEASE_VALUES: Readonly<Record<string, unknown>> = {
  pressed: false, startPressed: false, stopPressed: false, testPressed: false, resetPressed: false, pressedButton: null,
}

/**
 * Parte de um gesto que pode ser aplicada agora: tudo em RUN/PAUSA; em STOP só
 * as libertações de mola. `null` quando nada sobra.
 */
export function allowedManobraPatch(state: ManobraState, patch: Record<string, unknown>): Record<string, unknown> | null {
  if (isManobraAllowed(state)) return patch
  const kept = Object.fromEntries(Object.entries(patch).filter(([key, value]) => key in RELEASE_VALUES && RELEASE_VALUES[key] === value))
  return Object.keys(kept).length ? kept : null
}
