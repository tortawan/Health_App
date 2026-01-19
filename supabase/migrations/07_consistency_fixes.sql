-- 1. Create ai_corrections table (Audit Issue #2)
create table if not exists public.ai_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  original_food text,
  original_search text,
  original_match_id bigint,
  original_match_desc text,
  original_weight numeric,
  corrected_weight numeric,
  final_weight numeric,
  final_match_desc text,
  correction_type text,
  logged_at timestamptz default now()
);

-- 2. Add missing columns to food_logs (Audit Issue #4)
alter table public.food_logs
add column if not exists fiber numeric,
add column if not exists sugar numeric,
add column if not exists sodium numeric;

-- 3. Add missing columns to user_profiles (Audit Issue #1 - related to macroTargets)
alter table public.user_profiles
add column if not exists protein_target numeric,
add column if not exists carbs_target numeric,
add column if not exists fat_target numeric;

-- 4. Fix Vector Dimension Mismatch (Audit Issue #3)
-- The local embedder uses 384 dimensions (all-MiniLM-L6-v2), but the previous migration used 1536.
-- We must alter the column type. WARNING: This clears existing embeddings if they are incompatible.

-- First, ensure the USDA library table exists. If it was missing, we create it with the correct schema.
create table if not exists public.usda_library (
  id bigint primary key,
  description text not null,
  embedding vector(384),
  kcal_100g numeric,
  protein_100g numeric,
  carbs_100g numeric,
  fat_100g numeric,
  fiber_100g numeric,
  sugar_100g numeric,
  sodium_100g numeric,
  search_text tsvector generated always as (to_tsvector('english', description)) stored
);

alter table if exists public.usda_library
  add column if not exists fiber_100g numeric,
  add column if not exists sugar_100g numeric,
  add column if not exists sodium_100g numeric;

-- If the table existed but had the wrong embedding size (1536), we alter it.
-- This block handles the case where the table already existed from a previous migration.
do $$
begin
  -- Check if the column exists and has the wrong dimension
  if exists (
    select 1 
    from information_schema.columns 
    where table_name = 'usda_library' 
    and column_name = 'embedding' 
    and udt_name = 'vector' 
  ) then
     -- Drop the dependent function first to allow altering the column
     drop function if exists search_foods(text, vector, float, int);
     drop function if exists match_foods(text, vector, float, int);
     drop function if exists match_foods(vector(384), text, float, int);
     drop function if exists match_foods(vector(384), text, float, int, uuid);
     
     -- Alter the column type to 384 dimensions
     alter table public.usda_library 
     alter column embedding type vector(384);
  end if;
end $$;

-- Recreate the search function with the correct dimension
create or replace function match_foods(
  query_text text,
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
  fiber_100g numeric,
  sugar_100g numeric,
  sodium_100g numeric,
  similarity double precision,
  text_rank double precision
)
language plpgsql
security invoker
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
    (1 - (usda_library.embedding <=> query_embedding))::double precision as similarity,
    coalesce(ts_rank_cd(usda_library.search_text, ts_query), 0)::double precision as text_rank
  from usda_library
  where (1 - (usda_library.embedding <=> query_embedding)) > match_threshold
    or (ts_query is not null and ts_query @@ usda_library.search_text)
  order by ((1 - (usda_library.embedding <=> query_embedding)) * 0.7)
    + (coalesce(ts_rank_cd(usda_library.search_text, ts_query), 0) * 0.3) desc
  limit match_count;
end;
$$;

grant execute on function match_foods(text, vector, float, int) to authenticated, anon;

-- 5. Create storage bucket if it doesn't exist (Audit Issue #3)
-- Note: SQL cannot create buckets directly in standard Supabase migrations usually,
-- but we can insert into the storage schema if permissions allow.
-- This is a fallback; usually buckets are created in the dashboard.
insert into storage.buckets (id, name, public)
values ('food-photos', 'food-photos', true)
on conflict (id) do nothing;

-- Ensure public access policy for the bucket
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'food-photos' );

create policy "Authenticated Upload"
  on storage.objects for insert
  to authenticated
  with check ( bucket_id = 'food-photos' );
