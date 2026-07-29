import type { NextFunction, Request, Response } from 'express';
import { ApiError } from './http.js';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Small in-memory sliding-window rate limiter. Suitable for a single-process
 * self-hosted deployment (the only supported topology).
 */
export function rateLimit(opts: {
  windowMs: number;
  max: number;
  key?: (req: Request) => string;
}): (req: Request, res: Response, next: NextFunction) => void {
  const buckets = new Map<string, Bucket>();
  return (req, _res, next) => {
    const nowMs = Date.now();
    const key = (opts.key ? opts.key(req) : req.ip ?? 'unknown') + ':' + req.path;
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= nowMs) {
      bucket = { count: 0, resetAt: nowMs + opts.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (buckets.size > 10000) {
      for (const [k, b] of buckets) if (b.resetAt <= nowMs) buckets.delete(k);
    }
    if (bucket.count > opts.max) {
      next(new ApiError(429, 'rate_limited', 'Too many requests, try again later'));
      return;
    }
    next();
  };
}
