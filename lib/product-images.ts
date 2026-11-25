import type { Product } from "./types";

export const MAX_PRODUCT_IMAGES = 3;

export function getProductImages(product: Pick<Product, "image" | "images">): string[] {
  return [...new Set([product.image, ...(Array.isArray(product.images) ? product.images : [])])]
    .filter((image): image is string => typeof image === "string" && Boolean(image.trim()))
    .slice(0, MAX_PRODUCT_IMAGES);
}
