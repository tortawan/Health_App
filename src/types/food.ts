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
