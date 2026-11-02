/**
 * Reproduce el caso informado por teléfono SIN hacer llamadas ni generar TTS:
 * pepperoni familiar -> cambio a hawaiana mediana -> nuevo total.
 * Usa un CallSid aleatorio y firma Twilio válida con credenciales locales.
 */
const { createHmac, randomBytes } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const assert = require("node:assert/strict");
function config() {
  const values = {};
  for (const line of readFileSync(join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z_0-9]*)\s*=\s*(.*?)\s*$/);
    if (match) values[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return values;
}
async function main() {
  const env = config();
  if (!env.TWILIO_AUTH_TOKEN || !env.TWILIO_PUBLIC_BASE_URL) {
    throw Error("Revisa TWILIO_AUTH_TOKEN y TWILIO_PUBLIC_BASE_URL en .env.local.");
  }
  const base = new URL(env.TWILIO_PUBLIC_BASE_URL);
  const url = base.origin + "/api/telephony/twilio";
  const callSid = "CA" + randomBytes(16).toString("hex");
  async function turn(message, phrase, label) {
    const body = new URLSearchParams({ CallSid: callSid });
    if (message !== null) body.set("SpeechResult", message);
    const material = [...body.keys()].sort().reduce((acc, key) => acc + key + body.get(key), url);
    const signature = createHmac("sha1", env.TWILIO_AUTH_TOKEN).update(material).digest("base64");
    const started = performance.now();
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Twilio-Signature": signature,
        "X-OrderVoice-Test-No-TTS": "1"
      },
      body: body.toString(),
      signal: AbortSignal.timeout(12_000)
    });
    const xml = await response.text();
    const ms = Math.round(performance.now() - started);
    assert.equal(response.status, 200, label + " devolvió HTTP " + response.status);
    assert.ok(xml.includes("<Gather"), label + " no conservó la conversación");
    assert.match(xml, phrase, label + " no generó la respuesta correcta");
    console.log("OK: " + label + " → HTTP 200, " + ms + " ms");
  }
  await turn(null, /Hola, soy OrderVoice/, "Saludo inicial");
  await turn("Quiero una pizza de pepperoni familiar", /14,00/, "Pepperoni familiar ($14)");
  await turn("Mejor cámbiala por una pizza hawaiana mediana", /Realicé el cambio solicitado[^<]*10,00/, "Cambio a hawaiana mediana ($10)");
  await turn("¿Cuánto es el total?", /10,00/, "Total después del cambio ($10)");
  await turn("No, mejor cámbiala por una margarita familiar", /13,50/, "Segundo cambio a margarita familiar ($13,50)");
  await turn("Cambia la margarita familiar por una pepperoni mediana", /9,00/, "Cambio con origen y destino explícitos ($9)");
  await turn("¿Cuánto es el total?", /9,00/, "Carrito conserva el último cambio ($9)");
  console.log("OK: conversación completa sin cortes ni duplicados.");
  console.log("No se realizaron llamadas reales ni se generó audio facturable.");
}
main().catch(error => { console.error("FALLO:", error.message); process.exitCode = 1; });
