import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";
import { FOOD_PROMPT, geminiClient } from "@/lib/gemini";
import { getEmbedder } from "@/lib/embedder";

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
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
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

  const imageBuffer = Buffer.from(await file.arrayBuffer());
  const imageData = imageBuffer.toString("base64");
  const mimeType = file.type || "image/jpeg";

  let items: GeminiItem[] = FALLBACK;

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

      const parsed = JSON.parse(result.response.text());
      items = parsed.items ?? parsed ?? FALLBACK;
    } catch (error) {
      console.warn("Gemini call failed, using fallback:", error);
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
        user_id: session?.user.id ?? null,
      });

      const top = Array.isArray(matches) ? matches[0] : null;

      return {
        ...item,
        match: top
          ? {
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
            }
          : undefined,
      };
    }),
  );

  return NextResponse.json({
    draft: drafts,
    imagePath: `data:${mimeType};base64,${imageData}`,
  });
}
