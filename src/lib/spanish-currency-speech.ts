/**
 * Adapta únicamente el TEXTO HABLADO al español de Ecuador.
 * Edge puede pronunciar "$" como "pesos" según la voz instalada.
 * El historial, los precios y los cálculos permanecen sin cambios.
 */
export function prepareSpanishCurrencySpeech(text: string): string {
  const pronounce = (integerPart: string, decimals: string | undefined): string => {
    const units = Number(integerPart.replace(/\./g, "").replace(/,/g, ""));
    const cents = decimals === undefined ? 0 : Number(decimals);
    const dollarsText = `${units} ${units === 1 ? "dólar" : "dólares"}`;
    if (!cents) return dollarsText;
    return `${dollarsText} con ${cents} ${cents === 1 ? "centavo" : "centavos"}`;
  };

  return text
    // Cantidades del menú con el símbolo $, US$ o prefijo USD.
    // Ejemplos: $41,50 → 41 dólares con 50 centavos; $14,00 → 14 dólares.
    .replace(/(?:\bUSD\s*|\bUS\$\s*|\$\s*)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{2}))?/gi,
      (_matched, integer: string, cents: string | undefined) => pronounce(integer, cents))
    // Si un modelo llega a decir pesos explícitamente, corregir solo la voz
    // (no el mensaje visible ni el valor del carrito).
    .replace(/\bpesos\b/gi, "dólares")
    .replace(/\bpeso\b/gi, "dólar");
}
