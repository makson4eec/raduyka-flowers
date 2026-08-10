import "server-only";

import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = process.env.NODE_ENV === "production"
  ? "__Host-raduyka_admin"
  : "raduyka_admin";
export const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 8;

export const ADMIN_PASSWORD_MIN_LENGTH = process.env.NODE_ENV === "production" ? 16 : 1;
const ADMIN_SESSION_SECRET_MIN_LENGTH = 32;
const TOKEN_VERSION = "v1";

function looksLikePlaceholder(value: string) {
  return /^(?:<[^>]+>|change[-_ ]?me|example|placeholder)$/i.test(value);
}

function configuredPassword() {
  return process.env.ADMIN_PASSWORD?.trim() ?? "";
}

function configuredSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET?.trim() ?? "";
}

function signingSecret() {
  const password = configuredPassword();
  const sessionSecret = configuredSessionSecret();

  if (
    password.length < ADMIN_PASSWORD_MIN_LENGTH
    || looksLikePlaceholder(password)
  ) return null;
  if (
    process.env.NODE_ENV === "production"
    && (
      sessionSecret.length < ADMIN_SESSION_SECRET_MIN_LENGTH
      || looksLikePlaceholder(sessionSecret)
    )
  ) {
    return null;
  }

  // Development remains usable before a separate secret is configured, while
  // production fails closed. The password is included so rotating it revokes
  // every existing session immediately.
  return createHash("sha256")
    .update("raduyka-admin-session-v1")
    .update("\0")
    .update(sessionSecret || "development-only-session-secret")
    .update("\0")
    .update(password)
    .digest();
}

function sameText(left: string, right: string) {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function sign(payload: string, secret: Buffer) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function adminConfigurationIssues() {
  const issues: string[] = [];
  const password = configuredPassword();
  const sessionSecret = configuredSessionSecret();
  if (
    password.length < ADMIN_PASSWORD_MIN_LENGTH
    || looksLikePlaceholder(password)
  ) {
    issues.push(`ADMIN_PASSWORD должен содержать не менее ${ADMIN_PASSWORD_MIN_LENGTH} символов.`);
  }
  if (
    process.env.NODE_ENV === "production"
    && (
      sessionSecret.length < ADMIN_SESSION_SECRET_MIN_LENGTH
      || looksLikePlaceholder(sessionSecret)
    )
  ) {
    issues.push(`ADMIN_SESSION_SECRET должен содержать не менее ${ADMIN_SESSION_SECRET_MIN_LENGTH} символов.`);
  }
  return issues;
}

export function passwordIsConfigured() {
  return adminConfigurationIssues().length === 0;
}

export function passwordIsValid(value: string) {
  const expected = configuredPassword();
  return (
    passwordIsConfigured()
    && value.length <= 256
    && sameText(value, expected)
  );
}

export function createAdminSessionToken(now = Date.now()) {
  const secret = signingSecret();
  if (!secret) return "";

  const issuedAt = Math.floor(now / 1_000);
  const expiresAt = issuedAt + ADMIN_SESSION_TTL_SECONDS;
  const payload = [
    TOKEN_VERSION,
    String(issuedAt),
    String(expiresAt),
    randomUUID(),
  ].join(".");
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyAdminSessionToken(token: string, now = Date.now()) {
  const secret = signingSecret();
  if (!secret || token.length > 512) return false;

  const parts = token.split(".");
  if (parts.length !== 5) return false;
  const [version, rawIssuedAt, rawExpiresAt, nonce, signature] = parts;
  if (version !== TOKEN_VERSION) return false;
  if (!/^\d{10}$/.test(rawIssuedAt) || !/^\d{10}$/.test(rawExpiresAt)) {
    return false;
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(nonce)) {
    return false;
  }

  const issuedAt = Number(rawIssuedAt);
  const expiresAt = Number(rawExpiresAt);
  const nowSeconds = Math.floor(now / 1_000);
  if (
    !Number.isSafeInteger(issuedAt)
    || !Number.isSafeInteger(expiresAt)
    || issuedAt > nowSeconds + 60
    || expiresAt <= nowSeconds
    || expiresAt - issuedAt !== ADMIN_SESSION_TTL_SECONDS
  ) {
    return false;
  }

  const payload = parts.slice(0, 4).join(".");
  return sameText(signature, sign(payload, secret));
}

export async function isAdmin() {
  const actual = (await cookies()).get(ADMIN_COOKIE)?.value ?? "";
  return verifyAdminSessionToken(actual);
}

export async function getAuthorizedAdmin() {
  return (await isAdmin()) ? { displayName: "Владелец" } : null;
}

export function unauthorizedResponse() {
  return Response.json(
    { error: "Сессия завершилась. Войдите в панель снова." },
    {
      status: 401,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        Pragma: "no-cache",
      },
    },
  );
}
