-- 00_init_usda.sql

-- 1. Enable the pgvector extension to work with embeddings
create extension if not exists vector;

-- 2. Create the USDA Library table (Denormalized "Truth" Data)
create table if not exists public.usda_library (
  id bigint primary key,            -- Matches USDA FDC ID
  description text not null,        -- Product name (e.g., "Avocado, raw")
  embedding vector(384),            -- Matches 'all-MiniLM-L6-v2' dimensions
  kcal_100g numeric,
  protein_100g numeric,
  carbs_100g numeric,
  fat_100g numeric,
  
  -- Pre-computed search vector for keyword search
  search_text tsvector generated always as (to_tsvector('english', description)) stored
);

-- 3. Add an index for faster vector similarity search
-- (IVFFlat is good for read-heavy, write-rare data like this)
create index if not exists usda_library_embedding_idx 
  on public.usda_library 
  using ivfflat (embedding vector_cosine_ops) 
  with (lists = 100);

-- 4. Set owner to ensure service_role has full control
alter table public.usda_library owner to postgres;