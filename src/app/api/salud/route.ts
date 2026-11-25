import { assertLocal, jsonBody, ok, failure, service } from "@/presentation/http.js";
export async function GET(request: Request) {
  try {assertLocal(request);const products=await service().listProducts();
    return ok({status:"ok",monolito:"OrderVoice AI Criterio 2",database:"postgresql",productos:products.length});}
  catch(error){return failure(error);}
}
