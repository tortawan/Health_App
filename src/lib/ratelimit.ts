// src/lib/ratelimit.ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const hasUpstash =
  Boolean(process.env.UPSTASH_REDIS_REST_URL) &&
  Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);

let warned = false;

const allowAllLimiter = {
  limit: async () => {
    if (!warned) {
      console.warn("[Analyze] Upstash rate limiter not configured; allowing requests.");
      warned = true;
    }
    return { success: true, limit: 0, remaining: 0, reset: Date.now() };
  },
};

export const analyzeLimiter = hasUpstash
  ? new Ratelimit({
      redis: new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL as string,
        token: process.env.UPSTASH_REDIS_REST_TOKEN as string,
      }),
      // 30 requests per day per IP
      limiter: Ratelimit.slidingWindow(30, "24 h"),
      analytics: true,
    })
  : allowAllLimiter;
