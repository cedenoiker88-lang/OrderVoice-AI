import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { POST as chatPOST } from "@/app/api/chat/route";
import { productById, type CartItem } from "@/lib/menu";
import type { PendingPizza } from "@/lib/pizza-dialogue";
import { makePhoneAudioUrl } from "@/lib/phone-tts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Session = {
  cart: CartItem[];
  pending: PendingPizza | null;
  history: { role: "user" | "assistant"; text: string }[];
  turns: number;
  updatedAt: number;
};

const sessions = new Map<string, Session>();
const SESSION_TTL_MS = 15 * 60_000;
const MAX_SESSIONS = 30;
const MAX_TURNS = 15;

function xml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function twiml(body: string) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" }
  });
}
function say(text: string) {
  // Voz básica del proveedor; más adelante se reemplaza por Piper local.
  return `<Say language="es-ES" voice="woman">${xml(text.slice(0, 700))}</Say>`;
}
async function spoken(text: string): Promise<string> {
  // Si OpenAI no está habilitado o supera el límite de espera, conserva <Say>
  // y permite que el cliente siga conversando sin depender de una API externa.
  const url = await makePhoneAudioUrl(text);
  return url ? `<Play>${xml(url)}</Play>` : say(text);
}
async function listen(prompt: string, trialSecret: string | null = null) {
  const base = process.env.TWILIO_PUBLIC_BASE_URL?.replace(/\/$/, "");
  const path = "/api/telephony/twilio";
  const action = base ? base + path + (trialSecret ? "?trial_key=" + encodeURIComponent(trialSecret) : "") : "";
  const promptAudio = await spoken(prompt);
  return twiml(`<Gather input="speech" language="es-ES" speechTimeout="auto" timeout="6" actionOnEmptyResult="true" method="POST" action="${xml(action)}">${promptAudio}</Gather>${say("No recibí respuesta. Terminamos esta llamada de prueba. Hasta luego.")}<Hangup/>`);
}
async function farewell(text: string) {
  return twiml((await spoken(text)) + "<Hangup/>");
}

function validSignature(url: string, params: URLSearchParams, signature: string, token: string) {
  let data = url;
  const keys = [...new Set(params.keys())].sort();
  for (const key of keys) data += key + (params.get(key) ?? "");
  const expected = createHmac("sha1", token).update(data).digest("base64");
  const actual = Buffer.from(signature, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return actual.length === expectedBytes.length && timingSafeEqual(actual, expectedBytes);
}

// En llamadas telefónicas es importante repetir los artículos añadidos,
// no solo decir "los productos indicados". El carrito validado sigue siendo
// la única fuente de verdad para cantidades y precios.
function describeAdditions(before: CartItem[], after: CartItem[]): string | null {
  const previous = new Map(before.map((item) => [item.productId, item.quantity]));
  const additions = after.flatMap((item) => {
    const difference = item.quantity - (previous.get(item.productId) ?? 0);
    const product = productById(item.productId);
    return difference > 0 && product
      ? [`${difference} ${difference === 1 ? "unidad" : "unidades"} de ${product.name.toLowerCase()}`]
      : [];
  });
  return additions.length ? `Añadí ${additions.join(" y ")}` : null;
}

/**
 * Solo para pruebas temporales: una URL difícil de adivinar sustituye la firma
 * cuando el intermediario de Try out Voice no la envía. No habilitar en producción.
 * Se exige un secreto aleatorio de 32 bytes (64 caracteres hexadecimales).
 */
function validTrialSecret(actual: string, expected: string | undefined): boolean {
  if (!expected || !/^[a-f0-9]{64}$/i.test(expected) || !/^[a-f0-9]{64}$/i.test(actual)) return false;
  const incoming = Buffer.from(actual.toLowerCase(), "utf8");
  const stored = Buffer.from(expected.toLowerCase(), "utf8");
  return timingSafeEqual(incoming, stored);
}

function cleanup() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.updatedAt > SESSION_TTL_MS) sessions.delete(id);
  }
  if (sessions.size >= MAX_SESSIONS) {
    const oldest = [...sessions].sort((a, b) => a[1].updatedAt - b[1].updatedAt)[0];
    if (oldest) sessions.delete(oldest[0]);
  }
}

