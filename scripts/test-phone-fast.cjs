/**
 * Prueba gratuita: frases tal como suelen transcribirse durante una llamada
 * (p. ej., una coma en "pepperoni grande, familiar").
 * Usa firma Twilio válida y "cache-only", nunca crea voz facturable.
 */
const assert = require("node:assert/strict");
const { createHmac, randomBytes } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

function readEnv() {
  const vars = {};
  for (const line of readFileSync(join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) vars[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return vars;
}
async function main() {
  const env = readEnv();
  assert.equal(env.ORDERVOICE_PHONE_FAST_MODE, "enabled",
    "Añade ORDERVOICE_PHONE_FAST_MODE=enabled a .env.local y reinicia Next.js.");
  assert.equal(env.ORDERVOICE_TTS_PROVIDER, "openai", "ORDERVOICE_TTS_PROVIDER debe ser openai.");
  assert.ok(env.TWILIO_AUTH_TOKEN && env.TWILIO_PUBLIC_BASE_URL,
    "Falta la configuración telefónica.");
  const origin = new URL(env.TWILIO_PUBLIC_BASE_URL).origin;
  const url = origin + "/api/telephony/twilio";
  let callId = "CA" + randomBytes(16).toString("hex");

  async function request(message, greeting = false) {
    const form = new URLSearchParams({ CallSid: callId });
    if (message !== null) form.set("SpeechResult", message);
    const signed = [...form.keys()].sort()
      .reduce((value, key) => value + key + form.get(key), url);
    const signature = createHmac("sha1", env.TWILIO_AUTH_TOKEN)
      .update(signed).digest("base64");
    const started = Date.now();
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Twilio-Signature": signature,
        ...(greeting ? { "X-OrderVoice-Test-No-TTS": "1" } :
          { "X-OrderVoice-Test-Cached-Only": "1" })
      },
      body: form.toString(),
      signal: AbortSignal.timeout(12_000)
    });
    const xml = await res.text();
    assert.equal(res.status, 200, "Webhook HTTP " + res.status);
    assert.equal(res.headers.get("x-ordervoice-phone-fast-mode"), "enabled",
      "Next.js no tiene el modo rápido activo; reinicia npm run dev.");
    const duration = Date.now() - started;
    assert.ok(duration < 8_000, "Respuesta demasiado lenta: " + duration + " ms");
    assert.ok(xml.includes("<Gather"), "No se está escuchando el siguiente pedido.");
    assert.ok(!xml.includes("<Redirect"), "El modo rápido no debe esperar generación dinámica.");
    if (!greeting) {
      const match = xml.match(/<Play>([^<]+)<\/Play>/);
      assert.ok(match, "La frase no se seleccionó del paquete de OpenAI; revisa la transcripción.");
      const clip = new URL(match[1].replace(/&amp;/g, "&"));
      assert.equal(clip.origin, origin);
      assert.equal(clip.pathname, "/api/telephony/audio");
      const audio = await fetch(clip, { signal: AbortSignal.timeout(10_000) });
      assert.equal(audio.status, 200, "El audio no está disponible (HTTP " + audio.status + ")");
      const wav = Buffer.from(await audio.arrayBuffer());
      assert.equal(wav.toString("ascii", 0, 4), "RIFF");
      assert.equal(wav.readUInt32LE(24), 8_000);
    }
    return duration;
  }
  const greeting = await request(null, true);
  console.log("OK: saludo preparado para escuchar al cliente en " + greeting + " ms.");
  const one = await request("Quiero una pizza de pepperoni grande, familiar.");
  console.log("OK: pepperoni grande, familiar con coma → OpenAI pregrabado, " + one + " ms.");
  const two = await request("Mejor cámbiala por una pizza hawaiana mediana.");
  console.log("OK: cambio a hawaiana mediana → OpenAI pregrabado, " + two + " ms.");
  const three = await request("¿Cuánto es el total?");
  console.log("OK: consulta total de $10 → OpenAI pregrabado, " + three + " ms.");

  // Segundo escenario independiente: Twilio no transcribió la palabra "familiar",
  // solo "grande". Debe resolver con la misma grabación sin llamar a Ollama.
  callId = "CA" + randomBytes(16).toString("hex");
  await request(null, true);
  const alias = await request("Quiero una pizza de pepperoni grande.");
  console.log("OK: pepperoni grande (sin familiar) → audio pregrabado, " + alias + " ms.");
  console.log("PRUEBA COMPLETADA: modo rápido, sin llamadas ni créditos OpenAI.");
}
main().catch(error => {
  console.error("FALLO:", error.message);
  process.exitCode = 1;
});
