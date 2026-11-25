import { MENU, formatUSD } from "./menu";
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

  // Una pregunta por el precio o disponibilidad NO debe añadir productos al carrito.
  const price = text.match(/^(?:cuanto (?:cuesta|vale|sale)|que precio tiene|precio de|en cuanto esta|a como esta) (?:la |una |el )?(?:pizza )?(?:de )?(pepperoni|hawaiana|margarita|gaseosa)(?: (mediana|familiar))?$/);
  if (price) {
    const [, flavor, size] = price;
    if (flavor !== "gaseosa" && !size) {
      return command("question", [], `Tenemos pizza ${flavor} mediana y familiar. ¿De qué tamaño deseas saber el precio?`);
    }
    const product = MENU.find((item) => item.id === (flavor === "gaseosa" ? "gaseosa" : `${flavor}-${size}`));
    return command("question", [], product
      ? `${product.name} cuesta ${formatUSD(product.priceCents)}. ¿Deseas pedirla?`
      : "No encontré ese producto en nuestro menú.");
  }
  if (/^(?:tienen|hay|venden|ofrecen) (?:la |una |el )?(?:pizza )?(?:de )?(pepperoni|hawaiana|margarita|gaseosa)(?: (mediana|familiar))?$/.test(text)) {
    return command("question", [], "Sí, ese producto está en el menú de demostración. ¿Qué cantidad deseas pedir?");
  }
  if (/^(?:que (?:lleva|trae|ingredientes tiene|tiene)|cuales son los ingredientes de) (?:la |una |el )?(?:pizza )?(?:de )?(pepperoni|hawaiana|margarita)(?: (mediana|familiar))?$/.test(text)) {
    return command("question", [], "Tengo disponibles los sabores y precios del menú, pero los ingredientes exactos aún no están registrados. ¿Qué deseas pedir?");
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
  // "No, con eso estaría todo" significa no añadir más productos.
  // No confirmar automáticamente: CU-04 exige una confirmación explícita.
  if (/^(?:(?:no|ya) )?(?:con eso (?:estaria|seria) todo|eso (?:es|seria|estaria) todo|con eso esta bien)$/.test(text) ||
      /^(?:ya )?no (?:quiero|deseo|necesito) nada mas$/.test(text) ||
      /^(?:no gracias|nada mas|seria todo|ya seria todo|es todo)$/.test(text)) {
    return command("question", [], "Perfecto, no agregaré nada más. Para guardar tu pedido, di: Confirmo mi pedido.");
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
