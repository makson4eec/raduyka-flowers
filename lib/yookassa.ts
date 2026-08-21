import "server-only";

import {
  amountToMinorUnits,
  isYooKassaPaymentId,
  parseYooKassaErrorResponse,
  parseYooKassaPayment,
  rublesToYooKassaValue,
  yooKassaAdminErrorMessage,
  type YooKassaPayment,
} from "./yookassa-contract";
import {
  buildYooKassaReceipt,
  parseYooKassaVatCode,
  type YooKassaReceipt,
  type YooKassaVatCode,
} from "./yookassa-receipt";
import type { Order } from "./types";

const YOOKASSA_API_URL = "https://api.yookassa.ru/v3";
const REQUEST_TIMEOUT_MS = 20_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class YooKassaApiError extends Error {
  readonly status: number;
  readonly upstreamStatus: number | null;

  constructor(
    message: string,
    options: { status?: number; upstreamStatus?: number | null } = {},
  ) {
    super(message);
    this.name = "YooKassaApiError";
    this.status = options.status ?? 502;
    this.upstreamStatus = options.upstreamStatus ?? null;
  }
}

type YooKassaCredentials = {
  shopId: string;
  secretKey: string;
};

export type CreateYooKassaSbpPaymentInput = {
  amountRubles: number;
  orderId: string;
  orderNumber: string;
  order: Order;
  returnUrl: string;
  idempotenceKey: string;
};

type YooKassaReceiptConfiguration = {
  vatCode: YooKassaVatCode;
  taxSystemCode?: number;
};

type YooKassaReceiptPayload = YooKassaReceipt & {
  tax_system_code?: number;
};

function requireReceiptConfiguration(): YooKassaReceiptConfiguration {
  let vatCode: YooKassaVatCode;
  try {
    vatCode = parseYooKassaVatCode(
      process.env.YOOKASSA_RECEIPT_VAT_CODE?.trim(),
    );
  } catch {
    throw new YooKassaApiError(
      "ЮKassa требует чек: задайте серверную переменную YOOKASSA_RECEIPT_VAT_CODE от 1 до 12 согласно вашей ставке НДС.",
      { status: 503 },
    );
  }

  const rawTaxSystemCode =
    process.env.YOOKASSA_RECEIPT_TAX_SYSTEM_CODE?.trim() ?? "";
  if (!rawTaxSystemCode) return { vatCode };

  if (!/^[1-6]$/.test(rawTaxSystemCode)) {
    throw new YooKassaApiError(
      "Некорректная серверная настройка YOOKASSA_RECEIPT_TAX_SYSTEM_CODE: допустимы значения от 1 до 6.",
      { status: 503 },
    );
  }

  return { vatCode, taxSystemCode: Number(rawTaxSystemCode) };
}

function receiptForPayment(
  order: Order,
  expectedAmountRubles: number,
): YooKassaReceiptPayload {
  const { vatCode, taxSystemCode } = requireReceiptConfiguration();
  let receipt: YooKassaReceipt;

  try {
    receipt = buildYooKassaReceipt(order, { vatCode });
  } catch {
    throw new YooKassaApiError(
      "Не удалось сформировать чек из сохранённых данных заказа. Укажите и сохраните настоящий email покупателя, затем проверьте позиции, скидку и итоговую сумму.",
      { status: 400 },
    );
  }

  const receiptAmountMinorUnits = receipt.items.reduce((sum, item) => {
    const amount = amountToMinorUnits(item.amount.value);
    const lineAmount = amount === null ? null : amount * item.quantity;
    if (lineAmount === null || !Number.isSafeInteger(sum + lineAmount)) {
      throw new YooKassaApiError("Сумма позиций чека некорректна.", {
        status: 500,
      });
    }
    return sum + lineAmount;
  }, 0);
  if (receiptAmountMinorUnits !== expectedAmountRubles * 100) {
    throw new YooKassaApiError(
      "Сумма позиций чека не совпадает с суммой платежа.",
      { status: 500 },
    );
  }

  return taxSystemCode === undefined
    ? receipt
    : { ...receipt, tax_system_code: taxSystemCode };
}

function requireCredentials(): YooKassaCredentials {
  const shopId = process.env.YOOKASSA_SHOP_ID?.trim();
  const secretKey = process.env.YOOKASSA_SECRET_KEY?.trim();

  if (!shopId || !/^\d+$/.test(shopId) || !secretKey) {
    throw new YooKassaApiError(
      "ЮKassa не настроена: проверьте серверные переменные окружения.",
      { status: 503 },
    );
  }

  return { shopId, secretKey };
}

function configuredSiteOrigin() {
  const rawSiteUrl = process.env.SITE_URL?.trim();
  if (!rawSiteUrl) {
    throw new YooKassaApiError(
      "ЮKassa не настроена: отсутствует SITE_URL.",
      { status: 503 },
    );
  }

  try {
    const url = new URL(rawSiteUrl);
    const allowedProtocol =
      url.protocol === "https:"
      || (process.env.NODE_ENV !== "production" && url.protocol === "http:");

    if (!allowedProtocol || url.username || url.password) {
      throw new Error("Invalid SITE_URL");
    }
    return url.origin;
  } catch {
    throw new YooKassaApiError(
      "ЮKassa не настроена: SITE_URL должен быть корректным HTTPS-адресом.",
      { status: 503 },
    );
  }
}

