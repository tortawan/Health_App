# AI-Native Nutrition Tracker: Master Plan (MVP)

> **Status:** Blueprint / Specification
> **Target Scale:** 500+ Daily Active Users (Zero Infrastructure Cost)
> **Core Stack:** Next.js, Supabase, Gemini 1.5 Flash, USDA Data

## 1. Executive Summary

This project aims to build a friction-less food tracking application that eliminates manual entry. Unlike traditional trackers that rely on expensive APIs (Nutritionix) or limited vision models, this project utilizes a **Multimodal RAG (Retrieval-Augmented Generation)** architecture.

By leveraging **Gemini 1.5 Flash** for reasoning and **Supabase Vector Search** for data retrieval, we can achieve high accuracy and significantly higher rate limits compared to legacy solutions, all while staying strictly within free usage tiers.

---

## 2. Technical Architecture

### 2.1 The "Free Tier" Production Stack

Selected specifically to avoid "cold starts" and API billing limits.

| Component | Selected Technology | Free Tier Limits (2026) | Role |
| --- | --- | --- | --- |
| **Frontend/Backend** | **Next.js 15+ (App Router)** | Hosted on **Vercel** | Unified full-stack framework. Server Actions handle secure API calls. Avoids the 15-min sleep/cold-start issues of Render free tiers. |
| **AI Vision** | **Gemini 1.5 Flash** | **1,500 reqs/day** | Analyzes images to identify food items and estimate weight. Generates structured JSON output. |
 
| **Database** | **Supabase** (PostgreSQL) | 500MB Storage | Stores user logs and the vector-embedded USDA dataset.

 |
| **Search Engine** | **pgvector** (Supabase) | Unlimited Queries | Performs semantic search to map AI text to accurate nutrition facts.

 |
| **Image Storage** | **Supabase Storage** | 1GB Storage | Hosting for user food photos with Row Level Security (RLS).

 |
| **Data Source** | **USDA FoodData Central** | Open Source | Foundation Foods dataset (self-hosted to avoid API rate limits).

 |

### 2.2 The "Visual RAG" Workflow

Instead of asking the AI to *guess* calories (which leads to hallucinations), we use the AI to *perceive* and *retrieve*.

1. **Capture:** User snaps a photo via the PWA.
2. **Upload:** Image uploaded to Supabase Storage; public/signed URL generated.
3. **Analyze (AI):** Gemini 1.5 Flash receives the image URL.
* *Prompt:* "Identify food items and estimate weight in grams. Return JSON."


4. **Retrieve (DB):** System converts the food name (e.g., "Avocado Toast") into a vector embedding and queries the USDA database for the closest semantic match using `pgvector`.
5. **Calculate:** `(USDA_Kcal / 100) * AI_Estimated_Weight = Total Calories`.
6. **Verify:** User reviews the draft and saves.

---

## 3. Database Schema

Run this SQL in your Supabase SQL Editor to set up the backend.sql
-- 1. Enable Vector Extension for Semantic Search
create extension if not exists vector;

-- 2. Create Static Reference Table (USDA Data)
create table usda_library (
id bigint primary key, -- Matches USDA FDC ID
description text not null,
embedding vector(384), -- For semantic search (using lightweight model)
kcal_100g numeric,
protein_100g numeric,
carbs_100g numeric,
fat_100g numeric,
search_text tsvector generated always as (to_tsvector('english', description)) stored
);

-- Index for fast vector similarity search
create index on usda_library using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

-- 3. Create User Logs Table
create table food_logs (
id uuid default gen_random_uuid() primary key,
user_id uuid references auth.users(id) not null,
image_path text, -- Supabase Storage file path

-- AI Output
detected_name text,

-- The Actual Data Used
usda_id bigint references usda_library(id),
weight_g numeric not null default 100,

-- Calculated Macros (Cached for easy reads)
calories numeric,
protein numeric,
carbs numeric,
fat numeric,

consumed_at timestamptz default now()
);

-- 4. Security Policies (RLS)
alter table food_logs enable row level security;

create policy "Users can see own logs"
on food_logs for select
using (auth.uid() = user_id);

create policy "Users can create own logs"
on food_logs for insert
with check (auth.uid() = user_id);

```

---

## 4. Implementation Roadmap

### Phase 1: Data Ingestion (The Foundation)
*   **Goal:** Replace the Nutritionix API with your own database.
*   **Steps:**
    1.  Download `Foundation Foods` CSV from USDA FoodData Central.
    2.  Create a Node.js script to parse the CSV.
    3.  Use `transformers.js` (Hugging Face) to generate embeddings for food names.
    4.  Bulk insert into `usda_library` on Supabase.

### Phase 2: The Vision Pipeline
*   **Goal:** Get Gemini to return JSON from an image.
*   **Steps:**
    1.  Initialize Next.js project: `npx create-next-app@latest`.
    2.  Install Google GenAI SDK: `npm install @google/generative-ai`.
    3.  Create a Server Action or API Route `/api/analyze` that accepts a file upload.
    4.  Prompt Gemini with `response_mime_type: "application/json"`.[6]

### Phase 3: The MVP Loop
*   **Goal:** Connect Vision -> Vector Search -> UI.
*   **Steps:**
    1.  Frontend uploads image to Supabase Storage.
    2.  Backend sends URL to Gemini.
    3.  Backend takes Gemini output ("Grilled Chicken") and queries `usda_library` using vector similarity.
    4.  Frontend displays the "Card" with the USDA nutritional info.
    5.  User clicks "Save".

---

## 5. Strategic Notes & Risks

*   **Cold Starts:** By using Next.js on Vercel (Serverless), we avoid the 15-minute inactivity sleep timer common with free-tier Docker containers like Render.[1]
*   **API Costs:** Gemini 1.5 Flash is free for up to 1,500 requests/day. If you exceed this, the app will simply error out for the rest of the day (graceful degradation).[2]
*   **Data Privacy:** The Gemini Free Tier allows Google to use submitted data for training. You **must** disclose this in your Privacy Policy if you release this publicly.
*   **UX Pattern:** Always assume the AI is wrong. The UI should present data as a "Draft" for the user to confirm, not as an absolute fact.

```
