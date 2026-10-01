export type AppPage = 'landing' | 'login' | 'dashboard' | 'editor' | 'admin' | 'contribute'

export const ROUTES = {
  home: '/',
  login: '/login',
  dashboard: '/dashboard',
  contribute: '/contribute',
  admin: '/admin',
  editor: (projectId: string) => `/projects/${encodeURIComponent(projectId)}`,
} as const

export function pageFromPath(pathname: string): AppPage {
  if (pathname === ROUTES.login) return 'login'
  if (pathname === ROUTES.dashboard) return 'dashboard'
  if (pathname === ROUTES.contribute) return 'contribute'
  if (pathname === ROUTES.admin) return 'admin'
  if (/^\/projects\/[^/]+\/?$/.test(pathname)) return 'editor'
  return 'landing'
}

export function projectIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)\/?$/)
  if (!match) return null
  try { return decodeURIComponent(match[1]) } catch { return match[1] }
}
