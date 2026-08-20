"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { optimizedImageSource } from "../../lib/image-assets";
import {
  bouquetSizeLabel,
  cardFee as defaultCardFee,
  productAddOnsLabel,
} from "../../lib/order-options";
import {
  flowerVariantValidationError,
  getPrimaryVariant,
  getVariantImage,
  getVariantPrice,
  MAX_PRODUCT_VARIANTS,
  prepareProductForSave,
} from "../../lib/product-variants";
import type {
  Order,
  OrderStatus,
  PaymentStatus,
  Product,
  ProductVariant,
} from "../../lib/types";

type Tab = "products" | "orders";
type OrderView = "active" | "archive";
type OrderLiveStatus = "connecting" | "live" | "error";
type NewOrderNotice = { count: number; orderNumber: string };

const ORDER_REFRESH_INTERVAL_MS = 3000;

const isArchivedOrder = (order: Order) =>
  order.status === "completed" || order.status === "cancelled";

const mergeOrderSnapshots = (current: Order[], incoming: Order[]) => {
  const currentById = new Map(current.map((order) => [order.id, order]));
  const incomingIds = new Set(incoming.map((order) => order.id));
  const merged = incoming.map((order) => {
    const local = currentById.get(order.id);
    return local && local.updatedAt.localeCompare(order.updatedAt) > 0
      ? local
      : order;
  });

  for (const order of current) {
    if (!incomingIds.has(order.id)) merged.push(order);
  }

  return merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

const statusLabels: Record<OrderStatus, string> = {
  new: "Новый",
  confirmed: "Подтверждён",
  assembling: "Собирается",
  ready: "Готов",
  delivery: "У курьера",
  completed: "Завершён",
  cancelled: "Отменён",
};

const paymentLabels: Record<PaymentStatus, string> = {
  pending: "Ожидает счёта",
  invoice_sent: "Счёт отправлен",
  paid: "Оплачен",
  refunded: "Возврат",
};

const money = (value: number) =>
  new Intl.NumberFormat("ru-RU").format(value) + " ₽";

const formatOrderDate = (value: string) => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Дата заказа не указана";
  return new Date(timestamp).toLocaleString("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const orderItemKey = (item: Order["items"][number], index: number) =>
  JSON.stringify([
    item.productId,
    item.size ?? null,
    item.addOns ?? [],
    item.builder ?? null,
    index,
  ]);

const blankProduct = (): Product => ({
  id: 0,
  name: "",
  subtitle: "",
  care: "",
  speciesInfo: "",
  manufacturer: "",
  manufacturerAddress: "",
  manufacturingPlace: "",
  importerInfo: "",
  shelfLife: "",
  warrantyInfo: "",
  safeUse: "",
  conformityInfo: "",
  conformityUrl: "",
  price: 0,
  image: "/images/bouquet-1.webp",
  stock: "today",
  size: "M",
  palette: "pink",
  kind: "catalog",
  catalogCategory: "bouquet",
  visible: true,
  featured: false,
  sortOrder: 100,
  variants: [],
});

const blankVariant = (
  fallbackImage = "",
  fallbackPrice?: number,
  fallbackOldPrice?: number,
): ProductVariant => ({
  id: `variant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  label: "",
  image: fallbackImage,
  ...(fallbackPrice && fallbackPrice > 0 ? { price: fallbackPrice } : {}),
  ...(fallbackOldPrice && fallbackOldPrice > 0 ? { oldPrice: fallbackOldPrice } : {}),
});

async function readJson<T>(response: Response): Promise<T> {
  if (response.status === 401) {
    window.location.replace("/admin/login");
    throw new Error("Сессия завершилась. Перенаправляем на страницу входа.");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(
      response.ok
        ? "Сервер вернул некорректный ответ."
        : "Не удалось выполнить действие. Ошибка сервера: " + response.status + ".",
    );
  }

  if (!response.ok) {
    const message = (
      payload !== null
      && typeof payload === "object"
      && "error" in payload
      && typeof payload.error === "string"
    )
      ? payload.error
      : "Не удалось выполнить действие.";
    throw new Error(message);
  }
  return payload as T;
}

function OrderEditor({
  order,
  onSaved,
  archived = false,
}: {
  order: Order;
  onSaved: (order: Order) => void;
  archived?: boolean;
}) {
  const [status, setStatus] = useState(order.status);
  const [paymentStatus, setPaymentStatus] = useState(order.paymentStatus);
  const [deliveryFee, setDeliveryFee] = useState(
    order.deliveryFee === null ? "" : String(order.deliveryFee),
  );
  const [adminNote, setAdminNote] = useState(order.adminNote);
  const [saving, setSaving] = useState(false);
  const [creatingPayment, setCreatingPayment] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const paymentUrl = order.yookassaPaymentUrl?.trim() ?? "";
  const paymentAttemptExists = Boolean(
    order.yookassaPaymentId
    || paymentUrl
    || typeof order.yookassaPaymentAmount === "number",
  );
  const hasSavedDelivery = order.deliveryMethod === "pickup" || order.deliveryFee !== null;
  const deliveryValue = deliveryFee === "" ? null : Number(deliveryFee);
  const paymentFieldsAreSaved = status === order.status
    && paymentStatus === order.paymentStatus
    && (order.deliveryMethod === "pickup" || deliveryValue === order.deliveryFee)
    && adminNote === order.adminNote;
  const paymentCanBeCreated = !archived
    && order.status !== "cancelled"
    && order.paymentStatus !== "paid"
    && order.paymentStatus !== "refunded"
    && (
      order.paymentStatus === "pending"
      || order.paymentStatus === "invoice_sent"
      || paymentAttemptExists
    );
  const storedPaymentLinkExists = Boolean(paymentUrl && order.status !== "cancelled");
  const manualPaymentOptions = Object.entries(paymentLabels).filter(
    ([value]) => value !== "invoice_sent" || order.paymentStatus === "invoice_sent",
  );

  const save = async (nextStatus: OrderStatus = status) => {
    setSaving(true);
    setError("");
    setWarning("");
    try {
      const response = await fetch("/api/admin/orders/" + order.id, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          paymentStatus,
          deliveryFee: deliveryFee === "" ? null : Number(deliveryFee),
          adminNote,
          expectedUpdatedAt: order.updatedAt,
        }),
      });
      const payload = await readJson<{ order: Order; bonusWarning?: string }>(response);
      onSaved(payload.order);
      setWarning(payload.bonusWarning ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить заказ.");
    } finally {
      setSaving(false);
    }
  };

  const createPayment = async () => {
    setCreatingPayment(true);
    setError("");
    setWarning("");
    try {
      const response = await fetch(`/api/admin/orders/${order.id}/payment`, {
        method: "POST",
      });
      const payload = await readJson<{ order: Order }>(response);
      setStatus(payload.order.status);
      setPaymentStatus(payload.order.paymentStatus);
      setDeliveryFee(
        payload.order.deliveryFee === null ? "" : String(payload.order.deliveryFee),
      );
      onSaved(payload.order);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось создать оплату.");
    } finally {
      setCreatingPayment(false);
    }
  };

  const copyPaymentLink = async () => {
    if (!paymentUrl) return;
    setError("");
    setWarning("");

    try {
      let copied = false;
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(paymentUrl);
          copied = true;
        } catch {
          copied = false;
        }
      }

      if (!copied) {
        const textarea = document.createElement("textarea");
        textarea.value = paymentUrl;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.append(textarea);
        textarea.select();
        copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("Копирование недоступно в этом браузере.");
      }
      setWarning("Ссылка на оплату скопирована.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось скопировать ссылку на оплату.",
      );
    }
  };

  return (
    <article className={"admin-order" + (archived ? " is-archived" : "")}>
      <header className="admin-order__head">
        <div>
          <span className={"order-state order-state--" + order.status}>
            {statusLabels[order.status]}
          </span>
          <h3>{order.orderNumber}</h3>
          <p>{formatOrderDate(order.createdAt)}</p>
        </div>
        <strong>{money(order.total)}</strong>
      </header>

      <div className="admin-order__grid">
        <section>
          <h4>Состав</h4>
          <div className="admin-order__items">
            {order.items.map((item, index) => {
              const addOnsLabel = productAddOnsLabel(item.addOns);
              return (
                <div key={orderItemKey(item, index)}>
                  <img src={optimizedImageSource(item.image)} alt="" />
                  <span>
                    <b>{item.name}</b>
                    <small>{item.quantity} × {money(item.price)}</small>
                    {item.size && <small>Размер: {bouquetSizeLabel(item.size)}</small>}
                    {addOnsLabel && <small>Дополнения: {addOnsLabel}</small>}
                    {item.builder && (
                      <>
                        <small>Бюджет: {money(item.builder.budget)}</small>
                        <small>Настроение: {item.builder.mood}</small>
                        <small>Цветы: {item.builder.flowers.join(", ")}</small>
                        <small>Упаковка: {item.builder.wrap}</small>
                      </>
                    )}
                  </span>
                </div>
              );
            })}
            {(order.cardAdded || (order.cardFee ?? 0) > 0) && (
              <div key="order-card">
                <div aria-hidden="true">💌</div>
                <span>
                  <b>Открытка к заказу</b>
                  <small>1 × {money(order.cardFee ?? defaultCardFee)}</small>
                </span>
              </div>
            )}
          </div>
        </section>
        <section>
          <h4>Получатель</h4>
          <p><b>{order.recipientName}</b><br /><a href={"tel:" + order.recipientPhone}>{order.recipientPhone}</a></p>
          <p>{order.deliveryMethod === "pickup" ? "Самовывоз" : order.address}</p>
          {order.deliveryDate && <p>{order.deliveryDate} · {order.deliveryTime}</p>}
        </section>
        <section>
          <h4>Заказчик</h4>
          <p><b>{order.customerName}</b><br /><a href={"tel:" + order.customerPhone}>{order.customerPhone}</a></p>
          {order.cardText && <p className="card-message">Открытка: «{order.cardText}»</p>}
        </section>
      </div>

      <div className="admin-order__controls">
        <label>
          Этап заказа
          <select
            value={status}
            disabled={archived || saving || creatingPayment}
            onChange={(event) => setStatus(event.target.value as OrderStatus)}
          >
            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          Оплата
          <select
            value={paymentStatus}
            disabled={archived || saving || creatingPayment || paymentAttemptExists}
            onChange={(event) => setPaymentStatus(event.target.value as PaymentStatus)}
          >
            {manualPaymentOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          Доставка, ₽
          <input
            type="number"
            min="0"
            value={deliveryFee}
            disabled={
              archived
              || saving
              || creatingPayment
              || paymentAttemptExists
              || order.deliveryMethod === "pickup"
            }
            placeholder="Указать вручную"
            onChange={(event) => setDeliveryFee(event.target.value)}
          />
        </label>
        <label className="admin-order__note">
          Заметка сотрудника
          <input
            value={adminNote}
            readOnly={archived}
            placeholder="Например, позвонить перед доставкой"
            onChange={(event) => setAdminNote(event.target.value)}
          />
        </label>
        {archived && order.status === "completed" ? (
          <button
            className="admin-restore"
            type="button"
            onClick={() => void save("confirmed")}
            disabled={saving || creatingPayment}
          >
            {saving ? "Возвращаем…" : "Вернуть в работу"}
          </button>
        ) : archived ? (
          <p className="admin-archive-note">Отменённый заказ хранится в архиве без повторного открытия.</p>
        ) : (
          <button
            className="admin-primary"
            type="button"
            onClick={() => void save()}
            disabled={saving || creatingPayment}
          >
            {saving ? "Сохраняем…" : "Сохранить заказ"}
          </button>
        )}
      </div>
      {storedPaymentLinkExists ? (
        <div className="admin-order__payment-actions">
          <b>
            {order.paymentStatus === "paid"
              ? "Оплата через СБП подтверждена."
              : "Ссылка на оплату через СБП создана."}
          </b>
          <button
            className="admin-secondary"
            type="button"
            onClick={() => void copyPaymentLink()}
          >
            Скопировать ссылку на оплату
          </button>
          <a
            className="admin-secondary"
            href={paymentUrl}
            target="_blank"
            rel="noreferrer"
          >
            Открыть QR ЮKassa
          </a>
        </div>
      ) : paymentCanBeCreated ? (
        <div className="admin-order__payment-actions">
          <span>
            {!hasSavedDelivery
              ? "Сначала укажите стоимость доставки и сохраните заказ."
              : !paymentFieldsAreSaved && !paymentAttemptExists
                ? "Сначала сохраните изменения заказа."
                : "Сумма будет рассчитана сервером. Покупатель увидит переход к официальному QR ЮKassa."}
          </span>
          <button
            className="admin-primary"
            type="button"
            onClick={() => void createPayment()}
            disabled={
              saving
              || creatingPayment
              || !hasSavedDelivery
              || !paymentFieldsAreSaved
            }
          >
            {creatingPayment
              ? "Создаём оплату…"
              : paymentAttemptExists
                ? "Проверить или повторить оплату"
                : "Выставить оплату СБП"}
          </button>
        </div>
      ) : null}
      {warning && <p className="admin-warning" role="status">{warning}</p>}
      {error && <p className="admin-error" role="alert">{error}</p>}
    </article>
  );
}

export default function AdminDashboard({
  userName,
  signOutHref,
}: {
  userName: string;
  signOutHref: string;
}) {
  const [tab, setTab] = useState<Tab>("products");
  const [orderView, setOrderView] = useState<OrderView>("active");
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState<Product | null>(null);
  const [newProductPickerOpen, setNewProductPickerOpen] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState("");
  const [pendingProductActions, setPendingProductActions] = useState<
    Record<number, "visibility" | "delete">
  >({});
  const [orderLiveStatus, setOrderLiveStatus] = useState<OrderLiveStatus>("connecting");
  const [newOrderNotice, setNewOrderNotice] = useState<NewOrderNotice | null>(null);
  const ordersRef = useRef<Order[]>([]);
  const ordersInitializedRef = useRef(false);
  const ordersRefreshInFlightRef = useRef(false);
  const ordersRefreshAbortRef = useRef<AbortController | null>(null);
  const sessionExpiredRef = useRef(false);

  const refreshOrders = useCallback(async (announceNewOrders = true) => {
    if (ordersRefreshInFlightRef.current || sessionExpiredRef.current) return;

    ordersRefreshInFlightRef.current = true;
    const controller = new AbortController();
    ordersRefreshAbortRef.current = controller;

    try {
      const response = await fetch("/api/admin/orders", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.status === 401) sessionExpiredRef.current = true;
      const payload = await readJson<{ orders: Order[] }>(response);
      if (controller.signal.aborted) return;

      const knownIds = new Set(ordersRef.current.map((order) => order.id));
      const newOrders = payload.orders.filter(
        (order) => !knownIds.has(order.id) && order.status === "new",
      );
      const nextOrders = mergeOrderSnapshots(ordersRef.current, payload.orders);
      ordersRef.current = nextOrders;
      setOrders(nextOrders);
      setOrderLiveStatus("live");

      if (announceNewOrders && ordersInitializedRef.current && newOrders.length) {
        setNewOrderNotice((current) => ({
          count: (current?.count ?? 0) + newOrders.length,
          orderNumber: newOrders[0].orderNumber,
        }));
      }
      ordersInitializedRef.current = true;
    } catch {
      if (controller.signal.aborted) return;
      setOrderLiveStatus("error");
    } finally {
      if (ordersRefreshAbortRef.current === controller) {
        ordersRefreshAbortRef.current = null;
      }
      ordersRefreshInFlightRef.current = false;
    }
  }, []);

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [productResponse, orderResponse] = await Promise.all([
        fetch("/api/admin/products", { cache: "no-store" }),
        fetch("/api/admin/orders", { cache: "no-store" }),
      ]);
      const productPayload = await readJson<{ products: Product[] }>(productResponse);
      const orderPayload = await readJson<{ orders: Order[] }>(orderResponse);
      setProducts(productPayload.products);
      const nextOrders = mergeOrderSnapshots(ordersRef.current, orderPayload.orders);
      ordersRef.current = nextOrders;
      ordersInitializedRef.current = true;
      setOrders(nextOrders);
      setOrderLiveStatus("live");
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Не удалось загрузить данные.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/admin/products", { cache: "no-store" }),
      fetch("/api/admin/orders", { cache: "no-store" }),
    ])
      .then(async ([productResponse, orderResponse]) => {
        const productPayload = await readJson<{ products: Product[] }>(productResponse);
        const orderPayload = await readJson<{ orders: Order[] }>(orderResponse);
        return { productPayload, orderPayload };
      })
      .then(({ productPayload, orderPayload }) => {
        if (!active) return;
        setProducts(productPayload.products);
        const nextOrders = mergeOrderSnapshots(ordersRef.current, orderPayload.orders);
        ordersRef.current = nextOrders;
        ordersInitializedRef.current = true;
        setOrders(nextOrders);
        setOrderLiveStatus("live");
      })
      .catch((cause: unknown) => {
        if (active) {
          setLoadError(cause instanceof Error ? cause.message : "Не удалось загрузить данные.");
          setOrderLiveStatus("error");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const refreshVisibleOrders = () => {
      if (document.visibilityState === "visible") void refreshOrders();
    };
    const timer = window.setInterval(
      refreshVisibleOrders,
      ORDER_REFRESH_INTERVAL_MS,
    );

    window.addEventListener("focus", refreshVisibleOrders);
    document.addEventListener("visibilitychange", refreshVisibleOrders);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshVisibleOrders);
      document.removeEventListener("visibilitychange", refreshVisibleOrders);
      ordersRefreshAbortRef.current?.abort();
    };
  }, [refreshOrders]);

  const activeOrders = useMemo(
    () => orders.filter((order) => !isArchivedOrder(order)),
    [orders],
  );
  const archivedOrders = useMemo(
    () => orders
      .filter(isArchivedOrder)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [orders],
  );
  const displayedOrders = orderView === "active" ? activeOrders : archivedOrders;

  const openNewProduct = (
    kind: "catalog" | "flower",
    catalogCategory: Product["catalogCategory"] = "bouquet",
  ) => {
    const nextOrder = products.reduce((max, product) => Math.max(max, product.sortOrder), 0) + 10;
    const base = blankProduct();
    setDraft({
      ...base,
      kind,
      catalogCategory,
      sortOrder: nextOrder,
      variants: [],
    });
    setNewProductPickerOpen(false);
    setFormError("");
  };

  const saveProduct = async () => {
    if (!draft) return;

    const validationError = flowerVariantValidationError(draft);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const productToSave = prepareProductForSave(draft);

    setSavingProduct(true);
    setFormError("");
    try {
      const editing = productToSave.id > 0;
      const response = await fetch(
        editing ? "/api/admin/products/" + productToSave.id : "/api/admin/products",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(productToSave),
        },
      );
      const payload = await readJson<{ product: Product }>(response);
      setProducts((current) => {
        const exists = current.some((product) => product.id === payload.product.id);
        const next = exists
          ? current.map((product) => product.id === payload.product.id ? payload.product : product)
          : [...current, payload.product];
        return next.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
      });
      setDraft(null);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Не удалось сохранить товар.");
    } finally {
      setSavingProduct(false);
    }
  };

  const toggleProduct = async (product: Product) => {
    if (pendingProductActions[product.id]) return;
    setPendingProductActions((current) => ({
      ...current,
      [product.id]: "visibility",
    }));
    setLoadError("");
    try {
      const response = await fetch("/api/admin/products/" + product.id, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...product, visible: !product.visible }),
      });
      const payload = await readJson<{ product: Product }>(response);
      setProducts((current) => current.map((item) => item.id === product.id ? payload.product : item));
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Не удалось изменить видимость.");
    } finally {
      setPendingProductActions((current) => {
        const next = { ...current };
        delete next[product.id];
        return next;
      });
    }
  };

  const removeProduct = async (product: Product) => {
    if (pendingProductActions[product.id]) return;
    if (!window.confirm("Удалить товар «" + product.name + "»? Это действие нельзя отменить.")) return;
    setPendingProductActions((current) => ({
      ...current,
      [product.id]: "delete",
    }));
    setLoadError("");
    try {
      const response = await fetch("/api/admin/products/" + product.id, { method: "DELETE" });
      await readJson<{ ok: true }>(response);
      setProducts((current) => current.filter((item) => item.id !== product.id));
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Не удалось удалить товар.");
    } finally {
      setPendingProductActions((current) => {
        const next = { ...current };
        delete next[product.id];
        return next;
      });
    }
  };

  const uploadImage = async (file: File, variantId?: string) => {
    if (!draft) return;
    setUploading(true);
    setFormError("");
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/admin/upload", { method: "POST", body: form });
      const payload = await readJson<{ url: string }>(response);
      setDraft((current) => {
        if (!current) return current;
        if (!variantId) return { ...current, image: payload.url };
        return {
          ...current,
          variants: (current.variants ?? []).map((variant) =>
            variant.id === variantId ? { ...variant, image: payload.url } : variant,
          ),
        };
      });
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Не удалось загрузить фотографию.");
    } finally {
      setUploading(false);
    }
  };

  const addVariant = () => {
    setDraft((current) => {
      if (!current) return current;
      if ((current.variants ?? []).length >= MAX_PRODUCT_VARIANTS) {
        setFormError(`Можно добавить не больше ${MAX_PRODUCT_VARIANTS} цветов в одну карточку.`);
        return current;
      }
      const primary = getPrimaryVariant(current);
      return {
        ...current,
        variants: [
          ...(current.variants ?? []),
          blankVariant(
            getVariantImage(current, primary),
            getVariantPrice(current, primary),
            primary?.oldPrice ?? current.oldPrice,
          ),
        ],
      };
    });
  };

  const makeVariantPrimary = (variantId: string) => {
    setDraft((current) => {
      if (!current) return current;
      const variants = [...(current.variants ?? [])];
      const index = variants.findIndex((variant) => variant.id === variantId);
      if (index <= 0) return current;
      const [variant] = variants.splice(index, 1);
      variants.unshift(variant);
      return { ...current, variants };
    });
  };

  const updateVariant = (variantId: string, patch: Partial<ProductVariant>) => {
    setDraft((current) => current
      ? {
        ...current,
        variants: (current.variants ?? []).map((variant) =>
          variant.id === variantId ? { ...variant, ...patch } : variant,
        ),
      }
      : current);
  };

  const removeVariant = (variantId: string) => {
    setDraft((current) => current
      ? {
        ...current,
        variants: (current.variants ?? []).filter((variant) => variant.id !== variantId),
      }
      : current);
  };

  const saveOrderLocally = (updated: Order) => {
    const nextOrders = mergeOrderSnapshots(ordersRef.current, [updated]);
    ordersRef.current = nextOrders;
    setOrders(nextOrders);
  };

  return (
    <main className="admin-root">
      <header className="admin-header">
        <div>
          <Link className="admin-brand" href="/">РАДУЙКА</Link>
          <span>Панель магазина</span>
        </div>
        <div className="admin-user">
          <span>{userName}</span>
          <form action={signOutHref} method="post">
            <button type="submit">Выйти</button>
          </form>
        </div>
      </header>

      <div className="admin-container">
        <section className="admin-welcome">
          <div>
            <p>Рабочее место сотрудника</p>
            <h1>Каталог и заказы</h1>
            <span>Товары сразу появляются на витрине, а новые заказы — в этой панели.</span>
          </div>
          <Link href="/" target="_blank" rel="noreferrer">Открыть магазин ↗</Link>
        </section>

        <section className="admin-stats" aria-label="Сводка">
          <article><span>Товаров на витрине</span><strong>{products.filter((product) => product.visible && product.kind !== "builder").length}</strong></article>
          <article><span>Активных заказов</span><strong>{activeOrders.length}</strong></article>
          <article><span>Новых заказов</span><strong>{orders.filter((order) => order.status === "new").length}</strong></article>
        </section>

        <nav className="admin-tabs" aria-label="Разделы панели">
          <button className={tab === "products" ? "is-active" : ""} onClick={() => setTab("products")}>Товары <b>{products.length}</b></button>
          <button className={tab === "orders" ? "is-active" : ""} onClick={() => setTab("orders")}>Заказы <b>{activeOrders.length}</b></button>
        </nav>

        {newOrderNotice && (
          <div className="admin-new-order" role="status">
            <span aria-hidden="true">●</span>
            <b>{newOrderNotice.count === 1 ? `Новый заказ ${newOrderNotice.orderNumber}` : `Новых заказов: ${newOrderNotice.count}`}</b>
            <button
              type="button"
              onClick={() => {
                setTab("orders");
                setOrderView("active");
                setNewOrderNotice(null);
              }}
            >
              Открыть заказы
            </button>
            <button className="admin-new-order__close" type="button" aria-label="Закрыть уведомление" onClick={() => setNewOrderNotice(null)}>×</button>
          </div>
        )}

        {loadError && <div className="admin-alert" role="alert">{loadError}<button onClick={() => void load()}>Повторить</button></div>}

        {loading ? (
          <div className="admin-loading">Загружаем данные…</div>
        ) : tab === "products" ? (
          <section className="admin-section">
            <div className="admin-section__head">
              <div><p>Управление витриной</p><h2>Товары</h2></div>
              <button className="admin-primary" onClick={() => setNewProductPickerOpen(true)}>＋ Добавить товар</button>
            </div>
            <div className="admin-products">
              {products.map((product) => {
                const primaryVariant = product.kind === "flower" ? getPrimaryVariant(product) : undefined;
                const adminImage = getVariantImage(product, primaryVariant);
                const adminPrice = getVariantPrice(product, primaryVariant);
                return (
                <article className={"admin-product " + (!product.visible ? "is-hidden" : "")} key={product.id}>
                  <img src={optimizedImageSource(adminImage)} alt={product.name} />
                  <div className="admin-product__main">
                    <div className="admin-product__badges">
                      <span>{product.kind === "builder" ? "Конструктор" : product.kind === "flower" ? "Цветы" : product.catalogCategory === "composition" ? "Композиция" : "Букет"}</span>
                      <span className={product.visible ? "is-visible" : "is-muted"}>{product.visible ? "На витрине" : "Скрыт"}</span>
                    </div>
                    <h3>{product.name}</h3>
                    <p>{product.subtitle}</p>
                    <strong>{money(adminPrice)}</strong>
                    {product.kind === "flower" && product.variants.length > 0 && (
                      <small className="admin-product__variant-count">{product.variants.length} {product.variants.length === 1 ? "цвет" : product.variants.length < 5 ? "цвета" : "цветов"}</small>
                    )}
                  </div>
                  <div className="admin-product__actions">
                    <button
                      disabled={Boolean(pendingProductActions[product.id])}
                      onClick={() => { setDraft({ ...product }); setFormError(""); }}
                    >
                      Изменить
                    </button>
                    <button
                      disabled={Boolean(pendingProductActions[product.id])}
                      onClick={() => void toggleProduct(product)}
                    >
                      {pendingProductActions[product.id] === "visibility"
                        ? "Сохраняем…"
                        : product.visible ? "Скрыть" : "Показать"}
                    </button>
                    {product.kind !== "builder" && (
                      <button
                        className="is-danger"
                        disabled={Boolean(pendingProductActions[product.id])}
                        onClick={() => void removeProduct(product)}
                      >
                        {pendingProductActions[product.id] === "delete" ? "Удаляем…" : "Удалить"}
                      </button>
                    )}
                  </div>
                </article>
                );
              })}
            </div>
          </section>
        ) : (
          <section className="admin-section">
            <div className="admin-section__head">
              <div>
                <p>{orderView === "active" ? "Очередь сотрудников" : "История заказов"}</p>
                <h2>{orderView === "active" ? "Заказы в работе" : "Архив заказов"}</h2>
              </div>
              <div className="admin-order-sync">
                <span className={`admin-live-status is-${orderLiveStatus}`} role="status">
                  <i aria-hidden="true" />
                  {orderLiveStatus === "live"
                    ? "Обновляются автоматически"
                    : orderLiveStatus === "error"
                      ? "Нет связи — повторяем"
                      : "Подключаем автообновление"}
                </span>
                <button className="admin-secondary" onClick={() => void refreshOrders(false)}>Обновить сейчас</button>
              </div>
            </div>
            <nav className="admin-order-tabs" aria-label="Состояние заказов">
              <button
                type="button"
                className={orderView === "active" ? "is-active" : ""}
                aria-pressed={orderView === "active"}
                onClick={() => setOrderView("active")}
              >
                В работе <b>{activeOrders.length}</b>
              </button>
              <button
                type="button"
                className={orderView === "archive" ? "is-active" : ""}
                aria-pressed={orderView === "archive"}
                onClick={() => setOrderView("archive")}
              >
                Архив <b>{archivedOrders.length}</b>
              </button>
            </nav>
            {displayedOrders.length ? (
              <div className="admin-orders">
                {displayedOrders.map((order) => (
                  <OrderEditor
                    key={order.id + ":" + order.updatedAt}
                    order={order}
                    archived={orderView === "archive"}
                    onSaved={saveOrderLocally}
                  />
                ))}
              </div>
            ) : (
              <div className="admin-empty">
                <b>{orderView === "active" ? "Активных заказов нет" : "Архив пока пуст"}</b>
                <span>
                  {orderView === "active"
                    ? "Новый заказ появится здесь автоматически."
                    : "Завершённые и отменённые заказы появятся здесь."}
                </span>
              </div>
            )}
          </section>
        )}
      </div>

      {newProductPickerOpen && (
        <div className="admin-modal" role="dialog" aria-modal="true" aria-label="Выбор типа товара">
          <button className="admin-modal__backdrop" aria-label="Закрыть" onClick={() => setNewProductPickerOpen(false)} />
          <section className="admin-product-type-picker">
            <header>
              <div><p>Новый товар</p><h2>Что создаём?</h2><span>Выберите тип товара. Форму можно будет заполнить сразу после выбора.</span></div>
              <button aria-label="Закрыть" onClick={() => setNewProductPickerOpen(false)}>×</button>
            </header>
            <div className="admin-product-type-picker__grid">
              <button type="button" onClick={() => openNewProduct("catalog", "bouquet")}>
                <span className="admin-product-type-picker__icon">✿</span>
                <b>Букет</b>
                <small>Готовый букет: фото, состав, цена, размер и дополнения.</small>
              </button>
              <button type="button" onClick={() => openNewProduct("catalog", "composition")}>
                <span className="admin-product-type-picker__icon">❋</span>
                <b>Композиция</b>
                <small>Композиция в коробке, корзине или вазе: фото, состав, цена и размер.</small>
              </button>
              <button type="button" onClick={() => openNewProduct("flower")}>
                <span className="admin-product-type-picker__icon">❀</span>
                <b>Цветы поштучно</b>
                <small>Один сорт цветка. Можно добавить варианты цвета, отдельные фото и отдельные цены.</small>
              </button>
            </div>
          </section>
        </div>
      )}

      {draft && (
        <div className="admin-modal" role="dialog" aria-modal="true" aria-label={draft.id ? "Редактирование товара" : "Новый товар"}>
          <button className="admin-modal__backdrop" aria-label="Закрыть" onClick={() => setDraft(null)} />
          <section className="admin-product-form">
            <header>
              <div><p>{draft.id ? "Редактирование" : "Новая карточка"}</p><h2>{draft.id ? draft.name : "Добавить товар"}</h2></div>
              <button aria-label="Закрыть" onClick={() => setDraft(null)}>×</button>
            </header>

            <div className="admin-image-field">
              <img
                src={optimizedImageSource(draft.kind === "flower" && draft.variants.length > 0
                  ? getVariantImage(draft, draft.variants[0])
                  : draft.image)}
                alt="Предпросмотр товара"
              />
              {draft.kind === "flower" && draft.variants.length > 0 ? (
                <div className="admin-image-field__variant-note">
                  <b>Фото витрины берётся из основного цвета</b>
                  <small>Чтобы изменить его, загрузите фото в первый цвет ниже или сделайте другой цвет основным.</small>
                </div>
              ) : (
                <label>
                  {uploading ? "Загружаем…" : "Загрузить свою фотографию"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={uploading}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.currentTarget.value = "";
                      if (file) void uploadImage(file);
                    }}
                  />
                </label>
              )}
              <small>JPG, PNG или WebP, до 5 МБ</small>
            </div>

            <div className="admin-form-grid">
              <label className="span-2">Название<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Например, Нежное утро" /></label>
              <label className="span-2">{draft.kind === "flower" ? "Описание цветка" : "Состав и описание"}<textarea value={draft.subtitle} onChange={(event) => setDraft({ ...draft, subtitle: event.target.value })} placeholder={draft.kind === "flower" ? "Коротко опишите сорт, форму и характер цветка" : "Розы, эустома, эвкалипт"} /></label>
              {draft.kind === "flower" && <label className="span-2">Как ухаживать<textarea value={draft.care} onChange={(event) => setDraft({ ...draft, care: event.target.value })} placeholder="Например: обновляйте срез, меняйте воду каждый день, держите вдали от батарей" /></label>}
              <label className="span-2">Видовое название / видовой состав<textarea value={draft.speciesInfo ?? ""} onChange={(event) => setDraft({ ...draft, speciesInfo: event.target.value })} placeholder={draft.kind === "flower" ? "Например: Роза (Rosa), сорт Мондиаль" : "Например: роза, эустома, эвкалипт"} /><small>Для растений укажите реальное видовое название; для букета — фактический видовой состав.</small></label>
              <label>Изготовитель<input value={draft.manufacturer ?? ""} onChange={(event) => setDraft({ ...draft, manufacturer: event.target.value })} placeholder="Наименование / ФИО" /></label>
              <label>Адрес изготовителя<input value={draft.manufacturerAddress ?? ""} onChange={(event) => setDraft({ ...draft, manufacturerAddress: event.target.value })} placeholder="Адрес изготовителя" /></label>
              <label className="span-2">Место изготовления<input value={draft.manufacturingPlace ?? ""} onChange={(event) => setDraft({ ...draft, manufacturingPlace: event.target.value })} placeholder="Город, страна или адрес — укажите фактические сведения" /></label>
              <label className="span-2">Импортёр (если применимо)<textarea value={draft.importerInfo ?? ""} onChange={(event) => setDraft({ ...draft, importerInfo: event.target.value })} placeholder="Наименование и адрес импортёра" /></label>
              <label>Срок годности / службы (если установлен)<input value={draft.shelfLife ?? ""} onChange={(event) => setDraft({ ...draft, shelfLife: event.target.value })} placeholder="Укажите только если срок установлен" /></label>
              <label>Гарантийный срок (если установлен)<input value={draft.warrantyInfo ?? ""} onChange={(event) => setDraft({ ...draft, warrantyInfo: event.target.value })} placeholder="Укажите только если гарантия установлена" /></label>
              <label>Сведения о соответствии (если обязательны)<input value={draft.conformityInfo ?? ""} onChange={(event) => setDraft({ ...draft, conformityInfo: event.target.value })} placeholder="Регламент / декларация / сертификат / знак" /></label>
              <label>Ссылка на запись в реестре (если обязательна)<input type="url" value={draft.conformityUrl ?? ""} onChange={(event) => setDraft({ ...draft, conformityUrl: event.target.value })} placeholder="https://..." /><small>С 01.09.2026 при обязательном подтверждении соответствия дистанционная карточка товара должна вести на запись о сертификате/декларации в соответствующем реестре.</small></label>
              <label className="span-2">Безопасное использование<textarea value={draft.safeUse ?? ""} onChange={(event) => setDraft({ ...draft, safeUse: event.target.value })} placeholder="Только фактические правила и предупреждения, применимые к товару" /></label>
              {draft.kind === "flower" && (
                <div className="span-2 admin-variants">
                  <div className="admin-variants__head">
                    <div>
                      <b>Цвета в карточке</b>
                      <small>Добавляйте цвета здесь. Они сохраняются обычной кнопкой «Сохранить товар» и сразу становятся вариантами на сайте — Supabase вручную менять не нужно.</small>
                    </div>
                    <button
                      type="button"
                      className="admin-secondary"
                      onClick={addVariant}
                      disabled={draft.variants.length >= MAX_PRODUCT_VARIANTS}
                    >
                      + Добавить цвет
                    </button>
                  </div>
                  {draft.variants.length ? (
                    <div className="admin-variants__list">
                      {draft.variants.map((variant, index) => (
                        <div className="admin-variant-card" key={variant.id}>
                          <div className="admin-variant-card__preview">
                            <img src={optimizedImageSource(variant.image || draft.image)} alt={variant.label || "Вариант цвета"} />
                            {index === 0 && <span>Основной</span>}
                          </div>
                          <div className="admin-variant-card__fields">
                            <label>
                              Цвет
                              <input
                                value={variant.label}
                                onChange={(event) => updateVariant(variant.id, { label: event.target.value })}
                                placeholder={index === 0 ? "Например, Белая" : "Например, Розовая"}
                              />
                            </label>
                            <label>
                              Цена, ₽
                              <input
                                type="number"
                                min="1"
                                value={(variant.price ?? draft.price) || ""}
                                onChange={(event) => updateVariant(variant.id, {
                                  price: event.target.value ? Number(event.target.value) : undefined,
                                })}
                              />
                            </label>
                            <label>
                              Старая цена, ₽
                              <input
                                type="number"
                                min="0"
                                value={variant.oldPrice ?? ""}
                                onChange={(event) => updateVariant(variant.id, {
                                  oldPrice: event.target.value ? Number(event.target.value) : undefined,
                                })}
                              />
                              <small>Только реальная прежняя цена; она должна быть выше текущей.</small>
                            </label>
                            <label className="span-2 admin-variant-upload">
                              {uploading ? "Загружаем…" : variant.image ? "Заменить фото этого цвета" : "Загрузить фото этого цвета"}
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                disabled={uploading}
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  event.currentTarget.value = "";
                                  if (file) void uploadImage(file, variant.id);
                                }}
                              />
                            </label>
                          </div>
                          <div className="admin-variant-card__actions">
                            {index > 0 && (
                              <button type="button" onClick={() => makeVariantPrimary(variant.id)}>Сделать основным</button>
                            )}
                            <button type="button" className="admin-variant-remove" onClick={() => removeVariant(variant.id)}>Удалить</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="admin-variants__empty">
                      <p>Пока цветов нет. Товар будет работать как обычный поштучный цветок.</p>
                      <button type="button" className="admin-secondary" onClick={addVariant}>Добавить первый цвет</button>
                    </div>
                  )}
                  <small className="admin-variants__limit">До {MAX_PRODUCT_VARIANTS} цветов в одной карточке.</small>
                </div>
              )}
              {draft.kind !== "flower" || draft.variants.length === 0 ? (
                <>
                  <label>Цена, ₽<input type="number" min="1" value={draft.price || ""} onChange={(event) => setDraft({ ...draft, price: Number(event.target.value) })} /></label>
                  <label>Старая цена, ₽<input type="number" min="0" value={draft.oldPrice ?? ""} onChange={(event) => setDraft({ ...draft, oldPrice: event.target.value ? Number(event.target.value) : undefined })} /><small>Указывайте только реально применявшуюся прежнюю цену; она должна быть выше текущей.</small></label>
                </>
              ) : (
                <div className="span-2 admin-variant-price-note">
                  <b>Цена карточки берётся из основного цвета</b>
                  <span>Сейчас: {money(getVariantPrice(draft, draft.variants[0]))}. Для разных цветов меняйте цены прямо в блоках выше.</span>
                </div>
              )}
              <label>Ярлык<input value={draft.tag ?? ""} onChange={(event) => setDraft({ ...draft, tag: event.target.value || undefined })} placeholder="Хит или Новинка" /><small>Используйте только утверждения, которые можете подтвердить фактически.</small></label>
              <label>Наличие<select value={draft.stock} onChange={(event) => setDraft({ ...draft, stock: event.target.value as Product["stock"] })}><option value="today">В наличии сегодня</option><option value="few">Осталось мало</option><option value="soon">Скоро поступит</option></select></label>
              {draft.kind !== "flower" && <label>Размер<select value={draft.size} onChange={(event) => setDraft({ ...draft, size: event.target.value })}><option value="S">25–30 см</option><option value="M">35–40 см</option><option value="L">45–50 см</option></select></label>}
              <label>Палитра<select value={draft.palette} onChange={(event) => setDraft({ ...draft, palette: event.target.value as Product["palette"] })}><option value="pink">Розовая</option><option value="white">Светлая</option><option value="bright">Яркая</option><option value="green">Зелёная</option></select></label>
              <label>Тип товара<select value={draft.kind} onChange={(event) => { const nextKind = event.target.value as Product["kind"]; setDraft({ ...draft, kind: nextKind }); }}><option value="catalog">Готовый товар</option><option value="flower">Цветы поштучно</option>{draft.kind === "builder" && <option value="builder">Конструктор</option>}</select></label>
              {draft.kind === "catalog" && <label>Категория<select value={draft.catalogCategory ?? "bouquet"} onChange={(event) => setDraft({ ...draft, catalogCategory: event.target.value as NonNullable<Product["catalogCategory"]> })}><option value="bouquet">Букет</option><option value="composition">Композиция</option></select></label>}
              <label>Порядок<input type="number" min="0" value={draft.sortOrder} onChange={(event) => setDraft({ ...draft, sortOrder: Number(event.target.value) })} /></label>
              <label className="admin-check"><input type="checkbox" checked={draft.visible} onChange={(event) => setDraft({ ...draft, visible: event.target.checked })} /><span><b>Показывать на витрине</b><small>Можно сохранить товар скрытым</small></span></label>
              <label className="admin-check"><input type="checkbox" checked={draft.featured} onChange={(event) => setDraft({ ...draft, featured: event.target.checked })} /><span><b>Популярный товар</b><small>Для будущих подборок</small></span></label>
            </div>

            {formError && <p className="admin-error" role="alert">{formError}</p>}
            <footer>
              <button className="admin-secondary" onClick={() => setDraft(null)}>Отмена</button>
              <button className="admin-primary" onClick={() => void saveProduct()} disabled={savingProduct || uploading}>
                {savingProduct ? "Сохраняем…" : "Сохранить товар"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}
