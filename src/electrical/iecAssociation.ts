/**
 * Associação elemento 3D (ComponentType) ↔ símbolo IEC (Esquema IEC / CmdKind).
 *
 * O DC-Simu tem duas representações do mesmo domínio:
 *  - 3D Realista: componentes físicos com modelo GLB / footprint
 *  - Esquema IEC: símbolos IEC 60617 (CmdKind) no editor de comandos
 *
 * Esta tabela é a ponte oficial: cada tipo 3D aponta para o(s) símbolo(s)
 * IEC correspondente(s). Usada no inspetor, na biblioteca e (futuro) na
 * sincronização entre vistas.
 *
 * Referências: IEC 60617 (símbolos gráficos), IEC 81346-2 (letras de referência).
 */

import type { ComponentType } from '../types'
import type { CmdKind } from '../commands/model'
import { CMD_PARTS } from '../commands/model'
import { parseCatalogType } from '../catalog/types'
import { useCatalogStore, latestVersionOf } from '../catalog/registry'

/** Associação de um componente 3D a símbolos IEC. */
export interface IecAssociation {
  /** Símbolo principal no Esquema IEC (quando existe equivalente directo). */
  primary?: CmdKind
  /**
   * Símbolos relacionados que costumam acompanhar o aparelho no esquema
   * (ex.: contactor → bobina + contactos NA/NF).
   */
  related?: CmdKind[]
  /** Referência IEC 60617 (código ou descrição curta) quando não há CmdKind. */
  iec60617?: string
  /** Letra de referência IEC 81346-2 (Q, F, K, S, M, H, T, U…). */
  refLetter?: string
  /** Nota humana (ex.: «equivalente funcional aproximado»). */
  note?: string
}

