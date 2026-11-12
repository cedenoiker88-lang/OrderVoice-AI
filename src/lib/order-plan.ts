import { z } from "zod";
import { calculateTotal, formatUSD, productById, type CartItem } from "./menu";

/**
 * Plan de interpretación separado de la ejecución: el modelo NO escribe en el
 * carrito. Solo devuelve operaciones; el servidor las valida como una
 * transacción (todo o nada), con los precios del menú como única fuente.
 */
export const OrderPlanSchema = z.object({
  intent: z.enum(["edit", "total", "confirm", "clear", "question"]),
  operations: z.array(z.object({
    kind: z.enum(["add", "remove", "replace", "set", "keep_only"]),
    productId: z.string(),
    toProductId: z.string(),
    quantity: z.number().int()
  })),
  needsClarification: z.boolean(),
  answer: z.string()
});
export type OrderPlan = z.infer<typeof OrderPlanSchema>;
type Evaluation = { cart: CartItem[]; reply: string; confirmed: boolean };
const noChange = (cart: CartItem[], reply: string): Evaluation => ({ cart, reply, confirmed: false });

function productsDescription(cart: CartItem[]): string {
  if (!cart.length) return "Tu carrito quedó vacío";
  return "Tu pedido ahora contiene " + cart.map((line) => {
    const product = productById(line.productId);
    return `${line.quantity} ${product?.name.toLowerCase() ?? "producto"}`;
  }).join(", ");
}

/** Una negación o pregunta no autoriza eliminar todo ni confirmar. */
function clearlyAuthorizes(message: string, kind: "confirm" | "clear"): boolean {
  const s = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/[¿?]/.test(message) || /\b(que pasa si|podria|deberia|como puedo|si quisiera|hipoteticamente)\b/.test(s)) return false;
  if (/\bno\s+(?:quiero|deseo|debes|vayas|me|hay que|se debe)\b[^.!?]*\b(?:confirm\w*|finaliz\w*|vaciar|vacia\w*|borrar|borra\w*|cancelar|elimin\w*|limpiar)\b/.test(s)) return false;
  if (/^\s*no\s+(?:confirm\w*|finaliz\w*|vacia\w*|borr\w*|cancel\w*)\b/.test(s)) return false;
  return kind === "confirm"
    ? /\b(confirmo|confirmame|confirma|confirmar|finaliza|finalizar|realiza el pedido|haz el pedido)\b/.test(s)
    : /\b(vacia|vaciar|borrar todo|borra todo|limpiar el carrito|limpia el carrito|cancelar todo|cancela todo|elimina todo)\b/.test(s);
}

/**
 * Valida cada cambio en una copia del carrito. Si alguna cantidad, ID o
 * combinación es incoherente, no se aplica ninguno de los cambios.
 */
