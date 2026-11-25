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
// Catálogo creado por el estudiante, validado desde sus propias APIs.
const newId="agua-demo-"+Date.now();
r=await request("POST","/api/productos",{id:newId,nombre:"Agua de prueba",precioCentavos:125});
assert.equal(r.status,201);assert.equal(r.data.producto.precioCentavos,125);
r=await request("PATCH",`/api/productos/${newId}`,{precioCentavos:175});
assert.equal(r.status,200);assert.equal(r.data.producto.precioCentavos,175);
r=await request("POST","/api/productos",{id:newId,nombre:"Agua duplicada",precioCentavos:175});
assert.equal(r.status,409);
r=await request("POST","/api/clientes",{nombre:"A"});
assert.equal(r.status,422);
const directSession=await request("POST","/api/sesiones",{});
assert.equal(directSession.status,201);
r=await request("POST",`/api/sesiones/${directSession.data.sesion.id}/items`,{productId:newId,quantity:2});
assert.equal(r.status,200);assert.equal(r.data.sesion.totalCents,350);
r=await request("POST",`/api/sesiones/${directSession.data.sesion.id}/items`,{productId:newId,quantity:0});
assert.equal(r.status,422);

// Comprueba también el endpoint que usa la interfaz web: interpretación LOCAL.
// Con la transcripción desactivada, ningún paso realiza llamadas a OpenAI.
const chatSession=await request("POST","/api/sesiones",{});
assert.equal(chatSession.status,201);
const chatId=chatSession.data.sesion.id;
r=await request("POST","/api/chat",{sessionId:chatId,message:"Quiero una pizza pepperoni familiar"});
assert.equal(r.status,200);
const a=await request("GET",`/api/sesiones/${chatId}`);
assert.equal(a.status,200);assert.equal(a.data.sesion.totalCents,1400);
r=await request("POST","/api/chat",{sessionId:chatId,message:"Cambia la pepperoni familiar por una hawaiana mediana"});
assert.equal(r.status,200);
const b=await request("GET",`/api/sesiones/${chatId}`);
assert.equal(b.data.sesion.totalCents,1000);
r=await request("POST","/api/chat",{sessionId:chatId,message:"¿Cuánto es el total?"});
assert.equal(r.status,200);
assert.equal(r.data.cart[0].productId,"hawaiana-mediana");
r=await request("POST","/api/chat",{sessionId:chatId,message:"Confirmo mi pedido"});
assert.equal(r.status,200);assert.ok(r.data.order?.id);
assert.equal(r.data.order.totalCents,1000);
r=await request("POST","/api/chat",{sessionId:chatId,message:"Confirmo mi pedido"});
assert.equal(r.status,409);

console.log("OK: HTTP/POSTGRESQL CU-01..CU-04, errores 422/409 y consulta persistente de pedido.");
console.log("OK: APIs de productos y clientes, validaciones 422/409 y chat LOCAL persistente (sin IA externa).");
console.log("ID de pedido ficticio verificado:",orderId);
