export function safeContentHref(value: string): string | undefined {
  const href = value.trim();
  if (/^\/(?!\/)[^\\\s]*$/.test(href)) return href;
  try {
    const url = new URL(href);
    if (["https:", "http:", "mailto:", "tel:"].includes(url.protocol) && !url.username && !url.password) return href;
  } catch { /* Invalid links are shown as text. */ }
  return undefined;
}
