import { calculateTotal, formatUSD, MENU, productById, type CartItem } from "./menu";

export type Action = "add" | "remove" | "replace" | "clear" | "confirm" | "question" | "total";
export type Line = { productId: string; quantity: number };
export type Replacement = { fromProductId: string; toProductId: string; quantity: number };
export type Command = {
  action: Action;
  items: Line[];
  replacements?: Replacement[];
  answer: string;
  needsClarification: boolean;
};

function cleanText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

const NUMBER_WORDS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10
};
const QUANTITY = /\b(\d+|una|uno|un|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b/;
const PRODUCT_WORDS = /\b(pizza|pizzas|pepperoni|hawaiana|hawaianas|margarita|gaseosa|gaseosas|cola|refresco)\b/;
const noChange = (answer: string, needsClarification = true): Command =>
  ({ action: "question", items: [], answer, needsClarification });

function parseLine(text: string): { line?: Line; error?: string } {
  const segment = cleanText(text);
  const quantityMatch = segment.match(QUANTITY);
  const quantity = quantityMatch ? NUMBER_WORDS[quantityMatch[1]] ?? Number(quantityMatch[1]) : 1;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
    return { error: "Solo puedo procesar cantidades enteras entre 1 y 20 por producto." };
  }
  if (/\b(gaseosa|gaseosas|cola|refresco)\b/.test(segment)) {
    if (/pepperoni|hawaiana|margarita/.test(segment)) {
      return { error: "Indica cada producto por separado, por favor." };
    }
    return { line: { productId: "gaseosa", quantity } };
  }
  const flavor = ["pepperoni", "hawaiana", "margarita"].find((item) => segment.includes(item));
  const size = /\bfamiliar(?:es)?\b/.test(segment) ? "familiar"
    : /\bmedianas?\b/.test(segment) ? "mediana" : undefined;
  if (flavor && size) return { line: { productId: `${flavor}-${size}`, quantity } };
  if (PRODUCT_WORDS.test(segment) || size) {
    return { error: "Necesito el sabor y tamaño de cada pizza. Por ejemplo: dos pepperoni familiares." };
  }
  return {};
}

/** Intérprete local de demostración. No utiliza servicios ni IA de pago. */
export function demoUnderstand(message: string): Command {
  const s = cleanText(message);
  if (/\b(cuanto (es|cuesta|sale)|cual es el total|dime el total|precio total|total del pedido)\b/.test(s)) {
    return { action: "total", items: [], answer: "", needsClarification: false };
  }
  if (/\b(confirmo|confirmar|finalizar|hacer el pedido|realizar el pedido)\b/.test(s)) {
    return { action: "confirm", items: [], answer: "", needsClarification: false };
  }
  if (/\b(cancelar|vaciar|borrar todo|limpiar)\b/.test(s)) {
    return { action: "clear", items: [], answer: "", needsClarification: false };
  }

  // Un reemplazo solo se ejecuta si origen y destino están claros.
  if (/\b(cambia|cambiar|cambio|reemplaza|reemplazar|sustituye|sustituir)\b/.test(s)) {
    const parts = s.split(/\bpor\b/);
    if (parts.length !== 2 || /\s+y\s+|;|,/.test(parts[0]) || /\s+y\s+|;|,/.test(parts[1])) {
      return noChange("Para cambiar un producto, dime uno a la vez: cambia una pepperoni familiar por una hawaiana mediana.");
    }
    const from = parseLine(parts[0]);
    const to = parseLine(parts[1]);
    if (from.error || to.error || !from.line || !to.line) {
      return noChange(from.error || to.error || "Indica el producto original y el nuevo, con sabor y tamaño.");
    }
    if (from.line.quantity !== to.line.quantity && QUANTITY.test(parts[1])) {
      return noChange("Indica la misma cantidad a cambiar en ambos productos.");
    }
    return {
      action: "replace", items: [], answer: "", needsClarification: false,
      replacements: [{ fromProductId: from.line.productId, toProductId: to.line.productId, quantity: from.line.quantity }]
    };
  }

  const remove = /\b(quita|quitar|elimina|eliminar|saca|sacar)\b/.test(s);
  const segments = s.split(/\s+y\s+|,|;/).map((part) => part.trim()).filter(Boolean);
  const items: Line[] = [];
  for (const segment of segments) {
    const parsed = parseLine(segment);
    if (parsed.error) return noChange(parsed.error);
    if (parsed.line) items.push(parsed.line);
  }
  if (items.length) {
    return { action: remove ? "remove" : "add", items, answer: "", needsClarification: false };
  }
  return noChange(`Tenemos ${MENU.map((item) => `${item.name} (${formatUSD(item.priceCents)})`).join(", ")}. ¿Qué deseas pedir?`, false);
}

