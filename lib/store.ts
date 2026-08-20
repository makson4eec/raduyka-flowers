import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import { bonusEligibleAmount, maximumBonusSpend } from "./bonus-rules";
import {
  BonusServiceError,
  reserveOrderBonus,
  reverseOrderBonuses,
  syncOrderBonuses,
} from "./bonus-server";
import { getSupabaseServiceRoleClient } from "./firebase/supabase-admin";
import {
  cardFee,
  normalizeBouquetSize,
  normalizeBuilderSelection,
  normalizeProductAddOns,
  bouquetSizePriceAdjustment,
  productAddOnsPrice,
} from "./order-options";
import { LEGAL_DOCUMENT_VERSION } from "./legal";
import type {
  BouquetSize,
  BuilderSelection,
  CreateOrderInput,
  Order,
  OrderItem,
  OrderStatus,
  PaymentStatus,
  Product,
  ProductAddOn,
  ProductInput,
  ProductVariant,
} from "./types";

type StoredOrder = Order & {
  idempotencyKeyHash?: string;
  idempotencyFingerprintHash?: string;
  yookassaIdempotenceKey?: string | null;
  yookassaAttemptCreatedAt?: string | null;
};

type CreateOrderOptions = {
  customerUserId?: string | null;
  idempotencyKeyHash?: string | null;
  idempotencyFingerprintHash?: string | null;
};

type OrderUpdatePatch = {
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  deliveryFee: number | null;
  adminNote: string;
  expectedUpdatedAt?: string;
};

type ProductRow = {
  id: number;
  name: string;
  subtitle: string;
  care: string;
  species_info: string;
  manufacturer: string;
  manufacturer_address: string;
  manufacturing_place: string;
  importer_info: string;
  shelf_life: string;
  warranty_info: string;
  safe_use: string;
  conformity_info: string;
  conformity_url: string;
  price: number;
  old_price: number | null;
  image: string;
  tag: string | null;
  stock: Product["stock"];
  size: string;
  palette: Product["palette"];
  kind: Product["kind"];
  catalog_category: Product["catalogCategory"] | null;
  visible: boolean;
  featured: boolean;
  sort_order: number;
  variants: unknown;
};

type OrderRow = {
  id: string;
  order_number: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  yookassa_payment_id: string | null;
  yookassa_payment_url: string | null;
  yookassa_idempotence_key: string | null;
  yookassa_payment_amount: number | null;
  yookassa_attempt_created_at: string | null;
  delivery_method: "delivery" | "pickup";
  delivery_fee: number | null;
  card_added: boolean;
  card_fee: number;
  subtotal: number;
  discount: number;
  total: number;
  recipient_type: Order["recipientType"] | null;
  recipient_name: string;
  recipient_phone: string;
  customer_name: string;
  customer_phone: string;
  customer_user_id: string | null;
  bonus_spent: number;
  bonus_earned: number;
  address: string;
  delivery_date: string;
  delivery_time: string;
  card_text: string;
  admin_note: string;
  privacy_notice_version: string | null;
  offer_version: string | null;
  legal_accepted_at: string | null;
  items: OrderItem[];
  idempotency_key_hash: string | null;
  idempotency_fingerprint_hash: string | null;
  created_at: string;
  updated_at: string;
};

const MAX_ORDER_ELIGIBLE_AMOUNT = 100_000_000;

export class StoreValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreValidationError";
  }
}

export class StoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreConflictError";
  }
}

export class StoreNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreNotFoundError";
  }
}

function db() {
  const client = getSupabaseServiceRoleClient();
  if (!client) {
    throw new Error("Supabase service role is not configured.");
  }
  return client;
}

function normalizeVariants(value: unknown): ProductVariant[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is ProductVariant => Boolean(item) && typeof item === "object")
    .map((item) => ({
      id: String(item.id ?? "").trim(),
      label: String(item.label ?? "").trim(),
      image: String(item.image ?? "").trim(),
      ...(typeof item.price === "number" && Number.isFinite(item.price) && item.price > 0
        ? { price: Math.round(item.price) }
        : {}),
      ...(typeof item.oldPrice === "number" && Number.isFinite(item.oldPrice) && item.oldPrice > 0
        ? { oldPrice: Math.round(item.oldPrice) }
        : {}),
    }))
    .filter((item) => item.id && item.label && item.image);
}

function productFromRow(row: ProductRow): Product {
  return {
    id: Number(row.id),
    name: row.name,
    subtitle: row.subtitle,
    care: row.care ?? "",
    speciesInfo: row.species_info ?? "",
    manufacturer: row.manufacturer ?? "",
    manufacturerAddress: row.manufacturer_address ?? "",
    manufacturingPlace: row.manufacturing_place ?? "",
    importerInfo: row.importer_info ?? "",
    shelfLife: row.shelf_life ?? "",
    warrantyInfo: row.warranty_info ?? "",
    safeUse: row.safe_use ?? "",
    conformityInfo: row.conformity_info ?? "",
    conformityUrl: row.conformity_url ?? "",
    price: Number(row.price),
    ...(row.old_price === null ? {} : { oldPrice: Number(row.old_price) }),
    image: row.image,
    ...(row.tag === null ? {} : { tag: row.tag }),
    stock: row.stock,
    size: row.size,
    palette: row.palette,
    kind: row.kind,
    catalogCategory: row.catalog_category === "composition" ? "composition" : "bouquet",
    visible: row.visible,
    featured: row.featured,
    sortOrder: Number(row.sort_order),
    variants: normalizeVariants(row.variants),
  };
}

