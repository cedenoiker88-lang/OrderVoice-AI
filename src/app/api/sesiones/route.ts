import { assertLocal, jsonBody, ok, failure, service } from "@/presentation/http.js";
export async function POST(request: Request) {
  try {assertLocal(request);return ok({sesion:await service().createSession(await jsonBody(request))},201);}
  catch(error){return failure(error);}
}
