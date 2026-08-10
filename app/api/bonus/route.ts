import {
  BONUS_EARN_PERCENT,
  BONUS_RUBLE_VALUE,
  BONUS_SPEND_PERCENT,
} from "../../../lib/bonus-rules";
import {
  BonusServiceError,
  getOwnBonusAccount,
} from "../../../lib/bonus-server";

export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
  Vary: "Cookie",
};

export async function GET() {
  try {
    const account = await getOwnBonusAccount();
    return Response.json(
      {
        ...account,
        spendPercent: BONUS_SPEND_PERCENT,
        earnPercent: BONUS_EARN_PERCENT,
        rublesPerBonus: BONUS_RUBLE_VALUE,
      },
      { headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    const status = error instanceof BonusServiceError ? error.status : 503;
    const message = error instanceof BonusServiceError
      ? error.message
      : "Не удалось загрузить бонусный баланс.";
    return Response.json(
      {
        authenticated: false,
        available: false,
        balance: 0,
        spendPercent: BONUS_SPEND_PERCENT,
        earnPercent: BONUS_EARN_PERCENT,
        rublesPerBonus: BONUS_RUBLE_VALUE,
        error: message,
      },
      { status, headers: PRIVATE_HEADERS },
    );
  }
}
