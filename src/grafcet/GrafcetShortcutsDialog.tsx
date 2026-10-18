import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Kbd } from '../ladder/ShortcutsDialog'

const GROUPS = [
  {
    title: 'Ferramentas e Navegação',
    items: [
      { keys: ['V'], label: 'Ferramenta Selecionar (ou tecla S)' },
      { keys: ['H'], label: 'Ferramenta Arrastar tela (Mão)' },
      { keys: ['L'], label: 'Ferramenta Ligar — une etapas/transições por linha (arraste ou toque-a-toque; Esc cancela o fio)' },
      { keys: ['Espaço'], label: 'Arrastar tela temporariamente (manter premido)' },
      { keys: ['↓ / ↑'], label: 'Navegar sequencialmente entre etapas' },
      { keys: ['Enter'], label: 'Abrir diálogo FluidSIM da entidade' },
      { keys: ['Ctrl', '0'], label: 'Ajustar diagrama à janela (ou duplo clique no fundo)' },
    ],
  },
  {
    title: 'Elementos soltos (transições e ações)',
    items: [
      { keys: ['T'], label: 'Criar transição solta (barra livre, sem ligações)' },
      { keys: ['4'], label: 'Criar ação solta (caixa livre, sem etapa)' },
      { keys: ['Arrastar'], label: 'Largar o elemento sobre uma etapa liga-o (barra: topo = origem, fundo = destino); arrastar uma ação ligada para fora desanexa-a' },
      { keys: ['L'], label: 'Ligar por linha: etapa→etapa cria transição; porto roxo da etapa→ação liga a ação' },
      { keys: ['Arrastar etapa'], label: 'Largar uma etapa junto a uma barra solta também liga a transição' },
    ],
  },
  {
    title: 'Mover etapas na grelha',
    items: [
      { keys: ['Arrastar'], label: 'Mover a etapa livremente; encaixa à grelha e alinha com as outras (guias a rosa)' },
      { keys: ['Shift', 'Arrastar'], label: 'Mover só na horizontal ou só na vertical' },
      { keys: ['Alt', 'Arrastar'], label: 'Mover sem encaixe nem guias (movimento livre)' },
      { keys: ['Esc'], label: 'Cancelar o arrastamento em curso' },
      { keys: ['Shift', '← ↑ → ↓'], label: 'Mover a etapa selecionada um passo da grelha' },
      { keys: ['Ctrl', '← ↑ → ↓'], label: 'Mover a vista' },
    ],
  },
  {
    title: 'Edição',
    items: [
      { keys: ['Ctrl', 'Z'], label: 'Desfazer' },
      { keys: ['Ctrl', 'Y'], label: 'Refazer (ou Ctrl+Shift+Z)' },
      { keys: ['Ctrl', 'D'], label: 'Duplicar a etapa ou transição selecionada' },
      { keys: ['Del'], label: 'Eliminar a entidade selecionada (ou Backspace)' },
      { keys: ['Esc'], label: 'Limpar seleção ou fechar ajuda' },
    ],
  },
  {
    title: 'Construção',
    items: [
      { keys: ['1'], label: 'Adicionar etapa (nasce sem transição) (ou Insert)' },
      { keys: ['2'], label: 'Adicionar etapa em posição livre (ou Shift+Insert)' },
      { keys: ['3'], label: 'Adicionar transição solta (ou T)' },
      { keys: ['4'], label: 'Adicionar ação solta (ou A)' },
      { keys: ['Shift', 'A'], label: 'Adicionar ação condicionada solta' },
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
      { keys: ['Roda do rato'], label: 'Zoom centrado no cursor' },
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
