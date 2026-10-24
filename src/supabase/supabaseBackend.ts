import type { Invite, Project, User } from '../dashboard/Dashboard'
import { getSupabase } from './supabaseClient'

function clientOrThrow() {
  const client = getSupabase()
  if (!client) throw new Error('Supabase não está configurado. Configure o URL e a Chave Anon.')
  return client
}

/** O papel vem sempre da tabela `profiles` (protegida por RLS/trigger); os
 * metadados do utilizador são editáveis pelo próprio cliente e não são fiáveis. */
async function resolveRole(userId: string): Promise<'admin' | 'user'> {
  const client = getSupabase()
  if (client) {
    try {
      const { data } = await client.from('profiles').select('role').eq('id', userId).maybeSingle()
      if (data?.role === 'admin' || data?.role === 'user') return data.role
    } catch {
      /* perfil ainda indisponível: cai para utilizador comum */
    }
  }
  return 'user'
}

/** Regista o último acesso na base de dados (melhor esforço, nunca bloqueia o login). */
async function touchLogin() {
  try {
    await getSupabase()?.rpc('touch_login')
  } catch {
    /* função opcional: depende da migração de contas */
  }
}

/** Retorna o utilizador atualmente autenticado no Supabase ou null */
export async function supabaseGetCurrentUser(): Promise<User | null> {
  const client = getSupabase()
  if (!client) return null

  try {
    const { data: { user }, error } = await client.auth.getUser()
    if (error || !user) return null

    // Procura metadados do utilizador ou perfil
    const metadata = user.user_metadata ?? {}
    const role = await resolveRole(user.id)
    const name = (metadata.name as string) || user.email?.split('@')[0] || 'Utilizador'

    return {
      id: user.id,
      email: user.email ?? '',
      name,
      role,
    }
  } catch {
    return null
  }
}

/** Login com email e palavra-passe no Supabase */
export async function supabaseLogin(email: string, password: string): Promise<{ user: User }> {
  const client = clientOrThrow()

  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.user) {
    throw new Error(error?.message || 'Falha ao autenticar no Supabase.')
  }

  const metadata = data.user.user_metadata ?? {}
  const role = await resolveRole(data.user.id)
  const name = (metadata.name as string) || data.user.email?.split('@')[0] || 'Utilizador'
  void touchLogin()

  return {
    user: {
      id: data.user.id,
      email: data.user.email ?? '',
      name,
      role,
    },
  }
}

/**
 * Garante que uma conta existe no Supabase e abre sessão com ela.
 * Usada pelas contas fixas: entram localmente (offline) e passam a ficar
 * também guardadas na base de dados. Devolve null se não for possível
 * (conta inexistente com confirmação de email ativa, rede em baixo, etc.).
 */
export async function supabaseEnsureAccount(email: string, password: string, name: string): Promise<{ user: User } | null> {
  const client = getSupabase()
  if (!client) return null
  try {
    return await supabaseLogin(email, password)
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : ''
    if (!message.includes('invalid login credentials')) return null
  }
  try {
    const { data, error } = await client.auth.signUp({ email, password, options: { data: { name } } })
    if (error || !data.user || !data.session) return null
    return await supabaseLogin(email, password)
  } catch {
    return null
  }
}

/** Registo de nova conta no Supabase */
export async function supabaseRegister(email: string, password: string, name: string): Promise<{ user: User }> {
  const client = clientOrThrow()

  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: { name },
    },
  })

  if (error || !data.user) {
    throw new Error(error?.message || 'Falha ao criar conta no Supabase.')
  }

  return {
    user: {
      id: data.user.id,
      email: data.user.email ?? '',
      name,
      role: 'user',
    },
  }
}

/** Encerra a sessão no Supabase */
export async function supabaseLogout(): Promise<{ ok: boolean }> {
  const client = getSupabase()
  if (client) {
    try {
      await client.auth.signOut()
    } catch {
      /* noop */
    }
  }
  return { ok: true }
}

