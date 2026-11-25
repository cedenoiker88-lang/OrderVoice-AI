import { sanitizeCart, formatUSD, productById } from "@/lib/menu";
import { DomainError } from "./domain.js";
import { advancePizzaConversation, sanitizePending } from "@/lib/pizza-dialogue";
import { fastUnderstand } from "@/lib/fast-intents";
import { demoUnderstand, guardDestructiveIntent, applyCommand } from "@/lib/order-engine";
import { normalizeVoiceTranscript } from "@/lib/voice-vocabulary";

/**
 * Capa de aplicación: interpreta localmente y coordina los cuatro casos de uso.
 * No utiliza OpenAI, HTTP, SQL, Twilio, Ollama ni NextResponse.
 * La base de datos es la fuente de verdad del carrito y de los precios.
 */
type SessionItem = { productId: string; quantity: number };
type Session = {
  items: SessionItem[];
  status: string;
  totalCents: number;
};
type Order = { totalCents: number };
export type ConversationRepositoryService = {
  getSession(id: string): Promise<Session>;
  syncCart(id: string, cart: SessionItem[]): Promise<Session>;
  confirmSession(id: string, input: {confirmar: true}): Promise<Order>;
};
export async function processConversation(
  raw: Record<string, unknown>,
  monolith: ConversationRepositoryService
) {
  const message = typeof raw.message === "string" ? raw.message.trim() : "";
  const sessionId = typeof raw.sessionId === "string" ? raw.sessionId : "";
  if (!message || message.length > 500 || !sessionId) {
    throw new DomainError(400, "MENSAJE_INVALIDO", "Se requiere mensaje válido y sessionId.");
  }

  const current = await monolith.getSession(sessionId);
  if (current.status !== "abierta") {
    throw new DomainError(409, "SESION_CONFIRMADA", "Esta sesión ya está confirmada.");
  }
  const knownCart = sanitizeCart(current.items);
  const otherProducts = current.items.filter((line) => !productById(line.productId));
  const normalized = raw.browserVoice === true ? normalizeVoiceTranscript(message) : message;
  const pending = sanitizePending(raw.pending);
  const dialogue = advancePizzaConversation(normalized, pending, knownCart);
  const command = guardDestructiveIntent(
    normalized, dialogue?.command ?? fastUnderstand(normalized) ?? demoUnderstand(normalized)
  );
  const evaluation = applyCommand(knownCart, command);
  let nextPending = dialogue ? dialogue.pending : pending;
  if (command.action === "confirm" || command.action === "clear") nextPending = null;

  let actual = current;
  let order: Order | undefined;
  let reply = evaluation.reply;
  if (evaluation.confirmed) {
    order = await monolith.confirmSession(sessionId, { confirmar: true });
    reply = `Confirmé tu pedido de ${formatUSD(order.totalCents)}. Es una demostración; no se envía a una cocina real.`;
  } else if (command.action === "total") {
    reply = current.items.length
      ? `El total actual es ${formatUSD(current.totalCents)}. ¿Deseas algo más?`
      : "Tu carrito está vacío. ¿Qué deseas pedir?";
  } else if (command.action === "clear" ||
    (command.action !== "question" && JSON.stringify(knownCart) !== JSON.stringify(evaluation.cart))) {
    const desired: SessionItem[] = command.action === "clear"
      ? []
      : [...evaluation.cart, ...otherProducts];
    actual = await monolith.syncCart(sessionId, desired);
    reply = command.action === "replace"
      ? `Realicé el cambio. Total actual: ${formatUSD(actual.totalCents)}. ¿Deseas algo más?`
      : command.action === "remove"
      ? `Quité los productos indicados. Total actual: ${formatUSD(actual.totalCents)}.`
      : command.action === "clear"
      ? "Vacié el carrito. ¿Qué deseas pedir ahora?"
      : `Añadí los productos. Total actual: ${formatUSD(actual.totalCents)}. ¿Deseas algo más?`;
  }

  return {
    status: 200,
    data: {
      reply, cart: order ? [] : actual.items.map((line) => ({
        productId: line.productId, quantity: line.quantity
      })),
      order, pending: nextPending, mode: "local"
    }
  };
}
