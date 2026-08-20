import assert from "node:assert/strict";
import test from "node:test";

import {
  amountToMinorUnits,
  parseYooKassaErrorResponse,
  parseYooKassaPayment,
  rublesToYooKassaValue,
  verifyYooKassaPaymentForOrder,
  yooKassaAdminErrorMessage,
} from "../lib/yookassa-contract.ts";

const paymentId = "264e0bc0-000f-5000-a000-109b22344b4c";
const orderId = "8b3fa823-5ec4-46f0-af54-33a074aa5bed";

function succeededPayment(overrides = {}) {
  return {
    id: paymentId,
    status: "succeeded",
    paid: true,
    amount: {
      value: "2961.00",
      currency: "RUB",
    },
    metadata: {
      order_id: orderId,
      order_number: "RAD-260820-TEST",
    },
    payment_method: {
      type: "sbp",
    },
    ...overrides,
  };
}

test("форматирует целые рубли для API ЮKassa без округления", () => {
  assert.equal(rublesToYooKassaValue(1), "1.00");
  assert.equal(rublesToYooKassaValue(2961), "2961.00");
  assert.throws(() => rublesToYooKassaValue(0), RangeError);
  assert.throws(() => rublesToYooKassaValue(10.5), RangeError);
});

test("разбирает только точную денежную строку с двумя знаками", () => {
  assert.equal(amountToMinorUnits("2961.00"), 296100);
  assert.equal(amountToMinorUnits("0.01"), 1);
  assert.equal(amountToMinorUnits("2961"), null);
  assert.equal(amountToMinorUnits("02961.00"), null);
  assert.equal(amountToMinorUnits("2961.000"), null);
});

test("принимает подтверждённый СБП-платёж только при полном совпадении", () => {
  const payment = parseYooKassaPayment(succeededPayment());

  assert.deepEqual(
    verifyYooKassaPaymentForOrder(payment, {
      expectedPaymentId: paymentId,
      expectedOrderId: orderId,
      expectedAmountRubles: 2961,
      status: "succeeded",
    }),
    { ok: true },
  );
});

test("отклоняет подмену суммы, валюты, заказа и способа оплаты", () => {
  const expected = {
    expectedPaymentId: paymentId,
    expectedOrderId: orderId,
    expectedAmountRubles: 2961,
    status: "succeeded",
  };

  const wrongAmount = parseYooKassaPayment(
    succeededPayment({ amount: { value: "2960.00", currency: "RUB" } }),
  );
  assert.deepEqual(verifyYooKassaPaymentForOrder(wrongAmount, expected), {
    ok: false,
    reason: "amount_mismatch",
  });

  const wrongCurrency = parseYooKassaPayment(
    succeededPayment({ amount: { value: "2961.00", currency: "USD" } }),
  );
  assert.deepEqual(verifyYooKassaPaymentForOrder(wrongCurrency, expected), {
    ok: false,
    reason: "currency_mismatch",
  });

  const wrongOrder = parseYooKassaPayment(
    succeededPayment({ metadata: { order_id: crypto.randomUUID() } }),
  );
  assert.deepEqual(verifyYooKassaPaymentForOrder(wrongOrder, expected), {
    ok: false,
    reason: "order_id_mismatch",
  });

  const wrongMethod = parseYooKassaPayment(
    succeededPayment({ payment_method: { type: "bank_card" } }),
  );
  assert.deepEqual(verifyYooKassaPaymentForOrder(wrongMethod, expected), {
    ok: false,
    reason: "payment_method_mismatch",
  });
});

