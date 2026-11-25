import { assertLocal, jsonBody, ok, failure, service } from "@/presentation/http.js";
export async function GET(request: Request) {
  try {assertLocal(request);return ok({clientes:await service().listCustomers()});}
  catch(error){return failure(error);}
}
export async function POST(request: Request) {
  try {assertLocal(request);return ok({cliente:await service().createCustomer(await jsonBody(request))},201);}
  catch(error){return failure(error);}
}
