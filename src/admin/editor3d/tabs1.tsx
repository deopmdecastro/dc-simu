import { uiAlert } from '../../ui/dialogs'
import { useMemo } from 'react'
import { newId, defaultMaterial, posedPart, boundsMm } from '../../catalog/definition'
import type { MaterialDef, PartDef, SpinDef, Vec3 } from '../../catalog/types'
import { TEXTURE_CATEGORIES, TEXTURE_LIBRARY, libraryAssetId, textureLibraryEntry, type TextureLibraryEntry } from '../../three/textureLibrary'
import { BASE_STATE, descendantsOf, glbCache, patchMaterial, patchPart, posePart, useEditorStore } from './editorStore'
import { validateDefinition } from './validate'
import { Check, Color, Field, Num, Section, Select, Slider, Text, Vec3Input, Confirm } from './ui'

const SIZE_LABELS: Record<PartDef['kind'], [string, string, string] | null> = {
  group: null, glb: null, box: ['Largura', 'Altura', 'Profundidade'], cylinder: ['Diâmetro', 'Altura', '—'], cone: ['Diâmetro', 'Altura', '—'], sphere: ['Diâmetro', '—', '—'], torus: ['Diâmetro', '—', 'Espessura'],
}

/** Estado vazio do separador Objeto: resumo do componente e atalhos para as ações mais comuns. */
function Overview() {
  const def = useEditorStore((s) => s.def)
  const meta = useEditorStore((s) => s.meta)
  const mode = useEditorStore((s) => s.mode)
  const glbRevision = useEditorStore((s) => s.glbRevision)
  const wires = useEditorStore((s) => s.testWires.length)
  const setRibbon = useEditorStore((s) => s.setRibbon)
  const cameraTo = useEditorStore((s) => s.cameraTo)
  const set = useEditorStore((s) => s.set)
  const issues = useMemo(() => validateDefinition(def, meta), [def, meta])
  const errors = issues.filter((issue) => issue.level === 'error').length
  const size = useMemo(() => { const box = boundsMm(def, glbCache); const v = box.getSize(box.min.clone()); return `${v.x.toFixed(0)} × ${v.y.toFixed(0)} × ${v.z.toFixed(0)}` }, [def.parts, def.assets, glbRevision])
  return <div className="ce-overview">
    <div className="ce-overview-intro"><strong>Resumo do componente</strong><p>Selecione uma peça, borne, botão ou ecrã para editar as suas propriedades.</p></div>
    <div className="ce-overview-grid">
      <div className="ce-stat"><b>{def.parts.length}</b><span>peças</span></div>
      <div className="ce-stat"><b>{def.terminals.length}</b><span>bornes</span></div>
      <button className="ce-stat" onClick={() => set({ tab: 'controls', selection: def.controls?.[0] ? { kind: 'control', id: def.controls[0].id } : null })}><b>{def.controls?.length ?? 0}</b><span>botões e seletores</span></button>
      <button className="ce-stat" onClick={() => set({ tab: 'displays', selection: def.displays?.[0] ? { kind: 'display', id: def.displays[0].id } : null })}><b>{def.displays?.length ?? 0}</b><span>LCDs e ecrãs</span></button>
    </div>
    <div className="ce-overview-meta"><span>{size} mm</span><span>{wires} cabos de teste</span><span className={errors ? 'is-err' : ''}>{errors} erros · {issues.length - errors} avisos</span></div>
    <div className="ce-overview-actions">
      {mode === 'edit' && <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => setRibbon('terminal')}>Adicionar borne [2]</button>}
      <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => setRibbon('wire')}>Ligar cabo [3]</button>
      <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => cameraTo('fit')}>Enquadrar [F]</button>
    </div>
    {issues.length > 0 && <ul className="ce-overview-issues">{issues.slice(0, 4).map((issue, index) => <li key={index} className={`is-${issue.level}`}>{issue.text}</li>)}{issues.length > 4 && <li>+{issues.length - 4} mais…</li>}</ul>}
  </div>
}

