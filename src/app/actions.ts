"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getEmbedder } from "@/lib/embedder";
import { calculateTargets, type ActivityLevel, type GoalType } from "@/lib/nutrition";
import { createSupabaseServerClient } from "@/lib/supabase";

// --- Types ---

function isMealTemplateItem(item: unknown): item is MealTemplateItem {
  return (
    typeof item === "object" &&
    item !== null &&
    "food_name" in item &&
    "weight_g" in item
  );
}

function isErrorWithMessage(error: unknown): error is { message: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as Record<string, unknown>).message === "string"
  );
}

type MacroMatch = {
  description: string;
  kcal_100g: number | null;
  protein_100g: number | null;
  carbs_100g: number | null;
  fat_100g: number | null;
  fiber_100g?: number | null;
  sugar_100g?: number | null;
  sodium_100g?: number | null;
  similarity?: number | null;
  text_rank?: number | null;
};

// --- Core Logging Action ---

export async function logFood(entry: {
  foodName: string;
  weight: number;
  match?: MacroMatch;
  imageUrl?: string | null;
  manualMacros?: {
    calories: number | null;
    protein?: number | null;
    carbs?: number | null;
    fat?: number | null;
  };
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("You must be signed in to log food.");
  }

  const factor = entry.weight / 100;
  const calc = (value: number | null | undefined) =>
    value === null || value === undefined ? null : Number(value) * factor;

  const calories =
    entry.manualMacros?.calories ?? calc(entry.match?.kcal_100g ?? null);
  const protein =
    entry.manualMacros?.protein ?? calc(entry.match?.protein_100g ?? null);
  const carbs =
    entry.manualMacros?.carbs ?? calc(entry.match?.carbs_100g ?? null);
  const fat = entry.manualMacros?.fat ?? calc(entry.match?.fat_100g ?? null);
  const fiber = calc(entry.match?.fiber_100g ?? null);
  const sugar = calc(entry.match?.sugar_100g ?? null);
  const sodium = calc(entry.match?.sodium_100g ?? null);

  const { data, error } = await supabase
    .from("food_logs")
    .insert({
      user_id: session.user.id,
      food_name: entry.foodName,
      weight_g: entry.weight,
      image_path: entry.imageUrl ?? null,
      calories,
      protein,
      carbs,
      fat,
      fiber,
      sugar,
      sodium,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  revalidatePath("/");
  return data;
}

// --- Wrappers & New Actions for Client ---

// Wrapper for home-client.tsx which expects { data: ... } or { error: ... }
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
    } else {
      try {
        message = JSON.stringify(err);
      } catch {
        message = "An error occurred (could not serialize error object)";
      }
    }

    return { error: message };
  }
}

// Correction logging action
export async function logCorrection(payload: { 
  original: number; 
  corrected: number; 
  foodName: string 
}) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    // Log to console for observability
    console.log("[RLHF] Weight Correction:", { 
      user: session?.user?.id,
      ...payload 
    });

    if (session) {
      // Attempt to store in DB (safe fail if table missing)
      await supabase.from("ai_corrections").insert({
        user_id: session.user.id,
        original_weight: payload.original,
        corrected_weight: payload.corrected,
        food_name: payload.foodName,
        correction_type: 'weight',
        logged_at: new Date().toISOString()
      });
    }
    
    return { success: true };
  } catch (err) {
    console.error("Failed to log correction:", err);
    return { success: false }; // Don't block UI on this failure
  }
}

// --- Other Actions ---

