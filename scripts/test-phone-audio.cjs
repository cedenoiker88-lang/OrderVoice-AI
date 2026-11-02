/**
 * Audio Twilio <Play> pregrabado. Sin llamadas reales ni consumo OpenAI.
 * Usa el WAV local ya existente en .ordervoice-cache/greeting.wav.
 */
const { createHmac, randomBytes } = require("node:crypto");
const { readFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");
function env() {
  const values = {};
  for (const line of readFileSync(join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) values[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return values;
}
async function main() {
  const cfg = env();
  if (cfg.ORDERVOICE_TTS_PROVIDER !== "openai") throw Error("ORDERVOICE_TTS_PROVIDER debe ser openai.");
  if (!existsSync(join(__dirname, "..", ".ordervoice-cache", "greeting.wav"))) {
    throw Error("No existe .ordervoice-cache/greeting.wav. Reutiliza el audio de muestra antes de ejecutar la prueba.");
  }
  if (!cfg.TWILIO_PUBLIC_BASE_URL || !cfg.TWILIO_AUTH_TOKEN) throw Error("Falta la configuración de Twilio.");
  const url = new URL("/api/telephony/twilio", cfg.TWILIO_PUBLIC_BASE_URL).toString();
  const params = new URLSearchParams({ CallSid: "CA" + randomBytes(16).toString("hex") });
  const signature = createHmac("sha1", cfg.TWILIO_AUTH_TOKEN)
    .update([...params.keys()].sort().reduce((s, k) => s + k + params.get(k), url)).digest("base64");
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Twilio-Signature": signature },
    body: params.toString(),
    signal: AbortSignal.timeout(12_000)
  });
  const twiml = await response.text();
  if (!response.ok) throw Error("El webhook devolvió HTTP " + response.status);
  const play = twiml.match(/<Play>([^<]+)<\/Play>/)?.[1];
  if (!play) throw Error("No se recibió <Play> en el saludo. Revisa el archivo WAV y la terminal Next.js.");
  const audioUrl = play.replace(/&amp;/g, "&");
  if (new URL(audioUrl).origin !== new URL(cfg.TWILIO_PUBLIC_BASE_URL).origin) {
    throw Error("El enlace de audio apunta a un dominio inesperado.");
  }
  const wavResponse = await fetch(audioUrl, { signal: AbortSignal.timeout(12_000) });
  if (!wavResponse.ok) throw Error("El endpoint de audio devolvió HTTP " + wavResponse.status);
  if (!(wavResponse.headers.get("content-type") || "").includes("audio/wav")) {
    throw Error("Content-Type de audio incorrecto.");
  }
  const wav = Buffer.from(await wavResponse.arrayBuffer());
  if (wav.subarray(0, 4).toString() !== "RIFF" || wav.subarray(8, 12).toString() !== "WAVE" ||
      wav.readUInt32LE(24) !== 8_000) throw Error("No es un WAV telefónico de 8 kHz.");
  console.log("OK: POST saludo -> HTTP " + response.status);
  console.log("OK: GET audio Twilio Play -> HTTP " + wavResponse.status + " (WAV 8 kHz)");
  console.log("No se hicieron llamadas ni se consumieron créditos de OpenAI.");
}
main().catch(error => {console.error("FALLO:", error.message);process.exitCode = 1;});
