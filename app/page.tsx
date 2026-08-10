


"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { defaultProducts } from "../lib/catalog";
import {
  BONUS_EARN_PERCENT,
  BONUS_SPEND_PERCENT,
  bonusEligibleAmount,
  bonusSpendForBalance,
  earnedBonusAmount,
} from "../lib/bonus-rules";
import {
  bouquetSizeFromProduct,
  bouquetSizeLabel,
  bouquetSizeOptions,
  bouquetSizePriceAdjustment,
  builderFlowers,
  builderWraps,
  cardFee,
  normalizeBuilderSelection,
  productAddOnOptions,
  productAddOnsLabel,
  productAddOnsPrice,
} from "../lib/order-options";
import type {
  BouquetSize,
  BuilderSelection,
  OrderStatus,
  PaymentStatus,
  Product,
  ProductAddOn,
  RecipientType,
} from "../lib/types";

type View =
  | "home"
  | "catalog"
  | "builder"
  | "occasion"
  | "delivery"
  | "about"
  | "favorites"
  | "cart"
  | "product"
  | "checkout"
  | "success";

type CartLine = {
  key: string;
  productId: number;
  quantity: number;
  size?: BouquetSize;
  addOns?: ProductAddOn[];
  builder?: BuilderSelection;
};

type CatalogFilter = "Все" | "До 4 000 ₽" | "Нежные" | "Шары" | "Композиции";
type LatestOrder = {
  orderNumber: string;
  total: number;
  customerPhone?: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  updatedAt?: string;
};

type StoredLatestOrder = {
  order: LatestOrder;
  expiresAt: number;
};

type BonusAccount = {
  authenticated: boolean;
  available: boolean;
  balance: number | null;
  loading: boolean;
};

type CartConfiguration = {
  size?: BouquetSize;
  addOns?: ProductAddOn[];
  builder?: BuilderSelection;
};

const money = (value: number) =>
  new Intl.NumberFormat("ru-RU").format(value) + " ₽";

const STORE_ADDRESS = "Екатеринбург, ул. Библиотечная, 43";
const YANDEX_MAP_EMBED_URL = "https://yandex.ru/map-widget/v1/?ll=60.659323%2C56.833035&mode=search&oid=200831341309&ol=biz&z=17";
const YANDEX_MAP_LINK = "https://yandex.ru/maps/-/CTSgV45D";
const LATEST_ORDER_STORAGE_KEY = "raduyka-latest-order-v2";
const LATEST_ORDER_TTL_MS = 24 * 60 * 60_000;

const orderStatusLabels: Record<OrderStatus, string> = {
  new: "Заказ принят",
  confirmed: "Заказ подтверждён",
  assembling: "Флорист собирает букет",
  ready: "Букет готов",
  delivery: "Заказ у курьера",
  completed: "Заказ доставлен",
  cancelled: "Заказ отменён",
};

const paymentStatusLabels: Record<PaymentStatus, string> = {
  pending: "Ожидает подтверждения",
  invoice_sent: "Ссылка на оплату отправлена",
  paid: "Оплачено",
  refunded: "Возврат оформлен",
};

const orderStatuses = Object.keys(orderStatusLabels) as OrderStatus[];
const paymentStatuses = Object.keys(paymentStatusLabels) as PaymentStatus[];

const publicProductTag = (tag: string | undefined) =>
  tag && !/налич|остат|поступ|скоро/i.test(tag) ? tag : undefined;

const isBalloonProduct = (product: Pick<Product, "name" | "subtitle">) =>
  /(?:^|[^а-яё])шар(?:ы|ов|а|ами)?(?:$|[^а-яё])/iu.test(`${product.name} ${product.subtitle}`);

const isCompositionProduct = (product: Pick<Product, "name" | "subtitle">) =>
  /композиц|корзин|ящик/iu.test(`${product.name} ${product.subtitle}`);

