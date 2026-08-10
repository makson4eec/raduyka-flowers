import "server-only";

import {
  cert,
  getApp,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";

let cachedApp: App | null | undefined;

function firebaseAdminCredentials() {
  const projectId =
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ||
    "";
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim() ?? "";
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY ?? "";
  const privateKey = rawPrivateKey.replace(/\\n/g, "\n").trim();

  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

export function isFirebaseAdminConfigured() {
  return firebaseAdminCredentials() !== null;
}

/** Lazy and nullable so builds and the storefront work without external keys. */
export function getFirebaseAdminApp(): App | null {
  if (cachedApp !== undefined) return cachedApp;

  const credentials = firebaseAdminCredentials();
  if (!credentials) {
    cachedApp = null;
    return cachedApp;
  }

  try {
    cachedApp =
      getApps().length > 0
        ? getApp()
        : initializeApp({ credential: cert(credentials) });
  } catch {
    cachedApp = null;
  }

  return cachedApp;
}

export function getFirebaseAdminMessaging(): Messaging | null {
  const app = getFirebaseAdminApp();
  return app ? getMessaging(app) : null;
}
