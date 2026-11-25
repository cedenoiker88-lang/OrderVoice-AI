import { DomainError, requireObject, requireText, requireQuantity, requirePrice, requireId, requireUUID, calculateCart, ensureOpen, ensureProduct } from "./domain.js";

/**
 * Capa de aplicación. Solo invoca la interfaz de repositorio inyectada.
 * No sabe cómo PostgreSQL guarda los datos.
 */
export function createMonolithService(repository) {
  return {
    listProducts: () => repository.listProducts(),
    async createProduct(raw) {
      const body = requireObject(raw);
      return repository.createProduct({
        id: requireId(body.id),
        nombre: requireText(body.nombre, "nombre"),
        precioCentavos: requirePrice(body.precioCentavos)
      });
    },
    async updateProduct(id, raw) {
      requireId(id);
      const body = requireObject(raw);
      const patch = {};
      if ("nombre" in body) patch.nombre = requireText(body.nombre, "nombre");
      if ("precioCentavos" in body) patch.precioCentavos = requirePrice(body.precioCentavos);
      if ("activo" in body) {
        if (typeof body.activo !== "boolean") throw new DomainError(422,"CAMPO_INVALIDO","activo debe ser booleano.");
        patch.activo = body.activo;
      }
      if (!Object.keys(patch).length) throw new DomainError(400,"SIN_CAMBIOS","Envía al menos un campo para actualizar.");
      const updated = await repository.updateProduct(id, patch);
      if (!updated) throw new DomainError(404,"PRODUCTO_NO_ENCONTRADO","No existe ese producto.");
      return updated;
    },
    listCustomers: () => repository.listCustomers(),
    async createCustomer(raw) {
      const body = requireObject(raw);
      const nombre = requireText(body.nombre,"nombre",2,100);
      let telefono = null;
      if (body.telefono !== undefined && body.telefono !== null && body.telefono !== "") {
        telefono = requireText(body.telefono, "telefono", 6, 30);
      }
      return repository.createCustomer({ nombre, telefono });
    },
    async createSession(raw={}) {
      const body = requireObject(raw);
      const clienteId = body.clienteId == null ? null : requireUUID(body.clienteId);
      if (clienteId && !(await repository.getCustomer(clienteId))) {
        throw new DomainError(404,"CLIENTE_NO_ENCONTRADO","El cliente indicado no existe.");
      }
      return repository.createSession(clienteId);
    },
    async getSession(sessionId) {
      requireUUID(sessionId);
      const session = await repository.getSession(sessionId);
      if (!session) throw new DomainError(404,"SESION_NO_ENCONTRADA","No existe esa sesión.");
      return session;
    },
    async addItem(sessionId, raw) {
      requireUUID(sessionId);
      const body = requireObject(raw);
      const productId = requireId(body.productId,"productId");
      const quantity = requireQuantity(body.quantity);
      return repository.withSession(sessionId, async (tx) => {
        ensureOpen(tx.session);
        const product = await tx.getProduct(productId);
        ensureProduct(product);
        const current = await tx.getItems();
        const existing = current.find(item => item.productId === productId);
        if ((existing?.quantity ?? 0) + quantity > 20) {
          throw new DomainError(422,"CANTIDAD_EXCEDIDA","Máximo 20 unidades por producto.");
        }
        await tx.setQuantity(productId, (existing?.quantity ?? 0) + quantity);
        return tx.getSession();
      });
    },
    async replaceItem(sessionId, raw) {
      requireUUID(sessionId);
      const body = requireObject(raw);
      const fromProductId = requireId(body.fromProductId,"fromProductId");
      const toProductId = requireId(body.toProductId,"toProductId");
      const quantity = requireQuantity(body.quantity);
      if (fromProductId === toProductId) throw new DomainError(422,"SIN_CAMBIOS","El producto original y el nuevo son iguales.");
      return repository.withSession(sessionId, async (tx) => {
        ensureOpen(tx.session);
        const dest = await tx.getProduct(toProductId);
        ensureProduct(dest);
        const items = await tx.getItems();
        const old = items.find(i => i.productId === fromProductId);
        const current = items.find(i => i.productId === toProductId);
        if (!old || old.quantity < quantity) throw new DomainError(422,"CANTIDAD_INSUFICIENTE","No tienes esa cantidad del producto original.");
        if ((current?.quantity ?? 0) + quantity > 20) throw new DomainError(422,"CANTIDAD_EXCEDIDA","Máximo 20 unidades por producto.");
        await tx.setQuantity(fromProductId, old.quantity - quantity);
        await tx.setQuantity(toProductId, (current?.quantity ?? 0) + quantity);
        return tx.getSession();
      });
    },
    async removeItem(sessionId, raw) {
      requireUUID(sessionId);
      const body = requireObject(raw);
      const productId = requireId(body.productId,"productId");
      const quantity = requireQuantity(body.quantity);
      return repository.withSession(sessionId, async (tx) => {
        ensureOpen(tx.session);
        const existing = (await tx.getItems()).find(i => i.productId === productId);
        if (!existing || existing.quantity < quantity) throw new DomainError(422,"CANTIDAD_INSUFICIENTE","No tienes esa cantidad para quitar.");
        await tx.setQuantity(productId, existing.quantity - quantity);
        return tx.getSession();
      });
    },
    async confirmSession(sessionId, raw) {
      requireUUID(sessionId);
      const body = requireObject(raw);
      if (body.confirmar !== true) throw new DomainError(422,"CONFIRMACION_EXPLICITA","Envía confirmar=true para registrar el pedido.");
      return repository.withSession(sessionId, async (tx) => {
        ensureOpen(tx.session);
        const items = await tx.getItems();
        if (!items.length) throw new DomainError(422,"CARRITO_VACIO","No se puede confirmar un carrito vacío.");
        const total = calculateCart(items);
        const order = await tx.createOrder(items,total);
        return order;
      });
    },
    listOrders: () => repository.listOrders(),
    async getOrder(id) {
      requireUUID(id);
      const order = await repository.getOrder(id);
      if (!order) throw new DomainError(404,"PEDIDO_NO_ENCONTRADO","No existe ese pedido.");
      return order;
    }
  };
}
