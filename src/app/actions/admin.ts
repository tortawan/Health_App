"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase";

// --- Helpers ---

const isAdminEmail = (email: string | null | undefined) => {
  const adminEmail = process.env.ADMIN_EMAIL;
  return Boolean(adminEmail && email && adminEmail.toLowerCase() === email.toLowerCase());
};

async function requireAdminSession() {
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session || !isAdminEmail(session.user.email ?? null)) {
    throw new Error("Unauthorized");
  }
  return session;
}

// --- Types ---

export type RequestMetricRow = {
  id: string;
  user_id: string | null;
  created_at: string;
  duration_ms: number;
  gemini_status: string;
  match_threshold_used: number | null;
  matches_count: number | null;
  rpc_error_code: string | null;
};

export type AppConfigEntry = {
  key: string;
  value: string;
  updated_at: string;
};

// --- Actions ---

export async function getRequestMetricsSummary() {
  await requireAdminSession();
  const service = createSupabaseServiceClient();
  if (!service) {
    return {
      rows: [] as RequestMetricRow[],
      summary: null,
      error: "Set SUPABASE_SERVICE_ROLE_KEY to enable diagnostics.",
    };
  }

  const { data, error } = await service
    .from("request_metrics")
    .select(
      "id, user_id, created_at, duration_ms, gemini_status, match_threshold_used, matches_count, rpc_error_code",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = data ?? [];
  const totalDuration = rows.reduce((sum, row) => sum + (row.duration_ms ?? 0), 0);
  const avgDuration = rows.length ? totalDuration / rows.length : 0;
  const failCount = rows.filter((row) => row.gemini_status === "fail").length;
  const failRate = rows.length ? failCount / rows.length : 0;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: cbOpenCount } = await service
    .from("request_metrics")
    .select("id", { count: "exact", head: true })
    .eq("gemini_status", "cb_open")
    .gte("created_at", since);

  return {
    rows,
    summary: { avgDuration, failRate, cbOpenCount: cbOpenCount ?? 0 },
    error: error ? error.message : null,
  };
}

export async function getAppConfig() {
  await requireAdminSession();
  const service = createSupabaseServiceClient();
  if (!service) {
    return {
      entries: [] as AppConfigEntry[],
      error: "Set SUPABASE_SERVICE_ROLE_KEY to enable app config.",
    };
  }

  const { data, error } = await service
    .from("app_config")
    .select("key, value, updated_at")
    .order("key");

  return {
    entries: data ?? [],
    error: error ? error.message : null,
  };
}

export async function updateAppConfig(formData: FormData) {
  await requireAdminSession();
  const service = createSupabaseServiceClient();
  if (!service) throw new Error("Set SUPABASE_SERVICE_ROLE_KEY to update app config.");

  const key = String(formData.get("key") ?? "").trim();
  const value = String(formData.get("value") ?? "").trim();

  if (!key || !value) throw new Error("Key and value are required.");

  const { error } = await service.from("app_config").upsert({
    key,
    value,
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;

  revalidatePath("/settings/admin");
  revalidatePath("/diagnostics");
  return { success: true };
}