/** Mapa estático dos tipos integrados (não-catálogo). */
const BUILTIN: Partial<Record<ComponentType, IecAssociation>> = {
  // --- Proteção -----------------------------------------------------------
  breaker1p: { primary: 'breaker3', iec60617: '60617-7 / 07-13-02', refLetter: 'Q', note: 'Disjuntor 1P — mesmo símbolo de manobra; no IEC o número de pólos define-se pela instância' },
  breaker2p: { primary: 'breaker3', iec60617: '60617-7 / 07-13-02', refLetter: 'Q' },
  breaker3p: { primary: 'breaker3', iec60617: '60617-7 / 07-13-02', refLetter: 'Q' },
  breaker4p: { primary: 'breaker3', iec60617: '60617-7 / 07-13-02', refLetter: 'Q', note: '4P: L1–L3 + N' },
  breakerSteckSdC25: { primary: 'breaker3', iec60617: '60617-7 / 07-13-02', refLetter: 'Q' },
  motorBreaker: { primary: 'breaker3', related: ['thermal3', 'thermalNC', 'thermalNO'], iec60617: '60617-7', refLetter: 'Q', note: 'Disjuntor-motor = manobra + proteção térmica' },
  motorBreakerPkzmC10: { primary: 'breaker3', related: ['thermal3', 'thermalNC', 'thermalNO'], iec60617: '60617-7', refLetter: 'Q' },
  residualBreaker: { primary: 'breaker3', iec60617: '60617-7 / 07-13-08', refLetter: 'Q', note: 'Disjuntor diferencial (DR)' },
  phoenixEcb3000760: { primary: 'breaker3', iec60617: '60617-7', refLetter: 'Q', note: 'Proteção electrónica 24 V' },
  fuse: { primary: 'fuse', iec60617: '60617-7 / 07-21-01', refLetter: 'F' },
  fuseHolder: { primary: 'fuse', iec60617: '60617-7 / 07-21-01', refLetter: 'F' },
  surgeProtector: { primary: 'fuse', iec60617: '60617-5 / 05-', refLetter: 'F', note: 'DPS — símbolo de descarregador de sobretensão' },
  thermalRelay: { primary: 'thermal3', related: ['thermalNC', 'thermalNO'], iec60617: '60617-7 / 07-15-01', refLetter: 'F' },

  // --- Comando ------------------------------------------------------------
  buttonNO: { primary: 'pushNO', iec60617: '60617-7 / 07-07-02', refLetter: 'S' },
  buttonNC: { primary: 'pushNC', iec60617: '60617-7 / 07-07-03', refLetter: 'S' },
  dualPushButtonNpb22D11: { primary: 'pushNO', related: ['pushNC'], iec60617: '60617-7', refLetter: 'S', note: 'Botoeira dupla START/STOP' },
  emergencyButton: { primary: 'emergency', iec60617: '60617-7 / 07-07-07', refLetter: 'S' },
  emergencyButtonKeyP20ACR: { primary: 'emergency', iec60617: '60617-7 / 07-07-07', refLetter: 'S' },
  selector2: { primary: 'selector', iec60617: '60617-7 / 07-07-06', refLetter: 'S' },
  selector3: { primary: 'selector', iec60617: '60617-7 / 07-07-06', refLetter: 'S' },
  keySwitch: { primary: 'selector', iec60617: '60617-7', refLetter: 'S', note: 'Chave com segredo — seletor com chave' },
  footSwitch: { primary: 'pushNO', iec60617: '60617-7', refLetter: 'S', note: 'Pedal de comando' },
  limitSwitch: { primary: 'limitNO', iec60617: '60617-7 / 07-08-01', refLetter: 'S' },

  // --- Sensores (contacto ou sinal) ---------------------------------------
  proximitySensor: { primary: 'limitNO', iec60617: '60617-7 / 07-19', refLetter: 'B', note: 'Sensor indutivo — contacto ou saída PNP' },
  photoSensor: { primary: 'limitNO', iec60617: '60617-7 / 07-19', refLetter: 'B' },
  pressureSwitch: { primary: 'limitNO', iec60617: '60617-7 / 07-08', refLetter: 'B' },
  thermostat: { primary: 'limitNO', iec60617: '60617-7', refLetter: 'B' },
  floatSwitch: { primary: 'limitNO', iec60617: '60617-7', refLetter: 'B' },

  // --- Contactores e relés ------------------------------------------------
  contactor: { primary: 'coil', related: ['contact3', 'contactNO', 'contactNC'], iec60617: '60617-7 / 07-04 / 07-02', refLetter: 'K' },
  contactor4p: { primary: 'coil', related: ['contact3', 'contactNO', 'contactNC'], iec60617: '60617-7', refLetter: 'K' },
  contactorWegCWC09: { primary: 'coil', related: ['contact3', 'contactNO', 'contactNC'], iec60617: '60617-7', refLetter: 'K' },
  auxContactBlock: { primary: 'contactNO', related: ['contactNC'], iec60617: '60617-7 / 07-02', refLetter: 'K' },
  auxRelay: { primary: 'coil', related: ['contactNO', 'contactNC'], iec60617: '60617-7', refLetter: 'K' },
  auxRelay4: { primary: 'coil', related: ['contactNO', 'contactNC'], iec60617: '60617-7', refLetter: 'K' },
  timerRelayTON: { primary: 'timerCoil', related: ['timedNO', 'timedNC'], iec60617: '60617-7 / 07-16', refLetter: 'K' },
  timerRelayTOF: { primary: 'timerCoil', related: ['timedNO', 'timedNC'], iec60617: '60617-7 / 07-16', refLetter: 'K' },
  timerRelayStarDelta: { primary: 'timerCoil', related: ['timedNO', 'timedNC', 'coil'], iec60617: '60617-7', refLetter: 'K', note: 'Temporizador estrela-triângulo' },
  counterRelay: { primary: 'coil', related: ['contactNO', 'contactNC'], iec60617: '60617-7', refLetter: 'K' },
  safetyRelay: { primary: 'coil', related: ['contactNO', 'contactNC'], iec60617: '60617-7', refLetter: 'K', note: 'Relé de segurança' },

  // --- Sinalização --------------------------------------------------------
  ledGreen: { primary: 'lamp', iec60617: '60617-8 / 08-10-05', refLetter: 'H' },
  ledRed: { primary: 'lamp', iec60617: '60617-8 / 08-10-05', refLetter: 'H' },
  ledYellow: { primary: 'lamp', iec60617: '60617-8 / 08-10-05', refLetter: 'H' },
  ledWhite: { primary: 'lamp', iec60617: '60617-8 / 08-10-05', refLetter: 'H' },
  pilotLightAd22: { primary: 'lamp', iec60617: '60617-8 / 08-10-05', refLetter: 'H' },
  buzzer: { primary: 'lamp', iec60617: '60617-8 / 08-10-10', refLetter: 'H', note: 'Sinalizador acústico' },
  towerLight: { primary: 'lamp', iec60617: '60617-8', refLetter: 'H', note: 'Coluna luminosa' },

  // --- Motores / acionamentos ---------------------------------------------
  motor3ph: { primary: 'motor3', related: ['motor6'], iec60617: '60617-6 / 06-08-01', refLetter: 'M' },
  motor1ph: { primary: 'motor3', iec60617: '60617-6 / 06-04-01', refLetter: 'M', note: 'Motor monofásico — símbolo de máquina' },
  vfd: { iec60617: '60617-6 / conversor de frequência', refLetter: 'T', note: 'Sem CmdKind directo; no IEC usa-se o símbolo de conversor' },
  softStarter: { iec60617: '60617-6 / arrancador progressivo', refLetter: 'T' },

  // --- Controladores ------------------------------------------------------
  plcLogo: { iec60617: '60617-12 / unidade de processamento', refLetter: 'A', note: 'PLC / lógica programável' },
  plcCompact: { iec60617: '60617-12', refLetter: 'A' },
  plcSiemensLogo1224RC: { iec60617: '60617-12', refLetter: 'A' },
  plcLsXbmDn32s: { iec60617: '60617-12', refLetter: 'A' },
  siemensTsAdapterIeBasic: { iec60617: '60617-12', refLetter: 'A' },
  hmi: { iec60617: '60617-12 / interface homem-máquina', refLetter: 'P' },

  // --- Bornes, barras e fontes --------------------------------------------
  terminalBlock: { primary: 'node', iec60617: '60617-3 / 03-02-01', refLetter: 'X' },
  terminalPhoenixPti6: { primary: 'node', iec60617: '60617-3', refLetter: 'X' },
  terminalPE: { primary: 'node', iec60617: '60617-3 / 03-01-01', refLetter: 'X', note: 'Borne PE' },
  dinRail15x55: { iec60617: 'perfil DIN (não é símbolo de circuito)', refLetter: '', note: 'Elemento mecânico de montagem' },
  busbarPhase: { primary: 'node', iec60617: '60617-3 / barramento', refLetter: 'X' },
  busbarNeutral: { primary: 'node', iec60617: '60617-3', refLetter: 'N' },
  earthBar: { primary: 'node', iec60617: '60617-2 / 02-15-03', refLetter: 'PE' },
  terminalSet1ph: { primary: 'node', iec60617: '60617-3', refLetter: 'X' },
  terminalSet3ph: { primary: 'node', iec60617: '60617-3', refLetter: 'X' },
  transformer: { iec60617: '60617-6 / 06-09-01', refLetter: 'T' },
  powerSupply: { primary: 'supply', iec60617: '60617-2 / fonte', refLetter: 'G' },
  powerSource1ph: { primary: 'supply', iec60617: '60617-2 / 02-02', refLetter: 'G' },
  powerSource3ph: { primary: 'supply', iec60617: '60617-2 / 02-02', refLetter: 'G' },
  powerSupplyProauto24A: { primary: 'supply', iec60617: '60617-2', refLetter: 'G' },
  analogAmmeter: { iec60617: '60617-8 / 08-02-01', refLetter: 'P', note: 'Amperímetro' },
  multimeterDm20: { iec60617: '60617-8 / instrumento de medida', refLetter: 'P' },
}

