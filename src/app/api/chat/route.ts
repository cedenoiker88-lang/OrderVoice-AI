import { NextRequest, NextResponse } from "next/server";
import { assertLocal, jsonBody, service, failure } from "@/presentation/http.js";
import { DomainError } from "@/application/domain.js";
import { processConversation } from "@/application/conversation";

/** Capa de presentación: controla HTTP, delega todas las reglas a aplicación. */
export async function POST(request: NextRequest) {
  const started = performance.now();
  try {
    assertLocal(request);
    const body: unknown = await jsonBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new DomainError(400, "JSON_INVALIDO", "Se necesita un cuerpo JSON objeto.");
    }
    const result = await processConversation(body as Record<string, unknown>, service());
    const ms = Math.round(performance.now() - started);
    return NextResponse.json({
      ...result.data, metrics: { interpretMs: ms, serverMs: ms }
    }, { status: result.status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const response = failure(error);
    const parsed = await response.json() as { error?: { message?: string } };
    return NextResponse.json({
      error: parsed.error?.message || "Error al procesar la solicitud."
    }, { status: response.status });
  }
}
