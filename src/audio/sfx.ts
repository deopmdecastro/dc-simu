import { industrialDeviceTypeOf } from '../electrical/industrialDevices'
import type { ElectricalComponent } from '../types'
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
  if (!on) { stopMotorHum(); stopSounderNodes(); stopOverheatSizzle() }
  else if(sounderWanted)unlockAudio()
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
  if (audio.state !== 'running') void audio.resume().then(updateSounder).catch(() => undefined)
  else updateSounder()
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

// ---------------------------------------------------------------------------
// Efeitos sonoros de Curto-Circuito, Sobreaquecimento e Queima de Condutores
// ---------------------------------------------------------------------------

let sizzleSource: AudioBufferSourceNode | null = null
let sizzleGain: GainNode | null = null
let sizzleHumOsc: OscillatorNode | null = null
let sizzleHumGain: GainNode | null = null
let isSizzling = false

/** Ruído branco sintetizado reutilizável para faíscas e fritura de isolamento */
function createNoiseBuffer(audio: AudioContext, seconds = 1.0): AudioBuffer {
  const sampleRate = audio.sampleRate
  const buffer = audio.createBuffer(1, sampleRate * seconds, sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1
  }
  return buffer
}

/**
 * Detonação de curto-circuito e arco elétrico (estouro seco + zumbido magnético + estalo).
 */
export function playShortCircuitBoom(): void {
  if (!enabled) return
  unlockAudio()
  const audio = ensureCtx()
  if (!audio) return

  try {
    const t0 = audio.currentTime

    // 1. Sub-grave de detonação atmosférica (150Hz -> 28Hz)
    const boomOsc = audio.createOscillator()
    const boomGain = audio.createGain()
    boomOsc.type = 'sawtooth'
    boomOsc.frequency.setValueAtTime(160, t0)
    boomOsc.frequency.exponentialRampToValueAtTime(28, t0 + 0.32)

    boomGain.gain.setValueAtTime(0.0001, t0)
    boomGain.gain.exponentialRampToValueAtTime(0.48, t0 + 0.008)
    boomGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35)

    boomOsc.connect(boomGain)
    boomGain.connect(audio.destination)
    boomOsc.start(t0)
    boomOsc.stop(t0 + 0.36)

    // 2. Ruído de expansão de ar do arco voltaico
    const noiseBuf = createNoiseBuffer(audio, 0.3)
    const noiseSrc = audio.createBufferSource()
    noiseSrc.buffer = noiseBuf
    const noiseFilter = audio.createBiquadFilter()
    noiseFilter.type = 'bandpass'
    noiseFilter.frequency.setValueAtTime(1200, t0)
    noiseFilter.frequency.exponentialRampToValueAtTime(350, t0 + 0.22)
    noiseFilter.Q.value = 1.8

    const noiseGain = audio.createGain()
    noiseGain.gain.setValueAtTime(0.42, t0)
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25)

    noiseSrc.connect(noiseFilter)
    noiseFilter.connect(noiseGain)
    noiseGain.connect(audio.destination)
    noiseSrc.start(t0)
    noiseSrc.stop(t0 + 0.26)

    // 3. Estalidos múltiplos de faíscas metálicas (cobre fundido)
    for (let i = 0; i < 4; i++) {
      const sparkTime = t0 + 0.02 + i * 0.035 + Math.random() * 0.015
      const sparkOsc = audio.createOscillator()
      const sparkGain = audio.createGain()
      sparkOsc.type = 'square'
      sparkOsc.frequency.setValueAtTime(2200 + Math.random() * 1200, sparkTime)
      sparkGain.gain.setValueAtTime(0.12, sparkTime)
      sparkGain.gain.exponentialRampToValueAtTime(0.0001, sparkTime + 0.03)

      sparkOsc.connect(sparkGain)
      sparkGain.connect(audio.destination)
      sparkOsc.start(sparkTime)
      sparkOsc.stop(sparkTime + 0.032)
    }
  } catch {
    /* falha tolerada */
  }
}

/**
 * Inicia ou modula o chiar / fritura contínua de condutor sobreaquecido e queima de isolamento PVC.
 * `intensity`: 0.0 (frio) a 1.0 (incandescência/fumo denso).
 */
export function startOverheatSizzle(intensity = 0.5): void {
  if (!enabled) return
  unlockAudio()
  const audio = ensureCtx()
  if (!audio) return

  try {
    const t0 = audio.currentTime
    const clamped = Math.max(0.05, Math.min(1.0, intensity))

    if (!isSizzling || !sizzleGain) {
      isSizzling = true
      // Gerador de ruído contínuo para a fritura
      const noise = createNoiseBuffer(audio, 2.0)
      sizzleSource = audio.createBufferSource()
      sizzleSource.buffer = noise
      sizzleSource.loop = true

      const filter = audio.createBiquadFilter()
      filter.type = 'highpass'
      filter.frequency.setValueAtTime(2400, t0)

      sizzleGain = audio.createGain()
      sizzleGain.gain.setValueAtTime(0.0001, t0)
      sizzleGain.gain.linearRampToValueAtTime(clamped * 0.18, t0 + 0.1)

      sizzleSource.connect(filter)
      filter.connect(sizzleGain)
      sizzleGain.connect(audio.destination)
      sizzleSource.start(t0)

      // Zumbido eletromagnético de falta (100 Hz = 2º harmónico da rede 50Hz sob corrente extrema)
      sizzleHumOsc = audio.createOscillator()
      sizzleHumOsc.type = 'sawtooth'
      sizzleHumOsc.frequency.setValueAtTime(100, t0)

      const humFilter = audio.createBiquadFilter()
      humFilter.type = 'lowpass'
      humFilter.frequency.setValueAtTime(450, t0)

      sizzleHumGain = audio.createGain()
      sizzleHumGain.gain.setValueAtTime(0.0001, t0)
      sizzleHumGain.gain.linearRampToValueAtTime(clamped * 0.12, t0 + 0.12)

      sizzleHumOsc.connect(humFilter)
      humFilter.connect(sizzleHumGain)
      sizzleHumGain.connect(audio.destination)
      sizzleHumOsc.start(t0)
    } else {
      // Modula volume suavemente
      sizzleGain.gain.setTargetAtTime(clamped * 0.18, t0, 0.1)
      if (sizzleHumGain) sizzleHumGain.gain.setTargetAtTime(clamped * 0.12, t0, 0.1)
    }
  } catch {
    stopOverheatSizzle()
  }
}

