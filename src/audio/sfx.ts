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
let motorOsc3: OscillatorNode | null = null
let motorGain: GainNode | null = null
let motorFilter: BiquadFilterNode | null = null
let lastClickAt = 0
let motorWanted = false
let motorIntensity = 0
let motorLfo: OscillatorNode | null = null
let motorLfoGain: GainNode | null = null
let unlockBound = false
let mobileUnlockBound = false

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


let silentEl: HTMLAudioElement | null = null
/** WAV mudo de 0,1 s (44,1 kHz, 8 bits) em data URI — mantém a sessão de áudio ativa no iOS. */
function silentWavUri(): string {
  const n = 4410
  const b = new Uint8Array(44 + n)
  const w32 = (o: number, v: number) => { b[o] = v & 255; b[o + 1] = (v >> 8) & 255; b[o + 2] = (v >> 16) & 255; b[o + 3] = (v >> 24) & 255 }
  const w16 = (o: number, v: number) => { b[o] = v & 255; b[o + 1] = (v >> 8) & 255 }
  b.set([82, 73, 70, 70], 0); w32(4, 36 + n); b.set([87, 65, 86, 69, 102, 109, 116, 32], 8)
  w32(16, 16); w16(20, 1); w16(22, 1); w32(24, 44100); w32(28, 44100); w16(32, 1); w16(34, 8)
  b.set([100, 97, 116, 97], 36); w32(40, n); b.fill(128, 44)
  let bin = ''
  b.forEach((v) => { bin += String.fromCharCode(v) })
  return 'data:audio/wav;base64,' + btoa(bin)
}

/**
 * iOS trata o Web Audio como som «de ambiente»: fica mudo com o interruptor de silêncio ligado
 * (ou sem som no Safari). Passar a sessão para «playback» (Safari 16.4+) ou reproduzir um
 * <audio> mudo em ciclo (versões antigas) faz os efeitos saírem pelo altifalante.
 */
function routeAudioToPlayback(): void {
  try {
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession
    if (session && session.type !== 'playback') session.type = 'playback'
  } catch { /* não suportado */ }
  try {
    if (!silentEl) {
      silentEl = document.createElement('audio')
      silentEl.src = silentWavUri()
      silentEl.loop = true
      silentEl.setAttribute('playsinline', '')
      silentEl.volume = 0.01
    }
    if (silentEl.paused) void silentEl.play().catch(() => undefined)
  } catch { /* ignore */ }
}

function ensureCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
    }
    if (ctx.state !== 'running') void ctx.resume().catch(() => undefined)
    return ctx
  } catch {
    return null
  }
}

