import type { FirebaseOptions } from "firebase/app";

const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() ?? "";
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() ?? "";
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ?? "";
const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() ?? "";
const messagingSenderId =
  process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim() ?? "";
const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim() ?? "";

export const firebasePublicConfig: FirebaseOptions = Object.freeze({
  apiKey,
  authDomain,
  projectId,
  storageBucket,
  messagingSenderId,
  appId,
});

export const firebaseVapidKey =
  process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.trim() ?? "";

const requiredPublicValues = [
  ["NEXT_PUBLIC_FIREBASE_API_KEY", apiKey],
  ["NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", authDomain],
  ["NEXT_PUBLIC_FIREBASE_PROJECT_ID", projectId],
  ["NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", storageBucket],
  ["NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", messagingSenderId],
  ["NEXT_PUBLIC_FIREBASE_APP_ID", appId],
  ["NEXT_PUBLIC_FIREBASE_VAPID_KEY", firebaseVapidKey],
] as const;

export const missingFirebasePublicEnvironmentVariables = requiredPublicValues
  .filter(([, value]) => !value)
  .map(([name]) => name);

export const isFirebasePublicConfigured =
  missingFirebasePublicEnvironmentVariables.length === 0;

/**
 * Files from `public` are not processed by Next.js, so the service worker cannot
 * read `process.env`. Only Firebase's public web identifiers are passed in its
 * script URL. Firebase documents these values as public, non-secret config.
 */
export function getFirebaseServiceWorkerUrl() {
  if (!isFirebasePublicConfigured) return "/firebase-messaging-sw.js";

  const parameters = new URLSearchParams({
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
  });

  return `/firebase-messaging-sw.js?${parameters.toString()}`;
}
