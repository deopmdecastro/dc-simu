import type { ComponentType, ElectricalComponent } from '../types'

/** Calibres normalizados IEC 60898-1 para disjuntores modulares (A). */
export const MCB_INA_OPTIONS = [1, 2, 3, 4, 6, 10, 13, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125] as const
export const EASY9_INA_OPTIONS = [2, 4, 6, 10, 16, 20, 25, 32, 40, 50, 63] as const
export const STECK_INA_OPTIONS = [2, 4, 6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100] as const

export const MCB_CURVE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'B', label: 'Curva B (3–5 In · cargas resistivas)' },
  { value: 'C', label: 'Curva C (5–10 In · uso geral / indutivo)' },
  { value: 'D', label: 'Curva D (10–20 In · arranque pesado)' },
]

export const MCB_ICN_OPTIONS = ['3 kA', '4,5 kA', '6 kA', '10 kA', '15 kA'] as const

/** Calibres normalizados IEC 61008-1 / IEC 61009-1 para diferenciais (ID / DR). */
export const RCD_INA_OPTIONS = [16, 25, 40, 63, 80, 100] as const
export const RCD_SENS_MA_OPTIONS = [10, 30, 100, 300, 500] as const
export const RCD_TYPE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'AC', label: 'Tipo AC (fugas sinusoidais CA)' },
  { value: 'A', label: 'Tipo A (CA + contínua pulsante)' },
  { value: 'F', label: 'Tipo F (variadores monofásicos)' },
  { value: 'B', label: 'Tipo B (CA + CC alisada / trifásicos)' },
]

/** Calibres normalizados IEC 60269 para cartuchos fusíveis cilíndricos e NH (A). */
export const FUSE_10X38_INA_OPTIONS = [0.5, 1, 2, 4, 6, 8, 10, 12, 16, 20, 25, 32] as const
export const FUSE_8X31_INA_OPTIONS = [0.5, 1, 2, 4, 6, 8, 10, 12, 16, 20, 25] as const
export const FUSE_GENERIC_INA_OPTIONS = [0.5, 1, 2, 4, 6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125] as const

export const FUSE_CLASS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'gG', label: 'gG — Uso geral (cabos e linhas)' },
  { value: 'aM', label: 'aM — Acompanhamento de motores' },
  { value: 'gR', label: 'gR — Ultrarrápido (semicondutores)' },
]

/** Calibres normalizados Phoenix Contact EC-E1 (24 V DC / 12 V DC). */
export const ECB_INA_OPTIONS = [0.5, 1, 2, 3, 4, 6, 8, 10, 12] as const
export const ECB_VOLTAGE_OPTIONS = ['12 V DC', '24 V DC'] as const

/** Gamas reais de disjuntores-motor Schneider TeSys GV2ME (IEC 60947-2 / 60947-4-1). */
export interface MotorBreakerRange {
  code: string
  rangeA: string
  minA: number
  maxA: number
  defaultInA: number
  magneticA: number
}

export const GV2ME_RANGES: readonly MotorBreakerRange[] = [
  { code: 'GV2ME05', rangeA: '0,63 - 1 A', minA: 0.63, maxA: 1, defaultInA: 1, magneticA: 13 },
  { code: 'GV2ME06', rangeA: '1 - 1,6 A', minA: 1, maxA: 1.6, defaultInA: 1.6, magneticA: 22.5 },
  { code: 'GV2ME07', rangeA: '1,6 - 2,5 A', minA: 1.6, maxA: 2.5, defaultInA: 2.5, magneticA: 33.5 },
  { code: 'GV2ME08', rangeA: '2,5 - 4 A', minA: 2.5, maxA: 4, defaultInA: 4, magneticA: 51 },
  { code: 'GV2ME10', rangeA: '4 - 6,3 A', minA: 4, maxA: 6.3, defaultInA: 6.3, magneticA: 78 },
  { code: 'GV2ME14', rangeA: '6 - 10 A', minA: 6, maxA: 10, defaultInA: 10, magneticA: 138 },
  { code: 'GV2ME16', rangeA: '9 - 14 A', minA: 9, maxA: 14, defaultInA: 14, magneticA: 170 },
  { code: 'GV2ME20', rangeA: '13 - 18 A', minA: 13, maxA: 18, defaultInA: 18, magneticA: 223 },
  { code: 'GV2ME21', rangeA: '17 - 23 A', minA: 17, maxA: 23, defaultInA: 23, magneticA: 327 },
  { code: 'GV2ME22', rangeA: '20 - 25 A', minA: 20, maxA: 25, defaultInA: 25, magneticA: 327 },
  { code: 'GV2ME32', rangeA: '24 - 32 A', minA: 24, maxA: 32, defaultInA: 32, magneticA: 416 },
]

