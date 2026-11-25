import { revalidateTag } from "next/cache";
import { getAuthorizedAdmin, unauthorizedResponse } from "../../../../lib/admin-auth";
import { parseInfoPage, parseSiteSettings } from "../../../../lib/content-input";
import { infoPageIds, readSiteContent, resetInfoPage, saveSiteContent } from "../../../../lib/content-store";
import { assertSameOriginMutation, noStoreJson, readJsonBody, securityErrorResponse } from "../../../../lib/http-security";
export const dynamic = "force-dynamic";
export async function GET() {
  if (!(await getAuthorizedAdmin())) return unauthorizedResponse();
  try { return noStoreJson(await readSiteContent()); }
  catch (error) { return securityErrorResponse(error); }
}
export async function PATCH(request: Request) {
  if (!(await getAuthorizedAdmin())) return unauthorizedResponse();
  try {
    assertSameOriginMutation(request);
    const input = await readJsonBody(request, 384 * 1024) as { id?: unknown; value?: unknown };
    if (typeof input?.id !== "string" || (input.id !== "settings" && !infoPageIds.has(input.id))) return noStoreJson({ error: "Страница не найдена." }, { status: 404 });
    let value;
    try { value = input.id === "settings" ? parseSiteSettings(input.value) : parseInfoPage(input.value); }
    catch (error) { return noStoreJson({ error: error instanceof Error ? error.message : "Проверьте данные." }, { status: 400 }); }
    await saveSiteContent(input.id, value);
    revalidateTag("site-content", { expire: 0 });
    return noStoreJson({ ok: true });
  } catch (error) { return securityErrorResponse(error); }
}
export async function DELETE(request: Request) {
  if (!(await getAuthorizedAdmin())) return unauthorizedResponse();
  try {
    assertSameOriginMutation(request);
    const id = new URL(request.url).searchParams.get("id");
    if (!id || !infoPageIds.has(id)) return noStoreJson({ error: "Страница не найдена." }, { status: 404 });
    await resetInfoPage(id);
    revalidateTag("site-content", { expire: 0 });
    return noStoreJson({ ok: true });
  } catch (error) { return securityErrorResponse(error); }
}
