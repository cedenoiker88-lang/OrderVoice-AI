import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createMonolithService } from "../src/application/monolith-service.js";

/**
 * Repositorio doble de prueba: la aplicación solo depende de la interfaz.
 * Las pruebas se ejecutan SIN PostgreSQL ni API externa (Node --test).
 */
function repository() {
  const catalog=new Map([
    ["pepperoni-familiar",{id:"pepperoni-familiar",nombre:"Pizza pepperoni familiar",precioCentavos:1400,activo:true}],
    ["hawaiana-mediana",{id:"hawaiana-mediana",nombre:"Pizza hawaiana mediana",precioCentavos:1000,activo:true}],
    ["gaseosa",{id:"gaseosa",nombre:"Gaseosa 1 litro",precioCentavos:250,activo:true}]
  ]);
  const customers=new Map(), sessions=new Map(), orders=new Map();
  const lines=(items)=>[...items.entries()].map(([productId,quantity])=>{
    const p=catalog.get(productId);
    return {productId,name:p.nombre,quantity,priceCents:p.precioCentavos,subtotalCents:quantity*p.precioCentavos};
  });
  const view=(s)=>({id:s.id,customerId:s.clienteId,status:s.estado,createdAt:s.createdAt,
    items:lines(s.items),totalCents:lines(s.items).reduce((sum,x)=>sum+x.subtotalCents,0)});
  return {
    async listProducts(){return [...catalog.values()];},
    async createProduct(p){if(catalog.has(p.id))throw Object.assign(Error("duplicate"),{code:"23505"});
      const next={...p,activo:true};catalog.set(p.id,next);return next;},
    async updateProduct(id,patch){const p=catalog.get(id);if(!p)return null;Object.assign(p,patch);return {...p};},
    async listCustomers(){return [...customers.values()];},
    async getCustomer(id){return customers.get(id)||null;},
    async createCustomer(data){const id=randomUUID();const c={id,...data,creadoEn:new Date().toISOString()};customers.set(id,c);return c;},
    async createSession(clienteId){const id=randomUUID();const s={id,clienteId,estado:"abierta",createdAt:new Date().toISOString(),items:new Map()};sessions.set(id,s);return view(s);},
    async getSession(id){const s=sessions.get(id);return s?view(s):null;},
    async withSession(id,fn){
      const s=sessions.get(id);
      if(!s)return fn({session:null});
      const copy={...s,items:new Map(s.items)};
      const tx={
        session:copy,
        async getItems(){return lines(copy.items);},
        async getProduct(productId){return catalog.get(productId)||null;},
        async setQuantity(productId,quantity){if(quantity)copy.items.set(productId,quantity);else copy.items.delete(productId);},
        async getSession(){return view(copy);},
        async createOrder(items,totalCents){
          copy.estado="confirmada";const id=randomUUID();
          const o={id,sessionId:copy.id,customerId:copy.clienteId,status:"confirmado",
            totalCents,items:structuredClone(items),createdAt:new Date().toISOString()};
          orders.set(id,o);return o;
        }
      };
      const result=await fn(tx);
      sessions.set(id,copy);
      return result;
    },
    async listOrders(){return [...orders.values()];},
    async getOrder(id){return orders.get(id)||null;}
  };
}
function api(){return createMonolithService(repository());}
async function rejectsCode(action,status,code) {
  await assert.rejects(action,(error)=>error.status===status && error.code===code);
}

