'use strict';

/**
 * Small dependency-free fixed-window rate limiter.
 *
 * For a single-node deployment this is enough and keeps the dependency tree
 * small. If the API is scaled horizontally, put a shared limiter (Redis or
 * the platform edge) in front of it.
 */
function rateLimit({ windowMs = 60_000, max = 60, keyGenerator, message = 'Too many requests, please slow down' } = {}) {
  const buckets = new Map();

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, Math.max(windowMs, 30_000));
  cleanup.unref?.();

  return function rateLimitMiddleware(req, res, next) {
    const key = keyGenerator ? keyGenerator(req) : (req.ip || req.socket?.remoteAddress || 'unknown');
    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ message });
    }

    return next();
  };
}

module.exports = rateLimit;
