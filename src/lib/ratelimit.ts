// src/lib/ratelimit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { env } from './env';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export const analyzeLimiter = new Ratelimit({
  redis: redis,
  // 30 requests per day per IP
  limiter: Ratelimit.slidingWindow(30, '24 h'),
  analytics: true,
});
