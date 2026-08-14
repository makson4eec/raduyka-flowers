import type { ProductInput, ProductVariant } from "./types";

const MAX_PRODUCT_PRICE = 10_000_000;
const MAX_SORT_ORDER = 1_000_000;
const MAX_PRODUCT_VARIANTS = 12;
const STATIC_IMAGE_PATTERN = /^\/images\/[A-Za-z0-9][A-Za-z0-9._-]{0,160}\.(?:jpe?g|png|webp|svg)$/i;
const UPLOAD_IMAGE_PATTERN = /^\/uploads\/\d{10,16}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpe?g|png|webp)$/i;
const PRODUCT_IMAGES_PUBLIC_PATH = "/storage/v1/object/public/product-images/";

function isSupabaseProductImageUrl(value: string) {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!configuredUrl) return false;

  try {
    const supabaseUrl = new URL(configuredUrl);
    const imageUrl = new URL(value);

    return (
      imageUrl.origin === supabaseUrl.origin
      && imageUrl.pathname.startsWith(PRODUCT_IMAGES_PUBLIC_PATH)
      && imageUrl.pathname.length > PRODUCT_IMAGES_PUBLIC_PATH.length
      && !imageUrl.search
      && !imageUrl.hash
    );
  } catch {
    return false;
  }
}

function boundedInteger(value: unknown, minimum: number, maximum: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.round(number)));
}

function safeImagePath(value: unknown) {
  const image = typeof value === "string" ? value.trim() : "";
  return STATIC_IMAGE_PATTERN.test(image)
    || UPLOAD_IMAGE_PATTERN.test(image)
    || isSupabaseProductImageUrl(image)
    ? image
    : "";
}

function safeVariantId(value: unknown, fallback: string) {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  const slug = raw
    .replace(/\s+/g, "-")
    .replace(/[^a-zа-яё0-9_-]+/giu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return slug || fallback;
}

function parseVariants(value: unknown): ProductVariant[] {
  if (!Array.isArray(value)) return [];
  const usedIds = new Set<string>();
  const variants: ProductVariant[] = [];

  for (const [index, item] of value.entries()) {
    if (!item || typeof item !== "object") continue;
    const input = item as Partial<ProductVariant>;
    const label = String(input.label ?? "").trim().slice(0, 60);
    const image = safeImagePath(input.image);
    if (!label || !image) continue;

    let id = safeVariantId(input.id, `variant-${index + 1}`);
    while (usedIds.has(id)) id = `${id}-${usedIds.size + 1}`.slice(0, 40);
    usedIds.add(id);

    const price = Number(input.price);
    const oldPrice = Number(input.oldPrice);

    variants.push({
      id,
      label,
      image,
      ...(Number.isFinite(price) && price > 0
        ? { price: boundedInteger(price, 1, MAX_PRODUCT_PRICE) }
        : {}),
      ...(Number.isFinite(oldPrice) && oldPrice > 0
        ? { oldPrice: boundedInteger(oldPrice, 1, MAX_PRODUCT_PRICE) }
        : {}),
    });

    if (variants.length >= MAX_PRODUCT_VARIANTS) break;
  }

  return variants;
}

export function parseProduct(value: unknown): ProductInput {
  const input = value && typeof value === "object"
    ? value as Partial<ProductInput>
    : {};
  const price = boundedInteger(input.price, 0, MAX_PRODUCT_PRICE);
  const oldPriceValue = Number(input.oldPrice);
  const allowedStocks = ["today", "few", "soon"] as const;
  const allowedPalettes = ["pink", "white", "bright", "green"] as const;
  const kind = input.kind === "builder" ? "builder" : input.kind === "flower" ? "flower" : "catalog";
  const variants = parseVariants(input.variants);

  return {
    name: String(input.name ?? "").trim().slice(0, 120),
    subtitle: String(input.subtitle ?? "").trim().slice(0, 1000),
    care: String(input.care ?? "").trim().slice(0, 3000),
    price: Number.isFinite(price) ? price : 0,
    oldPrice:
      Number.isFinite(oldPriceValue) && oldPriceValue > 0
        ? boundedInteger(oldPriceValue, 1, MAX_PRODUCT_PRICE)
        : undefined,
    image: safeImagePath(input.image),
    tag: String(input.tag ?? "").trim().slice(0, 40) || undefined,
    stock: allowedStocks.includes(input.stock as (typeof allowedStocks)[number]) ? input.stock as ProductInput["stock"] : "today",
    size: ["S", "M", "L"].includes(String(input.size)) ? String(input.size) : "M",
    palette: allowedPalettes.includes(input.palette as (typeof allowedPalettes)[number]) ? input.palette as ProductInput["palette"] : "pink",
    kind,
    visible: input.visible !== false,
    featured: Boolean(input.featured),
    sortOrder: boundedInteger(input.sortOrder, 0, MAX_SORT_ORDER),
    variants: kind === "flower" ? variants : [],
  };
}
