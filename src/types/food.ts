/**
 * DraftLog: Represents a food item in the draft stage before confirmation
 * 
 * ✅ CHANGES:
 * - Added unique `id` field to prevent index-based bugs
 * - Ensures each item can be tracked independently
 * - Prevents data loss when items are reordered/removed
 */
export type DraftLog = {
  id: string;  // ✅ NEW: Unique identifier (e.g., "draft_1705004100000_a1b2c3d4e")
  food_name: string;  // e.g., "Chicken"
  weight: number;  // in grams
  search_term: string;  // Original search term
  match: MacroMatch | null;  // Nutrition data matched to this item
  image_base64?: string;  // Base64 encoded image
  created_at?: Date;  // When item was created
};

/**
 * MacroMatch: Nutrition data for a food item
 * 
 * ✅ CHANGES:
 * - Added `id` field to track matches uniquely
 * - Ensures correct match is applied to correct item
 */
export type MacroMatch = {
  id: string;  // ✅ NEW: Unique ID for this match
  usda_id?: number | null;
  food_name: string;  // e.g., "Boneless Chicken Breast"
  calories: number;  // Total calories
  protein: number;  // grams
  carbs: number;  // grams
  fat: number;  // grams
  serving_size: number;  // e.g., 100
  serving_unit: string;  // e.g., "g" or "oz"
};

/**
 * Optional: Add these helper types for better type safety
 */
export type DraftLogInput = Omit<DraftLog, 'id'>;

export type ConfirmResult = {
  itemId: string;
  success: boolean;
  error?: string;
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
  isOptimistic?: boolean;
};

export type MealTemplateItem = {
  id: string;
  usda_id: number;
  grams: number;
  description?: string;
};

export type MealTemplate = {
  id: string;
  name: string;
  created_at: string;
  items: MealTemplateItem[];
};

export type PortionMemoryRow = {
  food_name: string;
  weight_g: number;
  count: number;
};

export type RecentFood = MacroMatch;

export type UserProfile = {
  user_id: string;
  calorie_target?: number | null;
  protein_target?: number | null;
  carbs_target?: number | null;
  fat_target?: number | null;
  daily_calorie_target?: number | null;
  daily_protein_target?: number | null;
};
