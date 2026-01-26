-- 1. Create Missing Tables (app_config & request_metrics)
create table if not exists public.app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- Seed default config if empty
insert into public.app_config (key, value)
values
  ('MATCH_THRESHOLD_BASE', '0.6'),
  ('CIRCUIT_BREAKER_THRESHOLD', '3'),
  ('CIRCUIT_BREAKER_COOLDOWN_MS', '60000'),
  ('GEMINI_MODEL', 'gemini-2.5-flash')
on conflict (key) do nothing;

create table if not exists public.request_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  duration_ms integer not null,
  gemini_status text not null,
  match_threshold_used double precision,
  matches_count integer,
  rpc_error_code text
);

-- Enable RLS
alter table public.app_config enable row level security;
alter table public.request_metrics enable row level security;

-- FIX: Drop policies if they exist to prevent "policy already exists" (42710) errors
drop policy if exists "Admins can read app config" on public.app_config;
drop policy if exists "Admins can insert app config" on public.app_config;

create policy "Admins can read app config" 
  on public.app_config 
  for select 
  to authenticated 
  using ((auth.jwt() ->> 'role') = 'admin');

create policy "Admins can insert app config" 
  on public.app_config 
  for insert 
  to authenticated 
  with check ((auth.jwt() ->> 'role') = 'admin');


-- FIX: Drop request_metrics policies if they exist
drop policy if exists "Users can insert request metrics" on public.request_metrics;
drop policy if exists "Anon can insert request metrics" on public.request_metrics;

create policy "Users can insert request metrics" 
  on public.request_metrics 
  for insert 
  to authenticated 
  with check (auth.uid() = user_id);

create policy "Anon can insert request metrics" 
  on public.request_metrics 
  for insert 
  to anon 
  with check (user_id is null);


-- 2. Fix ai_corrections to match TypeScript definition
alter table public.ai_corrections 
  add column if not exists image_path text,
  add column if not exists corrected_calories numeric,
  add column if not exists corrected_protein numeric,
  add column if not exists corrected_carbs numeric,
  add column if not exists corrected_fat numeric,
  add column if not exists notes text,
  add column if not exists source_log_id uuid references public.food_logs(id);


-- 3. Cleanup: Drop unused function
drop function if exists search_foods(text, vector, float, int);


-- 4. FIX match_foods (The Crash Fix)
drop function if exists match_foods(text, vector, float, int);
drop function if exists match_foods(vector, text, float, int);
drop function if exists match_foods(vector, text, float, int, uuid);

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
    select distinct lower(food_name) as food_name
    from public.food_logs
    where public.food_logs.user_id = match_foods.user_id
  ),
  base as (
    select
      u.id,
      u.description,
      u.search_text,
      u.kcal_100g,
      u.protein_100g,
      u.carbs_100g,
      u.fat_100g,
      u.fiber_100g,
      u.sugar_100g,
      u.sodium_100g,
      (1 - (u.embedding <=> query_embedding)) as base_similarity,
      coalesce(ts_rank_cd(u.search_text, ts_query), 0)::float as text_rank,
      case 
        when match_foods.user_id is not null and pf.food_name is not null then 0.1 
        else 0 
      end as familiarity_boost
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
    (b.base_similarity + b.familiarity_boost)::float as similarity,
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