/** Categorias → associação por omissão (para catálogo sem iecSymbol explícito). */
const BY_CATEGORY: Partial<Record<string, IecAssociation>> = {
  protection: { primary: 'breaker3', refLetter: 'Q' },
  command: { primary: 'pushNO', refLetter: 'S' },
  sensor: { primary: 'limitNO', refLetter: 'B' },
  contactor: { primary: 'coil', related: ['contact3', 'contactNO', 'contactNC'], refLetter: 'K' },
  relay: { primary: 'coil', related: ['contactNO', 'contactNC'], refLetter: 'K' },
  signaling: { primary: 'lamp', refLetter: 'H' },
  motor: { primary: 'motor3', refLetter: 'M' },
  drive: { iec60617: '60617-6', refLetter: 'T' },
  controller: { iec60617: '60617-12', refLetter: 'A' },
  terminal: { primary: 'node', refLetter: 'X' },
  power: { primary: 'supply', refLetter: 'G' },
  measurement: { iec60617: '60617-8', refLetter: 'P' },
}

/** kind textual do catálogo Admin → CmdKind. */
const BY_KIND_LABEL: Record<string, CmdKind> = {
  disjuntor: 'breaker3',
  'disjuntor-motor': 'breaker3',
  seccionador: 'disconnector3',
  fusível: 'fuse',
  fusivel: 'fuse',
  'relé térmico': 'thermal3',
  'rele termico': 'thermal3',
  contactor: 'coil',
  contacto: 'contactNO',
  bobina: 'coil',
  botão: 'pushNO',
  botao: 'pushNO',
  emergência: 'emergency',
  emergencia: 'emergency',
  seletor: 'selector',
  motor: 'motor3',
  lâmpada: 'lamp',
  lampada: 'lamp',
  sinalizador: 'lamp',
  temporizador: 'timerCoil',
  alimentação: 'supply',
  alimentacao: 'supply',
}