export function ObjectTab() {
  const def = useEditorStore((s) => s.def)
  const selection = useEditorStore((s) => s.selection)
  const editState = useEditorStore((s) => s.editState)
  const tool = useEditorStore((s) => s.tool)
  const snap = useEditorStore((s) => s.snap)
  const edit = useEditorStore((s) => s.edit)
  const set = useEditorStore((s) => s.set)
  const part = selection?.kind === 'part' ? def.parts.find((item) => item.id === selection.id) : undefined
  const state = def.states.find((item) => item.id === editState)
  if (!part) return <Overview />
  const override = state?.parts[part.id]
  const pose = posedPart(part, override)
  const base = editState === BASE_STATE
  const blocked = descendantsOf(def, part.id).concat(part.id)
  const sizeLabels = SIZE_LABELS[part.kind]
  const writePose = (patch: Parameters<typeof posePart>[3], key: string) => edit((current) => posePart(current, editState, part.id, patch), `${key}:${part.id}`)

  return <>
    {!base && <div className="ce-banner">A editar o estado <b>{state?.name}</b>: as alterações guardam-se só como diferença da pose base.
      {override && <Confirm label="Repor base" className="ce-linkbtn" onConfirm={() => edit((current) => ({ ...current, states: current.states.map((item) => item.id === editState ? { ...item, parts: Object.fromEntries(Object.entries(item.parts).filter(([id]) => id !== part.id)) } : item) }))} />}</div>}
    <Section title="Identificação">
      <Field label="Nome"><Text value={part.name} onChange={(name) => edit((current) => patchPart(current, part.id, { name }), `name:${part.id}`)} /></Field>
      <Field label="Tipo"><span className="ce-static">{part.kind === 'glb' ? `Modelo GLB · ${def.assets[part.asset ?? '']?.name ?? '—'}` : part.kind}</span></Field>
      <Field label="Pai"><Select value={part.parentId ?? ''} disabled={!base} onChange={(parentId) => edit((current) => patchPart(current, part.id, { parentId: parentId || null }))}
        options={[['', '— raiz —'], ...def.parts.filter((item) => !blocked.includes(item.id) && item.kind === 'group').map((item): [string, string] => [item.id, item.name])]} /></Field>
      <div className="ce-checks">
        <Check checked={pose.visible} label="Visível" onChange={(visible) => writePose({ visible }, 'visible')} />
        <Check checked={part.locked} label="Bloqueada" onChange={(locked) => edit((current) => patchPart(current, part.id, { locked }))} />
      </div>
    </Section>
    <Section title="Transformação" actions={<span className="ce-toolbar">
      {(['translate', 'rotate', 'scale'] as const).map((item) => <button key={item} className={`ce-tool${tool === item ? ' is-on' : ''}`} onClick={() => set({ tool: item })} title={{ translate: 'Mover (W)', rotate: 'Rodar (E)', scale: 'Escalar (R)' }[item]}>{{ translate: 'Mover', rotate: 'Rodar', scale: 'Escalar' }[item]}</button>)}
    </span>}>
      <Vec3Input label="Posição" unit="mm" value={pose.position} step={snap.on ? snap.mm : 0.1} onChange={(position) => writePose({ position }, 'pos')} />
      <Vec3Input label="Rotação" unit="°" value={pose.rotation} step={snap.on ? snap.deg : 1} onChange={(rotation) => writePose({ rotation }, 'rot')} />
      <Vec3Input label="Escala" value={pose.scale} step={0.05} min={0.01} onChange={(scale) => writePose({ scale }, 'scl')} />
      {sizeLabels && base && <div className="ce-vec">
        <span className="ce-vec-label">Dimensões</span>
        {sizeLabels.map((label, index) => label === '—' ? <span key={index} /> : <span key={index} className="ce-axis"><b title={label}>{part.kind === 'box' ? label[0] : ['Ø', 'A', 'E'][index]}</b>
          <Num value={part.size[index]} min={0.1} step={1} unit={index === 2 ? 'mm' : undefined} onChange={(value) => { const size = [...part.size] as Vec3; size[index] = value; edit((current) => patchPart(current, part.id, { size }), `size:${part.id}`) }} /></span>)}
      </div>}
      {sizeLabels && <p className="ce-hint">{sizeLabels.filter((label) => label !== '—').join(' · ')} em mm.</p>}
    </Section>
    {part.kind !== 'group' && <Section title="Material">
      <Field label={base ? 'Material' : 'Material neste estado'}>
        <Select value={pose.materialId ?? ''} onChange={(materialId) => writePose({ materialId }, 'mat')} options={[['', '— predefinido —'], ...def.materials.map((item): [string, string] => [item.id, item.name])]} disabled={part.kind === 'glb' && !part.overrideMaterial} />
      </Field>
      {part.kind === 'glb' && <>
        <Check checked={!!part.overrideMaterial} label="Substituir os materiais do CAD" onChange={(overrideMaterial) => edit((current) => patchPart(current, part.id, { overrideMaterial, materialId: overrideMaterial ? (part.materialId ?? current.materials[0]?.id ?? null) : part.materialId }))} />
        <p className="ce-hint">{part.overrideMaterial ? 'Todo o modelo usa o material escolhido (ex.: textura real). A ferragem dos bornes mantém-se.' : 'Peças GLB mantêm os materiais do modelo importado.'}</p>
      </>}
      <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => set({ tab: 'materials' })}>Editar materiais…</button>
    </Section>}
    {base && <SpinSection part={part} />}
    {base && <Section title="No projeto" open={!!(part.optional || part.editorOnly)}>
      <div className="ce-checks">
        <Check checked={!!part.optional} label="Peça opcional (olho)" onChange={(optional) => edit((current) => patchPart(current, part.id, { optional }))} />
        <Check checked={!!part.editorOnly} label="Só no editor" onChange={(editorOnly) => edit((current) => patchPart(current, part.id, { editorOnly }))} />
      </div>
      <p className="ce-hint">Opcional: no projeto, o utilizador mostra ou oculta esta peça com o olho (👁) nas propriedades do componente. O «Visível» acima é o estado inicial. «Só no editor»: pré-visualização que não entra no modelo publicado.</p>
    </Section>}
  </>
}

