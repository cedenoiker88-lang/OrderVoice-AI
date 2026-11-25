import { assertLocal, jsonBody, ok, failure, service } from "@/presentation/http.js";
export async function PATCH(request: Request, context: {params:Promise<{id:string}>}) {
  try {assertLocal(request);const {id}=await context.params;
    return ok({producto:await service().updateProduct(id,await jsonBody(request))});}
  catch(error){return failure(error);}
}
