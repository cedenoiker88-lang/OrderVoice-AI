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
export async function makePhoneAudioUrl(text: string): Promise<string | null> {
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

  // Un timeout breve evita que una llamada de prueba se corte esperando TTS.
  const setting = Number(process.env.ORDERVOICE_TTS_TIMEOUT_MS);
  const timeout = Number.isFinite(setting) && setting >= 1000
    ? Math.max(1000, Math.min(4500, Math.floor(setting))) : 3200;
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
      console.warn("[OrderVoice voz] API de voz no disponible (HTTP " + result.status + "); se usa voz de Twilio.");
      return null;
    }
    const pcm = Buffer.from(await result.arrayBuffer());
    const wav = telephoneWavFromPcm24(pcm);
    const id = savePhoneClip(wav);
    return `${base}/api/telephony/audio?id=${id}`;
  } catch (error) {
    const label = error instanceof Error ? error.name : "Error";
    console.warn("[OrderVoice voz] Síntesis falló o excedió el tiempo (" + label + "); se usa voz de Twilio.");
    return null;
  }
}
