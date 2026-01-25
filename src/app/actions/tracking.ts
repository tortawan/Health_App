"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase";

// --- Weight Actions ---

export async function logWeight(weightKg: number, loggedAt?: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) throw new Error("You must be signed in to save weight.");
  
  // FIX: Added validation to match updateWeightLog
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    throw new Error("Weight must be greater than 0");
  }

  const { data, error } = await supabase
    .from("weight_logs")
    .insert({
      user_id: session.user.id,
      weight_kg: weightKg,
      logged_at: loggedAt ?? new Date().toISOString(),
    })
    .select("id, weight_kg, logged_at")
    .single();

  if (error) throw error;

  revalidatePath("/stats");
  return data;
}

export async function updateWeightLog(id: string, weightKg: number) {
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) throw new Error("You must be signed in to update weight logs.");
  if (!Number.isFinite(weightKg) || weightKg <= 0) throw new Error("Weight must be greater than 0");

  const { error } = await supabase
    .from("weight_logs")
    .update({ weight_kg: weightKg })
    .eq("id", id)
    .eq("user_id", session.user.id);

  if (error) throw error;
  revalidatePath("/stats");
}

export async function deleteWeightLog(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) throw new Error("You must be signed in to delete weight logs.");

  const { error } = await supabase
    .from("weight_logs")
    .delete()
    .eq("id", id)
    .eq("user_id", session.user.id);

  if (error) throw error;
  revalidatePath("/stats");
}

// --- Water Actions ---

export async function logWater(amount: number) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) throw new Error("You must be signed in to log water.");

  const { data, error } = await supabase
    .from("water_logs")
    .insert({
      user_id: user.id,
      amount_ml: amount,
      logged_at: new Date().toISOString(), 
    })
    .select("id, amount_ml, logged_at")
    .single();

  if (error) throw error;
  revalidatePath("/");
  revalidatePath("/stats");
  return data;
}

export async function updateWaterLog(id: string, amount: number) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) throw new Error("You must be signed in to update water logs.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be greater than 0");

  const { error } = await supabase
    .from("water_logs")
    .update({ amount_ml: amount })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw error;
  revalidatePath("/");
  revalidatePath("/stats");
}

export async function deleteWaterLog(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) throw new Error("You must be signed in to delete water logs.");

  const { error } = await supabase
    .from("water_logs")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw error;
  revalidatePath("/");
  revalidatePath("/stats");
}