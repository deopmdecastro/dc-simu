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
let motorGain: GainNode | null = null
let motorFilter: BiquadFilterNode | null = null
let lastClickAt = 0
let motorWanted = false
let motorIntensity = 0

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

/** Clique / clack de manobra. `kind` muda o timbre. */
export function playClick(kind: ClickKind = 'button'): void {
  if (!enabled) return
  const now = performance.now()
  if (now - lastClickAt < CLICK_COOLDOWN_MS) return
  lastClickAt = now
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
      // Clack mecânico mais grave (disjuntor / seccionador).
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
      // Botão de comando: clique curto e limpo.
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
    motorGain?.disconnect()
    motorFilter?.disconnect()
  } catch { /* ignore */ }
  motorOsc = null
  motorGain = null
  motorFilter = null
  motorWanted = false
  motorIntensity = 0
}

/**
 * Zumbido contínuo do motor. `on` liga/desliga; `intensity` 0..1 (rpmVisual).
 * Um único oscilador partilhado — vários motores em marcha reforçam a intensidade.
 */
export function setMotorHum(on: boolean, intensity = 0.7): void {
  if (!enabled) {
    if (motorOsc) stopMotorHum()
    return
  }
  motorWanted = on
  motorIntensity = Math.max(0, Math.min(1, intensity))
  if (!on) {
    stopMotorHum()
    return
  }
  const audio = ensureCtx()
  if (!audio) return
  try {
    if (!motorOsc) {
      motorOsc = audio.createOscillator()
      motorGain = audio.createGain()
      motorFilter = audio.createBiquadFilter()
      motorOsc.type = 'sawtooth'
      motorFilter.type = 'lowpass'
      motorFilter.frequency.value = 280
      motorFilter.Q.value = 0.6
      motorOsc.connect(motorFilter)
      motorFilter.connect(motorGain)
      motorGain.connect(audio.destination)
      motorGain.gain.value = 0.0001
      motorOsc.frequency.value = 48
      motorOsc.start()
    }
    const t = audio.currentTime
    const level = 0.012 + motorIntensity * 0.028
    const freq = 42 + motorIntensity * 28
    motorOsc.frequency.setTargetAtTime(freq, t, 0.15)
    motorFilter!.frequency.setTargetAtTime(220 + motorIntensity * 160, t, 0.2)
    motorGain!.gain.setTargetAtTime(level, t, 0.12)
  } catch {
    stopMotorHum()
  }
}

/** Atualiza o zumbido a partir da lista de componentes (chamar após recompute). */
export function syncMotorHumFromComponents(
  components: Array<{ type: string; state: Record<string, unknown> }>,
): void {
  let best = 0
  for (const c of components) {
    if (c.type !== 'motor3ph' && c.type !== 'motor1ph') continue
    if (!c.state.running) continue
    const rpm = Number(c.state.rpmVisual ?? 0.75)
    best = Math.max(best, Number.isFinite(rpm) ? rpm : 0.75)
  }
  if (best > 0.02) setMotorHum(true, best)
  else setMotorHum(false)
}

/** Desliga tudo (mudança de projeto, unmount). */
export function silenceAll(): void {
  stopMotorHum()
}
