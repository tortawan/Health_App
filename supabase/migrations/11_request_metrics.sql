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

alter table public.request_metrics enable row level security;

drop policy if exists "Admins can read request metrics" on public.request_metrics;
drop policy if exists "Users can insert request metrics" on public.request_metrics;
drop policy if exists "Anon can insert request metrics" on public.request_metrics;

create policy "Admins can read request metrics"
  on public.request_metrics
  for select
  to authenticated
  using ((auth.jwt() ->> 'role') = 'admin');

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
