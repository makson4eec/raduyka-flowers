import assert from "node:assert/strict";
import test from "node:test";

import {
  buildYooKassaReceipt,
  normalizeYooKassaReceiptEmail,
  parseYooKassaVatCode,
} from "../lib/yookassa-receipt.ts";

function order(overrides = {}) {
  return {
    items: [
      {
        productId: 1,
        name: "Букет",
        image: "/bouquet.webp",
        price: 1_000,
        quantity: 2,
      },
    ],
    subtotal: 2_000,
    discount: 0,
    cardAdded: false,
    cardFee: 0,
    deliveryMethod: "pickup",
    deliveryFee: 0,
    total: 2_000,
    customerEmail: "buyer@example.com",
    ...overrides,
  };
}

function receiptTotal(receipt) {
  return receipt.items.reduce(
    (sum, item) => sum + Number(item.amount.value) * item.quantity,
    0,
  );
}

test("validates the mandatory YooKassa VAT code", () => {
  assert.equal(parseYooKassaVatCode("1"), 1);
  assert.equal(parseYooKassaVatCode(12), 12);
  assert.throws(() => parseYooKassaVatCode(undefined), RangeError);
  assert.throws(() => parseYooKassaVatCode("0"), RangeError);
  assert.throws(() => parseYooKassaVatCode(13), RangeError);
  assert.throws(() => parseYooKassaVatCode("1.0"), RangeError);
});

test("normalizes and validates the buyer email required by YooKassa receipts", () => {
  assert.equal(
    normalizeYooKassaReceiptEmail("  Buyer@Example.COM "),
    "buyer@example.com",
  );
  assert.throws(() => normalizeYooKassaReceiptEmail("buyer"), TypeError);
  assert.throws(() => normalizeYooKassaReceiptEmail("@example.com"), TypeError);
});

test("builds a pickup receipt from the stored item snapshot", () => {
  const receipt = buildYooKassaReceipt(order(), { vatCode: "1" });

  assert.deepEqual(receipt, {
    customer: { email: "buyer@example.com" },
    items: [
      {
        description: "Букет",
        quantity: 2,
        amount: { value: "1000.00", currency: "RUB" },
        vat_code: 1,
        payment_mode: "full_prepayment",
        payment_subject: "commodity",
      },
    ],
    internet: true,
  });
});

test("allocates bonus discount proportionally across products and card", () => {
  const receipt = buildYooKassaReceipt(order({
    items: [
      { productId: 1, name: "Букет", image: "", price: 1_000, quantity: 1 },
      { productId: 2, name: "Цветок", image: "", price: 500, quantity: 1 },
    ],
    subtotal: 1_500,
    discount: 169,
    cardAdded: true,
    cardFee: 190,
    total: 1_521,
  }), { vatCode: 1 });

  assert.deepEqual(
    receipt.items.map((item) => item.amount.value),
    ["900.00", "450.00", "171.00"],
  );
  assert.equal(receiptTotal(receipt), 1_521);
});

test("keeps delivery separate from the bonus discount", () => {
  const receipt = buildYooKassaReceipt(order({
    discount: 200,
    deliveryMethod: "delivery",
    deliveryFee: 350,
    total: 2_150,
  }), { vatCode: 1 });

  assert.deepEqual(
    receipt.items.map((item) => [item.description, item.amount.value, item.payment_subject]),
    [
      ["Букет", "900.00", "commodity"],
      ["Доставка", "350.00", "service"],
    ],
  );
  assert.equal(receiptTotal(receipt), 2_150);
});

test("allows a delivery-only payable total when stored goods are free", () => {
  const receipt = buildYooKassaReceipt(order({
    items: [
      { productId: 1, name: "Подарок", image: "", price: 0, quantity: 1 },
    ],
    subtotal: 0,
    deliveryMethod: "delivery",
    deliveryFee: 300,
    total: 300,
  }), { vatCode: 1 });

  assert.deepEqual(receipt.items, [
    {
      description: "Доставка",
      quantity: 1,
      amount: { value: "300.00", currency: "RUB" },
      vat_code: 1,
      payment_mode: "full_prepayment",
      payment_subject: "service",
    },
  ]);
});

test("uses a stable largest-remainder tie break", () => {
  const receipt = buildYooKassaReceipt(order({
    items: [
      { productId: 1, name: "Первый", image: "", price: 5, quantity: 1 },
      { productId: 2, name: "Второй", image: "", price: 5, quantity: 1 },
    ],
    subtotal: 10,
    discount: 1,
    total: 9,
  }), { vatCode: 1 });

  assert.deepEqual(
    receipt.items.map((item) => item.amount.value),
    ["4.00", "5.00"],
  );
});

test("splits a discounted quantity only when kopecks do not divide evenly", () => {
  const receipt = buildYooKassaReceipt(order({
    items: [
      { productId: 1, name: "Роза", image: "", price: 100, quantity: 3 },
    ],
    subtotal: 300,
    discount: 1,
    total: 299,
  }), { vatCode: 1 });

  assert.deepEqual(
    receipt.items.map((item) => [item.quantity, item.amount.value]),
    [[1, "99.66"], [2, "99.67"]],
  );
  assert.equal(receiptTotal(receipt), 299);
});

test("preserves positive lines when tiny items cannot take the rounded discount", () => {
  const items = [
    { productId: 1, name: "Основной товар", image: "", price: 10, quantity: 1 },
    ...Array.from({ length: 10 }, (_, index) => ({
      productId: index + 2,
      name: `Дополнение ${index + 1}`,
      image: "",
      price: 1,
      quantity: 1,
    })),
  ];
  const receipt = buildYooKassaReceipt(order({
    items,
    subtotal: 20,
    discount: 2,
    total: 18,
  }), { vatCode: 1 });

  assert.equal(receipt.items[0].amount.value, "8.00");
  assert.ok(receipt.items.slice(1).every((item) => item.amount.value === "1.00"));
  assert.equal(receiptTotal(receipt), 18);
});

test("rejects mismatched totals, unset delivery and excessive receipt lines", () => {
  assert.throws(
    () => buildYooKassaReceipt(order({ total: 1_999 }), { vatCode: 1 }),
    /total does not match/,
  );
  assert.throws(
    () => buildYooKassaReceipt(order({
      deliveryMethod: "delivery",
      deliveryFee: null,
    }), { vatCode: 1 }),
    /Delivery fee must be set/,
  );

  const items = Array.from({ length: 81 }, (_, index) => ({
    productId: index + 1,
    name: `Товар ${index + 1}`,
    image: "",
    price: 1,
    quantity: 1,
  }));
  assert.throws(
    () => buildYooKassaReceipt(order({
      items,
      subtotal: 81,
      total: 81,
    }), { vatCode: 1 }),
    /from 1 to 80/,
  );
});

test("sanitizes and caps receipt descriptions at 128 Unicode characters", () => {
  const receipt = buildYooKassaReceipt(order({
    items: [{
      productId: 1,
      name: `  Букет\n${"🌷".repeat(140)}  `,
      image: "",
      price: 100,
      quantity: 1,
    }],
    subtotal: 100,
    total: 100,
  }), { vatCode: 1 });

  assert.equal([...receipt.items[0].description].length, 128);
  assert.doesNotMatch(receipt.items[0].description, /\n/);
});
