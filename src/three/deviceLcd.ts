/** Physical display faces, not photographs or firmware emulators.
 * D52: supplied photos 17/18 + YD52-2066 manual, pp. 1–2.
 * KWS: supplied photos 19/20; three existing presentation modes use only the
 * photographed grid and documented kW/PF/total-power fields. No settings,
 * protections, Wi-Fi or per-phase energy are fabricated.
 * ATV: Schneider NVE41295, HMI / four-digit seven-segment local terminal.
 * Geometry, circuit values and authored generic displays remain independent.
 */
export type DeviceLcdProfile = 'd52-2066' | 'kws-306' | 'atv320'
export interface LcdCell {
  id: string
  kind: 'segments' | 'legend'
  text: string
  color: string
  /** Pixel rectangle in the profile's reference plane; never a world position. */
  rect: readonly [number, number, number, number]
  slots?: number
  align?: CanvasTextAlign
}
export interface DeviceLcdFrame {
  profile: DeviceLcdProfile
  width: number
  height: number
  background: string
  powered: boolean
  cells: LcdCell[]
}
export const DEVICE_LCD_SIZE = {
  'd52-2066': { width: 640, height: 520 },
  'kws-306': { width: 640, height: 432 },
  atv320: { width: 512, height: 128 },
} as const
export const DEVICE_LCD_COLORS = {
  background: '#060908', d52Power: '#e5ef36', d52Energy: '#f07936',
  d52Voltage: '#17c9d0', d52Current: '#ed3026', d52Pf: '#18a6e7',
  kwsVoltage: '#3932f3', kwsCurrent: '#f1322b', kwsPower: '#edf137',
  kwsEnergy: '#25d8d4', neutral: '#e5eeeb', atv: '#ed4028',
} as const
const finite = (value: unknown): number | null => {
  if (value === null || value === '' || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Fixed physical digit capacity. Reduce decimals before integer capacity is
 * exceeded, including rounding across 999.99 → 1000.0. Never print NaN, squash
 * an arbitrarily long value, wrap energy, or silently saturate a bad reading.
 */
export function lcdNumber(value: unknown, slots: number, decimals: number, zeroPad = false, signed = false): string {
  const number = finite(value)
  if (number === null || (!signed && number < 0)) return '-'.repeat(slots)
  for (let d = decimals; d >= 0; d--) {
    const text = number.toFixed(d), count = text.replace('.', '').length
    if (count <= slots && /^-?\d+(?:\.\d+)?$/.test(text)) return zeroPad ? text.padStart(text.length + slots - count, '0') : text
  }
  return '-'.repeat(slots)
}
const measurement = (s: Record<string, unknown>, key: string) => s[key] === undefined ? 0 : s[key]

/** Existing didactic Ref/Mon/Conf navigation, with actual four-character
 * spellings. A boolean fault has no diagnostic cause: use dashes rather than
 * inventing an ATV fault code. An explicitly known code can be represented.
 */
export function atv320DisplayText(s: Record<string, unknown>): string {
  if (!s.powered) return ''
  if (s.deviceFault) {
    const code = String(s.faultCode ?? '')
    return /^(?:USF|OSF|OCF|SOF|OLF|OHF|SLF1|SLF2|SCF[1345]|InF[1-9A-F])$/.test(code) ? code : '----'
  }
  const menu = String(s.menu ?? 'ref')
  if (menu === 'mon') return lcdNumber(measurement(s, 'frequencyHz'), 4, 1)
  if (!s.editing) return menu === 'conf' ? 'COnF' : 'rEF-'
  return menu === 'conf' ? lcdNumber(Number(s.rampUpMs ?? 3000) / 1000, 4, 1) : lcdNumber(measurement(s, 'presetHz'), 4, 1)
}

export function deviceLcdFrame(profile: DeviceLcdProfile, s: Record<string, unknown>): DeviceLcdFrame {
  const frame: DeviceLcdFrame = { profile, ...DEVICE_LCD_SIZE[profile], background: DEVICE_LCD_COLORS.background, powered: !!(profile === 'atv320' ? s.powered : s.on), cells: [] }
  if (!frame.powered) return frame
  const segment = (id: string, text: string, color: string, rect: LcdCell['rect'], slots: number) => frame.cells.push({ id, kind: 'segments', text, color, rect, slots })
  const legend = (id: string, text: string, color: string, rect: LcdCell['rect'], align: CanvasTextAlign = 'left') => frame.cells.push({ id, kind: 'legend', text, color, rect, align })
  const C = DEVICE_LCD_COLORS
  if (profile === 'atv320') {
    // HMI local NVE41295: quatro dígitos 7-segmentos + legendas Ref/Mon/Conf / Value Unit.
    // Layout cotado a partir da fotografia do ATV320U04M2C (não firmware real).
    const menu = String(s.menu ?? 'ref')
    const menuColor = (id: string) => menu === id ? C.atv : '#5a6a5a'
    legend('ref', 'Ref', menuColor('ref'), [8, 4, 48, 14], 'center')
    legend('mon', 'Mon', menuColor('mon'), [60, 4, 48, 14], 'center')
    legend('conf', 'Conf', menuColor('conf'), [112, 4, 52, 14], 'center')
    legend('value', 'Value', '#7a8a7a', [380, 4, 60, 14], 'center')
    legend('unit', 'Unit', '#7a8a7a', [450, 4, 48, 14], 'center')
    // Status LEDs textual indicators (CAN / Run / etc. are physical LEDs on the GLB)
    segment('value', atv320DisplayText(s), C.atv, [48, 28, 416, 84], 4)
  } else if (profile === 'd52-2066') {
    segment('power', lcdNumber(measurement(s, 'power'), 5, 1), C.d52Power, [24, 16, 504, 88], 5)
    legend('power-unit', 'W', C.d52Power, [550, 61, 70, 39])
    segment('energy', lcdNumber(measurement(s, 'energy'), 5, 2), C.d52Energy, [24, 142, 504, 88], 5)
    legend('energy-unit', 'kWh', C.d52Energy, [541, 189, 90, 28])
    segment('voltage', lcdNumber(measurement(s, 'voltage'), 4, 1), C.d52Voltage, [15, 303, 277, 68], 4)
    legend('voltage-unit', 'V', C.d52Voltage, [302, 340, 39, 29])
    segment('frequency', lcdNumber(measurement(s, 'frequency'), 3, 1), C.neutral, [362, 303, 196, 68], 3)
    legend('frequency-unit', 'Hz', C.neutral, [571, 342, 64, 26])
    segment('current', lcdNumber(measurement(s, 'current'), 4, 2), C.d52Current, [15, 422, 277, 68], 4)
    legend('current-unit', 'A', C.d52Current, [302, 459, 39, 29])
    segment('powerFactor', lcdNumber(measurement(s, 'powerFactor'), 3, 2), C.d52Pf, [362, 422, 196, 68], 3)
    legend('powerFactor-unit', 'PF', C.d52Pf, [571, 461, 64, 26])
  } else {
    // Preserve the three existing presentation-mode state values and controls.
    // Only real LCD fields are used: 0=kW/energy, 1=PF/energy, 2=kW/total power.
    // This deliberately does not claim to reproduce the product's key firmware.
    const mode = ((Number(s.screenMode) || 0) % 3 + 3) % 3
    legend('voltage-unit', 'V', C.kwsVoltage, [102, 5, 124, 24], 'center')
    legend('current-unit', 'A', C.kwsCurrent, [296, 5, 124, 24], 'center')
    legend('power-unit', mode === 1 ? 'PF' : 'KW', C.kwsPower, [492, 5, 124, 24], 'center')
    for (const [i, phase] of ['A', 'B', 'C'].entries()) {
      const y = 48 + i * 86
      legend('phase-' + phase, phase, C.neutral, [10, y + 31, 24, 23])
      segment('voltage-' + phase, lcdNumber(measurement(s, 'v' + phase), 4, 1), C.kwsVoltage, [42, y, 184, 65], 4)
      segment('current-' + phase, lcdNumber(measurement(s, 'i' + phase), 4, 3), C.kwsCurrent, [242, y, 178, 65], 4)
      const v = finite(measurement(s, 'v' + phase)), a = finite(measurement(s, 'i' + phase)), p = finite(measurement(s, 'p' + phase))
      const pf = v === null || a === null || p === null ? NaN : v > 0 && a > 0 ? Math.min(1, Math.max(0, p * 1000 / (v * a))) : 0
      segment('power-' + phase, mode === 1 ? lcdNumber(pf, 4, 2) : lcdNumber(measurement(s, 'p' + phase), 4, 3), C.kwsPower, [444, y, 184, 65], 4)
    }
    // Runtime measures total energy, not independent phase counters. Label it
    // SUM, never the photograph's A while actually presenting an aggregate.
    legend('total-marker', 'SUM', C.kwsEnergy, [18, 327, 304, 22], 'center')
    const powers = ['pA', 'pB', 'pC'].map(key => finite(measurement(s, key)))
    const totalPower = powers.some(p => p === null) ? NaN : powers.reduce<number>((n, p) => n + p!, 0)
    segment('total', s.switchOn === false ? 'OFF' : lcdNumber(mode === 2 ? totalPower : measurement(s, 'energy'), 7, 3, mode !== 2), C.kwsEnergy, [12, 368, 304, 48], 7)
    if (s.switchOn !== false) legend('total-unit', mode === 2 ? 'kW' : 'kWh', C.kwsEnergy, [322, 399, 46, 14])
    segment('frequency', lcdNumber(measurement(s, 'frequency'), 2, 0), C.neutral, [381, 369, 73, 47], 2)
    legend('frequency-unit', 'Hz', C.neutral, [461, 400, 36, 15])
    segment('temperature', lcdNumber(s.temp, 3, 0, false, true), C.neutral, [506, 369, 90, 47], 3)
    legend('temperature-unit', '°C', C.neutral, [599, 363, 38, 19])
  }
  return frame
}

const SEGMENTS: Readonly<Record<string, string>> = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg',
  '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', ' ': '',
  A: 'abcefg', B: 'cdefg', b: 'cdefg', C: 'adef', c: 'deg', D: 'bcdeg', d: 'bcdeg', E: 'adefg', F: 'aefg',
  H: 'bcefg', h: 'cefg', I: 'bc', i: 'c', L: 'def', n: 'ceg', O: 'abcdef',
  o: 'cdeg', P: 'abefg', r: 'eg', S: 'acdfg', t: 'defg', U: 'bcdef', u: 'cde',
  Y: 'bcdfg', y: 'bcdfg', q: 'abcfg',
}
export const deviceLcdSegments = (char: string): string => SEGMENTS[char] ?? ''

/** Decimal point is attached to the preceding slot, not another full digit.
 * Every numeral and ATV letter is geometry, never a platform-dependent font.
 */
function drawSegments(ctx: CanvasRenderingContext2D, cell: LcdCell): void {
  const [x, y, width, height] = cell.rect, slots = cell.slots ?? 4
  const chars: string[] = [], dots: boolean[] = []
  for (const char of cell.text) {
    if (char === '.') { if (dots.length) dots[dots.length - 1] = true }
    else { chars.push(char); dots.push(false) }
  }
  while (chars.length < slots) { chars.unshift(' '); dots.unshift(false) }
  const slot = width / slots, w = Math.min(height * .57, slot * .75), t = height * .085, gap = t * .22
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip()
  ctx.translate(x, y); ctx.transform(1, 0, -.09, 1, height * .09, 0); ctx.fillStyle = cell.color
  const polygon = (points: number[][]) => { ctx.beginPath(); points.forEach(([a, b], i) => i ? ctx.lineTo(a, b) : ctx.moveTo(a, b)); ctx.closePath(); ctx.fill() }
  for (let i = 0; i < slots; i++) {
    const left = i * slot + slot - w - height * .12, lit = SEGMENTS[chars[i]] ?? ''
    const horizontal = (top: number) => polygon([[left + t, top], [left + w - t, top], [left + w - t / 2, top + t / 2], [left + w - t, top + t], [left + t, top + t], [left + t / 2, top + t / 2]])
    const vertical = (at: number, top: number) => { const h = (height - t) / 2 - gap * 2; polygon([[at + t / 2, top], [at + t, top + t / 2], [at + t, top + h - t / 2], [at + t / 2, top + h], [at, top + h - t / 2], [at, top + t / 2]]) }
    if (lit.includes('a')) horizontal(0)
    if (lit.includes('g')) horizontal((height - t) / 2)
    if (lit.includes('d')) horizontal(height - t)
    if (lit.includes('f')) vertical(left, t / 2 + gap)
    if (lit.includes('b')) vertical(left + w - t, t / 2 + gap)
    if (lit.includes('e')) vertical(left, (height + t) / 2 + gap)
    if (lit.includes('c')) vertical(left + w - t, (height + t) / 2 + gap)
    if (dots[i]) { ctx.beginPath(); ctx.arc(left + w + height * .055, height - t / 2, t * .51, 0, Math.PI * 2); ctx.fill() }
  }
  ctx.restore()
}

export function drawDeviceLcd(canvas: HTMLCanvasElement, frame: DeviceLcdFrame): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = frame.background; ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.scale(canvas.width / frame.width, canvas.height / frame.height)
  for (const cell of frame.cells) {
    if (cell.kind === 'segments') { drawSegments(ctx, cell); continue }
    const [x, y, w, h] = cell.rect, align = cell.align ?? 'left'
    ctx.fillStyle = cell.color; ctx.font = `600 ${h}px Arial, sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle'
    ctx.fillText(cell.text, align === 'center' ? x + w / 2 : align === 'right' ? x + w : x, y + h / 2, w)
  }
  ctx.restore()
}
