import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Kbd } from '../ladder/ShortcutsDialog'

const GROUPS = [
  {
    title: 'Edição',
    items: [
      { keys: ['Ctrl', 'Z'], label: 'Desfazer' },
      { keys: ['Ctrl', 'Y'], label: 'Refazer (ou Ctrl+Shift+Z)' },
      { keys: ['Ctrl', 'D'], label: 'Duplicar a etapa ou transição selecionada' },
      { keys: ['Del'], label: 'Eliminar a entidade selecionada' },
      { keys: ['Esc'], label: 'Limpar seleção ou fechar ajuda' },
    ],
  },
  {
    title: 'Construção',
    items: [
      { keys: ['Insert'], label: 'Adicionar etapa ligada' },
      { keys: ['Shift', 'Insert'], label: 'Adicionar etapa solta' },
      { keys: ['A'], label: 'Adicionar ação contínua' },
      { keys: ['Shift', 'A'], label: 'Adicionar ação condicionada' },
      { keys: ['T'], label: 'Adicionar transição' },
      { keys: ['F'], label: 'Criar divergência AND' },
      { keys: ['J'], label: 'Criar convergência AND' },
    ],
  },
  {
    title: 'Vista',
    items: [
      { keys: ['Ctrl', 'B'], label: 'Mostrar ou esconder componentes' },
      { keys: ['Ctrl', 'F'], label: 'Pesquisar componentes' },
      { keys: ['Ctrl', '+ / − / 0'], label: 'Aumentar, reduzir ou ajustar zoom' },
      { keys: ['Home'], label: 'Ajustar o diagrama à área visível' },
      { keys: ['?'], label: 'Mostrar esta lista de atalhos (ou Ctrl+/)' },
    ],
  },
]

export default function GrafcetShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="lk-overlay" role="presentation" onMouseDown={onClose}>
      <section className="lk-dialog grafcet-shortcuts-dialog" role="dialog" aria-modal="true" aria-labelledby="grafcet-shortcuts-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="lk-head">
          <div>
            <h3 id="grafcet-shortcuts-title">Atalhos do editor GRAFCET</h3>
            <small>No macOS use ⌘ em vez de Ctrl</small>
          </div>
          <button className="ladder-ghost-button" onClick={onClose} aria-label="Fechar" title="Fechar (Esc)">×</button>
        </header>
        <div className="lk-body">
          <div className="lk-groups">
            {GROUPS.map((group) => (
              <section className="lk-group" key={group.title}>
                <h4>{group.title}</h4>
                {group.items.map((item) => <div className="lk-row" key={item.label}><span>{item.label}</span><Kbd keys={item.keys} /></div>)}
              </section>
            ))}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  )
}
