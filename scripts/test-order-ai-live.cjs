/*
 * Evaluación opcional contra el SERVIDOR REAL: llama a /api/chat y CONSUME
 * créditos de OpenAI cuando ORDERVOICE_PROVIDER=openai.
 * Solo se ejecuta con ORDERVOICE_RUN_PAID_EVAL=YES.
 * NO llama a Twilio ni a la transcripción: usa frases ya transcritas.
 */
const assert = require("node:assert/strict");
const base = process.env.ORDERVOICE_EVAL_URL || "http://localhost:3000";
if (process.env.ORDERVOICE_RUN_PAID_EVAL !== "YES") {
  console.error("Evaluación de pago desactivada. Para activarla, usa $env:ORDERVOICE_RUN_PAID_EVAL='YES'");
  process.exit(2);
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let passed = 0, failed = 0, billed = 0;
function norm(items) {
  return [...items].map(({productId,quantity})=>({productId,quantity}))
    .sort((a,b)=>a.productId.localeCompare(b.productId));
}
async function caseRun(label, message, startCart, expected, opts={}) {
  const started=Date.now();
  try {
    const response=await fetch(base+"/api/chat", {
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({message,browserVoice:true,cart:startCart,pending:null,history:[]}),
      signal:AbortSignal.timeout(30000)
    });
    const result=await response.json();
    if (!response.ok) throw new Error("HTTP "+response.status+": "+(result.error||"error"));
    billed++;
    assert.equal(result.mode,"ia","Se esperaba IA de OpenAI. Comprueba ORDERVOICE_PROVIDER=openai.");
    assert.deepEqual(norm(result.cart||[]),norm(expected));
    if(opts.confirm)assert.ok(result.order,"No se confirmó el pedido");
    if(opts.notConfirm)assert.equal(result.order,undefined,"No se debe confirmar");
    passed++;
    console.log("OK", label, Date.now()-started+"ms", String(result.reply).slice(0,90));
  }catch(error){
    failed++;
    console.error("FALLO",label,error.message);
  }
  await sleep(250);
}
const P=(id,quantity)=>({productId:id,quantity});
(async()=>{
  await caseRun("Añadir varios productos", "Quiero una pizza de pepperoni familiar y dos gaseosas",[],[P("pepperoni-familiar",1),P("gaseosa",2)]);
  await caseRun("Cambiar pizza", "No, mejor cambiala por una hawaiana mediana",[P("pepperoni-familiar",1)],[P("hawaiana-mediana",1)]);
  await caseRun("Agregar más de un sabor", "Me das dos pizzas margaritas medianas y una hawaiana familiar",[],[P("margarita-mediana",2),P("hawaiana-familiar",1)]);
  await caseRun("Eliminar una bebida", "Elimina una de las dos gaseosas",[P("gaseosa",2)],[P("gaseosa",1)]);
  await caseRun("Fijar cantidad final", "No, deja solo una gaseosa y mantén las pizzas",[P("gaseosa",2),P("pepperoni-familiar",1)],[P("gaseosa",1),P("pepperoni-familiar",1)]);
  await caseRun("Estado final del ejemplo real",
    "No, quiero eliminar la pizza pepperoni familiar y también eliminar una gaseosa. Solamente quedaría una gaseosa y una pizza margarita mediana.",
    [P("pepperoni-familiar",2),P("gaseosa",2),P("margarita-mediana",1)],
    [P("gaseosa",1),P("margarita-mediana",1)]);
  await caseRun("No quitar por negación","No quiero que elimines mi pizza",
    [P("pepperoni-familiar",1)],[P("pepperoni-familiar",1)]);
  await caseRun("No agregar por negación","No agregues ninguna gaseosa",
    [P("pepperoni-familiar",1)],[P("pepperoni-familiar",1)]);
  await caseRun("Pregunta sin añadir","¿Cuánto cuesta la pizza hawaiana familiar?",[],[]);
  await caseRun("Consulta total","¿En cuánto va la cuenta?",[P("pepperoni-familiar",1)],[P("pepperoni-familiar",1)]);
  await caseRun("Producto inexistente","Quiero una pizza de pollo mediana",[],[]);
  await caseRun("Pedido incompleto","Quiero dos pizzas grandes",[],[]);
  await caseRun("No confirmar en pregunta","¿Confirmo mi pedido?",[P("gaseosa",1)],[P("gaseosa",1)],{notConfirm:true});
  await caseRun("Confirmación explícita","Confirmo mi pedido",[P("gaseosa",1)],[P("gaseosa",1)],{confirm:true});
  await caseRun("Quitar más de lo existente","Quita 3 gaseosas",[P("gaseosa",2)],[P("gaseosa",2)]);
  console.log(`RESULTADOS: ${passed} correctos, ${failed} fallidos, ${billed} respuestas procesadas por OpenAI. (Cada consulta puede tener costo.)`);
  process.exitCode=failed?1:0;
})().catch((err)=>{console.error(err);process.exitCode=1});
