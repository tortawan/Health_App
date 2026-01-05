import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// 1. Initialize Redis safely (Fail-open if env vars are missing)
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

// 2. Initialize Rate Limiter (5 requests per 1 minute sliding window)
const limiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "1 m"),
      analytics: true,
      prefix: "ratelimit:analyze",
    })
  : null;

/**
 * Determines the unique identifier for the user.
 * Prioritizes Logged-in User ID > IP Address.
 */
function getUserKey(request: NextRequest) {
  const authCookie = request.cookies.getAll().find((c) => c.name.includes("auth-token"));

  if (authCookie?.value) {
    try {
      const parts = authCookie.value.split(".");
      if (parts.length === 3) {
        const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const decoded = atob(normalized);
        const payload = JSON.parse(decoded);
        if (payload?.sub) return `user:${payload.sub}`;
      }
    } catch {
      // If token parsing fails, fallback to IP
    }
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.ip ??
    "anonymous";
  return `ip:${ip}`;
}

export async function middleware(request: NextRequest) {
  // Only rate limit the analysis endpoint
  if (!request.nextUrl.pathname.startsWith("/api/analyze")) {
    return NextResponse.next();
  }

  // Fail open if Redis is not configured
  if (!limiter) {
    return NextResponse.next();
  }

  const key = getUserKey(request);
  
  // 3. Check the limit and grab metadata (limit, remaining, reset)
  const { success, reset, limit, remaining } = await limiter.limit(key);

  // 4. Handle Rejection
  if (!success) {
    const retryAfter = reset
      ? Math.max(0, Math.ceil((reset - Date.now()) / 1000))
      : 60;

    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": retryAfter.toString(),
          "X-RateLimit-Limit": limit.toString(),
          "X-RateLimit-Remaining": remaining.toString(),
          "X-RateLimit-Reset": reset.toString(),
        },
      },
    );
  }

  // 5. Handle Success (Inject Visibility Headers)
  const res = NextResponse.next();
  res.headers.set("X-RateLimit-Limit", limit.toString());
  res.headers.set("X-RateLimit-Remaining", remaining.toString());
  res.headers.set("X-RateLimit-Reset", reset.toString());

  return res;
}

export const config = {
  matcher: ["/api/analyze"],
};