/** Rotação contínua comandada por uma variável (pá do veio, rolos, discos). */
function SpinSection({ part }: { part: PartDef }) {
  const def = useEditorStore((s) => s.def)
  const edit = useEditorStore((s) => s.edit)
  const mode = useEditorStore((s) => s.mode)
  const previewVars = useEditorStore((s) => s.previewVars)
  const set = useEditorStore((s) => s.set)
  const spin = part.spin
  const write = (patch: Partial<SpinDef> | null) => edit((current) => patchPart(current, part.id, { spin: patch === null ? undefined : { axis: 'x', turnsPerSecond: 1.5, source: '$rpm', ...spin, ...patch } }), `spin:${part.id}`)
  const sources: Array<[string, string]> = [['$rpm', 'Velocidade do motor ($rpm, com sentido)'], ['$run', 'Simulação em RUN ($run)'], ...(def.vars ?? []).filter((item) => item.type === 'bool' || item.type === 'number').map((item): [string, string] => [item.id, `${item.name || item.id} (${item.id})`])]
  const testing = spin?.source === '$rpm' || !spin?.source ? Number(previewVars.$rpm ?? 0) > 0 : !!previewVars[spin.source]
  const test = () => {
    if (!spin) return
    const key = spin.source || '$rpm'
    const on = !testing
    set({ mode: 'simulate', previewVars: { ...previewVars, [key]: key === '$rpm' ? (on ? 1 : 0) : on } })
  }
  return <Section title="Rotação contínua" open={!!spin}>
    <Check checked={!!spin} label="Rodar continuamente (pá, rolo, disco…)" onChange={(on) => write(on ? {} : null)} />
    {spin && <>
      <Field label="Eixo (da peça)"><Select value={spin.axis} onChange={(axis) => write({ axis: axis as SpinDef['axis'] })} options={[['x', 'X'], ['y', 'Y'], ['z', 'Z']]} /></Field>
      <Field label="Voltas/s (máx.)"><Num value={spin.turnsPerSecond} min={0} max={30} step={0.1} onChange={(turnsPerSecond) => write({ turnsPerSecond })} /></Field>
      <Field label="Comandada por"><Select value={spin.source || '$rpm'} onChange={(source) => write({ source })} options={sources} /></Field>
      <Check checked={!!spin.reverse} label="Sentido inverso" onChange={(reverse) => write({ reverse })} />
      <div className="ce-actions">
        <button className="dx-btn dx-btn-primary dx-btn-sm" data-spin-test onClick={test}>{testing && mode === 'simulate' ? 'Parar teste' : 'Testar rotação'}</button>
        {(spin.source === '$rpm' || !spin.source) && <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => set({ previewVars: { ...previewVars, $dir: previewVars.$dir === 'ccw' ? 'cw' : 'ccw' } })}>Sentido: {previewVars.$dir === 'ccw' ? 'anti-horário ↺' : 'horário ↻'}</button>}
      </div>
      <p className="ce-hint">Roda em torno da origem da peça. No projeto, «$rpm» segue a velocidade simulada do motor (0 → 1, com rampa) e «$dir» o sentido. A rotação só se vê no modo Simular.</p>
    </>}
  </Section>
}

