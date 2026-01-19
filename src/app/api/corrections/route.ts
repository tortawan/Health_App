import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { original_search, final_match_desc } = await request.json();

    if (!original_search || !final_match_desc) {
      return NextResponse.json(
        { error: "Missing required fields." },
        { status: 400 },
      );
    }

    const { error } = await supabase.from("ai_corrections").insert({
      user_id: session.user.id,
      original_search,
      final_match_desc,
      logged_at: new Date().toISOString(),
    });

    if (error) {
      console.error("[Corrections] Insert failed", error);
      return NextResponse.json({ error: "Insert failed" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Corrections] Unhandled error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
