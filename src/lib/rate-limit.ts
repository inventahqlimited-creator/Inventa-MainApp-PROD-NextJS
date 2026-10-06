// src/lib/rate-limit.ts
// Simple in-memory sliding-window rate limiter.
// It counts per server instance, which is enough to stop brute force and email bombing from one source;
// if the app is ever scaled to many machines, swap the store for a shared one (Redis/Upstash) without changing callers.

type Hit = number[]
const store = new Map<string, Hit>()
const MAX_KEYS = 20_000

export type LimitResult = { ok: boolean; retryAfter: number; remaining: number }

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): LimitResult {
  const cutoff = now - windowMs
  const hits = (store.get(key) ?? []).filter(t => t > cutoff)
  if (hits.length >= limit) {
    store.set(key, hits)
    return { ok: false, retryAfter: Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000)), remaining: 0 }
  }
  hits.push(now)
  store.set(key, hits)
  if (store.size > MAX_KEYS) prune(now, windowMs)
  return { ok: true, retryAfter: 0, remaining: limit - hits.length }
}

function prune(now: number, windowMs: number) {
  for (const [k, hits] of store) {
    if (!hits.length || hits[hits.length - 1] <= now - windowMs) store.delete(k)
    if (store.size <= MAX_KEYS / 2) break
  }
}

/** Best guess at the real client address behind Fly's proxy. */
export function clientIp(headers: Headers): string {
  return (
    headers.get('fly-client-ip') ||
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    'unknown'
  )
}

export function resetRateLimits() { store.clear() }
