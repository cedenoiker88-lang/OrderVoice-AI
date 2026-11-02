/**
 * Setup for Twilio Try out Voice ONLY.
 * Saves a random trial-only capability key in .env.local (never in Git).
 * Copies the full Custom TwiML URL to Windows clipboard without printing it.
 * Production continues to require X-Twilio-Signature.
 */
const { readFileSync, writeFileSync, existsSync } = require("node:fs");
const { randomBytes } = require("node:crypto");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const file = join(__dirname, "..", ".env.local");
function readVariable(text, name) {
  const found = text.split(/\r?\n/).find(line => line.trim().startsWith(name + "="));
  if (!found) return null;
  let value = found.slice(found.indexOf("=") + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return value;
}

function main() {
  if (!existsSync(file)) throw Error("No se encontró .env.local en ordervoice-ai-starter.");
  const original = readFileSync(file, "utf8");
  const base = readVariable(original, "TWILIO_PUBLIC_BASE_URL");
  if (!base) throw Error("Primero configura TWILIO_PUBLIC_BASE_URL con tu dirección ngrok HTTPS.");
  const parsed = new URL(base);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search ||
      parsed.hash || (parsed.pathname !== "/" && parsed.pathname !== "")) {
    throw Error("TWILIO_PUBLIC_BASE_URL debe ser solo un dominio HTTPS, sin ruta ni datos extra.");
  }

  const existing = readVariable(original, "TWILIO_TRIAL_WEBHOOK_SECRET");
  const secret = existing && /^[a-f0-9]{64}$/i.test(existing)
    ? existing : randomBytes(32).toString("hex");
  const withoutTrial = original.split(/\r?\n/).filter(line =>
    !/^\s*TWILIO_TRIAL_(?:MODE|WEBHOOK_SECRET)\s*=/.test(line)).join("\n").trimEnd();
  writeFileSync(file,
    withoutTrial + "\n\n# Solo para la demostracion Twilio Try out Voice; no habilitar en produccion.\n" +
    "TWILIO_TRIAL_MODE=enabled\nTWILIO_TRIAL_WEBHOOK_SECRET=" + secret + "\n",
    { mode: 0o600 });

  const url = parsed.origin + "/api/telephony/twilio?trial_key=" + secret;
  if (process.platform === "win32") {
    const result = spawnSync("powershell.exe", ["-NoProfile", "-Command",
      "Set-Clipboard -Value ([Console]::In.ReadToEnd().Trim())"],
      { input: url, encoding: "utf8", windowsHide: true, timeout: 8000 });
    if (result.status === 0) {
      console.log("OK: URL personalizada de prueba copiada al portapapeles.");
      console.log("En Twilio -> Start a call -> Custom TwiML URL, usa Ctrl+V.");
    } else {
      console.log("No se pudo copiar al portapapeles automáticamente.");
      console.log("Puedes copiar la URL desde .env.local combinando TWILIO_PUBLIC_BASE_URL");
      console.log("con /api/telephony/twilio?trial_key= y la clave de prueba.");
    }
  } else {
    console.log("Configuración guardada. Compón la URL con tu dominio,");
    console.log("/api/telephony/twilio?trial_key= y la clave en .env.local.");
  }
  console.log("Reinicia Next.js después de esta modificación de .env.local.");
  console.log("IMPORTANTE: no compartas la URL completa ni la clave en capturas.");
  console.log("Al terminar las pruebas, establece TWILIO_TRIAL_MODE=disabled y reinicia Next.js.");
}

try { main(); } catch (e) { console.error("ERROR:", e.message); process.exitCode = 1; }
