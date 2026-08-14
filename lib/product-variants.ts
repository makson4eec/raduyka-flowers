import type { Product, ProductInput, ProductVariant } from "./types";

export const MAX_PRODUCT_VARIANTS = 12;

export function getProductVariants(product: Pick<Product, "variants">): ProductVariant[] {
  return Array.isArray(product.variants) ? product.variants : [];
}

export function getPrimaryVariant(product: Pick<Product, "variants">): ProductVariant | undefined {
  return getProductVariants(product)[0];
}

export function getVariantPrice(
  product: Pick<Product, "price">,
  variant?: Pick<ProductVariant, "price">,
): number {
  return variant?.price ?? product.price;
}

export function getVariantOldPrice(
  product: Pick<Product, "oldPrice">,
  variant?: Pick<ProductVariant, "oldPrice">,
): number | undefined {
  return variant ? variant.oldPrice : product.oldPrice;
}

export function getVariantImage(
  product: Pick<Product, "image">,
  variant?: Pick<ProductVariant, "image">,
): string {
  return variant?.image || product.image;
}

export function findProductVariant(
  product: Pick<Product, "variants">,
  variantId?: string,
): ProductVariant | undefined {
  const variants = getProductVariants(product);
  return variants.find((variant) => variant.id === variantId) ?? variants[0];
}

export function flowerVariantValidationError(
  product: Pick<ProductInput, "kind" | "price" | "image" | "variants">,
): string | null {
  if (product.kind !== "flower") return null;

  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (variants.length > MAX_PRODUCT_VARIANTS) {
    return `Можно добавить не больше ${MAX_PRODUCT_VARIANTS} цветов в одну карточку.`;
  }

  const labels = new Set<string>();
  for (const variant of variants) {
    const label = variant.label.trim();
    if (!label) return "Укажите название каждого добавленного цвета.";

    const labelKey = label.toLocaleLowerCase("ru-RU");
    if (labels.has(labelKey)) return `Цвет «${label}» добавлен дважды.`;
    labels.add(labelKey);

    if (!(variant.image || product.image)) {
      return `Загрузите фотографию для цвета «${label}».`;
    }

    const price = variant.price ?? product.price;
    if (!Number.isFinite(price) || price <= 0) {
      return `Укажите корректную цену для цвета «${label}».`;
    }
  }

  return null;
}

export function prepareProductForSave(product: Product): Product {
  if (product.kind !== "flower") {
    return { ...product, variants: [] };
  }

  const variants = getProductVariants(product).map((variant) => ({
    ...variant,
    label: variant.label.trim(),
    image: variant.image || product.image,
    price: variant.price ?? product.price,
  }));

  const primary = variants[0];
  if (!primary) return { ...product, variants };

  return {
    ...product,
    image: primary.image || product.image,
    price: primary.price ?? product.price,
    oldPrice: primary.oldPrice,
    variants,
  };
}
