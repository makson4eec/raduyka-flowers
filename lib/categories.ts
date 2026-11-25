import type { Product, ShopCategory } from "./types";

export const defaultCategories: ShopCategory[] = [
  { id: "bouquet", name: "Букеты", description: "", image: "/images/bouquet-3.webp", target: "catalog", theme: "cream", visible: true, sortOrder: 10 },
  { id: "flowers", name: "Цветы", description: "", image: "/images/bouquet-6.webp", target: "flowers", theme: "blush", visible: true, sortOrder: 20 },
  { id: "delivery", name: "Доставка\nпо городу", description: "", image: "/images/bouquet-4.webp", target: "delivery", theme: "cream", visible: true, sortOrder: 30 },
  { id: "composition", name: "Цветочные\nкомпозиции", description: "", image: "/images/composition-roses.webp", target: "catalog", theme: "blush", visible: true, sortOrder: 40 },
  { id: "balloons", name: "Воздушные\nшары", description: "", image: "/images/balloons.svg", target: "catalog", theme: "cream", visible: true, sortOrder: 50 },
];

export function productCategoryId(product: Product): string {
  if (product.categoryId !== undefined) return product.categoryId;
  if (product.kind === "flower") return "flowers";
  if (product.kind === "builder") return "";
  if (/(?:^|[^а-яё])шар(?:ы|ов|а|ами)?(?:$|[^а-яё])/iu.test(`${product.name} ${product.subtitle}`)) return "balloons";
  if (product.catalogCategory === "composition" || /композиц|корзин|ящик/iu.test(`${product.name} ${product.subtitle}`)) return "composition";
  return "bouquet";
}

export function sortCategories(categories: ShopCategory[]): ShopCategory[] {
  return [...categories].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}
