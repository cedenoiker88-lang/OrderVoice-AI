import { MENU } from "./menu";
import type { Command } from "./order-engine";

// Respuestas frecuentes y inequívocas sin esperar a un modelo de lenguaje.
// Ante una frase ambigua se devuelve null y el proveedor habitual la interpreta.
const NUMBER_WORDS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10
};

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[¿?¡!.,;:]+/g, " ").replace(/\s+/g, " ").trim();
}

function command(action: Command["action"], items: Command["items"] = [], answer = ""): Command {
  return { action, items, answer, needsClarification: false };
}

export function fastUnderstand(message: string): Command | null {
  const text = normalize(message);

  if (/^(?:cuanto (?:es|cuesta|sale|llevo|debo|tengo que pagar)(?: (?:en total|todo|el pedido|mi pedido))?|cuanto seria(?: en total)?|cuanto voy a pagar|cual es (?:el )?total(?: del pedido)?|dime (?:el )?total|total(?: del pedido)?|precio total)$/.test(text)) {
    return command("total");
  }

  if (/^(?:confirmo(?: el pedido)?|si confirmo(?: el pedido)?|confirmar(?: el pedido)?|finalizar(?: el pedido)?|hacer el pedido|realizar el pedido)$/.test(text)) {
    return command("confirm");
  }

  if (/^(?:(?:vaciar|vacia|limpiar|limpia|borrar|borra|cancelar|cancela) (?:el |mi |todo el )?(?:carrito|pedido)|borra todo|vaciar todo)$/.test(text)) {
    return command("clear");
  }

  if (/^(?:que (?:hay|tienen|venden|ofrecen)(?: en el menu)?|que pizzas tienen|cual es (?:el |su )?menu|muestrame (?:el )?menu|dime (?:el )?menu)$/.test(text)) {
    const flavors = ["pepperoni", "hawaiana", "margarita"].filter((name) =>
      MENU.some((item) => item.id.startsWith(name + "-")));
    return command("question", [], `Tenemos pizzas de ${flavors.join(", ")}, en tamaños mediano y familiar, además de gaseosa de un litro. ¿Qué deseas pedir?`);
  }

  // Se admite solo una petición simple de gaseosa. Los pedidos compuestos,
  // negaciones y correcciones quedan para el intérprete habitual.
  const drink = text.match(/^(?:quiero|quisiera|dame|agrega|anade|ponme|me das|necesito|pon)\s+(?:(un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|\d+)\s+)?(?:gaseosas?|colas?|refrescos?)(?:\s+(?:de\s+)?(?:un\s+)?(?:1\s+)?litro)?(?:\s+por favor)?$/);
  if (drink) {
    const quantity = drink[1] ? NUMBER_WORDS[drink[1]] ?? Number(drink[1]) : 1;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      return { action: "question", items: [], answer: "Solo puedo añadir entre 1 y 20 gaseosas. ¿Qué cantidad deseas?", needsClarification: true };
    }
    return command("add", [{ productId: "gaseosa", quantity }]);
  }

  return null;
}
