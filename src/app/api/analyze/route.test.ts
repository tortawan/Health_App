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

const stubFetchOk = () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      headers: new Headers({ "content-type": "image/jpeg" }),
    }),
  );
};

describe("analyze route", () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    stubFetchOk();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns a draft for a valid upload", async () => {
    vi.resetModules();
    vi.doMock("@/lib/ratelimit", () => ({ analyzeLimiter: null }));
    vi.doMock("@/lib/embedder", () => ({
      getEmbedder: vi.fn().mockResolvedValue(async () => ({ data: [0.1], dims: 384 })),
    }));
    vi.doMock("@/lib/supabase", () => ({
      createSupabaseServerClient: vi.fn().mockResolvedValue(
        buildSupabaseMock({
          data: [
            {
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

    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageUrl: "http://example.com/image.jpg" }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.draft).toHaveLength(1);
    expect(payload.draft[0].match.description).toBe("Apple");
  });

  it("returns 400 for invalid content type", async () => {
    vi.resetModules();
    vi.doMock("@/lib/ratelimit", () => ({ analyzeLimiter: null }));
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

    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "nope",
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Unsupported Content-Type");
  });

  it("falls back when Gemini fails", async () => {
    vi.resetModules();
    const supabase = buildSupabaseMock({ data: [], error: null });
    vi.doMock("@/lib/ratelimit", () => ({ analyzeLimiter: null }));
    vi.doMock("@/lib/embedder", () => ({
      getEmbedder: vi.fn().mockResolvedValue(async () => ({ data: [0.1], dims: 384 })),
    }));
    vi.doMock("@/lib/supabase", () => ({
      createSupabaseServerClient: vi.fn().mockResolvedValue(supabase),
      createSupabaseServiceClient: vi.fn().mockReturnValue(null),
    }));
    vi.doMock("@/lib/gemini", () => ({
      FOOD_PROMPT: "prompt",
      MODEL_NAME: "model",
      geminiClient: mockGeminiClient(new Error("Boom")),
    }));
    const { POST } = await import("./route");

    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageUrl: "http://example.com/image.jpg" }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.usedFallback).toBe(true);
    expect(payload.noFoodDetected).toBe(true);
    expect(payload.draft).toHaveLength(0);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("returns 500 when match_foods RPC fails", async () => {
    vi.resetModules();
    vi.doMock("@/lib/ratelimit", () => ({ analyzeLimiter: null }));
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

    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageUrl: "http://example.com/image.jpg" }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.code).toBe("DB_RPC_ERROR");
  });

  it("derives an adaptive threshold from correction data", async () => {
    vi.resetModules();
    vi.doMock("@/lib/supabase", () => ({
      createSupabaseServerClient: vi.fn(),
      createSupabaseServiceClient: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            not: vi.fn().mockReturnValue({
              not: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({
                    data: [
                      { original_search: "apple", final_match_desc: "apple" },
                      { original_search: "banana", final_match_desc: "banana" },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    }));
    vi.doMock("@/lib/ratelimit", () => ({ analyzeLimiter: null }));
    vi.doMock("@/lib/gemini", () => ({
      FOOD_PROMPT: "prompt",
      MODEL_NAME: "model",
      geminiClient: null,
    }));
    const { __test__ } = await import("./route");

    const embed = vi.fn().mockImplementation(async (value: string) => {
      if (value === "apple") return { data: [1, 0], dims: 384 };
      return { data: [0, 1], dims: 384 };
    });

    const threshold = await __test__.deriveMatchThreshold(embed);
    expect(threshold).toBeGreaterThan(0.55);
    expect(threshold).toBeLessThanOrEqual(0.8);
  });
});
