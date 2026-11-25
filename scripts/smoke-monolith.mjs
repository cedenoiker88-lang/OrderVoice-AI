/** Verificación HTTP real: requiere Next.js levantado y PostgreSQL ya migrado. */
import assert from "node:assert/strict";
const origin="http://localhost:3000";
async function request(method,path,body) {
  const result=await fetch(origin+path,{method,headers:body===undefined?{}:{"Content-Type":"application/json"},
    body:body===undefined?undefined:JSON.stringify(body)});
  return {status:result.status,data:await result.json()};
}
async function wait(){
  for(let i=0;i<25;i++){
    try{const r=await request("GET","/api/salud");if(r.status===200)return;}
    catch{}
    await new Promise(resolve=>setTimeout(resolve,800));
  }
  throw new Error("No se detectó Next.js con PostgreSQL en http://localhost:3000");
}
await wait();
const client=await request("POST","/api/clientes",{nombre:"Cliente Demo Criterio 2"});
assert.equal(client.status,201);
const customerId=client.data.cliente.id;
const session=await request("POST","/api/sesiones",{clienteId:customerId});
assert.equal(session.status,201);
const id=session.data.sesion.id;
let r=await request("POST",`/api/sesiones/${id}/items`,{productId:"pepperoni-familiar",quantity:1});
assert.equal(r.status,200);assert.equal(r.data.sesion.totalCents,1400);
r=await request("PATCH",`/api/sesiones/${id}/items`,{fromProductId:"pepperoni-familiar",toProductId:"hawaiana-mediana",quantity:1});
assert.equal(r.status,200);assert.equal(r.data.sesion.totalCents,1000);
r=await request("GET",`/api/sesiones/${id}`);
assert.equal(r.status,200);assert.equal(r.data.sesion.totalCents,1000);
r=await request("POST",`/api/sesiones/${id}/confirmar`,{confirmar:false});
assert.equal(r.status,422);
r=await request("POST",`/api/sesiones/${id}/confirmar`,{confirmar:true});
assert.equal(r.status,201);assert.equal(r.data.pedido.totalCents,1000);
const orderId=r.data.pedido.id;
r=await request("GET",`/api/pedidos/${orderId}`);
assert.equal(r.status,200);assert.equal(r.data.pedido.totalCents,1000);
r=await request("POST",`/api/sesiones/${id}/confirmar`,{confirmar:true});
assert.equal(r.status,409);
r=await request("GET","/api/pedidos");
assert.equal(r.status,200);assert.ok(r.data.pedidos.some(p=>p.id===orderId));
r=await request("GET","/api/productos");
assert.equal(r.status,200);assert.ok(r.data.productos.length>=7);
console.log("OK: HTTP/POSTGRESQL CU-01..CU-04, errores 422/409 y consulta persistente de pedido.");
console.log("ID de pedido ficticio verificado:",orderId);
