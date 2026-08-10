import { randomBytes, randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { bonusEligibleAmount, maximumBonusSpend } from "./bonus-rules";
import {
  BonusServiceError,
  reserveOrderBonus,
  reverseOrderBonuses,
  syncOrderBonuses,
} from "./bonus-server";
import { defaultProducts } from "./catalog";
import {
  cardFee,
  normalizeBouquetSize,
  normalizeBuilderSelection,
  normalizeProductAddOns,
  bouquetSizePriceAdjustment,
  productAddOnsPrice,
} from "./order-options";
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
} from "./types";

type StoredOrder = Order & {
  idempotencyKeyHash?: string;
  idempotencyFingerprintHash?: string;
};

type StoreData = {
  products: Product[];
  orders: StoredOrder[];
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

const MAX_ORDER_ELIGIBLE_AMOUNT = 100_000_000;

const dataDirectory = path.join(process.cwd(), "data");
const dataFile = path.join(dataDirectory, "store.json");

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

function initialData(): StoreData {
  return {
    products: defaultProducts.map((product) => ({ ...product })),
    orders: [],
  };
}

async function writeData(data: StoreData) {
  await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  await chmod(dataDirectory, 0o700).catch(() => undefined);
  const temporary = path.join(
    dataDirectory,
    `.store-${process.pid}-${randomUUID()}.tmp`,
  );

  try {
    await writeFile(temporary, JSON.stringify(data, null, 2), {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporary, dataFile);
    await chmod(dataFile, 0o600).catch(() => undefined);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

async function readData(): Promise<StoreData> {
  try {
    const parsed = JSON.parse(await readFile(dataFile, "utf8")) as Partial<StoreData>;
    return {
      products: Array.isArray(parsed.products) ? parsed.products : initialData().products,
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
    const data = initialData();
    await writeData(data);
    return data;
  }
}

let writeQueue: Promise<unknown> = Promise.resolve();

function updateData<T>(change: (data: StoreData) => T | Promise<T>): Promise<T> {
  const operation = writeQueue.then(async () => {
    const data = await readData();
    const result = await change(data);
    await writeData(data);
    return result;
  });
  writeQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

function cloneOrder(order: StoredOrder): Order {
  const {
    idempotencyKeyHash: _internalIdempotencyKey,
    idempotencyFingerprintHash: _internalIdempotencyFingerprint,
    ...safeOrder
  } = order;
  void _internalIdempotencyKey;
  void _internalIdempotencyFingerprint;
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

export async function listProducts(includeHidden = false): Promise<Product[]> {
  const data = await readData();
  return data.products
    .filter((product) => includeHidden || product.visible)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    .map((product) => ({ ...product }));
}

export function createProduct(input: ProductInput): Promise<Product> {
  return updateData((data) => {
    const id = data.products.reduce((max, product) => Math.max(max, product.id), 0) + 1;
    const product: Product = { id, ...input };
    data.products.push(product);
    return { ...product };
  });
}

export function updateProduct(id: number, input: ProductInput): Promise<Product> {
  return updateData((data) => {
    const index = data.products.findIndex((product) => product.id === id);
    if (index < 0) throw new Error("Товар не найден.");
    const product: Product = { id, ...input };
    data.products[index] = product;
    return { ...product };
  });
}

export function deleteProduct(id: number): Promise<void> {
  return updateData((data) => {
    const product = data.products.find((item) => item.id === id);
    if (!product) throw new Error("Товар не найден.");
    if (product.kind === "builder") {
      throw new Error("Служебный товар конструктора можно скрыть, но нельзя удалить.");
    }
    data.products = data.products.filter((item) => item.id !== id);
  });
}

export async function listOrders(): Promise<Order[]> {
  const data = await readData();
  return [...data.orders]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(cloneOrder);
}

export async function getOrderById(id: string): Promise<Order | null> {
  const data = await readData();
  const order = data.orders.find((item) => item.id === id);
  return order ? cloneOrder(order) : null;
}

export async function getOrderStatus(orderNumber: string, customerPhone: string) {
  const normalizedNumber = orderNumber.trim().toUpperCase();
  const normalizedPhone = customerPhone.replace(/\D/g, "");
  if (!normalizedNumber || normalizedPhone.length < 7) return null;

  const data = await readData();
  const order = data.orders.find((item) =>
    item.orderNumber.toUpperCase() === normalizedNumber
    && item.customerPhone.replace(/\D/g, "") === normalizedPhone,
  );
  if (!order) return null;

  return {
    orderNumber: order.orderNumber,
    total: order.total,
    status: order.status,
    paymentStatus: order.paymentStatus,
    updatedAt: order.updatedAt,
  };
}

export async function createOrder(
  input: CreateOrderInput,
  options: CreateOrderOptions = {},
): Promise<Order> {
  const bonusReservation: {
    current: { orderId: string; userId: string } | null;
  } = { current: null };

  try {
    return await updateData(async (data) => {
      type NormalizedLine = {
        product: Product;
        quantity: number;
        size?: BouquetSize;
        addOns?: ProductAddOn[];
        builder?: BuilderSelection;
      };

      if (options.idempotencyKeyHash) {
        const existingOrder = data.orders.find(
          (order) => order.idempotencyKeyHash === options.idempotencyKeyHash,
        );
        if (existingOrder) {
          if (
            !options.idempotencyFingerprintHash
            || existingOrder.idempotencyFingerprintHash
              !== options.idempotencyFingerprintHash
          ) {
            throw new StoreConflictError(
              "Данные заказа изменились. Повторите отправку.",
            );
          }
          return cloneOrder(existingOrder);
        }
      }

      if (input.items.length > 50) {
        throw new StoreValidationError("В заказе слишком много позиций.");
      }

      const lines = new Map<string, NormalizedLine>();
      for (const line of input.items) {
        const productId = Number(line.productId);
        const quantity = Number(line.quantity);
        if (!Number.isInteger(productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
          throw new StoreValidationError("Некорректная позиция в корзине.");
        }

        const product = data.products.find(
          (item) => item.id === productId && item.visible && item.stock !== "soon",
        );
        if (!product) {
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
        const key = JSON.stringify({
          productId,
          size,
          addOns,
          builder,
        });
        const existing = lines.get(key);
        if (existing) {
          if (existing.quantity + quantity > 20) {
            throw new StoreValidationError("Одного варианта букета можно заказать не больше 20 штук.");
          }
          existing.quantity += quantity;
        } else {
          lines.set(key, {
            product,
            quantity,
            size,
            addOns,
            builder,
          });
        }
      }

      if (!lines.size) throw new StoreValidationError("Корзина пуста.");

      const items: OrderItem[] = [...lines.values()].map((line) => ({
        productId: line.product.id,
        name: line.product.name,
        image: line.product.image,
        price: line.builder?.budget
          ?? Math.max(
            0,
            line.product.price
              + bouquetSizePriceAdjustment(line.size, line.product.size)
              + productAddOnsPrice(line.addOns),
          ),
        quantity: line.quantity,
        size: line.size,
        addOns: line.addOns,
        builder: line.builder,
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
      let orderNumber = "";
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const candidate = `RAD-${stamp}-${randomBytes(6).toString("hex").toUpperCase()}`;
        if (!data.orders.some((order) => order.orderNumber === candidate)) {
          orderNumber = candidate;
          break;
        }
      }
      if (!orderNumber) {
        throw new Error("Не удалось создать безопасный номер заказа.");
      }

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
      data.orders.push(order);
      return cloneOrder(order);
    });
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

/**
 * Keeps the file-store mutation and its bonus decision inside one local write
 * queue operation. The bonus RPC is idempotent, so a failed disk write can be
 * safely retried without crediting or reversing twice.
 */
export function updateOrderAndSyncBonuses(
  id: string,
  patch: OrderUpdatePatch,
): Promise<Order> {
  return updateData(async (data) => {
    const index = data.orders.findIndex((order) => order.id === id);
    if (index < 0) throw new StoreNotFoundError("Заказ не найден.");
    const current = data.orders[index];
    if (
      patch.expectedUpdatedAt !== undefined
      && current.updatedAt !== patch.expectedUpdatedAt
    ) {
      throw new StoreConflictError(
        "Заказ уже изменён в другой вкладке. Обновите данные и повторите действие.",
      );
    }

    const deliveryFee = current.deliveryMethod === "pickup" ? 0 : patch.deliveryFee;
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

    const bonusResult = await syncOrderBonuses(changed);
    const updated: StoredOrder = bonusResult
      ? {
        ...changed,
        bonusSpent: Math.max(0, Math.trunc(bonusResult.spent)),
        bonusEarned: Math.max(0, Math.trunc(bonusResult.earned)),
      }
      : changed;
    data.orders[index] = updated;
    return cloneOrder(updated);
  });
}
