create table if not exists public.ai_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  original_search text not null,
  final_match_desc text not null,
  logged_at timestamptz not null default now()
);

alter table if exists public.ai_corrections
  add column if not exists original_search text,
  add column if not exists final_match_desc text,
  add column if not exists logged_at timestamptz,
  alter column user_id set not null,
  alter column original_search set not null,
  alter column final_match_desc set not null,
  alter column logged_at set not null,
  alter column logged_at set default now();

alter table public.ai_corrections enable row level security;

drop policy if exists "Users can insert ai corrections" on public.ai_corrections;
drop policy if exists "Users can read ai corrections" on public.ai_corrections;

create policy "Users can insert ai corrections"
  on public.ai_corrections
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can read ai corrections"
  on public.ai_corrections
  for select
  to authenticated
  using (auth.uid() = user_id);
