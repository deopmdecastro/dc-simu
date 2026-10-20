import Modal from '../ui/Modal'
import { Kbd } from '../ladder/ShortcutsDialog'
import { IconHelp } from '../ui/icons'

const GROUPS = [
  {
    title: 'Ferramentas e Navegação',
    items: [
      { keys: ['V'], label: 'Ferramenta Selecionar (ou tecla S)' },
      { keys: ['H'], label: 'Ferramenta Arrastar tela (Mão) — na ferramenta Selecionar, arrastar o fundo seleciona; use H, Espaço ou o botão do meio para mover a vista' },
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
    title: 'Seleção múltipla',
    items: [
      { keys: ['Arrastar no fundo'], label: 'Desenhar um retângulo e selecionar as etapas tocadas (Shift/Ctrl acrescenta)' },
      { keys: ['Shift', 'Clique'], label: 'Juntar ou tirar uma etapa da seleção (também Ctrl/⌘)' },
      { keys: ['Ctrl', 'A'], label: 'Selecionar todas as etapas' },
      { keys: ['Arrastar'], label: 'Mover o grupo inteiro, mantendo a forma' },
      { keys: ['Shift', '← ↑ → ↓'], label: 'Mover o grupo um passo da grelha' },
      { keys: ['Ctrl', 'C'], label: 'Copiar etapas (com as transições entre elas)' },
      { keys: ['Ctrl', 'V'], label: 'Colar a cópia, deslocada (a etapa inicial copiada deixa de ser inicial)' },
      { keys: ['Z'], label: 'Ampliar a vista à seleção (ou ao diagrama todo, sem seleção)' },
    ],
  },
  {
    title: 'Mover etapas na grelha',
    items: [
      { keys: ['Arrastar etapa'], label: 'Mover a etapa livremente; encaixa à grelha e alinha com as outras (guias a rosa)' },
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
      { keys: ['Botão direito'], label: 'Menu de contexto: criar elementos no cursor, copiar, colar, alinhar, eliminar' },
      { keys: ['Minimapa'], label: 'Clicar ou arrastar no minimapa (canto inferior esquerdo) para navegar; botão «Mapa» mostra/esconde' },
      { keys: ['?'], label: 'Mostrar esta lista de atalhos (ou Ctrl+/)' },
    ],
  },
]

/** Usa a Modal partilhada da plataforma (Esc/clique fora, folha no telemóvel). */
export default function GrafcetShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={760}
      title="Atalhos do editor GRAFCET"
      subtitle="No macOS use ⌘ em vez de Ctrl"
      icon={<span className="dc-modal-ico-badge"><IconHelp size={13} /></span>}
    >
      <div className="lk-groups">
        {GROUPS.map((group) => (
          <section className="lk-group" key={group.title}>
            <h4>{group.title}</h4>
            {group.items.map((item) => <div className="lk-row" key={item.label}><span>{item.label}</span><Kbd keys={item.keys} /></div>)}
          </section>
        ))}
      </div>
    </Modal>
  )
}
