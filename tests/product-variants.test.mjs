import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseProduct } from "../lib/product-input.ts";
import {
  flowerVariantValidationError,
  prepareProductForSave,
} from "../lib/product-variants.ts";

const baseProduct = {
  id: 27,
  name: "Лилия",
  subtitle: "Поштучный цветок",
  care: "Меняйте воду",
  price: 250,
  image: "/images/lily-white.png",
  stock: "today",
  size: "M",
  palette: "white",
  visible: true,
  featured: false,
  sortOrder: 100,
};

test("сохраняет варианты цвета для цветов поштучно", () => {
  const product = parseProduct({
    ...baseProduct,
    kind: "flower",
    variants: [
      { id: "white", label: "Белая", image: "/images/lily-white.png", price: 250 },
      { id: "pink", label: "Розовая", image: "/images/lily-pink.png", price: 270 },
    ],
  });

  assert.equal(product.kind, "flower");
  assert.equal(product.variants.length, 2);
  assert.equal(product.variants[0].label, "Белая");
  assert.equal(product.variants[1].price, 270);
});

test("не сохраняет цветовые варианты у обычного букета", () => {
  const product = parseProduct({
    ...baseProduct,
    kind: "catalog",
    variants: [
      { id: "white", label: "Белая", image: "/images/lily-white.png", price: 250 },
    ],
  });

  assert.deepEqual(product.variants, []);
});

test("основной цвет становится фото и ценой карточки", () => {
  const product = prepareProductForSave({
    ...baseProduct,
    kind: "flower",
    variants: [
      { id: "pink", label: "Розовая", image: "/images/lily-pink.png", price: 310, oldPrice: 350 },
      { id: "white", label: "Белая", image: "/images/lily-white.png", price: 250 },
    ],
  });

  assert.equal(product.image, "/images/lily-pink.png");
  assert.equal(product.price, 310);
  assert.equal(product.oldPrice, 350);
});

test("админский товар проходит полный round-trip без ручного SQL", () => {
  const prepared = prepareProductForSave({
    ...baseProduct,
    kind: "flower",
    name: "Гипсофила",
    variants: [
      { id: "white", label: "Белая", image: "/images/lily-white.png", price: 250 },
      { id: "rainbow", label: "Радужная", image: "/images/lily-pink.png", price: 290 },
    ],
  });
  const parsed = parseProduct(prepared);

  assert.equal(parsed.name, "Гипсофила");
  assert.equal(parsed.variants.length, 2);
  assert.equal(parsed.variants[0].label, "Белая");
  assert.equal(parsed.variants[1].label, "Радужная");
  assert.equal(parsed.image, "/images/lily-white.png");
  assert.equal(parsed.price, 250);
});

test("не разрешает одинаковые названия цветов", () => {
  const error = flowerVariantValidationError({
    ...baseProduct,
    kind: "flower",
    variants: [
      { id: "white-1", label: "Белая", image: "/images/lily-white.png", price: 250 },
      { id: "white-2", label: "белая", image: "/images/lily-white.png", price: 250 },
    ],
  });

  assert.match(error ?? "", /добавлен дважды/);
});

test("контракт интерфейса сохраняет выбор цвета, фильтр Цветы и выбор типа товара", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const admin = await readFile(new URL("../app/admin/AdminDashboard.tsx", import.meta.url), "utf8");
  const store = await readFile(new URL("../lib/store.ts", import.meta.url), "utf8");

  assert.match(page, /getProductVariants\(product\)\.length > 0/);
  assert.match(page, /selectedProductIsFlower && getProductVariants\(selectedProduct\)\.length > 0/);
  assert.match(page, /variantId: line\.variantId/);
  assert.match(page, /"Все", "Цветы", "До 4 000 ₽"/);
  assert.match(page, /catalogFilter === "Цветы" \? item\.kind === "flower"/);
  assert.match(page, /window\.addEventListener\("focus", refreshWhenVisible\)/);
  assert.doesNotMatch(page, /publicFlowerName/);

  assert.match(admin, /Что создаём\?/);
  assert.match(admin, /openNewProduct\("catalog"\)/);
  assert.match(admin, /openNewProduct\("flower"\)/);
  assert.match(admin, /prepareProductForSave\(draft\)/);
  assert.match(admin, /Сделать основным/);
  assert.match(admin, /Supabase вручную менять не нужно/);

  assert.match(store, /Выбранный цвет больше недоступен/);
  assert.match(store, /product\.variants\.length === 1/);
});
