import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase";
import { FOOD_PROMPT, MODEL_NAME, geminiClient } from "@/lib/gemini";
import { generateDraftId } from "@/lib/uuid";
import { getEmbedder } from "@/lib/embedder";
import { analyzeLimiter } from "@/lib/ratelimit";
import { logGeminiRequest } from "@/lib/logger";
import { Redis } from "@upstash/redis";

export const maxDuration = 60;

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

type GeminiItem = {
  food_name: string;
  search_term: string;
  quantity_estimate: string;
};

const IDENTIFICATION_FAILURE_PATTERN = /i can't identify|cannot identify|can't identify|unable to identify/i;

const parseNumberEnv = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseNumberValue = (value: string | null | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

type AnalyzeConfig = {
  circuitBreakerThreshold: number;
  circuitBreakerCooldownMs: number;
  matchThresholdBase: number;
  geminiModel: string;
};

const configCache = {
  value: null as AnalyzeConfig | null,
  expiresAt: 0,
};

async function getAnalyzeConfig(): Promise<AnalyzeConfig> {
  const now = Date.now();
  if (configCache.value && configCache.expiresAt > now) {
    return configCache.value;
  }

  const fallbackConfig: AnalyzeConfig = {
    circuitBreakerThreshold: parseNumberEnv(process.env.CIRCUIT_BREAKER_THRESHOLD, 3),
    circuitBreakerCooldownMs: parseNumberEnv(
      process.env.CIRCUIT_BREAKER_COOLDOWN_MS,
      60 * 1000,
    ),
    matchThresholdBase: parseNumberEnv(process.env.MATCH_THRESHOLD_BASE, 0.6),
    geminiModel: process.env.GEMINI_MODEL ?? MODEL_NAME,
  };

  const service = createSupabaseServiceClient();
  if (!service) {
    configCache.value = fallbackConfig;
    configCache.expiresAt = now + 60 * 1000;
    console.info("[Analyze] Config", fallbackConfig);
    return fallbackConfig;
  }

  const { data, error } = await service
    .from("app_config")
    .select("key, value")
    .in("key", [
      "MATCH_THRESHOLD_BASE",
      "CIRCUIT_BREAKER_THRESHOLD",
      "CIRCUIT_BREAKER_COOLDOWN_MS",
      "GEMINI_MODEL",
    ]);

  if (error) {
    console.warn("[Analyze] Failed to load app_config; using env defaults.", error);
    configCache.value = fallbackConfig;
    configCache.expiresAt = now + 60 * 1000;
    console.info("[Analyze] Config", fallbackConfig);
    return fallbackConfig;
  }

  const configByKey = new Map(data?.map((row) => [row.key, row.value]) ?? []);
  const resolvedConfig: AnalyzeConfig = {
    circuitBreakerThreshold: parseNumberValue(
      configByKey.get("CIRCUIT_BREAKER_THRESHOLD"),
      fallbackConfig.circuitBreakerThreshold,
    ),
    circuitBreakerCooldownMs: parseNumberValue(
      configByKey.get("CIRCUIT_BREAKER_COOLDOWN_MS"),
      fallbackConfig.circuitBreakerCooldownMs,
    ),
    matchThresholdBase: parseNumberValue(
      configByKey.get("MATCH_THRESHOLD_BASE"),
      fallbackConfig.matchThresholdBase,
    ),
    geminiModel: configByKey.get("GEMINI_MODEL") ?? fallbackConfig.geminiModel,
  };

  configCache.value = resolvedConfig;
  configCache.expiresAt = now + 60 * 1000;
  console.info("[Analyze] Config", resolvedConfig);
  return resolvedConfig;
}

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

if (!redis) {
  console.warn("[Analyze] Upstash Redis not configured; circuit breaker persistence disabled.");
}

const CIRCUIT_BREAKER_KEY = "gemini_cb_global";

type CircuitBreakerState = {
  failures: number;
  openedAt: number;
};
type ThresholdCacheEntry = {
  value: number;
  expiresAt: number;
  baseThreshold: number;
};

const adaptiveThresholdCache = new Map<string, ThresholdCacheEntry>();

class AnalyzeRequestError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "ANALYZE_REQUEST_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const defaultCircuitBreakerState: CircuitBreakerState = {
  failures: 0,
  openedAt: 0,
};

async function getCircuitBreakerState(): Promise<CircuitBreakerState> {
  if (!redis) return defaultCircuitBreakerState;
  const state = await redis.get<CircuitBreakerState>(CIRCUIT_BREAKER_KEY);
  return state ?? defaultCircuitBreakerState;
}

