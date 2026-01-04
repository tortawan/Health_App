export type MealTemplateItem = {
  food_name: string;
  weight_g: number;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};

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

export type FoodLogRecord = {
  id: string;
  food_name: string;
  weight_g: number;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber?: number | null;
  sugar?: number | null;
  sodium?: number | null;
  consumed_at: string;
  image_path?: string | null;
};

export type UserProfile = {
  user_id: string;
  height: number | null;
  weight: number | null;
  age: number | null;
  activity_level: string | null;
  goal_type: string | null;
  macro_split: Record<string, unknown> | null;
  daily_calorie_target: number | null;
  daily_protein_target: number | null;
  is_public?: boolean | null;
} | null;

export type MealTemplate = {
  id: string;
  name: string;
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
