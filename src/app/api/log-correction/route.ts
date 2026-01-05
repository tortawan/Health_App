import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";
import { logCorrectionLimiter, rateLimitRedis } from "@/lib/ratelimit";

export async function POST(request: Request) {
  try {
    if (logCorrectionLimiter) {
      const ip = (await headers()).get("x-forwarded-for") ?? "127.0.0.1";
      const { success } = await logCorrectionLimiter.limit(ip);

      if (!success) {
        return NextResponse.json(
          { error: "Too many corrections. Please slow down." },
          { status: 429 },
        );
      }
    } else if (!rateLimitRedis && process.env.NODE_ENV === "production") {
      console.warn("Rate limiting is disabled for log-correction. Configure UPSTASH_REDIS_REST_URL.");
    }

    const supabase = await createSupabaseServerClient();
    const { original, final, correctedField } = await request.json();

    // Ideally, insert this into a dedicated 'ai_corrections' table.
    // For now, we log to Supabase if the table exists, or console for simple tracking.
    const { error } = await supabase.from("ai_corrections").insert({
      original_food: original.food_name,
      original_search: original.search_term,
      original_match_id: original.match?.id, // Assuming match has an ID or description
      original_match_desc: original.match?.description,
      final_weight: final.weight,
      final_match_desc: final.match?.description,
      correction_type: correctedField, // 'weight', 'match', or 'manual_search'
      logged_at: new Date().toISOString(),
    });

    if (error) {
      // Fallback if table doesn't exist yet (Safe fail)
      console.log("[RLHF] Correction Logged:", { original, final, correctedField });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to log correction:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