/** Lista todos os projetos acessíveis pelo utilizador atual */
export async function supabaseGetProjects(): Promise<Project[]> {
  const client = clientOrThrow()
  const { data: { user } } = await client.auth.getUser()

  if (!user) throw new Error('Sessão expirada. Por favor autentique-se no Supabase.')

  // Consulta projetos próprios e projetos onde é membro
  const { data: ownedProjects, error: errOwned } = await client
    .from('projects')
    .select('id, name, revision, updated_at, content, owner_id')
    .order('updated_at', { ascending: false })

  if (errOwned) {
    throw new Error(`Erro ao carregar projetos do Supabase: ${errOwned.message}`)
  }

  return (ownedProjects || []).map((row) => ({
    id: row.id,
    name: row.name,
    revision: row.revision ?? 0,
    updated_at: row.updated_at,
    content: typeof row.content === 'string' ? JSON.parse(row.content) : row.content,
    owner: row.owner_id === user.id ? 'Você' : 'Colaborador',
    role: row.owner_id === user.id ? 'owner' : 'editor',
  }))
}

/** Cria um novo projeto na base de dados Supabase */
export async function supabaseCreateProject(name: string, content: unknown): Promise<{ id: string; name: string; revision: number }> {
  const client = clientOrThrow()
  const { data: { user } } = await client.auth.getUser()

  if (!user) throw new Error('Sessão expirada. Por favor autentique-se no Supabase.')

  const newProject = {
    name,
    owner_id: user.id,
    content: typeof content === 'string' ? JSON.parse(content) : content,
    revision: 0,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await client
    .from('projects')
    .insert(newProject)
    .select('id, name, revision')
    .single()

  if (error || !data) {
    throw new Error(`Erro ao criar projeto no Supabase: ${error?.message || 'Sem resposta'}`)
  }

  return {
    id: data.id,
    name: data.name,
    revision: data.revision ?? 0,
  }
}

/** Carrega um projeto específico pelo ID */
export async function supabaseGetProject(id: string): Promise<{ id: string; name: string; role: 'owner' | 'editor'; revision: number; content: unknown }> {
  const client = clientOrThrow()
  const { data: { user } } = await client.auth.getUser()

  if (!user) throw new Error('Sessão expirada.')

  const { data, error } = await client
    .from('projects')
    .select('id, name, owner_id, revision, content, updated_at')
    .eq('id', id)
    .single()

  if (error || !data) {
    throw new Error(`Projeto não encontrado no Supabase: ${error?.message || 'Sem dados'}`)
  }

  return {
    id: data.id,
    name: data.name,
    role: data.owner_id === user.id ? 'owner' : 'editor',
    revision: data.revision ?? 0,
    content: typeof data.content === 'string' ? JSON.parse(data.content) : data.content,
  }
}

/** Atualiza o conteúdo de um projeto com controle de revisão */
export async function supabaseUpdateProject(id: string, content: unknown, revision: number): Promise<{ ok: boolean; revision: number }> {
  const client = clientOrThrow()

  const nextRevision = revision + 1
  const payload = {
    content: typeof content === 'string' ? JSON.parse(content) : content,
    revision: nextRevision,
    updated_at: new Date().toISOString(),
  }

  const { error } = await client
    .from('projects')
    .update(payload)
    .eq('id', id)

  if (error) {
    throw new Error(`Erro ao guardar projeto no Supabase: ${error.message}`)
  }

  return { ok: true, revision: nextRevision }
}

/** Elimina um projeto no Supabase */
export async function supabaseDeleteProject(id: string): Promise<{ ok: boolean }> {
  const client = clientOrThrow()

  const { error } = await client
    .from('projects')
    .delete()
    .eq('id', id)

  if (error) {
    throw new Error(`Erro ao eliminar projeto no Supabase: ${error.message}`)
  }

  return { ok: true }
}

/** Obtém a lista de convites do utilizador atual */
export async function supabaseGetInvitations(): Promise<Invite[]> {
  const client = clientOrThrow()
  const { data: { user } } = await client.auth.getUser()

  if (!user) return []

  try {
    const { data, error } = await client
      .from('project_invitations')
      .select('id, project_id, sender_id, created_at, projects(name)')
      .eq('user_id', user.id)

    if (error || !data) return []

    return data.map((row: any) => ({
      id: row.id,
      project: row.projects?.name || 'Projeto Partilhado',
      sender: 'Colaborador',
    }))
  } catch {
    return []
  }
}

/** Responde a um convite de projeto */
export async function supabaseReplyInvitation(id: string, action: 'accept' | 'reject'): Promise<{ ok: boolean }> {
  const client = clientOrThrow()
  const { data: { user } } = await client.auth.getUser()
  if (!user) throw new Error('Não autenticado')

  if (action === 'accept') {
    const { data: invite } = await client
      .from('project_invitations')
      .select('project_id')
      .eq('id', id)
      .single()

    if (invite) {
      await client.from('project_members').insert({
        project_id: invite.project_id,
        user_id: user.id,
        role: 'editor',
      })
    }
  }

  await client.from('project_invitations').delete().eq('id', id)
  return { ok: true }
}

/** Convida um utilizador para um projeto */
export async function supabaseInviteMember(projectId: string, email: string): Promise<{ ok: boolean }> {
  const client = clientOrThrow()
  const { data: { user } } = await client.auth.getUser()
  if (!user) throw new Error('Não autenticado')

  // Procura perfil do utilizador convidado
  const { data: targetUser } = await client
    .from('profiles')
    .select('id')
    .eq('email', email.trim().toLowerCase())
    .single()

  if (!targetUser) {
    throw new Error(`Utilizador com o e-mail «${email}» não encontrado no Supabase.`)
  }

  const { error } = await client.from('project_invitations').insert({
    project_id: projectId,
    user_id: targetUser.id,
    sender_id: user.id,
  })

  if (error) {
    throw new Error(`Não foi possível enviar o convite: ${error.message}`)
  }

  return { ok: true }
}

/** Obtém membros de um projeto */
export async function supabaseFetchProjectMembers(projectId: string): Promise<{ members: Array<{ name: string; email: string }> }> {
  const client = clientOrThrow()

  const { data, error } = await client
    .from('project_members')
    .select('user_id, profiles(name, email)')
    .eq('project_id', projectId)

  if (error || !data) return { members: [] }

  return {
    members: data.map((m: any) => ({
      name: m.profiles?.name || 'Membro',
      email: m.profiles?.email || '',
    })),
  }
}

/** Obtém definições de componentes desativados do Supabase */
export async function supabaseGetSettings(): Promise<{ disabledComponents: Array<{ type: string; note?: string }> }> {
  const client = getSupabase()
  if (!client) return { disabledComponents: [] }
  try {
    const { data, error } = await client
      .from('component_settings')
      .select('type, note')
      .eq('enabled', false)
    if (error || !data) return { disabledComponents: [] }
    return { disabledComponents: data.map((d: any) => ({ type: d.type, note: d.note || '' })) }
  } catch {
    return { disabledComponents: [] }
  }
}

/** Atualiza configuração de componente (ativar/desativar) no Supabase */
export async function supabaseSetComponent(type: string, enabled: boolean, note = ''): Promise<{ ok: boolean }> {
  const client = clientOrThrow()
  const { data: { user } } = await client.auth.getUser()
  const { error } = await client
    .from('component_settings')
    .upsert({
      type,
      enabled,
      note,
      updated_at: new Date().toISOString(),
      updated_by: user?.email || 'admin',
    })
  if (error) throw new Error(error.message)
  return { ok: true }
}

/** Obtém todos os projetos no modo administrativo a partir do Supabase */
export async function supabaseGetAdminProjects(): Promise<Array<{ id: string; name: string; revision: number; updated_at: string; owner: string; size: number; members: number }>> {
  const client = clientOrThrow()
  const { data, error } = await client
    .from('projects')
    .select('id, name, revision, updated_at, owner_id')
    .order('updated_at', { ascending: false })
  if (error || !data) return []
  return data.map((p: any) => ({
    id: p.id,
    name: p.name,
    revision: p.revision ?? 0,
    updated_at: p.updated_at,
    owner: p.owner_id,
    size: 0,
    members: 0,
  }))
}
