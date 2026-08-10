"use client";

import type { FirebaseApp } from "firebase/app";
import type { MessagePayload, Messaging } from "firebase/messaging";
import {
  firebasePublicConfig,
  firebaseVapidKey,
  getFirebaseServiceWorkerUrl,
  isFirebasePublicConfigured,
  missingFirebasePublicEnvironmentVariables,
} from "./config";

const PUSH_ENABLED_STORAGE_KEY = "raduyka:push-enabled";
const PUSH_INSTALLATION_STORAGE_KEY = "raduyka:push-installation-id";
const REGISTRATION_TIMEOUT_MS = 20_000;

export type FirebasePushCapabilityReason =
  | "available"
  | "missing-config"
  | "unsupported"
  | "insecure-context";

export type FirebasePushCapability = {
  available: boolean;
  permission: NotificationPermission | "unsupported";
  reason: FirebasePushCapabilityReason;
  missingEnvironmentVariables: string[];
};

export type FirebasePushRegistration = {
  installationId: string;
  permission: "granted";
};

export type FirebasePushErrorCode =
  | "missing-config"
  | "unsupported"
  | "insecure-context"
  | "permission-denied"
  | "registration-timeout"
  | "server-sync-failed"
  | "registration-failed";

export class FirebasePushError extends Error {
  constructor(
    public readonly code: FirebasePushErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "FirebasePushError";
  }
}

type MessagingContext = {
  app: FirebaseApp;
  messaging: Messaging;
};

let messagingContextPromise: Promise<MessagingContext | null> | null = null;

function canUsePushApis() {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

function readStorage(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Push remains usable when storage is disabled; the next visit will simply
    // ask the user to enable it again instead of performing a silent refresh.
  }
}

function removeStorage(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // See writeStorage().
  }
}

async function getMessagingContext(): Promise<MessagingContext | null> {
  if (!isFirebasePublicConfigured || !canUsePushApis()) return null;
  if (messagingContextPromise) return messagingContextPromise;

  messagingContextPromise = (async () => {
    try {
      const [{ getApp, getApps, initializeApp }, messagingModule] =
        await Promise.all([import("firebase/app"), import("firebase/messaging")]);

      if (!(await messagingModule.isSupported())) return null;

      const app = getApps().length > 0 ? getApp() : initializeApp(firebasePublicConfig);
      return { app, messaging: messagingModule.getMessaging(app) };
    } catch {
      return null;
    }
  })();

  return messagingContextPromise;
}

async function requireMessagingContext() {
  if (!isFirebasePublicConfigured) {
    throw new FirebasePushError(
      "missing-config",
      "Push-уведомления пока не настроены.",
    );
  }

  if (!canUsePushApis()) {
    const secureContext =
      typeof window !== "undefined" && window.isSecureContext;
    throw new FirebasePushError(
      secureContext ? "unsupported" : "insecure-context",
      secureContext
        ? "Этот браузер не поддерживает push-уведомления."
        : "Push-уведомления доступны только через защищённое HTTPS-соединение.",
    );
  }

  const context = await getMessagingContext();
  if (!context) {
    throw new FirebasePushError(
      "unsupported",
      "Этот браузер не поддерживает push-уведомления.",
    );
  }

  return context;
}

async function syncInstallationWithServer(
  method: "POST" | "DELETE",
  installationId: string,
) {
  const response = await fetch("/api/push/subscriptions", {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ installationId }),
  });

  if (response.ok) return;

  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | null;
  throw new FirebasePushError(
    "server-sync-failed",
    payload?.error || "Не удалось сохранить настройки уведомлений.",
  );
}

async function registerAndPersist(): Promise<FirebasePushRegistration> {
  const { messaging } = await requireMessagingContext();
  const messagingModule = await import("firebase/messaging");
  const serviceWorkerRegistration = await navigator.serviceWorker.register(
    getFirebaseServiceWorkerUrl(),
    { scope: "/", updateViaCache: "none" },
  );

  let stopRegistered: (() => void) | undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const installationIdPromise = new Promise<string>((resolve, reject) => {
    stopRegistered = messagingModule.onRegistered(
      messaging,
      (installationId: string) => {
        if (installationId) resolve(installationId);
      },
    );
    timeoutId = setTimeout(
      () =>
        reject(
          new FirebasePushError(
            "registration-timeout",
            "Firebase не успел зарегистрировать это устройство. Попробуйте ещё раз.",
          ),
        ),
      REGISTRATION_TIMEOUT_MS,
    );
  });

  try {
    await messagingModule.register(messaging, {
      vapidKey: firebaseVapidKey,
      serviceWorkerRegistration,
    });
    const installationId = await installationIdPromise;
    await syncInstallationWithServer("POST", installationId);
    writeStorage(PUSH_ENABLED_STORAGE_KEY, "true");
    writeStorage(PUSH_INSTALLATION_STORAGE_KEY, installationId);
    return { installationId, permission: "granted" };
  } catch (error) {
    if (error instanceof FirebasePushError) throw error;
    throw new FirebasePushError(
      "registration-failed",
      "Не удалось включить push-уведомления. Попробуйте ещё раз.",
      { cause: error },
    );
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    stopRegistered?.();
  }
}

