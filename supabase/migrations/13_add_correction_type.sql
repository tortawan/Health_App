alter table if exists public.ai_corrections
  add column if not exists correction_type text;
