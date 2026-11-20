/**
 * Política de palavra-passe das contas criadas na plataforma. Espelha
 * `passwordProblem` (server/admin.mjs) e `registrationPasswordProblem`
 * (server/index.mjs): a interface avisa antes, o servidor decide.
 */
export const PASSWORD_MIN = 10
export const PASSWORD_MAX = 200
export const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/

export type PasswordRule = { id: 'length' | 'case' | 'digit' | 'personal'; label: string; ok: boolean }

export function passwordRules(password: string, email = '', name = ''): PasswordRule[] {
  const lower = password.toLowerCase()
  const local = email.split('@')[0].trim().toLowerCase()
  const first = name.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  const personal = !(local.length >= 4 && lower.includes(local)) && !(first.length >= 4 && lower.includes(first))
  return [
    { id: 'length', label: `${PASSWORD_MIN} ou mais caracteres`, ok: password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX },
    { id: 'case', label: 'Maiúsculas e minúsculas', ok: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { id: 'digit', label: 'Pelo menos um número', ok: /\d/.test(password) },
    { id: 'personal', label: 'Sem o seu nome ou e-mail', ok: password.length > 0 && personal },
  ]
}

/** Primeira regra violada, em texto pronto a mostrar; null quando a palavra-passe é aceite. */
export function registrationPasswordProblem(password: string, email = '', name = ''): string | null {
  if (password.length < PASSWORD_MIN) return `A palavra-passe deve ter pelo menos ${PASSWORD_MIN} caracteres.`
  if (password.length > PASSWORD_MAX) return 'A palavra-passe é demasiado longa.'
  const rules = passwordRules(password, email, name)
  if (!rules.find((rule) => rule.id === 'case')!.ok || !rules.find((rule) => rule.id === 'digit')!.ok) return 'Use maiúsculas, minúsculas e pelo menos um número.'
  if (!rules.find((rule) => rule.id === 'personal')!.ok) return 'A palavra-passe não pode conter o seu nome nem o seu e-mail.'
  return null
}

export function isDuplicateEmailError(message: string): boolean {
  return /já existe uma conta com este e-mail/i.test(message)
}
