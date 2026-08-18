import { createHash } from "node:crypto";
import { z } from "zod";
import {
  BonusServiceError,
  getCustomerIdentity,
  requireBonusCustomer,
} from "../../../lib/bonus-server";
import {
  assertSameOriginMutation,
  consumeRequestRateLimit,
  HttpSecurityError,
  noStoreJson,
  rateLimitHeaders,
  readJsonBody,
  securityErrorResponse,
} from "../../../lib/http-security";
import {
  createOrder,
  StoreConflictError,
  StoreValidationError,
} from "../../../lib/store";
import { LEGAL_DOCUMENT_VERSION } from "../../../lib/legal";
import type { CreateOrderInput } from "../../../lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const idempotencyKeyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeSingleLinePattern = /^[^\u0000-\u001f\u007f]*$/u;
const safeMultilinePattern = /^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]*$/u;
const deliveryTimes = new Set([
  "14:30–15:30",
  "15:30–16:30",
  "16:30–17:30",
]);

const singleLine = (maximum: number) => z
  .string()
  .trim()
  .max(maximum)
  .refine((value) => safeSingleLinePattern.test(value));

const phone = z
  .string()
  .trim()
  .max(40)
  .refine((value) => {
    const digits = value.replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 15;
  });

const builderSchema = z.object({
  budget: z.number().int().min(1).max(100_000),
  mood: singleLine(50),
  flowers: z.array(singleLine(50)).min(1).max(6),
  wrap: singleLine(50),
}).strict();

const orderSchema = z.object({
  deliveryMethod: z.enum(["delivery", "pickup"]),
  recipientType: z.enum(["self", "other"]),
  recipientName: singleLine(100),
  recipientPhone: z.string().trim().max(40),
  customerName: singleLine(100).min(1),
  customerPhone: phone,
  address: singleLine(300),
  deliveryDate: z.string().trim().max(20),
  deliveryTime: z.string().trim().max(40),
  cardText: z
    .string()
    .trim()
    .max(500)
    .refine((value) => safeMultilinePattern.test(value)),
  useBonus: z.boolean(),
  cardAdded: z.boolean(),
  offerAccepted: z.literal(true),
  offerVersion: z.literal(LEGAL_DOCUMENT_VERSION),
  items: z.array(z.object({
    productId: z.number().int().positive(),
    quantity: z.number().int().min(1).max(20),
    size: z.enum(["small", "medium", "large"]).optional(),
    addOns: z.array(z.enum(["vase", "sweet"])).max(2).optional(),
    builder: builderSchema.optional(),
    variantId: z.string().trim().min(1).max(40).optional(),
  }).strict()).min(1).max(50),
}).strict();

function idempotencyKey(request: Request) {
  const value = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!idempotencyKeyPattern.test(value)) {
    throw new HttpSecurityError(
      400,
      "Не удалось безопасно идентифицировать запрос. Обновите страницу и попробуйте снова.",
    );
  }
  return value;
}

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    if (!request.headers.get("origin")) {
      throw new HttpSecurityError(403, "Недопустимый источник запроса.");
    }

    const rateLimit = consumeRequestRateLimit(
      request,
      "public-order-create",
      6,
      10 * 60_000,
    );
    if (!rateLimit.allowed) {
      return noStoreJson(
        { error: "Слишком много заказов с этого устройства. Попробуйте позже." },
        { status: 429, headers: rateLimitHeaders(rateLimit) },
      );
    }

    const requestKey = idempotencyKey(request);
    const parsed = orderSchema.safeParse(await readJsonBody(request, 48 * 1_024));
    if (!parsed.success) {
      return noStoreJson(
        { error: "Проверьте данные заказа и попробуйте снова." },
        { status: 400 },
      );
    }

    const payload = parsed.data;
    if (
      payload.deliveryMethod === "delivery"
      && (
        payload.address.length < 5
        || !["today", "tomorrow"].includes(payload.deliveryDate)
        || !deliveryTimes.has(payload.deliveryTime)
      )
    ) {
      return noStoreJson(
        { error: "Укажите корректные адрес, дату и время доставки." },
        { status: 400 },
      );
    }
    if (
      payload.recipientType === "other"
      && (
        !payload.recipientName
        || !phone.safeParse(payload.recipientPhone).success
      )
    ) {
      return noStoreJson(
        { error: "Укажите имя и корректный телефон получателя." },
        { status: 400 },
      );
    }
    if (payload.cardAdded && !payload.cardText) {
      return noStoreJson(
        { error: "Напишите текст для открытки." },
        { status: 400 },
      );
    }

    const customerName = payload.customerName;
    const customerPhone = payload.customerPhone;
    const input: CreateOrderInput = {
      ...payload,
      recipientName:
        payload.recipientType === "self"
          ? customerName
          : payload.recipientName,
      recipientPhone:
        payload.recipientType === "self"
          ? customerPhone
          : payload.recipientPhone,
      address: payload.deliveryMethod === "delivery" ? payload.address : "",
      deliveryDate:
        payload.deliveryMethod === "delivery" ? payload.deliveryDate : "",
      deliveryTime:
        payload.deliveryMethod === "delivery" ? payload.deliveryTime : "",
      cardText: payload.cardAdded ? payload.cardText : "",
    };

    const identity = await getCustomerIdentity();
    const customerUserId = input.useBonus
      ? requireBonusCustomer(identity)
      : identity.state === "authenticated" ? identity.userId : null;
    const idempotencyKeyHash = createHash("sha256")
      .update(requestKey)
      .digest("base64url");
    const idempotencyFingerprintHash = createHash("sha256")
      .update(JSON.stringify({ input, customerUserId }))
      .digest("base64url");
    const order = await createOrder(input, {
      customerUserId,
      idempotencyKeyHash,
      idempotencyFingerprintHash,
    });

    return noStoreJson(
      {
        order: {
          orderNumber: order.orderNumber,
          total: order.total,
          status: order.status,
          paymentStatus: order.paymentStatus,
          updatedAt: order.updatedAt,
          bonusSpent: order.bonusSpent ?? 0,
        },
        bonus: {
          spent: order.bonusSpent ?? 0,
          earned: order.bonusEarned ?? 0,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof BonusServiceError) {
      return noStoreJson({ error: error.message }, { status: error.status });
    }
    if (error instanceof StoreValidationError) {
      return noStoreJson({ error: error.message }, { status: 400 });
    }
    if (error instanceof StoreConflictError) {
      return noStoreJson({ error: error.message }, { status: 409 });
    }
    return securityErrorResponse(error);
  }
}
