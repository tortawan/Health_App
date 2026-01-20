create table if not exists public.app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;

drop policy if exists "Admins can read app config" on public.app_config;
drop policy if exists "Admins can insert app config" on public.app_config;
drop policy if exists "Admins can update app config" on public.app_config;

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

create policy "Admins can update app config"
  on public.app_config
  for update
  to authenticated
  using ((auth.jwt() ->> 'role') = 'admin')
  with check ((auth.jwt() ->> 'role') = 'admin');

insert into public.app_config (key, value)
values
  ('MATCH_THRESHOLD_BASE', '0.6'),
  ('CIRCUIT_BREAKER_THRESHOLD', '3'),
  ('CIRCUIT_BREAKER_COOLDOWN_MS', '60000'),
  ('GEMINI_MODEL', 'gemini-2.5-flash')
on conflict (key) do nothing;