function fromCatalogMeta(type: ComponentType): IecAssociation | undefined {
  const parsed = parseCatalogType(type)
  if (!parsed) return undefined
  const entries = useCatalogStore.getState().entries
  const entry = entries.find((e) => e.id === parsed.id)
  if (!entry) return undefined
  const meta = entry.meta
  // Campo explícito no meta (quando o autor o preenche no Admin).
  const explicit = meta.iecSymbol as CmdKind | undefined
  const related = (meta.iecRelated ?? []).filter((k): k is CmdKind => k in CMD_PARTS)
  if (explicit && explicit in CMD_PARTS) {
    return {
      primary: explicit,
      related: related.length ? related : undefined,
      refLetter: CMD_PARTS[explicit].prefix || meta.tag?.[0],
      note: meta.kind,
    }
  }
  if (meta.kind) {
    const key = meta.kind.trim().toLowerCase()
    const mapped = BY_KIND_LABEL[key]
    if (mapped) return { primary: mapped, refLetter: CMD_PARTS[mapped].prefix || meta.tag?.[0], note: meta.kind }
  }
  if (meta.category && BY_CATEGORY[meta.category]) {
    return { ...BY_CATEGORY[meta.category], note: meta.kind || meta.name }
  }
  return { iec60617: 'a definir no catálogo', refLetter: meta.tag?.[0], note: meta.name }
}

/**
 * Resolve a associação IEC de um tipo de componente 3D.
 * Ordem: mapa integrado → meta do catálogo → categoria → desconhecido.
 */
export function iecAssociationOf(type: ComponentType): IecAssociation {
  const builtin = BUILTIN[type]
  if (builtin) return builtin
  const fromCat = fromCatalogMeta(type)
  if (fromCat) return fromCat
  return { iec60617: 'sem associação IEC definida', note: String(type) }
}

/** Rótulo legível do símbolo principal (para o inspetor). */
export function iecPrimaryLabel(assoc: IecAssociation): string {
  if (assoc.primary) return CMD_PARTS[assoc.primary].label
  if (assoc.iec60617) return assoc.iec60617
  return '—'
}

/** Lista de rótulos dos símbolos relacionados. */
export function iecRelatedLabels(assoc: IecAssociation): string[] {
  return (assoc.related ?? []).map((k) => CMD_PARTS[k]?.label ?? k)
}

/** True se o tipo 3D tem pelo menos um CmdKind utilizável no Esquema IEC. */
export function hasIecSymbol(type: ComponentType): boolean {
  const a = iecAssociationOf(type)
  return !!a.primary || !!(a.related && a.related.length)
}

/** Todos os CmdKind associados (primary + related), sem duplicados. */
export function iecKindsOf(type: ComponentType): CmdKind[] {
  const a = iecAssociationOf(type)
  const list: CmdKind[] = []
  if (a.primary) list.push(a.primary)
  for (const k of a.related ?? []) if (!list.includes(k)) list.push(k)
  return list
}

/** Tipos integrados ainda sem entrada no mapa (útil em validação/CI). */
export function missingBuiltinAssociations(types: ComponentType[]): ComponentType[] {
  return types.filter((t) => !parseCatalogType(t) && !BUILTIN[t])
}
