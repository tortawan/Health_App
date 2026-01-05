-- Ensure public USDA data is RLS protected with an explicit read-only policy
alter table if exists public.usda_library enable row level security;
drop policy if exists "Public Read USDA" on public.usda_library;

create policy "Public Read USDA"
  on public.usda_library for select
  using (true);
