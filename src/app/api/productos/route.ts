import { assertLocal, jsonBody, ok, failure, service } from "@/presentation/http.js";
export async function GET(request: Request) {
  try {assertLocal(request);return ok({productos:await service().listProducts()});}
  catch(error){return failure(error);}
}
export async function POST(request: Request) {
  try {assertLocal(request);return ok({producto:await service().createProduct(await jsonBody(request))},201);}
  catch(error){return failure(error);}
}
