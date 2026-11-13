import { BrowserVoiceActivity } from "./browser-voice-activity";
import { prepareSpanishCurrencySpeech } from "./spanish-currency-speech";

export type HandsFreePhase = "idle" | "starting" | "listening" | "hearing" | "transcribing" | "processing" | "speaking";

type HandsFreeOptions = {
  onPhase: (phase: HandsFreePhase) => void;
  onTranscript: (text: string) => void;
  onTurn: (text: string, signal: AbortSignal) => Promise<{ reply: string; completed: boolean }>;
  onError: (message: string) => void;
  onStop: () => void;
  preferredVoice: () => SpeechSynthesisVoice | undefined;
};

/**
 * Micrófono Edge → detector local de voz → OpenAI STT → motor IA → TTS Edge.
 * Una activación inicia TODOS los turnos. Solo transcribimos segmentos en los
 * que se detectó voz, nunca ruido/silencio prolongado. No usa Twilio.
 */
export class BrowserHandsFreeSession {
  private active = false;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private recorder: MediaRecorder | null = null;
  private frame = 0;
  private sample: Parameters<AnalyserNode["getFloatTimeDomainData"]>[0] | null = null;
  private resolveCapture: ((audio: Blob | null) => void) | null = null;
  private cancelled = new AbortController();
  private utterance: SpeechSynthesisUtterance | null = null;
  private resolveSpeech: (() => void) | null = null;
  private rejectSpeech: ((error: Error) => void) | null = null;
  private speechWatchdog: ReturnType<typeof setTimeout> | null = null;
  private readonly opts: HandsFreeOptions;

  constructor(options: HandsFreeOptions) {
    this.opts = options;
  }

  get isActive() { return this.active; }

  async start(): Promise<void> {
    if (this.active) return;
    this.active = true;
    this.opts.onPhase("starting");
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined" ||
          !window.AudioContext || !window.speechSynthesis) {
        throw new Error("Necesitas Microsoft Edge con micrófono y audio habilitados.");
      }
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
      if (!mime) throw new Error("Edge no admite ningún formato de grabación compatible.");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      if (!this.active) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      this.context = new AudioContext();
      await this.context.resume();
      if (!this.active) return;
      const source = this.context.createMediaStreamSource(stream);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 2048;
      source.connect(this.analyser);
      this.sample = new Float32Array(this.analyser.fftSize) as Parameters<AnalyserNode["getFloatTimeDomainData"]>[0];

