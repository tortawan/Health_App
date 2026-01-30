import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";
import { getEmbedder } from "@/lib/embedder";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  if (!query) return NextResponse.json([]);

  const supabase = await createSupabaseServerClient();
   const {
    data: { user },
  } = await supabase.auth.getUser();

  let embedding: number[] | null = null;
  try {
    const embed = await getEmbedder();
    const { data } = await embed(query);
    embedding = data;
  } catch (error) {
    console.warn("Embedding failed, falling back to text-only search", error);
  }

  const { data, error } = await supabase.rpc("match_foods", {
    query_embedding: embedding ?? null,
    query_text: query ?? null,
    match_threshold: Number(0.6),
    match_count: Number(5),
    user_id: user?.id ?? null,
  });

  if (error) {
    console.error("Search RPC Error:", error);
  }

  return NextResponse.json(data || []);
}
