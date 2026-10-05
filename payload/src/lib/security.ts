import net from 'node:net'
import { APIError, ValidationError } from 'payload'
import type { PayloadRequest } from 'payload'

// ---------------------------------------------------------------------------
// Shared OWASP helpers (A04/A06/A07/A09)
// ---------------------------------------------------------------------------

/** Extract best-effort client IP for rate-limit keys (works behind compose). */
export function getClientIp(req: PayloadRequest): string {
  const headers = req.headers as unknown as Headers
  const raw =
    headers?.get?.('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers?.get?.('x-real-ip')?.trim() ||
    ''
  if (raw && net.isIP(raw)) {
    return raw
  }
  return 'unknown'
}

// --- Minimal sliding-window rate limiter ------------------------------------
// Runs in the Payload Node runtime (so it works for REST + GraphQL).
// Primary store: Redis via ioredis when REDIS_URL is set (covers multi-replica).
// Fallback: in-memory Map (single instance, homework-safe). Upstash-compatible:
// point REDIS_URL at an Upstash Redis TLS endpoint and it just works, because
// ioredis speaks the Redis protocol over TCP/TLS.
type Bucket = { count: number; resetAt: number }
const memoryBuckets = new Map<string, Bucket>()

let redis: import('ioredis').default | null = null
let redisFailed = false

async function getRedis(): Promise<import('ioredis').default | null> {
  const url = process.env.REDIS_URL
  if (!url || redisFailed) return null
  if (redis) return redis
  try {
    const { default: IORedis } = await import('ioredis')
    redis = new IORedis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: false,
    })
    redis.on('error', () => {
      redisFailed = true
    })
    return redis
  } catch {
    redisFailed = true
    return null
  }
}

/**
 * Consume 1 point from a `limit`-per-`windowMs` bucket.
 * Throws 429 APIError when exhausted (fail-closed for abuse, fail-open to
 * memory when Redis is unreachable so a Redis outage never locks everyone out).
 */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<void> {
  const client = await getRedis()
  if (client && !redisFailed) {
    try {
      const now = Date.now()
      const redisKey = `ratelimit:${key}`
      // Atomic-ish fixed window via pipeline: INCR + PTTL + EXPIRE on first hit.
      const pipe = client.pipeline()
      pipe.incr(redisKey)
      pipe.pttl(redisKey)
      const results = await pipe.exec()
      const count = (results?.[0]?.[1] as number) ?? 1
      const ttl = (results?.[1]?.[1] as number) ?? -1
      if (count === 1 || ttl < 0) {
        await client.pexpire(redisKey, windowMs)
      }
      if (count > limit) {
        throw new APIError('Too many requests. Please slow down.', 429)
      }
      return
    } catch (err) {
      if (err instanceof APIError) throw err
      redisFailed = true // fall through to memory
    }
  }

  const now = Date.now()

  // Evict expired buckets when memory size exceeds threshold (A05/DoS protection)
  if (memoryBuckets.size > 5000) {
    for (const [k, b] of memoryBuckets.entries()) {
      if (now >= b.resetAt) memoryBuckets.delete(k)
    }
  }

  const bucket = memoryBuckets.get(key)
  if (!bucket || now >= bucket.resetAt) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowMs })
    return
  }
  bucket.count += 1
  if (bucket.count > limit) {
    throw new APIError('Too many requests. Please slow down.', 429)
  }
}

// Pre-tuned buckets (Strict lockdown)
export const loginRateLimit = (req: PayloadRequest, scope: string) =>
  consumeRateLimit(`login:${scope}:${getClientIp(req)}`, 10, 60_000) // 10/min/IP
export const forgotRateLimit = (req: PayloadRequest, scope: string) =>
  consumeRateLimit(`forgot:${scope}:${getClientIp(req)}`, 3, 10 * 60_000) // 3/10min/IP
export const registerRateLimit = (req: PayloadRequest, scope: string) =>
  consumeRateLimit(`register:${scope}:${getClientIp(req)}`, 5, 60 * 60_000) // 5/hour/IP

// --- Password policy (A04/A07 Strict: min 12 + 3 of 4 classes) ---------------
export function enforcePasswordPolicy(password: unknown): void {
  if (typeof password !== 'string' || password.length < 12) {
    throw new ValidationError({
      errors: [{ path: 'password', message: 'Password must be at least 12 characters.' }],
    })
  }
  const classes = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length
  if (classes < 3) {
    throw new ValidationError({
      errors: [
        {
          path: 'password',
          message:
            'Password must include at least 3 of: lowercase, uppercase, digit, symbol.',
        },
      ],
    })
  }
}

// --- Audit log helper (A09) --------------------------------------------------
export function auditLog(
  req: PayloadRequest | undefined | null,
  event: string,
  details: Record<string, unknown> = {},
): void {
  if (!req) return
  try {
    req.payload.logger.info({
      msg: `audit:${event}`,
      ip: getClientIp(req),
      collection: req.user?.collection ?? null,
      userId: req.user?.id ?? null,
      ...details,
    })
  } catch {
    // Logging must never break the request path (A10).
  }
}
