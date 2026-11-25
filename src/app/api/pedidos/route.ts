import { assertLocal, jsonBody, ok, failure, service } from "@/presentation/http.js";
export async function GET(request: Request) {
  try {assertLocal(request);return ok({pedidos:await service().listOrders()});}
  catch(error){return failure(error);}
}
