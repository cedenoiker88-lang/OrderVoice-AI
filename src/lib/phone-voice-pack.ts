import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { savePhoneClip, telephoneWavFromPcm24 } from "@/lib/phone-audio";

/**
 * Sonidos almacenados de forma local, generados antes de llamar.
 * El archivo se busca por hash del texto EXACTO a pronunciar.
 * No se reemplazan respuestas del carrito por grabaciones genéricas:
 * las cantidades/precios siempre deben coincidir con la respuesta.
 */
export function preparedVoiceUrl(text: string): string | null {
  if (process.env.ORDERVOICE_TTS_PROVIDER !== "openai") return null;
  const base = process.env.TWILIO_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (!base?.startsWith("https://")) return null;
  const hash = createHash("sha256").update(text, "utf8").digest("hex");
  const filename = join(process.cwd(), ".ordervoice-cache", "voice-pack", hash + ".wav");
  if (!existsSync(filename)) return null;
  try {
    const wav = readFileSync(filename);
    // PCM16 24 kHz mono, exactamente el formato de /v1/audio/speech.
    if (wav.length < 524 || wav.length > 4_800_044 ||
        wav.toString("ascii", 0, 4) !== "RIFF" ||
        wav.toString("ascii", 8, 12) !== "WAVE" ||
        wav.toString("ascii", 36, 40) !== "data" ||
        wav.readUInt16LE(20) !== 1 ||
        wav.readUInt16LE(22) !== 1 ||
        wav.readUInt32LE(24) !== 24_000 ||
        wav.readUInt16LE(34) !== 16 ||
        wav.readUInt32LE(40) !== wav.length - 44) {
      throw new Error("Audio pregrabado con formato incorrecto");
    }
    const telephone = telephoneWavFromPcm24(wav.subarray(44));
    return base + "/api/telephony/audio?id=" + savePhoneClip(telephone);
  } catch {
    console.warn("[OrderVoice voz] El audio pregrabado no se pudo leer; se usará generación dinámica.");
    return null;
  }
}
