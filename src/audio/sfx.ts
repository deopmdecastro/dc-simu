/**
 * Efeitos sonoros didáticos (Web Audio) — cliques de manobra e zumbido do motor.
 * Segue o mesmo contrato do bip de continuidade (`catalog/beep.ts`):
 * só toca depois de um gesto do utilizador; falhas são ignoradas.
 */

type ClickKind = 'button' | 'breaker' | 'selector' | 'thermal'

const STORAGE_KEY = 'dc-simu-sfx'
const CLICK_COOLDOWN_MS = 40

let ctx: AudioContext | null = null
let motorOsc: OscillatorNode | null = null
let motorOsc2: OscillatorNode | null = null
let motorGain: GainNode | null = null
let motorFilter: BiquadFilterNode | null = null
let lastClickAt = 0
let motorWanted = false
let motorIntensity = 0
let unlockBound = false

function readEnabled(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === null) return true
    return v !== '0' && v !== 'false' && v !== 'off'
  } catch {
    return true
  }
}

let enabled = typeof window !== 'undefined' ? readEnabled() : true

export function isSfxEnabled(): boolean {
  return enabled
}

export function setSfxEnabled(on: boolean): void {
  enabled = on
  try {
    localStorage.setItem(STORAGE_KEY, on ? '1' : '0')
  } catch { /* private mode */ }
  if (!on) stopMotorHum()
}

function ensureCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** Desbloqueia o AudioContext após gesto do utilizador (necessário no Chrome/Safari). */
export function unlockAudio(): void {
  const audio = ensureCtx()
  if (!audio) return
  if (audio.state === 'suspended') void audio.resume()
  // Tom silencioso de 1 amostra para “acordar” alguns browsers móveis.
  if (!unlockBound) {
    try {
      const buf = audio.createBuffer(1, 1, audio.sampleRate)
      const src = audio.createBufferSource()
      src.buffer = buf
      src.connect(audio.destination)
      src.start(0)
      unlockBound = true
    } catch { /* ignore */ }
  }
}

/** Clique / clack de manobra. `kind` muda o timbre. */
export function playClick(kind: ClickKind = 'button'): void {
  if (!enabled) return
  const now = performance.now()
  if (now - lastClickAt < CLICK_COOLDOWN_MS) return
  lastClickAt = now
  unlockAudio()
  const audio = ensureCtx()
  if (!audio) return
  try {
    const t0 = audio.currentTime
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    const filter = audio.createBiquadFilter()
    filter.type = 'bandpass'
    osc.connect(filter)
    filter.connect(gain)
    gain.connect(audio.destination)

    if (kind === 'breaker') {
      osc.type = 'square'
      osc.frequency.setValueAtTime(180, t0)
      osc.frequency.exponentialRampToValueAtTime(90, t0 + 0.06)
      filter.frequency.value = 400
      filter.Q.value = 1.2
      gain.gain.setValueAtTime(0.0001, t0)
      gain.gain.exponentialRampToValueAtTime(0.09, t0 + 0.008)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09)
      osc.start(t0)
      osc.stop(t0 + 0.1)
    } else if (kind === 'thermal') {
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(320, t0)
      osc.frequency.exponentialRampToValueAtTime(140, t0 + 0.05)
      filter.frequency.value = 700
      filter.Q.value = 0.9
      gain.gain.setValueAtTime(0.0001, t0)
      gain.gain.exponentialRampToValueAtTime(0.07, t0 + 0.006)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07)
      osc.start(t0)
      osc.stop(t0 + 0.08)
    } else if (kind === 'selector') {
      osc.type = 'sine'
      osc.frequency.setValueAtTime(520, t0)
      osc.frequency.exponentialRampToValueAtTime(280, t0 + 0.04)
      filter.frequency.value = 900
      filter.Q.value = 0.7
      gain.gain.setValueAtTime(0.0001, t0)
      gain.gain.exponentialRampToValueAtTime(0.055, t0 + 0.005)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.055)
      osc.start(t0)
      osc.stop(t0 + 0.06)
    } else {
      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, t0)
      osc.frequency.exponentialRampToValueAtTime(420, t0 + 0.03)
      filter.frequency.value = 1400
      filter.Q.value = 0.8
      gain.gain.setValueAtTime(0.0001, t0)
      gain.gain.exponentialRampToValueAtTime(0.05, t0 + 0.004)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.045)
      osc.start(t0)
      osc.stop(t0 + 0.05)
    }

    osc.onended = () => {
      try {
        osc.disconnect()
        filter.disconnect()
        gain.disconnect()
      } catch { /* already disconnected */ }
    }
  } catch {
    /* ignore */
  }
}

