-- Drop old variants to prevent ambiguity
DROP FUNCTION IF EXISTS public.match_foods(vector, text, double precision, integer, uuid);
DROP FUNCTION IF EXISTS public.match_foods(text, vector, double precision, integer, uuid);
DROP FUNCTION IF EXISTS public.search_foods(text, vector, float, int);

CREATE OR REPLACE FUNCTION public.match_foods (
  query_embedding vector(384),
  query_text text,
  match_threshold double precision,
  match_count integer,
  user_id uuid default null -- Standardized name
) RETURNS TABLE (
  id bigint,
  description text,
  kcal_100g numeric,
  protein_100g numeric,
  carbs_100g numeric,
  fat_100g numeric,
  fiber_100g numeric,
  sugar_100g numeric,
  sodium_100g numeric,
  similarity double precision,
  text_rank double precision
) LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  -- Your core logic comparing fl.user_id = match_foods.user_id
  -- matches existing schemas
END;
$$;