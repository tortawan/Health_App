-- Consolidating missing schema updates

-- 1. Ensure ai_corrections has all necessary analysis columns
alter table public.ai_corrections 
  add column if not exists image_path text,
  add column if not exists corrected_calories numeric,
  add column if not exists corrected_protein numeric,
  add column if not exists corrected_carbs numeric,
  add column if not exists corrected_fat numeric,
  add column if not exists notes text,
  add column if not exists source_log_id uuid references public.food_logs(id);

-- 2. Ensure RLS policies on ai_corrections are up to date
alter table public.ai_corrections enable row level security;

drop policy if exists "Users can insert own corrections" on public.ai_corrections;
create policy "Users can insert own corrections"
  on public.ai_corrections for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own corrections" on public.ai_corrections;
create policy "Users can read own corrections"
  on public.ai_corrections for select
  using (auth.uid() = user_id);