export function applyOrderPlan(cart: CartItem[], plan: OrderPlan, originalMessage: string): Evaluation {
  const invalid = (message: string) => noChange(cart, `No modifiqué tu pedido. ${message}`);
  if (plan.needsClarification) {
    return noChange(cart, plan.answer.trim().slice(0, 300) || "¿Puedes aclarar qué productos y cantidades quieres?");
  }
  if (plan.operations.length > 12) return invalid("Hay demasiados cambios en una sola frase. Dímelos en partes.");
  if (plan.intent === "total") {
    if (plan.operations.length) return invalid("La consulta de total no debe incluir cambios.");
    return noChange(cart, cart.length
      ? `El total actual es ${formatUSD(calculateTotal(cart))}. ¿Deseas algo más?`
      : "Tu carrito está vacío. ¿Qué deseas pedir?");
  }
  if (plan.intent === "question") {
    if (plan.operations.length) return invalid("La pregunta venía con cambios ambiguos. ¿Qué deseas hacer primero?");
    return noChange(cart, plan.answer.trim().slice(0, 300) ||
      "Tenemos pizzas de pepperoni, hawaiana y margarita, en tamaño mediano y familiar, además de gaseosa de un litro.");
  }
  if (plan.intent === "confirm") {
    if (plan.operations.length || !clearlyAuthorizes(originalMessage, "confirm")) {
      return invalid("Para confirmar, di explícitamente: confirmo mi pedido.");
    }
    if (!cart.length) return noChange(cart, "Primero añade un producto antes de confirmar.");
    return { cart, reply: `Confirmé el pedido de ${formatUSD(calculateTotal(cart))}. Es una demostración: no se envía a una cocina real.`, confirmed: true };
  }
  if (plan.intent === "clear") {
    if (plan.operations.length || !clearlyAuthorizes(originalMessage, "clear")) {
      return invalid("No entendí una orden inequívoca para vaciar el carrito.");
    }
    return { cart: [], reply: "Vacié el carrito. ¿Qué deseas pedir ahora?", confirmed: false };
  }
  if (plan.intent !== "edit" || !plan.operations.length) {
    return invalid("Necesito saber qué productos deseas agregar, quitar o cambiar.");
  }

  const normalized = originalMessage.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  // Una negación textual explícita prevalece ante un plan incorrecto del modelo.
  if (/(?:\bno quiero\b|\bno me\b|\bno vayas a\b|\bno debes\b)[^.?!]*\b(?:quitar|quita|eliminar|elimina|borrar|borra|sacar|saca|remover)\b/.test(normalized) &&
      plan.operations.some((op) => ["remove", "keep_only"].includes(op.kind))) {
    return invalid("La frase contiene una negación sobre eliminar productos. ¿Qué deseas conservar o quitar?");
  }
  if (/(?:\bno quiero\b|\bno me\b|\bno vayas a\b|\bno debes\b)[^.?!]*\b(?:agregar|agrega|anadir|anade|poner|pongas)\b/.test(normalized) &&
      plan.operations.some((op) => op.kind === "add")) {
    return invalid("La frase contiene una negación sobre agregar productos. ¿Qué deseas añadir realmente?");
  }
  if (/(?:\bno quiero\b|\bno\b)[^.?!]*\b(?:cambiar|cambia|cambies|reemplazar|reemplaza|sustituir|sustituye)\b/.test(normalized) &&
      plan.operations.some((op) => op.kind === "replace")) {
    return invalid("No aplicaré el reemplazo porque la frase lo niega o es ambigua.");
  }
  const only = plan.operations.filter((op) => op.kind === "keep_only");
  if (only.length && only.length !== plan.operations.length) {
    return invalid("La lista final está mezclada con otros cambios. Dime solamente qué debe quedar.");
  }
  if (only.length && !/\b(solo|solamente|unicamente|quedar|quede|quedan|queden|quedaria|deja|dejo|dejame|mantener|conservar|me quedo)\b/i
    .test(originalMessage.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))) {
    return invalid("Confírmame que quieres conservar solamente los productos que mencionaste.");
  }
  const quantities = only.length ? new Map<string, number>() :
    new Map<string, number>(cart.map(({ productId, quantity }) => [productId, quantity]));
  const targets = new Set<string>();

  for (const operation of plan.operations) {
    const { kind, productId, toProductId, quantity } = operation;
    const known = productById(productId);
    if (!known || !Number.isInteger(quantity) ||
      quantity < (kind === "set" ? 0 : 1) || quantity > 20) {
      return invalid("Hay un producto o una cantidad fuera del menú. ¿Puedes aclararlo?");
    }
    if (kind !== "replace" && toProductId) {
      return invalid("La operación tiene un producto de destino inesperado.");
    }
    if (kind === "replace" && (!productById(toProductId) || toProductId === productId)) {
      return invalid("Indica un producto distinto y válido para el reemplazo.");
    }
    if (only.length) {
      if (targets.has(productId)) return invalid("El mismo producto aparece dos veces en tu lista final.");
      targets.add(productId);
      quantities.set(productId, quantity);
      continue;
    }
    if (kind === "keep_only") return invalid("No pude validar la lista final.");
    if (kind === "replace") {
      const before = quantities.get(productId) ?? 0;
      const destination = quantities.get(toProductId) ?? 0;
      if (before < quantity || destination + quantity > 20) {
        return invalid("No hay suficientes productos para ese cambio o se excedería el límite.");
      }
      if (before === quantity) quantities.delete(productId);
      else quantities.set(productId, before - quantity);
      quantities.set(toProductId, destination + quantity);
      continue;
    }
    const old = quantities.get(productId) ?? 0;
    let next = old;
    if (kind === "add") next = old + quantity;
    if (kind === "remove") next = old - quantity;
    if (kind === "set") next = quantity;
    if (next < 0 || next > 20) {
      return invalid("Ese cambio supera el límite de 20 unidades o quita más unidades de las que tienes.");
    }
    if (!next) quantities.delete(productId);
    else quantities.set(productId, next);
  }
  const updated = [...quantities].map(([productId, quantity]) =>
    ({ productId: productId as CartItem["productId"], quantity }));
  return {
    cart: updated,
    confirmed: false,
    reply: `${productsDescription(updated)}. Total: ${formatUSD(calculateTotal(updated))}. ¿Deseas algo más o quieres confirmar?`
  };
}
