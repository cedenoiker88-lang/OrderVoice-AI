import { createHmac, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { POST as chatPOST } from "@/app/api/chat/route";
import { productById, type CartItem } from "@/lib/menu";
import type { PendingPizza } from "@/lib/pizza-dialogue";
import { makePhoneAudioUrl } from "@/lib/phone-tts";
import { beginPhoneVoiceJob } from "@/lib/phone-voice-jobs";
import { preparedVoiceUrl } from "@/lib/phone-voice-pack";
import { savePhoneClip, telephoneWavFromPcm24 } from "@/lib/phone-audio";

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
const DEMO_GREETING = "Hola, soy OrderVoice, tu asistente virtual. ¿Qué deseas pedir hoy?";

function cachedGreetingUrl(text: string): string | null {
  if (text !== DEMO_GREETING || process.env.ORDERVOICE_TTS_PROVIDER !== "openai") return null;
  const base = process.env.TWILIO_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (!base?.startsWith("https://")) return null;
  const filename = join(process.cwd(), ".ordervoice-cache", "greeting.wav");
  if (!existsSync(filename)) return null;
  try {
    const wav = readFileSync(filename);
    const isPcm24 = wav.length > 44 && wav.toString("ascii", 0, 4) === "RIFF" &&
      wav.toString("ascii", 8, 12) === "WAVE" &&
      wav.readUInt16LE(20) === 1 && wav.readUInt16LE(22) === 1 &&
      wav.readUInt32LE(24) === 24_000 && wav.readUInt16LE(34) === 16 &&
      wav.toString("ascii", 36, 40) === "data" &&
      wav.readUInt32LE(40) === wav.length - 44;
    if (!isPcm24) throw new Error("Formato de audio no compatible");
    const prepared = telephoneWavFromPcm24(wav.subarray(44));
    return `${base}/api/telephony/audio?id=${savePhoneClip(prepared)}`;
  } catch {
    console.warn("[OrderVoice voz] El saludo pregrabado no se pudo cargar; se usará síntesis o respaldo.");
    return null;
  }
}

function say(text: string) {
  // Voz básica del proveedor; más adelante se reemplaza por Piper local.
  return `<Say language="es-ES" voice="woman">${xml(text.slice(0, 700))}</Say>`;
}
async function spoken(text: string, skipTts = false, maxWaitMs?: number): Promise<string> {
  // Solo las pruebas autenticadas usan el encabezado de omisión de TTS.
  if (skipTts) return say(text);
  // Si OpenAI no está habilitado o supera el límite de espera, conserva <Say>
  // y permite que el cliente siga conversando sin depender de una API externa.
  const preRecorded = cachedGreetingUrl(text);
  if (preRecorded) {
    console.info("[OrderVoice voz] Fuente: saludo OpenAI pregrabado.");
    return `<Play>${xml(preRecorded)}</Play>`;
  }
  const url = await makePhoneAudioUrl(text, maxWaitMs);
  if (!url) console.info("[OrderVoice voz] Fuente: Twilio Say (respaldo de voz).");
  return url ? `<Play>${xml(url)}</Play>` : say(text);
}
async function listen(prompt: string, trialSecret: string | null = null, skipTts = false, maxWaitMs?: number) {
  const base = process.env.TWILIO_PUBLIC_BASE_URL?.replace(/\/$/, "");
  const path = "/api/telephony/twilio";
  const action = base ? base + path + (trialSecret ? "?trial_key=" + encodeURIComponent(trialSecret) : "") : "";
  const promptAudio = await spoken(prompt, skipTts, maxWaitMs);
  return twiml(`<Gather input="speech" language="es-ES" speechTimeout="auto" timeout="6" actionOnEmptyResult="true" method="POST" action="${xml(action)}">${promptAudio}</Gather>${say("No recibí respuesta. Terminamos esta llamada de prueba. Hasta luego.")}<Hangup/>`);
}
async function farewell(text: string, skipTts = false, maxWaitMs?: number) {
  return twiml((await spoken(text, skipTts, maxWaitMs)) + "<Hangup/>");
}

function queueSpeech(text: string, trialSecret: string | null, farewellTurn: boolean): NextResponse | null {
  const base = process.env.TWILIO_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (!base?.startsWith("https://")) return null;
  const action = base + "/api/telephony/twilio" +
    (trialSecret ? "?trial_key=" + encodeURIComponent(trialSecret) : "");
  // Si preparamos esta frase antes de llamar, Twilio puede reproducirla
  // en seguida, sin esperar ni cobrar otra solicitud de generación de voz.
  const preRecorded = preparedVoiceUrl(text);
  if (preRecorded) {
    console.info("[OrderVoice voz] Fuente: respuesta OpenAI pregrabada (sin TTS en esta llamada).");
    const play = `<Play>${xml(preRecorded)}</Play>`;
    if (farewellTurn) return twiml(play + "<Hangup/>");
    return twiml(`<Gather input="speech" language="es-ES" speechTimeout="auto" timeout="6" actionOnEmptyResult="true" method="POST" action="${xml(action)}">${play}</Gather>${say("No recibí respuesta. Terminamos esta llamada de prueba. Hasta luego.")}<Hangup/>`);
  }
  const jobId = beginPhoneVoiceJob(text, action, farewellTurn);
  if (!jobId) return null;
  // Twilio recibe una respuesta TwiML inmediata, mientras la API crea
  // el audio fuera de la solicitud que tiene un límite de 15 segundos.
  const statusUrl = base + "/api/telephony/voice-status?id=" + jobId;
  return twiml(`<Pause length="1"/><Redirect method="GET">${xml(statusUrl)}</Redirect>`);
}

async function respondInConversation(text: string, trialSecret: string | null, skipTts: boolean, maxWaitMs: number) {
  const queued = !skipTts ? queueSpeech(text, trialSecret, false) : null;
  return queued ?? listen(text, trialSecret, skipTts, maxWaitMs);
}

async function respondAndFinish(text: string, trialSecret: string | null, skipTts: boolean, maxWaitMs: number) {
  const queued = !skipTts ? queueSpeech(text, trialSecret, true) : null;
  return queued ?? farewell(text, skipTts, maxWaitMs);
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

// Twilio espera máximo 15 s por webhook. Reservamos tiempo para generar la voz
// o usar el respaldo, evitando que una inferencia lenta finalice la llamada.
async function chatWithDeadline(request: NextRequest): Promise<NextResponse> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      chatPOST(request),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("PHONE_INTERPRET_TIMEOUT")), 6_500);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function POST(request: NextRequest) {
  const requestStartedAt = Date.now();
  // 12 s deja margen de red y Next.js dentro del límite Twilio de 15 s.
  const remainingTtsMs = () => Math.max(0, 12_000 - (Date.now() - requestStartedAt));
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
  // Evita consumo de créditos cuando ejecutamos test:phone y test:trial.
  // Se evalúa únicamente después de autenticar la petición.
  const skipTts = request.headers.get("x-ordervoice-test-no-tts") === "1";
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
      return listen(DEMO_GREETING, usingTrial ? trialSecret : null, skipTts, remainingTtsMs());
    }
  }
  session.updatedAt = Date.now();
  if (!speech) return respondInConversation("No te escuché bien. Por favor, repite tu pedido.", usingTrial ? trialSecret : null, skipTts, remainingTtsMs());
  if (session.turns >= MAX_TURNS) {
    sessions.delete(callSid);
    return respondAndFinish("Hemos llegado al límite de esta llamada de prueba. Gracias por comunicarte.", usingTrial ? trialSecret : null, skipTts, remainingTtsMs());
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
        history: session.history.slice(-8),
        telephoneMode: true
      })
    });
    const result = await chatWithDeadline(internalRequest);
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
      return respondAndFinish(reply, usingTrial ? trialSecret : null, skipTts, remainingTtsMs());
    }
    return respondInConversation(reply, usingTrial ? trialSecret : null, skipTts, remainingTtsMs());
  } catch (error) {
    // Mantener la sesión y el carrito. Un error temporal no debe cortar
    // la llamada ni eliminar el pedido previo. Usar <Say> sin esperar API de voz.
    console.warn("[Twilio webhook] Turno no completado; se mantiene el carrito.", {
      reason: error instanceof Error ? error.message : "Error"
    });
    return listen("Disculpa, tuve una demora y no cambié tu pedido. Por favor, repite el cambio.", usingTrial ? trialSecret : null, true);
  }
}