export async function POST(request: NextRequest) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  const publicBase = process.env.TWILIO_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (!token || !publicBase || !publicBase.startsWith("https://")) {
    return new NextResponse("Servicio telefónico no configurado", { status: 503 });
  }
  if (!(request.headers.get("content-type") ?? "").includes("application/x-www-form-urlencoded")) {
    return new NextResponse("Formato no autorizado", { status: 415 });
  }
  const raw = await request.text();
  if (raw.length > 12_000) return new NextResponse("Solicitud demasiado grande", { status: 413 });
  const params = new URLSearchParams(raw);
  const externalUrl = publicBase + "/api/telephony/twilio" + request.nextUrl.search;
  const providedSignature = request.headers.get("x-twilio-signature") ?? "";
  const trialSecret = request.nextUrl.searchParams.get("trial_key") ?? "";
  const usingTrial = !providedSignature &&
    process.env.TWILIO_TRIAL_MODE === "enabled" &&
    validTrialSecret(trialSecret, process.env.TWILIO_TRIAL_WEBHOOK_SECRET);
  if (!providedSignature && !usingTrial) {
    // No registrar el token, el valor de la firma, los teléfonos ni el cuerpo del webhook.
    console.warn("[Twilio webhook] Firma ausente; solicitud rechazada.");
    return new NextResponse("Firma Twilio inválida", { status: 403 });
  }
  // Si el request trae una firma, SIEMPRE la verificamos. Una firma equivocada
  // no se puede eludir incluyendo la clave de prueba.
  if (providedSignature && !validSignature(externalUrl, params, providedSignature, token)) {
    // Solo se registran indicadores booleanos para distinguir URL de firma incorrecta.
    // Una coincidencia con una variante no la convierte automáticamente en confiable.
    const urlWithSlash = publicBase + "/api/telephony/twilio/" + request.nextUrl.search;
    const alternateSlashMatches = validSignature(urlWithSlash, params, providedSignature, token);
    const hostHeader = request.headers.get("host") ?? "";
    const forwardedProto = request.headers.get("x-forwarded-proto");
    const forwardedMatchesConfigured = hostHeader === new URL(publicBase).host &&
      forwardedProto === "https";
    console.warn("[Twilio webhook] Firma presente pero inválida.", {
      alternateSlashMatches,
      forwardedMatchesConfigured,
      parameterCount: [...params.keys()].length
    });
    return new NextResponse("Firma Twilio inválida", { status: 403 });
  }
  const callSid = params.get("CallSid") ?? "";
  if (!/^CA[a-f0-9]{32}$/i.test(callSid)) {
    return new NextResponse("Identificador de llamada inválido", { status: 400 });
  }

  cleanup();
  const speech = params.get("SpeechResult")?.trim().slice(0, 500) ?? "";
  let session = sessions.get(callSid);
  if (!session) {
    session = { cart: [], pending: null, history: [], turns: 0, updatedAt: Date.now() };
    sessions.set(callSid, session);
    if (!speech) {
      return listen("Hola, soy OrderVoice, asistente virtual con voz generada por inteligencia artificial de Pizza Demo. Esta es una llamada de prueba. ¿Qué deseas ordenar?", usingTrial ? trialSecret : null);
    }
  }
  session.updatedAt = Date.now();
  if (!speech) return listen("No te escuché bien. Por favor, repite tu pedido.", usingTrial ? trialSecret : null);
  if (session.turns >= MAX_TURNS) {
    sessions.delete(callSid);
    return farewell("Hemos llegado al límite de esta llamada de prueba. Gracias por comunicarte.");
  }
  session.turns += 1;
  try {
    const internalRequest = new NextRequest("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: speech,
        cart: session.cart,
        pending: session.pending,
        history: session.history.slice(-8)
      })
    });
    const result = await chatPOST(internalRequest);
    if (!result.ok) throw new Error("El motor de pedidos no respondió");
    const data = await result.json() as {
      cart?: CartItem[]; pending?: PendingPizza | null; reply?: string;
      order?: unknown;
    };
    const oldCart = session.cart;
    session.cart = data.cart ?? session.cart;
    session.pending = data.pending ?? null;
    let reply = data.reply?.trim() || "Disculpa, ¿puedes repetir tu pedido?";
    if (reply.startsWith("Añadí los productos indicados.") && data.cart) {
      const details = describeAdditions(oldCart, session.cart);
      if (details) reply = reply.replace("Añadí los productos indicados.", `${details}.`);
    }
    session.history.push({ role: "user", text: speech }, { role: "assistant", text: reply });
    session.history = session.history.slice(-8);
    if (data.order) {
      sessions.delete(callSid);
      return farewell(reply);
    }
    return listen(reply, usingTrial ? trialSecret : null);
  } catch (error) {
    console.error("La llamada de prueba no pudo procesar el turno:", error);
    sessions.delete(callSid);
    return farewell("Disculpa, surgió un problema técnico. Por favor intenta de nuevo más tarde.");
  }
}
