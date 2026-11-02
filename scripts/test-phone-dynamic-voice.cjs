/**
 * Prueba un turno REAL de generación de voz sin llamar por teléfono.
 * Hace una petición de síntesis a OpenAI (pequeño consumo de créditos).
 * No imprime claves, cuerpos con datos personales ni URLs secretas.
 */
const { createHmac, randomBytes } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { performance } = require("node:perf_hooks");

function env() {
  const data = {};
  const lines = readFileSync(join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    data[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return data;
}
async function main() {
  const cfg = env();
  if (cfg.ORDERVOICE_TTS_PROVIDER !== "openai") {
    throw Error("ORDERVOICE_TTS_PROVIDER debe ser openai en .env.local.");
  }
  if (!cfg.TWILIO_AUTH_TOKEN || !cfg.TWILIO_PUBLIC_BASE_URL) {
    throw Error("Falta TWILIO_AUTH_TOKEN o TWILIO_PUBLIC_BASE_URL.");
  }
  const publicUrl = new URL(cfg.TWILIO_PUBLIC_BASE_URL);
  if (publicUrl.protocol !== "https:" || !["", "/"].includes(publicUrl.pathname)) {
    throw Error("TWILIO_PUBLIC_BASE_URL debe contener solo el dominio HTTPS.");
  }
  const url = publicUrl.origin + "/api/telephony/twilio";
  const callSid = "CA" + randomBytes(16).toString("hex");

  async function signedTurn(message) {
    const form = new URLSearchParams({CallSid: callSid});
    if (message !== null) form.set("SpeechResult", message);
    const material = [...form.keys()].sort()
      .reduce((value, key) => value + key + form.get(key), url);
    const signature = createHmac("sha1", cfg.TWILIO_AUTH_TOKEN)
      .update(material).digest("base64");
    const start = performance.now();
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Twilio-Signature": signature
      },
      body: form.toString(),
      signal: AbortSignal.timeout(14_000)
    });
    const xml = await response.text();
    if (!response.ok) throw Error("Webhook HTTP " + response.status + ". Revisa Next.js.");
    return {xml, durationMs: Math.round(performance.now() - start)};
  }

  const greeting = await signedTurn(null);
  if (!greeting.xml.includes("<Gather")) throw Error("No se recibió el saludo.");
  console.log("OK: saludo recibido. HTTP 200.");
  console.log("Solicitando UNA respuesta de pedido con audio OpenAI (consume créditos de voz).");
  const turn = await signedTurn("Quiero una pizza de pepperoni familiar");
  console.log("OK: respuesta del pedido HTTP 200 en", turn.durationMs, "ms.");
  const match = turn.xml.match(/<Play>([^<]+)<\/Play>/);
  if (!match) {
    console.log("VOZ DE RESPALDO: Twilio Say. OpenAI no generó a tiempo o falló.");
    console.log("Revisa la terminal npm run dev para ver durationMs/timeoutMs, sin enviar claves.");
    process.exitCode = 1;
    return;
  }
  const audioUrl = match[1].replace(/&amp;/g, "&");
  if (new URL(audioUrl).origin !== publicUrl.origin) throw Error("Origen de audio inesperado.");
  const clip = await fetch(audioUrl, {signal: AbortSignal.timeout(10_000)});
  if (!clip.ok) throw Error("GET del audio devolvió HTTP " + clip.status);
  const wav = Buffer.from(await clip.arrayBuffer());
  if (wav.toString("ascii", 0, 4) !== "RIFF" || wav.readUInt32LE(24) !== 8000) {
    throw Error("Audio no está en WAV mono 8 kHz.");
  }
  console.log("OK: respuesta de OpenAI con Play, WAV 8 kHz, HTTP", clip.status);
  console.log("PRUEBA COMPLETADA. Sin llamadas telefónicas; se solicitó voz de OpenAI una vez.");
}
main().catch(e => {console.error("FALLO:", e.message);process.exitCode = 1;});
