import { useEditorStore } from './editorStore'
import { Section } from './ui'

/** Same real protective geometry as the native route, owned by the saved
 * definition. Toggling changes only this optional part's initial visibility.
 */
export default function TerminalAssemblyCoverSection() {
  const cover = useEditorStore(s => s.def.parts.find(part => part.procedural === 'terminal-assembly-cover'))
  const edit = useEditorStore(s => s.edit)
  if (!cover) return null
  return <Section title="Acrílico de proteção">
    <p className="ce-hint">Tampa transparente com parafusos e sinal de aviso. A escolha inicial é guardada e publicada; no projeto pode ligar ou retirar a tampa sem alterar os bornes.</p>
    <button type="button" className={`dx-btn dx-btn-sm ${cover.visible ? 'dx-btn-primary' : 'dx-btn-secondary'}`}
      aria-pressed={cover.visible} disabled={cover.locked}
      onClick={() => edit(def => ({ ...def, parts: def.parts.map(part => part.id === cover.id ? { ...part, visible: !part.visible } : part) }), `cover:${cover.id}`)}>
      {cover.visible ? 'Com acrílico' : 'Sem acrílico'}
    </button>
  </Section>
}