function productToRow(input: ProductInput) {
  return {
    name: input.name,
    subtitle: input.subtitle,
    care: input.care,
    species_info: input.speciesInfo ?? "",
    manufacturer: input.manufacturer ?? "",
    manufacturer_address: input.manufacturerAddress ?? "",
    manufacturing_place: input.manufacturingPlace ?? "",
    importer_info: input.importerInfo ?? "",
    shelf_life: input.shelfLife ?? "",
    warranty_info: input.warrantyInfo ?? "",
    safe_use: input.safeUse ?? "",
    conformity_info: input.conformityInfo ?? "",
    conformity_url: input.conformityUrl ?? "",
    price: input.price,
    old_price: input.oldPrice ?? null,
    image: input.image,
    tag: input.tag ?? null,
    stock: input.stock,
    size: input.size,
    palette: input.palette,
    kind: input.kind,
    catalog_category: input.catalogCategory === "composition" ? "composition" : "bouquet",
    visible: input.visible,
    featured: input.featured,
    sort_order: input.sortOrder,
    variants: input.variants,
    updated_at: new Date().toISOString(),
  };
}

function orderFromRow(row: OrderRow): StoredOrder {
  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    paymentStatus: row.payment_status,
    yookassaPaymentId: row.yookassa_payment_id ?? null,
    yookassaPaymentUrl: row.yookassa_payment_url ?? null,
    yookassaPaymentAmount:
      row.yookassa_payment_amount === null || row.yookassa_payment_amount === undefined
        ? null
        : Number(row.yookassa_payment_amount),
    deliveryMethod: row.delivery_method,
    deliveryFee: row.delivery_fee,
    cardAdded: row.card_added,
    cardFee: Number(row.card_fee),
    subtotal: Number(row.subtotal),
    discount: Number(row.discount),
    total: Number(row.total),
    ...(row.recipient_type ? { recipientType: row.recipient_type } : {}),
    recipientName: row.recipient_name,
    recipientPhone: row.recipient_phone,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerUserId: row.customer_user_id,
    bonusSpent: Number(row.bonus_spent),
    bonusEarned: Number(row.bonus_earned),
    address: row.address,
    deliveryDate: row.delivery_date,
    deliveryTime: row.delivery_time,
    cardText: row.card_text,
    adminNote: row.admin_note,
    privacyNoticeVersion: row.privacy_notice_version,
    offerVersion: row.offer_version,
    legalAcceptedAt: row.legal_accepted_at,
    items: Array.isArray(row.items) ? row.items : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.idempotency_key_hash
      ? { idempotencyKeyHash: row.idempotency_key_hash }
      : {}),
    ...(row.idempotency_fingerprint_hash
      ? { idempotencyFingerprintHash: row.idempotency_fingerprint_hash }
      : {}),
    ...(row.yookassa_idempotence_key
      ? { yookassaIdempotenceKey: row.yookassa_idempotence_key }
      : {}),
    ...(row.yookassa_attempt_created_at
      ? { yookassaAttemptCreatedAt: row.yookassa_attempt_created_at }
      : {}),
  };
}

function orderToRow(order: StoredOrder) {
  return {
    id: order.id,
    order_number: order.orderNumber,
    status: order.status,
    payment_status: order.paymentStatus,
    yookassa_payment_id: order.yookassaPaymentId ?? null,
    yookassa_payment_url: order.yookassaPaymentUrl ?? null,
    yookassa_idempotence_key: order.yookassaIdempotenceKey ?? null,
    yookassa_payment_amount: order.yookassaPaymentAmount ?? null,
    yookassa_attempt_created_at: order.yookassaAttemptCreatedAt ?? null,
    delivery_method: order.deliveryMethod,
    delivery_fee: order.deliveryFee,
    card_added: Boolean(order.cardAdded),
    card_fee: order.cardFee ?? 0,
    subtotal: order.subtotal,
    discount: order.discount,
    total: order.total,
    recipient_type: order.recipientType ?? null,
    recipient_name: order.recipientName,
    recipient_phone: order.recipientPhone,
    customer_name: order.customerName,
    customer_phone: order.customerPhone,
    customer_user_id: order.customerUserId ?? null,
    bonus_spent: order.bonusSpent ?? 0,
    bonus_earned: order.bonusEarned ?? 0,
    address: order.address,
    delivery_date: order.deliveryDate,
    delivery_time: order.deliveryTime,
    card_text: order.cardText,
    admin_note: order.adminNote,
    privacy_notice_version: order.privacyNoticeVersion ?? null,
    offer_version: order.offerVersion ?? null,
    legal_accepted_at: order.legalAcceptedAt ?? null,
    items: order.items,
    idempotency_key_hash: order.idempotencyKeyHash ?? null,
    idempotency_fingerprint_hash: order.idempotencyFingerprintHash ?? null,
    created_at: order.createdAt,
    updated_at: order.updatedAt,
  };
}

