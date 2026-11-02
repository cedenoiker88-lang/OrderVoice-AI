import { NextRequest, NextResponse } from "next/server";
import { readPhoneClip } from "@/lib/phone-audio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Twilio <Play> necesita un GET público. El identificador es aleatorio,
 * no contiene texto, y caduca. Nunca se publica el API key.
 */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "";
  const wav = readPhoneClip(id);
  if (!wav) {
    return new NextResponse("Audio expirado o inexistente", {
      status: 404,
      headers: { "Cache-Control": "no-store" }
    });
  }
  return new NextResponse(new Uint8Array(wav), {
    headers: {
      "Content-Type": "audio/wav",
      "Cache-Control": "public, max-age=120",
      "X-Content-Type-Options": "nosniff",
      "Content-Length": String(wav.length)
    }
  });
}