test("CU-01, CU-02, CU-03 y CU-04: flujo completo con total correcto y persistencia simulada",async()=>{
  const app=api();
  const client=await app.createCustomer({nombre:"Ana Demo"});
  const s=await app.createSession({clienteId:client.id});
  assert.equal(s.totalCents,0);
  const added=await app.addItem(s.id,{productId:"pepperoni-familiar",quantity:1});
  assert.equal(added.totalCents,1400);
  const changed=await app.replaceItem(s.id,{fromProductId:"pepperoni-familiar",toProductId:"hawaiana-mediana",quantity:1});
  assert.equal(changed.totalCents,1000);
  assert.equal(changed.items[0].productId,"hawaiana-mediana");
  const total=await app.getSession(s.id);
  assert.equal(total.totalCents,1000);
  await rejectsCode(()=>app.confirmSession(s.id,{confirmar:false}),422,"CONFIRMACION_EXPLICITA");
  const order=await app.confirmSession(s.id,{confirmar:true});
  assert.equal(order.totalCents,1000);
  assert.equal(order.items[0].priceCents,1000);
  assert.equal((await app.getOrder(order.id)).id,order.id);
  assert.equal((await app.getSession(s.id)).status,"confirmada");
  await rejectsCode(()=>app.confirmSession(s.id,{confirmar:true}),409,"SESION_CONFIRMADA");
});
test("No confirmar un carrito vacío",async()=>{
  const app=api(), s=await app.createSession({});
  await rejectsCode(()=>app.confirmSession(s.id,{confirmar:true}),422,"CARRITO_VACIO");
});
test("No añadir producto desconocido, sin modificar carrito",async()=>{
  const app=api(),s=await app.createSession({});
  await rejectsCode(()=>app.addItem(s.id,{productId:"inventado",quantity:1}),404,"PRODUCTO_NO_DISPONIBLE");
  assert.equal((await app.getSession(s.id)).items.length,0);
});
test("No aceptar cantidades negativas, decimales o mayor que 20",async()=>{
  const app=api(),s=await app.createSession({});
  for(const n of [-1,0,1.5,21]){
    await rejectsCode(()=>app.addItem(s.id,{productId:"gaseosa",quantity:n}),422,"CANTIDAD_INVALIDA");
  }
  assert.equal((await app.getSession(s.id)).totalCents,0);
});
test("No reemplazar productos que no existen en el carrito",async()=>{
  const app=api(),s=await app.createSession({});
  await rejectsCode(()=>app.replaceItem(s.id,{fromProductId:"pepperoni-familiar",toProductId:"hawaiana-mediana",quantity:1}),422,"CANTIDAD_INSUFICIENTE");
  assert.equal((await app.getSession(s.id)).totalCents,0);
});
test("No quitar más unidades de las disponibles",async()=>{
  const app=api(),s=await app.createSession({});
  await app.addItem(s.id,{productId:"gaseosa",quantity:1});
  await rejectsCode(()=>app.removeItem(s.id,{productId:"gaseosa",quantity:2}),422,"CANTIDAD_INSUFICIENTE");
  assert.equal((await app.getSession(s.id)).totalCents,250);
});
test("No aceptar precio enviado por cliente: fuente única es el catálogo",async()=>{
  const app=api(),s=await app.createSession({});
  const view=await app.addItem(s.id,{productId:"gaseosa",quantity:2,precioCentavos:1});
  assert.equal(view.totalCents,500);
});
test("No cambiar ni añadir en una sesión ya confirmada",async()=>{
  const app=api(),s=await app.createSession({});
  await app.addItem(s.id,{productId:"gaseosa",quantity:1});
  await app.confirmSession(s.id,{confirmar:true});
  await rejectsCode(()=>app.addItem(s.id,{productId:"gaseosa",quantity:1}),409,"SESION_CONFIRMADA");
});
test("Producto sin precio válido, datos de cliente invalidos y UUID inválido",async()=>{
  const app=api();
  await rejectsCode(()=>app.createProduct({id:"pizza-demo",nombre:"Pizza demo",precioCentavos:-1}),422,"PRECIO_INVALIDO");
  await rejectsCode(()=>app.createCustomer({nombre:"A"}),422,"CAMPO_INVALIDO");
  await rejectsCode(()=>app.getSession("no-es-uuid"),400,"ID_INVALIDO");
});
test("Cambios atómicos en múltiples líneas y operaciones inválidas",async()=>{
  const app=api(),s=await app.createSession({});
  await app.addItem(s.id,{productId:"pepperoni-familiar",quantity:1});
  const before=(await app.getSession(s.id)).totalCents;
  await rejectsCode(()=>app.syncCart(s.id,[
    {productId:"pepperoni-familiar",quantity:1},
    {productId:"producto-falso",quantity:1}]),404,"PRODUCTO_NO_DISPONIBLE");
  assert.equal((await app.getSession(s.id)).totalCents,before);
  const updated=await app.syncCart(s.id,[
    {productId:"hawaiana-mediana",quantity:1},
    {productId:"gaseosa",quantity:2}
  ]);
  assert.equal(updated.totalCents,1500);
});
console.log("Pruebas de monolito local: Node test, SIN solicitar APIs externas.");
