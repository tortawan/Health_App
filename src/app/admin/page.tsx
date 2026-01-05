import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase";

async function getMetrics() {
  const service = createSupabaseServiceClient();
  if (!service) {
    return {
      userCount: null,
      todaysLogs: null,
      storageBytes: null,
      error: "Set SUPABASE_SERVICE_ROLE_KEY to enable admin metrics.",
    };
  }

  const { count: userCount } = await service
    .from("user_profiles")
    .select("*", { count: "exact", head: true });

  const today = new Date();
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const { count: todaysLogs } = await service
    .from("food_logs")
    .select("*", { count: "exact", head: true })
    .gte("consumed_at", start.toISOString())
    .lt("consumed_at", end.toISOString());

  const bucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? "user-images";

  const listAll = async (prefix = ""): Promise<number> => {
    const { data, error } = await service.storage.from(bucket).list(prefix, {
      limit: 1000,
    });
    if (error || !data) return 0;
    let total = 0;
    for (const entry of data) {
      const size = entry.metadata?.size;
      if (typeof size === "number") {
        total += size;
      } else if (!entry.name.endsWith("/")) {
        // Likely a folder; recurse
        total += await listAll(`${prefix}${entry.name}/`);
      }
    }
    return total;
  };

  const storageBytes = await listAll("");

  return {
    userCount: userCount ?? 0,
    todaysLogs: todaysLogs ?? 0,
    storageBytes,
    error: null,
  };
}

type CorrectionEntry = {
  id?: number;
  original_food: string | null;
  original_search: string | null;
  original_match_desc: string | null;
  final_match_desc: string | null;
  final_weight: number | null;
  correction_type: string | null;
  logged_at: string | null;
};

async function getCorrections(): Promise<{
  entries: CorrectionEntry[];
  error: string | null;
}> {
  const service = createSupabaseServiceClient();
  if (!service) {
    return {
      entries: [],
      error: "Set SUPABASE_SERVICE_ROLE_KEY to enable admin metrics.",
    };
  }

  const { data, error } = await service
    .from("ai_corrections")
    .select(
      "id, original_food, original_search, original_match_desc, final_match_desc, final_weight, correction_type, logged_at",
    )
    .order("logged_at", { ascending: false })
    .limit(50);

  return {
    entries: data ?? [],
    error: error ? error.message : null,
  };
}

function formatBytes(bytes: number | null) {
  if (bytes === null) return "Unknown";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(2)} ${units[unit]}`;
}

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!session || !adminEmail || session.user.email?.toLowerCase() !== adminEmail.toLowerCase()) {
    redirect("/");
  }

  const metrics = await getMetrics();
  const corrections = await getCorrections();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-emerald-200">Admin</p>
          <h1 className="text-2xl font-semibold text-white">System health</h1>
          <p className="text-sm text-white/60">
            Private dashboard for {adminEmail}. Uses service role to bypass RLS.
          </p>
        </div>
        <Link className="btn bg-white/10 text-white hover:bg-white/20" href="/">
          Back to app
        </Link>
      </div>

      {metrics.error ? (
        <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm text-yellow-100">
          {metrics.error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
          <p className="text-xs uppercase tracking-wide text-white/60">Total users</p>
          <p className="text-3xl font-semibold text-white">{metrics.userCount ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
          <p className="text-xs uppercase tracking-wide text-white/60">Logs today</p>
          <p className="text-3xl font-semibold text-white">{metrics.todaysLogs ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
          <p className="text-xs uppercase tracking-wide text-white/60">Storage usage</p>
          <p className="text-3xl font-semibold text-white">{formatBytes(metrics.storageBytes)}</p>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-white/10 bg-slate-900/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-white/60">Feedback</p>
            <h2 className="text-lg font-semibold text-white">Latest corrections</h2>
            <p className="text-sm text-white/60">Showing the 50 most recent ai_corrections entries.</p>
          </div>
          {corrections.error ? (
            <span className="pill bg-amber-500/20 text-amber-100">{corrections.error}</span>
          ) : (
            <span className="pill bg-white/5 text-white/70">{corrections.entries.length} rows</span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-white/80">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase text-white/60">
                <th className="px-2 py-2">When</th>
                <th className="px-2 py-2">Search</th>
                <th className="px-2 py-2">Original match</th>
                <th className="px-2 py-2">Final match</th>
                <th className="px-2 py-2">Weight</th>
                <th className="px-2 py-2">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {corrections.entries.map((entry) => (
                <tr key={entry.id ?? `${entry.logged_at}-${entry.original_search}`}>
                  <td className="whitespace-nowrap px-2 py-2 text-white/70">
                    {entry.logged_at ? new Date(entry.logged_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-2 py-2">
                    <div className="font-medium text-white">{entry.original_food || "—"}</div>
                    <div className="text-xs text-white/60">{entry.original_search}</div>
                  </td>
                  <td className="px-2 py-2">{entry.original_match_desc || "—"}</td>
                  <td className="px-2 py-2 text-emerald-100/80">{entry.final_match_desc || "—"}</td>
                  <td className="px-2 py-2">{entry.final_weight ? `${entry.final_weight}g` : "—"}</td>
                  <td className="px-2 py-2 uppercase text-white/60">{entry.correction_type ?? "—"}</td>
                </tr>
              ))}
              {!corrections.entries.length ? (
                <tr>
                  <td className="px-2 py-3 text-white/60" colSpan={6}>
                    No corrections logged yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
