export type AppPage = 'landing' | 'login' | 'dashboard' | 'editor' | 'admin' | 'contribute'

/** Nome legível para a barra de endereço: «Disjuntor Steck SD C25 · 1P» → «disjuntor-steck-sd-c25-1p». */
export function routeSlug(name?: string): string {
  if (!name) return ''
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export const ROUTES = {
  home: '/',
  login: '/login',
  dashboard: '/dashboard',
  contribute: '/contribute',
  admin: '/admin',
  /** `/admin/editor/<id>/<nome-do-dispositivo>` — o nome é informativo e pode faltar. */
  adminEditor: (componentId?: string, name?: string) => {
    if (!componentId) return '/admin/editor'
    const slug = routeSlug(name)
    return `/admin/editor/${encodeURIComponent(componentId)}${slug ? `/${slug}` : ''}`
  },
  editor: (projectId: string) => `/projects/${encodeURIComponent(projectId)}`,
} as const

export function pageFromPath(pathname: string): AppPage {
  if (pathname === ROUTES.login) return 'login'
  if (pathname === ROUTES.dashboard) return 'dashboard'
  if (pathname === ROUTES.contribute) return 'contribute'
  if (pathname === ROUTES.admin || isAdminEditorPath(pathname)) return 'admin'
  if (/^\/projects\/[^/]+\/?$/.test(pathname)) return 'editor'
  return 'landing'
}

export function adminComponentIdFromPath(pathname: string): string | null {
  // O segmento seguinte é o nome do dispositivo e serve apenas para leitura.
  const match = pathname.match(/^\/admin\/editor\/([^/]+)(?:\/[^/]*)?\/?$/)
  if (!match) return null
  try { return decodeURIComponent(match[1]) } catch { return match[1] }
}

export function isAdminEditorPath(pathname: string): boolean { return /^\/admin\/editor(?:\/[^/]+(?:\/[^/]*)?)?\/?$/.test(pathname) }

export function projectIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)\/?$/)
  if (!match) return null
  try { return decodeURIComponent(match[1]) } catch { return match[1] }
}
