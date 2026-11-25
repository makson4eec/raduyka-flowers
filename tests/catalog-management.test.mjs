import assert from "node:assert/strict";
import test from "node:test";
import { parseCategory, parseProduct } from "../lib/product-input.ts";
import { getProductImages } from "../lib/product-images.ts";
import { defaultCategories, productCategoryId, sortCategories } from "../lib/categories.ts";
import { prepareProductForSave } from "../lib/product-variants.ts";

const cover = "/images/bouquet-1.webp";
const second = "/images/bouquet-2.webp";
const third = "/images/bouquet-3.webp";
const base = { id: 1, name: "Букет", image: cover, kind: "catalog", price: 100, variants: [] };

test("three product photos survive the admin save and API round trip", () => {
  const prepared = prepareProductForSave({ ...base, images: [cover, second, third] });
  const saved = parseProduct(JSON.parse(JSON.stringify(prepared)));
  assert.deepEqual(getProductImages(saved), [cover, second, third]);
});

test("old products retain their only photo and the gallery is limited to three unique photos", () => {
  assert.deepEqual(getProductImages(base), [cover]);
  assert.deepEqual(parseProduct({ ...base, images: [cover, second, second, third, "/images/bouquet-4.webp"] }).images, [cover, second, third]);
});

test("unsafe gallery URLs are discarded", () => {
  assert.deepEqual(parseProduct({ ...base, images: ["javascript:alert(1)", "https://evil.test/a.png", "/images/../secret.png", second] }).images, [cover, second]);
});

test("changing the primary flower color retains both additional photos", () => {
  const product = prepareProductForSave({ ...base, kind: "flower", images: [cover, second, third], variants: [{ id: "pink", label: "Розовый", image: "/images/lily-pink.webp", price: 250 }] });
  assert.deepEqual(parseProduct(product).images, ["/images/lily-pink.webp", second, third]);
});

test("custom category IDs survive saving and malformed IDs are rejected", () => {
  assert.equal(parseProduct({ ...base, categoryId: "wedding-flowers" }).categoryId, "wedding-flowers");
  assert.equal(parseProduct({ ...base, categoryId: "../../admin" }).categoryId, undefined);
  assert.equal(productCategoryId({ ...base, categoryId: "wedding-flowers" }), "wedding-flowers");
});

test("a product left without a category does not fall back to the deleted category", () => {
  const product = parseProduct({ ...base, categoryId: "" });
  assert.equal(product.categoryId, "");
  assert.equal(productCategoryId({ ...product, id: base.id }), "");
  assert.equal(productCategoryId(base), "bouquet");
});

test("legacy bouquets, compositions, balloons and flowers keep their categories", () => {
  assert.equal(productCategoryId(base), "bouquet");
  assert.equal(productCategoryId({ ...base, name: "Цветочная композиция" }), "composition");
  assert.equal(productCategoryId({ ...base, name: "Набор воздушных шаров" }), "balloons");
  assert.equal(productCategoryId({ ...base, kind: "flower" }), "flowers");
  assert.equal(productCategoryId({ ...base, kind: "builder" }), "");
});

test("category names, photos, descriptions, display order and visibility are normalized", () => {
  const category = parseCategory({ name: "  Свадебные букеты  ", image: second, description: "  На свадьбу  ", target: "flowers", theme: "blush", visible: false, sortOrder: -10 });
  assert.deepEqual(category, { name: "Свадебные букеты", image: second, description: "На свадьбу", target: "flowers", theme: "blush", visible: false, sortOrder: 0 });
  assert.equal(parseCategory({ image: "https://evil.test/a.png" }).image, "");
});

test("category sorting preserves the existing storefront order", () => {
  assert.deepEqual(sortCategories([...defaultCategories].reverse()).map((c) => c.id), ["bouquet", "flowers", "delivery", "composition", "balloons"]);
});
