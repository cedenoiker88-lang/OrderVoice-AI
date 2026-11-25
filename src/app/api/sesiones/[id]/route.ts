import { assertLocal, jsonBody, ok, failure, service } from "@/presentation/http.js";
export async function GET(request: Request,context:{params:Promise<{id:string}>}) {
  try {assertLocal(request);const {id}=await context.params;
    return ok({sesion:await service().getSession(id)});}
  catch(error){return failure(error);}
}
