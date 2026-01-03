import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    "Supabase credentials are missing in browser client.",
  );
}

export const supabaseBrowser = supabaseUrl && supabaseKey
  ? createBrowserClient(supabaseUrl, supabaseKey)
  : null;