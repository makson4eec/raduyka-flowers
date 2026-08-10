import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleClient, isSupabaseServiceRoleConfigured } from "./firebase/supabase-admin";
import { createSupabaseServerClient } from "./supabase/server";
import type { Order } from "./types";

export type CustomerIdentity =
  | { state: "authenticated"; userId: string }
  | { state: "anonymous" | "unavailable" | "unconfigured"; userId: null };

export type BonusMutationResult = {
  spent: number;
  earned: number;
  balance: number;
};

export class BonusServiceError extends Error {
  readonly status: number;

  constructor(message: string, status = 503) {
    super(message);
    this.name = "BonusServiceError";
    this.status = status;
  }
}

function wholeNonNegativeAmount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

function rpcResult(value: unknown): BonusMutationResult | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== "object") return null;

  const row = candidate as Record<string, unknown>;
  if (
    typeof row.bonus_spent !== "number"
    || typeof row.bonus_earned !== "number"
    || typeof row.bonus_balance !== "number"
  ) {
    return null;
  }

  return {
    spent: wholeNonNegativeAmount(row.bonus_spent),
    earned: wholeNonNegativeAmount(row.bonus_earned),
    balance: wholeNonNegativeAmount(row.bonus_balance),
  };
}

function serviceClient(): SupabaseClient {
  const client = getSupabaseServiceRoleClient();
  if (!client) {
    throw new BonusServiceError(
      "Бонусная система временно недоступна. Оформите заказ без списания бонусов или попробуйте позже.",
    );
  }
  return client;
}

async function callBonusRpc(
  functionName: string,
  parameters: Record<string, unknown>,
): Promise<BonusMutationResult> {
  const { data, error } = await serviceClient().rpc(functionName, parameters);
  if (error) {
    console.error("Bonus RPC failed", {
      functionName,
      code: error.code,
      message: error.message,
    });
    throw new BonusServiceError(
      "Не удалось обновить бонусы. Попробуйте ещё раз чуть позже.",
    );
  }

  const result = rpcResult(data);
  if (!result) {
    console.error("Bonus RPC returned an invalid result", { functionName });
    throw new BonusServiceError(
      "Бонусная система вернула некорректный ответ. Попробуйте ещё раз позже.",
    );
  }
  return result;
}

export async function getCustomerIdentity(): Promise<CustomerIdentity> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { state: "unconfigured", userId: null };

  try {
    const { data } = await supabase.auth.getClaims();
    const userId = data?.claims?.sub;
    return typeof userId === "string" && userId
      ? { state: "authenticated", userId }
      : { state: "anonymous", userId: null };
  } catch {
    return { state: "unavailable", userId: null };
  }
}

export function requireBonusCustomer(identity: CustomerIdentity): string {
  if (identity.state === "unconfigured") {
    throw new BonusServiceError(
      "Бонусная система пока не настроена. Оформите заказ без списания бонусов.",
    );
  }
  if (identity.state === "unavailable") {
    throw new BonusServiceError(
      "Не удалось проверить бонусный аккаунт. Оформите заказ без списания бонусов или попробуйте позже.",
    );
  }
  if (identity.state !== "authenticated") {
    throw new BonusServiceError(
      "Войдите в личный кабинет, чтобы списать бонусы.",
      401,
    );
  }
  if (!isSupabaseServiceRoleConfigured()) {
    throw new BonusServiceError(
      "Бонусная система временно недоступна. Оформите заказ без списания бонусов.",
    );
  }
  return identity.userId;
}

export async function getOwnBonusAccount() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new BonusServiceError("Бонусная система пока не настроена.");
  }

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (typeof userId !== "string" || !userId) {
    return {
      authenticated: false as const,
      available: isSupabaseServiceRoleConfigured(),
      balance: 0,
    };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("bonus_balance")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    console.error("Failed to load bonus balance", {
      code: error?.code,
      message: error?.message,
    });
    throw new BonusServiceError("Не удалось загрузить бонусный баланс.");
  }

  return {
    authenticated: true as const,
    available: isSupabaseServiceRoleConfigured(),
    balance: wholeNonNegativeAmount(data.bonus_balance),
  };
}

export function reserveOrderBonus(
  userId: string,
  orderId: string,
  eligibleAmount: number,
) {
  return callBonusRpc("reserve_order_bonus", {
    p_user_id: userId,
    p_order_id: orderId,
    p_eligible_amount: wholeNonNegativeAmount(eligibleAmount),
  });
}

export function reverseOrderBonuses(
  userId: string,
  orderId: string,
  reverseEarned: boolean,
) {
  return callBonusRpc("reverse_order_bonuses", {
    p_user_id: userId,
    p_order_id: orderId,
    p_reverse_earned: reverseEarned,
  });
}

export function creditOrderBonus(
  userId: string,
  orderId: string,
  paidEligibleAmount: number,
) {
  return callBonusRpc("credit_order_bonus", {
    p_user_id: userId,
    p_order_id: orderId,
    p_paid_eligible_amount: wholeNonNegativeAmount(paidEligibleAmount),
  });
}

export async function syncOrderBonuses(
  order: Order,
): Promise<BonusMutationResult | null> {
  if (!order.customerUserId) return null;

  if (order.paymentStatus === "refunded") {
    return reverseOrderBonuses(order.customerUserId, order.id, true);
  }
  if (order.status === "cancelled") {
    return reverseOrderBonuses(
      order.customerUserId,
      order.id,
      order.paymentStatus === "paid" || (order.bonusEarned ?? 0) > 0,
    );
  }
  if (order.status === "completed" && order.paymentStatus === "paid") {
    const paidEligibleAmount = Math.max(
      0,
      order.subtotal + (order.cardFee ?? 0) - (order.bonusSpent ?? order.discount),
    );
    return creditOrderBonus(
      order.customerUserId,
      order.id,
      paidEligibleAmount,
    );
  }

  return null;
}
