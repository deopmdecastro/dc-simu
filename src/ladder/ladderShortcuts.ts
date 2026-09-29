import type { PaletteKind } from './ladderDnd'

export type ShortcutGroupId = 'edit' | 'networks' | 'elements' | 'view'

export interface ShortcutDef {
  id: string
  group: ShortcutGroupId
  /** teclas para mostrar (cada item é uma "tecla"); "+" separa visualmente */
  keys: string[]
  label: string
}

export const SHORTCUT_GROUPS: Record<ShortcutGroupId, string> = {
  edit: 'Edição',
  networks: 'Networks',
  elements: 'Inserir elementos na network ativa',
  view: 'Vista e ajuda',
}

/** Atalhos de uma letra que inserem um elemento na network ativa. */
export const ELEMENT_KEYS: { key: string; shift?: boolean; kind: PaletteKind; label: string }[] = [
  { key: 'c', kind: 'NO', label: 'Contacto NA' },
  { key: 'c', shift: true, kind: 'NC', label: 'Contacto NF' },
  { key: 'o', kind: 'COIL', label: 'Bobina' },
  { key: 's', kind: 'SET', label: 'Bobina SET' },
  { key: 'r', kind: 'RESET', label: 'Bobina RESET' },
  { key: 'b', kind: 'BRANCH', label: 'Ramo OR' },
  { key: 't', kind: 'TON', label: 'Temporizador TON' },
  { key: 'u', kind: 'CTU', label: 'Contador CTU' },
  { key: 'm', kind: 'MOVE', label: 'MOVE' },
]

export const SHORTCUTS: ShortcutDef[] = [
  { id: 'undo', group: 'edit', keys: ['Ctrl', 'Z'], label: 'Desfazer' },
  { id: 'redo', group: 'edit', keys: ['Ctrl', 'Y'], label: 'Refazer (ou Ctrl+Shift+Z)' },
  { id: 'save', group: 'edit', keys: ['Ctrl', 'S'], label: 'Guardar o projeto' },
  { id: 'open', group: 'edit', keys: ['Ctrl', 'Shift', 'O'], label: 'Abrir projetos guardados' },
  { id: 'edit-el', group: 'edit', keys: ['Enter'], label: 'Editar o elemento selecionado' },
  { id: 'del-el', group: 'edit', keys: ['Del'], label: 'Remover o elemento selecionado' },
  { id: 'clear-el', group: 'edit', keys: ['Esc'], label: 'Limpar seleção ou fechar diálogo' },

  { id: 'new', group: 'networks', keys: ['Insert'], label: 'Nova network (ou Ctrl+Shift+N)' },
  { id: 'nav', group: 'networks', keys: ['Alt', '↑ / ↓'], label: 'Network anterior / seguinte' },
  { id: 'nav2', group: 'networks', keys: ['PgUp / PgDn'], label: 'Network anterior / seguinte' },
  { id: 'nav3', group: 'networks', keys: ['Home / End'], label: 'Primeira / última network' },
  { id: 'move', group: 'networks', keys: ['Alt', 'Shift', '↑ / ↓'], label: 'Mover a network para cima / baixo' },
  { id: 'dup', group: 'networks', keys: ['Ctrl', 'D'], label: 'Duplicar a network ativa' },
  { id: 'del-net', group: 'networks', keys: ['Ctrl', 'Del'], label: 'Eliminar a network ativa' },
  { id: 'collapse', group: 'networks', keys: ['Ctrl', 'E'], label: 'Recolher / expandir a network ativa' },
  { id: 'collapse-all', group: 'networks', keys: ['Ctrl', 'Shift', 'E'], label: 'Recolher / expandir todas' },
  { id: 'toggle', group: 'networks', keys: ['Ctrl', 'Shift', 'A'], label: 'Ativar / desativar a network' },

  ...ELEMENT_KEYS.map((e, i): ShortcutDef => ({ id: `el-${i}`, group: 'elements', keys: e.shift ? ['Shift', e.key.toUpperCase()] : [e.key.toUpperCase()], label: e.label })),

  { id: 'zoom', group: 'view', keys: ['Ctrl', '+ / − / 0'], label: 'Zoom: aumentar / reduzir / repor' },
  { id: 'find', group: 'view', keys: ['/'], label: 'Pesquisar na paleta de elementos (ou Ctrl+F)' },
  { id: 'palette', group: 'view', keys: ['Ctrl', 'B'], label: 'Mostrar / esconder paleta de elementos' },
  { id: 'status', group: 'view', keys: ['Ctrl', 'J'], label: 'Mostrar / esconder o painel de Entradas/Saídas' },
  { id: 'views', group: 'view', keys: ['Ctrl', '1 … 5'], label: 'Mudar de vista (Esquema, Ladder, GRAFCET…)' },
  { id: 'sections', group: 'view', keys: ['Alt', '1 … 5'], label: 'Projeto, Biblioteca, Dispositivos, Diagnóstico e Configurações' },
  { id: 'help', group: 'view', keys: ['?'], label: 'Mostrar esta lista de atalhos (ou Ctrl+/)' },
]
