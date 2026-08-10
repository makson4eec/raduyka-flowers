import { getAuthorizedAdmin, unauthorizedResponse } from "../../../../lib/admin-auth";
import { noStoreJson, securityErrorResponse } from "../../../../lib/http-security";
import { listOrders } from "../../../../lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getAuthorizedAdmin())) return unauthorizedResponse();
  try {
    return noStoreJson({ orders: await listOrders() });
  } catch (error) {
    return securityErrorResponse(error);
  }
}
