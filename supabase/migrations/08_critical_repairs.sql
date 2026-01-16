-- 1. FORCE RESET the ai_corrections table 
-- (This fixes the "column user_id does not exist" error by deleting the bad table first)
DROP TABLE IF EXISTS public.ai_corrections;

CREATE TABLE public.ai_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  original_weight numeric,
  corrected_weight numeric,
  food_name text,
  correction_type text,
  logged_at timestamptz default now()
);

-- 2. Apply Security Policies
ALTER TABLE public.ai_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own corrections"
ON public.ai_corrections FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- 3. Fix USDA Permissions (Safe to re-run)
-- This ensures the "Visual RAG" can actually read the nutrition database
ALTER TABLE public.usda_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Read USDA" ON public.usda_library;

CREATE POLICY "Public Read USDA"
ON public.usda_library FOR SELECT
USING (true);