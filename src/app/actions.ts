"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getEmbedder } from "@/lib/embedder";
import { createSupabaseServerClient } from "@/lib/supabase";

type MacroMatch = {
  description: string;
  kcal_100g: number | null;
  protein_100g: number | null;
  carbs_100g: number | null;
  fat_100g: number | null;
  similarity?: number | null;
};

export async function logFood(entry: {
  foodName: string;
  weight: number;
  match?: MacroMatch;
  imagePath?: string | null;
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("You must be signed in to log food.");
  }

  const factor = entry.weight / 100;
  const calc = (value: number | null | undefined) =>
    value === null || value === undefined ? null : Number(value) * factor;

  const { data, error } = await supabase
    .from("food_logs")
    .insert({
      user_id: session.user.id,
      food_name: entry.foodName,
      weight_g: entry.weight,
      image_path: entry.imagePath ?? null,
      calories: calc(entry.match?.kcal_100g ?? null),
      protein: calc(entry.match?.protein_100g ?? null),
      carbs: calc(entry.match?.carbs_100g ?? null),
      fat: calc(entry.match?.fat_100g ?? null),
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  revalidatePath("/");
  return data;
}

export async function manualSearch(searchTerm: string) {
  const supabase = createSupabaseServerClient();
  const query = searchTerm.trim();

  if (!query) return [];

  const embed = await getEmbedder();
  const { data: embedding } = await embed(query);

  const { data, error } = await supabase.rpc("match_foods", {
    query_embedding: embedding,
    match_threshold: 0.6,
    match_count: 5,
  });

  if (error) {
    throw error;
  }

  return (
    data?.map((row: any) => ({
      description: row.description,
      kcal_100g: row.kcal_100g ?? null,
      protein_100g: row.protein_100g ?? null,
      carbs_100g: row.carbs_100g ?? null,
      fat_100g: row.fat_100g ?? null,
      similarity: row.similarity ?? null,
    })) ?? []
  );
}

export async function signOutAction() {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
