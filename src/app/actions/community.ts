"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase";

export async function toggleLogLike(logId: string, shouldLike: boolean) {
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) throw new Error("You must be signed in to react to logs.");

  if (shouldLike) {
    const { error } = await supabase.from("log_likes").insert({
      log_id: logId,
      user_id: session.user.id,
    });
    if (error && error.code !== "23505") throw error; // Ignore duplicate like attempts
  } else {
    const { error } = await supabase
      .from("log_likes")
      .delete()
      .eq("log_id", logId)
      .eq("user_id", session.user.id);
    if (error) throw error;
  }
  revalidatePath("/community");
}

export async function reportLogIssue(logId: string, input: {
  corrected_food_name?: string;
  corrected_weight_g?: number | null;
  corrected_calories?: number | null;
  corrected_protein?: number | null;
  corrected_carbs?: number | null;
  corrected_fat?: number | null;
  notes?: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) throw new Error("You must be signed in to flag a log.");

  const { data: log, error: logError } = await supabase
    .from("food_logs")
    .select("id, user_id, food_name, weight_g, calories, protein, carbs, fat, image_path")
    .eq("id", logId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (logError) throw logError;
  if (!log) throw new Error("Log not found or not owned by you.");

  const { error } = await supabase.from("training_dataset").insert({
    source_log_id: log.id,
    user_id: session.user.id,
    image_path: log.image_path ?? null,
    corrected_food_name: input.corrected_food_name ?? log.food_name,
    corrected_weight_g: input.corrected_weight_g ?? log.weight_g,
    corrected_calories: input.corrected_calories ?? log.calories,
    corrected_protein: input.corrected_protein ?? log.protein,
    corrected_carbs: input.corrected_carbs ?? log.carbs,
    corrected_fat: input.corrected_fat ?? log.fat,
    user_notes: input.notes ?? null,
  });

  if (error) throw error;
  return { ok: true };
}