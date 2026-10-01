export type AppPage = 'landing' | 'login' | 'dashboard' | 'editor' | 'admin' | 'contribute'

export const ROUTES = {
  home: '/',
  login: '/login',
  dashboard: '/dashboard',
  contribute: '/contribute',
  admin: '/admin',
  adminEditor: (componentId?: string) => componentId ? `/admin/editor/${encodeURIComponent(componentId)}` : '/admin/editor',
  editor: (projectId: string) => `/projects/${encodeURIComponent(projectId)}`,
} as const

export function pageFromPath(pathname: string): AppPage {
  if (pathname === ROUTES.login) return 'login'
  if (pathname === ROUTES.dashboard) return 'dashboard'
  if (pathname === ROUTES.contribute) return 'contribute'
  if (pathname === ROUTES.admin || /^\/admin\/editor(?:\/[^/]+)?\/?$/.test(pathname)) return 'admin'
  if (/^\/projects\/[^/]+\/?$/.test(pathname)) return 'editor'
  return 'landing'
}

export function adminComponentIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/admin\/editor\/([^/]+)\/?$/)
  if (!match) return null
  try { return decodeURIComponent(match[1]) } catch { return match[1] }
}

export function isAdminEditorPath(pathname: string): boolean { return /^\/admin\/editor(?:\/[^/]+)?\/?$/.test(pathname) }

export function projectIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)\/?$/)
  if (!match) return null
  try { return decodeURIComponent(match[1]) } catch { return match[1] }
}
