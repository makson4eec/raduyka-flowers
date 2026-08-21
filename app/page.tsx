
"use client";

import Link from "next/link";
import Image, { type ImageProps } from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import bouquetCategoryImage from "../public/images/bouquet-3.webp";
import deliveryCategoryImage from "../public/images/bouquet-4.webp";
import flowersCategoryImage from "../public/images/bouquet-6.webp";
import compositionCategoryImage from "../public/images/composition-roses.webp";
import heroBouquetImage from "../public/images/hero-bouquet.webp";
import { defaultProducts } from "../lib/catalog";
import { optimizedImageSource } from "../lib/image-assets";
import { LEGAL_DOCUMENT_VERSION, sellerDetails } from "../lib/legal";
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
import {
  findProductVariant,
  getProductVariants,
  getVariantImage,
  getVariantOldPrice,
  getVariantPrice,
} from "../lib/product-variants";
import type {
  BouquetSize,
  BuilderSelection,
  OrderStatus,
  PaymentStatus,
  Product,
  ProductAddOn,
  ProductVariant,
  RecipientType,
} from "../lib/types";

type ProductImageProps = Omit<ImageProps, "src" | "unoptimized"> & {
  src: string;
};

function ProductImage({ src, alt, onError, style, ...props }: ProductImageProps) {
  const preferredSrc = optimizedImageSource(src);
  const [failure, setFailure] = useState({ source: src, attempts: 0 });
  const attempts = failure.source === src ? failure.attempts : 0;
  const hasOriginalFallback = preferredSrc !== src;
  const exhausted = attempts >= (hasOriginalFallback ? 3 : 2);
  const resolvedSrc = hasOriginalFallback && attempts >= 2 ? src : preferredSrc;

  return (
    <Image
      {...props}
      src={resolvedSrc}
      alt={alt}
      unoptimized={attempts >= 1}
      style={exhausted ? { ...style, visibility: "hidden" } : style}
      onError={exhausted ? onError : (event) => {
        onError?.(event);
        setFailure((current) => ({
          source: src,
          attempts: current.source === src ? current.attempts + 1 : 1,
        }));
      }}
    />
  );
}

type View =
  | "home"
  | "catalog"
  | "flowers"
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
  variantId?: string;
};

type CatalogFilter = "Все" | "Цветы" | "До 4 000 ₽" | "Нежные" | "Шары" | "Композиции";
type LatestOrder = {
  orderNumber: string;
  total: number;
  customerPhone?: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentUrl?: string | null;
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
  variantId?: string;
};

const money = (value: number) =>
  new Intl.NumberFormat("ru-RU").format(value) + " ₽";

const STORE_ADDRESS = "Екатеринбург, ул. Библиотечная, 43";
const YANDEX_MAP_EMBED_URL = "https://yandex.ru/map-widget/v1/?ll=60.659323%2C56.833035&mode=search&oid=200831341309&ol=biz&z=17";
const YANDEX_MAP_LINK = "https://yandex.ru/maps/-/CTSgV45D";
const PRODUCTION_ASSET_ORIGIN = "https://raduyka-flowers.vercel.app";
const LATEST_ORDER_STORAGE_KEY = "raduyka-latest-order-v2";
const LATEST_ORDER_TTL_MS = 24 * 60 * 60_000;
const ORDER_NUMBER_PATTERN = /^RAD-\d{6}-(?:\d{4}|[0-9A-F]{12})$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  pending: "Ссылка на оплату ещё не выставлена",
  invoice_sent: "Ссылка на оплату отправлена",
  paid: "Оплачено",
  refunded: "Возврат оформлен",
};

const orderStatuses = Object.keys(orderStatusLabels) as OrderStatus[];
const paymentStatuses = Object.keys(paymentStatusLabels) as PaymentStatus[];

