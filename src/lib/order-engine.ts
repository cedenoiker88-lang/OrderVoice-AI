import { calculateTotal, formatUSD, MENU, productById, type CartItem } from "./menu";

export type Action = "add" | "remove" | "clear" | "confirm" | "question";
export type Command = {
  action: Action;
  items: { productId: string; quantity: number }[];
  answer: string;
  needsClarification: boolean;
};

function cleanText(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
const words: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };

/** Analizador muy limitado: sirve solo para probar el MVP sin clave API. */
export function demoUnderstand(message: string): Command {
  const s = cleanText(message);
  if (/\b(confirmo|confirmar|finalizar|hacer el pedido|realizar el pedido)\b/.test(s))
    return { action: "confirm", items: [], answer: "", needsClarification: false };
  if (/\b(cancelar|vaciar|borrar todo|limpiar)\b/.test(s))
    return { action: "clear", items: [], answer: "", needsClarification: false };
  const remove = /\b(quita|quitar|elimina|eliminar|saca)\b/.test(s);
  const segments = s.split(/\s+y\s+|,|;/).map((p) => p.trim()).filter(Boolean);
  const items: Command["items"] = [];
  let unclear = false;
  for (const segment of segments) {
    const flavor = ["pepperoni", "hawaiana", "margarita"].find((f) => segment.includes(f));
    const size = ["familiar", "mediana"].find((z) => segment.includes(z));
    const soda = /gaseosa|cola|refresco/.test(segment);
    const m = segment.match(/\b(\d{1,2}|una|uno|un|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b/);
    const quantity = m ? words[m[1]] ?? Number(m[1]) : 1;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) { unclear = true; continue; }
    if (soda) items.push({ productId: "gaseosa", quantity });
    else if (flavor && size) items.push({ productId: `${flavor}-${size}`, quantity });
    else if (flavor || size || /pizza/.test(segment)) unclear = true;
  }
  if (unclear) return { action: "question", items: [], answer: "Necesito que indiques el sabor, tamaño y cantidad de cada pizza. Por ejemplo: dos pepperoni familiares y una hawaiana mediana.", needsClarification: true };
  if (items.length) return { action: remove ? "remove" : "add", items, answer: "", needsClarification: false };
  return { action: "question", items: [], answer: `Tenemos ${MENU.map((m) => `${m.name} (${formatUSD(m.priceCents)})`).join(", ")}. ¿Qué deseas pedir?`, needsClarification: false };
}

export function applyCommand(cart: CartItem[], command: Command): { cart: CartItem[]; reply: string; confirmed: boolean } {
  const quantities = new Map<string, number>(cart.map((c) => [c.productId, c.quantity]));
  if (command.needsClarification) return { cart, reply: command.answer || "¿Puedes aclararme el tamaño, sabor y cantidad?", confirmed: false };

  if (command.action === "clear") return { cart: [], reply: "He vaciado el carrito. ¿Qué quieres pedir ahora?", confirmed: false };
  if (command.action === "confirm") {
    if (!cart.length) return { cart, reply: "Antes de confirmar, añade al menos un producto.", confirmed: false };
    return { cart, reply: `Pedido confirmado por ${formatUSD(calculateTotal(cart))}. ¡Gracias! (Demostración: guardado en este navegador, no enviado a una cocina real).`, confirmed: true };
  }
  if (command.action === "question") return { cart, reply: command.answer || "¿Qué te gustaría ordenar?", confirmed: false };

  if (!command.items.length) return { cart, reply: "No identifiqué productos. ¿Puedes decirme sabor, tamaño y cantidad?", confirmed: false };
  // Todas las líneas se validan antes de aplicar cualquier cambio (atomicidad).
  for (const item of command.items) {
    const old = quantities.get(item.productId) ?? 0;
    if (!productById(item.productId) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20 ||
        (command.action === "add" && old + item.quantity > 20) ||
        (command.action === "remove" && old < item.quantity)) {
      return { cart, reply: "No pude validar ese cambio. Revisa el nombre, la cantidad (máximo 20 por producto) y lo que tienes en el carrito.", confirmed: false };
    }
  }
  for (const item of command.items) {
    const old = quantities.get(item.productId) ?? 0;
    const next = old + (command.action === "add" ? item.quantity : -item.quantity);
    if (next === 0) quantities.delete(item.productId);
    else quantities.set(item.productId, next);
  }
  const nextCart = [...quantities.entries()].map(([productId, quantity]) => ({ productId: productId as CartItem["productId"], quantity }));
  const summary = command.items.map((line) => `${line.quantity} × ${productById(line.productId)?.name}`).join(", ");
  return {
    cart: nextCart,
    reply: `${command.action === "add" ? "Añadí" : "Quité"} ${summary}. ${nextCart.length ? `Total actual: ${formatUSD(calculateTotal(nextCart))}. ¿Quieres algo más o deseas confirmar?` : "El carrito está vacío."}`,
    confirmed: false
  };
}
