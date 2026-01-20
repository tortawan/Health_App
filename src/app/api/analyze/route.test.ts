import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const buildSupabaseMock = (rpcResult: { data: unknown; error: unknown }) => ({
  rpc: vi.fn().mockResolvedValue(rpcResult),
  auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
  },
});

const mockGeminiClient = (payload: string | Error) => ({
  getGenerativeModel: vi.fn().mockReturnValue({
    generateContent: vi.fn().mockImplementation(() => {
      if (payload instanceof Error) {
        throw payload;
      }
      return {
        response: {
          text: () => payload,
        },
      };
    }),
  }),
});

const buildLimiter = () => ({
  limit: vi.fn().mockResolvedValue({ success: true }),
});

const mockNextHeaders = () => {
  vi.doMock("next/headers", () => ({
    headers: vi.fn().mockReturnValue(new Headers({ "x-forwarded-for": "127.0.0.1" })),
  }));
};

const buildImageRequest = (body: Uint8Array | ArrayBuffer, contentType = "image/jpeg") =>
  new Request("http://localhost/api/analyze", {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });

describe("analyze route", () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.CIRCUIT_BREAKER_THRESHOLD;
    delete process.env.CIRCUIT_BREAKER_COOLDOWN_MS;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns a draft for a valid upload", async () => {
    vi.resetModules();
    mockNextHeaders();
    vi.doMock("@/lib/ratelimit", () => ({ analyzeLimiter: buildLimiter() }));
    vi.doMock("@/lib/embedder", () => ({
      getEmbedder: vi.fn().mockResolvedValue(async () => ({ data: [0.1], dims: 384 })),
    }));
    vi.doMock("@/lib/supabase", () => ({
      createSupabaseServerClient: vi.fn().mockResolvedValue(
        buildSupabaseMock({
          data: [
            {
              id: 42,
              description: "Apple",
              kcal_100g: 52,
              protein_100g: 0.3,
              carbs_100g: 14,
              fat_100g: 0.2,
              fiber_100g: 2.4,
              sugar_100g: 10,
              sodium_100g: 1,
              similarity: 0.9,
            },
          ],
          error: null,
        }),
      ),
      createSupabaseServiceClient: vi.fn().mockReturnValue(null),
    }));
    vi.doMock("@/lib/gemini", () => ({
      FOOD_PROMPT: "prompt",
      MODEL_NAME: "model",
      geminiClient: mockGeminiClient(
        JSON.stringify({
          items: [
            {
              food_name: "Apple",
              search_term: "apple",
              quantity_estimate: "1 medium",
            },
          ],
        }),
      ),
    }));
    const { POST } = await import("./route");

    const request = buildImageRequest(new Uint8Array([1, 2, 3]));

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.draft).toHaveLength(1);
    expect(payload.draft[0].match.description).toBe("Apple");
  });

  it("returns 400 for invalid content type", async () => {
    vi.resetModules();
    mockNextHeaders();
    vi.doMock("@/lib/ratelimit", () => ({ analyzeLimiter: buildLimiter() }));
    vi.doMock("@/lib/supabase", () => ({
      createSupabaseServerClient: vi.fn().mockResolvedValue(buildSupabaseMock({ data: [], error: null })),
      createSupabaseServiceClient: vi.fn().mockReturnValue(null),
    }));
    vi.doMock("@/lib/gemini", () => ({
      FOOD_PROMPT: "prompt",
      MODEL_NAME: "model",
      geminiClient: null,
    }));
    const { POST } = await import("./route");

    const request = buildImageRequest(new Uint8Array([1, 2, 3]), "text/plain");

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.code).toBe("INVALID_CONTENT_TYPE");
    expect(payload.requestId).toBeTruthy();
  });

  it("returns 400 for empty body", async () => {
    vi.resetModules();
    mockNextHeaders();
    vi.doMock("@/lib/ratelimit", () => ({ analyzeLimiter: buildLimiter() }));
    vi.doMock("@/lib/supabase", () => ({
      createSupabaseServerClient: vi.fn().mockResolvedValue(buildSupabaseMock({ data: [], error: null })),
      createSupabaseServiceClient: vi.fn().mockReturnValue(null),
    }));
    vi.doMock("@/lib/gemini", () => ({
      FOOD_PROMPT: "prompt",
      MODEL_NAME: "model",
      geminiClient: null,
    }));
    const { POST } = await import("./route");

    const request = buildImageRequest(new Uint8Array());

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.code).toBe("EMPTY_BODY");
    expect(payload.requestId).toBeTruthy();
  });

  it("returns 413 for payloads larger than 5MB", async () => {
    vi.resetModules();
    mockNextHeaders();
    vi.doMock("@/lib/ratelimit", () => ({ analyzeLimiter: buildLimiter() }));
    vi.doMock("@/lib/supabase", () => ({
      createSupabaseServerClient: vi.fn().mockResolvedValue(buildSupabaseMock({ data: [], error: null })),
      createSupabaseServiceClient: vi.fn().mockReturnValue(null),
    }));
    vi.doMock("@/lib/gemini", () => ({
      FOOD_PROMPT: "prompt",
      MODEL_NAME: "model",
      geminiClient: null,
    }));
    const { POST } = await import("./route");

    const request = buildImageRequest(new Uint8Array(5 * 1024 * 1024 + 1));

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(413);
    expect(payload.code).toBe("PAYLOAD_TOO_LARGE");
    expect(payload.requestId).toBeTruthy();
  });

  it("returns 500 when match_foods RPC fails", async () => {
    vi.resetModules();
    mockNextHeaders();
    vi.doMock("@/lib/ratelimit", () => ({ analyzeLimiter: buildLimiter() }));
    vi.doMock("@/lib/embedder", () => ({
      getEmbedder: vi.fn().mockResolvedValue(async () => ({ data: [0.1], dims: 384 })),
    }));
    vi.doMock("@/lib/supabase", () => ({
      createSupabaseServerClient: vi.fn().mockResolvedValue(
        buildSupabaseMock({ data: null, error: { message: "rpc failed" } }),
      ),
      createSupabaseServiceClient: vi.fn().mockReturnValue(null),
    }));
    vi.doMock("@/lib/gemini", () => ({
      FOOD_PROMPT: "prompt",
      MODEL_NAME: "model",
      geminiClient: mockGeminiClient(
        JSON.stringify({
          items: [
            { food_name: "Apple", search_term: "apple", quantity_estimate: "1" },
          ],
        }),
      ),
    }));
    const { POST } = await import("./route");

    const request = buildImageRequest(new Uint8Array([1, 2, 3]));

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.code).toBe("DB_RPC_ERROR");
    expect(payload.requestId).toBeTruthy();
  });

  it("returns fallback when circuit breaker is open", async () => {
    vi.resetModules();
    mockNextHeaders();
    process.env.UPSTASH_REDIS_REST_URL = "https://example.com";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    process.env.CIRCUIT_BREAKER_THRESHOLD = "1";

    const redisState = { failures: 1, openedAt: Date.now() };

    vi.doMock("@upstash/redis", () => ({
      Redis: class {
        get = vi.fn().mockResolvedValue(redisState);
        set = vi.fn().mockResolvedValue(null);
        del = vi.fn().mockResolvedValue(null);
      },
    }));
    vi.doMock("@/lib/ratelimit", () => ({ analyzeLimiter: buildLimiter() }));
    vi.doMock("@/lib/embedder", () => ({
      getEmbedder: vi.fn().mockResolvedValue(async () => ({ data: [0.1], dims: 384 })),
    }));
    vi.doMock("@/lib/supabase", () => ({
      createSupabaseServerClient: vi.fn().mockResolvedValue(buildSupabaseMock({ data: [], error: null })),
      createSupabaseServiceClient: vi.fn().mockReturnValue(null),
    }));
    vi.doMock("@/lib/gemini", () => ({
      FOOD_PROMPT: "prompt",
      MODEL_NAME: "model",
      geminiClient: mockGeminiClient(
        JSON.stringify({
          items: [
            { food_name: "Apple", search_term: "apple", quantity_estimate: "1" },
          ],
        }),
      ),
    }));
    const { POST } = await import("./route");

    const request = buildImageRequest(new Uint8Array([1, 2, 3]));

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.usedFallback).toBe(true);
    expect(payload.noFoodDetectedReason).toBe("circuit_breaker_open");
  });

  it("derives an adaptive threshold from correction data", async () => {
    vi.resetModules();
    vi.doMock("@/lib/supabase", () => ({
      createSupabaseServerClient: vi.fn(),
      createSupabaseServiceClient: vi.fn().mockReturnValue(null),
    }));
    vi.doMock("@/lib/ratelimit", () => ({ analyzeLimiter: buildLimiter() }));
    vi.doMock("@/lib/gemini", () => ({
      FOOD_PROMPT: "prompt",
      MODEL_NAME: "model",
      geminiClient: null,
    }));
    const { __test__ } = await import("./route");

    const gte = vi.fn().mockResolvedValue({ count: 6, error: null });
    const eqSecond = vi.fn().mockReturnValue({ gte });
    const eqFirst = vi.fn().mockReturnValue({ eq: eqSecond });
    const select = vi.fn().mockReturnValue({ eq: eqFirst });
    const supabase = {
      from: vi.fn().mockReturnValue({ select }),
    };

    const threshold = await __test__.deriveMatchThreshold({
      supabase: supabase as unknown as any,
      userId: "user-123",
      baseThreshold: 0.6,
    });
    expect(threshold).toBeGreaterThan(0.6);
    expect(threshold).toBeLessThanOrEqual(0.85);
  });
});
