/**
 * Prueba una respuesta de voz real con espera asincrona, sin llamada telefónica.
 * Consume UNA síntesis de OpenAI: no repetir si el servicio está lento.
 * Nunca muestra claves, el enlace de la prueba Twilio ni identificadores de audio.
 */
const { createHmac, randomBytes } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { performance } = require("node:perf_hooks");

function env() {
  const vars = {};
  for (const line of readFileSync(join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match) vars[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return vars;
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
    const form = new URLSearchParams({ CallSid: callSid });
    if (message !== null) form.set("SpeechResult", message);
    const material = [...form.keys()].sort().reduce((a, key) => a + key + form.get(key), url);
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
    return { xml, durationMs: Math.round(performance.now() - start) };
  }

  const greeting = await signedTurn(null);
  if (!greeting.xml.includes("<Gather")) throw Error("No se recibió el saludo.");
  console.log("OK: saludo inicial HTTP 200");
  console.log("Solicitando una respuesta con voz OpenAI (puede consumir créditos API).");

  const start = await signedTurn("Quiero una pizza de pepperoni familiar");
  console.log("OK: webhook contestó en", start.durationMs, "ms.");
  if (start.durationMs > 14_000) throw Error("Respuesta de webhook demasiado lenta.");

  let twiml = start.xml;
  let hops = 0;
  while (!twiml.includes("<Play>") && twiml.includes("<Redirect") && hops < 13) {
    const match = twiml.match(/<Redirect[^>]*>([^<]+)<\/Redirect>/);
    if (!match) throw Error("No se encontró la URL de comprobación de voz.");
    const target = new URL(match[1].replace(/&amp;/g, "&"));
    if (target.origin !== publicUrl.origin ||
        target.pathname !== "/api/telephony/voice-status") {
      throw Error("La URL de seguimiento apunta a un origen o ruta inesperados.");
    }
    // Se simula el ritmo de Twilio sin agotar el servidor con consultas rápidas.
    await new Promise(resolve => setTimeout(resolve, 2700));
    const poll = await fetch(target, { signal: AbortSignal.timeout(9_000) });
    if (!poll.ok) throw Error("Estado de voz HTTP " + poll.status);
    twiml = await poll.text();
    hops++;
  }

  const play = twiml.match(/<Play>([^<]+)<\/Play>/)?.[1];
  if (!play) {
    console.error("NO SE REPRODUJO OPENAI: el audio demoró demasiado o hubo un error.");
    console.error("Consulta los eventos [OrderVoice voz] en la terminal de Next.js.");
    process.exitCode = 1;
    return;
  }
  if (!twiml.includes("<Gather") || !twiml.includes("<Response>")) {
    throw Error("Se generó audio, pero falta el reconocimiento de voz.");
  }
  const clipUrl = new URL(play.replace(/&amp;/g, "&"));
  if (clipUrl.origin !== publicUrl.origin ||
      clipUrl.pathname !== "/api/telephony/audio") throw Error("Origen de audio inesperado.");
  const clip = await fetch(clipUrl, { signal: AbortSignal.timeout(10_000) });
  if (!clip.ok) throw Error("GET audio HTTP " + clip.status);
  const wav = Buffer.from(await clip.arrayBuffer());
  if (wav.toString("ascii", 0, 4) !== "RIFF" ||
      wav.toString("ascii", 8, 12) !== "WAVE" ||
      wav.readUInt32LE(24) !== 8_000) throw Error("Audio no está en WAV de 8 kHz.");

  console.log("OK: Twilio pudo esperar la generación de OpenAI.");
  console.log("OK: respuesta de voz OpenAI con Play, HTTP 200, WAV 8 kHz.");
  console.log("OK: conversación y Gather continúan después del audio.");
  console.log("PRUEBA COMPLETA: ninguna llamada telefónica.");
}
main().catch(error => {
  console.error("FALLO:", error.message);
  process.exitCode = 1;
});
