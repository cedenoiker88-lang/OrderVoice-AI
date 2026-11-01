import { z } from "zod";
import { MENU, type CartItem } from "./menu";
import type { Command } from "./order-engine";

// El modelo solo interpreta la intención. El motor de pedidos valida y calcula los precios.
const CommandSchema = z.object({
  action: z.enum(["add", "remove", "replace", "clear", "confirm", "question", "total"]),
  items: z.array(z.object({ productId: z.string(), quantity: z.number().int() })).max(12),
  replacements: z.array(z.object({
    fromProductId: z.string(), toProductId: z.string(), quantity: z.number().int()
  })).max(1).optional(),
  answer: z.string().max(300),
  needsClarification: z.boolean()
});

const outputSchema = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["add", "remove", "replace", "clear", "confirm", "question", "total"] },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: { productId: { type: "string" }, quantity: { type: "integer" } },
        required: ["productId", "quantity"]
      }
    },
    replacements: {
      type: "array",
      items: {
        type: "object",
        properties: {
          fromProductId: { type: "string" },
          toProductId: { type: "string" },
          quantity: { type: "integer" }
        },
        required: ["fromProductId", "toProductId", "quantity"]
      }
    },
    answer: { type: "string" },
    needsClarification: { type: "boolean" }
  },
  required: ["action", "items", "replacements", "answer", "needsClarification"]
};

const instructions = `Eres el intérprete de pedidos de Pizza Demo, una pizzería ficticia.
SOLO devuelves un objeto JSON con el esquema indicado. NO redactes una respuesta libre.
Menú autorizado: ${JSON.stringify(MENU.map(({ id, name, priceCents }) => ({ id, name, priceCents })))}.
Interpreta exactamente el mensaje ACTUAL del cliente considerando el carrito y las últimas conversaciones.
- add: añade productos. remove: quita productos ya presentes.
- replace: cambia UN producto por otro; usa replacements, no items.
- total: consulta el total; NO añadas productos.
- clear: solo si el cliente pide claramente vaciar el carrito.
- confirm: solo si el cliente confirma claramente el pedido existente.
- question: para preguntas o peticiones ambiguas. Si falta sabor o tamaño, pide una aclaración.
No inventes productos, tamaños, precios, descuentos, disponibilidad, direcciones, entregas ni tiempos.
Cantidades enteras entre 1 y 20. Para productos no especificados NO supongas el sabor/tamaño.
Nunca confirmes o vacíes un carrito por iniciativa propia.
Cuando solo pregunta, en answer da una respuesta breve basada únicamente en el menú autorizado.
Si el mensaje no cabe en una sola acción, usa question para aclarar. Responde en español.`;

type HistoryMessage = { role: "user" | "assistant"; text: string };

export async function understandWithOllama(
  message: string, cart: CartItem[], history: HistoryMessage[]
): Promise<Command> {
  // Conexión solo al Ollama local: no se envían datos a servicios de terceros.
  const response = await fetch("http://127.0.0.1:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(90000),
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL || "llama3.2:3b",
      stream: false,
      format: outputSchema,
      // Evita recargar el modelo entre turnos; permanece en memoria 15 min.
      keep_alive: "15m",
      options: { temperature: 0, num_predict: 240, num_ctx: 3072 },
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: JSON.stringify({
          currentCart: cart,
          lastMessages: history.slice(-4),
          customerMessage: message
        }) }
      ]
    })
  });

  if (!response.ok) throw new Error(`Ollama respondió HTTP ${response.status}`);
  const data: unknown = await response.json();
  const raw = data && typeof data === "object"
    ? (data as { message?: { content?: unknown } }).message?.content : undefined;
  if (typeof raw !== "string") throw new Error("Ollama no devolvió JSON");
  const command = CommandSchema.parse(JSON.parse(raw));

  // Protección adicional: cambios destructivos solo con intención explícita.
  const normalized = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (command.action === "confirm" && !/\b(confirmo|confirmar|confirmado|finalizar|hacer el pedido|realizar el pedido)\b/.test(normalized)) {
    return { action: "question", items: [], answer: "¿Deseas confirmar el pedido actual?", needsClarification: true };
  }
  if (command.action === "clear" && !/\b(cancelar|vaciar|borrar todo|limpiar)\b/.test(normalized)) {
    return { action: "question", items: [], answer: "¿Quieres vaciar el carrito?", needsClarification: true };
  }
  return command;
}
