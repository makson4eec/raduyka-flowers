import { listProducts } from "../../../lib/store";
import { noStoreJson, securityErrorResponse } from "../../../lib/http-security";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return noStoreJson({ products: await listProducts(false) });
  } catch (error) {
    return securityErrorResponse(error);
  }
}
