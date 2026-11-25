import { assertLocal, jsonBody, ok, failure, service } from "@/presentation/http.js";
/**
 * CU-01: añadir; CU-02: reemplazar; opcional: quitar.
 * Todas las mutaciones usan una transacción con bloqueo de sesión.
 */
export async function POST(request: Request,context:{params:Promise<{id:string}>}) {
  try {assertLocal(request);const {id}=await context.params;
    return ok({sesion:await service().addItem(id,await jsonBody(request))});}
  catch(error){return failure(error);}
}
export async function PATCH(request: Request,context:{params:Promise<{id:string}>}) {
  try {assertLocal(request);const {id}=await context.params;
    return ok({sesion:await service().replaceItem(id,await jsonBody(request))});}
  catch(error){return failure(error);}
}
export async function DELETE(request: Request,context:{params:Promise<{id:string}>}) {
  try {assertLocal(request);const {id}=await context.params;
    return ok({sesion:await service().removeItem(id,await jsonBody(request))});}
  catch(error){return failure(error);}
}
