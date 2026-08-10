import "server-only";

import type { FidMulticastMessage } from "firebase-admin/messaging";
import { getFirebaseAdminMessaging } from "./admin";

const FCM_MULTICAST_LIMIT = 500;
const INVALID_TARGET_ERROR_CODES = new Set([
  "messaging/installation-id-not-registered",
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-recipient",
]);

export type FirebasePushFailure = {
  installationId: string;
  code: string;
};

export type FirebasePushBatchResult = {
  configured: boolean;
  successCount: number;
  failureCount: number;
  failures: FirebasePushFailure[];
  invalidInstallationIds: string[];
  batchErrors: string[];
};

export type FirebasePushMessage = {
  installationIds: string[];
  title: string;
  body: string;
  link?: string;
  data?: Record<string, string>;
};

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function errorCode(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return "messaging/unknown-error";
}

function safeErrorName(error: unknown) {
  const code = errorCode(error);
  return code === "messaging/unknown-error" ? "Firebase send failed" : code;
}

function httpsLink(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Sends the same reminder to all of a user's registered Firebase FIDs. */
export async function sendFirebasePushToInstallations(
  message: FirebasePushMessage,
): Promise<FirebasePushBatchResult> {
  const messaging = getFirebaseAdminMessaging();
  const installationIds = [
    ...new Set(
      message.installationIds
        .map((installationId) => installationId.trim())
        .filter(Boolean),
    ),
  ];

  const result: FirebasePushBatchResult = {
    configured: Boolean(messaging),
    successCount: 0,
    failureCount: 0,
    failures: [],
    invalidInstallationIds: [],
    batchErrors: [],
  };

  if (!messaging || installationIds.length === 0) return result;

  const link = httpsLink(message.link);
  const invalidIds = new Set<string>();

  for (const batch of chunks(installationIds, FCM_MULTICAST_LIMIT)) {
    const payload: FidMulticastMessage = {
      fids: batch,
      notification: {
        title: message.title,
        body: message.body,
      },
      data: {
        kind: "reminder",
        ...(link ? { link } : {}),
        ...message.data,
      },
      webpush: {
        headers: {
          TTL: "86400",
          Urgency: "normal",
        },
        ...(link ? { fcmOptions: { link } } : {}),
      },
    };

    try {
      const response = await messaging.sendEachForMulticast(payload);
      result.successCount += response.successCount;
      result.failureCount += response.failureCount;

      response.responses.forEach((sendResponse, index) => {
        if (sendResponse.success) return;
        const installationId = batch[index];
        const code = errorCode(sendResponse.error);
        result.failures.push({ installationId, code });
        if (INVALID_TARGET_ERROR_CODES.has(code)) invalidIds.add(installationId);
      });
    } catch (error) {
      result.failureCount += batch.length;
      result.batchErrors.push(safeErrorName(error));
    }
  }

  result.invalidInstallationIds = [...invalidIds];
  return result;
}
