import type {
  ReminderNotificationOffset,
  ReminderSchedule,
} from "./types";

export const DEFAULT_REMINDER_TIME_ZONE = "Asia/Yekaterinburg";

const DAY_IN_MILLISECONDS = 86_400_000;

export type CalendarDate = {
  year: number;
  month: number;
  day: number;
};

export type DueReminderNotification = {
  offset: ReminderNotificationOffset;
  eventDate: CalendarDate;
};

export function isLeapYear(year: number): boolean {
  return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
}

export function calendarDateInTimeZone(
  instant: Date = new Date(),
  timeZone = DEFAULT_REMINDER_TIME_ZONE,
): CalendarDate {
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError("Некорректная текущая дата.");
  }

  const values: Partial<Record<"year" | "month" | "day", number>> = {};
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  for (const part of formatter.formatToParts(instant)) {
    if (part.type === "year" || part.type === "month" || part.type === "day") {
      values[part.type] = Number(part.value);
    }
  }

  if (!values.year || !values.month || !values.day) {
    throw new RangeError("Не удалось определить календарную дату.");
  }

  return {
    year: values.year,
    month: values.month,
    day: values.day,
  };
}

export function calendarDateToEpochDay(date: CalendarDate): number {
  return Math.floor(
    Date.UTC(date.year, date.month - 1, date.day) / DAY_IN_MILLISECONDS,
  );
}

export function daysBetweenCalendarDates(
  from: CalendarDate,
  to: CalendarDate,
): number {
  return calendarDateToEpochDay(to) - calendarDateToEpochDay(from);
}

export function calendarDateToIso(date: CalendarDate): string {
  return [
    String(date.year).padStart(4, "0"),
    String(date.month).padStart(2, "0"),
    String(date.day).padStart(2, "0"),
  ].join("-");
}

export function reminderOccurrenceInYear(
  reminder: Pick<ReminderSchedule, "eventDay" | "eventMonth">,
  year: number,
): CalendarDate {
  const day = reminder.eventMonth === 2
    && reminder.eventDay === 29
    && !isLeapYear(year)
    ? 28
    : reminder.eventDay;

  return {
    year,
    month: reminder.eventMonth,
    day,
  };
}

export function nextReminderOccurrence(
  reminder: Pick<
    ReminderSchedule,
    "eventDay" | "eventMonth" | "eventYear"
  >,
  today: CalendarDate,
): CalendarDate {
  let occurrenceYear = Math.max(
    today.year,
    reminder.eventYear ?? today.year,
  );
  let occurrence = reminderOccurrenceInYear(reminder, occurrenceYear);

  if (daysBetweenCalendarDates(today, occurrence) < 0) {
    occurrenceYear += 1;
    occurrence = reminderOccurrenceInYear(reminder, occurrenceYear);
  }

  return occurrence;
}

function notificationIsEnabled(
  reminder: ReminderSchedule,
  offset: ReminderNotificationOffset,
): boolean {
  switch (offset) {
    case 7:
      return reminder.notify7Days;
    case 3:
      return reminder.notify3Days;
    case 1:
      return reminder.notify1Day;
    case 0:
      return reminder.notifySameDay;
  }
}

export function getDueNotification(
  reminder: ReminderSchedule,
  today: CalendarDate,
): DueReminderNotification | null {
  const eventDate = nextReminderOccurrence(reminder, today);
  const daysUntilEvent = daysBetweenCalendarDates(today, eventDate);

  if (
    daysUntilEvent !== 7
    && daysUntilEvent !== 3
    && daysUntilEvent !== 1
    && daysUntilEvent !== 0
  ) {
    return null;
  }

  if (!notificationIsEnabled(reminder, daysUntilEvent)) {
    return null;
  }

  return {
    offset: daysUntilEvent,
    eventDate,
  };
}
