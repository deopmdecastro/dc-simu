import type { User } from '../dashboard/Dashboard'
import { ROUTES, type AppPage } from './routes'

/**
 * Centraliza autorização e redirecionamentos; as vistas deixam de repetir estas regras.
 * Páginas públicas (landing, login, legal) nunca exigem sessão.
 */
export function guardedDestination(page: AppPage, user: User | null): string | null {
  // Privacidade, termos, cookies e licenças são sempre públicos.
  if (page === 'legal') return null
  if (page === 'landing' || page === 'login') return user ? ROUTES.dashboard : null
  if (!user) return ROUTES.login
  if (page === 'admin' && user.role !== 'admin') return ROUTES.dashboard
  return null
}
