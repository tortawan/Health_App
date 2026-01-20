import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase";
import { getAppConfig, updateAppConfig } from "@/app/actions";

export default async function AdminSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!session || !adminEmail || session.user.email?.toLowerCase() !== adminEmail.toLowerCase()) {
    redirect("/");
  }

  const config = await getAppConfig();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-emerald-200">Admin settings</p>
          <h1 className="text-2xl font-semibold text-white">Runtime configuration</h1>
          <p className="text-sm text-white/60">
            Update app_config keys without redeploying. Changes propagate to analyze within ~60s.
          </p>
        </div>
        <Link className="btn bg-white/10 text-white hover:bg-white/20" href="/settings">
          Back to settings
        </Link>
      </div>

      {config.error ? (
        <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm text-yellow-100">
          {config.error}
        </div>
      ) : null}

      <div className="space-y-3 rounded-xl border border-white/10 bg-slate-900/60 p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/60">Config</p>
          <h2 className="text-lg font-semibold text-white">app_config values</h2>
        </div>
        <div className="space-y-4">
          {!config.entries.length ? (
            <p className="text-sm text-white/60">No config keys found.</p>
          ) : (
            config.entries.map((entry) => (
              <form
                action={updateAppConfig}
                className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/5 p-3 sm:flex-row sm:items-center"
                key={entry.key}
              >
                <input name="key" type="hidden" value={entry.key} />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white">{entry.key}</p>
                  <p className="text-xs text-white/50">
                    Updated {new Date(entry.updated_at).toLocaleString()}
                  </p>
                </div>
                <input
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none sm:w-64"
                  defaultValue={entry.value}
                  name="value"
                  type="text"
                />
                <button className="btn" type="submit">
                  Save
                </button>
              </form>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
