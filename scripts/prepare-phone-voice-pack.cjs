/**
 * Prepara CUATRO respuestas frecuentes fuera de la llamada.
 * Gasta créditos API por cada archivo nuevo. No hace llamadas telefónicas.
 * Guarda WAV PCM16 mono 24 kHz, que el servidor convertirá a 8 kHz al usar.
 * Rerunning skips existing clips. An abort does NOT automatically retry.
 */
const { createHash } = require("node:crypto");
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const phrases = require("./phone-voice-phrases.cjs");
const root = join(__dirname, "..");
const target = join(root, ".ordervoice-cache", "voice-pack");
const listOnly = process.argv.includes("--list");

function envValue(key) {
  const file = join(root, ".env.local");
  if (!existsSync(file)) throw Error("Falta .env.local.");
  const line = readFileSync(file, "utf8").split(/\r?\n/)
    .find(value => value.trim().startsWith(key + "="));
  if (!line) return null;
  let value = line.slice(line.indexOf("=") + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  return value;
}
function filenameFor(text) {
  return join(target, createHash("sha256").update(text, "utf8").digest("hex") + ".wav");
}
function pcm24Wav(pcm) {
  if (!pcm.length || pcm.length % 2 || pcm.length > 4_800_000) {
    throw Error("PCM de OpenAI vacío o de tamaño inesperado.");
  }
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + pcm.length, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(24000, 24);
  wav.writeUInt32LE(48000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(pcm.length, 40);
  pcm.copy(wav, 44);
  return wav;
}

async function main() {
  console.log("Paquete de voz pregrabada OrderVoice AI v0.6:");
  for (const item of phrases) {
    console.log("- " + item.id + ": " + (existsSync(filenameFor(item.text)) ? "LISTO" : "PENDIENTE"));
  }
  const pending = phrases.filter(item => !existsSync(filenameFor(item.text)));
  console.log("Respuestas nuevas por generar:", pending.length);
  if (listOnly || !pending.length) {
    console.log(listOnly ? "Solo consulta: no se generó audio ni se gastaron créditos." :
      "Ya está todo preparado: no se gastaron créditos.");
    return;
  }
  if (process.env.NODE_USE_SYSTEM_CA !== "1") {
    console.warn("RECOMENDACIÓN: usa $env:NODE_USE_SYSTEM_CA=\"1\" antes de esta prueba en Windows.");
  }
  const apiKey = envValue("OPENAI_API_KEY");
  if (!apiKey || !apiKey.startsWith("sk-")) {
    throw Error("Falta OPENAI_API_KEY en .env.local.");
  }
  const mode = envValue("ORDERVOICE_TTS_PROVIDER");
  if (mode !== "openai") {
    throw Error("Para utilizar el paquete, ORDERVOICE_TTS_PROVIDER debe ser openai.");
  }

  console.log("Se solicitará a OpenAI una síntesis facturable por respuesta PENDIENTE.");
  console.log("No se realizan llamadas a Twilio. No repitas el comando si está ejecutándose.");
  mkdirSync(target, { recursive: true, mode: 0o700 });
  let completed = 0;
  for (const item of pending) {
    const started = Date.now();
    console.log("Generando:", item.id);
    try {
      const response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o-mini-tts",
          voice: "coral",
          input: item.text,
          instructions: "Pronuncia exactamente el texto. Habla en español latinoamericano con voz femenina cálida, clara, natural y muy inteligible por teléfono. No cambies las cantidades ni los precios.",
          response_format: "pcm",
          speed: 1
        }),
        signal: AbortSignal.timeout(90_000)
      });
      if (!response.ok) throw Error("OpenAI HTTP " + response.status);
      const wav = pcm24Wav(Buffer.from(await response.arrayBuffer()));
      writeFileSync(filenameFor(item.text), wav, { flag: "wx", mode: 0o600 });
      completed++;
      console.log("OK:", item.id, "-", Math.round((Date.now() - started)/1000), "segundos.");
    } catch (error) {
      console.error("FALLO en", item.id + ":", error?.cause?.code || error?.name || "Error");
      console.error("Los clips ya creados se conservan. No se hacen reintentos automáticos.");
      process.exitCode = 1;
      break;
    }
  }
  console.log("Clips nuevos preparados:", completed, "de", pending.length);
  console.log("Para revisar sin coste: npm run prepare:phone:voice -- --list");
  console.log("El archivo es local, no se publica en GitHub ni incluye la clave API.");
}
main().catch(error => {
  console.error("ERROR:", error.message);
  process.exitCode = 1;
});