function cloneOrder(order: StoredOrder): Order {
  const {
    idempotencyKeyHash: _internalIdempotencyKey,
    idempotencyFingerprintHash: _internalIdempotencyFingerprint,
    yookassaIdempotenceKey: _internalYooKassaIdempotenceKey,
    yookassaAttemptCreatedAt: _internalYooKassaAttemptCreatedAt,
    ...safeOrder
  } = order;
  void _internalIdempotencyKey;
  void _internalIdempotencyFingerprint;
  void _internalYooKassaIdempotenceKey;
  void _internalYooKassaAttemptCreatedAt;
  return {
    ...safeOrder,
    items: order.items.map((item) => ({
      ...item,
      addOns: item.addOns ? [...item.addOns] : undefined,
      builder: item.builder
        ? { ...item.builder, flowers: [...item.builder.flowers] }
        : undefined,
    })),
  };
}

async function syncAndPersistOrderBonuses(
  client: ReturnType<typeof db>,
  initialOrder: StoredOrder,
  expectedPaymentId?: string,
): Promise<Order | null> {
  let current = initialOrder;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (
      expectedPaymentId !== undefined
      && current.yookassaPaymentId !== expectedPaymentId
    ) {
      return null;
    }

    const bonusResult = await syncOrderBonuses(current);
    if (!bonusResult) return cloneOrder(current);

    const bonusSpent = Math.max(0, Math.trunc(bonusResult.spent));
    const bonusEarned = Math.max(0, Math.trunc(bonusResult.earned));
    if (
      bonusSpent === (current.bonusSpent ?? 0)
      && bonusEarned === (current.bonusEarned ?? 0)
    ) {
      return cloneOrder(current);
    }

    let updateQuery = client
      .from("orders")
      .update({
        bonus_spent: bonusSpent,
        bonus_earned: bonusEarned,
        updated_at: new Date().toISOString(),
      })
      .eq("id", current.id)
      .eq("updated_at", current.updatedAt);
    if (expectedPaymentId !== undefined) {
      updateQuery = updateQuery.eq("yookassa_payment_id", expectedPaymentId);
    }

    const { data: savedRows, error: updateError } = await updateQuery
      .select("*")
      .limit(1);
    if (updateError) throw updateError;
    if (savedRows?.length) {
      return cloneOrder(orderFromRow(savedRows[0] as OrderRow));
    }

    const { data: latest, error: readError } = await client
      .from("orders")
      .select("*")
      .eq("id", current.id)
      .maybeSingle();
    if (readError) throw readError;
    if (!latest) return null;
    current = orderFromRow(latest as OrderRow);
  }

  throw new StoreConflictError(
    "Заказ изменился во время синхронизации бонусов. Повторите действие.",
  );
}

export async function listProducts(includeHidden = false): Promise<Product[]> {
  let query = db()
    .from("products")
    .select("id,name,subtitle,care,species_info,manufacturer,manufacturer_address,manufacturing_place,importer_info,shelf_life,warranty_info,safe_use,conformity_info,conformity_url,price,old_price,image,tag,stock,size,palette,kind,catalog_category,visible,featured,sort_order,variants")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (!includeHidden) query = query.eq("visible", true);

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as ProductRow[]).map(productFromRow);
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const client = db();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: lastRows, error: lastError } = await client
      .from("products")
      .select("id")
      .order("id", { ascending: false })
      .limit(1);
    if (lastError) throw lastError;

    const nextId = Number(lastRows?.[0]?.id ?? 0) + 1;
    const { data, error } = await client
      .from("products")
      .insert({ id: nextId, ...productToRow(input) })
      .select("id,name,subtitle,care,species_info,manufacturer,manufacturer_address,manufacturing_place,importer_info,shelf_life,warranty_info,safe_use,conformity_info,conformity_url,price,old_price,image,tag,stock,size,palette,kind,catalog_category,visible,featured,sort_order,variants")
      .single();

    if (!error && data) return productFromRow(data as ProductRow);
    if (error?.code !== "23505") throw error;
  }

  throw new StoreConflictError("Не удалось создать товар. Попробуйте ещё раз.");
}

export async function updateProduct(id: number, input: ProductInput): Promise<Product> {
  const { data, error } = await db()
    .from("products")
    .update(productToRow(input))
    .eq("id", id)
    .select("id,name,subtitle,care,species_info,manufacturer,manufacturer_address,manufacturing_place,importer_info,shelf_life,warranty_info,safe_use,conformity_info,conformity_url,price,old_price,image,tag,stock,size,palette,kind,catalog_category,visible,featured,sort_order,variants")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new StoreNotFoundError("Товар не найден.");
  return productFromRow(data as ProductRow);
}

export async function deleteProduct(id: number): Promise<void> {
  const client = db();
  const { data: existing, error: readError } = await client
    .from("products")
    .select("id,kind")
    .eq("id", id)
    .maybeSingle();
  if (readError) throw readError;
  if (!existing) throw new StoreNotFoundError("Товар не найден.");
  if (existing.kind === "builder") {
    throw new StoreValidationError(
      "Служебный товар конструктора можно скрыть, но нельзя удалить.",
    );
  }

  const { error } = await client.from("products").delete().eq("id", id);
  if (error) throw error;
}

export async function listOrders(): Promise<Order[]> {
  const { data, error } = await db()
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as OrderRow[]).map((row) => cloneOrder(orderFromRow(row)));
}

export async function getOrderById(id: string): Promise<Order | null> {
  const { data, error } = await db()
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? cloneOrder(orderFromRow(data as OrderRow)) : null;
}

