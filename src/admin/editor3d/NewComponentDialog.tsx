import { createPortal } from 'react-dom'
import { useEffect, useMemo, useState } from 'react'
import { catalogApi } from '../../catalog/catalogApi'
import { DEFAULT_META, boundsMm, defaultDefinition, newId } from '../../catalog/definition'
import { allProfiles, useProfileStore } from '../../catalog/profileStore'
import { specsToTerminals } from '../../catalog/terminalLayout'
import { SUGGESTED_PROFILES, defaultParams } from '../../catalog/terminalProfiles'
import type { CatalogMeta } from '../../catalog/types'
import type { ComponentCategory } from '../../types'
import { CATEGORIES, COMPONENT_KINDS } from './componentKinds'

const MAX_PDF = 4 * 1024 * 1024
const readDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result))
  reader.onerror = () => reject(new Error('Não foi possível ler o ficheiro'))
  reader.readAsDataURL(file)
})

/** Assistente "Novo componente 3D": pergunta o que é, a categoria, o nome e se já existe datasheet; depois abre o editor. */
export default function NewComponentDialog({ onCancel, onCreated, onError }: { onCancel: () => void; onCreated: (id: string, name: string) => void; onError: (message: string) => void }) {
  const [kindId, setKindId] = useState('breaker')
  const kind = COMPONENT_KINDS.find((item) => item.id === kindId) ?? COMPONENT_KINDS[0]
  const [category, setCategory] = useState<ComponentCategory>(kind.category)
  const [name, setName] = useState('')
  const [sheet, setSheet] = useState<'have' | 'none'>('none')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState('')
  const [busy, setBusy] = useState(false)
  const [profileId, setProfileId] = useState('')
  const custom = useProfileStore((state) => state.custom)
  const loadProfiles = useProfileStore((state) => state.load)
  useEffect(() => { void loadProfiles() }, [loadProfiles])
  const suggestions = useMemo(() => {
    const ids = SUGGESTED_PROFILES[category] ?? []
    return allProfiles(custom).filter((profile) => ids.includes(profile.id) || profile.custom)
  }, [category, custom])
  useEffect(() => { if (profileId && !suggestions.some((profile) => profile.id === profileId)) setProfileId('') }, [suggestions, profileId])

  function pickKind(id: string) {
    const next = COMPONENT_KINDS.find((item) => item.id === id) ?? COMPONENT_KINDS[0]
    setKindId(id)
    setCategory(next.category)
  }
  function pickFile(next: File | null) {
    setFileError('')
    if (next && !/pdf$/i.test(next.type) && !/\.pdf$/i.test(next.name)) { setFileError('Escolha um ficheiro PDF.'); setFile(null); return }
    if (next && next.size > MAX_PDF) { setFileError('O PDF excede 4 MB. Use antes um link.'); setFile(null); return }
    setFile(next)
  }
  const cleanUrl = url.trim()
  const urlInvalid = sheet === 'have' && cleanUrl !== '' && !/^https?:\/\/\S+$/i.test(cleanUrl)
  const canCreate = name.trim().length > 0 && !urlInvalid && !fileError && !busy

  async function create() {
    if (!canCreate) return
    setBusy(true)
    try {
      const id = newId('c')
      const definition = defaultDefinition()
      definition.mount = kind.mount
      const meta: CatalogMeta = {
        ...DEFAULT_META, name: name.trim(), category, kind: kind.label, tag: kind.tag,
        group: CATEGORIES.find(([value]) => value === category)?.[1] ?? DEFAULT_META.group,
        datasheet: sheet === 'have' ? { status: 'have', url: cleanUrl || undefined, fileName: file?.name } : { status: 'none' },
      }
      const profile = suggestions.find((item) => item.id === profileId)
      if (profile) {
        const box = boundsMm(definition, new Map())
        definition.terminals = specsToTerminals(profile.build(defaultParams(profile)), { min: box.min.toArray() as [number, number, number], max: box.max.toArray() as [number, number, number] }, [], () => newId('t_'), profile.id)
      }
      if (sheet === 'have' && file) definition.assets = { ...definition.assets, datasheet: { name: file.name, mime: 'application/pdf', data: await readDataUrl(file) } }
      await catalogApi.save(id, meta, definition)
      onCreated(id, meta.name)
    } catch (value) {
      onError(value instanceof Error ? value.message : 'Falha ao criar o componente')
      setBusy(false)
    }
  }

  return createPortal(<div className="ce-modal ce-modal-fixed" role="dialog" aria-modal="true" aria-label="Novo componente 3D" onKeyDown={(event) => { if (event.key === 'Escape') onCancel() }}>
    <form className="ce-modal-card ce-new" onSubmit={(event) => { event.preventDefault(); void create() }}>
      <h2>Novo componente 3D</h2>
      <p className="ce-new-lead">Responda a estas perguntas e abrimos o editor com o componente já preparado.</p>

      <h3>1 · O que é?</h3>
      <div className="ce-kinds" role="radiogroup" aria-label="Tipo de componente">
        {COMPONENT_KINDS.map((item) => <button type="button" key={item.id} role="radio" aria-checked={item.id === kindId} className={`ce-kind${item.id === kindId ? ' is-active' : ''}`} onClick={() => pickKind(item.id)} title={item.hint}>
          <b>{item.label}</b><small>{item.hint}</small>
        </button>)}
      </div>

      <h3>2 · Categoria</h3>
      <select className="dx-input" value={category} onChange={(event) => setCategory(event.target.value as ComponentCategory)} aria-label="Categoria">
        {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>

      <h3>3 · Nome</h3>
      <input className="dx-input" autoFocus value={name} maxLength={80} placeholder={`Ex.: ${kind.label.split(' /')[0]} 16 A`} onChange={(event) => setName(event.target.value)} aria-label="Nome do componente" />

      <h3>4 · Já possui datasheet?</h3>
      <div className="ce-seg" role="radiogroup" aria-label="Datasheet">
        <button type="button" role="radio" aria-checked={sheet === 'have'} className={sheet === 'have' ? 'is-active' : ''} onClick={() => setSheet('have')}>Sim, já tenho</button>
        <button type="button" role="radio" aria-checked={sheet === 'none'} className={sheet === 'none' ? 'is-active' : ''} onClick={() => setSheet('none')}>Ainda não</button>
      </div>
      {sheet === 'have' && <div className="ce-new-sheet">
        <label className="ce-field"><span>Anexar PDF</span>
          <input type="file" accept="application/pdf,.pdf" onChange={(event) => pickFile(event.target.files?.[0] ?? null)} />
          {file && <small>{file.name} · {(file.size / 1024).toFixed(0)} KB</small>}
        </label>
        <label className="ce-field"><span>ou link do datasheet</span>
          <input className="dx-input" type="url" value={url} placeholder="https://…" onChange={(event) => setUrl(event.target.value)} />
        </label>
        {fileError && <small className="ce-new-error">{fileError}</small>}
        {urlInvalid && <small className="ce-new-error">O link deve começar por http:// ou https://</small>}
        <small>Pode também anexar o datasheet mais tarde, no separador Componente.</small>
      </div>}
      {sheet === 'none' && <small className="ce-new-note">Fica registado como «sem datasheet». Pode anexá-lo mais tarde no editor.</small>}

      <h3>5 · Bornes <span className="ce-new-opt">(opcional)</span></h3>
      <select className="dx-input" value={profileId} onChange={(event) => setProfileId(event.target.value)} aria-label="Perfil de bornes">
        <option value="">Sem bornes por agora — adiciono no editor</option>
        {suggestions.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}{profile.custom ? ' (personalizado)' : ''}</option>)}
      </select>
      <small className="ce-new-note">Perfis sugeridos para a categoria escolhida. É só um ponto de partida: no editor pode alterar, mover, apagar ou acrescentar bornes, e abrir a biblioteca completa.</small>

      <div className="ce-modal-actions">
        <button type="button" className="dx-btn dx-btn-secondary" onClick={onCancel} disabled={busy}>Cancelar</button>
        <button type="submit" className="dx-btn dx-btn-primary" disabled={!canCreate}>{busy ? 'A criar…' : 'Criar e abrir editor 3D'}</button>
      </div>
    </form>
  </div>, document.body)
}
