import { NextRequest, NextResponse } from "next/server";
import { service, assertLocal, failure } from "@/presentation/http.js";
import { sanitizeCart, formatUSD } from "@/lib/menu";
import { advancePizzaConversation, sanitizePending } from "@/lib/pizza-dialogue";
import { fastUnderstand } from "@/lib/fast-intents";
import { demoUnderstand, guardDestructiveIntent, applyCommand } from "@/lib/order-engine";
import { normalizeVoiceTranscript } from "@/lib/voice-vocabulary";

/**
 * Criterio 2: interpretación LOCAL, sin OpenAI para razonamiento y sin Ollama.
 * La única API externa permitida es /api/browser-transcribe (voz a texto).
 * La sesión y el pedido se almacenan en PostgreSQL mediante tres capas.
 */
export async function POST(request: NextRequest) {
  const started=performance.now();
  try {
    assertLocal(request);
    const body: unknown=await request.json();
    if(!body || typeof body!=="object")return NextResponse.json({error:"Solicitud inválida."},{status:400});
    const raw=body as Record<string,unknown>;
    const message=typeof raw.message==="string"?raw.message.trim():"";
    const sessionId=typeof raw.sessionId==="string"?raw.sessionId:"";
    if(!message || message.length>500 || !sessionId) {
      return NextResponse.json({error:"Se requiere mensaje y sessionId válido."},{status:400});
    }
    const mono=service();
    const current=await mono.getSession(sessionId);
    if(current.status!=="abierta")return NextResponse.json({error:"Esta sesión ya está confirmada."},{status:409});
    const cart=sanitizeCart(current.items.map((item:{productId:string;quantity:number})=>({
      productId:item.productId,quantity:item.quantity
    })));
    const normalized=raw.browserVoice===true?normalizeVoiceTranscript(message):message;
    const pending=sanitizePending(raw.pending);
    const pizzaTurn=advancePizzaConversation(normalized,pending,cart);
    const command=guardDestructiveIntent(normalized,
      pizzaTurn?.command ?? fastUnderstand(normalized) ?? demoUnderstand(normalized));
    const evaluation=applyCommand(cart,command);
    let newPending=pizzaTurn?.pending??pending;
    if(command.action==="confirm" || command.action==="clear")newPending=null;
    let actual=current;
    let order;
    let reply=evaluation.reply;
    if(evaluation.confirmed) {
      order=await mono.confirmSession(sessionId,{confirmar:true});
      reply=`Confirmé tu pedido de ${formatUSD(order.totalCents)}. Es una demostración; no se envía a una cocina real.`;
    } else if(command.action==="total") {
      reply=current.items.length
        ? `El total actual es ${formatUSD(current.totalCents)}. ¿Deseas algo más?`
        : "Tu carrito está vacío. ¿Qué deseas pedir?";
    } else if(command.action==="clear" ||
      (command.action!=="question" && JSON.stringify(cart)!==JSON.stringify(evaluation.cart))) {
      actual=await mono.syncCart(sessionId,evaluation.cart);
      reply=command.action==="replace"
        ? `Realicé el cambio. Total actual: ${formatUSD(actual.totalCents)}. ¿Deseas algo más?`
        : command.action==="remove"
        ? `Quité los productos indicados. Total actual: ${formatUSD(actual.totalCents)}.`
        : command.action==="clear"
        ? "Vacié el carrito. ¿Qué deseas pedir ahora?"
        : `Añadí los productos. Total actual: ${formatUSD(actual.totalCents)}. ¿Deseas algo más?`;
    }
    const ms=Math.round(performance.now()-started);
    return NextResponse.json({
      reply,
      cart:order?[]:actual.items.map((item:{productId:string;quantity:number})=>({
        productId:item.productId,quantity:item.quantity
      })),
      order,
      pending:newPending,
      mode:"local",
      metrics:{interpretMs:ms,serverMs:ms},
      notice:undefined
    },{headers:{"Cache-Control":"no-store"}});
  }catch(error) {
    const response=failure(error);
    const raw=await response.json() as {error?:{message?:string}};
    return NextResponse.json({error:raw.error?.message??"No se pudo procesar el pedido."},
      {status:response.status});
  }
}
