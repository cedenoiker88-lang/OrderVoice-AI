import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { MENU, calculateTotal, sanitizeCart, type ConfirmedOrder } from "@/lib/menu";
import { applyCommand, demoUnderstand, guardDestructiveIntent, type Command } from "@/lib/order-engine";
import { understandWithOllama } from "@/lib/ollama";
import { advancePizzaConversation, sanitizePending } from "@/lib/pizza-dialogue";
import { fastUnderstand } from "@/lib/fast-intents";
import { normalizeVoiceTranscript } from "@/lib/voice-vocabulary";
import { applyOrderPlan } from "@/lib/order-plan";
import { understandOrderPlan } from "@/lib/ai-order-planner";

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
  const startedAt = performance.now();
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
    // Evitar que una URL ngrok pública consuma créditos mediante /api/chat.
    // Las llamadas Twilio legítimas invocan esta ruta internamente desde localhost.
    if (process.env.ORDERVOICE_PROVIDER === "openai") {
      const local = (host: string) => ["localhost", "127.0.0.1", "[::1]"].includes(host);
      const hostname = new URL(request.url).hostname;
      const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
      let forwardedHostname: string | null = null;
      if (forwarded) {
        try { forwardedHostname = new URL("http://" + forwarded).hostname; }
        catch { return NextResponse.json({ error: "Encabezado Host inválido." }, { status: 403 }); }
      }
      if (!local(hostname) || (forwardedHostname && !local(forwardedHostname))) {
        return NextResponse.json({ error: "El motor OpenAI de pruebas solo funciona en localhost." }, { status: 403 });
      }
    }
    const raw = body as Record<string, unknown>;
    const message = typeof raw.message === "string" ? raw.message.trim() : "";
    if (!message || message.length > 500) return NextResponse.json({ error: "El mensaje debe tener entre 1 y 500 caracteres" }, { status: 400 });
    // Mantener el mensaje original para guardas de seguridad y trazabilidad.
    // Solo las transcripciones del navegador se normalizan; Twilio queda intacto.
    const interpretedMessage = raw.browserVoice === true ? normalizeVoiceTranscript(message) : message;
    const cart = sanitizeCart(raw.cart);
    // v0.9: en el navegador con proveedor OpenAI, interpretar un PLAN de
    // operaciones y validarlo atómicamente en el servidor. No se utiliza
    // para Twilio ni altera la ruta telefónica anterior.
    const intelligentBrowser = raw.telephoneMode !== true &&
      process.env.ORDERVOICE_PROVIDER === "openai";
    if (intelligentBrowser) {
      // La app puede estar expuesta por ngrok para Twilio: bloquear peticiones
      // externas al motor OpenAI de pruebas para evitar consumo abusivo.
      const localhost = (hostname: string) =>
        hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
      const target = new URL(request.url);
      const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
      const forwardedHostname = forwarded ? new URL("http://" + forwarded).hostname : null;
      if (!localhost(target.hostname) || (forwardedHostname && !localhost(forwardedHostname))) {
        return NextResponse.json({ error: "El motor OpenAI de pruebas solo está disponible en localhost." }, { status: 403 });
      }
      const origin = request.headers.get("origin");
      if (origin) {
        try {
          if (new URL(origin).host !== target.host) {
            return NextResponse.json({ error: "Origen no autorizado." }, { status: 403 });
          }
        } catch {
          return NextResponse.json({ error: "Origen inválido." }, { status: 403 });
        }
      }
      if (!process.env.OPENAI_API_KEY) {
        return NextResponse.json({ error: "Falta OPENAI_API_KEY para el motor inteligente." }, { status: 503 });
      }
      const history = Array.isArray(raw.history) ? raw.history.slice(-8)
        .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
        .filter((entry) => (entry.role === "user" || entry.role === "assistant") && typeof entry.text === "string")
        .map((entry) => ({
          role: entry.role as "user" | "assistant",
          text: String(entry.text).slice(0, 300)
        })) : [];
      try {
        const interpretStarted = performance.now();
        const plan = await understandOrderPlan(interpretedMessage, cart, history);
        const result = applyOrderPlan(cart, plan, message);
        const order = result.confirmed
          ? { id: crypto.randomUUID().slice(0, 8).toUpperCase(),
              createdAt: new Date().toISOString(), items: cart, totalCents: calculateTotal(cart) }
          : undefined;
        const interpretMs = Math.round(performance.now() - interpretStarted);
        const serverMs = Math.round(performance.now() - startedAt);
        const response = NextResponse.json({
          ...result, order, mode: "ia", pending: null,
          diagnostics: { intent: plan.intent, operations: plan.operations, needsClarification: plan.needsClarification },
          metrics: { interpretMs, serverMs }
        });
        response.headers.set("Cache-Control", "no-store");
        response.headers.set("Server-Timing", `interpret;dur=${interpretMs}, total;dur=${serverMs}`);
        return response;
      } catch (cause) {
        console.error("Intérprete estructurado no disponible:", cause instanceof Error ? cause.name : "error");
        return NextResponse.json({
          error: "La IA no pudo interpretar el pedido. No modifiqué tu carrito. Repite la frase o revisa tu conexión y la clave API."
        }, { status: 502 });
      }
    }
    // Evita que el modelo local agote los 15 s permitidos a una llamada por Twilio.
    const telephoneMode = raw.telephoneMode === true;
    // Un pedido incompleto mantiene sus campos pendientes entre mensajes.
    // El motor determinista resuelve aclaraciones antes de consultar al modelo.
    const incomingPending = sanitizePending(raw.pending);
    const interpretationStartedAt = performance.now();
    const pizzaTurn = advancePizzaConversation(interpretedMessage, incomingPending, cart);
    const fastCommand = pizzaTurn ? null : fastUnderstand(interpretedMessage);
    let pending = pizzaTurn ? pizzaTurn.pending : incomingPending;
    const configuredProvider = process.env.ORDERVOICE_PROVIDER ?? "ollama";
    let mode: "ollama" | "demo" | "ia" | "local" = "demo";
    let notice: string | undefined;
    let command: Command;
    if (pizzaTurn) {
      command = pizzaTurn.command;
      mode = "local";
    } else if (fastCommand) {
      command = fastCommand;
      mode = "local";
    } else if (configuredProvider === "demo") {
      command = demoUnderstand(interpretedMessage);
    } else if (configuredProvider === "openai" && process.env.OPENAI_API_KEY) {
      command = await understandWithAI(interpretedMessage, cart, raw.history);
      mode = "ia";
    } else {
      const history = Array.isArray(raw.history) ? raw.history.slice(-4)
        .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
        .filter((entry) => (entry.role === "user" || entry.role === "assistant") && typeof entry.text === "string")
        .map((entry) => ({ role: entry.role as "user" | "assistant", text: String(entry.text).slice(0, 250) })) : [];
      try {
        command = await understandWithOllama(interpretedMessage, cart, history, telephoneMode ? 4_500 : 90_000);
        mode = "ollama";
      } catch (error) {
        console.warn("Ollama local no disponible; modo demo:", error);
        command = demoUnderstand(message);
        notice = "Ollama no respondió. Estoy usando las reglas básicas de demostración; no se ha enviado información a servicios de pago.";
      }
    }
    const interpretMs = Math.round(performance.now() - interpretationStartedAt);
    const safeCommand = guardDestructiveIntent(message, command);
    if (safeCommand.action === "clear" || safeCommand.action === "confirm") pending = null;
    const result = applyCommand(cart, safeCommand);
    let order: ConfirmedOrder | undefined;
    if (result.confirmed) {
      order = { id: crypto.randomUUID().slice(0, 8).toUpperCase(), createdAt: new Date().toISOString(), items: cart, totalCents: calculateTotal(cart) };
    }
    const serverMs = Math.round(performance.now() - startedAt);
    const response = NextResponse.json({
      ...result, order, mode, notice, pending,
      metrics: { interpretMs, serverMs }
    });
    response.headers.set("Server-Timing", `interpret;dur=${interpretMs}, total;dur=${serverMs}`);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("/api/chat:", error);
    return NextResponse.json({ error: "No se pudo procesar el mensaje. Comprueba la conexión y la configuración de tu API." }, { status: 500 });
  }
}
