import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseInfoPage, parseSiteSettings, settingFields } from "../lib/content-input.ts";
import { safeContentHref } from "../lib/info-links.ts";
import { getDocumentVersion } from "../lib/document-version.ts";
import { getInfoBlockValues, parseInfoBlockValues } from "../lib/info-blocks.ts";

const settings = Object.fromEntries(settingFields.map((key) => [key, ""]));

test("editing a delivery answer preserves the other delivery and pickup blocks", () => {
  const fields = parseInfoBlockValues("blocks-delivery", { faq1Answer: "  Новый ответ  ", faq2Question: "" });
  const delivery = getInfoBlockValues("blocks-delivery", fields);
  assert.equal(delivery.faq1Answer, "Новый ответ");
  assert.equal(delivery.faq2Question, "");
  assert.equal(delivery.studioTitle, "Наша студия");
  assert.equal(delivery.pickupTitle, "Самовывоз");
  assert.equal(getInfoBlockValues("blocks-about").teamNumber, "12");
  assert.throws(() => parseInfoBlockValues("blocks-delivery", { teamNumber: "5" }));
  assert.throws(() => parseInfoBlockValues("blocks-delivery", { faq1Answer: ["не строка"] }));
});

test("editing a document or interpolated seller information advances its accepted version", () => {
  const pages = { offer: { title: "Оферта", body: "Текст", version: "2026-11-25T10:00:00.000Z" } };
  assert.equal(getDocumentVersion({ pages }, "offer", "17.08.2026"), pages.offer.version);
  assert.equal(getDocumentVersion({ pages, settingsVersion: "2026-11-25T11:00:00.000Z" }, "offer", "17.08.2026"), "2026-11-25T11:00:00.000Z");
  assert.equal(getDocumentVersion({ pages: {} }, "offer", "17.08.2026"), "17.08.2026");
});

test("store contacts and hours are editable independently of checkout", () => {
  const saved = parseSiteSettings({ ...settings, address: " Новый адрес ", phone: "+7 (900) 123-45-67", email: "shop@example.com", hoursWeekdays: "Ежедневно: 10:00–22:00" });
  assert.equal(saved.address, "Новый адрес");
  assert.equal(saved.hoursWeekdays, "Ежедневно: 10:00–22:00");
  assert.equal(saved.email, "shop@example.com");
});

test("settings reject malformed contacts, unsafe links and third-party embedded frames", () => {
  assert.throws(() => parseSiteSettings({ ...settings, email: "bad" }));
  assert.throws(() => parseSiteSettings({ ...settings, phone: "<script>" }));
  assert.throws(() => parseSiteSettings({ ...settings, website: "javascript:alert(1)" }));
  assert.throws(() => parseSiteSettings({ ...settings, mapEmbedUrl: "https://evil.test/" }));
  assert.doesNotThrow(() => parseSiteSettings({ ...settings, mapEmbedUrl: "https://yandex.ru/map-widget/v1/?ll=60,56" }));
});

test("empty and excessively long information pages cannot replace published text", () => {
  assert.throws(() => parseInfoPage({ title: "", body: "text" }));
  assert.throws(() => parseInfoPage({ title: "title", body: "  " }));
  assert.throws(() => parseInfoPage({ title: "title", body: "я".repeat(80001) }));
  assert.deepEqual(parseInfoPage({ title: " Доставка ", body: " Текст страницы " }), { title: "Доставка", body: "Текст страницы" });
});

test("information links reject executable and protocol-relative URLs", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,<script>", "//evil.test/", "/\\evil.test/", "https://user:password@example.com/"]) assert.equal(safeContentHref(url), undefined);
  for (const url of ["/legal/offer", "https://example.com/delivery", "mailto:shop@example.com", "tel:+79001234567"]) assert.equal(safeContentHref(url), url);
});

test("all existing customer information pages are available in the editor", async () => {
  const pages = JSON.parse(await readFile(new URL("../lib/info-defaults.json", import.meta.url), "utf8"));
  assert.equal(pages.length, 11);
  assert.equal(new Set(pages.map((p) => p.id)).size, 11);
  for (const id of ["delivery", "about", "occasion", "payment-delivery", "bonus-program", "returns-claims", "seller", "offer", "privacy", "personal-data-consent", "cookies"]) {
    const page = pages.find((p) => p.id === id);
    assert.ok(page?.title && page.body);
  }
});