/** Gamas reais Eaton / Moeller PKZM0 / PKZM C (IEC/EN 60947-4-1). */
export const PKZM_RANGES: readonly MotorBreakerRange[] = [
  { code: 'PKZM C-1', rangeA: '0,63 - 1 A', minA: 0.63, maxA: 1, defaultInA: 1, magneticA: 14 },
  { code: 'PKZM C-1,6', rangeA: '1 - 1,6 A', minA: 1, maxA: 1.6, defaultInA: 1.6, magneticA: 22 },
  { code: 'PKZM C-2,5', rangeA: '1,6 - 2,5 A', minA: 1.6, maxA: 2.5, defaultInA: 2.5, magneticA: 35 },
  { code: 'PKZM C-4', rangeA: '2,5 - 4 A', minA: 2.5, maxA: 4, defaultInA: 4, magneticA: 56 },
  { code: 'PKZM C-6,3', rangeA: '4 - 6,3 A', minA: 4, maxA: 6.3, defaultInA: 6.3, magneticA: 88 },
  { code: 'PKZM C-10', rangeA: '6,3 - 10 A', minA: 6.3, maxA: 10, defaultInA: 10, magneticA: 140 },
  { code: 'PKZM C-16', rangeA: '10 - 16 A', minA: 10, maxA: 16, defaultInA: 16, magneticA: 224 },
  { code: 'PKZM C-20', rangeA: '16 - 20 A', minA: 16, maxA: 20, defaultInA: 20, magneticA: 280 },
  { code: 'PKZM C-25', rangeA: '20 - 25 A', minA: 20, maxA: 25, defaultInA: 25, magneticA: 350 },
  { code: 'PKZM C-32', rangeA: '25 - 32 A', minA: 25, maxA: 32, defaultInA: 32, magneticA: 448 },
]

/** Opções nominais para descarregadores de sobretensão (DPS) WEG SPW. */
export const SPW02_UC_OPTIONS = [175, 275, 320, 460] as const
export const SPW02_IMAX_OPTIONS = [12, 20, 45, 60] as const
export const SPW12_UC_OPTIONS = [600, 1000, 1040, 1200] as const
export const SPW12_IMAX_OPTIONS = [20, 40] as const

export type ProtectionControlKind = 'mcb' | 'rcd' | 'fuseHolder' | 'fuse' | 'motorBreaker' | 'ecb' | 'spd'

export function protectionControlKindOf(type: ComponentType): ProtectionControlKind | null {
  switch (type) {
    case 'breaker1p':
    case 'breaker2p':
    case 'breaker3p':
    case 'breaker4p':
    case 'breakerSteckSdC25':
      return 'mcb'
    case 'residualBreakerHagerCfc225p':
    case 'residualBreaker':
      return 'rcd'
    case 'fuseHolderSchneiderDf101v':
    case 'fuseHolderSchneiderDf81n':
    case 'fuseHolderSchneiderDf103nv':
    case 'fuseHolder':
      return 'fuseHolder'
    case 'fuse':
      return 'fuse'
    case 'motorBreakerSchneiderGv2me':
    case 'motorBreakerPkzmC10':
    case 'motorBreaker':
      return 'motorBreaker'
    case 'phoenixEcb3000760':
      return 'ecb'
    case 'surgeProtectorWegSpw02':
    case 'surgeProtectorWegSpw12':
    case 'surgeProtector':
      return 'spd'
    default:
      return null
  }
}

