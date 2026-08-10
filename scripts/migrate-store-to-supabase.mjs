import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !serviceRoleKey) {
  console.error("Не найдены NEXT_PUBLIC_SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY в .env.local");
  process.exit(1);
}

const storePath = path.join(process.cwd(), "data", "store.json");
const store = JSON.parse(await readFile(storePath, "utf8"));
const products = Array.isArray(store.products) ? store.products : [];
const orders = Array.isArray(store.orders) ? store.orders : [];

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const [{ count: productCount, error: productCountError }, { count: orderCount, error: orderCountError }] = await Promise.all([
  supabase.from("products").select("id", { count: "exact", head: true }),
  supabase.from("orders").select("id", { count: "exact", head: true }),
]);
if (productCountError) throw productCountError;
if (orderCountError) throw orderCountError;
if ((productCount ?? 0) > 0 || (orderCount ?? 0) > 0) {
  console.error("Миграция остановлена: таблицы products/orders уже не пустые. Это защита от дублей.");
  process.exit(2);
}

const productRows = products.map((product) => ({
  id: product.id,
  name: product.name,
  subtitle: product.subtitle ?? "",
  price: product.price,
  old_price: product.oldPrice ?? null,
  image: product.image,
  tag: product.tag ?? null,
  stock: product.stock,
  size: product.size,
  palette: product.palette,
  kind: product.kind,
  visible: product.visible !== false,
  featured: Boolean(product.featured),
  sort_order: product.sortOrder ?? 0,
}));

if (productRows.length) {
  const { error } = await supabase.from("products").insert(productRows);
  if (error) throw error;
}

const customerUserIds = [...new Set(orders.map((order) => order.customerUserId).filter(Boolean))];
let validCustomerUserIds = new Set();
if (customerUserIds.length) {
  const { data: profileRows, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .in("id", customerUserIds);
  if (profileError) throw profileError;
  validCustomerUserIds = new Set((profileRows ?? []).map((row) => row.id));
}

const orderRows = orders.map((order) => ({
  id: order.id,
  order_number: order.orderNumber,
  status: order.status,
  payment_status: order.paymentStatus,
  delivery_method: order.deliveryMethod,
  delivery_fee: order.deliveryFee ?? null,
  card_added: Boolean(order.cardAdded),
  card_fee: order.cardFee ?? 0,
  subtotal: order.subtotal,
  discount: order.discount ?? 0,
  total: order.total,
  recipient_type: order.recipientType ?? null,
  recipient_name: order.recipientName,
  recipient_phone: order.recipientPhone,
  customer_name: order.customerName,
  customer_phone: order.customerPhone,
  customer_user_id: validCustomerUserIds.has(order.customerUserId) ? order.customerUserId : null,
  bonus_spent: order.bonusSpent ?? order.discount ?? 0,
  bonus_earned: order.bonusEarned ?? 0,
  address: order.address ?? "",
  delivery_date: order.deliveryDate ?? "",
  delivery_time: order.deliveryTime ?? "",
  card_text: order.cardText ?? "",
  admin_note: order.adminNote ?? "",
  items: order.items ?? [],
  idempotency_key_hash: order.idempotencyKeyHash ?? null,
  idempotency_fingerprint_hash: order.idempotencyFingerprintHash ?? null,
  created_at: order.createdAt,
  updated_at: order.updatedAt,
}));

if (orderRows.length) {
  const { error } = await supabase.from("orders").insert(orderRows);
  if (error) throw error;
}

console.log(`Готово. Перенесено товаров: ${productRows.length}; заказов: ${orderRows.length}.`);
