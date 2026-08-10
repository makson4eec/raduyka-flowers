export const BONUS_SPEND_PERCENT = 10;
export const BONUS_EARN_PERCENT = 5;
export const BONUS_RUBLE_VALUE = 1;

function wholeNonNegativeAmount(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function bonusEligibleAmount(subtotal: number, cardFee: number) {
  return wholeNonNegativeAmount(subtotal) + wholeNonNegativeAmount(cardFee);
}

export function maximumBonusSpend(eligibleAmount: number) {
  return Math.floor(
    (wholeNonNegativeAmount(eligibleAmount) * BONUS_SPEND_PERCENT) / 100,
  );
}

export function bonusSpendForBalance(balance: number, eligibleAmount: number) {
  return Math.min(
    wholeNonNegativeAmount(balance),
    maximumBonusSpend(eligibleAmount),
  );
}

export function earnedBonusAmount(eligibleAmount: number, bonusSpent: number) {
  const paidEligibleAmount = Math.max(
    0,
    wholeNonNegativeAmount(eligibleAmount) - wholeNonNegativeAmount(bonusSpent),
  );

  return Math.floor((paidEligibleAmount * BONUS_EARN_PERCENT) / 100);
}