const TEXTURE_LIMIT = 700 * 1024
function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file) })
}

export function MaterialsTab() {
  const def = useEditorStore((s) => s.def)
  const selection = useEditorStore((s) => s.selection)
  const edit = useEditorStore((s) => s.edit)
  const set = useEditorStore((s) => s.set)
  const current = useEditorStore((s) => s.materialId)
  const chosenId = def.materials.some((item) => item.id === current) ? current! : def.materials[0]?.id
  const material = def.materials.find((item) => item.id === chosenId)
  const part = selection?.kind === 'part' ? def.parts.find((item) => item.id === selection.id) : undefined
  const choose = (id: string) => set({ materialId: id })
  const patch = (value: Partial<MaterialDef>, key: string) => material && edit((state) => patchMaterial(state, material.id, value), `mat:${material.id}:${key}`)
  const usage = material ? def.parts.filter((item) => item.materialId === material.id).length : 0

  async function texture(field: 'map' | 'normalMap', file: File | undefined) {
    if (!file || !material) return
    if (!file.type.startsWith('image/')) return await uiAlert('Escolha uma imagem (PNG ou JPG).')
    if (file.size > TEXTURE_LIMIT) return await uiAlert('A textura excede 700 KB. Reduza a resolução (ex.: 512×512).')
    const data = await readDataUrl(file)
    const assetId = newId('a_')
    edit((state) => ({ ...patchMaterial(state, material.id, { [field]: assetId }), assets: { ...state.assets, [assetId]: { name: file.name, mime: file.type, data } } }))
  }

  return <>
    <Section title="Materiais" actions={<button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => { const item = defaultMaterial(`Material ${def.materials.length + 1}`); edit((state) => ({ ...state, materials: [...state.materials, item] })); choose(item.id) }}>+ Novo</button>}>
      <div className="ce-swatches">
        {def.materials.map((item) => <button key={item.id} className={`ce-swatch${item.id === chosenId ? ' is-on' : ''}`} onClick={() => choose(item.id)} title={item.name}><i className={item.library ? 'has-tex' : undefined} style={{ backgroundColor: item.color, opacity: item.opacity, ...(textureLibraryEntry(item.library) ? { backgroundImage: `url(${textureLibraryEntry(item.library)!.thumb})` } : {}) }} /><span>{item.name}</span></button>)}
      </div>
    </Section>
    {material && <>
      <Section title="Aparência">
        <Field label="Nome"><Text value={material.name} onChange={(name) => patch({ name }, 'name')} /></Field>
        <Field label="Cor"><Color value={material.color} onChange={(color) => patch({ color }, 'color')} /></Field>
        <Field label="Rugosidade"><Slider value={material.roughness} onChange={(roughness) => patch({ roughness }, 'rough')} /></Field>
        <Field label="Metal"><Slider value={material.metalness} onChange={(metalness) => patch({ metalness }, 'metal')} /></Field>
        <Field label="Opacidade"><Slider value={material.opacity} min={0.05} onChange={(opacity) => patch({ opacity }, 'opacity')} /></Field>
        <Field label="Emissão"><Color value={material.emissive} onChange={(emissive) => patch({ emissive }, 'emissive')} /></Field>
        <Field label="Intensidade"><Slider value={material.emissiveIntensity} max={5} step={0.05} onChange={(emissiveIntensity) => patch({ emissiveIntensity }, 'ei')} /></Field>
      </Section>
      <TextureLibrarySection material={material} part={part} />
      <Section title="Texturas" open={false}>
        {(['map', 'normalMap'] as const).map((field) => <Field key={field} label={field === 'map' ? 'Cor (imagem)' : 'Relevo (normal)'}>
          <span className="ce-file">
            <span>{material[field] ? def.assets[material[field]!]?.name ?? 'imagem' : 'Sem textura'}</span>
            <label className="dx-btn dx-btn-secondary dx-btn-sm">Escolher<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => { void texture(field, event.target.files?.[0]); event.target.value = '' }} /></label>
            {material[field] && <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => patch({ [field]: undefined }, field)}>Remover</button>}
          </span>
        </Field>)}
        <Field label="Padrão (mm)"><Num value={material.tileMm ?? 0} min={0} step={10} unit="mm" onChange={(value) => patch({ tileMm: value > 0 ? value : undefined }, 'tile')} /></Field>
        <Field label="Relevo"><Slider value={material.normalScale ?? 1} max={3} step={0.05} onChange={(normalScale) => patch({ normalScale }, 'ns')} /></Field>
        <p className="ce-hint">Máx. 700 KB por imagem. As texturas ficam embebidas no modelo publicado. «Padrão» &gt; 0 projeta a textura à escala real (não estica com o tamanho da peça).</p>
      </Section>
      <Section title="Ações">
        <div className="ce-actions">
          {part && part.kind !== 'group' && <button className="dx-btn dx-btn-primary dx-btn-sm" onClick={() => edit((state) => patchPart(state, part.id, { materialId: material.id, ...(part.kind === 'glb' ? { overrideMaterial: true } : {}) }))}>Aplicar a «{part.name}»</button>}
          <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => { const copy = { ...material, id: newId('m_'), name: `${material.name} (cópia)` }; edit((state) => ({ ...state, materials: [...state.materials, copy] })); choose(copy.id) }}>Duplicar</button>
          <Confirm label="Eliminar" className="dx-btn dx-btn-danger dx-btn-sm" title={usage ? `Usado em ${usage} peça(s): passam ao material predefinido` : undefined}
            onConfirm={async () => { if (def.materials.length <= 1) return await uiAlert('Tem de existir pelo menos um material.'); edit((state) => ({ ...state, materials: state.materials.filter((item) => item.id !== material.id), parts: state.parts.map((item) => item.materialId === material.id ? { ...item, materialId: state.materials.find((other) => other.id !== material.id)?.id ?? null } : item) })) }} />
        </div>
        {usage > 0 && <p className="ce-hint">Usado em {usage} peça(s).</p>}
      </Section>
    </>}
  </>
}

