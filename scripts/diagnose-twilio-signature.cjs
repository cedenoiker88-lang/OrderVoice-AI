/**
 * Diagnóstico local y sin llamadas del último webhook REAL capturado por ngrok.
 * Solo compara firmas HMAC; no reenvía peticiones ni muestra datos sensibles.
 *
 * npm run diagnose:phone
 */
const { createHmac, timingSafeEqual } = require("node:crypto");
const { readFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");

function getConfig() {
  const file = join(__dirname, "..", ".env.local");
  if (!existsSync(file)) throw Error("No encuentro .env.local en la carpeta del proyecto.");
  const env = {};
  for (const line of readFileSync(file, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  if (!env.TWILIO_AUTH_TOKEN || !env.TWILIO_PUBLIC_BASE_URL) {
    throw Error("Faltan TWILIO_AUTH_TOKEN o TWILIO_PUBLIC_BASE_URL en .env.local.");
  }
  return env;
}

function getHeader(headers, name) {
  const entry = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return Array.isArray(entry?.[1]) ? entry[1][0] : entry?.[1] || "";
}

function unpack(entry) {
  const request = entry.request || {};
  const base64 = request.raw;
  if (typeof base64 !== "string" || !base64) return null;
  const bytes = Buffer.from(base64, "base64");
  const marker = bytes.indexOf("\r\n\r\n");
  if (marker < 0) return null;
  const head = bytes.subarray(0, marker).toString("utf8");
  const first = head.split("\r\n", 1)[0];
  const match = first.match(/^POST\s+(\S+)\s+HTTP\//);
  if (!match) return null;
  const headers = { ...(request.headers || {}) };
  // Si los encabezados vienen solo en raw, extraerlos sin imprimirlos.
  for (const line of head.split("\r\n").slice(1)) {
    const index = line.indexOf(":");
    if (index > 0 && !getHeader(headers, line.slice(0, index))) {
      headers[line.slice(0, index)] = line.slice(index + 1).trim();
    }
  }
  return {
    path: match[1],
    headers,
    body: bytes.subarray(marker + 4).toString("utf8")
  };
}

function signedExactly(url, params, sig, token) {
  const keys = [...new Set(params.keys())].sort();
  let joined = url;
  for (const name of keys) joined += name + (params.get(name) ?? "");
  const expected = Buffer.from(createHmac("sha1", token).update(joined).digest("base64"));
  const actual = Buffer.from(sig);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function run() {
  const env = getConfig();
  let data;
  try {
    const response = await fetch("http://127.0.0.1:4040/api/requests/http", {
      signal: AbortSignal.timeout(4000)
    });
    if (!response.ok) throw Error("HTTP " + response.status);
    data = await response.json();
  } catch {
    throw Error("No puedo leer el inspector local de ngrok. Mantén ngrok abierto y comprueba http://127.0.0.1:4040.");
  }

  const requests = Array.isArray(data.requests) ? data.requests : [];
  let match;
  for (const record of requests) {
    const packet = unpack(record);
    if (!packet || !packet.path.startsWith("/api/telephony/twilio")) continue;
    const params = new URLSearchParams(packet.body);
    if (!params.has("AccountSid") || !params.has("CallSid")) continue; // descarta pruebas manuales
    match = { packet, params };
    break;
  }
  if (!match) {
    console.log("No encontré en ngrok una llamada real con datos completos.");
    console.log("No pulses otra llamada todavía. Confirma que ngrok no se reinició ni se borró su historial.");
    return;
  }

  const { packet, params } = match;
  const signature = getHeader(packet.headers, "X-Twilio-Signature");
  if (!signature) {
    console.log("La petición guardada no incluye X-Twilio-Signature. El webhook no puede aceptarla.");
    return;
  }
  const publicBase = new URL(env.TWILIO_PUBLIC_BASE_URL);
  const base = publicBase.origin + packet.path;
  const host = getHeader(packet.headers, "Host");
  const candidates = new Map([["URL configurada", base]]);
  if (!packet.path.includes("?")) {
    candidates.set("URL con barra final", base + "/");
  }
  if (host) {
    candidates.set("Host recibido por ngrok (HTTPS)", "https://" + host + packet.path);
    candidates.set("Host recibido por ngrok (HTTP)", "http://" + host + packet.path);
  }

  console.log("Encontré una solicitud real de Twilio en el inspector de ngrok.");
  console.log("La petición contiene " + [...params.keys()].length + " campos de formulario.");
  let matched = false;
  for (const [label, url] of candidates) {
    const ok = signedExactly(url, params, signature, env.TWILIO_AUTH_TOKEN);
    console.log(label + ": " + (ok ? "COINCIDE" : "no coincide"));
    matched ||= ok;
  }

  if (matched) {
    console.log("La firma coincide con alguna variante de URL. No desactives la seguridad.");
    console.log("Con esta información podemos ajustar la URL exacta que valida Next.js.");
  } else {
    console.log("Ninguna firma coincide con el Auth Token configurado.");
    console.log("Lo más probable es que el token no pertenezca a la cuenta Twilio que hizo la llamada, o que la URL firmada sea diferente.");
    console.log("Comprueba el Auth Token de esa misma cuenta y la URL exacta. No compartas el token.");
  }
  console.log("Diagnóstico terminado. No se hizo ninguna llamada ni se reenvió la solicitud.");
}

run().catch(e => { console.error("DIAGNÓSTICO:", e.message); process.exitCode = 1; });
