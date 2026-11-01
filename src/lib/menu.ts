/** Menú ficticio. Los precios se guardan en CENTAVOS, nunca como float. */
export const MENU = [
  { id: "pepperoni-mediana", name: "Pizza pepperoni mediana", priceCents: 900, emoji: "🍕" },
  { id: "pepperoni-familiar", name: "Pizza pepperoni familiar", priceCents: 1400, emoji: "🍕" },
  { id: "hawaiana-mediana", name: "Pizza hawaiana mediana", priceCents: 1000, emoji: "🍍" },
  { id: "hawaiana-familiar", name: "Pizza hawaiana familiar", priceCents: 1500, emoji: "🍍" },
  { id: "margarita-mediana", name: "Pizza margarita mediana", priceCents: 850, emoji: "🧀" },
  { id: "margarita-familiar", name: "Pizza margarita familiar", priceCents: 1350, emoji: "🧀" },
  { id: "gaseosa", name: "Gaseosa 1 litro", priceCents: 250, emoji: "🥤" },
] as const;

export type ProductId = (typeof MENU)[number]["id"];
export type CartItem = { productId: ProductId; quantity: number };
export type ConfirmedOrder = { id: string; createdAt: string; items: CartItem[]; totalCents: number };

export const formatUSD = (cents: number) =>
  new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(cents / 100);

export function productById(id: string) {
  return MENU.find((item) => item.id === id);
}
export function calculateTotal(cart: CartItem[]) {
  return cart.reduce((sum, line) => sum + (productById(line.productId)?.priceCents ?? 0) * line.quantity, 0);
}
export function sanitizeCart(candidate: unknown): CartItem[] {
  if (!Array.isArray(candidate)) return [];
  const quantities = new Map<ProductId, number>();
  for (const item of candidate.slice(0, 40)) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const product = typeof raw.productId === "string" ? productById(raw.productId) : undefined;
    const quantity = raw.quantity;
    if (!product || typeof quantity !== "number" || !Number.isInteger(quantity) || quantity <= 0 || quantity > 20) continue;
    quantities.set(product.id, Math.min(20, (quantities.get(product.id) ?? 0) + quantity));
  }
  return [...quantities].map(([productId, quantity]) => ({ productId, quantity }));
}
