import type { InfoPage, SiteSettings } from "./site-content";

export const settingFields = [
  "address", "hoursWeekdays", "hoursWeekend", "phone", "email", "mapLink", "mapEmbedUrl",
  "legalStatus", "legalName", "inn", "ogrn", "registrationAuthority", "legalAddress",
  "postalAddress", "website", "personalDataAddress",
] as const;

export function parseSiteSettings(value: unknown): SiteSettings {
  if (!value || typeof value !== "object") throw new Error("Заполните настройки магазина.");
  const input = value as Record<string, unknown>;
  const result = {} as SiteSettings;
  for (const field of settingFields) {
    if (typeof input[field] !== "string" || input[field].length > 1000) throw new Error("Проверьте поля настроек: не более 1000 символов в каждом.");
    result[field] = input[field].trim();
  }
  if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw new Error("Укажите корректный e-mail магазина.");
  if (result.phone && !/^[+\d\s()\-]{5,40}$/.test(result.phone)) throw new Error("Укажите корректный телефон магазина.");
  for (const field of ["website", "mapLink", "mapEmbedUrl"] as const) {
    if (!result[field]) continue;
    let url: URL;
    try { url = new URL(result[field]); } catch { throw new Error("Проверьте ссылки в настройках."); }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Разрешены только ссылки http и https.");
    if (field === "mapEmbedUrl" && (url.origin !== "https://yandex.ru" || url.pathname !== "/map-widget/v1/")) throw new Error("Для встроенной карты используйте ссылку https://yandex.ru/map-widget/v1/.");
  }
  return result;
}

export function parseInfoPage(value: unknown): InfoPage {
  const input = value && typeof value === "object" ? value as Partial<InfoPage> : {};
  if (typeof input.title !== "string" || !input.title.trim() || input.title.length > 200) throw new Error("Укажите заголовок страницы: до 200 символов.");
  if (typeof input.body !== "string" || !input.body.trim() || input.body.length > 80000) throw new Error("Заполните текст страницы: до 80 000 символов.");
  return { title: input.title.trim(), body: input.body.trim() };
}
