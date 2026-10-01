import { accountApi, activeAccountBackend } from '../auth/accountApi'
import type { CatalogEntry, CatalogMeta, CatalogVersion, ComponentDefinition } from './types'

/** Camada fina sobre a API de contas: funciona com o servidor (SQLite) e com o backend local do navegador. */
export const catalogApi = {
  /** Componentes publicados (para o simulador). Inclui arquivados: as versões antigas têm de continuar a abrir. */
  list: () => accountApi<CatalogEntry[]>('/catalog'),
  adminList: () => accountApi<CatalogEntry[]>('/admin/catalog'),
  adminGet: (id: string) => accountApi<CatalogEntry>(`/admin/catalog/${id}`),
  save: (id: string, meta: CatalogMeta, draft: ComponentDefinition) => accountApi<CatalogEntry>(`/admin/catalog/${id}`, 'PUT', { meta, draft }),
  publish: (id: string, body: { note: string; changes: string[]; runtime: CatalogVersion['runtime']; glb: string }) =>
    accountApi<CatalogEntry>(`/admin/catalog/${id}/publish`, 'POST', body),
  archive: (id: string, archived: boolean) => accountApi<CatalogEntry>(`/admin/catalog/${id}/archive`, 'POST', { archived }),
  remove: (id: string) => accountApi<{ ok: true }>(`/admin/catalog/${id}`, 'DELETE'),
  /** URL carregável pelo useGLTF: rota do servidor, ou blob local. */
  async glbUrl(id: string, version: number): Promise<string> {
    if (activeAccountBackend() === 'server') return `/api/catalog/${id}/glb/${version}`
    const { data } = await accountApi<{ data: string }>(`/catalog/${id}/glb/${version}`)
    const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0))
    return URL.createObjectURL(new Blob([bytes], { type: 'model/gltf-binary' }))
  },
}
