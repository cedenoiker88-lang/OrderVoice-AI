/**
 * Diagnóstico del webhook telefónico de OrderVoice.
 * Simula dos turnos firmados sin llamar por teléfono ni gastar minutos.
 * Solo usa TWILIO_AUTH_TOKEN en memoria: nunca lo muestra.
 *
 * Ejecutar con npm run test:phone mientras Next.js y ngrok estén activos.
 */
const { createHmac, randomBytes } = require("node:crypto");
const { readFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");

function readEnv() {
  const envFile = join(__dirname, "..", ".env.local");
  if (!existsSync(envFile)) throw Error("No existe .env.local en ordervoice-ai-starter.");
  const env = {};
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const matched = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!matched) continue;
    let value = matched[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[matched[1]] = value;
  }
  return env;
}

function secureUrl(value) {
  const u = new URL(value);
  if (u.protocol !== "https:") throw Error("TWILIO_PUBLIC_BASE_URL debe comenzar con https://");
  if (u.username || u.password || u.search || u.hash || (u.pathname !== "/" && u.pathname !== "")) {
    throw Error("TWILIO_PUBLIC_BASE_URL debe ser solo el dominio HTTPS, sin ruta ni credenciales");
  }
  return u.origin + "/api/telephony/twilio";
}

async function main() {
  const config = readEnv();
  const token = config.TWILIO_AUTH_TOKEN;
  if (!token || token === "TU_TOKEN_PRIVADO" || token.includes("PEGA_AQUI")) {
    throw Error("Configura tu Auth Token real de Twilio en .env.local (no lo compartas).");
  }
  const url = secureUrl(config.TWILIO_PUBLIC_BASE_URL ?? "");
  const sid = "CA" + randomBytes(16).toString("hex");

  async function signedTurn(speech, label, expectGather = true) {
    const form = new URLSearchParams({ CallSid: sid });
    if (speech !== null) form.set("SpeechResult", speech);
    const payload = [...form.keys()].sort().reduce((s, key) => s + key + form.get(key), url);
    const signature = createHmac("sha1", token).update(payload).digest("base64");
    const started = performance.now();
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Twilio-Signature": signature,
          "X-OrderVoice-Test-No-TTS": "1"
        },
        body: form.toString(),
        signal: AbortSignal.timeout(8000)
      });
    } catch (e) {
      throw Error(`No se pudo conectar con ngrok en ${label}. Comprueba npm run dev y ngrok online. (${e.name})`);
    }
    const responseText = await response.text();
    const milliseconds = Math.round(performance.now() - started);
    if (!response.ok) {
      const meanings = { 403: "Firma rechazada: revisa el Auth Token y TWILIO_PUBLIC_BASE_URL.", 503: "Falta configurar el servidor o reiniciarlo después de editar .env.local.", 404: "No se encontró /api/telephony/twilio." };
      throw Error(`${label}: HTTP ${response.status}. ${meanings[response.status] || "Consulta los registros de Next.js."}`);
    }
    if (!responseText.includes("<Response>") || (expectGather && !responseText.includes("<Gather")) || (!expectGather && !responseText.includes("<Hangup"))) {
      throw Error(`${label}: HTTP ${response.status} pero no devolvió las instrucciones TwiML esperadas.`);
    }
    console.log(`OK: ${label} -> HTTP ${response.status}; TwiML de voz en ${milliseconds} ms`);
    return responseText;
  }

  const greeting = await signedTurn(null, "Saludo inicial");
  if (!greeting.includes("Hola, soy OrderVoice")) throw Error("El webhook no devolvió el saludo esperado.");
  const second = await signedTurn("Quiero dos gaseosas", "Pedido hablado de prueba");
  if (!/añadí[^<]*2 unidades de gaseosa 1 litro/i.test(second)) {
    throw Error("El webhook no confirmó las dos gaseosas por su nombre. Comprueba que actualizaste dev/v0.5 y reiniciaste Next.js.");
  }
  const total = await signedTurn("Cuánto es el total", "Consulta del total");
  if (!/total actual es[^<]*5/i.test(total)) {
    throw Error("El carrito no conserva correctamente el total de dos gaseosas ($5).");
  }
  const confirmation = await signedTurn("Confirmo el pedido", "Confirmación", false);
  if (!confirmation.includes("Pedido confirmado")) {
    throw Error("El webhook no finalizó correctamente el pedido de prueba.");
  }
  console.log("OK: firma, saludo, productos por nombre, carrito, total y confirmación.");
  console.log("No se realizaron llamadas telefónicas ni cobros.");
  console.log("Siguiente diagnóstico: buscar en ngrok una petición POST auténtica de Twilio.");
}

main().catch((error) => {
  console.error("FALLO:", error.message);
  process.exitCode = 1;
});