function assertReturnUrl(value: string) {
  try {
    const url = new URL(value);
    if (
      url.origin !== configuredSiteOrigin()
      || (process.env.NODE_ENV === "production" && url.protocol !== "https:")
      || url.username
      || url.password
    ) {
      throw new Error("Invalid return URL");
    }
    return url.toString();
  } catch (error) {
    if (error instanceof YooKassaApiError) throw error;
    throw new YooKassaApiError("Некорректный адрес возврата после оплаты.", {
      status: 500,
    });
  }
}

function authorizationHeader() {
  const { shopId, secretKey } = requireCredentials();
  return `Basic ${Buffer.from(`${shopId}:${secretKey}`, "utf8").toString("base64")}`;
}

async function requestPayment(
  pathname: string,
  init: RequestInit = {},
): Promise<YooKassaPayment> {
  let response: Response;

  try {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    headers.set("Authorization", authorizationHeader());

    response = await fetch(`${YOOKASSA_API_URL}${pathname}`, {
      ...init,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers,
    });
  } catch (error) {
    if (error instanceof YooKassaApiError) throw error;
    throw new YooKassaApiError("Не удалось связаться с ЮKassa. Попробуйте ещё раз.");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new YooKassaApiError("ЮKassa вернула некорректный ответ.", {
      upstreamStatus: response.status,
    });
  }

  if (!response.ok) {
    const details = parseYooKassaErrorResponse(payload);
    if (details) {
      console.error("YooKassa API rejected a request", {
        upstreamStatus: response.status,
        code: details.code,
        parameter: details.parameter,
        description: details.description,
        requestId: details.requestId,
      });
    }
    throw new YooKassaApiError(yooKassaAdminErrorMessage(response.status, details), {
      upstreamStatus: response.status,
    });
  }

  try {
    return parseYooKassaPayment(payload);
  } catch {
    throw new YooKassaApiError("ЮKassa вернула некорректные данные платежа.", {
      upstreamStatus: response.status,
    });
  }
}

export function getYooKassaReturnUrl(orderNumber: string) {
  const normalizedOrderNumber = orderNumber.trim();
  if (!normalizedOrderNumber || normalizedOrderNumber.length > 128) {
    throw new YooKassaApiError("Некорректный номер заказа.", { status: 500 });
  }

  const returnUrl = new URL("/", configuredSiteOrigin());
  returnUrl.searchParams.set("order", normalizedOrderNumber);
  return returnUrl.toString();
}

export async function createYooKassaSbpPayment(
  input: CreateYooKassaSbpPaymentInput,
) {
  if (!UUID_PATTERN.test(input.orderId)) {
    throw new YooKassaApiError("Некорректный идентификатор заказа.", {
      status: 500,
    });
  }
  if (!UUID_V4_PATTERN.test(input.idempotenceKey)) {
    throw new YooKassaApiError("Некорректный ключ идемпотентности платежа.", {
      status: 500,
    });
  }

  const orderNumber = input.orderNumber.trim();
  if (!orderNumber || orderNumber.length > 128) {
    throw new YooKassaApiError("Некорректный номер заказа.", { status: 500 });
  }

  let amountValue: string;
  try {
    amountValue = rublesToYooKassaValue(input.amountRubles);
  } catch {
    throw new YooKassaApiError("Некорректная сумма платежа.", { status: 500 });
  }
  if (
    input.order.id !== input.orderId
    || input.order.orderNumber !== orderNumber
    || input.order.total !== input.amountRubles
  ) {
    throw new YooKassaApiError(
      "Данные заказа для платежа не совпадают с сохранённым заказом.",
      { status: 500 },
    );
  }
  const returnUrl = assertReturnUrl(input.returnUrl);
  const description = [...`Оплата заказа ${orderNumber}`].slice(0, 128).join("");
  const receipt = receiptForPayment(input.order, input.amountRubles);

  const payment = await requestPayment("/payments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotence-Key": input.idempotenceKey,
    },
    body: JSON.stringify({
      amount: {
        value: amountValue,
        currency: "RUB",
      },
      payment_method_data: {
        type: "sbp",
      },
      capture: true,
      confirmation: {
        type: "redirect",
        return_url: returnUrl,
      },
      description,
      receipt,
      metadata: {
        order_id: input.orderId,
        order_number: orderNumber,
      },
    }),
  });

  const amountMatches =
    payment.amount.currency === "RUB"
    && amountToMinorUnits(payment.amount.value) === input.amountRubles * 100;
  const pendingConfirmationIsValid =
    payment.status !== "pending"
    || (
      payment.paid === false
      && payment.confirmation?.type === "redirect"
      && Boolean(payment.confirmation.confirmationUrl)
    );
  const finalStatusIsValid =
    payment.status === "pending"
    || (payment.status === "succeeded" && payment.paid)
    || (payment.status === "canceled" && !payment.paid);

  if (
    !amountMatches
    || payment.metadata.order_id !== input.orderId
    || payment.paymentMethod?.type !== "sbp"
    || !pendingConfirmationIsValid
    || !finalStatusIsValid
  ) {
    throw new YooKassaApiError("ЮKassa вернула несогласованные данные платежа.");
  }

  return payment;
}

export function getYooKassaPayment(paymentId: string) {
  if (!isYooKassaPaymentId(paymentId)) {
    throw new YooKassaApiError("Некорректный идентификатор платежа.", {
      status: 400,
    });
  }

  return requestPayment(`/payments/${encodeURIComponent(paymentId)}`);
}
