/**
 * Composable que genera sonidos de feedback para el escáner de códigos de barras
 * usando la Web Audio API (sin archivos externos).
 */

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext()
  }
  // Reanudar si está suspendido (política autoplay de navegadores)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume()
  }
  return audioCtx
}

/** Beep corto de confirmación – tono agudo (1000 Hz, 150 ms) */
export function playSuccessBeep(): void {
  try {
    const ctx = getAudioContext()
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(1000, ctx.currentTime)
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)

    oscillator.connect(gain)
    gain.connect(ctx.destination)

    oscillator.start(ctx.currentTime)
    oscillator.stop(ctx.currentTime + 0.15)
  } catch {
    // Silenciar errores de audio para no romper el flujo
  }
}

/** Doble tono grave de error (400 Hz → 300 Hz, ~300 ms) */
export function playErrorBeep(): void {
  try {
    const ctx = getAudioContext()

    // Primer tono
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = 'square'
    osc1.frequency.setValueAtTime(400, ctx.currentTime)
    gain1.gain.setValueAtTime(0.25, ctx.currentTime)
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)
    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    osc1.start(ctx.currentTime)
    osc1.stop(ctx.currentTime + 0.15)

    // Segundo tono (más grave, tras breve pausa)
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = 'square'
    osc2.frequency.setValueAtTime(300, ctx.currentTime + 0.18)
    gain2.gain.setValueAtTime(0.25, ctx.currentTime + 0.18)
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.start(ctx.currentTime + 0.18)
    osc2.stop(ctx.currentTime + 0.35)
  } catch {
    // Silenciar errores de audio
  }
}
