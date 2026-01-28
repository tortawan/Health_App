-- 1. Add privacy toggle
alter table if exists public.user_profiles
  add column if not exists is_public boolean not null default false;

-- 2. Add extended nutrients
alter table if exists public.food_logs
  add column if not exists fiber numeric,
  add column if not exists sugar numeric,
  add column if not exists sodium numeric;

-- 3. Update match_foods function
-- Drop previous signatures to prevent conflicts
drop function if exists match_foods(vector(384), text, float, int);
drop function if exists match_foods(vector(384), text, float, int, uuid);

create or replace function match_foods (
  query_embedding vector(384),
  query_text text,
  match_threshold float,
  match_count int,
  user_id uuid default null
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
  with prior_foods as (
    select distinct lower(fl.food_name) as food_name
    from public.food_logs fl
    -- Explicitly compare column (fl.user_id) vs Function Parameter (match_foods.user_id)
    where fl.user_id = match_foods.user_id
  ),
  base as (
    select
      u.*,
      (1 - (u.embedding <=> query_embedding)) as base_similarity,
      coalesce(ts_rank_cd(u.search_text, ts_query), 0)::float as text_rank,
      case when pf.food_name is not null then 0.1 else 0 end as familiarity_boost
    from public.usda_library u
    left join prior_foods pf on pf.food_name = lower(u.description)
  )
  select
    b.id,
    b.description,
    b.kcal_100g,
    b.protein_100g,
    b.carbs_100g,
    b.fat_100g,
    b.fiber_100g,
    b.sugar_100g,
    b.sodium_100g,
    b.base_similarity + b.familiarity_boost as similarity,
    b.text_rank
  from base b
  where
    (b.base_similarity > match_threshold)
    or (ts_query is not null and ts_query @@ b.search_text)
  order by
    ((b.base_similarity + b.familiarity_boost) * 0.7)
      + (b.text_rank * 0.3) desc
  limit match_count;
end;
$$;
-- 4. Create Water Logs Table
create table if not exists public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  amount_ml integer not null check (amount_ml > 0),
  logged_at timestamptz not null default now()
);

-- ... (keep existing code for sections 1-4) ...

-- 5. Enable RLS for Water Logs
alter table if exists public.water_logs enable row level security;

-- Drop existing policies to ensure clean slate if re-running
drop policy if exists "Users can select their water logs" on public.water_logs;
drop policy if exists "Users can insert their water logs" on public.water_logs;
drop policy if exists "Users can update their water logs" on public.water_logs;
drop policy if exists "Users can delete their water logs" on public.water_logs;

-- Re-create all necessary policies
create policy "Users can select their water logs"
  on public.water_logs for select
  using (auth.uid() = user_id);

create policy "Users can insert their water logs"
  on public.water_logs for insert
  with check (auth.uid() = user_id);

create policy "Users can update their water logs"
  on public.water_logs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their water logs"
  on public.water_logs for delete
  using (auth.uid() = user_id);

create index if not exists water_logs_user_date_idx
  on public.water_logs (user_id, logged_at desc);