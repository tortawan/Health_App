-- Community sharing, likes, and discovery helpers

-- Simple like table for community feed
create table if not exists public.log_likes (
  id uuid primary key default gen_random_uuid(),
  log_id uuid not null references public.food_logs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (log_id, user_id)
);

alter table public.log_likes enable row level security;

drop policy if exists "Users can view likes" on public.log_likes;
drop policy if exists "Users can like entries" on public.log_likes;
drop policy if exists "Users can remove their likes" on public.log_likes;

create policy "Users can view likes"
  on public.log_likes for select
  using (true);

create policy "Users can like entries"
  on public.log_likes for insert
  with check (auth.uid() = user_id);

create policy "Users can remove their likes"
  on public.log_likes for delete
  using (auth.uid() = user_id);

-- Allow viewing of public profiles and their logs
drop policy if exists "Public can view public profiles" on public.user_profiles;
create policy "Public can view public profiles"
  on public.user_profiles for select
  using (is_public = true);

drop policy if exists "Public can view public food logs" on public.food_logs;
create policy "Public can view public food logs"
  on public.food_logs for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.user_profiles p
      where p.user_id = food_logs.user_id
        and p.is_public = true
    )
  );

-- Add a lightweight username/handle for sharing contexts
alter table if exists public.user_profiles
  add column if not exists username text unique;

-- Training dataset capture for flagged entries
create table if not exists public.training_dataset (
  id uuid primary key default gen_random_uuid(),
  source_log_id uuid references public.food_logs(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  image_path text,
  corrected_food_name text,
  corrected_weight_g numeric,
  corrected_calories numeric,
  corrected_protein numeric,
  corrected_carbs numeric,
  corrected_fat numeric,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.training_dataset enable row level security;

drop policy if exists "Contributors can insert training rows" on public.training_dataset;
drop policy if exists "Owners can read their training rows" on public.training_dataset;

create policy "Contributors can insert training rows"
  on public.training_dataset for insert
  with check (auth.uid() = user_id);

create policy "Owners can read their training rows"
  on public.training_dataset for select
  using (auth.uid() = user_id);
