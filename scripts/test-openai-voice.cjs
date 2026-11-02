/**
 * One short, opt-in OpenAI voice preview. This calls a BILLABLE API once,
 * without making phone calls. Saves a local WAV in .next/ (gitignored).
 */
const { existsSync, readFileSync, mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const root = join(__dirname, "..");
function envValue(key) {
  const file = join(root, ".env.local");
  if (!existsSync(file)) throw Error("No existe .env.local.");
  const entry = readFileSync(file, "utf8").split(/\r?\n/)
    .find(line => line.trim().startsWith(key + "="));
  if (!entry) return null;
  let value = entry.slice(entry.indexOf("=") + 1).trim();
  if ((value[0] === '"' && value.at(-1) === '"') ||
      (value[0] === "'" && value.at(-1) === "'")) value = value.slice(1, -1);
  return value;
}
function asWav24(pcm) {
  if (!pcm.length || pcm.length % 2 || pcm.length > 2_000_000) {
    throw Error("OpenAI devolvió un PCM de tamaño inesperado.");
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
  const apiKey = envValue("OPENAI_API_KEY");
  if (!apiKey || !apiKey.startsWith("sk-")) {
    throw Error("Configura OPENAI_API_KEY en .env.local; NO pegues tu clave en el chat.");
  }
  console.log("Generando una única muestra corta (consume una pequeña cantidad de créditos de OpenAI).");
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice: "coral",
      input: "Hola, soy OrderVoice, tu asistente virtual. ¿Qué deseas pedir hoy?",
      instructions: "Habla en español latinoamericano claro con voz femenina cálida, firme, natural, muy inteligible y sin añadir palabras.",
      response_format: "pcm"
    }),
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) {
    throw Error("OpenAI respondió HTTP " + response.status +
      ". Revisa API key, saldo y acceso al modelo.");
  }
  const wav = asWav24(Buffer.from(await response.arrayBuffer()));
  const dir = join(root, ".next");
  mkdirSync(dir, { recursive: true });
  const outfile = join(dir, "ordervoice-voz-openai-v06.wav");
  writeFileSync(outfile, wav);
  console.log("OK: OpenAI devolvió audio. Archivo de muestra local:");
  console.log(outfile);
  console.log("En Windows puedes escucharlo ejecutando: Invoke-Item .next\\ordervoice-voz-openai-v06.wav");
  console.log("Nota: esta prueba no hace llamadas; la llamada telefónica usa un WAV a 8 kHz normalizado.");
}
main().catch(e => {
  console.error("ERROR:", e.message);
  process.exitCode = 1;
});