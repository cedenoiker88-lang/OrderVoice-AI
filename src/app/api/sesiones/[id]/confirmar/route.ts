import { assertLocal, jsonBody, ok, failure, service } from "@/presentation/http.js";
export async function POST(request: Request,context:{params:Promise<{id:string}>}) {
  try {assertLocal(request);const {id}=await context.params;
    return ok({pedido:await service().confirmSession(id,await jsonBody(request))},201);}
  catch(error){return failure(error);}
}
