// ============================================================================
// Biblioteca de etiquetas padrão (IEC 60445 / IEC 60947)
//
// Conjunto de rótulos normalizados usados na indústria para bornes e cabos
// (L1/L2/L3, PE, A1/A2, 13-14, U1/V1/W1…). Serve como "picker" rápido no
// inspetor de bornes e de cabos, para não depender de digitação manual e
// evitar erros de nomenclatura — o mesmo princípio de softwares profissionais
// de projeto elétrico (ex.: EPLAN/See Electrical), onde etiquetas normalizadas
// aparecem com um cadeado (não são texto livre, são catálogo).
// ============================================================================

export interface StandardLabelCategory {
  id: string
  name: string
  /** Norma de referência exibida ao lado do nome da categoria. */
  standard: string
  labels: string[]
}

export const STANDARD_LABEL_CATEGORIES: StandardLabelCategory[] = [
  {
    id: 'ac-supply',
    name: 'Alimentação CA',
    standard: 'IEC 60445',
    labels: ['L1', 'L2', 'L3', 'N', 'PE', 'PEN', 'E', 'GND'],
  },
  {
    id: 'dc-supply',
    name: 'Alimentação CC',
    standard: 'IEC 60445',
    labels: ['L+', 'L-', '+', '-', '24V', '0V', '12V', '5V', '48V', '110V', '220V', 'M'],
  },
  {
    id: 'motor-3ph',
    name: 'Motor trifásico',
    standard: 'IEC 60034-8',
    labels: ['U1', 'V1', 'W1', 'U2', 'V2', 'W2', 'U', 'V', 'W'],
  },
  {
    id: 'coil',
    name: 'Bobina de contator/relé',
    standard: 'IEC 60947',
    labels: ['A1', 'A2', 'A3'],
  },
  {
    id: 'aux-no',
    name: 'Contatos auxiliares NA',
    standard: 'IEC 60947',
    labels: ['13', '14', '23', '24', '33', '34', '43', '44', '53', '54', '63', '64'],
  },
  {
    id: 'aux-nc',
    name: 'Contatos auxiliares NF',
    standard: 'IEC 60947',
    labels: ['11', '12', '21', '22', '31', '32', '41', '42', '51', '52', '61', '62'],
  },
  {
    id: 'power',
    name: 'Contatos de força',
    standard: 'IEC 60947',
    labels: ['1/L1', '2/T1', '3/L2', '4/T2', '5/L3', '6/T3'],
  },
  {
    id: 'thermal',
    name: 'Relé térmico',
    standard: 'IEC 60947',
    labels: ['95', '96', '97', '98'],
  },
  {
    id: 'timer',
    name: 'Temporizador',
    standard: 'IEC 60947-5',
    labels: ['15', '16', '17', '18', '25', '26', '27', '28'],
  },
  {
    id: 'pushbutton',
    name: 'Botoeiras',
    standard: 'IEC 60947-5',
    labels: ['S1', 'S2', 'S3', 'S4'],
  },
  {
    id: 'transformer',
    name: 'Transformador',
    standard: 'IEC 61558',
    labels: ['1U', '1V', '2U', '2V', '1N', '2N'],
  },
  {
    id: 'analog',
    name: 'Sinais analógicos',
    standard: 'IEC 60381',
    labels: ['AI', 'AO', '4-20', '0-10', 'SIG', 'REF', 'SH'],
  },
  {
    id: 'digital',
    name: 'Sinais digitais / Bus',
    standard: '',
    labels: ['DI', 'DO', 'COM', 'TX', 'RX', 'D+', 'D-', 'A', 'B', 'SDA', 'SCL'],
  },
]

export const ALL_STANDARD_LABELS: string[] = STANDARD_LABEL_CATEGORIES.flatMap((c) => c.labels)
