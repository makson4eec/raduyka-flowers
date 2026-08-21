import { z } from "zod";
import { getAuthorizedAdmin, unauthorizedResponse } from "../../../../../lib/admin-auth";
import {
  assertSameOriginMutation,
  noStoreJson,
  readJsonBody,
  securityErrorResponse,
} from "../../../../../lib/http-security";
import {
  StoreConflictError,
  StoreNotFoundError,
  StoreValidationError,
  updateOrderAndSyncBonuses,
} from "../../../../../lib/store";
import type { OrderStatus, PaymentStatus } from "../../../../../lib/types";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const orderIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses: OrderStatus[] = [
  "new",
  "confirmed",
  "assembling",
  "ready",
  "delivery",
  "completed",
  "cancelled",
];
const payments: PaymentStatus[] = [
  "pending",
  "invoice_sent",
  "paid",
  "refunded",
];
const MAX_DELIVERY_FEE = 1_000_000;
const customerEmailSchema = z
  .string()
  .trim()
  .max(254)
  .email()
  .transform((value) => value.toLowerCase());

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 40) return false;
  return Number.isFinite(Date.parse(value));
}

export async function PATCH(request: Request, context: Context) {
  if (!(await getAuthorizedAdmin())) return unauthorizedResponse();

  try {
    assertSameOriginMutation(request);
    const id = (await context.params).id;
    if (!orderIdPattern.test(id)) {
      return noStoreJson({ error: "Некорректный заказ." }, { status: 400 });
    }

    const payload = await readJsonBody(request, 8 * 1_024) as {
      status?: unknown;
      paymentStatus?: unknown;
      deliveryFee?: unknown;
      adminNote?: unknown;
      customerEmail?: unknown;
      expectedUpdatedAt?: unknown;
    };
    if (
      typeof payload?.status !== "string"
      || !statuses.includes(payload.status as OrderStatus)
      || typeof payload.paymentStatus !== "string"
      || !payments.includes(payload.paymentStatus as PaymentStatus)
      || !isIsoTimestamp(payload.expectedUpdatedAt)
    ) {
      return noStoreJson({ error: "Некорректный статус заказа." }, { status: 400 });
    }

    const rawFee = payload.deliveryFee;
    const deliveryFee = rawFee === null || rawFee === undefined
      ? null
      : Number(rawFee);
    if (
      deliveryFee !== null
      && (
        !Number.isSafeInteger(deliveryFee)
        || deliveryFee < 0
        || deliveryFee > MAX_DELIVERY_FEE
      )
    ) {
      return noStoreJson(
        { error: "Укажите корректную стоимость доставки." },
        { status: 400 },
      );
    }

    let customerEmail: string | undefined;
    if (payload.customerEmail !== undefined) {
      const parsedEmail = customerEmailSchema.safeParse(payload.customerEmail);
      if (!parsedEmail.success) {
        return noStoreJson(
          { error: "Укажите корректный email покупателя." },
          { status: 400 },
        );
      }
      customerEmail = parsedEmail.data;
    }

    const order = await updateOrderAndSyncBonuses(id, {
      status: payload.status as OrderStatus,
      paymentStatus: payload.paymentStatus as PaymentStatus,
      deliveryFee,
      adminNote:
        typeof payload.adminNote === "string"
          ? payload.adminNote.trim().slice(0, 1_000)
          : "",
      customerEmail,
      expectedUpdatedAt: payload.expectedUpdatedAt,
    });

    return noStoreJson({ order });
  } catch (error) {
    if (error instanceof StoreConflictError) {
      return noStoreJson({ error: error.message }, { status: 409 });
    }
    if (error instanceof StoreNotFoundError) {
      return noStoreJson({ error: error.message }, { status: 404 });
    }
    if (error instanceof StoreValidationError) {
      return noStoreJson({ error: error.message }, { status: 400 });
    }
    return securityErrorResponse(error);
  }
}
