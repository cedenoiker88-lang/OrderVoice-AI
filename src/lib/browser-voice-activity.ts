/**
 * Detector local de voz (VAD sencillo). No envía audio ni utiliza ninguna API.
 * Recibe muestras RMS de Web Audio; ignora el silencio inicial, calibra ruido
 * ambiente y termina el turno cuando el cliente deja de hablar.
 *
 * No sustituye a un VAD profesional: los umbrales se prueban con micrófono real.
 */
export type VoiceFrameAction = "idle" | "speaking" | "end" | "restart";

export class BrowserVoiceActivity {
  private readonly startMs: number;
  private lastFrameMs: number;
  private noiseRms = 0.004;
  private activeRunMs = 0;
  private firstSpeechMs: number | null = null;
  private lastSpeechMs: number | null = null;

  constructor(startMs: number) {
    this.startMs = startMs;
    this.lastFrameMs = startMs;
  }

  get heardSpeech(): boolean {
    return this.firstSpeechMs !== null;
  }

  update(rmsInput: number, nowMs: number): VoiceFrameAction {
    const rms = Number.isFinite(rmsInput) ? Math.max(0, Math.min(1, rmsInput)) : 0;
    const elapsed = Math.max(0, Math.min(80, nowMs - this.lastFrameMs));
    this.lastFrameMs = nowMs;

    // Las primeras muestras sirven para estimar el ruido del equipo.
    if (nowMs - this.startMs < 420) {
      this.noiseRms = this.noiseRms * 0.9 + rms * 0.1;
      return "idle";
    }

    const threshold = Math.min(0.10, Math.max(0.012, this.noiseRms * 2.8 + 0.007));
    const isLoud = rms >= threshold;

    if (this.firstSpeechMs === null) {
      if (nowMs - this.startMs >= 22_000) return "restart";
      if (isLoud) {
        this.activeRunMs += elapsed;
        if (this.activeRunMs >= 145) {
          this.firstSpeechMs = nowMs;
          this.lastSpeechMs = nowMs;
          return "speaking";
        }
      } else {
        this.activeRunMs = 0;
        // Seguir el ruido lentamente, sin aprender una voz como ruido.
        this.noiseRms = this.noiseRms * 0.99 + rms * 0.01;
      }
      return "idle";
    }

    if (isLoud) this.lastSpeechMs = nowMs;
    // 1,1 s permite respiraciones y pausas cortas sin cortar el pedido.
    if (nowMs - (this.lastSpeechMs ?? nowMs) >= 1100 ||
        nowMs - this.firstSpeechMs >= 18_000) return "end";

    return "speaking";
  }
}
