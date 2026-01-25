"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase";
import { getEmbedder } from "@/lib/embedder";
import { calc } from "./utils";

export type MealTemplateItemInput = {
  usda_id: number;
  grams: number;
};

type MealTemplateLogInput = {
  food_name: string;
  weight_g: number;
};

function isMealTemplateItemInput(item: unknown): item is MealTemplateItemInput {
  return (
    typeof item === "object" &&
    item !== null &&
    "usda_id" in item &&
    "grams" in item
  );
}

export async function saveMealTemplate(name: string, items: MealTemplateItemInput[]) {
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) throw new Error("You must be signed in to save templates.");
  if (!Array.isArray(items) || !items.every(isMealTemplateItemInput)) {
    throw new Error("Template items are invalid.");
  }

  const { data: template, error: templateError } = await supabase
    .from("meal_templates")
    .insert({ user_id: session.user.id, name })
    .select("id, user_id, name, created_at")
    .single();

  if (templateError) throw templateError;

  const payload = items.map((item) => ({
    template_id: template.id,
    usda_id: item.usda_id,
    grams: item.grams,
  }));

  const { data: savedItems, error: itemsError } = await supabase
    .from("meal_template_items")
    .insert(payload)
    .select("id, usda_id, grams");

  if (itemsError) throw itemsError;

  revalidatePath("/");
  revalidatePath("/stats");
  return { ...template, items: savedItems ?? [] };
}

export async function saveMealTemplateFromLogs(name: string, logs: MealTemplateLogInput[]) {
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) throw new Error("You must be signed in to save templates.");
  if (!Array.isArray(logs) || logs.length === 0) throw new Error("No logs provided to save.");

  const embed = await getEmbedder();
  const items: MealTemplateItemInput[] = [];

  for (const log of logs) {
    const queryText = log.food_name;
    const { data: queryEmbedding } = await embed(queryText);
    const { data: matches, error: matchError } = await supabase.rpc("match_foods", {
      query_embedding: queryEmbedding ?? null,
      query_text: queryText,
      match_threshold: 0.55,
      match_count: 1,
      p_user_id: session.user.id,
    });

    if (matchError) throw matchError;

    const match = Array.isArray(matches) ? matches[0] : null;
    
    // FIX: Replaced 'any' with a structural type
    const typedMatch = match as { usda_id?: number; id?: number } | null;
    const usdaId = typedMatch?.usda_id ?? typedMatch?.id ?? null;

    if (!usdaId) throw new Error(`Unable to match "${queryText}" to USDA library.`);

    items.push({
      usda_id: Number(usdaId),
      grams: Number(log.weight_g),
    });
  }

  return saveMealTemplate(name, items);
}

export async function applyMealTemplate(templateId: string, scaleFactor: number = 1) {
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) throw new Error("You must be signed in to load templates.");

  const { data: template, error: templateError } = await supabase
    .from("meal_templates")
    .select(
      "id, name, user_id, meal_template_items (id, usda_id, grams, usda_library (description, kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, sugar_100g, sodium_100g))",
    )
    .eq("id", templateId)
    .maybeSingle();

  if (templateError) throw templateError;
  if (!template || template.user_id !== session.user.id) throw new Error("Template not found.");

  const now = new Date();
  const factor = Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;
  const items = template.meal_template_items ?? [];

  if (!Array.isArray(items) || items.length === 0) throw new Error("Template data is corrupted or invalid.");

  const payload = items.map((item, index) => {
    const library = item.usda_library;
    if (!library) throw new Error("Template item missing USDA metadata.");
    
    const weight = Number(item.grams) * factor;
    const factorForWeight = weight / 100;

    return {
      user_id: session.user.id,
      food_name: library.description,
      weight_g: Math.round(weight * 1000) / 1000,
      calories: calc(library.kcal_100g, factorForWeight),
      protein: calc(library.protein_100g, factorForWeight),
      carbs: calc(library.carbs_100g, factorForWeight),
      fat: calc(library.fat_100g, factorForWeight),
      fiber: calc(library.fiber_100g, factorForWeight),
      sugar: calc(library.sugar_100g, factorForWeight),
      sodium: calc(library.sodium_100g, factorForWeight),
      consumed_at: new Date(now.getTime() - index * 1000).toISOString(),
    };
  });

  const { data, error } = await supabase.from("food_logs").insert(payload).select();
  if (error) throw error;

  revalidatePath("/");
  revalidatePath("/stats");
  return data;
}

export async function deleteMealTemplate(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) throw new Error("You must be signed in to delete templates.");

  const { error } = await supabase
    .from("meal_templates")
    .delete()
    .eq("id", id)
    .eq("user_id", session.user.id);

  if (error) throw error;
  revalidatePath("/");
  revalidatePath("/stats");
}