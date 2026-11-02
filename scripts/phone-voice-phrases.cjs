/**
 * Frases EXACTAS que devuelve el carrito para la demostración principal.
 * No usar frases genéricas: cada sonido debe corresponder a la transacción real.
 */
const currency = cents => new Intl.NumberFormat("es-EC", {
  style: "currency", currency: "USD"
}).format(cents / 100);
const afterChange = amount =>
  "Realicé el cambio solicitado. Total actual: " + currency(amount) +
  ". ¿Deseas algo más o quieres confirmar?";
const afterTotal = amount =>
  "El total actual es " + currency(amount) +
  ". ¿Deseas agregar algo o confirmar?";

module.exports = Object.freeze([
  {
    id: "pepperoni-familiar",
    text: "Añadí 1 unidad de pizza pepperoni familiar. Total actual: " +
      currency(1400) + ". ¿Deseas algo más o quieres confirmar?"
  },
  { id: "cambio-hawaiana-mediana", text: afterChange(1000) },
  { id: "total-pepperoni-familiar", text: afterTotal(1400) },
  { id: "total-hawaiana-mediana", text: afterTotal(1000) }
]);
