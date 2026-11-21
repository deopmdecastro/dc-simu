import type { ConduitMedium, TerminalKind } from '../types'

export function terminalConnectionMedium(kind: TerminalKind | undefined): ConduitMedium {
  if (kind === 'hydraulic-in' || kind === 'hydraulic-out') return 'hydraulic'
  if (kind === 'pneumatic' || kind === 'pneumatic-in' || kind === 'pneumatic-out') return 'pneumatic'
  return 'electrical'
}

/** Preserva o modo de cabo existente; as ferramentas de fluido mostram apenas as suas portas. */
export function terminalMatchesConnectionMedium(kind: TerminalKind | undefined, medium: ConduitMedium): boolean {
  return medium === 'electrical' || terminalConnectionMedium(kind) === medium
}