async function setCircuitBreakerState(state: CircuitBreakerState) {
  if (!redis) return;
  await redis.set(CIRCUIT_BREAKER_KEY, state);
}

async function clearCircuitBreakerState() {
  if (!redis) return;
  await redis.del(CIRCUIT_BREAKER_KEY);
}

async function isCircuitBreakerOpen(config: AnalyzeConfig) {
  const state = await getCircuitBreakerState();
  if (state.failures < config.circuitBreakerThreshold) {
    return false;
  }

  const openedAt = state.openedAt || Date.now();
  if (!state.openedAt) {
    console.warn("[Analyze] Circuit breaker opened.", {
      failures: state.failures,
      openedAt,
    });
    await setCircuitBreakerState({ failures: state.failures, openedAt });
  }

  const now = Date.now();
  if (now - openedAt > config.circuitBreakerCooldownMs) {
    await clearCircuitBreakerState();
    console.info("[Analyze] Circuit breaker closed after cooldown.", {
      cooldownMs: config.circuitBreakerCooldownMs,
    });
    return false;
  }

  return true;
}

async function recordGeminiFailure(config: AnalyzeConfig) {
  const state = await getCircuitBreakerState();
  const failures = state.failures + 1;
  const wasOpen =
    state.failures >= config.circuitBreakerThreshold && state.openedAt > 0;
  const shouldOpen = failures >= config.circuitBreakerThreshold;
  const openedAt = shouldOpen ? state.openedAt || Date.now() : state.openedAt;

  if (!wasOpen && shouldOpen) {
    console.warn("[Analyze] Circuit breaker opened.", {
      failures,
      openedAt,
    });
  }

  await setCircuitBreakerState({ failures, openedAt });
}

async function recordGeminiSuccess(config: AnalyzeConfig) {
  const state = await getCircuitBreakerState();
  const wasOpen =
    state.failures >= config.circuitBreakerThreshold && state.openedAt > 0;
  if (wasOpen || state.failures > 0) {
    console.info("[Analyze] Circuit breaker closed after success.");
  }
  await clearCircuitBreakerState();
}

async function validateAnalyzeRequest(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  const normalizedType = contentType.split(";")[0].trim().toLowerCase();
  if (!normalizedType.startsWith("image/")) {
    throw new AnalyzeRequestError(
      "Content-Type must be an image",
      400,
      "INVALID_CONTENT_TYPE",
    );
  }

  const arrayBuffer = await request.arrayBuffer();
  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    throw new AnalyzeRequestError("Request body is empty", 400, "EMPTY_BODY");
  }

  if (arrayBuffer.byteLength > MAX_IMAGE_SIZE_BYTES) {
    throw new AnalyzeRequestError("Image too large (>5MB)", 413, "PAYLOAD_TOO_LARGE");
  }

  const imageBuffer = Buffer.from(arrayBuffer);
  const mimeType = normalizedType || "image/jpeg";

  return {
    imageBuffer,
    mimeType,
  };
}