export function applyCommand(cart: CartItem[], command: Command): { cart: CartItem[]; reply: string; confirmed: boolean } {
  const unchanged = (reply: string) => ({ cart, reply, confirmed: false });
  const quantities = new Map<string, number>(cart.map((line) => [line.productId, line.quantity]));
  if (command.needsClarification) return unchanged(command.answer || "¿Puedes aclarar el pedido?");
  if (command.action === "clear") return { cart: [], reply: "He vaciado el carrito. ¿Qué quieres pedir ahora?", confirmed: false };
  if (command.action === "total") return unchanged(cart.length
    ? `El total actual es ${formatUSD(calculateTotal(cart))}. ¿Deseas agregar algo o confirmar?`
    : "Tu carrito está vacío. ¿Qué deseas pedir?");
  if (command.action === "confirm") {
    if (!cart.length) return unchanged("Antes de confirmar, añade al menos un producto.");
    return { cart, reply: `Pedido confirmado por ${formatUSD(calculateTotal(cart))}. ¡Gracias! (Demostración: guardado en este navegador, no enviado a una cocina real).`, confirmed: true };
  }
  if (command.action === "question") return unchanged(command.answer || "¿Qué te gustaría ordenar?");

  const changes = new Map<string, number>();
  const adjust = (id: string, delta: number) => changes.set(id, (changes.get(id) ?? 0) + delta);
  if (command.action === "replace") {
    const replacements = command.replacements ?? [];
    if (!replacements.length) return unchanged("Indica qué producto quieres cambiar y por cuál.");
    for (const replacement of replacements) {
      if (!productById(replacement.fromProductId) || !productById(replacement.toProductId) ||
          !Number.isInteger(replacement.quantity) || replacement.quantity < 1 || replacement.quantity > 20) {
        return unchanged("No pude validar el reemplazo. Revisa sabores, tamaños y cantidades.");
      }
      adjust(replacement.fromProductId, -replacement.quantity);
      adjust(replacement.toProductId, replacement.quantity);
    }
  } else {
    if (!command.items.length) return unchanged("No identifiqué productos. Dime sabor, tamaño y cantidad.");
    for (const line of command.items) {
      if (!productById(line.productId) || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 20) {
        return unchanged("No pude validar uno de los productos o las cantidades.");
      }
      adjust(line.productId, command.action === "add" ? line.quantity : -line.quantity);
    }
  }
  // Se validan todos los cambios acumulados antes de actualizar el carrito.
  for (const [id, delta] of changes) {
    const next = (quantities.get(id) ?? 0) + delta;
    if (next < 0 || next > 20) {
      return unchanged("No pude aplicar el cambio: verifica las cantidades disponibles (máximo 20 por producto). No modifiqué tu pedido.");
    }
  }
  for (const [id, delta] of changes) {
    const next = (quantities.get(id) ?? 0) + delta;
    if (next === 0) quantities.delete(id);
    else quantities.set(id, next);
  }
  const nextCart = [...quantities.entries()].map(([productId, quantity]) =>
    ({ productId: productId as CartItem["productId"], quantity }));
  const description = command.action === "replace" ? "Realicé el cambio solicitado"
    : command.action === "remove" ? "Quité los productos indicados" : "Añadí los productos indicados";
  return { cart: nextCart, reply: `${description}. Total actual: ${formatUSD(calculateTotal(nextCart))}. ¿Deseas algo más o quieres confirmar?`, confirmed: false };
}
