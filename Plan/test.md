
# 🚀 Revised Technical Blueprint: AI-Native Nutrition Tracker (Production-Ready)

> **Status:** Final Execution Plan
> **Core Principle:** "Visual RAG" (Perception via AI -> Fact Retrieval via Database)
> **Constraint:** Zero Infrastructure Cost (Free Tiers Only)

---

## 1. Executive Summary

This project builds a friction-less food tracker using **Multimodal RAG**. Instead of asking an LLM to hallucinate nutrition facts, we use:

1. **Gemini 1.5 Flash** to *perceive* the image (identify food names + visual quantity estimation).
2. **Supabase Vector Search** to *retrieve* validated nutrition facts from a self-hosted USDA database.
3. **Next.js Server Actions** to orchestrate the flow without managing a separate backend server.

---

## 2. The "Free Tier" Production Stack

| Component | Technology | Reasoning |
| --- | --- | --- |
| **Framework** | **Next.js 15+ (App Router)** | Deployed on Vercel. Server Actions handle logic; avoids "cold start" timeouts of free containers. |
| **AI Vision** | **Gemini 1.5 Flash** | High rate limit (1,500/day free). Used strictly for *identification*, not for factual nutrition data. |
| **Database** | **Supabase (PostgreSQL)** | Stores user logs and USDA data. Includes `pgvector` for semantic search. |
| **Embeddings** | **Transformers.js** | **CRITICAL FIX:** Runs `all-MiniLM-L6-v2` (or similar) inside the Next.js API route to ensure the *exact same model* is used for both USDA ingestion and user queries. |
| **Data Source** | **USDA Foundation Foods** | Downloaded and **denormalized** into a flat table to avoid complex joins at runtime. |

---

## 3. The Optimized "Visual RAG" Workflow

1. **Capture & Optimistic UI:**
* User snaps photo.
* **UI Update:** Immediately show the image with a "Scanning..." skeleton loader (Masks latency).
* Image is uploaded to Supabase Storage.


2. **AI Analysis (Gemini):**
* Backend sends image URL to Gemini.
* **Prompt:** *"Identify the distinct food items. For each, provide a search query string (e.g. 'Grilled Salmon') and a visual portion estimate (e.g. 'small fillet, approx 150g'). Return JSON."*


3. **Vector Retrieval (The "Truth" Step):**
* Backend generates a vector embedding for the *search query string* using `transformers.js`.
* Database performs a similarity search on `usda_library`.


4. **Verification (The "Human Loop"):**
* App presents a "Draft Log": *"We found Grilled Salmon. Estimated 150g?"*
* User can quickly tap "Small (100g) / Medium (150g) / Large (200g)" or edit manually.
* **Reasoning:** AI weight guessing is error-prone; user confirmation prevents frustration.



---

## 4. Revised Database Schema

Run this in your Supabase SQL Editor. It includes the critical **RLS (Row Level Security)** fixes to ensure users can actually read the public USDA data.

```sql
-- 1. Enable Vector Extension
create extension if not exists vector;

-- 2. USDA Library (Denormalized & Public)
create table usda_library (
  id bigint primary key,            -- Matches USDA FDC ID
  description text not null,        -- Product name (e.g., "Avocado, raw")
  embedding vector(384),            -- Matches 'all-MiniLM-L6-v2' dimensions
  kcal_100g numeric,
  protein_100g numeric,
  carbs_100g numeric,
  fat_100g numeric,
  search_text tsvector generated always as (to_tsvector('english', description)) stored
);

-- Index for speed
create index on usda_library using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- 3. User Logs (Private)
create table food_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null,
  image_path text,
  
  -- Snapshot of data at time of logging (in case USDA DB changes)
  food_name text not null,
  weight_g numeric not null default 100,
  calories numeric,
  protein numeric,
  carbs numeric,
  fat numeric,
  
  consumed_at timestamptz default now()
);

-- 4. SECURITY POLICIES (CRITICAL FIXES)
alter table usda_library enable row level security;
alter table food_logs enable row level security;

-- Allow EVERYONE (including anon) to read USDA data
create policy "Public Read USDA"
on usda_library for select
using (true);

-- Allow Users to manage ONLY their own logs
create policy "Users manage own logs"
on food_logs for all
using (auth.uid() = user_id);

```

---

## 5. Implementation Roadmap

### Phase 1: The Data Foundation (Do this first)

* **Goal:** Create the "Truth" database.
* **Action:**
1. Download USDA "Foundation Foods" CSV.
2. Write a local script to **flatten** the data (merge `food_nutrient` rows into a single `kcal`, `protein`, `fat` row per food).
3. Generate embeddings for all rows using the **same model** you will use in the app (e.g., `Xenova/all-MiniLM-L6-v2`).
4. Upload the resulting clean JSON/CSV to Supabase.



### Phase 2: The Core Loop (Back-end)

* **Goal:** Input Image -> Output Nutrition JSON.
* **Action:**
1. Set up Next.js API route `/api/analyze`.
2. Integrate Gemini SDK to handle image inputs.
3. Integrate `transformers.js` (or Supabase's built-in embedding generation if available) to vectorize the Gemini text output.
4. Query Supabase and return the merged object.



### Phase 3: The MVP UI (Front-end)

* **Goal:** A simple, fast mobile web interface.
* **Action:**
1. Camera capture button (input `type="file" capture="environment"`).
2. "Draft" Review Screen (allows users to correct the AI's weight guess).
3. "Daily Log" Dashboard (simple list of today's entries).



---

## 6. Strategic UX Notes

* **Trust but Verify:** Never auto-save. Always present the data as a "suggestion" for the user to tap "Confirm".
* **Fail Gracefully:** If Gemini fails or hits a rate limit, allow the user to type the food name manually and search the `usda_library` directly (using the same vector search).
* **Privacy:** Since you are using Gemini Free Tier, add a footer note: *"Food images are processed by Google AI."*