/** Chaves de estado geridas pelo painel dedicado `ProtectionControls` (evita duplicação no Inspetor). */
export const PROTECTION_MANAGED_STATE_KEYS = new Set([
  'closed', 'tripped', 'testPressed', 'tripReason',
  'inA', 'curve', 'icn', 'poles', 'ue', 'norm',
  'sensmA', 'rcdType',
  'blown', 'fuseClass',
  'rangeA', 'magnetic',
  'ueDc',
  'failed', 'ucV', 'imaxKa', 'upKv',
])

export function formatAmpPt(value: number): string {
  if (!Number.isFinite(value)) return '16'
  return Number.isInteger(value) ? String(value) : String(value).replace('.', ',')
}

export function formatIcnBox(icn: string): string {
  const num = parseFloat(String(icn).replace(',', '.'))
  if (!Number.isFinite(num) || num <= 0) return '4500'
  return String(Math.round(num * 1000))
}

/** Código comercial Schneider Easy9 EZ9F coerente com polos, curva e corrente nominal. */
export function easy9CatalogCode(poles: number, curve: string, inA: number): string {
  const c = curve === 'B' ? '2' : curve === 'D' ? '5' : '4'
  const amp = String(Math.round(inA)).padStart(2, '0')
  return `EZ9F3${c}${Math.max(1, Math.min(4, poles))}${amp}`
}

/** Código comercial Hager 2P coerente com corrente nominal, sensibilidade e tipo diferencial. */
export function hagerRcdCatalogCode(inA: number, sensmA: number, rcdType: string): string {
  const sensLetter = sensmA >= 300 ? 'F' : sensmA >= 100 ? 'E' : 'D'
  const typeLetter = rcdType === 'A' ? 'A' : rcdType === 'F' ? 'F' : rcdType === 'B' ? 'B' : 'C'
  const amp = String(Math.round(inA)).padStart(2, '0')
  return `C${sensLetter}${typeLetter}2${amp}P`
}

