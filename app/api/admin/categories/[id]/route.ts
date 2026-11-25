import { revalidateTag } from "next/cache";
import { getAuthorizedAdmin, unauthorizedResponse } from "../../../../../lib/admin-auth";
import { parseCategory } from "../../../../../lib/product-input";
import { deleteCategory, saveCategory, StoreConflictError, StoreNotFoundError, StoreValidationError } from "../../../../../lib/store";
import { assertSameOriginMutation, noStoreJson, readJsonBody, securityErrorResponse } from "../../../../../lib/http-security";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await getAuthorizedAdmin())) return unauthorizedResponse();
  try {
    assertSameOriginMutation(request);
    const { id } = await context.params;
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id)) {
      return noStoreJson({ error: "Некорректная категория." }, { status: 400 });
    }
    const input = parseCategory(await readJsonBody(request, 8 * 1024));
    if (!input.name || !input.image) {
      return noStoreJson({ error: "Укажите название и фотографию категории." }, { status: 400 });
    }
    const category = await saveCategory(input, id);
    revalidateTag("categories", { expire: 0 });
    return noStoreJson({ category });
  } catch (error) {
    if (error instanceof StoreValidationError || error instanceof StoreNotFoundError) {
      return noStoreJson({ error: error.message }, { status: error instanceof StoreNotFoundError ? 404 : 400 });
    }
    return securityErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await getAuthorizedAdmin())) return unauthorizedResponse();
  try {
    assertSameOriginMutation(request);
    const { id } = await context.params;
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id)) return noStoreJson({ error: "Некорректная категория." }, { status: 400 });
    const replacementId = new URL(request.url).searchParams.get("replacementId") ?? undefined;
    if (replacementId && !/^[a-z0-9][a-z0-9-]{0,79}$/.test(replacementId)) {
      return noStoreJson({ error: "Некорректная категория назначения." }, { status: 400 });
    }
    try {
      await deleteCategory(id, replacementId);
    } finally {
      // The transfer may succeed before a concurrent write blocks deletion.
      revalidateTag("products", { expire: 0 });
    }
    revalidateTag("categories", { expire: 0 });
    return noStoreJson({ ok: true });
  } catch (error) {
    if (error instanceof StoreValidationError) {
      return noStoreJson({ error: error.message }, { status: 400 });
    }
    if (error instanceof StoreConflictError || error instanceof StoreNotFoundError) {
      return noStoreJson({ error: error.message }, { status: error instanceof StoreNotFoundError ? 404 : 409 });
    }
    return securityErrorResponse(error);
  }
}