export type YooKassaPaymentPreparation = {
  order: Order;
  idempotenceKey: string;
  amountRubles: number;
  existingPayment: boolean;
  reconcilePaymentId?: string;
};

export function calculateStoredOrderTotal(order: Order) {
  let itemsSubtotal = 0;
  for (const item of order.items) {
    if (
      !Number.isSafeInteger(item.price)
      || item.price < 0
      || !Number.isSafeInteger(item.quantity)
      || item.quantity <= 0
    ) {
      throw new StoreValidationError("В заказе сохранена некорректная позиция.");
    }
    const lineTotal = item.price * item.quantity;
    if (!Number.isSafeInteger(lineTotal)) {
      throw new StoreValidationError("Сумма позиции заказа слишком большая.");
    }
    itemsSubtotal += lineTotal;
    if (!Number.isSafeInteger(itemsSubtotal)) {
      throw new StoreValidationError("Сумма товаров заказа слишком большая.");
    }
  }

  const cardAmount = order.cardFee ?? 0;
  const deliveryAmount = order.deliveryMethod === "pickup" ? 0 : order.deliveryFee;
  if (
    !order.items.length
    || !Number.isSafeInteger(order.subtotal)
    || order.subtotal !== itemsSubtotal
    || !Number.isSafeInteger(order.discount)
    || order.discount < 0
    || !Number.isSafeInteger(cardAmount)
    || cardAmount < 0
    || deliveryAmount === null
    || !Number.isSafeInteger(deliveryAmount)
    || deliveryAmount < 0
  ) {
    throw new StoreValidationError("Сохранённая сумма заказа требует проверки.");
  }

  const total = itemsSubtotal - order.discount + cardAmount + deliveryAmount;
  if (!Number.isSafeInteger(total) || total <= 0 || total !== order.total) {
    throw new StoreValidationError("Итоговая сумма заказа требует проверки.");
  }
  return total;
}

function assertOrderCanCreateYooKassaPayment(order: StoredOrder) {
  if (order.status === "cancelled") {
    throw new StoreValidationError("Для отменённого заказа нельзя создать оплату.");
  }
  if (order.paymentStatus === "paid") {
    throw new StoreValidationError("Заказ уже оплачен.");
  }
  if (order.paymentStatus === "refunded") {
    throw new StoreValidationError("Для заказа с возвратом нельзя создать новую оплату.");
  }
  if (order.deliveryMethod === "delivery" && order.deliveryFee === null) {
    throw new StoreValidationError("Сначала укажите стоимость доставки и сохраните заказ.");
  }
  return calculateStoredOrderTotal(order);
}

export async function prepareYooKassaPayment(
  id: string,
): Promise<YooKassaPaymentPreparation> {
  const client = db();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await client
      .from("orders")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new StoreNotFoundError("Заказ не найден.");

    const current = orderFromRow(data as OrderRow);
    const calculatedAmount = assertOrderCanCreateYooKassaPayment(current);

    const hasPaymentId = Boolean(current.yookassaPaymentId);
    const hasPaymentUrl = Boolean(current.yookassaPaymentUrl);
    if (!hasPaymentId && hasPaymentUrl) {
      throw new StoreConflictError(
        "Данные оплаты заказа неполные. Проверьте заказ перед повторной оплатой.",
      );
    }
    if (hasPaymentId) {
      if (
        !current.yookassaIdempotenceKey
        || !current.yookassaAttemptCreatedAt
        || current.yookassaPaymentAmount !== calculatedAmount
      ) {
        throw new StoreConflictError(
          "Платёж заказа требует ручной проверки перед повторной оплатой.",
        );
      }
      if (hasPaymentUrl) {
        return {
          order: cloneOrder(current),
          idempotenceKey: current.yookassaIdempotenceKey,
          amountRubles: calculatedAmount,
          existingPayment: true,
          reconcilePaymentId: current.yookassaPaymentId as string,
        };
      }
      if (current.paymentStatus === "invoice_sent") {
        return {
          order: cloneOrder(current),
          idempotenceKey: current.yookassaIdempotenceKey,
          amountRubles: calculatedAmount,
          existingPayment: false,
          reconcilePaymentId: current.yookassaPaymentId as string,
        };
      }
      throw new StoreConflictError(
        "Платёж заказа требует ручной проверки перед повторной оплатой.",
      );
    }
    const hasAttemptKey = Boolean(current.yookassaIdempotenceKey);
    const hasAttemptAmount = current.yookassaPaymentAmount !== null
      && current.yookassaPaymentAmount !== undefined;
    const hasAttemptTimestamp = Boolean(current.yookassaAttemptCreatedAt);
    if (
      hasAttemptKey !== hasAttemptAmount
      || hasAttemptKey !== hasAttemptTimestamp
    ) {
      throw new StoreConflictError(
        "Данные попытки оплаты неполные. Обновите заказ и повторите действие.",
      );
    }
    if (hasAttemptKey && hasAttemptAmount) {
      const attemptCreatedAt = Date.parse(current.yookassaAttemptCreatedAt as string);
      const attemptAge = Date.now() - attemptCreatedAt;
      if (
        !Number.isFinite(attemptCreatedAt)
        || attemptAge < -5 * 60_000
        || attemptAge >= 23 * 60 * 60_000
      ) {
        throw new StoreConflictError(
          "Безопасный срок повтора оплаты истёк. Проверьте платёж в кабинете ЮKassa перед новой попыткой.",
        );
      }
      if (current.yookassaPaymentAmount !== calculatedAmount) {
        throw new StoreConflictError(
          "Сумма заказа изменилась после подготовки оплаты. Требуется ручная проверка.",
        );
      }
      return {
        order: cloneOrder(current),
        idempotenceKey: current.yookassaIdempotenceKey as string,
        amountRubles: calculatedAmount,
        existingPayment: false,
      };
    }

    const idempotenceKey = randomUUID();
    const updatedAt = new Date().toISOString();
    const { data: savedRows, error: updateError } = await client
      .from("orders")
      .update({
        payment_status: "pending",
        yookassa_idempotence_key: idempotenceKey,
        yookassa_payment_amount: calculatedAmount,
        yookassa_attempt_created_at: updatedAt,
        updated_at: updatedAt,
      })
      .eq("id", id)
      .eq("updated_at", current.updatedAt)
      .eq("total", calculatedAmount)
      .in("payment_status", ["pending", "invoice_sent"])
      .neq("status", "cancelled")
      .is("yookassa_payment_id", null)
      .is("yookassa_payment_url", null)
      .is("yookassa_idempotence_key", null)
      .select("*")
      .limit(1);
    if (updateError) throw updateError;
    if (!savedRows?.length) continue;

    const saved = orderFromRow(savedRows[0] as OrderRow);
    return {
      order: cloneOrder(saved),
      idempotenceKey,
      amountRubles: calculatedAmount,
      existingPayment: false,
    };
  }

  throw new StoreConflictError(
    "Заказ изменился во время создания оплаты. Обновите данные и повторите действие.",
  );
}

