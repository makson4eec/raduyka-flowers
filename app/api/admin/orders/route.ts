import { getAuthorizedAdmin, unauthorizedResponse } from "../../../../lib/admin-auth";
import { noStoreJson, securityErrorResponse } from "../../../../lib/http-security";
import { listOrders } from "../../../../lib/store";

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
      return noStoreJson({ error: "Некорректная страница заказов." }, { status: 400 });
    }
    if (page === null) {
      return noStoreJson({ orders: await listOrders() });
    }

    const orders = await listOrders({
      offset: page * ADMIN_PAGE_SIZE,
      limit: ADMIN_PAGE_SIZE + 1,
    });
    const hasNextPage = orders.length > ADMIN_PAGE_SIZE;
    return noStoreJson({
      orders: orders.slice(0, ADMIN_PAGE_SIZE),
      nextPage: hasNextPage ? page + 1 : null,
    });
  } catch (error) {
    return securityErrorResponse(error);
  }
}
