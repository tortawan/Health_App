"use server";

import { revalidatePath } from "next/cache";
import {
  adjustedMacros,
  type MacroNutrients,
} from "@/lib/nutrition";
import { createSupabaseServerClient } from "@/lib/supabase";
import { calc, isErrorWithMessage } from "./utils";

// --- Types & Validators ---

type MatchedFood = MacroNutrients & {
  description: string;
};

type LogFoodInput = {
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  quantity?: number | null;
  serving_size?: number | null;
  [key: string]: unknown;
};

type LogFoodPayload = LogFoodInput & {
  match?: MatchedFood | null;
  weight?: number | null;
  foodName?: string | null;
  consumedAt?: string | null;
};

const logFoodSchema = {
  parseAsync: async (data: LogFoodInput) => data,
};

// Validation Helper
function validateMacros(
  changes: Partial<{
    calories?: number | null;
    protein?: number | null;
    carbs?: number | null;
    fat?: number | null;
  }>,
) {
  const fields = {
    calories: changes.calories,
    protein: changes.protein,
    carbs: changes.carbs,
    fat: changes.fat,
  };
  for (const [field, value] of Object.entries(fields)) {
    if (value !== null && value !== undefined && (value < 0 || !Number.isFinite(value))) {
      throw new Error(`${field} must be a non-negative finite number (got ${value})`);
    }
  }
}

// --- Actions ---

export async function logFood(data: LogFoodPayload) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  // Bracket notation for type safety with index signature
  const imagePath = (data["imageUrl"] as string) || (data["image_path"] as string) || null;
  let processedData = { ...data };

  if (data?.match && data?.weight) {
    const macros = adjustedMacros(data.match, data.weight);
    processedData = {
      ...processedData,
      food_name: data.foodName || data.match.description,
      weight_g: data.weight,
      calories: macros?.calories ?? null,
      protein: macros?.protein ?? null,
      carbs: macros?.carbs ?? null,
      fat: macros?.fat ?? null,
    };
  }

  delete processedData.match;
  delete processedData.foodName;
  delete processedData.weight;
  delete processedData.consumedAt;
  delete processedData["imageUrl"];

  const food = await logFoodSchema.parseAsync(processedData);

  const finalFood = {
    ...food,
    user_id: user.id,
    consumed_at: data.consumedAt || new Date().toISOString(),
    image_path: imagePath,
    calories: calc(food.calories, 1),
    protein: calc(food.protein, 1),
    carbs: calc(food.carbs, 1),
    fat: calc(food.fat, 1),
  };

  validateMacros(finalFood);

  const { data: insertedFood, error } = await supabase
    .from("food_logs")
    .insert(finalFood)
    .select()
    .single();

  if (error) {
    console.error("Error logging food:", error);
    throw new Error("Failed to log food");
  }

  revalidatePath("/dashboard");
  revalidatePath("/stats");

  return insertedFood;
}

export async function submitLogFood(args: Parameters<typeof logFood>[0]) {
  try {
    const data = await logFood(args);
    return { data };
  } catch (err) {
    console.error("Log food error:", err);
    let message = "An unknown error occurred";
    if (err instanceof Error) {
      message = err.message;
    } else if (isErrorWithMessage(err)) {
      message = err.message;
    } else if (typeof err === "string") {
      message = err;
    }
    return { error: message };
  }
}

export async function updateFoodLog(id: string, updates: Partial<LogFoodInput>) {
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) throw new Error("Unauthorized");

  const { data: currentLog, error: fetchError } = await supabase
    .from("food_logs")
    .select("*")
    .eq("id", id)
    .eq("user_id", session.user.id)
    .single();

  if (fetchError || !currentLog) {
    throw new Error("Failed to fetch existing log");
  }

  const newQuantity = updates.quantity ?? currentLog.quantity ?? 1;
  const newServingSize = updates.serving_size ?? currentLog.serving_size ?? 1;
  const safeServingSize = newServingSize === 0 ? 1 : newServingSize;
  const factor = newQuantity / safeServingSize;

  const oldFactor = (currentLog.quantity || 1) / (currentLog.serving_size || 1);
  const safeOldFactor = oldFactor === 0 ? 1 : oldFactor;

  const finalChanges = {
    ...updates,
    calories: updates.calories ?? (updates.quantity ? calc(currentLog.calories! / safeOldFactor, factor) : undefined),
    protein: updates.protein ?? (updates.quantity ? calc(currentLog.protein! / safeOldFactor, factor) : undefined),
    carbs: updates.carbs ?? (updates.quantity ? calc(currentLog.carbs! / safeOldFactor, factor) : undefined),
    fat: updates.fat ?? (updates.quantity ? calc(currentLog.fat! / safeOldFactor, factor) : undefined),
  };

  validateMacros(finalChanges);

  const { data: updatedLog, error } = await supabase
    .from("food_logs")
    .update(finalChanges)
    .eq("id", id)
    .eq("user_id", session.user.id)
    .select()
    .single();

  if (error) {
    throw new Error(`Update failed: ${error.message}`);
  }

  revalidatePath("/dashboard");
  revalidatePath("/stats");
  return updatedLog;
}

