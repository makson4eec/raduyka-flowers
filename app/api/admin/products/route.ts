import { revalidateTag } from "next/cache";
import { getAuthorizedAdmin, unauthorizedResponse } from "../../../../lib/admin-auth";
import { parseProduct } from "../../../../lib/product-input";
import { flowerVariantValidationError } from "../../../../lib/product-variants";
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

const ADMIN_PAGE_SIZE = 50;

function pageFromRequest(request: Request) {
  const rawPage = new URL(request.url).searchParams.get("page");
  if (rawPage === null) return null;
  if (!/^(?:0|[1-9]\d{0,3})$/.test(rawPage)) return undefined;
  return Number(rawPage);
}

export async function GET(request: Request) {
  if (!(await getAuthorizedAdmin())) return unauthorizedResponse();
  try {
    const page = pageFromRequest(request);
    if (page === undefined) {
      return noStoreJson({ error: "Некорректная страница каталога." }, { status: 400 });
    }
    if (page === null) {
      return noStoreJson({ products: await listProducts(true) });
    }

    const products = await listProducts(true, {
      offset: page * ADMIN_PAGE_SIZE,
      limit: ADMIN_PAGE_SIZE + 1,
    });
    const hasNextPage = products.length > ADMIN_PAGE_SIZE;
    return noStoreJson({
      products: products.slice(0, ADMIN_PAGE_SIZE),
      nextPage: hasNextPage ? page + 1 : null,
    });
  } catch (error) {
    return securityErrorResponse(error);
  }
}

export async function POST(request: Request) {
  if (!(await getAuthorizedAdmin())) return unauthorizedResponse();
  try {
    assertSameOriginMutation(request);
    const input = parseProduct(await readJsonBody(request, 64 * 1_024));
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
    const product = await createProduct(input);
    revalidateTag("products", { expire: 0 });
    return noStoreJson({ product }, { status: 201 });
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
