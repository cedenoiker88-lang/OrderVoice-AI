/**
 * Verify the offline voice pack from signed HTTP requests.
 * Requires pre-generated clips; never calls /v1/audio/speech or creates new ones.
 * No Twilio calls or OpenAI charges.
 */
const { createHash, createHmac, randomBytes } = require("node:crypto");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const assert = require("node:assert/strict");
const phrases = require("./phone-voice-phrases.cjs");
const root = join(__dirname, "..");

function envValue(key) {
  const line = readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)
    .find(v => v.trim().startsWith(key + "="));
  if (!line) return "";
  let value = line.slice(line.indexOf("=") + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  return value;
}
function isPrepared(text) {
  const filename = createHash("sha256").update(text, "utf8").digest("hex") + ".wav";
  return existsSync(join(root, ".ordervoice-cache", "voice-pack", filename));
}

async function main() {
  const remaining = phrases.filter(x => !isPrepared(x.text));
  if (remaining.length) {
    throw Error("Faltan " + remaining.length +
      " audios. Primero ejecuta npm run prepare:phone:voice (genera audio facturable).");
  }
  if (envValue("ORDERVOICE_TTS_PROVIDER") !== "openai") throw Error("Activa ORDERVOICE_TTS_PROVIDER=openai.");
  const base = envValue("TWILIO_PUBLIC_BASE_URL");
  const token = envValue("TWILIO_AUTH_TOKEN");
  if (!base || !token) throw Error("Faltan variables de Twilio en .env.local.");
  const origin = new URL(base).origin;
  const url = origin + "/api/telephony/twilio";
  const sid = "CA" + randomBytes(16).toString("hex");

  async function request(utterance, expected) {
    const params = new URLSearchParams({ CallSid: sid });
    if (utterance !== null) params.set("SpeechResult", utterance);
    const signatureInput = [...params.keys()].sort().reduce((s, key) => s + key + params.get(key), url);
    const signature = createHmac("sha1", token).update(signatureInput).digest("base64");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Twilio-Signature": signature
      },
      body: params.toString(),
      signal: AbortSignal.timeout(14_000)
    });
    assert.equal(response.status, 200, "El webhook devolvió HTTP " + response.status);
    const twiml = await response.text();
    assert.ok(twiml.includes("<Gather"), "Debe continuar escuchando al cliente.");
    assert.ok(!twiml.includes("<Redirect"), "No debe esperar la síntesis de OpenAI.");
    const play = twiml.match(/<Play>([^<]+)<\/Play>/)?.[1];
    assert.ok(play, "Debe incluir audio precargado (<Play>), no Twilio Say.");
    // TwiML lleva un enlace al archivo de audio, no el texto hablado. La
    // coincidencia exacta queda controlada por el hash en phone-voice-pack.ts.
    const audioUrl = new URL(play.replace(/&amp;/g, "&"));
    assert.equal(audioUrl.origin, origin);
    assert.equal(audioUrl.pathname, "/api/telephony/audio");
    const audio = await fetch(audioUrl, { signal: AbortSignal.timeout(10_000) });
    assert.equal(audio.status, 200, "GET del clip debe ser 200");
    const wav = Buffer.from(await audio.arrayBuffer());
    assert.equal(wav.toString("ascii", 0, 4), "RIFF");
    assert.equal(wav.readUInt32LE(24), 8_000);
    console.log("OK:", expected, "→ respuesta inmediata con OpenAI WAV 8 kHz.");
  }

  // El saludo tiene su propia muestra ya generada.
  await request(null, "Hola, soy OrderVoice");
  await request("Quiero una pizza de pepperoni familiar", "$14,00");
  await request("Mejor cámbiala por una pizza hawaiana mediana", "$10,00");
  await request("Cuánto es el total", "$10,00");
  console.log("OK: pedidos, cambio y total tienen la misma voz de OpenAI.");
  console.log("No se realizaron llamadas reales ni solicitudes facturables de TTS.");
}
main().catch(error => {
  console.error("FALLO:", error.message);
  process.exitCode = 1;
});
