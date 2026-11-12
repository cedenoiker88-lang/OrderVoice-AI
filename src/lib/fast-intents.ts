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
  // Cortesía común en dictado. Nunca quitar negaciones ni la pregunta central.
  const text = normalize(message)
    .replace(/^(?:(?:hola|buenas|buenos dias|buenas tardes|buenas noches|oye|disculpa|por favor)[ ,]*)+/, "")
    .replace(/(?: por favor| porfa| gracias)$/, "").trim();

  if (/^(?:cuanto (?:es|cuesta|sale|llevo|debo|pago|tengo que pagar)(?: (?:en total|el total|todo|el pedido|mi pedido|la cuenta))?|cuanto seria(?: en total)?|cuanto voy a pagar|cuanto es la cuenta|cuanto va la cuenta|en cuanto va (?:la cuenta|el pedido)|cual es (?:el )?total(?: del pedido)?|dime (?:el )?total|me dices (?:el )?total|me puedes decir (?:el )?total|total(?: del pedido)?|precio total)$/.test(text)) {
    return command("total");
  }

  // La confirmación solo se reconoce como orden inequívoca, nunca con "¿...?".
  if (/^(?:si |ya |listo )?(?:confirmo(?: (?:el|mi) pedido)?|confirma(?: (?:el|mi) pedido)?|confirmame(?: (?:el|mi) pedido)?|confirmar(?: (?:el|mi) pedido)?|finalizar(?: (?:el|mi) pedido)?|hacer el pedido|realizar el pedido)$/.test(text)) {
    return command("confirm");
  }

  if (/^(?:(?:vaciar|vacia|limpiar|limpia|borrar|borra|cancelar|cancela) (?:el |mi |todo el )?(?:carrito|pedido)|borra todo|vaciar todo)$/.test(text)) {
    return command("clear");
  }

  if (/^(?:que (?:hay|tienen|venden|ofrecen)(?: en el menu)?|que pizzas tienen|que sabores tienen|que bebidas tienen|cual es (?:el |su )?menu|muestrame (?:el )?menu|dime (?:el )?menu|me dices (?:el )?menu)$/.test(text)) {
    const flavors = ["pepperoni", "hawaiana", "margarita"].filter((name) =>
      MENU.some((item) => item.id.startsWith(name + "-")));
    return command("question", [], `Tenemos pizzas de ${flavors.join(", ")}, en tamaños mediano y familiar, además de gaseosa de un litro. ¿Qué deseas pedir?`);
  }

  if (/^(?:hola|buenas|buenos dias|buenas tardes|buenas noches)$/.test(normalize(message))) {
    return command("question", [], "¡Hola! Estoy lista para ayudarte con tu pedido. ¿Qué pizza te gustaría?");
  }
  if (/^(?:no gracias|nada mas|eso es todo)$/.test(text)) {
    return command("question", [], "Perfecto. ¿Deseas confirmar tu pedido? Para hacerlo, di: Confirmo el pedido.");
  }


  // Se admite solo una petición simple de gaseosa. Los pedidos compuestos,
  // negaciones y correcciones quedan para el intérprete habitual.
  const drink = text.match(/^(?:quiero|quisiera|dame|agrega|anade|ponme|me das|necesito|pon|me pones|me puedes dar|me podrias dar|agregame|anademe|sumame)\s+(?:(un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|\d+)\s+)?(?:gaseosas?|colas?|refrescos?|sodas?)(?:\s+(?:de\s+)?(?:un\s+)?(?:1\s+)?litro)?$/);
  if (drink) {
    const quantity = drink[1] ? NUMBER_WORDS[drink[1]] ?? Number(drink[1]) : 1;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      return { action: "question", items: [], answer: "Solo puedo añadir entre 1 y 20 gaseosas. ¿Qué cantidad deseas?", needsClarification: true };
    }
    return command("add", [{ productId: "gaseosa", quantity }]);
  }

  return null;
}
