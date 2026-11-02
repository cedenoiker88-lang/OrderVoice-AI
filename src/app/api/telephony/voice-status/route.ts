import { NextRequest, NextResponse } from "next/server";
import { findPhoneVoiceJob } from "@/lib/phone-voice-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function xml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function twiml(body: string): NextResponse {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" }
  });
}
function say(text: string): string {
  return `<Say language="es-ES" voice="woman">${xml(text.slice(0,700))}</Say>`;
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "";
  const job = findPhoneVoiceJob(id);
  if (!job) {
    // No se pudo recuperar el turno: evitar cerrar la llamada por un 404.
    return twiml(say("Disculpa, la respuesta se demoró. Por favor, repite tu pedido.") +
      '<Gather input="speech" language="es-ES" timeout="6" speechTimeout="auto"></Gather>');
  }
  if (job.state === "pending") {
    const base = process.env.TWILIO_PUBLIC_BASE_URL?.replace(/\/$/, "");
    if (!base?.startsWith("https://")) {
      return twiml(say("Disculpa, ocurrió un problema con el audio.") + "<Hangup/>");
    }
    // Cada solicitud de TwiML responde inmediatamente. Se permite que la
    // síntesis espere fuera del límite de 15 segundos del POST original.
    const next = base + "/api/telephony/voice-status?id=" + id;
    return twiml(`<Pause length="3"/><Redirect method="GET">${xml(next)}</Redirect>`);
  }
  const audio = job.audioUrl
    ? `<Play>${xml(job.audioUrl)}</Play>`
    : say(job.text);
  if (job.farewell) return twiml(audio + "<Hangup/>");
  const gather = `<Gather input="speech" language="es-ES" speechTimeout="auto" timeout="6" actionOnEmptyResult="true" method="POST" action="${xml(job.actionUrl)}">${audio}</Gather>`;
  return twiml(gather + say("No recibí respuesta. Terminamos esta llamada de prueba. Hasta luego.") + "<Hangup/>");
}
