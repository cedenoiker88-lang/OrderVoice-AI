import { savePhoneClip, telephoneWavFromPcm24 } from "@/lib/phone-audio";

let attemptedRequests = 0;
let attemptedCharacters = 0;
const MAX_REQUESTS_PER_RUN = 50;
const MAX_CHARACTERS_PER_RUN = 12_000;
const MAX_CHARACTERS_PER_LINE = 480;

/**
 * Opt-in de voz. La lógica de pedidos sigue siendo la misma (Ollama + reglas).
 * Cada síntesis se solicita antes de entregar el TwiML para poder hacer fallback
 * seguro a <Say> si OpenAI falla o tarda demasiado.
 *
 * NOTA: gpt-4o-mini-tts está deprecado y dejará de estar disponible
 * el 6 de enero de 2027. El siguiente paso será Realtime 2.1 mini.
 */
export async function makePhoneAudioUrl(text: string, maxWaitMs?: number, asyncJob = false): Promise<string | null> {
  if (process.env.ORDERVOICE_TTS_PROVIDER !== "openai") return null;
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const base = process.env.TWILIO_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (!apiKey || !base?.startsWith("https://")) {
    console.warn("[OrderVoice voz] Falta OPENAI_API_KEY o TWILIO_PUBLIC_BASE_URL; se usa voz de Twilio.");
    return null;
  }

  const input = text.trim().slice(0, MAX_CHARACTERS_PER_LINE);
  if (!input) return null;
  if (attemptedRequests >= MAX_REQUESTS_PER_RUN ||
      attemptedCharacters + input.length > MAX_CHARACTERS_PER_RUN) {
    console.warn("[OrderVoice voz] Límite de síntesis por ejecución alcanzado; se usa voz de Twilio.");
    return null;
  }
  attemptedRequests++;
  attemptedCharacters += input.length;

  // Al saludo se le da prioridad con audio pregrabado. Para respuestas
  // dinámicas damos algo más de tiempo a OpenAI, pero dejamos margen
  // antes del máximo de 15 s del webhook de voz de Twilio.
  const setting = Number(process.env.ORDERVOICE_TTS_TIMEOUT_MS);
  const configuredTimeout = asyncJob ? 25_000 :
    Number.isFinite(setting) && setting >= 1000
      ? Math.max(1000, Math.min(7000, Math.floor(setting))) : 6500;
  // Evita pedir síntesis si el tiempo restante de Twilio no es suficiente.
  const timeout = maxWaitMs === undefined ? configuredTimeout
    : Math.min(configuredTimeout, Math.floor(maxWaitMs));
  if (timeout < 900) {
    console.info("[OrderVoice voz] Se usa respaldo Twilio Say por presupuesto de tiempo telefónico.");
    return null;
  }
  const started = Date.now();
  try {
    const result = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: "coral",
        input,
        instructions: "Pronuncia exactamente el texto recibido. Habla en español latinoamericano claro, con estilo femenino, cálido y profesional de atención al cliente. Usa una entonación natural, firme y muy inteligible por teléfono. No añadas palabras ni cambies cantidades.",
        response_format: "pcm",
        speed: 1
      }),
      signal: AbortSignal.timeout(timeout),
      cache: "no-store"
    });
    if (!result.ok) {
      console.warn("[OrderVoice voz] OpenAI no disponible, se usa Twilio Say.", {
        httpStatus: result.status,
        durationMs: Date.now() - started
      });
      return null;
    }
    const pcm = Buffer.from(await result.arrayBuffer());
    const wav = telephoneWavFromPcm24(pcm);
    const id = savePhoneClip(wav);
    console.info("[OrderVoice voz] OpenAI Play listo", {
      durationMs: Date.now() - started,
      format: "WAV mono 8 kHz"
    });
    return `${base}/api/telephony/audio?id=${id}`;
  } catch (error) {
    const label = error instanceof Error ? error.name : "Error";
    console.warn("[OrderVoice voz] Se activó respaldo Twilio Say.", {
      reason: label,
      durationMs: Date.now() - started,
      timeoutMs: timeout
    });
    return null;
  }
}
