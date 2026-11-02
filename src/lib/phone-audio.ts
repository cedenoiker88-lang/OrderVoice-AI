import { randomBytes } from "node:crypto";

type Clip = { wav: Buffer; expiresAt: number };
const clips = new Map<string, Clip>();
const TTL_MS = 5 * 60_000;
const MAX_CLIPS = 32;
const SAMPLE_RATE = 8_000;

/** Convierte PCM16 mono a 24 kHz en WAV PCM16 mono a 8 kHz.
 * Filtra frecuencias altas antes de reducir la frecuencia de muestreo,
 * normaliza a aproximadamente -18 dBFS RMS y limita el pico a -1 dBFS.
 * No usa ffmpeg ni expone el audio o el texto en una URL pública.
 */
export function telephoneWavFromPcm24(pcm: Buffer): Buffer {
  if (pcm.length < 480 || pcm.length % 2 !== 0 || pcm.length > 4_800_000) {
    throw new Error("PCM de OpenAI inválido o demasiado grande");
  }
  const n24 = pcm.length / 2;
  const n8 = Math.floor(n24 / 3);
  const samples = new Int16Array(n24);
  for (let i = 0; i < n24; i++) samples[i] = pcm.readInt16LE(i * 2);

  // Filtro FIR de 25 coeficientes: paso bajo con ventana Hamming.
  const coefficients: number[] = [];
  const radius = 12;
  const cutoff = 0.15; // ciclos/muestra a 24 kHz: < 4 kHz
  let sum = 0;
  for (let k = -radius; k <= radius; k++) {
    const sinc = k === 0 ? 2 * cutoff :
      Math.sin(2 * Math.PI * cutoff * k) / (Math.PI * k);
    const window = 0.54 + 0.46 * Math.cos(Math.PI * k / radius);
    const weight = sinc * window;
    coefficients.push(weight);
    sum += weight;
  }
  const filtered = new Float64Array(n8);
  let power = 0;
  let peak = 0;
  for (let out = 0; out < n8; out++) {
    const center = out * 3;
    let value = 0;
    for (let k = -radius; k <= radius; k++) {
      const index = Math.max(0, Math.min(n24 - 1, center + k));
      value += samples[index] * coefficients[k + radius];
    }
    const normalized = value / (sum * 32768);
    filtered[out] = normalized;
    power += normalized * normalized;
    peak = Math.max(peak, Math.abs(normalized));
  }

  const rms = Math.sqrt(power / n8);
  const targetRms = Math.pow(10, -18 / 20);
  const maxPeak = Math.pow(10, -1 / 20);
  const gain = rms > 0.001 && peak > 0.001
    ? Math.min(3.2, targetRms / rms, maxPeak / peak)
    : 1;

  const dataSize = n8 * 2;
  const wav = Buffer.allocUnsafe(44 + dataSize);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); // PCM sin compresión
  wav.writeUInt16LE(1, 22); // mono
  wav.writeUInt32LE(SAMPLE_RATE, 24);
  wav.writeUInt32LE(SAMPLE_RATE * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < n8; i++) {
    const s = Math.max(-32768, Math.min(32767, Math.round(filtered[i] * gain * 32767)));
    wav.writeInt16LE(s, 44 + i * 2);
  }
  return wav;
}

/** Los enlaces usan un identificador aleatorio de 192 bits, nunca el texto ni la API key.
 * Solo se usa en desarrollo local con ngrok y un único proceso de Next.js.
 */
export function savePhoneClip(wav: Buffer): string {
  const now = Date.now();
  for (const [id, clip] of clips) if (clip.expiresAt < now) clips.delete(id);
  while (clips.size >= MAX_CLIPS) clips.delete(clips.keys().next().value!);
  const id = randomBytes(24).toString("hex");
  clips.set(id, { wav, expiresAt: now + TTL_MS });
  return id;
}

export function readPhoneClip(id: string): Buffer | null {
  if (!/^[0-9a-f]{48}$/.test(id)) return null;
  const entry = clips.get(id);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    clips.delete(id);
    return null;
  }
  return entry.wav;
}
