import test from "node:test";
import assert from "node:assert/strict";
import {
  daysBetweenCalendarDates,
  getDueNotification,
  isLeapYear,
  nextReminderOccurrence,
} from "../lib/reminders/date-math.ts";

const baseReminder = {
  eventDay: 2,
  eventMonth: 1,
  eventYear: null,
  notify7Days: true,
  notify3Days: true,
  notify1Day: true,
  notifySameDay: false,
};

test("считает дни до январского события через границу года", () => {
  const today = { year: 2026, month: 12, day: 29 };
  const occurrence = nextReminderOccurrence(baseReminder, today);
  assert.deepEqual(occurrence, { year: 2027, month: 1, day: 2 });
  assert.equal(daysBetweenCalendarDates(today, occurrence), 4);
  assert.equal(getDueNotification(baseReminder, today), null);
});

test("создаёт уведомление ровно за 7 дней через границу года", () => {
  const due = getDueNotification(baseReminder, {
    year: 2026,
    month: 12,
    day: 26,
  });
  assert.equal(due?.offset, 7);
  assert.deepEqual(due?.eventDate, { year: 2027, month: 1, day: 2 });
});

test("учитывает отдельные флаги 7/3/1/0", () => {
  const today = { year: 2027, month: 1, day: 1 };
  assert.equal(getDueNotification(baseReminder, today)?.offset, 1);
  assert.equal(
    getDueNotification({ ...baseReminder, notify1Day: false }, today),
    null,
  );
  assert.equal(
    getDueNotification({ ...baseReminder, notifySameDay: true }, {
      year: 2027,
      month: 1,
      day: 2,
    })?.offset,
    0,
  );
});

test("переносит ежегодное 29 февраля на 28 февраля невисокосного года", () => {
  const leapReminder = { ...baseReminder, eventDay: 29, eventMonth: 2 };
  const due = getDueNotification(leapReminder, {
    year: 2026,
    month: 2,
    day: 21,
  });
  assert.equal(due?.offset, 7);
  assert.deepEqual(due?.eventDate, { year: 2026, month: 2, day: 28 });
});

test("оставляет 29 февраля в високосном году", () => {
  const leapReminder = { ...baseReminder, eventDay: 29, eventMonth: 2 };
  const due = getDueNotification(leapReminder, {
    year: 2028,
    month: 2,
    day: 22,
  });
  assert.equal(due?.offset, 7);
  assert.deepEqual(due?.eventDate, { year: 2028, month: 2, day: 29 });
  assert.equal(isLeapYear(2000), true);
  assert.equal(isLeapYear(2100), false);
});

test("не планирует событие раньше указанного исходного года", () => {
  const occurrence = nextReminderOccurrence(
    { ...baseReminder, eventMonth: 9, eventDay: 12, eventYear: 2030 },
    { year: 2027, month: 9, day: 5 },
  );
  assert.deepEqual(occurrence, { year: 2030, month: 9, day: 12 });
});
