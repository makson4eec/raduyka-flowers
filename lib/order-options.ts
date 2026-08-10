import type {
  BouquetSize,
  BuilderSelection,
  ProductAddOn,
} from "./types";

export const bouquetSizeOptions: ReadonlyArray<{
  id: BouquetSize;
  label: string;
  productCode: "S" | "M" | "L";
}> = [
  { id: "small", label: "25–30 см", productCode: "S" },
  { id: "medium", label: "35–40 см", productCode: "M" },
  { id: "large", label: "45–50 см", productCode: "L" },
];

export const productAddOnOptions: ReadonlyArray<{
  id: ProductAddOn;
  label: string;
  price: number;
}> = [
  { id: "vase", label: "Ваза", price: 990 },
  { id: "sweet", label: "Сладкое", price: 590 },
];

export const cardFee = 190;
export const bouquetSizePriceStep = 800;
export const builderBudgets = [3500, 5000, 7000, 10000] as const;
export const builderMoods = [
  "Нежный",
  "Яркий",
  "Воздушный",
  "С характером",
] as const;
export const builderFlowers = [
  "Розы",
  "Пионы",
  "Тюльпаны",
  "Гортензия",
  "Сезонный микс",
  "Доверюсь флористу",
] as const;
export const builderWraps = [
  "Крафт",
  "Матовая упаковка",
  "Без упаковки",
] as const;

export function bouquetSizeFromProduct(size: string): BouquetSize {
  return bouquetSizeOptions.find((option) => option.productCode === size)?.id ?? "medium";
}

export function bouquetSizeLabel(size: BouquetSize | undefined): string {
  return bouquetSizeOptions.find((option) => option.id === size)?.label ?? bouquetSizeOptions[1].label;
}

export function bouquetSizePriceAdjustment(
  selectedSize: BouquetSize | undefined,
  productSize: string,
): number {
  const selectedIndex = bouquetSizeOptions.findIndex((option) => option.id === (selectedSize ?? "medium"));
  const productIndex = bouquetSizeOptions.findIndex((option) => option.productCode === productSize);
  const safeSelectedIndex = selectedIndex >= 0 ? selectedIndex : 1;
  const safeProductIndex = productIndex >= 0 ? productIndex : 1;
  return (safeSelectedIndex - safeProductIndex) * bouquetSizePriceStep;
}

export function normalizeBouquetSize(value: unknown): BouquetSize {
  return bouquetSizeOptions.some((option) => option.id === value)
    ? value as BouquetSize
    : "medium";
}

export function normalizeProductAddOns(value: unknown): ProductAddOn[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(productAddOnOptions.map((option) => option.id));
  return [...new Set(value.filter((item): item is ProductAddOn =>
    typeof item === "string" && allowed.has(item as ProductAddOn),
  ))];
}

export function productAddOnsPrice(addOns: readonly ProductAddOn[] | undefined): number {
  return (addOns ?? []).reduce(
    (sum, id) => sum + (productAddOnOptions.find((option) => option.id === id)?.price ?? 0),
    0,
  );
}

export function productAddOnsLabel(addOns: readonly ProductAddOn[] | undefined): string {
  return (addOns ?? [])
    .map((id) => productAddOnOptions.find((option) => option.id === id)?.label)
    .filter((label): label is string => Boolean(label))
    .join(", ");
}

export function normalizeBuilderSelection(value: unknown): BuilderSelection {
  const input = value && typeof value === "object"
    ? value as Partial<BuilderSelection>
    : {};
  const budgetValue = Number(input.budget);
  const budget = builderBudgets.includes(budgetValue as (typeof builderBudgets)[number])
    ? budgetValue
    : 5000;
  const mood = builderMoods.includes(input.mood as (typeof builderMoods)[number])
    ? String(input.mood)
    : builderMoods[0];
  const wrap = builderWraps.includes(input.wrap as (typeof builderWraps)[number])
    ? String(input.wrap)
    : builderWraps[0];
  const allowedFlowers = new Set<string>(builderFlowers);
  const flowers = Array.isArray(input.flowers)
    ? [...new Set(input.flowers.filter((flower): flower is string =>
      typeof flower === "string" && allowedFlowers.has(flower),
    ))]
    : [builderFlowers[4]];

  return {
    budget,
    mood,
    flowers: flowers.length ? flowers : [builderFlowers[5]],
    wrap,
  };
}
