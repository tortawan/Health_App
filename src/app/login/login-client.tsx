"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

type Mode = "signin" | "signup";

export default function LoginClient() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  const toggleMode = () => {
    setMode((prev) => (prev === "signin" ? "signup" : "signin"));
    setError(null);
    setMessage(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!supabaseBrowser) {
      setError(
        "Supabase credentials are missing. Populate NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      );
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    const supabase = supabaseBrowser;
    const result =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    if (result.error) {
      setError(result.error.message);
    } else {
      setMessage(
        mode === "signup"
          ? "Account created. You can now sign in."
          : "Signed in! Redirecting...",
      );
      router.replace("/");
    }

    setLoading(false);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-white">
            {mode === "signin" ? "Login" : "Create account"}
          </h1>
          <button
            className="text-sm text-emerald-200 hover:text-emerald-100"
            onClick={toggleMode}
            type="button"
          >
            {mode === "signin" ? "Need an account?" : "Have an account?"}
          </button>
        </div>
        <p className="text-sm text-white/60">
          Use Supabase email/password auth to protect your food logs. Sessions
          are stored via HttpOnly cookies for RLS compatibility.
        </p>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <label className="text-sm text-white/70" htmlFor="email">
              Email
            </label>
            <input
              autoComplete="email"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
              id="email"
              name="email"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={email}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-white/70" htmlFor="password">
              Password
            </label>
            <input
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
              id="password"
              minLength={6}
              name="password"
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              type="password"
              value={password}
            />
          </div>
          <button className="btn w-full" disabled={loading} type="submit">
            {loading ? "Working..." : mode === "signin" ? "Sign in" : "Sign up"}
          </button>
        </form>
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
            {error}
          </div>
        )}
        {message && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-50">
            {message}
          </div>
        )}
      </div>
    </main>
  );
}
