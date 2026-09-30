import { MAX_GLB_BYTES, MAX_PDF_BYTES, type ContributionInput, type ContributionKind, type GlbInfo } from './types'

export type ValidationResult<T = undefined> = { ok: true; info: T } | { ok: false; error: string }

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })

/** Limpa o nome de ficheiro: sem caminhos, sem caracteres de controlo, até 120 caracteres. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f<>:"|?*]/g, '_').trim()
  return (clean || 'ficheiro').slice(0, 120)
}

export function validateDatasheetBytes(bytes: Uint8Array, size = bytes.length): ValidationResult {
  if (size > MAX_PDF_BYTES) return fail('O PDF não pode exceder 25 MB.')
  if (size < 8) return fail('O ficheiro está vazio.')
  const head = String.fromCharCode(...bytes.slice(0, 5))
  if (head !== '%PDF-') return fail('O ficheiro selecionado não é um PDF válido.')
  return { ok: true, info: undefined }
}

/**
 * Valida um GLB binário (glTF 2.0): cabeçalho «glTF», versão 2, comprimento coerente,
 * primeiro bloco JSON legível com pelo menos uma malha.
 */
export function validateGlbBytes(bytes: Uint8Array, size = bytes.length): ValidationResult<GlbInfo> {
  if (size > MAX_GLB_BYTES) return fail('O modelo GLB não pode exceder 40 MB.')
  if (bytes.length < 28) return fail('O ficheiro GLB está incompleto.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, true) !== 0x46546c67) return fail('Não é um ficheiro GLB (falta o cabeçalho «glTF»). Exporte como «glTF Binário (.glb)».')
  const version = view.getUint32(4, true)
  if (version !== 2) return fail(`Versão glTF ${version} não suportada — use glTF 2.0.`)
  if (view.getUint32(8, true) !== size) return fail('O GLB está truncado ou corrompido (tamanho não coincide).')
  const jsonLength = view.getUint32(12, true)
  if (view.getUint32(16, true) !== 0x4e4f534a) return fail('O GLB é inválido: o primeiro bloco não é JSON.')
  if (20 + jsonLength > bytes.length) return fail('O GLB é inválido: bloco JSON fora dos limites.')
  let json: { meshes?: unknown[]; nodes?: unknown[]; materials?: unknown[]; asset?: { generator?: string; version?: string }; buffers?: Array<{ uri?: string }>; images?: Array<{ uri?: string }> }
  try { json = JSON.parse(new TextDecoder().decode(bytes.slice(20, 20 + jsonLength))) }
  catch { return fail('O GLB é inválido: o JSON interno não pôde ser lido.') }
  if (!json.meshes?.length) return fail('O modelo não contém nenhuma malha (mesh).')
  // Recursos externos não existem num ficheiro único e seriam um vetor de pedidos a terceiros.
  const external = [...(json.buffers ?? []), ...(json.images ?? [])].some((entry) => typeof entry.uri === 'string' && !entry.uri.startsWith('data:'))
  if (external) return fail('O GLB referencia ficheiros externos. Exporte com tudo embebido (um único .glb).')
  return {
    ok: true,
    info: {
      version,
      meshes: json.meshes.length,
      nodes: json.nodes?.length ?? 0,
      materials: json.materials?.length ?? 0,
      generator: typeof json.asset?.generator === 'string' ? json.asset.generator.slice(0, 80) : undefined,
    },
  }
}

export function validateInput(input: ContributionInput): ValidationResult {
  const title = input.title.trim()
  if (title.length < 3) return fail('Indique um título com pelo menos 3 caracteres.')
  if (title.length > 120) return fail('O título não pode exceder 120 caracteres.')
  if (input.description.length > 2000) return fail('A descrição não pode exceder 2000 caracteres.')
  if (!input.componentType && !(input.customName ?? '').trim()) return fail('Escolha o tipo de componente ou indique o nome do componente novo.')
  if ((input.customName ?? '').length > 80) return fail('O nome do componente não pode exceder 80 caracteres.')
  return { ok: true, info: undefined }
}

export function validateFile(kind: ContributionKind, bytes: Uint8Array, size: number): ValidationResult<GlbInfo | undefined> {
  if (kind === 'datasheet') {
    const result = validateDatasheetBytes(bytes, size)
    return result.ok ? { ok: true, info: undefined } : result
  }
  return validateGlbBytes(bytes, size)
}

/**
 * Lê só o necessário para validar: o cabeçalho e, num GLB, o bloco JSON completo
 * (limitado a 32 MB) — sem carregar as texturas/geometria para memória.
 */
export async function readValidationHead(file: Blob): Promise<Uint8Array> {
  const first = new Uint8Array(await file.slice(0, Math.min(file.size, 20)).arrayBuffer())
  if (first.length >= 20 && new DataView(first.buffer).getUint32(0, true) === 0x46546c67) {
    const jsonLength = new DataView(first.buffer).getUint32(12, true)
    const end = Math.min(file.size, 20 + Math.min(jsonLength, 32 * 1024 * 1024))
    return new Uint8Array(await file.slice(0, end).arrayBuffer())
  }
  return first
}