/** Leitura normalizada dos parâmetros nominais de qualquer dispositivo de proteção. */
export function readProtectionRatings(type: ComponentType, rawState?: Record<string, unknown>) {
  const s = rawState ?? {}
  const num = (key: string, fallback: number) => {
    const v = Number(s[key])
    return Number.isFinite(v) && v > 0 ? v : fallback
  }
  const str = (key: string, fallback: string) => {
    const v = typeof s[key] === 'string' ? s[key].trim() : ''
    return v || fallback
  }

  const defaultInA =
    type === 'breaker3p' || type === 'breaker4p' || type === 'breakerSteckSdC25' || type === 'residualBreakerHagerCfc225p' ? 25
    : type === 'residualBreaker' ? 40
    : type === 'fuseHolderSchneiderDf101v' || type === 'fuseHolderSchneiderDf103nv' ? 32
    : type === 'fuseHolderSchneiderDf81n' ? 16
    : type === 'fuse' ? 6
    : type === 'fuseHolder' ? 2
    : type === 'motorBreakerPkzmC10' || type === 'motorBreakerSchneiderGv2me' ? 10
    : type === 'motorBreaker' ? 6.3
    : type === 'phoenixEcb3000760' ? 1
    : 16

  const defaultCurve = type === 'motorBreakerPkzmC10' || type === 'motorBreaker' ? 'D' : 'C'
  const defaultIcn = type === 'breakerSteckSdC25' ? '3 kA' : type === 'breaker4p' ? '6 kA' : '4,5 kA'
  const defaultSens = type === 'residualBreakerHagerCfc225p' ? 300 : 30
  const defaultPoles =
    type === 'breaker2p' || type === 'residualBreakerHagerCfc225p' || type === 'fuseHolderSchneiderDf81n' ? 2
    : type === 'breaker3p' || type === 'motorBreaker' || type === 'motorBreakerPkzmC10' || type === 'motorBreakerSchneiderGv2me' ? 3
    : type === 'breaker4p' || type === 'residualBreaker' || type === 'fuseHolderSchneiderDf103nv' ? 4
    : 1

  const inA = num('inA', defaultInA)
  const curve = str('curve', defaultCurve).toUpperCase()
  const icn = str('icn', defaultIcn)
  const sensmA = num('sensmA', defaultSens)
  const rcdType = str('rcdType', 'AC').toUpperCase()
  const fuseClass = str('fuseClass', 'gG')
  const poles = num('poles', defaultPoles)
  const defaultRange = type === 'motorBreakerSchneiderGv2me' ? '6 - 10 A' : '6,3 - 10 A'
  const rangeA = str('rangeA', defaultRange)
  const ueDc = str('ueDc', '24 V DC')
  const ucV = num('ucV', type === 'surgeProtectorWegSpw12' ? 1000 : 275)
  const imaxKa = num('imaxKa', type === 'surgeProtectorWegSpw12' ? 40 : 20)
  const upKv = num('upKv', type === 'surgeProtectorWegSpw12' ? 3.8 : 1.5)
  const closed = s.closed !== undefined ? Boolean(s.closed) : true
  const tripped = Boolean(s.tripped)
  const blown = Boolean(s.blown)
  const failed = Boolean(s.failed)
  const testPressed = Boolean(s.testPressed)
  const tripReason = str('tripReason', '')

  return {
    inA, curve, icn, sensmA, rcdType, fuseClass, poles, rangeA, ueDc, ucV, imaxKa, upKv,
    closed, tripped, blown, failed, testPressed, tripReason,
  }
}

/** Etiqueta curta do calibre atual (para Esquema 2D e cabeçalhos). */
export function formatProtectionBadge(c: Pick<ElectricalComponent, 'type' | 'state'>): string | null {
  const kind = protectionControlKindOf(c.type)
  if (!kind) return null
  const r = readProtectionRatings(c.type, c.state)
  switch (kind) {
    case 'mcb':
      return `${r.curve}${formatAmpPt(r.inA)}`
    case 'rcd':
      return `${formatAmpPt(r.inA)}A · ${r.sensmA}mA ${r.rcdType}`
    case 'fuseHolder':
    case 'fuse':
      return `${formatAmpPt(r.inA)}A ${r.fuseClass}${r.blown ? ' · FUND.' : ''}`
    case 'motorBreaker':
      return `${formatAmpPt(r.inA)}A (${r.rangeA.replace(/\s+/g, '')})`
    case 'ecb':
      return `${formatAmpPt(r.inA)}A · ${r.ueDc.replace(' ', '')}`
    case 'spd':
      return c.type === 'surgeProtectorWegSpw12'
        ? `${r.ucV}Vdc · ${r.imaxKa}kA`
        : c.type === 'surgeProtectorWegSpw02'
          ? `${r.ucV}V~ · ${r.imaxKa}kA`
          : `Up ${formatAmpPt(r.upKv)}kV`
  }
}

/** Verifica se um modelo com serigrafia de fábrica (Steck SD C25, PKZM C-10) teve o calibre alterado. */
export function hasCustomRatingOverride(type: ComponentType, rawState?: Record<string, unknown>): boolean {
  const r = readProtectionRatings(type, rawState)
  if (type === 'breakerSteckSdC25') return r.inA !== 25 || r.curve !== 'C' || r.icn !== '3 kA'
  if (type === 'motorBreakerPkzmC10') return r.inA !== 10 || r.rangeA !== '6,3 - 10 A'
  return false
}