/** Aplica uma textura da biblioteca a um material (os mapas ficam como assets com o endereço do ficheiro). */
export function applyLibraryTexture(state: import('../../catalog/types').ComponentDefinition, materialId: string, entry: TextureLibraryEntry) {
  const assets = { ...state.assets }
  const ids: Partial<Record<'map' | 'normalMap' | 'roughnessMap' | 'metalnessMap', string>> = {}
  const add = (key: keyof TextureLibraryEntry['maps'], field: keyof typeof ids) => {
    const url = entry.maps[key]
    if (!url) return
    const id = libraryAssetId(entry.id, key)
    assets[id] = { name: `${entry.name} · ${key}`, mime: 'image/jpeg', data: url }
    ids[field] = id
  }
  add('color', 'map'); add('normal', 'normalMap'); add('roughness', 'roughnessMap'); add('metalness', 'metalnessMap')
  const current = state.materials.find((item) => item.id === materialId)
  const keepColor = entry.tint && current && current.library && textureLibraryEntry(current.library)?.tint
  return {
    ...patchMaterial({ ...state, assets }, materialId, {
      map: ids.map, normalMap: ids.normalMap, roughnessMap: ids.roughnessMap, metalnessMap: ids.metalnessMap,
      library: entry.id, tileMm: entry.tileMm, normalScale: entry.normalScale,
      roughness: entry.roughness, metalness: entry.metalness,
      color: keepColor ? current!.color : entry.color,
    }),
  }
}

