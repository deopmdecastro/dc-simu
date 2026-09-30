import type { ContribBackend } from './contribApi'
import type { Contribution, ContributionFilter, ContributionInput, ContribStats } from './types'
import { readValidationHead, validateFile, validateInput } from './validate'

async function json<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch('/api' + url, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(data.error || 'Falha no servidor')
  return data as T
}

async function upload(id: string, file: File) {
  const response = await fetch(`/api/contributions/${id}/file`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
  })
  const data = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(data.error || 'Falha ao enviar o ficheiro')
}

async function checkLocally(kind: Contribution['kind'], file: File) {
  const head = await readValidationHead(file)
  const result = validateFile(kind, head, file.size)
  if (!result.ok) throw new Error(result.error)
}

/** Cliente da API SQLite (Docker): a validação do cliente é repetida no servidor. */
export const serverContrib: ContribBackend = {
  list(filter?: ContributionFilter) {
    const query = new URLSearchParams()
    if (filter?.status) query.set('status', filter.status)
    if (filter?.kind) query.set('kind', filter.kind)
    if (filter?.componentType) query.set('componentType', filter.componentType)
    if (filter?.mine) query.set('mine', '1')
    const suffix = query.toString()
    return json<Contribution[]>('/contributions' + (suffix ? `?${suffix}` : ''))
  },
  async submit(input: ContributionInput, file: File) {
    const checked = validateInput(input)
    if (!checked.ok) throw new Error(checked.error)
    await checkLocally(input.kind, file)
    const created = await json<Contribution>('/contributions', 'POST', { ...input, fileName: file.name, size: file.size })
    try { await upload(created.id, file) }
    catch (error) { await json(`/contributions/${created.id}`, 'DELETE').catch(() => {}); throw error }
    return json<Contribution>(`/contributions/${created.id}`)
  },
  async update(id, patch, file) {
    if (file) {
      const current = await json<Contribution>(`/contributions/${id}`)
      await checkLocally(current.kind, file)
    }
    await json(`/contributions/${id}`, 'PATCH', { ...patch, ...(file ? { fileName: file.name, size: file.size } : {}) })
    if (file) await upload(id, file)
    return json<Contribution>(`/contributions/${id}`)
  },
  async remove(id) { await json(`/contributions/${id}`, 'DELETE') },
  review: (id, status, note) => json<Contribution>(`/admin/contributions/${id}`, 'PATCH', { status, note }),
  async file(id) {
    const response = await fetch(`/api/contributions/${id}/file`, { credentials: 'same-origin' })
    if (!response.ok) throw new Error('Não foi possível obter o ficheiro.')
    return response.blob()
  },
  stats: () => json<ContribStats>('/admin/contributions/stats'),
}