/** Interrompe o som de fritura de sobreaquecimento */
export function stopOverheatSizzle(): void {
  if (!isSizzling) return
  isSizzling = false
  try {
    if (sizzleSource) {
      sizzleSource.stop()
      sizzleSource.disconnect()
      sizzleSource = null
    }
    if (sizzleGain) {
      sizzleGain.disconnect()
      sizzleGain = null
    }
    if (sizzleHumOsc) {
      sizzleHumOsc.stop()
      sizzleHumOsc.disconnect()
      sizzleHumOsc = null
    }
    if (sizzleHumGain) {
      sizzleHumGain.disconnect()
      sizzleHumGain = null
    }
  } catch {
    /* tolerado */
  }
}

/** Estalo agudo de isolamento plástico a arrebentar/carbonizar */
export function playWireBurnPop(): void {
  if (!enabled) return
  unlockAudio()
  const audio = ensureCtx()
  if (!audio) return
  try {
    const t0 = audio.currentTime
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(3200, t0)
    osc.frequency.exponentialRampToValueAtTime(600, t0 + 0.04)

    gain.gain.setValueAtTime(0.18, t0)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05)

    osc.connect(gain)
    gain.connect(audio.destination)
    osc.start(t0)
    osc.stop(t0 + 0.055)
  } catch {
    /* tolerado */
  }
}

/** Desliga tudo (STOP, mudança de projeto). */
export function silenceAll(): void {
  stopMotorHum()
  stopOverheatSizzle()
  sounderWanted=false;stopSounderNodes()
}

// Sinalizadores industriais: um tom didático contínuo, não uma medição de dB.
// Nenhum setInterval próprio: o scan decide se existe pelo menos um aparelho ON.
let sounderWanted=false
let sounderOsc:OscillatorNode|null=null
let sounderGain:GainNode|null=null
let sounderFilter:BiquadFilterNode|null=null
function stopSounderNodes():void{
 const osc=sounderOsc,gain=sounderGain,filter=sounderFilter
 const lfo=(osc as unknown as {__lfo?:OscillatorNode}|null)?.__lfo
 sounderOsc=null;sounderGain=null;sounderFilter=null
 try{osc?.stop()}catch{/* já parado */}
 try{lfo?.stop()}catch{/* já parado */}
 osc?.disconnect();lfo?.disconnect();gain?.disconnect();filter?.disconnect()
}
function updateSounder():void{
 if(!sounderWanted||!enabled){stopSounderNodes();return}
 // Não cria nem desbloqueia contexto a partir de um scan automático. Só um
 // contexto já autorizado por gesto (RUN, clique/tecla) pode produzir som.
 if(!ctx||ctx.state!=='running'||sounderOsc)return
 try{
  // Piezo industrial típico (~2.7–3.2 kHz, harmónicos, leve saturado).
  // Tom didático contínuo; não é medição SPL nem gravação do TBY-301.
  const osc=ctx.createOscillator(),filter=ctx.createBiquadFilter(),gain=ctx.createGain()
  const lfo=ctx.createOscillator(),lfoGain=ctx.createGain()
  osc.type='square';osc.frequency.value=2850
  lfo.type='sine';lfo.frequency.value=6.5
  lfoGain.gain.value=35
  lfo.connect(lfoGain);lfoGain.connect(osc.frequency)
  filter.type='bandpass';filter.frequency.value=3200;filter.Q.value=2.8
  gain.gain.setValueAtTime(0,ctx.currentTime);gain.gain.linearRampToValueAtTime(.028,ctx.currentTime+.018)
  osc.connect(filter);filter.connect(gain);gain.connect(ctx.destination)
  sounderOsc=osc;sounderFilter=filter;sounderGain=gain
  osc.start();lfo.start()
  // Guard LFO for stop (attached to osc userData for cleanup)
  ;(osc as unknown as {__lfo?:OscillatorNode}).__lfo=lfo
 }catch{stopSounderNodes()}
}
export function syncIndustrialSounders(components:ElectricalComponent[]):void{
 sounderWanted=components.some(c=>industrialDeviceTypeOf(c)==='buzzerMetaltexTby301'&&!!c.state.powered&&!!c.state.on&&!c.state.dutyLimitReached)
 updateSounder()
}
