import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";
import { getEmbedder } from "@/lib/embedder";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  if (!query) return NextResponse.json([]);

  const embed = await getEmbedder();
  const { data: embedding } = await embed(query);

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("match_foods", {
    query_embedding: embedding,
    query_text: query,
    match_threshold: 0.6,
    match_count: 5,
  });

  return NextResponse.json(data || []);
}
