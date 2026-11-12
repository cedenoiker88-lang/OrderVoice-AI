import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = /^(audio\/(?:webm|ogg|mp4|mpeg|wav|x-wav))(?:;|$)/i;

/**
 * Transcripción por archivo para probar el micrófono sin Twilio.
 * SEGURIDAD:
 * - Desactivada por defecto; requiere opt-in en .env.local.
 * - Solo accesible desde localhost, nunca a través del túnel público de Twilio.
 * - La clave permanece en el servidor y no se persisten grabaciones.
 * - Un límite de tamaño y un timeout acotan cada petición.
 */
export async function POST(request: NextRequest) {
  if (process.env.ORDERVOICE_BROWSER_STT_PROVIDER !== "openai") {
    return NextResponse.json(
      { error: "Transcripción con API desactivada. Configura ORDERVOICE_BROWSER_STT_PROVIDER=openai en .env.local." },
      { status: 503 }
    );
  }

  const host = new URL(request.url).hostname.toLowerCase();
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "[::1]") {
    return NextResponse.json(
      { error: "Por seguridad, la transcripción de prueba solo está disponible en localhost." },
      { status: 403 }
    );
  }
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const url = new URL(origin);
      if (url.host !== new URL(request.url).host) {
        return NextResponse.json({ error: "Origen no autorizado." }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "Origen no válido." }, { status: 403 });
    }
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "No se ha configurado OPENAI_API_KEY en el servidor." }, { status: 503 });
  }

  try {
    const data = await request.formData();
    const audio = data.get("audio");
    if (!(audio instanceof File) || audio.size < 150 || audio.size > MAX_AUDIO_BYTES || !ALLOWED_TYPES.test(audio.type)) {
      return NextResponse.json({ error: "El audio debe ser webm, ogg, mp4 o wav y pesar menos de 8 MB." }, { status: 400 });
    }

    const payload = new FormData();
    payload.append("file", audio, audio.name || "pedido.webm");
    payload.append("model", "gpt-transcribe");
    payload.append("languages[]", "es");
    payload.append("prompt",
      "Pizzería ficticia de Ecuador. Transcribe solo lo que realmente dice la persona, sin inventar pedidos. " +
      "Términos posibles: OrderVoice, pizza pepperoni, hawaiana, margarita, mediana, familiar, gaseosa, " +
      "quitar, cambiar, confirmar y dólares.");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: payload,
      signal: AbortSignal.timeout(25_000),
      cache: "no-store"
    });

    if (!response.ok) {
      console.error("Fallo de transcripción OpenAI HTTP:", response.status);
      const message = response.status === 401 ? "La clave API no está autorizada."
        : response.status === 429 ? "La API alcanzó un límite de solicitudes o de créditos."
        : "No se pudo transcribir el audio. Revisa la conexión y la configuración de OpenAI.";
      return NextResponse.json({ error: message }, { status: response.status === 429 ? 429 : 502 });
    }

    const result: unknown = await response.json();
    const text = result && typeof result === "object" && "text" in result && typeof result.text === "string"
      ? result.text.trim() : "";
    if (!text || text.length > 500) {
      return NextResponse.json({ error: "La transcripción estaba vacía o era demasiado larga. Repite el mensaje." }, { status: 422 });
    }

    const reply = NextResponse.json({ text, provider: "openai" });
    reply.headers.set("Cache-Control", "no-store");
    return reply;
  } catch (error) {
    console.error("Error en transcripción de navegador:", error instanceof Error ? error.message : "desconocido");
    return NextResponse.json(
      { error: "No se pudo enviar o procesar el audio. Comprueba el micrófono, la conexión y el servidor." },
      { status: 502 }
    );
  }
}
