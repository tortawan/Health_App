-- Enable required extensions
create extension if not exists "pgcrypto";

-- Weight history table for longitudinal tracking
create table if not exists public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  weight_kg numeric not null,
  logged_at timestamptz not null default now()
);

-- Meal templates to speed up repeat logging
create table if not exists public.meal_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  items jsonb not null,
  created_at timestamptz not null default now()
);

-- Existing tables: ensure user_profiles is writeable only by owner
alter table if exists public.user_profiles enable row level security;
drop policy if exists "Users can select their profile" on public.user_profiles;
drop policy if exists "Users can insert their profile" on public.user_profiles;
drop policy if exists "Users can update their profile" on public.user_profiles;

create policy "Users can select their profile"
  on public.user_profiles for select
  using (auth.uid() = user_id);

create policy "Users can insert their profile"
  on public.user_profiles for insert
  with check (auth.uid() = user_id);

create policy "Users can update their profile"
  on public.user_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Food logs should already be RLS protected; enforce owner access
alter table if exists public.food_logs enable row level security;
drop policy if exists "Users can select their food logs" on public.food_logs;
drop policy if exists "Users can insert their food logs" on public.food_logs;
drop policy if exists "Users can update their food logs" on public.food_logs;
drop policy if exists "Users can delete their food logs" on public.food_logs;

create policy "Users can select their food logs"
  on public.food_logs for select
  using (auth.uid() = user_id);

create policy "Users can insert their food logs"
  on public.food_logs for insert
  with check (auth.uid() = user_id);

create policy "Users can update their food logs"
  on public.food_logs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their food logs"
  on public.food_logs for delete
  using (auth.uid() = user_id);

-- Weight log policies
alter table public.weight_logs enable row level security;
drop policy if exists "Users can select their weight logs" on public.weight_logs;
drop policy if exists "Users can insert their weight logs" on public.weight_logs;

create policy "Users can select their weight logs"
  on public.weight_logs for select
  using (auth.uid() = user_id);

create policy "Users can insert their weight logs"
  on public.weight_logs for insert
  with check (auth.uid() = user_id);

-- Meal template policies
alter table public.meal_templates enable row level security;
drop policy if exists "Users can select their meal templates" on public.meal_templates;
drop policy if exists "Users can insert their meal templates" on public.meal_templates;
drop policy if exists "Users can delete their meal templates" on public.meal_templates;

create policy "Users can select their meal templates"
  on public.meal_templates for select
  using (auth.uid() = user_id);

create policy "Users can insert their meal templates"
  on public.meal_templates for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their meal templates"
  on public.meal_templates for delete
  using (auth.uid() = user_id);

-- USDA reference data should remain read-only to anon/authenticated roles
revoke insert, update, delete on public.usda_library from anon, authenticated;
grant select on public.usda_library to anon, authenticated;
grant insert, update, delete on public.usda_library to service_role;
