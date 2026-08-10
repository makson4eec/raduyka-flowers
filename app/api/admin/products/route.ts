import { getAuthorizedAdmin, unauthorizedResponse } from "../../../../lib/admin-auth";
import { parseProduct } from "../../../../lib/product-input";
import {
  createProduct,
  listProducts,
  StoreConflictError,
  StoreValidationError,
} from "../../../../lib/store";
import {
  assertSameOriginMutation,
  noStoreJson,
  readJsonBody,
  securityErrorResponse,
} from "../../../../lib/http-security";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getAuthorizedAdmin())) return unauthorizedResponse();
  try {
    return noStoreJson({ products: await listProducts(true) });
  } catch (error) {
    return securityErrorResponse(error);
  }
}

export async function POST(request: Request) {
  if (!(await getAuthorizedAdmin())) return unauthorizedResponse();
  try {
    assertSameOriginMutation(request);
    const input = parseProduct(await readJsonBody(request, 16 * 1_024));
    if (!input.name || !input.image || input.price <= 0) {
      return noStoreJson(
        { error: "Укажите название, допустимую цену и фотографию." },
        { status: 400 },
      );
    }
    return noStoreJson({ product: await createProduct(input) }, { status: 201 });
  } catch (error) {
    if (error instanceof StoreValidationError) {
      return noStoreJson({ error: error.message }, { status: 400 });
    }
    if (error instanceof StoreConflictError) {
      return noStoreJson({ error: error.message }, { status: 409 });
    }
    return securityErrorResponse(error);
  }
}