const isHttpsUrl = (value: string | null | undefined): value is string => {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

const publicProductTag = (tag: string | undefined) =>
  tag && !/налич|остат|поступ|скоро/i.test(tag) ? tag : undefined;

const isBalloonProduct = (product: Pick<Product, "name" | "subtitle">) =>
  /(?:^|[^а-яё])шар(?:ы|ов|а|ами)?(?:$|[^а-яё])/iu.test(`${product.name} ${product.subtitle}`);

const isCompositionProduct = (product: Pick<Product, "name" | "subtitle" | "catalogCategory">) =>
  product.catalogCategory === "composition"
  || /композиц|корзин|ящик/iu.test(`${product.name} ${product.subtitle}`);

const productDisplayName = (product: Product, variant?: Pick<ProductVariant, "label">) =>
  variant?.label ? `${product.name} · ${variant.label}` : product.name;


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
  const coverVariant = findProductVariant(product);
  const coverPrice = product.kind === "flower" ? getVariantPrice(product, coverVariant) : product.price;
  const rawCoverOldPrice = product.kind === "flower" ? getVariantOldPrice(product, coverVariant) : product.oldPrice;
  const coverOldPrice = rawCoverOldPrice && rawCoverOldPrice > coverPrice ? rawCoverOldPrice : undefined;
  const needsVariantChoice = product.kind === "flower" && getProductVariants(product).length > 0;
  return (
    <article className="product-card">
      <button className="product-card__image" onClick={onOpen} aria-label={`Открыть ${product.name}`}>
        <ProductImage
          src={getVariantImage(product, coverVariant)}
          alt={product.name}
          fill
          sizes="(max-width: 680px) 100vw, (max-width: 1050px) 50vw, 25vw"
        />
        {publicProductTag(product.tag) && <span className="product-tag">{publicProductTag(product.tag)}</span>}
      </button>
      <button className={`heart-button ${liked ? "is-liked" : ""}`} onClick={onLike} aria-label={liked ? "Убрать из избранного" : "Добавить в избранное"}>
        <Icon name="heart" />
      </button>
      <div className="product-card__body">
        <button className="product-title-button" onClick={onOpen}>{product.name}</button>
        <p>{product.subtitle}</p>
        <div className="product-card__bottom">
          <div><strong>{money(coverPrice)}</strong>{coverOldPrice && <s>{money(coverOldPrice)}</s>}{product.kind === "flower" && <small className="product-unit-label">за 1 шт.</small>}</div>
          <button
            className="round-add"
            onClick={needsVariantChoice ? onOpen : onAdd}
            aria-label={needsVariantChoice ? `Выбрать цвет ${product.name}` : `Добавить ${product.name} в корзину`}
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
  const [orderStatusOpen, setOrderStatusOpen] = useState(false);
  const [orderStatusLoading, setOrderStatusLoading] = useState(false);
  const [returnedOrderLookup, setReturnedOrderLookup] = useState<string | null>(null);
  const [returnedOrderPhone, setReturnedOrderPhone] = useState("");
  const [returnedOrderError, setReturnedOrderError] = useState("");
  const [toast, setToast] = useState("");
  const [galleryImage, setGalleryImage] = useState("");
  const [selectedSize, setSelectedSize] = useState<BouquetSize>("medium");
  const [selectedProductAddOns, setSelectedProductAddOns] = useState<ProductAddOn[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState("");
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
  const [customerEmail, setCustomerEmail] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [latestOrder, setLatestOrder] = useState<LatestOrder | null>(null);
  const checkoutAttemptIdRef = useRef<string | null>(null);
  const latestOrderExpiresAtRef = useRef<number | null>(null);
  const returnedOrderHandledRef = useRef(false);
  const bonusRequestedRef = useRef(false);
  const [storageReady, setStorageReady] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    let refreshInFlight = false;

    const refreshProducts = async () => {
      if (refreshInFlight) return;
      refreshInFlight = true;
      try {
        const productsApiUrl = ["raduika.ru", "www.raduika.ru"].includes(window.location.hostname)
          ? `${PRODUCTION_ASSET_ORIGIN}/api/products`
          : "/api/products";
        const response = await fetch(productsApiUrl);
        if (!response.ok) throw new Error("Каталог временно недоступен");
        const payload = await response.json() as { products?: Product[] };
        if (active && Array.isArray(payload.products)) setProducts(payload.products);
      } catch {
        // Статический каталог остаётся безопасным резервом при временном сбое сети.
      } finally {
        refreshInFlight = false;
      }
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshProducts();
    };

    void refreshProducts();
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      active = false;
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  useEffect(() => {
    if ((view !== "cart" && view !== "checkout") || bonusRequestedRef.current) return;
    bonusRequestedRef.current = true;

    fetch("/api/bonus", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        const payload = await response.json() as { authenticated?: boolean; available?: boolean; balance?: number; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Баланс временно недоступен");
        return payload;
      })
      .then((payload) => {
        const authenticated = payload.authenticated === true;
        const available = payload.available === true;
        const balance = authenticated && typeof payload.balance === "number" && Number.isFinite(payload.balance)
          ? Math.max(0, Math.trunc(payload.balance))
          : authenticated ? null : 0;
        setBonusAccount({ authenticated, available, balance, loading: false });
        if (!authenticated || !available || balance === 0) setBonus(false);
      })
      .catch(() => {
        setBonusAccount({ authenticated: false, available: false, balance: null, loading: false });
      });
  }, [view]);

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
              paymentUrl: typeof candidate.paymentUrl === "string" ? candidate.paymentUrl : undefined,
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
    if (!searchOpen && !giftOpen && !orderStatusOpen && !mobileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSearchOpen(false);
      setGiftOpen(false);
      setOrderStatusOpen(false);
      setMobileOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [giftOpen, mobileOpen, orderStatusOpen, searchOpen]);

  const go = (next: View) => {
    setView(next);
    setMobileOpen(false);
    setSearchOpen(false);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }, []);

  const openSearch = () => {
    setMobileOpen(false);
    setSearchOpen(true);
  };

  const lineUnitPrice = (line: CartLine, product: Product) => {
    const variant = findProductVariant(product, line.variantId);
    return line.builder?.budget
      ?? (product.kind === "catalog"
        ? Math.max(
          0,
          product.price
            + bouquetSizePriceAdjustment(line.size, product.size)
            + productAddOnsPrice(line.addOns),
        )
        : getVariantPrice(product, variant));
  };

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
    const variant = product.kind === "flower"
      ? findProductVariant(product, configuration.variantId)
      : undefined;
    const key = JSON.stringify({
      productId: product.id,
      size,
      addOns: [...(addOns ?? [])].sort(),
      builder: builder
        ? { ...builder, flowers: [...builder.flowers].sort() }
        : undefined,
      variantId: variant?.id,
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
          variantId: variant?.id,
        }];
    });
    notify(product.kind === "flower" ? "Цветок добавлен в корзину" : "Букет добавлен в корзину");
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
    const variant = findProductVariant(product);
    setSelectedId(id);
    setSelectedVariantId(variant?.id ?? "");
    setGalleryImage(getVariantImage(product, variant));
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

  const checkOrderStatus = useCallback(async () => {
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
  }, [latestOrder, notify]);

  const submitReturnedOrderLookup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!returnedOrderLookup) return;

    const customerPhone = returnedOrderPhone.trim();
    setOrderStatusLoading(true);
    setReturnedOrderError("");
    try {
      const response = await fetch("/api/orders/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderNumber: returnedOrderLookup,
          customerPhone,
        }),
      });
      const payload = await response.json() as {
        order?: LatestOrder;
        error?: string;
      };
      if (!response.ok || !payload.order) {
        throw new Error(payload.error ?? "Не удалось найти заказ.");
      }

      latestOrderExpiresAtRef.current = Date.now() + LATEST_ORDER_TTL_MS;
      setLatestOrder({ ...payload.order, customerPhone });
      setReturnedOrderLookup(null);
      setReturnedOrderPhone("");
    } catch (error) {
      setReturnedOrderError(error instanceof Error ? error.message : "Не удалось найти заказ.");
    } finally {
      setOrderStatusLoading(false);
    }
  };

  useEffect(() => {
    if (!storageReady || returnedOrderHandledRef.current) return;

    const url = new URL(window.location.href);
    const returnedOrderNumber = url.searchParams.get("order")?.trim().toUpperCase() ?? "";
    returnedOrderHandledRef.current = true;

    if (!returnedOrderNumber) return;

    url.searchParams.delete("order");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );

    if (!ORDER_NUMBER_PATTERN.test(returnedOrderNumber)) return;

    if (latestOrder?.orderNumber === returnedOrderNumber && latestOrder.customerPhone) {
      const timer = window.setTimeout(() => void checkOrderStatus(), 0);
      return () => window.clearTimeout(timer);
    }

    const timer = window.setTimeout(() => {
      setReturnedOrderLookup(returnedOrderNumber);
      setReturnedOrderPhone("");
      setReturnedOrderError("");
      setOrderStatusOpen(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [checkOrderStatus, latestOrder?.customerPhone, latestOrder?.orderNumber, storageReady]);

  const submitOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (cart.some((line) => !products.some((product) => product.id === line.productId))) {
      setCheckoutError("Удалите недоступный товар из корзины и попробуйте снова.");
      go("cart");
      return;
    }
    const normalizedCustomerEmail = customerEmail.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalizedCustomerEmail)) {
      setCheckoutError("Укажите корректный email для электронного чека.");
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
          customerEmail: normalizedCustomerEmail,
          address: String(form.get("address") ?? ""),
          deliveryDate: String(form.get("deliveryDate") ?? ""),
          deliveryTime: String(form.get("deliveryTime") ?? ""),
          cardText: String(form.get("cardText") ?? ""),
          useBonus: bonus,
          cardAdded,
          offerAccepted: form.get("offerAccepted") === "on",
          offerVersion: LEGAL_DOCUMENT_VERSION,
          items: cart.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            size: line.size,
            addOns: line.addOns,
            builder: line.builder,
            variantId: line.variantId,
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
      setCustomerEmail("");
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
  const selectedProductIsFlower = selectedProduct.kind === "flower";
  const selectedVariant = findProductVariant(selectedProduct, selectedVariantId);
  const selectedProductVariants = selectedProductIsFlower
    ? getProductVariants(selectedProduct)
    : [];
  const displayedGalleryImage = selectedProductIsFlower
    ? (
      selectedProductVariants.some((variant) => variant.image === galleryImage)
        ? galleryImage
        : getVariantImage(selectedProduct, selectedVariant)
    )
    : (
      galleryImage || getVariantImage(selectedProduct, selectedVariant)
    );
  const selectedProductPrice = selectedProductIsFlower
    ? getVariantPrice(selectedProduct, selectedVariant)
    : Math.max(
      0,
      selectedProduct.price
        + (selectedProductIsBalloons ? 0 : bouquetSizePriceAdjustment(selectedSize, selectedProduct.size))
        + productAddOnsPrice(selectedProductAddOns),
    );
  const rawSelectedProductOldPrice = selectedProductIsFlower
    ? getVariantOldPrice(selectedProduct, selectedVariant)
    : selectedProduct.oldPrice;
  const selectedProductOldPrice = rawSelectedProductOldPrice && rawSelectedProductOldPrice > selectedProductPrice
    ? rawSelectedProductOldPrice
    : undefined;
  const builderProduct = products.find((item) => item.kind === "builder");

  const catalogProducts = useMemo(() => {
    let result = products.filter((item) => (
      catalogFilter === "Цветы" ? item.kind === "flower" : item.kind === "catalog"
    ) && item.stock !== "soon");
    if (catalogFilter === "До 4 000 ₽") result = result.filter((item) => item.price <= 4000);
    if (catalogFilter === "Нежные") result = result.filter((item) => item.palette === "pink" || item.palette === "white");
    if (catalogFilter === "Шары") result = result.filter(isBalloonProduct);
    if (catalogFilter === "Композиции") result = result.filter(isCompositionProduct);
    if (sort === "Популярные") result = [...result].sort((a, b) => Number(b.featured) - Number(a.featured) || a.sortOrder - b.sortOrder);
    if (sort === "Сначала дешевле") result = [...result].sort((a, b) => a.price - b.price);
    if (sort === "Сначала дороже") result = [...result].sort((a, b) => b.price - a.price);
    return result;
  }, [catalogFilter, products, sort]);

  const flowerProducts = useMemo(
    () => products
      .filter((product) => product.kind === "flower" && product.stock !== "soon")
      .sort((a, b) => Number(b.featured) - Number(a.featured) || a.sortOrder - b.sortOrder),
    [products],
  );

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
    ? products.filter((item) => item.kind !== "builder" && item.stock !== "soon" && `${item.name} ${item.subtitle}`.toLowerCase().includes(normalizedSearch))
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
                <p className="eyebrow">Цветы для важных моментов</p>
                <h1>Букеты, которые<br />говорят за вас</h1>
                <p className="hero__lead">Соберём авторский букет и согласуем доступные условия и время доставки до оплаты.</p>
                <div className="hero__actions">
                  <button className="button button--navy" onClick={() => openCatalog()}>Выбрать букет</button>
                  <button className="button button--light" onClick={startBuilder}>Собрать свой</button>
                </div>
                <div className="hero__facts"><span>Подтверждаем состав заказа</span><span>Доставка по согласованию</span></div>
              </div>
              <div className="hero__image"><Image src={heroBouquetImage} alt="Яркий авторский букет Радуйки" fill sizes="(max-width: 900px) 100vw, 50vw" placeholder="blur" preload /></div>
            </section>

            <section className="category-grid section-pad" aria-label="Категории">
              <button onClick={() => openCatalog()} className="category category--cream"><span>Букеты</span><Icon name="arrow" /><Image src={bouquetCategoryImage} alt="" sizes="(max-width: 680px) 56vw, (max-width: 1050px) 28vw, 12vw" quality={70} placeholder="blur" /></button>
              <button onClick={() => go("flowers")} className="category category--blush"><span>Цветы</span><Icon name="arrow" /><Image src={flowersCategoryImage} alt="" sizes="(max-width: 680px) 56vw, (max-width: 1050px) 28vw, 12vw" quality={70} placeholder="blur" /></button>
              <button onClick={() => go("delivery")} className="category category--cream"><span>Доставка<br />по городу</span><Icon name="arrow" /><Image src={deliveryCategoryImage} alt="" sizes="(max-width: 680px) 56vw, (max-width: 1050px) 28vw, 12vw" quality={70} placeholder="blur" /></button>
              <button onClick={() => openCatalog("Композиции")} className="category category--blush"><span>Цветочные<br />композиции</span><Icon name="arrow" /><Image src={compositionCategoryImage} alt="" sizes="(max-width: 680px) 56vw, (max-width: 1050px) 28vw, 12vw" quality={70} placeholder="blur" /></button>
              <button onClick={() => openCatalog("Шары")} className="category category--cream category--balloons"><span>Воздушные<br />шары</span><Icon name="arrow" /><Image src="/images/balloons.svg" alt="" width={800} height={800} sizes="(max-width: 680px) 56vw, (max-width: 1050px) 28vw, 12vw" /></button>
            </section>

            <section className="promise-strip section-pad">
              <div><span className="promise-icon promise-icon--lime">↝</span><b>Доставка по согласованию</b><p>Стоимость и доступное время подтверждаем до оплаты</p></div>
              <div><span className="promise-icon promise-icon--pink">☆</span><b>Бонусная программа</b><p>Условия начисления и списания опубликованы на сайте</p></div>
              <div><span className="promise-icon promise-icon--cream">✓</span><b>Согласуем заметные изменения</b><p>Живые цветы могут отличаться оттенком и степенью раскрытия</p></div>
            </section>

            <section className="section-pad section-block">
              <div className="section-heading"><div><p className="eyebrow">Выбирают чаще всего</p><h2>Популярные букеты</h2></div><button className="link-arrow" onClick={() => openCatalog()}>Смотреть все <Icon name="arrow" /></button></div>
              <div className="product-grid product-grid--home">
                {featuredProducts.map((product) => <ProductCard key={product.id} product={product} liked={favorites.includes(product.id)} onLike={() => toggleFavorite(product.id)} onOpen={() => openProduct(product.id)} onAdd={() => addToCart(product.id)} />)}
              </div>
            </section>

            <section className="builder-banner section-pad">
              <div className="builder-banner__image"><Image src="/images/florist-workshop.webp" alt="Флорист собирает букет" width={1271} height={1237} sizes="(max-width: 900px) 100vw, 55vw" /></div>
              <div className="builder-banner__copy"><p className="eyebrow">Букет с вашим характером</p><h2>Соберите свой<br />за четыре шага</h2><p>Выберите настроение, бюджет и упаковку. Флорист подберёт доступные цветы и согласует существенные изменения состава.</p><button className="button button--navy" onClick={startBuilder}>Начать сборку</button></div>
            </section>

            <section className="occasions section-pad section-block">
              <div className="section-heading"><div><p className="eyebrow">Не нужно долго выбирать</p><h2>Букет найдётся для любого повода</h2></div></div>
              <div className="occasion-row">
                {["День рождения", "Без повода", "Свидание", "Спасибо", "Важный день"].map((item, index) => <button key={item} onClick={() => openCatalog(item === "Свидание" ? "Нежные" : item === "Спасибо" ? "До 4 000 ₽" : "Все")}><span>{String(index + 1).padStart(2, "0")}</span>{item}<Icon name="arrow" /></button>)}
              </div>
            </section>

            <section className="reviews section-pad section-block">
              <div className="section-heading"><div><p className="eyebrow">Понятный заказ без сюрпризов</p><h2>Как мы согласуем детали</h2></div></div>
              <div className="review-grid">
                <article><p>Перед оплатой подтверждаем доступность выбранных позиций и итоговые условия заказа.</p><footer><b>Состав</b><span>до оплаты</span></footer></article>
                <article><p>Если живые цветы заметно отличаются или нужна существенная замена, согласуем её с покупателем.</p><footer><b>Замены</b><span>по согласованию</span></footer></article>
                <article><p>Стоимость доставки, если она рассчитывается отдельно, сообщаем до направления ссылки на оплату.</p><footer><b>Доставка</b><span>прозрачная стоимость</span></footer></article>
              </div>
            </section>
          </>
        )}

        {view === "flowers" && (
          <section className="section-pad page-section flowers-page">
            <div className="page-hero page-hero--pink page-hero--media flowers-hero">
              <div className="page-hero__photo"><Image src="/images/flowers-lilies.webp" alt="Белые лилии" fill sizes="(max-width: 900px) 100vw, 50vw" /></div>
              <div className="page-hero__content">
                <p className="eyebrow">Цветы Радуйки</p>
                <h1>Цветы поштучно</h1>
                <p>Выберите нужный сорт, откройте карточку, посмотрите описание и рекомендации по уходу. Цена указана за одну ветку или один цветок.</p>
              </div>
              <div className="flowers-hero__note">
                <strong>{flowerProducts.length}</strong>
                <span>позиций сейчас</span>
                <small>Фотографии и наличие можно менять из админ-панели.</small>
              </div>
            </div>

            <div className="flowers-intro">
              <div>
                <p className="eyebrow">Соберите свой набор</p>
                <h2>Добавляйте цветы прямо в корзину</h2>
              </div>
              <p>Количество каждого цветка можно изменить уже в корзине. Если нужной позиции нет в наличии, сотрудник может временно скрыть её через админку.</p>
            </div>

            {flowerProducts.length ? (
              <div className="product-grid flower-product-grid">
                {flowerProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    liked={favorites.includes(product.id)}
                    onLike={() => toggleFavorite(product.id)}
                    onOpen={() => openProduct(product.id)}
                    onAdd={() => addToCart(product.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div>✿</div>
                <h2>Цветы пока наполняются</h2>
                <p>После запуска SQL-файла и добавления фотографий позиции появятся здесь автоматически.</p>
              </div>
            )}
          </section>
        )}

        {view === "catalog" && (
          <section className="section-pad page-section">
            <div className="page-hero page-hero--lime page-hero--media"><div className="page-hero__photo"><Image src="/images/hero-bouquet.webp" alt="Нежный букет роз" fill sizes="(max-width: 900px) 100vw, 50vw" /></div><div className="page-hero__content"><p className="eyebrow">Собраны флористами</p><h1>Каталог</h1><p>Букеты, композиции и дополнения для тёплых поводов и приятных сюрпризов.</p></div></div>
            <div className="catalog-toolbar">
              <div className="filter-chips">{(["Все", "Цветы", "До 4 000 ₽", "Нежные", "Композиции", "Шары"] as CatalogFilter[]).map((item) => <button key={item} className={catalogFilter === item ? "is-active" : ""} onClick={() => setCatalogFilter(item)}>{item}</button>)}</div>
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
              <div className="product-detail__gallery">
                <div className="product-detail__main">
                  <ProductImage src={displayedGalleryImage} alt={`${selectedProduct.name}${selectedVariant?.label ? `, ${selectedVariant.label}` : ""}`} fill sizes="(max-width: 900px) 100vw, 55vw" />
                  {publicProductTag(selectedProduct.tag) && <span className="product-tag">{publicProductTag(selectedProduct.tag)}</span>}
                </div>
                <div className="thumb-row">
                  {selectedProductIsFlower && getProductVariants(selectedProduct).length > 0
                    ? getProductVariants(selectedProduct).map((variant) => (
                      <button
                        key={variant.id}
                        className={selectedVariant?.id === variant.id ? "is-active" : ""}
                        aria-label={`Показать вариант ${variant.label}`}
                        aria-pressed={selectedVariant?.id === variant.id}
                        onClick={() => {
                          setSelectedVariantId(variant.id);
                          setGalleryImage(variant.image);
                        }}
                      >
                        <ProductImage src={variant.image} alt={`${selectedProduct.name}, ${variant.label}`} width={92} height={92} sizes="92px" />
                      </button>
                    ))
                    : (
                      <button
                        className={!galleryImage || galleryImage === selectedProduct.image ? "is-active" : ""}
                        aria-label="Показать товар"
                        aria-pressed={!galleryImage || galleryImage === selectedProduct.image}
                        onClick={() => setGalleryImage(selectedProduct.image)}
                      >
                        <ProductImage src={selectedProduct.image} alt="Вид товара" width={92} height={92} sizes="92px" />
                      </button>
                    )}
                  {!selectedProductIsBalloons && !selectedProductIsFlower && <button className={galleryImage === "/images/florist-workshop.webp" ? "is-active" : ""} aria-label="Показать процесс сборки" aria-pressed={galleryImage === "/images/florist-workshop.webp"} onClick={() => setGalleryImage("/images/florist-workshop.webp")}><Image src="/images/florist-workshop.webp" alt="Сборка флористом" width={92} height={92} sizes="92px" /></button>}
                  <button className="photo-note" onClick={() => notify("Фото готового заказа пришлём перед доставкой")}>Фото<br />перед<br />доставкой</button>
                </div>
              </div>
              <div className="product-detail__info">
                <h1>{selectedProduct.name}</h1><p className="product-subtitle">{selectedProduct.subtitle}</p>
                <div className="detail-price"><strong>{money(selectedProductPrice)}</strong>{selectedProductOldPrice && selectedProductPrice === (selectedVariant?.price ?? selectedProduct.price) && <s>{money(selectedProductOldPrice)}</s>}</div>
                {selectedProductIsFlower && <p className="flower-unit-note">Цена за 1 ветку / цветок</p>}
                {selectedProductIsFlower && getProductVariants(selectedProduct).length > 0 && (
                  <div className="detail-group">
                    <b>Выберите цвет</b>
                    <div className="variant-options">
                      {getProductVariants(selectedProduct).map((variant) => {
                        const variantPrice = getVariantPrice(selectedProduct, variant);
                        return (
                          <button
                            key={variant.id}
                            className={`variant-option ${selectedVariant?.id === variant.id ? "is-active" : ""}`}
                            aria-pressed={selectedVariant?.id === variant.id}
                            onClick={() => {
                              setSelectedVariantId(variant.id);
                              setGalleryImage(variant.image);
                            }}
                          >
                            <ProductImage src={variant.image} alt="" width={76} height={76} sizes="76px" />
                            <span><b>{variant.label}</b><small>{money(variantPrice)}</small></span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {!selectedProductIsBalloons && !selectedProductIsFlower && <div className="detail-group"><b>{selectedProductIsComposition ? "Размер композиции" : "Размер букета"}</b><div className="size-options">{bouquetSizeOptions.map((option) => <button key={option.id} className={selectedSize === option.id ? "is-active" : ""} aria-pressed={selectedSize === option.id} onClick={() => setSelectedSize(option.id)}>{option.label}</button>)}</div></div>}
                {!selectedProductIsFlower && <div className="detail-group"><b>Добавить к заказу</b><div className="add-on-row"><button className={cardAdded ? "is-active" : ""} aria-pressed={cardAdded} onClick={() => setCardAdded((current) => !current)}>Открытка <span>+{money(cardFee)}</span></button>{productAddOnOptions.filter((option) => !selectedProductIsBalloons || option.id === "sweet").map((option) => <button key={option.id} className={selectedProductAddOns.includes(option.id) ? "is-active" : ""} aria-pressed={selectedProductAddOns.includes(option.id)} onClick={() => toggleProductAddOn(option.id)}>{option.label} <span>+{money(option.price)}</span></button>)}</div></div>}
                <div className="delivery-inline"><span>Яндекс Доставка</span><b>Привезём по указанному адресу</b><small>Стоимость рассчитает сервис после проверки адреса</small></div>
                <div className="detail-actions"><button className="button button--navy" onClick={() => addToCart(selectedProduct.id, selectedProductIsFlower ? { variantId: selectedVariant?.id } : { size: selectedSize, addOns: selectedProductAddOns })}>Добавить в корзину</button><button className={`favorite-large ${favorites.includes(selectedProduct.id) ? "is-liked" : ""}`} aria-label={favorites.includes(selectedProduct.id) ? "Убрать из избранного" : "Добавить в избранное"} aria-pressed={favorites.includes(selectedProduct.id)} onClick={() => toggleFavorite(selectedProduct.id)}><Icon name="heart" /></button></div>
                <details className="product-legal-info">
                  <summary>Информация о товаре</summary>
                  <div className="product-legal-info__grid">
                    {selectedProduct.speciesInfo && <p><b>Видовое название / состав:</b><span>{selectedProduct.speciesInfo}</span></p>}
                    {selectedProduct.manufacturer && <p><b>Изготовитель:</b><span>{selectedProduct.manufacturer}</span></p>}
                    {selectedProduct.manufacturerAddress && <p><b>Адрес изготовителя:</b><span>{selectedProduct.manufacturerAddress}</span></p>}
                    {selectedProduct.manufacturingPlace && <p><b>Место изготовления:</b><span>{selectedProduct.manufacturingPlace}</span></p>}
                    {selectedProduct.importerInfo && <p><b>Импортёр:</b><span>{selectedProduct.importerInfo}</span></p>}
                    {selectedProduct.shelfLife && <p><b>Срок годности / службы:</b><span>{selectedProduct.shelfLife}</span></p>}
                    {selectedProduct.warrantyInfo && <p><b>Гарантийный срок:</b><span>{selectedProduct.warrantyInfo}</span></p>}
                    {selectedProduct.safeUse && <p><b>Безопасное использование:</b><span>{selectedProduct.safeUse}</span></p>}
                    {(selectedProduct.conformityInfo || selectedProduct.conformityUrl) && <p><b>Подтверждение соответствия:</b><span>{selectedProduct.conformityInfo}{selectedProduct.conformityInfo && selectedProduct.conformityUrl ? " · " : ""}{selectedProduct.conformityUrl && <a href={selectedProduct.conformityUrl} target="_blank" rel="noopener noreferrer">запись в реестре ↗</a>}</span></p>}
                    <p><b>Продавец:</b><span>Реквизиты и контакты указаны на странице <Link href="/legal/seller" target="_blank" rel="noopener noreferrer">«Сведения о продавце»</Link>.</span></p>
                  </div>
                </details>
                {selectedProductIsFlower ? (
                  <>
                    <details open><summary>Описание</summary><p>{selectedProduct.subtitle}</p></details>
                    <details open><summary>Как ухаживать</summary><p className="care-text">{selectedProduct.care || "Подрежьте стебель, поставьте цветок в чистую прохладную воду и регулярно меняйте её."}</p></details>
                    <details><summary>Важно</summary><p>Цвет, размер и степень раскрытия живого цветка могут немного отличаться от фотографии. Актуальное наличие сотрудник поддерживает через админ-панель.</p></details>
                  </>
                ) : (
                  <>
                    <details open><summary>{selectedProductIsBalloons ? "О наборе" : "Состав и уход"}</summary><p>{selectedProductIsBalloons ? `${selectedProduct.subtitle}. Шары надуты гелием и подготовлены к вручению.` : `${selectedProduct.subtitle}. Подрежьте стебли под углом, поставьте в прохладную воду и меняйте её каждый день.`}</p></details>
                    <details><summary>{selectedProductIsBalloons ? "Важно о доставке" : "Важно о внешнем виде"}</summary><p>{selectedProductIsBalloons ? "Перевозим шары аккуратно и передаём получателю в собранном виде." : "Работаем с живыми цветами, поэтому оттенок и раскрытие бутонов могут немного отличаться. Общий характер букета сохраним."}</p></details>
                  </>
                )}
              </div>
            </div>
            <div className="section-heading related-heading"><h2>Может понравиться</h2></div>
            <div className="product-grid product-grid--home">{products.filter((product) => product.kind === (selectedProductIsFlower ? "flower" : "catalog") && product.stock !== "soon" && product.id !== selectedProduct.id).slice(0, 4).map((product) => <ProductCard key={product.id} product={product} liked={favorites.includes(product.id)} onLike={() => toggleFavorite(product.id)} onOpen={() => openProduct(product.id)} onAdd={() => addToCart(product.id)} />)}</div>
          </section>
        )}

        {view === "builder" && (
          <section className="section-pad page-section builder-page">
            <div className="page-hero page-hero--pink page-hero--media"><div className="page-hero__photo"><Image src="/images/florist-workshop.webp" alt="Авторский букет из разноцветных цветов" fill sizes="(max-width: 900px) 100vw, 50vw" /></div><div className="page-hero__content"><p className="eyebrow">Личный флорист онлайн</p><h1>Соберите букет<br />под своё настроение</h1><p>Четыре простых шага. Финальный состав уточнит флорист и соберёт его из свежих цветов.</p></div></div>
            <div className="builder-layout">
              <div className="builder-card">
                <div className="builder-progress"><span>Шаг {builderStep} из 4</span><div>{[1,2,3,4].map((step) => <i key={step} className={step <= builderStep ? "is-done" : ""} />)}</div></div>
                {builderStep === 1 && <div className="builder-question"><p className="eyebrow">01 — бюджет</p><h2>На какую сумму ориентируемся?</h2><div className="option-grid option-grid--price">{[3500,5000,7000,10000].map((price) => <button key={price} className={builderBudget === price ? "is-active" : ""} onClick={() => setBuilderBudget(price)}><b>{money(price)}</b><span>{price < 5000 ? "Компактный" : price < 7000 ? "Выразительный" : price < 10000 ? "Большой" : "Впечатляющий"}</span></button>)}</div></div>}
                {builderStep === 2 && <div className="builder-question"><p className="eyebrow">02 — настроение</p><h2>Что должен сказать букет?</h2><div className="option-grid">{[["Нежный","#f4cbd5"],["Яркий","#d91f68"],["Воздушный","#f6f1e6"],["С характером","var(--lime)"]].map(([label,color]) => <button key={label} className={builderMood === label ? "is-active" : ""} onClick={() => setBuilderMood(label)}><i style={{background: color}} /><b>{label}</b></button>)}</div></div>}
                {builderStep === 3 && <div className="builder-question"><p className="eyebrow">03 — любимые цветы</p><h2>Что точно хочется увидеть?</h2><div className="flower-choice-grid">{builderFlowers.map((item) => <label key={item}><input type="checkbox" checked={builderFlowerSelection.includes(item)} onChange={() => toggleBuilderFlower(item)} /><span>{item}</span></label>)}</div><p className="helper-text">Флорист учтёт ваш выбор и согласует финальный состав.</p></div>}
                {builderStep === 4 && <div className="builder-question"><p className="eyebrow">04 — упаковка</p><h2>Последний штрих</h2><div className="wrap-options">{builderWraps.map((item, index) => <button key={item} className={builderWrap === item ? "is-active" : ""} onClick={() => setBuilderWrap(item)}><span className={`wrap-swatch wrap-swatch--${index + 1}`} /><b>{item}</b></button>)}</div><div className="builder-summary"><span>Ваш выбор</span><b>{builderMood} · {builderFlowerSelection.join(", ")} · {builderWrap}</b><strong>{money(builderBudget)}</strong></div></div>}
                <div className="builder-controls">{builderStep > 1 && <button className="button button--light" onClick={() => setBuilderStep(builderStep - 1)}>Назад</button>}{builderStep < 4 ? <button className="button button--navy" onClick={() => setBuilderStep(builderStep + 1)}>Продолжить</button> : <button className="button button--navy" onClick={finishBuilder} disabled={!builderProduct}>Добавить в корзину</button>}</div>
              </div>
              <aside className="builder-preview"><Image src="/images/hero-bouquet.webp" alt="Пример авторского букета" width={1085} height={1450} sizes="(max-width: 900px) 100vw, 40vw" /><div><p>Ваш будущий букет</p><b>{builderMood} характер</b><span>Финальный вид пришлём на согласование</span></div></aside>
            </div>
          </section>
        )}

        {view === "occasion" && (
          <section className="section-pad page-section">
            <div className="page-hero page-hero--cream page-hero--media"><div className="page-hero__photo"><Image src="/images/bouquet-1.webp" alt="Яркий букет гербер" fill sizes="(max-width: 900px) 100vw, 50vw" /></div><div className="page-hero__content"><p className="eyebrow">Когда важны правильные слова</p><h1>Выберите повод —<br />мы подберём настроение</h1><p>Подсказки флористов для тех случаев, когда хочется порадовать, но сложно решить как.</p></div></div>
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
            <div className="page-hero page-hero--lime page-hero--media delivery-hero"><div className="page-hero__photo"><Image src="/images/bouquet-5.webp" alt="Свежие гортензии" fill sizes="(max-width: 900px) 100vw, 50vw" /></div><div className="page-hero__content"><p className="eyebrow">Бережно и по адресу</p><h1>Доставка через Яндекс</h1><p>Заказ передаём в Яндекс Доставку. Стоимость зависит от адреса и подтверждается до оплаты.</p><div className="delivery-route"><span>Студия</span><i /><span>Яндекс</span><i /><span>Получатель</span></div></div></div>
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
                {mapLoaded ? (
                  <iframe
                    src={YANDEX_MAP_EMBED_URL}
                    title="Радуйка на Яндекс Картах"
                    loading="lazy"
                    allowFullScreen
                    referrerPolicy="no-referrer"
                    sandbox="allow-scripts allow-same-origin allow-popups"
                  />
                ) : (
                  <div className="studio-location__map-consent">
                    <b>Карта загружается с сайта Яндекса</b>
                    <p>Чтобы не передавать технические данные стороннему сервису автоматически, карта откроется только после вашего действия.</p>
                    <button className="button button--navy" type="button" onClick={() => setMapLoaded(true)}>Показать карту</button>
                  </div>
                )}
              </div>
            </section>
            <div className="how-delivery"><div><p className="eyebrow">Как всё происходит</p><h2>От оформления до передачи заказа</h2></div><ol><li><span>1</span><div><b>Вы оформляете заказ</b><p>Указываете только необходимые для исполнения заказа данные.</p></div></li><li><span>2</span><div><b>Сотрудник подтверждает условия</b><p>Проверяет состав, наличие и, при доставке, сообщает её стоимость до оплаты.</p></div></li><li><span>3</span><div><b>Заказ передаётся получателю</b><p>После подтверждения и оплаты заказ передаётся выбранным способом.</p></div></li></ol></div>
            <div className="faq"><h2>Частые вопросы</h2>{["Можно доставить, если я не знаю точный адрес?", "Получатель увидит стоимость?", "Что будет, если получателя нет на месте?"].map((item, index) => <details key={item} open={index === 0}><summary>{item}</summary><p>{index === 0 ? "Да. Укажите телефон — мы аккуратно уточним удобное место и время, не раскрывая сюрприз." : "Менеджер свяжется с вами и согласует следующий шаг. Все детали заказа остаются у отправителя."}</p></details>)}</div>
          </section>
        )}

        {view === "about" && (
          <section className="section-pad page-section">
            <div className="about-hero"><div><p className="eyebrow">Радость — в живых деталях</p><h1>Не копируем букеты.<br />Собираем эмоции.</h1><p>«Радуйка» — цветочная студия, где современная флористика встречается с человеческой заботой. Каждый заказ собираем вручную в день доставки.</p></div><Image src="/images/florist-workshop.webp" alt="Работа флориста Радуйки" width={1271} height={1237} sizes="(max-width: 900px) 100vw, 55vw" /></div>
            <div className="values-grid"><article><span>01</span><h3>Живые цветы</h3><p>Оттенок, размер и степень раскрытия бутонов естественно различаются. Это учитываем при сборке.</p></article><article><span>02</span><h3>Сохраняем характер</h3><p>При допустимых природных отличиях ориентируемся на выбранную палитру, объём и общий образ букета.</p></article><article><span>03</span><h3>Согласуем существенное</h3><p>Заметные замены состава или изменение стоимости подтверждаем с покупателем до оплаты или передачи заказа.</p></article></div>
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
                    const variant = findProductVariant(product, line.variantId);
                    const configuration = line.builder
                      ? `${line.builder.mood} · ${line.builder.flowers.join(", ")} · ${line.builder.wrap}`
                      : [variant?.label, bouquetSizeLabel(line.size), productAddOnsLabel(line.addOns)].filter(Boolean).join(" · ");
                    return (
                      <article className="cart-line" key={line.key}>
                        <ProductImage src={getVariantImage(product, variant)} alt={productDisplayName(product, variant)} width={150} height={150} sizes="150px" />
                        <div className="cart-line__info">
                          <h3>{productDisplayName(product, variant)}</h3>
                          <p>{product.subtitle}</p>
                          <small className="cart-line__configuration">{configuration}</small>
                          <button onClick={() => setCart((current) => current.filter((item) => item.key !== line.key))}>Удалить</button>
                        </div>
                        <div className="quantity">
                          <button aria-label={`Уменьшить количество ${productDisplayName(product, variant)}`} onClick={() => updateQuantity(line.key, -1)}><Icon name="minus" /></button>
                          <span>{line.quantity}</span>
                          <button aria-label={`Увеличить количество ${productDisplayName(product, variant)}`} onClick={() => updateQuantity(line.key, 1)} disabled={line.quantity >= 20}><Icon name="plus" /></button>
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
                    <label className="span-2">Email для электронного чека<input type="email" name="customerEmail" required autoComplete="email" inputMode="email" maxLength={254} value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} placeholder="name@example.ru" /></label>
                    {cardAdded ? (
                      <><label className="span-2">Текст для открытки<textarea name="cardText" required maxLength={500} placeholder="Напишите несколько тёплых слов" /><small className="legal-helper">Не указывайте сведения о здоровье, религии, политических взглядах и другие чувствительные данные.</small></label><button className="checkout-remove-card" type="button" onClick={() => setCardAdded(false)}>Убрать открытку</button></>
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
                <p className="legal-helper">Для оформления и исполнения заказа магазин обработает указанные вами данные на основаниях, предусмотренных законом и договором. Подробнее: <Link href="/legal/privacy" target="_blank" rel="noopener noreferrer">Политика обработки персональных данных</Link>. Отдельное согласие не подменяет обработку, необходимую для исполнения заказа.</p>
                <label className="legal-checkbox">
                  <input type="checkbox" name="offerAccepted" required />
                  <span>Я ознакомился(ась) и принимаю условия <Link href="/legal/offer" target="_blank" rel="noopener noreferrer">публичной оферты</Link>, а также <Link href="/legal/payment-delivery" target="_blank" rel="noopener noreferrer">оплаты и доставки</Link>.</span>
                </label>
                {recipientType === "other" && <p className="legal-helper">Передавая имя и телефон другого получателя, указывайте только сведения, необходимые для доставки, и убедитесь, что у вас есть законное основание сообщить их магазину.</p>}
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
                  const variant = findProductVariant(product, line.variantId);
                  const configuration = line.builder
                    ? `${line.builder.mood} · ${line.builder.wrap}`
                    : [variant?.label, bouquetSizeLabel(line.size), productAddOnsLabel(line.addOns)].filter(Boolean).join(" · ");
                  return <div className="mini-line" key={line.key}><ProductImage src={getVariantImage(product, variant)} alt="" width={62} height={62} sizes="62px" /><span><b>{productDisplayName(product, variant)}</b><small>{configuration}<br />{line.quantity} × {money(lineUnitPrice(line, product))}</small></span></div>;
                })}
                {cardAdded && <div className="mini-line mini-line--card"><span>✎</span><span><b>Открытка</b><small>{money(cardFee)}</small></span></div>}
                {bonus && <div className="summary-line summary-line--pink"><span>Бонусы</span><b>−{money(discount)}</b></div>}
                <div className="summary-total"><span>Предварительно</span><strong>{money(total)}</strong></div>
                <p>{checkoutDelivery === "delivery" ? "Стоимость Яндекс Доставки в предварительную сумму не входит — её подтвердит сотрудник до оплаты." : `Самовывоз бесплатный: ${STORE_ADDRESS}. Сотрудник сообщит, когда заказ можно забрать.`}</p>
              </aside>
            </div>
          </section>
        )}

        {view === "success" && <section className="success-page section-pad"><div className="success-mark"><Icon name="check" /></div><p className="eyebrow">Заказ {orderNumber || "принят"}</p><h1>Заявка уже у<br />сотрудника</h1><p>{checkoutDelivery === "delivery" ? "Сотрудник проверит состав, адрес и тариф Яндекс Доставки, затем свяжется с вами и пришлёт ссылку на оплату." : `Сотрудник проверит состав и сообщит, когда заказ будет готов к самовывозу по адресу: ${STORE_ADDRESS}.`}</p><p className="legal-helper">Номер заказа подтверждает оформление. Условия дистанционной продажи доступны в <Link href="/legal/offer">публичной оферте</Link>.</p><div className="success-steps"><span className="is-active">Заказ принят</span><i /><span>Подтверждение</span><i /><span>Сборка</span></div><button className="button button--navy" onClick={() => void checkOrderStatus()}>Следить за заказом</button><button className="text-link" onClick={() => go("home")}>Вернуться на главную</button></section>}

      </main>

      {view !== "success" && <footer className="site-footer section-pad"><div className="footer-top"><div><button className="brand brand--footer" onClick={() => go("home")}>РАДУЙКА</button><p>Букеты, которые говорят за вас.</p></div><div><b>Магазин</b><button onClick={() => openCatalog()}>Каталог</button><button onClick={() => go("flowers")}>Цветы</button><button onClick={startBuilder}>Собрать букет</button><button onClick={() => go("occasion")}>Поводы</button></div><div><b>Покупателям</b><button onClick={() => go("delivery")}>Доставка</button><Link href="/legal/payment-delivery">Оплата и доставка</Link><Link href="/legal/bonus-program">Бонусная программа</Link><Link href="/legal/returns-claims">Возврат и претензии</Link><Link href="/legal/offer">Публичная оферта</Link><Link href="/account">Личный кабинет</Link></div><div><b>Мы на связи</b>{sellerDetails.phone ? <a href={`tel:${sellerDetails.phone.replace(/[^+\d]/g, "")}`}>{sellerDetails.phone}</a> : <span>Телефон: __________________</span>}{sellerDetails.email ? <a href={`mailto:${sellerDetails.email}`}>{sellerDetails.email}</a> : <span>E-mail: __________________</span>}<a href={YANDEX_MAP_LINK} target="_blank" rel="noreferrer">{STORE_ADDRESS}</a><span>Пн–Пт: 09:00–21:00</span><span>Сб–Вс: 10:00–21:00</span></div></div><div className="footer-bottom"><span>© 2026 Радуйка</span><Link href="/legal/seller">Сведения о продавце</Link><Link href="/legal/privacy">Персональные данные</Link><Link href="/legal/personal-data-consent">Согласие на ПД</Link><Link href="/legal/cookies">Cookies</Link></div></footer>}

      {searchOpen && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Поиск" onMouseDown={(event) => { if (event.target === event.currentTarget) setSearchOpen(false); }}>
          <button className="overlay-close" onClick={() => setSearchOpen(false)} aria-label="Закрыть"><Icon name="close" /></button>
          <div className="search-modal">
            <p className="eyebrow">Найти тот самый букет</p>
            <label><Icon name="search" /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Название или цветы" /></label>
            <div className="search-results">
              {!normalizedSearch && <p className="search-empty">Начните вводить название букета или цветы в составе.</p>}
              {normalizedSearch && !searchResults.length && <p className="search-empty">Ничего не нашли. Попробуйте другое название.</p>}
              {searchResults.slice(0, 6).map((product) => <button key={product.id} onClick={() => openProduct(product.id)}><ProductImage src={product.image} alt="" width={68} height={68} sizes="68px" /><span><b>{product.name}</b><small>{product.subtitle}</small></span><strong>{money(product.price)}</strong></button>)}
            </div>
          </div>
        </div>
      )}

      {giftOpen && <div className="overlay" role="dialog" aria-modal="true" aria-label="Подбор подарка" onMouseDown={(event) => { if (event.target === event.currentTarget) setGiftOpen(false); }}><button className="overlay-close" onClick={() => setGiftOpen(false)} aria-label="Закрыть"><Icon name="close" /></button><div className="gift-modal"><div className="gift-modal__badge"><Icon name="gift" /></div><p className="eyebrow">Быстрый подбор</p><h2>Кого будем радовать?</h2><div className="gift-options">{["Любимого человека", "Маму", "Подругу", "Коллегу", "Себя — заслуженно"].map((item, index) => <button key={item} onClick={() => { setGiftOpen(false); openCatalog(index < 3 ? "Нежные" : index === 3 ? "До 4 000 ₽" : "Все"); }}>{item}<Icon name="arrow" /></button>)}</div></div></div>}



      {orderStatusOpen && (returnedOrderLookup || latestOrder) && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="status-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setOrderStatusOpen(false); }}>
          <button className="overlay-close" onClick={() => setOrderStatusOpen(false)} aria-label="Закрыть"><Icon name="close" /></button>
          <section className="dialog-modal order-status-modal">
            {returnedOrderLookup ? (
              <>
                <p className="eyebrow">Заказ {returnedOrderLookup}</p>
                <h2 id="status-title">Найдём ваш заказ</h2>
                <form className="dialog-form" onSubmit={submitReturnedOrderLookup}>
                  <label>
                    Телефон, указанный при оформлении
                    <input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={returnedOrderPhone}
                      onChange={(event) => setReturnedOrderPhone(event.target.value)}
                      placeholder="+7 900 000-00-00"
                      required
                      autoFocus
                    />
                  </label>
                  {returnedOrderError && <p className="account-error" role="alert">{returnedOrderError}</p>}
                  <div className="dialog-actions">
                    <button className="button button--navy" type="submit" disabled={orderStatusLoading}>{orderStatusLoading ? "Проверяем…" : "Показать заказ"}</button>
                  </div>
                </form>
              </>
            ) : latestOrder ? (
              <>
                <p className="eyebrow">Заказ {latestOrder.orderNumber}</p>
                <h2 id="status-title">{orderStatusLabels[latestOrder.status]}</h2>
                <div className="order-status-card"><span>Оплата</span><b>{paymentStatusLabels[latestOrder.paymentStatus]}</b><span>Сумма</span><b>{money(latestOrder.total)}</b>{latestOrder.updatedAt && <><span>Обновлено</span><b>{new Date(latestOrder.updatedAt).toLocaleString("ru-RU")}</b></>}</div>
                {!isHttpsUrl(latestOrder.paymentUrl) && latestOrder.paymentStatus === "pending" && (
                  <p className="payment-qr-hint">После того как сотрудник выставит оплату, обновите статус — здесь появится переход к QR ЮKassa.</p>
                )}
                {isHttpsUrl(latestOrder.paymentUrl) && latestOrder.paymentStatus !== "paid" && latestOrder.paymentStatus !== "refunded" && (
                  <p className="payment-qr-hint">На компьютере ЮKassa покажет QR-код СБП, на телефоне — список банков.</p>
                )}
                <div className="dialog-actions">
                  {isHttpsUrl(latestOrder.paymentUrl) && latestOrder.paymentStatus !== "paid" && latestOrder.paymentStatus !== "refunded" && (
                    <a className="button button--navy" href={latestOrder.paymentUrl} referrerPolicy="no-referrer">Открыть QR ЮKassa</a>
                  )}
                  <button className="button button--navy" type="button" onClick={() => void checkOrderStatus()} disabled={orderStatusLoading || !latestOrder.customerPhone}>{orderStatusLoading ? "Обновляем…" : latestOrder.customerPhone ? "Обновить статус" : "Статус сохранён"}</button>
                </div>
              </>
            ) : null}
          </section>
        </div>
      )}

      {toast && <div className="toast"><Icon name="check" />{toast}</div>}
    </div>
  );
}
