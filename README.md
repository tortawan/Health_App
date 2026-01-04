# Visual RAG Food Tracker (Phase 1 Foundation)

This repository follows the **Main Project Plan** and **Technical Blueprint**: Gemini 1.5 Flash for perception, pgvector-powered Supabase for the nutrition “truth”, and a Next.js App Router UI focused on the trust-but-verify flow.

## Current status

The Phase 2 tracker experience is live:
- **Draft verification**: Camera capture renders a draft and routes it through the Draft Review + Manual Search flow for trust-but-verify logging.
- **Portion memory**: Past portions are remembered and prefilled in new drafts, and you can save templates for rapid reuse.
- **Hybrid search**: Camera + manual text search + barcode scan (OpenFoodFacts) all feed into the same logging pipeline, with Gemini + pgvector backing the AI results.

## Quickstart

1. Duplicate `.env.example` to `.env.local` and fill in your keys:
   - `GEMINI_API_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET` (defaults to `food-photos`, must be public for uploads)
   - `EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2`
   - Optional rate limiting: `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
2. Install dependencies and run the dev server:
   ```bash
   npm install
   npm run dev
   ```
3. Upload a meal photo on the home page. The API will:
   - Send the image + JSON-only prompt to Gemini.
   - Embed the search term locally via `@xenova/transformers`.
   - Query Supabase (`match_foods` RPC) for USDA results.

### Database RPC (run in Supabase)

Create the `match_foods` helper used by `/api/analyze` and the manual search fallback:

```sql
create or replace function match_foods (
  query_embedding vector(384),
  query_text text,
  match_threshold float,
  match_count int
)
returns table (
  id bigint,
  description text,
  kcal_100g numeric,
  protein_100g numeric,
  carbs_100g numeric,
  fat_100g numeric,
  fiber_100g numeric,
  sugar_100g numeric,
  sodium_100g numeric,
  similarity float,
  text_rank float
)
language plpgsql
as $$
declare
  ts_query tsquery := null;
begin
  if coalesce(trim(query_text), '') <> '' then
    ts_query := websearch_to_tsquery('english', query_text);
  end if;

  return query
  select
    usda_library.id,
    usda_library.description,
    usda_library.kcal_100g,
    usda_library.protein_100g,
    usda_library.carbs_100g,
    usda_library.fat_100g,
    usda_library.fiber_100g,
    usda_library.sugar_100g,
    usda_library.sodium_100g,
    1 - (usda_library.embedding <=> query_embedding) as similarity,
    coalesce(ts_rank_cd(usda_library.search_text, ts_query), 0) as text_rank
  from usda_library
  where (1 - (usda_library.embedding <=> query_embedding)) > match_threshold
    or (ts_query is not null and ts_query @@ usda_library.search_text)
  order by ((1 - (usda_library.embedding <=> query_embedding)) * 0.7)
    + (coalesce(ts_rank_cd(usda_library.search_text, ts_query), 0) * 0.3) desc
  limit match_count;
end;
$$;
```

### USDA data pipeline

Run the standalone scripts (outside of Next.js) to seed the `usda_library` table:

```bash
npm run usda:download   # fetch & unzip the USDA Foundation Foods CSV bundle
npm run usda:flatten    # flatten macros into a single JSON row per food
npm run usda:embed      # embed descriptions and upsert into Supabase
```

`usda:embed` expects `SUPABASE_SERVICE_ROLE_KEY` for writes and uses the same embedding model as the app (`Xenova/all-MiniLM-L6-v2`).

## Backend details

- **API**: `POST /api/analyze` accepts `multipart/form-data` with `file`.
- **Embeddings**: Uses `Xenova/all-MiniLM-L6-v2` with mean pooling + normalization to stay aligned with pgvector rows.
- **Supabase**: Expects the `usda_library` table and RLS policies from the blueprint. The RPC `match_foods` should return `description`, macro columns, and a `distance`/`similarity` field.
- **Storage**: Meal images are uploaded to the public Supabase Storage bucket defined by `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET`. The resulting public URL is stored alongside food log entries.
- **Rate limiting**: `/api/analyze` uses Upstash Redis (when configured) to apply a sliding window limit per client IP and returns `429` when exceeded.

## UI principles

- Optimistic preview while Gemini + Supabase work in parallel.
- Draft-only logging: user must confirm or adjust weight before saving.
- Confidence labels derived from vector distance to nudge manual verification when needed.
- Low-confidence path includes manual text search + adjustable weights before logging to RLS-protected `food_logs`.

## Notes

- If environment variables are missing, the API returns a mock payload so the UI remains demoable.
- The stack targets zero-cost free tiers: Vercel (Next.js), Gemini free tier, and Supabase free tier.
