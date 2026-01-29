"use server";

import { createSupabaseServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

export async function logWeight(weight: number, date: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");

  // Upsert allows logging multiple times a day (updates the last entry for that timestamp)
  // Or simpler: just insert a new row. Let's insert.
  const { data, error } = await supabase
    .from("weight_logs")
    .insert({
      user_id: user.id,
      weight_kg: weight,
      logged_at: date, // ISO string expected
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath("/WeightLogger");
  return data;
}

export async function getWeightHistory(limit = 7) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return [];

  const { data } = await supabase
    .from("weight_logs")
    .select("*")
    .eq("user_id", user.id)
    .order("logged_at", { ascending: false })
    .limit(limit);

  return data ?? [];
}

export async function deleteWeightLog(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error("Unauthorized");

  await supabase
    .from("weight_logs")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  revalidatePath("/");
  revalidatePath("/WeightLogger");
}

export async function updateWeightLog(id: string, weight: number) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error("Unauthorized");

  await supabase
    .from("weight_logs")
    .update({ weight_kg: weight })
    .eq("id", id)
    .eq("user_id", user.id);

  revalidatePath("/");
  revalidatePath("/WeightLogger");
}