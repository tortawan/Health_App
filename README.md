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

## Backend details

- **API**: `POST /api/analyze` accepts `multipart/form-data` with `file`.
- **Embeddings**: Uses `Xenova/all-MiniLM-L6-v2` with mean pooling + normalization to stay aligned with pgvector rows.
- **Supabase**: Expects the `usda_library` table and RLS policies from the blueprint. The RPC `match_foods` should return `description`, macro columns, and a `distance`/`similarity` field.

## UI principles

- Optimistic preview while Gemini + Supabase work in parallel.
- Draft-only logging: user must confirm or adjust weight before saving.
- Confidence labels derived from vector distance to nudge manual verification when needed.

## Notes

- If environment variables are missing, the API returns a mock payload so the UI remains demoable.
- The stack targets zero-cost free tiers: Vercel (Next.js), Gemini free tier, and Supabase free tier.
