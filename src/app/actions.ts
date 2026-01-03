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
  imageUrl?: string | null;
  manualMacros?: {
    calories: number | null;
    protein?: number | null;
    carbs?: number | null;
    fat?: number | null;
  };
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

  const calories =
    entry.manualMacros?.calories ?? calc(entry.match?.kcal_100g ?? null);
  const protein =
    entry.manualMacros?.protein ?? calc(entry.match?.protein_100g ?? null);
  const carbs =
    entry.manualMacros?.carbs ?? calc(entry.match?.carbs_100g ?? null);
  const fat = entry.manualMacros?.fat ?? calc(entry.match?.fat_100g ?? null);

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

  type MatchRow = {
    description: string;
    kcal_100g: number | null;
    protein_100g: number | null;
    carbs_100g: number | null;
    fat_100g: number | null;
    similarity?: number | null;
  };

  return (
    data?.map((row: MatchRow) => ({
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

type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
type GoalType = "lose" | "maintain" | "gain";

const activityMultipliers: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

function calculateTargets({
  height,
  weight,
  age,
  activityLevel,
  goalType,
}: {
  height: number;
  weight: number;
  age: number;
  activityLevel: ActivityLevel;
  goalType: GoalType;
}) {
  const bmr = 10 * weight + 6.25 * height - 5 * age + 5;
  const tdee = bmr * (activityMultipliers[activityLevel] ?? 1.2);
  let calorieTarget = tdee;

  if (goalType === "lose") calorieTarget = tdee * 0.85;
  if (goalType === "gain") calorieTarget = tdee * 1.1;

  const proteinTarget = weight * 1.6;

  return {
    daily_calorie_target: Math.round(calorieTarget),
    daily_protein_target: Math.round(proteinTarget),
  };
}

export async function upsertUserProfile(input: {
  height: number;
  weight: number;
  age: number;
  activityLevel: ActivityLevel;
  goalType: GoalType;
  macroSplit?: Record<string, unknown> | null;
}) {
  const supabase = createSupabaseServerClient();
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
  const supabase = createSupabaseServerClient();
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
  const supabase = createSupabaseServerClient();
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
