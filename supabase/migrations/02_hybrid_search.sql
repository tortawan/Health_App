-- Add micronutrient columns and search helpers for hybrid search
alter table if exists public.usda_library
  add column if not exists fiber_100g numeric,
  add column if not exists sugar_100g numeric,
  add column if not exists sodium_100g numeric;

-- Search vector to support full-text queries alongside embeddings
alter table if exists public.usda_library
  add column if not exists search_text tsvector
    generated always as (
      to_tsvector('english', coalesce(description, ''))
    ) stored;

create index if not exists usda_library_search_idx
  on public.usda_library using gin (search_text);

-- Hybrid match function: blend vector similarity + full-text rank
create or replace function match_foods (
  query_embedding vector(384),
  query_text text,
  match_threshold float,
  match_count int
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
  select
    u.id,
    u.description,
    u.kcal_100g,
    u.protein_100g,
    u.carbs_100g,
    u.fat_100g,
    u.fiber_100g,
    u.sugar_100g,
    u.sodium_100g,
    1 - (u.embedding <=> query_embedding) as similarity,
    coalesce(ts_rank_cd(u.search_text, ts_query), 0) as text_rank
  from public.usda_library u
  where
    (
      (1 - (u.embedding <=> query_embedding)) > match_threshold
    )
    or (ts_query is not null and ts_query @@ u.search_text)
  order by
    ((1 - (u.embedding <=> query_embedding)) * 0.7)
      + (coalesce(ts_rank_cd(u.search_text, ts_query), 0) * 0.3) desc
  limit match_count;
end;
$$;