function stopMotorHum(): void {
  try {
    motorOsc?.stop()
    motorOsc?.disconnect()
    motorOsc2?.stop()
    motorOsc2?.disconnect()
    motorGain?.disconnect()
    motorFilter?.disconnect()
  } catch { /* ignore */ }
  motorOsc = null
  motorOsc2 = null
  motorGain = null
  motorFilter = null
  motorWanted = false
  motorIntensity = 0
}

/**
 * Zumbido contínuo do motor (dois parciais + filtro).
 * `intensity` 0..1 segue rpmVisual; volume audível em marcha.
 */
export function setMotorHum(on: boolean, intensity = 0.7): void {
  if (!enabled) {
    if (motorOsc) stopMotorHum()
    return
  }
  motorWanted = on
  motorIntensity = Math.max(0, Math.min(1, intensity))
  if (!on || motorIntensity < 0.03) {
    stopMotorHum()
    return
  }
  unlockAudio()
  const audio = ensureCtx()
  if (!audio) return
  try {
    if (!motorOsc || !motorGain || !motorFilter) {
      stopMotorHum()
      motorGain = audio.createGain()
      motorFilter = audio.createBiquadFilter()
      motorOsc = audio.createOscillator()
      motorOsc2 = audio.createOscillator()
      motorOsc.type = 'sawtooth'
      motorOsc2.type = 'triangle'
      motorFilter.type = 'lowpass'
      motorFilter.Q.value = 0.85
      motorOsc.connect(motorFilter)
      motorOsc2.connect(motorFilter)
      motorFilter.connect(motorGain)
      motorGain.connect(audio.destination)
      motorGain.gain.value = 0.0001
      motorOsc.frequency.value = 55
      motorOsc2.frequency.value = 110
      motorOsc.start()
      motorOsc2.start()
    }
    const t = audio.currentTime
    // Fundamental ~48–95 Hz + harmónico; volume até ~0.14 (audível sem saturar).
    const level = 0.035 + motorIntensity * 0.11
    const freq = 48 + motorIntensity * 47
    motorOsc.frequency.setTargetAtTime(freq, t, 0.12)
    motorOsc2!.frequency.setTargetAtTime(freq * 2.02, t, 0.12)
    motorFilter!.frequency.setTargetAtTime(320 + motorIntensity * 420, t, 0.18)
    motorGain!.gain.setTargetAtTime(level, t, 0.1)
  } catch {
    stopMotorHum()
  }
}

/** Atualiza o zumbido a partir da lista de componentes (chamar após cada scan). */
export function syncMotorHumFromComponents(
  components: Array<{ type: string; state: Record<string, unknown> }>,
): void {
  let best = 0
  for (const c of components) {
    if (c.type !== 'motor3ph' && c.type !== 'motor1ph') continue
    const running = !!c.state.running
    const rpm = Number(c.state.rpmVisual ?? 0)
    if (running) {
      // Em marcha: usar rpmVisual, com mínimo para o zumbido ser ouvido logo no arranque.
      const level = Number.isFinite(rpm) && rpm > 0.05 ? rpm : 0.55
      best = Math.max(best, level)
    } else if (Number.isFinite(rpm) && rpm > 0.08) {
      // Desaceleração: ainda ouve-se enquanto o eixo “roda” visualmente.
      best = Math.max(best, rpm * 0.7)
    }
  }
  if (best > 0.04) setMotorHum(true, best)
  else setMotorHum(false)
}

/** Desliga tudo (STOP, mudança de projeto). */
export function silenceAll(): void {
  stopMotorHum()
}
