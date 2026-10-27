import { getSupabase } from '../supabase/supabaseClient'
import type { ContribBackend } from './contribApi'
import type { Contribution, ContributionFilter, ContributionInput, ContributionStatus } from './types'
import { readValidationHead, safeFileName, validateFile, validateInput } from './validate'

function clientOrThrow() {
  const client = getSupabase()
  if (!client) throw new Error('Supabase não está configurado.')
  return client
}

function contributionOut(row: any): Contribution {
  let glb: Contribution['glb']
  try { glb = row.glb ? JSON.parse(row.glb) : undefined } catch { glb = undefined }
  return {
    id: row.id, kind: row.kind, title: row.title, componentType: row.component_type || null,
    customName: row.custom_name || undefined, description: row.description || '', fileName: row.file_name,
    size: row.size || 0, authorId: row.author_id, authorName: row.profiles?.name || 'Utilizador',
    authorEmail: row.profiles?.email || '', status: row.status, createdAt: row.created_at,
    updatedAt: row.updated_at, reviewedBy: row.reviewed_by || undefined, reviewNote: row.review_note || undefined, glb,
  }
}

async function currentUser() {
  const { data: { user }, error } = await clientOrThrow().auth.getUser()
  if (error || !user) throw new Error('Inicie sessão no Supabase.')
  return user
}

async function fileInfo(kind: Contribution['kind'], file: File) {
  const result = validateFile(kind, await readValidationHead(file), file.size)
  if (!result.ok) throw new Error(result.error)
  return result.info
}

async function getRow(id: string) {
  const { data, error } = await clientOrThrow().from('contributions')
    .select('*, profiles:author_id(name,email)').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Contribuição não encontrada.')
  return data
}

export const supabaseContrib: ContribBackend = {
  async list(filter?: ContributionFilter) {
    const client = clientOrThrow()
    let query = client.from('contributions').select('*, profiles:author_id(name,email)').order('created_at', { ascending: false })
    if (filter?.status) query = query.eq('status', filter.status)
    if (filter?.kind) query = query.eq('kind', filter.kind)
    if (filter?.componentType) query = query.eq('component_type', filter.componentType)
    if (filter?.mine) query = query.eq('author_id', (await currentUser()).id)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return (data ?? []).map(contributionOut)
  },

  async submit(input: ContributionInput, file: File) {
    const checked = validateInput(input)
    if (!checked.ok) throw new Error(checked.error)
    const info = await fileInfo(input.kind, file)
    const user = await currentUser()
    const client = clientOrThrow()
    const id = crypto.randomUUID()
    const storagePath = `${user.id}/${id}`
    const now = new Date().toISOString()
    const { data, error } = await client.from('contributions').insert({
      id, kind: input.kind, title: input.title.trim(), component_type: input.componentType,
      custom_name: input.customName?.trim() || null, description: input.description.trim(),
      file_name: safeFileName(file.name), size: file.size, author_id: user.id, status: 'pending',
      file_ready: false, glb: info ? JSON.stringify(info) : null, storage_path: storagePath, created_at: now, updated_at: now,
    }).select('*, profiles:author_id(name,email)').single()
    if (error || !data) throw new Error(error?.message || 'Não foi possível criar a contribuição.')
    const uploaded = await client.storage.from('contribution-files').upload(storagePath, file, { contentType: file.type || 'application/octet-stream', upsert: false })
    if (uploaded.error) {
      await client.from('contributions').delete().eq('id', id)
      throw new Error(`Erro ao enviar o ficheiro: ${uploaded.error.message}`)
    }
    const { error: readyError } = await client.from('contributions').update({ file_ready: true, updated_at: new Date().toISOString() }).eq('id', id)
    if (readyError) {
      await client.storage.from('contribution-files').remove([storagePath])
      await client.from('contributions').delete().eq('id', id)
      throw new Error(readyError.message)
    }
    return contributionOut({ ...data, file_ready: true })
  },

  async update(id, patch, file) {
    const client = clientOrThrow()
    const user = await currentUser()
    const row = await getRow(id)
    if (row.author_id !== user.id || row.status !== 'pending') throw new Error('Só pode alterar uma contribuição sua que esteja em revisão.')
    const merged: ContributionInput = {
      kind: row.kind, title: String(patch.title ?? row.title), componentType: (patch.componentType ?? row.component_type) || null,
      customName: patch.customName ?? row.custom_name ?? '', description: String(patch.description ?? row.description ?? ''),
    }
    const checked = validateInput(merged)
    if (!checked.ok) throw new Error(checked.error)
    const info = file ? await fileInfo(merged.kind, file) : undefined
    const nextPath = file ? `${user.id}/${crypto.randomUUID()}` : row.storage_path
    if (file) {
      const upload = await client.storage.from('contribution-files').upload(nextPath, file, { contentType: file.type || 'application/octet-stream', upsert: false })
      if (upload.error) throw new Error(`Erro ao enviar o ficheiro: ${upload.error.message}`)
    }
    const { error } = await client.from('contributions').update({
      title: merged.title.trim(), component_type: merged.componentType, custom_name: merged.customName?.trim() || null,
      description: merged.description.trim(), ...(file ? { file_name: safeFileName(file.name), size: file.size, storage_path: nextPath, glb: info ? JSON.stringify(info) : null } : {}),
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) {
      if (file) await client.storage.from('contribution-files').remove([nextPath])
      throw new Error(error.message)
    }
    if (file && row.storage_path) await client.storage.from('contribution-files').remove([row.storage_path])
    return contributionOut(await getRow(id))
  },

  async remove(id) {
    const client = clientOrThrow()
    const row = await getRow(id)
    const { error } = await client.from('contributions').delete().eq('id', id)
    if (error) throw new Error(error.message)
    if (row.storage_path) await client.storage.from('contribution-files').remove([row.storage_path])
  },

  async review(id, status: ContributionStatus, note) {
    if (!['pending', 'approved', 'rejected'].includes(status)) throw new Error('Estado inválido.')
    const user = await currentUser()
    const { error } = await clientOrThrow().from('contributions').update({
      status, review_note: note.trim().slice(0, 500) || null, reviewed_by: user.email || null, updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) throw new Error(error.message)
    return contributionOut(await getRow(id))
  },

  async file(id) {
    const row = await getRow(id)
    if (!row.file_ready || !row.storage_path) throw new Error('O ficheiro ainda não está disponível.')
    const { data, error } = await clientOrThrow().storage.from('contribution-files').createSignedUrl(row.storage_path, 300)
    if (error || !data?.signedUrl) throw new Error(error?.message || 'Não foi possível obter o ficheiro.')
    const response = await fetch(data.signedUrl)
    if (!response.ok) throw new Error('Não foi possível descarregar o ficheiro.')
    return response.blob()
  },

  async stats() {
    const { data, error } = await clientOrThrow().from('contributions').select('kind,status,size')
    if (error) throw new Error(error.message)
    const rows = data ?? []
    return {
      total: rows.length, pending: rows.filter((r: any) => r.status === 'pending').length,
      approved: rows.filter((r: any) => r.status === 'approved').length, rejected: rows.filter((r: any) => r.status === 'rejected').length,
      datasheets: rows.filter((r: any) => r.kind === 'datasheet').length, models: rows.filter((r: any) => r.kind === 'model3d').length,
      bytes: rows.reduce((sum: number, row: any) => sum + (Number(row.size) || 0), 0),
    }
  },
}
