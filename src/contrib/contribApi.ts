import { activeAccountBackend } from '../auth/accountApi'
import { localContrib } from './localContrib'
import { serverContrib } from './serverContrib'
import { supabaseContrib } from './supabaseContrib'
import type { Contribution, ContributionFilter, ContributionInput, ContributionStatus, ContribStats } from './types'

export interface ContribBackend {
  list(filter?: ContributionFilter): Promise<Contribution[]>
  submit(input: ContributionInput, file: File): Promise<Contribution>
  /** Só o autor; volta a pôr a contribuição «em revisão». */
  update(id: string, patch: Partial<ContributionInput>, file?: File): Promise<Contribution>
  remove(id: string): Promise<void>
  /** Só o administrador. */
  review(id: string, status: ContributionStatus, note: string): Promise<Contribution>
  file(id: string): Promise<Blob>
  stats(): Promise<ContribStats>
}

/** Usa o backend da sessão atual; não envia dados de produção para armazenamento local. */
export const contribApi: ContribBackend = {
  list: (filter) => backend().list(filter),
  submit: (input, file) => backend().submit(input, file),
  update: (id, patch, file) => backend().update(id, patch, file),
  remove: (id) => backend().remove(id),
  review: (id, status, note) => backend().review(id, status, note),
  file: (id) => backend().file(id),
  stats: () => backend().stats(),
}

function backend(): ContribBackend {
  const mode = activeAccountBackend()
  if (mode === 'server') return serverContrib
  if (mode === 'supabase') return supabaseContrib
  if (typeof __APP_STATIC_DEPLOY__ !== 'undefined' && __APP_STATIC_DEPLOY__) {
    throw new Error('As contribuições de produção exigem uma sessão Supabase ativa.')
  }
  return localContrib
}

/** Descarrega um ficheiro de contribuição com o nome original. */
export async function downloadContribution(item: Contribution) {
  const blob = await contribApi.file(item.id)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = item.fileName
  document.body.append(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
