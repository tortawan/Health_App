# 🚀 Technical Blueprint: AI-Native Nutrition Tracker

## 1. Executive Summary
This project implements a Multimodal RAG pipeline. We use Large Multimodal Models (LMMs) for perception and Vector Databases for factual retrieval.

## 2. The "Visual RAG" Pipeline

### Step A: Perception (Gemini 2.5 Flash)
- **Input:** Base64 encoded image + System Prompt.
- **Output:** Structured JSON containing `food_name`, `search_term`, and `quantity_estimate`.
- **Circuit Breaker:** If Gemini fails 3 times within 60 seconds (monitored via Upstash Redis), the system automatically falls back to manual text search to prevent UI hangs.

### Step B: Embedding Generation (Transformers.js)
- **Model:** Xenova/all-MiniLM-L6-v2.
- **Dimensions:** 384.
- **Optimization:** Embeddings are generated on the server (Next.js API) to ensure consistent vector space alignment with the database.

### Step C: Hybrid Retrieval (Supabase + pgvector)
- **Function:** `match_foods(query_embedding, query_text, user_id, ...)`.
- **Logic:**
  - Perform cosine similarity search on the embedding column.
  - Perform full-text search (tsvector) on the description column.
  - Combine scores to return a ranked list of USDA items.

## 3. Database Architecture (Key Tables)

### usda_library
- Stores the static nutritional truth.
- **Indexing:** IVFFlat index on embedding for lookups.
- **Columns:** `id`, `description`, `kcal_100g`, `protein_100g`, `carbs_100g`, `fat_100g`, `fiber_100g`, `sugar_100g`, `sodium_100g`.

### food_logs
- Stores user-specific consumption history.
- **Security:** RLS policies ensure `user_id` matches the authenticated session.
- **Audit Trail:** Includes `image_path` (Supabase Storage) for historical review.
- **Columns:** `id`, `user_id`, `food_name`, `weight_g`, `calories`, `protein`, `carbs`, `fat`, `fiber`, `sugar`, `sodium`, `consumed_at`, `image_path`.

### ai_corrections
- Captures user adjustments (e.g., when a user corrects a weight from 100g to 200g).

## 4. Error Handling & Edge Cases
- **No Food Detected:** UI displays a "Couldn't see any food" message and opens the manual search bar.
- **Low Confidence Matches:** If similarity score < 0.5, the app provides a "Possible Matches" list.

## 5. Phase 3 Community & Gamification Support

### Required Data Updates
- **user_profiles enhancements:** Ensure `is_public` boolean and `username` fields are indexed to support community feed lookups.
- **community_posts table:** Store shared meal photos, captions, and macro snapshots independently of private logs.
- **Leaderboard RPC:** Add a function that aggregates `food_logs` and `weight_logs` against user-defined goals to calculate rankings.