test("не принимает webhook-событие без совпадения id, статуса и paid", () => {
  const expected = {
    expectedPaymentId: paymentId,
    expectedOrderId: orderId,
    expectedAmountRubles: 2961,
    status: "succeeded",
  };

  const wrongId = parseYooKassaPayment(succeededPayment());
  assert.deepEqual(
    verifyYooKassaPaymentForOrder(wrongId, {
      ...expected,
      expectedPaymentId: crypto.randomUUID(),
    }),
    { ok: false, reason: "payment_id_mismatch" },
  );

  const pending = parseYooKassaPayment(
    succeededPayment({ status: "pending", paid: false }),
  );
  assert.deepEqual(verifyYooKassaPaymentForOrder(pending, expected), {
    ok: false,
    reason: "status_mismatch",
  });

  const unpaid = parseYooKassaPayment(succeededPayment({ paid: false }));
  assert.deepEqual(verifyYooKassaPaymentForOrder(unpaid, expected), {
    ok: false,
    reason: "paid_mismatch",
  });
});

test("проверяет активный СБП-платёж при восстановлении ссылки", () => {
  const pending = parseYooKassaPayment(
    succeededPayment({ status: "pending", paid: false }),
  );
  assert.deepEqual(
    verifyYooKassaPaymentForOrder(pending, {
      expectedPaymentId: paymentId,
      expectedOrderId: orderId,
      expectedAmountRubles: 2961,
      status: "pending",
    }),
    { ok: true },
  );
});

test("строго проверяет структуру ответа ЮKassa", () => {
  assert.throws(
    () => parseYooKassaPayment(succeededPayment({ paid: "true" })),
    /paid flag/,
  );
  assert.throws(
    () =>
      parseYooKassaPayment(
        succeededPayment({
          confirmation: {
            type: "redirect",
            confirmation_url: "http://example.com/payment",
          },
        }),
      ),
    /confirmation URL/,
  );
});

test("разбирает официальный ответ ЮKassa с причиной ошибки", () => {
  const details = parseYooKassaErrorResponse({
    type: "error",
    id: "e65a8f85-f8b7-4f4f-9fd3-bfef99aacbbb",
    code: "invalid_request",
    description: "Receipt is missing or illegal",
    parameter: "receipt.items[0].vat_code",
  });

  assert.deepEqual(details, {
    code: "invalid_request",
    description: "Receipt is missing or illegal",
    parameter: "receipt.items[0].vat_code",
    requestId: "e65a8f85-f8b7-4f4f-9fd3-bfef99aacbbb",
  });
  assert.match(yooKassaAdminErrorMessage(400, details), /receipt\.items\[0\]\.vat_code/);
  assert.match(yooKassaAdminErrorMessage(400, details), /Receipt is missing/);
});

test("показывает понятные действия для ошибок доступа ЮKassa", () => {
  const credentials = parseYooKassaErrorResponse({
    type: "error",
    id: "e65a8f85-f8b7-4f4f-9fd3-bfef99aacbbb",
    code: "invalid_credentials",
  });
  const forbidden = parseYooKassaErrorResponse({
    type: "error",
    id: "17a47682-8d47-4655-a414-a58bdbcd46f9",
    code: "forbidden",
  });

  assert.match(yooKassaAdminErrorMessage(401, credentials), /YOOKASSA_SHOP_ID/);
  assert.match(yooKassaAdminErrorMessage(403, forbidden), /подключена оплата через СБП/);
});

test("не пропускает неподтверждённые и опасные данные ошибки", () => {
  assert.equal(parseYooKassaErrorResponse(null), null);
  assert.equal(parseYooKassaErrorResponse({ type: "error", code: "invalid_request" }), null);

  const details = parseYooKassaErrorResponse({
    type: "error",
    id: "e65a8f85-f8b7-4f4f-9fd3-bfef99aacbbb",
    code: "invalid_request",
    description: `<script>${"x".repeat(600)}</script>\nnext`,
    parameter: "receipt<script>",
  });
  const message = yooKassaAdminErrorMessage(400, details);

  assert.ok(details);
  assert.equal(details.parameter, undefined);
  assert.equal(details.description.length, 400);
  assert.doesNotMatch(message, /[<>]/);
});
