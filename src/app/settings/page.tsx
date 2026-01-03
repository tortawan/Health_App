import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase";

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-emerald-200">
            Settings
          </p>
          <h1 className="text-2xl font-semibold text-white">Data portability</h1>
          <p className="text-sm text-white/60">
            Download a snapshot of your food and weight history as CSV or JSON.
          </p>
        </div>
        <Link className="btn bg-white/10 text-white hover:bg-white/20" href="/">
          Back to tracker
        </Link>
      </div>

      <div className="card space-y-3">
        <p className="text-sm font-semibold text-white">Food logs</p>
        <div className="flex flex-wrap gap-3">
          <a className="btn" href="/api/export?type=food_logs&format=csv">
            Download CSV
          </a>
          <a className="btn bg-white/10 text-white hover:bg-white/20" href="/api/export?type=food_logs&format=json">
            Download JSON
          </a>
        </div>
      </div>

      <div className="card space-y-3">
        <p className="text-sm font-semibold text-white">Weight logs</p>
        <div className="flex flex-wrap gap-3">
          <a className="btn" href="/api/export?type=weight_logs&format=csv">
            Download CSV
          </a>
          <a className="btn bg-white/10 text-white hover:bg-white/20" href="/api/export?type=weight_logs&format=json">
            Download JSON
          </a>
        </div>
      </div>
    </div>
  );
}
