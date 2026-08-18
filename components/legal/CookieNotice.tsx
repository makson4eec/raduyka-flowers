"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "raduyka-cookie-notice-v1";
const CHANGE_EVENT = "raduyka-cookie-notice-change";

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(CHANGE_EVENT, onStoreChange);
  };
}

function getSnapshot() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "seen";
  } catch {
    return true;
  }
}

function getServerSnapshot() {
  return false;
}

export default function CookieNotice() {
  const visible = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  if (!visible) return null;

  return (
    <aside className="cookie-notice" aria-label="Уведомление о cookies">
      <p>
        Сайт использует технически необходимые cookies и локальное хранилище
        для входа, безопасности и сохранения настроек. Подробнее — в{" "}
        <Link href="/legal/cookies">Политике cookies</Link>.
      </p>

      <button
        type="button"
        onClick={() => {
          try {
            window.localStorage.setItem(STORAGE_KEY, "seen");
          } catch {
            // localStorage может быть недоступен в приватном режиме.
          }

          window.dispatchEvent(new Event(CHANGE_EVENT));
        }}
      >
        Понятно
      </button>
    </aside>
  );
}