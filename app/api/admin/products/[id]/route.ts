import { getAuthorizedAdmin, unauthorizedResponse } from "../../../../../lib/admin-auth";
import { parseProduct } from "../../../../../lib/product-input";
import { deleteProduct, updateProduct } from "../../../../../lib/store";
import {
  assertSameOriginMutation,
  noStoreJson,
  readJsonBody,
  securityErrorResponse,
} from "../../../../../lib/http-security";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  if (!(await getAuthorizedAdmin())) return unauthorizedResponse();
  try {
    assertSameOriginMutation(request);
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return noStoreJson({ error: "Некорректный товар." }, { status: 400 });
    }
    const input = parseProduct(await readJsonBody(request, 16 * 1_024));
    if (!input.name || !input.image || input.price <= 0) {
      return noStoreJson({ error: "Укажите название, допустимую цену и фотографию." }, { status: 400 });
    }
    return noStoreJson({ product: await updateProduct(id, input) });
  } catch (error) {
    return securityErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  if (!(await getAuthorizedAdmin())) return unauthorizedResponse();
  try {
    assertSameOriginMutation(request);
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return noStoreJson({ error: "Некорректный товар." }, { status: 400 });
    }
    await deleteProduct(id);
    return noStoreJson({ ok: true });
  } catch (error) {
    return securityErrorResponse(error);
  }
}
