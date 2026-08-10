"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  bouquetSizeLabel,
  cardFee as defaultCardFee,
  productAddOnsLabel,
} from "../../lib/order-options";
import type {
  Order,
  OrderStatus,
  PaymentStatus,
  Product,
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
  price: 0,
  image: "/images/bouquet-1.png",
  stock: "today",
  size: "M",
  palette: "pink",
  kind: "catalog",
  visible: true,
  featured: false,
  sortOrder: 100,
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
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

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

  return (
    <article className={"admin-order" + (archived ? " is-archived" : "")}>
      <header className="admin-order__head">
        <div>
          <span className={"order-state order-state--" + order.status}>
            {statusLabels[order.status]}
          </span>
          <h3>{order.orderNumber}</h3>
          <p>{new Date(order.createdAt.endsWith("Z") ? order.createdAt : order.createdAt + "Z").toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })}</p>
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
                  <img src={item.image} alt="" />
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
            disabled={archived}
            onChange={(event) => setStatus(event.target.value as OrderStatus)}
          >
            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          Оплата
          <select
            value={paymentStatus}
            disabled={archived}
            onChange={(event) => setPaymentStatus(event.target.value as PaymentStatus)}
          >
            {Object.entries(paymentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          Доставка, ₽
          <input
            type="number"
            min="0"
            value={deliveryFee}
            disabled={archived || order.deliveryMethod === "pickup"}
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
            disabled={saving}
          >
            {saving ? "Возвращаем…" : "Вернуть в работу"}
          </button>
        ) : archived ? (
          <p className="admin-archive-note">Отменённый заказ хранится в архиве без повторного открытия.</p>
        ) : (
          <button className="admin-primary" type="button" onClick={() => void save()} disabled={saving}>
            {saving ? "Сохраняем…" : "Сохранить заказ"}
          </button>
        )}
      </div>
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

  const openNewProduct = () => {
    const nextOrder = products.reduce((max, product) => Math.max(max, product.sortOrder), 0) + 10;
    setDraft({ ...blankProduct(), sortOrder: nextOrder });
    setFormError("");
  };

  const saveProduct = async () => {
    if (!draft) return;
    setSavingProduct(true);
    setFormError("");
    try {
      const editing = draft.id > 0;
      const response = await fetch(
        editing ? "/api/admin/products/" + draft.id : "/api/admin/products",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(draft),
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

  const uploadImage = async (file: File) => {
    if (!draft) return;
    setUploading(true);
    setFormError("");
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/admin/upload", { method: "POST", body: form });
      const payload = await readJson<{ url: string }>(response);
      setDraft((current) => current ? { ...current, image: payload.url } : current);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Не удалось загрузить фотографию.");
    } finally {
      setUploading(false);
    }
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
          <article><span>Товаров на витрине</span><strong>{products.filter((product) => product.visible && product.kind === "catalog").length}</strong></article>
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
              <button className="admin-primary" onClick={openNewProduct}>＋ Добавить товар</button>
            </div>
            <div className="admin-products">
              {products.map((product) => (
                <article className={"admin-product " + (!product.visible ? "is-hidden" : "")} key={product.id}>
                  <img src={product.image} alt={product.name} />
                  <div className="admin-product__main">
                    <div className="admin-product__badges">
                      <span>{product.kind === "builder" ? "Конструктор" : "Каталог"}</span>
                      <span className={product.visible ? "is-visible" : "is-muted"}>{product.visible ? "На витрине" : "Скрыт"}</span>
                    </div>
                    <h3>{product.name}</h3>
                    <p>{product.subtitle}</p>
                    <strong>{money(product.price)}</strong>
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
              ))}
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

      {draft && (
        <div className="admin-modal" role="dialog" aria-modal="true" aria-label={draft.id ? "Редактирование товара" : "Новый товар"}>
          <button className="admin-modal__backdrop" aria-label="Закрыть" onClick={() => setDraft(null)} />
          <section className="admin-product-form">
            <header>
              <div><p>{draft.id ? "Редактирование" : "Новая карточка"}</p><h2>{draft.id ? draft.name : "Добавить товар"}</h2></div>
              <button aria-label="Закрыть" onClick={() => setDraft(null)}>×</button>
            </header>

            <div className="admin-image-field">
              <img src={draft.image} alt="Предпросмотр товара" />
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
              <small>JPG, PNG или WebP, до 5 МБ</small>
            </div>

            <div className="admin-form-grid">
              <label className="span-2">Название<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Например, Нежное утро" /></label>
              <label className="span-2">Состав и описание<textarea value={draft.subtitle} onChange={(event) => setDraft({ ...draft, subtitle: event.target.value })} placeholder="Розы, эустома, эвкалипт" /></label>
              <label>Цена, ₽<input type="number" min="0" value={draft.price || ""} onChange={(event) => setDraft({ ...draft, price: Number(event.target.value) })} /></label>
              <label>Старая цена, ₽<input type="number" min="0" value={draft.oldPrice ?? ""} onChange={(event) => setDraft({ ...draft, oldPrice: event.target.value ? Number(event.target.value) : undefined })} /></label>
              <label>Ярлык<input value={draft.tag ?? ""} onChange={(event) => setDraft({ ...draft, tag: event.target.value || undefined })} placeholder="Хит или Новинка" /></label>
              <label>Наличие<select value={draft.stock} onChange={(event) => setDraft({ ...draft, stock: event.target.value as Product["stock"] })}><option value="today">В наличии сегодня</option><option value="few">Осталось мало</option><option value="soon">Скоро поступит</option></select></label>
              <label>Размер<select value={draft.size} onChange={(event) => setDraft({ ...draft, size: event.target.value })}><option value="S">25–30 см</option><option value="M">35–40 см</option><option value="L">45–50 см</option></select></label>
              <label>Палитра<select value={draft.palette} onChange={(event) => setDraft({ ...draft, palette: event.target.value as Product["palette"] })}><option value="pink">Розовая</option><option value="white">Светлая</option><option value="bright">Яркая</option><option value="green">Зелёная</option></select></label>
              <label>Раздел<select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as Product["kind"] })}><option value="catalog">Каталог</option><option value="builder">Конструктор</option></select></label>
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
