"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  disableFirebasePushNotifications,
  enableFirebasePushNotifications,
  FirebasePushError,
  getFirebasePushCapability,
  isFirebasePushEnabledOnThisDevice,
  onFirebaseForegroundMessage,
  syncFirebasePushRegistration,
  type FirebasePushCapability,
} from "@/lib/firebase/client";

type PushState = "checking" | "disabled" | "enabling" | "enabled" | "disabling";

function capabilityHint(capability: FirebasePushCapability | null) {
  if (!capability) return "Проверяем поддержку браузера…";
  if (capability.reason === "missing-config") {
    return "Push пока не настроен. Важные даты всё равно можно сохранять в кабинете.";
  }
  if (capability.reason === "insecure-context") {
    return "Push работает через HTTPS. Для локальной проверки используйте localhost.";
  }
  if (capability.reason === "unsupported") {
    return "Этот браузер не поддерживает Web Push. Попробуйте актуальный Chrome, Edge, Firefox или Safari.";
  }
  if (capability.permission === "denied") {
    return "Уведомления запрещены в настройках браузера. Разрешите их для этого сайта и обновите страницу.";
  }
  return "Разрешение появится только после нажатия кнопки — автоматически мы его не запрашиваем.";
}

export default function PushNotifications() {
  const [state, setState] = useState<PushState>("checking");
  const [capability, setCapability] = useState<FirebasePushCapability | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let stopForeground: (() => void) | undefined;

    void getFirebasePushCapability().then(async (nextCapability) => {
      if (!active) return;
      setCapability(nextCapability);
      const enabled = isFirebasePushEnabledOnThisDevice();
      setState(enabled ? "enabled" : "disabled");

      if (enabled && nextCapability.available) {
        try {
          await syncFirebasePushRegistration();
        } catch {
          // A background refresh failure should not switch off a subscription
          // that is still granted in the browser.
        }
      }

      stopForeground = await onFirebaseForegroundMessage((payload) => {
        if (!active) return;
        setMessage(payload.notification?.body || "Новое напоминание от Радуйки.");
      });
    });

    return () => {
      active = false;
      stopForeground?.();
    };
  }, []);

  async function enable() {
    if (state === "enabling") return;
    setState("enabling");
    setError("");
    setMessage("");
    try {
      await enableFirebasePushNotifications();
      setState("enabled");
      setMessage("Уведомления включены для этого устройства.");
      setCapability(await getFirebasePushCapability());
    } catch (pushError) {
      setState("disabled");
      setError(
        pushError instanceof FirebasePushError
          ? pushError.message
          : "Не удалось включить уведомления. Попробуйте ещё раз.",
      );
      setCapability(await getFirebasePushCapability());
    }
  }

  async function disable() {
    if (state === "disabling") return;
    setState("disabling");
    setError("");
    setMessage("");
    try {
      await disableFirebasePushNotifications();
      setState("disabled");
      setMessage("Уведомления отключены на этом устройстве.");
    } catch (pushError) {
      setState("disabled");
      setError(
        pushError instanceof FirebasePushError
          ? pushError.message
          : "Не удалось полностью отключить уведомления.",
      );
    }
  }

  const enabled = state === "enabled" || state === "disabling";
  const unavailable = state === "checking" || !capability?.available || capability.permission === "denied";

  return (
    <section className={`push-card ${enabled ? "push-card--enabled" : ""}`} aria-labelledby="push-title">
      <div className="push-card__icon" aria-hidden="true">🔔</div>
      <div className="push-card__copy">
        <p className="eyebrow">Уведомления</p>
        <h2 id="push-title">Не пропустите важный день</h2>
        <p>Получайте только сервисные напоминания о датах, которые вы сами сохранили.</p>
        <small>{enabled ? "Уведомления включены" : capabilityHint(capability)} Подробнее: <Link href="/legal/privacy">персональные данные</Link>.</small>
        {message && <p className="account-success" role="status">{message}</p>}
        {error && <p className="account-error" role="alert">{error}</p>}
      </div>
      <div className="push-card__action">
        {enabled ? (
          <button className="button button--light" type="button" onClick={() => void disable()} disabled={state === "disabling"}>
            {state === "disabling" ? "Отключаем…" : "Отключить на этом устройстве"}
          </button>
        ) : (
          <button className="button button--navy" type="button" onClick={() => void enable()} disabled={unavailable || state === "enabling"}>
            {state === "enabling" ? "Включаем…" : "🔔 Включить уведомления"}
          </button>
        )}
      </div>
    </section>
  );
}