export async function deleteFoodLog(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) throw new Error("You must be signed in to delete entries.");

  const { error } = await supabase
    .from("food_logs")
    .delete()
    .eq("id", id)
    .eq("user_id", session.user.id);

  if (error) throw error;

  revalidatePath("/");
  revalidatePath("/stats");
}

export async function manualSearch(searchTerm: string) {
  const supabase = await createSupabaseServerClient();
  const query = searchTerm.trim();
  if (!query) return [];

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("You must be signed in to search.");

  // FIX: Changed p_user_id to user_id
  const { data, error } = await supabase.rpc("match_foods", {
    query_embedding: null,
    query_text: query ?? null,
    match_threshold: 0.0,
    match_count: 10,
    user_id: session.user.id ?? null,
  });

  if (error) {
    console.error("Manual Search RPC Error:", error);
    throw error;
  }

  return data ?? [];
}
export async function getRecentFoods() {
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) throw new Error("You must be signed in to view recents.");

  const { data, error } = await supabase
    .from("food_logs")
    .select("food_name, calories, protein, carbs, fat, fiber, sugar, sodium, weight_g, consumed_at")
    .eq("user_id", session.user.id)
    .order("consumed_at", { ascending: false })
    .limit(40);

  if (error) throw error;

  const seen = new Set<string>();
  const unique = [];
  for (const row of data ?? []) {
    const name = row.food_name.toLowerCase();
    if (seen.has(name)) continue;
    seen.add(name);
    unique.push({
      description: row.food_name,
      kcal_100g: row.calories ?? null,
      protein_100g: row.protein ?? null,
      carbs_100g: row.carbs ?? null,
      fat_100g: row.fat ?? null,
      fiber_100g: row.fiber ?? null,
      sugar_100g: row.sugar ?? null,
      sodium_100g: row.sodium ?? null,
      similarity: null,
    });
    if (unique.length >= 10) break;
  }
  return unique;
}

export async function copyDay(sourceDate: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) throw new Error("You must be signed in to copy a day.");

  const source = new Date(sourceDate);
  source.setHours(0, 0, 0, 0);
  const next = new Date(source);
  next.setDate(source.getDate() + 1);

  const { data: logs, error } = await supabase
    .from("food_logs")
    .select("food_name, weight_g, calories, protein, carbs, fat, fiber, sugar, sodium, image_path, consumed_at")
    .eq("user_id", session.user.id)
    .gte("consumed_at", source.toISOString())
    .lt("consumed_at", next.toISOString());

  if (error) throw error;
  if (!logs?.length) throw new Error("No logs found for that date to copy.");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const payload = logs.map((log, index) => {
    const time = new Date(log.consumed_at as string);
    const consumedAt = new Date(today);
    consumedAt.setHours(time.getHours(), time.getMinutes(), time.getSeconds(), index);

    return {
      user_id: session.user.id,
      food_name: log.food_name,
      weight_g: log.weight_g,
      calories: log.calories,
      protein: log.protein,
      carbs: log.carbs,
      fat: log.fat,
      fiber: log.fiber ?? null,
      sugar: log.sugar ?? null,
      sodium: log.sodium ?? null,
      image_path: log.image_path ?? null,
      consumed_at: consumedAt.toISOString(),
    };
  });

  const { data: inserted, error: insertError } = await supabase
    .from("food_logs")
    .insert(payload)
    .select();

  if (insertError) throw insertError;

  revalidatePath("/");
  revalidatePath("/stats");
  return inserted;
}

export async function logCorrection(payload: { original: number; corrected: number; foodName: string }) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    console.log("[RLHF] Weight Correction:", { user: session?.user?.id, ...payload });

    if (session) {
      await supabase.from("ai_corrections").insert({
        user_id: session.user.id,
        original_search: payload.foodName,
        final_match_desc: payload.foodName,
        correction_type: "weight",
        original_weight: payload.original,
        corrected_weight: payload.corrected,
        logged_at: new Date().toISOString(),
      });
    }
    return { success: true };
  } catch (err) {
    console.error("Failed to log correction:", err);
    return { success: false };
  }
}