export async function saveYooKassaPayment(
  id: string,
  idempotenceKey: string,
  payment: { id: string; confirmationUrl?: string | null; amountRubles: number },
): Promise<Order> {
  if (
    !/^[0-9A-Za-z-]{10,128}$/.test(payment.id)
    || !Number.isSafeInteger(payment.amountRubles)
    || payment.amountRubles <= 0
  ) {
    throw new StoreValidationError("ЮKassa вернула некорректные данные платежа.");
  }

  let confirmationUrl: URL | null = null;
  if (payment.confirmationUrl) {
    try {
      confirmationUrl = new URL(payment.confirmationUrl);
    } catch {
      throw new StoreValidationError("ЮKassa вернула некорректную ссылку на оплату.");
    }
    if (
      confirmationUrl.protocol !== "https:"
      || confirmationUrl.username
      || confirmationUrl.password
      || confirmationUrl.toString().length > 2_048
    ) {
      throw new StoreValidationError("ЮKassa вернула некорректную ссылку на оплату.");
    }
  }

  const client = db();
  const updatedAt = new Date().toISOString();
  const { data: savedRows, error } = await client
    .from("orders")
    .update({
      payment_status: "invoice_sent",
      yookassa_payment_id: payment.id,
      yookassa_payment_url: confirmationUrl?.toString() ?? null,
      updated_at: updatedAt,
    })
    .eq("id", id)
    .eq("payment_status", "pending")
    .neq("status", "cancelled")
    .eq("total", payment.amountRubles)
    .eq("yookassa_payment_amount", payment.amountRubles)
    .eq("yookassa_idempotence_key", idempotenceKey)
    .is("yookassa_payment_id", null)
    .is("yookassa_payment_url", null)
    .select("*")
    .limit(1);
  if (error) throw error;
  if (savedRows?.length) {
    return cloneOrder(orderFromRow(savedRows[0] as OrderRow));
  }

  const { data: existing, error: readError } = await client
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (readError) throw readError;
  if (!existing) throw new StoreNotFoundError("Заказ не найден.");
  const current = orderFromRow(existing as OrderRow);
  if (
    current.yookassaPaymentId === payment.id
    && current.yookassaPaymentUrl === (confirmationUrl?.toString() ?? null)
  ) {
    return cloneOrder(current);
  }
  if (
    current.yookassaPaymentId === payment.id
    && current.yookassaPaymentUrl === null
    && confirmationUrl
  ) {
    const { data: restoredRows, error: restoreError } = await client
      .from("orders")
      .update({
        yookassa_payment_url: confirmationUrl.toString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("payment_status", "invoice_sent")
      .eq("yookassa_payment_id", payment.id)
      .eq("yookassa_idempotence_key", idempotenceKey)
      .eq("yookassa_payment_amount", payment.amountRubles)
      .is("yookassa_payment_url", null)
      .select("*")
      .limit(1);
    if (restoreError) throw restoreError;
    if (restoredRows?.length) {
      return cloneOrder(orderFromRow(restoredRows[0] as OrderRow));
    }
  }
  throw new StoreConflictError(
    "Заказ изменился во время создания оплаты. Платёж требует ручной проверки.",
  );
}

export async function releaseYooKassaPaymentPreparation(
  id: string,
  idempotenceKey: string,
) {
  const { error } = await db()
    .from("orders")
    .update({
      yookassa_idempotence_key: null,
      yookassa_payment_amount: null,
      yookassa_attempt_created_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("payment_status", "pending")
    .eq("yookassa_idempotence_key", idempotenceKey)
    .is("yookassa_payment_id", null)
    .is("yookassa_payment_url", null);
  if (error) throw error;
}

export async function getOrderByYooKassaPaymentId(
  paymentId: string,
): Promise<Order | null> {
  const { data, error } = await db()
    .from("orders")
    .select("*")
    .eq("yookassa_payment_id", paymentId)
    .maybeSingle();
  if (error) throw error;
  return data ? cloneOrder(orderFromRow(data as OrderRow)) : null;
}

export async function markYooKassaPaymentSucceeded(
  orderId: string,
  paymentId: string,
): Promise<Order | null> {
  const client = db();
  const { data, error } = await client
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .eq("yookassa_payment_id", paymentId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  let current = orderFromRow(data as OrderRow);
  if (current.paymentStatus === "refunded") return cloneOrder(current);

  if (current.paymentStatus !== "paid") {
    const { data: savedRows, error: updateError } = await client
      .from("orders")
      .update({
        payment_status: "paid",
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .eq("yookassa_payment_id", paymentId)
      .in("payment_status", ["pending", "invoice_sent"])
      .select("*")
      .limit(1);
    if (updateError) throw updateError;
    if (savedRows?.length) {
      current = orderFromRow(savedRows[0] as OrderRow);
    } else {
      const { data: latest, error: latestError } = await client
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .eq("yookassa_payment_id", paymentId)
        .maybeSingle();
      if (latestError) throw latestError;
      if (!latest) return null;
      current = orderFromRow(latest as OrderRow);
      if (current.paymentStatus === "refunded") return cloneOrder(current);
      if (current.paymentStatus !== "paid") return null;
    }
  }

  return syncAndPersistOrderBonuses(client, current, paymentId);
}

export async function markYooKassaPaymentCanceled(
  orderId: string,
  paymentId: string,
): Promise<Order | null> {
  const client = db();
  const { data: savedRows, error } = await client
    .from("orders")
    .update({
      payment_status: "pending",
      yookassa_payment_id: null,
      yookassa_payment_url: null,
      yookassa_idempotence_key: null,
      yookassa_payment_amount: null,
      yookassa_attempt_created_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("yookassa_payment_id", paymentId)
    .in("payment_status", ["pending", "invoice_sent"])
    .select("*")
    .limit(1);
  if (error) throw error;
  if (savedRows?.length) {
    return cloneOrder(orderFromRow(savedRows[0] as OrderRow));
  }

  const { data: current, error: readError } = await client
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .eq("yookassa_payment_id", paymentId)
    .maybeSingle();
  if (readError) throw readError;
  return current ? cloneOrder(orderFromRow(current as OrderRow)) : null;
}

export function publicOrderStatus(order: Order) {
  const paymentUrl =
    order.status !== "cancelled"
    && order.paymentStatus !== "paid"
    && order.paymentStatus !== "refunded"
    && typeof order.yookassaPaymentUrl === "string"
      ? order.yookassaPaymentUrl
      : null;

  return {
    orderNumber: order.orderNumber,
    total: order.total,
    status: order.status,
    paymentStatus:
      paymentUrl
        ? "invoice_sent" as const
        : order.paymentStatus === "invoice_sent"
          ? "pending" as const
          : order.paymentStatus,
    paymentUrl,
    updatedAt: order.updatedAt,
  };
}

export async function getOrderForCustomerStatus(
  orderNumber: string,
  customerPhone: string,
): Promise<Order | null> {
  const normalizedNumber = orderNumber.trim().toUpperCase();
  const normalizedPhone = customerPhone.replace(/\D/g, "");
  if (!normalizedNumber || normalizedPhone.length < 7) return null;

  const { data, error } = await db()
    .from("orders")
    .select("*")
    .eq("order_number", normalizedNumber)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const order = orderFromRow(data as OrderRow);
  if (order.customerPhone.replace(/\D/g, "") !== normalizedPhone) {
    return null;
  }

  return cloneOrder(order);
}

export async function getOrderStatus(orderNumber: string, customerPhone: string) {
  const order = await getOrderForCustomerStatus(orderNumber, customerPhone);
  return order ? publicOrderStatus(order) : null;
}

async function existingOrderByIdempotency(
  idempotencyKeyHash: string,
): Promise<StoredOrder | null> {
  const { data, error } = await db()
    .from("orders")
    .select("*")
    .eq("idempotency_key_hash", idempotencyKeyHash)
    .maybeSingle();
  if (error) throw error;
  return data ? orderFromRow(data as OrderRow) : null;
}

export async function createOrder(
  input: CreateOrderInput,
  options: CreateOrderOptions = {},
): Promise<Order> {
  const bonusReservation: {
    current: { orderId: string; userId: string } | null;
  } = { current: null };

  try {
    if (options.idempotencyKeyHash) {
      const existing = await existingOrderByIdempotency(options.idempotencyKeyHash);
      if (existing) {
        if (
          !options.idempotencyFingerprintHash
          || existing.idempotencyFingerprintHash !== options.idempotencyFingerprintHash
        ) {
          throw new StoreConflictError(
            "Данные заказа изменились. Повторите отправку.",
          );
        }
        return cloneOrder(existing);
      }
    }

    if (input.items.length > 50) {
      throw new StoreValidationError("В заказе слишком много позиций.");
    }

    const requestedIds = [...new Set(input.items.map((line) => Number(line.productId)))];
    if (requestedIds.some((id) => !Number.isInteger(id) || id <= 0)) {
      throw new StoreValidationError("Некорректная позиция в корзине.");
    }

    const { data: productRows, error: productError } = await db()
      .from("products")
      .select("id,name,subtitle,care,species_info,manufacturer,manufacturer_address,manufacturing_place,importer_info,shelf_life,warranty_info,safe_use,conformity_info,conformity_url,price,old_price,image,tag,stock,size,palette,kind,visible,featured,sort_order,variants")
      .in("id", requestedIds);
    if (productError) throw productError;

    const products = new Map(
      ((productRows ?? []) as ProductRow[]).map((row) => {
        const product = productFromRow(row);
        return [product.id, product] as const;
      }),
    );

    type NormalizedLine = {
      product: Product;
      quantity: number;
      size?: BouquetSize;
      addOns?: ProductAddOn[];
      builder?: BuilderSelection;
      variant?: ProductVariant;
    };

    const lines = new Map<string, NormalizedLine>();
    for (const line of input.items) {
      const productId = Number(line.productId);
      const quantity = Number(line.quantity);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
        throw new StoreValidationError("Некорректная позиция в корзине.");
      }

      const product = products.get(productId);
      if (!product || !product.visible || product.stock === "soon") {
        throw new StoreValidationError("Один из товаров больше недоступен.");
      }

      const size = product.kind === "catalog"
        ? normalizeBouquetSize(line.size)
        : undefined;
      const addOns = product.kind === "catalog"
        ? normalizeProductAddOns(line.addOns)
        : undefined;
      const builder = product.kind === "builder"
        ? normalizeBuilderSelection(line.builder)
        : undefined;
      let variant: ProductVariant | undefined;
      if (product.kind === "flower" && product.variants.length > 0) {
        if (line.variantId) {
          variant = product.variants.find((item) => item.id === String(line.variantId));
          if (!variant) {
            throw new StoreValidationError("Выбранный цвет больше недоступен. Обновите карточку товара и выберите цвет снова.");
          }
        } else if (product.variants.length === 1) {
          variant = product.variants[0];
        } else {
          throw new StoreValidationError("Выберите цвет для цветка.");
        }
      }
      const key = JSON.stringify({ productId, size, addOns, builder, variantId: variant?.id });
      const existing = lines.get(key);
      if (existing) {
        if (existing.quantity + quantity > 20) {
          throw new StoreValidationError(
            "Одной конфигурации товара можно заказать не больше 20 штук.",
          );
        }
        existing.quantity += quantity;
      } else {
        lines.set(key, { product, quantity, size, addOns, builder, variant });
      }
    }

    if (!lines.size) throw new StoreValidationError("Корзина пуста.");

    const items: OrderItem[] = [...lines.values()].map((line) => ({
      productId: line.product.id,
      name: line.variant ? `${line.product.name} · ${line.variant.label}` : line.product.name,
      image: line.variant?.image ?? line.product.image,
      price: line.builder?.budget
        ?? (line.product.kind === "catalog"
          ? Math.max(
            0,
            line.product.price
              + bouquetSizePriceAdjustment(line.size, line.product.size)
              + productAddOnsPrice(line.addOns),
          )
          : line.variant?.price ?? line.product.price),
      quantity: line.quantity,
      size: line.size,
      addOns: line.addOns,
      builder: line.builder,
      variantId: line.variant?.id,
      variantLabel: line.variant?.label,
    }));

    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const hasCard = Boolean(input.cardAdded);
    const orderCardFee = hasCard ? cardFee : 0;
    const eligibleAmount = bonusEligibleAmount(subtotal, orderCardFee);
    if (
      !Number.isSafeInteger(eligibleAmount)
      || eligibleAmount > MAX_ORDER_ELIGIBLE_AMOUNT
    ) {
      throw new StoreValidationError(
        "Сумма заказа слишком большая. Уменьшите количество товаров.",
      );
    }

    const deliveryFee = input.deliveryMethod === "pickup" ? 0 : null;
    const now = new Date().toISOString();
    const stamp = now.slice(2, 10).replaceAll("-", "");
    const orderId = randomUUID();
    const orderNumber = `RAD-${stamp}-${randomBytes(6).toString("hex").toUpperCase()}`;

    let bonusSpent = 0;
    if (input.useBonus) {
      if (!options.customerUserId) {
        throw new BonusServiceError(
          "Войдите в личный кабинет, чтобы списать бонусы.",
          401,
        );
      }

      bonusReservation.current = { orderId, userId: options.customerUserId };
      const reservation = await reserveOrderBonus(
        options.customerUserId,
        orderId,
        eligibleAmount,
      );
      if (reservation.spent > maximumBonusSpend(eligibleAmount)) {
        throw new BonusServiceError(
          "Бонусная система рассчитала недопустимую скидку. Заказ не сохранён.",
        );
      }
      bonusSpent = reservation.spent;
    }

    const order: StoredOrder = {
      id: orderId,
      orderNumber,
      status: "new",
      paymentStatus: "pending",
      deliveryMethod: input.deliveryMethod,
      deliveryFee,
      cardAdded: hasCard,
      cardFee: orderCardFee,
      subtotal,
      discount: bonusSpent,
      total: subtotal - bonusSpent + orderCardFee,
      recipientType: input.recipientType,
      recipientName: input.recipientName,
      recipientPhone: input.recipientPhone,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      customerUserId: options.customerUserId ?? null,
      bonusSpent,
      bonusEarned: 0,
      address: input.address,
      deliveryDate: input.deliveryDate,
      deliveryTime: input.deliveryTime,
      cardText: input.cardText,
      adminNote: "",
      privacyNoticeVersion: LEGAL_DOCUMENT_VERSION,
      offerVersion: input.offerVersion,
      legalAcceptedAt: now,
      items,
      createdAt: now,
      updatedAt: now,
      ...(options.idempotencyKeyHash
        ? { idempotencyKeyHash: options.idempotencyKeyHash }
        : {}),
      ...(options.idempotencyFingerprintHash
        ? { idempotencyFingerprintHash: options.idempotencyFingerprintHash }
        : {}),
    };

    const { data: inserted, error: insertError } = await db()
      .from("orders")
      .insert(orderToRow(order))
      .select("*")
      .single();

    if (insertError) {
      if (insertError.code === "23505" && options.idempotencyKeyHash) {
        const existing = await existingOrderByIdempotency(options.idempotencyKeyHash);
        if (
          existing
          && options.idempotencyFingerprintHash
          && existing.idempotencyFingerprintHash === options.idempotencyFingerprintHash
        ) {
          if (bonusReservation.current) {
            await reverseOrderBonuses(
              bonusReservation.current.userId,
              bonusReservation.current.orderId,
              false,
            );
            bonusReservation.current = null;
          }
          return cloneOrder(existing);
        }
        throw new StoreConflictError("Данные заказа изменились. Повторите отправку.");
      }
      throw insertError;
    }

    bonusReservation.current = null;
    return cloneOrder(orderFromRow(inserted as OrderRow));
  } catch (error) {
    if (bonusReservation.current) {
      try {
        await reverseOrderBonuses(
          bonusReservation.current.userId,
          bonusReservation.current.orderId,
          false,
        );
      } catch (compensationError) {
        console.error("Failed to compensate a bonus reservation", {
          orderId: bonusReservation.current.orderId,
          compensationError,
        });
      }
    }
    throw error;
  }
}

export async function updateOrderAndSyncBonuses(
  id: string,
  patch: OrderUpdatePatch,
): Promise<Order> {
  const client = db();
  const { data, error } = await client
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new StoreNotFoundError("Заказ не найден.");

  const current = orderFromRow(data as OrderRow);
  if (
    patch.expectedUpdatedAt !== undefined
    && current.updatedAt !== patch.expectedUpdatedAt
  ) {
    throw new StoreConflictError(
      "Заказ уже изменён в другой вкладке. Обновите данные и повторите действие.",
    );
  }

  const deliveryFee = current.deliveryMethod === "pickup" ? 0 : patch.deliveryFee;
  const hasYooKassaAttempt = Boolean(
    current.yookassaIdempotenceKey
    || current.yookassaPaymentId
    || current.yookassaPaymentUrl
    || (
      current.yookassaPaymentAmount !== null
      && current.yookassaPaymentAmount !== undefined
    ),
  );
  if (
    !hasYooKassaAttempt
    && current.paymentStatus !== "invoice_sent"
    && patch.paymentStatus === "invoice_sent"
  ) {
    throw new StoreValidationError(
      "Используйте кнопку «Выставить оплату СБП»: статус счёта установится после ответа ЮKassa.",
    );
  }
  if (hasYooKassaAttempt && deliveryFee !== current.deliveryFee) {
    throw new StoreConflictError(
      "Стоимость доставки зафиксирована для оплаты ЮKassa и не может быть изменена.",
    );
  }
  if (hasYooKassaAttempt && patch.paymentStatus !== current.paymentStatus) {
    throw new StoreConflictError(
      "Статус оплаты ЮKassa обновляется автоматически после проверки платежа.",
    );
  }
  if (
    hasYooKassaAttempt
    && current.status !== "cancelled"
    && patch.status === "cancelled"
  ) {
    throw new StoreConflictError(
      "Нельзя отменить заказ, пока платёж ЮKassa активен или проверяется.",
    );
  }

  const changed: StoredOrder = {
    ...current,
    status: patch.status,
    paymentStatus: patch.paymentStatus,
    deliveryFee,
    total: current.subtotal
      - current.discount
      + (deliveryFee ?? 0)
      + (current.cardFee ?? 0),
    adminNote: patch.adminNote,
    updatedAt: new Date().toISOString(),
  };

  // First win the optimistic order update. Bonus RPCs commit independently,
  // so running them before this CAS could mutate the ledger for a lost race.
  const updatePayload = orderToRow(changed);
  delete (updatePayload as Partial<OrderRow>).id;
  delete (updatePayload as Partial<OrderRow>).created_at;

  let updateQuery = client
    .from("orders")
    .update(updatePayload)
    .eq("id", id);
  if (patch.expectedUpdatedAt !== undefined) {
    updateQuery = updateQuery.eq("updated_at", patch.expectedUpdatedAt);
  }

  const { data: savedRows, error: updateError } = await updateQuery
    .select("*")
    .limit(1);
  if (updateError) throw updateError;
  if (!savedRows?.length) {
    throw new StoreConflictError(
      "Заказ уже изменён в другой вкладке. Обновите данные и повторите действие.",
    );
  }

  const saved = orderFromRow(savedRows[0] as OrderRow);
  return (await syncAndPersistOrderBonuses(client, saved)) ?? cloneOrder(saved);
}
