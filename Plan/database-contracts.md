# Database Contracts (Supabase)

Last verified: 2026-01-19

This document captures the **current Supabase/Postgres database surface area** (tables, RPCs, extensions) that the app depends on, so everyone stays aligned when making changes.

---

## Extensions

### pgvector
- Installed and in use for embeddings.
- Helper function present in this DB: `public.vector_dims(vector)`

---

## Tables

### `public.usda_library`
Purpose: USDA food reference library used for search/matching.

Key fields (non-exhaustive):
- `id` (int/bigint) — primary identifier used by the app
- `description` (text)
- `kcal_100g`, `protein_100g`, `carbs_100g`, `fat_100g`
- `fiber_100g`, `sugar_100g`, `sodium_100g`
- `embedding` **`vector(384)`**

#### Verified embedding type
```sql
SELECT pg_catalog.format_type(atttypid, atttypmod) AS embedding_type
FROM pg_attribute
WHERE attrelid = 'public.usda_library'::regclass
  AND attname = 'embedding';
-- Expect: vector(384)
```

#### Verified stored embedding dimension
```sql
SELECT vector_dims(embedding) AS embedding_dim
FROM public.usda_library
WHERE embedding IS NOT NULL
LIMIT 5;
-- Expect: 384 for all rows
```

---

### `public.ai_corrections`
Purpose: Stores user corrections that can be used to improve model behavior (e.g., adaptive thresholds), and/or track weight corrections.

Columns (as of 2026-01-19):
- `id` uuid (PK)
- `user_id` uuid **NOT NULL**
- `original_weight` numeric (nullable)
- `corrected_weight` numeric (nullable)
- `food_name` text (nullable)
- `correction_type` text (nullable/required depending on policy)
- `logged_at` timestamptz
- `original_search` text (nullable) ✅ added for match-learning
- `final_match_desc` text (nullable) ✅ added for match-learning

#### Match-learning convention
When a user rejects the AI top match and chooses a different USDA item, write a row with:
- `correction_type = 'manual_match'`
- `original_search` = what the system searched/assumed (e.g., draft food name or manual query)
- `final_match_desc` = the USDA description ultimately chosen by the user

#### Insert example (requires a real user_id)
```sql
INSERT INTO public.ai_corrections (
  user_id, original_search, final_match_desc, correction_type
) VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'apple',
  'Apple, raw, with skin',
  'manual_match'
);
```

---

## RPC Functions

### `public.match_foods`
Purpose: Hybrid search against `usda_library` using optional **embedding similarity** + optional **text ranking**.

#### Signature (identity arguments)
```
match_foods(
  query_embedding vector,
  query_text text,
  match_threshold double precision,
  match_count integer,
  user_id uuid DEFAULT NULL
)
```

#### Permissions
Supabase RPCs often need explicit execute grants:
```sql
GRANT EXECUTE ON FUNCTION public.match_foods(vector, text, double precision, integer, uuid)
TO authenticated, anon;
```

#### Return shape (expected columns)
- `id`
- `description`
- `kcal_100g`, `protein_100g`, `carbs_100g`, `fat_100g`
- `fiber_100g`, `sugar_100g`, `sodium_100g`
- `similarity` (nullable; null if `query_embedding` is null)
- `text_rank` (nullable; 0 if `query_text` is null, depending on implementation)

#### Usage examples

**1) Text-only search**
```sql
SELECT *
FROM match_foods(
  NULL::vector,          -- query_embedding
  'apple',               -- query_text
  0.0::double precision, -- match_threshold
  3,                     -- match_count
  NULL::uuid             -- user_id
);
```

**2) Embedding-only search**
```sql
SELECT *
FROM match_foods(
  (SELECT embedding FROM public.usda_library WHERE embedding IS NOT NULL LIMIT 1),
  NULL,
  0.0::double precision,
  3,
  NULL::uuid
);
```

**3) Hybrid search**
```sql
SELECT *
FROM match_foods(
  (SELECT embedding FROM public.usda_library WHERE embedding IS NOT NULL LIMIT 1),
  'apple',
  0.6::double precision,
  5,
  NULL::uuid
);
```

---

## Verification Runbook (copy/paste)

### 1) Function exists
```SELECT count(*) 
FROM pg_proc p 
JOIN pg_namespace n ON p.pronamespace = n.oid 
WHERE n.nspname = 'public' 
  AND p.proname = 'match_foods' 
  AND p.pronargs = 5; -- Expect: 1
```

### 2) Callable (text-only)
```sql
SELECT COUNT(*)
FROM match_foods(NULL::vector, 'apple', 0.0::double precision, 3, NULL::uuid);
-- Expect: >= 0 and NO error
```

### 3) Callable (embedding-only)
```sql
SELECT COUNT(*)
FROM match_foods(
  NULL::vector, 
  'salmon', 
  0.0::double precision, 
  1, 
  '00000000-0000-0000-0000-000000000000'::uuid -- Standardized user_id
);
```

### 3.5 ) Permissions Check
```sql
SELECT has_function_privilege('anon', 'match_foods(vector, text, double precision, int, uuid)', 'execute');
-- Expect: true
```

### 4) Embedding dimension is 384
```sql
SELECT vector_dims(embedding) AS embedding_dim
FROM public.usda_library
WHERE embedding IS NOT NULL
LIMIT 5;
-- Expect: 384
```

### 5) `ai_corrections` has match-learning columns
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='ai_corrections'
ORDER BY ordinal_position;
-- Expect: includes original_search and final_match_desc
```
