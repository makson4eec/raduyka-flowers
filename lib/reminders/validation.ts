import { z } from "zod";
import { isLeapYear } from "./date-math";
import { REMINDER_EVENT_TYPES } from "./types";

function numericStringToNumber(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const normalized = value.trim();
  return normalized ? Number(normalized) : value;
}

function integerSchema(label: string, minimum: number, maximum: number) {
  return z.preprocess(
    numericStringToNumber,
    z.number({ error: `${label}: укажите число.` })
      .int(`${label}: укажите целое число.`)
      .min(minimum, `${label}: минимальное значение ${minimum}.`)
      .max(maximum, `${label}: максимальное значение ${maximum}.`),
  );
}

const titleSchema = z.string({ error: "Введите название события." })
  .trim()
  .min(1, "Введите название события.")
  .max(120, "Название должно содержать не более 120 символов.");

const personNameSchema = z.preprocess(
  (value) => typeof value === "string" && !value.trim() ? null : value,
  z.string({ error: "Проверьте имя человека." })
    .trim()
    .min(1, "Проверьте имя человека.")
    .max(100, "Имя должно содержать не более 100 символов.")
    .nullable(),
);

const eventTypeSchema = z.enum(REMINDER_EVENT_TYPES, {
  error: "Выберите тип события.",
});

const eventDaySchema = integerSchema("День", 1, 31);
const eventMonthSchema = integerSchema("Месяц", 1, 12);
const eventYearSchema = z.preprocess(
  (value) => {
    if (value === null || value === "") return null;
    return numericStringToNumber(value);
  },
  z.number({ error: "Проверьте год события." })
    .int("Год должен быть целым числом.")
    .min(1900, "Год должен быть не раньше 1900.")
    .max(9999, "Год должен быть не больше 9999.")
    .nullable(),
);

function maximumDayInEventMonth(month: number, year: number | null): number {
  if (month === 2) {
    if (year === null || isLeapYear(year)) return 29;
    return 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function validateCalendarDate(
  value: { eventDay: number; eventMonth: number; eventYear: number | null },
  context: z.RefinementCtx,
) {
  const maximumDay = maximumDayInEventMonth(
    value.eventMonth,
    value.eventYear,
  );

  if (value.eventDay > maximumDay) {
    context.addIssue({
      code: "custom",
      path: ["eventDay"],
      message: "Такой даты не существует. Проверьте день, месяц и год.",
    });
  }
}

export const reminderCreateSchema = z.strictObject({
  title: titleSchema,
  personName: personNameSchema.optional().transform((value) => value ?? null),
  eventType: eventTypeSchema,
  eventDay: eventDaySchema,
  eventMonth: eventMonthSchema,
  eventYear: eventYearSchema.optional().transform((value) => value ?? null),
  notify7Days: z.boolean({ error: "Проверьте настройку «за 7 дней»." })
    .default(true),
  notify3Days: z.boolean({ error: "Проверьте настройку «за 3 дня»." })
    .default(true),
  notify1Day: z.boolean({ error: "Проверьте настройку «за 1 день»." })
    .default(true),
  notifySameDay: z.boolean({ error: "Проверьте настройку «в день события»." })
    .default(false),
}).superRefine(validateCalendarDate);

export const reminderPatchSchema = z.strictObject({
  title: titleSchema.optional(),
  personName: personNameSchema.optional(),
  eventType: eventTypeSchema.optional(),
  eventDay: eventDaySchema.optional(),
  eventMonth: eventMonthSchema.optional(),
  eventYear: eventYearSchema.optional(),
  notify7Days: z.boolean({ error: "Проверьте настройку «за 7 дней»." })
    .optional(),
  notify3Days: z.boolean({ error: "Проверьте настройку «за 3 дня»." })
    .optional(),
  notify1Day: z.boolean({ error: "Проверьте настройку «за 1 день»." })
    .optional(),
  notifySameDay: z.boolean({ error: "Проверьте настройку «в день события»." })
    .optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "Укажите данные, которые нужно изменить.",
});

export const reminderIdSchema = z.uuid({
  error: "Некорректный идентификатор важной даты.",
});

export function reminderValidationError(error: z.ZodError) {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const field = typeof issue.path[0] === "string" ? issue.path[0] : "form";
    fieldErrors[field] ??= [];
    fieldErrors[field].push(issue.message);
  }

  return {
    error: error.issues[0]?.message ?? "Проверьте введённые данные.",
    fieldErrors,
  };
}
