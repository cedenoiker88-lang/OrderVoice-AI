import type { Command } from "./order-engine";
import type { CartItem } from "./menu";

export type PizzaFlavor = "pepperoni" | "hawaiana" | "margarita";
export type PizzaSize = "mediana" | "familiar";
export type PendingPizza = {
  flavor?: PizzaFlavor;
  size?: PizzaSize;
  quantity: number;
};
export type PizzaTurn = { pending: PendingPizza | null; command: Command };

function clean(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function sanitizePending(value: unknown): PendingPizza | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const flavor = record.flavor;
  const size = record.size;
  const quantity = record.quantity;
  if (flavor !== undefined && !["pepperoni", "hawaiana", "margarita"].includes(String(flavor))) return null;
  if (size !== undefined && !["mediana", "familiar"].includes(String(size))) return null;
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) return null;
  return { flavor: flavor as PizzaFlavor | undefined, size: size as PizzaSize | undefined, quantity };
}

function quantityIn(text: string): number | undefined {
  const words: Record<string, number> = {
    un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
    seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10
  };
  const match = text.match(/\b(\d+|una|uno|un|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b/);
  return match ? words[match[1]] ?? Number(match[1]) : undefined;
}

function question(text: string, pending: PendingPizza | null): PizzaTurn {
  return { pending, command: { action: "question", items: [], answer: text, needsClarification: true } };
}

/**
 * Gestiona pedidos de UNA línea de pizza, reuniendo sabor, tamaño y cantidad entre turnos.
 * Se ejecuta antes de la IA para que una pregunta de aclaración no pierda los datos previos.
 * Nunca inventa sabores ni ofrece bebidas como sabores de pizza.
 */
export function advancePizzaConversation(message: string, pending: PendingPizza | null, cart: CartItem[] = []): PizzaTurn | null {
  const text = clean(message);
  const pizzaWord = /\bpizzas?\b/.test(text);
  const flavor: PizzaFlavor | undefined = /\bpep{1,2}eroni\b/.test(text) ? "pepperoni"
    : /\bhawaianas?\b/.test(text) ? "hawaiana"
    : /\bmargaritas?\b/.test(text) ? "margarita" : undefined;
  const size: PizzaSize | undefined = /\bfamiliar(?:es)?\b/.test(text) ? "familiar"
    : /\bmedian[oa]s?\b/.test(text) ? "mediana" : undefined;

  // Correcciones como "mejor que sea de pepperoni" después de añadir una pizza.
  // Solo se sustituyen automáticamente cuando hay una única pizza de cantidad 1.
  if (!pending && /\b(mejor|que sea|quiero que sea|prefiero)\b/.test(text) && (flavor || size) && !pizzaWord) {
    const pizzas = cart.filter((item) => item.productId !== "gaseosa");
    if (pizzas.length !== 1 || pizzas[0].quantity !== 1) {
      return question("¿Qué pizza quieres modificar? Indica la pizza actual y el nuevo sabor o tamaño.", null);
    }
    const original = pizzas[0];
    const [oldFlavor, oldSize] = original.productId.split("-") as [PizzaFlavor, PizzaSize];
    const targetFlavor = flavor ?? oldFlavor;
    const targetSize = size ?? oldSize;
    const targetId = targetFlavor + "-" + targetSize;
    if (targetId === original.productId) {
      return question("Esa pizza ya tiene ese sabor y tamaño. ¿Deseas agregar algo más?", null);
    }
    return {
      pending: null,
      command: {
        action: "replace", items: [],
        replacements: [{ fromProductId: original.productId, toProductId: targetId, quantity: 1 }],
        answer: "", needsClarification: false
      }
    };
  }

  if (pending) {
    if (/\b(olvida|descarta)\b.*\b(pizza|pedido)|\bno quiero esa pizza\b/.test(text)) {
      return question("Entendido, descarté esa pizza pendiente. ¿Qué deseas pedir ahora?", null);
    }
    if (/\b(confirmo|confirmar|finalizar|hacer el pedido)\b/.test(text)) {
      return question("Antes de confirmar, dime los datos que faltan de la pizza o pide descartar esa pizza.", pending);
    }
    // Otras operaciones pueden manejarse con el motor sin perder la pizza pendiente.
    if (/\b(cuanto|total|quitar|quita|eliminar|gaseosa|refresco|cola|cambia|reemplaza|vaciar|limpiar)\b/.test(text)) return null;
  } else {
    // Solo iniciar una aclaración para una pizza solicitada; no interceptar consultas,
    // reemplazos, ni pedidos compuestos que el motor ya maneja.
    if (!pizzaWord || /\b(cambia|reemplaza|sustituye|quita|elimina|cuanto|total|precio|menu|tienen)\b/.test(text) ||
        /\s+y\s+|,|;/.test(text)) return null;
  }

  if (!pending && !pizzaWord) return null;
  const requestedQuantity = quantityIn(text);
  const quantity = requestedQuantity ?? pending?.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
    return question("Puedo tomar entre 1 y 20 pizzas por producto. ¿Qué cantidad deseas?", pending);
  }

  const next: PendingPizza = {
    flavor: flavor ?? pending?.flavor,
    size: size ?? pending?.size,
    quantity
  };
  if (!next.flavor) return question("¿De qué sabor deseas la pizza? Tenemos pepperoni, hawaiana y margarita.", next);
  if (!next.size) return question("¿Qué tamaño quieres para la pizza " + next.flavor + ": mediana o familiar?", next);
  return {
    pending: null,
    command: {
      action: "add",
      items: [{ productId: next.flavor + "-" + next.size, quantity: next.quantity }],
      answer: "",
      needsClarification: false
    }
  };
}
