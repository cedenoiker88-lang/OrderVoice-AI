import { calculateTotal, formatUSD, type CartItem } from "./menu";

/**
 * Normaliza respuestas en los casos de demostración que ya tienen
 * audio pregrabado. La decisión se basa en el estado del carrito
 * (no únicamente en la transcripción, que puede variar).
 *
 * IMPORTANTE: Nunca reproduce audio sobre un producto/cantidad que no
 * corresponda exactamente al carrito confirmado por el motor.
 */
export function phoneDemoReply(
  before: CartItem[],
  after: CartItem[],
  actualReply: string,
  orderConfirmed: boolean
): { text: string; key: string } | null {
  if (orderConfirmed || after.length !== 1 || after[0].quantity !== 1) return null;
  const same = before.length === after.length &&
    before.every((x, i) => x.productId === after[i].productId && x.quantity === after[i].quantity);
  const total = calculateTotal(after);
  if (!same && before.length === 0 &&
      after[0].productId === "pepperoni-familiar" && total === 1400 &&
      /^Añadí\b/.test(actualReply)) {
    return {
      key: "pepperoni-familiar",
      text: `Añadí 1 unidad de pizza pepperoni familiar. Total actual: ${formatUSD(1400)}. ¿Deseas algo más o quieres confirmar?`
    };
  }
  if (!same && before.length === 1 &&
      before[0].productId === "pepperoni-familiar" && before[0].quantity === 1 &&
      after[0].productId === "hawaiana-mediana" && total === 1000 &&
      /^Realicé el cambio solicitado\b/.test(actualReply)) {
    return {
      key: "cambio-hawaiana-mediana",
      text: `Realicé el cambio solicitado. Total actual: ${formatUSD(1000)}. ¿Deseas algo más o quieres confirmar?`
    };
  }
  if (same && /^El total actual es\b/.test(actualReply) &&
      after[0].productId === "pepperoni-familiar" && total === 1400) {
    return {
      key: "total-pepperoni-familiar",
      text: `El total actual es ${formatUSD(1400)}. ¿Deseas agregar algo o confirmar?`
    };
  }
  if (same && /^El total actual es\b/.test(actualReply) &&
      after[0].productId === "hawaiana-mediana" && total === 1000) {
    return {
      key: "total-hawaiana-mediana",
      text: `El total actual es ${formatUSD(1000)}. ¿Deseas agregar algo o confirmar?`
    };
  }
  return null;
}
