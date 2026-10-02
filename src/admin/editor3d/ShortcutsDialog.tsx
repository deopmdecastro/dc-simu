import { useEffect } from 'react'

const GROUPS: Array<[string, Array<[string, string]>]> = [
  ['Ferramentas', [['1 – 6', 'Selecionar · Borne · Cabo · Apagar · Arrastar malha · Medir'], ['W / E / R', 'Mover · Rodar · Escala'], ['X', 'Eixos locais / globais'], ['Esc', 'Cancelar / voltar a Selecionar / limpar seleção']]],
  ['Seleção', [['Clique', 'Selecionar peça'], ['Ctrl / Shift + clique', 'Juntar ou tirar da seleção'], ['Ctrl + A', 'Selecionar todas as peças'], ['Del / Backspace', 'Eliminar a seleção (Ctrl+Z desfaz)']]],
  ['Edição', [['Ctrl + D', 'Duplicar'], ['Ctrl + G', 'Agrupar'], ['Ctrl + Z / Y', 'Desfazer / refazer'], ['Ctrl + S', 'Guardar rascunho'], ['F2', 'Renomear a peça selecionada'], ['← → ↑ ↓', 'Mover em X / Z (passo do Snap)'], ['PgUp / PgDn', 'Mover em Y'], ['Shift · Alt', 'Passo ×10 · ×0,1 nas setas']]],
  ['Vista e visibilidade', [['F · Shift+F', 'Enquadrar tudo / seleção'], ['H', 'Mostrar/ocultar bornes'], ['Shift + H', 'Ocultar/mostrar a peça selecionada'], ['Alt + H', 'Mostrar todas as peças'], ['L', 'Bloquear/desbloquear a peça'], ['? ou F1', 'Esta ajuda']]],
]

export default function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' || event.key === '?' || event.key === 'F1') { event.preventDefault(); event.stopPropagation(); onClose() } }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [onClose])
  return <div className="ce-keys-back" role="dialog" aria-modal="true" aria-label="Atalhos de teclado" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div className="ce-keys">
      <div className="ce-keys-head"><strong>Atalhos de teclado</strong><button className="ce-icon" aria-label="Fechar" onClick={onClose}>✕</button></div>
      <div className="ce-keys-grid">
        {GROUPS.map(([title, items]) => <section key={title}><h4>{title}</h4>
          {items.map(([keys, text]) => <div key={keys} className="ce-keys-row"><kbd className="ce-kbd">{keys}</kbd><span>{text}</span></div>)}
        </section>)}
      </div>
    </div>
  </div>
}
