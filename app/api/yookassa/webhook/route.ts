import {
  noStoreJson,
  readJsonBody,
  securityErrorResponse,
} from "../../../../lib/http-security";
import {
  calculateStoredOrderTotal,
  getOrderByYooKassaPaymentId,
  markYooKassaPaymentCanceled,
  markYooKassaPaymentSucceeded,
} from "../../../../lib/store";
import {
  getYooKassaPayment,
  YooKassaApiError,
} from "../../../../lib/yookassa";
import {
  isYooKassaPaymentId,
  verifyYooKassaPaymentForOrder,
} from "../../../../lib/yookassa-contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PaymentEvent = "payment.succeeded" | "payment.canceled";

function parseNotification(value: unknown): {
  event: string;
  paymentId: string;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (body.type !== "notification" || typeof body.event !== "string") return null;
  if (!body.object || typeof body.object !== "object" || Array.isArray(body.object)) {
    return null;
  }
  const paymentId = (body.object as Record<string, unknown>).id;
  if (typeof paymentId !== "string" || !isYooKassaPaymentId(paymentId)) {
    return null;
  }
  return { event: body.event, paymentId };
}

function isPaymentEvent(value: string): value is PaymentEvent {
  return value === "payment.succeeded" || value === "payment.canceled";
}

export async function POST(request: Request) {
  try {
    const notification = parseNotification(await readJsonBody(request, 64 * 1_024));
    if (!notification) {
      return noStoreJson({ error: "Некорректное уведомление." }, { status: 400 });
    }
    if (!isPaymentEvent(notification.event)) {
      return noStoreJson({ ok: true });
    }

    // Ignore unknown and stale payment ids before making an authenticated
    // provider request. A current payment is always present in our database.
    const order = await getOrderByYooKassaPaymentId(notification.paymentId);
    if (!order) return noStoreJson({ ok: true });

    const expectedAmount = order.yookassaPaymentAmount;
    if (!Number.isSafeInteger(expectedAmount) || (expectedAmount ?? 0) <= 0) {
      console.error("YooKassa webhook order has no frozen amount", {
        orderId: order.id,
        paymentId: notification.paymentId,
      });
      return noStoreJson(
        { error: "Сумма платежа не сохранена." },
        { status: 409 },
      );
    }
    let calculatedAmount: number;
    try {
      calculatedAmount = calculateStoredOrderTotal(order);
    } catch (error) {
      console.error("YooKassa webhook order total is inconsistent", {
        orderId: order.id,
        paymentId: notification.paymentId,
        error,
      });
      return noStoreJson(
        { error: "Сумма заказа требует проверки." },
        { status: 409 },
      );
    }
    if (calculatedAmount !== expectedAmount) {
      console.error("YooKassa webhook frozen amount does not match order", {
        orderId: order.id,
        paymentId: notification.paymentId,
      });
      return noStoreJson(
        { error: "Сумма платежа не совпадает с заказом." },
        { status: 409 },
      );
    }

    // The notification body is not trusted. The canonical payment is loaded
    // from YooKassa with server-side Basic Auth before any local status change.
    const payment = await getYooKassaPayment(notification.paymentId);
    const expectedStatus = notification.event === "payment.succeeded"
      ? "succeeded"
      : "canceled";
    const verification = verifyYooKassaPaymentForOrder(payment, {
      expectedPaymentId: notification.paymentId,
      expectedOrderId: order.id,
      expectedAmountRubles: expectedAmount as number,
      status: expectedStatus,
    });
    if (!verification.ok) {
      console.error("YooKassa webhook verification failed", {
        orderId: order.id,
        paymentId: notification.paymentId,
        reason: verification.reason,
      });
      return noStoreJson(
        { error: "Платёж не прошёл проверку." },
        { status: 409 },
      );
    }

    if (notification.event === "payment.succeeded") {
      const updated = await markYooKassaPaymentSucceeded(
        order.id,
        notification.paymentId,
      );
      if (
        !updated
        || (updated.paymentStatus !== "paid" && updated.paymentStatus !== "refunded")
      ) {
        return noStoreJson(
          { error: "Не удалось сохранить подтверждение оплаты." },
          { status: 409 },
        );
      }
    } else {
      const updated = await markYooKassaPaymentCanceled(
        order.id,
        notification.paymentId,
      );
      if (
        !updated
        || updated.paymentStatus !== "pending"
        || updated.yookassaPaymentId
        || updated.yookassaPaymentUrl
      ) {
        return noStoreJson(
          { error: "Не удалось сохранить отмену платежа." },
          { status: 409 },
        );
      }
    }

    return noStoreJson({ ok: true });
  } catch (error) {
    if (error instanceof YooKassaApiError) {
      return noStoreJson({ error: error.message }, { status: error.status });
    }
    return securityErrorResponse(error);
  }
}
