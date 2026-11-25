import { revalidateTag } from "next/cache";
import { getAuthorizedAdmin, unauthorizedResponse } from "../../../../lib/admin-auth";
import { parseCategory } from "../../../../lib/product-input";
import { listCategories, saveCategory, StoreValidationError } from "../../../../lib/store";
import { assertSameOriginMutation, noStoreJson, readJsonBody, securityErrorResponse } from "../../../../lib/http-security";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getAuthorizedAdmin())) return unauthorizedResponse();
  try {
    return noStoreJson({ categories: await listCategories(true) });
  } catch (error) {
    return securityErrorResponse(error);
  }
}

export async function POST(request: Request) {
  if (!(await getAuthorizedAdmin())) return unauthorizedResponse();
  try {
    assertSameOriginMutation(request);
    const input = parseCategory(await readJsonBody(request, 8 * 1024));
    if (!input.name || !input.image) {
      return noStoreJson({ error: "Укажите название и фотографию категории." }, { status: 400 });
    }
    const category = await saveCategory(input);
    revalidateTag("categories", { expire: 0 });
    return noStoreJson({ category }, { status: 201 });
  } catch (error) {
    if (error instanceof StoreValidationError) {
      return noStoreJson({ error: error.message }, { status: 400 });
    }
    return securityErrorResponse(error);
  }
}
