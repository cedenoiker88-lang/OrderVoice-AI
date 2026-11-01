import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { MENU, calculateTotal, sanitizeCart, type ConfirmedOrder } from "@/lib/menu";
import { applyCommand, demoUnderstand, type Command } from "@/lib/order-engine";
import { understandWithOllama } from "@/lib/ollama";
import { advancePizzaConversation, sanitizePending } from "@/lib/pizza-dialogue";

export const runtime = "nodejs";

const CommandSchema = z.object({
  action: z.enum(["add", "remove", "replace", "clear", "confirm", "question", "total"]),
  items: z.array(z.object({ productId: z.string(), quantity: z.number().int() })),
  replacements: z.array(z.object({ fromProductId: z.string(), toProductId: z.string(), quantity: z.number().int() })).optional(),
  answer: z.string(),
  needsClarification: z.boolean()
});

async function understandWithAI(message: string, cart: ReturnType<typeof sanitizeCart>, history: unknown): Promise<Command> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const safeHistory = Array.isArray(history)
    ? history.slice(-8).filter((t) => t && typeof t === "object")
        .map((t) => ({ role: String(t.role ?? "").slice(0, 15), text: String(t.text ?? "").slice(0, 400) }))
    : [];
  const response = await client.responses.parse({
    model: process.env.OPENAI_MODEL || "gpt-5.6-terra",
    instructions: `Eres un operador que interpreta pedidos de la pizzería ficticia "Pizza Demo". Tu trabajo es interpretar la intención, NO modificar la base de datos.
Menú autorizado en JSON: ${JSON.stringify(MENU.map(({ id, name, priceCents }) => ({ id, name, priceCents })))}.
Devuelve una acción estructurada. Para add/remove usa EXCLUSIVAMENTE IDs exactos del menú y cantidades enteras de 1 a 20. No inventes sabores, tamaños, extras, precios, horarios, promociones, direcciones ni tiempos de entrega. Nunca sustituyas un producto por otro sin preguntar.
Si faltan sabor, tamaño, cantidad o si hay cualquier ambigüedad, usa action=question, items=[], needsClarification=true y pregunta una sola cosa en "answer". Si el usuario está haciendo una pregunta, usa action=question y responde brevemente en "answer" solo con la información del menú autorizado. Si pide cambiar un producto por otro, usa action=replace, items=[] y replacements=[{fromProductId,toProductId,quantity}], solo cuando ambos productos son inequívocos. Si pregunta por el total del carrito, usa action=total e items=[]. Si confirma de manera explícita su pedido actual, usa action=confirm. Si pide vaciar todo, usa clear. Para solicitudes mixtas que no puedas representar sin perder información, pide aclaración. No digas que el pedido está confirmado por tu cuenta: lo decide el backend. Responde en español cordial ecuatoriano.`,
    input: JSON.stringify({ currentCart: cart, lastMessages: safeHistory, customerMessage: message }),
    text: { format: zodTextFormat(CommandSchema, "order_command") }
  });
  if (!response.output_parsed) throw new Error("No se pudo interpretar la respuesta estructurada");
  return response.output_parsed;
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
    const raw = body as Record<string, unknown>;
    const message = typeof raw.message === "string" ? raw.message.trim() : "";
    if (!message || message.length > 500) return NextResponse.json({ error: "El mensaje debe tener entre 1 y 500 caracteres" }, { status: 400 });
    const cart = sanitizeCart(raw.cart);
    // Un pedido incompleto mantiene sus campos pendientes entre mensajes.
    // El motor determinista resuelve aclaraciones antes de consultar al modelo.
    const incomingPending = sanitizePending(raw.pending);
    const pizzaTurn = advancePizzaConversation(message, incomingPending);
    let pending = pizzaTurn ? pizzaTurn.pending : incomingPending;
    const configuredProvider = process.env.ORDERVOICE_PROVIDER ?? "ollama";
    let mode: "ollama" | "demo" | "ia" = "demo";
    let notice: string | undefined;
    let command: Command;
    if (pizzaTurn) {
      command = pizzaTurn.command;
      mode = configuredProvider === "ollama" ? "ollama" : "demo";
    } else if (configuredProvider === "demo") {
      command = demoUnderstand(message);
    } else if (configuredProvider === "openai" && process.env.OPENAI_API_KEY) {
      command = await understandWithAI(message, cart, raw.history);
      mode = "ia";
    } else {
      const history = Array.isArray(raw.history) ? raw.history.slice(-6)
        .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
        .filter((entry) => (entry.role === "user" || entry.role === "assistant") && typeof entry.text === "string")
        .map((entry) => ({ role: entry.role as "user" | "assistant", text: String(entry.text).slice(0, 400) })) : [];
      try {
        command = await understandWithOllama(message, cart, history);
        mode = "ollama";
      } catch (error) {
        console.warn("Ollama local no disponible; modo demo:", error);
        command = demoUnderstand(message);
        notice = "Ollama no respondió. Estoy usando las reglas básicas de demostración; no se ha enviado información a servicios de pago.";
      }
    }
    if (command.action === "clear" || command.action === "confirm") pending = null;
    const result = applyCommand(cart, command);
    let order: ConfirmedOrder | undefined;
    if (result.confirmed) {
      order = { id: crypto.randomUUID().slice(0, 8).toUpperCase(), createdAt: new Date().toISOString(), items: cart, totalCents: calculateTotal(cart) };
    }
    return NextResponse.json({ ...result, order, mode, notice, pending });
  } catch (error) {
    console.error("/api/chat:", error);
    return NextResponse.json({ error: "No se pudo procesar el mensaje. Comprueba la conexión y la configuración de tu API." }, { status: 500 });
  }
}
