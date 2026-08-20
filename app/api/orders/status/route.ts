import {
  assertSameOriginMutation,
  consumeRequestRateLimit,
  HttpSecurityError,
  noStoreJson,
  rateLimitHeaders,
  readJsonBody,
  securityErrorResponse,
} from "../../../../lib/http-security";
import {
  getOrderForCustomerStatus,
  publicOrderStatus,
} from "../../../../lib/store";
import { reconcileYooKassaOrderPayment } from "../../../../lib/yookassa-reconcile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const orderNumberPattern = /^RAD-\d{6}-(?:\d{4}|[0-9A-F]{12})$/;

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    if (!request.headers.get("origin")) {
      throw new HttpSecurityError(403, "Недопустимый источник запроса.");
    }

    const rateLimit = consumeRequestRateLimit(
      request,
      "public-order-status",
      20,
      10 * 60_000,
    );
    if (!rateLimit.allowed) {
      return noStoreJson(
        { error: "Слишком много проверок. Попробуйте позже." },
        { status: 429, headers: rateLimitHeaders(rateLimit) },
      );
    }

    const payload = await readJsonBody(request, 2 * 1_024) as {
      orderNumber?: unknown;
      customerPhone?: unknown;
    };
    const orderNumber = typeof payload?.orderNumber === "string"
      ? payload.orderNumber.trim().toUpperCase()
      : "";
    const customerPhone = typeof payload?.customerPhone === "string"
      ? payload.customerPhone.trim()
      : "";
    const phoneDigits = customerPhone.replace(/\D/g, "");

    if (
      !orderNumberPattern.test(orderNumber)
      || phoneDigits.length < 10
      || phoneDigits.length > 15
    ) {
      return noStoreJson(
        { error: "Заказ не найден. Проверьте номер заказа и телефон." },
        { status: 404 },
      );
    }

    const storedOrder = await getOrderForCustomerStatus(orderNumber, customerPhone);
    if (!storedOrder) {
      return noStoreJson(
        { error: "Заказ не найден. Проверьте номер заказа и телефон." },
        { status: 404 },
      );
    }

    let order = storedOrder;
    try {
      order = await reconcileYooKassaOrderPayment(storedOrder);
    } catch (error) {
      console.error("Failed to reconcile YooKassa payment on order status check", {
        orderId: storedOrder.id,
        paymentId: storedOrder.yookassaPaymentId,
        error,
      });
      // A temporary provider error must not hide the last trusted DB status.
      order = (await getOrderForCustomerStatus(orderNumber, customerPhone)) ?? storedOrder;
    }

    return noStoreJson({ order: publicOrderStatus(order) });
  } catch (error) {
    return securityErrorResponse(error);
  }
}
