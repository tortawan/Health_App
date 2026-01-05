import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createSupabaseServerClient } from "@/lib/supabase";
import { FOOD_PROMPT, geminiClient } from "@/lib/gemini";
import { getEmbedder } from "@/lib/embedder";

// --- Rate Limiting Setup ---
// Create a new ratelimiter that allows 5 requests per 1 minute
// This protects your 1,500/day Gemini quota from being drained by a single script.
const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? Redis.fromEnv()
  : null;

const ratelimit = redis
  ? new Ratelimit({
      redis: redis,
      limiter: Ratelimit.slidingWindow(5, "60 s"),
      analytics: true,
      prefix: "health_app_analyze",
    })
  : null;
// ---------------------------

type GeminiItem = {
  food_name: string;
  search_term: string;
  quantity_estimate: string;
};

const FALLBACK: GeminiItem[] = [
  {
    food_name: "Grilled Chicken Breast",
    search_term: "grilled chicken breast",
    quantity_estimate: "medium portion, ~150g",
  },
  {
    food_name: "Steamed Broccoli",
    search_term: "steamed broccoli",
    quantity_estimate: "1 cup (~90g)",
  },
];

export async function POST(request: Request) {
  // 1. Rate Limit Check
  if (ratelimit) {
    const ip = (await headers()).get("x-forwarded-for") ?? "127.0.0.1";
    const { success } = await ratelimit.limit(ip);
    
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again in a minute." },
        { status: 429 }
      );
    }
  } else if (!redis && process.env.NODE_ENV === "production") {
    console.warn("Rate limiting is disabled. Configure UPSTASH_REDIS_REST_URL.");
  }

  const supabase = await createSupabaseServerClient();
  const formData = await request.formData();
  if ([...formData.keys()].length === 0) {
    return NextResponse.json(
      { error: "No form data received" },
      { status: 400 },
    );
  }

  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json(
      { error: "Image file is required" },
      { status: 400 },
    );
  }

  // Basic security check for file size (prevent OOM attacks)
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Image too large. Please upload an image under 5MB." },
      { status: 413 }
    );
  }

  const imageBuffer = Buffer.from(await file.arrayBuffer());
  const imageData = imageBuffer.toString("base64");
  const mimeType = file.type || "image/jpeg";

  let items: GeminiItem[] = FALLBACK;
  let usedFallback = true;

  if (geminiClient) {
    try {
      const model = geminiClient.getGenerativeModel({
        model: "gemini-1.5-flash",
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
      // Gemini might wrap JSON in markdown code blocks, strip them if needed
      const cleanJson = responseText.replace(/```json|```/g, "").trim();
      
      const parsed = JSON.parse(cleanJson);
      const parsedItems: GeminiItem[] = parsed.items ?? parsed ?? [];
      
      if (Array.isArray(parsedItems) && parsedItems.length) {
        items = parsedItems;
        usedFallback = false;
      } else {
        items = FALLBACK;
        usedFallback = true;
      }
    } catch (error) {
      console.warn("Gemini call failed, using fallback:", error);
      usedFallback = true;
    }
  }

  const embed = await getEmbedder();

  const drafts = await Promise.all(
    items.map(async (item) => {
      const { data: embedding } = await embed(item.search_term);

      const { data: matches } = await supabase.rpc("match_foods", {
        query_embedding: embedding,
        query_text: item.search_term,
        match_threshold: 0.6,
        match_count: 3,
      });

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
            similarity:
              top.similarity ??
              (typeof top.distance === "number" ? 1 - top.distance : null) ??
              null,
            text_rank: top.text_rank ?? null,
          }))
        : [];

      const top = mappedMatches[0] ?? null;

      return {
        ...item,
        match: top ?? undefined,
        matches: mappedMatches.slice(0, 3),
      };
    }),
  );

  return NextResponse.json({
    draft: drafts,
    imagePath: `data:${mimeType};base64,${imageData}`,
    usedFallback,
  });
}