import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

const limiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 h"),
      analytics: true,
      prefix: "ratelimit:analyze",
    })
  : null;

function getUserKey(request: NextRequest) {
  const rawToken =
    request.cookies.get("sb-access-token")?.value ??
    request.cookies.get("supabase-auth-token")?.value;

  if (rawToken) {
    try {
      const parts = rawToken.split(".");
      if (parts.length === 3) {
        const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const decoded = atob(normalized);
        const payload = JSON.parse(decoded);
        if (payload?.sub) return `user:${payload.sub}`;
      }
    } catch {
      // Fallback to IP below
    }
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.ip ??
    "anonymous";
  return `ip:${ip}`;
}

export async function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/analyze")) {
    return NextResponse.next();
  }

  if (!limiter) {
    return NextResponse.next();
  }

  const key = getUserKey(request);
  const { success, reset } = await limiter.limit(key);

  if (!success) {
    const retryAfter = reset
      ? Math.max(0, Math.ceil((reset - Date.now()) / 1000))
      : 3600;

    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": retryAfter.toString(),
        },
      },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/analyze"],
};
