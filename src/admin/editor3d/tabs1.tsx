import { useMemo } from 'react'
import { newId, defaultMaterial, posedPart, boundsMm } from '../../catalog/definition'
import type { MaterialDef, PartDef, Vec3 } from '../../catalog/types'
import { BASE_STATE, descendantsOf, glbCache, patchMaterial, patchPart, posePart, useEditorStore } from './editorStore'
import { validateDefinition } from './validate'
import { Check, Color, Empty, Field, Num, Section, Select, Slider, Text, Vec3Input, Confirm } from './ui'

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
  const issues = useMemo(() => validateDefinition(def, meta), [def, meta])
  const errors = issues.filter((issue) => issue.level === 'error').length
  const size = useMemo(() => { const box = boundsMm(def, glbCache); const v = box.getSize(box.min.clone()); return `${v.x.toFixed(0)} × ${v.y.toFixed(0)} × ${v.z.toFixed(0)}` }, [def.parts, def.assets, glbRevision])
  return <div className="ce-overview">
    <p className="ce-empty">Selecione uma peça na hierarquia ou no viewport para editar posição, rotação, escala e material.</p>
    <div className="ce-overview-grid">
      <div className="ce-stat"><b>{def.parts.length}</b><span>peças</span></div>
      <div className="ce-stat"><b>{def.terminals.length}</b><span>bornes</span></div>
      <div className="ce-stat"><b>{size}</b><span>mm (L × A × P)</span></div>
      <div className="ce-stat"><b>{wires}</b><span>cabos de teste</span></div>
      <div className={`ce-stat${errors ? ' is-err' : ''}`}><b>{errors}</b><span>erros</span></div>
      <div className={`ce-stat${issues.length - errors ? ' is-warn' : ''}`}><b>{issues.length - errors}</b><span>avisos</span></div>
    </div>
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
        <Select value={pose.materialId ?? ''} onChange={(materialId) => writePose({ materialId }, 'mat')} options={[['', '— predefinido —'], ...def.materials.map((item): [string, string] => [item.id, item.name])]} disabled={part.kind === 'glb'} />
      </Field>
      {part.kind === 'glb' && <p className="ce-hint">Peças GLB mantêm os materiais do modelo importado.</p>}
      <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => set({ tab: 'materials' })}>Editar materiais…</button>
    </Section>}
  </>
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
    if (!file.type.startsWith('image/')) return window.alert('Escolha uma imagem (PNG ou JPG).')
    if (file.size > TEXTURE_LIMIT) return window.alert('A textura excede 700 KB. Reduza a resolução (ex.: 512×512).')
    const data = await readDataUrl(file)
    const assetId = newId('a_')
    edit((state) => ({ ...patchMaterial(state, material.id, { [field]: assetId }), assets: { ...state.assets, [assetId]: { name: file.name, mime: file.type, data } } }))
  }

  return <>
    <Section title="Materiais" actions={<button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => { const item = defaultMaterial(`Material ${def.materials.length + 1}`); edit((state) => ({ ...state, materials: [...state.materials, item] })); choose(item.id) }}>+ Novo</button>}>
      <div className="ce-swatches">
        {def.materials.map((item) => <button key={item.id} className={`ce-swatch${item.id === chosenId ? ' is-on' : ''}`} onClick={() => choose(item.id)} title={item.name}><i style={{ background: item.color, opacity: item.opacity }} /><span>{item.name}</span></button>)}
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
      <Section title="Texturas" open={false}>
        {(['map', 'normalMap'] as const).map((field) => <Field key={field} label={field === 'map' ? 'Cor (imagem)' : 'Relevo (normal)'}>
          <span className="ce-file">
            <span>{material[field] ? def.assets[material[field]!]?.name ?? 'imagem' : 'Sem textura'}</span>
            <label className="dx-btn dx-btn-secondary dx-btn-sm">Escolher<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => { void texture(field, event.target.files?.[0]); event.target.value = '' }} /></label>
            {material[field] && <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => patch({ [field]: undefined }, field)}>Remover</button>}
          </span>
        </Field>)}
        <p className="ce-hint">Máx. 700 KB por imagem. As texturas ficam embebidas no modelo publicado.</p>
      </Section>
      <Section title="Ações">
        <div className="ce-actions">
          {part && part.kind !== 'group' && part.kind !== 'glb' && <button className="dx-btn dx-btn-primary dx-btn-sm" onClick={() => edit((state) => patchPart(state, part.id, { materialId: material.id }))}>Aplicar a «{part.name}»</button>}
          <button className="dx-btn dx-btn-secondary dx-btn-sm" onClick={() => { const copy = { ...material, id: newId('m_'), name: `${material.name} (cópia)` }; edit((state) => ({ ...state, materials: [...state.materials, copy] })); choose(copy.id) }}>Duplicar</button>
          <Confirm label="Eliminar" className="dx-btn dx-btn-danger dx-btn-sm" title={usage ? `Usado em ${usage} peça(s): passam ao material predefinido` : undefined}
            onConfirm={() => { if (def.materials.length <= 1) return window.alert('Tem de existir pelo menos um material.'); edit((state) => ({ ...state, materials: state.materials.filter((item) => item.id !== material.id), parts: state.parts.map((item) => item.materialId === material.id ? { ...item, materialId: state.materials.find((other) => other.id !== material.id)?.id ?? null } : item) })) }} />
        </div>
        {usage > 0 && <p className="ce-hint">Usado em {usage} peça(s).</p>}
      </Section>
    </>}
  </>
}
