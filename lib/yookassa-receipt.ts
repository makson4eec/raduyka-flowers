import type { Order } from "./types";

const MAX_RECEIPT_ITEMS = 80;
const MAX_DESCRIPTION_LENGTH = 128;

export type YooKassaVatCode =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12;

export type YooKassaReceiptItem = {
  description: string;
  quantity: number;
  amount: {
    value: string;
    currency: "RUB";
  };
  vat_code: YooKassaVatCode;
  payment_mode: "full_prepayment";
  payment_subject: "commodity" | "service";
};

export type YooKassaReceipt = {
  customer: {
    email: string;
  };
  items: YooKassaReceiptItem[];
  internet: true;
};

type ReceiptOrder = Pick<
  Order,
  | "items"
  | "subtotal"
  | "discount"
  | "cardAdded"
  | "cardFee"
  | "deliveryMethod"
  | "deliveryFee"
  | "total"
  | "customerEmail"
>;

type GrossReceiptLine = {
  description: string;
  grossRubles: number;
  quantity: number;
  paymentSubject: "commodity" | "service";
  discountEligible: boolean;
  index: number;
};

type DiscountedReceiptLine = GrossReceiptLine & {
  netRubles: number;
};

export function parseYooKassaVatCode(value: unknown): YooKassaVatCode {
  const normalized = typeof value === "string" && /^\d{1,2}$/.test(value.trim())
    ? Number(value.trim())
    : value;

  if (
    typeof normalized !== "number"
    || !Number.isInteger(normalized)
    || normalized < 1
    || normalized > 12
  ) {
    throw new RangeError("YooKassa VAT code must be an integer from 1 to 12.");
  }

  return normalized as YooKassaVatCode;
}

export function normalizeYooKassaReceiptEmail(
  value: string | null | undefined,
): string {
  const email = value?.trim().toLowerCase() ?? "";
  if (
    email.length > 254
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)
  ) {
    throw new TypeError("Customer email must be valid.");
  }

  return email;
}

function receiptDescription(value: string, fallback: string) {
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || fallback;

  return [...normalized].slice(0, MAX_DESCRIPTION_LENGTH).join("");
}

function minorUnitsValue(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError("Receipt item amount must be positive.");
  }
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}

