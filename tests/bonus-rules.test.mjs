import test from "node:test";
import assert from "node:assert/strict";
import {
  bonusEligibleAmount,
  bonusSpendForBalance,
  earnedBonusAmount,
  maximumBonusSpend,
} from "../lib/bonus-rules.ts";

test("разрешает списать не больше 10% покупки", () => {
  assert.equal(maximumBonusSpend(4_590), 459);
  assert.equal(bonusSpendForBalance(1_000, 4_590), 459);
});

test("не списывает больше доступного баланса", () => {
  assert.equal(bonusSpendForBalance(120, 4_590), 120);
});

test("учитывает открытку, но не доставку", () => {
  const eligible = bonusEligibleAmount(4_590, 190);
  assert.equal(eligible, 4_780);
  assert.equal(maximumBonusSpend(eligible), 478);
});

test("начисляет 5% после списанных бонусов с округлением вниз", () => {
  assert.equal(earnedBonusAmount(4_780, 478), 215);
  assert.equal(earnedBonusAmount(99, 0), 4);
});

test("некорректные суммы не создают бонусы", () => {
  assert.equal(bonusEligibleAmount(Number.NaN, -100), 0);
  assert.equal(bonusSpendForBalance(-10, 5_000), 0);
  assert.equal(earnedBonusAmount(100, 1_000), 0);
});
