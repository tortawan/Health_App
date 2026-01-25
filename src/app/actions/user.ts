"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { calculateTargets, type ActivityLevel, type GoalType } from "@/lib/nutrition";
import { createSupabaseServerClient } from "@/lib/supabase";

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
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) throw new Error("You must be signed in to save your profile.");

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

  if (error) throw error;

  revalidatePath("/");
  revalidatePath("/stats");
  return data;
}

export async function updatePrivacy(isPublic: boolean) {
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) throw new Error("You must be signed in to update privacy.");

  const { error } = await supabase
    .from("user_profiles")
    .upsert(
      {
        user_id: session.user.id,
        is_public: isPublic,
      },
      { onConflict: "user_id" },
    );

  if (error) throw error;

  revalidatePath("/settings");
  return { is_public: isPublic };
}