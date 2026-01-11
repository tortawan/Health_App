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

-- First, ensure the foods table exists. If it was missing, we create it with the correct schema.
create table if not exists public.foods (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  brand_owner text,
  ingredients text,
  serving_size numeric,
  serving_size_unit text,
  household_serving_fulltext text,
  kcal_100g numeric,
  protein_100g numeric,
  carbs_100g numeric,
  fat_100g numeric,
  fiber_100g numeric,
  sugar_100g numeric,
  sodium_100g numeric,
  embedding vector(384) -- Created directly with correct size
);

-- If the table existed but had the wrong embedding size (1536), we alter it.
-- This block handles the case where the table already existed from a previous migration.
do $$
begin
  -- Check if the column exists and has the wrong dimension
  if exists (
    select 1 
    from information_schema.columns 
    where table_name = 'foods' 
    and column_name = 'embedding' 
    and udt_name = 'vector' 
  ) then
     -- Drop the dependent function first to allow altering the column
     drop function if exists search_foods(text, vector, float, int);
     
     -- Alter the column type to 384 dimensions
     alter table public.foods 
     alter column embedding type vector(384);
  end if;
end $$;

-- Recreate the search function with the correct dimension
create or replace function search_foods(
  query_text text,
  query_embedding vector(384), -- Changed from 1536 to 384
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  description text,
  brand_owner text,
  ingredients text,
  serving_size real,
  serving_size_unit text,
  household_serving_fulltext text,
  kcal_100g real,
  protein_100g real,
  carbs_100g real,
  fat_100g real,
  similarity double precision
)
language plpgsql
as $$
begin
  return query
  select
    foods.id,
    foods.description,
    foods.brand_owner,
    foods.ingredients,
    foods.serving_size::real,
    foods.serving_size_unit,
    foods.household_serving_fulltext,
    foods.kcal_100g::real,
    foods.protein_100g::real,
    foods.carbs_100g::real,
    foods.fat_100g::real,
    (1 - (foods.embedding <=> query_embedding))::double precision as similarity
  from foods
  where 1 - (foods.embedding <=> query_embedding) > match_threshold
  order by foods.embedding <=> query_embedding
  limit match_count;
end;
$$;

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