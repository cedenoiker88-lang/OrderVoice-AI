import { randomBytes } from "node:crypto";
import { makePhoneAudioUrl } from "@/lib/phone-tts";

type Job = {
  state: "pending" | "ready" | "fallback";
  audioUrl: string | null;
  text: string;
  actionUrl: string;
  farewell: boolean;
  createdAt: number;
};

const appGlobal = globalThis as typeof globalThis & {
  __ordervoiceVoiceJobs?: Map<string, Job>;
};
const jobs = appGlobal.__ordervoiceVoiceJobs ??
  (appGlobal.__ordervoiceVoiceJobs = new Map<string, Job>());
const JOB_TTL_MS = 90_000;
const MAX_JOBS = 24;

function cleanup(now = Date.now()) {
  for (const [id, entry] of jobs) {
    if (now - entry.createdAt > JOB_TTL_MS) jobs.delete(id);
  }
  while (jobs.size >= MAX_JOBS) jobs.delete(jobs.keys().next().value!);
}

/** Usar solo después de autenticar el webhook firmado o el trial_key válido.
 * El audio se genera en segundo plano dentro del proceso LOCAL de Next.js.
 * No requiere que el webhook espere a OpenAI y mantiene una sola petición
 * facturable por turno. No usar como cola de tareas serverless/producción.
 */
export function beginPhoneVoiceJob(text: string, actionUrl: string, farewell: boolean): string | null {
  if (process.env.ORDERVOICE_TTS_PROVIDER !== "openai" ||
      !process.env.OPENAI_API_KEY?.trim()) return null;
  cleanup();
  const id = randomBytes(24).toString("hex");
  const entry: Job = {
    state: "pending",
    audioUrl: null,
    text: text.slice(0, 700),
    actionUrl,
    farewell,
    createdAt: Date.now()
  };
  jobs.set(id, entry);
  console.info("[OrderVoice voz] Generación asíncrona iniciada.");

  // Promesa intencionalmente viva después del POST; desarrollo local con Next.js.
  void (async () => {
    try {
      const audioUrl = await makePhoneAudioUrl(text, 25_000, true);
      entry.audioUrl = audioUrl;
      entry.state = audioUrl ? "ready" : "fallback";
      console.info("[OrderVoice voz] Generación asíncrona finalizada.", {
        source: audioUrl ? "OpenAI Play" : "Twilio Say",
        durationMs: Date.now() - entry.createdAt
      });
    } catch {
      entry.state = "fallback";
      console.warn("[OrderVoice voz] Generación asíncrona falló; se usa respaldo.");
    }
  })();
  return id;
}

/** El identificador aleatorio de 192 bits actúa como capacidad temporal;
 * jamás usar identificadores secuenciales ni imprimirlos en logs.
 */
export function findPhoneVoiceJob(id: string): Job | null {
  if (!/^[0-9a-f]{48}$/.test(id)) return null;
  const job = jobs.get(id);
  if (!job) return null;
  if (Date.now() - job.createdAt > JOB_TTL_MS) {
    jobs.delete(id);
    return null;
  }
  return job;
}
