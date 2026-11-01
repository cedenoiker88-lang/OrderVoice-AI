import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { POST as chatPOST } from "@/app/api/chat/route";
import type { CartItem } from "@/lib/menu";
import type { PendingPizza } from "@/lib/pizza-dialogue";

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
function listen(prompt: string) {
  const base = process.env.TWILIO_PUBLIC_BASE_URL?.replace(/\/$/, "");
  const action = base ? `${base}/api/telephony/twilio` : "";
  return twiml(`<Gather input="speech" language="es-ES" speechTimeout="auto" timeout="6" actionOnEmptyResult="true" method="POST" action="${xml(action)}">${say(prompt)}</Gather>${say("No recibí respuesta. Terminamos esta llamada de prueba. Hasta luego.")}<Hangup/>`);
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
  if (!validSignature(externalUrl, params, request.headers.get("x-twilio-signature") ?? "", token)) {
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
    return listen("Hola, soy OrderVoice, asistente de Pizza Demo. Esta es una llamada de prueba. ¿Qué deseas ordenar?");
  }
  session.updatedAt = Date.now();
  if (!speech) return listen("No te escuché bien. Por favor, repite tu pedido.");
  if (session.turns >= MAX_TURNS) {
    sessions.delete(callSid);
    return twiml(say("Hemos llegado al límite de esta llamada de prueba. Gracias por comunicarte.") + "<Hangup/>");
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
    session.cart = data.cart ?? session.cart;
    session.pending = data.pending ?? null;
    const reply = data.reply?.trim() || "Disculpa, ¿puedes repetir tu pedido?";
    session.history.push({ role: "user", text: speech }, { role: "assistant", text: reply });
    session.history = session.history.slice(-8);
    if (data.order) {
      sessions.delete(callSid);
      return twiml(say(reply) + "<Hangup/>");
    }
    return listen(reply);
  } catch (error) {
    console.error("La llamada de prueba no pudo procesar el turno:", error);
    sessions.delete(callSid);
    return twiml(say("Disculpa, surgió un problema técnico. Por favor intenta de nuevo más tarde.") + "<Hangup/>");
  }
}
