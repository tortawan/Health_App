import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase";
import { FOOD_PROMPT, geminiClient } from "@/lib/gemini";
import { generateDraftId } from "@/lib/uuid";
import { getEmbedder } from "@/lib/embedder";
import { analyzeLimiter } from "@/lib/ratelimit";

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

const MATCH_THRESHOLD_BASE = 0.6;
let adaptiveThresholdCache = {
  value: MATCH_THRESHOLD_BASE,
  expiresAt: 0,
};

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
  // 1. Rate Limit Check
  if (analyzeLimiter) {
    const ip = (await headers()).get("x-forwarded-for") ?? "127.0.0.1";
    const { success } = await analyzeLimiter.limit(ip);
    
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again in a minute." },
        { status: 429 }
      );
    }
  }

  const supabase = await createSupabaseServerClient();
  const contentType = request.headers.get("content-type") || "";
  
  let imageBuffer: Buffer;
  let mimeType: string;

  // 2. Handle Input (JSON URL or File Upload)
  try {
    if (contentType.includes("application/json")) {
      // Case A: Client sent { imageUrl: "..." }
      const body = await request.json();
      const { imageUrl } = body;
      
      if (!imageUrl) {
        return NextResponse.json({ error: "No imageUrl provided" }, { status: 400 });
      }

      console.log(`[Analyze] Fetching image from: ${imageUrl}`);
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) {
        console.error(`[Analyze] Failed to fetch image: ${imgRes.status}`);
        return NextResponse.json({ error: "Failed to download image from URL" }, { status: 400 });
      }

      const arrayBuffer = await imgRes.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
      mimeType = imgRes.headers.get("content-type") || "image/jpeg";

    } else if (contentType.includes("multipart/form-data")) {
      // Case B: Client sent FormData with 'file'
      const formData = await request.formData();
      const file = formData.get("file") as File | null;

      if (!file) {
        return NextResponse.json({ error: "Image file is required" }, { status: 400 });
      }

      if (file.size > 5 * 1024 * 1024) {
        return NextResponse.json({ error: "Image too large (>5MB)" }, { status: 413 });
      }

      imageBuffer = Buffer.from(await file.arrayBuffer());
      mimeType = file.type || "image/jpeg";
    } else {
      return NextResponse.json({ error: "Unsupported Content-Type" }, { status: 400 });
    }
  } catch (e) {
    console.error("[Analyze] Input parsing error:", e);
    return NextResponse.json({ error: "Invalid request format" }, { status: 400 });
  }

  // 3. Process with Gemini
  const imageData = imageBuffer.toString("base64");
  let items: GeminiItem[] = FALLBACK;
  let usedFallback = true;

  if (geminiClient) {
    try {
      const model = geminiClient.getGenerativeModel({
        model: "gemini-2.5-flash",
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
      const cleanJson = responseText.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleanJson);
      const parsedItems: GeminiItem[] = parsed.items ?? parsed ?? [];
      
      if (Array.isArray(parsedItems) && parsedItems.length) {
        items = parsedItems;
        usedFallback = false;
      }
    } catch (error) {
      console.warn("Gemini call failed, using fallback:", error);
    }
  }

  // 4. Match with Database (Embeddings)
  const embed = await getEmbedder();
  const matchThreshold = await deriveMatchThreshold(embed);

  const drafts = await Promise.all(
    items.map(async (item) => {
      const { data: embedding } = await embed(item.search_term);

      const { data: matches } = await supabase.rpc("match_foods", {
        query_embedding: embedding,
        query_text: item.search_term,
        match_threshold: matchThreshold,
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
            similarity: top.similarity ?? (typeof top.distance === "number" ? 1 - top.distance : null) ?? null,
            text_rank: top.text_rank ?? null,
          }))
        : [];

      return {
        id: generateDraftId(),
        ...item,
        match: mappedMatches[0] ?? undefined,
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
