// Tiny synthesized UI sounds for the three celebration moments only
// (claim thunk, unlock chime, rank fanfare). No assets, no network.
// Gated behind a user toggle persisted in localStorage.

const SOUND_KEY = 'knotify:sound'

export function soundEnabled(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== 'off'
  } catch {
    return false
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    window.localStorage.setItem(SOUND_KEY, on ? 'on' : 'off')
  } catch {
    /* no-op */
  }
}

let ctx: AudioContext | null = null
function audio(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(freq: number, start: number, dur: number, gainPeak: number, type: OscillatorType = 'sine') {
  const ac = audio()
  if (!ac) return
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, ac.currentTime + start)
  gain.gain.exponentialRampToValueAtTime(gainPeak, ac.currentTime + start + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur)
  osc.connect(gain).connect(ac.destination)
  osc.start(ac.currentTime + start)
  osc.stop(ac.currentTime + start + dur + 0.05)
}

/** Low soft thunk: a stamp landing on paper. */
export function playThunk() {
  if (!soundEnabled()) return
  tone(140, 0, 0.14, 0.11, 'sine')
  tone(70, 0, 0.2, 0.09, 'sine')
}

/** Two-note chime: quest verified elsewhere in the app. */
export function playChime() {
  if (!soundEnabled()) return
  tone(660, 0, 0.22, 0.05, 'sine')
  tone(990, 0.09, 0.3, 0.04, 'sine')
}

/** Short rising fanfare: rank ceremony. */
export function playFanfare() {
  if (!soundEnabled()) return
  tone(392, 0, 0.28, 0.05, 'triangle')
  tone(523, 0.12, 0.3, 0.05, 'triangle')
  tone(659, 0.24, 0.42, 0.05, 'triangle')
  tone(784, 0.38, 0.6, 0.04, 'sine')
}
