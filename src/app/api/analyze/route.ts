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

const CIRCUIT_BREAKER_THRESHOLD = parseNumberEnv(process.env.CIRCUIT_BREAKER_THRESHOLD, 3);
const CIRCUIT_BREAKER_COOLDOWN_MS = parseNumberEnv(
  process.env.CIRCUIT_BREAKER_COOLDOWN_MS,
  60 * 1000,
);
const MATCH_THRESHOLD_BASE = parseNumberEnv(process.env.MATCH_THRESHOLD_BASE, 0.6);

console.info("[Analyze] Config", {
  circuitBreakerThreshold: CIRCUIT_BREAKER_THRESHOLD,
  circuitBreakerCooldownMs: CIRCUIT_BREAKER_COOLDOWN_MS,
  matchThresholdBase: MATCH_THRESHOLD_BASE,
});

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
let adaptiveThresholdCache = {
  value: MATCH_THRESHOLD_BASE,
  expiresAt: 0,
};

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

async function isCircuitBreakerOpen() {
  const state = await getCircuitBreakerState();
  if (state.failures < CIRCUIT_BREAKER_THRESHOLD) {
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
  if (now - openedAt > CIRCUIT_BREAKER_COOLDOWN_MS) {
    await clearCircuitBreakerState();
    console.info("[Analyze] Circuit breaker closed after cooldown.", { cooldownMs: CIRCUIT_BREAKER_COOLDOWN_MS });
    return false;
  }

  return true;
}

async function recordGeminiFailure() {
  const state = await getCircuitBreakerState();
  const failures = state.failures + 1;
  const wasOpen = state.failures >= CIRCUIT_BREAKER_THRESHOLD && state.openedAt > 0;
  const shouldOpen = failures >= CIRCUIT_BREAKER_THRESHOLD;
  const openedAt = shouldOpen ? state.openedAt || Date.now() : state.openedAt;

  if (!wasOpen && shouldOpen) {
    console.warn("[Analyze] Circuit breaker opened.", {
      failures,
      openedAt,
    });
  }

  await setCircuitBreakerState({ failures, openedAt });
}

async function recordGeminiSuccess() {
  const state = await getCircuitBreakerState();
  const wasOpen = state.failures >= CIRCUIT_BREAKER_THRESHOLD && state.openedAt > 0;
  if (wasOpen || state.failures > 0) {
    console.info("[Analyze] Circuit breaker closed after success.");
  }
  await clearCircuitBreakerState();
}

async function validateAnalyzeRequest(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  let imageBuffer: Buffer;
  let mimeType: string;

  if (contentType.includes("application/json")) {
    const body = await request.json();
    const imageUrl = typeof body?.imageUrl === "string" ? body.imageUrl : "";

    if (!imageUrl) {
      throw new AnalyzeRequestError("No imageUrl provided", 400);
    }

    console.log(`[Analyze] Fetching image from: ${imageUrl}`);
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      console.error(`[Analyze] Failed to fetch image: ${imgRes.status}`);
      throw new AnalyzeRequestError("Failed to download image from URL", 400);
    }

    const arrayBuffer = await imgRes.arrayBuffer();
    imageBuffer = Buffer.from(arrayBuffer);
    mimeType = imgRes.headers.get("content-type") || "image/jpeg";
  } else if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      throw new AnalyzeRequestError("Image file is required", 400);
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new AnalyzeRequestError("Image too large (>5MB)", 413);
    }

    imageBuffer = Buffer.from(await file.arrayBuffer());
    mimeType = file.type || "image/jpeg";
  } else {
    throw new AnalyzeRequestError("Unsupported Content-Type", 400);
  }

  return {
    imageBuffer,
    mimeType,
  };
}

