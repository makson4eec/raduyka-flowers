import { revalidateTag } from "next/cache";
import { getAuthorizedAdmin, unauthorizedResponse } from "../../../../../lib/admin-auth";
import { parseProduct } from "../../../../../lib/product-input";
import { flowerVariantValidationError } from "../../../../../lib/product-variants";
import {
  deleteProduct,
  StoreNotFoundError,
  StoreValidationError,
  updateProduct,
} from "../../../../../lib/store";
import {
  assertSameOriginMutation,
  noStoreJson,
  readJsonBody,
  securityErrorResponse,
} from "../../../../../lib/http-security";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

function storeErrorResponse(error: unknown) {
  if (error instanceof StoreValidationError) {
    return noStoreJson({ error: error.message }, { status: 400 });
  }
  if (error instanceof StoreNotFoundError) {
    return noStoreJson({ error: error.message }, { status: 404 });
  }
  return securityErrorResponse(error);
}

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
      return noStoreJson(
        { error: "Укажите название, допустимую цену и фотографию." },
        { status: 400 },
      );
    }
    const variantError = flowerVariantValidationError(input);
    if (variantError) {
      return noStoreJson({ error: variantError }, { status: 400 });
    }
    const product = await updateProduct(id, input);
    revalidateTag("products", { expire: 0 });
    return noStoreJson({ product });
  } catch (error) {
    return storeErrorResponse(error);
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
    revalidateTag("products", { expire: 0 });
    return noStoreJson({ ok: true });
  } catch (error) {
    return storeErrorResponse(error);
  }
}