export async function manualSearch(searchTerm: string) {
  const supabase = await createSupabaseServerClient();
  const query = searchTerm.trim();

  if (!query) return [];

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("You must be signed in to search.");
  }

  const embed = await getEmbedder();
  const { data: embedding } = await embed(query);

  const { data, error } = await supabase.rpc("match_foods", {
    query_embedding: embedding,
    query_text: query,
    match_threshold: 0.6,
    match_count: 5,
  });

  if (error) {
    throw error;
  }

  type MatchRow = {
    description: string;
    kcal_100g: number | null;
    protein_100g: number | null;
    carbs_100g: number | null;
    fat_100g: number | null;
    fiber_100g: number | null;
    sugar_100g: number | null;
    sodium_100g: number | null;
    similarity?: number | null;
    text_rank?: number | null;
  };

  return (
    data?.map((row: MatchRow) => ({
      description: row.description,
      kcal_100g: row.kcal_100g ?? null,
      protein_100g: row.protein_100g ?? null,
      carbs_100g: row.carbs_100g ?? null,
      fat_100g: row.fat_100g ?? null,
      fiber_100g: row.fiber_100g ?? null,
      sugar_100g: row.sugar_100g ?? null,
      sodium_100g: row.sodium_100g ?? null,
      similarity: row.similarity ?? null,
      text_rank: row.text_rank ?? null,
    })) ?? []
  );
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function upsertUserProfile(input: {
  height: number;
  weight: number;
  age: number;
  activityLevel: ActivityLevel;
  goalType: GoalType;
  macroSplit?: Record<string, unknown> | null;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("You must be signed in to save your profile.");
  }

  const targets = calculateTargets({
    height: input.height,
    weight: input.weight,
    age: input.age,
    activityLevel: input.activityLevel,
    goalType: input.goalType,
  });

  const { data, error } = await supabase
    .from("user_profiles")
    .upsert(
      {
        user_id: session.user.id,
        height: input.height,
        weight: input.weight,
        age: input.age,
        activity_level: input.activityLevel,
        goal_type: input.goalType,
        macro_split: input.macroSplit ?? null,
        daily_calorie_target: targets.daily_calorie_target,
        daily_protein_target: targets.daily_protein_target,
      },
      { onConflict: "user_id" },
    )
    .select()
    .single();

  if (error) {
    throw error;
  }

  revalidatePath("/");
  revalidatePath("/stats");
  return data;
}

export async function updateFoodLog(id: string, changes: Partial<{ food_name: string; weight_g: number; calories: number | null; protein: number | null; carbs: number | null; fat: number | null }>) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("You must be signed in to update entries.");
  }

  const { error } = await supabase
    .from("food_logs")
    .update(changes)
    .eq("id", id)
    .eq("user_id", session.user.id);

  if (error) {
    throw error;
  }

  revalidatePath("/");
  revalidatePath("/stats");
}

export async function deleteFoodLog(id: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("You must be signed in to delete entries.");
  }

  const { error } = await supabase
    .from("food_logs")
    .delete()
    .eq("id", id)
    .eq("user_id", session.user.id);

  if (error) {
    throw error;
  }

  revalidatePath("/");
  revalidatePath("/stats");
}

export async function logWeight(weightKg: number, loggedAt?: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("You must be signed in to save weight.");
  }

  const { error } = await supabase.from("weight_logs").insert({
    user_id: session.user.id,
    weight_kg: weightKg,
    logged_at: loggedAt ?? new Date().toISOString(),
  });

  if (error) {
    throw error;
  }

  revalidatePath("/stats");
}

export type MealTemplateItem = {
  food_name: string;
  weight_g: number;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};

