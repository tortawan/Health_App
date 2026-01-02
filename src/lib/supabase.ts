import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    "Supabase credentials are missing. Populate NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable API calls.",
  );
}

export const supabaseServer = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
      },
    })
  : null;

export const supabaseBrowser = supabaseUrl && supabaseKey
  ? createBrowserClient(supabaseUrl, supabaseKey)
  : null;

export function createSupabaseServerClient() {
  const cookieStore = cookies();

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Supabase credentials are missing. Populate NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable API calls.",
    );
  }

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      get(name) {
        return cookieStore.get(name);
      },
      set(name, value, options) {
        cookieStore.set({ name, value, ...options, path: options?.path ?? "/" });
      },
      remove(name, options) {
        cookieStore.set({
          name,
          value: "",
          ...options,
          path: options?.path ?? "/",
          expires: new Date(0),
        });
      },
    },
  });
}
