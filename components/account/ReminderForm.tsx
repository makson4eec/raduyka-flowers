"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { ReminderDto, ReminderEventType, ReminderInput } from "@/lib/reminders/types";

const MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
] as const;

const EVENT_TYPES: Array<{ value: ReminderEventType; label: string }> = [
  { value: "birthday", label: "День рождения" },
  { value: "anniversary", label: "Годовщина" },
  { value: "holiday", label: "Праздник" },
  { value: "other", label: "Другое" },
];

type ReminderDraft = Omit<ReminderInput, "eventYear"> & { eventYear: number | "" };

const EMPTY_DRAFT: ReminderDraft = {
  title: "",
  personName: null,
  eventType: "birthday",
  eventDay: 1,
  eventMonth: 1,
  eventYear: "",
  notify7Days: true,
  notify3Days: true,
  notify1Day: true,
  notifySameDay: false,
};

function draftFromReminder(reminder?: ReminderDto): ReminderDraft {
  if (!reminder) return EMPTY_DRAFT;
  return {
    title: reminder.title,
    personName: reminder.personName,
    eventType: reminder.eventType,
    eventDay: reminder.eventDay,
    eventMonth: reminder.eventMonth,
    eventYear: reminder.eventYear ?? "",
    notify7Days: reminder.notify7Days,
    notify3Days: reminder.notify3Days,
    notify1Day: reminder.notify1Day,
    notifySameDay: reminder.notifySameDay,
  };
}

type ReminderFormProps = {
  reminder?: ReminderDto;
  onCancel: () => void;
  onSaved: (reminder: ReminderDto) => void;
};

export default function ReminderForm({ reminder, onCancel, onSaved }: ReminderFormProps) {
  const [draft, setDraft] = useState<ReminderDraft>(() => draftFromReminder(reminder));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const days = useMemo(() => Array.from({ length: 31 }, (_, index) => index + 1), []);

  const setValue = <Key extends keyof ReminderDraft>(key: Key, value: ReminderDraft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setError("");
    setSubmitting(true);

    const payload: ReminderInput = {
      ...draft,
      title: draft.title.trim(),
      personName: draft.personName?.trim() || null,
      eventYear: draft.eventYear === "" ? null : draft.eventYear,
    };

    try {
      const response = await fetch(
        reminder ? `/api/reminders/${encodeURIComponent(reminder.id)}` : "/api/reminders",
        {
          method: reminder ? "PATCH" : "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = (await response.json().catch(() => null)) as
        | { reminder?: ReminderDto; error?: string }
        | null;

      if (!response.ok || !result?.reminder) {
        throw new Error(result?.error || "Не удалось сохранить дату");
      }

      onSaved(result.reminder);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось сохранить дату",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="reminder-editor" onSubmit={submit}>
      <div className="reminder-editor__heading">
        <div>
          <p className="eyebrow">{reminder ? "Изменить событие" : "Новая важная дата"}</p>
          <h2>{reminder ? "Обновим напоминание" : "О чём напомнить?"}</h2>
        </div>
        <button className="reminder-editor__close" type="button" onClick={onCancel} aria-label="Закрыть форму">
          ×
        </button>
      </div>

      <div className="reminder-form-grid">
        <label className="reminder-field reminder-field--wide">
          <span>Название события</span>
          <input
            autoFocus
            required
            maxLength={120}
            value={draft.title}
            onChange={(event) => setValue("title", event.target.value)}
            placeholder="Например, день рождения мамы"
          />
        </label>

        <label className="reminder-field">
          <span>Тип события</span>
          <select
            value={draft.eventType}
            onChange={(event) => setValue("eventType", event.target.value as ReminderEventType)}
          >
            {EVENT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </label>

        <label className="reminder-field">
          <span>Имя человека <small>необязательно</small></span>
          <input
            maxLength={100}
            value={draft.personName ?? ""}
            onChange={(event) => setValue("personName", event.target.value)}
            placeholder="Анна"
          />
        </label>

        <fieldset className="reminder-date-fields reminder-field--wide">
          <legend>Дата события</legend>
          <label>
            <span>День</span>
            <select value={draft.eventDay} onChange={(event) => setValue("eventDay", Number(event.target.value))}>
              {days.map((day) => <option key={day} value={day}>{day}</option>)}
            </select>
          </label>
          <label>
            <span>Месяц</span>
            <select value={draft.eventMonth} onChange={(event) => setValue("eventMonth", Number(event.target.value))}>
              {MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
            </select>
          </label>
          <label>
            <span>Год <small>необязательно</small></span>
            <input
              type="number"
              inputMode="numeric"
              min={1900}
              max={9999}
              value={draft.eventYear}
              onChange={(event) => setValue("eventYear", event.target.value ? Number(event.target.value) : "")}
              placeholder="1990"
            />
          </label>
        </fieldset>

        <fieldset className="reminder-notify-fields reminder-field--wide">
          <legend>Когда напомнить</legend>
          <label><input type="checkbox" checked={draft.notify7Days} onChange={(event) => setValue("notify7Days", event.target.checked)} /><span>за 7 дней</span></label>
          <label><input type="checkbox" checked={draft.notify3Days} onChange={(event) => setValue("notify3Days", event.target.checked)} /><span>за 3 дня</span></label>
          <label><input type="checkbox" checked={draft.notify1Day} onChange={(event) => setValue("notify1Day", event.target.checked)} /><span>за 1 день</span></label>
          <label><input type="checkbox" checked={draft.notifySameDay} onChange={(event) => setValue("notifySameDay", event.target.checked)} /><span>в день события</span></label>
        </fieldset>
      </div>

      <p className="reminder-repeat-note">Событие будет повторяться ежегодно автоматически. Не указывайте в названии или имени чувствительные сведения о другом человеке.</p>
      {error && <p className="account-error" role="alert">{error}</p>}
      <div className="reminder-editor__actions">
        <button className="button button--light" type="button" onClick={onCancel} disabled={submitting}>Отмена</button>
        <button className="button button--navy" type="submit" disabled={submitting}>
          {submitting ? "Сохраняем…" : reminder ? "Сохранить изменения" : "Добавить дату"}
        </button>
      </div>
    </form>
  );
}
