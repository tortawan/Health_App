# Visual RAG Food Tracker (Phase 1 Foundation)

This repository follows the **Main Project Plan** and **Technical Blueprint**: Gemini 1.5 Flash for perception, pgvector-powered Supabase for the nutrition “truth”, and a Next.js App Router UI focused on the trust-but-verify flow.

## Quickstart

1. Duplicate `.env.example` to `.env.local` and fill in your keys:
   - `GEMINI_API_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2`
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
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    usda_library.id,
    usda_library.description,
    usda_library.kcal_100g,
    usda_library.protein_100g,
    usda_library.carbs_100g,
    usda_library.fat_100g,
    1 - (usda_library.embedding <=> query_embedding) as similarity
  from usda_library
  where 1 - (usda_library.embedding <=> query_embedding) > match_threshold
  order by usda_library.embedding <=> query_embedding
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

## UI principles

- Optimistic preview while Gemini + Supabase work in parallel.
- Draft-only logging: user must confirm or adjust weight before saving.
- Confidence labels derived from vector distance to nudge manual verification when needed.
- Low-confidence path includes manual text search + adjustable weights before logging to RLS-protected `food_logs`.

## Notes

- If environment variables are missing, the API returns a mock payload so the UI remains demoable.
- The stack targets zero-cost free tiers: Vercel (Next.js), Gemini free tier, and Supabase free tier.
