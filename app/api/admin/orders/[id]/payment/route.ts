import { getAuthorizedAdmin, unauthorizedResponse } from "../../../../../../lib/admin-auth";
import {
  assertSameOriginMutation,
  noStoreJson,
  securityErrorResponse,
} from "../../../../../../lib/http-security";
import {
  markYooKassaPaymentCanceled,
  markYooKassaPaymentSucceeded,
  prepareYooKassaPayment,
  releaseYooKassaPaymentPreparation,
  saveYooKassaPayment,
  StoreConflictError,
  StoreNotFoundError,
  StoreValidationError,
} from "../../../../../../lib/store";
import {
  createYooKassaSbpPayment,
  getYooKassaPayment,
  getYooKassaReturnUrl,
  YooKassaApiError,
} from "../../../../../../lib/yookassa";
import { verifyYooKassaPaymentForOrder } from "../../../../../../lib/yookassa-contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

const orderIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function paymentErrorResponse(error: unknown) {
  if (error instanceof StoreValidationError) {
    return noStoreJson({ error: error.message }, { status: 400 });
  }
  if (error instanceof StoreConflictError) {
    return noStoreJson({ error: error.message }, { status: 409 });
  }
  if (error instanceof StoreNotFoundError) {
    return noStoreJson({ error: error.message }, { status: 404 });
  }
  if (error instanceof YooKassaApiError) {
    return noStoreJson({ error: error.message }, { status: error.status });
  }
  return securityErrorResponse(error);
}

export async function POST(request: Request, context: Context) {
  if (!(await getAuthorizedAdmin())) return unauthorizedResponse();

  try {
    assertSameOriginMutation(request);
    const id = (await context.params).id;
    if (!orderIdPattern.test(id)) {
      return noStoreJson({ error: "Некорректный заказ." }, { status: 400 });
    }

    const prepared = await prepareYooKassaPayment(id);
    if (prepared.existingPayment && !prepared.reconcilePaymentId) {
      return noStoreJson({ order: prepared.order });
    }

    if (prepared.reconcilePaymentId) {
      const canonicalPayment = await getYooKassaPayment(
        prepared.reconcilePaymentId,
      );
      if (
        canonicalPayment.status !== "pending"
        && canonicalPayment.status !== "succeeded"
        && canonicalPayment.status !== "canceled"
      ) {
        throw new YooKassaApiError(
          "Статус платежа ЮKassa требует ручной проверки.",
        );
      }
      const verification = verifyYooKassaPaymentForOrder(canonicalPayment, {
        expectedPaymentId: prepared.reconcilePaymentId,
        expectedOrderId: prepared.order.id,
        expectedAmountRubles: prepared.amountRubles,
        status: canonicalPayment.status,
      });
      if (!verification.ok) {
        throw new YooKassaApiError(
          "ЮKassa вернула несогласованные данные платежа. Платёж требует проверки.",
        );
      }

      if (canonicalPayment.status === "canceled") {
        await markYooKassaPaymentCanceled(
          prepared.order.id,
          canonicalPayment.id,
        );
        return noStoreJson(
          { error: "Предыдущий платёж отменён. Создайте новую оплату." },
          { status: 409 },
        );
      }
      if (canonicalPayment.status === "succeeded") {
        const paidOrder = await markYooKassaPaymentSucceeded(
          prepared.order.id,
          canonicalPayment.id,
        );
        if (!paidOrder || paidOrder.paymentStatus !== "paid") {
          throw new StoreConflictError(
            "Не удалось сохранить подтверждённую оплату. Повторите проверку.",
          );
        }
        return noStoreJson({ order: paidOrder });
      }

      const confirmationUrl = canonicalPayment.confirmation?.confirmationUrl
        ?? prepared.order.yookassaPaymentUrl;
      if (!confirmationUrl) {
        throw new YooKassaApiError(
          "ЮKassa не вернула ссылку активного платежа. Требуется ручная проверка.",
        );
      }
      const restoredOrder = await saveYooKassaPayment(
        prepared.order.id,
        prepared.idempotenceKey,
        {
          id: canonicalPayment.id,
          confirmationUrl,
          amountRubles: prepared.amountRubles,
        },
      );
      return noStoreJson({ order: restoredOrder });
    }

    let payment;
    try {
      payment = await createYooKassaSbpPayment({
        amountRubles: prepared.amountRubles,
        orderId: prepared.order.id,
        orderNumber: prepared.order.orderNumber,
        order: prepared.order,
        returnUrl: getYooKassaReturnUrl(prepared.order.orderNumber),
        idempotenceKey: prepared.idempotenceKey,
      });
    } catch (error) {
      const isDefinitiveFailure = error instanceof YooKassaApiError
        && (
          error.status === 503
          || (error.upstreamStatus === null && error.status === 400)
          || error.upstreamStatus !== null
            && error.upstreamStatus >= 400
            && error.upstreamStatus < 500
        );
      if (isDefinitiveFailure) {
        await releaseYooKassaPaymentPreparation(id, prepared.idempotenceKey);
      }
      throw error;
    }

    if (payment.status === "canceled") {
      await releaseYooKassaPaymentPreparation(id, prepared.idempotenceKey);
      return noStoreJson(
        { error: "ЮKassa отменила платёж. Создайте новую оплату." },
        { status: 409 },
      );
    }

    if (payment.status === "succeeded") {
      const canonicalPayment = await getYooKassaPayment(payment.id);
      const verification = verifyYooKassaPaymentForOrder(canonicalPayment, {
        expectedPaymentId: payment.id,
        expectedOrderId: prepared.order.id,
        expectedAmountRubles: prepared.amountRubles,
        status: "succeeded",
      });
      if (!verification.ok) {
        throw new YooKassaApiError(
          "ЮKassa вернула несогласованные данные платежа. Платёж требует проверки.",
        );
      }
      await saveYooKassaPayment(id, prepared.idempotenceKey, {
        id: canonicalPayment.id,
        confirmationUrl:
          canonicalPayment.confirmation?.confirmationUrl
          ?? payment.confirmation?.confirmationUrl
          ?? null,
        amountRubles: prepared.amountRubles,
      });
      const paidOrder = await markYooKassaPaymentSucceeded(
        prepared.order.id,
        canonicalPayment.id,
      );
      if (!paidOrder || paidOrder.paymentStatus !== "paid") {
        throw new StoreConflictError(
          "Платёж создан, но заказ изменился. Требуется ручная проверка.",
        );
      }
      return noStoreJson({ order: paidOrder }, { status: 201 });
    }

    const confirmationUrl = payment.confirmation?.confirmationUrl;
    if (!confirmationUrl) {
      throw new YooKassaApiError(
        "ЮKassa не вернула ссылку на оплату. Платёж требует проверки.",
      );
    }
    const order = await saveYooKassaPayment(id, prepared.idempotenceKey, {
      id: payment.id,
      confirmationUrl,
      amountRubles: prepared.amountRubles,
    });

    return noStoreJson({ order }, { status: 201 });
  } catch (error) {
    return paymentErrorResponse(error);
  }
}
