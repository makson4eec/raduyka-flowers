import { getSiteContent } from "../../../lib/content-store";
import { securityErrorResponse } from "../../../lib/http-security";
export async function GET() {
  try { return Response.json(await getSiteContent()); }
  catch (error) { return securityErrorResponse(error); }
}