function assertSafeNonNegativeInteger(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative safe integer.`);
  }
}

function distributeDiscount(
  lines: GrossReceiptLine[],
  discountRubles: number,
): DiscountedReceiptLine[] {
  const eligibleLines = lines.filter((line) => line.discountEligible);
  const eligibleTotal = eligibleLines.reduce(
    (sum, line) => sum + line.grossRubles,
    0,
  );

  if (!Number.isSafeInteger(eligibleTotal) || eligibleTotal < 0) {
    throw new RangeError("Receipt has an invalid discount-eligible amount.");
  }
  if (eligibleTotal === 0) {
    if (discountRubles !== 0) {
      throw new RangeError("Receipt discount has no positive eligible amount.");
    }
    return [];
  }
  if (discountRubles >= eligibleTotal) {
    throw new RangeError("Receipt discount must leave a positive payable amount.");
  }

  const eligibleTotalBigInt = BigInt(eligibleTotal);
  const shares = new Map<number, number>();
  const ranked = eligibleLines.map((line) => {
    const numerator = BigInt(discountRubles) * BigInt(line.grossRubles);
    const initialShare = Number(numerator / eligibleTotalBigInt);
    shares.set(line.index, initialShare);
    return {
      line,
      remainder: numerator % eligibleTotalBigInt,
    };
  }).sort((left, right) => {
    if (left.remainder !== right.remainder) {
      return left.remainder > right.remainder ? -1 : 1;
    }
    return left.line.index - right.line.index;
  });

  let remaining = discountRubles - [...shares.values()].reduce(
    (sum, share) => sum + share,
    0,
  );

  // Hamilton's largest-remainder allocation for normal orders.
  for (const { line } of ranked) {
    if (remaining === 0) break;
    const currentShare = shares.get(line.index) ?? 0;
    if (currentShare < line.grossRubles - 1) {
      shares.set(line.index, currentShare + 1);
      remaining -= 1;
    }
  }

  // Very small pathological lines can have no room for a one-ruble discount.
  // Preserve positive fiscal amounts by moving the unresolved part to lines
  // that still have capacity, without changing the receipt total.
  if (remaining > 0) {
    const byCapacity = [...eligibleLines].sort((left, right) =>
      right.grossRubles - left.grossRubles || left.index - right.index
    );
    for (const line of byCapacity) {
      if (remaining === 0) break;
      const currentShare = shares.get(line.index) ?? 0;
      const capacity = line.grossRubles - 1 - currentShare;
      const allocated = Math.min(remaining, Math.max(0, capacity));
      shares.set(line.index, currentShare + allocated);
      remaining -= allocated;
    }
  }

  if (remaining !== 0) {
    throw new RangeError("Receipt discount cannot be allocated to positive items.");
  }

  return lines.map((line) => {
    const netRubles = line.grossRubles - (shares.get(line.index) ?? 0);
    if (!Number.isSafeInteger(netRubles) || netRubles <= 0) {
      throw new RangeError("Receipt discount produced a non-positive item.");
    }
    return { ...line, netRubles };
  });
}

export function buildYooKassaReceipt(
  order: ReceiptOrder,
  config: { vatCode: unknown },
): YooKassaReceipt {
  const vatCode = parseYooKassaVatCode(config.vatCode);
  const email = normalizeYooKassaReceiptEmail(order.customerEmail);

  if (!order.items.length) {
    throw new RangeError("Receipt order must contain at least one item.");
  }

  let calculatedSubtotal = 0;
  const grossLines: GrossReceiptLine[] = [];
  for (const item of order.items) {
    assertSafeNonNegativeInteger(item.price, "Order item price");
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
      throw new RangeError("Order item quantity must be a positive safe integer.");
    }

    const grossRubles = item.price * item.quantity;
    if (!Number.isSafeInteger(grossRubles)) {
      throw new RangeError("Order item total exceeds the safe integer range.");
    }
    calculatedSubtotal += grossRubles;
    if (!Number.isSafeInteger(calculatedSubtotal)) {
      throw new RangeError("Order subtotal exceeds the safe integer range.");
    }

    // YooKassa requires every fiscal item amount to be positive. A zero-price
    // snapshot remains covered by the stored-order total validation but cannot
    // be represented as a separate receipt item.
    if (grossRubles > 0) {
      grossLines.push({
        description: receiptDescription(item.name, `Товар ${item.productId}`),
        grossRubles,
        quantity: item.quantity,
        paymentSubject: "commodity",
        discountEligible: true,
        index: grossLines.length,
      });
    }
  }

  assertSafeNonNegativeInteger(order.subtotal, "Order subtotal");
  if (calculatedSubtotal !== order.subtotal) {
    throw new RangeError("Stored order subtotal does not match its items.");
  }

  const cardRubles = order.cardFee ?? 0;
  assertSafeNonNegativeInteger(cardRubles, "Order card fee");
  if (cardRubles > 0) {
    grossLines.push({
      description: "Открытка",
      grossRubles: cardRubles,
      quantity: 1,
      paymentSubject: "commodity",
      discountEligible: true,
      index: grossLines.length,
    });
  } else if (order.cardAdded) {
    throw new RangeError("A selected order card must have a positive fee.");
  }

  assertSafeNonNegativeInteger(order.discount, "Order discount");
  const discountedLines = distributeDiscount(grossLines, order.discount);

  const deliveryRubles = order.deliveryMethod === "pickup"
    ? 0
    : order.deliveryFee;
  if (deliveryRubles === null) {
    throw new RangeError("Delivery fee must be set before creating a receipt.");
  }
  assertSafeNonNegativeInteger(deliveryRubles, "Order delivery fee");

  const finalLines = [...discountedLines];
  if (deliveryRubles > 0) {
    finalLines.push({
      description: "Доставка",
      grossRubles: deliveryRubles,
      netRubles: deliveryRubles,
      quantity: 1,
      paymentSubject: "service",
      discountEligible: false,
      index: finalLines.length,
    });
  }

  if (!finalLines.length || finalLines.length > MAX_RECEIPT_ITEMS) {
    throw new RangeError(`YooKassa receipt must contain from 1 to ${MAX_RECEIPT_ITEMS} items.`);
  }

  const calculatedTotal = finalLines.reduce(
    (sum, line) => sum + line.netRubles,
    0,
  );
  if (
    !Number.isSafeInteger(order.total)
    || order.total <= 0
    || calculatedTotal !== order.total
  ) {
    throw new RangeError("YooKassa receipt total does not match the order total.");
  }

  let splitBudget = MAX_RECEIPT_ITEMS - finalLines.length;
  const items = finalLines.flatMap((line): YooKassaReceiptItem[] => {
    const totalMinorUnits = line.netRubles * 100;
    if (!Number.isSafeInteger(totalMinorUnits) || totalMinorUnits <= 0) {
      throw new RangeError("Receipt line amount exceeds the safe integer range.");
    }

    const baseMinorUnits = Math.floor(totalMinorUnits / line.quantity);
    const remainder = totalMinorUnits % line.quantity;
    const common = {
      vat_code: vatCode,
      payment_mode: "full_prepayment" as const,
      payment_subject: line.paymentSubject,
    };

    if (baseMinorUnits > 0 && remainder === 0) {
      return [{
        description: line.description,
        quantity: line.quantity,
        amount: {
          value: minorUnitsValue(baseMinorUnits),
          currency: "RUB",
        },
        ...common,
      }];
    }

    if (baseMinorUnits > 0 && splitBudget > 0) {
      splitBudget -= 1;
      const lowerQuantity = line.quantity - remainder;
      return [
        ...(lowerQuantity > 0 ? [{
          description: line.description,
          quantity: lowerQuantity,
          amount: {
            value: minorUnitsValue(baseMinorUnits),
            currency: "RUB" as const,
          },
          ...common,
        }] : []),
        {
          description: line.description,
          quantity: remainder,
          amount: {
            value: minorUnitsValue(baseMinorUnits + 1),
            currency: "RUB" as const,
          },
          ...common,
        },
      ];
    }

    // A receipt supports at most 80 items. If an unusually large cart has too
    // many non-divisible discounted lines, preserve the exact line total as a
    // single bundle and keep the original quantity in its description.
    return [{
      description: receiptDescription(
        `${line.description} × ${line.quantity}`,
        line.description,
      ),
      quantity: 1,
      amount: {
        value: minorUnitsValue(totalMinorUnits),
        currency: "RUB",
      },
      ...common,
    }];
  });

  const itemsTotalMinorUnits = items.reduce((sum, item) => {
    const [rubles, kopecks] = item.amount.value.split(".").map(Number);
    const unitAmount = rubles * 100 + kopecks;
    return sum + unitAmount * item.quantity;
  }, 0);
  if (itemsTotalMinorUnits !== order.total * 100) {
    throw new RangeError("YooKassa receipt item quantities do not match the order total.");
  }

  return {
    customer: { email },
    items,
    internet: true,
  };
}
