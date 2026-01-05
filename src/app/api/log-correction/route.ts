{
type: "uploaded file",
fileName: "tortawan/health_app/Health_App-bda602805d5b6e1df7033b03b4932486e8988f73/src/app/api/log-correction/route.ts",
fullContent: `import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
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
}`
}