const createRequestId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const jsonError = (
  status: number,
  code: string,
  message: string,
  requestId: string,
) =>
  NextResponse.json(
    {
      code,
      message,
      requestId,
    },
    { status },
  );

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function deriveMatchThreshold({
  supabase,
  userId,
  baseThreshold,
}: {
  supabase: SupabaseClient;
  userId: string | null;
  baseThreshold: number;
}) {
  const now = Date.now();
  const cacheKey = userId ?? "anonymous";
  const cached = adaptiveThresholdCache.get(cacheKey);
  if (cached && cached.expiresAt > now && cached.baseThreshold === baseThreshold) {
    return cached.value;
  }

  if (!userId) {
    const value = Math.max(0.55, Math.min(0.85, baseThreshold));
    adaptiveThresholdCache.set(cacheKey, {
      value,
      expiresAt: now + 5 * 60 * 1000,
      baseThreshold,
    });
    console.info("[Analyze] Derived match threshold", {
      baseThreshold,
      correctionsCount: 0,
      finalThreshold: value,
      reason: "no_user",
    });
    return value;
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("ai_corrections")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("correction_type", "manual_match")
    .gte("logged_at", since);

  const correctionsCount = count ?? 0;
  if (error) {
    console.warn("[Analyze] Failed to load ai_corrections; using base threshold.", error);
  }

  let adjusted = baseThreshold;
  if (correctionsCount >= 5) {
    adjusted = baseThreshold + 0.05;
  } else if (correctionsCount >= 2) {
    adjusted = baseThreshold + 0.02;
  }

  const value = Math.max(0.55, Math.min(0.85, adjusted));

  adaptiveThresholdCache.set(cacheKey, {
    value,
    expiresAt: now + 5 * 60 * 1000,
    baseThreshold,
  });

  console.info("[Analyze] Derived match threshold", {
    baseThreshold,
    correctionsCount,
    finalThreshold: value,
  });

  return value;
}

async function logRequestMetrics({
  userId,
  durationMs,
  geminiStatus,
  matchThresholdUsed,
  matchesCount,
  rpcErrorCode,
}: {
  userId: string | null;
  durationMs: number;
  geminiStatus: "success" | "fail" | "cb_open";
  matchThresholdUsed: number | null;
  matchesCount: number | null;
  rpcErrorCode: string | null;
}) {
  try {
    const service = createSupabaseServiceClient();
    const client = service ?? (await createSupabaseServerClient());
    if (!client || typeof client.from !== "function") {
      console.warn("[Analyze] Metrics client unavailable; skipping request_metrics insert.");
      return;
    }

    const { error } = await client.from("request_metrics").insert({
      user_id: userId,
      duration_ms: durationMs,
      gemini_status: geminiStatus,
      match_threshold_used: matchThresholdUsed,
      matches_count: matchesCount,
      rpc_error_code: rpcErrorCode,
    });

    if (error) {
      console.warn("[Analyze] Failed to log request metrics", error);
    }
  } catch (error) {
    console.warn("[Analyze] Failed to log request metrics", error);
  }
}

export async function POST(request: Request) {
  const requestId = createRequestId();
  const requestStart = Date.now();
  let geminiStatus: "success" | "fail" | "cb_open" = "fail";
  let rpcErrorCode: string | null = null;
  let matchThresholdUsed: number | null = null;
  let matchesCount: number | null = null;
  let userId: string | null = null;
  const config = await getAnalyzeConfig();

  try {
    // 1. Rate Limit Check
    const ip = (await headers()).get("x-forwarded-for") ?? "127.0.0.1";
    const { success } = await analyzeLimiter.limit(ip);

    if (!success) {
      return jsonError(
        429,
        "RATE_LIMITED",
        "Too many requests. Please try again in a minute.",
        requestId,
      );
    }
    const supabase = await createSupabaseServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    userId = session?.user?.id ?? null;
    const { imageBuffer, mimeType } = await validateAnalyzeRequest(request);

    // 2. Process with Gemini
    const imageData = imageBuffer.toString("base64");
    let items: GeminiItem[] = [];
    let usedFallback = false;
    let noFoodDetectedReason: string | null = null;

    if (geminiClient && !(await isCircuitBreakerOpen(config))) {
      const geminiStart = Date.now();
      try {
        const model = geminiClient.getGenerativeModel({
          model: config.geminiModel,
        });

        const result = await model.generateContent({
          contents: [
            {
              role: "user",
              parts: [
                { text: FOOD_PROMPT },
                {
                  inlineData: {
                    data: imageData,
                    mimeType,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
          },
        });

        const responseText = result.response.text();
        const duration = Date.now() - geminiStart;

        if (IDENTIFICATION_FAILURE_PATTERN.test(responseText)) {
          logGeminiRequest({ duration, status: "fallback", reason: "unidentifiable" });
          usedFallback = true;
          noFoodDetectedReason = "unidentifiable";
          geminiStatus = "fail";
          await recordGeminiFailure(config);
        } else {
          const cleanJson = responseText.replace(/```json|```/g, "").trim();
          const parsed = JSON.parse(cleanJson);
          const parsedItems: GeminiItem[] = parsed.items ?? parsed ?? [];

          if (Array.isArray(parsedItems) && parsedItems.length) {
            items = parsedItems;
            usedFallback = false;
            logGeminiRequest({ duration, status: "success" });
            geminiStatus = "success";
            await recordGeminiSuccess(config);
          } else {
            logGeminiRequest({ duration, status: "fallback", reason: "empty_result" });
            usedFallback = true;
            noFoodDetectedReason = "empty_result";
            geminiStatus = "fail";
            await recordGeminiFailure(config);
          }
        }
      } catch (error) {
        const duration = Date.now() - geminiStart;
        const statusCode =
          typeof error === "object" && error && "status" in error
            ? Number((error as { status?: number }).status)
            : undefined;
        const reason = statusCode ? `http_${statusCode}` : "exception";

        logGeminiRequest({ duration, status: "failure", reason });
        usedFallback = true;
        noFoodDetectedReason = "gemini_error";
        geminiStatus = "fail";
        await recordGeminiFailure(config);
        console.warn("Gemini call failed, using fallback:", error);
      }
    } else if (!geminiClient) {
      usedFallback = true;
      noFoodDetectedReason = "gemini_unavailable";
      geminiStatus = "fail";
    } else {
      usedFallback = true;
      noFoodDetectedReason = "circuit_breaker_open";
      geminiStatus = "cb_open";
    }

    // 3. Match with Database (Embeddings)
    const embed = await getEmbedder();
    const matchThreshold = await deriveMatchThreshold({
      supabase,
      userId,
      baseThreshold: config.matchThresholdBase,
    });
    const noFoodDetected = items.length === 0;

    const drafts = [];
    const matchCount = Number(3);
    const matchThresholdValue = Number(matchThreshold);
    matchThresholdUsed = matchThresholdValue;
    let totalMatches = 0;

    for (const item of items) {
      const { data: queryEmbedding } = await embed(item.search_term);
      const queryText = item.search_term ?? null;

      console.log("match_foods payload", {
        query_embedding: queryEmbedding ? `dims=${queryEmbedding.length}` : null,
        query_text: queryText,
        match_threshold: matchThresholdValue,
        match_count: matchCount,
        p_user_id: userId,
      });

      const { data: matches, error: rpcError } = await supabase.rpc("match_foods", {
        query_embedding: queryEmbedding ?? null,
        query_text: queryText,
        match_threshold: matchThresholdValue,
        match_count: matchCount,
        p_user_id: userId,
      });

      if (rpcError) {
        console.error("match_foods RPC failed", { rpcError, queryText, userId });
        rpcErrorCode = (rpcError as { code?: string; message?: string })?.code ?? rpcError.message;
        void logRequestMetrics({
          userId,
          durationMs: Date.now() - requestStart,
          geminiStatus,
          matchThresholdUsed,
          matchesCount: totalMatches,
          rpcErrorCode,
        });
        return jsonError(500, "DB_RPC_ERROR", "match_foods failed", requestId);
      }

      const mappedMatches = Array.isArray(matches)
        ? matches.map((top) => ({
            usda_id:
              (top as { usda_id?: number | null }).usda_id ??
              (top as { id?: number | null }).id ??
              null,
            description: top.description,
            kcal_100g: top.kcal_100g,
            protein_100g: top.protein_100g,
            carbs_100g: top.carbs_100g,
            fat_100g: top.fat_100g,
            fiber_100g: top.fiber_100g,
            sugar_100g: top.sugar_100g,
            sodium_100g: top.sodium_100g,
            similarity: top.similarity ?? (typeof top.distance === "number" ? 1 - top.distance : null) ?? null,
            text_rank: top.text_rank ?? null,
          }))
        : [];
      totalMatches += mappedMatches.length;

      drafts.push({
        id: generateDraftId(),
        ...item,
        match: mappedMatches[0] ?? undefined,
        matches: mappedMatches.slice(0, 3),
      });
    }

    matchesCount = totalMatches;
    void logRequestMetrics({
      userId,
      durationMs: Date.now() - requestStart,
      geminiStatus,
      matchThresholdUsed,
      matchesCount,
      rpcErrorCode,
    });
    return NextResponse.json({
      draft: drafts,
      imagePath: `data:${mimeType};base64,${imageData}`,
      usedFallback,
      noFoodDetected,
      noFoodDetectedReason,
    });
  } catch (error) {
    if (error instanceof AnalyzeRequestError) {
      void logRequestMetrics({
        userId,
        durationMs: Date.now() - requestStart,
        geminiStatus,
        matchThresholdUsed,
        matchesCount,
        rpcErrorCode,
      });
      return jsonError(error.status, error.code, error.message, requestId);
    }
    console.error("[Analyze] Unhandled error:", error);
    void logRequestMetrics({
      userId,
      durationMs: Date.now() - requestStart,
      geminiStatus,
      matchThresholdUsed,
      matchesCount,
      rpcErrorCode,
    });
    return jsonError(
      500,
      "INTERNAL_SERVER_ERROR",
      "Failed to analyze image.",
      requestId,
    );
  }
}

export const __test__ = {
  deriveMatchThreshold,
  parseNumberEnv,
};
