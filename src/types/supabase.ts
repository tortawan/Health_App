export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      ai_corrections: {
        Row: {
          id: string
          user_id: string
          original_search: string
          final_match_desc: string
          correction_type: string
          logged_at: string
        }
        Insert: {
          id?: string
          user_id: string
          original_search: string
          final_match_desc: string
          correction_type: string
          logged_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          original_search?: string
          final_match_desc?: string
          correction_type?: string
          logged_at?: string
        }
      }
      food_logs: {
        Row: {
          id: string
          user_id: string
          food_name: string
          weight_g: number
          image_path: string | null
          calories: number | null
          protein: number | null
          carbs: number | null
          fat: number | null
          fiber: number | null
          sugar: number | null
          sodium: number | null
          consumed_at: string
        }
        Insert: {
          id?: string
          user_id: string
          food_name: string
          weight_g: number
          image_path?: string | null
          calories?: number | null
          protein?: number | null
          carbs?: number | null
          fat?: number | null
          fiber?: number | null
          sugar?: number | null
          sodium?: number | null
          consumed_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          food_name?: string
          weight_g?: number
          image_path?: string | null
          calories?: number | null
          protein?: number | null
          carbs?: number | null
          fat?: number | null
          fiber?: number | null
          sugar?: number | null
          sodium?: number | null
          consumed_at?: string
        }
      }
      log_likes: {
        Row: {
          id: string
          log_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          log_id: string
          user_id: string
          created_at?: string
        }
        Update: {
          id?: string
          log_id?: string
          user_id?: string
          created_at?: string
        }
      }
      meal_templates: {
        Row: {
          id: string
          user_id: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          created_at?: string
        }
      }
      meal_template_items: {
        Row: {
          id: string
          template_id: string
          usda_id: number
          grams: number
        }
        Insert: {
          id?: string
          template_id: string
          usda_id: number
          grams: number
        }
        Update: {
          id?: string
          template_id?: string
          usda_id?: number
          grams?: number
        }
      }
      training_dataset: {
        Row: {
          id: string
          source_log_id: string | null
          user_id: string
          image_path: string | null
          corrected_food_name: string | null
          corrected_weight_g: number | null
          corrected_calories: number | null
          corrected_protein: number | null
          corrected_carbs: number | null
          corrected_fat: number | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          source_log_id?: string | null
          user_id: string
          image_path?: string | null
          corrected_food_name?: string | null
          corrected_weight_g?: number | null
          corrected_calories?: number | null
          corrected_protein?: number | null
          corrected_carbs?: number | null
          corrected_fat?: number | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          source_log_id?: string | null
          user_id?: string
          image_path?: string | null
          corrected_food_name?: string | null
          corrected_weight_g?: number | null
          corrected_calories?: number | null
          corrected_protein?: number | null
          corrected_carbs?: number | null
          corrected_fat?: number | null
          notes?: string | null
          created_at?: string
        }
      }
      usda_library: {
        Row: {
          id: number
          description: string
          embedding: string | null // pgvector returns string in JS
          kcal_100g: number | null
          protein_100g: number | null
          carbs_100g: number | null
          fat_100g: number | null
          fiber_100g: number | null
          sugar_100g: number | null
          sodium_100g: number | null
          search_text: unknown | null
        }
        Insert: {
          id: number
          description: string
          embedding?: string | null
          kcal_100g?: number | null
          protein_100g?: number | null
          carbs_100g?: number | null
          fat_100g?: number | null
          fiber_100g?: number | null
          sugar_100g?: number | null
          sodium_100g?: number | null
          search_text?: unknown | null
        }
        Update: {
          id?: number
          description?: string
          embedding?: string | null
          kcal_100g?: number | null
          protein_100g?: number | null
          carbs_100g?: number | null
          fat_100g?: number | null
          fiber_100g?: number | null
          sugar_100g?: number | null
          sodium_100g?: number | null
          search_text?: unknown | null
        }
      }
      user_profiles: {
        Row: {
          user_id: string
          username: string | null
          height: number | null
          weight: number | null
          age: number | null
          activity_level: string | null
          goal_type: string | null
          macro_split: Json | null
          daily_calorie_target: number | null
          daily_protein_target: number | null
          is_public: boolean
          created_at: string
        }
        Insert: {
          user_id: string
          username?: string | null
          height?: number | null
          weight?: number | null
          age?: number | null
          activity_level?: string | null
          goal_type?: string | null
          macro_split?: Json | null
          daily_calorie_target?: number | null
          daily_protein_target?: number | null
          is_public?: boolean
          created_at?: string
        }
        Update: {
          user_id?: string
          username?: string | null
          height?: number | null
          weight?: number | null
          age?: number | null
          activity_level?: string | null
          goal_type?: string | null
          macro_split?: Json | null
          daily_calorie_target?: number | null
          daily_protein_target?: number | null
          is_public?: boolean
          created_at?: string
        }
      }
      water_logs: {
        Row: {
          id: string
          user_id: string
          amount_ml: number
          logged_at: string
        }
        Insert: {
          id?: string
          user_id: string
          amount_ml: number
          logged_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          amount_ml?: number
          logged_at?: string
        }
      }
      weight_logs: {
        Row: {
          id: string
          user_id: string
          weight_kg: number
          logged_at: string
        }
        Insert: {
          id?: string
          user_id: string
          weight_kg: number
          logged_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          weight_kg?: number
          logged_at?: string
        }
      }
    }
    Views: {
      user_portion_memory: {
        Row: {
          user_id: string | null
          food_name_lower: string | null
          avg_weight: number | null
          frequency: number | null
          display_name: string | null
        }
      }
    }
    Functions: {
      match_foods: {
        Args: {
          query_embedding: string
          query_text: string
          match_threshold: number
          match_count: number
          user_id?: string
        }
        Returns: {
          id: number
          description: string
          kcal_100g: number
          protein_100g: number
          carbs_100g: number
          fat_100g: number
          fiber_100g: number
          sugar_100g: number
          sodium_100g: number
          similarity: number
          text_rank: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}
