import { accountApi } from '../auth/accountApi'
import { logsToQueryString, type AdminProject, type AdminUser, type AuditEntry, type ComponentSetting, type LogQuery, type PlanRequest, type Role, type SystemInfo } from './adminTypes'
import type { ComponentStatus, PlanId, PricingConfig } from '../saas/platformCore.mjs'

const api = <T,>(url: string, method = 'GET', body?: unknown) => accountApi<T>(url, method, body)

export interface NewUserInput { name: string; email: string; password: string; role: Role }

/** Operações do painel de administração (servidor SQLite ou, sem servidor, o backend local). */
export const adminApi = {
  users: () => api<AdminUser[]>('/admin/users'),
  createUser: (input: NewUserInput) => api<AdminUser>('/admin/users', 'POST', input),
  updateUser: (id: string, patch: Partial<Pick<AdminUser, 'name' | 'role' | 'active' | 'plan' | 'planExpiresAt' | 'adminNote'>>) => api<AdminUser>(`/admin/users/${id}`, 'PATCH', patch),
  setPassword: (id: string, password: string) => api<{ ok: true; sessionsClosed: number }>(`/admin/users/${id}/password`, 'POST', { password }),
  revokeSessions: (id: string) => api<{ ok: true; sessionsClosed: number }>(`/admin/users/${id}/revoke-sessions`, 'POST'),
  deleteUser: (id: string, force = false) => api<{ ok: true }>(`/admin/users/${id}${force ? '?force=1' : ''}`, 'DELETE'),

  projects: () => api<AdminProject[]>('/admin/projects'),
  landingPublish: () => api<{ projectId: string; name: string; owner: string }>('/admin/landing/publish'),
  setLandingPublish: (projectId: string | null) =>
    api<{ projectId: string; name?: string; owner?: string; isNative?: boolean }>('/admin/landing/publish', 'PUT', { projectId }),
  deleteProject: (id: string) => api<{ ok: true }>(`/admin/projects/${id}`, 'DELETE'),

  components: () => api<ComponentSetting[]>('/admin/components'),
  setComponent: (type: string, enabled: boolean, note = '') => api<ComponentSetting>(`/admin/components/${type}`, 'PUT', { enabled, note }),
  /** ADMIN-COMP-01: ativo · bloqueado · arquivado · eliminado (+ plano mínimo). */
  setComponentStatus: (type: string, change: { status: ComponentStatus; note?: string; minPlan?: PlanId | null }) => api<ComponentSetting>(`/admin/components/${type}`, 'PUT', change),

  pricing: () => api<PricingConfig>('/pricing'),
  savePricing: (config: PricingConfig) => api<PricingConfig>('/admin/pricing', 'PUT', config),
  planRequests: (status = '') => api<PlanRequest[]>(`/admin/plan-requests${status ? `?status=${status}` : ''}`),
  decidePlanRequest: (id: string, action: 'approve' | 'reject', note = '') => api<PlanRequest>(`/admin/plan-requests/${id}`, 'POST', { action, note }),

  logs: (query: LogQuery) => api<{ items: AuditEntry[]; total: number }>(`/admin/logs${logsToQueryString(query)}`),
  purgeLogs: (olderThanDays: number) => api<{ removed: number }>(`/admin/logs?olderThanDays=${olderThanDays}`, 'DELETE'),

  system: () => api<SystemInfo>('/admin/system'),
  exportData: () => api<Record<string, unknown>>('/admin/export'),
}

/** Descarrega texto/JSON como ficheiro. */
export function downloadText(fileName: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
