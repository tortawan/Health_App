import { Database } from "./supabase";

// Shortcut to Tables
type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type MealTemplateItem = {
  food_name: string;
  weight_g: number;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};

// Extends the RPC return type but makes fields nullable to match UI needs
export type MacroMatch = {
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

export type DraftLog = {
  food_name: string;
  quantity_estimate: string;
  search_term: string;
  match?: MacroMatch;
  matches?: MacroMatch[];
  weight: number;
};

// Directly inherit from Supabase 'food_logs' table
export type FoodLogRecord = Tables<"food_logs">;

// Directly inherit from Supabase 'user_profiles' table
export type UserProfile = Tables<"user_profiles"> | null;

// Inherit basics from 'meal_templates' but strictly type the JSON 'items'
export type MealTemplate = Omit<Tables<"meal_templates">, "items"> & {
  items: MealTemplateItem[];
};

export type PortionMemoryRow = {
  food_name: string;
  weight_g: number;
  count: number;
};

export type RecentFood = {
  food_name: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber?: number | null;
  sugar?: number | null;
  sodium?: number | null;
  weight_g: number;
};