export function isFirebasePushEnabledOnThisDevice() {
  return (
    typeof window !== "undefined" &&
    readStorage(PUSH_ENABLED_STORAGE_KEY) === "true" &&
    typeof Notification !== "undefined" &&
    Notification.permission === "granted"
  );
}

/** Read-only capability check. It never opens the browser permission prompt. */
export async function getFirebasePushCapability(): Promise<FirebasePushCapability> {
  const permission =
    typeof Notification === "undefined"
      ? "unsupported"
      : Notification.permission;

  if (!isFirebasePublicConfigured) {
    return {
      available: false,
      permission,
      reason: "missing-config",
      missingEnvironmentVariables: [
        ...missingFirebasePublicEnvironmentVariables,
      ],
    };
  }

  if (typeof window === "undefined" || !window.isSecureContext) {
    return {
      available: false,
      permission,
      reason: "insecure-context",
      missingEnvironmentVariables: [],
    };
  }

  if (!canUsePushApis() || !(await getMessagingContext())) {
    return {
      available: false,
      permission,
      reason: "unsupported",
      missingEnvironmentVariables: [],
    };
  }

  return {
    available: true,
    permission,
    reason: "available",
    missingEnvironmentVariables: [],
  };
}

/**
 * Call only from the explicit "Включить уведомления" button handler. This is
 * the only helper that requests Notification permission.
 */
export async function enableFirebasePushNotifications() {
  if (!isFirebasePublicConfigured) {
    throw new FirebasePushError(
      "missing-config",
      "Push-уведомления пока не настроены.",
    );
  }

  if (!canUsePushApis()) {
    const secureContext =
      typeof window !== "undefined" && window.isSecureContext;
    throw new FirebasePushError(
      secureContext ? "unsupported" : "insecure-context",
      secureContext
        ? "Этот браузер не поддерживает push-уведомления."
        : "Push-уведомления доступны только через защищённое HTTPS-соединение.",
    );
  }

  if (Notification.permission === "denied") {
    throw new FirebasePushError(
      "permission-denied",
      "Уведомления запрещены в браузере. Разрешите их в настройках сайта.",
    );
  }

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();

  if (permission !== "granted") {
    throw new FirebasePushError(
      "permission-denied",
      "Сначала разрешите уведомления в браузере.",
    );
  }

  // Firebase initialization intentionally happens after requestPermission().
  // Keeping the permission call directly in the button's user activation is
  // required by browsers, especially WebKit.
  return registerAndPersist();
}

/**
 * Refreshes an already opted-in installation without showing a permission
 * prompt. Safe to call when the account page mounts.
 */
export async function syncFirebasePushRegistration() {
  if (
    typeof window === "undefined" ||
    readStorage(PUSH_ENABLED_STORAGE_KEY) !== "true" ||
    typeof Notification === "undefined" ||
    Notification.permission !== "granted"
  ) {
    return null;
  }

  return registerAndPersist();
}

export async function disableFirebasePushNotifications() {
  const storedInstallationId =
    typeof window === "undefined"
      ? null
      : readStorage(PUSH_INSTALLATION_STORAGE_KEY);

  let removedInstallationId = storedInstallationId;
  let unregisterError: unknown;
  const context = await getMessagingContext();

  if (context) {
    const messagingModule = await import("firebase/messaging");
    let stopUnregistered: (() => void) | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const unregisteredIdPromise = new Promise<string | null>((resolve) => {
      stopUnregistered = messagingModule.onUnregistered(
        context.messaging,
        (installationId: string) => resolve(installationId || null),
      );
      timeoutId = setTimeout(() => resolve(null), 3_000);
    });

    try {
      await messagingModule.unregister(context.messaging);
      removedInstallationId =
        (await unregisteredIdPromise) || removedInstallationId;
    } catch (error) {
      unregisterError = error;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      stopUnregistered?.();
    }
  }

  if (removedInstallationId) {
    // Keep the local identifier when the API call fails so the user can retry
    // disabling instead of leaving an unreachable active server-side record.
    await syncInstallationWithServer("DELETE", removedInstallationId);
  }

  removeStorage(PUSH_ENABLED_STORAGE_KEY);
  removeStorage(PUSH_INSTALLATION_STORAGE_KEY);

  if (unregisterError) {
    throw new FirebasePushError(
      "registration-failed",
      "Уведомления отключены в кабинете, но браузер не смог удалить локальную подписку.",
      { cause: unregisterError },
    );
  }
}

export async function onFirebaseForegroundMessage(
  callback: (payload: MessagePayload) => void,
) {
  const context = await getMessagingContext();
  if (!context) return () => undefined;

  const { onMessage } = await import("firebase/messaging");
  return onMessage(context.messaging, callback);
}