/** Remove os mapas da biblioteca de um material (os assets sem uso saem na limpeza ao publicar). */
function clearLibraryTexture(material: MaterialDef): Partial<MaterialDef> {
  return { map: undefined, normalMap: undefined, roughnessMap: undefined, metalnessMap: undefined, library: undefined, tileMm: undefined, normalScale: undefined }
}

function TextureLibrarySection({ material, part }: { material: MaterialDef; part: PartDef | undefined }) {
  const edit = useEditorStore((s) => s.edit)
  const set = useEditorStore((s) => s.set)
  const current = textureLibraryEntry(material.library)
  const apply = (entry: TextureLibraryEntry, asNew = false) => edit((state) => {
    let next = state
    let id = material.id
    if (asNew) {
      const created = { ...defaultMaterial(entry.name), id: newId('m_') }
      next = { ...state, materials: [...state.materials, created] }
      id = created.id
      queueMicrotask(() => set({ materialId: id }))
    }
    next = applyLibraryTexture(next, id, entry)
    if (part && part.kind !== 'group' && asNew) next = patchPart(next, part.id, { materialId: id, ...(part.kind === 'glb' ? { overrideMaterial: true } : {}) })
    return next
  })
  return <Section title={<>Biblioteca de texturas reais {current && <em className="ce-tex-current">· {current.name}</em>}</>}>
    <p className="ce-hint">Materiais PBR fotografados (ambientCG, CC0): cor, relevo, rugosidade e metal, à escala real. Clique para aplicar a «{material.name}»; ⊕ cria um material novo{part && part.kind !== 'group' ? ` e aplica-o a «${part.name}»` : ''}.</p>
    {TEXTURE_CATEGORIES.map((category) => <div key={category} className="ce-tex-group">
      <b>{category}</b>
      <div className="ce-tex-grid">
        {TEXTURE_LIBRARY.filter((item) => item.category === category).map((item) => <div key={item.id} className={`ce-tex${material.library === item.id ? ' is-on' : ''}`} data-texture={item.id}>
          <button type="button" className="ce-tex-pick" title={`${item.name} — ${item.hint}${item.tint ? ' (tingível: use a cor do material)' : ''}\n${item.source}`} onClick={() => apply(item)}>
            <img src={item.thumb} alt="" loading="lazy" width={56} height={56} />
            <span>{item.name}</span>
          </button>
          <button type="button" className="ce-tex-new" title="Novo material com esta textura" aria-label={`Novo material ${item.name}`} onClick={() => apply(item, true)}>⊕</button>
        </div>)}
      </div>
    </div>)}
    {current && <div className="ce-actions">
      <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => edit((state) => patchMaterial(state, material.id, clearLibraryTexture(material)))}>Remover textura</button>
      {current.tint && <span className="ce-hint">Tingível: mude a «Cor» acima (ex.: RAL 3000 vermelho, 7035 cinzento).</span>}
    </div>}
  </Section>
}
