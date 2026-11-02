/**
 * Verify Twilio credentials WITHOUT printing the token or placing phone calls.
 * Run: npm run verify:twilio
 * Requires TWILIO_AUTH_TOKEN in .env.local and prompts for the Account SID.
 */
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { createInterface } = require("node:readline/promises");

function tokenFromLocalEnv() {
  const file = join(__dirname, "..", ".env.local");
  if (!existsSync(file)) throw new Error("No se encontró .env.local.");
  const lines = readFileSync(file, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*TWILIO_AUTH_TOKEN\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const v = match[1].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      return v.slice(1, -1);
    }
    return v;
  }
  throw new Error("Falta TWILIO_AUTH_TOKEN en .env.local.");
}

async function main() {
  const token = tokenFromLocalEnv();
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  let sid;
  try {
    sid = (await terminal.question("Copia aquí el Account SID de Twilio (empieza por AC): ")).trim();
  } finally {
    terminal.close();
  }
  if (!/^AC[a-f0-9]{32}$/i.test(sid)) {
    throw new Error("Account SID no válido. Debe empezar por AC y contener 34 caracteres.");
  }
  const url = "https://api.twilio.com/2010-04-01/Accounts/" + encodeURIComponent(sid) + ".json";
  let response;
  try {
    response = await fetch(url, {
      headers: { Authorization: "Basic " + Buffer.from(sid + ":" + token).toString("base64") },
      redirect: "error",
      signal: AbortSignal.timeout(12000)
    });
  } catch (e) {
    throw new Error("No se pudo contactar la API de Twilio. Comprueba Internet. (" + e.name + ")");
  }
  if (response.status === 200) {
    const data = await response.json();
    if (data.sid !== sid) throw new Error("Twilio devolvió otra cuenta; verifica la configuración.");
    console.log("OK: El Auth Token de .env.local es válido para el Account SID indicado.");
    console.log("El 403 del webhook apunta entonces a la firma o URL utilizada en la llamada real.");
  } else if (response.status === 401 || response.status === 403) {
    console.log("NO COINCIDE: Twilio rechazó las credenciales de esta cuenta (HTTP " + response.status + ").");
    console.log("Copia de nuevo el Auth Token desde Account Info de ESA cuenta en .env.local; no lo compartas.");
    process.exitCode = 1;
  } else {
    console.log("Twilio respondió HTTP " + response.status + ". No podemos confirmar las credenciales con esta prueba.");
    process.exitCode = 1;
  }
  console.log("No se mostraron tokens, no se hicieron llamadas ni consumieron minutos.");
}

main().catch(e => { console.error("ERROR:", e.message); process.exitCode = 1; });
