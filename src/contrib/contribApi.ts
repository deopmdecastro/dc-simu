import { activeAccountBackend } from '../auth/accountApi'
import { localContrib } from './localContrib'
import { serverContrib } from './serverContrib'
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

/** Usa a API SQLite quando a sessão é do servidor (Docker) e o armazenamento local no deploy estático. */
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
  return activeAccountBackend() === 'server' ? serverContrib : localContrib
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
