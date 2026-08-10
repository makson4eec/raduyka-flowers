export type ProductStock = "today" | "few" | "soon";
export type ProductPalette = "pink" | "white" | "bright" | "green";
export type ProductKind = "catalog" | "builder";
export type BouquetSize = "small" | "medium" | "large";
export type ProductAddOn = "vase" | "sweet";
export type RecipientType = "self" | "other";

export type BuilderSelection = {
  budget: number;
  mood: string;
  flowers: string[];
  wrap: string;
};

export type Product = {
  id: number;
  name: string;
  subtitle: string;
  price: number;
  oldPrice?: number;
  image: string;
  tag?: string;
  stock: ProductStock;
  size: string;
  palette: ProductPalette;
  kind: ProductKind;
  visible: boolean;
  featured: boolean;
  sortOrder: number;
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
  items: Array<{
    productId: number;
    quantity: number;
    size?: BouquetSize;
    addOns?: ProductAddOn[];
    builder?: BuilderSelection;
  }>;
};
