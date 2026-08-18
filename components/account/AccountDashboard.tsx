"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import LogoutButton from "@/components/customer-auth/LogoutButton";
import type { ReminderDto, ReminderEventType } from "@/lib/reminders/types";
import PushNotifications from "./PushNotifications";
import ReminderForm from "./ReminderForm";

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

const EVENT_META: Record<ReminderEventType, { label: string; icon: string }> = {
  birthday: { label: "День рождения", icon: "🎂" },
  anniversary: { label: "Годовщина", icon: "❤️" },
  holiday: { label: "Праздник", icon: "🌷" },
  other: { label: "Важная дата", icon: "✨" },
};

function notificationSummary(reminder: ReminderDto) {
  const offsets = [
    reminder.notify7Days ? "за 7 дней" : null,
    reminder.notify3Days ? "за 3 дня" : null,
    reminder.notify1Day ? "за 1 день" : null,
    reminder.notifySameDay ? "в день события" : null,
  ].filter((item): item is string => Boolean(item));

  if (!offsets.length) return "Напоминания пока выключены";
  if (offsets.length === 1) return `Напомнить ${offsets[0]}`;
  return `Напомнить ${offsets.slice(0, -1).join(", ")} и ${offsets.at(-1)}`;
}

type AccountDashboardProps = {
  name: string;
  email: string;
  bonusBalance: number | null;
  startWithNewReminder?: boolean;
};

export default function AccountDashboard({
  name,
  email,
  bonusBalance,
  startWithNewReminder = false,
}: AccountDashboardProps) {
  const [reminders, setReminders] = useState<ReminderDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editorOpen, setEditorOpen] = useState(startWithNewReminder);
  const [editing, setEditing] = useState<ReminderDto | undefined>();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadReminders = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/reminders", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | { reminders?: ReminderDto[]; error?: string }
        | null;
      if (!response.ok || !Array.isArray(payload?.reminders)) {
        throw new Error(payload?.error || "Не удалось загрузить важные даты");
      }
      setReminders(payload.reminders);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Не удалось загрузить важные даты");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadReminders(false), 0);
    return () => window.clearTimeout(timer);
  }, [loadReminders]);

  function openNewReminder() {
    setEditing(undefined);
    setEditorOpen(true);
    window.setTimeout(() => document.querySelector<HTMLElement>(".reminder-editor")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function openEdit(reminder: ReminderDto) {
    setEditing(reminder);
    setEditorOpen(true);
    window.setTimeout(() => document.querySelector<HTMLElement>(".reminder-editor")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function savedReminder(saved: ReminderDto) {
    setReminders((current) => {
      const exists = current.some((item) => item.id === saved.id);
      return exists
        ? current.map((item) => item.id === saved.id ? saved : item)
        : [saved, ...current];
    });
    setEditorOpen(false);
    setEditing(undefined);
  }

  async function deleteReminder(reminder: ReminderDto) {
    if (deletingId || !window.confirm(`Удалить «${reminder.title}»?`)) return;
    setDeletingId(reminder.id);
    setLoadError("");
    try {
      const response = await fetch(`/api/reminders/${encodeURIComponent(reminder.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Не удалось удалить дату");
      setReminders((current) => current.filter((item) => item.id !== reminder.id));
      if (editing?.id === reminder.id) {
        setEditing(undefined);
        setEditorOpen(false);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Не удалось удалить дату");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="customer-account">
      <header className="account-profile-head">
        <div>
          <p className="eyebrow">Личный кабинет</p>
          <h1>Здравствуйте, {name}</h1>
          <p>{email}</p>
        </div>
        <div className="account-profile-actions">
          <Link className="button button--light" href="/">В магазин</Link>
          <LogoutButton />
        </div>
      </header>

      <section className="bonus-card account-bonus-card" aria-labelledby="bonus-title">
        <h2 id="bonus-title">Бонусная программа</h2>
        <div className="account-bonus-card__balance">
          <strong>{bonusBalance === null ? "—" : bonusBalance.toLocaleString("ru-RU")}</strong>
          <b>бонусов</b>
        </div>
        <p>
          {bonusBalance === null
            ? "Баланс временно недоступен."
            : "После подтверждения email — 1 000 бонусов. До 10% участвующей в программе стоимости можно оплатить бонусами, а после оплаченного и выполненного заказа начислим ещё 5%."}
        </p>
        <Link className="text-link" href="/legal/bonus-program">Правила бонусной программы</Link>
      </section>

      <section className="reminders-section" aria-labelledby="reminders-title">
        <div className="account-section-heading">
          <div>
            <p className="eyebrow">События повторяются ежегодно</p>
            <h2 id="reminders-title">Мои важные даты</h2>
          </div>
          <button className="button button--navy" type="button" onClick={openNewReminder}>+ Добавить дату</button>
        </div>

        {editorOpen && (
          <ReminderForm
            key={editing?.id ?? "new"}
            reminder={editing}
            onCancel={() => { setEditorOpen(false); setEditing(undefined); }}
            onSaved={savedReminder}
          />
        )}

        {loadError && (
          <div className="account-error account-error--block" role="alert">
            <span>{loadError}</span>
            <button type="button" onClick={() => void loadReminders()}>Повторить</button>
          </div>
        )}

        {loading ? (
          <div className="account-loading" role="status">Загружаем важные даты…</div>
        ) : reminders.length ? (
          <div className="reminder-list">
            {reminders.map((reminder) => {
              const meta = EVENT_META[reminder.eventType];
              return (
                <article className="reminder-card" key={reminder.id}>
                  <div className="reminder-card__icon" aria-hidden="true">{meta.icon}</div>
                  <div className="reminder-card__content">
                    <span>{meta.label}{reminder.personName ? ` · ${reminder.personName}` : ""}</span>
                    <h3>{reminder.title}</h3>
                    <strong>{reminder.eventDay} {MONTHS[reminder.eventMonth - 1]}{reminder.eventYear ? ` · ${reminder.eventYear}` : ""}</strong>
                    <p>{notificationSummary(reminder)}</p>
                  </div>
                  <div className="reminder-card__actions">
                    <button type="button" onClick={() => openEdit(reminder)}>Изменить</button>
                    <button className="is-danger" type="button" onClick={() => void deleteReminder(reminder)} disabled={deletingId === reminder.id}>
                      {deletingId === reminder.id ? "Удаляем…" : "Удалить"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="account-empty">
            <span aria-hidden="true">🌷</span>
            <h3>Здесь появятся ваши важные даты</h3>
            <p>Добавьте день рождения, годовщину или праздник — напомним заранее.</p>
            <button className="button button--navy" type="button" onClick={openNewReminder}>Добавить первую дату</button>
          </div>
        )}
      </section>

      <PushNotifications />
    </div>
  );
}
