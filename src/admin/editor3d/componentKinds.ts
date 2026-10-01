import type { ComponentCategory } from '../../types'
import type { ComponentDefinition } from '../../catalog/types'

export const CATEGORIES: Array<[ComponentCategory, string]> = [['protection', 'Proteção'], ['command', 'Comando'], ['sensor', 'Sensor'], ['measurement', 'Aparelho de medir'], ['contactor', 'Contactor'], ['relay', 'Relé'], ['signaling', 'Sinalização'], ['motor', 'Motor'], ['drive', 'Variador'], ['controller', 'Controlador / PLC'], ['terminal', 'Terminal / borneira'], ['power', 'Fonte / potência']]

export interface ComponentKind {
  id: string
  label: string
  category: ComponentCategory
  tag: string
  mount: ComponentDefinition['mount']
  hint: string
}

/** Tipos de componente sugeridos no assistente "Novo componente" (pré-preenchem categoria, TAG e montagem). */
export const COMPONENT_KINDS: ComponentKind[] = [
  { id: 'breaker', label: 'Disjuntor / proteção', category: 'protection', tag: 'QF', mount: 'din-rail', hint: 'Disjuntores, diferenciais, fusíveis' },
  { id: 'contactor', label: 'Contactor', category: 'contactor', tag: 'KM', mount: 'din-rail', hint: 'Contactores de potência' },
  { id: 'relay', label: 'Relé', category: 'relay', tag: 'KA', mount: 'din-rail', hint: 'Relés auxiliares e temporizadores' },
  { id: 'pushbutton', label: 'Botão / seletor', category: 'command', tag: 'S', mount: 'panel-front', hint: 'Botões, seletores, paragem de emergência' },
  { id: 'pilot', label: 'Sinalizador', category: 'signaling', tag: 'H', mount: 'panel-front', hint: 'Lâmpadas, buzzers, torres de sinalização' },
  { id: 'sensor', label: 'Sensor', category: 'sensor', tag: 'B', mount: 'machine', hint: 'Indutivos, fotoelétricos, finais de curso' },
  { id: 'instrument', label: 'Aparelho de medir', category: 'measurement', tag: 'P', mount: 'machine', hint: 'Multímetros, osciloscópios, ponteiras de teste' },
  { id: 'motor', label: 'Motor', category: 'motor', tag: 'M', mount: 'machine', hint: 'Motores e atuadores' },
  { id: 'drive', label: 'Variador / arrancador', category: 'drive', tag: 'U', mount: 'din-rail', hint: 'Variadores de frequência, soft-starters' },
  { id: 'plc', label: 'PLC / controlador', category: 'controller', tag: 'A', mount: 'din-rail', hint: 'PLC, módulos de E/S, HMI' },
  { id: 'terminal', label: 'Borne / borneira', category: 'terminal', tag: 'X', mount: 'din-rail', hint: 'Blocos de terminais' },
  { id: 'power', label: 'Fonte / transformador', category: 'power', tag: 'G', mount: 'din-rail', hint: 'Fontes de alimentação e transformadores' },
  { id: 'other', label: 'Outro', category: 'command', tag: 'X', mount: 'din-rail', hint: 'Qualquer outro componente' },
]
