/**
 * Diagnostico SIN API key y SIN consumo de creditos.
 * Comprueba que Node.js puede hacer un POST HTTPS a /v1/audio/speech.
 */
const { performance } = require("node:perf_hooks");
async function main() {
  console.log("Node:", process.version);
  console.log("Certificados de Windows habilitados:", process.env.NODE_USE_SYSTEM_CA === "1" ? "Si" : "No");
  const started = performance.now();
  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(15000)
    });
    const seconds = ((performance.now() - started)/1000).toFixed(1);
    console.log("Respuesta de endpoint Text-to-speech: HTTP", response.status, "en", seconds, "segundos.");
    if (response.status === 401) {
      console.log("OK: se alcanzo la API de voz; HTTP 401 es esperado al no enviar clave.");
      console.log("No se genero audio. No se consumieron creditos.");
    } else {
      console.log("La red alcanzo el endpoint. En una solicitud sin clave, el estado esperado es HTTP 401.");
      console.log("No se genero audio. No se consumieron creditos.");
    }
  } catch (error) {
    const elapsed = ((performance.now() - started)/1000).toFixed(1);
    console.error("FALLO de conexion tras", elapsed, "segundos:", error?.name || "Error");
    if (error?.cause?.code) console.error("Codigo:", error.cause.code);
    if (error?.cause?.message) console.error("Detalle:", error.cause.message);
    console.error("No se intento generar audio ni consumir creditos.");
    process.exitCode = 1;
  }
}
main();
