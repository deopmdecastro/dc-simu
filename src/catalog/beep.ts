/** Bip contínuo da continuidade (WebAudio). Só toca depois de um gesto do utilizador (regra do navegador). */
let ctx: AudioContext | null = null
let osc: OscillatorNode | null = null
let gain: GainNode | null = null

export function setBeep(on: boolean) {
  try {
    if (on) {
      if (osc) return
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      ctx = ctx ?? new Ctor()
      if (ctx.state === 'suspended') void ctx.resume()
      osc = ctx.createOscillator(); gain = ctx.createGain()
      osc.type = 'square'; osc.frequency.value = 2400; gain.gain.value = 0.04
      osc.connect(gain); gain.connect(ctx.destination); osc.start()
    } else if (osc) {
      osc.stop(); osc.disconnect(); gain?.disconnect(); osc = null; gain = null
    }
  } catch { osc = null; gain = null }
}
