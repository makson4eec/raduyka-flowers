/* global firebase */
"use strict";

// This file is served verbatim from `public`, so it cannot read Next.js env
// variables. The registration helper passes only Firebase's public web config
// in the service-worker URL. Service-account credentials must never be added.
const parameters = new URL(self.location.href).searchParams;
const firebaseConfig = {
  apiKey: parameters.get("apiKey") || "",
  authDomain: parameters.get("authDomain") || "",
  projectId: parameters.get("projectId") || "",
  storageBucket: parameters.get("storageBucket") || "",
  messagingSenderId: parameters.get("messagingSenderId") || "",
  appId: parameters.get("appId") || "",
};

const configured = Object.values(firebaseConfig).every(Boolean);

if (configured) {
  try {
    // Firebase recommends the compat build for an unbundled service worker.
    // Keep this pinned to the installed client SDK major/minor.
    importScripts(
      "https://www.gstatic.com/firebasejs/12.17.1/firebase-app-compat.js",
      "https://www.gstatic.com/firebasejs/12.17.1/firebase-messaging-compat.js",
    );

    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    firebase.messaging();
  } catch (error) {
    // A missing config or temporary CDN failure must not break the storefront.
    console.warn("Firebase messaging service worker is unavailable.", error);
  }
}
