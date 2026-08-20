import "server-only";

import {
  calculateStoredOrderTotal,
  getOrderById,
  markYooKassaPaymentCanceled,
  markYooKassaPaymentSucceeded,
} from "./store";
import type { Order } from "./types";
import { getYooKassaPayment } from "./yookassa";
import {
  isYooKassaPaymentId,
  verifyYooKassaPaymentForOrder,
} from "./yookassa-contract";

export async function reconcileYooKassaOrderPayment(order: Order): Promise<Order> {
  if (
    order.status === "cancelled"
    || order.paymentStatus !== "invoice_sent"
    || !order.yookassaPaymentId
  ) {
    return order;
  }

  const paymentId = order.yookassaPaymentId;
  const expectedAmount = order.yookassaPaymentAmount;
  if (
    !isYooKassaPaymentId(paymentId)
    || !Number.isSafeInteger(expectedAmount)
    || (expectedAmount ?? 0) <= 0
    || calculateStoredOrderTotal(order) !== expectedAmount
  ) {
    throw new Error("Сохранённые данные платежа ЮKassa не совпадают с заказом.");
  }

  const payment = await getYooKassaPayment(paymentId);
  if (payment.status === "waiting_for_capture") {
    throw new Error("СБП-платёж неожиданно ожидает подтверждения списания.");
  }

  const verification = verifyYooKassaPaymentForOrder(payment, {
    expectedPaymentId: paymentId,
    expectedOrderId: order.id,
    expectedAmountRubles: expectedAmount as number,
    status: payment.status,
  });
  if (!verification.ok) {
    throw new Error(`Платёж ЮKassa не прошёл проверку: ${verification.reason}.`);
  }

  if (payment.status === "succeeded") {
    const updated = await markYooKassaPaymentSucceeded(order.id, paymentId);
    if (updated) return updated;
  } else if (payment.status === "canceled") {
    const updated = await markYooKassaPaymentCanceled(order.id, paymentId);
    if (updated) return updated;
  } else {
    return order;
  }

  return (await getOrderById(order.id)) ?? order;
}
