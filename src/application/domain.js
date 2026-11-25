/**
 * Reglas de aplicación: no acceden a HTTP, OpenAI, Next.js ni SQL.
 * Los montos siempre se calculan en CENTAVOS (QA-04 / R-01).
 */
export class DomainError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "DomainError";
    this.status = status;
    this.code = code;
  }
}
export function requireObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainError(400,"DATOS_INVALIDOS","El cuerpo debe ser un objeto JSON.");
  }
  return value;
}
export function requireText(value, field, min=2, max=120) {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) {
    throw new DomainError(422,"CAMPO_INVALIDO",`"${field}" debe tener entre ${min} y ${max} caracteres.`);
  }
  return value.trim();
}
export function requireQuantity(value) {
  if (!Number.isInteger(value) || value < 1 || value > 20) {
    throw new DomainError(422,"CANTIDAD_INVALIDA","Cantidad entera entre 1 y 20.");
  }
  return value;
}
export function requirePrice(value) {
  if (!Number.isInteger(value) || value < 0 || value > 10000000) {
    throw new DomainError(422,"PRECIO_INVALIDO","precioCentavos debe ser un entero no negativo.");
  }
  return value;
}
export function requireId(value, field="id") {
  if (typeof value !== "string" || !/^[a-z0-9-]{1,70}$/i.test(value)) {
    throw new DomainError(422,"ID_INVALIDO",`"${field}" no tiene un formato válido.`);
  }
  return value;
}
export function requireUUID(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new DomainError(400,"ID_INVALIDO","El ID debe ser un UUID válido.");
  }
  return value;
}
export function calculateCart(items) {
  return items.reduce((sum, item) => sum + item.quantity * item.priceCents, 0);
}
export function ensureOpen(session) {
  if (!session) throw new DomainError(404,"SESION_NO_ENCONTRADA","No existe esa sesión.");
  if (session.estado !== "abierta") throw new DomainError(409,"SESION_CONFIRMADA","La sesión ya está confirmada; no se puede modificar.");
}
export function ensureProduct(product) {
  if (!product || !product.activo) throw new DomainError(404,"PRODUCTO_NO_DISPONIBLE","Producto inexistente o desactivado.");
}