function cosineSimilarity(a: number[], b: number[]) {
  const length = Math.min(a.length, b.length);
  if (!length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom ? dot / denom : 0;
}

async function deriveMatchThreshold(embed: Awaited<ReturnType<typeof getEmbedder>>) {
  const now = Date.now();
  if (adaptiveThresholdCache.expiresAt > now) {
    return adaptiveThresholdCache.value;
  }

  const service = createSupabaseServiceClient();
  if (!service) {
    adaptiveThresholdCache = {
      value: MATCH_THRESHOLD_BASE,
      expiresAt: now + 5 * 60 * 1000,
    };
    return MATCH_THRESHOLD_BASE;
  }

  const { data, error } = await service
    .from("ai_corrections")
    .select("original_search, final_match_desc")
    .not("original_search", "is", null)
    .not("final_match_desc", "is", null)
    .order("logged_at", { ascending: false })
    .limit(25);

  if (error || !data?.length) {
    adaptiveThresholdCache = {
      value: MATCH_THRESHOLD_BASE,
      expiresAt: now + 5 * 60 * 1000,
    };
    return MATCH_THRESHOLD_BASE;
  }

  const similarities: number[] = [];
  for (const entry of data) {
    const [search, final] = await Promise.all([
      embed(entry.original_search ?? ""),
      embed(entry.final_match_desc ?? ""),
    ]);

    const similarity = cosineSimilarity(search.data, final.data);
    if (Number.isFinite(similarity)) {
      similarities.push(similarity);
    }
  }

  if (!similarities.length) {
    adaptiveThresholdCache = {
      value: MATCH_THRESHOLD_BASE,
      expiresAt: now + 5 * 60 * 1000,
    };
    return MATCH_THRESHOLD_BASE;
  }

  const sorted = [...similarities].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const lowestAccepted = sorted[0];
  const tuned = Math.max(0.55, Math.min(0.85, (median ?? MATCH_THRESHOLD_BASE) - 0.05));
  const buffered = Math.max(0.55, Math.min(0.8, (lowestAccepted ?? MATCH_THRESHOLD_BASE) - 0.02));
  const value = Math.max(0.55, Math.min(0.8, Math.min(tuned, buffered)));

  adaptiveThresholdCache = {
    value,
    expiresAt: now + 10 * 60 * 1000,
  };

  return value;
}

export async function POST(request: Request) {
  try {
    // 1. Rate Limit Check
    if (analyzeLimiter) {
      const ip = (await headers()).get("x-forwarded-for") ?? "127.0.0.1";
      const { success } = await analyzeLimiter.limit(ip);

      if (!success) {
        return NextResponse.json(
          { error: "Too many requests. Please try again in a minute." },
          { status: 429 },
        );
      }
    }
    const supabase = await createSupabaseServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id ?? null;
    const { imageBuffer, mimeType } = await validateAnalyzeRequest(request);

    // 2. Process with Gemini
    const imageData = imageBuffer.toString("base64");
    let items: GeminiItem[] = [];
    let usedFallback = false;
    let noFoodDetectedReason: string | null = null;

    if (geminiClient && !(await isCircuitBreakerOpen())) {
      const geminiStart = Date.now();
      try {
        const model = geminiClient.getGenerativeModel({
          model: MODEL_NAME,
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
          await recordGeminiFailure();
        } else {
          const cleanJson = responseText.replace(/```json|```/g, "").trim();
          const parsed = JSON.parse(cleanJson);
          const parsedItems: GeminiItem[] = parsed.items ?? parsed ?? [];

          if (Array.isArray(parsedItems) && parsedItems.length) {
            items = parsedItems;
            usedFallback = false;
            logGeminiRequest({ duration, status: "success" });
            await recordGeminiSuccess();
          } else {
            logGeminiRequest({ duration, status: "fallback", reason: "empty_result" });
            usedFallback = true;
            noFoodDetectedReason = "empty_result";
            await recordGeminiFailure();
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
        await recordGeminiFailure();
        console.warn("Gemini call failed, using fallback:", error);
      }
    } else if (!geminiClient) {
      usedFallback = true;
      noFoodDetectedReason = "gemini_unavailable";
    } else {
      usedFallback = true;
      noFoodDetectedReason = "circuit_breaker_open";
    }

    // 3. Match with Database (Embeddings)
    const embed = await getEmbedder();
    const matchThreshold = await deriveMatchThreshold(embed);
    const noFoodDetected = items.length === 0;

    const drafts = [];
    const matchCount = Number(3);
    const matchThresholdValue = Number(matchThreshold);

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
        return NextResponse.json(
          { code: "DB_RPC_ERROR", error: "match_foods failed", detail: rpcError.message },
          { status: 500 },
        );
      }

      const mappedMatches = Array.isArray(matches)
        ? matches.map((top) => ({
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

      drafts.push({
        id: generateDraftId(),
        ...item,
        match: mappedMatches[0] ?? undefined,
        matches: mappedMatches.slice(0, 3),
      });
    }

    return NextResponse.json({
      draft: drafts,
      imagePath: `data:${mimeType};base64,${imageData}`,
      usedFallback,
      noFoodDetected,
      noFoodDetectedReason,
    });
  } catch (error) {
    if (error instanceof AnalyzeRequestError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    console.error("[Analyze] Unhandled error:", error);
    return NextResponse.json({ error: "Failed to analyze image." }, { status: 500 });
  }
}

export const __test__ = {
  deriveMatchThreshold,
  parseNumberEnv,
};
