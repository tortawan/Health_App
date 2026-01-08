-- Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;

-- Create a function to search for foods
create or replace function search_foods(
  query_text text,
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  description text,
  brand_owner text,
  ingredients text,
  serving_size real,
  serving_size_unit text,
  household_serving_fulltext text,
  kcal_100g real,
  protein_100g real,
  carbs_100g real,
  fat_100g real,
  similarity double precision
)
language plpgsql
as $$
begin
  return query
  select
    foods.id,
    foods.description,
    foods.brand_owner,
    foods.ingredients,
    foods.serving_size::real,               -- Explicit cast
    foods.serving_size_unit,
    foods.household_serving_fulltext,
    foods.kcal_100g::real,                  -- Explicit cast
    foods.protein_100g::real,               -- Explicit cast
    foods.carbs_100g::real,                 -- Explicit cast
    foods.fat_100g::real,                   -- Explicit cast
    (1 - (foods.embedding <=> query_embedding))::double precision as similarity
  from foods
  where 1 - (foods.embedding <=> query_embedding) > match_threshold
  order by foods.embedding <=> query_embedding
  limit match_count;
end;
$$;