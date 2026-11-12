/*
 * Diagnóstico económico de Responses + Structured Outputs.
 * Lee .env.local mediante Node 20.12+ (--env-file en package.json).
 * Ejecuta UNA consulta real a OpenAI y consume algunos tokens.
 * NUNCA imprime claves ni las envía a servicios distintos de OpenAI.
 */
const OpenAI = require("openai").default;
const { z } = require("zod");
const { zodTextFormat } = require("openai/helpers/zod");

const model = process.env.ORDERVOICE_INTENT_MODEL || "gpt-6.1-sol";
const hasKey = Boolean(process.env.OPENAI_API_KEY);
console.log("Diagnóstico OrderVoice v0.9:");
console.log("  Motor:", process.env.ORDERVOICE_PROVIDER || "(no configurado)");
console.log("  Modelo:", model);
console.log("  API key:", hasKey ? "configurada (valor oculto)" : "FALTA");
if (!hasKey) {
  console.error("FALLO: Agrega OPENAI_API_KEY en .env.local (no compartas la clave).");
  process.exit(1);
}
const OrderPlanSchema = z.object({
  intent: z.enum(["edit", "total", "confirm", "clear", "question"]),
  operations: z.array(z.object({
    kind: z.enum(["add", "remove", "replace", "set", "keep_only"]),
    productId: z.string(), toProductId: z.string(), quantity: z.number().int()
  })),
  needsClarification: z.boolean(),
  answer: z.string()
});
(async () => {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 20_000, maxRetries: 0 });
  console.log("Enviando UNA prueba de interpretación (consume una pequeña cantidad de créditos API)...");
  const response = await client.responses.parse({
    model,
    store: false,
    reasoning: { effort: "low" },
    instructions: 'Interpreta el texto como plan JSON. Para "¿Cuánto es el total?" usa intent="total", operations=[], needsClarification=false, answer="".',
    input: "¿Cuánto es el total?",
    text: { format: zodTextFormat(OrderPlanSchema, "order_plan") }
  });
  if (!response.output_parsed) throw new Error("La respuesta no produjo datos estructurados.");
  if (response.output_parsed.intent !== "total") {
    console.warn("La API respondió, pero interpretó otra intención:", response.output_parsed.intent);
    process.exitCode = 2;
    return;
  }
  console.log("OK: la clave tiene acceso a Responses, el modelo respondió y pudo devolver el esquema estructurado.");
})().catch((error) => {
  const status = typeof error?.status === "number" ? error.status : "no disponible";
  const code = typeof error?.code === "string" ? error.code : "no disponible";
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = rawMessage.slice(0, 500).replace(/sk-[A-Za-z0-9_-]+/g, "[CLAVE_OCULTA]");
  console.error("FALLO: HTTP", status, "| código:", code);
  console.error("Detalle:", message);
  if (status === 403) console.error("SOLUCIÓN: En OpenAI Platform da permiso Request a Responses (/v1/responses) para esta clave/proyecto.");
  else if (status === 401) console.error("SOLUCIÓN: Revisa que la clave de .env.local sea válida y pertenezca al proyecto correcto.");
  else if (status === 404) console.error("SOLUCIÓN: Comprueba ORDERVOICE_INTENT_MODEL y el acceso al modelo elegido.");
  else if (status === 429) console.error("SOLUCIÓN: Revisa créditos, límite de uso y límites de solicitudes en OpenAI Platform.");
  else if (status === 400) console.error("SOLUCIÓN: Hay un parámetro o esquema no compatible; envía el detalle (sin claves) para corregirlo.");
  process.exitCode = 1;
});