/** Desbloqueia o AudioContext após gesto do utilizador (necessário no Chrome/Safari). */
export function unlockAudio(): void {
  const audio = ensureCtx()
  if (!audio) return
  if (audio.state !== 'running') void audio.resume().catch(() => undefined)
  routeAudioToPlayback()
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

/**
 * Regista os gestos que os browsers móveis aceitam como autorização de áudio.
 * O listener é instalado uma vez e não interfere com os handlers da UI.
 */
export function installAudioUnlockListeners(): () => void {
  if (typeof window === 'undefined' || mobileUnlockBound) return () => undefined
  mobileUnlockBound = true
  const unlock = () => unlockAudio()
  const resumeOnReturn = () => {
    if (document.visibilityState === 'visible') unlockAudio()
  }
  window.addEventListener('pointerdown', unlock, { passive: true })
  window.addEventListener('touchstart', unlock, { passive: true })
  // No iOS só `touchend`/`click` contam como gesto que autoriza o áudio.
  window.addEventListener('touchend', unlock, { passive: true })
  window.addEventListener('click', unlock, { passive: true })
  window.addEventListener('keydown', unlock, { passive: true })
  document.addEventListener('visibilitychange', resumeOnReturn)
  return () => {
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('touchstart', unlock)
    window.removeEventListener('touchend', unlock)
    window.removeEventListener('click', unlock)
    window.removeEventListener('keydown', unlock)
    document.removeEventListener('visibilitychange', resumeOnReturn)
    mobileUnlockBound = false
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
    motorOsc3?.stop()
    motorOsc3?.disconnect()
    motorLfo?.stop()
    motorLfo?.disconnect()
    motorLfoGain?.disconnect()
    motorGain?.disconnect()
    motorFilter?.disconnect()
  } catch { /* ignore */ }
  motorOsc = null
  motorOsc2 = null
  motorOsc3 = null
  motorLfo = null
  motorLfoGain = null
  motorGain = null
  motorFilter = null
  motorWanted = false
  motorIntensity = 0
}

/**
 * Zumbido contínuo do motor — hum realista DRN80 (50Hz rede + 24Hz mecânica).
 * `intensity` 0..1 segue rpmVisual; volume e frequência sincronizados com rotação visual.
 * Três parciais + LFO de amplitude (batimento do rotor) para sincronia com as pás.
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
      motorOsc3 = audio.createOscillator()
      motorLfo = audio.createOscillator()
      motorLfoGain = audio.createGain()
      motorOsc.type = 'sawtooth'
      motorOsc2.type = 'square'
      motorOsc3.type = 'triangle'
      motorLfo.type = 'sine'
      motorFilter.type = 'lowpass'
      motorFilter.Q.value = 0.9
      // LFO modula amplitude para batimento do rotor (24Hz mecânica)
      motorLfo.frequency.value = 8
      motorLfoGain.gain.value = 0.08
      motorLfo.connect(motorLfoGain)
      motorLfoGain.connect(motorGain.gain)
      motorOsc.connect(motorFilter)
      motorOsc2.connect(motorFilter)
      motorOsc3.connect(motorFilter)
      motorFilter.connect(motorGain)
      motorGain.connect(audio.destination)
      motorGain.gain.value = 0.0001
      motorOsc.frequency.value = 85
      motorOsc2.frequency.value = 170
      motorOsc3.frequency.value = 255
      motorOsc.start()
      motorOsc2.start()
      motorOsc3.start()
      motorLfo.start()
    }
    const t = audio.currentTime
    // DRN80: 50Hz rede → 100Hz magnético (2º harmónico), 24Hz mecânico (1435rpm/60)
    // rpmVisual 0..1 mapeia para 60..120Hz fundamental (audível em telemóvel, sem sub-grave perdido)
    const level = 0.03 + Math.pow(motorIntensity, 1.4) * 0.14 // curva logarítmica, mais realista
    const baseFreq = 72 + motorIntensity * 52 // 72→124Hz (50Hz rede + escorregamento)
    const mechFreq = 8 + motorIntensity * 18 // 8→26Hz para LFO (batimento do rotor)
    motorOsc!.frequency.setTargetAtTime(baseFreq, t, 0.14)
    motorOsc2!.frequency.setTargetAtTime(baseFreq * 2.01, t, 0.14) // leve desafinação = batimento
    motorOsc3!.frequency.setTargetAtTime(baseFreq * 3.02, t, 0.14)
    motorFilter!.frequency.setTargetAtTime(750 + motorIntensity * 1100, t, 0.2)
    motorLfo!.frequency.setTargetAtTime(mechFreq, t, 0.25)
    motorLfoGain!.gain.setTargetAtTime(0.04 + motorIntensity * 0.09, t, 0.2)
    // Volume sincronizado com vibração visual: modulação suave com rpm
    motorGain.gain.setTargetAtTime(level, t, 0.12)
    // Arranque: clique de contactor já feito em syncMotorHumFromComponents
  } catch {
    stopMotorHum()
  }
}

let prevMotorRunning = false
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
  const nowRunning = best > 0.04
  if (nowRunning && !prevMotorRunning) {
    // Transiente de arranque: clique do contactor + impulso sonoro
    try { playClick('breaker') } catch {}
  }
  prevMotorRunning = nowRunning
  if (best > 0.04) setMotorHum(true, best)
  else setMotorHum(false)
}

/** Desliga tudo (STOP, mudança de projeto). */
export function silenceAll(): void {
  stopMotorHum()
}
