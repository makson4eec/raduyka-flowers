export type ProductStock = "today" | "few" | "soon";
export type ProductPalette = "pink" | "white" | "bright" | "green";
export type ProductKind = "catalog" | "flower" | "builder";
export type CatalogCategory = "bouquet" | "composition";
export type BouquetSize = "small" | "medium" | "large";
export type ProductAddOn = "vase" | "sweet";
export type RecipientType = "self" | "other";

export type BuilderSelection = {
  budget: number;
  mood: string;
  flowers: string[];
  wrap: string;
};

export type ProductVariant = {
  id: string;
  label: string;
  image: string;
  price?: number;
  oldPrice?: number;
};

export type Product = {
  id: number;
  name: string;
  subtitle: string;
  care: string;
  /** Видовое название или видовой состав для растений/букетов. */
  speciesInfo?: string;
  /** Изготовитель товара, если применимо. */
  manufacturer?: string;
  manufacturerAddress?: string;
  /** Место изготовления товара, которое должно быть известно покупателю до договора. */
  manufacturingPlace?: string;
  /** Импортёр и его адрес, если сведения обязательны для конкретного товара. */
  importerInfo?: string;
  /** Срок годности/службы, если он установлен для товара. */
  shelfLife?: string;
  /** Гарантийный срок, если он установлен изготовителем/продавцом. */
  warrantyInfo?: string;
  /** Дополнительные правила безопасного и эффективного использования. */
  safeUse?: string;
  /** Сведения об обязательном подтверждении соответствия, если оно требуется. */
  conformityInfo?: string;
  /** Ссылка на запись о сертификате/декларации в реестре, когда это требуется законом. */
  conformityUrl?: string;
  price: number;
  oldPrice?: number;
  image: string;
  tag?: string;
  stock: ProductStock;
  size: string;
  palette: ProductPalette;
  kind: ProductKind;
  /** Distinguishes ready-made catalog items without changing their checkout behavior. */
  catalogCategory?: CatalogCategory;
  visible: boolean;
  featured: boolean;
  sortOrder: number;
  variants: ProductVariant[];
};

export type ProductInput = Omit<Product, "id">;

export type OrderStatus =
  | "new"
  | "confirmed"
  | "assembling"
  | "ready"
  | "delivery"
  | "completed"
  | "cancelled";

export type PaymentStatus =
  | "pending"
  | "invoice_sent"
  | "paid"
  | "refunded";

export type OrderItem = {
  productId: number;
  name: string;
  image: string;
  price: number;
  quantity: number;
  size?: BouquetSize;
  addOns?: ProductAddOn[];
  builder?: BuilderSelection;
  variantId?: string;
  variantLabel?: string;
};

export type Order = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  deliveryMethod: "delivery" | "pickup";
  deliveryFee: number | null;
  cardAdded?: boolean;
  cardFee?: number;
  subtotal: number;
  discount: number;
  total: number;
  recipientType?: RecipientType;
  recipientName: string;
  recipientPhone: string;
  customerName: string;
  customerPhone: string;
  /** Trusted server-side Supabase identity. Never accept this value from JSON. */
  customerUserId?: string | null;
  bonusSpent?: number;
  bonusEarned?: number;
  address: string;
  deliveryDate: string;
  deliveryTime: string;
  cardText: string;
  adminNote: string;
  privacyNoticeVersion?: string | null;
  offerVersion?: string | null;
  legalAcceptedAt?: string | null;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
};

export type CreateOrderInput = {
  deliveryMethod: "delivery" | "pickup";
  recipientType: RecipientType;
  recipientName: string;
  recipientPhone: string;
  customerName: string;
  customerPhone: string;
  address: string;
  deliveryDate: string;
  deliveryTime: string;
  cardText: string;
  useBonus: boolean;
  cardAdded: boolean;
  /** Exact version of the offer displayed and accepted by the customer. */
  offerVersion: string;
  items: Array<{
    productId: number;
    quantity: number;
    size?: BouquetSize;
    addOns?: ProductAddOn[];
    builder?: BuilderSelection;
    variantId?: string;
  }>;
};