function Icon({ name }: { name: "bag" | "heart" | "user" | "search" | "menu" | "close" | "arrow" | "gift" | "plus" | "minus" | "check" }) {
  const paths: Record<string, ReactNode> = {
    bag: <><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></>,
    heart: <path d="M20.8 5.8c-1.9-2-5-2-6.9 0L12 7.7l-1.9-1.9a4.9 4.9 0 0 0-6.9 6.9L12 21l8.8-8.3a4.9 4.9 0 0 0 0-6.9Z"/>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>,
    gift: <><path d="M4 10h16v11H4zM3 7h18v4H3zM12 7v14"/><path d="M12 7H8.5A2.5 2.5 0 1 1 11 4.5L12 7Zm0 0h3.5A2.5 2.5 0 1 0 13 4.5L12 7Z"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    minus: <path d="M5 12h14"/>,
    check: <path d="m5 12 4 4L19 6"/>,
  };
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function ProductCard({
  product,
  liked,
  onLike,
  onOpen,
  onAdd,
}: {
  product: Product;
  liked: boolean;
  onLike: () => void;
  onOpen: () => void;
  onAdd: () => void;
}) {
  return (
    <article className="product-card">
      <button className="product-card__image" onClick={onOpen} aria-label={`Открыть ${product.name}`}>
        <img src={product.image} alt={product.name} />
        {publicProductTag(product.tag) && <span className="product-tag">{publicProductTag(product.tag)}</span>}
      </button>
      <button className={`heart-button ${liked ? "is-liked" : ""}`} onClick={onLike} aria-label={liked ? "Убрать из избранного" : "Добавить в избранное"}>
        <Icon name="heart" />
      </button>
      <div className="product-card__body">
        <button className="product-title-button" onClick={onOpen}>{product.name}</button>
        <p>{product.subtitle}</p>
        <div className="product-card__bottom">
          <div><strong>{money(product.price)}</strong>{product.oldPrice && <s>{money(product.oldPrice)}</s>}</div>
          <button
            className="round-add"
            onClick={onAdd}
            aria-label={`Добавить ${product.name} в корзину`}
          >
            <Icon name="plus" />
          </button>
        </div>
      </div>
    </article>
  );
}

export default function Home() {
  const [products, setProducts] = useState<Product[]>(defaultProducts);
  const [view, setView] = useState<View>("home");
  const [selectedId, setSelectedId] = useState(1);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>("Все");
  const [sort, setSort] = useState("Популярные");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [giftOpen, setGiftOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [orderStatusOpen, setOrderStatusOpen] = useState(false);
  const [orderStatusLoading, setOrderStatusLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [galleryImage, setGalleryImage] = useState("");
  const [selectedSize, setSelectedSize] = useState<BouquetSize>("medium");
  const [selectedProductAddOns, setSelectedProductAddOns] = useState<ProductAddOn[]>([]);
  const [cardAdded, setCardAdded] = useState(false);
  const [builderStep, setBuilderStep] = useState(1);
  const [builderBudget, setBuilderBudget] = useState(5000);
  const [builderMood, setBuilderMood] = useState("Нежный");
  const [builderFlowerSelection, setBuilderFlowerSelection] = useState<string[]>(["Сезонный микс"]);
  const [builderWrap, setBuilderWrap] = useState<string>(builderWraps[0]);
  const [checkoutDelivery, setCheckoutDelivery] = useState<"delivery" | "pickup">("delivery");
  const [recipientType, setRecipientType] = useState<RecipientType>("self");
  const [bonus, setBonus] = useState(false);
  const [bonusAccount, setBonusAccount] = useState<BonusAccount>({ authenticated: false, available: false, balance: null, loading: true });
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [latestOrder, setLatestOrder] = useState<LatestOrder | null>(null);
  const checkoutAttemptIdRef = useRef<string | null>(null);
  const latestOrderExpiresAtRef = useRef<number | null>(null);
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/products", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Каталог временно недоступен");
        return response.json() as Promise<{ products?: Product[] }>;
      })
      .then((payload) => {
        if (active && Array.isArray(payload.products)) setProducts(payload.products);
      })
      .catch(() => {
        // Статический каталог остаётся безопасным резервом при временном сбое сети.
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/bonus", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        const payload = await response.json() as { authenticated?: boolean; available?: boolean; balance?: number; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Баланс временно недоступен");
        return payload;
      })
      .then((payload) => {
        if (!active) return;
        const authenticated = payload.authenticated === true;
        const available = payload.available === true;
        const balance = authenticated && typeof payload.balance === "number" && Number.isFinite(payload.balance)
          ? Math.max(0, Math.trunc(payload.balance))
          : authenticated ? null : 0;
        setBonusAccount({ authenticated, available, balance, loading: false });
        if (!authenticated || !available || balance === 0) setBonus(false);
      })
      .catch(() => {
        if (active) setBonusAccount({ authenticated: false, available: false, balance: null, loading: false });
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const storedFavorites = JSON.parse(localStorage.getItem("raduyka-favorites") ?? "[]") as unknown;
        // Order lookup contains a phone number. Keep it only for this browser
        // session and expire it instead of leaving PII in persistent storage.
        localStorage.removeItem("raduyka-latest-order");
        const storedLatestOrder = JSON.parse(
          sessionStorage.getItem(LATEST_ORDER_STORAGE_KEY) ?? "null",
        ) as unknown;

        if (Array.isArray(storedFavorites)) {
          setFavorites(storedFavorites.filter((item): item is number => Number.isInteger(item) && item > 0));
        }
        if (storedLatestOrder && typeof storedLatestOrder === "object") {
          const stored = storedLatestOrder as Partial<StoredLatestOrder>;
          const candidate = stored.order as Partial<LatestOrder> | undefined;
          if (
            typeof stored.expiresAt !== "number"
            || stored.expiresAt <= Date.now()
          ) {
            sessionStorage.removeItem(LATEST_ORDER_STORAGE_KEY);
          } else if (candidate && typeof candidate.orderNumber === "string" && typeof candidate.total === "number") {
            latestOrderExpiresAtRef.current = stored.expiresAt;
            setLatestOrder({
              orderNumber: candidate.orderNumber,
              total: candidate.total,
              customerPhone: typeof candidate.customerPhone === "string" ? candidate.customerPhone : undefined,
              status: orderStatuses.includes(candidate.status as OrderStatus) ? candidate.status as OrderStatus : "new",
              paymentStatus: paymentStatuses.includes(candidate.paymentStatus as PaymentStatus) ? candidate.paymentStatus as PaymentStatus : "pending",
              updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : undefined,
            });
          }
        }
      } catch {
        // Повреждённые локальные данные не должны ломать витрину.
      } finally {
        setStorageReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    localStorage.setItem("raduyka-favorites", JSON.stringify(favorites));
    localStorage.removeItem("raduyka-latest-order");
    if (latestOrder) {
      const expiresAt = latestOrderExpiresAtRef.current
        ?? Date.now() + LATEST_ORDER_TTL_MS;
      latestOrderExpiresAtRef.current = expiresAt;
      const stored: StoredLatestOrder = {
        order: latestOrder,
        expiresAt,
      };
      sessionStorage.setItem(LATEST_ORDER_STORAGE_KEY, JSON.stringify(stored));
    } else {
      latestOrderExpiresAtRef.current = null;
      sessionStorage.removeItem(LATEST_ORDER_STORAGE_KEY);
    }
  }, [favorites, latestOrder, storageReady]);

  useEffect(() => {
    if (!searchOpen && !giftOpen && !privacyOpen && !orderStatusOpen && !mobileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSearchOpen(false);
      setGiftOpen(false);
      setPrivacyOpen(false);
      setOrderStatusOpen(false);
      setMobileOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [giftOpen, mobileOpen, orderStatusOpen, privacyOpen, searchOpen]);

  const go = (next: View) => {
    setView(next);
    setMobileOpen(false);
    setSearchOpen(false);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const openSearch = () => {
    setMobileOpen(false);
    setSearchOpen(true);
  };

  const lineUnitPrice = (line: CartLine, product: Product) =>
    line.builder?.budget ?? Math.max(
      0,
      product.price
        + bouquetSizePriceAdjustment(line.size, product.size)
        + productAddOnsPrice(line.addOns),
    );

  const addToCart = (id: number, configuration: CartConfiguration = {}) => {
    const product = products.find((item) => item.id === id && item.visible);
    if (!product) {
      notify("Этот товар больше недоступен");
      return false;
    }
    if (product.stock === "soon") {
      notify("Товар временно недоступен");
      return false;
    }
    const builder = product.kind === "builder"
      ? normalizeBuilderSelection(configuration.builder)
      : undefined;
    const size = product.kind === "catalog"
      ? configuration.size ?? bouquetSizeFromProduct(product.size)
      : undefined;
    const addOns = product.kind === "catalog"
      ? [...new Set(configuration.addOns ?? [])]
      : undefined;
    const key = JSON.stringify({
      productId: product.id,
      size,
      addOns: [...(addOns ?? [])].sort(),
      builder: builder
        ? { ...builder, flowers: [...builder.flowers].sort() }
        : undefined,
    });

    if ((cart.find((line) => line.key === key)?.quantity ?? 0) >= 20) {
      notify("Одного варианта можно добавить не больше 20 раз");
      return false;
    }

    setCart((current) => {
      const existing = current.find((line) => line.key === key);
      return existing
        ? current.map((line) =>
          line.key === key
            ? { ...line, quantity: Math.min(20, line.quantity + 1) }
            : line,
        )
        : [...current, {
          key,
          productId: product.id,
          quantity: 1,
          size,
          addOns,
          builder,
        }];
    });
    notify("Букет добавлен в корзину");
    return true;
  };

  const updateQuantity = (key: string, delta: number) => {
    setCart((current) => current
      .map((line) =>
        line.key === key
          ? { ...line, quantity: Math.min(20, line.quantity + delta) }
          : line,
      )
      .filter((line) => line.quantity > 0));
  };

  const toggleFavorite = (id: number) => {
    setFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const openProduct = (id: number) => {
    const product = products.find((item) => item.id === id);
    if (!product) {
      notify("Этот товар больше недоступен");
      return;
    }
    setSelectedId(id);
    setGalleryImage(product.image);
    setSelectedSize(bouquetSizeFromProduct(product.size));
    setSelectedProductAddOns([]);
    go("product");
  };

  const openCatalog = (filter: CatalogFilter = "Все") => {
    setCatalogFilter(filter);
    go("catalog");
  };

  const resetBuilder = () => {
    setBuilderStep(1);
    setBuilderBudget(5000);
    setBuilderMood("Нежный");
    setBuilderFlowerSelection(["Сезонный микс"]);
    setBuilderWrap(builderWraps[0]);
  };

  const startBuilder = () => {
    const availableBuilder = products.find((product) =>
      product.kind === "builder" && product.visible && product.stock !== "soon",
    );
    if (!availableBuilder) {
      notify("Конструктор временно недоступен — выберите готовый букет");
      openCatalog();
      return;
    }
    resetBuilder();
    go("builder");
  };

  const navigate = (target: View) => {
    if (target === "catalog") {
      openCatalog();
    } else if (target === "builder") {
      startBuilder();
    } else {
      go(target);
    }
  };

  const toggleProductAddOn = (id: ProductAddOn) => {
    setSelectedProductAddOns((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  const toggleBuilderFlower = (flower: string) => {
    setBuilderFlowerSelection((current) => {
      if (flower === "Доверюсь флористу") {
        return current.includes(flower) ? ["Сезонный микс"] : [flower];
      }
      const withoutFlorist = current.filter((item) => item !== "Доверюсь флористу");
      if (withoutFlorist.includes(flower)) {
        const next = withoutFlorist.filter((item) => item !== flower);
        return next.length ? next : ["Доверюсь флористу"];
      }
      return [...withoutFlorist, flower];
    });
  };

  const finishBuilder = () => {
    if (!builderProduct) {
      notify("Конструктор временно недоступен");
      return;
    }
    const added = addToCart(builderProduct.id, {
      builder: {
        budget: builderBudget,
        mood: builderMood,
        flowers: builderFlowerSelection,
        wrap: builderWrap,
      },
    });
    if (!added) return;
    resetBuilder();
    go("cart");
  };

  const checkOrderStatus = async () => {
    if (!latestOrder) return;
    setOrderStatusOpen(true);
    if (!latestOrder.customerPhone) return;

    setOrderStatusLoading(true);
    try {
      const response = await fetch("/api/orders/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderNumber: latestOrder.orderNumber,
          customerPhone: latestOrder.customerPhone,
        }),
      });
      const payload = await response.json() as {
        order?: LatestOrder;
        error?: string;
      };
      if (!response.ok || !payload.order) throw new Error(payload.error ?? "Не удалось обновить статус.");
      setLatestOrder((current) => current ? { ...current, ...payload.order } : payload.order ?? null);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось обновить статус.");
    } finally {
      setOrderStatusLoading(false);
    }
  };

  const submitOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (cart.some((line) => !products.some((product) => product.id === line.productId))) {
      setCheckoutError("Удалите недоступный товар из корзины и попробуйте снова.");
      go("cart");
      return;
    }
    setCheckoutSubmitting(true);
    setCheckoutError("");
    const form = new FormData(event.currentTarget);
    const customerPhone = String(form.get("customerPhone") ?? "");
    try {
      const checkoutAttemptId = checkoutAttemptIdRef.current ?? crypto.randomUUID();
      checkoutAttemptIdRef.current = checkoutAttemptId;
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": checkoutAttemptId,
        },
        body: JSON.stringify({
          deliveryMethod: checkoutDelivery,
          recipientType,
          recipientName: String(form.get("recipientName") ?? ""),
          recipientPhone: String(form.get("recipientPhone") ?? ""),
          customerName: String(form.get("customerName") ?? ""),
          customerPhone,
          address: String(form.get("address") ?? ""),
          deliveryDate: String(form.get("deliveryDate") ?? ""),
          deliveryTime: String(form.get("deliveryTime") ?? ""),
          cardText: String(form.get("cardText") ?? ""),
          useBonus: bonus,
          cardAdded,
          items: cart.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            size: line.size,
            addOns: line.addOns,
            builder: line.builder,
          })),
        }),
      });
      const payload = await response.json() as {
        order?: {
          orderNumber: string;
          total: number;
          status: OrderStatus;
          paymentStatus: PaymentStatus;
          updatedAt: string;
          bonusSpent?: number;
        };
        error?: string;
      };
      if (!response.ok || !payload.order) {
        if (response.status >= 400 && response.status < 500) {
          checkoutAttemptIdRef.current = null;
        }
        throw new Error(payload.error ?? "Не удалось оформить заказ.");
      }
      setOrderNumber(payload.order.orderNumber);
      latestOrderExpiresAtRef.current = Date.now() + LATEST_ORDER_TTL_MS;
      setLatestOrder({
        orderNumber: payload.order.orderNumber,
        total: payload.order.total,
        customerPhone,
        status: payload.order.status,
        paymentStatus: payload.order.paymentStatus,
        updatedAt: payload.order.updatedAt,
      });
      if (bonusAccount.balance !== null && (payload.order.bonusSpent ?? 0) > 0) {
        setBonusAccount((current) => ({
          ...current,
          balance: current.balance === null
            ? null
            : Math.max(0, current.balance - (payload.order?.bonusSpent ?? 0)),
        }));
      }
      setCart([]);
      setCardAdded(false);
      setBonus(false);
      setRecipientType("self");
      setSelectedProductAddOns([]);
      checkoutAttemptIdRef.current = null;
      go("success");
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Не удалось оформить заказ.");
    } finally {
      setCheckoutSubmitting(false);
    }
  };

  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const cartSubtotal = cart.reduce((sum, line) => {
    const product = products.find((item) => item.id === line.productId);
    return sum + (product ? lineUnitPrice(line, product) : 0) * line.quantity;
  }, 0);
  const bonusEligibleTotal = bonusEligibleAmount(cartSubtotal, cardAdded ? cardFee : 0);
  const availableBonusSpend = bonusAccount.balance === null
    ? 0
    : bonusSpendForBalance(bonusAccount.balance, bonusEligibleTotal);
  const discount = bonus ? availableBonusSpend : 0;
  const expectedBonusEarn = earnedBonusAmount(bonusEligibleTotal, discount);
  const total = bonusEligibleTotal - discount;
  const selectedProduct = products.find((item) => item.id === selectedId) ?? products[0] ?? defaultProducts[0];
  const selectedProductIsBalloons = isBalloonProduct(selectedProduct);
  const selectedProductIsComposition = isCompositionProduct(selectedProduct);
  const selectedProductPrice = Math.max(
    0,
    selectedProduct.price
      + (selectedProductIsBalloons ? 0 : bouquetSizePriceAdjustment(selectedSize, selectedProduct.size))
      + productAddOnsPrice(selectedProductAddOns),
  );
  const builderProduct = products.find((item) => item.kind === "builder");

  const catalogProducts = useMemo(() => {
    let result = products.filter((item) => item.kind === "catalog" && item.stock !== "soon");
    if (catalogFilter === "До 4 000 ₽") result = result.filter((item) => item.price <= 4000);
    if (catalogFilter === "Нежные") result = result.filter((item) => item.palette === "pink" || item.palette === "white");
    if (catalogFilter === "Шары") result = result.filter(isBalloonProduct);
    if (catalogFilter === "Композиции") result = result.filter(isCompositionProduct);
    if (sort === "Популярные") result = [...result].sort((a, b) => Number(b.featured) - Number(a.featured) || a.sortOrder - b.sortOrder);
    if (sort === "Сначала дешевле") result = [...result].sort((a, b) => a.price - b.price);
    if (sort === "Сначала дороже") result = [...result].sort((a, b) => b.price - a.price);
    return result;
  }, [catalogFilter, products, sort]);

  const featuredProducts = useMemo(
    () => products
      .filter((product) => product.kind === "catalog")
      .filter((product) => product.stock !== "soon")
      .sort((a, b) => Number(b.featured) - Number(a.featured) || a.sortOrder - b.sortOrder)
      .slice(0, 4),
    [products],
  );
  const normalizedSearch = search.trim().toLowerCase();
  const searchResults = normalizedSearch
    ? products.filter((item) => item.kind === "catalog" && item.stock !== "soon" && `${item.name} ${item.subtitle}`.toLowerCase().includes(normalizedSearch))
    : [];

  const nav = [
    ["Каталог", "catalog"],
    ["Собрать букет", "builder"],
    ["Повод", "occasion"],
    ["Доставка", "delivery"],
    ["О нас", "about"],
  ] as const;

  return (
    <div className="site-shell">
      <header className="site-header">
        <button className="brand" onClick={() => go("home")} aria-label="Радуйка — на главную">РАДУЙКА</button>
        <nav className="main-nav" aria-label="Главная навигация">
          {nav.map(([label, target]) => <button key={target} className={view === target ? "is-active" : ""} onClick={() => navigate(target)}>{label}</button>)}
        </nav>
        <div className="header-actions">
          <button className="icon-button search-trigger" onClick={openSearch} aria-label="Поиск"><Icon name="search" /></button>
          <Link className="text-action" href="/account">Личный кабинет</Link>
          <span className="header-rule" />
          <button className="icon-button" onClick={() => go("favorites")} aria-label="Избранное"><Icon name="heart" />{favorites.length > 0 && <b>{favorites.length}</b>}</button>
          <button className="bag-action" onClick={() => go("cart")} aria-label="Корзина"><Icon name="bag" /><span>{cartCount}</span></button>
          <button className="menu-button" onClick={() => setMobileOpen(!mobileOpen)} aria-label={mobileOpen ? "Закрыть меню" : "Открыть меню"} aria-expanded={mobileOpen}><Icon name={mobileOpen ? "close" : "menu"} /></button>
        </div>
        {mobileOpen && <nav className="mobile-nav">{nav.map(([label, target]) => <button key={target} onClick={() => navigate(target)}>{label}</button>)}<button onClick={openSearch}>Поиск</button><button onClick={() => go("favorites")}>Избранное {favorites.length ? `(${favorites.length})` : ""}</button><Link href="/account">Личный кабинет</Link></nav>}
      </header>

      <main>
        {view === "home" && (
          <>
            <section className="hero section-pad">
              <div className="hero__copy">
                <p className="eyebrow">Свежие цветы каждый день</p>
                <h1>Букеты, которые<br />говорят за вас</h1>
                <p className="hero__lead">Соберём авторский букет и доставим сегодня — свежо, бережно и точно ко времени.</p>
                <div className="hero__actions">
                  <button className="button button--navy" onClick={() => openCatalog()}>Выбрать букет</button>
                  <button className="button button--light" onClick={startBuilder}>Собрать свой</button>
                </div>
                <div className="hero__facts"><span>★ 4,9 по 620 отзывам</span><span>от 60 минут</span></div>
              </div>
              <div className="hero__image"><img src="/images/hero-bouquet.png" alt="Яркий авторский букет Радуйки" /></div>
            </section>

            <section className="category-grid section-pad" aria-label="Категории">
              <button onClick={() => openCatalog()} className="category category--cream"><span>Букеты</span><Icon name="arrow" /><img src="/images/bouquet-1.png" alt="" /></button>
              <button onClick={() => openCatalog("Нежные")} className="category category--blush"><span>Нежные<br />букеты</span><Icon name="arrow" /><img src="/images/bouquet-3.png" alt="" /></button>
              <button onClick={() => go("delivery")} className="category category--cream"><span>Доставка<br />сегодня</span><Icon name="arrow" /><img src="/images/bouquet-2.png" alt="" /></button>
              <button onClick={() => openCatalog("Композиции")} className="category category--blush"><span>Цветочные<br />композиции</span><Icon name="arrow" /><img src="/images/composition.svg" alt="" /></button>
              <button onClick={() => openCatalog("Шары")} className="category category--cream"><span>Воздушные<br />шары</span><Icon name="arrow" /><img src="/images/balloons.svg" alt="" /></button>
            </section>

            <section className="promise-strip section-pad">
              <div><span className="promise-icon promise-icon--lime">↝</span><b>Доставка от 60 минут</b><p>Покажем фото букета до отправки</p></div>
              <div><span className="promise-icon promise-icon--pink">☆</span><b>Бонусы за каждый заказ</b><p>Оплачивайте до 10% и получайте 5% обратно</p></div>
              <div><span className="promise-icon promise-icon--cream">✓</span><b>Свежесть гарантируем</b><p>Собираем каждый заказ вручную в день доставки</p></div>
            </section>

            <section className="section-pad section-block">
              <div className="section-heading"><div><p className="eyebrow">Выбирают чаще всего</p><h2>Популярные букеты</h2></div><button className="link-arrow" onClick={() => openCatalog()}>Смотреть все <Icon name="arrow" /></button></div>
              <div className="product-grid product-grid--home">
                {featuredProducts.map((product) => <ProductCard key={product.id} product={product} liked={favorites.includes(product.id)} onLike={() => toggleFavorite(product.id)} onOpen={() => openProduct(product.id)} onAdd={() => addToCart(product.id)} />)}
              </div>
            </section>

            <section className="builder-banner section-pad">
              <div className="builder-banner__image"><img src="/images/florist-workshop.png" alt="Флорист собирает букет" /></div>
              <div className="builder-banner__copy"><p className="eyebrow">Букет с вашим характером</p><h2>Соберите свой<br />за четыре шага</h2><p>Выберите настроение, бюджет и упаковку. Флорист подберёт самые свежие цветы и пришлёт фото перед доставкой.</p><button className="button button--navy" onClick={startBuilder}>Начать сборку</button></div>
            </section>

            <section className="occasions section-pad section-block">
              <div className="section-heading"><div><p className="eyebrow">Не нужно долго выбирать</p><h2>Букет найдётся для любого повода</h2></div></div>
              <div className="occasion-row">
                {["День рождения", "Без повода", "Свидание", "Спасибо", "Важный день"].map((item, index) => <button key={item} onClick={() => openCatalog(item === "Свидание" ? "Нежные" : item === "Спасибо" ? "До 4 000 ₽" : "Все")}><span>{String(index + 1).padStart(2, "0")}</span>{item}<Icon name="arrow" /></button>)}
              </div>
            </section>

            <section className="reviews section-pad section-block">
              <div className="section-heading"><div><p className="eyebrow">620 тёплых историй</p><h2>Радость уже доставлена</h2></div><strong className="rating">4,9 <span>★★★★★</span></strong></div>
              <div className="review-grid">
                <article><p>«Букет оказался даже красивее, чем на фото. Отправили снимок перед доставкой и привезли минута в минуту».</p><footer><b>Анна</b><span>заказ 1 августа</span></footer></article>
                <article><p>«Собрал букет в конструкторе за пару минут. Флорист попал в настроение идеально — очень живо и не банально».</p><footer><b>Максим</b><span>заказ 28 июля</span></footer></article>
                <article><p>«Композиция получилась очень живой и аккуратной. Всё согласовали заранее и доставили бережно».</p><footer><b>Лера</b><span>заказ 24 июля</span></footer></article>
              </div>
            </section>
          </>
        )}

        {view === "catalog" && (
          <section className="section-pad page-section">
            <div className="page-hero page-hero--lime"><p className="eyebrow">Собраны флористами</p><h1>Каталог</h1><p>Букеты, композиции и дополнения для тёплых поводов и приятных сюрпризов.</p></div>
            <div className="catalog-toolbar">
              <div className="filter-chips">{(["Все", "До 4 000 ₽", "Нежные", "Композиции", "Шары"] as CatalogFilter[]).map((item) => <button key={item} className={catalogFilter === item ? "is-active" : ""} onClick={() => setCatalogFilter(item)}>{item}</button>)}</div>
              <label>Сортировка<select value={sort} onChange={(event) => setSort(event.target.value)}><option>Популярные</option><option>Сначала дешевле</option><option>Сначала дороже</option></select></label>
            </div>
            <div className="catalog-info"><span>Найдено: {catalogProducts.length}</span><span>Цены обновляются автоматически</span></div>
            {catalogProducts.length ? (
              <div className="product-grid">{catalogProducts.map((product) => <ProductCard key={product.id} product={product} liked={favorites.includes(product.id)} onLike={() => toggleFavorite(product.id)} onOpen={() => openProduct(product.id)} onAdd={() => addToCart(product.id)} />)}</div>
            ) : (
              <div className="empty-state"><div>✦</div><h2>Раздел пока наполняется</h2><p>Скоро здесь появятся новые позиции. А пока посмотрите весь каталог.</p><button className="button button--navy" onClick={() => setCatalogFilter("Все")}>Смотреть все</button></div>
            )}
          </section>
        )}

        {view === "product" && (
          <section className="section-pad page-section product-page">
            <button className="back-link" onClick={() => go("catalog")}>← Вернуться в каталог</button>
            <div className="product-detail">
              <div className="product-detail__gallery"><div className="product-detail__main"><img src={galleryImage || selectedProduct.image} alt={selectedProduct.name} />{publicProductTag(selectedProduct.tag) && <span className="product-tag">{publicProductTag(selectedProduct.tag)}</span>}</div><div className="thumb-row"><button className={!galleryImage || galleryImage === selectedProduct.image ? "is-active" : ""} aria-label="Показать товар" aria-pressed={!galleryImage || galleryImage === selectedProduct.image} onClick={() => setGalleryImage(selectedProduct.image)}><img src={selectedProduct.image} alt="Вид товара" /></button>{!selectedProductIsBalloons && <button className={galleryImage === "/images/florist-workshop.png" ? "is-active" : ""} aria-label="Показать процесс сборки" aria-pressed={galleryImage === "/images/florist-workshop.png"} onClick={() => setGalleryImage("/images/florist-workshop.png")}><img src="/images/florist-workshop.png" alt="Сборка флористом" /></button>}<button className="photo-note" onClick={() => notify("Фото готового заказа пришлём перед доставкой")}>Фото<br />перед<br />доставкой</button></div></div>
              <div className="product-detail__info">
                <h1>{selectedProduct.name}</h1><p className="product-subtitle">{selectedProduct.subtitle}</p>
                <div className="detail-price"><strong>{money(selectedProductPrice)}</strong>{selectedProduct.oldPrice && selectedProductPrice === selectedProduct.price && <s>{money(selectedProduct.oldPrice)}</s>}</div>
                {!selectedProductIsBalloons && <div className="detail-group"><b>{selectedProductIsComposition ? "Размер композиции" : "Размер букета"}</b><div className="size-options">{bouquetSizeOptions.map((option) => <button key={option.id} className={selectedSize === option.id ? "is-active" : ""} aria-pressed={selectedSize === option.id} onClick={() => setSelectedSize(option.id)}>{option.label}</button>)}</div></div>}
                <div className="detail-group"><b>Добавить к заказу</b><div className="add-on-row"><button className={cardAdded ? "is-active" : ""} aria-pressed={cardAdded} onClick={() => setCardAdded((current) => !current)}>Открытка <span>+{money(cardFee)}</span></button>{productAddOnOptions.filter((option) => !selectedProductIsBalloons || option.id === "sweet").map((option) => <button key={option.id} className={selectedProductAddOns.includes(option.id) ? "is-active" : ""} aria-pressed={selectedProductAddOns.includes(option.id)} onClick={() => toggleProductAddOn(option.id)}>{option.label} <span>+{money(option.price)}</span></button>)}</div></div>
                <div className="delivery-inline"><span>Яндекс Доставка</span><b>Привезём по указанному адресу</b><small>Стоимость рассчитает сервис после проверки адреса</small></div>
                <div className="detail-actions"><button className="button button--navy" onClick={() => addToCart(selectedProduct.id, { size: selectedSize, addOns: selectedProductAddOns })}>Добавить в корзину</button><button className={`favorite-large ${favorites.includes(selectedProduct.id) ? "is-liked" : ""}`} aria-label={favorites.includes(selectedProduct.id) ? "Убрать из избранного" : "Добавить в избранное"} aria-pressed={favorites.includes(selectedProduct.id)} onClick={() => toggleFavorite(selectedProduct.id)}><Icon name="heart" /></button></div>
                <details open><summary>{selectedProductIsBalloons ? "О наборе" : "Состав и уход"}</summary><p>{selectedProductIsBalloons ? `${selectedProduct.subtitle}. Шары надуты гелием и подготовлены к вручению.` : `${selectedProduct.subtitle}. Подрежьте стебли под углом, поставьте в прохладную воду и меняйте её каждый день.`}</p></details>
                <details><summary>{selectedProductIsBalloons ? "Важно о доставке" : "Важно о внешнем виде"}</summary><p>{selectedProductIsBalloons ? "Перевозим шары аккуратно и передаём получателю в собранном виде." : "Работаем с живыми цветами, поэтому оттенок и раскрытие бутонов могут немного отличаться. Общий характер букета сохраним."}</p></details>
              </div>
            </div>
            <div className="section-heading related-heading"><h2>Может понравиться</h2></div>
            <div className="product-grid product-grid--home">{products.filter((product) => product.kind === "catalog" && product.stock !== "soon" && product.id !== selectedProduct.id).slice(0, 4).map((product) => <ProductCard key={product.id} product={product} liked={favorites.includes(product.id)} onLike={() => toggleFavorite(product.id)} onOpen={() => openProduct(product.id)} onAdd={() => addToCart(product.id)} />)}</div>
          </section>
        )}

        {view === "builder" && (
          <section className="section-pad page-section builder-page">
            <div className="page-hero page-hero--pink"><p className="eyebrow">Личный флорист онлайн</p><h1>Соберите букет<br />под своё настроение</h1><p>Четыре простых шага. Финальный состав уточнит флорист и соберёт его из свежих цветов.</p></div>
            <div className="builder-layout">
              <div className="builder-card">
                <div className="builder-progress"><span>Шаг {builderStep} из 4</span><div>{[1,2,3,4].map((step) => <i key={step} className={step <= builderStep ? "is-done" : ""} />)}</div></div>
                {builderStep === 1 && <div className="builder-question"><p className="eyebrow">01 — бюджет</p><h2>На какую сумму ориентируемся?</h2><div className="option-grid option-grid--price">{[3500,5000,7000,10000].map((price) => <button key={price} className={builderBudget === price ? "is-active" : ""} onClick={() => setBuilderBudget(price)}><b>{money(price)}</b><span>{price < 5000 ? "Компактный" : price < 7000 ? "Выразительный" : price < 10000 ? "Большой" : "Впечатляющий"}</span></button>)}</div></div>}
                {builderStep === 2 && <div className="builder-question"><p className="eyebrow">02 — настроение</p><h2>Что должен сказать букет?</h2><div className="option-grid">{[["Нежный","#f4cbd5"],["Яркий","#d91f68"],["Воздушный","#f6f1e6"],["С характером","var(--lime)"]].map(([label,color]) => <button key={label} className={builderMood === label ? "is-active" : ""} onClick={() => setBuilderMood(label)}><i style={{background: color}} /><b>{label}</b></button>)}</div></div>}
                {builderStep === 3 && <div className="builder-question"><p className="eyebrow">03 — любимые цветы</p><h2>Что точно хочется увидеть?</h2><div className="flower-choice-grid">{builderFlowers.map((item) => <label key={item}><input type="checkbox" checked={builderFlowerSelection.includes(item)} onChange={() => toggleBuilderFlower(item)} /><span>{item}</span></label>)}</div><p className="helper-text">Флорист учтёт ваш выбор и согласует финальный состав.</p></div>}
                {builderStep === 4 && <div className="builder-question"><p className="eyebrow">04 — упаковка</p><h2>Последний штрих</h2><div className="wrap-options">{builderWraps.map((item, index) => <button key={item} className={builderWrap === item ? "is-active" : ""} onClick={() => setBuilderWrap(item)}><span className={`wrap-swatch wrap-swatch--${index + 1}`} /><b>{item}</b></button>)}</div><div className="builder-summary"><span>Ваш выбор</span><b>{builderMood} · {builderFlowerSelection.join(", ")} · {builderWrap}</b><strong>{money(builderBudget)}</strong></div></div>}
                <div className="builder-controls">{builderStep > 1 && <button className="button button--light" onClick={() => setBuilderStep(builderStep - 1)}>Назад</button>}{builderStep < 4 ? <button className="button button--navy" onClick={() => setBuilderStep(builderStep + 1)}>Продолжить</button> : <button className="button button--navy" onClick={finishBuilder} disabled={!builderProduct}>Добавить в корзину</button>}</div>
              </div>
              <aside className="builder-preview"><img src="/images/hero-bouquet.png" alt="Пример авторского букета" /><div><p>Ваш будущий букет</p><b>{builderMood} характер</b><span>Финальный вид пришлём на согласование</span></div></aside>
            </div>
          </section>
        )}

        {view === "occasion" && (
          <section className="section-pad page-section">
            <div className="page-hero page-hero--cream"><p className="eyebrow">Когда важны правильные слова</p><h1>Выберите повод —<br />мы подберём настроение</h1><p>Подсказки флористов для тех случаев, когда хочется порадовать, но сложно решить как.</p></div>
            <div className="occasion-grid">{[
              ["День рождения", "Ярко, празднично и с вау-эффектом", "01"],
              ["Для любимого человека", "Тепло, лично и без лишней слащавости", "02"],
              ["Спасибо", "Лёгкий знак внимания, который запомнят", "03"],
              ["Важное событие", "Сдержанно, благородно и торжественно", "04"],
              ["Просто так", "Потому что лучший повод — его отсутствие", "05"],
              ["Не знаю, что выбрать", "Ответьте на один вопрос — поможем", "06"],
            ].map(([title,text,index], i) => <button key={title} className={i === 5 ? "occasion-card occasion-card--lime" : "occasion-card"} onClick={() => { if (i === 5) { setGiftOpen(true); } else { openCatalog(i === 1 ? "Нежные" : i === 2 ? "До 4 000 ₽" : "Все"); } }}><span>{index}</span><h3>{title}</h3><p>{text}</p><Icon name="arrow" /></button>)}</div>
            <div className="reminder-banner"><div><Icon name="gift" /></div><section><p className="eyebrow">Больше не забывать</p><h2>Напомним о важных датах</h2><p>Сохраняйте события в личном кабинете и получайте напоминания заранее.</p></section><Link className="button button--navy" href="/account?new=1">Добавить дату</Link></div>
          </section>
        )}

        {view === "delivery" && (
          <section className="section-pad page-section">
            <div className="page-hero page-hero--lime delivery-hero"><div><p className="eyebrow">Бережно и по адресу</p><h1>Доставка через Яндекс</h1><p>Заказ передаём в Яндекс Доставку. Стоимость зависит от адреса и подтверждается до оплаты.</p></div><div className="delivery-route"><span>Студия</span><i /><span>Яндекс</span><i /><span>Получатель</span></div></div>
            <div className="delivery-grid"><article><span>01</span><h3>По тарифу сервиса</h3><strong>После адреса</strong><p>Яндекс Доставка рассчитает стоимость после проверки указанного адреса.</p></article><article><span>02</span><h3>Согласуем заранее</h3><strong>До оплаты</strong><p>Сообщим итоговую стоимость доставки вместе с подтверждением заказа.</p></article><article><span>03</span><h3>Самовывоз</h3><strong>Бесплатно</strong><p>{STORE_ADDRESS}. Сообщим, когда заказ будет готов.</p></article></div>
            <section className="studio-location" aria-labelledby="studio-location-title">
              <div className="studio-location__copy">
                <p className="eyebrow">Самовывоз и контакты</p>
                <h2 id="studio-location-title">Наша студия</h2>
                <address>{STORE_ADDRESS}</address>
                <div className="studio-hours" aria-label="Время работы">
                  <div><span>Понедельник — пятница</span><b>09:00–21:00</b></div>
                  <div><span>Суббота — воскресенье</span><b>10:00–21:00</b></div>
                </div>
                <a className="studio-location__link" href={YANDEX_MAP_LINK} target="_blank" rel="noreferrer">Открыть в Яндекс Картах ↗</a>
              </div>
              <div className="studio-location__map">
                <iframe
                  src={YANDEX_MAP_EMBED_URL}
                  title="Радуйка на Яндекс Картах"
                  loading="lazy"
                  allowFullScreen
                  referrerPolicy="no-referrer"
                  sandbox="allow-scripts allow-same-origin allow-popups"
                />
              </div>
            </section>
            <div className="how-delivery"><div><p className="eyebrow">Как всё происходит</p><h2>От заказа до счастливого сообщения</h2></div><ol><li><span>1</span><div><b>Вы оформляете заказ</b><p>Указываете адрес и телефон получателя.</p></div></li><li><span>2</span><div><b>Флорист собирает букет</b><p>Использует свежие цветы и присылает вам фото.</p></div></li><li><span>3</span><div><b>Яндекс Доставка привозит</b><p>Курьер бережно передаёт заказ получателю.</p></div></li></ol></div>
            <div className="faq"><h2>Частые вопросы</h2>{["Можно доставить, если я не знаю точный адрес?", "Получатель увидит стоимость?", "Что будет, если получателя нет на месте?"].map((item, index) => <details key={item} open={index === 0}><summary>{item}</summary><p>{index === 0 ? "Да. Укажите телефон — мы аккуратно уточним удобное место и время, не раскрывая сюрприз." : "Менеджер свяжется с вами и согласует следующий шаг. Все детали заказа остаются у отправителя."}</p></details>)}</div>
          </section>
        )}

        {view === "about" && (
          <section className="section-pad page-section">
            <div className="about-hero"><div><p className="eyebrow">Радость — в живых деталях</p><h1>Не копируем букеты.<br />Собираем эмоции.</h1><p>«Радуйка» — цветочная студия, где современная флористика встречается с человеческой заботой. Каждый заказ собираем вручную в день доставки.</p></div><img src="/images/florist-workshop.png" alt="Работа флориста Радуйки" /></div>
            <div className="values-grid"><article><span>01</span><h3>Только свежие</h3><p>Получаем небольшие поставки несколько раз в неделю, поэтому цветы не залеживаются.</p></article><article><span>02</span><h3>Похоже по настроению</h3><p>Живые цветы не бывают одинаковыми. Сохраняем палитру, объём и характер выбранного букета.</p></article><article><span>03</span><h3>Честно до доставки</h3><p>Всегда показываем фото готовой работы и согласуем любые заметные изменения.</p></article></div>
            <div className="team-note"><div className="team-note__number">12</div><div><p className="eyebrow">Флористов и курьеров</p><h2>Одна команда, которая отвечает за результат</h2><p>От первого сообщения до вручения букета у заказа есть конкретные люди, а не безымянный конвейер.</p></div><button className="button button--light" onClick={() => openCatalog()}>Выбрать букет</button></div>
          </section>
        )}

        {view === "favorites" && (
          <section className="section-pad page-section">
            <div className="simple-page-heading"><p className="eyebrow">Сохранённое</p><h1>Избранные букеты</h1><p>{favorites.length ? `Сохранили ${favorites.length}. Выберите тот самый или вернитесь позже.` : "Здесь появятся букеты, которые вы отметите сердцем."}</p></div>
            {favorites.some((id) => products.some((product) => product.id === id && product.visible && product.stock !== "soon")) ? <div className="product-grid">{products.filter((product) => favorites.includes(product.id) && product.visible && product.stock !== "soon").map((product) => <ProductCard key={product.id} product={product} liked onLike={() => toggleFavorite(product.id)} onOpen={() => openProduct(product.id)} onAdd={() => addToCart(product.id)} />)}</div> : <div className="empty-state"><div>♡</div><h2>Пока здесь пусто</h2><p>Нажмите на сердце у букета — он сохранится на этой странице и после перезагрузки.</p><button className="button button--navy" onClick={() => openCatalog()}>Перейти в каталог</button></div>}
          </section>
        )}

        {view === "cart" && (
          <section className="section-pad page-section">
            <div className="simple-page-heading"><p className="eyebrow">Почти готово</p><h1>Корзина</h1></div>
            {!cart.length ? (
              <div className="empty-state">
                <div>♧</div>
                <h2>Здесь ждёт ваш букет</h2>
                <p>Добавьте готовый вариант из каталога или соберите собственный.</p>
                <div className="empty-actions">
                  <button className="button button--navy" onClick={() => openCatalog()}>Выбрать букет</button>
                  <button className="button button--light" onClick={startBuilder}>Собрать свой</button>
                </div>
              </div>
            ) : (
              <div className="cart-layout">
                <div className="cart-list">
                  {cart.map((line) => {
                    const product = products.find((item) => item.id === line.productId);
                    if (!product) {
                      return (
                        <article className="cart-line cart-line--unavailable" key={line.key}>
                          <div className="cart-line__placeholder">×</div>
                          <div className="cart-line__info">
                            <h3>Товар больше недоступен</h3>
                            <p>Удалите его, чтобы продолжить оформление.</p>
                            <button onClick={() => setCart((current) => current.filter((item) => item.key !== line.key))}>Удалить</button>
                          </div>
                        </article>
                      );
                    }
                    const configuration = line.builder
                      ? `${line.builder.mood} · ${line.builder.flowers.join(", ")} · ${line.builder.wrap}`
                      : [bouquetSizeLabel(line.size), productAddOnsLabel(line.addOns)].filter(Boolean).join(" · ");
                    return (
                      <article className="cart-line" key={line.key}>
                        <img src={product.image} alt={product.name} />
                        <div className="cart-line__info">
                          <h3>{product.name}</h3>
                          <p>{product.subtitle}</p>
                          <small className="cart-line__configuration">{configuration}</small>
                          <button onClick={() => setCart((current) => current.filter((item) => item.key !== line.key))}>Удалить</button>
                        </div>
                        <div className="quantity">
                          <button aria-label={`Уменьшить количество ${product.name}`} onClick={() => updateQuantity(line.key, -1)}><Icon name="minus" /></button>
                          <span>{line.quantity}</span>
                          <button aria-label={`Увеличить количество ${product.name}`} onClick={() => updateQuantity(line.key, 1)} disabled={line.quantity >= 20}><Icon name="plus" /></button>
                        </div>
                        <strong>{money(lineUnitPrice(line, product) * line.quantity)}</strong>
                      </article>
                    );
                  })}
                  <button className={`add-card ${cardAdded ? "is-active" : ""}`} aria-pressed={cardAdded} onClick={() => setCardAdded((current) => !current)}>
                    <span>{cardAdded ? "✓" : "＋"}</span>
                    <div><b>{cardAdded ? "Открытка добавлена" : "Добавить открытку"}</b><p>{cardAdded ? "Текст укажете при оформлении" : "Подпишем от руки вашим текстом"}</p></div>
                    <strong>{money(cardFee)}</strong>
                  </button>
                </div>
                <aside className="order-summary">
                  <h2>Ваш заказ</h2>
                  <div className="summary-line"><span>Товары</span><b>{money(cartSubtotal)}</b></div>
                  {cardAdded && <div className="summary-line"><span>Открытка</span><b>{money(cardFee)}</b></div>}
                  {bonus && <div className="summary-line summary-line--pink"><span>Списано бонусов</span><b>−{money(discount)}</b></div>}
                  {bonusAccount.loading ? (
                    <div className="bonus-login-note"><b>Проверяем бонусный баланс…</b></div>
                  ) : bonusAccount.balance === null ? (
                    <div className="bonus-login-note"><b>Баланс временно недоступен</b><small>Заказ можно оформить без списания бонусов.</small></div>
                  ) : bonusAccount.authenticated && !bonusAccount.available ? (
                    <div className="bonus-login-note"><b>Списание временно недоступно</b><small>Баланс сохранён, заказ можно оформить без бонусов.</small></div>
                  ) : bonusAccount.authenticated ? (
                    <label className={`bonus-toggle ${availableBonusSpend === 0 ? "is-disabled" : ""}`}>
                      <input type="checkbox" checked={bonus} disabled={availableBonusSpend === 0} onChange={(event) => setBonus(event.target.checked)} />
                      <span><b>Списать бонусы</b><small>Баланс: {bonusAccount.balance.toLocaleString("ru-RU")} · до {BONUS_SPEND_PERCENT}% покупки</small></span>
                    </label>
                  ) : (
                    <div className="bonus-login-note"><b>Бонусы доступны после входа</b><small><Link href="/login?next=/">Войти в личный кабинет</Link>, чтобы списывать и копить бонусы.</small></div>
                  )}
                  {bonusAccount.authenticated && bonusAccount.available && expectedBonusEarn > 0 && <div className="summary-line summary-line--earn"><span>Начислим {BONUS_EARN_PERCENT}% после выполнения</span><b>+{expectedBonusEarn.toLocaleString("ru-RU")} бонусов</b></div>}
                  <div className="summary-total"><span>Итого</span><strong>{money(total)}</strong></div>
                  <button className="button button--navy button--wide" onClick={() => go("checkout")} disabled={cart.some((line) => !products.some((product) => product.id === line.productId))}>Перейти к оформлению</button>
                  <p className="summary-note">{checkoutDelivery === "delivery" ? "Доставка через Яндекс рассчитывается отдельно и подтверждается до оплаты." : "Самовывоз бесплатный — сообщим, когда заказ будет готов."}</p>
                </aside>
              </div>
            )}
          </section>
        )}

        {view === "checkout" && (
          <section className="section-pad page-section checkout-page">
            <button className="back-link" onClick={() => go("cart")}>← Вернуться в корзину</button>
            <div className="simple-page-heading"><p className="eyebrow">Последний шаг</p><h1>Оформление заказа</h1></div>
            <div className="checkout-layout">
              <form className="checkout-form" onSubmit={submitOrder}>
                <fieldset>
                  <legend><span>1</span> Как получить заказ</legend>
                  <div className="delivery-switch">
                    <label className={checkoutDelivery === "delivery" ? "is-active" : ""}>
                      <input type="radio" name="delivery" checked={checkoutDelivery === "delivery"} onChange={() => setCheckoutDelivery("delivery")} />
                      <b>Доставка</b><small>через Яндекс Доставку</small>
                    </label>
                    <label className={checkoutDelivery === "pickup" ? "is-active" : ""}>
                      <input type="radio" name="delivery" checked={checkoutDelivery === "pickup"} onChange={() => setCheckoutDelivery("pickup")} />
                      <b>Самовывоз</b><small>Библиотечная, 43 · бесплатно</small>
                    </label>
                  </div>
                  <p className="checkout-choice-title">Для кого оформляем заказ?</p>
                  <div className="delivery-switch recipient-switch">
                    <label className={recipientType === "self" ? "is-active" : ""}>
                      <input type="radio" name="recipientType" checked={recipientType === "self"} onChange={() => setRecipientType("self")} />
                      <b>Для себя</b><small>Получатель — вы</small>
                    </label>
                    <label className={recipientType === "other" ? "is-active" : ""}>
                      <input type="radio" name="recipientType" checked={recipientType === "other"} onChange={() => setRecipientType("other")} />
                      <b>Другому человеку</b><small>Укажем отдельные контакты</small>
                    </label>
                  </div>
                  {checkoutDelivery === "delivery" && (
                    <div className="form-grid">
                      <label className="span-2">Адрес<input name="address" required placeholder="Улица, дом, квартира" /></label>
                      <label>Дата<select name="deliveryDate"><option value="today">Сегодня</option><option value="tomorrow">Завтра</option></select></label>
                      <label>Время<select name="deliveryTime"><option>14:30–15:30</option><option>15:30–16:30</option><option>16:30–17:30</option></select></label>
                    </div>
                  )}
                </fieldset>
                {recipientType === "other" && (
                  <fieldset>
                    <legend><span>2</span> Получатель</legend>
                    <div className="form-grid">
                      <label>Имя<input name="recipientName" required placeholder="Как обратиться" /></label>
                      <label>Телефон<input name="recipientPhone" required inputMode="tel" placeholder="+7 999 000-00-00" /></label>
                    </div>
                  </fieldset>
                )}
                <fieldset>
                  <legend><span>{recipientType === "other" ? 3 : 2}</span> Ваши контакты и открытка</legend>
                  <div className="form-grid">
                    <label>Ваше имя<input name="customerName" required placeholder="Имя" /></label>
                    <label>Ваш телефон<input name="customerPhone" required inputMode="tel" placeholder="+7 999 000-00-00" /></label>
                    {cardAdded ? (
                      <><label className="span-2">Текст для открытки<textarea name="cardText" required placeholder="Напишите несколько тёплых слов" /></label><button className="checkout-remove-card" type="button" onClick={() => setCardAdded(false)}>Убрать открытку</button></>
                    ) : (
                      <button className="checkout-add-card span-2" type="button" onClick={() => setCardAdded(true)}>＋ Добавить открытку за {money(cardFee)}</button>
                    )}
                  </div>
                </fieldset>
                <fieldset>
                  <legend><span>{recipientType === "other" ? 4 : 3}</span> Подтверждение и оплата</legend>
                  <div className="payment-note">
                    {checkoutDelivery === "delivery" ? (
                      <><b>Доставку выполняет Яндекс Доставка</b><p>Сотрудник проверит заказ и адрес, сообщит стоимость доставки и пришлёт ссылку на оплату. Сейчас деньги не списываются.</p></>
                    ) : (
                      <><b>Самовывоз: Библиотечная, 43</b><p>Сотрудник проверит заказ, пришлёт ссылку на оплату и сообщит, когда всё будет готово. В будни работаем 09:00–21:00, в выходные — 10:00–21:00.</p></>
                    )}
                  </div>
                </fieldset>
                {checkoutError && <p className="checkout-error" role="alert">{checkoutError}</p>}
                <button className="button button--navy button--wide" type="submit" disabled={checkoutSubmitting}>
                  {checkoutSubmitting ? "Сохраняем заказ…" : "Отправить заказ · " + money(total)}
                </button>
              </form>
              <aside className="checkout-summary">
                <h3>В заказе</h3>
                {cart.map((line) => {
                  const product = products.find((item) => item.id === line.productId);
                  if (!product) return null;
                  const configuration = line.builder
                    ? `${line.builder.mood} · ${line.builder.wrap}`
                    : [bouquetSizeLabel(line.size), productAddOnsLabel(line.addOns)].filter(Boolean).join(" · ");
                  return <div className="mini-line" key={line.key}><img src={product.image} alt="" /><span><b>{product.name}</b><small>{configuration}<br />{line.quantity} × {money(lineUnitPrice(line, product))}</small></span></div>;
                })}
                {cardAdded && <div className="mini-line mini-line--card"><span>✎</span><span><b>Открытка</b><small>{money(cardFee)}</small></span></div>}
                {bonus && <div className="summary-line summary-line--pink"><span>Бонусы</span><b>−{money(discount)}</b></div>}
                <div className="summary-total"><span>Предварительно</span><strong>{money(total)}</strong></div>
                <p>{checkoutDelivery === "delivery" ? "Стоимость Яндекс Доставки в предварительную сумму не входит — её подтвердит сотрудник до оплаты." : `Самовывоз бесплатный: ${STORE_ADDRESS}. Сотрудник сообщит, когда заказ можно забрать.`}</p>
              </aside>
            </div>
          </section>
        )}

        {view === "success" && <section className="success-page section-pad"><div className="success-mark"><Icon name="check" /></div><p className="eyebrow">Заказ {orderNumber || "принят"}</p><h1>Заявка уже у<br />сотрудника</h1><p>{checkoutDelivery === "delivery" ? "Сотрудник проверит состав, адрес и тариф Яндекс Доставки, затем свяжется с вами и пришлёт ссылку на оплату." : `Сотрудник проверит состав и сообщит, когда заказ будет готов к самовывозу по адресу: ${STORE_ADDRESS}.`}</p><div className="success-steps"><span className="is-active">Заказ принят</span><i /><span>Подтверждение</span><i /><span>Сборка</span></div><button className="button button--navy" onClick={() => void checkOrderStatus()}>Следить за заказом</button><button className="text-link" onClick={() => go("home")}>Вернуться на главную</button></section>}

      </main>

      {view !== "success" && <footer className="site-footer section-pad"><div className="footer-top"><div><button className="brand brand--footer" onClick={() => go("home")}>РАДУЙКА</button><p>Букеты, которые говорят за вас.</p></div><div><b>Магазин</b><button onClick={() => openCatalog()}>Каталог</button><button onClick={startBuilder}>Собрать букет</button><button onClick={() => go("occasion")}>Поводы</button></div><div><b>Покупателям</b><button onClick={() => go("delivery")}>Доставка и оплата</button><button onClick={() => go("about")}>О нас</button><Link href="/account">Личный кабинет</Link></div><div><b>Мы на связи</b><a href="tel:+78000000707">8 800 000-07-07</a><a href={YANDEX_MAP_LINK} target="_blank" rel="noreferrer">{STORE_ADDRESS}</a><span>Пн–Пт: 09:00–21:00</span><span>Сб–Вс: 10:00–21:00</span></div></div><div className="footer-bottom"><span>© 2026 Радуйка</span><button onClick={() => setPrivacyOpen(true)}>Политика конфиденциальности</button><span>Визуальный прототип магазина</span></div></footer>}

      {searchOpen && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Поиск" onMouseDown={(event) => { if (event.target === event.currentTarget) setSearchOpen(false); }}>
          <button className="overlay-close" onClick={() => setSearchOpen(false)} aria-label="Закрыть"><Icon name="close" /></button>
          <div className="search-modal">
            <p className="eyebrow">Найти тот самый букет</p>
            <label><Icon name="search" /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Название или цветы" /></label>
            <div className="search-results">
              {!normalizedSearch && <p className="search-empty">Начните вводить название букета или цветы в составе.</p>}
              {normalizedSearch && !searchResults.length && <p className="search-empty">Ничего не нашли. Попробуйте другое название.</p>}
              {searchResults.slice(0, 6).map((product) => <button key={product.id} onClick={() => openProduct(product.id)}><img src={product.image} alt="" /><span><b>{product.name}</b><small>{product.subtitle}</small></span><strong>{money(product.price)}</strong></button>)}
            </div>
          </div>
        </div>
      )}

      {giftOpen && <div className="overlay" role="dialog" aria-modal="true" aria-label="Подбор подарка" onMouseDown={(event) => { if (event.target === event.currentTarget) setGiftOpen(false); }}><button className="overlay-close" onClick={() => setGiftOpen(false)} aria-label="Закрыть"><Icon name="close" /></button><div className="gift-modal"><div className="gift-modal__badge"><Icon name="gift" /></div><p className="eyebrow">Быстрый подбор</p><h2>Кого будем радовать?</h2><div className="gift-options">{["Любимого человека", "Маму", "Подругу", "Коллегу", "Себя — заслуженно"].map((item, index) => <button key={item} onClick={() => { setGiftOpen(false); openCatalog(index < 3 ? "Нежные" : index === 3 ? "До 4 000 ₽" : "Все"); }}>{item}<Icon name="arrow" /></button>)}</div></div></div>}

      {privacyOpen && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="privacy-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setPrivacyOpen(false); }}>
          <button className="overlay-close" onClick={() => setPrivacyOpen(false)} aria-label="Закрыть"><Icon name="close" /></button>
          <section className="dialog-modal policy-modal">
            <p className="eyebrow">Ваши данные</p>
            <h2 id="privacy-title">Политика конфиденциальности</h2>
            <div className="policy-copy">
              <p>Для оформления заказа магазин получает имя, телефон, адрес доставки и текст открытки. Эти данные нужны только для связи, сборки и доставки заказа.</p>
              <p>Избранное сохраняется локально в браузере. Важные даты зарегистрированных покупателей хранятся в Supabase и защищены правилами доступа.</p>
              <p>Это демонстрационная версия магазина. Перед публичным запуском политика должна быть дополнена реквизитами оператора и сроками хранения данных.</p>
            </div>
            <button className="button button--navy" type="button" onClick={() => setPrivacyOpen(false)}>Понятно</button>
          </section>
        </div>
      )}

      {orderStatusOpen && latestOrder && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="status-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setOrderStatusOpen(false); }}>
          <button className="overlay-close" onClick={() => setOrderStatusOpen(false)} aria-label="Закрыть"><Icon name="close" /></button>
          <section className="dialog-modal order-status-modal">
            <p className="eyebrow">Заказ {latestOrder.orderNumber}</p>
            <h2 id="status-title">{orderStatusLabels[latestOrder.status]}</h2>
            <div className="order-status-card"><span>Оплата</span><b>{paymentStatusLabels[latestOrder.paymentStatus]}</b><span>Сумма</span><b>{money(latestOrder.total)}</b>{latestOrder.updatedAt && <><span>Обновлено</span><b>{new Date(latestOrder.updatedAt).toLocaleString("ru-RU")}</b></>}</div>
            <button className="button button--navy" type="button" onClick={() => void checkOrderStatus()} disabled={orderStatusLoading || !latestOrder.customerPhone}>{orderStatusLoading ? "Обновляем…" : latestOrder.customerPhone ? "Обновить статус" : "Статус сохранён"}</button>
          </section>
        </div>
      )}

      {toast && <div className="toast"><Icon name="check" />{toast}</div>}
    </div>
  );
}
