import pg from "pg";

/** Capa de persistencia: único lugar que ejecuta SQL y abre transacciones. */
let sharedPool;
function pool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("Falta DATABASE_URL. Configura PostgreSQL local en .env.local y ejecuta npm run db:init.");
  }
  if (!sharedPool) sharedPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 8,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 30000
  });
  return sharedPool;
}
function product(row) {
  return row && {
    id: row.id, nombre: row.nombre,
    precioCentavos: row.precio_centavos, activo: row.activo
  };
}
function customer(row) {
  return row && {
    id: row.id, nombre: row.nombre, telefono: row.telefono, creadoEn: row.creado_en
  };
}
function item(row) {
  return {
    productId: row.producto_id, name: row.nombre,
    quantity: Number(row.cantidad), priceCents: Number(row.precio_centavos),
    subtotalCents: Number(row.cantidad) * Number(row.precio_centavos)
  };
}
async function sessionView(db,id) {
  const result = await db.query("SELECT id,cliente_id,estado,creada_en FROM sesiones WHERE id=$1",[id]);
  if (!result.rows.length) return null;
  const lines = await db.query(`
    SELECT si.producto_id,si.cantidad,p.nombre,p.precio_centavos
    FROM sesion_items si JOIN productos p ON p.id=si.producto_id
    WHERE si.sesion_id=$1 ORDER BY si.producto_id`,[id]);
  const items = lines.rows.map(item);
  return {
    id:result.rows[0].id, customerId:result.rows[0].cliente_id,
    status:result.rows[0].estado, createdAt:result.rows[0].creada_en,
    items, totalCents:items.reduce((sum,x)=>sum+x.subtotalCents,0)
  };
}
async function orderView(db,id) {
  const order=await db.query("SELECT * FROM pedidos WHERE id=$1",[id]);
  if (!order.rows.length) return null;
  const lines=await db.query(
    "SELECT producto_id,nombre_producto,cantidad,precio_unitario_centavos FROM pedido_items WHERE pedido_id=$1 ORDER BY producto_id",
    [id]);
  const row=order.rows[0];
  return {id:row.id, sessionId:row.sesion_id, customerId:row.cliente_id,
    status:row.estado, totalCents:row.total_centavos, createdAt:row.creado_en,
    items:lines.rows.map(x=>({productId:x.producto_id,name:x.nombre_producto,
      quantity:x.cantidad,priceCents:x.precio_unitario_centavos,
      subtotalCents:x.cantidad*x.precio_unitario_centavos}))};
}
export const postgresRepository={
  async listProducts() {
    const r=await pool().query("SELECT * FROM productos ORDER BY id");
    return r.rows.map(product);
  },
  async createProduct(data) {
    const r=await pool().query(
      "INSERT INTO productos (id,nombre,precio_centavos) VALUES ($1,$2,$3) RETURNING *",
      [data.id,data.nombre,data.precioCentavos]);
    return product(r.rows[0]);
  },
  async updateProduct(id,patch) {
    const changes=[],values=[id];
    if ("nombre" in patch) {values.push(patch.nombre);changes.push(`nombre=$${values.length}`);}
    if ("precioCentavos" in patch) {values.push(patch.precioCentavos);changes.push(`precio_centavos=$${values.length}`);}
    if ("activo" in patch) {values.push(patch.activo);changes.push(`activo=$${values.length}`);}
    const result=await pool().query(`UPDATE productos SET ${changes.join(",")} WHERE id=$1 RETURNING *`,values);
    return product(result.rows[0]);
  },
  async listCustomers() {
    const r=await pool().query("SELECT * FROM clientes ORDER BY creado_en DESC LIMIT 100");
    return r.rows.map(customer);
  },
  async getCustomer(id) {
    const r=await pool().query("SELECT id FROM clientes WHERE id=$1",[id]);
    return r.rows[0] ?? null;
  },
  async createCustomer(data) {
    const r=await pool().query(
      "INSERT INTO clientes(nombre,telefono) VALUES($1,$2) RETURNING *",[data.nombre,data.telefono]);
    return customer(r.rows[0]);
  },
  async createSession(customerId) {
    const r=await pool().query("INSERT INTO sesiones(cliente_id) VALUES($1) RETURNING id",[customerId]);
    return sessionView(pool(),r.rows[0].id);
  },
  getSession(id) {return sessionView(pool(),id);},
  async withSession(id,callback) {
    const client=await pool().connect();
    try {
      await client.query("BEGIN");
      // Bloquear la sesión garantiza atomicidad y evita confirmar dos veces.
      const r=await client.query("SELECT * FROM sesiones WHERE id=$1 FOR UPDATE",[id]);
      const session=r.rows[0] ?? null;
      const tx={
        session,
        async getProduct(productId) {
          const q=await client.query("SELECT * FROM productos WHERE id=$1",[productId]);
          return product(q.rows[0]);
        },
        async getItems() {
          const q=await client.query(`SELECT si.producto_id, si.cantidad,p.nombre,p.precio_centavos
            FROM sesion_items si JOIN productos p ON p.id=si.producto_id
            WHERE si.sesion_id=$1 ORDER BY si.producto_id`,[id]);
          return q.rows.map(item);
        },
        async setQuantity(productId,quantity) {
          if (quantity===0) {
            await client.query("DELETE FROM sesion_items WHERE sesion_id=$1 AND producto_id=$2",[id,productId]);
          } else {
            await client.query(`INSERT INTO sesion_items (sesion_id,producto_id,cantidad) VALUES($1,$2,$3)
              ON CONFLICT(sesion_id,producto_id) DO UPDATE SET cantidad=EXCLUDED.cantidad`,[id,productId,quantity]);
          }
        },
        getSession() {return sessionView(client,id);},
        async createOrder(items,totalCents) {
          const saved=await client.query(`INSERT INTO pedidos(sesion_id,cliente_id,total_centavos)
            VALUES ($1,$2,$3) RETURNING id`,[id,session.cliente_id,totalCents]);
          const orderId=saved.rows[0].id;
          for(const i of items) {
            await client.query(`INSERT INTO pedido_items
              (pedido_id,producto_id,nombre_producto,cantidad,precio_unitario_centavos)
              VALUES($1,$2,$3,$4,$5)`,[orderId,i.productId,i.name,i.quantity,i.priceCents]);
          }
          await client.query("UPDATE sesiones SET estado='confirmada' WHERE id=$1",[id]);
          return orderView(client,orderId);
        }
      };
      const result=await callback(tx);
      await client.query("COMMIT");
      return result;
    }catch(e) {
      await client.query("ROLLBACK").catch(()=>{});
      throw e;
    }finally{client.release();}
  },
  async listOrders(){
    const q=await pool().query("SELECT id,sesion_id,cliente_id,total_centavos,estado,creado_en FROM pedidos ORDER BY creado_en DESC LIMIT 100");
    return q.rows.map(x=>({id:x.id,sessionId:x.sesion_id,customerId:x.cliente_id,
      totalCents:x.total_centavos,status:x.estado,createdAt:x.creado_en}));
  },
  getOrder(id){return orderView(pool(),id);}
};
