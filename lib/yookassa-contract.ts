export type YooKassaPaymentStatus =
  | "pending"
  | "waiting_for_capture"
  | "succeeded"
  | "canceled";

export type YooKassaPayment = {
  id: string;
  status: YooKassaPaymentStatus;
  paid: boolean;
  amount: {
    value: string;
    currency: string;
  };
  confirmation?: {
    type: string;
    confirmationUrl?: string;
  };
  metadata: Record<string, string>;
  paymentMethod?: {
    type: string;
  };
};

export type YooKassaPaymentVerification =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "payment_id_mismatch"
        | "status_mismatch"
        | "paid_mismatch"
        | "amount_mismatch"
        | "currency_mismatch"
        | "order_id_mismatch"
        | "payment_method_mismatch";
    };

const PAYMENT_STATUSES = new Set<YooKassaPaymentStatus>([
  "pending",
  "waiting_for_capture",
  "succeeded",
  "canceled",
]);

const PAYMENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function parseStringRecord(value: unknown) {
  const record = asRecord(value);
  if (!record) return null;

  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry !== "string") return null;
    result[key] = entry;
  }
  return result;
}

export function isYooKassaPaymentId(value: string) {
  return PAYMENT_ID_PATTERN.test(value);
}

export function rublesToYooKassaValue(rubles: number) {
  if (
    !Number.isSafeInteger(rubles)
    || rubles <= 0
    || rubles > Math.floor(Number.MAX_SAFE_INTEGER / 100)
  ) {
    throw new RangeError("Payment amount must be a positive integer number of rubles.");
  }

  return `${rubles}.00`;
}

export function amountToMinorUnits(value: string) {
  const match = /^(0|[1-9]\d*)\.(\d{2})$/.exec(value);
  if (!match) return null;

  const rubles = Number(match[1]);
  const kopecks = Number(match[2]);
  if (!Number.isSafeInteger(rubles)) return null;

  const minorUnits = rubles * 100 + kopecks;
  return Number.isSafeInteger(minorUnits) ? minorUnits : null;
}

export function parseYooKassaPayment(value: unknown): YooKassaPayment {
  const payment = asRecord(value);
  if (!payment) {
    throw new TypeError("YooKassa returned an invalid payment object.");
  }

  if (typeof payment.id !== "string" || !isYooKassaPaymentId(payment.id)) {
    throw new TypeError("YooKassa returned an invalid payment id.");
  }
  if (
    typeof payment.status !== "string"
    || !PAYMENT_STATUSES.has(payment.status as YooKassaPaymentStatus)
  ) {
    throw new TypeError("YooKassa returned an invalid payment status.");
  }
  if (typeof payment.paid !== "boolean") {
    throw new TypeError("YooKassa returned an invalid paid flag.");
  }

  const amount = asRecord(payment.amount);
  if (
    !amount
    || typeof amount.value !== "string"
    || amountToMinorUnits(amount.value) === null
    || typeof amount.currency !== "string"
  ) {
    throw new TypeError("YooKassa returned an invalid payment amount.");
  }

  const metadata = parseStringRecord(payment.metadata);
  if (!metadata) {
    throw new TypeError("YooKassa returned invalid payment metadata.");
  }

  let confirmation: YooKassaPayment["confirmation"];
  if (payment.confirmation !== undefined && payment.confirmation !== null) {
    const source = asRecord(payment.confirmation);
    if (!source || typeof source.type !== "string" || !source.type) {
      throw new TypeError("YooKassa returned an invalid confirmation object.");
    }
    if (
      source.confirmation_url !== undefined
      && (
        typeof source.confirmation_url !== "string"
        || !isHttpsUrl(source.confirmation_url)
      )
    ) {
      throw new TypeError("YooKassa returned an invalid confirmation URL.");
    }
    confirmation = {
      type: source.type,
      confirmationUrl: source.confirmation_url as string | undefined,
    };
  }

  let paymentMethod: YooKassaPayment["paymentMethod"];
  if (payment.payment_method !== undefined && payment.payment_method !== null) {
    const source = asRecord(payment.payment_method);
    if (!source || typeof source.type !== "string" || !source.type) {
      throw new TypeError("YooKassa returned an invalid payment method.");
    }
    paymentMethod = { type: source.type };
  }

  return {
    id: payment.id,
    status: payment.status as YooKassaPaymentStatus,
    paid: payment.paid,
    amount: {
      value: amount.value,
      currency: amount.currency,
    },
    confirmation,
    metadata,
    paymentMethod,
  };
}

export function verifyYooKassaPaymentForOrder(
  payment: YooKassaPayment,
  expected: {
    expectedPaymentId: string;
    expectedOrderId: string;
    expectedAmountRubles: number;
    status: "pending" | "succeeded" | "canceled";
  },
): YooKassaPaymentVerification {
  if (payment.id !== expected.expectedPaymentId) {
    return { ok: false, reason: "payment_id_mismatch" };
  }
  if (payment.status !== expected.status) {
    return { ok: false, reason: "status_mismatch" };
  }
  if (payment.paid !== (expected.status === "succeeded")) {
    return { ok: false, reason: "paid_mismatch" };
  }
  if (payment.amount.currency !== "RUB") {
    return { ok: false, reason: "currency_mismatch" };
  }

  const actualMinorUnits = amountToMinorUnits(payment.amount.value);
  const expectedMinorUnits = expected.expectedAmountRubles * 100;
  if (
    !Number.isSafeInteger(expected.expectedAmountRubles)
    || expected.expectedAmountRubles <= 0
    || !Number.isSafeInteger(expectedMinorUnits)
    || actualMinorUnits !== expectedMinorUnits
  ) {
    return { ok: false, reason: "amount_mismatch" };
  }
  if (payment.metadata.order_id !== expected.expectedOrderId) {
    return { ok: false, reason: "order_id_mismatch" };
  }
  if (payment.paymentMethod?.type !== "sbp") {
    return { ok: false, reason: "payment_method_mismatch" };
  }

  return { ok: true };
}