      await this.speak("¡Hola! Soy OrderVoice, tu asistente virtual. ¿Qué deseas pedir hoy?");
      // Un pequeño margen impide que el micrófono capte el final del saludo.
      await this.delay(420);
      while (this.active) {
        const audio = await this.capture(mime);
        if (!this.active) break;
        if (!audio) continue; // No se cobra una transcripción de silencio.
        this.opts.onPhase("transcribing");
        const text = await this.transcribe(audio);
        if (!this.active) break;
        if (!text) continue;
        this.opts.onTranscript(text);
        this.opts.onPhase("processing");
        const result = await this.opts.onTurn(text, this.cancelled.signal);
        if (!this.active) break;
        await this.speak(result.reply);
        if (result.completed) {
          this.stop();
          break;
        }
        await this.delay(420);
      }
    } catch (e) {
      if (this.active && !this.cancelled.signal.aborted) {
        this.opts.onError(e instanceof Error ? e.message : "Falló la conversación de voz.");
      }
      this.stop();
    }
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.cancelled.abort();
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    if (this.recorder) {
      this.recorder.ondataavailable = null;
      this.recorder.onstop = null;
      this.recorder.onerror = null;
      if (this.recorder.state !== "inactive") this.recorder.stop();
      this.recorder = null;
    }
    this.resolveCapture?.(null);
    this.resolveCapture = null;
    if (this.speechWatchdog) clearTimeout(this.speechWatchdog);
    this.speechWatchdog = null;
    if (this.utterance) {
      this.utterance.onend = null;
      this.utterance.onerror = null;
      this.utterance.onstart = null;
      this.utterance = null;
    }
    this.rejectSpeech?.(new Error("Conversación finalizada"));
    this.resolveSpeech = null;
    this.rejectSpeech = null;
    window.speechSynthesis?.cancel();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    void this.context?.close().catch(() => {});
    this.context = null;
    this.analyser = null;
    this.sample = null;
    this.opts.onPhase("idle");
    this.opts.onStop();
  }

  private delay(ms: number): Promise<void> {
    // No genera peticiones y no depende de que el navegador esté enfocado.
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private capture(mime: string): Promise<Blob | null> {
    if (!this.stream || !this.analyser || !this.sample || !this.active) return Promise.resolve(null);
    this.opts.onPhase("listening");
    const analyser = this.analyser;
    const sample = this.sample;
    const detector = new BrowserVoiceActivity(performance.now());
    const chunks: Blob[] = [];
    return new Promise<Blob | null>((resolve, reject) => {
      let settled = false;
      let recorder: MediaRecorder;
      const finish = (value: Blob | null) => {
        if (settled) return;
        settled = true;
        if (this.frame) cancelAnimationFrame(this.frame);
        this.frame = 0;
        this.resolveCapture = null;
        if (this.recorder === recorder) this.recorder = null;
        resolve(value);
      };
      try { recorder = new MediaRecorder(this.stream!, { mimeType: mime }); }
      catch (e) { reject(e); return; }
      this.recorder = recorder;
      this.resolveCapture = finish;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => {
        if (this.frame) cancelAnimationFrame(this.frame);
        this.frame = 0;
        this.resolveCapture = null;
        this.recorder = null;
        if (!settled) {
          settled = true;
          reject(new Error("Falló la grabación del micrófono."));
        }
      };
      recorder.onstop = () => {
        const audio = detector.heardSpeech && this.active
          ? new Blob(chunks, { type: mime }) : null;
        finish(audio && audio.size >= 150 ? audio : null);
      };
      let wasHearing = false;
      const tick = () => {
        if (!this.active || recorder.state !== "recording") return;
        analyser.getFloatTimeDomainData(sample);
        let power = 0;
        for (let i = 0; i < sample.length; i++) power += sample[i] * sample[i];
        const rms = Math.sqrt(power / sample.length);
        const phase = detector.update(rms, performance.now());
        if (phase === "speaking" && !wasHearing) { wasHearing = true; this.opts.onPhase("hearing"); }
        if (phase === "end" || phase === "restart") {
          recorder.stop();
          return;
        }
        this.frame = requestAnimationFrame(tick);
      };
      try {
        recorder.start(250);
        this.frame = requestAnimationFrame(tick);
      } catch (error) {
        this.recorder = null;
        this.resolveCapture = null;
        reject(error);
      }
    });
  }

  private async transcribe(audio: Blob): Promise<string> {
    if (audio.size > 8 * 1024 * 1024) throw new Error("El audio excede 8 MB. Prueba frases más cortas.");
    const form = new FormData();
    form.append("audio", audio, audio.type.includes("mp4") ? "pedido.mp4" : "pedido.webm");
    const response = await fetch("/api/browser-transcribe", {
      method: "POST", body: form, signal: this.cancelled.signal
    });
    const data = await response.json() as { text?: string; error?: string };
    if (!response.ok) throw new Error(data.error || "La API no pudo transcribir este turno.");
    return (data.text || "").trim();
  }

  private speak(text: string): Promise<void> {
    if (!this.active) return Promise.resolve();
    this.opts.onPhase("speaking");
    return new Promise<void>((resolve, reject) => {
      if (!this.active) { resolve(); return; }
      const utterance = new SpeechSynthesisUtterance(prepareSpanishCurrencySpeech(text));
      this.utterance = utterance;
      const voice = this.opts.preferredVoice();
      utterance.lang = voice?.lang || "es-ES";
      if (voice) utterance.voice = voice;
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;
      let finished = false;
      const done = (error?: Error) => {
        if (finished) return;
        finished = true;
        this.utterance = null;
        this.resolveSpeech = null;
        this.rejectSpeech = null;
        if (this.speechWatchdog) clearTimeout(this.speechWatchdog);
        this.speechWatchdog = null;
        error ? reject(error) : resolve();
      };
      this.resolveSpeech = () => done();
      this.rejectSpeech = (error) => done(error);
      utterance.onend = () => done();
      utterance.onerror = (event) => {
        const reason = event.error || "desconocido";
        done(new Error(`Edge no pudo reproducir la voz española (código: ${reason}). Prueba otra voz española en el selector o reinicia Edge.`));
      };
      // Evita un bloqueo infinito cuando Edge no emite el evento onend.
      this.speechWatchdog = setTimeout(() => done(new Error("La voz de Edge dejó de responder.")), 25_000);
      // No llamar a cancel() inmediatamente antes de speak(): Edge puede
      // interpretar esa cancelación como interrupción del nuevo saludo.
      // Los turnos son secuenciales, y stop() ya cancela al finalizar.
      window.speechSynthesis.resume();
      window.speechSynthesis.speak(utterance);
    });
  }
}
