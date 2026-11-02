/**
 * Trial-only webhook dry run. NO phone calls, NO credits.
 * Verifies:
 *  - unsigned POST without secret remains blocked;
 *  - spoofed signature cannot bypass validation via trial secret;
 *  - valid trial secret returns TwiML and retains conversation state.
 */
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { randomBytes } = require("node:crypto");

function env() {
  const map = {};
  for (const line of readFileSync(join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) {
      let value = m[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      map[m[1]] = value;
    }
  }
  return map;
}

async function main() {
  const config = env();
  if (config.TWILIO_TRIAL_MODE !== "enabled" || !/^[a-f0-9]{64}$/i.test(config.TWILIO_TRIAL_WEBHOOK_SECRET || "")) {
    throw Error("Ejecuta antes npm run setup:trial y reinicia Next.js.");
  }
  const root = new URL(config.TWILIO_PUBLIC_BASE_URL);
  if (root.protocol !== "https:" || !["","/"].includes(root.pathname)) {
    throw Error("TWILIO_PUBLIC_BASE_URL debe ser el dominio HTTPS de ngrok.");
  }
  const base = root.origin + "/api/telephony/twilio";
  const url = base + "?trial_key=" + config.TWILIO_TRIAL_WEBHOOK_SECRET;
  const sid = "CA" + randomBytes(16).toString("hex");
  async function request(endpoint, message, extra = {}) {
    const params = new URLSearchParams({CallSid:sid});
    if (message !== null) params.set("SpeechResult", message);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {"Content-Type":"application/x-www-form-urlencoded", "X-OrderVoice-Test-No-TTS":"1", ...extra},
      body: params.toString(),
      signal: AbortSignal.timeout(8000)
    });
    return {status:response.status,body:await response.text()};
  }

  const absent = await request(base, null);
  if (absent.status !== 403) throw Error("SIN PROTECCIÓN: POST sin firma ni clave no fue rechazado.");
  console.log("OK: sin clave ni firma -> HTTP 403");

  const invalid = await request(url, null, {"X-Twilio-Signature":"invalid-signature"});
  if (invalid.status !== 403) throw Error("SIN PROTECCIÓN: una firma incorrecta eludió la verificación.");
  console.log("OK: firma incorrecta -> HTTP 403, incluso con clave de prueba");

  const start = await request(url, null);
  if (start.status !== 200 || !start.body.includes("Hola, soy OrderVoice") ||
      !start.body.includes("<Gather") || !start.body.includes("trial_key=")) {
    throw Error("Fallo en el saludo de modo prueba. HTTP " + start.status);
  }
  console.log("OK: saludo inicial del modo de prueba -> HTTP 200");

  const order = await request(url, "Quiero dos gaseosas");
  if (order.status !== 200 || !/2 unidades de gaseosa 1 litro/i.test(order.body)) {
    throw Error("El pedido no se procesó correctamente en modo prueba. HTTP " + order.status);
  }
  console.log("OK: pedido de dos gaseosas -> HTTP 200");

  const total = await request(url, "Cuánto es el total");
  if (total.status !== 200 || !/total actual es[^<]*5/i.test(total.body)) {
    throw Error("La sesión no conservó el carrito en modo prueba. HTTP " + total.status);
  }
  console.log("OK: total de $5 y sesión conservada -> HTTP 200");
  console.log("PRUEBA COMPLETADA. Ninguna llamada ni créditos consumidos.");
}
main().catch(e => { console.error("FALLO:", e.message); process.exitCode = 1; });
