import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? Redis.fromEnv()
    : null;

function buildLimiter(limit: number, interval: `${number} s` | `${number} m`, prefix: string) {
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, interval),
    analytics: true,
    prefix,
  });
}

export const analyzeLimiter = buildLimiter(5, "60 s", "health_app_analyze");
export const logCorrectionLimiter = buildLimiter(10, "60 s", "health_app_log_correction");
export { redis as rateLimitRedis };
