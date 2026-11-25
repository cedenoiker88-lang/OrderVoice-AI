import { NextResponse } from "next/server";
import { DomainError } from "../application/domain.js";
import { createMonolithService } from "../application/monolith-service.js";
import { postgresRepository } from "../persistence/postgres.js";

// Punto de composición: presentación → aplicación → repositorio concreto.
export function service() {return createMonolithService(postgresRepository);}
export function assertLocal(request) {
  const hostname=new URL(request.url).hostname.toLowerCase();
  const local=(value)=>["localhost","127.0.0.1","[::1]"].includes(value);
  let forwarded=null;
  const raw=request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if(raw){try{forwarded=new URL("http://"+raw).hostname;}catch {throw new DomainError(403,"HOST_INVALIDO","Acceso no autorizado.");}}
  if(!local(hostname) || (forwarded && !local(forwarded))){
    throw new DomainError(403,"SOLO_LOCAL","Las APIs académicas solo se permiten en localhost.");
  }
  const origin=request.headers.get("origin");
  if(origin && new URL(origin).host!==new URL(request.url).host){
    throw new DomainError(403,"ORIGEN_INVALIDO","Origen no autorizado.");
  }
}
export async function jsonBody(request) {
  let text;
  try {text=await request.text();}catch {throw new DomainError(400,"JSON_INVALIDO","No se pudo leer el cuerpo.");}
  if(!text) return {};
  try {return JSON.parse(text);}catch {throw new DomainError(400,"JSON_INVALIDO","Se requiere JSON válido.");}
}
export function ok(data,status=200) {
  return NextResponse.json(data,{status,headers:{"Cache-Control":"no-store"}});
}
export function failure(error) {
  if(error instanceof DomainError) {
    return ok({error:{code:error.code,message:error.message}},error.status);
  }
  if(error && typeof error==="object") {
    if(error.code==="23505")return ok({error:{code:"DUPLICADO",message:"Ya existe un registro con ese identificador."}},409);
    if(error.code==="23503")return ok({error:{code:"RELACION_INVALIDA",message:"La referencia indicada no existe."}},422);
    if(error.code==="23514")return ok({error:{code:"REGLA_INVALIDA",message:"El dato incumple una restricción."}},422);
  }
  // Nunca imprimir claves, contraseñas ni consultas SQL en la respuesta.
  console.error("[OrderVoice monolito] Error de API:",error instanceof Error?error.name:"error");
  return ok({error:{code:"SERVIDOR_NO_DISPONIBLE",message:"No pude acceder al monolito o a PostgreSQL. Revisa DATABASE_URL y el servidor."}},503);
}
