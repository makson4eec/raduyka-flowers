import "server-only";

import { createHash, randomUUID } from "node:crypto";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

const buckets = new Map<string, RateLimitBucket>();
const MAX_RATE_LIMIT_BUCKETS = 10_000;
let lastCleanupAt = 0;

export class HttpSecurityError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpSecurityError";
  }
}

function cleanClientAddress(value: string | null) {
  const candidate = value?.split(",", 1)[0]?.trim() ?? "";
  return candidate && candidate.length <= 100 ? candidate : null;
}

function clientAddress(request: Request) {
  // Vercel overwrites these headers at its trusted edge. Outside Vercel we
  // intentionally use one shared bucket: accepting arbitrary forwarding
  // headers from a direct client would make the limiter trivially spoofable.
  if (process.env.VERCEL === "1") {
    return (
      cleanClientAddress(request.headers.get("x-vercel-forwarded-for"))
      ?? cleanClientAddress(request.headers.get("x-forwarded-for"))
      ?? "vercel-unknown"
    );
  }

  return "untrusted-proxy";
}

function opaqueRateLimitKey(scope: string, identifier: string) {
  return createHash("sha256")
    .update(scope)
    .update("\0")
    .update(identifier)
    .digest("base64url");
}

function cleanupExpiredBuckets(now: number) {
  if (
    now - lastCleanupAt < 60_000
    && buckets.size < MAX_RATE_LIMIT_BUCKETS
  ) {
    return;
  }

  lastCleanupAt = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }

  if (buckets.size <= MAX_RATE_LIMIT_BUCKETS) return;
  const overflow = buckets.size - MAX_RATE_LIMIT_BUCKETS;
  let removed = 0;
  for (const key of buckets.keys()) {
    buckets.delete(key);
    removed += 1;
    if (removed >= overflow) break;
  }
}

function consumeRateLimitKey(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  cleanupExpiredBuckets(now);

  const safeLimit = Math.max(1, Math.trunc(limit));
  const safeWindowMs = Math.max(1_000, Math.trunc(windowMs));
  let bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + safeWindowMs };
    buckets.set(key, bucket);
  }

  if (bucket.count >= safeLimit) {
    return {
      allowed: false,
      limit: safeLimit,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000)),
    };
  }

  bucket.count += 1;
  return {
    allowed: true,
    limit: safeLimit,
    remaining: Math.max(0, safeLimit - bucket.count),
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000)),
  };
}

/**
 * A lightweight per-instance limiter. It protects local/self-hosted installs
 * and is defense in depth on serverless. Production should additionally use a
 * distributed limiter or the hosting provider's WAF/rate-limit rules.
 */
export function consumeRequestRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowMs: number,
) {
  return consumeRateLimitKey(
    opaqueRateLimitKey(scope, clientAddress(request)),
    limit,
    windowMs,
  );
}

export function consumeIdentifierRateLimit(
  scope: string,
  identifier: string,
  limit: number,
  windowMs: number,
) {
  return consumeRateLimitKey(
    opaqueRateLimitKey(scope, identifier),
    limit,
    windowMs,
  );
}

export function clearRequestRateLimit(request: Request, scope: string) {
  buckets.delete(opaqueRateLimitKey(scope, clientAddress(request)));
}

export function rateLimitHeaders(result: RateLimitResult) {
  const headers = new Headers({
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
  });
  if (!result.allowed) {
    headers.set("Retry-After", String(result.retryAfterSeconds));
  }
  return headers;
}

export function isSameOriginMutation(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return false;
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    return fetchSite === "same-origin" || fetchSite === "none";
  }

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function assertSameOriginMutation(request: Request) {
  if (!isSameOriginMutation(request)) {
    throw new HttpSecurityError(403, "Недопустимый источник запроса.");
  }
}

export function requestContentLength(request: Request) {
  const raw = request.headers.get("content-length");
  if (!raw || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

export function assertRequestSize(
  request: Request,
  maximumBytes: number,
  options: { requireLength?: boolean } = {},
) {
  const length = requestContentLength(request);
  if (options.requireLength && length === null) {
    throw new HttpSecurityError(411, "Не указан размер запроса.");
  }
  if (length !== null && length > maximumBytes) {
    throw new HttpSecurityError(413, "Запрос слишком большой.");
  }
}

function mediaType(request: Request) {
  return request.headers.get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase() ?? "";
}

export function assertMediaType(request: Request, allowed: readonly string[]) {
  if (!allowed.includes(mediaType(request))) {
    throw new HttpSecurityError(415, "Неподдерживаемый формат запроса.");
  }
}

export async function readJsonBody(
  request: Request,
  maximumBytes = 64 * 1_024,
): Promise<unknown> {
  assertMediaType(request, ["application/json"]);
  assertRequestSize(request, maximumBytes);

  if (!request.body) {
    throw new HttpSecurityError(400, "Пустой запрос.");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new HttpSecurityError(413, "Запрос слишком большой.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof HttpSecurityError) throw error;
    throw new HttpSecurityError(400, "Отправлены некорректные данные.");
  }
}

export function noStoreJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  return Response.json(body, { ...init, headers });
}

export function securityErrorResponse(error: unknown) {
  if (error instanceof HttpSecurityError) {
    return noStoreJson({ error: error.message }, { status: error.status });
  }

  const requestId = randomUUID();
  console.error("Unhandled API error", { requestId, error });
  return noStoreJson(
    { error: "Внутренняя ошибка сервера.", requestId },
    { status: 500 },
  );
}