export async function saveMealTemplate(name: string, items: MealTemplateItem[]) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("You must be signed in to save templates.");
  }

  const { data, error } = await supabase
    .from("meal_templates")
    .insert({
      user_id: session.user.id,
      name,
      items,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function applyMealTemplate(
  templateId: string,
  scaleFactor: number = 1,
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("You must be signed in to load templates.");
  }

  const { data: template, error: templateError } = await supabase
    .from("meal_templates")
    .select("items, name, user_id")
    .eq("id", templateId)
    .maybeSingle();

  if (templateError) {
    throw templateError;
  }

  if (!template || template.user_id !== session.user.id) {
    throw new Error("Template not found.");
  }

  const now = new Date();
  const factor = Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;
  const items = template.items;
  if (!Array.isArray(items) || !items.every(isMealTemplateItem)) {
    throw new Error("Template data is corrupted or invalid.");
  }

  const payload = items.map((item, index) => ({
      user_id: session.user.id,
      food_name: item.food_name,
      weight_g: Math.round(item.weight_g * factor * 1000) / 1000,
      calories: item.calories === null ? null : Number(item.calories) * factor,
      protein: item.protein === null ? null : Number(item.protein) * factor,
      carbs: item.carbs === null ? null : Number(item.carbs) * factor,
      fat: item.fat === null ? null : Number(item.fat) * factor,
      consumed_at: new Date(now.getTime() - index * 1000).toISOString(),
    })) ?? [];

  if (!payload.length) {
    throw new Error("Template has no items to insert.");
  }

  const { data, error } = await supabase.from("food_logs").insert(payload).select();

  if (error) {
    throw error;
  }

  revalidatePath("/");
  revalidatePath("/stats");
  return data;
}

export async function deleteMealTemplate(id: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("You must be signed in to delete templates.");
  }

  const { error } = await supabase
    .from("meal_templates")
    .delete()
    .eq("id", id)
    .eq("user_id", session.user.id);

  if (error) {
    throw error;
  }

  revalidatePath("/");
  revalidatePath("/stats");
}

export async function getRecentFoods() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("You must be signed in to view recents.");
  }

  const { data, error } = await supabase
    .from("food_logs")
    .select(
      "food_name, calories, protein, carbs, fat, fiber, sugar, sodium, weight_g, consumed_at",
    )
    .eq("user_id", session.user.id)
    .order("consumed_at", { ascending: false })
    .limit(40);

  if (error) {
    throw error;
  }

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
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("You must be signed in to copy a day.");
  }

  const source = new Date(sourceDate);
  source.setHours(0, 0, 0, 0);
  const next = new Date(source);
  next.setDate(source.getDate() + 1);

  const { data: logs, error } = await supabase
    .from("food_logs")
    .select(
      "food_name, weight_g, calories, protein, carbs, fat, fiber, sugar, sodium, image_path, consumed_at",
    )
    .eq("user_id", session.user.id)
    .gte("consumed_at", source.toISOString())
    .lt("consumed_at", next.toISOString());

  if (error) {
    throw error;
  }

  if (!logs?.length) {
    throw new Error("No logs found for that date to copy.");
  }

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

  if (insertError) {
    throw insertError;
  }

  revalidatePath("/");
  revalidatePath("/stats");
  return inserted;
}

export async function logWater(amount: number) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("You must be signed in to log water.");
  }

  const { data, error } = await supabase
    .from("water_logs")
    .insert({
      user_id: session.user.id,
      amount_ml: amount,
    })
    .select("amount_ml, logged_at")
    .single();

  if (error) {
    throw error;
  }

  revalidatePath("/");
  return data;
}

export async function updatePrivacy(isPublic: boolean) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("You must be signed in to update privacy.");
  }

  const { error } = await supabase
    .from("user_profiles")
    .upsert(
      {
        user_id: session.user.id,
        is_public: isPublic,
      },
      { onConflict: "user_id" },
    );

  if (error) {
    throw error;
  }

  revalidatePath("/settings");
  return { is_public: isPublic };
}

export async function toggleLogLike(logId: string, shouldLike: boolean) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("You must be signed in to react to logs.");
  }

  if (shouldLike) {
    const { error } = await supabase.from("log_likes").insert({
      log_id: logId,
      user_id: session.user.id,
    });

    if (error && error.code !== "23505") {
      // Ignore duplicate like attempts
      throw error;
    }
  } else {
    const { error } = await supabase
      .from("log_likes")
      .delete()
      .eq("log_id", logId)
      .eq("user_id", session.user.id);

    if (error) {
      throw error;
    }
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
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("You must be signed in to flag a log.");
  }

  const { data: log, error: logError } = await supabase
    .from("food_logs")
    .select("id, user_id, food_name, weight_g, calories, protein, carbs, fat, image_path")
    .eq("id", logId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (logError) {
    throw logError;
  }

  if (!log) {
    throw new Error("Log not found or not owned by you.");
  }

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
    notes: input.notes ?? null,
  });

  if (error) {
    throw error;
  }

  return { ok: true };
}
