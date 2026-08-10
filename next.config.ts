import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV !== "production";
const isHttpsDeployment =
  process.env.VERCEL === "1"
  || process.env.DEPLOYMENT_HTTPS_ONLY === "true";

const firebaseConnectSources = [
  "https://firebaseinstallations.googleapis.com",
  "https://fcmregistrations.googleapis.com",
];

const supabaseOrigin = (() => {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!configuredUrl) return null;

  try {
    return new URL(configuredUrl).origin;
  } catch {
    return null;
  }
})();

const imageSources = ["'self'", "data:", "blob:", ...(supabaseOrigin ? [supabaseOrigin] : [])];
const connectSources = ["'self'", ...firebaseConnectSources, ...(supabaseOrigin ? [supabaseOrigin] : [])];

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  `img-src ${imageSources.join(" ")}`,
  "font-src 'self' data:",
  `connect-src ${connectSources.join(" ")}`,
  "frame-src https://yandex.ru",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isHttpsDeployment ? ["upgrade-insecure-requests"] : []),
].join("; ");

const firebaseWorkerContentSecurityPolicy = [
  "default-src 'none'",
  "script-src https://www.gstatic.com",
  `connect-src ${firebaseConnectSources.join(" ")}`,
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy,
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
  {
    key: "Cross-Origin-Resource-Policy",
    value: "same-origin",
  },
  {
    key: "X-DNS-Prefetch-Control",
    value: "off",
  },
  {
    key: "X-Download-Options",
    value: "noopen",
  },
  {
    key: "Origin-Agent-Cluster",
    value: "?1",
  },
  ...(isHttpsDeployment
    ? [{
        key: "Strict-Transport-Security",
        value: "max-age=31536000",
      }]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        source: "/firebase-messaging-sw.js",
        headers: [{
          key: "Content-Security-Policy",
          value: firebaseWorkerContentSecurityPolicy,
        }],
      },
    ];
  },
};

export default nextConfig;
